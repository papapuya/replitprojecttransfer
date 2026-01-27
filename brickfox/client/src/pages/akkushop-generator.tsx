import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Upload, Download, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, Eye, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface GeneratedRow {
  p_item_number?: string;
  'p_name[de]': string;
  'p_description[de]': string;
  original_description?: string;
  bullet_1?: string;
  bullet_2?: string;
  bullet_3?: string;
  error?: string;
  _status: 'success' | 'error' | 'skipped';
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

export default function AkkushopGenerator() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [previewRow, setPreviewRow] = useState<GeneratedRow | null>(null);
  const [downloadFilename, setDownloadFilename] = useState('akkushop_generated');
  const { toast } = useToast();

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
      setResult(null);
    }
  };

  const handleGenerate = async () => {
    if (!file) {
      toast({ title: 'Keine Datei', description: 'Bitte wählen Sie eine Datei aus.', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/akkushop-generator/generate', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Generierung fehlgeschlagen');
      }

      setResult(data);
      toast({
        title: 'Generierung abgeschlossen',
        description: `${data.summary.success} von ${data.summary.total} Produkten erfolgreich generiert.`,
      });
    } catch (error: any) {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async (format: 'xlsx' | 'csv', errorsOnly: boolean = false, withBom: boolean = false) => {
    if (!result?.rows) return;

    const rowsToDownload = errorsOnly 
      ? result.rows.filter(r => r._status === 'error' || r._status === 'skipped')
      : result.rows.filter(r => r._status === 'success');

    if (rowsToDownload.length === 0) {
      toast({ title: 'Keine Daten', description: 'Keine passenden Produkte zum Download.', variant: 'destructive' });
      return;
    }

    try {
      const response = await fetch('/api/akkushop-generator/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rowsToDownload, format, errorsOnly, withBom }),
      });

      if (!response.ok) {
        throw new Error('Download fehlgeschlagen');
      }

      const blob = await response.blob();
      const suffix = withBom ? '_excel' : '';
      const baseName = errorsOnly ? 'akkushop_fehler' : (downloadFilename || 'akkushop_generated');
      const filename = `${baseName}${suffix}.${format}`;
      
      // Neues Fenster mit Download öffnen
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      
      // Cleanup nach kurzer Verzögerung
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);

      toast({ title: 'Download gestartet', description: `Datei "${filename}" öffnet sich in neuem Tab. Bitte speichern mit Strg+S.` });
    } catch (error: any) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'skipped':
        return <AlertTriangle className="w-4 h-4 text-amber-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Erfolg</Badge>;
      case 'error':
        return <Badge className="bg-red-100 text-red-800 border-red-200">Fehler</Badge>;
      case 'skipped':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Übersprungen</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-indigo-600 mb-2">Akkushop Description Generator</h1>
        <p className="text-gray-600">
          Generiert automatisch HTML-Produktbeschreibungen aus Excel/CSV-Dateien nach strengem Regelwerk.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
              Datei hochladen
            </CardTitle>
            <CardDescription>
              Laden Sie eine Excel (.xlsx) oder CSV-Datei mit den Spalten p_name[de] und p_description[de] hoch.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="flex-1"
              />
              <Button
                onClick={handleGenerate}
                disabled={!file || isProcessing}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generiere...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Generieren
                  </>
                )}
              </Button>
            </div>

            {file && (
              <p className="text-sm text-gray-600">
                Ausgewählte Datei: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle>Zusammenfassung</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Gesamt:</span>
                <span className="font-semibold">{result.summary.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-600">Erfolg:</span>
                <span className="font-semibold text-green-600">{result.summary.success}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-600">Fehler:</span>
                <span className="font-semibold text-red-600">{result.summary.errors}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-600">Übersprungen:</span>
                <span className="font-semibold text-amber-600">{result.summary.skipped}</span>
              </div>

              <div className="pt-4 space-y-2">
                <div className="pb-2">
                  <label className="text-sm text-gray-600 block mb-1">Dateiname</label>
                  <input
                    type="text"
                    value={downloadFilename}
                    onChange={(e) => setDownloadFilename(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="akkushop_generated"
                  />
                </div>
                <Button
                  onClick={() => handleDownload('xlsx', false)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                  disabled={result.summary.success === 0}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Erfolge als Excel (.xlsx)
                </Button>
                <Button
                  onClick={() => handleDownload('csv', false, false)}
                  variant="outline"
                  className="w-full"
                  disabled={result.summary.success === 0}
                >
                  <Download className="w-4 h-4 mr-2" />
                  CSV für Brickfox
                </Button>
                {(result.summary.errors > 0 || result.summary.skipped > 0) && (
                  <Button
                    onClick={() => handleDownload('xlsx', true)}
                    variant="outline"
                    className="w-full border-red-300 text-red-600 hover:bg-red-50"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Fehler als Excel (.xlsx)
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {result && result.rows.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Ergebnisse ({result.rows.length} Produkte)</CardTitle>
            <CardDescription>Klicken Sie auf "Vorschau" um die generierte HTML-Beschreibung anzuzeigen.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Artikelnummer</TableHead>
                    <TableHead>Produktname</TableHead>
                    <TableHead>Fehler</TableHead>
                    <TableHead className="w-24">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.slice(0, 100).map((row, index) => (
                    <TableRow key={index} className={row._status === 'error' ? 'bg-red-50' : row._status === 'skipped' ? 'bg-amber-50' : ''}>
                      <TableCell className="font-mono text-sm">{index + 1}</TableCell>
                      <TableCell>{getStatusBadge(row._status)}</TableCell>
                      <TableCell className="font-mono text-sm">{row.p_item_number || '-'}</TableCell>
                      <TableCell className="max-w-xs truncate" title={row['p_name[de]']}>
                        {row['p_name[de]']}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-red-600" title={row.error || ''}>
                        {row.error || '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewRow(row)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {result.rows.length > 100 && (
                <p className="text-sm text-gray-500 mt-4 text-center">
                  Zeigt die ersten 100 von {result.rows.length} Ergebnissen.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!previewRow} onOpenChange={() => setPreviewRow(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>HTML-Vorschau</DialogTitle>
            <DialogDescription>{previewRow?.['p_name[de]']}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Original-Beschreibung (aus CSV):</h4>
              <div 
                className="border rounded-lg p-4 bg-gray-50 prose prose-sm max-w-none max-h-48 overflow-y-auto"
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
              <h4 className="font-semibold mb-2">Marketplace Bullets:</h4>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>{previewRow?.bullet_1 || '-'}</li>
                <li>{previewRow?.bullet_2 || '-'}</li>
                {previewRow?.bullet_3 && <li>{previewRow.bullet_3}</li>}
              </ul>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold">Raw HTML-Code:</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(previewRow?.['p_description[de]'] || '');
                    toast({ title: 'Kopiert!', description: 'HTML-Code in Zwischenablage kopiert.' });
                  }}
                >
                  Kopieren
                </Button>
              </div>
              <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto max-h-64 whitespace-pre-wrap">
                {previewRow?.['p_description[de]']}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
