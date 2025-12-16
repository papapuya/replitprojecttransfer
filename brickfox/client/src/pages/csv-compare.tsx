import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Search } from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

interface CSVData {
  headers: string[];
  rows: Record<string, string>[];
  sheetNames?: string[];
}

interface CompareResult {
  inPIM: string[];
  missing: string[];
  matched: { pim: string; supplier: string }[];
}

export default function CSVCompare() {
  const [pimCSV, setPimCSV] = useState<CSVData | null>(null);
  const [supplierCSV, setSupplierCSV] = useState<CSVData | null>(null);
  const [pimColumn, setPimColumn] = useState<string>("");
  const [supplierColumn, setSupplierColumn] = useState<string>("");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [supplierWorkbook, setSupplierWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [supplierSheets, setSupplierSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  
  const pimInputRef = useRef<HTMLInputElement>(null);
  const supplierInputRef = useRef<HTMLInputElement>(null);

  const parseFile = (file: File, callback: (data: CSVData) => void) => {
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    
    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Erst als Array parsen um Header-Zeile zu finden
        const rawData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '' });
        
        // Finde erste Zeile mit echten Daten (nicht leer)
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(rawData.length, 10); i++) {
          const row = rawData[i];
          const nonEmptyCount = row.filter(cell => cell && String(cell).trim() !== '').length;
          if (nonEmptyCount >= 3) {
            headerRowIndex = i;
            break;
          }
        }
        
        // Parse mit korrektem Header
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet, { 
          defval: '',
          range: headerRowIndex 
        });
        
        if (jsonData.length > 0) {
          // Filtere leere Spalten raus
          const allHeaders = Object.keys(jsonData[0]);
          const validHeaders = allHeaders.filter(h => 
            !h.startsWith('__EMPTY') && 
            h.trim() !== '' &&
            jsonData.some(row => row[h] && String(row[h]).trim() !== '')
          );
          
          callback({ headers: validHeaders.length > 0 ? validHeaders : allHeaders, rows: jsonData });
        } else {
          callback({ headers: [], rows: [] });
        }
      };
      reader.readAsBinaryString(file);
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        encoding: "UTF-8",
        complete: (results) => {
          const headers = results.meta.fields || [];
          const rows = results.data as Record<string, string>[];
          callback({ headers, rows });
        },
      });
    }
  };

  const handlePimUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseFile(file, (data) => {
        setPimCSV(data);
        const pNameCol = data.headers.find(h => h.toLowerCase().includes('p_name'));
        if (pNameCol) setPimColumn(pNameCol);
      });
    }
  };

  const handleSupplierUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      
      if (isExcel) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const data = ev.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          setSupplierWorkbook(workbook);
          setSupplierSheets(workbook.SheetNames);
          setSelectedSheet(workbook.SheetNames[0]);
          parseExcelSheet(workbook, workbook.SheetNames[0]);
        };
        reader.readAsBinaryString(file);
      } else {
        parseFile(file, (data) => {
          setSupplierCSV(data);
          const typCol = data.headers.find(h => h.toLowerCase() === 'typ');
          if (typCol) setSupplierColumn(typCol);
        });
      }
    }
  };
  
  const parseExcelSheet = (workbook: XLSX.WorkBook, sheetName: string) => {
    const worksheet = workbook.Sheets[sheetName];
    
    const rawData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '' });
    
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(rawData.length, 30); i++) {
      const row = rawData[i];
      if (row.some(cell => String(cell).toLowerCase() === 'typ')) {
        headerRowIndex = i;
        break;
      }
      const nonEmptyCount = row.filter(cell => cell && String(cell).trim() !== '').length;
      if (nonEmptyCount >= 3) {
        headerRowIndex = i;
      }
    }
    
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
      
      setSupplierCSV({ headers: validHeaders.length > 0 ? validHeaders : allHeaders, rows: jsonData });
      const typCol = validHeaders.find(h => h.toLowerCase() === 'typ');
      if (typCol) setSupplierColumn(typCol);
    }
  };
  
  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (supplierWorkbook) {
      parseExcelSheet(supplierWorkbook, sheetName);
    }
  };

  const normalizeText = (text: string | number | undefined | null): string => {
    if (text === null || text === undefined) return '';
    return String(text)
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const runComparison = () => {
    if (!pimCSV || !supplierCSV || !pimColumn || !supplierColumn) return;

    const pimValues = pimCSV.rows.map(row => row[pimColumn] || '').filter(Boolean);
    const supplierValues = supplierCSV.rows.map(row => row[supplierColumn] || '').filter(Boolean);

    const normalizedPIM = pimValues.map(v => ({ original: v, normalized: normalizeText(v) }));
    const normalizedSupplier = supplierValues.map(v => ({ original: v, normalized: normalizeText(v) }));

    const matched: { pim: string; supplier: string }[] = [];
    const missing: string[] = [];

    for (const supplier of normalizedSupplier) {
      const match = normalizedPIM.find(pim => 
        pim.normalized.includes(supplier.normalized) || 
        supplier.normalized.includes(pim.normalized)
      );
      
      if (match) {
        matched.push({ pim: match.original, supplier: supplier.original });
      } else {
        missing.push(supplier.original);
      }
    }

    const matchedPIMValues = matched.map(m => m.pim);
    const inPIM = pimValues.filter(v => !matchedPIMValues.includes(v));

    setResult({ inPIM, missing, matched });
  };

  const filteredMissing = result?.missing.filter(item => 
    item.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredMatched = result?.matched.filter(item => 
    item.pim.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.supplier.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">CSV Vergleich</h1>
        <p className="text-muted-foreground">
          Vergleiche PIM-Daten mit Lieferanten-Daten um fehlende Produkte zu finden
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              PIM CSV
            </CardTitle>
            <CardDescription>CSV-Export aus dem PIM/Shop</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              ref={pimInputRef}
              onChange={handlePimUpload}
              className="hidden"
            />
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => pimInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              {pimCSV ? `${pimCSV.rows.length} Zeilen geladen` : "PIM CSV hochladen"}
            </Button>
            
            {pimCSV && (
              <div className="space-y-2">
                <Label>Vergleichsspalte (p_name[de])</Label>
                <Select value={pimColumn} onValueChange={setPimColumn}>
                  <SelectTrigger>
                    <SelectValue placeholder="Spalte auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {pimCSV.headers.map(header => (
                      <SelectItem key={header} value={header}>{header}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Lieferanten CSV
            </CardTitle>
            <CardDescription>CSV/Excel vom Lieferanten</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              ref={supplierInputRef}
              onChange={handleSupplierUpload}
              className="hidden"
            />
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => supplierInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              {supplierCSV ? `${supplierCSV.rows.length} Zeilen geladen` : "Lieferanten CSV hochladen"}
            </Button>
            
            {supplierSheets.length > 1 && (
              <div className="space-y-2">
                <Label>Excel-Blatt auswählen</Label>
                <Select value={selectedSheet} onValueChange={handleSheetChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Blatt auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {supplierSheets.map(sheet => (
                      <SelectItem key={sheet} value={sheet}>{sheet}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {supplierCSV && (
              <div className="space-y-2">
                <Label>Vergleichsspalte (Typ)</Label>
                <Select value={supplierColumn} onValueChange={setSupplierColumn}>
                  <SelectTrigger>
                    <SelectValue placeholder="Spalte auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {supplierCSV.headers.map(header => (
                      <SelectItem key={header} value={header}>{header}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center">
        <Button 
          size="lg"
          disabled={!pimCSV || !supplierCSV || !pimColumn || !supplierColumn}
          onClick={runComparison}
        >
          Vergleich starten
        </Button>
      </div>

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Gefunden im Shop</p>
                    <p className="text-2xl font-bold text-green-600">{result.matched.length}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Fehlt im Shop</p>
                    <p className="text-2xl font-bold text-red-600">{result.missing.length}</p>
                  </div>
                  <XCircle className="h-8 w-8 text-red-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Nur im Shop</p>
                    <p className="text-2xl font-bold text-blue-600">{result.inPIM.length}</p>
                  </div>
                  <FileSpreadsheet className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ergebnisse durchsuchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <XCircle className="h-5 w-5" />
                  Fehlt im Shop ({filteredMissing.length})
                </CardTitle>
                <CardDescription>Diese Produkte vom Lieferanten fehlen noch im Shop</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto space-y-1">
                  {filteredMissing.map((item, i) => (
                    <div key={i} className="p-2 bg-red-50 rounded text-sm">
                      {item}
                    </div>
                  ))}
                  {filteredMissing.length === 0 && (
                    <p className="text-muted-foreground text-sm">Keine fehlenden Produkte</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  Gefunden ({filteredMatched.length})
                </CardTitle>
                <CardDescription>Diese Produkte sind bereits im Shop</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto space-y-1">
                  {filteredMatched.map((item, i) => (
                    <div key={i} className="p-2 bg-green-50 rounded text-sm">
                      <div className="font-medium">{item.supplier}</div>
                      <div className="text-xs text-muted-foreground">→ {item.pim}</div>
                    </div>
                  ))}
                  {filteredMatched.length === 0 && (
                    <p className="text-muted-foreground text-sm">Keine Treffer</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
