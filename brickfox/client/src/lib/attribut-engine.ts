import Papa from 'papaparse';

const VOLT_COL = 'p_attributes[akku_v][de]';
const DESC_COLS = ['p_description[de]', 'p_description[nl]'];
const NAME_COLS = ['p_name[de]', 'p_name[nl]'];
const HTML_EXPORT_COLS = new Set(['p_description[de]', 'p_description[nl]']);

const NON_ELECTRONIC_KEYWORDS = [
  'beutel', 'papier', 'staubbeutel', 'wischtuch', 'putztuch', 'reinigungstuch',
  'mikrofasertuch', 'mikrofaser tuch', 'servietten', 'tüten', 'filterbeutel',
  'staubsaugerbeutel', 'ersatzbeutel',
];

export interface AttrEngineStats {
  total: number;
  voltChanged: number;
  voltSkipped: number;
  voltSkippedNonElectronic: number;
  voltExtracted: number;
  dreiSpannungCount: number;
  htmlCorrectedCount: number;
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
  descDEChanged: boolean;
  descNL: string;
  descNLChanged: boolean;
  hasHtml: boolean;
  changed: string[];
}

export interface AttrEngineResult {
  csvBlob: Blob;
  stats: AttrEngineStats;
  previewItems: PreviewItem[];
  headers: string[];
}

export type ProgressCallback = (percent: number, label: string) => void;

function repairMojibake(text: string): string {
  if (!text) return text;
  const replacements: [string, string][] = [
    ['Ã¤', 'ä'], ['Ã¶', 'ö'], ['Ã¼', 'ü'],
    ['Ã„', 'Ä'], ['Ã–', 'Ö'], ['Ãœ', 'Ü'],
    ['ÃŸ', 'ß'], ['Ã©', 'é'], ['Ã¨', 'è'],
    ['Ã ', 'à'], ['Ãª', 'ê'], ['Ã€', 'À'], ['Ã‰', 'É'],
    ['â€™', '\u2019'], ['â€œ', '\u201C'], ['â€\u009D', '\u201D'],
    ['â€"', '\u2013'], ['â€"', '\u2014'],
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

function normalizeExtractedVolt(raw: string): string {
  if (!raw) return raw;
  if (/[-\/]/.test(raw)) return normalizeRangeVolt(raw);
  let v = raw.includes(',') ? raw.replace(',', '.') : raw;
  v = v.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return v;
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
  if (trimmed.length === 3) {
    const n = parseInt(trimmed, 10);
    const d10 = n / 10;
    if (d10 >= 5 && d10 <= 99) {
      const raw = d10 % 1 === 0 ? d10.toString() : d10.toFixed(1);
      return { fixed: stripTrailingZeroVolt(raw), changed: true };
    }
  }
  return { fixed: trimmed, changed: false };
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

  const replaceVoltInTextNodes = (s: string): string =>
    s.replace(/(<[^>]*>)|(\b(\d+(?:[,.]\d+)?)\s*(V(?:olt)?)\b)/gi,
      (m, tag, _f, num, unit) => {
        if (tag !== undefined) return tag;
        if (!num || !unit) return m;
        const norm = num.replace(',', '.');
        if (norm === targetVolt || /[-\/]/.test(num)) return m;
        changed = true;
        return targetVolt + ' ' + (unit.trim().toLowerCase() === 'volt' ? 'Volt' : 'V');
      });

  let result = html.replace(/(<table[^>]*>[\s\S]*?<\/table>)/gi, (tableBlock) =>
    tableBlock.replace(/(<tr\b[^>]*>[\s\S]*?<\/tr>)/gi, (trBlock) => {
      const labelCell = trBlock.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/i);
      if (labelCell && protectedLabel.test(labelCell[1].replace(/<[^>]+>/g, ''))) {
        return trBlock;
      }
      return replaceVoltInTextNodes(trBlock);
    })
  );

  result = result.replace(/(<table[^>]*>[\s\S]*?<\/table>)|(<[^>]*>)|(\b(\d+(?:[,.]\d+)?)\s*(V(?:olt)?)\b)/gi,
    (m, table, tag, _f, num, unit) => {
      if (table !== undefined) return table;
      if (tag !== undefined) return tag;
      if (!num || !unit) return m;
      const norm = num.replace(',', '.');
      if (norm === targetVolt || /[-\/]/.test(num)) return m;
      changed = true;
      return targetVolt + ' ' + (unit.trim().toLowerCase() === 'volt' ? 'Volt' : 'V');
    });

  return { result, changed };
}

function setSpannungInHtml(html: string, targetVolt: string): { result: string; changed: boolean } {
  if (!html || !targetVolt) return { result: html, changed: false };
  const spannungRegex = /(<(?:td|th)[^>]*>\s*(?:Nenn)?[Ss]pann(?:ung|ing)(?:\s*V)?\s*<\/(?:td|th)>\s*<(?:td|th)[^>]*>)([^<]*)(< *\/(?:td|th)>)/gi;
  let changed = false;
  let result = html.replace(spannungRegex, (_match, before, value, after) => {
    const currentVal = value.trim();
    const expectedWithUnit = targetVolt + ' V';
    if (currentVal === expectedWithUnit || currentVal === targetVolt) {
      return before + value + after;
    }
    changed = true;
    const suffix = currentVal.endsWith(' V') ? ' V' : (currentVal.endsWith('V') ? 'V' : ' V');
    return before + targetVolt + suffix + after;
  });

  const hasSpannungRow = /(?:Nenn)?[Ss]pann(?:ung|ing)(?:\s*V)?/.test(html);
  if (!changed && !hasSpannungRow) {
    const tbodyInsert = result.replace(/(<tbody[^>]*>)/, `$1<tr><th class="thlabel"> Spannung V</th><td class="data"> ${targetVolt} V</td></tr>`);
    if (tbodyInsert !== result) {
      result = tbodyInsert;
      changed = true;
    } else {
      const trInsert = result.replace(/(<table[^>]*>[\s\S]*?)(<tr\b)/, `$1<tr><th class="thlabel"> Spannung V</th><td class="data"> ${targetVolt} V</td></tr>$2`);
      if (trInsert !== result) {
        result = trInsert;
        changed = true;
      }
    }
  }
  return { result, changed };
}

function extractTableRowValues(html: string): string[] {
  const values: string[] = [];
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)];
    if (cells.length >= 2) {
      values.push(cells[cells.length - 1][1]);
    }
  }
  return values;
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
        if (content !== deValue) {
          changed = true;
          return `<${tag}${attrs}>${deValue}</${tag}>`;
        }
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

