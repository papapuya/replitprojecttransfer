import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import iconv from 'iconv-lite';
import Papa from 'papaparse';
import { processProducts, ProductRow, GenerationResult, categorizeProducts, CategorizedRow, generateFromCategorized } from './generator';
import { EventEmitter } from 'events';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const progressEmitters = new Map<string, EventEmitter>();

router.get('/progress/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emitter = new EventEmitter();
  progressEmitters.set(sessionId, emitter);

  emitter.on('progress', (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });

  emitter.on('complete', (data) => {
    res.write(`data: ${JSON.stringify({ ...data, complete: true })}\n\n`);
    progressEmitters.delete(sessionId);
    res.end();
  });

  emitter.on('error', (error) => {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    progressEmitters.delete(sessionId);
    res.end();
  });

  req.on('close', () => {
    progressEmitters.delete(sessionId);
  });
});

// CSV-Zeile parsen mit Unterstützung für Anführungszeichen
function parseCSVLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result;
}

router.post('/generate', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }

    const sessionId = req.headers['x-session-id'] as string;
    const emitter = sessionId ? progressEmitters.get(sessionId) : null;

    const fileName = req.file.originalname.toLowerCase();
    let rows: ProductRow[] = [];

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellText: true, cellDates: false });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' }) as ProductRow[];
    } else if (fileName.endsWith('.csv')) {
      // CSV dekodieren - intelligente Encoding-Erkennung
      let csvString: string;
      const buffer = req.file.buffer;
      
      // Prüfe auf UTF-8 BOM
      const hasUtf8Bom = buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF;
      
      if (hasUtf8Bom) {
        // UTF-8 mit BOM - BOM überspringen (3 Bytes)
        csvString = buffer.slice(3).toString('utf-8');
        console.log('[CSV] Encoding: UTF-8 mit BOM erkannt');
      } else {
        // Versuche zuerst UTF-8, dann Latin-1
        const utf8String = buffer.toString('utf-8');
        // Prüfe auf typische UTF-8 Fehler (Replacement Character oder ungültige Sequenzen)
        const hasUtf8Errors = utf8String.includes('\uFFFD') || /Ã[¤ö¼ß]/.test(utf8String);
        
        if (!hasUtf8Errors && /[äöüÄÖÜß]/.test(utf8String)) {
          // Gültige UTF-8 mit deutschen Umlauten
          csvString = utf8String;
          console.log('[CSV] Encoding: UTF-8 ohne BOM erkannt');
        } else {
          // Latin-1 (ISO-8859-1) - Standard für Brickfox-Exporte
          csvString = iconv.decode(buffer, 'ISO-8859-1');
          console.log('[CSV] Encoding: ISO-8859-1 (Latin-1) verwendet');
        }
      }
      
      const workbook = XLSX.read(csvString, { 
        type: 'string', 
        raw: false
      });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      // Alle Zellen explizit als Text lesen
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = sheet[addr];
          if (cell && cell.v !== undefined) {
            cell.t = 's'; // Als String behandeln
            cell.w = String(cell.v); // Formatierter Wert = Rohwert
          }
        }
      }
      
      rows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' }) as ProductRow[];
      
      // Debug: Spalten und erste Werte loggen
      console.log('[CSV Debug] Spalten:', Object.keys(rows[0] || {}));
      console.log('[CSV Debug] Erste 3 p_item_number:', rows.slice(0, 3).map((r: any) => r['p_item_number'] || r.p_item_number));
      console.log('[CSV Debug] Erste p_description[de]:', (rows[0] as any)?.['p_description[de]']?.substring(0, 50));
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
        if (key.toLowerCase().includes('p_item_number') || key.toLowerCase() === 'p_item_number') {
          normalized['p_item_number'] = String(value || '');
        } else if (key.toLowerCase().includes('p_name') && key.toLowerCase().includes('[de]')) {
          normalized['p_name[de]'] = String(value || '');
        } else if (key.toLowerCase() === 'p_description[de]' || (key.toLowerCase().includes('p_description') && key.toLowerCase().includes('[de]') && !key.toLowerCase().includes('bullet'))) {
          // Nur die Hauptbeschreibung, nicht die Bulletpoints
          normalized['p_description[de]'] = String(value || '');
        } else {
          normalized[key] = value;
        }
      }
      return normalized;
    });
    
    // Debug: Erste 3 normalisierte Zeilen loggen
    console.log('[Normalized Debug] Erste 3 p_item_number:', normalizedRows.slice(0, 3).map(r => r['p_item_number']));
    console.log('[Normalized Debug] Erste Beschreibung (100 Zeichen):', normalizedRows[0]?.['p_description[de]']?.substring(0, 100));

    const onProgress = emitter ? (current: number, total: number, productName: string) => {
      emitter.emit('progress', { current, total, productName });
    } : undefined;

    const result: GenerationResult = await processProducts(normalizedRows, onProgress);

    console.log('[Result Debug] Erste 3 p_item_number:', result.rows.slice(0, 3).map(r => r['p_item_number']));

    if (emitter) {
      emitter.emit('complete', { summary: result.summary });
    }

    res.json({
      success: true,
      summary: result.summary,
      rows: result.rows,
    });
  } catch (error: any) {
    console.error('[AkkushopGenerator] Error:', error);
    const sessionId = req.headers['x-session-id'] as string;
    const emitter = sessionId ? progressEmitters.get(sessionId) : null;
    if (emitter) {
      emitter.emit('error', error);
    }
    res.status(500).json({ error: error.message || 'Interner Serverfehler' });
  }
});

