import { Router, Request, Response } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import crypto from 'crypto';
import { deeplService } from '../services/deepl-service';

/** Gibt die Textlänge eines HTML-Strings zurück (ohne Tags) */
function htmlTextLength(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
}

/**
 * Verschiebt den Lieferumfang-Abschnitt ans Ende des HTML.
 * Sucht nach <h2>Lieferumfang / Leveringsomvang o.ä. und verschiebt Block dahinter.
 */
function ensureDeliveryAtEnd(html: string): string {
  if (!html) return html;
  // Überschrift-Pattern (DE: Lieferumfang, NL: Leveringsomvang/Inhoud leveringspakket)
  const headingPattern = /Lieferumfang|Leveringsomvang|Inhoud leveringspakket|In de doos/i;
  // Block extrahieren: Heading (h2/h3) + alles bis zum nächsten h2/h3 oder Ende
  const blockRegex = /(<h[23][^>]*>[^<]*(?:Lieferumfang|Leveringsomvang|Inhoud leveringspakket|In de doos)[^<]*<\/h[23]>[\s\S]*?)(?=<h[23]\b|$)/i;
  const match = html.match(blockRegex);
  if (!match) return html;
  const block = match[1].trimEnd();
  // Prüfe ob der Block bereits am Ende steht (nach Bereinigung)
  const trimmedHtml = html.trimEnd();
  if (trimmedHtml.endsWith(block)) return html; // bereits am Ende
  // Entferne Block aus aktueller Position und hänge ihn ans Ende
  const withoutBlock = html.replace(block, '').replace(/\s{2,}/g, '\n').trim();
  return withoutBlock + '\n' + block;
}

async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

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
  restoreEmoji: boolean;
}>();

// Fortschritts-Speicher für laufende Jobs
const progressStore = new Map<string, {
  step: string;
  stepLabel: string;
  percent: number;
  detail: string;
  expires: number;
}>();

