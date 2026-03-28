import { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Upload, CheckCircle2, Circle, Loader2, AlertCircle, Download,
  Play, Wrench, Zap, Sparkles, FileText, ChevronDown, ChevronRight,
  RotateCcw, Shield, XCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Papa from 'papaparse';
import { runAttributEngine } from '@/lib/attribut-engine';

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
  const abortRef = useRef<AbortController | null>(null);

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
  const [attrFilterChanged, setAttrFilterChanged] = useState(true);
  const [isRunningAll, setIsRunningAll] = useState(false);

  const getInputForStep = useCallback((step: 'repair' | 'attributes' | 'descriptions'): Blob | File | null => {
    switch (step) {
      case 'repair': return originalFile;
      case 'attributes': return repairCsvBlob || originalFile;
      case 'descriptions': return attrCsvBlob || repairCsvBlob || originalFile;
    }
  }, [originalFile, repairCsvBlob, attrCsvBlob]);

  const getLatestOutput = useCallback((): Blob | null => {
    return attrCsvBlob || repairCsvBlob;
  }, [attrCsvBlob, repairCsvBlob]);

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
    setRepairProgress({ label: 'Datei wird gelesen…', percent: 5 });
    setRepairError('');

    try {
      const raw = await input.text();
      setRepairProgress({ label: 'Zeilen werden analysiert…', percent: 15 });

      let text = raw;
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

      const rawLines = text.split(/\r?\n/);
      const totalRawLines = rawLines.length;

      if (rawLines.length < 2) throw new Error('CSV zu kurz — mindestens Header + 1 Zeile erforderlich');

      const headerLine = rawLines[0];
      const semiCount = (headerLine.match(/;/g) || []).length;
      const commaCount = (headerLine.match(/,/g) || []).length;
      const tabCount = (headerLine.match(/\t/g) || []).length;
      let delimiter = ';';
      if (tabCount > semiCount && tabCount > commaCount) delimiter = '\t';
      else if (commaCount > semiCount) delimiter = ',';

      const headerCols = headerLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
      const pIdIdx = headerCols.findIndex(h => h === 'p_id');
      const pItemNrIdx = headerCols.findIndex(h => h === 'p_item_number');
      const pIdColIdx = pIdIdx >= 0 ? pIdIdx : 0;
      const pItemNrColIdx = pItemNrIdx >= 0 ? pItemNrIdx : 1;

      setRepairProgress({ label: `${totalRawLines.toLocaleString()} Zeilen werden zusammengeführt…`, percent: 25 });

      const looksLikeNewRow = (pId: string) => {
        const id = pId.trim().replace(/^"|"$/g, '');
        if (!id || /<|>/.test(id) || /\n|\r/.test(id) || id.length > 100) return false;
        return /^[\w\-\.\/\+\&]+$/.test(id);
      };

      const delimRegex = delimiter === ';' ? /^;+$/ : delimiter === ',' ? /^,+$/ : /^\t+$/;
      const mergedLines: string[] = [headerLine];
      let emptyLinesRemoved = 0;
      let rowsMerged = 0;

      for (let i = 1; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (!line.trim() || delimRegex.test(line.trim())) {
          emptyLinesRemoved++;
          continue;
        }
        const fields = line.split(delimiter);
        const pIdField = fields[pIdColIdx] ?? '';
        if (looksLikeNewRow(pIdField)) {
          mergedLines.push(line);
        } else {
          if (mergedLines.length > 1) {
            mergedLines[mergedLines.length - 1] += ' ' + line;
            rowsMerged++;
          } else {
            emptyLinesRemoved++;
          }
        }
      }

      setRepairProgress({ label: 'CSV wird bereinigt…', percent: 70 });

      const mergedCsv = mergedLines.join('\n');
      const parsed = Papa.parse<Record<string, string>>(mergedCsv, {
        header: true,
        delimiter,
        skipEmptyLines: true,
      });

      const headers = parsed.meta.fields ?? [];
      let rows = parsed.data;
      rows = rows.filter(row => Object.values(row).some(v => (v ?? '').trim() !== ''));

      const isValidPItemNr = (v: string) => {
        const val = v.trim();
        return val.length > 0 && val.length <= 200 && !/<|>/.test(val) && !/\n|\r/.test(val);
      };

      const beforeFilter = rows.length;
      rows = rows.filter(row => isValidPItemNr(row['p_item_number'] ?? ''));
      const invalidItemNrRemoved = beforeFilter - rows.length;

      setRepairProgress({ label: 'Felder werden bereinigt…', percent: 85 });

      rows = rows.map(row => {
        const r = { ...row };
        for (const key of Object.keys(r)) {
          if (r[key] && typeof r[key] === 'string') {
            r[key] = r[key].replace(/\r?\n|\r/g, ' ').replace(/  +/g, ' ').trim();
          }
        }
        return r;
      });

      const csvOut = Papa.unparse(rows, { delimiter: ';', columns: headers });
      const csvBlob = new Blob(['\uFEFF' + csvOut], { type: 'text/csv;charset=utf-8' });

      const resultStats: RepairStats = {
        totalRawLines,
        emptyLinesRemoved,
        rowsMerged,
        rowsAfterRepair: rows.length,
        invalidItemNrRemoved,
      };

      setRepairProgress({ label: 'Abgeschlossen', percent: 100 });
      setRepairStats(resultStats);
      setRepairCsvBlob(csvBlob);
      setRepairStatus('done');
      setAttrCsvBlob(null); setAttrStatus('pending'); setAttrStats(null); setAttrPreview([]);
      setDescCsvBlob(null); setDescStatus('pending'); setDescStats(null);

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

      return csvBlob;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setRepairStatus('pending');
        setRepairProgress({ label: '', percent: 0 });
        return null;
      }
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
    setAttrProgress({ label: 'Wird vorbereitet…', percent: 0 });
    setAttrError('');

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const csvText = await input.text();

      const result = await runAttributEngine(
        csvText,
        (percent, label) => setAttrProgress({ label, percent }),
        ac.signal,
      );

      setAttrStats(result.stats);
      setAttrPreview(result.previewItems);
      setAttrCsvBlob(result.csvBlob);
      setAttrStatus('done');
      setDescCsvBlob(null); setDescStatus('pending'); setDescStats(null);

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

      return result.csvBlob;
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'Abgebrochen') {
        setAttrStatus('pending');
        setAttrProgress({ label: '', percent: 0 });
        return null;
      }
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

    const ac = new AbortController();
    abortRef.current = ac;

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

      ac.signal.addEventListener('abort', () => eventSource.close());

      const generateRes = await fetch('/api/desc-generator/generate', {
        method: 'POST',
        body: formData,
        headers: {
          ...getAuthHeaders(),
          'x-session-id': sessionId,
        },
        signal: ac.signal,
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
      if (err.name === 'AbortError') {
        setDescStatus('pending');
        setDescProgress({ current: 0, total: 0, productName: '' });
        return null;
      }
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

      toast({ title: 'Pipeline abgeschlossen', description: 'Reparatur + Attribute fertig. Beschreibungs-Generator kann separat gestartet werden.' });
    } finally {
      setIsRunningAll(false);
    }
  };

  const cancelRunning = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (repairTimerRef.current) {
      clearInterval(repairTimerRef.current);
      repairTimerRef.current = null;
    }
    if (repairStatus === 'running') {
      setRepairStatus('pending');
      setRepairProgress({ label: '', percent: 0 });
    }
    if (attrStatus === 'running') {
      setAttrStatus('pending');
      setAttrProgress({ label: '', percent: 0 });
    }
    if (descStatus === 'running') {
      setDescStatus('pending');
      setDescProgress({ current: 0, total: 0, productName: '' });
    }
    setIsRunningAll(false);
    toast({ title: 'Abgebrochen', description: 'Der laufende Schritt wurde abgebrochen.' });
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
  const hasOutput = !!(attrCsvBlob || repairCsvBlob);
  const allDone = repairStatus === 'done' && attrStatus === 'done';

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
            {anyRunning ? (
              <Button
                size="lg"
                variant="destructive"
                onClick={cancelRunning}
              >
                <XCircle className="w-4 h-4 mr-2" /> Abbrechen
              </Button>
            ) : (
              <Button
                size="lg"
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={runAll}
                disabled={anyRunning || isRunningAll}
              >
                <Zap className="w-4 h-4 mr-2" /> Alles optimieren
              </Button>
            )}
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
                    {attrPreview.length > 0 && (
                      <div className="mt-2">
                        <button
                          onClick={() => setShowAttrDetails(!showAttrDetails)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                        >
                          {showAttrDetails ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          {attrPreview.length} Produkte Vorschau {changedAttrItems.length > 0 ? `(${changedAttrItems.length} geändert)` : ''}
                        </button>
                        {showAttrDetails && (
                          <>
                            <div className="mt-2 flex gap-2 text-xs mb-2">
                              <label className="flex items-center gap-1">
                                <input type="checkbox" checked={attrFilterChanged} onChange={e => setAttrFilterChanged(e.target.checked)} className="rounded" />
                                Nur geänderte
                              </label>
                            </div>
                            <div className="mt-1 max-h-96 overflow-auto rounded border">
                              <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-slate-50 z-10">
                                  <tr className="border-b">
                                    <th className="text-left py-1.5 px-2 whitespace-nowrap">Artikel-Nr.</th>
                                    <th className="text-left py-1.5 px-2 whitespace-nowrap">Name (DE)</th>
                                    <th className="text-left py-1.5 px-2 whitespace-nowrap">Name (NL)</th>
                                    <th className="text-left py-1.5 px-2 whitespace-nowrap">Volt alt</th>
                                    <th className="text-left py-1.5 px-2 whitespace-nowrap">Volt neu</th>
                                    <th className="text-left py-1.5 px-2 whitespace-nowrap">Beschr. DE</th>
                                    <th className="text-left py-1.5 px-2 whitespace-nowrap">Beschr. NL</th>
                                    <th className="text-left py-1.5 px-2 whitespace-nowrap">Geänderte Felder</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(attrFilterChanged ? changedAttrItems : attrPreview).slice(0, 200).map((item: any, i: number) => {
                                    const hasChanges = item.changed && item.changed.length > 0;
                                    return (
                                      <tr key={i} className={`border-b last:border-0 ${hasChanges ? 'bg-yellow-50' : ''}`}>
                                        <td className="py-1 px-2 font-mono whitespace-nowrap">{item.itemNr || item.pId}</td>
                                        <td className="py-1 px-2 max-w-[200px] truncate" title={item.nameDE}>{item.nameDE || '—'}</td>
                                        <td className="py-1 px-2 max-w-[200px] truncate" title={item.nameNL}>{item.nameNL || '—'}</td>
                                        <td className={`py-1 px-2 whitespace-nowrap ${item.voltOrig !== item.voltNew ? 'text-red-600' : ''}`}>{item.voltOrig || '—'}</td>
                                        <td className={`py-1 px-2 whitespace-nowrap ${item.voltOrig !== item.voltNew ? 'text-green-600 font-medium' : ''}`}>{item.voltNew || '—'}</td>
                                        <td className="py-1 px-2">
                                          {item.descDEChanged
                                            ? <span className="text-green-600 font-medium">✓ sync</span>
                                            : item.hasHtml ? <span className="text-gray-400">OK</span> : <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="py-1 px-2">
                                          {item.descNLChanged
                                            ? <span className="text-green-600 font-medium">✓ sync</span>
                                            : item.descNL ? <span className="text-gray-400">OK</span> : <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="py-1 px-2 text-gray-500 max-w-[180px] truncate" title={(item.changed || []).join(', ')}>{(item.changed || []).join(', ') || '—'}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                              {(attrFilterChanged ? changedAttrItems : attrPreview).length > 200 && (
                                <p className="text-xs text-center text-muted-foreground py-1">… und {(attrFilterChanged ? changedAttrItems : attrPreview).length - 200} weitere</p>
                              )}
                            </div>
                          </>
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
                    <Button size="sm" variant="outline" onClick={() => {
                      const blob = attrCsvBlob || repairCsvBlob;
                      if (!blob) {
                        toast({ title: 'Kein CSV vorhanden', description: 'Bitte zuerst Reparatur und Attribute ausführen.', variant: 'destructive' });
                        return;
                      }
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      const baseName = (originalFile?.name || 'output').replace(/\.csv$/i, '');
                      a.download = baseName + '_attribut.csv';
                      a.click();
                      URL.revokeObjectURL(url);
                      toast({ title: 'CSV heruntergeladen', description: 'Lade die Datei im Beschreibungs-Generator hoch.' });
                    }} disabled={!attrCsvBlob && !repairCsvBlob}>
                      <Download className="w-3 h-3 mr-1" /> CSV herunterladen
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
