import { Router, Request, Response } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import crypto from 'crypto';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } }); // 1 GB

const VOLT_COL = 'p_attributes[akku_v][de]';
const DESC_COLS = ['p_description[de]', 'p_description[nl]'];
const NAME_COLS = ['p_name[de]', 'p_name[nl]'];

// Temporärer Speicher für verarbeitete Ergebnisse (max 30 Minuten)
const jobStore = new Map<string, {
  csvBuffer: Buffer;
  fileName: string;
  expires: number;
  fixedRows: Record<string, string>[];
  originalRows: Record<string, string>[];
  headers: string[];
  changedCols: string[][];
}>();

// Aufräumen alter Jobs
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobStore) {
    if (job.expires < now) jobStore.delete(id);
  }
}, 5 * 60 * 1000);

function fixVolt(val: string): { fixed: string; changed: boolean } {
  const trimmed = val.trim();
  if (!trimmed) return { fixed: trimmed, changed: false };
  if (trimmed.includes(',') || trimmed.includes('.')) return { fixed: trimmed, changed: false };
  if (!/^\d+$/.test(trimmed)) return { fixed: trimmed, changed: false };
  if (trimmed.length === 1) return { fixed: trimmed, changed: false };
  // 3-stellige Zahlen: wenn erste zwei Ziffern 10–24 → XX,Y (z.B. 111→11,1, 144→14,4, 222→22,2, 108→10,8)
  if (trimmed.length === 3) {
    const firstTwo = parseInt(trimmed.slice(0, 2), 10);
    if (firstTwo >= 10 && firstTwo <= 24) {
      return { fixed: trimmed.slice(0, 2) + ',' + trimmed[2], changed: true };
    }
  }
  // Standard: Komma nach erster Stelle (z.B. 385→3,85, 48→4,8, 36→3,6)
  return { fixed: trimmed[0] + ',' + trimmed.slice(1), changed: true };
}

// Ersetzt Volt-Wert in Produktnamen (Plaintext), z.B. "385 V" → "3,85 V", "385 Volt" → "3,85 Volt"
function replaceSpannungInName(text: string, oldVolt: string, newVolt: string): { result: string; changed: boolean } {
  if (!text || !oldVolt || !newVolt || oldVolt === newVolt) return { result: text, changed: false };
  const escaped = oldVolt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Sucht den alten Wert nur wenn gefolgt von V oder Volt (mit optionalem Leerzeichen)
  const regex = new RegExp(`\\b${escaped}(\\s*V(?:olt)?)\\b`, 'g');
  let changed = false;
  const result = text.replace(regex, (_match, suffix) => {
    changed = true;
    return newVolt + suffix;
  });
  return { result, changed };
}

// Extrahiert Volt-Wert aus Produktnamen, z.B. "3,85V" → "3,85", "385V" → "3,85", "4,8 Volt" → "4,8"
function extractVoltFromName(name: string): string | null {
  if (!name) return null;
  const match = name.match(/\b(\d+(?:[,.]\d+)?)\s*V(?:olt)?\b/i);
  if (!match) return null;
  const raw = match[1].replace('.', ',');
  const { fixed } = fixVolt(raw); // Komma setzen falls nötig (z.B. 385 → 3,85)
  return fixed;
}

// Setzt den Spannung/Nennspannung-Wert in der HTML-Tabelle immer auf den korrekten Volt-Wert.
// Findet sowohl "Spannung" als auch "Nennspannung" als Label in der Tabelle.
function setSpannungInHtml(html: string, targetVolt: string): { result: string; changed: boolean } {
  if (!html || !targetVolt) return { result: html, changed: false };
  const regex = /(<td[^>]*>\s*(?:Nenn)?[Ss]pannung\s*<\/td>\s*<td[^>]*>)([^<]*)(<\/td>)/gi;
  let changed = false;
  const result = html.replace(regex, (_match, before, value, after) => {
    const currentVal = value.trim();
    const expectedWithUnit = targetVolt + ' V';
    if (currentVal === expectedWithUnit || currentVal === targetVolt) {
      return before + value + after; // bereits korrekt, nichts tun
    }
    changed = true;
    // Einheit beibehalten: wenn aktuell " V" → " V", wenn "V" → "V", sonst " V" anhängen
    const suffix = currentVal.endsWith(' V') ? ' V' : (currentVal.endsWith('V') ? 'V' : ' V');
    return before + targetVolt + suffix + after;
  });
  return { result, changed };
}

