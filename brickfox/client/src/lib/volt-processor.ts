import Papa from 'papaparse';

export interface VoltProcessorOptions {
  restoreEmoji: boolean;
  onProgress: (step: string, label: string, percent: number, detail?: string) => void;
}

export interface VoltProcessorResult {
  stats: {
    total: number;
    voltChanged: number;
    voltSkipped: number;
    voltSkippedNonElectronic: number;
    voltExtracted: number;
    dreiSpannungCount: number;
    htmlCorrectedCount: number;
  };
  previewItems: PreviewItem[];
  allChangedNames: ChangedName[];
  allExtractedVolt: ExtractedVolt[];
  csvIssues: CsvIssue[];
  headers: string[];
  fileName: string;
  csvBlob: Blob;
}

export interface PreviewItem {
  index: number;
  pId: string;
  itemNr: string;
  voltOrig: string;
  voltNew: string;
  nameDEOrig: string;
  nameDE: string;
  nameNLOrig: string;
  nameNL: string;
  descDE: string;
  descDEOrig: string;
  descDEFull: string;
  descDEChanged: boolean;
  descNL: string;
  descNLOrig: string;
  descNLFull: string;
  descNLChanged: boolean;
  hasHtml: boolean;
  changed: string[];
}

export interface ChangedName {
  itemNr: string;
  cols: Array<{ col: string; before: string; after: string }>;
}

export interface ExtractedVolt {
  itemNr: string;
  extractedVolt: string;
  fromName: string;
  fromCol: string;
}

export interface CsvIssue {
  row: number;
  itemNr: string;
  type: string;
  detail: string;
}

const VOLT_COL = 'p_attributes[akku_v][de]';
const DESC_COLS = ['p_description[de]', 'p_description[nl]'];
const NAME_COLS = ['p_name[de]', 'p_name[nl]'];

const NON_ELECTRONIC_KEYWORDS = [
  'beutel', 'papier', 'staubbeutel', 'wischtuch', 'putztuch', 'reinigungstuch',
  'mikrofasertuch', 'mikrofaser tuch', 'servietten', 'tüten', 'filterbeutel',
  'staubsaugerbeutel', 'ersatzbeutel',
];

function yield_(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function detectEncoding(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return 'utf-8';
  let highBytes = 0;
  const sample = bytes.slice(0, Math.min(1000, bytes.length));
  for (const b of sample) { if (b > 0x7F) highBytes++; }
  if (highBytes > 0) {
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer.slice(0, 10000));
      if (!decoded.includes('\uFFFD')) return 'utf-8';
    } catch {}
    return 'windows-1252';
  }
  return 'utf-8';
}

function repairMojibake(text: string): string {
  if (!text) return text;
  const replacements: [string, string][] = [
    ['Ã¤', 'ä'], ['Ã¶', 'ö'], ['Ã¼', 'ü'],
    ['Ã„', 'Ä'], ['Ã–', 'Ö'], ['Ãœ', 'Ü'],
    ['ÃŸ', 'ß'], ['Ã©', 'é'], ['Ã¨', 'è'],
    ['Ã ', 'à'], ['Ãª', 'ê'], ['Ã€', 'À'], ['Ã‰', 'É'],
    ['â€™', '\u2019'], ['â€œ', '\u201C'], ['â€\u009D', '\u201D'],
    ['â€"', '\u2013'], ['â€\u0094', '\u2014'],
    ['Â°', '°'], ['Â·', '·'], ['Â½', '½'], ['Â¼', '¼'], ['Â¾', '¾'],
    ['â„¢', '™'], ['Â®', '®'], ['Â©', '©'],
  ];
  let result = text;
  for (const [from, to] of replacements) {
    if (result.includes(from)) result = result.split(from).join(to);
  }
  return result;
}

function normalizeRangeVolt(raw: string): string {
  const dotted = raw.replace(/,/g, '.');
  return dotted.replace(/(\d+)\.0(?=[-\/]|$)/g, '$1');
}

function stripTrailingZeroVolt(val: string): string {
  return val.replace(/^(\d+)\.0$/, '$1');
}

