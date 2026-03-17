import { useState, useCallback, useRef } from "react";
import { Upload, Download, CheckCircle, AlertCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const VOLT_COL = "p_attributes[akku_v][de]";
const ID_COL = "v_item_number";
const DESC_COLS = ["p_description[de]", "p_description[nl]"];

// Setzt Komma nach erster Stelle: 385 → 3,85 | 48 → 4,8
function fixVolt(val: string): { fixed: string; changed: boolean } {
  const trimmed = val.trim();
  if (!trimmed) return { fixed: trimmed, changed: false };
  if (trimmed.includes(",") || trimmed.includes(".")) return { fixed: trimmed, changed: false };
  if (!/^\d+$/.test(trimmed)) return { fixed: trimmed, changed: false };
  if (trimmed.length === 1) return { fixed: trimmed, changed: false };
  return { fixed: trimmed[0] + "," + trimmed.slice(1), changed: true };
}

// Ersetzt Spannungswert in Technische-Daten-Tabelle (HTML)
function replaceSpannungInHtml(html: string, oldVolt: string, newVolt: string): { result: string; changed: boolean } {
  if (!html || !oldVolt || !newVolt || oldVolt === newVolt) return { result: html, changed: false };
  // Findet <td>Spannung</td><td>WERT...</td> und tauscht WERT aus
  const regex = /(<td[^>]*>\s*Spannung\s*<\/td>\s*<td[^>]*>)([^<]*)(<\/td>)/gi;
  let changed = false;
  const result = html.replace(regex, (_match, before, value, after) => {
    const trimmedValue = value.trim();
    // Wenn der Wert mit dem alten Volt-Wert beginnt (z.B. "385" oder "385 V")
    if (trimmedValue === oldVolt || trimmedValue.startsWith(oldVolt + " ") || trimmedValue.startsWith(oldVolt + ",")) {
      changed = true;
      const suffix = trimmedValue.slice(oldVolt.length);
      return before + newVolt + suffix + after;
    }
    return before + value + after;
  });
  return { result, changed };
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Handle quoted fields with semicolons inside
  const rawText = text.replace(/^\uFEFF/, "");
  const lines = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length === 0) return { headers: [], rows: [] };

  const sep = ";";

  function splitLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === sep && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  const headers = splitLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const parts = splitLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = parts[idx] ?? ""; });
    rows.push(row);
  }
  return { headers, rows };
}

function toCsv(headers: string[], rows: Record<string, string>[]): string {
  const escape = (v: string) => {
    if (v.includes(";") || v.includes('"') || v.includes("\n") || v.includes("\r")) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  };
  const lines = [headers.map(escape).join(";")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h] ?? "")).join(";"));
  }
  return lines.join("\r\n");
}

// Kürzt langen Text für Vorschau
function truncatePreview(val: string, max = 80): string {
  if (!val) return "";
  val = val.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return val.length > max ? val.slice(0, max) + "…" : val;
}

type Stats = { total: number; voltChanged: number; voltSkipped: number; descChanged: number };

