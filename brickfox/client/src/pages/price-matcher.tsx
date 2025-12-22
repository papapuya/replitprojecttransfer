import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, FileSpreadsheet, ArrowRight, Check, AlertCircle } from "lucide-react";

interface CSVRow {
  [key: string]: string;
}

interface MatchResult {
  originalRow: CSVRow;
  updatedRow: CSVRow;
  matched: boolean;
  oldEK?: string;
  newEK?: string;
  oldVK?: string;
  newVK?: string;
}

export default function PriceMatcher() {
  const { toast } = useToast();
  
  const [supplierCSV, setSupplierCSV] = useState<CSVRow[]>([]);
  const [supplierHeaders, setSupplierHeaders] = useState<string[]>([]);
  const [pimCSV, setPimCSV] = useState<CSVRow[]>([]);
  const [pimHeaders, setPimHeaders] = useState<string[]>([]);
  
  const [supplierMatchKey, setSupplierMatchKey] = useState<string>("");
  const [pimMatchKey, setPimMatchKey] = useState<string>("");
  const [ekColumn, setEkColumn] = useState<string>("");
  
  const [results, setResults] = useState<MatchResult[]>([]);
  const [unmatchedProducts, setUnmatchedProducts] = useState<CSVRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const parseCSV = (text: string): { headers: string[], rows: CSVRow[] } => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };
    
    const detectDelimiter = (line: string): string => {
      const semicolonCount = (line.match(/;/g) || []).length;
      const commaCount = (line.match(/,/g) || []).length;
      const tabCount = (line.match(/\t/g) || []).length;
      
      if (tabCount > semicolonCount && tabCount > commaCount) return '\t';
      if (semicolonCount > commaCount) return ';';
      return ',';
    };
    
    const delimiter = detectDelimiter(lines[0]);
    
    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };
    
    const headers = parseLine(lines[0]);
    const rows: CSVRow[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      if (values.length === headers.length) {
        const row: CSVRow = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx] || '';
        });
        rows.push(row);
      }
    }
    
    return { headers, rows };
  };

  const handleSupplierUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { headers, rows } = parseCSV(text);
      setSupplierHeaders(headers);
      setSupplierCSV(rows);
      setSupplierMatchKey("");
      setEkColumn("");
      toast({
        title: "Lieferanten-CSV geladen",
        description: `${rows.length} Zeilen, ${headers.length} Spalten erkannt`,
      });
    };
    reader.readAsText(file);
  };

  const handlePimUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { headers, rows } = parseCSV(text);
      setPimHeaders(headers);
      setPimCSV(rows);
      setPimMatchKey("");
      toast({
        title: "PIM-CSV geladen",
        description: `${rows.length} Zeilen, ${headers.length} Spalten erkannt`,
      });
    };
    reader.readAsText(file);
  };

  const convertToPimFormat = (euroValue: number): string => {
    return Math.round(euroValue * 100 * 1000000).toString();
  };

  const convertFromPimFormat = (pimValue: string): number => {
    const num = parseFloat(pimValue) || 0;
    return num / 100 / 1000000;
  };

  const parseEuroValue = (value: string): number => {
    let cleaned = value.replace(/[€\s]/g, '').trim();
    if (cleaned.includes(',') && cleaned.includes('.')) {
      if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if (cleaned.includes(',')) {
      cleaned = cleaned.replace(',', '.');
    }
    return parseFloat(cleaned) || 0;
  };

  const formatEuro = (value: number): string => {
    return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  };

  const processMatching = () => {
    if (!supplierMatchKey || !pimMatchKey || !ekColumn) {
      toast({
        title: "Fehlende Auswahl",
        description: "Bitte wählen Sie alle erforderlichen Spalten aus.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    
    const supplierMap = new Map<string, CSVRow>();
    supplierCSV.forEach(row => {
      const key = row[supplierMatchKey]?.trim().toLowerCase();
      if (key) {
        supplierMap.set(key, row);
      }
    });

    const matchResults: MatchResult[] = [];
    const unmatched: CSVRow[] = [];

    pimCSV.forEach(pimRow => {
      const pimKey = pimRow[pimMatchKey]?.trim().toLowerCase();
      const supplierRow = pimKey ? supplierMap.get(pimKey) : undefined;

      if (supplierRow) {
        const ekEuro = parseEuroValue(supplierRow[ekColumn]);
        const vkEuro = ekEuro * 2 * 1.19;
        
        const ekPim = convertToPimFormat(ekEuro);
        const vkPim = convertToPimFormat(vkEuro);
        
        const updatedRow = { ...pimRow };
        const oldEK = pimRow['v_purchase_price'] || '';
        const oldVK = pimRow['v_price[eur]'] || '';
        
        updatedRow['v_purchase_price'] = ekPim;
        updatedRow['v_price[eur]'] = vkPim;

        matchResults.push({
          originalRow: pimRow,
          updatedRow,
          matched: true,
          oldEK,
          newEK: ekPim,
          oldVK,
          newVK: vkPim,
        });
      } else {
        matchResults.push({
          originalRow: pimRow,
          updatedRow: pimRow,
          matched: false,
        });
        unmatched.push(pimRow);
      }
    });

    setResults(matchResults);
    setUnmatchedProducts(unmatched);
    setIsProcessing(false);

    const matchedCount = matchResults.filter(r => r.matched).length;
    toast({
      title: "Abgleich abgeschlossen",
      description: `${matchedCount} von ${pimCSV.length} Produkten aktualisiert. ${unmatched.length} ohne Match.`,
    });
  };

  const downloadResultCSV = () => {
    if (results.length === 0) return;

    const headers = pimHeaders;
    const csvContent = [
      headers.join(';'),
      ...results.map(r => 
        headers.map(h => {
          const value = r.updatedRow[h] || '';
          if (value.includes(';') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(';')
      )
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pim_updated_prices_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Download gestartet",
      description: "Die aktualisierte PIM-CSV wurde heruntergeladen.",
    });
  };

  const downloadUnmatchedCSV = () => {
    if (unmatchedProducts.length === 0) return;

    const headers = pimHeaders;
    const csvContent = [
      headers.join(';'),
      ...unmatchedProducts.map(row => 
        headers.map(h => {
          const value = row[h] || '';
          if (value.includes(';') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(';')
      )
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `unmatched_products_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Download gestartet",
      description: `${unmatchedProducts.length} Produkte ohne Match exportiert.`,
    });
  };

  const matchedCount = results.filter(r => r.matched).length;
  const canProcess = supplierCSV.length > 0 && pimCSV.length > 0 && supplierMatchKey && pimMatchKey && ekColumn;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Preisabgleich</h1>
          <p className="text-muted-foreground mt-1">
            Lieferantenpreise mit PIM-Daten abgleichen und aktualisieren
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Lieferanten-Preisliste
            </CardTitle>
            <CardDescription>
              CSV mit Einkaufspreisen hochladen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="supplier-upload">CSV-Datei</Label>
              <Input
                id="supplier-upload"
                type="file"
                accept=".csv,.txt"
                onChange={handleSupplierUpload}
                className="mt-1"
              />
            </div>
            
            {supplierHeaders.length > 0 && (
              <>
                <div>
                  <Label>Matching-Key (Lieferant)</Label>
                  <Select value={supplierMatchKey} onValueChange={setSupplierMatchKey}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Spalte wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {supplierHeaders.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>EK-Spalte (Euro netto)</Label>
                  <Select value={ekColumn} onValueChange={setEkColumn}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Spalte wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {supplierHeaders.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="text-sm text-muted-foreground">
                  {supplierCSV.length} Zeilen geladen
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              PIM-Export (Pixi)
            </CardTitle>
            <CardDescription>
              CSV aus der PIM hochladen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="pim-upload">CSV-Datei</Label>
              <Input
                id="pim-upload"
                type="file"
                accept=".csv,.txt"
                onChange={handlePimUpload}
                className="mt-1"
              />
            </div>
            
            {pimHeaders.length > 0 && (
              <>
                <div>
                  <Label>Matching-Key (PIM)</Label>
                  <Select value={pimMatchKey} onValueChange={setPimMatchKey}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Spalte wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {pimHeaders.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="text-sm text-muted-foreground">
                  {pimCSV.length} Zeilen geladen
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center">
        <Button 
          size="lg" 
          onClick={processMatching}
          disabled={!canProcess || isProcessing}
          className="gap-2"
        >
          <ArrowRight className="h-5 w-5" />
          {isProcessing ? "Verarbeite..." : "Preise abgleichen"}
        </Button>
      </div>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Ergebnis</CardTitle>
                <CardDescription className="mt-1">
                  <Badge variant="default" className="mr-2">
                    <Check className="h-3 w-3 mr-1" />
                    {matchedCount} aktualisiert
                  </Badge>
                  <Badge variant="secondary">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {unmatchedProducts.length} ohne Match
                  </Badge>
                </CardDescription>
              </div>
              <Button onClick={downloadResultCSV} className="gap-2">
                <Download className="h-4 w-4" />
                CSV herunterladen
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="preview">
              <TabsList>
                <TabsTrigger value="preview">Vorschau Änderungen</TabsTrigger>
                <TabsTrigger value="unmatched">Ohne Match ({unmatchedProducts.length})</TabsTrigger>
                <TabsTrigger value="supplier">Lieferanten-CSV</TabsTrigger>
                <TabsTrigger value="pim">Original PIM-CSV</TabsTrigger>
              </TabsList>

              <TabsContent value="preview" className="mt-4">
                <div className="border rounded-lg overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>{pimMatchKey}</TableHead>
                        <TableHead>Alter EK</TableHead>
                        <TableHead>Neuer EK</TableHead>
                        <TableHead>Alter VK</TableHead>
                        <TableHead>Neuer VK</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.filter(r => r.matched).slice(0, 100).map((result, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Badge variant="default">
                              <Check className="h-3 w-3" />
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {result.originalRow[pimMatchKey]}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {result.oldEK ? formatEuro(convertFromPimFormat(result.oldEK)) : '-'}
                          </TableCell>
                          <TableCell className="font-semibold text-green-600">
                            {result.newEK ? formatEuro(convertFromPimFormat(result.newEK)) : '-'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {result.oldVK ? formatEuro(convertFromPimFormat(result.oldVK)) : '-'}
                          </TableCell>
                          <TableCell className="font-semibold text-green-600">
                            {result.newVK ? formatEuro(convertFromPimFormat(result.newVK)) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {results.filter(r => r.matched).length > 100 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Zeige 100 von {results.filter(r => r.matched).length} aktualisierten Produkten
                  </p>
                )}
              </TabsContent>

              <TabsContent value="unmatched" className="mt-4">
                <div className="flex justify-end mb-2">
                  <Button variant="outline" size="sm" onClick={downloadUnmatchedCSV} className="gap-2">
                    <Download className="h-4 w-4" />
                    Ungematchte exportieren
                  </Button>
                </div>
                <div className="border rounded-lg overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background z-10">Status</TableHead>
                        <TableHead className="sticky left-12 bg-background z-10">{pimMatchKey}</TableHead>
                        {pimHeaders.filter(h => h !== pimMatchKey).map(h => (
                          <TableHead key={h}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unmatchedProducts.slice(0, 100).map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="sticky left-0 bg-background">
                            <Badge variant="secondary">
                              <AlertCircle className="h-3 w-3" />
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm sticky left-12 bg-background">
                            {row[pimMatchKey]}
                          </TableCell>
                          {pimHeaders.filter(h => h !== pimMatchKey).map(h => (
                            <TableCell key={h} className="max-w-[200px] truncate">
                              {row[h]}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {unmatchedProducts.length > 100 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Zeige 100 von {unmatchedProducts.length} ungematchten Produkten
                  </p>
                )}
              </TabsContent>

              <TabsContent value="supplier" className="mt-4">
                <div className="border rounded-lg overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {supplierHeaders.map(h => (
                          <TableHead key={h} className={h === supplierMatchKey || h === ekColumn ? 'bg-blue-50 dark:bg-blue-900/30' : ''}>
                            {h}
                            {h === supplierMatchKey && <Badge variant="outline" className="ml-1">Key</Badge>}
                            {h === ekColumn && <Badge variant="outline" className="ml-1">EK</Badge>}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {supplierCSV.slice(0, 100).map((row, idx) => (
                        <TableRow key={idx}>
                          {supplierHeaders.map(h => (
                            <TableCell key={h} className={`max-w-[200px] truncate ${h === supplierMatchKey || h === ekColumn ? 'bg-blue-50 dark:bg-blue-900/30 font-medium' : ''}`}>
                              {row[h]}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {supplierCSV.length > 100 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Zeige 100 von {supplierCSV.length} Zeilen
                  </p>
                )}
              </TabsContent>

              <TabsContent value="pim" className="mt-4">
                <div className="border rounded-lg overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {pimHeaders.map(h => (
                          <TableHead key={h} className={h === pimMatchKey || h === 'v_purchase_price' || h === 'v_price[eur]' ? 'bg-blue-50 dark:bg-blue-900/30' : ''}>
                            {h}
                            {h === pimMatchKey && <Badge variant="outline" className="ml-1">Key</Badge>}
                            {h === 'v_purchase_price' && <Badge variant="outline" className="ml-1">EK</Badge>}
                            {h === 'v_price[eur]' && <Badge variant="outline" className="ml-1">VK</Badge>}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pimCSV.slice(0, 100).map((row, idx) => (
                        <TableRow key={idx}>
                          {pimHeaders.map(h => (
                            <TableCell key={h} className={`max-w-[200px] truncate ${h === pimMatchKey || h === 'v_purchase_price' || h === 'v_price[eur]' ? 'bg-blue-50 dark:bg-blue-900/30 font-medium' : ''}`}>
                              {row[h]}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {pimCSV.length > 100 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Zeige 100 von {pimCSV.length} Zeilen
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