function fixVolt(val: string): { fixed: string; changed: boolean } {
  let trimmed = val.trim();
  if (!trimmed) return { fixed: trimmed, changed: false };
  const rangeJunkMatch = trimmed.match(/^(\d+(?:[,.]?\d+)?[-\/]\d+(?:[,.]?\d+)?)\s+\d+/);
  const hadJunk = !!rangeJunkMatch;
  if (hadJunk) trimmed = rangeJunkMatch![1];
  if (/[-\/]/.test(trimmed)) {
    const normalized = normalizeRangeVolt(trimmed);
    return { fixed: normalized, changed: hadJunk || normalized !== val.trim() };
  }
  if (trimmed.includes(',')) {
    const dotFormat = trimmed.replace(',', '.');
    const stripped = stripTrailingZeroVolt(dotFormat);
    return { fixed: stripped, changed: stripped !== trimmed };
  }
  if (trimmed.includes('.')) {
    const stripped = stripTrailingZeroVolt(trimmed);
    return { fixed: stripped, changed: stripped !== trimmed };
  }
  if (!/^\d+$/.test(trimmed)) return { fixed: trimmed, changed: false };
  if (trimmed.length <= 2) return { fixed: trimmed, changed: false };
  if (trimmed.length === 3) {
    const firstTwo = parseInt(trimmed.slice(0, 2), 10);
    if (firstTwo >= 10 && firstTwo <= 24) {
      const raw3 = trimmed.slice(0, 2) + '.' + trimmed[2];
      return { fixed: stripTrailingZeroVolt(raw3), changed: true };
    }
  }
  return { fixed: trimmed, changed: false };
}

function stripDecimalZeroInDesc(html: string): { result: string; changed: boolean } {
  if (!html) return { result: html, changed: false };
  let changed = false;
  const result = html.replace(/\b(\d+)[,.]0(\s*V(?:olt)?)\b/gi, (_match, num, suffix) => {
    changed = true;
    return num + suffix;
  });
  return { result, changed };
}

function normalizeExtractedVolt(raw: string): string {
  if (!raw) return raw;
  if (/[-\/]/.test(raw)) return normalizeRangeVolt(raw);
  if (raw.includes(',')) return raw.replace(',', '.');
  if (raw.includes('.')) return raw;
  return raw;
}

function isAcMainsVolt(raw: string): boolean {
  if (!raw) return false;
  if (/[-\/]/.test(raw)) {
    const parts = raw.split(/[-\/]/).map(p => parseFloat(p.replace(',', '.')));
    return parts.some(p => !isNaN(p) && p >= 100);
  }
  const val = parseFloat(raw.replace(',', '.'));
  return !isNaN(val) && val >= 100;
}

function extractVoltFromName(name: string): string | null {
  if (!name) return null;
  const allMatches = [...name.matchAll(/\b(\d+(?:[,.]\d+)?(?:[-\/]\d+(?:[,.]\d+)?)?)\s*V(?:olt)?\b/gi)];
  for (const m of allMatches) {
    const normalized = normalizeExtractedVolt(m[1]);
    if (normalized) return normalized;
  }
  return null;
}

function extractVoltFromTable(html: string): string | null {
  if (!html) return null;
  const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  let spannungResult: string | null = null;
  let ausgangsResult: string | null = null;
  let eingangsResult: string | null = null;
  for (const trMatch of trMatches) {
    const trContent = trMatch[1];
    const labelMatch = trContent.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/i);
    if (!labelMatch) continue;
    const label = labelMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
    const cells = [...trContent.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)];
    if (cells.length < 2) continue;
    const valueCell = cells[1][1].replace(/<[^>]+>/g, '').trim();
    const m = valueCell.match(/\b(\d+(?:[,.]\d+)?(?:[-\/]\d+(?:[,.]\d+)?)?)\s*(?:V(?:olt)?)?\b/i);
    if (!m) continue;
    const normalized = normalizeExtractedVolt(m[1]);
    if (!normalized) continue;
    if (/^(?:nenn)?spann(?:ung|ing)$/.test(label)) {
      spannungResult = normalized;
    } else if (/ausgangs(?:spannung|spanning)/.test(label) && !ausgangsResult) {
      ausgangsResult = normalized;
    } else if (/eingangs(?:spannung|spanning)/.test(label) && !eingangsResult) {
      eingangsResult = normalized;
    }
  }
  return spannungResult ?? ausgangsResult ?? eingangsResult ?? null;
}

