import { useState, useRef } from "react";
import { Upload, Download, CheckCircle, AlertCircle, FileText, Loader2, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const VOLT_COL = "p_attributes[akku_v][de]";
const DESC_COLS = ["p_description[de]", "p_description[nl]"];
const NAME_COLS = ["p_name[de]", "p_name[nl]"];
const NAME_COL_LABELS: Record<string, string> = { "p_name[de]": "DE", "p_name[nl]": "NL" };
const DETAIL_COLS = [...NAME_COLS, ...DESC_COLS, VOLT_COL];

function truncateHtml(val: string, max = 80): string {
  if (!val) return "";
  const plain = val.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return plain.length > max ? plain.slice(0, max) + "…" : plain;
}

type PreviewEntry = {
  row: Record<string, string>;
  original: Record<string, string>;
  changed: string[];
};

type ChangedNameEntry = {
  itemNr: string;
  cols: Array<{ col: string; before: string; after: string }>;
};

type ExtractedVoltEntry = {
  itemNr: string;
  extractedVolt: string;
  fromName: string;
  fromCol: string;
};

type Result = {
  jobId: string;
  headers: string[];
  fileName: string;
  stats: { total: number; voltChanged: number; voltSkipped: number; descChanged: number; nameChanged: number; voltExtracted: number };
  preview: PreviewEntry[];
  allChangedNames: ChangedNameEntry[];
  allExtractedVolt: ExtractedVoltEntry[];
};

// Detail-Modal
function DetailModal({
  entry,
  headers,
  rowNum,
  onClose,
}: {
  entry: PreviewEntry;
  headers: string[];
  rowNum: number;
  onClose: () => void;
}) {
  const { row, original, changed } = entry;
  const detailCols = headers.filter((h) => DETAIL_COLS.includes(h));
  const otherCols = headers.filter((h) => !DETAIL_COLS.includes(h));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Zeile {rowNum} – Detailansicht</h2>
            <p className="text-sm text-gray-400">{row["p_item_number"] || row["v_item_number"] || ""}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 text-gray-500">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          {/* Wichtige Spalten */}
          {detailCols.map((h) => {
            const origVal = original[h] ?? "";
            const fixedVal = row[h] ?? "";
            const wasChanged = changed.includes(h);
            const isDesc = DESC_COLS.includes(h);

            return (
              <div key={h}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    h === VOLT_COL ? "bg-indigo-100 text-indigo-700" :
                    DESC_COLS.includes(h) ? "bg-green-100 text-green-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>{h}</span>
                  {wasChanged && (
                    <Badge className="bg-indigo-600 text-white text-xs gap-1">
                      <CheckCircle size={10} /> geändert
                    </Badge>
                  )}
                </div>
                {wasChanged && (
                  <div className="mb-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-500 font-medium mb-1">Original:</p>
                    {isDesc ? (
                      <div className="text-xs text-red-600 max-h-32 overflow-y-auto" dangerouslySetInnerHTML={{ __html: origVal }} />
                    ) : (
                      <p className="text-sm text-red-600 line-through">{origVal}</p>
                    )}
                  </div>
                )}
                <div className={`p-3 rounded-lg border ${wasChanged ? "bg-indigo-50 border-indigo-200" : "bg-gray-50 border-gray-200"}`}>
                  {wasChanged && <p className="text-xs text-indigo-500 font-medium mb-1">Korrigiert:</p>}
                  {isDesc ? (
                    <div className="text-xs text-gray-700 max-h-48 overflow-y-auto prose prose-xs max-w-none" dangerouslySetInnerHTML={{ __html: fixedVal }} />
                  ) : (
                    <p className="text-sm text-gray-800">{fixedVal || <span className="text-gray-300 italic">leer</span>}</p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Andere Spalten kompakt */}
          {otherCols.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-3">Weitere Spalten</h3>
              <div className="grid grid-cols-2 gap-2">
                {otherCols.map((h) => (
                  <div key={h} className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-400 mb-0.5">{h}</p>
                    <p className="text-xs text-gray-700 truncate">{row[h] || "—"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VoltFixer() {
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [detailEntry, setDetailEntry] = useState<{ entry: PreviewEntry; rowNum: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/volt-fixer/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload fehlgeschlagen");
      setResult(data);
    } catch (e: any) {
      setError(e.message || "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const download = () => {
    if (!result) return;
    window.open(`/api/volt-fixer/download/${result.jobId}`, "_blank");
  };

  const isDescCol = (h: string) => DESC_COLS.includes(h);
  const hasMore = result && result.stats.total > 100;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Volt-Komma Fixer</h1>
        <p className="text-gray-500 mt-1">
          Korrigiert <code className="bg-gray-100 px-1 rounded text-sm">{VOLT_COL}</code> (z.B.{" "}
          <strong>385 → 3,85</strong>) und aktualisiert den Spannungswert in den Produktbeschreibungen.
        </p>
      </div>

      {/* Upload */}
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragging ? "border-indigo-500 bg-indigo-50" : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50"
        } ${loading ? "pointer-events-none opacity-60" : ""}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        {loading ? (
          <>
            <Loader2 className="mx-auto mb-3 text-indigo-500 animate-spin" size={36} />
            <p className="font-medium text-gray-700">Wird verarbeitet…</p>
            <p className="text-sm text-gray-400 mt-1">Bitte warten, große Dateien dauern etwas länger</p>
          </>
        ) : (
          <>
            <Upload className="mx-auto mb-3 text-indigo-500" size={36} />
            <p className="font-medium text-gray-700">CSV hierher ziehen oder klicken</p>
            <p className="text-sm text-gray-400 mt-1">Semikolon-getrennt · UTF-8 oder Windows-1252 · beliebig groß</p>
          </>
        )}
        <input ref={fileRef} type="file" accept=".csv,.CSV" className="hidden" onChange={onFileChange} />
      </div>

      {/* Fehler */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Ergebnis */}
      {result && (
        <>
          {/* Stats */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-4 py-2">
              <FileText size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">{result.fileName}</span>
            </div>
            <Badge variant="outline">{result.stats.total.toLocaleString()} Zeilen</Badge>
            <Badge className="bg-indigo-600 text-white">{result.stats.voltChanged.toLocaleString()} Volt-Werte korrigiert</Badge>
            {result.stats.voltExtracted > 0 && (
              <Badge className="bg-orange-500 text-white">{result.stats.voltExtracted.toLocaleString()} aus Namen ergänzt</Badge>
            )}
            <Badge className="bg-green-600 text-white">{result.stats.descChanged.toLocaleString()} Beschreibungen aktualisiert</Badge>
            {result.stats.nameChanged > 0 && (
              <Badge className="bg-purple-600 text-white">{result.stats.nameChanged.toLocaleString()} Namen aktualisiert</Badge>
            )}
            <Badge variant="outline" className="text-gray-400">{result.stats.voltSkipped.toLocaleString()} leer (übersprungen)</Badge>
          </div>

          {/* Aus Produktnamen extrahierte Volt-Werte */}
          {result.allExtractedVolt.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-1">
                Volt-Werte aus Produktnamen ergänzt
                <span className="ml-2 text-sm font-normal text-gray-400">
                  {result.allExtractedVolt.length.toLocaleString()} Produkte · Volt-Spalte war leer
                </span>
              </h2>
              <div className="border rounded-xl overflow-hidden shadow-sm divide-y max-h-[400px] overflow-y-auto">
                {result.allExtractedVolt.map((entry, i) => (
                  <div key={i} className="px-4 py-3 bg-white hover:bg-orange-50 flex items-start gap-4">
                    <div className="shrink-0">
                      <p className="text-xs text-gray-400 font-mono">{entry.itemNr || `Zeile ${i + 1}`}</p>
                      <span className="text-xs text-gray-400">{NAME_COL_LABELS[entry.fromCol] ?? entry.fromCol}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">{entry.fromName}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs text-gray-400">Eingetragen:</span>
                      <p className="text-base font-bold text-orange-600">{entry.extractedVolt} V</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Geänderte Namen – alle vollständig */}
          {result.allChangedNames.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-1">
                Geänderte Produktnamen
                <span className="ml-2 text-sm font-normal text-gray-400">
                  {result.allChangedNames.length.toLocaleString()} Produkte
                </span>
              </h2>
              <div className="border rounded-xl overflow-hidden shadow-sm divide-y max-h-[600px] overflow-y-auto">
                {result.allChangedNames.map((entry, i) => (
                  <div key={i} className="px-4 py-3 bg-white hover:bg-gray-50">
                    <p className="text-xs text-gray-400 mb-2 font-mono">{entry.itemNr || `Zeile ${i + 1}`}</p>
                    <div className="space-y-2">
                      {entry.cols.map(({ col, before, after }) => (
                        <div key={col} className="flex flex-col gap-1">
                          <span className="text-xs font-semibold text-purple-600 uppercase tracking-wide">
                            {NAME_COL_LABELS[col] ?? col}
                          </span>
                          <div className="flex items-start gap-3 text-sm">
                            <span className="text-red-400 line-through opacity-80 flex-1">{before || "—"}</span>
                            <span className="text-gray-400 shrink-0">→</span>
                            <span className="text-indigo-700 font-medium flex-1 inline-flex items-center gap-1">
                              <CheckCircle size={13} className="shrink-0 text-indigo-500" />
                              {after || "—"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Download */}
          <Button onClick={download} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
            <Download size={16} />
            Korrigierte CSV herunterladen ({result.stats.total.toLocaleString()} Zeilen)
          </Button>

          {/* Vorschau */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Spaltenvorschau</h2>
            <p className="text-sm text-gray-400 mb-3">
              {hasMore ? `Erste 100 von ${result.stats.total.toLocaleString()} Zeilen` : `${result.stats.total.toLocaleString()} Zeilen`}
              {" · "}Geänderte Felder sind <span className="text-indigo-600 font-medium">blau</span> hervorgehoben
              {" · "}<Eye size={12} className="inline" /> Detail-Icon zum Anzeigen aller Beschreibungen
            </p>
            <div className="border rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap sticky left-0 bg-gray-50 z-10">#</th>
                      <th className="px-3 py-2 sticky left-7 bg-gray-50 z-10"></th>
                      {result.headers.map((h) => (
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
                    {result.preview.map((entry, i) => {
                      const { row, original, changed } = entry;
                      return (
                        <tr key={i} className={`border-b last:border-0 ${changed.length > 0 ? "bg-indigo-50/40" : "bg-white"}`}>
                          <td className="px-3 py-1.5 text-gray-400 sticky left-0 bg-inherit z-10">{i + 1}</td>
                          <td className="px-2 py-1.5 sticky left-7 bg-inherit z-10">
                            <button
                              onClick={() => setDetailEntry({ entry, rowNum: i + 1 })}
                              className="p-1 rounded hover:bg-indigo-100 text-gray-400 hover:text-indigo-600 transition-colors"
                              title="Beschreibungen anzeigen"
                            >
                              <Eye size={13} />
                            </button>
                          </td>
                          {result.headers.map((h) => {
                            const origVal = original[h] ?? "";
                            const fixedVal = row[h] ?? "";
                            const wasChanged = changed.includes(h);
                            const display = isDescCol(h) ? truncateHtml(fixedVal) : fixedVal;
                            const origDisplay = isDescCol(h) ? truncateHtml(origVal) : origVal;

                            return (
                              <td key={h} className={`px-3 py-1.5 max-w-xs ${wasChanged ? "bg-indigo-50" : ""}`}>
                                {wasChanged ? (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-red-400 line-through opacity-70">{origDisplay || "—"}</span>
                                    <span className="text-indigo-700 font-semibold inline-flex items-center gap-1">
                                      <CheckCircle size={10} className="shrink-0" />
                                      {display || "—"}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-700">{display || <span className="text-gray-300">—</span>}</span>
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
                … {(result.stats.total - 100).toLocaleString()} weitere Zeilen im Download enthalten
              </p>
            )}
          </div>
        </>
      )}

      {/* Detail-Modal */}
      {detailEntry && (
        <DetailModal
          entry={detailEntry.entry}
          headers={result!.headers}
          rowNum={detailEntry.rowNum}
          onClose={() => setDetailEntry(null)}
        />
      )}
    </div>
  );
}
