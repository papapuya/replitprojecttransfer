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
    mahExtracted: number;
    mahSkipped: number;
    whExtracted: number;
    whSkipped: number;
    wattExtracted: number;
    wattSkipped: number;
    leuchtExtracted: number;
    leuchtSkipped: number;
  };
  previewItems: PreviewItem[];
  allChangedNames: ChangedName[];
  allExtractedVolt: ExtractedVolt[];
  csvIssues: CsvIssue[];
  headers: string[];
  fileName: string;
  csvBlob: Blob;
  reportBlob: Blob;
  reportFileName: string;
}

export interface PreviewItem {
  index: number;
  pId: string;
  itemNr: string;
  voltOrig: string;
  voltNew: string;
  mahOrig: string;
  mahNew: string;
  whOrig: string;
  whNew: string;
  wattOrig: string;
  wattNew: string;
  leuchtOrig: string;
  leuchtNew: string;
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

const VOLT_COL  = 'p_attributes[akku_v][de]';
const MAH_COL   = 'p_attributes[akku_mah][de]';
const WH_COL    = 'p_attributes[akku_wh][de]';
const WATT_COL  = 'p_attributes[lela_leistung_watt][de]';
const LEUCHT_COL = 'p_attributes[tala_leuchtweite][de]';
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
  // 3-stellige Zahlen: Dezimalstelle einfügen
  // ÷10  → XX.Y  wenn Ergebnis 5–26 V  (z.B. 108→10.8, 144→14.4, 222→22.2, 250→25)
  // ÷100 → X.XX  wenn Ergebnis 1–9.9 V (z.B. 385→3.85, 675→6.75, 480→4.8, 720→7.2)
  if (trimmed.length === 3) {
    const n = parseInt(trimmed, 10);
    const d10 = n / 10;
    if (d10 >= 5 && d10 <= 26) {
      const raw = d10 % 1 === 0 ? d10.toString() : d10.toFixed(1);
      return { fixed: stripTrailingZeroVolt(raw), changed: true };
    }
    const d100 = n / 100;
    if (d100 >= 1.0 && d100 < 10) {
      const raw = d100.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
      return { fixed: raw, changed: raw !== trimmed };
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
  let v = raw.includes(',') ? raw.replace(',', '.') : raw;
  // Trailing-Nullen entfernen: 5.0 → 5, 3.0 → 3, 3.70 → 3.7
  v = v.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return v;
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

function syncVoltInHtmlText(html: string, targetVolt: string): { result: string; changed: boolean } {
  if (!html || !targetVolt || targetVolt.includes('-') || targetVolt.includes('/')) {
    return { result: html, changed: false };
  }
  const protectedLabel = /(?:eingangs|ausgangs)(?:spannung|spanning)/i;
  let changed = false;
  // Vergleich: beide Seiten auf Punkt normalisieren; Ausgabe immer mit Punkt (wie Volt-Spalte)
  const replaceVoltInTextNodes = (s: string): string =>
    s.replace(/(<[^>]*>)|(\b(\d+(?:[,.]\d+)?)\s*(V(?:olt)?)\b)/gi,
      (m, tag, _f, num, unit) => {
        if (tag !== undefined) return tag;
        if (!num || !unit) return m;
        const norm = num.replace(',', '.'); // Komma → Punkt für Vergleich
        if (norm === targetVolt || /[-\/]/.test(num)) return m;
        changed = true;
        return targetVolt + ' ' + (unit.trim().toLowerCase() === 'volt' ? 'Volt' : 'V');
      });
  let result = html.replace(/(<table[^>]*>[\s\S]*?<\/table>)/gi, (tableBlock) =>
    tableBlock.replace(/(<tr\b[^>]*>[\s\S]*?<\/tr>)/gi, (trBlock) => {
      const labelCell = trBlock.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/i);
      if (labelCell && protectedLabel.test(labelCell[1].replace(/<[^>]+>/g, ''))) return trBlock;
      return replaceVoltInTextNodes(trBlock);
    })
  );
  result = result.replace(/(<table[^>]*>[\s\S]*?<\/table>)|(<[^>]*>)|(\b(\d+(?:[,.]\d+)?)\s*(V(?:olt)?)\b)/gi,
    (m, table, tag, _f, num, unit) => {
      if (table !== undefined) return table;
      if (tag !== undefined) return tag;
      if (!num || !unit) return m;
      const norm = num.replace(',', '.'); // Komma → Punkt für Vergleich
      if (norm === targetVolt || /[-\/]/.test(num)) return m;
      changed = true;
      return targetVolt + ' ' + (unit.trim().toLowerCase() === 'volt' ? 'Volt' : 'V');
    });
  return { result, changed };
}

function extractTableRowValues(html: string): string[] {
  const rows = [...html.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)];
  return rows.map(m => {
    const cells = [...m[0].matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)];
    if (cells.length < 2) return '';
    return cells[cells.length - 1][1];
  }).filter(v => v !== '');
}

