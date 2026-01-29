import { useState, useMemo, useCallback } from 'react';
import Papa from 'papaparse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, Download, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, Eye, Loader2, RefreshCw, Pencil, Play, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Kategorisiertes Produkt (Schritt 1)
interface CategorizedRow {
  p_item_number?: string;
  'p_name[de]': string;
  'p_description[de]': string;
  _category: string;
  _rowIndex: number;
  error?: string;
  _status: 'ready' | 'error';
  [key: string]: any;
}

// Generiertes Produkt (Schritt 2)
interface GeneratedRow {
  p_item_number?: string;
  'p_name[de]': string;
  'p_description[de]': string;
  original_description?: string;
  bullet_1?: string;
  bullet_2?: string;
  bullet_3?: string;
  akku_mah?: string;
  akku_wh?: string;
  akku_v?: string;
  akku_ch?: string;
  error?: string;
  _status: 'success' | 'error' | 'skipped';
  _category?: string;
}

interface CategorizeResult {
  success: boolean;
  summary: {
    total: number;
    ready: number;
    errors: number;
    categories: Record<string, number>;
  };
  rows: CategorizedRow[];
}

interface GenerationResult {
  success: boolean;
  summary: {
    total: number;
    success: number;
    errors: number;
    skipped: number;
  };
  rows: GeneratedRow[];
}

interface ProgressState {
  current: number;
  total: number;
  productName: string;
}

const ALL_CATEGORIES = [
  'NOTLEUCHTE', 'FUNKAKKU', 'WERKZEUGAKKU', 'TELEFON', 'MEDIZIN', 'KAMERAAKKU',
  'POWERBANK', 'HAUSHALT', 'AIRSOFT', 'GARTEN', 'MOTORRAD', 'KRANAKKU',
  'SPEICHERBATTERIE', 'BLEIAKKU', 'TUERSTEURUNG', 'PUFFERBATTERIE', 'FAHRRAD',
  'RASIERER', 'HANDLEUCHTE', 'ZELLENTAUSCH', 'GENERISCH'
];