export default function VoltFixer() {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [original, setOriginal] = useState<Record<string, string>[]>([]);
  const [fixed, setFixed] = useState<Record<string, string>[]>([]);
  const [changedCols, setChangedCols] = useState<Set<string>[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, voltChanged: 0, voltSkipped: 0, descChanged: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers: h, rows } = parseCsv(text);
      setHeaders(h);
      setOriginal(rows);

      let voltChanged = 0, voltSkipped = 0, descChanged = 0;
      const fixedRows: Record<string, string>[] = [];
      const changedColsList: Set<string>[] = [];

      for (const row of rows) {
        const newRow = { ...row };
        const changed = new Set<string>();

        // 1) Volt-Spalte korrigieren
        const voltVal = row[VOLT_COL] ?? "";
        let newVolt = voltVal;
        let voltWasChanged = false;

        if (!voltVal.trim()) {
          voltSkipped++;
        } else {
          const { fixed: fv, changed: wc } = fixVolt(voltVal);
          newVolt = fv;
          voltWasChanged = wc;
          if (wc) {
            voltChanged++;
            newRow[VOLT_COL] = fv;
            changed.add(VOLT_COL);
          }
        }

        // 2) Beschreibungen updaten wenn Volt geändert wurde
        if (voltWasChanged) {
          for (const col of DESC_COLS) {
            const descVal = row[col];
            if (!descVal) continue;
            const { result, changed: dc } = replaceSpannungInHtml(descVal, voltVal.trim(), newVolt);
            if (dc) {
              newRow[col] = result;
              changed.add(col);
              descChanged++;
            }
          }
        }

        fixedRows.push(newRow);
        changedColsList.push(changed);
      }

      setFixed(fixedRows);
      setChangedCols(changedColsList);
      setStats({ total: rows.length, voltChanged, voltSkipped, descChanged });
    };
    reader.readAsText(file, "utf-8");
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const downloadCsv = () => {
    if (!fixed.length) return;
    const csv = "\uFEFF" + toCsv(headers, fixed);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.replace(/\.csv$/i, "_volt_fixed.csv");
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasVoltCol = headers.includes(VOLT_COL);
  const previewRows = fixed.slice(0, 100);
  const hasMore = fixed.length > 100;

  // HTML-Beschreibungsspalten für kompakte Darstellung in Vorschau
  const isDescCol = (h: string) => h.startsWith("p_description");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Volt-Komma Fixer</h1>
        <p className="text-gray-500 mt-1">
          Korrigiert <code className="bg-gray-100 px-1 rounded text-sm">{VOLT_COL}</code> (z.B. <strong>385 → 3,85</strong>) und aktualisiert automatisch den Spannungswert in den Produktbeschreibungen.
        </p>
      </div>

      {/* Upload */}
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragging ? "border-indigo-500 bg-indigo-50" : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50"
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <Upload className="mx-auto mb-3 text-indigo-500" size={36} />
        <p className="font-medium text-gray-700">CSV hierher ziehen oder klicken</p>
        <p className="text-sm text-gray-400 mt-1">Semikolon-getrennt, beliebig viele Spalten</p>
        <input ref={fileRef} type="file" accept=".csv,.CSV" className="hidden" onChange={onFileChange} />
      </div>

      {/* Stats */}
      {original.length > 0 && (
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-4 py-2">
            <FileText size={16} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">{fileName}</span>
          </div>
          <Badge variant="outline">{stats.total.toLocaleString()} Zeilen</Badge>
          <Badge className="bg-indigo-600 text-white">{stats.voltChanged.toLocaleString()} Volt-Werte korrigiert</Badge>
          <Badge className="bg-green-600 text-white">{stats.descChanged.toLocaleString()} Beschreibungen aktualisiert</Badge>
          <Badge variant="outline" className="text-gray-400">{stats.voltSkipped.toLocaleString()} leer (übersprungen)</Badge>
          {!hasVoltCol && (
            <Badge variant="destructive">
              <AlertCircle size={12} className="mr-1" />
              Spalte {VOLT_COL} nicht gefunden
            </Badge>
          )}
        </div>
      )}

      {/* Download */}
      {fixed.length > 0 && hasVoltCol && (
        <Button onClick={downloadCsv} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
          <Download size={16} />
          Korrigierte CSV herunterladen ({fixed.length.toLocaleString()} Zeilen)
        </Button>
      )}

      {/* Preview table – alle Spalten */}
      {fixed.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">
            Vollständige Spaltenvorschau
          </h2>
          <p className="text-sm text-gray-400 mb-3">
            {hasMore ? `Erste 100 von ${fixed.length.toLocaleString()} Zeilen` : `${fixed.length.toLocaleString()} Zeilen`}
            {" · "}
            Geänderte Felder sind <span className="text-indigo-600 font-medium">blau</span> hervorgehoben
          </p>
          <div className="border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap sticky left-0 bg-gray-50 z-10">#</th>
                    {headers.map((h) => (
                      <th
                        key={h}
                        className={`px-3 py-2 text-left font-semibold whitespace-nowrap ${
                          h === VOLT_COL ? "text-indigo-700 bg-indigo-50" :
                          isDescCol(h) ? "text-green-700 bg-green-50" :
                          "text-gray-600"
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => {
                    const changed = changedCols[i] ?? new Set();
                    return (
                      <tr key={i} className={`border-b last:border-0 ${changed.size > 0 ? "bg-indigo-50/40" : "bg-white"}`}>
                        <td className="px-3 py-1.5 text-gray-400 sticky left-0 bg-inherit z-10">{i + 1}</td>
                        {headers.map((h) => {
                          const origVal = original[i]?.[h] ?? "";
                          const fixedVal = row[h] ?? "";
                          const wasChanged = changed.has(h);
                          const displayVal = isDescCol(h) ? truncatePreview(fixedVal) : fixedVal;
                          const origDisplay = isDescCol(h) ? truncatePreview(origVal) : origVal;

                          return (
                            <td key={h} className={`px-3 py-1.5 max-w-xs ${wasChanged ? "bg-indigo-50" : ""}`}>
                              {wasChanged ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-red-400 line-through opacity-70">{origDisplay || "—"}</span>
                                  <span className="text-indigo-700 font-semibold">
                                    <CheckCircle size={10} className="inline mr-1" />
                                    {displayVal || "—"}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-700">{displayVal || <span className="text-gray-300">—</span>}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {hasMore && (
            <p className="text-sm text-gray-400 mt-2 text-center">
              … {(fixed.length - 100).toLocaleString()} weitere Zeilen im Download enthalten
            </p>
          )}
        </div>
      )}
    </div>
  );
}
