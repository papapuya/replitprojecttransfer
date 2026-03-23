import { Router, Request, Response } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import crypto from 'crypto';
import { deeplService } from '../services/deepl-service';

/** Gibt die Textlänge eines HTML-Strings zurück (ohne Tags) */
function htmlTextLength(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
}

/**
 * Verschiebt den Lieferumfang-Abschnitt ans Ende des HTML.
 * Sucht nach <h2>Lieferumfang / Leveringsomvang o.ä. und verschiebt Block dahinter.
 */
function ensureDeliveryAtEnd(html: string): string {
  if (!html) return html;
  // Überschrift-Pattern (DE: Lieferumfang, NL: Leveringsomvang/Inhoud leveringspakket)
  const headingPattern = /Lieferumfang|Leveringsomvang|Inhoud leveringspakket|In de doos/i;
  // Block extrahieren: Heading (h2/h3) + alles bis zum nächsten h2/h3 oder Ende
  const blockRegex = /(<h[23][^>]*>[^<]*(?:Lieferumfang|Leveringsomvang|Inhoud leveringspakket|In de doos)[^<]*<\/h[23]>[\s\S]*?)(?=<h[23]\b|$)/i;
  const match = html.match(blockRegex);
  if (!match) return html;
  const block = match[1].trimEnd();
  // Prüfe ob der Block bereits am Ende steht (nach Bereinigung)
  const trimmedHtml = html.trimEnd();
  if (trimmedHtml.endsWith(block)) return html; // bereits am Ende
  // Entferne Block aus aktueller Position und hänge ihn ans Ende
  const withoutBlock = html.replace(block, '').replace(/\s{2,}/g, '\n').trim();
  return withoutBlock + '\n' + block;
}

async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } }); // 1 GB

const VOLT_COL = 'p_attributes[akku_v][de]';
const DESC_COLS = ['p_description[de]', 'p_description[nl]'];
const NAME_COLS = ['p_name[de]', 'p_name[nl]'];

// Temporärer Speicher für verarbeitete Ergebnisse (max 30 Minuten)
// Speichert die Zellwerte von Eingangs-/Ausgangsspannung-Zeilen aus dem Originaltext.
// Schlüssel = bereinigtes Label (lowercase), Wert = vollständiger HTML-Inhalt der Wertezelle.
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

// Stellt die gespeicherten Zellwerte für Eingangs-/Ausgangsspannung-Zeilen wieder her.
// Verhindert, dass Volt-Korrekturen die Original-Werte dieser Zeilen überschreiben.
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
    // Letzten Zellinhalt wiederherstellen
    let cellIdx = 0;
    const totalCells = (row.match(/<(?:td|th)[^>]*/gi) || []).length;
    return row.replace(/<(td|th)([^>]*)>([\s\S]*?)<\/(?:td|th)>/gi, (m, tag, attrs) => {
      cellIdx++;
      if (cellIdx === totalCells) return `<${tag}${attrs}>${savedValue}</${tag}>`;
      return m;
    });
  });
}

// Erkennt ob eine HTML-Beschreibung alle drei Spannungstypen enthält:
// Spannung (ohne Eingangs-/Ausgangs-Präfix), Eingangsspannung UND Ausgangsspannung.
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

const jobStore = new Map<string, {
  csvBuffer: Buffer;
  ohneBeschreibungBuffer: Buffer | null;
  ohneBeschreibungCount: number;
  fileName: string;
  expires: number;
  fixedRows: Record<string, string>[];
  dreiSpannungIndices: number[];
  originalRows: Record<string, string>[];
  headers: string[];
  changedCols: string[][];
  restoreEmoji: boolean;
}>();

// Fortschritts-Speicher für laufende Jobs
const progressStore = new Map<string, {
  step: string;
  stepLabel: string;
  percent: number;
  detail: string;
  expires: number;
}>();

// Aufräumen alter Jobs
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobStore) {
    if (job.expires < now) jobStore.delete(id);
  }
  for (const [id, p] of progressStore) {
    if (p.expires < now) progressStore.delete(id);
  }
}, 5 * 60 * 1000);

// Spalten-Format: Dezimalwerte mit Punkt (1.6, 3.7). Komma-Werte werden in Punkt umgewandelt.
// Zahlen ohne Dezimalzeichen: Punkt nach korrekter Stelle einfügen (385→3.85, 36→3.6).
// Ganzzahlen (single digit oder bereits gültig) bleiben unverändert.
function fixVolt(val: string): { fixed: string; changed: boolean } {
  const trimmed = val.trim();
  if (!trimmed) return { fixed: trimmed, changed: false };
  // Bereits Punkt → unverändert (korrekte Spaltenformat)
  if (trimmed.includes('.')) return { fixed: trimmed, changed: false };
  // Komma → in Punkt umwandeln (1,6 → 1.6, 3,7 → 3.7)
  if (trimmed.includes(',')) {
    const fixed = trimmed.replace(',', '.');
    return { fixed, changed: true };
  }
  if (!/^\d+$/.test(trimmed)) return { fixed: trimmed, changed: false };
  if (trimmed.length === 1) return { fixed: trimmed, changed: false };
  // Ganzzahlen 10–24 → gültige Volt-Werte (19V Notebook, 12V Auto, 20V Laptop, 24V Netzteil)
  const intVal = parseInt(trimmed, 10);
  if (intVal >= 10 && intVal <= 24) return { fixed: trimmed, changed: false };
  // 3-stellige Zahlen: wenn erste zwei Ziffern 10–24 → XX.Y (z.B. 111→11.1, 144→14.4)
  if (trimmed.length === 3) {
    const firstTwo = parseInt(trimmed.slice(0, 2), 10);
    if (firstTwo >= 10 && firstTwo <= 24) {
      return { fixed: trimmed.slice(0, 2) + '.' + trimmed[2], changed: true };
    }
  }
  // Standard: Punkt nach erster Stelle (z.B. 385→3.85, 48→4.8, 36→3.6)
  return { fixed: trimmed[0] + '.' + trimmed.slice(1), changed: true };
}

