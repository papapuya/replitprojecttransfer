import { useState, useRef } from "react";
import { parseBatteryCSV, generateHTML, BatteryData } from "@/lib/battery-parser";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Copy, FileJson, FileCode, Eye, Battery, Upload, Download, FileSpreadsheet, RefreshCw, Trash2, Smartphone, Monitor } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import Papa from "papaparse";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
export default function CSVParser() {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [csvInput, setCsvInput] = useState("");
  const [bulkData, setBulkData] = useState<{ parsed: BatteryData; html: string }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewItem, setPreviewItem] = useState<{ parsed: BatteryData; html: string } | null>(null);
  const [isMobilePreview, setIsMobilePreview] = useState(false);
  
  const [singleData, setSingleData] = useState<BatteryData | null>(null);
  const [singleHtml, setSingleHtml] = useState("");
  
  const { toast } = useToast();

  const handleSingleInputChange = (value: string) => {
    setCsvInput(value);
    if (value.trim()) {
      // Parse as CSV with header to get structured object like batch mode
      const lines = value.trim().split('\n');
      if (lines.length >= 2) {
        // Has header + data row - parse as structured CSV
        const delimiter = value.includes(";") ? ";" : ",";
        const parseResult = Papa.parse(value, { header: true, delimiter, skipEmptyLines: true });
        if (parseResult.data && parseResult.data.length > 0) {
          const row = parseResult.data[0] as Record<string, string>;
          const parsed = parseBatteryCSV(row);
          setSingleData(parsed);
          setSingleHtml(generateHTML(parsed));
          return;
        }
      }
      // Fallback: single line without header
      const parsed = parseBatteryCSV(value);
      setSingleData(parsed);
      setSingleHtml(generateHTML(parsed));
    } else {
      setSingleData(null);
      setSingleHtml("");
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setProgress(0);
    setBulkData([]);

    Papa.parse(file, {
      worker: true,
      header: true,
      skipEmptyLines: true,
      delimiter: ";",
      encoding: "Windows-1252",
      complete: (results) => {
        if (results && results.data) {
          processBulkResults(results.data as any[]);
        } else {
          setIsProcessing(false);
          toast({
            variant: "destructive",
            title: "Fehler beim Einlesen",
            description: "Die Datei konnte nicht korrekt gelesen werden."
          });
        }
      },
      error: (error) => {
        setIsProcessing(false);
        toast({
          variant: "destructive",
          title: "Fehler beim Parsen",
          description: error.message
        });
      }
    });
  };

  const processBulkResults = async (rows: any[]) => {
    const total = rows.length;
    const chunkSize = 1000;
    const processedResults: { parsed: BatteryData; html: string }[] = [];

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      
      chunk.forEach(row => {
        const parsed = parseBatteryCSV(row);
        processedResults.push({
          parsed: parsed,
          html: generateHTML(parsed)
        });
      });

      const processedCount = Math.min(i + chunkSize, total);
      setProgress(Math.round((processedCount / total) * 100));
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    setBulkData(processedResults);
    setIsProcessing(false);
    setProgress(100);
    
    toast({
      title: "Verarbeitung abgeschlossen",
      description: `${total} Datensatze wurden erfolgreich verarbeitet.`,
    });
  };

  const downloadBulkExport = (format: 'csv' | 'json') => {
    if (bulkData.length === 0) return;

    let content = "";
    let mimeType = "";
    let extension = "";

    if (format === 'json') {
      content = JSON.stringify(bulkData.map(d => ({ ...d.parsed, html_output: d.html })), null, 2);
      mimeType = "application/json";
      extension = "json";
    } else {
      const headers = [
        "Produktname", "Spannung", "Kapazitat", "Chemie", "Zellentyp", 
        "Masse", "Gewicht", "Kabellange", "Kompatibilitat", 
        "Einsatzzweck", "Besonderheiten", "Lieferumfang", "HTML_Beschreibung"
      ];
      
      const csvRows = bulkData.map(d => [
        d.parsed.produktname,
        d.parsed.spannung,
        d.parsed.kapazitaet,
        d.parsed.chemie,
        d.parsed.zellentyp,
        d.parsed.masse,
        d.parsed.gewicht,
        d.parsed.kabellaenge,
        d.parsed.kompatibilitaet_kurz,
        d.parsed.einsatzzweck,
        d.parsed.besonderheiten,
        d.parsed.lieferumfang,
        d.html
      ]);

      content = "\uFEFF" + Papa.unparse([headers, ...csvRows], { quotes: true, delimiter: ";" });
      mimeType = "text/csv;charset=utf-8;";
      extension = "csv";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `akkushop_parser_export_${new Date().toISOString().slice(0,10)}.${extension}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Kopiert!",
      description: `${type} wurde in die Zwischenablage kopiert.`,
    });
  };

  return (
    <div className="p-6 bg-background overflow-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-primary/10 p-2 rounded-lg">
          <Battery className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">CSV Parser</h1>
          <p className="text-sm text-muted-foreground">Batterie-CSV zu HTML Konverter</p>
        </div>
      </div>

          <div className="flex justify-end mb-6">
            <div className="flex bg-muted p-1 rounded-lg">
              <Button 
                variant={mode === "single" ? "default" : "ghost"} 
                size="sm"
                onClick={() => setMode("single")}
                className="w-32"
              >
                Einzel-Modus
              </Button>
              <Button 
                variant={mode === "bulk" ? "default" : "ghost"} 
                size="sm"
                onClick={() => setMode("bulk")}
                className="w-32"
              >
                Batch-Modus
              </Button>
            </div>
          </div>

          {mode === "single" ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Eingabedaten</CardTitle>
                    <CardDescription>Fugen Sie hier eine einzelne CSV-Zeile ein.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      placeholder="CSV-Daten hier einfugen..."
                      className="min-h-[280px] font-mono text-sm resize-none"
                      value={csvInput}
                      onChange={(e) => handleSingleInputChange(e.target.value)}
                    />
                  </CardContent>
                </Card>
                
                <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg text-sm">
                  <p className="flex items-center gap-2 font-medium mb-1 text-blue-600 dark:text-blue-400">
                    <RefreshCw className="w-4 h-4" /> Echtzeit-Vorschau
                  </p>
                  <span className="text-muted-foreground">Die Vorschau aktualisiert sich automatisch.</span>
                </div>
              </div>

              <div className="lg:col-span-8">
                <AnimatePresence mode="wait">
                  {singleData ? (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Tabs defaultValue="preview" className="w-full">
                        <div className="flex justify-between items-center mb-4">
                          <TabsList>
                            <TabsTrigger value="preview">
                              <Eye className="w-4 h-4 mr-2" /> Vorschau
                            </TabsTrigger>
                            <TabsTrigger value="html">
                              <FileCode className="w-4 h-4 mr-2" /> HTML
                            </TabsTrigger>
                            <TabsTrigger value="json">
                              <FileJson className="w-4 h-4 mr-2" /> JSON
                            </TabsTrigger>
                          </TabsList>
                          
                          <div className="flex items-center gap-2">
                            <div className="flex bg-muted p-1 rounded-md">
                              <Button
                                variant={!isMobilePreview ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => setIsMobilePreview(false)}
                                className="h-7 px-2"
                              >
                                <Monitor className="h-4 w-4" />
                              </Button>
                              <Button
                                variant={isMobilePreview ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => setIsMobilePreview(true)}
                                className="h-7 px-2"
                              >
                                <Smartphone className="h-4 w-4" />
                              </Button>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => copyToClipboard(singleHtml, "HTML")}
                            >
                              <Copy className="w-4 h-4 mr-2" /> Kopieren
                            </Button>
                          </div>
                        </div>

                        <TabsContent value="preview" className="mt-0">
                          <Card className="overflow-hidden">
                            <CardContent className={`p-6 bg-white text-black prose max-w-none ${isMobilePreview ? 'max-w-[375px] mx-auto' : ''}`}>
                              <div dangerouslySetInnerHTML={{ __html: singleHtml }} />
                            </CardContent>
                          </Card>
                        </TabsContent>

                        <TabsContent value="html" className="mt-0">
                          <Card>
                            <CardContent className="p-0 relative group">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => copyToClipboard(singleHtml, "HTML")}
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                              <pre className="p-4 overflow-auto max-h-[500px] text-xs font-mono bg-muted rounded-lg">
                                {singleHtml}
                              </pre>
                            </CardContent>
                          </Card>
                        </TabsContent>

                        <TabsContent value="json" className="mt-0">
                          <Card>
                            <CardContent className="p-0 relative group">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => copyToClipboard(JSON.stringify(singleData, null, 2), "JSON")}
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                              <pre className="p-4 overflow-auto max-h-[500px] text-xs font-mono bg-muted rounded-lg text-green-600 dark:text-green-400">
                                {JSON.stringify(singleData, null, 2)}
                              </pre>
                            </CardContent>
                          </Card>
                        </TabsContent>
                      </Tabs>
                    </motion.div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground min-h-[400px] border-2 border-dashed rounded-xl">
                      <FileCode className="w-16 h-16 mb-4 opacity-20" />
                      <p>Warte auf Eingabe...</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Massenverarbeitung (Batch Upload)</CardTitle>
                  <CardDescription>Laden Sie eine CSV-Datei hoch. Optimiert auch fur grosse Datensatze (70.000+ Zeilen).</CardDescription>
                </CardHeader>
                <CardContent>
                  <div 
                    className={`
                      border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center transition-all
                      ${isProcessing ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 cursor-pointer'}
                    `}
                    onClick={() => !isProcessing && fileInputRef.current?.click()}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      className="hidden" 
                      accept=".csv,.txt"
                      onChange={handleFileUpload}
                      disabled={isProcessing}
                    />
                    
                    {isProcessing ? (
                      <div className="w-full max-w-md space-y-4">
                        <div className="flex items-center justify-center mb-4">
                          <RefreshCw className="w-10 h-10 text-primary animate-spin" />
                        </div>
                        <h3 className="text-xl font-semibold">Verarbeite Daten...</h3>
                        <Progress value={progress} className="h-2" />
                        <p className="text-sm text-muted-foreground">{progress}% abgeschlossen</p>
                      </div>
                    ) : (
                      <>
                        <div className="bg-muted p-4 rounded-full mb-4">
                          <Upload className="w-8 h-8 text-primary" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">CSV Datei hier ablegen</h3>
                        <p className="text-muted-foreground mb-6">oder klicken zum Auswahlen</p>
                        <Button>Datei auswahlen</Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {bulkData.length > 0 && !isProcessing && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5 text-green-500" />
                      Ergebnisse 
                      <Badge variant="secondary" className="ml-2">{bulkData.length} Eintrage</Badge>
                    </h2>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setBulkData([])} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4 mr-2" /> Reset
                      </Button>
                      <Button variant="secondary" onClick={() => downloadBulkExport('json')}>
                        <FileJson className="w-4 h-4 mr-2" /> JSON Export
                      </Button>
                      <Button onClick={() => downloadBulkExport('csv')}>
                        <Download className="w-4 h-4 mr-2" /> CSV Export
                      </Button>
                    </div>
                  </div>

                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-auto max-h-[600px]">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-muted sticky top-0 z-10">
                            <tr>
                              <th className="p-4 font-medium text-muted-foreground">#</th>
                              <th className="p-4 font-medium text-muted-foreground">Produktname</th>
                              <th className="p-4 font-medium text-muted-foreground">Spannung</th>
                              <th className="p-4 font-medium text-muted-foreground">Kapazitat</th>
                              <th className="p-4 font-medium text-muted-foreground">Kompatibilitat</th>
                              <th className="p-4 font-medium text-muted-foreground">Status</th>
                              <th className="p-4 font-medium text-muted-foreground text-right">Aktionen</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {bulkData.slice(0, 100).map((item, i) => (
                              <tr key={i} className="hover:bg-muted/50 transition-colors">
                                <td className="p-4 text-muted-foreground font-mono">{i + 1}</td>
                                <td className="p-4 font-medium">{item.parsed.produktname}</td>
                                <td className="p-4">{item.parsed.spannung}</td>
                                <td className="p-4">{item.parsed.kapazitaet}</td>
                                <td className="p-4 truncate max-w-[300px]" title={item.parsed.kompatibilitaet_kurz}>
                                  {item.parsed.kompatibilitaet_kurz}
                                </td>
                                <td className="p-4">
                                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">OK</Badge>
                                </td>
                                <td className="p-4 text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="icon" onClick={() => setPreviewItem(item)}>
                                      <Eye className="w-4 h-4 text-primary" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => copyToClipboard(item.html, "HTML")}>
                                      <Copy className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {bulkData.length > 100 && (
                          <div className="p-4 text-center text-muted-foreground border-t">
                            ... und {bulkData.length - 100} weitere Eintrage (Exportieren um alle zu sehen)
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}

      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Produktvorschau</DialogTitle>
            <DialogDescription>
              Vorschau der generierten HTML-Beschreibung.
            </DialogDescription>
          </DialogHeader>
          {previewItem && (
            <div className="space-y-4">
              <Card className="overflow-hidden">
                <CardContent className="p-6 bg-white text-black prose max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: previewItem.html }} />
                </CardContent>
              </Card>
              <div className="flex justify-end">
                <Button onClick={() => copyToClipboard(previewItem.html, "HTML")}>
                  <Copy className="w-4 h-4 mr-2" /> HTML kopieren
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
