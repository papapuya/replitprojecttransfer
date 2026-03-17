import { Router, Request, Response } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import crypto from 'crypto';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } }); // 1 GB

const VOLT_COL = 'p_attributes[akku_v][de]';
const DESC_COLS = ['p_description[de]', 'p_description[nl]'];

// Temporärer Speicher für verarbeitete Ergebnisse (max 30 Minuten)
const jobStore = new Map<string, { csvBuffer: Buffer; fileName: string; expires: number }>();

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
  return { fixed: trimmed[0] + ',' + trimmed.slice(1), changed: true };
}

function replaceSpannungInHtml(html: string, oldVolt: string, newVolt: string): { result: string; changed: boolean } {
  if (!html || !oldVolt || !newVolt || oldVolt === newVolt) return { result: html, changed: false };
  const regex = /(<td[^>]*>\s*Spannung\s*<\/td>\s*<td[^>]*>)([^<]*)(<\/td>)/gi;
  let changed = false;
  const result = html.replace(regex, (_match, before, value, after) => {
    const trimmedValue = value.trim();
    if (trimmedValue === oldVolt || trimmedValue.startsWith(oldVolt + ' ') || trimmedValue.startsWith(oldVolt + ',')) {
      changed = true;
      const suffix = trimmedValue.slice(oldVolt.length);
      return before + newVolt + suffix + after;
    }
    return before + value + after;
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

    let voltChanged = 0, voltSkipped = 0, descChanged = 0;
    const fixedRows: Record<string, string>[] = [];
    const changedCols: string[][] = [];

    for (const row of rows) {
      const newRow = { ...row };
      const changed: string[] = [];
      const voltVal = (row[VOLT_COL] ?? '').trim();
      let newVolt = voltVal;
      let voltWasChanged = false;

      if (!voltVal) {
        voltSkipped++;
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

      if (voltWasChanged) {
        for (const col of DESC_COLS) {
          const descVal = row[col];
          if (!descVal) continue;
          const { result, changed: dc } = replaceSpannungInHtml(descVal, voltVal, newVolt);
          if (dc) {
            newRow[col] = result;
            changed.push(col);
            descChanged++;
          }
        }
      }

      fixedRows.push(newRow);
      changedCols.push(changed);
    }

    // Korrigierte CSV bauen
    const csvOut = Papa.unparse(fixedRows, { delimiter: ';', columns: headers });
    const csvBuffer = Buffer.concat([Buffer.from('\uFEFF', 'utf-8'), Buffer.from(csvOut, 'utf-8')]);

    // Job speichern (30 Minuten)
    const jobId = crypto.randomBytes(16).toString('hex');
    jobStore.set(jobId, {
      csvBuffer,
      fileName: (req.file.originalname || 'output').replace(/\.csv$/i, '_volt_fixed.csv'),
      expires: Date.now() + 30 * 60 * 1000,
    });

    // Vorschau: erste 100 Zeilen mit changed-Markierung
    const preview = fixedRows.slice(0, 100).map((row, i) => ({
      row,
      original: rows[i],
      changed: changedCols[i] || [],
    }));

    res.json({
      jobId,
      headers,
      stats: { total: rows.length, voltChanged, voltSkipped, descChanged },
      preview,
      fileName: jobStore.get(jobId)!.fileName,
    });
  } catch (err: any) {
    console.error('[VoltFixer] Upload error:', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
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