// Ersetzt Volt-Wert in Produktnamen (Plaintext).
// oldVolt/newVolt sind im Spaltenformat (Punkt: 3.7). Im Text wird Kommaformat verwendet (3,7 V).
function replaceSpannungInName(text: string, oldVolt: string, newVolt: string): { result: string; changed: boolean } {
  if (!text || !oldVolt || !newVolt) return { result: text, changed: false };
  const displayOld = oldVolt.replace('.', ',');
  const displayNew = newVolt.replace('.', ',');
  if (displayOld === displayNew) return { result: text, changed: false };
  const escaped = displayOld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}(\\s*V(?:olt)?)\\b`, 'g');
  let changed = false;
  const result = text.replace(regex, (_match, suffix) => {
    changed = true;
    return displayNew + suffix;
  });
  return { result, changed };
}

// Synchronisiert JEDE Volt-Angabe im Namen auf den Zielwert.
// targetVolt ist im Spaltenformat (Punkt: 3.7), im Text wird Kommaformat verwendet (3,7 V).
function syncVoltInName(text: string, targetVolt: string): { result: string; changed: boolean } {
  if (!text || !targetVolt) return { result: text, changed: false };
  // Anzeigeformat: Spalte nutzt Punkt (3.7), Text nutzt Komma (3,7)
  const displayVolt = targetVolt.replace('.', ',');
  let changed = false;
  let result = text;
  if (targetVolt.includes('-') || targetVolt.includes('/')) {
    result = text.replace(/\b(\d+(?:[,.]?\d+)?[-\/]\d+(?:[,.]?\d+)?)\s*(V(?:olt)?)\b/gi, (_match, range, _unit) => {
      const normalized = range + ' V';
      if (normalized === _match.trim()) return _match;
      changed = true;
      return normalized;
    });
  } else {
    result = text.replace(/\b(\d+(?:[,\.]\d+)?)(\s*V(?:olt)?)\b/gi, (_match, num, suffix) => {
      // Vergleich im Anzeigeformat (Komma)
      const normNum = num.replace('.', ',');
      if (normNum === displayVolt) return _match;
      changed = true;
      return displayVolt + suffix;
    });
  }
  return { result, changed };
}

// Extrahiert Volt-Wert aus Produktnamen.
// Erkennt auch Bereichsangaben: "100-240V" → "100-240", "12/24 Volt" → "12/24"
// Einfache Werte: "3,85V" → "3,85", "385V" → "3,85"
function extractVoltFromName(name: string): string | null {
  if (!name) return null;
  // Bereichs-Muster zuerst (X-YV oder X/YV, z.B. 100-240V, 12/24 Volt)
  const rangeMatch = name.match(/\b(\d+(?:[,.]\d+)?[-\/]\d+(?:[,.]\d+)?)\s*V(?:olt)?\b/i);
  if (rangeMatch) return normalizeExtractedVolt(rangeMatch[1]);
  // Einfacher Wert (z.B. 3,7 V, 19V, 24 Volt)
  const simpleMatch = name.match(/\b(\d+(?:[,.]\d+)?)\s*V(?:olt)?\b/i);
  if (!simpleMatch) return null;
  return normalizeExtractedVolt(simpleMatch[1]);
}

// Synchronisiert alle Volt-Werte im Fließtext einer HTML-Beschreibung auf den Zielwert.
// targetVolt ist im Spaltenformat (Punkt: 3.7), im Text wird Kommaformat verwendet (3,7 V).
// Eingangs- und Ausgangsspannung-Tabellenzeilen werden NICHT verändert.
// Bereichswerte (100-240V) werden nicht angefasst.
function syncVoltInHtmlText(html: string, targetVolt: string): { result: string; changed: boolean } {
  if (!html || !targetVolt || targetVolt.includes('-') || targetVolt.includes('/')) {
    return { result: html, changed: false };
  }
  // Anzeigeformat: Spalte nutzt Punkt (3.7), Text nutzt Komma (3,7)
  const displayVolt = targetVolt.replace('.', ',');
  const protectedLabel = /(?:eingangs|ausgangs)(?:spannung|spanning)/i;
  let changed = false;

  // Ersetzt Volt-Werte in Textknoten (HTML-Tags überspringen)
  const replaceVoltInTextNodes = (s: string): string =>
    s.replace(/(<[^>]*>)|(\b(\d+(?:[,.]\d+)?)\s*(V(?:olt)?)\b)/gi,
      (m, tag, _f, num, unit) => {
        if (tag !== undefined) return tag;
        if (!num || !unit) return m;
        const norm = num.replace('.', ',');
        if (norm === displayVolt || /[-\/]/.test(num)) return m;
        changed = true;
        return displayVolt + ' ' + (unit.trim().toLowerCase() === 'volt' ? 'Volt' : 'V');
      });

  // Schritt 1: Tabellen-Zeilen einzeln verarbeiten – Eingangs-/Ausgangsspannung schützen
  let result = html.replace(/(<table[^>]*>[\s\S]*?<\/table>)/gi, (tableBlock) =>
    tableBlock.replace(/(<tr\b[^>]*>[\s\S]*?<\/tr>)/gi, (trBlock) => {
      const labelCell = trBlock.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/i);
      if (labelCell && protectedLabel.test(labelCell[1].replace(/<[^>]+>/g, ''))) {
        return trBlock; // geschützte Zeile → unverändert
      }
      return replaceVoltInTextNodes(trBlock);
    })
  );

  // Schritt 2: Fließtext außerhalb von Tabellen synchronisieren
  result = result.replace(/(<table[^>]*>[\s\S]*?<\/table>)|(<[^>]*>)|(\b(\d+(?:[,.]\d+)?)\s*(V(?:olt)?)\b)/gi,
    (m, table, tag, _f, num, unit) => {
      if (table !== undefined) return table; // Tabelle bereits verarbeitet
      if (tag !== undefined) return tag;
      if (!num || !unit) return m;
      const norm = num.replace('.', ',');
      if (norm === displayVolt || /[-\/]/.test(num)) return m;
      changed = true;
      return displayVolt + ' ' + (unit.trim().toLowerCase() === 'volt' ? 'Volt' : 'V');
    });

  return { result, changed };
}

// Normalisiert einen aus Text extrahierten Volt-Wert für die p_attributes[akku_v][de]-Spalte.
// Spaltenformat: Dezimalwert mit Punkt (1.6, 3.7). Komma wird durch Punkt ersetzt.
// Ganze Zahlen bleiben unverändert (19 → 19, 24 → 24).
function normalizeExtractedVolt(raw: string): string {
  if (!raw) return raw;
  // Bereichswert (z.B. "100-240", "12/24") → unverändert
  if (/[-\/]/.test(raw)) return raw;
  // Dezimalwert: Komma durch Punkt ersetzen (3,7 → 3.7, 1,6 → 1.6)
  if (raw.includes(',')) return raw.replace(',', '.');
  // Bereits Punkt oder Ganzzahl → unverändert
  return raw;
}

// Gruppiert Spannung-Zeilen in der technischen Tabelle:
// Eingangsspannung und Ausgangsspannung werden direkt unter Spannung/Nennspannung platziert.
// Reihenfolge: Spannung → Eingangsspannung → Ausgangsspannung
// Falls keine Hauptspannung vorhanden, bleiben die Zeilen unverändert.
function sortVoltageTableRows(html: string): { result: string; changed: boolean } {
  if (!html) return { result: html, changed: false };

  const voltPriority = (rowHtml: string): number => {
    const labelCell = rowHtml.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/i);
    if (!labelCell) return 99;
    const label = labelCell[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (/^(?:nenn)?spann(?:ung|ing)/.test(label)) return 0;    // Spannung / Nennspannung
    if (/eingangs(?:spannung|spanning)/.test(label)) return 1; // Eingangsspannung
    if (/ausgangs(?:spannung|spanning)/.test(label)) return 2; // Ausgangsspannung
    return 99;
  };

  let changed = false;
  const result = html.replace(/(<table[^>]*>)([\s\S]*?)(<\/table>)/gi, (_tableMatch, open, body, close) => {
    const rowPattern = /(<tr[^>]*>[\s\S]*?<\/tr>)/gi;
    const allRows = [...body.matchAll(rowPattern)].map(m => m[1]);
    if (allRows.length === 0) return _tableMatch;

    // Spannung-Zeilen identifizieren (Priorität < 99)
    const mainIdx = allRows.findIndex(r => voltPriority(r) === 0);  // Spannung
    const subRows = allRows
      .map((r, i) => ({ r, i, p: voltPriority(r) }))
      .filter(({ p }) => p === 1 || p === 2); // Eingangs- / Ausgangsspannung

    if (mainIdx === -1 || subRows.length === 0) return _tableMatch; // Nichts zu verschieben

    // Prüfen ob bereits korrekt: subRows direkt nach mainIdx, in richtiger Reihenfolge
    const alreadyCorrect = subRows
      .sort((a, b) => a.p - b.p)
      .every(({ i }, offset) => i === mainIdx + 1 + offset);
    if (alreadyCorrect) return _tableMatch;

    changed = true;

    // Neue Zeilenfolge: alle Zeilen außer subRows behalten, nach mainIdx die subRows einfügen
    const subIndices = new Set(subRows.map(({ i }) => i));
    const sortedSubs = subRows.sort((a, b) => a.p - b.p).map(({ r }) => r);
    const newRows: string[] = [];
    allRows.forEach((row, i) => {
      if (subIndices.has(i)) return; // subRows werden weggelassen und unten neu eingefügt
      newRows.push(row);
      if (i === mainIdx) newRows.push(...sortedSubs); // direkt nach Spannung einfügen
    });

    return open + newRows.join('') + close;
  });
  return { result, changed };
}

// Extrahiert den Volt-Wert aus einem HTML-Beschreibungstext (HTML-Tags werden ignoriert).
function extractVoltFromDesc(html: string): string | null {
  if (!html) return null;
  // HTML-Tags entfernen → Plaintext
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ');
  // Bereichs-Muster zuerst (z.B. 100-240V, 12/24 Volt)
  const rangeMatch = text.match(/\b(\d+(?:[,.]\d+)?[-\/]\d+(?:[,.]\d+)?)\s*V(?:olt)?\b/i);
  if (rangeMatch) return normalizeExtractedVolt(rangeMatch[1]);
  // Einfacher Wert (z.B. 3,7 V, 3.7V, 19 Volt, 24V)
  const simpleMatch = text.match(/\b(\d+(?:[,.]\d+)?)\s*V(?:olt)?\b/i);
  if (!simpleMatch) return null;
  return normalizeExtractedVolt(simpleMatch[1]);
}

// Setzt den Spannung/Nennspannung-Wert in der HTML-Tabelle immer auf den korrekten Volt-Wert.
// Erkennt DE ("Spannung", "Nennspannung") und NL ("Spanning", "Nennspanning").
// Falls keine Spannung-Zeile vorhanden ist aber eine Tabelle existiert, wird eine neue Zeile eingefügt.
function setSpannungInHtml(html: string, targetVolt: string): { result: string; changed: boolean } {
  if (!html || !targetVolt) return { result: html, changed: false };

  // Anzeigeformat: Spalte nutzt Punkt (3.7), HTML nutzt Komma (3,7 V)
  const displayVolt = targetVolt.replace('.', ',');

  // Spannung-Zeilen: DE (Spannung/Nennspannung) + NL (Spanning/Nennspanning)
  const spannungRegex = /(<(?:td|th)[^>]*>\s*(?:Nenn)?[Ss]pann(?:ung|ing)(?:\s*V)?\s*<\/(?:td|th)>\s*<(?:td|th)[^>]*>)([^<]*)(< *\/(?:td|th)>)/gi;
  let changed = false;
  let result = html.replace(spannungRegex, (_match, before, value, after) => {
    const currentVal = value.trim();
    const expectedWithUnit = displayVolt + ' V';
    if (currentVal === expectedWithUnit || currentVal === displayVolt) {
      return before + value + after;
    }
    changed = true;
    const suffix = currentVal.endsWith(' V') ? ' V' : (currentVal.endsWith('V') ? 'V' : ' V');
    return before + displayVolt + suffix + after;
  });

  // Falls keine Spannung-Zeile gefunden wurde aber eine Tabelle existiert → Zeile einfügen
  const hasSpannungRow = /(?:Nenn)?[Ss]pann(?:ung|ing)(?:\s*V)?/.test(html);
  if (!changed && !hasSpannungRow) {
    const tbodyInsert = result.replace(/(<tbody[^>]*>)/, `$1<tr><th class="thlabel"> Spannung V</th><td class="data"> ${displayVolt} V</td></tr>`);
    if (tbodyInsert !== result) {
      result = tbodyInsert;
      changed = true;
    } else {
      const trInsert = result.replace(/(<table[^>]*>[\s\S]*?)(<tr\b)/, `$1<tr><th class="thlabel"> Spannung V</th><td class="data"> ${displayVolt} V</td></tr>$2`);
      if (trInsert !== result) {
        result = trInsert;
        changed = true;
      }
    }
  }

  return { result, changed };
}

// Entfernt alle CSS-Styles, class-Attribute und andere Styling-Attribute aus HTML-Tags.
// Erlaubt sind nur strukturelle Attribute: class auf Tabellen-Tags (thlabel, data), href, src.
// Entfernt: style="...", class="...", align, bgcolor, border, cellpadding, cellspacing, color, font, span-Elemente mit nur style.
function stripHtmlStyles(html: string): { result: string; changed: boolean } {
  if (!html) return { result: html, changed: false };
  let result = html;

  // Entferne style="..." Attribute aus allen Tags
  result = result.replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Entferne class="..." aus allen Tags AUSSER strukturellen Tabellen-Klassen (thlabel, data)
  result = result.replace(/\s+class\s*=\s*"([^"]*)"/gi, (_match, cls) => {
    const keep = cls.split(/\s+/).filter((c: string) => /^(thlabel|data)$/.test(c));
    return keep.length > 0 ? ` class="${keep.join(' ')}"` : '';
  });
  result = result.replace(/\s+class\s*=\s*'([^']*)'/gi, (_match, cls) => {
    const keep = cls.split(/\s+/).filter((c: string) => /^(thlabel|data)$/.test(c));
    return keep.length > 0 ? ` class="${keep.join(' ')}"` : '';
  });

  // Entferne layout-Attribute auf Block-Elementen
  result = result.replace(/\s+(?:align|bgcolor|border|cellpadding|cellspacing|color|width|height|valign)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Ersetze <span>-Tags ohne Attribute durch ihren Inhalt (leere Spans entfernen)
  result = result.replace(/<span>\s*<\/span>/gi, '');
  // Entferne <span>-Wrapper die nur noch leere Attribute haben: <span > oder <span>
  result = result.replace(/<span\s*>/gi, '<span>');

  const changed = result !== html;
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

// Entfernt Tabellenzeilen deren Wert leer, '-', nur Nullen (z.B. '0000') oder reines Whitespace ist.
// Gilt für alle Beschreibungen (DE + NL), betrifft in der Praxis v.a. NL-Tabellen mit Leereinträgen.
function cleanEmptyTableRows(html: string): { result: string; changed: boolean } {
  if (!html) return { result: html, changed: false };
  let changed = false;
  // Matche einzelne <tr>...</tr> (auch über mehrere Zeilen)
  const result = html.replace(/<tr[^>]*>[\s\S]*?<\/tr>/gi, (row) => {
    // Alle Zellen im <tr> extrahieren
    const cellMatches = [...row.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)];
    if (cellMatches.length === 0) return row;
    // Letzter Zellinhalt ist der Wert (erster ist das Label)
    const rawValue = cellMatches[cellMatches.length - 1][1];
    // HTML-Tags entfernen und trimmen für die Prüfung
    const val = rawValue.replace(/<[^>]+>/g, '').trim();
    // Leer, '-', nur Nullen (0, 00, 0000, 0.0, 0.000, 0,000, ...) → Zeile löschen
    if (val === '' || val === '-' || /^0+([.,]0+)?$/.test(val)) {
      changed = true;
      return '';
    }
    return row;
  });
  return { result, changed };
}

// Extrahiert die Werte (zweite Zelle) aller <tr>-Zeilen aus einer HTML-Tabelle.
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

// Synchronisiert die Werte der NL-Tabelle mit den Werten der DE-Tabelle (zeilenweise nach Position).
// NL-Labels (niederländisch) bleiben erhalten, nur die Werte werden aus DE übernommen.
function syncTableValuesFromDe(deHtml: string, nlHtml: string): { result: string; changed: boolean } {
  if (!deHtml || !nlHtml) return { result: nlHtml, changed: false };
  const deValues = extractTableRowValues(deHtml);
  if (deValues.length === 0) return { result: nlHtml, changed: false };

  let rowIndex = 0;
  let changed = false;
  const result = nlHtml.replace(/<tr[^>]*>[\s\S]*?<\/tr>/gi, (row) => {
    if (rowIndex >= deValues.length) return row; // mehr NL-Zeilen als DE → unverändert
    const deValue = deValues[rowIndex++];
    // Ersetze den Inhalt der letzten Zelle durch den DE-Wert
    let cellCount = 0;
    const totalCells = (row.match(/<(?:td|th)[^>]*/gi) || []).length;
    const newRow = row.replace(/<(td|th)([^>]*)>([\s\S]*?)<\/(?:td|th)>/gi, (cellMatch, tag, attrs, content) => {
      cellCount++;
      if (cellCount === totalCells) {
        // Letzte Zelle → DE-Wert einsetzen
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

// Konvertiert "<strong>Technische specificaties:</strong><ul><li>Key: Value</li>...</ul>"
// in eine echte <table> (gleiche Struktur wie DE-Tabelle).
function convertNlTechSpecToTable(html: string): { result: string; changed: boolean } {
  if (!html) return { result: html, changed: false };
  // Match: <strong>Technische specificaties:...</strong> gefolgt von <ul>...</ul>
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

// Entfernt den "<h2>extra informatie</h2>" Abschnitt inkl. der nachfolgenden Tabelle komplett.
function removeExtraInformatie(html: string): { result: string; changed: boolean } {
  if (!html) return { result: html, changed: false };
  const result = html.replace(/<h2[^>]*>\s*extra\s+informatie\s*<\/h2>\s*<table[\s\S]*?<\/table>/gi, '').trimEnd();
  const changed = result !== html;
  return { result, changed };
}

// Ersetzt '? ' an typischen Bullet-Punkt-Positionen in HTML durch '✅ '
// (nach <br>, <li>, <p> und am absoluten Textanfang)
function restoreEmojiCheckmarks(html: string): string {
  if (!html) return html;
  // '? ' direkt nach einem HTML-Tag-Ende '>'
  let result = html.replace(/>(\s*)\? /g, '>$1✅ ');
  // Am absoluten Anfang des Strings
  result = result.replace(/^\? /, '✅ ');
  // Nach Zeilenumbruch
  result = result.replace(/\n(\s*)\? /g, '\n$1✅ ');
  return result;
}

// GET /api/volt-fixer/progress/:jobId
router.get('/progress/:jobId', (req: Request, res: Response) => {
  const p = progressStore.get(req.params.jobId);
  if (!p) return res.json({ step: 'waiting', stepLabel: 'Warte auf Start…', percent: 0, detail: '' });
  res.json({ step: p.step, stepLabel: p.stepLabel, percent: p.percent, detail: p.detail });
});

// POST /api/volt-fixer/upload
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });

    const restoreEmoji = req.body?.restoreEmoji === 'true';
    const useDeForNL   = req.body?.useDeForNL === 'true';
    const clientJobId  = req.body?.clientJobId as string | undefined;

    // Fortschritt initialisieren
    const setProgress = (step: string, stepLabel: string, percent: number, detail = '') => {
      if (!clientJobId) return;
      progressStore.set(clientJobId, { step, stepLabel, percent, detail, expires: Date.now() + 30 * 60 * 1000 });
    };

    setProgress('parsing', 'CSV wird gelesen…', 5);

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

    setProgress('fixing', 'Volt-Werte werden korrigiert…', 15, `${rows.length.toLocaleString('de-DE')} Zeilen`);

    let voltChanged = 0, voltSkipped = 0, descChanged = 0, nameChanged = 0, voltExtracted = 0, nlTranslated = 0, deTranslated = 0;
    // (runWithConcurrency wird für DeepL-Batch nicht mehr benötigt, bleibt aber als Hilfsfunktion erhalten)
    const nlTranslationQueue: Array<{ rowIndex: number }> = [];
    const deTranslationQueue: Array<{ rowIndex: number }> = [];
    const fixedRows: Record<string, string>[] = [];
    const changedCols: string[][] = [];
    // Alle geänderten Namen (für vollständige Anzeige im Frontend)
    const allChangedNames: Array<{
      itemNr: string;
      cols: Array<{ col: string; before: string; after: string }>;
    }> = [];
    // Alle aus Produktnamen extrahierten Volt-Werte
    const allExtractedVolt: Array<{
      itemNr: string;
      extractedVolt: string;
      fromName: string;
      fromCol: string;
    }> = [];

    for (const row of rows) {
      const newRow = { ...row };
      const changed: string[] = [];

      // Emoji-Wiederherstellung: '? ' → '✅ ' immer ausführen (Brickfox-Export kodiert ✅ als ?)
      for (const col of DESC_COLS) {
        if (!headers.includes(col) || !newRow[col]) continue;
        const restored = restoreEmojiCheckmarks(newRow[col]);
        if (restored !== newRow[col]) {
          newRow[col] = restored;
          if (!changed.includes(col)) changed.push(col);
        }
      }

      // HTML-Bereinigung: style="...", class="...", layout-Attribute entfernen
      for (const col of DESC_COLS) {
        if (!headers.includes(col) || !newRow[col]) continue;
        const { result: cleaned, changed: sc } = stripHtmlStyles(newRow[col]);
        if (sc) {
          newRow[col] = cleaned;
          if (!changed.includes(col)) changed.push(col);
        }
      }

      const voltVal = (row[VOLT_COL] ?? '').trim();
      let newVolt = voltVal;
      let voltWasChanged = false;

      if (!voltVal) {
        // Volt-Spalte leer → versuche aus Produktnamen zu extrahieren
        let extracted: string | null = null;
        let extractedFromCol = '';
        let extractedFromName = '';
        for (const col of NAME_COLS) {
          if (!headers.includes(col)) continue;
          const nameVal = row[col];
          if (!nameVal) continue;
          const found = extractVoltFromName(nameVal);
          if (found) {
            extracted = found;
            extractedFromCol = col;
            extractedFromName = nameVal;
            break;
          }
        }

        // Fallback: in der Produktbeschreibung suchen
        if (!extracted) {
          for (const col of DESC_COLS) {
            if (!headers.includes(col)) continue;
            const descVal = newRow[col] || row[col];
            if (!descVal) continue;
            const found = extractVoltFromDesc(descVal);
            if (found) {
              extracted = found;
              extractedFromCol = col;
              extractedFromName = descVal.replace(/<[^>]+>/g, ' ').substring(0, 80);
              break;
            }
          }
        }

        if (extracted) {
          // Volt-Spalte befüllen
          newRow[VOLT_COL] = extracted;
          changed.push(VOLT_COL);
          voltExtracted++;
          newVolt = extracted;
          voltWasChanged = true;
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
        newVolt = fv;
        voltWasChanged = wc;
        if (wc) {
          voltChanged++;
          newRow[VOLT_COL] = fv;
          changed.push(VOLT_COL);
        }
      }

      // Beschreibungen IMMER aktualisieren wenn Volt-Wert vorhanden (auch wenn bereits korrekt in Spalte)
      // WICHTIG: newRow[col] verwenden (bereits emoji-wiederhergestellt), nicht das Original descVal
      if (newVolt) {
        for (const col of DESC_COLS) {
          const descVal = newRow[col] || row[col];
          if (!descVal) continue;

          // Eingangs-/Ausgangsspannung-Werte VOR der Verarbeitung sichern
          const protectedVoltCells = extractProtectedVoltCells(descVal);

          // 1) Spannung-Tabellenzeile aktualisieren
          const { result: htmlAfterTable, changed: dc } = setSpannungInHtml(descVal, newVolt);
          if (dc) {
            newRow[col] = htmlAfterTable;
            if (!changed.includes(col)) changed.push(col);
            descChanged++;
          }

          // 2) Fließtext synchronisieren: alle Volt-Werte im Text auf Zielwert setzen
          //    (wie syncVoltInName – ersetzt auch "3,6 Volt" → "3,7 Volt" wenn Spalte "3,7" hat)
          const { result: htmlAfterText, changed: tc } = syncVoltInHtmlText(
            newRow[col] || descVal,
            newVolt
          );
          if (tc) {
            newRow[col] = htmlAfterText;
            if (!changed.includes(col)) changed.push(col);
          }

          // 3) Eingangs-/Ausgangsspannung-Originalwerte wiederherstellen (dürfen nie geändert werden)
          const htmlRestored = restoreProtectedVoltCells(newRow[col] || descVal, protectedVoltCells);
          if (htmlRestored !== (newRow[col] || descVal)) {
            newRow[col] = htmlRestored;
            if (!changed.includes(col)) changed.push(col);
          }
        }
      }

      // NL-spezifisch: "Technische specificaties" als <ul> → echte <table> konvertieren
      // und "extra informatie"-Abschnitt komplett entfernen
      if (headers.includes('p_description[nl]') && newRow['p_description[nl]']) {
        const { result: nlConverted, changed: nc } = convertNlTechSpecToTable(newRow['p_description[nl]']);
        if (nc) {
          newRow['p_description[nl]'] = nlConverted;
          if (!changed.includes('p_description[nl]')) changed.push('p_description[nl]');
        }
        const { result: nlCleaned, changed: ec } = removeExtraInformatie(newRow['p_description[nl]']);
        if (ec) {
          newRow['p_description[nl]'] = nlCleaned;
          if (!changed.includes('p_description[nl]')) changed.push('p_description[nl]');
        }
      }

      // Leere Tabellenzeilen entfernen (Wert ist '-', '0000', leer) → saubere Tabellen
      for (const col of DESC_COLS) {
        if (!headers.includes(col) || !newRow[col]) continue;
        const { result: cleaned, changed: cc } = cleanEmptyTableRows(newRow[col]);
        if (cc) {
          newRow[col] = cleaned;
          if (!changed.includes(col)) changed.push(col);
        }
      }

      // Spannung-Zeilen in der Tabelle aufsteigend nach Volt-Wert sortieren
      // (z.B. Spannung 3,6V → Ausgangsspannung 4,2V → Eingangsspannung 12V)
      for (const col of DESC_COLS) {
        if (!headers.includes(col) || !newRow[col]) continue;
        const { result: sorted, changed: sc } = sortVoltageTableRows(newRow[col]);
        if (sc) {
          newRow[col] = sorted;
          if (!changed.includes(col)) changed.push(col);
        }
      }

      // NL-Tabellenwerte aus DE übernehmen (NL-Labels bleiben erhalten, nur Werte werden synchronisiert)
      if (headers.includes('p_description[de]') && headers.includes('p_description[nl]')) {
        const deHtml = newRow['p_description[de]'];
        const nlHtml = newRow['p_description[nl]'];
        if (deHtml && nlHtml) {
          const { result: nlSynced, changed: ts } = syncTableValuesFromDe(deHtml, nlHtml);
          if (ts) {
            newRow['p_description[nl]'] = nlSynced;
            if (!changed.includes('p_description[nl]')) changed.push('p_description[nl]');
          }
        }
      }

      // Intelligente Beschreibungs-Angleichung: reichhaltigere Beschreibung als Basis
      if (useDeForNL && headers.includes('p_description[de]') && headers.includes('p_description[nl]')) {
        const deDesc = newRow['p_description[de]'] || '';
        const nlDesc = newRow['p_description[nl]'] || '';
        const deHasH2 = /<h2\b/i.test(deDesc);
        const nlHasH2 = /<h2\b/i.test(nlDesc);
        const deLen   = htmlTextLength(deDesc);
        const nlLen   = htmlTextLength(nlDesc);

        if (deHasH2 && !nlHasH2) {
          // Nur DE vollständig → DE nach NL übersetzen
          newRow['p_description[nl]'] = deDesc;
          if (!changed.includes('p_description[nl]')) changed.push('p_description[nl]');
          descChanged++;
          nlTranslationQueue.push({ rowIndex: fixedRows.length });
        } else if (nlHasH2 && !deHasH2) {
          // Nur NL vollständig → NL nach DE übersetzen
          newRow['p_description[de]'] = nlDesc;
          if (!changed.includes('p_description[de]')) changed.push('p_description[de]');
          descChanged++;
          deTranslationQueue.push({ rowIndex: fixedRows.length });
        } else if (deHasH2 && nlHasH2 && nlLen > deLen + 100) {
          // Beide vollständig, aber NL deutlich länger → NL als Basis, DE übersetzen
          newRow['p_description[de]'] = nlDesc;
          if (!changed.includes('p_description[de]')) changed.push('p_description[de]');
          descChanged++;
          deTranslationQueue.push({ rowIndex: fixedRows.length });
        } else if (deHasH2 && nlHasH2 && deLen > nlLen + 100) {
          // Beide vollständig, aber DE deutlich länger → DE als Basis, NL übersetzen
          newRow['p_description[nl]'] = deDesc;
          if (!changed.includes('p_description[nl]')) changed.push('p_description[nl]');
          descChanged++;
          nlTranslationQueue.push({ rowIndex: fixedRows.length });
        }
      }

      // Lieferumfang ans Ende verschieben (DE + NL)
      for (const col of ['p_description[de]', 'p_description[nl]']) {
        if (!newRow[col]) continue;
        const reordered = ensureDeliveryAtEnd(newRow[col]);
        if (reordered !== newRow[col]) {
          newRow[col] = reordered;
          if (!changed.includes(col)) changed.push(col);
        }
      }

      // Produktnamen immer synchronisieren wenn Volt-Wert vorhanden
      if (newVolt) {
        const changedNameCols: Array<{ col: string; before: string; after: string }> = [];
        for (const col of NAME_COLS) {
          if (!headers.includes(col)) continue;
          const nameVal = row[col];
          if (!nameVal) continue;
          let result = nameVal;
          let nc = false;
          if (voltWasChanged) {
            // Volt-Wert wurde korrigiert → alten Wert direkt suchen und ersetzen
            ({ result, changed: nc } = replaceSpannungInName(nameVal, voltVal, newVolt));
          }
          // Zusätzlich: alle verbleibenden Volt-Angaben auf Zielwert synchronisieren
          // (deckt Fälle ab wo voltWasChanged=false aber Name z.B. "385V" statt "3,85V" enthält)
          const { result: synced, changed: sc } = syncVoltInName(result, newVolt);
          if (sc) { result = synced; nc = true; }
          if (nc) {
            changedNameCols.push({ col, before: nameVal, after: result });
            newRow[col] = result;
            if (!changed.includes(col)) changed.push(col);
            nameChanged++;
          }
        }
        if (changedNameCols.length > 0) {
          allChangedNames.push({
            itemNr: row['p_item_number'] || row['v_item_number'] || '',
            cols: changedNameCols,
          });
        }
      }

      // Finaler Emoji-Pass: sicherstellen dass ✅ in ALLEN Beschreibungen korrekt steht
      // (deckt Fälle ab wo spätere Verarbeitungsschritte ✅ überschrieben haben)
      for (const col of DESC_COLS) {
        if (!headers.includes(col) || !newRow[col]) continue;
        const restored = restoreEmojiCheckmarks(newRow[col]);
        if (restored !== newRow[col]) {
          newRow[col] = restored;
          if (!changed.includes(col)) changed.push(col);
        }
      }

      fixedRows.push(newRow);
      changedCols.push(changed);
    }

    // DE→NL Übersetzungen via DeepL (Batch, alle auf einmal)
    if (useDeForNL && nlTranslationQueue.length > 0) {
      console.log(`[VoltFixer] DeepL DE→NL: ${nlTranslationQueue.length} Beschreibungen...`);
      setProgress('translating-nl', 'DE → NL wird übersetzt…', 40, `${nlTranslationQueue.length.toLocaleString('de-DE')} Beschreibungen`);
      const htmlList = nlTranslationQueue.map(({ rowIndex }) => fixedRows[rowIndex]['p_description[nl]'] || '');
      const total = nlTranslationQueue.length;
      const translated = await deeplService.translateBatch(htmlList, (done) => {
        const pct = Math.round(40 + (done / total) * 35);
        setProgress('translating-nl', 'DE → NL wird übersetzt…', pct, `${done.toLocaleString('de-DE')} / ${total.toLocaleString('de-DE')}`);
      });
      nlTranslationQueue.forEach(({ rowIndex }, i) => {
        if (translated[i]) {
          fixedRows[rowIndex]['p_description[nl]'] = ensureDeliveryAtEnd(translated[i]);
          nlTranslated++;
        }
      });
      console.log(`[VoltFixer] ${nlTranslated} DE→NL übersetzt.`);
    }

    // NL→DE Übersetzungen via DeepL (Batch, alle auf einmal)
    if (useDeForNL && deTranslationQueue.length > 0) {
      console.log(`[VoltFixer] DeepL NL→DE: ${deTranslationQueue.length} Beschreibungen...`);
      setProgress('translating-de', 'NL → DE wird übersetzt…', 76, `${deTranslationQueue.length.toLocaleString('de-DE')} Beschreibungen`);
      const htmlList = deTranslationQueue.map(({ rowIndex }) => fixedRows[rowIndex]['p_description[de]'] || '');
      const total = deTranslationQueue.length;
      const translated = await deeplService.translateBatchToDE(htmlList, (done) => {
        const pct = Math.round(76 + (done / total) * 15);
        setProgress('translating-de', 'NL → DE wird übersetzt…', pct, `${done.toLocaleString('de-DE')} / ${total.toLocaleString('de-DE')}`);
      });
      deTranslationQueue.forEach(({ rowIndex }, i) => {
        if (translated[i]) {
          fixedRows[rowIndex]['p_description[de]'] = ensureDeliveryAtEnd(translated[i]);
          deTranslated++;
        }
      });
      console.log(`[VoltFixer] ${deTranslated} NL→DE übersetzt.`);
    }

    setProgress('building', 'Ergebnis wird aufbereitet…', 93);

    // Zeilenumbrüche aus HTML-Beschreibungsfeldern entfernen (CSV-Kompatibilität)
    // Verhindert, dass mehrzeilige HTML-Felder im CSV über mehrere Zeilen verteilt werden
    const csvRows = fixedRows.map(row => {
      const r = { ...row };
      for (const col of DESC_COLS) {
        if (r[col]) r[col] = r[col].replace(/\r?\n/g, ' ');
      }
      return r;
    });

    // Artikel ohne DE-Beschreibung herausfiltern
    const mitBeschreibungRows = csvRows.filter(row => (row['p_description[de]'] ?? '').trim() !== '');
    const ohneBeschreibungRows = csvRows.filter(row => (row['p_description[de]'] ?? '').trim() === '');
    const ohneBeschreibungCount = ohneBeschreibungRows.length;

    // Normaler Export: nur Artikel MIT Beschreibung
    const csvOut = Papa.unparse(mitBeschreibungRows, { delimiter: ';', columns: headers });
    const csvBuffer = Buffer.concat([Buffer.from('\uFEFF', 'utf-8'), Buffer.from(csvOut, 'utf-8')]);

    // Separater Export: nur Artikel OHNE Beschreibung
    let ohneBeschreibungBuffer: Buffer | null = null;
    if (ohneBeschreibungCount > 0) {
      const ohneCsvOut = Papa.unparse(ohneBeschreibungRows, { delimiter: ';', columns: headers });
      ohneBeschreibungBuffer = Buffer.concat([Buffer.from('\uFEFF', 'utf-8'), Buffer.from(ohneCsvOut, 'utf-8')]);
    }

    // Drei-Spannung-Produkte erkennen (Spannung + Eingangsspannung + Ausgangsspannung in DE-Beschreibung)
    const dreiSpannungIndices: number[] = fixedRows
      .map((row, i) => ({ i, html: row['p_description[de]'] || '' }))
      .filter(({ html }) => hasDreiSpannung(html))
      .map(({ i }) => i);

    // Job speichern (30 Minuten) – inkl. aller Zeilen für Detail-Endpoint
    const jobId = crypto.randomBytes(16).toString('hex');
    const fileName = (req.file.originalname || 'output').replace(/\.csv$/i, '_volt_fixed.csv');
    jobStore.set(jobId, {
      csvBuffer,
      ohneBeschreibungBuffer,
      ohneBeschreibungCount,
      fileName,
      expires: Date.now() + 30 * 60 * 1000,
      fixedRows,
      dreiSpannungIndices,
      originalRows: rows,
      headers,
      changedCols,
      restoreEmoji,
    });

    // Hilfsfunktion: HTML → plain text (abgekürzt)
    const toPlainText = (html: string, max = 120): string => {
      if (!html) return '';
      const plain = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
      return plain.length > max ? plain.slice(0, max) + '…' : plain;
    };

    // Vorschau: alle Zeilen (max. 500), geänderte werden hervorgehoben
    const ITEM_NR_COLS = ['p_item_number', 'v_item_number'];
    const MAX_PREVIEW = 500;
    const previewItems: object[] = [];
    for (let i = 0; i < fixedRows.length && previewItems.length < MAX_PREVIEW; i++) {
      const changed = changedCols[i] ?? [];
      const orig = rows[i];
      const row = fixedRows[i];
      const itemNr = ITEM_NR_COLS.map(c => row[c]).find(v => v) || '';
      previewItems.push({
        index: i,
        itemNr,
        voltOrig: orig[VOLT_COL] ?? '',
        voltNew: row[VOLT_COL] ?? '',
        nameDEOrig: orig['p_name[de]'] ?? '',
        nameDE: row['p_name[de]'] ?? '',
        nameNLOrig: orig['p_name[nl]'] ?? '',
        nameNL: row['p_name[nl]'] ?? '',
        descDE: toPlainText(row['p_description[de]'] ?? ''),
        descDEChanged: changed.includes('p_description[de]'),
        descNL: toPlainText(row['p_description[nl]'] ?? ''),
        descNLChanged: changed.includes('p_description[nl]'),
        changed,
      });
    }

    setProgress('done', 'Fertig!', 100);

    res.json({
      jobId,
      headers,
      stats: { total: mitBeschreibungRows.length, voltChanged, voltSkipped, descChanged, nameChanged, voltExtracted, nlTranslated, deTranslated, dreiSpannungCount: dreiSpannungIndices.length, ohneBeschreibungCount },
      previewItems,
      allChangedNames: allChangedNames.slice(0, 300),
      allExtractedVolt: allExtractedVolt.slice(0, 300),
      fileName,
    });
  } catch (err: any) {
    console.error('[VoltFixer] Upload error:', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
});

// GET /api/volt-fixer/detail/:jobId/:index — vollständige Zeile für Auge-Modal
router.get('/detail/:jobId/:index', (req: Request, res: Response) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden oder abgelaufen' });
  const idx = parseInt(req.params.index, 10);
  if (isNaN(idx) || idx < 0 || idx >= job.fixedRows.length) {
    return res.status(400).json({ error: 'Ungültiger Index' });
  }

  // ✅ im Originaltext wiederherstellen (nur für Anzeige – Brickfox kodiert ✅ immer als ?)
  const original = { ...job.originalRows[idx] };
  for (const col of ['p_description[de]', 'p_description[nl]']) {
    if (original[col]) original[col] = restoreEmojiCheckmarks(original[col]);
  }

  res.json({
    row: job.fixedRows[idx],
    original,
    changed: job.changedCols[idx] || [],
    headers: job.headers,
  });
});

// GET /api/volt-fixer/download/:jobId
router.get('/download/:jobId', (req: Request, res: Response) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden oder abgelaufen' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${job.fileName}"`);
  res.send(job.csvBuffer);
});

