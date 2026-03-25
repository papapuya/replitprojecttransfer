import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import Papa from 'papaparse';
import iconv from 'iconv-lite';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// ─── Job-Speicher (30 Minuten TTL) ───────────────────────────────────────────
const jobStore = new Map<string, {
  csvBuffer: Buffer;
  fileName: string;
  expires: number;
  stats: RepairStats;
}>();

// Aufräumen abgelaufener Jobs alle 10 Minuten
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobStore.entries()) {
    if (job.expires < now) jobStore.delete(id);
  }
}, 10 * 60 * 1000);

interface RepairStats {
  totalRawLines: number;
  emptyLinesRemoved: number;
  rowsMerged: number;
  rowsAfterRepair: number;
  invalidItemNrRemoved: number;
}

// ─── Zeilen-Erkennung: Beginnt diese Zeile ein neues Produkt? ─────────────────
// Lax: Akzeptiert auch rein numerische IDs (z.B. "123456").
// Nur eindeutige HTML-Fragmente (Tags, Entities, Leerzeichen im Feld) werden abgelehnt.
function looksLikeNewProductRow(firstField: string): boolean {
  const f = firstField.trim();
  if (!f) return false;           // leeres erstes Feld → Fragment
  if (/<|>/.test(f)) return false; // HTML-Tag → Fragment
  if (/&[a-zA-Z#]/.test(f)) return false; // HTML-Entity (&amp; &nbsp; etc.)
  if (/\s/.test(f)) return false;  // Leerzeichen → Satzfragment
  if (/,/.test(f)) return false;   // Komma → Volt-Wert (3,7 V)
  return true;
}

// ─── Endfilter: Ist p_item_number eine echte Artikelnummer? ──────────────────
// Strikt: Entfernt Volt-Werte (3.7, 10.8) und kurze Dezimalzahlen.
// Erlaubt aber rein numerische Artikelnummern (z.B. "123456").
function isValidPItemNr(v: string): boolean {
  const val = v.trim();
  if (!val) return false;
  if (/<|>/.test(val)) return false;
  if (/&/.test(val)) return false;
  if (/\s/.test(val)) return false;
  if (/,/.test(val)) return false;
  // Dezimalzahlen (Volt-Werte wie 3.7, 10.8, 14.4): ablehnen
  if (/^\d+\.\d+$/.test(val)) return false;
  // Sehr kurze Integer (1–2 Stellen, z.B. "3", "12"): ablehnen
  if (/^\d{1,2}$/.test(val)) return false;
  return true;
}

// POST /api/csv-repair/upload
router.post('/upload', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });

    // Kodierung erkennen: UTF-8 oder Windows-1252/Latin-1?
    // Wenn viele Replacement-Zeichen (U+FFFD) im UTF-8-Versuch → Latin-1 verwenden
    const utf8Attempt = req.file.buffer.toString('utf-8');
    const replacementCount = (utf8Attempt.match(/\uFFFD/g) ?? []).length;
    let raw: string;
    if (replacementCount > 5) {
      // Windows-1252 / Latin-1 → wird automatisch als UTF-8 weiterverarbeitet
      raw = req.file.buffer.toString('latin1');
      console.log(`[CsvRepair] Kodierung: Latin-1/Windows-1252 erkannt (${replacementCount} kaputte Zeichen in UTF-8)`);
    } else {
      raw = utf8Attempt;
      console.log(`[CsvRepair] Kodierung: UTF-8`);
    }
    // BOM entfernen
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);

    // Rohe Zeilen
    const rawLines = raw.split(/\r?\n/);
    const totalRawLines = rawLines.length;

    if (rawLines.length < 2) {
      return res.status(400).json({ error: 'CSV zu kurz — mindestens Header + 1 Zeile erforderlich' });
    }

    const headerLine = rawLines[0];

    // Spaltenindex von p_item_number bestimmen
    const headerCols = headerLine.split(';').map(h => h.trim());
    const pItemNrIdx = headerCols.findIndex(h => h === 'p_item_number');
    // Fallback: Spalte 0 wenn p_item_number nicht im Header gefunden
    const itemNrColIdx = pItemNrIdx >= 0 ? pItemNrIdx : 0;

    console.log(`[CsvRepair] Header-Spalten: ${headerCols.length}, p_item_number-Index: ${pItemNrIdx}, Rohe Zeilen: ${rawLines.length}`);

    // ─── Zeilen zusammenführen ────────────────────────────────────────────────
    // Eine Zeile gilt als "Zeilenbeginn" (neues Produkt) wenn der Wert in der
    // p_item_number-Spalte eine gültige Artikelnummer ist.
    // Alle anderen Zeilen werden an die vorherige angehängt (Zeilenumbruch im HTML).

    const mergedLines: string[] = [headerLine];
    let emptyLinesRemoved = 0;
    let rowsMerged = 0;

    for (let i = 1; i < rawLines.length; i++) {
      const line = rawLines[i];

      // Komplett leere Zeile (nur Whitespace oder Semikolons)
      if (!line.trim() || /^;+$/.test(line.trim())) {
        emptyLinesRemoved++;
        continue;
      }

      const fields = line.split(';');
      const itemNrField = fields[itemNrColIdx] ?? '';

      if (looksLikeNewProductRow(itemNrField)) {
        // Neue Produktzeile
        mergedLines.push(line);
      } else {
        // Fragment einer vorherigen Zeile — mit Leerzeichen zusammenfügen
        // WICHTIG: kein \n hier, da Papa.parse sonst erneut aufteilt!
        if (mergedLines.length > 1) {
          mergedLines[mergedLines.length - 1] += ' ' + line;
          rowsMerged++;
        } else {
          // Kein vorheriger Datensatz — Header-Fragment ignorieren
          emptyLinesRemoved++;
        }
      }
    }

    // ─── Mit Papa.parse neu verarbeiten ──────────────────────────────────────
    const mergedCsv = mergedLines.join('\n');
    const parsed = Papa.parse<Record<string, string>>(mergedCsv, {
      header: true,
      delimiter: ';',
      skipEmptyLines: true,
    });

    const headers = parsed.meta.fields ?? [];
    let rows = parsed.data;

    console.log(`[CsvRepair] Nach Papa.parse: ${rows.length} Zeilen, ${mergedLines.length - 1} gemergte Produkte`);
    // Erste 3 p_item_number-Werte loggen zur Diagnose
    const sample = rows.slice(0, 3).map(r => r['p_item_number'] ?? '(leer)');
    console.log(`[CsvRepair] Erste p_item_numbers: ${JSON.stringify(sample)}`);

    // Nochmals komplett leere Zeilen filtern
    rows = rows.filter(row => Object.values(row).some(v => (v ?? '').trim() !== ''));

    // Zeilen mit ungültiger p_item_number entfernen
    const beforeFilter = rows.length;
    rows = rows.filter(row => isValidPItemNr(row['p_item_number'] ?? ''));
    const invalidItemNrRemoved = beforeFilter - rows.length;
    console.log(`[CsvRepair] Nach Filter: ${rows.length} gültige Zeilen, ${invalidItemNrRemoved} entfernt`);

    // Zeilenumbrüche aus ALLEN Feldern entfernen (CSV-Sicherheit)
    rows = rows.map(row => {
      const r = { ...row };
      for (const key of Object.keys(r)) {
        if (r[key] && typeof r[key] === 'string') {
          r[key] = r[key].replace(/\r?\n|\r/g, ' ').replace(/  +/g, ' ').trim();
        }
      }
      return r;
    });

    const stats: RepairStats = {
      totalRawLines,
      emptyLinesRemoved,
      rowsMerged,
      rowsAfterRepair: rows.length,
      invalidItemNrRemoved,
    };

    // ─── CSV-Ausgabe erstellen (UTF-8 mit BOM) ───────────────────────────────
    const csvOut = Papa.unparse(rows, { delimiter: ';', columns: headers });
    const csvBuffer = Buffer.concat([
      Buffer.from('\uFEFF', 'utf-8'),
      Buffer.from(csvOut, 'utf-8'),
    ]);

    const jobId = crypto.randomBytes(16).toString('hex');
    const baseName = (req.file.originalname || 'output').replace(/\.csv$/i, '');
    const fileName = baseName + '_repariert.csv';

    jobStore.set(jobId, {
      csvBuffer,
      fileName,
      expires: Date.now() + 30 * 60 * 1000,
      stats,
    });

    res.json({ jobId, fileName, stats });
  } catch (err: any) {
    console.error('[CsvRepair] Fehler:', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
});

// GET /api/csv-repair/download/:jobId
router.get('/download/:jobId', (req: Request, res: Response) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden oder abgelaufen' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${job.fileName}"`);
  res.send(job.csvBuffer);
});

export default router;