function cleanEmptyTableRows(html: string): { result: string; changed: boolean } {
  if (!html) return { result: html, changed: false };
  let changed = false;
  const result = html.replace(/<tr[^>]*>[\s\S]*?<\/tr>/gi, (row) => {
    const cellMatches = [...row.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)];
    if (cellMatches.length === 0) return row;
    const rawValue = cellMatches[cellMatches.length - 1][1];
    const val = rawValue.replace(/<[^>]+>/g, '').trim();
    if (val === '' || val === '-' || /^0+([.,]0+)?$/.test(val)) {
      changed = true;
      return '';
    }
    return row;
  });
  return { result, changed };
}

function ensureDeliveryAtEnd(html: string): string {
  if (!html) return html;
  const blockRegex = /(<h[23][^>]*>[^<]*(?:Lieferumfang|Leveringsomvang|Inhoud leveringspakket|In de doos)[^<]*<\/h[23]>[\s\S]*?)(?=<h[23]\b|$)/i;
  const match = html.match(blockRegex);
  if (!match) return html;
  const block = match[1].trimEnd();
  const trimmedHtml = html.trimEnd();
  if (trimmedHtml.endsWith(block)) return html;
  const withoutBlock = html.replace(block, '').replace(/\s{2,}/g, '\n').trim();
  return withoutBlock + '\n' + block;
}

function extractProtectedVoltCells(html: string): Map<string, string> {
  const saved = new Map<string, string>();
  if (!html) return saved;
  const protectedLabel = /(?:eingangs|ausgangs)(?:spannung|spanning)/i;
  for (const row of [...html.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)].map(m => m[0])) {
    const cells = [...row.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)];
    if (cells.length < 2) continue;
    const label = cells[0][1].replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (protectedLabel.test(label)) {
      saved.set(label, cells[cells.length - 1][1]);
    }
  }
  return saved;
}