// Schritt 1: Nur Kategorisierung
router.post('/categorize', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }

    const sessionId = req.headers['x-session-id'] as string;
    const emitter = sessionId ? progressEmitters.get(sessionId) : null;

    const fileName = req.file.originalname.toLowerCase();
    let rows: ProductRow[] = [];

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellText: true, cellDates: false });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' }) as ProductRow[];
    } else if (fileName.endsWith('.csv')) {
      let csvString: string;
      const buffer = req.file.buffer;
      const hasUtf8Bom = buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF;
      
      if (hasUtf8Bom) {
        csvString = buffer.slice(3).toString('utf-8');
      } else {
        csvString = iconv.decode(buffer, 'win1252');
      }

      // PapaParse für korrekte Verarbeitung von mehrzeiligen Feldern
      const parseResult = Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        delimiter: ';', // Semikolon als Standardtrennzeichen für deutsche CSVs
        quoteChar: '"',
      });

      if (parseResult.errors.length > 0) {
        console.log(`[AkkushopGenerator] CSV Parse Errors:`, parseResult.errors.slice(0, 5));
      }

      rows = parseResult.data as ProductRow[];
      console.log(`[AkkushopGenerator] CSV: ${rows.length} Produkte mit PapaParse geparst`);
      const headers = Object.keys(rows[0] || {});
      console.log(`[AkkushopGenerator] CSV Headers (${headers.length}):`, JSON.stringify(headers));
      console.log(`[AkkushopGenerator] Erste Zeile p_name[de]:`, (rows[0] as any)?.['p_name[de]']?.substring(0, 50));
      const desc = (rows[0] as any)?.['p_description[de]'];
      console.log(`[AkkushopGenerator] Erste Zeile p_description[de]: Typ=${typeof desc}, Länge=${desc?.length || 0}, Inhalt=${desc?.substring(0, 100) || 'LEER'}`);
    } else {
      return res.status(400).json({ error: 'Nicht unterstütztes Dateiformat. Bitte .xlsx, .xls oder .csv verwenden.' });
    }

    // Spalten normalisieren
    const normalizedRows = rows.map(row => {
      const normalized: ProductRow = {
        'p_item_number': '',
        'p_name[de]': '',
        'p_description[de]': '',
      };
      
      for (const [key, value] of Object.entries(row)) {
        const cleanKey = key.replace(/^\uFEFF/, '').trim();
        normalized[cleanKey] = value;
        
        if (cleanKey.toLowerCase().includes('item') && cleanKey.toLowerCase().includes('number')) {
          normalized['p_item_number'] = value as string;
        }
        if (cleanKey.toLowerCase().includes('name') && cleanKey.toLowerCase().includes('de')) {
          normalized['p_name[de]'] = value as string;
        }
        if (cleanKey.toLowerCase().includes('description') && cleanKey.toLowerCase().includes('de')) {
          normalized['p_description[de]'] = value as string;
        }
      }
      
      return normalized;
    });

    // Leere Zeilen filtern (nur Produkte mit Namen behalten)
    const validRows = normalizedRows.filter(row => {
      const name = row['p_name[de]']?.trim();
      return name && name.length > 0;
    });

    console.log(`[AkkushopGenerator] Gefiltert: ${normalizedRows.length} → ${validRows.length} gültige Zeilen`);

    const onProgress = emitter ? (current: number, total: number, productName: string) => {
      emitter.emit('progress', { current, total, productName });
    } : undefined;

    const result = await categorizeProducts(validRows, onProgress);

    if (emitter) {
      emitter.emit('complete', { summary: result.summary });
    }

    res.json({
      success: true,
      summary: result.summary,
      rows: result.rows,
    });
  } catch (error: any) {
    console.error('[AkkushopGenerator] Categorize Error:', error);
    res.status(500).json({ error: error.message || 'Interner Serverfehler' });
  }
});

