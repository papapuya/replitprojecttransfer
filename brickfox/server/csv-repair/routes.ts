import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import Papa from 'papaparse';
import iconv from 'iconv-lite';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

interface RepairStats {
  totalRawLines: number;
  emptyLinesRemoved: number;
  rowsMerged: number;
  rowsAfterRepair: number;
  invalidItemNrRemoved: number;
}

interface JobData {
  csvBuffer?: Buffer;
  fileName: string;
  expires: number;
  stats?: RepairStats;
  status: 'processing' | 'done' | 'error';
  progress: { label: string; percent: number };
  error?: string;
}

const jobStore = new Map<string, JobData>();

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobStore.entries()) {
    if (job.expires < now) jobStore.delete(id);
  }
}, 10 * 60 * 1000);

function looksLikeNewProductRow(pIdField: string, pItemNrField: string): boolean {
  const id = pIdField.trim().replace(/^"|"$/g, '');
  if (!id) return false;
  if (/<|>/.test(id)) return false;
  if (/\n|\r/.test(id)) return false;
  if (id.length > 100) return false;
  if (/^[\w\-\.\/\+\&]+$/.test(id)) return true;
  return false;
}

function isValidPItemNr(v: string): boolean {
  const val = v.trim();
  if (!val) return false;
  if (/<|>/.test(val)) return false;
  if (/\n|\r/.test(val)) return false;
  if (val.length > 200) return false;
  return true;
}