function restoreProtectedVoltCells(html: string, saved: Map<string, string>): string {
  if (!html || saved.size === 0) return html;
  const protectedLabel = /(?:eingangs|ausgangs)(?:spannung|spanning)/i;
  return html.replace(/<tr[^>]*>[\s\S]*?<\/tr>/gi, (row) => {
    const cells = [...row.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)];
    if (cells.length < 2) return row;
    const label = cells[0][1].replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (!protectedLabel.test(label)) return row;
    const savedValue = saved.get(label);
    if (savedValue === undefined) return row;
    const currentValue = cells[cells.length - 1][1];
    if (currentValue === savedValue) return row;
    let cellIdx = 0;
    const totalCells = (row.match(/<(?:td|th)[^>]*/gi) || []).length;
    return row.replace(/<(td|th)([^>]*)>([\s\S]*?)<\/(?:td|th)>/gi, (m, tag, attrs) => {
      cellIdx++;
      if (cellIdx === totalCells) return `<${tag}${attrs}>${savedValue}</${tag}>`;
      return m;
    });
  });
}

function sortVoltageTableRows(html: string): { result: string; changed: boolean } {
  if (!html) return { result: html, changed: false };
  const voltPriority = (rowHtml: string): number => {
    const labelCell = rowHtml.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/i);
    if (!labelCell) return 99;
    const label = labelCell[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (/^(?:nenn)?spann(?:ung|ing)/.test(label)) return 0;
    if (/eingangs(?:spannung|spanning)/.test(label)) return 1;
    if (/ausgangs(?:spannung|spanning)/.test(label)) return 2;
    return 99;
  };
  let changed = false;
  const result = html.replace(/(<table[^>]*>)([\s\S]*?)(<\/table>)/gi, (_tableMatch, open, body, close) => {
    const rowPattern = /(<tr[^>]*>[\s\S]*?<\/tr>)/gi;
    const allRows = [...body.matchAll(rowPattern)].map((m: RegExpMatchArray) => m[1]);
    if (allRows.length === 0) return _tableMatch;
    const mainIdx = allRows.findIndex((r: string) => voltPriority(r) === 0);
    const subRows = allRows
      .map((r: string, i: number) => ({ r, i, p: voltPriority(r) }))
      .filter(({ p }: { p: number }) => p === 1 || p === 2);
    if (mainIdx === -1 || subRows.length === 0) return _tableMatch;
    const alreadyCorrect = subRows
      .sort((a: any, b: any) => a.p - b.p)
      .every(({ i }: { i: number }, offset: number) => i === mainIdx + 1 + offset);
    if (alreadyCorrect) return _tableMatch;
    changed = true;
    const subIndices = new Set(subRows.map(({ i }: { i: number }) => i));
    const sortedSubs = subRows.sort((a: any, b: any) => a.p - b.p).map(({ r }: { r: string }) => r);
    const newRows: string[] = [];
    allRows.forEach((row: string, i: number) => {
      if (subIndices.has(i)) return;
      newRows.push(row);
      if (i === mainIdx) newRows.push(...sortedSubs);
    });
    return open + newRows.join('') + close;
  });
  return { result, changed };
}

function convertNlTechSpecToTable(html: string): { result: string; changed: boolean } {
  if (!html) return { result: html, changed: false };
  const pattern = /<strong>\s*Technische\s+specificaties\s*:?\s*<\/strong>\s*(<ul>[\s\S]*?<\/ul>)/i;
  const match = html.match(pattern);
  if (!match) return { result: html, changed: false };
  const ulContent = match[1];
  const liMatches = [...ulContent.matchAll(/<li>([\s\S]*?)<\/li>/gi)];
  const rows: string[] = [];
  for (const li of liMatches) {
    const text = li[1].replace(/<[^>]+>/g, '').trim();
    const colonIdx = text.indexOf(':');
    if (colonIdx > 0) {
      const label = text.substring(0, colonIdx).trim();
      const value = text.substring(colonIdx + 1).trim();
      rows.push(`<tr><th class="thlabel"> ${label}</th><td class="data"> ${value}</td></tr>`);
    }
  }
  if (rows.length === 0) return { result: html, changed: false };
  const table = `<table style="width: auto; border-collapse: collapse;"><tbody>${rows.join('')}</tbody></table>`;
  const replacement = `<h2>Technische specificaties</h2>${table}`;
  const result = html.replace(pattern, replacement);
  return { result, changed: result !== html };
}

