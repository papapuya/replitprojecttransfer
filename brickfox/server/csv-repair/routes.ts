import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import Papa from 'papaparse';
import iconv from 'iconv-lite';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

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
function looksLikeNewProductRow(pIdField: string, pItemNrField: string): boolean {
  const id = pIdField.trim();
  if (!id) return false;
  if (/<|>/.test(id)) return false;
  if (/&/.test(id)) return false;
  if (/\s/.test(id)) return false;
  if (/,/.test(id)) return false;
  if (/^\d+\.\d+$/.test(id)) return false;
  if (!/^[\w\-]+$/.test(id)) return false;

  const nr = pItemNrField.trim();
  if (!nr) return false;
  if (/<|>/.test(nr)) return false;
  if (/&/.test(nr)) return false;
  if (/\s/.test(nr)) return false;
  if (/,/.test(nr)) return false;
  if (/^\d+\.\d+$/.test(nr)) return false;
  if (/^\d{1,2}$/.test(nr)) return false;
  if (!/^[\w\-]+$/.test(nr)) return false;

  return true;
}

// ─── Endfilter: Ist p_item_number eine echte Artikelnummer? ──────────────────
function isValidPItemNr(v: string): boolean {
  const val = v.trim();
  if (!val) return false;
  if (/<|>/.test(val)) return false;
  if (/&/.test(val)) return false;
  if (/\s/.test(val)) return false;
  if (/,/.test(val)) return false;
  if (/^\d+\.\d+$/.test(val)) return false;
  if (/^\d{1,2}$/.test(val)) return false;
  return true;
}

// Yield to event loop so SSE events are flushed to client
const yield_ = () => new Promise<void>(resolve => setImmediate(resolve));

// POST /api/csv-repair/upload  →  SSE stream
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    if (!req.file) {
      send('error', { message: 'Keine Datei hochgeladen' });
      return res.end();
    }

    const fileSizeMB = (req.file.size / 1024 / 1024).toFixed(1);
    send('progress', { label: `Datei wird gelesen… (${fileSizeMB} MB)`, percent: 5 });
    await yield_();

    // ─── Kodierung erkennen ───────────────────────────────────────────────────
    const buf = req.file.buffer;
    const encodingSample = buf.slice(0, Math.min(4096, buf.length));
    let highBytes = 0;
    for (const b of encodingSample) { if (b > 0x7F) highBytes++; }
    let detectedEncoding = 'utf-8';
    if (highBytes > 0) {
      const decoded = buf.toString('utf-8');
      detectedEncoding = decoded.includes('\uFFFD') ? 'windows-1252' : 'utf-8';
    }
    let raw: string = iconv.decode(buf, detectedEncoding);
    console.log(`[CsvRepair] Kodierung erkannt: ${detectedEncoding} (highBytes=${highBytes})`);
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);

    send('progress', { label: 'Zeilen werden gezählt…', percent: 12 });
    await yield_();

    const rawLines = raw.split(/\r?\n/);
    const totalRawLines = rawLines.length;

    if (rawLines.length < 2) {
      send('error', { message: 'CSV zu kurz — mindestens Header + 1 Zeile erforderlich' });
      return res.end();
    }

    const headerLine = rawLines[0];
    const headerCols = headerLine.split(';').map(h => h.trim());
    const pIdIdx     = headerCols.findIndex(h => h === 'p_id');
    const pItemNrIdx = headerCols.findIndex(h => h === 'p_item_number');
    const pIdColIdx      = pIdIdx     >= 0 ? pIdIdx     : 0;
    const pItemNrColIdx  = pItemNrIdx >= 0 ? pItemNrIdx : 1;

    console.log(`[CsvRepair] Header-Spalten: ${headerCols.length}, p_id: ${pIdColIdx}, p_item_number: ${pItemNrColIdx}, Zeilen: ${totalRawLines}`);

    // ─── Zeilen zusammenführen ────────────────────────────────────────────────
    const mergedLines: string[] = [headerLine];
    let emptyLinesRemoved = 0;
    let rowsMerged = 0;
    const PROGRESS_INTERVAL = 500;

    send('progress', { label: `${totalRawLines.toLocaleString()} Zeilen werden zusammengeführt…`, percent: 18 });
    await yield_();

    for (let i = 1; i < rawLines.length; i++) {
      const line = rawLines[i];

      if (!line.trim() || /^;+$/.test(line.trim())) {
        emptyLinesRemoved++;
        continue;
      }

      const fields      = line.split(';');
      const pIdField    = fields[pIdColIdx]    ?? '';
      const pItemNrField = fields[pItemNrColIdx] ?? '';

      if (looksLikeNewProductRow(pIdField, pItemNrField)) {
        mergedLines.push(line);
      } else {
        if (mergedLines.length > 1) {
          mergedLines[mergedLines.length - 1] += ' ' + line;
          rowsMerged++;
        } else {
          emptyLinesRemoved++;
        }
      }

      // Yield and emit progress every PROGRESS_INTERVAL lines
      if (i % PROGRESS_INTERVAL === 0) {
        const pct = 18 + Math.round((i / totalRawLines) * 52);
        send('progress', {
          label: `Zeile ${i.toLocaleString()} von ${totalRawLines.toLocaleString()} verarbeitet…`,
          percent: pct,
        });
        await yield_();
      }
    }

    send('progress', { label: 'Filtern und bereinigen…', percent: 72 });
    await yield_();

    // ─── Mit Papa.parse neu verarbeiten ──────────────────────────────────────
    const mergedCsv = mergedLines.join('\n');
    const parsed = Papa.parse<Record<string, string>>(mergedCsv, {
      header: true,
      delimiter: ';',
      skipEmptyLines: true,
    });

    const headers = parsed.meta.fields ?? [];
    let rows = parsed.data;

    console.log(`[CsvRepair] Nach Papa.parse: ${rows.length} Zeilen`);

    rows = rows.filter(row => Object.values(row).some(v => (v ?? '').trim() !== ''));

    const beforeFilter = rows.length;
    rows = rows.filter(row => isValidPItemNr(row['p_item_number'] ?? ''));
    const invalidItemNrRemoved = beforeFilter - rows.length;

    send('progress', { label: 'Zeilenumbrüche aus Feldern entfernen…', percent: 82 });
    await yield_();

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

    send('progress', { label: 'Reparierte CSV wird erstellt…', percent: 92 });
    await yield_();

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

    console.log(`[CsvRepair] Fertig: ${rows.length} Zeilen, ${invalidItemNrRemoved} entfernt`);
    send('done', { jobId, fileName, stats });
    res.end();
  } catch (err: any) {
    console.error('[CsvRepair] Fehler:', err);
    send('error', { message: err.message || 'Interner Fehler' });
    res.end();
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
