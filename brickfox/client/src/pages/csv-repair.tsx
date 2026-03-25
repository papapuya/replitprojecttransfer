import { useState, useRef } from "react";
import { Upload, Download, CheckCircle, AlertCircle, Wrench, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type RepairStats = {
  totalRawLines: number;
  emptyLinesRemoved: number;
  rowsMerged: number;
  rowsAfterRepair: number;
  invalidItemNrRemoved: number;
};

type RepairResult = {
  jobId: string;
  fileName: string;
  stats: RepairStats;
};

export default function CsvRepair() {
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RepairResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const uploadFile = async (file: File) => {
    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/csv-repair/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Reparieren");
      setResult(data);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e: any) {
      setError(e.message);
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
    window.open(`/api/csv-repair/download/${result.jobId}`, "_blank");
  };

  const totalFixed =
    (result?.stats.emptyLinesRemoved ?? 0) +
    (result?.stats.rowsMerged ?? 0) +
    (result?.stats.invalidItemNrRemoved ?? 0);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">CSV-Reparatur</h1>
        <p className="text-gray-500 mt-1">
          Repariert kaputte Brickfox-Exporte: fügt zerrissene Produktzeilen wieder zusammen,
          entfernt leere Zeilen und Zeilen mit ungültiger{" "}
          <code className="bg-gray-100 px-1 rounded text-sm">p_item_number</code>.
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
            <Loader2 size={36} className="animate-spin" />
            <p className="text-base font-medium">CSV wird repariert…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <Wrench size={36} />
            <div>
              <p className="text-base font-medium text-gray-600">Kaputten Brickfox-Export hier ablegen</p>
              <p className="text-sm mt-1">oder klicken zum Auswählen · CSV · max. 200 MB</p>
            </div>
          </div>
        )}
      </div>

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
                {totalFixed > 0
                  ? `${totalFixed.toLocaleString()} Problem${totalFixed === 1 ? "" : "e"} behoben`
                  : "Keine Probleme gefunden — CSV war bereits sauber"}
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
                value={result.stats.totalRawLines.toLocaleString()}
                neutral
              />
              <StatRow
                label="Leere / reine-Semikolon-Zeilen entfernt"
                value={result.stats.emptyLinesRemoved.toLocaleString()}
                good={result.stats.emptyLinesRemoved > 0}
              />
              <StatRow
                label="Zeilen-Fragmente wieder zusammengeführt"
                value={result.stats.rowsMerged.toLocaleString()}
                good={result.stats.rowsMerged > 0}
              />
              <StatRow
                label="Zeilen mit ungültiger p_item_number entfernt"
                value={result.stats.invalidItemNrRemoved.toLocaleString()}
                good={result.stats.invalidItemNrRemoved > 0}
              />
              <StatRow
                label="Produkte im reparierten Export"
                value={result.stats.rowsAfterRepair.toLocaleString()}
                highlight
              />
            </div>
          </div>

          {/* Wie wurde repariert */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4 text-sm text-indigo-800 space-y-1">
            <p className="font-semibold text-indigo-900 mb-2">Was wurde repariert?</p>
            <p>
              <span className="font-medium">Zerrissene Zeilen:</span> Brickfox speichert HTML-Beschreibungen ohne
              Anführungszeichen. Zeilenumbrüche im HTML zerreißen das CSV in mehrere Zeilen.
              Das Tool erkennt diese Fragmente (keine gültige{" "}
              <code className="bg-indigo-100 px-1 rounded">p_item_number</code>) und fügt sie wieder
              zur richtigen Produktzeile zusammen.
            </p>
            <p className="mt-2">
              <span className="font-medium">Leere Zeilen:</span> Brickfox erzeugt manchmal Zeilen die nur
              Semikolons enthalten. Diese werden entfernt.
            </p>
          </div>

          {/* Download */}
          <Button onClick={download} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
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
  neutral,
  good,
  highlight,
}: {
  label: string;
  value: string;
  neutral?: boolean;
  good?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-5 py-3 ${highlight ? "bg-indigo-50/60" : ""}`}>
      <span className={`text-sm ${highlight ? "font-semibold text-indigo-800" : "text-gray-600"}`}>
        {label}
      </span>
      <Badge
        className={
          highlight
            ? "bg-indigo-600 text-white"
            : good && value !== "0"
            ? "bg-green-100 text-green-800 border border-green-200"
            : "bg-gray-100 text-gray-600 border border-gray-200"
        }
      >
        {value}
      </Badge>
    </div>
  );
}
