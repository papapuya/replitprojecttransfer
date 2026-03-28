import Papa from "papaparse";
import { makeCsvBlob } from "@/lib/utils";

export interface RepairStats {
  totalRawLines: number;
  emptyLinesRemoved: number;
  rowsMerged: number;
  rowsAfterRepair: number;
  invalidItemNrRemoved: number;
}

export interface RepairResult {
  csvBlob: Blob;
  fileName: string;
  stats: RepairStats;
}

// Yield to the browser's event loop so the UI can repaint
const yield_ = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function looksLikeNewProductRow(pIdField: string, pItemNrField: string): boolean {
  const id = pIdField.trim();
  if (!id) return false;
  if (/<|>/.test(id)) return false;
  if (/&/.test(id)) return false;
  if (/\s/.test(id)) return false;
  if (/,/.test(id)) return false;
  if (/^\d+\.\d+$/.test(id)) return false;
  if (!/^[\w\-]+$/.test(id)) return false;

  const nr = pItemNrField.trim();
  if (!nr) return false;
  if (/<|>/.test(nr)) return false;
  if (/&/.test(nr)) return false;
  if (/\s/.test(nr)) return false;
  if (/,/.test(nr)) return false;
  if (/^\d+\.\d+$/.test(nr)) return false;
  if (/^\d{1,2}$/.test(nr)) return false;
  if (!/^[\w\-]+$/.test(nr)) return false;

  return true;
}

function isValidPItemNr(v: string): boolean {
  const val = v.trim();
  if (!val) return false;
  if (/<|>/.test(val)) return false;
  if (/&/.test(val)) return false;
  if (/\s/.test(val)) return false;
  if (/,/.test(val)) return false;
  if (/^\d+\.\d+$/.test(val)) return false;
  if (/^\d{1,2}$/.test(val)) return false;
  return true;
}

async function readFileAsText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  // Check for UTF-8 BOM
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder("utf-8").decode(bytes.slice(3));
  }

  // Sample first 4 KB to detect encoding
  const sample = bytes.slice(0, Math.min(4096, bytes.length));
  let highBytes = 0;
  for (const b of sample) { if (b > 0x7F) highBytes++; }

  if (highBytes === 0) {
    return new TextDecoder("utf-8").decode(bytes);
  }

  // Try UTF-8 — if replacement chars appear, fall back to Windows-1252
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!utf8.includes("\uFFFD")) {
    const text = utf8;
    return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  }

  // Windows-1252 fallback (supported in all modern browsers)
  const win = new TextDecoder("windows-1252").decode(bytes);
  return win.charCodeAt(0) === 0xFEFF ? win.slice(1) : win;
}

export async function repairCsv(
  file: File,
  onProgress: (label: string, percent: number) => void
): Promise<RepairResult> {
  const PROGRESS_INTERVAL = 10_000;

  onProgress("Datei wird gelesen…", 5);
  await yield_();

  const raw = await readFileAsText(file);

  onProgress("Zeilen werden gezählt…", 12);
  await yield_();

  const rawLines = raw.split(/\r?\n/);
  const totalRawLines = rawLines.length;

  if (rawLines.length < 2) {
    throw new Error("CSV zu kurz — mindestens Header + 1 Zeile erforderlich");
  }

  const headerLine = rawLines[0];
  const headerCols = headerLine.split(";").map(h => h.trim());
  const pIdIdx      = headerCols.findIndex(h => h === "p_id");
  const pItemNrIdx  = headerCols.findIndex(h => h === "p_item_number");
  const pIdColIdx     = pIdIdx     >= 0 ? pIdIdx     : 0;
  const pItemNrColIdx = pItemNrIdx >= 0 ? pItemNrIdx : 1;

  // ─── Zeilen zusammenführen ────────────────────────────────────────────────
  onProgress(`${totalRawLines.toLocaleString("de-DE")} Zeilen werden zusammengeführt…`, 18);
  await yield_();

  const mergedLines: string[] = [headerLine];
  let emptyLinesRemoved = 0;
  let rowsMerged = 0;

  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i];

    if (!line.trim() || /^;+$/.test(line.trim())) {
      emptyLinesRemoved++;
      continue;
    }

    const fields       = line.split(";");
    const pIdField     = fields[pIdColIdx]     ?? "";
    const pItemNrField = fields[pItemNrColIdx] ?? "";

    if (looksLikeNewProductRow(pIdField, pItemNrField)) {
      mergedLines.push(line);
    } else {
      if (mergedLines.length > 1) {
        mergedLines[mergedLines.length - 1] += " " + line;
        rowsMerged++;
      } else {
        emptyLinesRemoved++;
      }
    }

    if (i % PROGRESS_INTERVAL === 0) {
      const pct = 18 + Math.round((i / totalRawLines) * 52);
      onProgress(
        `Zeile ${i.toLocaleString("de-DE")} von ${totalRawLines.toLocaleString("de-DE")} verarbeitet…`,
        pct
      );
      await yield_();
    }
  }

  onProgress("Filtern und bereinigen…", 72);
  await yield_();

  const mergedCsv = mergedLines.join("\n");
  const parsed = Papa.parse<Record<string, string>>(mergedCsv, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
  });

  const headers = parsed.meta.fields ?? [];
  let rows = parsed.data;

  rows = rows.filter(row => Object.values(row).some(v => (v ?? "").trim() !== ""));

  const beforeFilter = rows.length;
  rows = rows.filter(row => isValidPItemNr(row["p_item_number"] ?? ""));
  const invalidItemNrRemoved = beforeFilter - rows.length;

  onProgress("Zeilenumbrüche aus Feldern entfernen…", 82);
  await yield_();

  rows = rows.map(row => {
    const r = { ...row };
    for (const key of Object.keys(r)) {
      if (r[key] && typeof r[key] === "string") {
        r[key] = r[key].replace(/\r?\n|\r/g, " ").replace(/  +/g, " ").trim();
      }
    }
    return r;
  });

  onProgress("Reparierte CSV wird erstellt…", 92);
  await yield_();

  const csvOut = Papa.unparse(rows, { delimiter: ";", columns: headers });
  const csvBlob = makeCsvBlob(csvOut);

  const baseName = file.name.replace(/\.csv$/i, "");
  const fileName = baseName + "_repariert.csv";

  const stats: RepairStats = {
    totalRawLines,
    emptyLinesRemoved,
    rowsMerged,
    rowsAfterRepair: rows.length,
    invalidItemNrRemoved,
  };

  return { csvBlob, fileName, stats };
}
