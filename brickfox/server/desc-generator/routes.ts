import { Router, Request, Response } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import OpenAI from 'openai';
import { getSecureOpenAIKey } from '../api-key-manager';
import { EventEmitter } from 'events';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
const progressEmitters = new Map<string, EventEmitter>();

const DESC_COL = 'p_description[de]';
const NAME_COL = 'p_name[de]';
// Prüft ob eine Beschreibung bereits korrekt strukturiert ist (h2 + h3 + ✅ Bullets vorhanden)
function isAlreadyStructured(desc: string): boolean {
  return /<h2/i.test(desc) && /<h3/i.test(desc) && desc.includes('✅');
}

function getOpenAIClient(): OpenAI {
  const apiKey = getSecureOpenAIKey();
  if (!apiKey) throw new Error('OpenAI API key nicht konfiguriert');
  return new OpenAI({ apiKey });
}

async function generateDescription(name: string, existingDesc: string): Promise<string> {
  const openai = getOpenAIClient();

  const systemPrompt = `Du bist ein sachlicher Produkttexter für einen deutschen Online-Shop (akkushop.de).
Erstelle eine deutsche Produktbeschreibung im HTML-Format mit exakt dieser Struktur:

<h2>[Produkttitel basierend auf dem Produktnamen]</h2>
<p>[Absatz 1: Was ist das Produkt, wofür wird es verwendet – nur auf Basis der vorliegenden Informationen]</p>
<p>[Absatz 2: Weitere sachliche Details, Merkmale oder Einsatzgebiete – nur auf Basis der vorliegenden Informationen]</p>
<h3>Produkteigenschaften</h3>
<p>✅ [Eigenschaft 1]<br>✅ [Eigenschaft 2]<br>✅ [Eigenschaft 3]<br>✅ [Eigenschaft 4]</p>

Strikte Regeln:
- Zielumfang: 1.200 bis 2.000 Zeichen (inklusive HTML-Tags)
- Genau 4 Bulletpoints mit ✅ Emoji – keine mehr, keine weniger
- NUR Informationen verwenden, die aus Produktname und bestehender Beschreibung ableitbar sind
- Keine Erfindungen, keine Annahmen, keine Halluzinationen
- Keine werblichen Superlative ("einzigartig", "revolutionär", "perfekt", "ideal")
- Keine Wiederholungen – jeder Satz bringt einen neuen Inhalt
- Sachlich und technisch – wie ein informativer Produktdatenblatt-Text
- Wenn die Produktdaten zu wenig hergeben um den Zielumfang zu erreichen, dürfen allgemeine aber sachlich zutreffende Aussagen ergänzt werden, z.B.: "geeignet für vielseitige Anwendungen", "robuste Verarbeitung", "einfache Handhabung" – nur wenn sie zum Produkttyp passen
- Ausschließlich Deutsch
- Kein Markdown, nur reines HTML
- Keine <html>, <head>, <body> oder <style> Tags
- Gib NUR das HTML aus, ohne Erklärungen`;

  const rawDesc = existingDesc
    ? existingDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : '';

  const userPrompt = `Produktname: ${name}${rawDesc ? `\nVorhandene Beschreibung (Quellinformation – kann kurz, lang, Plain Text oder chaotisches HTML sein):\n${rawDesc}` : ''}

Extrahiere alle sachlichen Informationen aus den Quelldaten und erstelle daraus die Produktbeschreibung im vorgegebenen HTML-Format. Erfinde keine Informationen die nicht in den Quelldaten stehen.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.5,
    max_tokens: 1400,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '';
  // KI umschließt Ausgabe manchmal mit Anführungszeichen oder Markdown-Codeblock – beides entfernen
  return raw
    .replace(/^```html?\s*/i, '').replace(/```\s*$/, '')
    .replace(/^"|"$/g, '')
    .trim();
}

router.get('/progress/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emitter = new EventEmitter();
  progressEmitters.set(sessionId, emitter);

  emitter.on('progress', (data) => res.write(`data: ${JSON.stringify(data)}\n\n`));
  emitter.on('complete', (data) => {
    res.write(`data: ${JSON.stringify({ ...data, complete: true })}\n\n`);
    progressEmitters.delete(sessionId);
    res.end();
  });
  emitter.on('error', (err: Error) => {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    progressEmitters.delete(sessionId);
    res.end();
  });

  req.on('close', () => progressEmitters.delete(sessionId));
});

router.post('/generate', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });

    const sessionId = req.headers['x-session-id'] as string;
    const emitter = sessionId ? progressEmitters.get(sessionId) : null;

    // Sofortiges Event — erscheint noch vor dem CSV-Parsen
    emitter?.emit('progress', { current: 0, total: 0, productName: 'Datei wird gelesen…' });

    let buffer = req.file.buffer;
    let text: string;
    if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      // UTF-8 mit BOM
      text = buffer.slice(3).toString('utf-8');
    } else {
      // Nur ersten 4KB prüfen — reicht für Encoding-Erkennung, viel schneller bei großen Dateien
      const sample = buffer.slice(0, 4096);
      let hasWin1252 = false;
      for (let bi = 0; bi < sample.length; bi++) {
        const b = sample[bi];
        if (b === 0xE4 || b === 0xF6 || b === 0xFC || b === 0xC4 || b === 0xD6 || b === 0xDC || b === 0xDF) {
          hasWin1252 = true; break;
        }
      }
      text = iconv.decode(buffer, hasWin1252 ? 'win1252' : 'utf-8');
    }

    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      delimiter: ';',
      skipEmptyLines: true,
    });

    const rows = parsed.data;
    const headers = parsed.meta.fields ?? [];

    if (!headers.includes(DESC_COL)) {
      return res.status(400).json({ error: `Spalte "${DESC_COL}" nicht gefunden in der CSV` });
    }

    // Alle Zeilen verarbeiten die NICHT bereits korrekt strukturiert sind
    const toProcess = rows
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => !isAlreadyStructured(row[DESC_COL] ?? ''));

    // Sofort initiales Event senden damit der Fortschrittsbalken sofort erscheint
    emitter?.emit('progress', { current: 0, total: toProcess.length, productName: 'Wird vorbereitet…' });

    let generated = 0;
    let errors = 0;
    const resultRows = rows.map(r => ({ ...r }));

    for (let idx = 0; idx < toProcess.length; idx++) {
      const { row, i } = toProcess[idx];
      const name = row[NAME_COL] ?? '';
      const existingDesc = (row[DESC_COL] ?? '').trim();

      emitter?.emit('progress', {
        current: idx + 1,
        total: toProcess.length,
        productName: name,
      });

      try {
        const newDesc = await generateDescription(name, existingDesc);
        resultRows[i][DESC_COL] = newDesc;
        generated++;
      } catch (err: any) {
        console.error(`[DescGenerator] Fehler bei "${name}":`, err.message);
        errors++;
      }
    }

    const csvOut = Papa.unparse(resultRows, { delimiter: ';', columns: headers });
    const csvBuffer = Buffer.concat([
      Buffer.from('\uFEFF', 'utf-8'),
      Buffer.from(csvOut, 'utf-8'),
    ]);

    emitter?.emit('complete', {
      generated,
      errors,
      skipped: rows.length - toProcess.length,
      total: rows.length,
    });

    const fileName = `desc_generated_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csvBuffer);
  } catch (err: any) {
    console.error('[DescGenerator] Fehler:', err);
    res.status(500).json({ error: err.message ?? 'Unbekannter Fehler' });
  }
});

export default router;
