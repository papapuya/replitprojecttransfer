import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Download, CheckCircle, AlertCircle, FileText, Loader2, Eye, X, ChevronLeft, ChevronRight, Copy, Check, Save, Trash2, FolderOpen, Columns, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { processVoltFile } from "@/lib/volt-processor";
import Papa from "papaparse";

const VOLT_COL   = "p_attributes[akku_v][de]";
const MAH_COL    = "p_attributes[akku_mah][de]";
const WH_COL     = "p_attributes[akku_wh][de]";
const WATT_COL   = "p_attributes[lela_leistung_watt][de]";
const LEUCHT_COL = "p_attributes[tala_leuchtweite][de]";

const COL_TO_FIELD: Record<string, string> = {
  [MAH_COL]:    "mahNew",
  [WH_COL]:     "whNew",
  [WATT_COL]:   "wattNew",
  [LEUCHT_COL]: "leuchtNew",
};
// Volt-Werte >= 1000 sind unrealistisch und werden nicht angezeigt
const isUnrealisticVolt = (v: string) => { const n = Number(v.replace(',', '.')); return v !== '' && !isNaN(n) && n >= 1000; };
const PAGE_SIZE = 500;

type PreviewItem = {
  index: number;
  pId: string;
  itemNr: string;
  voltOrig: string;
  voltNew: string;
  mahOrig?: string;
  mahNew?: string;
  whOrig?: string;
  whNew?: string;
  wattOrig?: string;
  wattNew?: string;
  leuchtOrig?: string;
  leuchtNew?: string;
  nameDEOrig: string;
  nameDE: string;
  nameNLOrig: string;
  nameNL: string;
  descDE: string;
  descDEOrig?: string;
  descDEFull?: string;
  descDEChanged: boolean;
  descNL: string;
  descNLOrig?: string;
  descNLFull?: string;
  descNLChanged: boolean;
  hasHtml?: boolean;
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
  jobId?: string;
  csvBlob?: Blob;
  noDescBlob?: Blob;
  noDescFileName?: string;
  noDescCount?: number;
  reportBlob?: Blob;
  reportFileName?: string;
  headers: string[];
  fileName: string;
  stats: { total: number; voltChanged: number; voltSkipped: number; voltSkippedNonElectronic: number; voltExtracted: number; dreiSpannungCount?: number; htmlCorrectedCount?: number; mahExtracted?: number; mahSkipped?: number; whExtracted?: number; whSkipped?: number; wattExtracted?: number; wattSkipped?: number; leuchtExtracted?: number; leuchtSkipped?: number };
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

// Beschreibungs-Ansicht mit Tabs: Fließtext ↔ HTML-Quelltext
function DescriptionView({ html, changed, label, bg = "gray" }: { html: string; changed?: boolean; label: string; bg?: "gray" | "indigo" }) {
  const [tab, setTab] = useState<"preview" | "source">("preview");
  const bgClass = bg === "indigo"
    ? "bg-indigo-50 border-indigo-200"
    : "bg-gray-50 border-gray-200";
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-bold text-gray-700">{label}</h3>
        {changed && <Badge className="bg-indigo-600 text-white text-xs gap-1"><CheckCircle size={10} /> geändert</Badge>}
        <div className="ml-auto flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          <button
            onClick={() => setTab("preview")}
            className={`px-3 py-1 font-medium transition-colors ${tab === "preview" ? "bg-indigo-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
          >Fließtext</button>
          <button
            onClick={() => setTab("source")}
            className={`px-3 py-1 font-medium transition-colors border-l border-gray-200 ${tab === "source" ? "bg-indigo-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
          >HTML</button>
        </div>
      </div>
      {tab === "preview" ? (
        <div className={`p-4 border rounded-xl overflow-y-auto max-h-72 html-preview ${bgClass}`}
          dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">HTML-Quelltext</p>
            <CopyButton text={html} label="Kopieren" />
          </div>
          <pre className="text-xs text-gray-700 p-4 overflow-x-auto overflow-y-auto max-h-72 whitespace-pre-wrap break-words bg-white font-mono leading-relaxed select-all">{html}</pre>
        </div>
      )}
    </section>
  );
}

// Detail-Modal
function DetailModal({
  jobId,
  index,
  rowNum,
  onClose,
  localData,
}: {
  jobId?: string;
  index: number;
  rowNum: number;
  onClose: () => void;
  localData?: DetailData;
}) {
  const [data, setData] = useState<DetailData | null>(localData ?? null);
  const [loading, setLoading] = useState(!localData);
  const [err, setErr] = useState("");

  // Sync falls localData nach erstem Render ankommt (React-Batching)
  useEffect(() => {
    if (localData) {
      setData(localData);
      setLoading(false);
    }
  }, [localData]);

  useEffect(() => {
    if (localData) return;
    if (!jobId) { setErr("Keine Daten verfügbar"); setLoading(false); return; }
    fetch(`/api/volt-fixer/detail/${jobId}/${index}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setErr("Fehler beim Laden"); setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


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

                {/* Hinweis wenn Beschreibungsdaten fehlen */}
                {!origDE && !fixedDE && localData && (
                  <section>
                    <p className="text-sm text-gray-400 italic">Keine Produktbeschreibung in den CSV-Daten vorhanden oder Datei wurde vor dem letzten Update verarbeitet — bitte Datei neu hochladen.</p>
                  </section>
                )}

                {/* ── 1+2. Beschreibung Deutsch ── */}
                {(origDE || fixedDE) && (
                  deChanged ? (
                    <>
                      <DescriptionView html={origDE} label="Original Text Deutsch" bg="gray" />
                      <DescriptionView html={fixedDE} label="Geänderter Text Deutsch" changed bg="indigo" />
                    </>
                  ) : (
                    <DescriptionView html={fixedDE || origDE} label="Produktbeschreibung Deutsch" bg="gray" />
                  )
                )}

                {/* ── 3+4. Beschreibung Niederländisch ── */}
                {(origNL || fixedNL) && (
                  nlChanged ? (
                    <>
                      <DescriptionView html={origNL} label="Original Text Niederländisch" bg="gray" />
                      <DescriptionView html={fixedNL} label="Geänderter Text Niederländisch" changed bg="indigo" />
                    </>
                  ) : (
                    <DescriptionView html={fixedNL || origNL} label="Produktbeschreibung Niederländisch" bg="gray" />
                  )
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

                {/* ── 6. Weitere Attribute ── */}
                {(() => {
                  const attrDefs = [
                    { col: MAH_COL,    label: 'Kapazität (mAh)' },
                    { col: WH_COL,     label: 'Energie (Wh)'    },
                    { col: WATT_COL,   label: 'Leistung (Watt)' },
                    { col: LEUCHT_COL, label: 'Leuchtweite'     },
                  ].filter(a => data.headers.includes(a.col) && (data.original[a.col] || data.row[a.col]));

                  if (!attrDefs.length) return null;

                  return (
                    <section>
                      <h3 className="text-sm font-bold text-gray-700 mb-3 pb-1 border-b">Weitere Attribute</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {attrDefs.map(({ col, label }) => {
                          const origVal  = data.original[col] ?? '';
                          const fixedVal = data.row[col] ?? '';
                          const isChanged = data.changed.includes(col);
                          return (
                            <div key={col} className="rounded-xl border border-gray-200 overflow-hidden">
                              <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
                                {isChanged && <Badge className="bg-indigo-600 text-white text-xs gap-1"><CheckCircle size={10} /> geändert</Badge>}
                              </div>
                              <div className="px-4 py-3 flex items-center gap-4">
                                <div>
                                  <p className="text-xs text-gray-400 mb-0.5">Original</p>
                                  <p className={`text-xl font-bold ${isChanged ? 'text-red-400 line-through' : 'text-gray-700'}`}>{origVal || '—'}</p>
                                </div>
                                {isChanged && (
                                  <>
                                    <span className="text-2xl text-gray-300">→</span>
                                    <div>
                                      <p className="text-xs text-gray-400 mb-0.5">Korrigiert</p>
                                      <p className="text-2xl font-bold text-indigo-700">{fixedVal || '—'}</p>
                                    </div>
                                  </>
                                )}
                              </div>
                              <p className="px-4 pb-2 text-xs text-gray-300 font-mono">{col}</p>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })()}
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
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [editingVolt, setEditingVolt] = useState<{ index: number; value: string } | null>(null);
  const [editingAttr, setEditingAttr] = useState<{ index: number; col: string; value: string } | null>(null);
  const [patchSaving, setPatchSaving] = useState(false);
  const [detailLocalData, setDetailLocalData] = useState<DetailData | null>(null);
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set());
  const [colPickerOpen, setColPickerOpen] = useState(false);


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
      const data = await r.json() as Result & {
        originalCsvBase64?: string;
        restoreEmoji?: boolean;
      };

      // Wenn Original-CSV vorhanden: lokal neu verarbeiten mit aktueller Korrektur-Logik
      if (data.originalCsvBase64 && data.fileName) {
        const binaryStr = atob(data.originalCsvBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const file = new File([bytes], data.fileName, { type: 'text/csv' });
        const savedRestoreEmoji = data.restoreEmoji !== undefined ? data.restoreEmoji : restoreEmoji;
        if (data.restoreEmoji !== undefined) setRestoreEmoji(data.restoreEmoji);
        setLoadingSaveId(null);
        processLocally(file, savedRestoreEmoji);
        return;
      }

      // Fallback: altes Verhalten (kein originalCsvBase64 im Save)
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

  // Browser-seitige Verarbeitung (kein Upload, kein Server)
  const processLocally = async (file: File, restoreEmojiOverride?: boolean) => {
    setLoading(true);
    setError("");
    setResult(null);
    setPage(0);

    try {
      const processorResult = await processVoltFile(file, {
        restoreEmoji: restoreEmojiOverride !== undefined ? restoreEmojiOverride : restoreEmoji,
        onProgress: (step, label, percent, detail) => {
          setProgress({ step, stepLabel: label, percent, detail: detail ?? '' });
        },
      });

      setResult({
        csvBlob: processorResult.csvBlob,
        noDescBlob: processorResult.noDescBlob,
        noDescFileName: processorResult.noDescFileName,
        noDescCount: processorResult.noDescCount,
        reportBlob: processorResult.reportBlob,
        reportFileName: processorResult.reportFileName,
        headers: processorResult.headers,
        fileName: processorResult.fileName,
        stats: processorResult.stats,
        previewItems: processorResult.previewItems,
        allChangedNames: processorResult.allChangedNames,
        allExtractedVolt: processorResult.allExtractedVolt,
        csvIssues: processorResult.csvIssues,
      });

      setSelectedCols(new Set(processorResult.headers));
      setColPickerOpen(false);
      setProgress({ step: 'done', stepLabel: 'Fertig!', percent: 100, detail: '' });
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler bei der Verarbeitung');
      setProgress(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFile = (file: File) => {
    processLocally(file);
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

  const download = async () => {
    if (!result) return;
    if (result.csvBlob) {
      let blob = result.csvBlob;
      // Spaltenfilter anwenden wenn nicht alle Spalten ausgewählt
      if (selectedCols.size > 0 && selectedCols.size < result.headers.length) {
        try {
          const text = await blob.text();
          const parsed = Papa.parse<Record<string, string>>(text, { delimiter: ';', header: true });
          const cols = result.headers.filter(h => selectedCols.has(h));
          const filtered = parsed.data.map(row => {
            const r: Record<string, string> = {};
            for (const c of cols) r[c] = row[c] ?? '';
            return r;
          });
          const csv = Papa.unparse(filtered, { delimiter: ';', columns: cols });
          blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        } catch { /* Originalblob nehmen falls Fehler */ }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } else if (result.jobId) {
      window.open(`/api/volt-fixer/download/${result.jobId}`, "_blank");
    }
  };

  const downloadReport = () => {
    if (!result?.reportBlob || !result?.reportFileName) return;
    const url = URL.createObjectURL(result.reportBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.reportFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const openDetail = useCallback((index: number, rowNum: number) => {
    setDetailLocalData(null);
    // Wenn lokale Daten verfügbar (Browser-Verarbeitung), direkt aus previewItem bauen
    if (result?.csvBlob) {
      const item = result.previewItems.find(p => p.index === index);
      if (item) {
        const row: Record<string, string> = {
          'p_item_number': item.itemNr,
          'p_id': item.pId,
          [VOLT_COL]:   item.voltNew,
          [MAH_COL]:    item.mahNew   ?? '',
          [WH_COL]:     item.whNew    ?? '',
          [WATT_COL]:   item.wattNew  ?? '',
          [LEUCHT_COL]: item.leuchtNew ?? '',
          'p_name[de]': item.nameDE,
          'p_name[nl]': item.nameNL,
          'p_description[de]': item.descDEOrig ?? '',
          'p_description[nl]': item.descNLOrig ?? '',
        };
        const original: Record<string, string> = {
          'p_item_number': item.itemNr,
          'p_id': item.pId,
          [VOLT_COL]:   item.voltOrig,
          [MAH_COL]:    item.mahOrig   ?? '',
          [WH_COL]:     item.whOrig    ?? '',
          [WATT_COL]:   item.wattOrig  ?? '',
          [LEUCHT_COL]: item.leuchtOrig ?? '',
          'p_name[de]': item.nameDEOrig,
          'p_name[nl]': item.nameNLOrig,
          'p_description[de]': item.descDEOrig ?? '',
          'p_description[nl]': item.descNLOrig ?? '',
        };
        setDetailLocalData({
          row,
          original,
          changed: item.changed,
          headers: result.headers,
        });
      }
    }
    setDetail({ index, rowNum });
  }, [result]);

  const saveVoltEdit = async (index: number, newVolt: string) => {
    if (!result) return;
    setPatchSaving(true);
    const updatePreviewState = () => {
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
    };
    try {
      if (result.jobId && !result.csvBlob) {
        // Server-geladenes Projekt → über API patchen
        const res = await fetch(`/api/volt-fixer/patch-volt/${result.jobId}/${index}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ volt: newVolt }),
        });
        if (!res.ok) throw new Error("Fehler beim Speichern");
      }
      // Immer: lokalen Preview-State aktualisieren
      updatePreviewState();
    } catch {
      // Fehler still ignorieren — Wert bleibt im Input
    } finally {
      setPatchSaving(false);
      setEditingVolt(null);
    }
  };

  const saveAttrEdit = async (index: number, col: string, newVal: string) => {
    if (!result) return;
    const field = COL_TO_FIELD[col];
    if (!field) return;

    // 1. PreviewItems aktualisieren
    setResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        previewItems: prev.previewItems.map(item =>
          item.index === index
            ? {
                ...item,
                [field]: newVal,
                changed: newVal
                  ? item.changed.includes(col) ? item.changed : [...item.changed, col]
                  : item.changed.filter(c => c !== col),
              }
            : item
        ),
      };
    });

    // 2. CSV-Blob patchen (damit der Download aktuell bleibt)
    if (result.csvBlob) {
      try {
        const item = result.previewItems.find(p => p.index === index);
        const text = await result.csvBlob.text();
        const parsed = Papa.parse<Record<string, string>>(text, { delimiter: ';', header: true });
        const rowToEdit = parsed.data.find(r =>
          (item?.itemNr && r['p_item_number'] === item.itemNr) ||
          (item?.pId && r['p_id'] === item.pId)
        );
        if (rowToEdit && col in rowToEdit) {
          rowToEdit[col] = newVal;
          const newCsv = Papa.unparse(parsed.data, { delimiter: ';', columns: parsed.meta.fields });
          const newBlob = new Blob(['\uFEFF' + newCsv], { type: 'text/csv;charset=utf-8' });
          setResult(prev => prev ? { ...prev, csvBlob: newBlob } : prev);
        }
      } catch { /* ignorieren */ }
    }

    setEditingAttr(null);
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
        <h1 className="text-2xl font-bold text-gray-900">Brickfox Attribut-Tool</h1>
        <p className="text-gray-500 mt-1">
          Korrigiert Volt-Werte, ergänzt fehlende mAh-Kapazitäten — aus Produktname und Beschreibung.
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
                { key: 'parsing',    label: 'Lesen' },
                { key: 'fixing',     label: 'Korrigieren' },
                { key: 'validating', label: 'Prüfen' },
                { key: 'building',   label: 'Aufbereiten' },
              ].map(({ key, label }) => {
                const steps = ['parsing','fixing','validating','building','done'];
                const current = progress?.step ?? 'parsing';
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
              <Badge className="bg-orange-500 text-white">{result.stats.voltExtracted.toLocaleString()} Volt ergänzt</Badge>
            )}
            {(result.stats.mahExtracted ?? 0) > 0 && (
              <Badge className="bg-green-600 text-white">{result.stats.mahExtracted!.toLocaleString()} mAh ergänzt</Badge>
            )}
            {(result.stats.whExtracted ?? 0) > 0 && (
              <Badge className="bg-teal-600 text-white">{result.stats.whExtracted!.toLocaleString()} Wh ergänzt</Badge>
            )}
            {(result.stats.wattExtracted ?? 0) > 0 && (
              <Badge className="bg-yellow-600 text-white">{result.stats.wattExtracted!.toLocaleString()} Watt ergänzt</Badge>
            )}
            {(result.stats.leuchtExtracted ?? 0) > 0 && (
              <Badge className="bg-sky-600 text-white">{result.stats.leuchtExtracted!.toLocaleString()} Leuchtweite ergänzt</Badge>
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


          {/* Spaltenauswahl */}
          {result.csvBlob && result.headers.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
                onClick={() => setColPickerOpen(o => !o)}
              >
                <span className="flex items-center gap-2">
                  <Columns size={14} className="text-indigo-500" />
                  Spalten für Export auswählen
                  <span className="text-xs text-gray-400 font-normal">
                    {selectedCols.size} von {result.headers.length} Spalten
                  </span>
                </span>
                {colPickerOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {colPickerOpen && (
                <div className="p-4 space-y-3 bg-white">
                  {/* Alle / Keine */}
                  <div className="flex gap-2">
                    <button
                      className="text-xs px-2.5 py-1 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                      onClick={() => setSelectedCols(new Set(result.headers))}
                    >
                      Alle auswählen
                    </button>
                    <button
                      className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                      onClick={() => setSelectedCols(new Set())}
                    >
                      Keine
                    </button>
                    <button
                      className="text-xs px-2.5 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50"
                      onClick={() => setSelectedCols(new Set([
                        VOLT_COL, MAH_COL, WH_COL, WATT_COL, LEUCHT_COL,
                        'p_id', 'p_item_number', 'p_name[de]', 'p_name[nl]',
                      ].filter(c => result.headers.includes(c))))}
                    >
                      Nur Attribute
                    </button>
                  </div>

                  {/* Spalten-Liste */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 max-h-64 overflow-y-auto pr-1">
                    {result.headers.map(col => {
                      const isAttr = [VOLT_COL, MAH_COL, WH_COL, WATT_COL, LEUCHT_COL].includes(col);
                      const checked = selectedCols.has(col);
                      return (
                        <label
                          key={col}
                          className={`flex items-center gap-2 text-xs cursor-pointer rounded px-2 py-1 hover:bg-gray-50 ${isAttr ? 'font-medium text-indigo-700' : 'text-gray-600'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => {
                              setSelectedCols(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(col);
                                else next.delete(col);
                                return next;
                              });
                            }}
                            className="accent-indigo-600 shrink-0"
                          />
                          <span className="truncate" title={col}>{col}</span>
                          {isAttr && <span className="shrink-0 ml-auto text-indigo-400">★</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Download + Speichern */}
          <div className="flex flex-wrap gap-3">
            <Button onClick={download} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
              <Download size={16} />
              Saubere CSV herunterladen
              {result.stats.total > 0 && (
                <span className="ml-1 bg-white/20 rounded px-1.5 py-0.5 text-xs font-semibold">
                  {result.stats.total.toLocaleString('de-DE')} Zeilen
                </span>
              )}
            </Button>

            {result.noDescBlob && (result.noDescCount ?? 0) > 0 && (
              <Button
                onClick={() => {
                  const url = URL.createObjectURL(result.noDescBlob!);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = result.noDescFileName ?? 'ohne_beschreibung.csv';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 5000);
                }}
                variant="outline"
                className="border-orange-400 text-orange-700 hover:bg-orange-50 gap-2"
              >
                <Download size={16} />
                Ohne Beschreibung
                <span className="ml-1 bg-orange-100 text-orange-800 rounded px-1.5 py-0.5 text-xs font-semibold">
                  {(result.noDescCount ?? 0).toLocaleString('de-DE')} Produkte
                </span>
              </Button>
            )}

            {result.reportBlob && (
              <Button onClick={downloadReport} variant="outline" className="border-green-500 text-green-700 hover:bg-green-50 gap-2">
                <Download size={16} />
                Volt-Korrekturen prüfen
                {result.stats.voltChanged > 0 && (
                  <span className="ml-1 bg-green-100 text-green-800 rounded px-1.5 py-0.5 text-xs font-semibold">
                    {result.stats.voltChanged.toLocaleString('de-DE')} Zeilen
                  </span>
                )}
              </Button>
            )}

            {result.jobId && !result.csvBlob && (
              <Button
                onClick={() => { setSaveName(""); setSaveDialogOpen(true); }}
                variant="outline"
                className="border-gray-300 text-gray-700 hover:bg-gray-50 gap-2"
              >
                <Save size={16} />
                Projekt speichern
              </Button>
            )}

            {(result.stats.dreiSpannungCount ?? 0) > 0 && result.jobId && !result.csvBlob && (
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
                      <th className="px-3 py-2 text-left font-semibold text-green-700 whitespace-nowrap bg-green-50">mAh (vorher)</th>
                      <th className="px-3 py-2 text-left font-semibold text-green-700 whitespace-nowrap bg-green-50">mAh (nachher)</th>
                      <th className="px-3 py-2 text-left font-semibold text-teal-700 whitespace-nowrap bg-teal-50">Wh (vorher)</th>
                      <th className="px-3 py-2 text-left font-semibold text-teal-700 whitespace-nowrap bg-teal-50">Wh (nachher)</th>
                      <th className="px-3 py-2 text-left font-semibold text-yellow-700 whitespace-nowrap bg-yellow-50">Watt (vorher)</th>
                      <th className="px-3 py-2 text-left font-semibold text-yellow-700 whitespace-nowrap bg-yellow-50">Watt (nachher)</th>
                      <th className="px-3 py-2 text-left font-semibold text-sky-700 whitespace-nowrap bg-sky-50">Leuchtweite (vorher)</th>
                      <th className="px-3 py-2 text-left font-semibold text-sky-700 whitespace-nowrap bg-sky-50">Leuchtweite (nachher)</th>
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
                          {/* mAh vorher */}
                          <td className="px-3 py-1.5 font-mono text-xs text-gray-400 bg-green-50/40">
                            {item.mahOrig || "—"}
                          </td>
                          {/* mAh nachher */}
                          <td className="px-1 py-1 font-mono text-xs bg-green-50/40">
                            {editingAttr?.index === item.index && editingAttr?.col === MAH_COL ? (
                              <div className="flex items-center gap-1">
                                <input autoFocus className="w-20 px-2 py-0.5 text-xs border border-green-400 rounded focus:outline-none focus:ring-1 focus:ring-green-500 font-mono"
                                  value={editingAttr.value}
                                  onChange={e => setEditingAttr({ ...editingAttr, value: e.target.value })}
                                  onKeyDown={e => { if (e.key === "Enter") saveAttrEdit(item.index, MAH_COL, editingAttr.value); if (e.key === "Escape") setEditingAttr(null); }}
                                />
                                <button onClick={() => saveAttrEdit(item.index, MAH_COL, editingAttr.value)} className="text-xs px-1.5 py-0.5 bg-green-600 text-white rounded hover:bg-green-700">✓</button>
                                <button onClick={() => setEditingAttr(null)} className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300">✕</button>
                              </div>
                            ) : (
                              <button onClick={() => setEditingAttr({ index: item.index, col: MAH_COL, value: item.mahNew ?? '' })}
                                className={`group flex items-center gap-1 px-2 py-0.5 rounded hover:bg-green-100 transition-colors cursor-text text-left w-full ${item.changed.includes(MAH_COL) ? "text-green-700 font-semibold" : "text-gray-500"}`}
                                title="Klicken zum Bearbeiten">
                                {item.changed.includes(MAH_COL) && <CheckCircle size={10} className="inline shrink-0 text-green-500" />}
                                <span className="font-mono text-xs">{item.mahNew || <span className="text-gray-300 font-normal">—</span>}</span>
                                <span className="ml-auto opacity-0 group-hover:opacity-60 text-gray-400 text-xs">✎</span>
                              </button>
                            )}
                          </td>
                          {/* Wh vorher */}
                          <td className="px-3 py-1.5 font-mono text-xs text-gray-400 bg-teal-50/40">
                            {item.whOrig || "—"}
                          </td>
                          {/* Wh nachher */}
                          <td className="px-1 py-1 font-mono text-xs bg-teal-50/40">
                            {editingAttr?.index === item.index && editingAttr?.col === WH_COL ? (
                              <div className="flex items-center gap-1">
                                <input autoFocus className="w-20 px-2 py-0.5 text-xs border border-teal-400 rounded focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                                  value={editingAttr.value}
                                  onChange={e => setEditingAttr({ ...editingAttr, value: e.target.value })}
                                  onKeyDown={e => { if (e.key === "Enter") saveAttrEdit(item.index, WH_COL, editingAttr.value); if (e.key === "Escape") setEditingAttr(null); }}
                                />
                                <button onClick={() => saveAttrEdit(item.index, WH_COL, editingAttr.value)} className="text-xs px-1.5 py-0.5 bg-teal-600 text-white rounded hover:bg-teal-700">✓</button>
                                <button onClick={() => setEditingAttr(null)} className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300">✕</button>
                              </div>
                            ) : (
                              <button onClick={() => setEditingAttr({ index: item.index, col: WH_COL, value: item.whNew ?? '' })}
                                className={`group flex items-center gap-1 px-2 py-0.5 rounded hover:bg-teal-100 transition-colors cursor-text text-left w-full ${item.changed.includes(WH_COL) ? "text-teal-700 font-semibold" : "text-gray-500"}`}
                                title="Klicken zum Bearbeiten">
                                {item.changed.includes(WH_COL) && <CheckCircle size={10} className="inline shrink-0 text-teal-500" />}
                                <span className="font-mono text-xs">{item.whNew || <span className="text-gray-300 font-normal">—</span>}</span>
                                <span className="ml-auto opacity-0 group-hover:opacity-60 text-gray-400 text-xs">✎</span>
                              </button>
                            )}
                          </td>
                          {/* Watt vorher */}
                          <td className="px-3 py-1.5 font-mono text-xs text-gray-400 bg-yellow-50/40">
                            {item.wattOrig || "—"}
                          </td>
                          {/* Watt nachher */}
                          <td className="px-1 py-1 font-mono text-xs bg-yellow-50/40">
                            {editingAttr?.index === item.index && editingAttr?.col === WATT_COL ? (
                              <div className="flex items-center gap-1">
                                <input autoFocus className="w-20 px-2 py-0.5 text-xs border border-yellow-400 rounded focus:outline-none focus:ring-1 focus:ring-yellow-500 font-mono"
                                  value={editingAttr.value}
                                  onChange={e => setEditingAttr({ ...editingAttr, value: e.target.value })}
                                  onKeyDown={e => { if (e.key === "Enter") saveAttrEdit(item.index, WATT_COL, editingAttr.value); if (e.key === "Escape") setEditingAttr(null); }}
                                />
                                <button onClick={() => saveAttrEdit(item.index, WATT_COL, editingAttr.value)} className="text-xs px-1.5 py-0.5 bg-yellow-600 text-white rounded hover:bg-yellow-700">✓</button>
                                <button onClick={() => setEditingAttr(null)} className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300">✕</button>
                              </div>
                            ) : (
                              <button onClick={() => setEditingAttr({ index: item.index, col: WATT_COL, value: item.wattNew ?? '' })}
                                className={`group flex items-center gap-1 px-2 py-0.5 rounded hover:bg-yellow-100 transition-colors cursor-text text-left w-full ${item.changed.includes(WATT_COL) ? "text-yellow-700 font-semibold" : "text-gray-500"}`}
                                title="Klicken zum Bearbeiten">
                                {item.changed.includes(WATT_COL) && <CheckCircle size={10} className="inline shrink-0 text-yellow-500" />}
                                <span className="font-mono text-xs">{item.wattNew || <span className="text-gray-300 font-normal">—</span>}</span>
                                <span className="ml-auto opacity-0 group-hover:opacity-60 text-gray-400 text-xs">✎</span>
                              </button>
                            )}
                          </td>
                          {/* Leuchtweite vorher */}
                          <td className="px-3 py-1.5 font-mono text-xs text-gray-400 bg-sky-50/40">
                            {item.leuchtOrig || "—"}
                          </td>
                          {/* Leuchtweite nachher */}
                          <td className="px-1 py-1 font-mono text-xs bg-sky-50/40">
                            {editingAttr?.index === item.index && editingAttr?.col === LEUCHT_COL ? (
                              <div className="flex items-center gap-1">
                                <input autoFocus className="w-20 px-2 py-0.5 text-xs border border-sky-400 rounded focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                                  value={editingAttr.value}
                                  onChange={e => setEditingAttr({ ...editingAttr, value: e.target.value })}
                                  onKeyDown={e => { if (e.key === "Enter") saveAttrEdit(item.index, LEUCHT_COL, editingAttr.value); if (e.key === "Escape") setEditingAttr(null); }}
                                />
                                <button onClick={() => saveAttrEdit(item.index, LEUCHT_COL, editingAttr.value)} className="text-xs px-1.5 py-0.5 bg-sky-600 text-white rounded hover:bg-sky-700">✓</button>
                                <button onClick={() => setEditingAttr(null)} className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300">✕</button>
                              </div>
                            ) : (
                              <button onClick={() => setEditingAttr({ index: item.index, col: LEUCHT_COL, value: item.leuchtNew ?? '' })}
                                className={`group flex items-center gap-1 px-2 py-0.5 rounded hover:bg-sky-100 transition-colors cursor-text text-left w-full ${item.changed.includes(LEUCHT_COL) ? "text-sky-700 font-semibold" : "text-gray-500"}`}
                                title="Klicken zum Bearbeiten">
                                {item.changed.includes(LEUCHT_COL) && <CheckCircle size={10} className="inline shrink-0 text-sky-500" />}
                                <span className="font-mono text-xs">{item.leuchtNew || <span className="text-gray-300 font-normal">—</span>}</span>
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
          onClose={() => { setDetail(null); setDetailLocalData(null); }}
          localData={detailLocalData ?? undefined}
        />
      )}
    </div>
  );
}
