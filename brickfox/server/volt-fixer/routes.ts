import { Router, Request, Response } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
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

interface JobResultCache {
  stats: { total: number; voltChanged: number; voltSkipped: number; voltSkippedNonElectronic: number; voltExtracted: number; dreiSpannungCount: number; htmlCorrectedCount: number };
  previewItems: object[];
  allChangedNames: object[];
  allExtractedVolt: object[];
  csvIssues: object[];
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
  resultCache?: JobResultCache;
}>();

// Hilfsfunktion: CSV-Puffer aus fixedRows neu generieren (nach Patch)
function rebuildCsvBuffer(job: { fixedRows: Record<string,string>[]; headers: string[] }): Buffer {
  const isValidPItemNr = (row: Record<string, string>): boolean => {
    const v = (row['p_item_number'] ?? '').trim();
    if (!v) return false;
    if (/<|>/.test(v)) return false;
    if (/&/.test(v)) return false;
    if (/\s/.test(v)) return false;
    if (/,/.test(v)) return false;
    if (/^\d+\.\d+$/.test(v)) return false;   // Dezimalzahlen (3.7, 10.8): ablehnen
    if (/^\d{1,2}$/.test(v)) return false;     // 1-2 stellige Integer: ablehnen
    return true;
  };
  const csvRows = job.fixedRows.map(row => {
    const r = { ...row };
    for (const key of Object.keys(r)) {
      if (r[key]) r[key] = r[key].replace(/\r?\n|\r/g, ' ').replace(/  +/g, ' ').trim();
    }
    return r;
  });
  const clean = csvRows.filter(row => isValidPItemNr(row));
  return Buffer.concat([Buffer.from('\uFEFF', 'utf-8'), Buffer.from(Papa.unparse(clean, { delimiter: ';', columns: job.headers }), 'utf-8')]);
}

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

// Entfernt überflüssige ".0" Dezimalstelle aus Volt-Spaltenwerten (6.0 → 6, 10.0 → 10, aber 3.85 bleibt)
function stripTrailingZeroVolt(val: string): string {
  return val.replace(/^(\d+)\.0$/, '$1');
}

function fixVolt(val: string): { fixed: string; changed: boolean } {
  let trimmed = val.trim();
  if (!trimmed) return { fixed: trimmed, changed: false };
  // Bereich + Datenmüll nach Leerzeichen entfernen (z.B. "100-240 73676" → "100-240")
  const rangeJunkMatch = trimmed.match(/^(\d+(?:[,.]?\d+)?[-\/]\d+(?:[,.]?\d+)?)\s+\d+/);
  const hadJunk = !!rangeJunkMatch;
  if (hadJunk) trimmed = rangeJunkMatch![1];
  // Bereichswert (enthält - oder /) → normalisieren: "9.0-12,0" → "9-12"
  if (/[-\/]/.test(trimmed)) {
    const normalized = normalizeRangeVolt(trimmed);
    return { fixed: normalized, changed: hadJunk || normalized !== val.trim() };
  }
  // Wert hat Komma → in Punkt-Format konvertieren, dann überflüssiges ".0" entfernen (6,0 → 6)
  if (trimmed.includes(',')) {
    const dotFormat = trimmed.replace(',', '.');
    const stripped = stripTrailingZeroVolt(dotFormat);
    return { fixed: stripped, changed: stripped !== trimmed };
  }
  // Wert hat bereits Punkt → überflüssiges ".0" entfernen falls vorhanden (6.0 → 6)
  if (trimmed.includes('.')) {
    const stripped = stripTrailingZeroVolt(trimmed);
    return { fixed: stripped, changed: stripped !== trimmed };
  }
  if (!/^\d+$/.test(trimmed)) return { fixed: trimmed, changed: false };
  // 1- und 2-stellige Zahlen sind immer ganze Volt-Werte → unverändert lassen.
  if (trimmed.length <= 2) return { fixed: trimmed, changed: false };
  // 3-stellige Zahlen: wenn erste zwei Ziffern 10–24 → XX.Y (z.B. 108→10.8, 111→11.1, 144→14.4)
  if (trimmed.length === 3) {
    const firstTwo = parseInt(trimmed.slice(0, 2), 10);
    if (firstTwo >= 10 && firstTwo <= 24) {
      return { fixed: trimmed.slice(0, 2) + '.' + trimmed[2], changed: true };
    }
  }
  // Sonstige Zahlen (z.B. 385, 370 usw.) → nicht verändern, kein 3.85 generieren
  return { fixed: trimmed, changed: false };
}

