import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import Papa from 'papaparse';

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

    // UTF-8 oder Latin-1 dekodieren
    let raw = req.file.buffer.toString('utf-8');
    // BOM entfernen
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);

    // Rohe Zeilen
    const rawLines = raw.split(/\r?\n/);
    const totalRawLines = rawLines.length;

    if (rawLines.length < 2) {
      return res.status(400).json({ error: 'CSV zu kurz — mindestens Header + 1 Zeile erforderlich' });
    }

    const headerLine = rawLines[0];

    // Anzahl Spalten aus dem Header bestimmen
    const expectedCols = headerLine.split(';').length;

    // ─── Zeilen zusammenführen ────────────────────────────────────────────────
    // Eine Zeile gilt als "Zeilenbeginn" (neues Produkt) wenn:
    //   - der erste Wert vor dem ersten ; eine gültige Artikelnummer ist
    //   - ODER es die Headerzeile ist
    // Alle anderen Zeilen werden an die vorherige angehängt (Zeilenumbruch im HTML)

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

      const firstField = line.split(';')[0];

      if (looksLikeNewProductRow(firstField)) {
        // Neue Produktzeile
        mergedLines.push(line);
      } else {
        // Fragment einer vorherigen Zeile — zusammenführen
        if (mergedLines.length > 1) {
          mergedLines[mergedLines.length - 1] += '\n' + line;
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

    // Nochmals komplett leere Zeilen filtern
    rows = rows.filter(row => Object.values(row).some(v => (v ?? '').trim() !== ''));

    // Zeilen mit ungültiger p_item_number entfernen
    const beforeFilter = rows.length;
    rows = rows.filter(row => isValidPItemNr(row['p_item_number'] ?? ''));
    const invalidItemNrRemoved = beforeFilter - rows.length;

    // Zeilenumbrüche aus ALLEN Feldern entfernen (CSV-Sicherheit)
    rows = rows.map(row => {
      const r = { ...row };
      for (const key of Object.keys(r)) {
        if (r[key]) r[key] = r[key].replace(/\r?\n|\r/g, ' ').replace(/  +/g, ' ').trim();
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

    // ─── CSV-Ausgabe erstellen ────────────────────────────────────────────────
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
