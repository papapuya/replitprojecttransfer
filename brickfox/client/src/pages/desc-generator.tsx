import { useState, useCallback, useRef } from "react";
import { Upload, Download, Loader2, CheckCircle2, AlertTriangle, ArrowLeft, Sparkles, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

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

export default function DescGenerator() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && (dropped.name.endsWith('.csv') || dropped.name.endsWith('.xlsx'))) {
      setFile(dropped);
      setResult(null);
      setError(null);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setResult(null);
      setError(null);
    }
  }, []);

  const handleProcess = async () => {
    if (!file) return;

    setProcessing(true);
    setProgress(null);
    setResult(null);
    setError(null);

    const sessionId = genId();

    const eventSource = new EventSource(`/api/desc-generator/progress/${sessionId}`);
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.complete) {
          setResult({
            generated: data.generated,
            skipped: data.skipped,
            errors: data.errors,
            total: data.total,
          });
          eventSource.close();
          setProcessing(false);
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
    eventSource.onerror = () => {
      eventSource.close();
      setProcessing(false);
    };

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/desc-generator/generate', {
        method: 'POST',
        headers: { 'x-session-id': sessionId },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Unbekannter Fehler' }));
        throw new Error(errData.error ?? 'Fehler beim Verarbeiten');
      }

      const blob = await response.blob();
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}_desc_generated.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Fertig', description: 'CSV mit generierten Beschreibungen heruntergeladen.' });
    } catch (err: any) {
      setError(err.message ?? 'Unbekannter Fehler');
      eventSource.close();
      setProcessing(false);
      setProgress(null);
    }
  };

  const progressPercent = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-6">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Button>
        </Link>
      </div>

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
              isDragging ? 'border-purple-400 bg-purple-50' : 'border-muted-foreground/30 hover:border-purple-300'
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
                <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
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
            <Button className="mt-4 w-full gap-2" onClick={handleProcess}>
              <Sparkles className="h-4 w-4" />
              Beschreibungen generieren
            </Button>
          )}
        </CardContent>
      </Card>

      {processing && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
              <span className="font-medium">KI generiert Beschreibungen…</span>
            </div>
            {progress && (
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

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="font-semibold text-lg">Fertig!</span>
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
            <p className="text-sm text-muted-foreground mt-4 text-center">
              Die CSV wurde automatisch heruntergeladen.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
