import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Download, CheckCircle, AlertCircle, FileText, Loader2, Eye, X, ChevronLeft, ChevronRight, Copy, Check, Save, Trash2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const VOLT_COL = "p_attributes[akku_v][de]";
const DESC_COLS = ["p_description[de]", "p_description[nl]"];
const NAME_COLS = ["p_name[de]", "p_name[nl]"];
// Volt-Werte >= 1000 sind unrealistisch und werden nicht angezeigt
const isUnrealisticVolt = (v: string) => { const n = Number(v.replace(',', '.')); return v !== '' && !isNaN(n) && n >= 1000; };
const NAME_COL_LABELS: Record<string, string> = { "p_name[de]": "DE", "p_name[nl]": "NL" };
const PAGE_SIZE = 500;

type PreviewItem = {
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

type CsvIssue = { row: number; itemNr: string; type: string; detail: string };

type SaveMeta = {
  id: string;
  name: string;
  savedAt: string;
  fileName: string;
  totalRows: number;
  changedRows: number;
};

type Result = {
  jobId: string;
  headers: string[];
  fileName: string;
  stats: { total: number; voltChanged: number; voltSkipped: number; voltSkippedNonElectronic: number; voltExtracted: number; dreiSpannungCount?: number; htmlCorrectedCount?: number };
  previewItems: PreviewItem[];
  allChangedNames: ChangedNameEntry[];
  allExtractedVolt: ExtractedVoltEntry[];
  csvIssues?: CsvIssue[];
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

        <div className="overflow-y-auto p-6 space-y-8">
          {loading && <div className="flex items-center gap-2 text-gray-400"><Loader2 size={18} className="animate-spin" /> Lade Daten…</div>}
          {err && <p className="text-red-500">{err}</p>}
          {data && (() => {
            const origDE  = data.original["p_description[de]"] ?? "";
            const fixedDE = data.row["p_description[de]"] ?? "";
            const origNL  = data.original["p_description[nl]"] ?? "";
            const fixedNL = data.row["p_description[nl]"] ?? "";
            const origV   = data.original[VOLT_COL] ?? "";
            const fixedV  = data.row[VOLT_COL] ?? "";
            const vChanged  = data.changed.includes(VOLT_COL);
            const deChanged = data.changed.includes("p_description[de]");
            const nlChanged = data.changed.includes("p_description[nl]");

            const origNameDE  = data.original["p_name[de]"] ?? "";
            const fixedNameDE = data.row["p_name[de]"] ?? "";
            const origNameNL  = data.original["p_name[nl]"] ?? "";
            const fixedNameNL = data.row["p_name[nl]"] ?? "";
            const nameDeChanged = data.changed.includes("p_name[de]");
            const nameNlChanged = data.changed.includes("p_name[nl]");

            return (
              <>
                {/* ── 0. Produktnamen ── */}
                {(origNameDE || origNameNL) && (
                  <section>
                    <h3 className="text-sm font-bold text-gray-700 mb-3 pb-1 border-b">Produktnamen</h3>
                    <div className="grid grid-cols-1 gap-3">
                      {origNameDE && (
                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                          <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name DE</span>
                            {nameDeChanged && <Badge className="bg-indigo-600 text-white text-xs gap-1"><CheckCircle size={10} /> geändert</Badge>}
                          </div>
                          <div className="px-4 py-3 space-y-1">
                            {nameDeChanged ? (
                              <>
                                <p className="text-xs text-gray-400">Original</p>
                                <p className="text-sm text-red-500 line-through">{origNameDE}</p>
                                <p className="text-xs text-gray-400 mt-1">Korrigiert</p>
                                <p className="text-sm font-semibold text-indigo-700">{fixedNameDE}</p>
                              </>
                            ) : (
                              <p className="text-sm text-gray-800">{origNameDE}</p>
                            )}
                          </div>
                        </div>
                      )}
                      {origNameNL && (
                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                          <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name NL</span>
                            {nameNlChanged && <Badge className="bg-indigo-600 text-white text-xs gap-1"><CheckCircle size={10} /> geändert</Badge>}
                          </div>
                          <div className="px-4 py-3 space-y-1">
                            {nameNlChanged ? (
                              <>
                                <p className="text-xs text-gray-400">Original</p>
                                <p className="text-sm text-red-500 line-through">{origNameNL}</p>
                                <p className="text-xs text-gray-400 mt-1">Korrigiert</p>
                                <p className="text-sm font-semibold text-indigo-700">{fixedNameNL}</p>
                              </>
                            ) : (
                              <p className="text-sm text-gray-800">{origNameNL}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* ── 1. Original Text Deutsch ── */}
                {origDE && (
                  <section>
                    <h3 className="text-sm font-bold text-gray-700 mb-3 pb-1 border-b">Original Text Deutsch</h3>
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl overflow-y-auto max-h-96 html-preview"
                      dangerouslySetInnerHTML={{ __html: origDE }} />
                  </section>
                )}

                {/* ── 2. Geänderter Text Deutsch ── */}
                {fixedDE && (
                  <section>
                    <h3 className="text-sm font-bold text-gray-700 mb-3 pb-1 border-b flex items-center gap-2">
                      Geänderter Text Deutsch
                      {deChanged && <Badge className="bg-indigo-600 text-white text-xs gap-1"><CheckCircle size={10} /> geändert</Badge>}
                    </h3>

                    {/* Fließtext */}
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Fließtext</p>
                    <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl overflow-y-auto max-h-96 html-preview mb-3"
                      dangerouslySetInnerHTML={{ __html: fixedDE }} />

                    {/* HTML-Quelltext */}
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">HTML-Quelltext</p>
                        <CopyButton text={fixedDE} label="Kopieren" />
                      </div>
                      <pre className="text-xs text-gray-700 p-4 overflow-x-auto overflow-y-auto max-h-52 whitespace-pre-wrap break-words bg-white font-mono leading-relaxed select-all">
                        {fixedDE}
                      </pre>
                    </div>
                  </section>
                )}

                {/* ── 3. Original Text Niederländisch ── */}
                {origNL && (
                  <section>
                    <h3 className="text-sm font-bold text-gray-700 mb-3 pb-1 border-b">Original Text Niederländisch</h3>
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl overflow-y-auto max-h-64 html-preview"
                      dangerouslySetInnerHTML={{ __html: origNL }} />
                  </section>
                )}

                {/* ── 4. Geänderter Text Niederländisch ── */}
                {fixedNL && (
                  <section>
                    <h3 className="text-sm font-bold text-gray-700 mb-3 pb-1 border-b flex items-center gap-2">
                      Geänderter Text Niederländisch
                      {nlChanged && <Badge className="bg-indigo-600 text-white text-xs gap-1"><CheckCircle size={10} /> geändert</Badge>}
                    </h3>

                    {/* Fließtext */}
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Fließtext</p>
                    <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl overflow-y-auto max-h-96 html-preview mb-3"
                      dangerouslySetInnerHTML={{ __html: fixedNL }} />

                    {/* HTML-Quelltext */}
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">HTML-Quelltext</p>
                        <CopyButton text={fixedNL} label="Kopieren" />
                      </div>
                      <pre className="text-xs text-gray-700 p-4 overflow-x-auto overflow-y-auto max-h-52 whitespace-pre-wrap break-words bg-white font-mono leading-relaxed select-all">
                        {fixedNL}
                      </pre>
                    </div>
                  </section>
                )}

                {/* ── 5. Volt-Wert ── */}
                {(origV || fixedV) && (
                  <section>
                    <h3 className="text-sm font-bold text-gray-700 mb-3 pb-1 border-b flex items-center gap-2">
                      {VOLT_COL}
                      {vChanged && <Badge className="bg-indigo-600 text-white text-xs gap-1"><CheckCircle size={10} /> geändert</Badge>}
                    </h3>
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-400 mb-0.5">Original</span>
                        <span className={`text-xl font-bold ${vChanged ? "text-red-400 line-through" : "text-gray-700"}`}>{origV || "—"}</span>
                      </div>
                      {vChanged && (
                        <>
                          <span className="text-2xl text-gray-300">→</span>
                          <div className="flex flex-col">
                            <span className="text-xs text-gray-400 mb-0.5">Korrigiert</span>
                            <span className="text-2xl font-bold text-indigo-700">{fixedV}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </section>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

type ProgressState = { step: string; stepLabel: string; percent: number; detail: string };

function CostConfirmDialog({ fileSizeMB, onConfirm, onCancel }: { fileSizeMB: number; onConfirm: () => void; onCancel: () => void }) {
  const estChars = Math.round(fileSizeMB * 1024 * 1024 * 0.4); // ~40% sind Text
  const estCostLow  = ((estChars / 1_000_000) * 14).toFixed(0);
  const estCostHigh = ((estChars / 1_000_000) * 25).toFixed(0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="text-3xl">⚠️</div>
          <div>
            <h2 className="text-lg font-bold text-red-700">Kosten-Bestätigung erforderlich</h2>
            <p className="text-sm text-gray-600 mt-1">
              Diese Option übersetzt die Beschreibungen via DeepL API. Das erzeugt echte Kosten.
            </p>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-600">Dateigröße:</span><span className="font-medium">{fileSizeMB.toFixed(1)} MB</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Geschätzte Zeichen:</span><span className="font-medium">~{(estChars / 1_000_000).toFixed(1)} Mio.</span></div>
          <div className="flex justify-between border-t border-red-200 pt-1 mt-1"><span className="text-gray-700 font-semibold">Geschätzte Kosten:</span><span className="font-bold text-red-700">€{estCostLow}–€{estCostHigh}</span></div>
        </div>
        <p className="text-xs text-gray-500">Die tatsächlichen Kosten hängen vom DeepL-Tarif und der Anzahl der zu übersetzenden Produkte ab.</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium text-sm">Abbrechen</button>
          <button onClick={onConfirm} className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 font-medium text-sm">Ja, kostenpflichtig starten</button>
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
  const [restoreEmoji, setRestoreEmoji] = useState(false);
  const [useDeForNL, setUseDeForNL] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const currentJobIdRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [editingVolt, setEditingVolt] = useState<{ index: number; value: string } | null>(null);
  const [patchSaving, setPatchSaving] = useState(false);

  // Saves (Projektübersicht)
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [savesLoading, setSavesLoading] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [loadingSaveId, setLoadingSaveId] = useState<string | null>(null);

  const loadSaves = useCallback(async () => {
    setSavesLoading(true);
    try {
      const r = await fetch('/api/volt-fixer/saves');
      if (r.ok) setSaves((await r.json() as SaveMeta[]).reverse());
    } catch { /* ignore */ } finally { setSavesLoading(false); }
  }, []);

  useEffect(() => { loadSaves(); }, [loadSaves]);

  const handleSave = async () => {
    if (!result || !saveName.trim()) return;
    setIsSaving(true);
    try {
      const r = await fetch('/api/volt-fixer/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: result.jobId, name: saveName.trim() }),
      });
      if (r.ok) {
        setSaveDialogOpen(false);
        setSaveName("");
        await loadSaves();
      }
    } catch { /* ignore */ } finally { setIsSaving(false); }
  };

  const handleLoadSave = async (saveId: string) => {
    setLoadingSaveId(saveId);
    setError("");
    try {
      const r = await fetch(`/api/volt-fixer/saves/${saveId}/load`, { method: 'POST' });
      if (!r.ok) { setError('Fehler beim Laden des Projekts'); return; }
      const data = await r.json() as Result;
      setResult(data);
      setPage(0);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch { setError('Fehler beim Laden des Projekts'); } finally { setLoadingSaveId(null); }
  };

  const handleDeleteSave = async (saveId: string) => {
    if (!confirm('Dieses Projekt wirklich löschen?')) return;
    await fetch(`/api/volt-fixer/saves/${saveId}`, { method: 'DELETE' });
    await loadSaves();
  };

  // Fortschritt alle 1 Sekunde abrufen während Upload läuft
  useEffect(() => {
    if (!loading || !currentJobIdRef.current) return;
    const id = currentJobIdRef.current;
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`/api/volt-fixer/progress/${id}`);
        if (r.ok) {
          const p: ProgressState = await r.json();
          // "waiting" nicht anzeigen wenn wir bereits eine höhere Prozentzahl haben
          if (p.step === 'waiting') return;
          setProgress(p);
        }
      } catch { /* ignorieren */ }
    }, 1000);
    return () => clearInterval(interval);
  }, [loading]);

  const uploadFile = (file: File) => {
    const clientJobId = crypto.randomUUID();
    currentJobIdRef.current = clientJobId;

    setLoading(true);
    setError("");
    setResult(null);
    setPage(0);
    setProgress({ step: 'uploading', stepLabel: 'Datei wird hochgeladen…', percent: 1, detail: `0 / ${(file.size / 1024 / 1024).toFixed(1)} MB` });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("restoreEmoji", String(restoreEmoji));
    formData.append("useDeForNL", String(useDeForNL));
    formData.append("clientJobId", clientJobId);

    const xhr = new XMLHttpRequest();

    // Echter Upload-Fortschritt (0–30%)
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.max(1, Math.round((e.loaded / e.total) * 30));
      const loadedMB = (e.loaded / 1024 / 1024).toFixed(1);
      const totalMB  = (e.total  / 1024 / 1024).toFixed(1);
      setProgress({ step: 'uploading', stepLabel: 'Datei wird hochgeladen…', percent: pct, detail: `${loadedMB} / ${totalMB} MB` });
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) throw new Error(data.error || "Upload fehlgeschlagen");
        setResult(data);
        setProgress({ step: 'done', stepLabel: 'Fertig!', percent: 100, detail: '' });
        // Zum Ergebnis scrollen
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      } catch (e: any) {
        setError(e.message || "Unbekannter Fehler");
        setProgress(null);
      } finally {
        setLoading(false);
        currentJobIdRef.current = null;
      }
    };

    xhr.onerror = () => {
      setError("Netzwerkfehler beim Upload");
      setProgress(null);
      setLoading(false);
      currentJobIdRef.current = null;
    };

    xhr.open("POST", "/api/volt-fixer/upload");
    xhr.send(formData);
  };

  const handleFile = (file: File) => {
    if (useDeForNL) {
      // Kostenbestätigung erforderlich
      setPendingFile(file);
    } else {
      uploadFile(file);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const download = () => {
    if (!result) return;
    window.open(`/api/volt-fixer/download/${result.jobId}`, "_blank");
  };

  const openDetail = useCallback((index: number, rowNum: number) => {
    setDetail({ index, rowNum });
  }, []);

  const saveVoltEdit = async (index: number, newVolt: string) => {
    if (!result) return;
    setPatchSaving(true);
    try {
      const res = await fetch(`/api/volt-fixer/patch-volt/${result.jobId}/${index}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volt: newVolt }),
      });
      if (!res.ok) throw new Error("Fehler beim Speichern");
      // previewItems lokal aktualisieren
      setResult(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          previewItems: prev.previewItems.map(item =>
            item.index === index
              ? {
                  ...item,
                  voltNew: newVolt,
                  changed: newVolt
                    ? item.changed.includes(VOLT_COL) ? item.changed : [...item.changed, VOLT_COL]
                    : item.changed.filter(c => c !== VOLT_COL),
                }
              : item
          ),
        };
      });
    } catch {
      // Fehler still ignorieren — Wert bleibt im Input
    } finally {
      setPatchSaving(false);
      setEditingVolt(null);
    }
  };

  const [showOnlyChanged, setShowOnlyChanged] = useState(false);
  const allItems = result?.previewItems ?? [];
  const items = showOnlyChanged ? allItems.filter(it => it.changed.length > 0) : allItems;
  const changedCount = allItems.filter(it => it.changed.length > 0).length;
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

      {/* Projektübersicht */}
      {(saves.length > 0 || savesLoading) && (
        <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
            <FolderOpen size={16} className="text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-700">Gespeicherte Projekte</h2>
            <span className="ml-auto text-xs text-gray-400">{saves.length} Projekt{saves.length !== 1 ? 'e' : ''}</span>
          </div>
          {savesLoading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-400"><Loader2 size={14} className="animate-spin" /> Lade…</div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {saves.map(s => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {s.fileName} · {s.totalRows.toLocaleString()} Zeilen · {s.changedRows.toLocaleString()} geändert · {new Date(s.savedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button
                    onClick={() => handleLoadSave(s.id)}
                    disabled={loadingSaveId === s.id}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 font-medium shrink-0"
                  >
                    {loadingSaveId === s.id ? <Loader2 size={12} className="animate-spin" /> : <FolderOpen size={12} />}
                    Laden
                  </button>
                  <button
                    onClick={() => handleDeleteSave(s.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
          <div className="w-full px-2 py-2 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <Loader2 className="text-indigo-500 animate-spin shrink-0" size={22} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 text-sm truncate">
                  {progress?.stepLabel ?? 'Wird verarbeitet…'}
                </p>
                {progress?.detail && (
                  <p className="text-xs text-gray-400 mt-0.5">{progress.detail}</p>
                )}
              </div>
              <span className="text-sm font-bold text-indigo-600 shrink-0">
                {progress?.percent ?? 0}%
              </span>
            </div>
            {/* Fortschrittsbalken */}
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progress?.percent ?? 0}%` }}
              />
            </div>
            {/* Schritt-Indikatoren */}
            <div className="flex justify-between text-xs text-gray-400">
              {[
                { key: 'uploading', label: 'Hochladen' },
                { key: 'parsing',   label: 'Lesen' },
                { key: 'fixing',    label: 'Korrigieren' },
                { key: 'building',  label: 'Aufbereiten' },
              ].map(({ key, label }) => {
                const steps = ['uploading','parsing','fixing','building','done'];
                const current = progress?.step ?? 'uploading';
                const currentIdx = steps.indexOf(current);
                const thisIdx = steps.indexOf(key);
                const isDone = current === 'done' || (currentIdx > thisIdx && thisIdx !== -1);
                const isActive = currentIdx === thisIdx;
                return (
                  <span key={key} className={`flex items-center gap-1 ${isDone ? 'text-indigo-600 font-medium' : isActive ? 'text-indigo-400 font-medium' : ''}`}>
                    {isDone && <CheckCircle size={10} />}
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <Upload className="mx-auto mb-3 text-indigo-500" size={36} />
            <p className="font-medium text-gray-700">CSV hierher ziehen oder klicken</p>
            <p className="text-sm text-gray-400 mt-1">Semikolon-getrennt · UTF-8 oder Windows-1252 · beliebig groß</p>
          </>
        )}
        <input ref={fileRef} type="file" accept=".csv,.CSV" className="hidden" onChange={onFileChange} />
      </div>

      {/* Übersetzungs-Option deaktiviert */}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {result && (
        <div ref={resultRef}>
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
            {(result.stats.voltSkipped - (result.stats.voltSkippedNonElectronic ?? 0)) > 0 && (
              <Badge variant="outline" className="text-gray-400">
                {(result.stats.voltSkipped - (result.stats.voltSkippedNonElectronic ?? 0)).toLocaleString()} kein Volt gefunden
              </Badge>
            )}
            {(result.stats.voltSkippedNonElectronic ?? 0) > 0 && (
              <Badge variant="outline" className="text-gray-400">
                {result.stats.voltSkippedNonElectronic!.toLocaleString()} nicht-elektronisch
              </Badge>
            )}
          </div>


          {/* Download + Speichern */}
          <div className="flex flex-wrap gap-3">
            <Button onClick={download} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
              <Download size={16} />
              Saubere CSV herunterladen
              {(result.stats.htmlCorrectedCount ?? 0) > 0 && (
                <span className="ml-1 bg-white/20 rounded px-1.5 py-0.5 text-xs font-semibold">
                  {result.stats.htmlCorrectedCount!.toLocaleString('de-DE')} Zeilen
                </span>
              )}
            </Button>

            <Button
              onClick={() => { setSaveName(""); setSaveDialogOpen(true); }}
              variant="outline"
              className="border-gray-300 text-gray-700 hover:bg-gray-50 gap-2"
            >
              <Save size={16} />
              Projekt speichern
            </Button>

            {(result.stats.dreiSpannungCount ?? 0) > 0 && (
              <Button
                onClick={() => window.open(`/api/volt-fixer/download-drei-spannung/${result.jobId}`, "_blank")}
                variant="outline"
                className="border-amber-400 text-amber-700 hover:bg-amber-50 gap-2"
              >
                <Download size={16} />
                Drei-Spannung-Produkte ({result.stats.dreiSpannungCount!.toLocaleString()} Zeilen)
              </Button>
            )}
          </div>

          {/* Speichern-Dialog */}
          {saveDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSaveDialogOpen(false)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">Projekt speichern</h2>
                  <button onClick={() => setSaveDialogOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
                </div>
                <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="font-medium text-gray-700">{result.fileName}</span>
                  <span className="mx-1">·</span>{result.stats.total.toLocaleString()} Zeilen
                  <span className="mx-1">·</span>{result.stats.voltChanged.toLocaleString()} Volt geändert
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Projektname</label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="z.B. Akkushop Export März 2026"
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && saveName.trim()) handleSave(); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setSaveDialogOpen(false)} className="flex-1 px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium text-sm">Abbrechen</button>
                  <button
                    onClick={handleSave}
                    disabled={!saveName.trim() || isSaving}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 font-medium text-sm"
                  >
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Speichern
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CSV Qualitätsprüfung */}
          {(result.csvIssues ?? []).length > 0 ? (
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-1 flex items-center gap-2">
                CSV Qualitätsprüfung
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                  <AlertCircle size={11} /> {result.csvIssues!.length.toLocaleString()} Warnung{result.csvIssues!.length !== 1 ? 'en' : ''}
                </span>
              </h2>
              <div className="border border-amber-200 rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {result.csvIssues!.map((issue, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-2.5 text-sm bg-amber-50 hover:bg-amber-100">
                    <span className="shrink-0 text-xs font-mono pt-0.5 w-14 text-right text-amber-500">Z.{issue.row}</span>
                    <span className="shrink-0 text-xs font-mono text-gray-500 w-24 truncate pt-0.5">{issue.itemNr || '—'}</span>
                    <span className="font-semibold shrink-0 w-44 text-amber-800">{issue.type}</span>
                    <span className="text-gray-600 truncate">{issue.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : result.csvIssues !== undefined ? (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
              <CheckCircle size={15} className="text-green-500" />
              CSV Qualitätsprüfung: Keine Probleme gefunden
            </div>
          ) : null}

          {/* Spaltenvorschau */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold text-gray-800">
                Spaltenvorschau
                <span className="ml-2 text-sm font-normal text-gray-400">
                  {items.length.toLocaleString()} Zeilen
                  {changedCount > 0 && ` · ${changedCount.toLocaleString()} geändert`}
                  {" "}· Klick auf <Eye size={12} className="inline" /> für Details
                </span>
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setShowOnlyChanged(v => !v); setPage(0); }}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                    showOnlyChanged
                      ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {showOnlyChanged ? "Nur Geänderte" : "Alle anzeigen"}
                </button>
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
                      <th className="px-3 py-2 text-left font-semibold text-indigo-700 whitespace-nowrap bg-indigo-50">Volt (vorher)</th>
                      <th className="px-3 py-2 text-left font-semibold text-indigo-700 whitespace-nowrap bg-indigo-50">Volt (nachher)</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Name DE</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Name NL</th>
                      <th className="px-3 py-2 text-left font-semibold text-green-700 whitespace-nowrap bg-green-50">Beschreibung DE</th>
                      <th className="px-3 py-2 text-left font-semibold text-green-700 whitespace-nowrap bg-green-50">Beschreibung NL</th>
                      <th className="px-3 py-2 text-left font-semibold text-indigo-700 whitespace-nowrap bg-indigo-50">Volt original</th>
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
                          <td className="px-3 py-1.5 text-gray-400 font-mono text-xs">{item.pId || "—"}</td>
                          <td className="px-3 py-1.5 text-gray-600 font-mono text-xs">{item.itemNr || "—"}</td>
                          <td className={`px-3 py-1.5 ${voltChanged ? "text-red-400 line-through opacity-70" : "text-gray-500"}`}>
                            {isUnrealisticVolt(item.voltOrig) ? "—" : (item.voltOrig || "—")}
                          </td>
                          <td className={`px-1 py-1 font-semibold ${voltChanged ? "text-indigo-700" : "text-gray-700"}`}>
                            {editingVolt?.index === item.index ? (
                              <div className="flex items-center gap-1">
                                <input
                                  autoFocus
                                  className="w-20 px-2 py-0.5 text-xs border border-indigo-400 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                                  value={editingVolt.value}
                                  onChange={e => setEditingVolt({ index: item.index, value: e.target.value })}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") saveVoltEdit(item.index, editingVolt.value);
                                    if (e.key === "Escape") setEditingVolt(null);
                                  }}
                                  disabled={patchSaving}
                                />
                                <button
                                  onClick={() => saveVoltEdit(item.index, editingVolt.value)}
                                  disabled={patchSaving}
                                  className="text-xs px-1.5 py-0.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                                  title="Speichern"
                                >✓</button>
                                <button
                                  onClick={() => setEditingVolt(null)}
                                  disabled={patchSaving}
                                  className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                                  title="Abbrechen"
                                >✕</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setEditingVolt({ index: item.index, value: item.voltNew })}
                                className={`group flex items-center gap-1 px-2 py-0.5 rounded hover:bg-indigo-100 transition-colors cursor-text text-left w-full ${voltChanged ? "text-indigo-700" : "text-gray-500"}`}
                                title="Klicken zum Bearbeiten"
                              >
                                {voltChanged && <CheckCircle size={10} className="inline shrink-0 text-indigo-500" />}
                                <span className="font-mono text-xs">{item.voltNew || <span className="text-gray-300 font-normal">—</span>}</span>
                                <span className="ml-auto opacity-0 group-hover:opacity-60 text-gray-400 text-xs">✎</span>
                              </button>
                            )}
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
                          <td className="px-3 py-1.5 bg-indigo-50/40 font-mono text-xs text-indigo-700">
                            {isUnrealisticVolt(item.voltOrig) ? <span className="text-gray-300">—</span> : (item.voltOrig || <span className="text-gray-300">—</span>)}
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
        </div>
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

      {/* Kosten-Bestätigung */}
      {pendingFile && (
        <CostConfirmDialog
          fileSizeMB={pendingFile.size / 1024 / 1024}
          onConfirm={() => {
            const f = pendingFile;
            setPendingFile(null);
            uploadFile(f);
          }}
          onCancel={() => setPendingFile(null)}
        />
      )}
    </div>
  );
}
