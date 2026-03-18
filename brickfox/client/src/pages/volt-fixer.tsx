import { useState, useRef, useCallback } from "react";
import { Upload, Download, CheckCircle, AlertCircle, FileText, Loader2, Eye, X, ChevronLeft, ChevronRight, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const VOLT_COL = "p_attributes[akku_v][de]";
const DESC_COLS = ["p_description[de]", "p_description[nl]"];
const NAME_COLS = ["p_name[de]", "p_name[nl]"];
const NAME_COL_LABELS: Record<string, string> = { "p_name[de]": "DE", "p_name[nl]": "NL" };
const DETAIL_COLS = [...NAME_COLS, ...DESC_COLS, VOLT_COL];
const PAGE_SIZE = 500;

type PreviewItem = {
  index: number;
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
  previewItems: PreviewItem[];
  allChangedNames: ChangedNameEntry[];
  allExtractedVolt: ExtractedVoltEntry[];
};

type DetailData = {
  row: Record<string, string>;
  original: Record<string, string>;
  changed: string[];
  headers: string[];
};

// Copy-Button mit kurzem "Kopiert!"-Feedback
function CopyButton({ text, label = "HTML kopieren" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback für iframe-Umgebungen (Replit-Preview, etc.)
      const el = document.createElement("textarea");
      el.value = text;
      el.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
        copied
          ? "bg-green-50 border-green-300 text-green-700"
          : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-indigo-600 hover:border-indigo-300"
      }`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Kopiert!" : label}
    </button>
  );
}

// Detail-Modal
function DetailModal({
  jobId,
  index,
  rowNum,
  onClose,
}: {
  jobId: string;
  index: number;
  rowNum: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useState(() => {
    fetch(`/api/volt-fixer/detail/${jobId}/${index}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setErr("Fehler beim Laden"); setLoading(false); });
  });

  const detailCols = data ? data.headers.filter((h) => DETAIL_COLS.includes(h)) : [];
  const otherCols = data ? data.headers.filter((h) => !DETAIL_COLS.includes(h)) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Zeile {rowNum} – Detailansicht</h2>
            <p className="text-sm text-gray-400">{data?.row["p_item_number"] || data?.row["v_item_number"] || ""}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 text-gray-500"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          {loading && <div className="flex items-center gap-2 text-gray-400"><Loader2 size={18} className="animate-spin" /> Lade Daten…</div>}
          {err && <p className="text-red-500">{err}</p>}
          {data && (
            <>
              {detailCols.map((h) => {
                const origVal = data.original[h] ?? "";
                const fixedVal = data.row[h] ?? "";
                const wasChanged = data.changed.includes(h);
                const isDesc = DESC_COLS.includes(h);
                return (
                  <div key={h}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        h === VOLT_COL ? "bg-indigo-100 text-indigo-700" :
                        isDesc ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                      }`}>{h}</span>
                      {wasChanged && <Badge className="bg-indigo-600 text-white text-xs gap-1"><CheckCircle size={10} /> geändert</Badge>}
                      {isDesc && fixedVal && <CopyButton text={fixedVal} label="HTML kopieren" />}
                    </div>

                    {wasChanged && (
                      <div className="mb-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-xs text-red-500 font-medium mb-1">Original:</p>
                        {isDesc
                          ? <div className="text-xs text-red-600 max-h-32 overflow-y-auto" dangerouslySetInnerHTML={{ __html: origVal }} />
                          : <p className="text-sm text-red-600 line-through">{origVal}</p>}
                      </div>
                    )}

                    {isDesc ? (
                      <div className="space-y-2">
                        {/* Gerenderte Vorschau */}
                        <div className={`p-3 rounded-lg border ${wasChanged ? "bg-indigo-50 border-indigo-200" : "bg-gray-50 border-gray-200"}`}>
                          {wasChanged && <p className="text-xs text-indigo-500 font-medium mb-1">Vorschau (gerendert):</p>}
                          <div className="text-xs text-gray-700 max-h-48 overflow-y-auto prose prose-xs max-w-none" dangerouslySetInnerHTML={{ __html: fixedVal }} />
                        </div>
                        {/* HTML-Quelltext zum Kopieren */}
                        <div className="rounded-lg border border-gray-200 overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 border-b border-gray-200">
                            <span className="text-xs font-medium text-gray-500">HTML-Quelltext</span>
                            <CopyButton text={fixedVal} label="Kopieren" />
                          </div>
                          <pre className="text-xs text-gray-700 p-3 overflow-x-auto overflow-y-auto max-h-56 whitespace-pre-wrap break-words bg-white font-mono leading-relaxed select-all">
                            {fixedVal || <span className="text-gray-300 italic">leer</span>}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <div className={`p-3 rounded-lg border ${wasChanged ? "bg-indigo-50 border-indigo-200" : "bg-gray-50 border-gray-200"}`}>
                        {wasChanged && <p className="text-xs text-indigo-500 font-medium mb-1">Korrigiert:</p>}
                        <p className="text-sm text-gray-800">{fixedVal || <span className="text-gray-300 italic">leer</span>}</p>
                      </div>
                    )}
                  </div>
                );
              })}
              {otherCols.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 mb-3">Weitere Spalten</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {otherCols.map((h) => (
                      <div key={h} className="bg-gray-50 rounded-lg px-3 py-2">
                        <p className="text-xs text-gray-400 mb-0.5">{h}</p>
                        <p className="text-xs text-gray-700 truncate">{data.row[h] || "—"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
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
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<{ index: number; rowNum: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    setLoading(true);
    setError("");
    setResult(null);
    setPage(0);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/volt-fixer/upload", { method: "POST", body: formData });
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

  const openDetail = useCallback((index: number, rowNum: number) => {
    setDetail({ index, rowNum });
  }, []);

  const items = result?.previewItems ?? [];
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Volt-Komma Fixer</h1>
        <p className="text-gray-500 mt-1">
          Korrigiert <code className="bg-gray-100 px-1 rounded text-sm">{VOLT_COL}</code> (z.B.{" "}
          <strong>385 → 3,85</strong>) und aktualisiert Spannung/Nennspannung in den Produktbeschreibungen.
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

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
        </div>
      )}

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

          {/* Download */}
          <Button onClick={download} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
            <Download size={16} />
            Korrigierte CSV herunterladen ({result.stats.total.toLocaleString()} Zeilen)
          </Button>

          {/* Aus Produktnamen extrahierte Volt-Werte */}
          {(result.allExtractedVolt ?? []).length > 0 && (
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

          {/* Geänderte Namen */}
          {result.allChangedNames.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-1">
                Geänderte Produktnamen
                <span className="ml-2 text-sm font-normal text-gray-400">{result.allChangedNames.length.toLocaleString()} Produkte</span>
              </h2>
              <div className="border rounded-xl overflow-hidden shadow-sm divide-y max-h-[600px] overflow-y-auto">
                {result.allChangedNames.map((entry, i) => (
                  <div key={i} className="px-4 py-3 bg-white hover:bg-gray-50">
                    <p className="text-xs text-gray-400 mb-2 font-mono">{entry.itemNr || `Zeile ${i + 1}`}</p>
                    <div className="space-y-2">
                      {entry.cols.map(({ col, before, after }) => (
                        <div key={col} className="flex flex-col gap-1">
                          <span className="text-xs font-semibold text-purple-600 uppercase tracking-wide">{NAME_COL_LABELS[col] ?? col}</span>
                          <div className="flex items-start gap-3 text-sm">
                            <span className="text-red-400 line-through opacity-80 flex-1">{before || "—"}</span>
                            <span className="text-gray-400 shrink-0">→</span>
                            <span className="text-indigo-700 font-medium flex-1 inline-flex items-center gap-1">
                              <CheckCircle size={13} className="shrink-0 text-indigo-500" />{after || "—"}
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

          {/* Spaltenvorschau – alle Produkte mit Pagination */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold text-gray-800">
                Spaltenvorschau
                <span className="ml-2 text-sm font-normal text-gray-400">
                  {items.length.toLocaleString()} Produkte · Klick auf <Eye size={12} className="inline" /> für vollständige Details
                </span>
              </h2>
              {totalPages > 1 && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span>Seite {page + 1} / {totalPages} · Zeilen {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, items.length).toLocaleString()}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page === totalPages - 1}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>

            <div className="border rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                <table className="text-xs w-full">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-50 border-b">
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">#</th>
                      <th className="px-2 py-2 w-8"></th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Artikel-Nr.</th>
                      <th className="px-3 py-2 text-left font-semibold text-indigo-700 whitespace-nowrap bg-indigo-50">Volt (vorher)</th>
                      <th className="px-3 py-2 text-left font-semibold text-indigo-700 whitespace-nowrap bg-indigo-50">Volt (nachher)</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Name DE</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Name NL</th>
                      <th className="px-3 py-2 text-left font-semibold text-green-700 whitespace-nowrap bg-green-50">Beschreibung DE</th>
                      <th className="px-3 py-2 text-left font-semibold text-green-700 whitespace-nowrap bg-green-50">Beschreibung NL</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Geändert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((item) => {
                      const hasChange = item.changed.length > 0;
                      const voltChanged = item.changed.includes(VOLT_COL);
                      const nameDEChanged = item.changed.includes("p_name[de]");
                      const nameNLChanged = item.changed.includes("p_name[nl]");
                      return (
                        <tr key={item.index} className={`border-b last:border-0 ${hasChange ? "bg-indigo-50/30" : "bg-white"}`}>
                          <td className="px-3 py-1.5 text-gray-400">{item.index + 1}</td>
                          <td className="px-2 py-1.5">
                            <button
                              onClick={() => openDetail(item.index, item.index + 1)}
                              className="p-1 rounded hover:bg-indigo-100 text-gray-400 hover:text-indigo-600 transition-colors"
                              title="Alle Felder anzeigen"
                            >
                              <Eye size={13} />
                            </button>
                          </td>
                          <td className="px-3 py-1.5 text-gray-600 font-mono text-xs">{item.itemNr || "—"}</td>
                          <td className={`px-3 py-1.5 ${voltChanged ? "text-red-400 line-through opacity-70" : "text-gray-500"}`}>
                            {item.voltOrig || "—"}
                          </td>
                          <td className={`px-3 py-1.5 font-semibold ${voltChanged ? "text-indigo-700" : "text-gray-700"}`}>
                            {voltChanged && <CheckCircle size={10} className="inline mr-1 text-indigo-500" />}
                            {item.voltNew || "—"}
                          </td>
                          <td className="px-3 py-1.5 max-w-xs">
                            {nameDEChanged ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-red-400 line-through opacity-70 truncate">{item.nameDEOrig}</span>
                                <span className="text-indigo-700 truncate">{item.nameDE}</span>
                              </div>
                            ) : (
                              <span className="text-gray-700 truncate block">{item.nameDE || "—"}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 max-w-xs">
                            {nameNLChanged ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-red-400 line-through opacity-70 truncate">{item.nameNLOrig}</span>
                                <span className="text-indigo-700 truncate">{item.nameNL}</span>
                              </div>
                            ) : (
                              <span className="text-gray-700 truncate block">{item.nameNL || "—"}</span>
                            )}
                          </td>
                          <td className={`px-3 py-1.5 max-w-sm ${item.descDEChanged ? "bg-green-50/60" : ""}`}>
                            {item.descDE ? (
                              <span className={`block truncate ${item.descDEChanged ? "text-green-800 font-medium" : "text-gray-600"}`}>
                                {item.descDEChanged && <CheckCircle size={10} className="inline mr-1 text-green-600" />}
                                {item.descDE}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className={`px-3 py-1.5 max-w-sm ${item.descNLChanged ? "bg-green-50/60" : ""}`}>
                            {item.descNL ? (
                              <span className={`block truncate ${item.descNLChanged ? "text-green-800 font-medium" : "text-gray-600"}`}>
                                {item.descNLChanged && <CheckCircle size={10} className="inline mr-1 text-green-600" />}
                                {item.descNL}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-1.5">
                            {hasChange ? (
                              <span className="text-xs text-indigo-600 font-medium">{item.changed.length} Feld{item.changed.length !== 1 ? "er" : ""}</span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination unten */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-3">
                <button onClick={() => setPage(0)} disabled={page === 0} className="text-xs px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-30">« Erste</button>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  const p = totalPages <= 7 ? i : Math.max(0, Math.min(page - 3, totalPages - 7)) + i;
                  return (
                    <button key={p} onClick={() => setPage(p)} className={`text-xs px-3 py-1 rounded border ${p === page ? "bg-indigo-600 text-white border-indigo-600" : "hover:bg-gray-50"}`}>{p + 1}</button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={16} /></button>
                <button onClick={() => setPage(totalPages - 1)} disabled={page === totalPages - 1} className="text-xs px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-30">Letzte »</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Detail-Modal */}
      {detail && result && (
        <DetailModal
          jobId={result.jobId}
          index={detail.index}
          rowNum={detail.rowNum}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