async function processRepair(jobId: string, fileBuffer: Buffer, originalName: string) {
  const job = jobStore.get(jobId)!;

  try {
    job.progress = { label: 'Datei wird gelesen…', percent: 5 };

    const buf = fileBuffer;
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

    job.progress = { label: 'Zeilen werden gezählt…', percent: 10 };

    const rawLines = raw.split(/\r?\n/);
    const totalRawLines = rawLines.length;

    if (rawLines.length < 2) {
      job.status = 'error';
      job.error = 'CSV zu kurz — mindestens Header + 1 Zeile erforderlich';
      return;
    }

    const headerLine = rawLines[0];

    const semiCount = (headerLine.match(/;/g) || []).length;
    const commaCount = (headerLine.match(/,/g) || []).length;
    const tabCount = (headerLine.match(/\t/g) || []).length;
    let delimiter = ';';
    if (tabCount > semiCount && tabCount > commaCount) delimiter = '\t';
    else if (commaCount > semiCount) delimiter = ',';
    console.log(`[CsvRepair] Delimiter erkannt: "${delimiter === '\t' ? 'TAB' : delimiter}" (semi=${semiCount}, comma=${commaCount}, tab=${tabCount})`);

    const headerCols = headerLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    const pIdIdx     = headerCols.findIndex(h => h === 'p_id');
    const pItemNrIdx = headerCols.findIndex(h => h === 'p_item_number');
    const pIdColIdx      = pIdIdx     >= 0 ? pIdIdx     : 0;
    const pItemNrColIdx  = pItemNrIdx >= 0 ? pItemNrIdx : 1;

    console.log(`[CsvRepair] Header-Spalten: ${headerCols.length}, p_id: ${pIdColIdx}, p_item_number: ${pItemNrColIdx}, Zeilen: ${totalRawLines}`);
    console.log(`[CsvRepair] Headers (first 10): ${headerCols.slice(0, 10).join(' | ')}`);
    if (rawLines.length > 1) {
      const sampleFields = rawLines[1].split(delimiter);
      console.log(`[CsvRepair] Erste Datenzeile p_id="${(sampleFields[pIdColIdx] || '').slice(0, 50)}" p_item_number="${(sampleFields[pItemNrColIdx] || '').slice(0, 50)}"`);
      console.log(`[CsvRepair] looksLikeNewProductRow => ${looksLikeNewProductRow(sampleFields[pIdColIdx] || '', sampleFields[pItemNrColIdx] || '')}`);
    }

    job.progress = { label: `${totalRawLines.toLocaleString()} Zeilen werden zusammengeführt…`, percent: 15 };

    const mergedLines: string[] = [headerLine];
    let emptyLinesRemoved = 0;
    let rowsMerged = 0;
    const PROGRESS_INTERVAL = 2_000;

    const delimRegex = delimiter === ';' ? /^;+$/ : delimiter === ',' ? /^,+$/ : /^\t+$/;
    for (let i = 1; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (!line.trim() || delimRegex.test(line.trim())) {
        emptyLinesRemoved++;
        continue;
      }

      const fields      = line.split(delimiter);
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

      if (i % PROGRESS_INTERVAL === 0) {
        const pct = 15 + Math.round((i / totalRawLines) * 55);
        job.progress = {
          label: `Zeile ${i.toLocaleString()} von ${totalRawLines.toLocaleString()} verarbeitet…`,
          percent: pct,
        };
        await new Promise(r => setImmediate(r));
      }
    }

    job.progress = { label: 'Filtern und bereinigen…', percent: 72 };
    await new Promise(r => setImmediate(r));

    const mergedCsv = mergedLines.join('\n');
    const parsed = Papa.parse<Record<string, string>>(mergedCsv, {
      header: true,
      delimiter,
      skipEmptyLines: true,
    });

    const headers = parsed.meta.fields ?? [];
    let rows = parsed.data;

    console.log(`[CsvRepair] Nach Papa.parse: ${rows.length} Zeilen`);

    rows = rows.filter(row => Object.values(row).some(v => (v ?? '').trim() !== ''));

    const beforeFilter = rows.length;
    rows = rows.filter(row => isValidPItemNr(row['p_item_number'] ?? ''));
    const invalidItemNrRemoved = beforeFilter - rows.length;

    job.progress = { label: 'Zeilenumbrüche aus Feldern entfernen…', percent: 82 };

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

    job.progress = { label: 'Reparierte CSV wird erstellt…', percent: 92 };

    const csvOut = Papa.unparse(rows, { delimiter: ';', columns: headers });
    const csvBuffer = Buffer.concat([
      Buffer.from('\uFEFF', 'utf-8'),
      Buffer.from(csvOut, 'utf-8'),
    ]);

    const baseName = (originalName || 'output').replace(/\.csv$/i, '');

    job.csvBuffer = csvBuffer;
    job.fileName = baseName + '_repariert.csv';
    job.stats = stats;
    job.status = 'done';
    job.progress = { label: 'Abgeschlossen', percent: 100 };

    console.log(`[CsvRepair] Fertig: ${rows.length} Zeilen, ${invalidItemNrRemoved} entfernt`);
  } catch (err: any) {
    console.error('[CsvRepair] Fehler:', err);
    job.status = 'error';
    job.error = err.message || 'Interner Fehler';
    job.progress = { label: 'Fehler', percent: 0 };
  }
}

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }

    const jobId = crypto.randomBytes(16).toString('hex');
    const fileSizeMB = (req.file.size / 1024 / 1024).toFixed(1);

    jobStore.set(jobId, {
      fileName: req.file.originalname || 'input.csv',
      expires: Date.now() + 30 * 60 * 1000,
      status: 'processing',
      progress: { label: `Datei empfangen (${fileSizeMB} MB)…`, percent: 2 },
    });

    processRepair(jobId, req.file.buffer, req.file.originalname || 'input.csv');

    res.json({ jobId });
  } catch (err: any) {
    console.error('[CsvRepair] Upload-Fehler:', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
});

router.get('/progress/:jobId', (req: Request, res: Response) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden' });

  res.json({
    status: job.status,
    progress: job.progress,
    stats: job.stats || null,
    error: job.error || null,
  });
});

router.get('/download/:jobId', (req: Request, res: Response) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden oder abgelaufen' });
  if (job.status !== 'done' || !job.csvBuffer) return res.status(400).json({ error: 'Job noch nicht fertig' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${job.fileName}"`);
  res.send(job.csvBuffer);
});

export default router;
