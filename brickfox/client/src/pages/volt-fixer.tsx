import { useState, useCallback, useRef } from "react";
import { Upload, Download, CheckCircle, AlertCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const VOLT_COL = "p_attributes[akku_v][de]";
const ID_COL = "v_item_number";

function fixVolt(val: string): { fixed: string; changed: boolean } {
  const trimmed = val.trim();
  if (!trimmed) return { fixed: trimmed, changed: false };
  if (trimmed.includes(",") || trimmed.includes(".")) return { fixed: trimmed, changed: false };
  if (!/^\d+$/.test(trimmed)) return { fixed: trimmed, changed: false };
  if (trimmed.length === 1) return { fixed: trimmed, changed: false };
  const fixed = trimmed[0] + "," + trimmed.slice(1);
  return { fixed, changed: true };
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length === 0) return { headers: [], rows: [] };
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^\ufeff/, ""));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const parts = lines[i].split(sep);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = parts[idx] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

function toCsv(headers: string[], rows: Record<string, string>[]): string {
  const escape = (v: string) => {
    if (v.includes(";") || v.includes('"') || v.includes("\n")) {
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

export default function VoltFixer() {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [original, setOriginal] = useState<Record<string, string>[]>([]);
  const [fixed, setFixed] = useState<Record<string, string>[]>([]);
  const [stats, setStats] = useState({ total: 0, changed: 0, skipped: 0 });
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

      let changed = 0;
      let skipped = 0;
      const fixedRows = rows.map((row) => {
        const voltVal = row[VOLT_COL] ?? "";
        if (!voltVal.trim()) {
          skipped++;
          return { ...row };
        }
        const { fixed: fixedVal, changed: wasChanged } = fixVolt(voltVal);
        if (wasChanged) changed++;
        return { ...row, [VOLT_COL]: fixedVal };
      });
      setFixed(fixedRows);
      setStats({ total: rows.length, changed, skipped });
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
  const previewRows = fixed.slice(0, 200);
  const hasMore = fixed.length > 200;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Volt-Komma Fixer</h1>
        <p className="text-gray-500 mt-1">
          Setzt Kommas in der Spalte <code className="bg-gray-100 px-1 rounded text-sm">{VOLT_COL}</code> — z.B. <strong>385 → 3,85</strong>, <strong>48 → 4,8</strong>
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
          <Badge variant="outline" className="text-gray-600">{stats.total.toLocaleString()} Zeilen gesamt</Badge>
          <Badge className="bg-indigo-600 text-white">{stats.changed.toLocaleString()} Werte korrigiert</Badge>
          <Badge variant="outline" className="text-gray-400">{stats.skipped.toLocaleString()} leer (übersprungen)</Badge>
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

      {/* Preview table */}
      {fixed.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Spaltenvorschau
            {hasMore && <span className="text-sm font-normal text-gray-400 ml-2">(erste 200 von {fixed.length.toLocaleString()} Zeilen)</span>}
          </h2>
          <div className="border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">#</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{ID_COL}</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Volt (Original)</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Volt (Korrigiert)</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => {
                    const origVal = original[i]?.[VOLT_COL] ?? "";
                    const fixedVal = row[VOLT_COL] ?? "";
                    const changed = origVal !== fixedVal;
                    return (
                      <tr key={i} className={`border-b last:border-0 ${changed ? "bg-indigo-50" : "bg-white"}`}>
                        <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-4 py-2 text-gray-700 font-mono text-xs">{row[ID_COL] ?? ""}</td>
                        <td className="px-4 py-2">
                          {origVal ? (
                            <span className={changed ? "text-red-500 line-through" : "text-gray-700"}>{origVal}</span>
                          ) : (
                            <span className="text-gray-300 italic">leer</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {fixedVal ? (
                            <span className={changed ? "font-semibold text-indigo-700" : "text-gray-700"}>{fixedVal}</span>
                          ) : (
                            <span className="text-gray-300 italic">leer</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {!origVal.trim() ? (
                            <span className="text-gray-400 text-xs">übersprungen</span>
                          ) : changed ? (
                            <span className="inline-flex items-center gap-1 text-indigo-600 text-xs font-medium">
                              <CheckCircle size={12} /> korrigiert
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">unverändert</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {hasMore && (
            <p className="text-sm text-gray-400 mt-2 text-center">
              … {(fixed.length - 200).toLocaleString()} weitere Zeilen im Download enthalten
            </p>
          )}
        </div>
      )}
    </div>
  );
}
