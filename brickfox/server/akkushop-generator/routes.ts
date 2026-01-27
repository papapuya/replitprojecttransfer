import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { processProducts, ProductRow, GenerationResult } from './generator';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/generate', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }

    const fileName = req.file.originalname.toLowerCase();
    let rows: ProductRow[] = [];

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet) as ProductRow[];
    } else if (fileName.endsWith('.csv')) {
      // CSV als UTF-8 String dekodieren und dann parsen
      const csvString = req.file.buffer.toString('utf-8');
      const workbook = XLSX.read(csvString, { type: 'string' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet) as ProductRow[];
    } else {
      return res.status(400).json({ error: 'Ungültiges Dateiformat. Nur .xlsx, .xls oder .csv erlaubt.' });
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Datei enthält keine Daten' });
    }

    const firstRow = rows[0];
    const hasItemNumber = 'p_item_number' in firstRow || Object.keys(firstRow).some(k => k.toLowerCase().includes('p_item_number') || k.toLowerCase().includes('item_number'));
    const hasNameColumn = 'p_name[de]' in firstRow || Object.keys(firstRow).some(k => k.toLowerCase().includes('p_name'));
    const hasDescColumn = 'p_description[de]' in firstRow || Object.keys(firstRow).some(k => k.toLowerCase().includes('p_description'));

    if (!hasItemNumber || !hasNameColumn || !hasDescColumn) {
      const missing = [];
      if (!hasItemNumber) missing.push('p_item_number');
      if (!hasNameColumn) missing.push('p_name[de]');
      if (!hasDescColumn) missing.push('p_description[de]');
      return res.status(400).json({ 
        error: `Pflichtspalten fehlen: ${missing.join(', ')}`,
        foundColumns: Object.keys(firstRow)
      });
    }

    const normalizedRows = rows.map(row => {
      const normalized: ProductRow = { 'p_item_number': '', 'p_name[de]': '', 'p_description[de]': '' };
      for (const [key, value] of Object.entries(row)) {
        if (key.toLowerCase().includes('p_item_number') || key.toLowerCase().includes('item_number')) {
          normalized['p_item_number'] = String(value || '');
        } else if (key.toLowerCase().includes('p_name') && key.toLowerCase().includes('[de]')) {
          normalized['p_name[de]'] = String(value || '');
        } else if (key.toLowerCase().includes('p_description') && key.toLowerCase().includes('[de]')) {
          normalized['p_description[de]'] = String(value || '');
        } else {
          normalized[key] = value;
        }
      }
      return normalized;
    });

    const result: GenerationResult = await processProducts(normalizedRows);

    res.json({
      success: true,
      summary: result.summary,
      rows: result.rows,
    });
  } catch (error: any) {
    console.error('[AkkushopGenerator] Error:', error);
    res.status(500).json({ error: error.message || 'Interner Serverfehler' });
  }
});

router.post('/download', async (req: Request, res: Response) => {
  try {
    const { rows, format = 'xlsx' } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Keine Daten zum Exportieren' });
    }

    // Export-Spalten: Pflichtspalten + Bulletpoints
    const exportRows = rows.map((row: any) => {
      const result: any = {
        'p_item_number': row['p_item_number'] || '',
        'p_name[de]': row['p_name[de]'] || '',
        'p_description[de]': row['p_description[de]'] || '',
        'p_description_bullet[de][0]': row['bullet_1'] || '',
        'p_description_bullet[de][1]': row['bullet_2'] || '',
      };
      // Bullet 3 nur wenn vorhanden
      if (row['bullet_3']) {
        result['p_description_bullet[de][2]'] = row['bullet_3'];
      }
      return result;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Produkte');

    if (format === 'csv') {
      // CSV manuell generieren mit Semikolon-Trennzeichen (UTF-8 ohne BOM)
      // Prüfen ob irgendeine Zeile einen 3. Bulletpoint hat
      const hasBullet3 = exportRows.some((row: any) => row['p_description_bullet[de][2]']);
      const headers = [
        'p_item_number', 
        'p_name[de]', 
        'p_description[de]',
        'p_description_bullet[de][0]',
        'p_description_bullet[de][1]',
        ...(hasBullet3 ? ['p_description_bullet[de][2]'] : [])
      ];
      const csvLines = [headers.join(';')];
      for (const row of exportRows) {
        const values = headers.map(h => {
          const val = String((row as any)[h] || '');
          // Werte mit Semikolon, Anführungszeichen oder Zeilenumbruch in Anführungszeichen setzen
          if (val.includes(';') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
            return '"' + val.replace(/"/g, '""') + '"';
          }
          return val;
        });
        csvLines.push(values.join(';'));
      }
      const csvContent = csvLines.join('\r\n');
      const csvBuffer = Buffer.from(csvContent, 'utf-8');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="akkushop_generated.csv"');
      res.send(csvBuffer);
    } else {
      const xlsxBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="akkushop_generated.xlsx"');
      res.send(xlsxBuffer);
    }
  } catch (error: any) {
    console.error('[AkkushopGenerator] Download error:', error);
    res.status(500).json({ error: error.message || 'Export fehlgeschlagen' });
  }
});

export default router;