function syncTableValuesFromDe(deHtml: string, nlHtml: string): { result: string; changed: boolean } {
  if (!deHtml || !nlHtml) return { result: nlHtml, changed: false };
  const deValues = extractTableRowValues(deHtml);
  if (deValues.length === 0) return { result: nlHtml, changed: false };
  let rowIndex = 0;
  let changed = false;
  const result = nlHtml.replace(/<tr[^>]*>[\s\S]*?<\/tr>/gi, (row) => {
    if (rowIndex >= deValues.length) return row;
    const deValue = deValues[rowIndex++];
    let cellCount = 0;
    const totalCells = (row.match(/<(?:td|th)[^>]*/gi) || []).length;
    const newRow = row.replace(/<(td|th)([^>]*)>([\s\S]*?)<\/(?:td|th)>/gi, (cellMatch, tag, attrs, content) => {
      cellCount++;
      if (cellCount === totalCells) {
        if (content !== deValue) { changed = true; return `<${tag}${attrs}>${deValue}</${tag}>`; }
      }
      return cellMatch;
    });
    return newRow;
  });
  return { result, changed };
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

// ─── mAh Extraktion ──────────────────────────────────────────────────────────

function normalizeMah(raw: string): string | null {
  const num = parseFloat(raw.replace(',', '.'));
  if (isNaN(num) || num < 100 || num > 50000) return null;
  return Math.round(num).toString();
}

function extractMahFromText(text: string): string | null {
  if (!text) return null;
  const clean = text.replace(/<[^>]+>/g, ' ');
  // NNNNmAh oder NNNN mAh
  for (const m of clean.matchAll(/\b(\d{3,5}(?:[.,]\d+)?)\s*mAh\b/gi)) {
    const result = normalizeMah(m[1]);
    if (result) return result;
  }
  // N.NAh oder N,NAh → ×1000
  for (const m of clean.matchAll(/\b(\d+(?:[.,]\d+)?)\s*Ah\b/gi)) {
    const num = parseFloat(m[1].replace(',', '.'));
    if (!isNaN(num) && num >= 0.1 && num <= 50) {
      const result = normalizeMah((num * 1000).toString());
      if (result) return result;
    }
  }
  return null;
}

function extractMahFromTable(html: string): string | null {
  if (!html) return null;
  for (const trMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const trContent = trMatch[1];
    const labelMatch = trContent.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/i);
    if (!labelMatch) continue;
    const label = labelMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (!/kapaz|kapacit|mah|akku/i.test(label)) continue;
    const cells = [...trContent.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)];
    if (cells.length < 2) continue;
    const valueCell = cells[1][1].replace(/<[^>]+>/g, '').trim();
    const found = extractMahFromText(valueCell);
    if (found) return found;
    // Reine Zahl in der Zelle (Einheit fehlt, aber Label sagt Kapazität)
    const numMatch = valueCell.match(/^(\d{3,5})$/);
    if (numMatch) { const r = normalizeMah(numMatch[1]); if (r) return r; }
  }
  return null;
}

// ─── Wh Normalisierung (bestehende Werte) ────────────────────────────────────

