import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Search, Download, AlertTriangle, Settings2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
  noManufacturerNumber: { p_item_number: string; p_name: string }[];
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
  const [selectedExportColumns, setSelectedExportColumns] = useState<string[]>(['p_item_number', 'p_name[de]', 'v_manufacturers_item_number']);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  
  const pimInputRef = useRef<HTMLInputElement>(null);
  const supplierInputRef = useRef<HTMLInputElement>(null);

  const headerKeywords = ['barcode', 'ean', 'produktcode', 'artikelnummer', 'artikel', 'sku', 'produktname', 
    'name', 'bezeichnung', 'beschreibung', 'preis', 'ek', 'vk', 'uvp', 'price', 'menge', 'bestand',
    'hersteller', 'marke', 'brand', 'lieferant', 'supplier', 'kategorie', 'gewicht', 'verpackung',
    'typ', 'type', 'model', 'modell', 'serie', 'p_id', 'p_name'];

  const findHeaderRow = (rawData: string[][]): number => {
    // Erst nach Keyword-Match suchen
    for (let i = 0; i < Math.min(rawData.length, 50); i++) {
      const row = rawData[i];
      if (!row) continue;
      const nonEmptyCount = row.filter(cell => cell && String(cell).trim() !== '').length;
      if (nonEmptyCount >= 3) {
        const rowText = row.map(c => String(c || '').toLowerCase()).join(' ');
        const hasHeaderKeyword = headerKeywords.some(kw => rowText.includes(kw));
        if (hasHeaderKeyword) {
          console.log(`Header in Zeile ${i + 1} gefunden (Keyword-Match)`);
          return i;
        }
      }
    }
    // Fallback: Erste Zeile mit 3+ nicht-leeren Zellen
    for (let i = 0; i < Math.min(rawData.length, 50); i++) {
      const row = rawData[i];
      if (!row) continue;
      const nonEmptyCount = row.filter(cell => cell && String(cell).trim() !== '').length;
      if (nonEmptyCount >= 3) {
        console.log(`Header in Zeile ${i + 1} gefunden (Fallback)`);
        return i;
      }
    }
    return 0;
  };

  const parseFile = (file: File, callback: (data: CSVData) => void) => {
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
      
      setSupplierCSV({ headers: validHeaders.length > 0 ? validHeaders : allHeaders, rows: jsonData });
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
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '') // Diakritische Zeichen entfernen
      .replace(/[^a-z0-9]/g, ''); // Nur Buchstaben und Zahlen behalten
  };

  const runComparison = () => {
    if (!pimCSV || !supplierCSV || !pimColumn || !supplierColumn) return;

    // Header-Namen ausschließen
    const isHeader = (val: string) => {
      const lower = val.toLowerCase().trim();
      return headerKeywords.some(kw => lower === kw) || 
             lower === pimColumn.toLowerCase() || 
             lower === supplierColumn.toLowerCase();
    };

    const pimValues = pimCSV.rows
      .map(row => String(row[pimColumn] || ''))
      .filter(v => v && !isHeader(v));
    const supplierValues = supplierCSV.rows
      .map(row => String(row[supplierColumn] || ''))
      .filter(v => v && !isHeader(v));

    // Normalisierte PIM-Werte in Set für schnellen Lookup (ausgewählte Spalte)
    const pimSet = new Set(pimValues.map(v => normalizeText(v)));
    const pimMap = new Map(pimValues.map(v => [normalizeText(v), v]));
    
    // Zusätzlich p_item_number als Fallback-Vergleich
    const pimItemNumberSet = new Set(
      pimCSV.rows
        .map(row => normalizeText(String(row['p_item_number'] || '')))
        .filter(v => v)
    );

    // PIM-Produkte ohne Hersteller-Artikelnummer ermitteln
    const hasManufacturerColumn = pimCSV.headers.includes('v_manufacturers_item_number');
    const noManufacturerNumber: { p_item_number: string; p_name: string }[] = [];
    
    if (hasManufacturerColumn) {
      for (const row of pimCSV.rows) {
        const manufacturerNum = String(row['v_manufacturers_item_number'] || '').trim();
        if (!manufacturerNum) {
          noManufacturerNumber.push({
            p_item_number: String(row['p_item_number'] || row['p_id'] || ''),
            p_name: String(row['p_name[de]'] || row['p_name'] || '')
          });
        }
      }
    }

    const matched: { pim: string; supplier: string }[] = [];
    const missing: string[] = [];
    const matchedPimNormalized = new Set<string>();

    for (const supplierVal of supplierValues) {
      const normalized = normalizeText(supplierVal);
      
      if (pimSet.has(normalized)) {
        // Gefunden in ausgewählter Spalte
        const pimOriginal = pimMap.get(normalized) || normalized;
        matched.push({ pim: pimOriginal, supplier: supplierVal });
        matchedPimNormalized.add(normalized);
      } else if (pimItemNumberSet.has(normalized)) {
        // Gefunden in p_item_number (Fallback)
        matched.push({ pim: supplierVal, supplier: supplierVal });
      } else {
        missing.push(supplierVal);
      }
    }

    // PIM-Produkte die nicht beim Lieferanten sind
    const inPIM = pimValues.filter(v => !matchedPimNormalized.has(normalizeText(v)));

    setResult({ inPIM, missing, matched, noManufacturerNumber });
  };

  const filteredMissing = result?.missing.filter(item => 
    String(item || '').toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredNoManufacturer = result?.noManufacturerNumber.filter(item => 
    String(item.p_item_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(item.p_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredMatched = result?.matched.filter(item => 
    String(item.pim || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(item.supplier || '').toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const exportMissingToCSV = () => {
    if (!result?.missing.length) return;
    
    // Header-Zeile
    const headers = ['v_manufacturers_item_number', 'v_price[Eur]', 'v_purchase_price'];
    
    // Daten-Zeilen - Preise bleiben leer da Produkte nicht in PIM
    const rows = result.missing.map(item => {
      return `"${item}";"";""`;
    });
    
    const csvContent = headers.join(';') + '\n' + rows.join('\n');
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'fehlende_produkte.csv';
    link.click();
  };

  const exportNoManufacturerToCSV = () => {
    if (!result?.noManufacturerNumber.length || !pimCSV) return;
    
    // Finde die PIM-Zeilen für Produkte ohne Hersteller-Nr
    const noManufacturerRows = pimCSV.rows.filter(row => {
      const manufacturerNum = String(row['v_manufacturers_item_number'] || '').trim();
      return !manufacturerNum;
    });
    
    // Header-Zeile aus ausgewählten Spalten
    const headers = selectedExportColumns;
    
    // Daten-Zeilen mit allen ausgewählten Spalten
    const rows = noManufacturerRows.map(row => {
      return headers.map(col => {
        const value = String(row[col] || '').replace(/"/g, '""');
        return `"${value}"`;
      }).join(';');
    });
    
    const csvContent = headers.join(';') + '\n' + rows.join('\n');
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ohne_hersteller_artikelnummer.csv';
    link.click();
  };

  const exportMatchedToCSV = () => {
    if (!result?.matched.length || !pimCSV) return;
    
    // Finde die PIM-Zeilen für gefundene Produkte
    const matchedNormalized = new Set(result.matched.map(m => normalizeText(m.pim)));
    const matchedRows = pimCSV.rows.filter(row => {
      const colValue = normalizeText(String(row[pimColumn] || ''));
      const itemNumber = normalizeText(String(row['p_item_number'] || ''));
      return matchedNormalized.has(colValue) || matchedNormalized.has(itemNumber);
    });
    
    // Header-Zeile aus ausgewählten Spalten
    const headers = selectedExportColumns;
    
    // Daten-Zeilen mit allen ausgewählten Spalten
    const rows = matchedRows.map(row => {
      return headers.map(col => {
        const value = String(row[col] || '').replace(/"/g, '""');
        return `"${value}"`;
      }).join(';');
    });
    
    const csvContent = headers.join(';') + '\n' + rows.join('\n');
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'gefundene_produkte.csv';
    link.click();
  };

  const toggleExportColumn = (column: string) => {
    setSelectedExportColumns(prev => 
      prev.includes(column) 
        ? prev.filter(c => c !== column)
        : [...prev, column]
    );
  };

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
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Vergleichsspalte 1 (Primär)</Label>
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
                <div className="p-2 bg-blue-50 rounded text-xs text-blue-700">
                  <strong>+ Fallback:</strong> p_item_number wird automatisch als 2. Vergleichsspalte geprüft
                </div>
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
                    <p className="text-sm text-muted-foreground">Ohne Hersteller-Nr.</p>
                    <p className="text-2xl font-bold text-orange-600">{result.noManufacturerNumber.length}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-orange-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
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
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowColumnSelector(!showColumnSelector)}
              >
                <Settings2 className="h-4 w-4 mr-2" />
                Spalten für Export
              </Button>
            </div>
            
            {showColumnSelector && pimCSV && pimCSV.headers.length > 0 && (
              <div className="p-4 bg-muted/30 rounded-lg border">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold">Spalten für Export auswählen</h4>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedExportColumns([...pimCSV.headers])}
                    >
                      Alle auswählen
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedExportColumns([])}
                    >
                      Alle abwählen
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                  {pimCSV.headers.map(col => (
                    <div key={col} className="flex items-center space-x-2">
                      <Checkbox
                        id={`col-main-${col}`}
                        checked={selectedExportColumns.includes(col)}
                        onCheckedChange={() => toggleExportColumn(col)}
                      />
                      <Label
                        htmlFor={`col-main-${col}`}
                        className="text-xs font-medium cursor-pointer truncate"
                        title={col}
                      >
                        {col}
                      </Label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {selectedExportColumns.length} Spalten ausgewählt
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-red-600">
                    <XCircle className="h-5 w-5" />
                    Fehlt im Shop ({filteredMissing.length})
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={exportMissingToCSV}>
                    <Download className="h-4 w-4 mr-2" />
                    CSV Export
                  </Button>
                </div>
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
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    Gefunden ({filteredMatched.length})
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={exportMatchedToCSV}>
                    <Download className="h-4 w-4 mr-2" />
                    CSV Export
                  </Button>
                </div>
                <CardDescription>Diese Produkte sind bereits im Shop</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto space-y-1">
                  {filteredMatched.map((item, i) => (
                    <div key={i} className="p-2 bg-green-50 rounded text-sm">
                      <div className="font-medium">{item.supplier}</div>
                    </div>
                  ))}
                  {filteredMatched.length === 0 && (
                    <p className="text-muted-foreground text-sm">Keine Treffer</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-orange-600">
                    <AlertTriangle className="h-5 w-5" />
                    Ohne Hersteller-Nr. ({filteredNoManufacturer.length})
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={exportNoManufacturerToCSV}>
                    <Download className="h-4 w-4 mr-2" />
                    CSV Export
                  </Button>
                </div>
                <CardDescription>PIM-Produkte ohne v_manufacturers_item_number</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto space-y-1">
                  {filteredNoManufacturer.map((item, i) => (
                    <div key={i} className="p-2 bg-orange-50 rounded text-sm">
                      <div className="font-medium">{item.p_item_number}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.p_name}</div>
                    </div>
                  ))}
                  {filteredNoManufacturer.length === 0 && (
                    <p className="text-muted-foreground text-sm">Alle Produkte haben Hersteller-Nr.</p>
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