export default function AkkushopGenerator() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'upload' | 'categorized' | 'generated'>('upload');
  
  // Schritt 1: Kategorisierung
  const [categorizedResult, setCategorizedResult] = useState<CategorizeResult | null>(null);
  const [categorizedRows, setCategorizedRows] = useState<CategorizedRow[]>([]);
  
  // Schritt 2: Generierung
  const [generatedResult, setGeneratedResult] = useState<GenerationResult | null>(null);
  
  const [previewRow, setPreviewRow] = useState<GeneratedRow | null>(null);
  const [downloadFilename, setDownloadFilename] = useState('akkushop_generated');
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [editingCategory, setEditingCategory] = useState<number | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [originalDescPreview, setOriginalDescPreview] = useState<{name: string; desc: string} | null>(null);
  const [selectedGeneratedRows, setSelectedGeneratedRows] = useState<Set<number>>(new Set());
  
  // Generierungs-Optionen (Checkboxen)
  const [genOptions, setGenOptions] = useState({
    description: true,
    bullets: false,
    attributes: false,
  });
  
  const { toast } = useToast();

  // Gefilterte Zeilen basierend auf Kategorie-Filter
  const filteredRows = useMemo(() => {
    if (categoryFilter === 'all') return categorizedRows;
    return categorizedRows.filter(row => row._category === categoryFilter);
  }, [categorizedRows, categoryFilter]);

  // Kategorie-Statistiken
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    categorizedRows.forEach(row => {
      stats[row._category] = (stats[row._category] || 0) + 1;
    });
    return stats;
  }, [categorizedRows]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const ext = selectedFile.name.toLowerCase();
      if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls') && !ext.endsWith('.csv')) {
        toast({
          title: 'Ungültiges Format',
          description: 'Bitte laden Sie eine .xlsx, .xls oder .csv Datei hoch.',
          variant: 'destructive',
        });
        return;
      }
      setFile(selectedFile);
      setCategorizedResult(null);
      setCategorizedRows([]);
      setGeneratedResult(null);
      setStep('upload');
    }
  };

  // Schritt 1: Kategorisierung
  const handleCategorize = async () => {
    if (!file) {
      toast({ title: 'Keine Datei', description: 'Bitte wählen Sie eine Datei aus.', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    setProgress(null);
    
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const eventSource = new EventSource(`/api/akkushop-generator/progress/${sessionId}`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.current && data.total) {
          setProgress({
            current: data.current,
            total: data.total,
            productName: data.productName || '',
          });
        }
      } catch (e) {
        console.error('Progress parse error:', e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/akkushop-generator/categorize', {
        method: 'POST',
        body: formData,
        headers: {
          'X-Session-Id': sessionId,
        },
      });

      eventSource.close();

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Kategorisierung fehlgeschlagen');
      }

      setCategorizedResult(data);
      setCategorizedRows(data.rows);
      setStep('categorized');
      
      toast({
        title: 'Kategorisierung abgeschlossen',
        description: `${data.summary.ready} von ${data.summary.total} Produkten kategorisiert.`,
      });
    } catch (error: any) {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      eventSource.close();
      setIsProcessing(false);
      setProgress(null);
    }
  };

  // Kategorie manuell ändern
  const handleCategoryChange = (rowIndex: number, newCategory: string) => {
    setCategorizedRows(prev => prev.map((row, idx) => 
      idx === rowIndex ? { ...row, _category: newCategory } : row
    ));
    setEditingCategory(null);
  };

  // Checkbox-Handler
  const handleSelectRow = (rowIndex: number, checked: boolean) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(rowIndex);
      } else {
        next.delete(rowIndex);
      }
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allReady = categorizedRows
        .filter(r => r._status === 'ready')
        .map(r => r._rowIndex);
      setSelectedRows(new Set(allReady));
    } else {
      setSelectedRows(new Set());
    }
  };

  const allReadySelected = useMemo(() => {
    const readyRows = categorizedRows.filter(r => r._status === 'ready');
    return readyRows.length > 0 && readyRows.every(r => selectedRows.has(r._rowIndex));
  }, [categorizedRows, selectedRows]);

  // Handler für generierte Ergebnisse Checkboxen (mit useCallback für Performance)
  const handleSelectGeneratedRow = useCallback((index: number, checked: boolean) => {
    setSelectedGeneratedRows(prev => {
      const next = new Set(prev);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });
  }, []);

  const handleSelectAllGenerated = useCallback((checked: boolean) => {
    if (checked && generatedResult?.rows) {
      const successIndices = generatedResult.rows
        .map((r, i) => r._status === 'success' ? i : -1)
        .filter(i => i >= 0);
      setSelectedGeneratedRows(new Set(successIndices));
    } else {
      setSelectedGeneratedRows(new Set());
    }
  }, [generatedResult?.rows]);

  const allGeneratedSelected = useMemo(() => {
    if (!generatedResult?.rows) return false;
    const successRows = generatedResult.rows.filter(r => r._status === 'success');
    return successRows.length > 0 && selectedGeneratedRows.size === successRows.length;
  }, [generatedResult?.rows, selectedGeneratedRows]);

  // Generierungs-Option Handler
  const handleGenerateOption = async (option: 'bullets' | 'attributes' | 'full') => {
    // Nur Zeilen mit Status 'ready' verarbeiten
    const rowsToGenerate = categorizedRows.filter(r => selectedRows.has(r._rowIndex) && r._status === 'ready');
    
    if (rowsToGenerate.length === 0) {
      toast({ title: 'Keine Auswahl', description: 'Bitte wählen Sie Produkte mit Status "bereit" aus.', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    setProgress(null);
    
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const eventSource = new EventSource(`/api/akkushop-generator/progress/${sessionId}`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.current && data.total) {
          setProgress({
            current: data.current,
            total: data.total,
            productName: data.productName || '',
          });
        }
      } catch (e) {
        console.error('Progress parse error:', e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    // Endpoint basierend auf Option wählen
    const endpoints: Record<string, string> = {
      'bullets': '/api/akkushop-generator/generate-bullets-only',
      'attributes': '/api/akkushop-generator/extract-attributes-only',
      'full': '/api/akkushop-generator/generate-from-categorized',
    };

    const titles: Record<string, string> = {
      'bullets': 'Bulletpoints generiert',
      'attributes': 'Attribute extrahiert',
      'full': 'Beschreibungen generiert',
    };

    try {
      const response = await fetch(endpoints[option], {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': sessionId,
        },
        body: JSON.stringify({ rows: rowsToGenerate }),
      });

      eventSource.close();

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Verarbeitung fehlgeschlagen');
      }

      setGeneratedResult(data);
      setStep('generated');
      
      toast({
        title: titles[option],
        description: `${data.summary.success} von ${data.summary.total} Produkte verarbeitet.`,
      });
    } catch (error: any) {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      eventSource.close();
      setIsProcessing(false);
      setProgress(null);
    }
  };

  // Kombinierte Generierung mit Checkbox-Optionen
  const handleGenerateWithOptions = async () => {
    const rowsToGenerate = categorizedRows.filter(r => selectedRows.has(r._rowIndex) && r._status === 'ready');
    
    if (rowsToGenerate.length === 0) {
      toast({ title: 'Keine Auswahl', description: 'Bitte wählen Sie Produkte mit Status "bereit" aus.', variant: 'destructive' });
      return;
    }

    if (!genOptions.description && !genOptions.bullets && !genOptions.attributes) {
      toast({ title: 'Keine Option', description: 'Bitte wählen Sie mindestens eine Option.', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    setProgress(null);
    
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const eventSource = new EventSource(`/api/akkushop-generator/progress/${sessionId}`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.current && data.total) {
          setProgress({
            current: data.current,
            total: data.total,
            productName: data.productName || '',
          });
        }
      } catch (e) {
        console.error('Progress parse error:', e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    try {
      let resultRows = rowsToGenerate.map(r => ({ 
        ...r, 
        _status: 'success' as const,
        original_description: r['p_description[de]'],
      }));

      // 1. Wenn Beschreibung gewählt, vollständige Generierung
      if (genOptions.description) {
        const response = await fetch('/api/akkushop-generator/generate-from-categorized', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
          body: JSON.stringify({ rows: rowsToGenerate }),
        });
        const data = await response.json();
        if (data.rows) {
          resultRows = data.rows;
        }
      }

      // 2. Wenn Bulletpoints gewählt (und keine Beschreibung), Bulletpoints extrahieren
      if (genOptions.bullets && !genOptions.description) {
        const response = await fetch('/api/akkushop-generator/generate-bullets-only', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: resultRows }),
        });
        const data = await response.json();
        if (data.rows) {
          resultRows = data.rows;
        }
      }

      // 3. Wenn Attribute gewählt (und keine Beschreibung), Attribute extrahieren
      if (genOptions.attributes && !genOptions.description) {
        const response = await fetch('/api/akkushop-generator/extract-attributes-only', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: resultRows }),
        });
        const data = await response.json();
        if (data.rows) {
          resultRows = data.rows;
        }
      }

      const successCount = resultRows.filter((r: any) => r._status === 'success').length;
      const errorCount = resultRows.filter((r: any) => r._status === 'error').length;
      
      setGeneratedResult({
        success: true,
        summary: { total: resultRows.length, success: successCount, errors: errorCount, skipped: 0 },
        rows: resultRows as any,
      });
      setStep('generated');
      
      const optionNames = [];
      if (genOptions.description) optionNames.push('Beschreibungen');
      if (genOptions.bullets) optionNames.push('Bulletpoints');
      if (genOptions.attributes) optionNames.push('Attribute');
      
      toast({ title: 'Erfolgreich', description: `${optionNames.join(', ')} für ${resultRows.length} Produkte generiert.` });
    } catch (error: any) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    } finally {
      eventSource.close();
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const handleDownload = async (format: 'xlsx' | 'csv', filter: 'success' | 'errors' | 'generisch' | 'selected' = 'success', withBom: boolean = false) => {
    if (!generatedResult?.rows) return;

    try {
      let filteredRows;
      let suffix = '';
      
      if (filter === 'selected') {
        // Nur ausgewählte Zeilen exportieren
        filteredRows = generatedResult.rows.filter((_, index) => selectedGeneratedRows.has(index));
        suffix = '_auswahl';
      } else if (filter === 'errors') {
        filteredRows = generatedResult.rows.filter(r => r._status === 'error' || r._status === 'skipped');
        suffix = '_fehler';
      } else if (filter === 'generisch') {
        filteredRows = generatedResult.rows.filter(r => r._category === 'GENERISCH');
        suffix = '_generisch';
      } else {
        // Nur erfolgreiche UND nicht-generische Produkte
        filteredRows = generatedResult.rows.filter(r => r._status === 'success' && r._category !== 'GENERISCH');
      }

      const response = await fetch('/api/akkushop-generator/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: filteredRows, format, errorsOnly: filter === 'errors', withBom }),
      });

      if (!response.ok) throw new Error('Download fehlgeschlagen');

      const blob = await response.blob();
      const filename = `${downloadFilename}${suffix}.${format}`;
      
      // Für Iframe-kompatiblen Download: Öffne Blob in neuem Fenster
      const reader = new FileReader();
      reader.onload = function() {
        const dataUrl = reader.result as string;
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(`
            <html>
            <head><title>Download</title></head>
            <body>
              <p>Download startet automatisch...</p>
              <p><a id="dl" href="${dataUrl}" download="${filename}">Falls nicht, hier klicken</a></p>
              <script>
                document.getElementById('dl').click();
                setTimeout(function() { window.close(); }, 3000);
              </script>
            </body>
            </html>
          `);
          newWindow.document.close();
        } else {
          // Fallback: Direkter Download-Link
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
          }, 2000);
        }
      };
      reader.readAsDataURL(blob);

      toast({
        title: 'Download gestartet',
        description: `${filteredRows.length} Zeilen werden heruntergeladen.`,
      });
    } catch (error: any) {
      toast({
        title: 'Download-Fehler',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
      case 'ready':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />OK</Badge>;
      case 'error':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Fehler</Badge>;
      case 'skipped':
        return <Badge className="bg-amber-100 text-amber-800"><AlertTriangle className="w-3 h-3 mr-1" />Übersprungen</Badge>;
      default:
        return null;
    }
  };

  const resetToUpload = () => {
    setFile(null);
    setCategorizedResult(null);
    setCategorizedRows([]);
    setGeneratedResult(null);
    setStep('upload');
    setCategoryFilter('all');
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-indigo-600 mb-2">Akkushop Description Generator</h1>
        <p className="text-gray-600">
          2-Stufen-Prozess: Erst Kategorisierung prüfen, dann Beschreibungen generieren.
        </p>
      </div>

      {/* Schritt-Anzeige */}
      <div className="mb-6 flex items-center gap-4">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${step === 'upload' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
          <span className="font-semibold">1.</span> Datei hochladen
        </div>
        <div className="text-gray-400">→</div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${step === 'categorized' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
          <span className="font-semibold">2.</span> Kategorien prüfen
        </div>
        <div className="text-gray-400">→</div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${step === 'generated' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
          <span className="font-semibold">3.</span> Beschreibungen
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload & Aktionen */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
              {step === 'upload' ? 'Datei hochladen' : step === 'categorized' ? 'Kategorien prüfen' : 'Beschreibungen generiert'}
            </CardTitle>
            <CardDescription>
              {step === 'upload' && 'Laden Sie eine Excel (.xlsx) oder CSV-Datei mit den Spalten p_name[de] und p_description[de] hoch.'}
              {step === 'categorized' && 'Prüfen Sie die erkannten Kategorien und korrigieren Sie bei Bedarf.'}
              {step === 'generated' && 'Die Beschreibungen wurden generiert. Sie können diese jetzt herunterladen.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 'upload' && (
              <div className="flex items-center gap-4">
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="flex-1"
                />
                <Button
                  onClick={handleCategorize}
                  disabled={!file || isProcessing}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Kategorisiere...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Kategorisieren
                    </>
                  )}
                </Button>
              </div>
            )}

            {step === 'categorized' && (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    onClick={resetToUpload}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Neue Datei
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-4 border rounded-lg px-4 py-2 bg-gray-50">
                    <span className="text-sm font-medium text-gray-700">Optionen:</span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={genOptions.description}
                        onCheckedChange={(checked) => setGenOptions(prev => ({ ...prev, description: !!checked }))}
                      />
                      <span className="text-sm">Produktbeschreibung</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={genOptions.bullets}
                        onCheckedChange={(checked) => setGenOptions(prev => ({ ...prev, bullets: !!checked }))}
                      />
                      <span className="text-sm">Bulletpoints</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={genOptions.attributes}
                        onCheckedChange={(checked) => setGenOptions(prev => ({ ...prev, attributes: !!checked }))}
                      />
                      <span className="text-sm">Attribute</span>
                    </label>
                  </div>
                  <Button
                    onClick={() => handleGenerateWithOptions()}
                    disabled={isProcessing || selectedRows.size === 0 || (!genOptions.description && !genOptions.bullets && !genOptions.attributes)}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                    Generieren ({selectedRows.size})
                  </Button>
                </div>
              </div>
            )}

            {step === 'generated' && (
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={resetToUpload}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Neue Datei
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setStep('categorized')}
                >
                  Zurück zu Kategorien
                </Button>
              </div>
            )}

            {file && step === 'upload' && !isProcessing && (
              <p className="text-sm text-gray-600">
                Ausgewählte Datei: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}

            {isProcessing && progress && (
              <div className="space-y-2 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                <div className="flex justify-between text-sm">
                  <span className="text-indigo-700 font-medium">
                    {step === 'upload' ? 'Kategorisiere...' : 'Generiere Beschreibungen...'}
                  </span>
                  <span className="text-indigo-600 font-semibold">
                    {progress.current} / {progress.total} ({Math.round((progress.current / progress.total) * 100)}%)
                  </span>
                </div>
                <div className="w-full bg-indigo-200 rounded-full h-3 overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-3 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-indigo-600 truncate">
                  Aktuell: {progress.productName}...
                </p>
              </div>
            )}

            {isProcessing && !progress && (
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2 text-gray-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Datei wird verarbeitet...</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Zusammenfassung */}
        {(categorizedResult || generatedResult) && (
          <Card>
            <CardHeader>
              <CardTitle>Zusammenfassung</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {step === 'categorized' && categorizedResult && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Gesamt:</span>
                    <span className="font-semibold">{categorizedResult.summary.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-600">Bereit:</span>
                    <span className="font-semibold text-green-600">{categorizedResult.summary.ready}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-600">Fehler:</span>
                    <span className="font-semibold text-red-600">{categorizedResult.summary.errors}</span>
                  </div>
                  <hr className="my-2" />
                  <p className="text-sm font-medium text-gray-700">Kategorien:</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {Object.entries(categoryStats).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                      <div key={cat} className="flex justify-between text-sm">
                        <span className={cat === 'GENERISCH' ? 'text-amber-600' : 'text-gray-600'}>{cat}:</span>
                        <span className={cat === 'GENERISCH' ? 'font-semibold text-amber-600' : 'font-medium'}>{count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {step === 'generated' && generatedResult && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Gesamt:</span>
                    <span className="font-semibold">{generatedResult.summary.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-600">Erfolg:</span>
                    <span className="font-semibold text-green-600">{generatedResult.summary.success}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-600">Fehler:</span>
                    <span className="font-semibold text-red-600">{generatedResult.summary.errors}</span>
                  </div>
                  <hr className="my-2" />
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Dateiname:</label>
                    <Input
                      value={downloadFilename}
                      onChange={(e) => setDownloadFilename(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="akkushop_generated"
                    />
                  </div>
                  <Button
                    onClick={() => handleDownload('xlsx', 'selected')}
                    className="w-full bg-indigo-600 hover:bg-indigo-700"
                    disabled={selectedGeneratedRows.size === 0}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Auswahl als Excel ({selectedGeneratedRows.size})
                  </Button>
                  <Button
                    onClick={() => handleDownload('csv', 'selected', false)}
                    variant="outline"
                    className="w-full"
                    disabled={selectedGeneratedRows.size === 0}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Auswahl als CSV ({selectedGeneratedRows.size})
                  </Button>
                  {generatedResult.summary.errors > 0 && (
                    <Button
                      onClick={() => handleDownload('xlsx', 'errors')}
                      variant="outline"
                      className="w-full border-red-300 text-red-600 hover:bg-red-50"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Fehler als Excel (.xlsx)
                    </Button>
                  )}
                  {generatedResult.rows.some(r => r._category === 'GENERISCH') && (
                    <Button
                      onClick={() => handleDownload('xlsx', 'generisch')}
                      variant="outline"
                      className="w-full border-yellow-400 text-yellow-700 hover:bg-yellow-50"
                    >
                      <AlertTriangle className="w-4 h-4 mr-2" />
                      Generisch als Excel (.xlsx)
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Kategorisierte Produkte (Schritt 2) */}
      {step === 'categorized' && categorizedRows.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Kategorisierte Produkte ({categorizedRows.length})</CardTitle>
                <CardDescription>Prüfen Sie die Kategorien. Bei GENERISCH können Sie manuell eine bessere Kategorie wählen.</CardDescription>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Filter:</span>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle ({categorizedRows.length})</SelectItem>
                      {Object.entries(categoryStats).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                        <SelectItem key={cat} value={cat}>
                          {cat} ({count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  {categoryStats['GENERISCH'] > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-yellow-400 text-yellow-700 hover:bg-yellow-50"
                      onClick={() => {
                        const generischRows = categorizedRows.filter(r => r._category === 'GENERISCH');
                        const csvContent = Papa.unparse(generischRows.map(r => ({
                          p_item_number: r.p_item_number,
                          'p_name[de]': r['p_name[de]'],
                          'p_description[de]': r['p_description[de]'],
                          _category: r._category,
                        })), { delimiter: ';' });
                        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'generisch_produkte.csv';
                        a.style.display = 'none';
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(() => {
                          URL.revokeObjectURL(url);
                          document.body.removeChild(a);
                        }, 1000);
                      }}
                    >
                      <AlertTriangle className="w-4 h-4 mr-1" />
                      Generisch ({categoryStats['GENERISCH']})
                    </Button>
                  )}
                  {categorizedRows.some(r => r._status === 'error') && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-300 text-red-600 hover:bg-red-50"
                      onClick={() => {
                        const errorRows = categorizedRows.filter(r => r._status === 'error');
                        const csvContent = Papa.unparse(errorRows.map(r => ({
                          p_item_number: r.p_item_number,
                          'p_name[de]': r['p_name[de]'],
                          'p_description[de]': r['p_description[de]'],
                          _error: r._error,
                        })), { delimiter: ';' });
                        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'fehler_produkte.csv';
                        a.style.display = 'none';
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(() => {
                          URL.revokeObjectURL(url);
                          document.body.removeChild(a);
                        }, 1000);
                      }}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Fehler ({categorizedRows.filter(r => r._status === 'error').length})
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-scroll overflow-y-auto max-h-[600px] border rounded-lg" style={{ scrollbarGutter: 'stable' }}>
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10">
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allReadySelected}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Artikelnummer</TableHead>
                    <TableHead>Produktname</TableHead>
                    <TableHead>Original-Beschr.</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Fehler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row, index) => {
                    const originalIndex = categorizedRows.indexOf(row);
                    return (
                      <TableRow key={index} className={row._status === 'error' ? 'bg-red-50' : row._category === 'GENERISCH' ? 'bg-amber-50' : selectedRows.has(row._rowIndex) ? 'bg-indigo-50' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={selectedRows.has(row._rowIndex)}
                            onCheckedChange={(checked) => handleSelectRow(row._rowIndex, !!checked)}
                            disabled={row._status === 'error'}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{row._rowIndex + 1}</TableCell>
                        <TableCell>{getStatusBadge(row._status)}</TableCell>
                        <TableCell className="font-mono text-sm">{row.p_item_number || '-'}</TableCell>
                        <TableCell className="max-w-xs">
                          <div className="flex items-center gap-2">
                            <span className="truncate flex-1">{row['p_name[de]']}</span>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 flex-shrink-0">
                                  <Eye className="w-3 h-3 text-gray-400 hover:text-indigo-600" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-96 max-h-48 overflow-y-auto">
                                <p className="text-sm font-medium mb-1">Vollständiger Produktname:</p>
                                <p className="text-sm text-gray-700 break-words">{row['p_name[de]']}</p>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <div className="flex items-center gap-2">
                            <div 
                              className="flex-1 max-h-20 overflow-hidden text-xs prose prose-sm [&_table]:hidden [&_h1]:text-sm [&_h2]:text-xs [&_p]:text-xs [&_ul]:text-xs [&_li]:text-xs"
                              dangerouslySetInnerHTML={{ __html: (row['p_description[de]'] || '-').substring(0, 500) }}
                            />
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 w-6 p-0 flex-shrink-0"
                              onClick={() => setOriginalDescPreview({
                                name: row['p_name[de]'],
                                desc: row['p_description[de]'] || '-'
                              })}
                            >
                              <Eye className="w-3 h-3 text-gray-400 hover:text-indigo-600" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {editingCategory === originalIndex ? (
                            <Select 
                              value={row._category} 
                              onValueChange={(val) => handleCategoryChange(originalIndex, val)}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ALL_CATEGORIES.map(cat => (
                                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Badge 
                                variant="outline" 
                                className={`text-xs font-normal ${row._category === 'GENERISCH' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}
                              >
                                {row._category}
                              </Badge>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 w-6 p-0"
                                onClick={() => setEditingCategory(originalIndex)}
                              >
                                <Pencil className="w-3 h-3 text-gray-400 hover:text-indigo-600" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-red-600" title={row.error || ''}>
                          {row.error || '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generierte Beschreibungen (Schritt 3) */}
      {step === 'generated' && generatedResult && generatedResult.rows.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Ergebnisse ({generatedResult.rows.length} Produkte)</CardTitle>
            <CardDescription>Klicken Sie auf das Auge-Icon um die generierte HTML-Beschreibung anzuzeigen.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-scroll overflow-y-auto max-h-[600px] border rounded-lg" style={{ scrollbarGutter: 'stable' }}>
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10">
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allGeneratedSelected}
                        onCheckedChange={(checked) => handleSelectAllGenerated(!!checked)}
                      />
                    </TableHead>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Artikelnummer</TableHead>
                    <TableHead>Produktname</TableHead>
                    <TableHead className="min-w-[300px]">Original-Beschreibung</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Bullet 1</TableHead>
                    <TableHead>Bullet 2</TableHead>
                    <TableHead>V</TableHead>
                    <TableHead>mAh</TableHead>
                    <TableHead>Wh</TableHead>
                    <TableHead>Chem.</TableHead>
                    <TableHead>Fehler</TableHead>
                    <TableHead className="w-24">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {generatedResult.rows.map((row, index) => (
                    <TableRow key={index} className={row._status === 'error' ? 'bg-red-50' : row._status === 'skipped' ? 'bg-amber-50' : selectedGeneratedRows.has(index) ? 'bg-indigo-50' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedGeneratedRows.has(index)}
                          onCheckedChange={(checked) => handleSelectGeneratedRow(index, !!checked)}
                          disabled={row._status === 'error'}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{index + 1}</TableCell>
                      <TableCell>{getStatusBadge(row._status)}</TableCell>
                      <TableCell className="font-mono text-sm">{row.p_item_number || '-'}</TableCell>
                      <TableCell className="max-w-xs">
                        <div className="flex items-center gap-2">
                          <span className="truncate flex-1">{row['p_name[de]']}</span>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 flex-shrink-0">
                                <Eye className="w-3 h-3 text-gray-400 hover:text-indigo-600" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-96 max-h-48 overflow-y-auto">
                              <p className="text-sm font-medium mb-1">Vollständiger Produktname:</p>
                              <p className="text-sm text-gray-700 break-words">{row['p_name[de]']}</p>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[300px] max-w-[400px]">
                        <div className="flex items-center gap-2">
                          <div 
                            className="flex-1 max-h-16 overflow-hidden text-xs prose prose-sm [&_table]:hidden [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_p]:text-xs [&_ul]:text-xs [&_li]:text-xs"
                            dangerouslySetInnerHTML={{ __html: (row.original_description || '-').substring(0, 400) }}
                          />
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 w-6 p-0 flex-shrink-0"
                            onClick={() => setOriginalDescPreview({
                              name: row['p_name[de]'],
                              desc: row.original_description || '-'
                            })}
                          >
                            <Eye className="w-3 h-3 text-gray-400 hover:text-indigo-600" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        {row._category ? (
                          <Badge variant="outline" className="text-xs font-normal bg-indigo-50 text-indigo-700 border-indigo-200">
                            {row._category}
                          </Badge>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-xs" title={row.bullet_1 || ''}>
                        {row.bullet_1 || <span className="text-gray-300">-</span>}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-xs" title={row.bullet_2 || ''}>
                        {row.bullet_2 || <span className="text-gray-300">-</span>}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {row.akku_v || <span className="text-gray-300">-</span>}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {row.akku_mah || <span className="text-gray-300">-</span>}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {row.akku_wh || <span className="text-gray-300">-</span>}
                      </TableCell>
                      <TableCell className="max-w-[80px] truncate text-xs" title={row.akku_ch || ''}>
                        {row.akku_ch || <span className="text-gray-300">-</span>}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-red-600" title={row.error || ''}>
                        {row.error || '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewRow(row)}
                          disabled={row._status !== 'success'}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vorschau-Dialog */}
      <Dialog open={!!previewRow} onOpenChange={() => setPreviewRow(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>HTML-Vorschau</DialogTitle>
            <DialogDescription>{previewRow?.['p_name[de]']}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Original-Produktname (aus CSV):</h4>
              <div className="border rounded-lg p-4 bg-gray-50 font-medium">
                {previewRow?.['p_name[de]'] || '-'}
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Original-Beschreibung (aus CSV):</h4>
              <div 
                className="border rounded-lg p-4 bg-gray-50 prose prose-sm max-w-none max-h-96 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: previewRow?.original_description || '-' }}
              />
            </div>

            <div>
              <h4 className="font-semibold mb-2">Generierte HTML-Beschreibung:</h4>
              <div 
                className="border rounded-lg p-4 bg-white prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: previewRow?.['p_description[de]'] || '' }}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold">HTML-Code zum Kopieren:</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(previewRow?.['p_description[de]'] || '');
                    alert('HTML-Code wurde in die Zwischenablage kopiert!');
                  }}
                  className="text-indigo-600 border-indigo-300 hover:bg-indigo-50"
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Kopieren
                </Button>
              </div>
              <pre className="border rounded-lg p-4 bg-gray-900 text-gray-100 text-xs overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                {previewRow?.['p_description[de]'] || ''}
              </pre>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Marketplace Bullets:</h4>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>{previewRow?.bullet_1 || '-'}</li>
                <li>{previewRow?.bullet_2 || '-'}</li>
                {previewRow?.bullet_3 && <li>{previewRow.bullet_3}</li>}
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Erkannte Kategorie:</h4>
              <Badge variant="outline" className="text-sm bg-indigo-50 text-indigo-700 border-indigo-200">
                {previewRow?._category || 'GENERISCH'}
              </Badge>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog für Original-Beschreibung */}
      <Dialog open={!!originalDescPreview} onOpenChange={() => setOriginalDescPreview(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Original-Beschreibung (aus CSV)</DialogTitle>
            <DialogDescription>{originalDescPreview?.name}</DialogDescription>
          </DialogHeader>
          <div 
            className="border rounded-lg p-4 bg-gray-50 prose prose-sm max-w-none [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_th]:border [&_th]:border-gray-300 [&_th]:p-2 [&_th]:bg-gray-100 [&_.pd-spec-name]:font-semibold [&_.pd-spec-name]:bg-gray-100 [&_.pd-spec-value]:bg-white"
            dangerouslySetInnerHTML={{ __html: originalDescPreview?.desc || '-' }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