function removeExtraInformatie(html: string): { result: string; changed: boolean } {
  if (!html) return { result: html, changed: false };
  const result = html.replace(/<h2[^>]*>\s*extra\s+informatie\s*<\/h2>\s*<table[\s\S]*?<\/table>/gi, '').trimEnd();
  return { result, changed: result !== html };
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

function toPlainText(html: string, max = 120): string {
  if (!html) return '';
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > max ? plain.slice(0, max) + '…' : plain;
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

function yieldThread(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

export async function runAttributEngine(
  csvText: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<AttrEngineResult> {
  const report = (pct: number, label: string) => onProgress?.(pct, label);

  report(5, 'CSV wird geparst…');
  await yieldThread();

  const parsed = Papa.parse(csvText, {
    delimiter: ';',
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error('CSV konnte nicht geparst werden: ' + (parsed.errors[0]?.message ?? ''));
  }

  const headers = parsed.meta.fields || [];
  const rawData = (parsed.data as Record<string, string>[])
    .filter(row => Object.values(row).some(v => typeof v === 'string' && v.trim() !== ''));

  report(10, 'Zeichen werden repariert…');
  await yieldThread();

  const rows: Record<string, string>[] = [];
  for (let i = 0; i < rawData.length; i++) {
    if (signal?.aborted) throw new Error('Abgebrochen');
    const fixed: Record<string, string> = {};
    for (const key of Object.keys(rawData[i])) {
      fixed[key] = repairMojibake(rawData[i][key]);
    }
    rows.push(fixed);
    if (i % 5000 === 0 && i > 0) {
      report(10 + Math.round(5 * i / rawData.length), `${i.toLocaleString('de-DE')} Zeilen repariert…`);
      await yieldThread();
    }
  }

  report(15, 'Volt-Werte werden korrigiert…');

  let voltChanged = 0, voltSkipped = 0, voltSkippedNonElectronic = 0, voltExtracted = 0;
  const fixedRows: Record<string, string>[] = [];
  const changedCols: string[][] = [];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    if (signal?.aborted) throw new Error('Abgebrochen');

    if (rowIdx > 0 && rowIdx % 3000 === 0) {
      report(15 + Math.round(70 * rowIdx / rows.length), `${rowIdx.toLocaleString('de-DE')} / ${rows.length.toLocaleString('de-DE')} Zeilen`);
      await yieldThread();
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
    } else if (!voltVal) {
      let extracted: string | null = null;

      for (const col of NAME_COLS) {
        if (!headers.includes(col)) continue;
        const nameVal = row[col];
        if (!nameVal) continue;
        const found = extractVoltFromName(nameVal);
        if (found) { extracted = found; break; }
      }

      if (!extracted) {
        for (const col of DESC_COLS) {
          if (!headers.includes(col)) continue;
          const descVal = row[col];
          if (!descVal) continue;
          const found = extractVoltFromTable(descVal);
          if (found) { extracted = found; break; }
        }
      }

      if (!extracted) {
        for (const col of DESC_COLS) {
          if (!headers.includes(col)) continue;
          const descVal = row[col];
          if (!descVal) continue;
          const found = extractVoltFromBodyText(descVal);
          if (found) { extracted = found; break; }
        }
      }

      if (!extracted) {
        for (const col of DESC_COLS) {
          if (!headers.includes(col)) continue;
          const descVal = row[col];
          if (!descVal) continue;
          const found = extractVoltFromEinAusgang(descVal);
          if (found) { extracted = found; break; }
        }
      }

      if (extracted) {
        newRow[VOLT_COL] = extracted;
        changed.push(VOLT_COL);
        voltExtracted++;
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

    if (changed.includes(VOLT_COL)) {
      const finalVolt = (newRow[VOLT_COL] ?? '').trim();
      const targetVolt = finalVolt;
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

    fixedRows.push(newRow);
    changedCols.push(changed);
  }

  report(88, 'Beschreibungen werden bereinigt…');
  await yieldThread();

  for (let i = 0; i < fixedRows.length; i++) {
    if (signal?.aborted) throw new Error('Abgebrochen');
    if (i % 5000 === 0 && i > 0) await yieldThread();
    const row = fixedRows[i];
    const ch = changedCols[i];

    for (const descCol of DESC_COLS) {
      if (!row[descCol]) continue;

      const { result: cleaned, changed: cleanChanged } = cleanEmptyTableRows(row[descCol]);
      if (cleanChanged) { row[descCol] = cleaned; if (!ch.includes(descCol)) ch.push(descCol); }

      const { result: stripped, changed: stripChanged } = stripDecimalZeroInDesc(row[descCol]);
      if (stripChanged) { row[descCol] = stripped; if (!ch.includes(descCol)) ch.push(descCol); }

      if (descCol === 'p_description[nl]') {
        const { result: converted, changed: convChanged } = convertNlTechSpecToTable(row[descCol]);
        if (convChanged) { row[descCol] = converted; if (!ch.includes(descCol)) ch.push(descCol); }

        const { result: noExtra, changed: extraChanged } = removeExtraInformatie(row[descCol]);
        if (extraChanged) { row[descCol] = noExtra; if (!ch.includes(descCol)) ch.push(descCol); }
      }

      row[descCol] = ensureDeliveryAtEnd(row[descCol]);
    }
  }

  report(92, 'Vorschau wird erstellt…');
  await yieldThread();

  const ITEM_NR_COLS = ['p_item_number', 'v_item_number'];
  const previewItems: PreviewItem[] = [];
  for (let i = 0; i < fixedRows.length; i++) {
    if (i % 5000 === 0 && i > 0) await yieldThread();
    const ch = changedCols[i] ?? [];
    const orig = rows[i];
    const row = fixedRows[i];
    const itemNr = ITEM_NR_COLS.map(c => row[c]).find(v => v) || '';
    previewItems.push({
      index: i,
      pId: row['p_id'] ?? '',
      itemNr,
      voltOrig: (orig[VOLT_COL] ?? '').trim().split(/\s+/)[0] ?? '',
      voltNew: row[VOLT_COL] ?? '',
      nameDEOrig: orig['p_name[de]'] ?? '',
      nameDE: row['p_name[de]'] ?? '',
      nameNLOrig: orig['p_name[nl]'] ?? '',
      nameNL: row['p_name[nl]'] ?? '',
      descDE: toPlainText(row['p_description[de]'] ?? ''),
      descDEChanged: ch.includes('p_description[de]'),
      descNL: toPlainText(row['p_description[nl]'] ?? ''),
      descNLChanged: ch.includes('p_description[nl]'),
      hasHtml: /<[a-z]/i.test(row['p_description[de]'] ?? ''),
      changed: ch,
    });
  }

  report(95, 'CSV wird exportiert…');
  await yieldThread();

  const csvRows = fixedRows.map(row => {
    const r = { ...row };
    for (const key of Object.keys(r)) {
      if (r[key] && !HTML_EXPORT_COLS.has(key)) {
        r[key] = r[key].replace(/\r?\n|\r/g, ' ').replace(/  +/g, ' ').trim();
      }
    }
    return r;
  });

  const csvRowsClean = csvRows.filter(row => isValidPItemNr(row));
  if (!headers.length || !csvRowsClean.length) {
    throw new Error('CSV enthält keine gültigen Zeilen nach Filterung');
  }

  const csvOut = Papa.unparse(csvRowsClean, { delimiter: ';', columns: headers });
  const csvBlob = new Blob(['\uFEFF' + csvOut], { type: 'text/csv;charset=utf-8' });

  const dreiSpannungCount = fixedRows
    .filter(row => hasDreiSpannung(row['p_description[de]'] || ''))
    .length;

  const htmlCorrectedCount = fixedRows.filter((row, i) => {
    const ch = changedCols[i] ?? [];
    return ch.length > 0 && /<[a-z]/i.test(row['p_description[de]'] ?? '');
  }).length;

  const stats: AttrEngineStats = {
    total: rows.length,
    voltChanged,
    voltSkipped,
    voltSkippedNonElectronic,
    voltExtracted,
    dreiSpannungCount,
    htmlCorrectedCount,
  };

  report(100, 'Fertig!');

  return { csvBlob, stats, previewItems, headers };
}