function fixWh(val: string): { fixed: string; changed: boolean } {
  const trimmed = val.trim();
  if (!trimmed) return { fixed: trimmed, changed: false };
  if (!trimmed.includes(',')) return { fixed: trimmed, changed: false };
  const dotted = trimmed.replace(',', '.');
  // Trailing-Nullen entfernen: 5.20 → 5.2, 50.00 → 50
  const stripped = dotted.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return { fixed: stripped, changed: stripped !== trimmed };
}

// ─── Wh Extraktion ───────────────────────────────────────────────────────────

function normalizeWh(raw: string): string | null {
  const num = parseFloat(raw.replace(',', '.'));
  if (isNaN(num) || num < 0.1 || num > 9999) return null;
  // Round to at most 2 decimal places, strip trailing zeros
  const rounded = Math.round(num * 100) / 100;
  const str = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2).replace(/0+$/, '');
  return str;
}

function extractWhFromText(text: string): string | null {
  if (!text) return null;
  const clean = text.replace(/<[^>]+>/g, ' ');
  for (const m of clean.matchAll(/\b(\d+(?:[.,]\d+)?)\s*Wh\b/gi)) {
    const result = normalizeWh(m[1]);
    if (result) return result;
  }
  return null;
}

function extractWhFromTable(html: string): string | null {
  if (!html) return null;
  for (const trMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const trContent = trMatch[1];
    const labelMatch = trContent.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/i);
    if (!labelMatch) continue;
    const label = labelMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (!/watt|wh\b|kapaz|kapacit/i.test(label)) continue;
    const cells = [...trContent.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)];
    if (cells.length < 2) continue;
    const valueCell = cells[1][1].replace(/<[^>]+>/g, '').trim();
    const found = extractWhFromText(valueCell + ' Wh');
    if (found) return found;
    const numMatch = valueCell.match(/^(\d+(?:[.,]\d+)?)$/);
    if (numMatch) { const r = normalizeWh(numMatch[1]); if (r) return r; }
  }
  return null;
}

// ─── Watt Extraktion ─────────────────────────────────────────────────────────

function normalizeWatt(raw: string): string | null {
  const num = parseFloat(raw.replace(',', '.'));
  if (isNaN(num) || num < 0.1 || num > 99999) return null;
  const rounded = Math.round(num * 10) / 10;
  const str = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
  return str;
}

function extractWattFromText(text: string): string | null {
  if (!text) return null;
  const clean = text.replace(/<[^>]+>/g, ' ');
  // W oder Watt, aber NICHT Wh — W(?!h) matcht W nicht gefolgt von h
  for (const m of clean.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(?:Watt|W(?!h))(?!\w)/gi)) {
    const result = normalizeWatt(m[1]);
    if (result) return result;
  }
  return null;
}

function extractWattFromTable(html: string): string | null {
  if (!html) return null;
  for (const trMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const trContent = trMatch[1];
    const labelMatch = trContent.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/i);
    if (!labelMatch) continue;
    const label = labelMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (!/leistung|watt|power|nennleistung/i.test(label)) continue;
    const cells = [...trContent.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)];
    if (cells.length < 2) continue;
    const valueCell = cells[1][1].replace(/<[^>]+>/g, '').trim();
    const found = extractWattFromText(valueCell + ' W');
    if (found) return found;
    const numMatch = valueCell.match(/^(\d+(?:[.,]\d+)?)$/);
    if (numMatch) { const r = normalizeWatt(numMatch[1]); if (r) return r; }
  }
  return null;
}

// ─── Leuchtweite Extraktion ───────────────────────────────────────────────────

function normalizeLeucht(raw: string): string | null {
  const num = parseFloat(raw.replace(',', '.'));
  if (isNaN(num) || num < 1 || num > 9999) return null;
  return Math.round(num).toString();
}