function detectEncoding(buffer: Buffer): string {
  // BOM-Erkennung
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) return 'utf-8';
  // Heuristik: Wenn viele Bytes > 0x7F vorkommen, ist es wahrscheinlich Windows-1252
  let highBytes = 0;
  const sample = buffer.slice(0, Math.min(1000, buffer.length));
  for (const b of sample) {
    if (b > 0x7F) highBytes++;
  }
  if (highBytes > 0) {
    // Versuche UTF-8-Validierung
    try {
      const decoded = buffer.toString('utf-8');
      if (!decoded.includes('\uFFFD')) return 'utf-8';
    } catch {}
    return 'windows-1252';
  }
  return 'utf-8';
}

// POST /api/volt-fixer/upload
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });

    const encoding = detectEncoding(req.file.buffer);
    const text = iconv.decode(req.file.buffer, encoding);

    const parsed = Papa.parse(text, {
      delimiter: ';',
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return res.status(400).json({ error: 'CSV konnte nicht geparst werden', details: parsed.errors[0]?.message });
    }

    const headers = parsed.meta.fields || [];
    const rows = parsed.data as Record<string, string>[];

    let voltChanged = 0, voltSkipped = 0, descChanged = 0, nameChanged = 0, voltExtracted = 0;
    const fixedRows: Record<string, string>[] = [];
    const changedCols: string[][] = [];
    // Alle geänderten Namen (für vollständige Anzeige im Frontend)
    const allChangedNames: Array<{
      itemNr: string;
      cols: Array<{ col: string; before: string; after: string }>;
    }> = [];
    // Alle aus Produktnamen extrahierten Volt-Werte
    const allExtractedVolt: Array<{
      itemNr: string;
      extractedVolt: string;
      fromName: string;
      fromCol: string;
    }> = [];

    for (const row of rows) {
      const newRow = { ...row };
      const changed: string[] = [];
      const voltVal = (row[VOLT_COL] ?? '').trim();
      let newVolt = voltVal;
      let voltWasChanged = false;

      if (!voltVal) {
        // Volt-Spalte leer → versuche aus Produktnamen zu extrahieren
        let extracted: string | null = null;
        let extractedFromCol = '';
        let extractedFromName = '';
        for (const col of NAME_COLS) {
          if (!headers.includes(col)) continue;
          const nameVal = row[col];
          if (!nameVal) continue;
          const found = extractVoltFromName(nameVal);
          if (found) {
            extracted = found;
            extractedFromCol = col;
            extractedFromName = nameVal;
            break;
          }
        }

        if (extracted) {
          // Volt-Spalte befüllen
          newRow[VOLT_COL] = extracted;
          changed.push(VOLT_COL);
          voltExtracted++;
          newVolt = extracted;
          voltWasChanged = true;
          allExtractedVolt.push({
            itemNr: row['p_item_number'] || row['v_item_number'] || '',
            extractedVolt: extracted,
            fromName: extractedFromName,
            fromCol: extractedFromCol,
          });
        } else {
          voltSkipped++;
        }
      } else {
        const { fixed: fv, changed: wc } = fixVolt(voltVal);
        newVolt = fv;
        voltWasChanged = wc;
        if (wc) {
          voltChanged++;
          newRow[VOLT_COL] = fv;
          changed.push(VOLT_COL);
        }
      }

      // Beschreibungen IMMER aktualisieren wenn Volt-Wert vorhanden (auch wenn bereits korrekt in Spalte)
      if (newVolt) {
        for (const col of DESC_COLS) {
          const descVal = row[col];
          if (!descVal) continue;
          const { result, changed: dc } = setSpannungInHtml(descVal, newVolt);
          if (dc) {
            newRow[col] = result;
            changed.push(col);
            descChanged++;
          }
        }
      }

      if (voltWasChanged) {
        // Produktnamen abgleichen: Original-Volt-Wert im Namen suchen und ersetzen
        const changedNameCols: Array<{ col: string; before: string; after: string }> = [];
        for (const col of NAME_COLS) {
          if (!headers.includes(col)) continue;
          const nameVal = row[col];
          if (!nameVal) continue;
          const { result, changed: nc } = replaceSpannungInName(nameVal, voltVal, newVolt);
          if (nc) {
            changedNameCols.push({ col, before: nameVal, after: result });
            newRow[col] = result;
            changed.push(col);
            nameChanged++;
          }
        }
        if (changedNameCols.length > 0) {
          allChangedNames.push({
            itemNr: row['p_item_number'] || row['v_item_number'] || '',
            cols: changedNameCols,
          });
        }
      }

      fixedRows.push(newRow);
      changedCols.push(changed);
    }

    // Korrigierte CSV bauen
    const csvOut = Papa.unparse(fixedRows, { delimiter: ';', columns: headers });
    const csvBuffer = Buffer.concat([Buffer.from('\uFEFF', 'utf-8'), Buffer.from(csvOut, 'utf-8')]);

    // Job speichern (30 Minuten) – inkl. aller Zeilen für Detail-Endpoint
    const jobId = crypto.randomBytes(16).toString('hex');
    const fileName = (req.file.originalname || 'output').replace(/\.csv$/i, '_volt_fixed.csv');
    jobStore.set(jobId, {
      csvBuffer,
      fileName,
      expires: Date.now() + 30 * 60 * 1000,
      fixedRows,
      originalRows: rows,
      headers,
      changedCols,
    });

    // Kompakte Vorschau: alle Zeilen, nur wichtige Felder (kein HTML) für Tabelle
    const ITEM_NR_COLS = ['p_item_number', 'v_item_number'];
    const previewItems = fixedRows.map((row, i) => {
      const orig = rows[i];
      const changed = changedCols[i] || [];
      const itemNr = ITEM_NR_COLS.map(c => row[c]).find(v => v) || '';
      return {
        index: i,
        itemNr,
        voltOrig: orig[VOLT_COL] ?? '',
        voltNew: row[VOLT_COL] ?? '',
        nameDEOrig: orig['p_name[de]'] ?? '',
        nameDE: row['p_name[de]'] ?? '',
        nameNLOrig: orig['p_name[nl]'] ?? '',
        nameNL: row['p_name[nl]'] ?? '',
        changed,
      };
    });

    res.json({
      jobId,
      headers,
      stats: { total: rows.length, voltChanged, voltSkipped, descChanged, nameChanged, voltExtracted },
      previewItems,
      allChangedNames,
      allExtractedVolt,
      fileName,
    });
  } catch (err: any) {
    console.error('[VoltFixer] Upload error:', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
});

// GET /api/volt-fixer/detail/:jobId/:index — vollständige Zeile für Auge-Modal
router.get('/detail/:jobId/:index', (req: Request, res: Response) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden oder abgelaufen' });
  const idx = parseInt(req.params.index, 10);
  if (isNaN(idx) || idx < 0 || idx >= job.fixedRows.length) {
    return res.status(400).json({ error: 'Ungültiger Index' });
  }
  res.json({
    row: job.fixedRows[idx],
    original: job.originalRows[idx],
    changed: job.changedCols[idx] || [],
    headers: job.headers,
  });
});

// GET /api/volt-fixer/download/:jobId
router.get('/download/:jobId', (req: Request, res: Response) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden oder abgelaufen' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${job.fileName}"`);
  res.send(job.csvBuffer);
});

export default router;
