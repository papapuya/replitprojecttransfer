import { useState, useCallback } from "react";
import { Upload, Download, Loader2, CheckCircle2, AlertTriangle, ArrowLeft, Sparkles, Settings2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CSVRow {
  [key: string]: string;
}

interface AttributeConfig {
  key: string;
  label: string;
  enabled: boolean;
  type: 'yesNo' | 'text';
}

export default function AttributeFiller() {
  const [file, setFile] = useState<File | null>(null);
  const [rawData, setRawData] = useState<CSVRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [attributeConfigs, setAttributeConfigs] = useState<AttributeConfig[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const parseCSV = (text: string): { headers: string[]; rows: CSVRow[] } => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    const delimiter = ';';
    const headerLine = lines[0];
    const headers = headerLine.split(delimiter).map(h => h.replace(/^"|"$/g, '').trim());

    const rows: CSVRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (const char of lines[i]) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          values.push(current.replace(/^"|"$/g, '').trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.replace(/^"|"$/g, '').trim());

      if (values.length === headers.length) {
        const row: CSVRow = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });
        rows.push(row);
      }
    }

    return { headers, rows };
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setProcessedCount(0);
    setProgress(0);

    try {
      const text = await selectedFile.text();
      const { headers: parsedHeaders, rows } = parseCSV(text);

      if (rows.length === 0) {
        setError('Die CSV-Datei enthält keine gültigen Daten.');
        return;
      }

      setHeaders(parsedHeaders);
      setRawData(rows);

      // Unterstützt p_attributes UND v_attributes (Brickfox-Format)
      const attributeHeaders = parsedHeaders.filter(h => 
        (h.startsWith('p_attributes[') || h.startsWith('v_attributes[')) && h.includes('][de]')
      );

      // Text-Attribute die aus Beschreibung extrahiert werden können
      const textAttributes = ['akku_produktart', 'allg_farbe_geheause'];
      
      const configs: AttributeConfig[] = attributeHeaders.map(h => {
        // Unterstützt beide Formate: p_attributes[X][de] und v_attributes[X][de]
        const match = h.match(/[pv]_attributes\[([^\]]+)\]\[de\]/);
        const label = match ? match[1] : h;
        const isTextAttr = textAttributes.includes(label);
        return {
          key: h,
          label: label,
          enabled: label.startsWith('WST_') || isTextAttr,
          type: isTextAttr ? 'text' : 'yesNo'
        };
      });

      setAttributeConfigs(configs);

      toast({
        title: "CSV geladen",
        description: `${rows.length} Produkte mit ${attributeHeaders.length} Attribut-Spalten gefunden`,
      });
    } catch (err) {
      setError('Fehler beim Lesen der CSV-Datei');
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const toggleAttribute = (key: string) => {
    setAttributeConfigs(prev =>
      prev.map(a => a.key === key ? { ...a, enabled: !a.enabled } : a)
    );
  };

  const selectAllWST = () => {
    setAttributeConfigs(prev =>
      prev.map(a => ({ ...a, enabled: a.label.startsWith('WST_') }))
    );
  };

  const selectNone = () => {
    setAttributeConfigs(prev =>
      prev.map(a => ({ ...a, enabled: false }))
    );
  };

  const processAttributes = async () => {
    const enabledAttributes = attributeConfigs.filter(a => a.enabled);
    if (enabledAttributes.length === 0) {
      toast({
        title: "Keine Attribute ausgewählt",
        description: "Bitte wähle mindestens ein Attribut aus",
        variant: "destructive",
      });
      return;
    }

    const descriptionKey = headers.find(h => h === 'p_description[de]');
    if (!descriptionKey) {
      toast({
        title: "Keine Beschreibung gefunden",
        description: "Die CSV muss eine 'p_description[de]' Spalte enthalten",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    setProgress(0);
    setProcessedCount(0);

    const updatedData = [...rawData];
    const batchSize = 5;

    for (let i = 0; i < updatedData.length; i += batchSize) {
      const batch = updatedData.slice(i, Math.min(i + batchSize, updatedData.length));

      const promises = batch.map(async (row, batchIdx) => {
        const description = row[descriptionKey];
        if (!description || description.trim().length < 10) {
          return null;
        }

        // Nur Attribute die leer sind befüllen
        const attributesToFill = enabledAttributes.filter(a => {
          const currentValue = row[a.key];
          return !currentValue || currentValue.trim() === '';
        });

        if (attributesToFill.length === 0) {
          return null; // Alle bereits befüllt
        }

        try {
          // Produktname für Farb-Erkennung
          const productName = row['p_name[de]'] || '';
          
          const response = await fetch('/api/analyze-attributes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              description,
              productName,
              attributes: attributesToFill.map(a => ({ label: a.label, type: a.type })),
              productType: row['p_attributes[akku_produktart][de]'] || '',
            }),
          });

          if (!response.ok) throw new Error('API Fehler');

          const result = await response.json();
          return { index: i + batchIdx, attributes: result.attributes, attributesToFill };
        } catch (err) {
          console.error('Fehler bei Attribut-Analyse:', err);
          return null;
        }
      });

      const results = await Promise.all(promises);

      results.forEach(result => {
        if (result) {
          const { index, attributes, attributesToFill } = result;
          console.log(`[Attribut-Befüller] Produkt ${index}: AI-Antwort:`, attributes);
          attributesToFill.forEach((attr: AttributeConfig) => {
            const value = attributes[attr.label];
            console.log(`[Attribut-Befüller] Attribut "${attr.label}" (key: ${attr.key}): Wert=${value}, Typ=${attr.type}`);
            if (value !== undefined && value !== null && value !== '') {
              if (attr.type === 'yesNo') {
                updatedData[index][attr.key] = value ? 'Ja' : 'Nein';
                console.log(`[Attribut-Befüller] -> Gesetzt: ${attr.key} = ${value ? 'Ja' : 'Nein'}`);
              } else {
                // Text-Attribute direkt übernehmen
                updatedData[index][attr.key] = String(value);
                console.log(`[Attribut-Befüller] -> Gesetzt: ${attr.key} = ${value}`);
              }
            }
          });
        }
      });

      const processed = Math.min(i + batchSize, updatedData.length);
      setProcessedCount(processed);
      setProgress((processed / updatedData.length) * 100);
    }

    setRawData(updatedData);
    setProcessing(false);

    toast({
      title: "Analyse abgeschlossen",
      description: `${updatedData.length} Produkte analysiert`,
    });
  };

  const handleDownload = () => {
    if (rawData.length === 0) return;

    // Exakte Spaltenreihenfolge und -namen wie in Original-CSV
    const csvContent = [
      headers.join(';'),  // Header ohne Anführungszeichen (wie Original)
      ...rawData.map(row =>
        headers.map(h => {
          const val = String(row[h] || '').replace(/"/g, '""');
          // Nur Anführungszeichen wenn nötig (Semikolon, Zeilenumbruch oder Anführungszeichen im Wert)
          if (val.includes(';') || val.includes('\n') || val.includes('"')) {
            return `"${val}"`;
          }
          return val;
        }).join(';')
      )
    ].join('\n');

    // UTF-8 ohne BOM für Brickfox-Kompatibilität
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name?.replace('.csv', '') || 'export'}_attributes.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export erfolgreich",
      description: `${rawData.length} Zeilen mit Original-Spaltennamen exportiert`,
    });
  };

  const enabledCount = attributeConfigs.filter(a => a.enabled).length;
  const filledCount = rawData.filter(row => {
    const enabledAttrs = attributeConfigs.filter(a => a.enabled);
    return enabledAttrs.some(attr => row[attr.key] === 'Ja' || row[attr.key] === 'Nein');
  }).length;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card border-b border-card-border shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 py-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Attribut-Befüller
          </h1>
          <p className="text-sm text-muted-foreground">
            Analysiert Produktbeschreibungen • Füllt Attribute automatisch • PIM-kompatibles CSV-Format
          </p>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {error && (
          <Alert className="mb-6 bg-destructive/10 border-destructive text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="ml-2">{error}</AlertDescription>
          </Alert>
        )}

        {rawData.length === 0 ? (
          <Card
            className={`p-8 transition-colors ${isDragging ? 'border-primary bg-accent/50' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="flex flex-col items-center justify-center gap-6 min-h-[300px]">
              <div className="p-6 rounded-full bg-primary/10">
                <Upload className="w-12 h-12 text-primary" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-semibold text-foreground">
                  CSV-Datei hochladen
                </h2>
                <p className="text-muted-foreground max-w-md">
                  Lade eine PIM-Export CSV mit Produktbeschreibungen und Attribut-Spalten hoch
                </p>
              </div>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload">
                <Button asChild size="lg">
                  <span className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    Datei auswählen
                  </span>
                </Button>
              </label>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <CheckCircle2 className="w-8 h-8 text-chart-2" />
                  <div>
                    <h2 className="text-xl font-bold text-foreground">{file?.name}</h2>
                    <p className="text-muted-foreground">
                      {rawData.length} Produkte • {attributeConfigs.length} Attribut-Spalten
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleDownload} disabled={processing}>
                    <Download className="w-4 h-4 mr-2" />
                    CSV Export
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRawData([]);
                      setFile(null);
                      setHeaders([]);
                      setAttributeConfigs([]);
                    }}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Neue Datei
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Settings2 className="w-5 h-5" />
                    Attribute auswählen
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Wähle die Attribute die automatisch befüllt werden sollen ({enabledCount} ausgewählt)
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllWST}>
                    Alle WST_*
                  </Button>
                  <Button variant="outline" size="sm" onClick={selectNone}>
                    Keine
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-64 overflow-y-auto">
                {attributeConfigs.map(attr => (
                  <div key={attr.key} className="flex items-center space-x-2">
                    <Checkbox
                      id={attr.key}
                      checked={attr.enabled}
                      onCheckedChange={() => toggleAttribute(attr.key)}
                    />
                    <Label
                      htmlFor={attr.key}
                      className="text-sm text-muted-foreground cursor-pointer truncate"
                      title={attr.label}
                    >
                      {attr.label}
                    </Label>
                  </div>
                ))}
              </div>
            </Card>

            {processing && (
              <Card className="p-6">
                <div className="flex items-center gap-4">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <div className="flex-1">
                    <div className="flex justify-between text-sm text-muted-foreground mb-2">
                      <span>Analysiere Beschreibungen...</span>
                      <span>{processedCount} / {rawData.length}</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                </div>
              </Card>
            )}

            <div className="flex gap-4">
              <Button
                onClick={processAttributes}
                disabled={processing || enabledCount === 0}
                className="flex-1"
                size="lg"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Analysiere...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 mr-2" />
                    Attribute befüllen ({enabledCount} Attribute)
                  </>
                )}
              </Button>
            </div>

            {filledCount > 0 && (
              <Alert className="bg-chart-2/10 border-chart-2 text-chart-2">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription className="ml-2">
                  {filledCount} Produkte mit Attributen befüllt
                </AlertDescription>
              </Alert>
            )}

            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                Vorschau (erste 20 Zeilen) - {attributeConfigs.filter(a => a.enabled).length} Attribute ausgewählt
              </h3>
              <div className="overflow-x-auto max-h-[500px] border rounded-lg">
                <table className="text-sm min-w-max">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b">
                      <th className="text-left p-2 text-muted-foreground whitespace-nowrap sticky left-0 bg-card z-10">p_id</th>
                      <th className="text-left p-2 text-muted-foreground whitespace-nowrap">Produktart</th>
                      <th className="text-left p-2 text-muted-foreground whitespace-nowrap">Farbe</th>
                      {attributeConfigs.filter(a => a.enabled).map(attr => (
                        <th key={attr.key} className="text-left p-2 text-muted-foreground whitespace-nowrap" title={attr.key}>
                          {attr.label.replace('WST_', '')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawData.slice(0, 20).map((row, idx) => (
                      <tr key={idx} className="border-b hover:bg-accent/50">
                        <td className="p-2 text-foreground whitespace-nowrap sticky left-0 bg-card">{row['p_id']}</td>
                        <td className="p-2 text-foreground whitespace-nowrap">
                          {row['p_attributes[akku_produktart][de]'] || '-'}
                        </td>
                        <td className="p-2 text-foreground whitespace-nowrap">
                          {row['p_attributes[allg_farbe_geheause][de]'] || '-'}
                        </td>
                        {attributeConfigs.filter(a => a.enabled).map(attr => (
                          <td key={attr.key} className="p-2 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              row[attr.key] === 'Ja' ? 'bg-chart-2/20 text-chart-2' :
                              row[attr.key] === 'Nein' ? 'bg-destructive/20 text-destructive' :
                              row[attr.key] && row[attr.key].trim() !== '' ? 'bg-primary/20 text-primary' :
                              'text-muted-foreground'
                            }`}>
                              {row[attr.key] || '-'}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
