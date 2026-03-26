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
// Doppelcheck: p_id (Spalte 0) UND p_item_number (Spalte 1) müssen gleichzeitig gültig aussehen.
// So werden HTML-Fragmente die zufällig wie eine p_id aussehen (z.B. "Nennspannung;3.7 V")
// nicht fälschlicherweise als neues Produkt erkannt.
function looksLikeNewProductRow(pIdField: string, pItemNrField: string): boolean {
  // ── p_id prüfen ──────────────────────────────────────────────────────────
  const id = pIdField.trim();
  if (!id) return false;
  if (/<|>/.test(id)) return false;              // HTML-Tag
  if (/&/.test(id)) return false;                // HTML-Entity
  if (/\s/.test(id)) return false;               // Leerzeichen
  if (/,/.test(id)) return false;                // Komma
  if (/^\d+\.\d+$/.test(id)) return false;       // Dezimalzahl (1.5, 3.7)
  // Gültige p_id: rein numerisch ODER alphanumerisch mit - und _ (BST41_16, LAP210, CR1_3N-FT1)
  if (!/^[\w\-]+$/.test(id)) return false;

  // ── p_item_number prüfen (Spalte 1) ─────────────────────────────────────
  const nr = pItemNrField.trim();
  if (!nr) return false;                         // leer → kein echter Produktstart
  if (/<|>/.test(nr)) return false;              // HTML
  if (/&/.test(nr)) return false;                // Entity
  if (/\s/.test(nr)) return false;               // Leerzeichen (z.B. "3.7 V")
  if (/,/.test(nr)) return false;                // Komma
  if (/^\d+\.\d+$/.test(nr)) return false;       // Dezimalzahl
  if (/^\d{1,2}$/.test(nr)) return false;        // 1-2-stellige Zahl (kein Artikel)
  if (!/^[\w\-]+$/.test(nr)) return false;       // muss alphanumerisch sein

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

    // Kodierung erkennen – gleiche Logik wie Volt-Fixer:
    // Prüfe ob Bytes > 0x7F vorhanden sind; wenn ja, teste UTF-8-Validität.
    // Falls ungültige UTF-8-Sequenzen → Windows-1252 dekodieren (via iconv).
    const buf = req.file.buffer;
    const encodingSample = buf.slice(0, Math.min(1000, buf.length));
    let highBytes = 0;
    for (const b of encodingSample) { if (b > 0x7F) highBytes++; }
    let detectedEncoding = 'utf-8';
    if (highBytes > 0) {
      const decoded = buf.toString('utf-8');
      detectedEncoding = decoded.includes('\uFFFD') ? 'windows-1252' : 'utf-8';
    }
    let raw: string = iconv.decode(buf, detectedEncoding);
    console.log(`[CsvRepair] Kodierung erkannt: ${detectedEncoding} (highBytes=${highBytes})`);
    // BOM entfernen
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);

    // Rohe Zeilen
    const rawLines = raw.split(/\r?\n/);
    const totalRawLines = rawLines.length;

    if (rawLines.length < 2) {
      return res.status(400).json({ error: 'CSV zu kurz — mindestens Header + 1 Zeile erforderlich' });
    }

    const headerLine = rawLines[0];

    // Spaltenindizes bestimmen
    const headerCols = headerLine.split(';').map(h => h.trim());
    const pIdIdx = headerCols.findIndex(h => h === 'p_id');
    const pItemNrIdx = headerCols.findIndex(h => h === 'p_item_number');
    const pIdColIdx    = pIdIdx    >= 0 ? pIdIdx    : 0;
    const pItemNrColIdx = pItemNrIdx >= 0 ? pItemNrIdx : 1;

    console.log(`[CsvRepair] Header-Spalten: ${headerCols.length}, p_id-Index: ${pIdColIdx}, p_item_number-Index: ${pItemNrColIdx}, Rohe Zeilen: ${rawLines.length}`);

    // ─── Zeilen zusammenführen ────────────────────────────────────────────────
    // Doppelcheck: Neue Produktzeile nur wenn BEIDE p_id UND p_item_number gültig aussehen.
    // Verhindert dass HTML-Fragmente (z.B. "Nennspannung;3.7 V") als neues Produkt erkannt werden.

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
      const pIdField    = fields[pIdColIdx]     ?? '';
      const pItemNrField = fields[pItemNrColIdx] ?? '';

      if (looksLikeNewProductRow(pIdField, pItemNrField)) {
        // Neue Produktzeile — p_id UND p_item_number sehen gültig aus
        mergedLines.push(line);
      } else {
        // Fragment einer vorherigen Zeile — ohne \n anhängen (Papa.parse würde sonst wieder teilen)
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
