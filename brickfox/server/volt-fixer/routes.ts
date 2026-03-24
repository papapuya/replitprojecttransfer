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

// Konvertiert Spaltenwert (Punkt-Format) in Text-Format (Komma) für Beschreibungen/Namen.
// Spalte: "3.85" → Text: "3,85". Ganze Zahlen unverändert: "20" → "20".
// Alle Punkte werden ersetzt (z.B. "10.8" → "10,8").
function voltToText(columnVolt: string): string {
  return columnVolt.replace(/\./g, ',');
}

// Normalisiert Bereichsangaben: Komma→Punkt, ".0" am Ende jedes Teils entfernen.
// z.B. "9.0-12,0" → "9-12", "9.0-12.0" → "9-12", "100-240" → "100-240"
function normalizeRangeVolt(raw: string): string {
  const dotted = raw.replace(/,/g, '.');
  return dotted.replace(/(\d+)\.0(?=[-\/]|$)/g, '$1');
}

function fixVolt(val: string): { fixed: string; changed: boolean } {
  const trimmed = val.trim();
  if (!trimmed) return { fixed: trimmed, changed: false };
  // Bereichswert (enthält - oder /) → normalisieren: "9.0-12,0" → "9-12"
  if (/[-\/]/.test(trimmed)) {
    const normalized = normalizeRangeVolt(trimmed);
    return { fixed: normalized, changed: normalized !== trimmed };
  }
  // Wert hat Komma (altes Dezimalformat) → in Punkt-Format konvertieren
  if (trimmed.includes(',')) {
    const dotFormat = trimmed.replace(',', '.');
    return { fixed: dotFormat, changed: true };
  }
  // Wert hat bereits Punkt → korrekt, unverändert
  if (trimmed.includes('.')) return { fixed: trimmed, changed: false };
  if (!/^\d+$/.test(trimmed)) return { fixed: trimmed, changed: false };
  // 1- und 2-stellige Zahlen sind immer ganze Volt-Werte → unverändert lassen.
  // (12 → 12, 19 → 19, 20 → 20, 36 → 36 usw.)
  if (trimmed.length <= 2) return { fixed: trimmed, changed: false };
  // 3-stellige Zahlen: wenn erste zwei Ziffern 10–24 → XX.Y (z.B. 111→11.1, 144→14.4, 222→22.2, 108→10.8)
  if (trimmed.length === 3) {
    const firstTwo = parseInt(trimmed.slice(0, 2), 10);
    if (firstTwo >= 10 && firstTwo <= 24) {
      return { fixed: trimmed.slice(0, 2) + '.' + trimmed[2], changed: true };
    }
  }
  // Standard: Punkt nach erster Stelle (z.B. 385→3.85, 370→3.70)
  return { fixed: trimmed[0] + '.' + trimmed.slice(1), changed: true };
}

