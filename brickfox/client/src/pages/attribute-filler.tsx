import { useState, useCallback } from "react";
import { Upload, Download, Loader2, CheckCircle2, AlertTriangle, ArrowLeft, Sparkles, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";

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

      const attributeHeaders = parsedHeaders.filter(h => 
        h.startsWith('p_attributes[') && h.includes('][de]')
      );

      // Text-Attribute die aus Beschreibung extrahiert werden können
      const textAttributes = ['akku_produktart', 'allg_farbe_geheause'];
      
      const configs: AttributeConfig[] = attributeHeaders.map(h => {
        const match = h.match(/p_attributes\[([^\]]+)\]\[de\]/);
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
          attributesToFill.forEach((attr: AttributeConfig) => {
            const value = attributes[attr.label];
            if (value !== undefined && value !== null && value !== '') {
              if (attr.type === 'yesNo') {
                updatedData[index][attr.key] = value ? 'Ja' : 'Nein';
              } else {
                // Text-Attribute direkt übernehmen
                updatedData[index][attr.key] = String(value);
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

    const csvContent = [
      headers.map(h => `"${h}"`).join(';'),
      ...rawData.map(row =>
        headers.map(h => {
          const val = String(row[h] || '').replace(/"/g, '""');
          return `"${val}"`;
        }).join(';')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name?.replace('.csv', '') || 'export'}_attributes.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export erfolgreich",
      description: `${rawData.length} Zeilen exportiert`,
    });
  };

  const enabledCount = attributeConfigs.filter(a => a.enabled).length;
  const filledCount = rawData.filter(row => {
    const enabledAttrs = attributeConfigs.filter(a => a.enabled);
    return enabledAttrs.some(attr => row[attr.key] === 'Ja' || row[attr.key] === 'Nein');
  }).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" className="text-slate-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Zurück
            </Button>
          </Link>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Attribut-Befüller</h1>
          <p className="text-slate-400">
            Analysiert Produktbeschreibungen und füllt Attribute automatisch mit Ja/Nein
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">{error}</span>
          </div>
        )}

        {rawData.length === 0 ? (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Upload className="w-5 h-5" />
                CSV hochladen
              </CardTitle>
              <CardDescription>
                Lade eine PIM-Export CSV mit Produktbeschreibungen und Attribut-Spalten hoch
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer
                  ${isDragging ? 'border-primary bg-primary/10' : 'border-slate-600 hover:border-slate-500'}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => document.getElementById('csv-upload')?.click()}
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                <p className="text-slate-300 mb-2">CSV-Datei hier ablegen oder klicken</p>
                <p className="text-slate-500 text-sm">Unterstützt: .csv mit p_description[de] und p_attributes[...][de]</p>
                <input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                />
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                      {file?.name}
                    </CardTitle>
                    <CardDescription>
                      {rawData.length} Produkte • {attributeConfigs.length} Attribut-Spalten
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRawData([]);
                      setFile(null);
                      setHeaders([]);
                      setAttributeConfigs([]);
                    }}
                  >
                    Neue Datei
                  </Button>
                </div>
              </CardHeader>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Settings2 className="w-5 h-5" />
                      Attribute auswählen
                    </CardTitle>
                    <CardDescription>
                      Wähle die Attribute die automatisch befüllt werden sollen ({enabledCount} ausgewählt)
                    </CardDescription>
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
              </CardHeader>
              <CardContent>
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
                        className="text-sm text-slate-300 cursor-pointer truncate"
                        title={attr.label}
                      >
                        {attr.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {processing && (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4 mb-4">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <div className="flex-1">
                      <div className="flex justify-between text-sm text-slate-400 mb-2">
                        <span>Analysiere Beschreibungen...</span>
                        <span>{processedCount} / {rawData.length}</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  </div>
                </CardContent>
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

              <Button
                onClick={handleDownload}
                disabled={processing}
                variant="outline"
                size="lg"
              >
                <Download className="w-5 h-5 mr-2" />
                CSV Export
              </Button>
            </div>

            {filledCount > 0 && (
              <div className="text-center text-slate-400">
                <CheckCircle2 className="w-5 h-5 inline mr-2 text-green-400" />
                {filledCount} Produkte mit Attributen befüllt
              </div>
            )}

            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-lg">Vorschau (erste 10 Zeilen)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left p-2 text-slate-400">p_id</th>
                        <th className="text-left p-2 text-slate-400">Produktart</th>
                        {attributeConfigs.filter(a => a.enabled).slice(0, 5).map(attr => (
                          <th key={attr.key} className="text-left p-2 text-slate-400 truncate max-w-32" title={attr.label}>
                            {attr.label.replace('WST_', '')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rawData.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className="border-b border-slate-800">
                          <td className="p-2 text-slate-300">{row['p_id']}</td>
                          <td className="p-2 text-slate-300 truncate max-w-40">
                            {row['p_attributes[akku_produktart][de]'] || '-'}
                          </td>
                          {attributeConfigs.filter(a => a.enabled).slice(0, 5).map(attr => (
                            <td key={attr.key} className="p-2">
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                row[attr.key] === 'Ja' ? 'bg-green-500/20 text-green-400' :
                                row[attr.key] === 'Nein' ? 'bg-red-500/20 text-red-400' :
                                'text-slate-500'
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
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
