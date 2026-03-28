import { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Upload, CheckCircle2, Circle, Loader2, AlertCircle, Download,
  Play, Wrench, Zap, Sparkles, FileText, ChevronDown, ChevronRight,
  RotateCcw, Shield
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type StepStatus = 'pending' | 'running' | 'done' | 'error';

interface RepairStats {
  totalRawLines: number;
  emptyLinesRemoved: number;
  rowsMerged: number;
  rowsAfterRepair: number;
  invalidItemNrRemoved: number;
}

interface AttributeStats {
  total: number;
  voltChanged: number;
  voltSkipped: number;
  voltSkippedNonElectronic: number;
  voltExtracted: number;
  dreiSpannungCount: number;
  htmlCorrectedCount: number;
}

interface DescStats {
  generated: number;
  errors: number;
  skipped: number;
  total: number;
}

interface ChangeEntry {
  step: string;
  itemNr: string;
  field: string;
  oldValue: string;
  newValue: string;
}

async function parseSSEStream(
  response: Response,
  onEvent: (event: string, data: any) => void
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      if (!part.trim()) continue;
      const lines = part.split('\n');
      let eventName = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) eventName = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (data) {
        try {
          const parsed = JSON.parse(data);
          onEvent(eventName, parsed);
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  }
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('supabase_token') || sessionStorage.getItem('supabase_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function Pipeline() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [repairStatus, setRepairStatus] = useState<StepStatus>('pending');
  const [repairStats, setRepairStats] = useState<RepairStats | null>(null);
  const [repairCsvBlob, setRepairCsvBlob] = useState<Blob | null>(null);
  const [repairProgress, setRepairProgress] = useState({ label: '', percent: 0 });
  const repairTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [repairError, setRepairError] = useState('');

  const [attrStatus, setAttrStatus] = useState<StepStatus>('pending');
  const [attrStats, setAttrStats] = useState<AttributeStats | null>(null);
  const [attrCsvBlob, setAttrCsvBlob] = useState<Blob | null>(null);
  const [attrProgress, setAttrProgress] = useState({ label: '', percent: 0 });
  const [attrPreview, setAttrPreview] = useState<any[]>([]);
  const [attrError, setAttrError] = useState('');

  const [descStatus, setDescStatus] = useState<StepStatus>('pending');
  const [descStats, setDescStats] = useState<DescStats | null>(null);
  const [descCsvBlob, setDescCsvBlob] = useState<Blob | null>(null);
  const [descProgress, setDescProgress] = useState({ current: 0, total: 0, productName: '' });
  const [descError, setDescError] = useState('');

  const [changeLog, setChangeLog] = useState<ChangeEntry[]>([]);
  const [showChangeLog, setShowChangeLog] = useState(false);
  const [showAttrDetails, setShowAttrDetails] = useState(false);
  const [isRunningAll, setIsRunningAll] = useState(false);

  const getInputForStep = useCallback((step: 'repair' | 'attributes' | 'descriptions'): Blob | File | null => {
    switch (step) {
      case 'repair': return originalFile;
      case 'attributes': return repairCsvBlob || originalFile;
      case 'descriptions': return attrCsvBlob || repairCsvBlob || originalFile;
    }
  }, [originalFile, repairCsvBlob, attrCsvBlob]);

  const getLatestOutput = useCallback((): Blob | null => {
    return descCsvBlob || attrCsvBlob || repairCsvBlob;
  }, [descCsvBlob, attrCsvBlob, repairCsvBlob]);

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({ title: 'Fehler', description: 'Bitte eine CSV-Datei hochladen', variant: 'destructive' });
      return;
    }
    setOriginalFile(file);
    setRepairStatus('pending'); setRepairStats(null); setRepairCsvBlob(null); setRepairError('');
    setAttrStatus('pending'); setAttrStats(null); setAttrCsvBlob(null); setAttrPreview([]); setAttrError('');
    setDescStatus('pending'); setDescStats(null); setDescCsvBlob(null); setDescError('');
    setChangeLog([]);
  };

  const runRepair = async (inputBlob?: Blob | File | null): Promise<Blob | null> => {
    const input = inputBlob || getInputForStep('repair');
    if (!input) return null;

    setRepairStatus('running');
    setRepairProgress({ label: 'Zeilen werden analysiert…', percent: 5 });
    setRepairError('');

    if (repairTimerRef.current) clearInterval(repairTimerRef.current);
    repairTimerRef.current = setInterval(() => {
      setRepairProgress(prev => {
        if (prev.percent >= 95) return prev;
        const step = prev.percent < 40 ? 6 : prev.percent < 70 ? 3 : 1;
        const labels = ['Zeilen werden analysiert…', 'Zeilenstruktur wird repariert…', 'Encoding wird korrigiert…', 'CSV wird bereinigt…'];
        const labelIdx = Math.min(Math.floor(prev.percent / 25), labels.length - 1);
        return { label: labels[labelIdx], percent: Math.min(prev.percent + step, 95) };
      });
    }, 250);

    try {
      const formData = new FormData();
      formData.append('file', input, originalFile?.name || 'input.csv');

      const response = await fetch('/api/csv-repair/upload', {
        method: 'POST',
        body: formData,
        headers: getAuthHeaders(),
      });

      if (repairTimerRef.current) { clearInterval(repairTimerRef.current); repairTimerRef.current = null; }

      const responseText = await response.text();

      let resultJobId = '';
      let resultStats: RepairStats | null = null;
      let sseError: string | null = null;

      const events = responseText.split('\n\n');
      for (const block of events) {
        if (!block.trim()) continue;
        const lines = block.split('\n');
        let eventName = 'message';
        let dataStr = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) eventName = line.slice(7).trim();
          else if (line.startsWith('data: ')) dataStr += line.slice(6);
        }
        if (!dataStr) continue;
        try {
          const data = JSON.parse(dataStr);
          if (eventName === 'done') {
            resultJobId = data.jobId;
            resultStats = data.stats;
          } else if (eventName === 'error') {
            sseError = data.message || 'Reparatur fehlgeschlagen';
          }
        } catch {}
      }

      if (sseError) throw new Error(sseError);
      setRepairProgress({ label: 'Abgeschlossen', percent: 100 });

      if (!resultJobId) throw new Error('Keine Job-ID erhalten');

      const downloadRes = await fetch(`/api/csv-repair/download/${resultJobId}`, {
        headers: getAuthHeaders(),
      });
      if (!downloadRes.ok) throw new Error('Download fehlgeschlagen');
      const csvBlob = await downloadRes.blob();

      setRepairStats(resultStats);
      setRepairCsvBlob(csvBlob);
      setRepairStatus('done');
      setAttrCsvBlob(null); setAttrStatus('pending'); setAttrStats(null); setAttrPreview([]);
      setDescCsvBlob(null); setDescStatus('pending'); setDescStats(null);

      if (resultStats) {
        const entries: ChangeEntry[] = [];
        if (resultStats.rowsMerged > 0) {
          entries.push({ step: 'Reparatur', itemNr: '—', field: 'Zeilenstruktur', oldValue: `${resultStats.totalRawLines} Rohzeilen`, newValue: `${resultStats.rowsMerged} Zeilen zusammengeführt` });
        }
        if (resultStats.emptyLinesRemoved > 0) {
          entries.push({ step: 'Reparatur', itemNr: '—', field: 'Leerzeilen', oldValue: `${resultStats.emptyLinesRemoved} leere Zeilen`, newValue: 'Entfernt' });
        }
        if (resultStats.invalidItemNrRemoved > 0) {
          entries.push({ step: 'Reparatur', itemNr: '—', field: 'Ungültige Artikelnr.', oldValue: `${resultStats.invalidItemNrRemoved} ungültige`, newValue: 'Entfernt' });
        }
        setChangeLog(prev => [...prev.filter(e => e.step !== 'Reparatur'), ...entries]);
      }

      return csvBlob;
    } catch (err: any) {
      if (repairTimerRef.current) { clearInterval(repairTimerRef.current); repairTimerRef.current = null; }
      setRepairStatus('error');
      setRepairError(err.message || 'Unbekannter Fehler');
      toast({ title: 'Reparatur fehlgeschlagen', description: err.message, variant: 'destructive' });
      return null;
    }
  };

  const runAttributes = async (inputBlob?: Blob | File | null): Promise<Blob | null> => {
    const input = inputBlob || getInputForStep('attributes');
    if (!input) return null;

    setAttrStatus('running');
    setAttrProgress({ label: 'Wird hochgeladen…', percent: 0 });
    setAttrError('');

    try {
      const formData = new FormData();
      formData.append('file', input, originalFile?.name || 'input.csv');
      formData.append('restoreEmoji', 'true');

      const uploadRes = await fetch('/api/volt-fixer/upload', {
        method: 'POST',
        body: formData,
        headers: getAuthHeaders(),
      });
      const uploadBody = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadBody?.error || `Upload fehlgeschlagen (HTTP ${uploadRes.status})`);
      }
      const { jobId } = uploadBody;
      if (!jobId) throw new Error('Keine Job-ID erhalten');

      let done = false;
      while (!done) {
        await new Promise(r => setTimeout(r, 500));
        const progressRes = await fetch(`/api/volt-fixer/progress/${jobId}`, {
          headers: getAuthHeaders(),
        });
        const progress = await progressRes.json();
        setAttrProgress({ label: progress.stepLabel || '', percent: progress.percent || 0 });

        if (progress.step === 'done') done = true;
        if (progress.step === 'error') throw new Error(progress.stepLabel || 'Attribut-Verarbeitung fehlgeschlagen');
      }

      const resultRes = await fetch(`/api/volt-fixer/result/${jobId}`, {
        headers: getAuthHeaders(),
      });
      if (!resultRes.ok) throw new Error('Ergebnis konnte nicht geladen werden');
      const result = await resultRes.json();

      setAttrStats(result.stats);
      setAttrPreview(result.previewItems || []);

      const downloadRes = await fetch(`/api/volt-fixer/download/${jobId}`, {
        headers: getAuthHeaders(),
      });
      if (!downloadRes.ok) throw new Error('Download fehlgeschlagen');
      const csvBlob = await downloadRes.blob();

      setAttrCsvBlob(csvBlob);
      setAttrStatus('done');
      setDescCsvBlob(null); setDescStatus('pending'); setDescStats(null);

      if (result.previewItems) {
        const entries: ChangeEntry[] = [];
        for (const item of result.previewItems) {
          if (item.changed && item.changed.length > 0) {
            for (const col of item.changed) {
              if (col === 'p_attributes[akku_v][de]') {
                entries.push({
                  step: 'Attribute',
                  itemNr: item.itemNr || item.pId || '—',
                  field: 'Spannung (V)',
                  oldValue: item.voltOrig || '(leer)',
                  newValue: item.voltNew || '(leer)',
                });
              } else if (col === 'p_name[de]' && item.nameDEOrig !== item.nameDE) {
                entries.push({
                  step: 'Attribute',
                  itemNr: item.itemNr || item.pId || '—',
                  field: 'Name (DE)',
                  oldValue: (item.nameDEOrig || '').substring(0, 80),
                  newValue: (item.nameDE || '').substring(0, 80),
                });
              } else if (col === 'p_description[de]') {
                entries.push({
                  step: 'Attribute',
                  itemNr: item.itemNr || item.pId || '—',
                  field: 'Beschreibung (DE)',
                  oldValue: '(Volt-Werte korrigiert)',
                  newValue: '(synchronisiert)',
                });
              }
            }
          }
        }
        setChangeLog(prev => [...prev.filter(e => e.step !== 'Attribute'), ...entries]);
      }

      return csvBlob;
    } catch (err: any) {
      setAttrStatus('error');
      setAttrError(err.message || 'Unbekannter Fehler');
      toast({ title: 'Attribut-Verarbeitung fehlgeschlagen', description: err.message, variant: 'destructive' });
      return null;
    }
  };

  const runDescriptions = async (inputBlob?: Blob | File | null): Promise<Blob | null> => {
    const input = inputBlob || getInputForStep('descriptions');
    if (!input) return null;

    setDescStatus('running');
    setDescProgress({ current: 0, total: 0, productName: 'Wird vorbereitet…' });
    setDescError('');

    try {
      const sessionId = crypto.randomUUID();
      let completedStats: DescStats | null = null;

      const eventSource = new EventSource(`/api/desc-generator/progress/${sessionId}`);
      let sseError: string | null = null;

      const sseReady = new Promise<void>((resolve) => {
        eventSource.onopen = () => resolve();
        setTimeout(resolve, 2000);
      });

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.error) {
            sseError = data.error;
            eventSource.close();
            return;
          }
          setDescProgress({
            current: data.current || 0,
            total: data.total || 0,
            productName: data.productName || '',
          });
          if (data.complete) {
            completedStats = {
              generated: data.generated || 0,
              errors: data.errors || 0,
              skipped: data.skipped || 0,
              total: data.total || 0,
            };
            setDescStats(completedStats);
            eventSource.close();
          }
        } catch {}
      };

      eventSource.onerror = () => {
        eventSource.close();
      };

      await sseReady;

      const formData = new FormData();
      formData.append('file', input, originalFile?.name || 'input.csv');

      const generateRes = await fetch('/api/desc-generator/generate', {
        method: 'POST',
        body: formData,
        headers: {
          ...getAuthHeaders(),
          'x-session-id': sessionId,
        },
      });

      if (!generateRes.ok) {
        eventSource.close();
        const err = await generateRes.json().catch(() => ({ error: 'Unbekannter Fehler' }));
        throw new Error(err.error || 'Beschreibungs-Generierung fehlgeschlagen');
      }

      const csvBlob = await generateRes.blob();
      eventSource.close();

      if (sseError) throw new Error(sseError);

      setDescCsvBlob(csvBlob);
      setDescStatus('done');

      setChangeLog(prev => [
        ...prev.filter(e => e.step !== 'Beschreibungen'),
        {
          step: 'Beschreibungen',
          itemNr: '—',
          field: 'p_description[de]',
          oldValue: `${completedStats?.total || '?'} Beschreibungen geprüft`,
          newValue: `${completedStats?.generated || '?'} KI-generiert, ${completedStats?.skipped || '?'} bereits OK`,
        },
      ]);

      return csvBlob;
    } catch (err: any) {
      setDescStatus('error');
      setDescError(err.message || 'Unbekannter Fehler');
      toast({ title: 'Beschreibungs-Generierung fehlgeschlagen', description: err.message, variant: 'destructive' });
      return null;
    }
  };

  const runAll = async () => {
    if (!originalFile) return;
    setIsRunningAll(true);

    try {
      const repairedBlob = await runRepair(originalFile);
      if (!repairedBlob) { setIsRunningAll(false); return; }

      const attrBlob = await runAttributes(repairedBlob);
      if (!attrBlob) { setIsRunningAll(false); return; }

      const descBlob = await runDescriptions(attrBlob);
      if (!descBlob) { setIsRunningAll(false); return; }

      toast({ title: 'Pipeline abgeschlossen', description: 'Alle 3 Schritte wurden erfolgreich ausgeführt.' });
    } finally {
      setIsRunningAll(false);
    }
  };

  const handleDownload = () => {
    const blob = getLatestOutput();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = (originalFile?.name || 'output').replace(/\.csv$/i, '');
    a.download = `${baseName}_optimiert.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadOriginal = () => {
    if (!originalFile) return;
    const url = URL.createObjectURL(originalFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = originalFile.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setOriginalFile(null);
    setRepairStatus('pending'); setRepairStats(null); setRepairCsvBlob(null); setRepairError('');
    setAttrStatus('pending'); setAttrStats(null); setAttrCsvBlob(null); setAttrPreview([]); setAttrError('');
    setDescStatus('pending'); setDescStats(null); setDescCsvBlob(null); setDescError('');
    setChangeLog([]);
    setShowChangeLog(false);
    setShowAttrDetails(false);
  };

  const anyRunning = repairStatus === 'running' || attrStatus === 'running' || descStatus === 'running';
  const hasOutput = !!(descCsvBlob || attrCsvBlob || repairCsvBlob);
  const allDone = repairStatus === 'done' && attrStatus === 'done' && descStatus === 'done';

  const StatusIcon = ({ status }: { status: StepStatus }) => {
    switch (status) {
      case 'done': return <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />;
      case 'running': return <Loader2 className="w-5 h-5 text-indigo-500 animate-spin shrink-0" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />;
      default: return <Circle className="w-5 h-5 text-gray-300 shrink-0" />;
    }
  };

  const StatusBadge = ({ status }: { status: StepStatus }) => {
    switch (status) {
      case 'done': return <Badge className="bg-green-100 text-green-700 border-green-200">Fertig</Badge>;
      case 'running': return <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">Läuft…</Badge>;
      case 'error': return <Badge variant="destructive">Fehler</Badge>;
      default: return <Badge variant="outline" className="text-gray-400">Ausstehend</Badge>;
    }
  };

  const changedAttrItems = attrPreview.filter((item: any) => item.changed && item.changed.length > 0);

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-foreground">PIMPilot Pipeline</h1>
        <p className="text-muted-foreground">CSV hochladen &rarr; Optimieren &rarr; Herunterladen</p>
      </div>

      {!originalFile ? (
        <Card
          className={`border-2 border-dashed cursor-pointer transition-colors ${
            isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Upload className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-lg font-medium text-gray-600">Brickfox CSV hier ablegen</p>
            <p className="text-sm text-gray-400 mt-1">oder klicken zum Auswählen</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                if (e.target) e.target.value = '';
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="bg-slate-50">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-indigo-500" />
                <div>
                  <p className="font-medium">{originalFile.name}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    {(originalFile.size / 1024 / 1024).toFixed(1)} MB — Original wird niemals verändert
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleDownloadOriginal}>
                  <Download className="w-4 h-4 mr-1" /> Original
                </Button>
                <Button variant="outline" size="sm" onClick={handleReset} disabled={anyRunning}>
                  <RotateCcw className="w-4 h-4 mr-1" /> Neu
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-center">
            <Button
              size="lg"
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={runAll}
              disabled={anyRunning || isRunningAll}
            >
              {isRunningAll ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Wird optimiert…</>
              ) : (
                <><Zap className="w-4 h-4 mr-2" /> Alles optimieren</>
              )}
            </Button>
            {hasOutput && (
              <Button size="lg" variant="outline" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" /> Ergebnis herunterladen
              </Button>
            )}
          </div>

          <div className="space-y-3">
            <Card className={repairStatus === 'running' ? 'ring-2 ring-indigo-200' : ''}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StatusIcon status={repairStatus} />
                    <div>
                      <div className="flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-orange-500" />
                        <span className="font-medium">Schritt 1: CSV-Reparatur</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Zeilenstruktur reparieren, Encoding korrigieren</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={repairStatus} />
                    <Button size="sm" variant="outline" onClick={() => runRepair()} disabled={anyRunning}>
                      <Play className="w-3 h-3 mr-1" /> Ausführen
                    </Button>
                  </div>
                </div>
                {repairStatus === 'running' && (
                  <div className="mt-4 space-y-2 bg-indigo-50 rounded-lg p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-indigo-700 font-medium">{repairProgress.label || 'Wird gestartet…'}</span>
                      <span className="text-indigo-600 font-bold tabular-nums">{Math.round(repairProgress.percent)}%</span>
                    </div>
                    <Progress value={repairProgress.percent} className="h-3" />
                  </div>
                )}
                {repairStatus === 'done' && repairStats && (
                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    <span className="text-green-600 font-medium">{repairStats.rowsAfterRepair} Zeilen OK</span>
                    {repairStats.rowsMerged > 0 && <span className="text-orange-600">{repairStats.rowsMerged} zusammengeführt</span>}
                    {repairStats.emptyLinesRemoved > 0 && <span className="text-gray-500">{repairStats.emptyLinesRemoved} Leerzeilen entfernt</span>}
                    {repairStats.invalidItemNrRemoved > 0 && <span className="text-red-500">{repairStats.invalidItemNrRemoved} ungültige entfernt</span>}
                  </div>
                )}
                {repairStatus === 'error' && <p className="mt-2 text-sm text-red-500">{repairError}</p>}
              </CardContent>
            </Card>

            <div className="flex justify-center">
              <div className="w-px h-4 bg-gray-300" />
            </div>

            <Card className={attrStatus === 'running' ? 'ring-2 ring-indigo-200' : ''}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StatusIcon status={attrStatus} />
                    <div>
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-yellow-500" />
                        <span className="font-medium">Schritt 2: Attribut-Engine</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Volt, mAh, Wh normalisieren & in Beschreibungen synchronisieren</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={attrStatus} />
                    <Button size="sm" variant="outline" onClick={() => runAttributes()} disabled={anyRunning}>
                      <Play className="w-3 h-3 mr-1" /> Ausführen
                    </Button>
                  </div>
                </div>
                {attrStatus === 'running' && (
                  <div className="mt-4 space-y-2 bg-yellow-50 rounded-lg p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-yellow-800 font-medium">{attrProgress.label || 'Wird gestartet…'}</span>
                      <span className="text-yellow-700 font-bold tabular-nums">{Math.round(attrProgress.percent)}%</span>
                    </div>
                    <Progress value={attrProgress.percent} className="h-3" />
                  </div>
                )}
                {attrStatus === 'done' && attrStats && (
                  <>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm">
                      <span>{attrStats.total} Produkte geprüft</span>
                      {attrStats.voltChanged > 0 && <span className="text-orange-600 font-medium">{attrStats.voltChanged} Volt korrigiert</span>}
                      {attrStats.voltExtracted > 0 && <span className="text-blue-600">{attrStats.voltExtracted} Volt extrahiert</span>}
                      {attrStats.htmlCorrectedCount > 0 && <span className="text-green-600">{attrStats.htmlCorrectedCount} Beschreibungen sync.</span>}
                    </div>
                    {changedAttrItems.length > 0 && (
                      <div className="mt-2">
                        <button
                          onClick={() => setShowAttrDetails(!showAttrDetails)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                        >
                          {showAttrDetails ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          {changedAttrItems.length} geänderte Produkte anzeigen
                        </button>
                        {showAttrDetails && (
                          <div className="mt-2 max-h-64 overflow-auto rounded border">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-slate-50">
                                <tr className="border-b">
                                  <th className="text-left py-1.5 px-2">Artikel-Nr.</th>
                                  <th className="text-left py-1.5 px-2">Volt alt</th>
                                  <th className="text-left py-1.5 px-2">Volt neu</th>
                                  <th className="text-left py-1.5 px-2">Geänderte Felder</th>
                                </tr>
                              </thead>
                              <tbody>
                                {changedAttrItems.slice(0, 100).map((item: any, i: number) => (
                                  <tr key={i} className="border-b last:border-0">
                                    <td className="py-1 px-2 font-mono">{item.itemNr || item.pId}</td>
                                    <td className="py-1 px-2 text-red-600">{item.voltOrig || '—'}</td>
                                    <td className="py-1 px-2 text-green-600">{item.voltNew || '—'}</td>
                                    <td className="py-1 px-2 text-gray-500">{(item.changed || []).join(', ')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {changedAttrItems.length > 100 && (
                              <p className="text-xs text-center text-muted-foreground py-1">… und {changedAttrItems.length - 100} weitere</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                {attrStatus === 'error' && <p className="mt-2 text-sm text-red-500">{attrError}</p>}
              </CardContent>
            </Card>

            <div className="flex justify-center">
              <div className="w-px h-4 bg-gray-300" />
            </div>

            <Card className={descStatus === 'running' ? 'ring-2 ring-indigo-200' : ''}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StatusIcon status={descStatus} />
                    <div>
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-500" />
                        <span className="font-medium">Schritt 3: Beschreibungs-Generator</span>
                      </div>
                      <p className="text-sm text-muted-foreground">KI-generierte Produktbeschreibungen (HTML-Struktur)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={descStatus} />
                    <Button size="sm" variant="outline" onClick={() => runDescriptions()} disabled={anyRunning}>
                      <Play className="w-3 h-3 mr-1" /> Ausführen
                    </Button>
                  </div>
                </div>
                {descStatus === 'running' && (
                  <div className="mt-4 space-y-2 bg-purple-50 rounded-lg p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-purple-800 font-medium">
                        {descProgress.total > 0
                          ? `${descProgress.current} / ${descProgress.total} Produkte — ${descProgress.productName}`
                          : descProgress.productName || 'Wird vorbereitet…'}
                      </span>
                      <span className="text-purple-700 font-bold tabular-nums">
                        {descProgress.total > 0 ? Math.round((descProgress.current / descProgress.total) * 100) : 0}%
                      </span>
                    </div>
                    <Progress value={descProgress.total > 0 ? (descProgress.current / descProgress.total) * 100 : 0} className="h-3" />
                  </div>
                )}
                {descStatus === 'done' && descStats && (
                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    <span className="text-green-600 font-medium">{descStats.generated} generiert</span>
                    {descStats.skipped > 0 && <span className="text-gray-500">{descStats.skipped} bereits strukturiert</span>}
                    {descStats.errors > 0 && <span className="text-red-500">{descStats.errors} Fehler</span>}
                  </div>
                )}
                {descStatus === 'error' && <p className="mt-2 text-sm text-red-500">{descError}</p>}
              </CardContent>
            </Card>
          </div>

          {allDone && hasOutput && (
            <Card className="bg-green-50 border-green-200">
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                  <div>
                    <p className="font-medium text-green-800">Pipeline abgeschlossen</p>
                    <p className="text-sm text-green-600">Alle 3 Schritte erfolgreich. Original bleibt unverändert.</p>
                  </div>
                </div>
                <Button onClick={handleDownload} className="bg-green-600 hover:bg-green-700">
                  <Download className="w-4 h-4 mr-2" /> CSV herunterladen
                </Button>
              </CardContent>
            </Card>
          )}

          {changeLog.length > 0 && (
            <Card>
              <CardHeader
                className="py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setShowChangeLog(!showChangeLog)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Änderungsprotokoll ({changeLog.length} Einträge)
                  </CardTitle>
                  {showChangeLog ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
              </CardHeader>
              {showChangeLog && (
                <CardContent className="pt-0">
                  <div className="max-h-96 overflow-auto rounded border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b">
                          <th className="text-left py-2 px-2 font-medium text-xs">Schritt</th>
                          <th className="text-left py-2 px-2 font-medium text-xs">Artikel-Nr.</th>
                          <th className="text-left py-2 px-2 font-medium text-xs">Feld</th>
                          <th className="text-left py-2 px-2 font-medium text-xs">Vorher</th>
                          <th className="text-left py-2 px-2 font-medium text-xs">Nachher</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changeLog.slice(0, 200).map((entry, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                            <td className="py-1.5 px-2">
                              <Badge variant="outline" className="text-xs">{entry.step}</Badge>
                            </td>
                            <td className="py-1.5 px-2 font-mono text-xs">{entry.itemNr}</td>
                            <td className="py-1.5 px-2 text-xs">{entry.field}</td>
                            <td className="py-1.5 px-2 text-xs text-red-600 max-w-[200px] truncate">{entry.oldValue}</td>
                            <td className="py-1.5 px-2 text-xs text-green-600 max-w-[200px] truncate">{entry.newValue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {changeLog.length > 200 && (
                      <p className="text-xs text-center text-muted-foreground py-2">
                        … und {changeLog.length - 200} weitere Einträge
                      </p>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
