import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Download, Loader2, CheckCircle2, AlertTriangle, ArrowLeft, Sparkles, Settings2, FileText, Filter, X, Pencil, StopCircle, Copy, Eye, Save, FolderOpen, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseCSV as parseCSVWithEncoding, fixBrokenUtf8 } from "@/lib/csv-processor";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";

interface CSVRow {
  [key: string]: string;
}

interface AttributeConfig {
  key: string;
  label: string;
  enabled: boolean;
  type: 'yesNo' | 'text' | 'fixed' | 'choice';
  fixedValue?: string;  // Für type='fixed'
  choices?: string[];   // Für type='choice'
}

interface AIRule {
  id: string;
  condition: string;  // z.B. "Kurzzeitwecker" im Namen
  attribute: string;  // z.B. "WST_Weckalarm"
  value: string;      // z.B. "Nein"
  priority: number;
}

interface AttributeProfile {
  id: string;
  name: string;
  description?: string;
  attributes: AttributeConfig[];
  aiRules: AIRule[];
  customPrompt?: string;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export default function AttributeFiller() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
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
  
  // Filter-States
  const [pidFilter, setPidFilter] = useState<string>('');
  const [textFilter, setTextFilter] = useState<string>('');
  
  // Custom Prompt für spezielle Befüllungs-Anweisungen
  const [customPrompt, setCustomPrompt] = useState<string>('');
  
  // Editiermodus für manuelle Nachbearbeitung
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; attrKey: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  
  // Abort-Controller für Verarbeitungsabbruch
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // State für Beschreibungs-Vorschau Dialog
  const [showDescriptionDialog, setShowDescriptionDialog] = useState(false);
  const [descriptionDialogContent, setDescriptionDialogContent] = useState<string>('');
  const [descriptionDialogTitle, setDescriptionDialogTitle] = useState<string>('');
  