// Schritt 2: Generierung mit vorgegebenen Kategorien
router.post('/generate-from-categorized', async (req: Request, res: Response) => {
  try {
    const { rows } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Keine Daten zum Generieren' });
    }

    const sessionId = req.headers['x-session-id'] as string;
    const emitter = sessionId ? progressEmitters.get(sessionId) : null;

    const onProgress = emitter ? (current: number, total: number, productName: string) => {
      emitter.emit('progress', { current, total, productName });
    } : undefined;

    const result = await generateFromCategorized(rows as CategorizedRow[], onProgress);

    if (emitter) {
      emitter.emit('complete', { summary: result.summary });
    }

    res.json({
      success: true,
      summary: result.summary,
      rows: result.rows,
    });
  } catch (error: any) {
    console.error('[AkkushopGenerator] Generate Error:', error);
    res.status(500).json({ error: error.message || 'Interner Serverfehler' });
  }
});

router.post('/download', async (req: Request, res: Response) => {
  try {
    const { rows, format = 'xlsx', errorsOnly = false, withBom = false } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Keine Daten zum Exportieren' });
    }

    let exportRows: any[];

    if (errorsOnly) {
      // Fehler-Export: Original-Daten + Fehler-Spalte
      exportRows = rows.map((row: any) => ({
        'p_item_number': row['p_item_number'] || '',
        'p_name[de]': row['p_name[de]'] || '',
        'p_description[de]': row['original_description'] || row['p_description[de]'] || '',
        'Fehler': row['error'] || '',
      }));
    } else {
      // Erfolg-Export: Generierte Daten + Bulletpoints + Original-IDs
      exportRows = rows.map((row: any) => {
        const result: any = {
          'p_id': row['p_id'] || '',
          'v_id': row['v_id'] || '',
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
    }

    // Header für XLSX definieren
    const xlsxHeaders = errorsOnly 
      ? ['p_item_number', 'p_name[de]', 'p_description[de]', 'Fehler']
      : Object.keys(exportRows[0] || {});
    
    const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: xlsxHeaders, skipHeader: false });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Produkte');

    if (format === 'csv') {
      // CSV manuell generieren mit Semikolon-Trennzeichen (UTF-8 ohne BOM)
      let headers: string[];
      if (errorsOnly) {
        headers = ['p_item_number', 'p_name[de]', 'p_description[de]', 'Fehler'];
      } else {
        const hasBullet3 = exportRows.some((row: any) => row['p_description_bullet[de][2]']);
        headers = [
          'p_id',
          'v_id',
          'p_item_number', 
          'p_name[de]', 
          'p_description[de]',
          'p_description_bullet[de][0]',
          'p_description_bullet[de][1]',
          ...(hasBullet3 ? ['p_description_bullet[de][2]'] : [])
        ];
      }
      // CSV mit Spaltenüberschriften
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
      // Brickfox: UTF-8 mit BOM (für ✅ Emoji-Unterstützung und korrekte Erkennung)
      const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
      const csvBuffer = Buffer.concat([bom, Buffer.from(csvContent, 'utf-8')]);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      const filename = errorsOnly ? 'akkushop_fehler.csv' : 'akkushop_generated.csv';
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvBuffer);
    } else {
      const xlsxBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const filename = errorsOnly ? 'akkushop_fehler.xlsx' : 'akkushop_generated.xlsx';
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(xlsxBuffer);
    }
  } catch (error: any) {
    console.error('[AkkushopGenerator] Download error:', error);
    res.status(500).json({ error: error.message || 'Export fehlgeschlagen' });
  }
});

export default router;
