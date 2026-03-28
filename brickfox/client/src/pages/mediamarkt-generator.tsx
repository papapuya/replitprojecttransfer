import { useState, useRef } from 'react';
import { makeCsvBlob } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, Sparkles, FileText, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import Papa from 'papaparse';

interface ProductData {
  [key: string]: string | undefined;
}

export default function MediaMarktGeneratorPage() {
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
        setError('Bitte wählen Sie eine CSV-Datei aus');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setCsvData([]);
      setGenerated(false);
      
      // Parse CSV
      Papa.parse(selectedFile, {
        header: true,
        complete: (results) => {
          setCsvData(results.data as ProductData[]);
        },
        error: (err) => {
          setError(`CSV-Parsing-Fehler: ${err.message}`);
        }
      });
    }
  };

  const extractProductTypeFromName = (productName: string): string => {
    const typeMappings: { [key: string]: string } = {
      'Akku': 'Akku',
      'Batterie': 'Batterie',
      'Ladegerät': 'Ladegerät',
      'Taschenlampe': 'Taschenlampe',
      'Powerbank': 'Powerbank',
      'Kopflampe': 'Kopflampe',
      'Zubehör': 'Zubehör'
    };

    for (const [keyword, type] of Object.entries(typeMappings)) {
      if (productName.includes(keyword)) {
        return type;
      }
    }
    return 'Produkt';
  };

  const generateMediaMarktDescriptions = async () => {
    if (csvData.length === 0) return;

    setLoading(true);
    setError(null);
    setProgress(0);

    try {
      const updatedData = csvData.map((row, index) => {
        // MediaMarkt V1: Produkttyp + Modellcode (OHNE Marke!)
        const productName = row.Produktname || row.productName || row['p_name[de]'] || '';
        const articleNumber = row.Artikelnummer || row.articleNumber || row.p_item_number || '';
        
        const productType = extractProductTypeFromName(productName);
        const modelCode = articleNumber.replace(/^[A-Z]+-/, '').trim();
        const mediamarktV1 = modelCode ? `${productType} ${modelCode}` : productType;
        
        // MediaMarkt V2: Nur Modellcode (ohne ANS- Präfix)
        const mediamarktV2 = modelCode;

        setProgress(((index + 1) / csvData.length) * 100);

        return {
          ...row,
          'MediaMarkt V1': mediamarktV1,
          '🤖 MediaMarkt V2': mediamarktV2
        };
      });

      setCsvData(updatedData);
      setGenerated(true);
    } catch (err: any) {
      setError(err.message || 'Generierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (csvData.length === 0) return;

    const csv = Papa.unparse(csvData);
    const blob = makeCsvBlob(csv);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `mediamarkt-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">MediaMarkt Beschreibungs-Generator</h1>
        <p className="text-muted-foreground">
          Laden Sie eine CSV-Datei hoch und generieren Sie automatisch MediaMarkt V1 und V2 Beschreibungen
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>1. CSV-Datei hochladen</CardTitle>
            <CardDescription>
              Die CSV sollte Spalten wie "Produktname" und "Artikelnummer" enthalten
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csvFile">CSV-Datei</Label>
              <div className="flex gap-2">
                <Input
                  ref={fileInputRef}
                  id="csvFile"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  disabled={loading}
                  className="flex-1"
                />
                {file && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setFile(null);
                      setCsvData([]);
                      setGenerated(false);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    disabled={loading}
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {file && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  {file.name} ({(file.size / 1024).toFixed(1)} KB) - {csvData.length} Zeilen
                </p>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {csvData.length > 0 && !generated && (
              <Button
                onClick={generateMediaMarktDescriptions}
                disabled={loading}
                className="w-full"
                size="lg"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {loading ? 'Generiere Beschreibungen...' : 'MediaMarkt-Beschreibungen generieren'}
              </Button>
            )}

            {loading && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-muted-foreground text-center">
                  Fortschritt: {Math.round(progress)}%
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {generated && csvData.length > 0 && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>2. Generierte Beschreibungen</CardTitle>
                <CardDescription>
                  {csvData.length} Produkte mit MediaMarkt V1 und V2 Beschreibungen
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button onClick={downloadCSV} variant="default" className="flex-1">
                    <Download className="mr-2 h-4 w-4" />
                    CSV herunterladen
                  </Button>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <div className="max-h-96 overflow-y-auto overflow-x-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-muted z-10">
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead className="min-w-[200px]">Produktname</TableHead>
                          <TableHead className="min-w-[150px]">Artikelnummer</TableHead>
                          <TableHead className="min-w-[200px] bg-primary/10 text-primary font-semibold">
                            🤖 MediaMarkt V1
                          </TableHead>
                          <TableHead className="min-w-[150px] bg-primary/10 text-primary font-semibold">
                            🤖 MediaMarkt V2
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {csvData.slice(0, 100).map((row, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-mono text-sm">{index + 1}</TableCell>
                            <TableCell className="font-medium">
                              {row.Produktname || row.productName || row['p_name[de]'] || '-'}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {row.Artikelnummer || row.articleNumber || row.p_item_number || '-'}
                            </TableCell>
                            <TableCell className="bg-primary/5 font-medium">
                              {row['MediaMarkt V1'] || '-'}
                            </TableCell>
                            <TableCell className="bg-primary/5">
                              {row['🤖 MediaMarkt V2'] || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {csvData.length > 100 && (
                    <div className="p-3 bg-muted/50 text-sm text-muted-foreground text-center">
                      Zeige erste 100 von {csvData.length} Produkten (alle Daten im Download enthalten)
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