// GET /api/volt-fixer/download-ohne-beschreibung/:jobId
// Exportiert nur Zeilen OHNE p_description[de]
router.get('/download-ohne-beschreibung/:jobId', (req: Request, res: Response) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden oder abgelaufen' });
  if (!job.ohneBeschreibungBuffer) {
    return res.status(404).json({ error: 'Keine Artikel ohne Beschreibung gefunden' });
  }
  const filteredFileName = job.fileName.replace(/\.csv$/i, '_ohne_beschreibung.csv');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filteredFileName}"`);
  res.send(job.ohneBeschreibungBuffer);
});

// GET /api/volt-fixer/download-drei-spannung/:jobId
// Exportiert nur Zeilen mit Spannung + Eingangsspannung + Ausgangsspannung in der DE-Beschreibung
router.get('/download-drei-spannung/:jobId', (req: Request, res: Response) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden oder abgelaufen' });
  if (job.dreiSpannungIndices.length === 0) {
    return res.status(404).json({ error: 'Keine Drei-Spannung-Produkte gefunden' });
  }

  const filteredRows = job.dreiSpannungIndices.map(i => {
    const row = { ...job.fixedRows[i] };
    for (const col of DESC_COLS) {
      if (row[col]) row[col] = row[col].replace(/\r?\n/g, ' ');
    }
    return row;
  });

  const csvOut = Papa.unparse(filteredRows, { delimiter: ';', columns: job.headers });
  const csvBuffer = Buffer.concat([Buffer.from('\uFEFF', 'utf-8'), Buffer.from(csvOut, 'utf-8')]);
  const filteredFileName = job.fileName.replace(/\.csv$/i, '_drei_spannung.csv');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filteredFileName}"`);
  res.send(csvBuffer);
});

export default router;