function extractLeuchtFromText(text: string): string | null {
  if (!text) return null;
  const clean = text.replace(/<[^>]+>/g, ' ');
  // Kontext-Patterns: "Leuchtweite: 100m", "100m Leuchtweite", "bis zu 200 m"
  const contextPatterns = [
    /leuchtweite[^\d]{0,10}(\d+(?:[.,]\d+)?)\s*m(?!\w)/gi,
    /(\d+(?:[.,]\d+)?)\s*m(?!\w)[^\d]{0,20}leuchtweite/gi,
    /reichweite[^\d]{0,10}(\d+(?:[.,]\d+)?)\s*m(?!\w)/gi,
    /(\d+(?:[.,]\d+)?)\s*m(?!\w)[^\d]{0,20}reichweite/gi,
    /strahldistanz[^\d]{0,10}(\d+(?:[.,]\d+)?)\s*m(?!\w)/gi,
  ];
  for (const pattern of contextPatterns) {
    for (const m of clean.matchAll(pattern)) {
      const result = normalizeLeucht(m[1]);
      if (result) return result;
    }
  }
  return null;
}

function extractLeuchtFromTable(html: string): string | null {
  if (!html) return null;
  for (const trMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const trContent = trMatch[1];
    const labelMatch = trContent.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/i);
    if (!labelMatch) continue;
    const label = labelMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (!/leuchtweite|lichtweite|reichweite|strahldistanz|beam|range/i.test(label)) continue;
    const cells = [...trContent.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)];
    if (cells.length < 2) continue;
    const valueCell = cells[1][1].replace(/<[^>]+>/g, '').trim();
    // Zahl + optionales "m"
    const mMatch = valueCell.match(/^(\d+(?:[.,]\d+)?)\s*m?$/i);
    if (mMatch) { const r = normalizeLeucht(mMatch[1]); if (r) return r; }
    const found = extractLeuchtFromText(valueCell + ' m Leuchtweite');
    if (found) return found;
  }
  return null;
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
  let mahExtracted = 0, mahSkipped = 0;
  let whExtracted = 0, whSkipped = 0;
  let wattExtracted = 0, wattSkipped = 0;
  let leuchtExtracted = 0, leuchtSkipped = 0;
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

    // Nur ersten Token: "3,7 3965" → "3,7" (Schutz vor falsch geparsten CSV-Zeilenumbrüchen)
    const voltRaw = (row[VOLT_COL] ?? '').trim();
    const voltVal = voltRaw.split(/\s+/)[0] ?? '';
    if (voltRaw !== voltVal) {
      newRow[VOLT_COL] = voltVal;
    }
    const voltAsNum = Number(voltVal.replace(',', '.'));
    const isUnrealisticVolt = voltVal !== '' && !isNaN(voltAsNum) && voltAsNum >= 1000;

    if (isUnrealisticVolt) {
      newRow[VOLT_COL] = '';
      changed.push(VOLT_COL);
      voltChanged++;
    } else {
      // 1. Bestehenden Wert normalisieren (Komma→Punkt)
      if (voltVal) {
        const { fixed: fv, changed: wc } = fixVolt(voltVal);
        if (wc) {
          voltChanged++;
          newRow[VOLT_COL] = fv;
          changed.push(VOLT_COL);
        }
      }

      // 2. 2-stellige Integer: ÷10 korrigieren (Prüfung gegen ORIGINAL voltVal)
      if (voltVal !== '' && /^\d{2}$/.test(voltVal)) {
        const dividedBy10 = parseInt(voltVal, 10) / 10;
        const dividedStr = stripTrailingZeroVolt(
          dividedBy10 % 1 === 0 ? dividedBy10.toString() : dividedBy10.toFixed(1)
        );
        if (dividedStr !== voltVal) {
          newRow[VOLT_COL] = dividedStr;
          if (!changed.includes(VOLT_COL)) { changed.push(VOLT_COL); voltChanged++; }
        }
      }

      // 3. Immer aus Name/Beschreibung extrahieren und überschreiben wenn gefunden
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
        if (extracted !== (newRow[VOLT_COL] ?? '').trim()) {
          newRow[VOLT_COL] = extracted;
          if (!changed.includes(VOLT_COL)) { changed.push(VOLT_COL); voltChanged++; }
        }
        voltExtracted++;
        allExtractedVolt.push({
          itemNr: row['p_item_number'] || row['v_item_number'] || '',
          extractedVolt: extracted,
          fromName: extractedFromName,
          fromCol: extractedFromCol,
        });
      } else if (!voltVal) {
        voltSkipped++;
      }
    }

    // ─── Beschreibung synchronisieren (wenn Volt-Spalte geändert wurde) ──────────────────
    if (changed.includes(VOLT_COL)) {
      const finalVolt = (newRow[VOLT_COL] ?? '').trim();
      const targetVolt = finalVolt; // Punkt-Format wie Volt-Spalte, Sync gibt auch Punkt aus
      if (!targetVolt.includes('-') && !targetVolt.includes('/')) {
        const deCol = 'p_description[de]';
        if (headers.includes(deCol) && newRow[deCol]) {
          const { result: syncedDe, changed: deChanged } = syncVoltInHtmlText(newRow[deCol], targetVolt);
          if (deChanged) {
            newRow[deCol] = syncedDe;
            if (!changed.includes(deCol)) changed.push(deCol);
          }
        }
        const nlCol = 'p_description[nl]';
        if (headers.includes(nlCol) && newRow[nlCol] && newRow['p_description[de]']) {
          const { result: syncedNl, changed: nlChanged } = syncTableValuesFromDe(newRow['p_description[de]'], newRow[nlCol]);
          if (nlChanged) {
            newRow[nlCol] = syncedNl;
            if (!changed.includes(nlCol)) changed.push(nlCol);
          }
        }
      }
    }

    // ─── mAh: immer aus Name/Beschreibung extrahieren, bestehenden Wert überschreiben ──
    if (headers.includes(MAH_COL)) {
      let extractedMah: string | null = null;

      // 1. Produktname (DE dann NL)
      for (const col of NAME_COLS) {
        if (!headers.includes(col)) continue;
        const val = row[col];
        if (!val) continue;
        extractedMah = extractMahFromText(val);
        if (extractedMah) break;
      }

      // 2. Beschreibung HTML-Tabelle
      if (!extractedMah) {
        for (const col of DESC_COLS) {
          if (!headers.includes(col)) continue;
          const val = row[col];
          if (!val) continue;
          extractedMah = extractMahFromTable(val);
          if (extractedMah) break;
        }
      }

      // 3. Beschreibung Fließtext
      if (!extractedMah) {
        for (const col of DESC_COLS) {
          if (!headers.includes(col)) continue;
          const val = row[col];
          if (!val) continue;
          extractedMah = extractMahFromText(val);
          if (extractedMah) break;
        }
      }

      if (extractedMah) {
        if (extractedMah !== (newRow[MAH_COL] ?? '').trim()) {
          newRow[MAH_COL] = extractedMah;
          if (!changed.includes(MAH_COL)) changed.push(MAH_COL);
        }
        mahExtracted++;
      } else {
        mahSkipped++;
      }
    }

    // ─── Wh: bestehende Werte normalisieren, dann immer aus Name/Beschreibung extrahieren ──
    if (headers.includes(WH_COL)) {
      // 1. Bestehenden Wert normalisieren (Komma→Punkt)
      const whVal = (newRow[WH_COL] ?? '').trim();
      if (whVal) {
        const { fixed: fixedWh, changed: whFixed } = fixWh(whVal);
        if (whFixed) {
          newRow[WH_COL] = fixedWh;
          if (!changed.includes(WH_COL)) changed.push(WH_COL);
        }
      }

      // 2. Immer aus Name/Beschreibung extrahieren und überschreiben wenn gefunden
      let extractedWh: string | null = null;

      // Produktname (DE dann NL)
      for (const col of NAME_COLS) {
        if (!headers.includes(col)) continue;
        const val = row[col];
        if (!val) continue;
        extractedWh = extractWhFromText(val);
        if (extractedWh) break;
      }

      // Beschreibung HTML-Tabelle
      if (!extractedWh) {
        for (const col of DESC_COLS) {
          if (!headers.includes(col)) continue;
          const val = row[col];
          if (!val) continue;
          extractedWh = extractWhFromTable(val);
          if (extractedWh) break;
        }
      }

      // Beschreibung Fließtext
      if (!extractedWh) {
        for (const col of DESC_COLS) {
          if (!headers.includes(col)) continue;
          const val = row[col];
          if (!val) continue;
          extractedWh = extractWhFromText(val);
          if (extractedWh) break;
        }
      }

      if (extractedWh) {
        if (extractedWh !== (newRow[WH_COL] ?? '').trim()) {
          newRow[WH_COL] = extractedWh;
          if (!changed.includes(WH_COL)) changed.push(WH_COL);
        }
        whExtracted++;
      } else {
        whSkipped++;
      }
    }

    // ─── Watt: immer aus Name/Beschreibung extrahieren, bestehenden Wert überschreiben ──
    if (headers.includes(WATT_COL)) {
      let extractedWatt: string | null = null;

      for (const col of NAME_COLS) {
        if (!headers.includes(col)) continue;
        const val = row[col];
        if (!val) continue;
        extractedWatt = extractWattFromText(val);
        if (extractedWatt) break;
      }

      if (!extractedWatt) {
        for (const col of DESC_COLS) {
          if (!headers.includes(col)) continue;
          const val = row[col];
          if (!val) continue;
          extractedWatt = extractWattFromTable(val);
          if (extractedWatt) break;
        }
      }

      if (!extractedWatt) {
        for (const col of DESC_COLS) {
          if (!headers.includes(col)) continue;
          const val = row[col];
          if (!val) continue;
          extractedWatt = extractWattFromText(val);
          if (extractedWatt) break;
        }
      }

      if (extractedWatt) {
        if (extractedWatt !== (newRow[WATT_COL] ?? '').trim()) {
          newRow[WATT_COL] = extractedWatt;
          if (!changed.includes(WATT_COL)) changed.push(WATT_COL);
        }
        wattExtracted++;
      } else {
        wattSkipped++;
      }
    }

    // ─── Leuchtweite: immer aus Name/Beschreibung extrahieren, bestehenden Wert überschreiben ──
    if (headers.includes(LEUCHT_COL)) {
      let extractedLeucht: string | null = null;

      for (const col of NAME_COLS) {
        if (!headers.includes(col)) continue;
        const val = row[col];
        if (!val) continue;
        extractedLeucht = extractLeuchtFromText(val);
        if (extractedLeucht) break;
      }

      if (!extractedLeucht) {
        for (const col of DESC_COLS) {
          if (!headers.includes(col)) continue;
          const val = row[col];
          if (!val) continue;
          extractedLeucht = extractLeuchtFromTable(val);
          if (extractedLeucht) break;
        }
      }

      if (!extractedLeucht) {
        for (const col of DESC_COLS) {
          if (!headers.includes(col)) continue;
          const val = row[col];
          if (!val) continue;
          extractedLeucht = extractLeuchtFromText(val);
          if (extractedLeucht) break;
        }
      }

      if (extractedLeucht) {
        if (extractedLeucht !== (newRow[LEUCHT_COL] ?? '').trim()) {
          newRow[LEUCHT_COL] = extractedLeucht;
          if (!changed.includes(LEUCHT_COL)) changed.push(LEUCHT_COL);
        }
        leuchtExtracted++;
      } else {
        leuchtSkipped++;
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

  // Alle Spalten bereinigen — Zeilenumbrüche entfernen für maximale Excel-Kompatibilität
  const csvRows = fixedRows.map(row => {
    const r = { ...row };
    for (const key of Object.keys(r)) {
      if (r[key]) {
        r[key] = r[key].replace(/\r?\n|\r/g, ' ').replace(/  +/g, ' ').trim();
      }
    }
    return r;
  });
  const csvRowsClean = csvRows.filter(row => isValidPItemNr(row));

  // Attributspalten die im Original-CSV fehlten, aber jetzt befüllt wurden, hinzufügen
  const ATTR_COLS_ORDERED = [VOLT_COL, MAH_COL, WH_COL, WATT_COL, LEUCHT_COL];
  const missingAttrCols = ATTR_COLS_ORDERED.filter(col =>
    !headers.includes(col) &&
    csvRowsClean.some(r => (r[col] ?? '').trim() !== '')
  );
  let finalHeaders = [...headers];
  if (missingAttrCols.length > 0) {
    // Einfügen nach p_item_number (oder am Anfang wenn nicht vorhanden)
    const insertAfter = finalHeaders.findIndex(h =>
      h === 'p_item_number' || h === 'v_item_number'
    );
    const insertAt = insertAfter >= 0 ? insertAfter + 1 : 0;
    finalHeaders.splice(insertAt, 0, ...missingAttrCols);
    console.log(`[VoltFixer] Neue Attributspalten in Export eingefügt: ${missingAttrCols.join(', ')}`);
  }

  const csvOut = Papa.unparse(csvRowsClean, { delimiter: ';', columns: finalHeaders });
  const csvBlob = new Blob(['\uFEFF' + csvOut], { type: 'text/csv;charset=utf-8' });

  // Debug: Blob-Inhalt direkt auslesen und verifizieren
  csvBlob.text().then(blobText => {
    const blobParsed = Papa.parse<Record<string, string>>(blobText, { delimiter: ';', header: true });
    const blobRows = blobParsed.data as Record<string, string>[];
    const voltColInBlob = blobParsed.meta.fields?.includes(VOLT_COL);
    console.log(`[VoltFixer] Blob: ${blobRows.length} Zeilen, VOLT_COL vorhanden=${voltColInBlob}`);

    // Suche Zeilen mit korrigierten Volt-Werten (2-/3-stellige Original-Werte)
    const samples = changedCols
      .map((cols, i) => ({ cols, i }))
      .filter(({ cols, i }) => cols.includes(VOLT_COL) && /^\d{2,3}$/.test((rows[i][VOLT_COL] ?? '').trim().split(/\s+/)[0] ?? ''))
      .slice(0, 5);

    if (samples.length > 0) {
      console.log('[VoltFixer] fixedRows-Korrekturen (2-/3-stellige Original-Volt):');
      samples.forEach(({ i }) => {
        const itemNr = fixedRows[i]['p_item_number'] || fixedRows[i]['v_item_number'] || '?';
        const origVolt = (rows[i][VOLT_COL] ?? '').trim().split(/\s+/)[0] ?? '';
        const newVolt = fixedRows[i][VOLT_COL] ?? '';
        const blobRow = blobRows.find(r => r['p_item_number'] === itemNr || r['v_item_number'] === itemNr);
        const blobVolt = blobRow ? (blobRow[VOLT_COL] ?? '(kein Eintrag)') : '(Zeile nicht im Blob!)';
        console.log(`  ${itemNr}: orig=${origVolt} fixedRows=${newVolt} BLOB=${blobVolt}`);
      });
    } else {
      console.log('[VoltFixer] Keine 2-/3-stelligen Volt-Korrekturen gefunden.');
    }

    // Suche gezielt nach BSP-U010R_1 (exakt + partial)
    const bspRow = blobRows.find(r =>
      (r['p_item_number'] || '').includes('BSP-U010R') ||
      (r['v_item_number'] || '').includes('BSP-U010R')
    );
    if (bspRow) {
      console.log(`[VoltFixer] BSP-U010R_1 im Blob: item="${bspRow['p_item_number']}" volt="${bspRow[VOLT_COL]}"`);
    } else {
      console.log('[VoltFixer] BSP-U010R_1 NICHT im Blob (auch partial-Suche).');
    }

    // fixedRows: Suche BSP-U010R_1
    const bspFixed = fixedRows.find(r =>
      (r['p_item_number'] || '').includes('BSP-U010R') ||
      (r['v_item_number'] || '').includes('BSP-U010R')
    );
    if (bspFixed) {
      const itemNr = bspFixed['p_item_number'] || bspFixed['v_item_number'] || '?';
      const pItemNr = (bspFixed['p_item_number'] ?? '').trim();
      const passes = isValidPItemNr(bspFixed);
      console.log(`[VoltFixer] BSP-U010R_1 in fixedRows: item="${itemNr}" p_item_number="${pItemNr}" isValidPItemNr=${passes} volt="${bspFixed[VOLT_COL]}"`);
    } else {
      console.log('[VoltFixer] BSP-U010R_1 NICHT in fixedRows.');
    }

    // Nicht-korrigierte 2-4-stellige Integer im Blob (nur wenn Original auch 2-4-stellig)
    const trulyUncorrected = changedCols
      .map((cols, i) => ({ cols, i }))
      .filter(({ cols }) => !cols.includes(VOLT_COL))
      .filter(({ i }) => /^\d{2,4}$/.test((rows[i][VOLT_COL] ?? '').trim().split(/\s+/)[0] ?? ''))
      .slice(0, 5);
    if (trulyUncorrected.length > 0) {
      console.log('[VoltFixer] ⚠ 2-4-stellige Original-Volt die NICHT korrigiert wurden:');
      trulyUncorrected.forEach(({ i }) => {
        const itemNr = fixedRows[i]['p_item_number'] || fixedRows[i]['v_item_number'] || '?';
        const origVolt = (rows[i][VOLT_COL] ?? '').trim().split(/\s+/)[0] ?? '';
        const newVolt = fixedRows[i][VOLT_COL] ?? '';
        const name = (rows[i]['p_name[de]'] ?? '').slice(0, 60);
        const isNonElec = NON_ELECTRONIC_KEYWORDS.some(kw => (rows[i]['p_name[de]'] || '').toLowerCase().includes(kw));
        console.log(`  ${itemNr}: orig=${origVolt} fixedRows=${newVolt} nonElec=${isNonElec} name="${name}"`);
      });
    } else {
      console.log('[VoltFixer] ✓ Alle 2-4-stelligen Original-Volt korrekt verarbeitet.');
    }
  });

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
      voltOrig: (orig[VOLT_COL] ?? '').trim().split(/\s+/)[0] ?? '',
      voltNew: row[VOLT_COL] ?? '',
      mahOrig: (orig[MAH_COL] ?? '').trim(),
      mahNew: row[MAH_COL] ?? '',
      whOrig: (orig[WH_COL] ?? '').trim(),
      whNew: row[WH_COL] ?? '',
      wattOrig: (orig[WATT_COL] ?? '').trim(),
      wattNew: row[WATT_COL] ?? '',
      leuchtOrig: (orig[LEUCHT_COL] ?? '').trim(),
      leuchtNew: row[LEUCHT_COL] ?? '',
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
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const fileName = `${baseName}_attribut_fixed_${ts}.csv`;
  const reportFileName = `${baseName}_attribut_korrekturen_${ts}.csv`;

  // Korrekturbericht: nur geänderte Volt-Zeilen mit 3 Spalten
  const reportRows = changedCols
    .map((cols, i) => ({ cols, i }))
    .filter(({ cols }) => cols.includes(VOLT_COL))
    .map(({ i }) => ({
      Artikelnummer: fixedRows[i]['p_item_number'] || fixedRows[i]['v_item_number'] || '',
      Volt_alt: (rows[i][VOLT_COL] ?? '').trim().split(/\s+/)[0] ?? '',
      Volt_neu: fixedRows[i][VOLT_COL] ?? '',
    }));
  const reportCsv = Papa.unparse(reportRows, { delimiter: ';' });
  const reportBlob = new Blob(['\uFEFF' + reportCsv], { type: 'text/csv;charset=utf-8' });

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
      mahExtracted,
      mahSkipped,
      whExtracted,
      whSkipped,
      wattExtracted,
      wattSkipped,
      leuchtExtracted,
      leuchtSkipped,
    },
    previewItems,
    allChangedNames,
    allExtractedVolt,
    csvIssues,
    headers,
    fileName,
    csvBlob,
    reportBlob,
    reportFileName,
  };
}