// Ersetzt Volt-Wert in Produktnamen (Plaintext), z.B. "385 V" → "3,85 V", "385 Volt" → "3,85 Volt"
function replaceSpannungInName(text: string, oldVolt: string, newVolt: string): { result: string; changed: boolean } {
  if (!text || !oldVolt || !newVolt || oldVolt === newVolt) return { result: text, changed: false };
  const escaped = oldVolt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}(\\s*V(?:olt)?)\\b`, 'g');
  let changed = false;
  const result = text.replace(regex, (_match, suffix) => {
    changed = true;
    return newVolt + suffix;
  });
  return { result, changed };
}

// Synchronisiert JEDE Volt-Angabe im Namen auf den Zielwert (z.B. "385V" → "3,85V" wenn targetVolt="3,85")
// Wird benutzt wenn der Volt-Wert in der Spalte bereits korrekt ist, aber der Name noch eine
// andere Schreibweise enthält.
function syncVoltInName(text: string, targetVolt: string): { result: string; changed: boolean } {
  if (!text || !targetVolt) return { result: text, changed: false };
  let changed = false;
  let result = text;
  if (targetVolt.includes('-') || targetVolt.includes('/')) {
    // Bereichswert: gefundenen Bereich normalisieren und durch targetVolt ersetzen
    // z.B. "9.0-12,0 V" → "9-12 V", "9.0-12.0V" → "9-12 V"
    result = text.replace(/\b(\d+(?:[,.]?\d+)?[-\/]\d+(?:[,.]?\d+)?)\s*(V(?:olt)?)\b/gi, (_match, range, _unit) => {
      const normalized = normalizeRangeVolt(range);
      const expected = targetVolt + ' V';
      if (normalized === targetVolt && _match.trim() === expected) return _match;
      changed = true;
      return targetVolt + ' V';
    });
  } else {
    // Einfacher Wert: falsche Schreibweisen ersetzen
    result = text.replace(/\b(\d+(?:[,\.]\d+)?)(\s*V(?:olt)?)\b/gi, (_match, num, suffix) => {
      if (num === targetVolt) return _match;
      changed = true;
      return targetVolt + suffix;
    });
  }
  return { result, changed };
}

// Prüft ob ein Volt-Wert eine AC-Netzspannung (Ladegerät-Eingang) ist und übersprungen werden soll.
// Werte ≥ 100 (z.B. 110, 230, 110-240) sind Netzspannungen, keine Produkt-Spannungen.
function isAcMainsVolt(raw: string): boolean {
  if (!raw) return false;
  if (/[-\/]/.test(raw)) {
    // Bereichswert: beide Teile prüfen
    const parts = raw.split(/[-\/]/).map(p => parseFloat(p.replace(',', '.')));
    return parts.some(p => !isNaN(p) && p >= 100);
  }
  const val = parseFloat(raw.replace(',', '.'));
  return !isNaN(val) && val >= 100;
}

// Extrahiert Volt-Wert aus Produktnamen.
// Jeder Wert wird übernommen — wenn der Name "110-240V" enthält, IST das Produkt ein Ladegerät.
function extractVoltFromName(name: string): string | null {
  if (!name) return null;
  const allMatches = [...name.matchAll(/\b(\d+(?:[,.]\d+)?(?:[-\/]\d+(?:[,.]\d+)?)?)\s*V(?:olt)?\b/gi)];
  for (const m of allMatches) {
    const normalized = normalizeExtractedVolt(m[1]);
    if (normalized) return normalized;
  }
  return null;
}

// Extrahiert Volt-Wert aus der Spannung/Nennspannung-Zeile der HTML-Tabelle.
// Jeder Wert wird übernommen — Tabellenzeile ist die offizielle Produktspannung.
// Eingangsspannung (Label "Eingangsspannung") wird übersprungen.
function extractVoltFromTable(html: string): string | null {
  if (!html) return null;
  const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const trMatch of trMatches) {
    const trContent = trMatch[1];
    const labelMatch = trContent.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/i);
    if (!labelMatch) continue;
    const label = labelMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
    // Nur "Spannung" / "Nennspannung" / "Spanning" — NICHT Eingangs-/Ausgangsspannung
    if (!/^(?:nenn)?spann(?:ung|ing)$/.test(label)) continue;
    const cells = [...trContent.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)];
    if (cells.length < 2) continue;
    const valueCell = cells[1][1].replace(/<[^>]+>/g, '').trim();
    const m = valueCell.match(/\b(\d+(?:[,.]\d+)?(?:[-\/]\d+(?:[,.]\d+)?)?)\s*(?:V(?:olt)?)?\b/i);
    if (!m) continue;
    const normalized = normalizeExtractedVolt(m[1]);
    if (normalized) return normalized;
  }
  return null;
}

// Extrahiert Volt-Wert aus dem Fließtext (außerhalb von Tabellen) der HTML-Beschreibung.
// Hohe Werte (≥ 100V, z.B. "110-240 V Ladegerät") werden übersprungen.
function extractVoltFromBodyText(html: string): string | null {
  if (!html) return null;
  // Tabellen komplett entfernen
  const bodyText = html.replace(/<table[^>]*>[\s\S]*?<\/table>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const allMatches = [...bodyText.matchAll(/\b(\d+(?:[,.]\d+)?(?:[-\/]\d+(?:[,.]\d+)?)?)\s*V(?:olt)?\b/gi)];
  for (const m of allMatches) {
    const normalized = normalizeExtractedVolt(m[1]);
    if (!isAcMainsVolt(normalized)) return normalized;
  }
  return null;
}

// Synchronisiert alle Volt-Werte im Fließtext einer HTML-Beschreibung auf den Zielwert.
// Eingangs- und Ausgangsspannung-Tabellenzeilen werden NICHT verändert.
// Bereichswerte (100-240V) werden nicht angefasst.
function syncVoltInHtmlText(html: string, targetVolt: string): { result: string; changed: boolean } {
  if (!html || !targetVolt || targetVolt.includes('-') || targetVolt.includes('/')) {
    return { result: html, changed: false };
  }
  const protectedLabel = /(?:eingangs|ausgangs)(?:spannung|spanning)/i;
  let changed = false;

  // Ersetzt Volt-Werte in Textknoten (HTML-Tags überspringen)
  const replaceVoltInTextNodes = (s: string): string =>
    s.replace(/(<[^>]*>)|(\b(\d+(?:[,.]\d+)?)\s*(V(?:olt)?)\b)/gi,
      (m, tag, _f, num, unit) => {
        if (tag !== undefined) return tag;
        if (!num || !unit) return m;
        const norm = num.replace('.', ',');
        if (norm === targetVolt || /[-\/]/.test(num)) return m;
        changed = true;
        return targetVolt + ' ' + (unit.trim().toLowerCase() === 'volt' ? 'Volt' : 'V');
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
      if (norm === targetVolt || /[-\/]/.test(num)) return m;
      changed = true;
      return targetVolt + ' ' + (unit.trim().toLowerCase() === 'volt' ? 'Volt' : 'V');
    });

  return { result, changed };
}

// Normalisiert einen aus Text extrahierten Volt-Wert für die p_attributes[akku_v][de]-Spalte.
// Spaltenformat: Punkt als Dezimaltrennzeichen (3.7), Text/Namen: Komma (3,7 V).
// Aus Text extrahierte Werte: Komma/Punkt → Punkt-Format für Spalte.
// Ganze Zahlen bleiben unverändert (19 → 19, 24 → 24).
function normalizeExtractedVolt(raw: string): string {
  if (!raw) return raw;
  // Bereichswert (z.B. "100-240", "12/24", "9,0-12,0") → normalizeRangeVolt anwenden
  if (/[-\/]/.test(raw)) return normalizeRangeVolt(raw);
  // Dezimalwert (z.B. "3,7" oder "3.7") → Komma durch Punkt (Spaltenformat)
  if (raw.includes(',')) return raw.replace(',', '.');
  if (raw.includes('.')) return raw; // bereits Punkt-Format
  // Ganzzahl → unverändert lassen (19 bleibt 19, nicht 19,0)
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


// Setzt den Spannung/Nennspannung-Wert in der HTML-Tabelle immer auf den korrekten Volt-Wert.
// Erkennt DE ("Spannung", "Nennspannung") und NL ("Spanning", "Nennspanning").
// Falls keine Spannung-Zeile vorhanden ist aber eine Tabelle existiert, wird eine neue Zeile eingefügt.
function setSpannungInHtml(html: string, targetVolt: string): { result: string; changed: boolean } {
  if (!html || !targetVolt) return { result: html, changed: false };

  // Spannung-Zeilen: DE (Spannung/Nennspannung) + NL (Spanning/Nennspanning)
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

  // Falls keine Spannung-Zeile gefunden wurde aber eine Tabelle existiert → Zeile einfügen
  // Auch NL "Spanning" erkennen, damit keine doppelte Zeile eingefügt wird
  const hasSpannungRow = /(?:Nenn)?[Ss]pann(?:ung|ing)(?:\s*V)?/.test(html);
  if (!changed && !hasSpannungRow) {
    // Füge Spannung-Zeile als erste Zeile nach <tbody> ein (oder vor dem ersten <tr>)
    const tbodyInsert = result.replace(/(<tbody[^>]*>)/, `$1<tr><th class="thlabel"> Spannung V</th><td class="data"> ${targetVolt} V</td></tr>`);
    if (tbodyInsert !== result) {
      result = tbodyInsert;
      changed = true;
    } else {
      // Fallback: vor dem ersten <tr> in der Tabelle einfügen
      const trInsert = result.replace(/(<table[^>]*>[\s\S]*?)(<tr\b)/, `$1<tr><th class="thlabel"> Spannung V</th><td class="data"> ${targetVolt} V</td></tr>$2`);
      if (trInsert !== result) {
        result = trInsert;
        changed = true;
      }
    }
  }

  return { result, changed };
}

// Repariert UTF-8 Mojibake in Texten (z.B. "fÃ¼r" → "für").
// Entsteht wenn UTF-8-Dateien als Latin-1 gelesen und zurückgespeichert wurden.
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
    // Mojibake reparieren: "fÃ¼r" → "für" (entsteht wenn UTF-8-CSVs als Latin-1 gelesen wurden)
    const rows = (parsed.data as Record<string, string>[]).map(row => {
      const fixed: Record<string, string> = {};
      for (const key of Object.keys(row)) {
        fixed[key] = repairMojibake(row[key]);
      }
      return fixed;
    });

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

    // Nicht-elektronische Produkte: kein sinnvoller Volt-Wert möglich → Volt-Verarbeitung überspringen
    const NON_ELECTRONIC_KEYWORDS = [
      'beutel', 'papier', 'staubbeutel', 'wischtuch', 'putztuch', 'reinigungstuch',
      'mikrofasertuch', 'mikrofaser tuch', 'servietten', 'tüten', 'filterbeutel',
      'staubsaugerbeutel', 'ersatzbeutel',
    ];

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
      const productNameForCheck = NAME_COLS
        .map(col => (row[col] || '').toLowerCase())
        .join(' ');
      const isNonElectronic = NON_ELECTRONIC_KEYWORDS.some(kw => productNameForCheck.includes(kw));

      if (isNonElectronic) {
        fixedRows.push(newRow);
        changedCols.push(changed);
        voltSkipped++;
        continue;
      }

      const voltVal = (row[VOLT_COL] ?? '').trim();
      let newVolt = voltVal;
      let voltWasChanged = false;

      if (!voltVal) {
        // Volt-Spalte leer → Suche in Reihenfolge: 1) Produktname, 2) Spannung-Tabellenzeile, 3) Fließtext
        // Hohe Volt-Werte (≥100V, AC-Netzspannung wie 110-240V) werden immer übersprungen.
        let extracted: string | null = null;
        let extractedFromCol = '';
        let extractedFromName = '';

        // Stufe 1: Produktnamen durchsuchen
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

        // Stufe 2: Spannung/Nennspannung-Zeile in der HTML-Tabelle durchsuchen
        if (!extracted) {
          for (const col of DESC_COLS) {
            if (!headers.includes(col)) continue;
            const descVal = newRow[col] || row[col];
            if (!descVal) continue;
            const found = extractVoltFromTable(descVal);
            if (found) {
              extracted = found;
              extractedFromCol = col;
              extractedFromName = '(Tabelle: Spannung)';
              break;
            }
          }
        }

        // Stufe 3: Fließtext (außerhalb Tabellen) durchsuchen — ohne AC-Netzspannungen
        if (!extracted) {
          for (const col of DESC_COLS) {
            if (!headers.includes(col)) continue;
            const descVal = newRow[col] || row[col];
            if (!descVal) continue;
            const found = extractVoltFromBodyText(descVal);
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

          // Text-Format (Komma) für Beschreibungen/Namen (Spalte nutzt Punkt: 3.85 → Text: 3,85)
          const textVolt = voltToText(newVolt);

          // 1) Spannung-Tabellenzeile aktualisieren
          const { result: htmlAfterTable, changed: dc } = setSpannungInHtml(descVal, textVolt);
          if (dc) {
            newRow[col] = htmlAfterTable;
            if (!changed.includes(col)) changed.push(col);
            descChanged++;
          }

          // 2) Fließtext synchronisieren: alle Volt-Werte im Text auf Zielwert setzen
          //    (wie syncVoltInName – ersetzt auch "3,6 Volt" → "3,7 Volt" wenn Spalte "3,7" hat)
          const { result: htmlAfterText, changed: tc } = syncVoltInHtmlText(
            newRow[col] || descVal,
            textVolt
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
            // voltVal in Text-Format (Komma) umwandeln damit er im Namen gefunden wird
            ({ result, changed: nc } = replaceSpannungInName(nameVal, voltToText(voltVal), voltToText(newVolt)));
          }
          // Zusätzlich: alle verbleibenden Volt-Angaben auf Zielwert synchronisieren
          // (deckt Fälle ab wo voltWasChanged=false aber Name z.B. "385V" statt "3,85V" enthält)
          const { result: synced, changed: sc } = syncVoltInName(result, voltToText(newVolt));
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

    // ─── CSV Qualitätsprüfung ───
    setProgress('validating', 'CSV wird geprüft…', 91);
    type CsvIssue = { row: number; itemNr: string; type: string; detail: string };
    const csvIssues: CsvIssue[] = [];
    const ITEM_NR_COLS_V = ['p_item_number', 'v_item_number'];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const itemNr = ITEM_NR_COLS_V.map(c => r[c]).find(v => v?.trim()) ?? '';

      // 1) Leere Artikelnummer
      if (!itemNr) {
        csvIssues.push({ row: i + 2, itemNr: '—', type: 'Leere Artikelnummer', detail: 'p_item_number und v_item_number sind beide leer' });
      }

      // 2) Leerer Produktname DE
      if (headers.includes('p_name[de]') && !(r['p_name[de]'] ?? '').trim()) {
        csvIssues.push({ row: i + 2, itemNr, type: 'Leerer Produktname', detail: 'p_name[de] ist leer' });
      }

      // 3) Leere DE-Beschreibung (wenn Spalte vorhanden)
      if (headers.includes('p_description[de]')) {
        const deDesc = (r['p_description[de]'] ?? '').trim();
        if (!deDesc) {
          csvIssues.push({ row: i + 2, itemNr, type: 'Leere Beschreibung (DE)', detail: 'p_description[de] ist leer' });
        } else {
          // Defekte Beschreibung: HTML vorhanden aber kaum Text (< 30 Zeichen Plaintext)
          const plainLen = deDesc.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim().length;
          if (plainLen < 30 && deDesc.length > 10) {
            csvIssues.push({ row: i + 2, itemNr, type: 'Beschreibung zu kurz (DE)', detail: `Nur ${plainLen} Zeichen Plaintext — möglicherweise defekt` });
          }
        }
      }

      // 4) Leere NL-Beschreibung (wenn Spalte vorhanden)
      if (headers.includes('p_description[nl]')) {
        const nlDesc = (r['p_description[nl]'] ?? '').trim();
        if (!nlDesc) {
          csvIssues.push({ row: i + 2, itemNr, type: 'Leere Beschreibung (NL)', detail: 'p_description[nl] ist leer' });
        }
      }
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

    // Korrigierte CSV bauen
    const csvOut = Papa.unparse(csvRows, { delimiter: ';', columns: headers });
    const csvBuffer = Buffer.concat([Buffer.from('\uFEFF', 'utf-8'), Buffer.from(csvOut, 'utf-8')]);

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

    // Vorschau: ALLE geänderten Zeilen (kein Limit)
    const ITEM_NR_COLS = ['p_item_number', 'v_item_number'];
    const previewItems: object[] = [];
    for (let i = 0; i < fixedRows.length; i++) {
      const changed = changedCols[i];
      if (!changed || changed.length === 0) continue;
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
      stats: { total: rows.length, voltChanged, voltSkipped, descChanged, nameChanged, voltExtracted, nlTranslated, deTranslated, dreiSpannungCount: dreiSpannungIndices.length },
      previewItems,
      allChangedNames,
      allExtractedVolt,
      csvIssues,
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
