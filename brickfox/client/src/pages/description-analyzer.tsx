import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, Download, Search, AlertTriangle, CheckCircle, XCircle, FileText } from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

interface AnalyzedProduct {
  rowIndex: number;
  p_item_number: string;
  p_name: string;
  p_description: string;
  status: 'complete' | 'technical_only' | 'compatibility_only' | 'empty' | 'minimal' | 'needs_improvement';
  issues: string[];
  wordCount: number;
  hasHtml: boolean;
}

interface AnalysisResult {
  total: number;
  complete: AnalyzedProduct[];
  incomplete: AnalyzedProduct[];
}

export default function DescriptionAnalyzer() {
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const technicalPatterns = [
    /\d+\s*(v|volt|mah|wh|ah|mm|cm|kg|g)\b/i,
    /spannung|kapazit[äa]t|leistung|abmessung|gewicht|technische\s*daten/i,
    /li-ion|nimh|nicd|lifepo|lipo|blei|agm|gel/i,
    /zellen?typ|bauform|anschl[üu]ss/i,
  ];

  const compatibilityPatterns = [
    /passend\s*(f[üu]r|fÃ¼r)/i,
    /kompatib(el|ilit[äa]t)/i,
    /ersetzt|alternative\s*(f[üu]r|zu)/i,
    /geeignet\s*f[üu]r/i,
    /f[üu]r\s+folgende\s*(ger[äa]te|modelle)/i,
  ];

  const qualityIndicators = [
    /vorteile|benefits|highlights/i,
    /lieferumfang|im\s*lieferumfang/i,
    /<h[1-6]|<p>|<ul>|<li>/i,
    /hochwertig|qualit[äa]t|zuverl[äa]ssig|langlebig/i,
    /einfache\s*(installation|montage|handhabung)/i,
  ];

  const headerKeywords = ['barcode', 'ean', 'artikelnummer', 'artikel', 'sku', 'produktname', 
    'name', 'beschreibung', 'preis', 'p_id', 'p_name', 'p_description'];

  const findHeaderRow = (rawData: string[][]): number => {
    for (let i = 0; i < Math.min(rawData.length, 50); i++) {
      const row = rawData[i];
      if (!row) continue;
      const nonEmptyCount = row.filter(cell => cell && String(cell).trim() !== '').length;
      if (nonEmptyCount >= 3) {
        const rowText = row.map(c => String(c || '').toLowerCase()).join(' ');
        const hasHeaderKeyword = headerKeywords.some(kw => rowText.includes(kw));
        if (hasHeaderKeyword) return i;
      }
    }
    for (let i = 0; i < Math.min(rawData.length, 50); i++) {
      const row = rawData[i];
      if (!row) continue;
      const nonEmptyCount = row.filter(cell => cell && String(cell).trim() !== '').length;
      if (nonEmptyCount >= 3) return i;
    }
    return 0;
  };

  const parseFile = (file: File) => {
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    
    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const rawData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '' });
        const headerRowIndex = findHeaderRow(rawData);
        
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet, { 
          defval: '',
          range: headerRowIndex 
        });
        
        if (jsonData.length > 0) {
          const allHeaders = Object.keys(jsonData[0]);
          const validHeaders = allHeaders.filter(h => 
            !h.startsWith('__EMPTY') && 
            h.trim() !== '' &&
            jsonData.some(row => row[h] && String(row[h]).trim() !== '')
          );
          setHeaders(validHeaders.length > 0 ? validHeaders : allHeaders);
          setCsvData(jsonData);
        }
      };
      reader.readAsBinaryString(file);
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        encoding: "UTF-8",
        complete: (results) => {
          const parsedHeaders = results.meta.fields || [];
          const rows = results.data as Record<string, string>[];
          setHeaders(parsedHeaders);
          setCsvData(rows);
        },
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseFile(file);
      setResult(null);
    }
  };

  const findDescriptionColumn = (): string | null => {
    const candidates = ['p_description[de]', 'p_description', 'description', 'Beschreibung', 'beschreibung'];
    for (const c of candidates) {
      if (headers.includes(c)) return c;
    }
    return headers.find(h => h.toLowerCase().includes('description') || h.toLowerCase().includes('beschreibung')) || null;
  };

  const findNameColumn = (): string | null => {
    const candidates = ['p_name[de]', 'p_name', 'name', 'Name', 'Produktname'];
    for (const c of candidates) {
      if (headers.includes(c)) return c;
    }
    return headers.find(h => h.toLowerCase().includes('name')) || null;
  };

  const findItemNumberColumn = (): string | null => {
    const candidates = ['p_item_number', 'p_id', 'artikelnummer', 'sku', 'id'];
    for (const c of candidates) {
      if (headers.includes(c)) return c;
    }
    return headers.find(h => h.toLowerCase().includes('item') || h.toLowerCase().includes('artikel')) || null;
  };

  const analyzeDescription = (description: string): { status: AnalyzedProduct['status']; issues: string[] } => {
    const issues: string[] = [];
    const text = description || '';
    
    const strippedText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = strippedText.split(/\s+/).filter(w => w.length > 0).length;
    
    if (!text || text.trim().length < 10) {
      return { status: 'empty', issues: ['Keine oder sehr kurze Beschreibung'] };
    }
    
    if (wordCount < 20) {
      issues.push(`Nur ${wordCount} Wörter (minimal)`);
      return { status: 'minimal', issues };
    }

    const hasTechnical = technicalPatterns.some(p => p.test(text));
    const hasCompatibility = compatibilityPatterns.some(p => p.test(text));
    const hasQuality = qualityIndicators.some(p => p.test(text));
    const hasHtml = /<[a-z][\s\S]*>/i.test(text);
    
    if (!hasQuality && hasTechnical && !hasCompatibility) {
      issues.push('Nur technische Daten');
      return { status: 'technical_only', issues };
    }
    
    if (!hasQuality && hasCompatibility && !hasTechnical) {
      issues.push('Nur Kompatibilität');
      return { status: 'compatibility_only', issues };
    }
    
    if (!hasQuality && hasTechnical && hasCompatibility && wordCount < 50) {
      issues.push('Nur Technik + Kompatibilität, keine Verkaufsargumente');
      return { status: 'minimal', issues };
    }
    
    if (!hasHtml && wordCount < 80) {
      issues.push('Kein HTML-Format, kurzer Text');
    }
    
    if (issues.length === 0) {
      return { status: 'complete', issues: [] };
    }
    
    return { status: 'needs_improvement', issues };
  };

  const runAnalysis = () => {
    setIsAnalyzing(true);
    
    const descCol = findDescriptionColumn();
    const nameCol = findNameColumn();
    const itemCol = findItemNumberColumn();
    
    if (!descCol) {
      alert('Keine Beschreibungsspalte gefunden (p_description[de], description, etc.)');
      setIsAnalyzing(false);
      return;
    }

    const analyzed: AnalyzedProduct[] = csvData.map((row, index) => {
      const description = String(row[descCol] || '');
      const strippedText = description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const { status, issues } = analyzeDescription(description);
      
      return {
        rowIndex: index,
        p_item_number: String(row[itemCol || ''] || ''),
        p_name: String(row[nameCol || ''] || ''),
        p_description: description,
        status,
        issues,
        wordCount: strippedText.split(/\s+/).filter(w => w.length > 0).length,
        hasHtml: /<[a-z][\s\S]*>/i.test(description),
      };
    });

    const complete = analyzed.filter(p => p.status === 'complete');
    const incomplete = analyzed.filter(p => p.status !== 'complete');

    setResult({
      total: analyzed.length,
      complete,
      incomplete,
    });
    
    setIsAnalyzing(false);
  };

  const filteredIncomplete = result?.incomplete.filter(item =>
    item.p_item_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.p_name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getStatusBadge = (status: AnalyzedProduct['status']) => {
    switch (status) {
      case 'complete':
        return <Badge className="bg-green-100 text-green-800">Vollständig</Badge>;
      case 'technical_only':
        return <Badge className="bg-yellow-100 text-yellow-800">Nur Technik</Badge>;
      case 'compatibility_only':
        return <Badge className="bg-orange-100 text-orange-800">Nur Kompatibilität</Badge>;
      case 'empty':
        return <Badge className="bg-red-100 text-red-800">Leer</Badge>;
      case 'minimal':
        return <Badge className="bg-amber-100 text-amber-800">Minimal</Badge>;
      case 'needs_improvement':
        return <Badge className="bg-blue-100 text-blue-800">Verbesserbar</Badge>;
    }
  };

  const exportIncompleteToCSV = () => {
    if (!result?.incomplete.length) return;
    
    const incompleteRowIndices = new Set(result.incomplete.map(p => p.rowIndex));
    const incompleteRows = csvData.filter((_, index) => incompleteRowIndices.has(index));
    
    const csvContent = Papa.unparse(incompleteRows, { delimiter: ';' });
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'unvollstaendige_beschreibungen.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSummaryToCSV = () => {
    if (!result?.incomplete.length) return;
    
    const rows = result.incomplete.map(p => ({
      p_item_number: p.p_item_number,
      'p_name[de]': p.p_name,
      status: p.status,
      issues: p.issues.join(', '),
      wordCount: p.wordCount,
      hasHtml: p.hasHtml ? 'Ja' : 'Nein',
    }));
    
    const csvContent = Papa.unparse(rows, { delimiter: ';' });
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'beschreibungs_analyse.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Beschreibungs-Qualitätsanalyse</h1>
        <p className="text-muted-foreground">
          Finde Artikel mit unvollständigen Produktbeschreibungen (nur technische Daten, nur Kompatibilität, etc.)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            CSV hochladen
          </CardTitle>
          <CardDescription>Laden Sie eine CSV mit Produktbeschreibungen hoch</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <div className="flex gap-4">
            <Button 
              variant="outline" 
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              {csvData.length > 0 ? `${csvData.length} Produkte geladen` : "CSV/Excel hochladen"}
            </Button>
            {csvData.length > 0 && (
              <Button 
                onClick={runAnalysis}
                disabled={isAnalyzing}
                className="bg-violet-600 hover:bg-violet-700"
              >
                <Search className="h-4 w-4 mr-2" />
                {isAnalyzing ? 'Analysiere...' : 'Analyse starten'}
              </Button>
            )}
          </div>
          
          {headers.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Gefundene Spalten: {headers.slice(0, 5).join(', ')}{headers.length > 5 ? ` ... (+${headers.length - 5})` : ''}
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Gesamt</p>
                    <p className="text-2xl font-bold">{result.total}</p>
                  </div>
                  <FileText className="h-8 w-8 text-gray-400" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Vollständig</p>
                    <p className="text-2xl font-bold text-green-600">{result.complete.length}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Unvollständig</p>
                    <p className="text-2xl font-bold text-amber-600">{result.incomplete.length}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-amber-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Quote</p>
                    <p className="text-2xl font-bold text-indigo-600">
                      {Math.round((result.complete.length / result.total) * 100)}%
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground">vollständig</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="h-5 w-5" />
                    Unvollständige Beschreibungen ({filteredIncomplete.length})
                  </CardTitle>
                  <CardDescription>Diese Artikel benötigen bessere Produktbeschreibungen</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={exportSummaryToCSV}>
                    <Download className="h-4 w-4 mr-2" />
                    Analyse-Report
                  </Button>
                  <Button variant="default" size="sm" onClick={exportIncompleteToCSV} className="bg-violet-600 hover:bg-violet-700">
                    <Download className="h-4 w-4 mr-2" />
                    Unvollständige CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Suchen nach Artikelnummer oder Name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <div className="overflow-auto max-h-[500px] border rounded-lg">
                <Table>
                  <TableHeader className="sticky top-0 bg-white">
                    <TableRow>
                      <TableHead>Artikelnr.</TableHead>
                      <TableHead>Produktname</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Problem</TableHead>
                      <TableHead>Wörter</TableHead>
                      <TableHead>HTML</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIncomplete.slice(0, 200).map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-sm">{item.p_item_number}</TableCell>
                        <TableCell className="max-w-xs truncate" title={item.p_name}>{item.p_name}</TableCell>
                        <TableCell>{getStatusBadge(item.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.issues.join(', ')}</TableCell>
                        <TableCell className="text-center">{item.wordCount}</TableCell>
                        <TableCell className="text-center">
                          {item.hasHtml ? (
                            <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-gray-300 mx-auto" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredIncomplete.length > 200 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Zeige 200 von {filteredIncomplete.length} Einträgen
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
