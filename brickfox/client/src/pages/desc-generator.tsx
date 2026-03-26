import { useState, useCallback, useRef, useEffect } from "react";
import {
  Upload, Download, Loader2, CheckCircle2, AlertTriangle,
  Sparkles, FileText, Eye, X, Copy, Check,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Papa from "papaparse";

const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const PAGE_SIZE = 50;

interface ProgressState {
  current: number;
  total: number;
  productName: string;
}

interface ResultState {
  generated: number;
  skipped: number;
  errors: number;
  total: number;
}

interface OriginalRow {
  index: number;
  pId: string;
  pItemNumber: string;
  pNameDE: string;
  pDescDE: string;
}

interface PreviewItem {
  index: number;
  pId: string;
  pItemNumber: string;
  pNameDE: string;
  descOrig: string;
  descNew: string;
  changed: boolean;
  skipped: boolean;
}

// ─── Copy Button ──────────────────────────────────────────────────────────────
function CopyButton({ text, label = "Kopieren" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
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
          : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-purple-600 hover:border-purple-300"
      }`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Kopiert!" : label}
    </button>
  );
}

// ─── HTML-Ansicht mit Tabs ────────────────────────────────────────────────────
function DescriptionView({
  html, label, changed, bg = "gray",
}: {
  html: string; label: string; changed?: boolean; bg?: "gray" | "purple";
}) {
  const [tab, setTab] = useState<"preview" | "source">("preview");
  const bgClass = bg === "purple" ? "bg-purple-50 border-purple-200" : "bg-gray-50 border-gray-200";
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-bold text-gray-700">{label}</h3>
        {changed && (
          <Badge className="bg-purple-600 text-white text-xs gap-1">
            <CheckCircle2 size={10} /> generiert
          </Badge>
        )}
        <div className="ml-auto flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          <button
            onClick={() => setTab("preview")}
            className={`px-3 py-1 font-medium transition-colors ${tab === "preview" ? "bg-purple-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
          >Fließtext</button>
          <button
            onClick={() => setTab("source")}
            className={`px-3 py-1 font-medium transition-colors border-l border-gray-200 ${tab === "source" ? "bg-purple-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
          >HTML</button>
        </div>
      </div>
      {tab === "preview" ? (
        <div
          className={`p-4 border rounded-xl overflow-y-auto max-h-72 html-preview ${bgClass}`}
          dangerouslySetInnerHTML={{ __html: html || "<em class='text-gray-400'>Keine Beschreibung</em>" }}
        />
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">HTML-Quelltext</p>
            <CopyButton text={html} />
          </div>
          <pre className="text-xs text-gray-700 p-4 overflow-x-auto overflow-y-auto max-h-72 whitespace-pre-wrap break-words bg-white font-mono leading-relaxed select-all">
            {html || "—"}
          </pre>
        </div>
      )}
    </section>
  );
}

// ─── Detail-Dialog ────────────────────────────────────────────────────────────
function DetailDialog({
  item, rowNum, onClose,
}: {
  item: PreviewItem; rowNum: number; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Zeile {rowNum}</p>
            <h2 className="text-base font-bold text-gray-800 truncate max-w-xl">{item.pNameDE || "—"}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              ID: {item.pId || "—"} · Art.-Nr.: {item.pItemNumber || "—"}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 text-gray-500">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-8">
          <DescriptionView
            html={item.descOrig}
            label="Original Beschreibung"
            bg="gray"
          />
          <DescriptionView
            html={item.descNew}
            label="Neue Beschreibung"
            changed={item.changed}
            bg="purple"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────
export default function DescGenerator() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [originalRows, setOriginalRows] = useState<OriginalRow[]>([]);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [csvBlob, setCsvBlob] = useState<Blob | null>(null);
  const [csvFileName, setCsvFileName] = useState("");
  const [detailItem, setDetailItem] = useState<{ item: PreviewItem; rowNum: number } | null>(null);
  const [showOnlyChanged, setShowOnlyChanged] = useState(false);
  const [page, setPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const parseOriginalFile = async (f: File) => {
    const buf = await f.arrayBuffer();
    const arr = new Uint8Array(buf);
    // UTF-8 BOM?
    const hasBom = arr[0] === 0xEF && arr[1] === 0xBB && arr[2] === 0xBF;
    // Typische Windows-1252 Bytes für deutsche Sonderzeichen (ä ö ü Ä Ö Ü ß)
    const hasWin1252 = !hasBom && Array.from(arr).some(b =>
      b === 0xE4 || b === 0xF6 || b === 0xFC ||
      b === 0xC4 || b === 0xD6 || b === 0xDC || b === 0xDF
    );
    const encoding = hasBom ? 'utf-8' : (hasWin1252 ? 'windows-1252' : 'utf-8');
    const slice = hasBom ? arr.slice(3) : arr;
    const text = new TextDecoder(encoding).decode(slice);
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      delimiter: ";",
      skipEmptyLines: true,
    });
    const rows: OriginalRow[] = parsed.data.map((row, i) => ({
      index: i,
      pId: row["p_id"] ?? "",
      pItemNumber: row["p_item_number"] ?? "",
      pNameDE: row["p_name[de]"] ?? "",
      pDescDE: row["p_description[de]"] ?? "",
    }));
    setOriginalRows(rows);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.name.endsWith(".csv")) {
      setFile(dropped);
      setResult(null);
      setError(null);
      setPreviewItems([]);
      setCsvBlob(null);
      parseOriginalFile(dropped);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setResult(null);
      setError(null);
      setPreviewItems([]);
      setCsvBlob(null);
      parseOriginalFile(selected);
    }
  }, []);

  const handleProcess = async () => {
    if (!file) return;
    setProcessing(true);
    setProgress(null);
    setResult(null);
    setError(null);
    setPreviewItems([]);
    setCsvBlob(null);
    setPage(0);

    const sessionId = genId();
    const eventSource = new EventSource(`/api/desc-generator/progress/${sessionId}`);

    // Handler ZUERST setzen, dann auf Verbindung warten — sonst gehen Events verloren
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.complete) {
          setResult({ generated: data.generated, skipped: data.skipped, errors: data.errors, total: data.total });
          eventSource.close();
          setProgress(null);
        } else if (data.error) {
          setError(data.error);
          eventSource.close();
          setProcessing(false);
          setProgress(null);
        } else {
          setProgress(data);
        }
      } catch {}
    };
    eventSource.onerror = () => { eventSource.close(); setProcessing(false); };

    // Warten bis SSE-Verbindung steht, bevor POST gesendet wird
    await new Promise<void>((resolve) => {
      if (eventSource.readyState === EventSource.OPEN) { resolve(); return; }
      eventSource.onopen = () => resolve();
    });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/desc-generator/generate", {
        method: "POST",
        headers: { "x-session-id": sessionId },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(errData.error ?? "Fehler beim Verarbeiten");
      }

      const blob = await response.blob();
      const baseName = file.name.replace(/\.[^.]+$/, "");
      const fileName = `${baseName}_desc_generated.csv`;

      setCsvBlob(blob);
      setCsvFileName(fileName);

      // Parse new CSV and build preview
      const text = await blob.text();
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        delimiter: ";",
        skipEmptyLines: true,
      });

      const items: PreviewItem[] = parsed.data.map((newRow, i) => {
        const orig = originalRows[i];
        const descNew = newRow["p_description[de]"] ?? "";
        const descOrig = orig?.pDescDE ?? "";
        const changed = descNew !== descOrig && descNew.length > 0;
        return {
          index: i,
          pId: newRow["p_id"] ?? orig?.pId ?? "",
          pItemNumber: newRow["p_item_number"] ?? orig?.pItemNumber ?? "",
          pNameDE: newRow["p_name[de]"] ?? orig?.pNameDE ?? "",
          descOrig,
          descNew,
          changed,
          skipped: !changed,
        };
      });
      setPreviewItems(items);
      setProcessing(false);
      toast({ title: "Fertig", description: `${items.filter(i => i.changed).length} Beschreibungen generiert.` });
    } catch (err: any) {
      setError(err.message ?? "Unbekannter Fehler");
      eventSource.close();
      setProcessing(false);
      setProgress(null);
    }
  };

  const handleExport = () => {
    if (!csvBlob || !csvFileName) return;
    const url = URL.createObjectURL(csvBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const progressPercent = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  const filteredItems = showOnlyChanged
    ? previewItems.filter((i) => i.changed)
    : previewItems;
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  const pageItems = filteredItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const changedCount = previewItems.filter((i) => i.changed).length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="h-7 w-7 text-purple-500" />
          <h1 className="text-3xl font-bold">Beschreibungs-Generator</h1>
        </div>
        <p className="text-muted-foreground">
          Normalisiert alle Produktbeschreibungen in die einheitliche HTML-Struktur (1.200–2.000 Zeichen).
          Egal ob kurz, lang, Plain Text oder chaotisches HTML — nur bereits korrekt strukturierte Beschreibungen werden übersprungen.
        </p>
      </div>

      {/* Upload */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            CSV hochladen
          </CardTitle>
          <CardDescription>
            Brickfox-Export CSV (Semikolon-getrennt). Benötigte Spalten:{" "}
            <code className="text-xs bg-muted px-1 rounded">p_description[de]</code> und{" "}
            <code className="text-xs bg-muted px-1 rounded">p_name[de]</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
              isDragging ? "border-purple-400 bg-purple-50" : "border-muted-foreground/30 hover:border-purple-300"
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            {file ? (
              <div>
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB · {originalRows.length.toLocaleString()} Zeilen erkannt
                </p>
              </div>
            ) : (
              <div>
                <p className="font-medium">CSV hier ablegen oder klicken</p>
                <p className="text-sm text-muted-foreground">CSV-Dateien</p>
              </div>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />

          {file && !processing && (
            <Button className="mt-4 w-full gap-2 bg-purple-600 hover:bg-purple-700" onClick={handleProcess}>
              <Sparkles className="h-4 w-4" />
              Beschreibungen generieren
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Fortschritt */}
      {processing && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
              <span className="font-medium">KI generiert Beschreibungen…</span>
            </div>
            {progress && progress.total === 0 && (
              <div className="text-sm text-muted-foreground animate-pulse mt-1">
                {progress.productName}
              </div>
            )}
            {progress && progress.total > 0 && (
              <>
                <Progress value={progressPercent} className="mb-2" />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span className="truncate max-w-xs">{progress.productName}</span>
                  <span>{progress.current} / {progress.total}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Fehler */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Ergebnis + Export */}
      {result && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="font-semibold text-lg">Fertig!</span>
              </div>
              {csvBlob && (
                <Button onClick={handleExport} className="gap-2 bg-purple-600 hover:bg-purple-700">
                  <Download className="h-4 w-4" />
                  CSV exportieren
                </Button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-green-700">{result.generated}</p>
                <p className="text-sm text-muted-foreground">Generiert</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-gray-600">{result.skipped}</p>
                <p className="text-sm text-muted-foreground">Übersprungen</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-red-600">{result.errors}</p>
                <p className="text-sm text-muted-foreground">Fehler</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Spaltenvorschau */}
      {previewItems.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-800">
              Spaltenvorschau
              <span className="ml-2 text-sm font-normal text-gray-400">
                {previewItems.length.toLocaleString()} Zeilen
                {changedCount > 0 && ` · ${changedCount.toLocaleString()} generiert`}
                {" "}· Klick auf <Eye size={12} className="inline" /> für Details
              </span>
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowOnlyChanged((v) => !v); setPage(0); }}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  showOnlyChanged
                    ? "bg-purple-600 text-white border-purple-600 hover:bg-purple-700"
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {showOnlyChanged ? "Nur Generierte" : "Alle anzeigen"}
              </button>
              {totalPages > 1 && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span>
                    Seite {page + 1} / {totalPages} · Zeilen{" "}
                    {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, filteredItems.length).toLocaleString()}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page === totalPages - 1}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="text-xs w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 border-b">
                    <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">#</th>
                    <th className="px-2 py-2 w-8"></th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">p_id</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Artikel-Nr.</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Name DE</th>
                    <th className="px-3 py-2 text-left font-semibold text-purple-700 whitespace-nowrap bg-purple-50">Beschreibung DE</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item) => (
                    <tr
                      key={item.index}
                      className={`border-b last:border-0 ${item.changed ? "bg-purple-50/30" : "bg-white"}`}
                    >
                      <td className="px-3 py-1.5 text-gray-400">{item.index + 1}</td>
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() => setDetailItem({ item, rowNum: item.index + 1 })}
                          className="p-1 rounded hover:bg-purple-100 text-gray-400 hover:text-purple-600 transition-colors"
                          title="Beschreibung anzeigen"
                        >
                          <Eye size={13} />
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-gray-400 font-mono text-xs">{item.pId || "—"}</td>
                      <td className="px-3 py-1.5 text-gray-600 font-mono text-xs">{item.pItemNumber || "—"}</td>
                      <td className="px-3 py-1.5 max-w-xs">
                        <span className="text-gray-700 truncate block">{item.pNameDE || "—"}</span>
                      </td>
                      <td className="px-3 py-1.5 max-w-sm bg-purple-50/40">
                        {item.changed ? (
                          <span className="flex items-center gap-1 text-purple-700 font-medium">
                            <CheckCircle2 size={10} className="shrink-0 text-purple-500" />
                            <span className="truncate block">
                              {item.descNew.replace(/<[^>]+>/g, " ").trim().slice(0, 80)}…
                            </span>
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">übersprungen</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-3">
              <button
                onClick={() => setPage(0)}
                disabled={page === 0}
                className="text-xs px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-30"
              >« Erste</button>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
              ><ChevronLeft size={16} /></button>
              <span className="text-sm text-gray-600">Seite {page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
              ><ChevronRight size={16} /></button>
              <button
                onClick={() => setPage(totalPages - 1)}
                disabled={page === totalPages - 1}
                className="text-xs px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-30"
              >Letzte »</button>
            </div>
          )}
        </div>
      )}

      {/* Detail-Dialog */}
      {detailItem && (
        <DetailDialog
          item={detailItem.item}
          rowNum={detailItem.rowNum}
          onClose={() => setDetailItem(null)}
        />
      )}
    </div>
  );
}