function extractVoltFromBodyText(html: string): string | null {
  if (!html) return null;
  const bodyText = html.replace(/<table[^>]*>[\s\S]*?<\/table>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const allMatches = [...bodyText.matchAll(/\b(\d+(?:[,.]\d+)?(?:[-\/]\d+(?:[,.]\d+)?)?)\s*V(?:olt)?\b/gi)];
  for (const m of allMatches) {
    const normalized = normalizeExtractedVolt(m[1]);
    if (!isAcMainsVolt(normalized)) return normalized;
  }
  return null;
}

function extractVoltFromEinAusgang(html: string): string | null {
  if (!html) return null;
  const bodyText = html.replace(/<table[^>]*>[\s\S]*?<\/table>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const ausMatch = bodyText.match(/ausgangsspann\w*\s+(\d+(?:[,.]\d+)?(?:[-\/]\d+(?:[,.]\d+)?)?)\s*V/i);
  if (ausMatch) return normalizeExtractedVolt(ausMatch[1]);
  const einMatch = bodyText.match(/eingangsspann\w*\s+(\d+(?:[,.]\d+)?(?:[-\/]\d+(?:[,.]\d+)?)?)\s*V/i);
  if (einMatch) return normalizeExtractedVolt(einMatch[1]);
  return null;
}

function hasDreiSpannung(html: string): boolean {
  if (!html) return false;
  const rows = [...html.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)].map(m => m[0]);
  let hasSpannung = false, hasEingang = false, hasAusgang = false;
  for (const row of rows) {
    const labelCell = row.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/i);
    if (!labelCell) continue;
    const label = labelCell[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (/eingangs(?:spannung|spanning)/.test(label)) { hasEingang = true; continue; }
    if (/ausgangs(?:spannung|spanning)/.test(label)) { hasAusgang = true; continue; }
    if (/^(?:nenn)?spann(?:ung|ing)/.test(label)) hasSpannung = true;
  }
  return hasSpannung && hasEingang && hasAusgang;
}

function isValidPItemNr(row: Record<string, string>): boolean {
  const v = (row['p_item_number'] ?? '').trim();
  if (!v) return false;
  if (/<|>/.test(v)) return false;
  if (/&/.test(v)) return false;
  if (/\s/.test(v)) return false;
  if (/,/.test(v)) return false;
  if (/^\d+\.\d+$/.test(v)) return false;
  if (/^\d{1,2}$/.test(v)) return false;
  return true;
}

function restoreEmojiCheckmarks(html: string): string {
  if (!html) return html;
  let result = html.replace(/>(\s*)\? /g, '>$1✅ ');
  result = result.replace(/^\? /, '✅ ');
  result = result.replace(/\n(\s*)\? /g, '\n$1✅ ');
  return result;
}

export async function processVoltFile(
  file: File,
  options: VoltProcessorOptions
): Promise<VoltProcessorResult> {
  const { restoreEmoji, onProgress } = options;

  onProgress('parsing', 'Datei wird gelesen…', 5);
  await yield_();

  const buffer = await file.arrayBuffer();
  const encoding = detectEncoding(buffer);

  let text: string;
  try {
    const decoder = new TextDecoder(encoding, { fatal: false });
    text = decoder.decode(buffer);
  } catch {
    text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  onProgress('parsing', 'CSV wird geparst…', 8);
  await yield_();

  const parsed = Papa.parse<Record<string, string>>(text, {
    delimiter: ';',
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error('CSV konnte nicht geparst werden: ' + (parsed.errors[0]?.message ?? ''));
  }

  const headers = parsed.meta.fields || [];
  const rawData = parsed.data.filter(row =>
    Object.values(row).some(v => typeof v === 'string' && v.trim() !== '')
  );

  onProgress('parsing', 'Zeichen werden repariert…', 11);
  await yield_();

  const rows: Record<string, string>[] = [];
  for (let i = 0; i < rawData.length; i++) {
    const fixed: Record<string, string> = {};
    for (const key of Object.keys(rawData[i])) {
      let val = rawData[i][key];
      if (restoreEmoji) val = restoreEmojiCheckmarks(val);
      fixed[key] = repairMojibake(val);
    }
    rows.push(fixed);
    if (i % 3000 === 0 && i > 0) await yield_();
  }

  onProgress('fixing', 'Volt-Werte werden korrigiert…', 15, `${rows.length.toLocaleString('de-DE')} Zeilen`);
  await yield_();

  let voltChanged = 0, voltSkipped = 0, voltSkippedNonElectronic = 0, voltExtracted = 0;
  const fixedRows: Record<string, string>[] = [];
  const changedCols: string[][] = [];
  const allChangedNames: ChangedName[] = [];
  const allExtractedVolt: ExtractedVolt[] = [];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    if (rowIdx > 0 && rowIdx % 2000 === 0) {
      await yield_();
      onProgress('fixing', 'Volt-Werte werden korrigiert…',
        15 + Math.round(70 * rowIdx / rows.length),
        `${rowIdx.toLocaleString('de-DE')} / ${rows.length.toLocaleString('de-DE')} Zeilen`);
    }

    const row = rows[rowIdx];
    const newRow = { ...row };
    const changed: string[] = [];

    const productNameForCheck = NAME_COLS.map(col => (row[col] || '').toLowerCase()).join(' ');
    if (NON_ELECTRONIC_KEYWORDS.some(kw => productNameForCheck.includes(kw))) {
      fixedRows.push(newRow);
      changedCols.push(changed);
      voltSkipped++;
      voltSkippedNonElectronic++;
      continue;
    }

    const voltVal = (row[VOLT_COL] ?? '').trim();
    const voltAsNum = Number(voltVal.replace(',', '.'));
    const isUnrealisticVolt = voltVal !== '' && !isNaN(voltAsNum) && voltAsNum >= 1000;

    if (isUnrealisticVolt) {
      newRow[VOLT_COL] = '';
      changed.push(VOLT_COL);
      voltChanged++;
    } else if (!voltVal) {
      let extracted: string | null = null;
      let extractedFromCol = '';
      let extractedFromName = '';

      for (const col of NAME_COLS) {
        if (!headers.includes(col)) continue;
        const nameVal = row[col];
        if (!nameVal) continue;
        const found = extractVoltFromName(nameVal);
        if (found) { extracted = found; extractedFromCol = col; extractedFromName = nameVal; break; }
      }

      if (!extracted) {
        for (const col of DESC_COLS) {
          if (!headers.includes(col)) continue;
          const descVal = row[col];
          if (!descVal) continue;
          const found = extractVoltFromTable(descVal);
          if (found) { extracted = found; extractedFromCol = col; extractedFromName = '(Tabelle: Spannung)'; break; }
        }
      }

      if (!extracted) {
        for (const col of DESC_COLS) {
          if (!headers.includes(col)) continue;
          const descVal = row[col];
          if (!descVal) continue;
          const found = extractVoltFromBodyText(descVal);
          if (found) { extracted = found; extractedFromCol = col; extractedFromName = descVal.replace(/<[^>]+>/g, ' ').substring(0, 80); break; }
        }
      }

      if (!extracted) {
        for (const col of DESC_COLS) {
          if (!headers.includes(col)) continue;
          const descVal = row[col];
          if (!descVal) continue;
          const found = extractVoltFromEinAusgang(descVal);
          if (found) { extracted = found; extractedFromCol = col; extractedFromName = '(Ausgangs-/Eingangsspannung)'; break; }
        }
      }

      if (extracted) {
        newRow[VOLT_COL] = extracted;
        changed.push(VOLT_COL);
        voltExtracted++;
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
      if (wc) {
        voltChanged++;
        newRow[VOLT_COL] = fv;
        changed.push(VOLT_COL);
      }
    }

    // ─── 2-stellige Integer: Beschreibung prüfen ob column/10 korrekt ist ──
    const currentVolt2 = (newRow[VOLT_COL] ?? '').trim();
    if (/^\d{2}$/.test(currentVolt2)) {
      const asInt = parseInt(currentVolt2, 10);
      const dividedBy10 = asInt / 10;
      const dividedStr = stripTrailingZeroVolt(
        dividedBy10 % 1 === 0 ? dividedBy10.toString() : dividedBy10.toFixed(1)
      );
      let descExtracted: string | null = null;
      for (const col of DESC_COLS) {
        if (!headers.includes(col)) continue;
        const descVal = row[col];
        if (!descVal) continue;
        descExtracted = extractVoltFromTable(descVal) ?? extractVoltFromBodyText(descVal);
        if (descExtracted) break;
      }
      if (descExtracted) {
        const descNum = parseFloat(descExtracted.replace(',', '.').split('-')[0].split('/')[0]);
        if (!isNaN(descNum) && Math.abs(descNum - dividedBy10) < 0.01) {
          if (dividedStr !== currentVolt2) {
            newRow[VOLT_COL] = dividedStr;
            if (!changed.includes(VOLT_COL)) { changed.push(VOLT_COL); voltChanged++; }
          }
        }
      }
    }

    // ─── 3-stellige Integer (außer 10-24-Bereich) + 4-stellige Integer: ÷100 via Beschreibung ──
    const currentVoltX = (newRow[VOLT_COL] ?? '').trim();
    const is3digit = /^\d{3}$/.test(currentVoltX);
    const is4digit = /^\d{4}$/.test(currentVoltX);
    if (is3digit || is4digit) {
      const asIntX = parseInt(currentVoltX, 10);
      const firstTwoX = parseInt(currentVoltX.slice(0, 2), 10);
      const alreadyHandled3 = is3digit && firstTwoX >= 10 && firstTwoX <= 24;
      if (!alreadyHandled3) {
        const dividedBy100 = asIntX / 100;
        const dividedStr100 = parseFloat(dividedBy100.toFixed(2)).toString();
        let descExtracted100: string | null = null;
        for (const col of DESC_COLS) {
          if (!headers.includes(col)) continue;
          const descVal = row[col];
          if (!descVal) continue;
          descExtracted100 = extractVoltFromTable(descVal) ?? extractVoltFromBodyText(descVal);
          if (descExtracted100) break;
        }
        if (descExtracted100) {
          const descNum100 = parseFloat(descExtracted100.replace(',', '.').split('-')[0].split('/')[0]);
          if (!isNaN(descNum100) && Math.abs(descNum100 - dividedBy100) < 0.001) {
            newRow[VOLT_COL] = dividedStr100;
            if (!changed.includes(VOLT_COL)) { changed.push(VOLT_COL); voltChanged++; }
          }
        }
      }
    }

    fixedRows.push(newRow);
    changedCols.push(changed);
  }

  onProgress('validating', 'CSV wird geprüft…', 91);
  await yield_();

  const csvIssues: CsvIssue[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const itemNr = ['p_item_number', 'v_item_number'].map(c => r[c]).find(v => v?.trim()) ?? '';
    const pItemNr = (r['p_item_number'] ?? '').trim();
    if (!pItemNr) {
      csvIssues.push({ row: i + 2, itemNr: '—', type: 'Leere p_item_number', detail: 'p_item_number ist leer' });
    } else if (/<|>/.test(pItemNr)) {
      csvIssues.push({ row: i + 2, itemNr: pItemNr.slice(0, 30), type: 'HTML-Fragment in p_item_number', detail: `Enthält HTML: ${pItemNr.slice(0, 50)}` });
    } else if (/&/.test(pItemNr)) {
      csvIssues.push({ row: i + 2, itemNr: pItemNr.slice(0, 30), type: 'HTML-Entity in p_item_number', detail: `Enthält Entity: ${pItemNr.slice(0, 50)}` });
    } else if (/\s/.test(pItemNr)) {
      csvIssues.push({ row: i + 2, itemNr: pItemNr.slice(0, 30), type: 'Satzfragment in p_item_number', detail: `Enthält Leerzeichen: ${pItemNr.slice(0, 50)}` });
    } else if (/,/.test(pItemNr)) {
      csvIssues.push({ row: i + 2, itemNr: pItemNr.slice(0, 30), type: 'Volt-Fragment in p_item_number', detail: `Enthält Komma: ${pItemNr.slice(0, 50)}` });
    } else if (/^\d+\.\d+$/.test(pItemNr)) {
      csvIssues.push({ row: i + 2, itemNr: pItemNr.slice(0, 30), type: 'Volt-Fragment in p_item_number', detail: `Dezimalzahl (Volt-Wert): ${pItemNr.slice(0, 50)}` });
    } else if (/^\d{1,2}$/.test(pItemNr)) {
      csvIssues.push({ row: i + 2, itemNr: pItemNr.slice(0, 30), type: 'Volt-Fragment in p_item_number', detail: `Zu kurze Zahl (Volt-Wert): ${pItemNr.slice(0, 50)}` });
    }
    if (headers.includes('p_name[de]') && !(r['p_name[de]'] ?? '').trim())
      csvIssues.push({ row: i + 2, itemNr, type: 'Leerer Produktname', detail: 'p_name[de] ist leer' });
    if (headers.includes('p_description[de]') && !(r['p_description[de]'] ?? '').trim())
      csvIssues.push({ row: i + 2, itemNr, type: 'Leere Beschreibung (DE)', detail: 'p_description[de] ist leer' });
    if (headers.includes('p_description[nl]') && !(r['p_description[nl]'] ?? '').trim())
      csvIssues.push({ row: i + 2, itemNr, type: 'Leere Beschreibung (NL)', detail: 'p_description[nl] ist leer' });
  }

  onProgress('building', 'Ergebnis wird aufbereitet…', 93);
  await yield_();

  // HTML-Beschreibungsspalten unverändert lassen — Zeilenumbrüche sind Teil des HTML
  const HTML_COLS = new Set(['p_description[de]', 'p_description[nl]']);
  const csvRows = fixedRows.map(row => {
    const r = { ...row };
    for (const key of Object.keys(r)) {
      if (r[key] && !HTML_COLS.has(key)) {
        r[key] = r[key].replace(/\r?\n|\r/g, ' ').replace(/  +/g, ' ').trim();
      }
    }
    return r;
  });
  const csvRowsClean = csvRows.filter(row => isValidPItemNr(row));
  const csvOut = Papa.unparse(csvRowsClean, { delimiter: ';', columns: headers });
  const csvBlob = new Blob(['\uFEFF' + csvOut], { type: 'text/csv;charset=utf-8' });

  const dreiSpannungIndices = fixedRows
    .map((row, i) => ({ i, html: row['p_description[de]'] || '' }))
    .filter(({ html }) => hasDreiSpannung(html))
    .map(({ i }) => i);

  const htmlCorrectedCount = fixedRows.filter((_, i) => {
    const ch = changedCols[i] ?? [];
    return ch.length > 0 && /<[a-z]/i.test(fixedRows[i]['p_description[de]'] ?? '');
  }).length;

  onProgress('building', 'Vorschau wird erstellt…', 96);
  await yield_();

  const ITEM_NR_COLS = ['p_item_number', 'v_item_number'];
  const toPlainText = (html: string, max = 120): string => {
    if (!html) return '';
    const plain = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    return plain.length > max ? plain.slice(0, max) + '…' : plain;
  };

  const previewItems: PreviewItem[] = [];
  for (let i = 0; i < fixedRows.length; i++) {
    const row = fixedRows[i];
    const orig = rows[i];
    const changed = changedCols[i] ?? [];
    const itemNr = ITEM_NR_COLS.map(c => row[c]).find(v => v) || '';
    previewItems.push({
      index: i,
      pId: row['p_id'] ?? '',
      itemNr,
      voltOrig: orig[VOLT_COL] ?? '',
      voltNew: row[VOLT_COL] ?? '',
      nameDEOrig: orig['p_name[de]'] ?? '',
      nameDE: row['p_name[de]'] ?? '',
      nameNLOrig: orig['p_name[nl]'] ?? '',
      nameNL: row['p_name[nl]'] ?? '',
      descDE: toPlainText(row['p_description[de]'] ?? ''),
      descDEOrig: orig['p_description[de]'] ?? '',
      descDEFull: row['p_description[de]'] ?? '',
      descDEChanged: changed.includes('p_description[de]'),
      descNL: toPlainText(row['p_description[nl]'] ?? ''),
      descNLOrig: orig['p_description[nl]'] ?? '',
      descNLFull: row['p_description[nl]'] ?? '',
      descNLChanged: changed.includes('p_description[nl]'),
      hasHtml: /<[a-z]/i.test(row['p_description[de]'] ?? ''),
      changed,
    });
    if (i % 3000 === 0 && i > 0) await yield_();
  }

  const baseName = file.name.replace(/\.csv$/i, '');
  const fileName = baseName + '_volt_fixed.csv';

  onProgress('done', 'Fertig!', 100);

  return {
    stats: {
      total: rows.length,
      voltChanged,
      voltSkipped,
      voltSkippedNonElectronic,
      voltExtracted,
      dreiSpannungCount: dreiSpannungIndices.length,
      htmlCorrectedCount,
    },
    previewItems,
    allChangedNames,
    allExtractedVolt,
    csvIssues,
    headers,
    fileName,
    csvBlob,
  };
}