// Aufräumen alter Jobs
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobStore) {
    if (job.expires < now) jobStore.delete(id);
  }
  for (const [id, p] of progressStore) {
    if (p.expires < now) progressStore.delete(id);
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
// Falls keine Spannung-Zeile vorhanden ist aber eine Tabelle existiert, wird eine neue Zeile eingefügt.
function setSpannungInHtml(html: string, targetVolt: string): { result: string; changed: boolean } {
  if (!html || !targetVolt) return { result: html, changed: false };

  // Prüfe ob bereits eine Spannung-Zeile vorhanden ist
  const spannungRegex = /(<(?:td|th)[^>]*>\s*(?:Nenn)?[Ss]pannung(?:\s*V)?\s*<\/(?:td|th)>\s*<(?:td|th)[^>]*>)([^<]*)(< *\/(?:td|th)>)/gi;
  let changed = false;
  let result = html.replace(spannungRegex, (_match, before, value, after) => {
    const currentVal = value.trim();
    const expectedWithUnit = targetVolt + ' V';
    if (currentVal === expectedWithUnit || currentVal === targetVolt) {
      return before + value + after;
    }
    changed = true;
    const suffix = currentVal.endsWith(' V') ? ' V' : (currentVal.endsWith('V') ? 'V' : ' V');
    return before + targetVolt + suffix + after;
  });

  // Falls keine Spannung-Zeile gefunden wurde aber eine Tabelle existiert → Zeile einfügen
  const hasSpannungRow = /(?:Nenn)?[Ss]pannung(?:\s*V)?/.test(html);
  if (!changed && !hasSpannungRow) {
    // Füge Spannung-Zeile als erste Zeile nach <tbody> ein (oder vor dem ersten <tr>)
    const tbodyInsert = result.replace(/(<tbody[^>]*>)/, `$1<tr><th class="thlabel"> Spannung V</th><td class="data"> ${targetVolt} V</td></tr>`);
    if (tbodyInsert !== result) {
      result = tbodyInsert;
      changed = true;
    } else {
      // Fallback: vor dem ersten <tr> in der Tabelle einfügen
      const trInsert = result.replace(/(<table[^>]*>[\s\S]*?)(<tr\b)/, `$1<tr><th class="thlabel"> Spannung V</th><td class="data"> ${targetVolt} V</td></tr>$2`);
      if (trInsert !== result) {
        result = trInsert;
        changed = true;
      }
    }
  }

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

// Ersetzt '? ' an typischen Bullet-Punkt-Positionen in HTML durch '✅ '
// (nach <br>, <li>, <p> und am absoluten Textanfang)
function restoreEmojiCheckmarks(html: string): string {
  if (!html) return html;
  // Optionale weitere Tags zwischen Block-Tag und '?' erlauben (z.B. <strong>, <b>, <span>)
  const optTags = '(?:\\s*<(?!/)(?!br)[a-z][^>]*>)*\\s*';
  return html
    // Nach <br>, <br />, </li>, </p>, <li ...> – mit optionalen Inline-Tags davor
    .replace(new RegExp(`((?:<br\\s*/?>|<\\/li>|<\\/p>|<li[^>]*>)${optTags})\\?\\s+`, 'gi'), '$1✅ ')
    // Am absoluten Anfang (mit optionalen vorangehenden Tags)
    .replace(new RegExp(`^((?:<[^>]+>\\s*)*)\\?\\s+`), '$1✅ ')
    // Nach einem Zeilenumbruch (mit optionalen vorangehenden Tags)
    .replace(new RegExp(`(\\n\\s*(?:<[^>]+>\\s*)*)\\?\\s+`, 'g'), '$1✅ ');
}

// GET /api/volt-fixer/progress/:jobId
router.get('/progress/:jobId', (req: Request, res: Response) => {
  const p = progressStore.get(req.params.jobId);
  if (!p) return res.json({ step: 'waiting', stepLabel: 'Warte auf Start…', percent: 0, detail: '' });
  res.json({ step: p.step, stepLabel: p.stepLabel, percent: p.percent, detail: p.detail });
});

// POST /api/volt-fixer/upload
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });

    const restoreEmoji = req.body?.restoreEmoji === 'true';
    const useDeForNL   = req.body?.useDeForNL === 'true';
    const clientJobId  = req.body?.clientJobId as string | undefined;

    // Fortschritt initialisieren
    const setProgress = (step: string, stepLabel: string, percent: number, detail = '') => {
      if (!clientJobId) return;
      progressStore.set(clientJobId, { step, stepLabel, percent, detail, expires: Date.now() + 30 * 60 * 1000 });
    };

    setProgress('parsing', 'CSV wird gelesen…', 5);

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

    setProgress('fixing', 'Volt-Werte werden korrigiert…', 15, `${rows.length.toLocaleString('de-DE')} Zeilen`);

    let voltChanged = 0, voltSkipped = 0, descChanged = 0, nameChanged = 0, voltExtracted = 0, nlTranslated = 0, deTranslated = 0;
    // (runWithConcurrency wird für DeepL-Batch nicht mehr benötigt, bleibt aber als Hilfsfunktion erhalten)
    const nlTranslationQueue: Array<{ rowIndex: number }> = [];
    const deTranslationQueue: Array<{ rowIndex: number }> = [];
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

      // Emoji-Wiederherstellung: '? ' → '✅ ' in Beschreibungen (optional)
      if (restoreEmoji) {
        for (const col of DESC_COLS) {
          if (!headers.includes(col) || !newRow[col]) continue;
          const restored = restoreEmojiCheckmarks(newRow[col]);
          if (restored !== newRow[col]) {
            newRow[col] = restored;
            if (!changed.includes(col)) changed.push(col);
          }
        }
      }

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

      // Intelligente Beschreibungs-Angleichung: reichhaltigere Beschreibung als Basis
      if (useDeForNL && headers.includes('p_description[de]') && headers.includes('p_description[nl]')) {
        const deDesc = newRow['p_description[de]'] || '';
        const nlDesc = newRow['p_description[nl]'] || '';
        const deHasH2 = /<h2\b/i.test(deDesc);
        const nlHasH2 = /<h2\b/i.test(nlDesc);
        const deLen   = htmlTextLength(deDesc);
        const nlLen   = htmlTextLength(nlDesc);

        if (deHasH2 && !nlHasH2) {
          // Nur DE vollständig → DE nach NL übersetzen
          newRow['p_description[nl]'] = deDesc;
          if (!changed.includes('p_description[nl]')) changed.push('p_description[nl]');
          descChanged++;
          nlTranslationQueue.push({ rowIndex: fixedRows.length });
        } else if (nlHasH2 && !deHasH2) {
          // Nur NL vollständig → NL nach DE übersetzen
          newRow['p_description[de]'] = nlDesc;
          if (!changed.includes('p_description[de]')) changed.push('p_description[de]');
          descChanged++;
          deTranslationQueue.push({ rowIndex: fixedRows.length });
        } else if (deHasH2 && nlHasH2 && nlLen > deLen + 100) {
          // Beide vollständig, aber NL deutlich länger → NL als Basis, DE übersetzen
          newRow['p_description[de]'] = nlDesc;
          if (!changed.includes('p_description[de]')) changed.push('p_description[de]');
          descChanged++;
          deTranslationQueue.push({ rowIndex: fixedRows.length });
        } else if (deHasH2 && nlHasH2 && deLen > nlLen + 100) {
          // Beide vollständig, aber DE deutlich länger → DE als Basis, NL übersetzen
          newRow['p_description[nl]'] = deDesc;
          if (!changed.includes('p_description[nl]')) changed.push('p_description[nl]');
          descChanged++;
          nlTranslationQueue.push({ rowIndex: fixedRows.length });
        }
      }

      // Lieferumfang ans Ende verschieben (DE + NL)
      for (const col of ['p_description[de]', 'p_description[nl]']) {
        if (!newRow[col]) continue;
        const reordered = ensureDeliveryAtEnd(newRow[col]);
        if (reordered !== newRow[col]) {
          newRow[col] = reordered;
          if (!changed.includes(col)) changed.push(col);
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

    // DE→NL Übersetzungen via DeepL (Batch, alle auf einmal)
    if (useDeForNL && nlTranslationQueue.length > 0) {
      console.log(`[VoltFixer] DeepL DE→NL: ${nlTranslationQueue.length} Beschreibungen...`);
      setProgress('translating-nl', 'DE → NL wird übersetzt…', 40, `${nlTranslationQueue.length.toLocaleString('de-DE')} Beschreibungen`);
      const htmlList = nlTranslationQueue.map(({ rowIndex }) => fixedRows[rowIndex]['p_description[nl]'] || '');
      const total = nlTranslationQueue.length;
      const translated = await deeplService.translateBatch(htmlList, (done) => {
        const pct = Math.round(40 + (done / total) * 35);
        setProgress('translating-nl', 'DE → NL wird übersetzt…', pct, `${done.toLocaleString('de-DE')} / ${total.toLocaleString('de-DE')}`);
      });
      nlTranslationQueue.forEach(({ rowIndex }, i) => {
        if (translated[i]) {
          fixedRows[rowIndex]['p_description[nl]'] = ensureDeliveryAtEnd(translated[i]);
          nlTranslated++;
        }
      });
      console.log(`[VoltFixer] ${nlTranslated} DE→NL übersetzt.`);
    }

    // NL→DE Übersetzungen via DeepL (Batch, alle auf einmal)
    if (useDeForNL && deTranslationQueue.length > 0) {
      console.log(`[VoltFixer] DeepL NL→DE: ${deTranslationQueue.length} Beschreibungen...`);
      setProgress('translating-de', 'NL → DE wird übersetzt…', 76, `${deTranslationQueue.length.toLocaleString('de-DE')} Beschreibungen`);
      const htmlList = deTranslationQueue.map(({ rowIndex }) => fixedRows[rowIndex]['p_description[de]'] || '');
      const total = deTranslationQueue.length;
      const translated = await deeplService.translateBatchToDE(htmlList, (done) => {
        const pct = Math.round(76 + (done / total) * 15);
        setProgress('translating-de', 'NL → DE wird übersetzt…', pct, `${done.toLocaleString('de-DE')} / ${total.toLocaleString('de-DE')}`);
      });
      deTranslationQueue.forEach(({ rowIndex }, i) => {
        if (translated[i]) {
          fixedRows[rowIndex]['p_description[de]'] = ensureDeliveryAtEnd(translated[i]);
          deTranslated++;
        }
      });
      console.log(`[VoltFixer] ${deTranslated} NL→DE übersetzt.`);
    }

    setProgress('building', 'Ergebnis wird aufbereitet…', 93);

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
      restoreEmoji,
    });

    // Hilfsfunktion: HTML → plain text (abgekürzt)
    const toPlainText = (html: string, max = 120): string => {
      if (!html) return '';
      const plain = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
      return plain.length > max ? plain.slice(0, max) + '…' : plain;
    };

    // Kompakte Vorschau: NUR geänderte Zeilen, max. 500 Einträge
    const ITEM_NR_COLS = ['p_item_number', 'v_item_number'];
    const MAX_PREVIEW = 500;
    const previewItems: object[] = [];
    for (let i = 0; i < fixedRows.length && previewItems.length < MAX_PREVIEW; i++) {
      const changed = changedCols[i];
      if (!changed || changed.length === 0) continue;
      const orig = rows[i];
      const row = fixedRows[i];
      const itemNr = ITEM_NR_COLS.map(c => row[c]).find(v => v) || '';
      previewItems.push({
        index: i,
        itemNr,
        voltOrig: orig[VOLT_COL] ?? '',
        voltNew: row[VOLT_COL] ?? '',
        nameDEOrig: orig['p_name[de]'] ?? '',
        nameDE: row['p_name[de]'] ?? '',
        nameNLOrig: orig['p_name[nl]'] ?? '',
        nameNL: row['p_name[nl]'] ?? '',
        descDE: toPlainText(row['p_description[de]'] ?? ''),
        descDEChanged: changed.includes('p_description[de]'),
        descNL: toPlainText(row['p_description[nl]'] ?? ''),
        descNLChanged: changed.includes('p_description[nl]'),
        changed,
      });
    }

    setProgress('done', 'Fertig!', 100);

    res.json({
      jobId,
      headers,
      stats: { total: rows.length, voltChanged, voltSkipped, descChanged, nameChanged, voltExtracted, nlTranslated, deTranslated },
      previewItems,
      allChangedNames: allChangedNames.slice(0, 300),
      allExtractedVolt: allExtractedVolt.slice(0, 300),
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

  // Wenn restoreEmoji aktiv war: ✅ auch im Originaltext wiederherstellen (nur für Anzeige)
  const original = { ...job.originalRows[idx] };
  if (job.restoreEmoji) {
    for (const col of ['p_description[de]', 'p_description[nl]']) {
      if (original[col]) original[col] = restoreEmojiCheckmarks(original[col]);
    }
  }

  res.json({
    row: job.fixedRows[idx],
    original,
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