// Entfernt überflüssige ",0" / ".0" Dezimalstellen in Volt-Angaben innerhalb von HTML-Beschreibungen.
// Zielgerichtete Änderung: NUR "6,0 V" → "6 V", "12,0 V" → "12 V" usw.
// Alle anderen Inhalte der Beschreibung bleiben vollständig unverändert.
function stripDecimalZeroInDesc(html: string): { result: string; changed: boolean } {
  if (!html) return { result: html, changed: false };
  let changed = false;
  const result = html.replace(/\b(\d+)[,.]0(\s*V(?:olt)?)\b/gi, (_match, num, suffix) => {
    changed = true;
    return num + suffix;
  });
  return { result, changed };
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
    let text = iconv.decode(req.file.buffer, encoding);
    // BOM entfernen
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    // ─── Pre-Processing: fragmentierte Zeilen zusammenführen ─────────────────
    // Brickfox-Exporte haben HTML in p_description[de/nl] mit echten Zeilenumbrüchen.
    // Papa.parse würde diese als neue Zeilen interpretieren → HTML wird abgeschnitten.
    // Lösung: erst Zeilen zusammenführen (wie CSV-Reparatur), dann parsen.
    {
      const rawLines = text.split(/\r?\n/);
      const headerLine = rawLines[0] || '';
      const headerCols = headerLine.split(';').map(h => h.replace(/^"|"$/g, '').trim());
      // p_item_number oder v_item_number als Anker für neue Produktzeilen
      let itemNrIdx = headerCols.findIndex(h => h === 'p_item_number');
      if (itemNrIdx < 0) itemNrIdx = headerCols.findIndex(h => h === 'v_item_number');
      if (itemNrIdx < 0) itemNrIdx = 0;

      const looksLikeProductRow = (line: string): boolean => {
        const field = line.split(';')[itemNrIdx] ?? '';
        const v = field.replace(/^"|"$/g, '').trim();
        if (!v) return false;
        if (/<|>/.test(v) || /&[a-zA-Z#]/.test(v) || /\s/.test(v) || /,/.test(v)) return false;
        if (/^\d{1,2}$/.test(v)) return false;
        return true;
      };

      const mergedLines: string[] = [headerLine];
      let mergedCount = 0;
      for (let i = 1; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (!line.trim() || /^;+$/.test(line.trim())) continue;
        if (looksLikeProductRow(line)) {
          mergedLines.push(line);
        } else if (mergedLines.length > 1) {
          mergedLines[mergedLines.length - 1] += ' ' + line;
          mergedCount++;
        }
      }
      if (mergedCount > 0) {
        console.log(`[VoltFixer] Pre-merge: ${mergedCount} fragmentierte Zeilen zusammengeführt`);
        text = mergedLines.join('\n');
      }
    }

    const parsed = Papa.parse(text, {
      delimiter: ';',
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return res.status(400).json({ error: 'CSV konnte nicht geparst werden', details: parsed.errors[0]?.message });
    }

    const headers = parsed.meta.fields || [];
    // Mojibake reparieren + komplett leere Zeilen entfernen (Brickfox-Export enthält oft Leerzeilen mit nur Semikolons)
    const rows = (parsed.data as Record<string, string>[])
      .filter(row => Object.values(row).some(v => typeof v === 'string' && v.trim() !== ''))
      .map(row => {
        const fixed: Record<string, string> = {};
        for (const key of Object.keys(row)) {
          fixed[key] = repairMojibake(row[key]);
        }
        return fixed;
      });

    // Diagnose: zeigt ob HTML nach dem Parsen noch vorhanden ist
    const descSample = rows.slice(0, 3).map((r, i) => {
      const d = (r['p_description[de]'] ?? '').trim();
      const hasHtml = /<[a-z]/i.test(d);
      return `Zeile${i+1}: ${hasHtml ? 'HTML' : 'Plaintext'} (${d.substring(0, 80)})`;
    });
    console.log(`[VoltFixer] Beschreibungs-Diagnose:\n${descSample.join('\n')}`);

    setProgress('fixing', 'Volt-Werte werden korrigiert…', 15, `${rows.length.toLocaleString('de-DE')} Zeilen`);

    let voltChanged = 0, voltSkipped = 0, voltSkippedNonElectronic = 0, voltExtracted = 0;
    const fixedRows: Record<string, string>[] = [];
    const changedCols: string[][] = [];
    const allChangedNames: Array<{ itemNr: string; cols: Array<{ col: string; before: string; after: string }> }> = [];
    const allExtractedVolt: Array<{ itemNr: string; extractedVolt: string; fromName: string; fromCol: string }> = [];

    // Nicht-elektronische Produkte: kein sinnvoller Volt-Wert möglich → Volt-Verarbeitung überspringen
    const NON_ELECTRONIC_KEYWORDS = [
      'beutel', 'papier', 'staubbeutel', 'wischtuch', 'putztuch', 'reinigungstuch',
      'mikrofasertuch', 'mikrofaser tuch', 'servietten', 'tüten', 'filterbeutel',
      'staubsaugerbeutel', 'ersatzbeutel',
    ];

    for (const row of rows) {
      const newRow = { ...row };
      const changed: string[] = [];

      // Nicht-elektronische Produkte: Volt-Verarbeitung überspringen, alles unverändert lassen
      const productNameForCheck = NAME_COLS.map(col => (row[col] || '').toLowerCase()).join(' ');
      if (NON_ELECTRONIC_KEYWORDS.some(kw => productNameForCheck.includes(kw))) {
        fixedRows.push(newRow);
        changedCols.push(changed);
        voltSkipped++;
        voltSkippedNonElectronic++;
        continue;
      }

      const voltVal = (row[VOLT_COL] ?? '').trim();

      // Unrealistisch hohe Zahlen (>= 1000) sind kein gültiger Volt-Wert → sofort leeren, keine Extraktion
      const voltAsNum = Number(voltVal.replace(',', '.'));
      const isUnrealisticVolt = voltVal !== '' && !isNaN(voltAsNum) && voltAsNum >= 1000;

      if (isUnrealisticVolt) {
        newRow[VOLT_COL] = '';
        changed.push(VOLT_COL);
        voltChanged++;
      } else if (!voltVal) {
        // Volt-Spalte leer → Suche in Reihenfolge: 1) Produktname, 2) Spannung-Tabellenzeile, 3) Fließtext
        let extracted: string | null = null;
        let extractedFromCol = '';
        let extractedFromName = '';

        // Stufe 1: Produktnamen durchsuchen
        for (const col of NAME_COLS) {
          if (!headers.includes(col)) continue;
          const nameVal = row[col];
          if (!nameVal) continue;
          const found = extractVoltFromName(nameVal);
          if (found) { extracted = found; extractedFromCol = col; extractedFromName = nameVal; break; }
        }

        // Stufe 2: Spannung/Nennspannung-Zeile in der HTML-Tabelle durchsuchen
        if (!extracted) {
          for (const col of DESC_COLS) {
            if (!headers.includes(col)) continue;
            const descVal = row[col];
            if (!descVal) continue;
            const found = extractVoltFromTable(descVal);
            if (found) { extracted = found; extractedFromCol = col; extractedFromName = '(Tabelle: Spannung)'; break; }
          }
        }

        // Stufe 3: Fließtext (außerhalb Tabellen) — ohne AC-Netzspannungen
        if (!extracted) {
          for (const col of DESC_COLS) {
            if (!headers.includes(col)) continue;
            const descVal = row[col];
            if (!descVal) continue;
            const found = extractVoltFromBodyText(descVal);
            if (found) { extracted = found; extractedFromCol = col; extractedFromName = descVal.replace(/<[^>]+>/g, ' ').substring(0, 80); break; }
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

      // Beschreibungen: NUR überflüssige ",0 V" / ".0 V" Muster entfernen (6,0 V → 6 V)
      // Alle anderen Inhalte bleiben vollständig unverändert.
      for (const col of DESC_COLS) {
        if (!headers.includes(col) || !newRow[col]) continue;
        const { result: cleaned, changed: dc } = stripDecimalZeroInDesc(newRow[col]);
        if (dc) {
          newRow[col] = cleaned;
          if (!changed.includes(col)) changed.push(col);
        }
      }

      fixedRows.push(newRow);
      changedCols.push(changed);
    }

    // ─── CSV Qualitätsprüfung ───
    setProgress('validating', 'CSV wird geprüft…', 91);
    type CsvIssue = { row: number; itemNr: string; type: string; detail: string };
    const csvIssues: CsvIssue[] = [];
    const ITEM_NR_COLS_V = ['p_item_number', 'v_item_number'];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const itemNr = ITEM_NR_COLS_V.map(c => r[c]).find(v => v?.trim()) ?? '';

      // 1) Leere oder ungültige p_item_number
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

      // 2) Leerer Produktname DE
      if (headers.includes('p_name[de]') && !(r['p_name[de]'] ?? '').trim()) {
        csvIssues.push({ row: i + 2, itemNr, type: 'Leerer Produktname', detail: 'p_name[de] ist leer' });
      }

      // 3) Leere DE-Beschreibung
      if (headers.includes('p_description[de]') && !(r['p_description[de]'] ?? '').trim()) {
        csvIssues.push({ row: i + 2, itemNr, type: 'Leere Beschreibung (DE)', detail: 'p_description[de] ist leer' });
      }

      // 4) Leere NL-Beschreibung
      if (headers.includes('p_description[nl]')) {
        const nlDesc = (r['p_description[nl]'] ?? '').trim();
        if (!nlDesc) {
          csvIssues.push({ row: i + 2, itemNr, type: 'Leere Beschreibung (NL)', detail: 'p_description[nl] ist leer' });
        }
      }
    }

    setProgress('building', 'Ergebnis wird aufbereitet…', 93);

    // Zeilenumbrüche aus ALLEN Feldern entfernen (CSV-Kompatibilität)
    // Betrifft nicht nur Beschreibungen: auch HTML-Entities wie &nbsp; enden auf ";" und
    // brechen sonst die semikolon-getrennte CSV-Struktur wenn Zeilenumbrüche vorhanden sind.
    const csvRows = fixedRows.map(row => {
      const r = { ...row };
      for (const key of Object.keys(r)) {
        if (r[key]) r[key] = r[key].replace(/\r?\n|\r/g, ' ').replace(/  +/g, ' ').trim();
      }
      return r;
    });

    // Saubere CSV: nur Zeilen mit gültiger p_item_number
    const isValidPItemNr = (row: Record<string, string>): boolean => {
      const v = (row['p_item_number'] ?? '').trim();
      if (!v) return false;
      if (/<|>/.test(v)) return false;
      if (/&/.test(v)) return false;
      if (/\s/.test(v)) return false;
      if (/,/.test(v)) return false;
      if (/^\d+\.\d+$/.test(v)) return false;   // Dezimalzahlen (3.7, 10.8): ablehnen
      if (/^\d{1,2}$/.test(v)) return false;     // 1-2 stellige Integer: ablehnen
      return true;
    };

    const csvRowsClean = csvRows.filter(row => isValidPItemNr(row));
    const csvOut = Papa.unparse(csvRowsClean, { delimiter: ';', columns: headers });
    const csvBuffer = Buffer.concat([Buffer.from('\uFEFF', 'utf-8'), Buffer.from(csvOut, 'utf-8')]);

    // Drei-Spannung-Produkte erkennen (Spannung + Eingangsspannung + Ausgangsspannung in DE-Beschreibung)
    const dreiSpannungIndices: number[] = fixedRows
      .map((row, i) => ({ i, html: row['p_description[de]'] || '' }))
      .filter(({ html }) => hasDreiSpannung(html))
      .map(({ i }) => i);

    // Job speichern (30 Minuten) – inkl. aller Zeilen für Detail-Endpoint
    const jobId = crypto.randomBytes(16).toString('hex');
    const baseName = (req.file.originalname || 'output').replace(/\.csv$/i, '');
    const fileName = baseName + '_volt_fixed.csv';
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

    // Vorschau: ALLE Zeilen (geändert + unverändert)
    const ITEM_NR_COLS = ['p_item_number', 'v_item_number'];
    const previewItems: object[] = [];
    for (let i = 0; i < fixedRows.length; i++) {
      const changed = changedCols[i] ?? [];
      const orig = rows[i];
      const row = fixedRows[i];
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
        descDEChanged: changed.includes('p_description[de]'),
        descNL: toPlainText(row['p_description[nl]'] ?? ''),
        descNLChanged: changed.includes('p_description[nl]'),
        hasHtml: /<[a-z]/i.test(row['p_description[de]'] ?? ''),
        changed,
      });
    }

    setProgress('done', 'Fertig!', 100);

    // Ergebnis im Job cachen (für Speicherfunktion)
    const htmlCorrectedCount = fixedRows.filter((row, i) => {
      const changed = changedCols[i] ?? [];
      return changed.length > 0 && /<[a-z]/i.test(row['p_description[de]'] ?? '');
    }).length;
    const resultStats = { total: rows.length, voltChanged, voltSkipped, voltSkippedNonElectronic, voltExtracted, dreiSpannungCount: dreiSpannungIndices.length, htmlCorrectedCount };
    const currentJob = jobStore.get(jobId);
    if (currentJob) {
      currentJob.resultCache = { stats: resultStats, previewItems, allChangedNames, allExtractedVolt, csvIssues };
    }

    res.json({
      jobId,
      headers,
      stats: resultStats,
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

// PATCH /api/volt-fixer/patch-volt/:jobId/:index — Volt-Wert einer Zeile manuell korrigieren
router.patch('/patch-volt/:jobId/:index', (req: Request, res: Response) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden oder abgelaufen' });
  const idx = parseInt(req.params.index, 10);
  if (isNaN(idx) || idx < 0 || idx >= job.fixedRows.length) {
    return res.status(400).json({ error: 'Ungültiger Index' });
  }
  const { volt } = req.body as { volt?: string };
  if (typeof volt !== 'string') return res.status(400).json({ error: 'volt fehlt' });

  // Volt-Wert in fixedRows aktualisieren
  job.fixedRows[idx][VOLT_COL] = volt.trim();

  // changedCols aktualisieren
  if (volt.trim() && !job.changedCols[idx].includes(VOLT_COL)) {
    job.changedCols[idx] = [...job.changedCols[idx], VOLT_COL];
  } else if (!volt.trim()) {
    job.changedCols[idx] = job.changedCols[idx].filter(c => c !== VOLT_COL);
  }

  // CSV-Puffer neu generieren
  job.csvBuffer = rebuildCsvBuffer(job);

  res.json({ ok: true, voltNew: volt.trim() });
});

// GET /api/volt-fixer/download/:jobId
// Exportiert nur korrigierte Zeilen (Volt geändert) MIT HTML in p_description[de]
router.get('/download/:jobId', (req: Request, res: Response) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden oder abgelaufen' });

  const isValidPItemNr = (row: Record<string, string>): boolean => {
    const v = (row['p_item_number'] ?? '').trim();
    if (!v) return false;
    if (/<|>/.test(v)) return false;
    if (/&/.test(v)) return false;
    if (/\s/.test(v)) return false;
    if (/,/.test(v)) return false;
    if (/^\d+\.\d+$/.test(v)) return false;
    if (/^\d{1,2}$/.test(v)) return false;
    return true;
  };

  const filteredRows = job.fixedRows
    .filter(isValidPItemNr)
    .map(row => {
      const r = { ...row };
      for (const key of Object.keys(r)) {
        if (r[key]) r[key] = r[key].replace(/\r?\n|\r/g, ' ').replace(/  +/g, ' ').trim();
      }
      return r;
    });

  const noDesc = req.query.noDesc === '1';
  const EXCLUDED_COLS = ['p_id', 'p_extern_id', ...(noDesc ? ['p_description[de]', 'p_description[nl]'] : [])];
  const exportHeaders = job.headers.filter(h => !EXCLUDED_COLS.includes(h));
  const csvOut = Papa.unparse(filteredRows, { delimiter: ';', columns: exportHeaders });
  const csvBuffer = Buffer.concat([Buffer.from('\uFEFF', 'utf-8'), Buffer.from(csvOut, 'utf-8')]);
  const cleanFileName = job.fileName.replace(/\.csv$/i, '_sauber.csv');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${cleanFileName}"`);
  res.send(csvBuffer);
});


// GET /api/volt-fixer/download-no-html/:jobId
// Exportiert alle Zeilen OHNE HTML in p_description[de] – mit korrigierten Volt-Werten
router.get('/download-no-html/:jobId', (req: Request, res: Response) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden oder abgelaufen' });

  const isValidPItemNr = (row: Record<string, string>): boolean => {
    const v = (row['p_item_number'] ?? '').trim();
    if (!v) return false;
    if (/<|>/.test(v)) return false;
    if (/&/.test(v)) return false;
    if (/\s/.test(v)) return false;
    if (/,/.test(v)) return false;
    if (/^\d+\.\d+$/.test(v)) return false;
    if (/^\d{1,2}$/.test(v)) return false;
    return true;
  };

  const filteredRows = job.fixedRows
    .filter(row => !/<[a-z]/i.test(row['p_description[de]'] ?? ''))
    .filter(isValidPItemNr)
    .map(row => {
      const r = { ...row };
      for (const key of Object.keys(r)) {
        if (r[key]) r[key] = r[key].replace(/\r?\n|\r/g, ' ').replace(/  +/g, ' ').trim();
      }
      return r;
    });

  const noDesc = req.query.noDesc === '1';
  const EXCLUDED_COLS = ['p_id', 'p_extern_id', ...(noDesc ? ['p_description[de]', 'p_description[nl]'] : [])];
  const exportHeaders = job.headers.filter(h => !EXCLUDED_COLS.includes(h));
  const csvOut = Papa.unparse(filteredRows, { delimiter: ';', columns: exportHeaders });
  const csvBuffer = Buffer.concat([Buffer.from('\uFEFF', 'utf-8'), Buffer.from(csvOut, 'utf-8')]);
  const noHtmlFileName = job.fileName.replace(/\.csv$/i, '_kein_html.csv');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${noHtmlFileName}"`);
  res.send(csvBuffer);
});

// ── Gespeicherte Projekte (Saves) ────────────────────────────────────────────

const SAVES_DIR = path.join(process.cwd(), 'saves', 'volt-fixer');
const SAVES_INDEX = path.join(SAVES_DIR, 'index.json');

interface SaveMeta {
  id: string;
  name: string;
  savedAt: string;
  fileName: string;
  totalRows: number;
  changedRows: number;
}

function ensureSavesDir() {
  if (!fs.existsSync(SAVES_DIR)) fs.mkdirSync(SAVES_DIR, { recursive: true });
}

function readSavesIndex(): SaveMeta[] {
  try {
    if (!fs.existsSync(SAVES_INDEX)) return [];
    return JSON.parse(fs.readFileSync(SAVES_INDEX, 'utf-8')) as SaveMeta[];
  } catch { return []; }
}

function writeSavesIndex(index: SaveMeta[]) {
  fs.writeFileSync(SAVES_INDEX, JSON.stringify(index, null, 2), 'utf-8');
}

// GET /api/volt-fixer/saves — Liste aller gespeicherten Projekte
router.get('/saves', (_req: Request, res: Response) => {
  res.json(readSavesIndex());
});

// POST /api/volt-fixer/save — Aktuellen Job speichern
router.post('/save', (req: Request, res: Response) => {
  const { jobId, name } = req.body as { jobId?: string; name?: string };
  if (!jobId || !name) return res.status(400).json({ error: 'jobId und name erforderlich' });
  const job = jobStore.get(jobId);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden oder abgelaufen' });

  ensureSavesDir();
  const saveId = crypto.randomUUID();
  const index = readSavesIndex();

  const changedRows = job.changedCols.filter(c => c && c.length > 0).length;
  const meta: SaveMeta = {
    id: saveId,
    name: name.trim(),
    savedAt: new Date().toISOString(),
    fileName: job.fileName,
    totalRows: job.fixedRows.length,
    changedRows,
  };

  const saveData = {
    meta,
    resultData: {
      headers: job.headers,
      fileName: job.fileName,
      ...(job.resultCache ?? {}),
    },
    jobData: {
      csvBufferBase64: job.csvBuffer.toString('base64'),
      fixedRows: job.fixedRows,
      originalRows: job.originalRows,
      headers: job.headers,
      changedCols: job.changedCols,
      dreiSpannungIndices: job.dreiSpannungIndices,
      restoreEmoji: job.restoreEmoji,
      fileName: job.fileName,
    },
  };

  const compressed = zlib.gzipSync(JSON.stringify(saveData));
  fs.writeFileSync(path.join(SAVES_DIR, `${saveId}.json.gz`), compressed);

  index.push(meta);
  writeSavesIndex(index);

  res.json(meta);
});

// POST /api/volt-fixer/saves/:saveId/load — Gespeicherten Job laden
router.post('/saves/:saveId/load', (req: Request, res: Response) => {
  const { saveId } = req.params;
  const filePath = path.join(SAVES_DIR, `${saveId}.json.gz`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Gespeichertes Projekt nicht gefunden' });

  try {
    const compressed = fs.readFileSync(filePath);
    const raw = zlib.gunzipSync(compressed).toString('utf-8');
    const saveData = JSON.parse(raw) as {
      meta: SaveMeta;
      resultData: Record<string, unknown>;
      jobData: {
        csvBufferBase64: string;
        fixedRows: Record<string, string>[];
        originalRows: Record<string, string>[];
        headers: string[];
        changedCols: string[][];
        dreiSpannungIndices: number[];
        restoreEmoji: boolean;
        fileName: string;
      };
    };

    const { jobData, resultData } = saveData;
    const newJobId = crypto.randomUUID();
    const expires = Date.now() + 30 * 60 * 1000;

    jobStore.set(newJobId, {
      csvBuffer: Buffer.from(jobData.csvBufferBase64, 'base64'),
      fileName: jobData.fileName,
      expires,
      fixedRows: jobData.fixedRows,
      originalRows: jobData.originalRows,
      headers: jobData.headers,
      changedCols: jobData.changedCols,
      dreiSpannungIndices: jobData.dreiSpannungIndices,
      restoreEmoji: jobData.restoreEmoji,
    });

    res.json({ jobId: newJobId, ...resultData });
  } catch (e) {
    res.status(500).json({ error: 'Fehler beim Laden des Projekts' });
  }
});

// DELETE /api/volt-fixer/saves/:saveId — Gespeichertes Projekt löschen
router.delete('/saves/:saveId', (req: Request, res: Response) => {
  const { saveId } = req.params;
  const filePath = path.join(SAVES_DIR, `${saveId}.json.gz`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  const index = readSavesIndex().filter(m => m.id !== saveId);
  writeSavesIndex(index);
  res.json({ ok: true });
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