  // State für Export-Spaltenauswahl Dialog
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportColumns, setExportColumns] = useState<string[]>([]);
  
  // Profil-Management States
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [profileName, setProfileName] = useState<string>('');
  const [profileDescription, setProfileDescription] = useState<string>('');
  const [aiRules, setAiRules] = useState<AIRule[]>([]);
  const [isDefaultProfile, setIsDefaultProfile] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  
  // Profile von API laden
  const { data: profiles = [], isLoading: profilesLoading } = useQuery<AttributeProfile[]>({
    queryKey: ['attribute-profiles'],
    queryFn: async () => {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      const response = await fetch('/api/attribute-profiles', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!user,
  });
  
  // Profil speichern Mutation
  const saveProfileMutation = useMutation({
    mutationFn: async (data: { id?: string; name: string; description?: string; attributes: AttributeConfig[]; aiRules: AIRule[]; customPrompt?: string; isDefault?: boolean }) => {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      const url = data.id ? `/api/attribute-profiles/${data.id}` : '/api/attribute-profiles';
      const method = data.id ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Speichern fehlgeschlagen');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attribute-profiles'] });
      setShowProfileDialog(false);
      toast({ title: "Profil gespeichert", description: "Das Profil wurde erfolgreich gespeichert" });
    },
    onError: (error: any) => {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  });
  
  // Profil löschen Mutation
  const deleteProfileMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      const response = await fetch(`/api/attribute-profiles/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Löschen fehlgeschlagen');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attribute-profiles'] });
      setSelectedProfileId('');
      toast({ title: "Profil gelöscht", description: "Das Profil wurde erfolgreich gelöscht" });
    }
  });
  
  // Profil laden
  const loadProfile = (profile: AttributeProfile) => {
    // Attribute aus Profil laden und mit aktuellen CSV-Spalten abgleichen
    const profileAttrs = profile.attributes || [];
    const updatedConfigs = attributeConfigs.map(cfg => {
      const profileAttr = profileAttrs.find(pa => pa.label === cfg.label || pa.key === cfg.key);
      if (profileAttr) {
        return { ...cfg, enabled: profileAttr.enabled, type: profileAttr.type, fixedValue: profileAttr.fixedValue, choices: profileAttr.choices };
      }
      return { ...cfg, enabled: false };
    });
    setAttributeConfigs(updatedConfigs);
    setAiRules(profile.aiRules || []);
    setCustomPrompt(profile.customPrompt || '');
    setSelectedProfileId(profile.id);
    toast({ title: "Profil geladen", description: `"${profile.name}" wurde geladen` });
  };
  
  // Aktuelles Profil speichern
  const saveCurrentProfile = () => {
    if (!profileName.trim()) {
      toast({ title: "Fehler", description: "Profilname erforderlich", variant: "destructive" });
      return;
    }
    saveProfileMutation.mutate({
      id: editingProfileId || undefined,
      name: profileName,
      description: profileDescription,
      attributes: attributeConfigs,
      aiRules,
      customPrompt,
      isDefault: isDefaultProfile,
    });
  };
  
  // Dialog zum Speichern öffnen
  const openSaveProfileDialog = (existingProfile?: AttributeProfile) => {
    if (existingProfile) {
      setEditingProfileId(existingProfile.id);
      setProfileName(existingProfile.name);
      setProfileDescription(existingProfile.description || '');
      setIsDefaultProfile(existingProfile.isDefault || false);
    } else {
      setEditingProfileId(null);
      setProfileName('');
      setProfileDescription('');
      setIsDefaultProfile(false);
    }
    setShowProfileDialog(true);
  };
  
  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setProcessing(false);
      toast({
        title: "Abgebrochen",
        description: `Verarbeitung wurde nach ${processedCount} Produkten abgebrochen`,
      });
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setProcessedCount(0);
    setProgress(0);

    try {
      // Verwende csv-processor mit korrekter Encoding-Erkennung (UTF-8, Windows-1252, etc.)
      const parseResult = await parseCSVWithEncoding(selectedFile);
      
      if (parseResult.data.length === 0) {
        setError('Die CSV-Datei enthält keine gültigen Daten.');
        return;
      }

      // Extrahiere Headers aus erstem Datensatz
      const parsedHeaders = parseResult.data.length > 0 ? Object.keys(parseResult.data[0]) : [];
      const rows = parseResult.data as CSVRow[];

      setHeaders(parsedHeaders);
      setRawData(rows);

      // Unterstützt p_attributes UND v_attributes (Brickfox-Format)
      // Ausgeschlossene Attribute (werden nicht in der Spaltenauswahl angezeigt)
      const excludedAttributes = ['allg_lieferumfang', 'tala_stromversorgung'];
      const attributeHeaders = parsedHeaders.filter(h => {
        if (!((h.startsWith('p_attributes[') || h.startsWith('v_attributes[')) && h.includes('][de]'))) {
          return false;
        }
        // Prüfe ob Attribut ausgeschlossen ist
        const match = h.match(/[pv]_attributes\[([^\]]+)\]\[de\]/);
        const attrName = match ? match[1] : '';
        return !excludedAttributes.includes(attrName);
      });

      // Spezielle Attribut-Regeln
      const specialRules: Record<string, { type: 'text' | 'fixed' | 'choice' | 'yesNo'; fixedValue?: string; choices?: string[] }> = {
        'akku_produktart': { type: 'text' },  // Produktart aus p_name[de] extrahieren
        'Artikelzustand': { type: 'fixed', fixedValue: 'neu' },  // Immer "neu" eintragen
        'OTTOMARKET_GEFAHRGUT': { type: 'text' },  // Gefahrgut-Prüfung durch AI
        'allg_farbe_geheause': { type: 'text' },  // Farbe aus Beschreibung
        'verp_einheit': { type: 'fixed', fixedValue: '1' },  // Immer 1
        'allg_gefahrengut': { type: 'fixed', fixedValue: 'Fällt nicht unter Gefahrengut' },  // Immer dieser Text
        // Weitere Ja/Nein Attribute (wie WST_)
        'Wochentagsanzeige': { type: 'yesNo' },
        'Zeitzoneneinstellung': { type: 'yesNo' },
        'Wandaufhängung': { type: 'yesNo' },
        'Innentemperatur': { type: 'yesNo' },
        'WST_Weckalarm': { type: 'yesNo' },  // Weckalarm-Funktion
      };
      
      const configs: AttributeConfig[] = attributeHeaders.map(h => {
        // Unterstützt beide Formate: p_attributes[X][de] und v_attributes[X][de]
        const match = h.match(/[pv]_attributes\[([^\]]+)\]\[de\]/);
        const label = match ? match[1] : h;
        
        // Prüfe ob spezielle Regel existiert
        const specialRule = specialRules[label];
        if (specialRule) {
          console.log(`[CSV-Import] Spezielle Regel gefunden: ${label} -> ${specialRule.type}`);
          return {
            key: h,
            label: label,
            enabled: true,  // Spezielle Attribute immer aktiviert
            type: specialRule.type,
            fixedValue: specialRule.fixedValue,
            choices: specialRule.choices,
          };
        }
        
        // Alle Attribute standardmäßig aktiviert
        return {
          key: h,
          label: label,
          enabled: true,  // Alle markieren
          type: 'yesNo'
        };
      });

      console.log('[CSV-Import] Erkannte Attribut-Spalten:', attributeHeaders);
      console.log('[CSV-Import] Aktivierte Attribute:', configs.filter(c => c.enabled).map(c => c.key));
      setAttributeConfigs(configs);
      
      // Standard-Export-Spalten initialisieren (p_id + alle WST_* Attribute)
      const defaultExportCols = [
        'p_id',
        ...attributeHeaders.filter(h => h.includes('WST_'))
      ];
      setExportColumns(defaultExportCols);

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

  // Gefilterte Daten berechnen
  const filteredData = rawData.filter(row => {
    const pidKey = headers.find(h => h === 'p_id' || h === 'v_id') || 'p_id';
    const matchesPid = !pidFilter || String(row[pidKey] || '').toLowerCase().includes(pidFilter.toLowerCase());
    const matchesText = !textFilter || Object.values(row).some(v => String(v).toLowerCase().includes(textFilter.toLowerCase()));
    return matchesPid && matchesText;
  });

  // Zelle bearbeiten - Start
  const handleCellEdit = (rowIndex: number, attrKey: string, currentValue: string) => {
    setEditingCell({ rowIndex, attrKey });
    setEditValue(currentValue || '');
  };

  // Zelle bearbeiten - Speichern (verwendet direkten rawData-Index)
  const saveCellEdit = () => {
    if (editingCell) {
      const updatedData = [...rawData];
      // editingCell.rowIndex ist bereits der echte rawData-Index
      updatedData[editingCell.rowIndex][editingCell.attrKey] = editValue;
      setRawData(updatedData);
      setEditingCell(null);
      setEditValue('');
    }
  };

  // Zelle bearbeiten - Abbrechen
  const cancelCellEdit = () => {
    setEditingCell(null);
    setEditValue('');
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
    
    // Neuen AbortController erstellen
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Bei Filter: nur gefilterte Produkte verarbeiten, sonst alle
    // Erstelle Array mit echten Indizes für robuste Zuordnung (keine Objekt-Referenzen)
    const hasFilter = pidFilter.trim() || textFilter.trim();
    const pidKey = headers.find(h => h === 'p_id' || h === 'v_id') || 'p_id';
    
    // Berechne welche rawData-Indizes zu verarbeiten sind
    const indicesToProcess: number[] = [];
    rawData.forEach((row, idx) => {
      const matchesPid = !pidFilter || String(row[pidKey] || '').toLowerCase().includes(pidFilter.toLowerCase());
      const matchesText = !textFilter || Object.values(row).some(v => String(v).toLowerCase().includes(textFilter.toLowerCase()));
      if (!hasFilter || (matchesPid && matchesText)) {
        indicesToProcess.push(idx);
      }
    });

    const updatedData = [...rawData];
    const batchSize = 5;

    for (let i = 0; i < indicesToProcess.length; i += batchSize) {
      // Prüfe ob abgebrochen wurde
      if (signal.aborted) {
        break;
      }
      
      const batchIndices = indicesToProcess.slice(i, Math.min(i + batchSize, indicesToProcess.length));

      const promises = batchIndices.map(async (realIndex) => {
        const row = updatedData[realIndex];
        const description = row[descriptionKey];
        if (!description || description.trim().length < 10) {
          return null;
        }

        // Nur Attribute die leer sind befüllen
        const attributesToFill = enabledAttributes.filter(a => {
          const currentValue = row[a.key];
          return !currentValue || currentValue.trim() === '';
        });

        console.log(`[Attribut-Befüller] Produkt ${realIndex}: Zu befüllende Attribute:`, 
          attributesToFill.map(a => ({ key: a.key, label: a.label, type: a.type })));

        if (attributesToFill.length === 0) {
          return null; // Alle bereits befüllt
        }

        // Feste Werte sofort setzen (ohne AI) - verwende key (CSV-Spaltenname) statt label
        const fixedResults: Record<string, string> = {};
        const aiAttributesToFill = attributesToFill.filter(a => {
          if (a.type === 'fixed' && a.fixedValue) {
            fixedResults[a.key] = a.fixedValue;  // key = voller CSV-Spaltenname
            return false;  // Nicht an AI senden
          }
          return true;  // An AI senden
        });

        try {
          let aiResults: Record<string, any> = {};
          
          // Nur AI aufrufen wenn noch Attribute übrig sind
          if (aiAttributesToFill.length > 0) {
            const productName = row['p_name[de]'] || '';
            
            // Sende key UND label für korrektes Mapping
            const response = await fetch('/api/analyze-attributes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                description,
                productName,
                attributes: aiAttributesToFill.map(a => ({ 
                  key: a.key,     // Voller CSV-Spaltenname für Rück-Mapping
                  label: a.label, 
                  type: a.type,
                  choices: a.choices  // Für choice-Attribute
                })),
                productType: row['p_attributes[akku_produktart][de]'] || row['v_attributes[akku_produktart][de]'] || '',
                customPrompt: customPrompt.trim() || undefined,
              }),
            });

            if (!response.ok) throw new Error('API Fehler');

            const result = await response.json();
            aiResults = result.attributes || {};
          }
          
          // Merge feste und AI-Ergebnisse
          const allResults = { ...fixedResults, ...aiResults };
          return { index: realIndex, attributes: allResults, attributesToFill };
        } catch (err) {
          console.error('Fehler bei Attribut-Analyse:', err);
          // Auch bei Fehler die festen Werte setzen
          if (Object.keys(fixedResults).length > 0) {
            return { index: realIndex, attributes: fixedResults, attributesToFill: attributesToFill.filter(a => a.type === 'fixed') };
          }
          return null;
        }
      });

      const results = await Promise.all(promises);

      results.forEach(result => {
        if (result) {
          const { index, attributes, attributesToFill } = result;
          console.log(`[Attribut-Befüller] Produkt ${index}: API-Antwort (key-basiert):`, attributes);
          attributesToFill.forEach((attr: AttributeConfig) => {
            // Backend liefert jetzt key-basierte Antwort (voller CSV-Spaltenname)
            const value = attributes[attr.key];
            console.log(`[Attribut-Befüller] Attribut key="${attr.key}": Wert=${value}, Typ=${attr.type}`);
            
            // Bei Ja/Nein-Attributen: Leere Werte = "Nein"
            if (attr.type === 'yesNo') {
              if (value === true || value === 'true' || value === 'Ja' || value === 'ja') {
                updatedData[index][attr.key] = 'Ja';
                console.log(`[Attribut-Befüller] -> Gesetzt: ${attr.key} = Ja`);
              } else {
                // Alles andere (false, undefined, null, '', 'Nein') = "Nein"
                updatedData[index][attr.key] = 'Nein';
                console.log(`[Attribut-Befüller] -> Gesetzt: ${attr.key} = Nein (Standard für leere/falsche Werte)`);
              }
            } else if (value !== undefined && value !== null && value !== '') {
              if (attr.type === 'fixed') {
                // Feste Werte direkt übernehmen
                updatedData[index][attr.key] = String(value);
                console.log(`[Attribut-Befüller] -> Fest gesetzt: ${attr.key} = ${value}`);
              } else if (attr.type === 'choice') {
                // Choice-Werte validieren
                const validChoice = attr.choices?.includes(String(value)) ? String(value) : '';
                if (validChoice) {
                  updatedData[index][attr.key] = validChoice;
                  console.log(`[Attribut-Befüller] -> Choice gesetzt: ${attr.key} = ${validChoice}`);
                }
              } else {
                // Text-Attribute direkt übernehmen
                updatedData[index][attr.key] = String(value);
                console.log(`[Attribut-Befüller] -> Gesetzt: ${attr.key} = ${value}`);
              }
            }
          });
        }
      });

      const processed = Math.min(i + batchSize, indicesToProcess.length);
      setProcessedCount(processed);
      setProgress((processed / indicesToProcess.length) * 100);
    }

    setRawData(updatedData);
    setProcessing(false);

    toast({
      title: "Analyse abgeschlossen",
      description: `${updatedData.length} Produkte analysiert`,
    });
  };

  const handleDownload = (withBOM: boolean = false) => {
    if (rawData.length === 0) return;

    // Nutze die ausgewählten Export-Spalten
    const availableExportColumns = exportColumns.filter(col => headers.includes(col));

    // Wende fixBrokenUtf8 auf jeden Wert an, um Encoding-Probleme zu korrigieren
    const csvContent = [
      availableExportColumns.join(';'),  // Header ohne Anführungszeichen (wie Original)
      ...rawData.map(row =>
        availableExportColumns.map(h => {
          // Encoding-Korrektur für jeden Wert
          const rawVal = String(row[h] || '');
          const fixedVal = fixBrokenUtf8(rawVal);
          const val = fixedVal.replace(/"/g, '""');
          // Nur Anführungszeichen wenn nötig (Semikolon, Zeilenumbruch oder Anführungszeichen im Wert)
          if (val.includes(';') || val.includes('\n') || val.includes('"')) {
            return `"${val}"`;
          }
          return val;
        }).join(';')
      )
    ].join('\n');

    // UTF-8 mit oder ohne BOM
    const content = withBOM ? '\uFEFF' + csvContent : csvContent;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = withBOM ? '_excel' : '_pim';
    a.download = `${file?.name?.replace('.csv', '') || 'export'}_attributes${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export erfolgreich",
      description: withBOM 
        ? `${rawData.length} Zeilen exportiert (Excel-Format mit BOM)` 
        : `${rawData.length} Zeilen exportiert (PIM-Format ohne BOM)`,
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
                  <Button onClick={() => setShowExportDialog(true)} variant="outline" disabled={processing} title="Export-Spalten auswählen">
                    <Settings2 className="w-4 h-4 mr-2" />
                    Spalten ({exportColumns.length})
                  </Button>
                  <Button onClick={() => handleDownload(false)} disabled={processing} title="UTF-8 ohne BOM für Brickfox/PIM">
                    <Download className="w-4 h-4 mr-2" />
                    PIM Export
                  </Button>
                  <Button onClick={() => handleDownload(true)} disabled={processing} variant="outline" title="UTF-8 mit BOM für Excel">
                    <Download className="w-4 h-4 mr-2" />
                    Excel Export
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
              {/* Profil-Auswahl Bereich */}
              <div className="flex items-center gap-4 mb-4 pb-4 border-b">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm font-medium">Profil:</span>
                </div>
                <Select value={selectedProfileId} onValueChange={(value) => {
                  if (value === '__new__') {
                    openSaveProfileDialog();
                  } else {
                    const profile = profiles.find(p => p.id === value);
                    if (profile) loadProfile(profile);
                  }
                }}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Profil wählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map(profile => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name} {profile.isDefault && '(Standard)'}
                      </SelectItem>
                    ))}
                    <SelectItem value="__new__">
                      <span className="flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Neues Profil erstellen...
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {attributeConfigs.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => openSaveProfileDialog()}>
                    <Save className="w-4 h-4 mr-2" />
                    Als Profil speichern
                  </Button>
                )}
                {selectedProfileId && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => {
                      const profile = profiles.find(p => p.id === selectedProfileId);
                      if (profile) openSaveProfileDialog(profile);
                    }}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Bearbeiten
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => {
                      if (confirm('Profil wirklich löschen?')) {
                        deleteProfileMutation.mutate(selectedProfileId);
                      }
                    }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
              
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
                  <Button variant="outline" size="sm" onClick={() => setAttributeConfigs(prev => prev.map(a => ({ ...a, enabled: false })))}>
                    Alle abwählen
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
                      className="text-xs text-muted-foreground cursor-pointer truncate"
                      title={attr.key}
                    >
                      {attr.key}
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
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={handleAbort}
                    className="flex items-center gap-2"
                  >
                    <StopCircle className="w-4 h-4" />
                    Abbrechen
                  </Button>
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
                    {(pidFilter || textFilter) 
                      ? `${filteredData.length} gefilterte Produkte befüllen (${enabledCount} Attribute)`
                      : `Alle ${rawData.length} Produkte befüllen (${enabledCount} Attribute)`
                    }
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

            {/* Filter und Custom Prompt */}
            <Card className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Filter-Bereich */}
                <div>
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                    <Filter className="w-5 h-5" />
                    Filter
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="pid-filter" className="text-xs text-muted-foreground">p_id / v_id Filter</Label>
                      <Input
                        id="pid-filter"
                        value={pidFilter}
                        onChange={(e) => setPidFilter(e.target.value)}
                        placeholder="z.B. 41877"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="text-filter" className="text-xs text-muted-foreground">Text-Suche (alle Spalten)</Label>
                      <Input
                        id="text-filter"
                        value={textFilter}
                        onChange={(e) => setTextFilter(e.target.value)}
                        placeholder="z.B. Wetterstation"
                        className="mt-1"
                      />
                    </div>
                    {(pidFilter || textFilter) && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-primary font-medium">
                          {filteredData.length} von {rawData.length} Produkten gefiltert
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setPidFilter(''); setTextFilter(''); }}
                          className="h-8"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Filter zurücksetzen
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Custom Prompt */}
                <div>
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                    <Sparkles className="w-5 h-5" />
                    Zusätzliche Anweisungen (optional)
                  </h3>
                  <Textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="z.B. 'Bei Weckern immer WST_Weckalarm auf true setzen' oder 'Farbe auch aus EAN-Bezeichnung extrahieren'"
                    className="min-h-[100px]"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Diese Anweisungen werden an die AI übergeben um die Attribut-Erkennung anzupassen
                  </p>
                </div>
              </div>
            </Card>

            {/* Vorschau-Tabelle mit editierbaren Zellen */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">
                  Vorschau ({(pidFilter || textFilter) ? `${filteredData.length} gefiltert` : `alle ${rawData.length} Zeilen`}) - {attributeConfigs.filter(a => a.enabled).length} Attribute
                </h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Pencil className="w-3 h-3" />
                  Klicke auf Werte zum Bearbeiten
                </div>
              </div>
              <div className="overflow-x-auto max-h-[500px] border rounded-lg">
                <table className="text-sm min-w-max">
                  <thead className="sticky top-0 bg-card z-20">
                    <tr className="border-b">
                      <th className="text-left p-2 text-muted-foreground whitespace-nowrap sticky left-0 bg-card z-10">p_id</th>
                      <th className="text-left p-2 text-muted-foreground whitespace-nowrap">p_item_number</th>
                      <th className="text-left p-2 text-muted-foreground whitespace-nowrap max-w-[200px]">p_name[de]</th>
                      <th className="text-left p-2 text-muted-foreground whitespace-nowrap max-w-[300px]">p_description[de]</th>
                      {attributeConfigs.filter(a => a.enabled).map(attr => (
                        <th key={attr.key} className="text-left p-2 text-muted-foreground whitespace-nowrap text-xs" title={attr.key}>
                          {attr.key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const pidKey = headers.find(h => h === 'p_id' || h === 'v_id') || 'p_id';
                      // Erstelle Array mit echten rawData-Indizes für korrekte Bearbeitung
                      const rowsWithIndices: { row: CSVRow; realIndex: number }[] = [];
                      rawData.forEach((row, idx) => {
                        const matchesPid = !pidFilter || String(row[pidKey] || '').toLowerCase().includes(pidFilter.toLowerCase());
                        const matchesText = !textFilter || Object.values(row).some(v => String(v).toLowerCase().includes(textFilter.toLowerCase()));
                        if (matchesPid && matchesText) {
                          rowsWithIndices.push({ row, realIndex: idx });
                        }
                      });
                      // Zeige alle Zeilen an (kein Limit mehr)
                      const displayRows = rowsWithIndices;
                      
                      return displayRows.map(({ row, realIndex }) => (
                        <tr key={realIndex} className="border-b hover:bg-accent/50">
                          <td className="p-2 text-foreground whitespace-nowrap sticky left-0 bg-card">{row[pidKey]}</td>
                          <td className="p-2 text-foreground whitespace-nowrap">{row['p_item_number'] || row['v_item_number'] || '-'}</td>
                          <td className="p-2 text-foreground max-w-[200px]">
                            <div className="flex items-center gap-1">
                              <span className="truncate max-w-[150px]" title={row['p_name[de]'] || ''}>
                                {row['p_name[de]'] || '-'}
                              </span>
                              {row['p_name[de]'] && (
                                <button
                                  onClick={() => {
                                    setDescriptionDialogTitle('Produktname');
                                    setDescriptionDialogContent(`<h2>${row['p_name[de]']}</h2>`);
                                    setShowDescriptionDialog(true);
                                  }}
                                  className="p-1 hover:bg-accent rounded"
                                  title="Produktname anzeigen"
                                >
                                  <Eye className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-foreground max-w-[300px]">
                            <div className="flex items-center gap-1">
                              <span className="truncate max-w-[200px]" title={row['p_description[de]'] || ''}>
                                {(row['p_description[de]'] || '').substring(0, 60)}{(row['p_description[de]'] || '').length > 60 ? '...' : ''}
                              </span>
                              {row['p_description[de]'] && (
                                <>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(row['p_description[de]'] || '');
                                      toast({ title: "Kopiert", description: "Beschreibung in Zwischenablage kopiert" });
                                    }}
                                    className="p-1 hover:bg-accent rounded"
                                    title="Beschreibung kopieren"
                                  >
                                    <Copy className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setDescriptionDialogTitle(row['p_name[de]'] || row[pidKey] || 'Beschreibung');
                                      setDescriptionDialogContent(row['p_description[de]'] || '');
                                      setShowDescriptionDialog(true);
                                    }}
                                    className="p-1 hover:bg-accent rounded"
                                    title="Beschreibung anzeigen"
                                  >
                                    <Eye className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                          {attributeConfigs.filter(a => a.enabled).map(attr => (
                            <td key={attr.key} className="p-2 whitespace-nowrap">
                              {editingCell?.rowIndex === realIndex && editingCell?.attrKey === attr.key ? (
                                <div className="flex items-center gap-1">
                                  {attr.type === 'yesNo' ? (
                                    <select
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      className="text-xs border rounded px-1 py-0.5 bg-background"
                                      autoFocus
                                    >
                                      <option value="">-</option>
                                      <option value="Ja">Ja</option>
                                      <option value="Nein">Nein</option>
                                    </select>
                                  ) : (
                                    <Input
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      className="h-6 text-xs w-24"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveCellEdit();
                                        if (e.key === 'Escape') cancelCellEdit();
                                      }}
                                    />
                                  )}
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={saveCellEdit}>
                                    <CheckCircle2 className="w-3 h-3 text-chart-2" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={cancelCellEdit}>
                                    <X className="w-3 h-3 text-destructive" />
                                  </Button>
                                </div>
                              ) : (
                                <span
                                  onClick={() => handleCellEdit(realIndex, attr.key, row[attr.key] || '')}
                                  className={`px-2 py-0.5 rounded text-xs cursor-pointer hover:ring-2 hover:ring-primary/50 ${
                                    row[attr.key] === 'Ja' ? 'bg-chart-2/20 text-chart-2' :
                                    row[attr.key] === 'Nein' ? 'bg-destructive/20 text-destructive' :
                                    row[attr.key] && row[attr.key].trim() !== '' ? 'bg-primary/20 text-primary' :
                                    'text-muted-foreground'
                                  }`}
                                >
                                  {row[attr.key] || '-'}
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* Dialog für Beschreibungs-Vorschau */}
      <Dialog open={showDescriptionDialog} onOpenChange={setShowDescriptionDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{descriptionDialogTitle}</DialogTitle>
            <DialogDescription>
              Produktbeschreibung aus CSV
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[70vh] border rounded-lg bg-white p-6">
            <div className="prose prose-sm max-w-none text-gray-700">
              <div dangerouslySetInnerHTML={{ __html: descriptionDialogContent }} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog für Export-Spaltenauswahl */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Export-Spalten auswählen</DialogTitle>
            <DialogDescription>
              Wähle die Spalten für den CSV-Export ({exportColumns.length} ausgewählt)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setExportColumns(['p_id', ...headers.filter(h => h.includes('WST_'))])}
              >
                Nur p_id + WST_*
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setExportColumns(['p_id', ...attributeConfigs.map(a => a.key)])}
              >
                p_id + Alle Attribute
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setExportColumns(headers)}
              >
                Alle Spalten
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setExportColumns([])}
              >
                Alle abwählen
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto border rounded-lg p-3">
              {headers.map(header => (
                <div key={header} className="flex items-center space-x-2">
                  <Checkbox
                    id={`export-${header}`}
                    checked={exportColumns.includes(header)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setExportColumns(prev => [...prev, header]);
                      } else {
                        setExportColumns(prev => prev.filter(c => c !== header));
                      }
                    }}
                  />
                  <Label
                    htmlFor={`export-${header}`}
                    className="text-xs text-muted-foreground cursor-pointer truncate"
                    title={header}
                  >
                    {header}
                  </Label>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setShowExportDialog(false)}>
                Fertig
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog für Profil speichern/bearbeiten */}
      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProfileId ? 'Profil bearbeiten' : 'Neues Profil erstellen'}</DialogTitle>
            <DialogDescription>
              Speichere die aktuelle Attribut-Konfiguration als wiederverwendbares Profil
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="profile-name">Profilname *</Label>
              <Input
                id="profile-name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="z.B. Wetterstationen, Akkus, Kabel..."
              />
            </div>
            <div>
              <Label htmlFor="profile-description">Beschreibung</Label>
              <Textarea
                id="profile-description"
                value={profileDescription}
                onChange={(e) => setProfileDescription(e.target.value)}
                placeholder="Optionale Beschreibung für dieses Profil..."
                rows={2}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="profile-default"
                checked={isDefaultProfile}
                onCheckedChange={(checked) => setIsDefaultProfile(!!checked)}
              />
              <Label htmlFor="profile-default" className="text-sm">
                Als Standard-Profil setzen
              </Label>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">
                <strong>Gespeichert werden:</strong><br />
                • {attributeConfigs.filter(a => a.enabled).length} aktivierte Attribute<br />
                • {aiRules.length} KI-Regeln<br />
                {customPrompt && '• Custom Prompt'}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowProfileDialog(false)}>
                Abbrechen
              </Button>
              <Button onClick={saveCurrentProfile} disabled={saveProfileMutation.isPending}>
                {saveProfileMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Speichern
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
