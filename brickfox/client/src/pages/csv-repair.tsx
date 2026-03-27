import { useState, useRef } from "react";
import { Download, CheckCircle, AlertCircle, Wrench, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { repairCsv, type RepairStats, type RepairResult } from "@/lib/csv-repair-processor";

type LocalResult = RepairResult & { stats: RepairStats };

type ProgressState = {
  label: string;
  percent: number;
};

export default function CsvRepair() {
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LocalResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const processFile = async (file: File) => {
    setLoading(true);
    setProgress({ label: "Datei wird gelesen…", percent: 0 });
    setError("");
    setResult(null);

    try {
      const repaired = await repairCsv(file, (label, percent) => {
        setProgress({ label, percent });
      });
      setResult(repaired);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e: any) {
      setError(e.message || "Unbekannter Fehler");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

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

  const download = () => {
    if (!result) return;
    const url = URL.createObjectURL(result.csvBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const totalFixed =
    (result?.stats.emptyLinesRemoved ?? 0) +
    (result?.stats.invalidItemNrRemoved ?? 0);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">CSV-Reparatur</h1>
        <p className="text-gray-500 mt-1">
          Repariert kaputte Brickfox-Exporte: erkennt anhand der{" "}
          <code className="bg-gray-100 px-1 rounded text-sm">p_id</code> wo jede Produktzeile beginnt,
          fügt durch HTML-Zeilenumbrüche zerrissene Fragmente wieder zusammen und entfernt leere Zeilen —
          so bleibt <code className="bg-gray-100 px-1 rounded text-sm">p_id</code> korrekt mit allen Feldern verbunden.
          Die Datei wird vollständig im Browser verarbeitet — kein Upload nötig.
        </p>
      </div>

      {/* Upload */}
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-indigo-500 bg-indigo-50"
            : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50"
        } ${loading ? "pointer-events-none opacity-60" : ""}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
        {loading ? (
          <div className="flex flex-col items-center gap-3 text-indigo-600">
            <div className="relative w-10 h-10">
              <svg className="animate-spin w-10 h-10" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="16" fill="none" stroke="#e0e7ff" strokeWidth="4" />
                <circle
                  cx="20" cy="20" r="16" fill="none" stroke="#6366f1" strokeWidth="4"
                  strokeDasharray={`${2 * Math.PI * 16 * (progress?.percent ?? 0) / 100} ${2 * Math.PI * 16}`}
                  strokeLinecap="round"
                  transform="rotate(-90 20 20)"
                  style={{ transition: "stroke-dasharray 0.3s ease" }}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-indigo-700">
                {progress?.percent ?? 0}%
              </span>
            </div>
            <p className="text-base font-medium">
              {progress?.label ?? "Wird verarbeitet…"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <Wrench size={36} />
            <div>
              <p className="text-base font-medium text-gray-600">Kaputten Brickfox-Export hier ablegen</p>
              <p className="text-sm mt-1">oder klicken zum Auswählen · CSV · beliebige Größe · rein browserbasiert</p>
            </div>
          </div>
        )}
      </div>

      {/* Fortschrittsbalken */}
      {loading && progress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 font-medium">{progress.label}</span>
            <span className="text-gray-400 tabular-nums">{progress.percent}%</span>
          </div>
          <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Fehler */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Ergebnis */}
      {result && (
        <div ref={resultRef} className="space-y-5">
          {/* Erfolgs-Banner */}
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-4">
            <CheckCircle size={22} className="text-green-600 shrink-0" />
            <div>
              <p className="font-semibold text-green-800">Reparatur abgeschlossen</p>
              <p className="text-sm text-green-700 mt-0.5">
                {result.stats.rowsAfterRepair.toLocaleString("de-DE")} Produkte im sauberen Export
                {totalFixed > 0 && ` · ${totalFixed.toLocaleString("de-DE")} Problemzeilen bereinigt`}
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <FileText size={14} className="text-indigo-500" />
                Reparatur-Bericht
              </h2>
            </div>
            <div className="divide-y divide-gray-100">
              <StatRow
                label="Rohe Zeilen in der Datei"
                value={result.stats.totalRawLines.toLocaleString("de-DE")}
                neutral
              />
              <StatRow
                label="HTML-Zeilenumbrüche zusammengeführt"
                value={result.stats.rowsMerged.toLocaleString("de-DE")}
                note="Normal — HTML-Beschreibungen haben viele Zeilenumbrüche"
                neutral
              />
              <StatRow
                label="Leere / reine-Semikolon-Zeilen entfernt"
                value={result.stats.emptyLinesRemoved.toLocaleString("de-DE")}
                good={result.stats.emptyLinesRemoved > 0}
              />
              <StatRow
                label="Zeilen mit ungültiger p_item_number entfernt"
                value={result.stats.invalidItemNrRemoved.toLocaleString("de-DE")}
                good={result.stats.invalidItemNrRemoved > 0}
              />
              <StatRow
                label="Produkte im reparierten Export"
                value={result.stats.rowsAfterRepair.toLocaleString("de-DE")}
                highlight
              />
            </div>
          </div>

          {/* Wie wurde repariert */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4 text-sm text-indigo-800 space-y-1">
            <p className="font-semibold text-indigo-900 mb-2">Was wurde repariert?</p>
            <p>
              <span className="font-medium">Zerrissene Zeilen:</span> Brickfox speichert HTML-Beschreibungen ohne
              Anführungszeichen. Zeilenumbrüche im HTML zerreißen das CSV in mehrere Teile.
              Das Tool erkennt echte Produktzeilen anhand der{" "}
              <code className="bg-indigo-100 px-1 rounded">p_id</code> (z.B. 12744, BST41_16) und fügt alle
              Fragmente korrekt zur ursprünglichen Zeile zusammen — so bleibt{" "}
              <code className="bg-indigo-100 px-1 rounded">p_id</code> korrekt mit{" "}
              <code className="bg-indigo-100 px-1 rounded">p_item_number</code>,{" "}
              <code className="bg-indigo-100 px-1 rounded">p_description[de]</code> und{" "}
              <code className="bg-indigo-100 px-1 rounded">p_attributes[akku_v][de]</code> verbunden.
            </p>
            <p className="mt-2">
              <span className="font-medium">Leere Zeilen:</span> Brickfox erzeugt manchmal Zeilen die nur
              Semikolons enthalten. Diese werden entfernt.
            </p>
          </div>

          {/* Download */}
          <Button onClick={download} className="bg-violet-600 hover:bg-violet-700 text-white gap-2">
            <Download size={16} />
            Reparierte CSV herunterladen
          </Button>
        </div>
      )}
    </div>
  );
}

function StatRow({
  label,
  value,
  note,
  neutral,
  good,
  highlight,
}: {
  label: string;
  value: string;
  note?: string;
  neutral?: boolean;
  good?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 px-5 py-3 ${highlight ? "bg-indigo-50/60" : ""}`}>
      <div className="min-w-0">
        <span className={`text-sm ${highlight ? "font-semibold text-indigo-800" : "text-gray-600"}`}>
          {label}
        </span>
        {note && <p className="text-xs text-gray-400 mt-0.5">{note}</p>}
      </div>
      <Badge
        className={`shrink-0 ${
          highlight
            ? "bg-indigo-600 text-white"
            : good && value !== "0"
            ? "bg-green-100 text-green-800 border border-green-200"
            : "bg-gray-100 text-gray-600 border border-gray-200"
        }`}
      >
        {value}
      </Badge>
    </div>
  );
}
