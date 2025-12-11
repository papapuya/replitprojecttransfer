import { useState, useEffect, useRef } from "react";
import { Upload, Download, FileText, CheckCircle2, Loader2, AlertTriangle, Settings2, FolderPlus, Sparkles, Eye, Monitor, Smartphone, ArrowLeft, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { parseCSV } from "@/lib/csv-processor";
import type Papa from "papaparse";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { BulkDescriptionTable } from "@/components/bulk-description-table";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project } from "@shared/schema";

interface RawCSVRow {
  [key: string]: string;
}

interface BulkProduct {
  id: number;
  p_id: string;
  v_id: string;
  produktname: string;
  produktname_neu: string;
  produktbeschreibung: string;
  produktbeschreibung_html: string;
  // Niederländische Übersetzungen (via DeepL)
  produktname_nl: string;
  produktbeschreibung_nl: string;
  produktbeschreibung_html_nl: string;
  // Original Beschreibung aus CSV
  produktbeschreibung_original?: string;
  mediamarktname_v1: string;
  mediamarktname_v2: string;
  seo_titel?: string;
  seo_beschreibung: string;
  seo_keywords: string;
  kurzbeschreibung: string;
  ean?: string;
  hersteller?: string;
  preis?: string;
  gewicht?: string;
  kategorie?: string;
}

interface ExportColumn {
  key: string;
  label: string;
  enabled: boolean;
}

export default function CSVBulkDescription() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [bulkProducts, setBulkProducts] = useState<BulkProduct[]>([]);
  const [rawData, setRawData] = useState<RawCSVRow[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [parseWarnings, setParseWarnings] = useState<Papa.ParseError[]>([]);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [savingProject, setSavingProject] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("new");
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [htmlPreviewContent, setHtmlPreviewContent] = useState("");
  const [htmlPreviewProductName, setHtmlPreviewProductName] = useState("");
  const [isMobilePreview, setIsMobilePreview] = useState(false);
  
  // Abbruch-Referenz für die AI-Generierung
  const abortRef = useRef(false);

  // Lade bestehende Projekte
  const { data: projectsData } = useQuery<{ success: boolean; projects: Project[] }>({
    queryKey: ['/api/projects'],
    enabled: showSaveDialog,
  });

  const existingProjects = projectsData?.projects || [];
  
  const [exportColumns, setExportColumns] = useState<ExportColumn[]>([
    { key: 'p_id', label: 'p_id', enabled: true },
    { key: 'v_id', label: 'v_id', enabled: true },
    { key: 'produktname', label: 'p_name_original[de]', enabled: false },
    { key: 'produktname_neu', label: 'p_name[de]', enabled: true },
    { key: 'produktbeschreibung', label: 'p_description_text[de]', enabled: false },
    { key: 'produktbeschreibung_html', label: 'p_description[de]', enabled: true },
    // Niederländische Felder (via DeepL)
    { key: 'produktname_nl', label: 'p_name[nl]', enabled: true },
    { key: 'produktbeschreibung_html_nl', label: 'p_description[nl]', enabled: true },
    // Original aus CSV
    { key: 'produktbeschreibung_original', label: 'p_description_original[de]', enabled: false },
    { key: 'mediamarktname_v1', label: 'p_mediamarkt_v1', enabled: false },
    { key: 'mediamarktname_v2', label: 'p_mediamarkt_v2', enabled: false },
    { key: 'seo_beschreibung', label: 'p_seo_description[de]', enabled: true },
    { key: 'seo_keywords', label: 'p_seo_keywords[de]', enabled: true },
    { key: 'kurzbeschreibung', label: 'p_short_description[de]', enabled: false },
  ]);

  // SessionStorage Keys
  const SESSION_KEY_PRODUCTS = 'csv-bulk-products';
  const SESSION_KEY_RAW_DATA = 'csv-bulk-raw-data';
  const SESSION_KEY_FILE_NAME = 'csv-bulk-file-name';
  const SESSION_KEY_VERSION = 'csv-bulk-version';
  const CURRENT_SCHEMA_VERSION = '3'; // Increment when BulkProduct structure changes (v3: NL fields added)

  // Beim Laden der Komponente: Daten aus sessionStorage wiederherstellen
  useEffect(() => {
    // Prüfe Schema-Version - bei Änderung Cache leeren
    const savedVersion = sessionStorage.getItem(SESSION_KEY_VERSION);
    if (savedVersion !== CURRENT_SCHEMA_VERSION) {
      console.log('[CSV] Schema version changed, clearing cache');
      sessionStorage.removeItem(SESSION_KEY_PRODUCTS);
      sessionStorage.removeItem(SESSION_KEY_RAW_DATA);
      sessionStorage.removeItem(SESSION_KEY_FILE_NAME);
      sessionStorage.setItem(SESSION_KEY_VERSION, CURRENT_SCHEMA_VERSION);
      return;
    }

    const savedProducts = sessionStorage.getItem(SESSION_KEY_PRODUCTS);
    const savedRawData = sessionStorage.getItem(SESSION_KEY_RAW_DATA);
    const savedFileName = sessionStorage.getItem(SESSION_KEY_FILE_NAME);

    if (savedProducts && savedRawData) {
      try {
        const products = JSON.parse(savedProducts);
        const rawData = JSON.parse(savedRawData);
        
        // Prüfe ob Produkte das neue Format haben (p_id statt artikelnummer)
        if (products.length > 0 && !('p_id' in products[0])) {
          console.log('[CSV] Old product format detected, clearing cache');
          sessionStorage.removeItem(SESSION_KEY_PRODUCTS);
          sessionStorage.removeItem(SESSION_KEY_RAW_DATA);
          sessionStorage.removeItem(SESSION_KEY_FILE_NAME);
          return;
        }
        
        setBulkProducts(products);
        setRawData(rawData);
        
        if (savedFileName) {
          setSuccessMessage(`${products.length} gespeicherte Produkte wiederhergestellt (${savedFileName})`);
        }
      } catch (error) {
        console.error('Failed to restore session data:', error);
        sessionStorage.removeItem(SESSION_KEY_PRODUCTS);
        sessionStorage.removeItem(SESSION_KEY_RAW_DATA);
        sessionStorage.removeItem(SESSION_KEY_FILE_NAME);
      }
    }
  }, []);

  // Bei Änderungen: Daten in sessionStorage speichern
  useEffect(() => {
    if (bulkProducts.length > 0) {
      sessionStorage.setItem(SESSION_KEY_PRODUCTS, JSON.stringify(bulkProducts));
      sessionStorage.setItem(SESSION_KEY_RAW_DATA, JSON.stringify(rawData));
      if (file) {
        sessionStorage.setItem(SESSION_KEY_FILE_NAME, file.name);
      }
    }
  }, [bulkProducts, rawData, file]);

  const handleFileSelect = (selectedFile: File | null) => {
    if (!selectedFile) return;

    // WICHTIG: Alte Daten komplett löschen bevor neue Datei verarbeitet wird
    setRawData([]);
    setBulkProducts([]);
    sessionStorage.removeItem(SESSION_KEY_PRODUCTS);
    sessionStorage.removeItem(SESSION_KEY_RAW_DATA);
    sessionStorage.removeItem(SESSION_KEY_FILE_NAME);

    setFile(selectedFile);
    setError("");
    setSuccessMessage("");

    const fileName = selectedFile.name.toLowerCase();
    if (!fileName.endsWith('.csv')) {
      setError('Bitte wählen Sie eine gültige CSV-Datei aus.');
      return;
    }

    processFile(selectedFile);
  };

  const processFile = async (fileToProcess: File) => {
    setProcessing(true);
    setError("");
    setParseWarnings([]);
    setBulkProducts([]);
    setProgress(0);

    try {
      const parseResult = await parseCSV(fileToProcess);
      
      if (parseResult.data.length === 0) {
        setError('Die CSV-Datei enthält keine gültigen Daten.');
        setProcessing(false);
        return;
      }

      setRawData(parseResult.data);
      setParseWarnings(parseResult.warnings);
      setSuccessMessage(`${parseResult.data.length} Zeilen erfolgreich eingelesen`);
      setProcessing(false);

      // AI-Generierung wird NICHT automatisch gestartet - User muss Button klicken
      
    } catch (err) {
      console.error('Verarbeitungsfehler:', err);
      setError(err instanceof Error ? err.message : 'Fehler beim Verarbeiten der Datei');
      setProcessing(false);
    }
  };

  const startAIGeneration = async () => {
    if (rawData.length === 0) {
      setError('Keine Daten zum Verarbeiten vorhanden');
      return;
    }

    abortRef.current = false;
    setProcessing(true);
    setError("");
    setProgress(0);
    
    try {
      await generateDescriptions(rawData);
    } catch (err) {
      console.error('Generierungsfehler:', err);
      if (!abortRef.current) {
        setError(err instanceof Error ? err.message : 'Fehler bei der AI-Generierung');
      }
      setProcessing(false);
    }
  };
  
  const cancelGeneration = () => {
    abortRef.current = true;
    setProcessing(false);
    toast({
      title: "Abgebrochen",
      description: `Generierung abgebrochen. ${bulkProducts.length} Produkte wurden bereits verarbeitet.`,
    });
  };

  const generateDescriptions = async (data: RawCSVRow[]) => {
    const BATCH_SIZE = 10;
    const total = data.length;
    const results: (BulkProduct | undefined)[] = new Array(total);
    let processedCount = 0;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      // Prüfe ob abgebrochen wurde
      if (abortRef.current) {
        console.log('Generierung abgebrochen bei Batch', i);
        break;
      }
      
      const batch = data.slice(i, Math.min(i + BATCH_SIZE, total));

      const settled = await Promise.allSettled(
        batch.map(async (row, batchIndex) => {
          const globalIndex = i + batchIndex;
          const productData: Record<string, string> = {};

          Object.keys(row).forEach((key) => {
            const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');
            productData[normalizedKey] = row[key];
          });

          // Produktname aus verschiedenen möglichen Spalten lesen (inklusive BrickFox Format)
          const produktname =
            productData.produktname ||
            productData.bezeichnung ||
            productData.name ||
            productData['p_name_de'] ||
            productData['p_name[de]'] ||
            row['Produktname'] ||
            row['Bezeichnung'] ||
            row['Name'] ||
            row['produktname'] ||
            row['bezeichnung'] ||
            row['P Name[de]'] ||
            row['P Name de'] ||
            'Unbekanntes Produkt';

          productData.productName = produktname;

          // Use local admin token (ignore Supabase for local dev)
          const token = 'local-admin-token-pimpilot-dev';
          
          const response = await fetch('/api/generate-description', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              extractedData: [{ 
                extractedText: JSON.stringify(productData),
                structuredData: productData  // Pass parsed CSV data for dynamic tech table
              }],
              customAttributes: { exactProductName: produktname },
            }),
          });

          if (!response.ok) {
            throw new Error(`API request failed (${response.status})`);
          }

          const payload = await response.json();
          const plainText = stripHtml(payload.description || '');
          const sentences = plainText
            .split('.')
            .filter((sentence) => sentence.trim().length > 10);
          const seoDesc = sentences[0]
            ? `${sentences[0].substring(0, 150)}${
                sentences[0].length > 150 ? '...' : ''
              }`
            : '';
          const shortDesc =
            sentences.slice(0, 2).join('. ') + (sentences.length > 2 ? '.' : '');

          // MediaMarkt V1: Produkt + Modell (z.B. "Akkupack Mignon AA / LR6")
          // Verwende den Produktnamen, der bereits "Produkt + Modell" enthält
          const mmNameV1 = produktname.trim();

          // MediaMarkt V2: Nur Modellcodes (Großbuchstaben und Zahlen)
          // Entferne Herstellerpräfixe wie "ANS-" und behalte nur alphanumerische Codes
          const artikelnummer = row['p_item_number'] || productData.artikelnummer || '';
          const mmNameV2 = artikelnummer.replace(/^[A-Z]+-/, '').trim();

          // p_id und v_id direkt aus der Original-CSV übernehmen
          const p_id = row['p_id'] || '';
          const v_id = row['v_id'] || '';
          
          // Volt-Wert aus CSV extrahieren für SEO-Namen
          const voltValue = row['V_Nominal'] || row['v_nominal'] || row['Spannung'] || row['spannung'] || '';

          // Niederländische Übersetzungen (von DeepL API)
          const plainTextNL = stripHtml(payload.descriptionNL || '');
          
          // Original-Beschreibung aus CSV extrahieren
          const originalDescription = row['p_description[de]'] || row['P Description[de]'] || 
                                      row['p_description'] || row['beschreibung'] || '';
          
          return {
            id: globalIndex + 1,
            p_id: p_id,
            v_id: v_id,
            produktname: produktname,
            produktname_neu: cleanSeoProductName(payload.produktTitel || '', voltValue),
            produktbeschreibung: cleanDescription(plainText),
            produktbeschreibung_html: cleanDescription(payload.description || ''),
            // Niederländische Übersetzungen
            produktname_nl: payload.produktTitelNL || '',
            produktbeschreibung_nl: cleanDescription(plainTextNL),
            produktbeschreibung_html_nl: cleanDescription(payload.descriptionNL || ''),
            // Original aus CSV
            produktbeschreibung_original: originalDescription,
            mediamarktname_v1: mmNameV1.substring(0, 60),
            mediamarktname_v2: mmNameV2.substring(0, 40),
            seo_beschreibung: seoDesc,
            seo_keywords: payload.seoKeywords || '',
            kurzbeschreibung: shortDesc.substring(0, 300),
          } satisfies BulkProduct;
        })
      );

      settled.forEach((outcome, batchIndex) => {
        const globalIndex = i + batchIndex;
        processedCount += 1;
        setProgress(Math.round((processedCount / total) * 100));

        if (outcome.status === 'fulfilled') {
          results[globalIndex] = outcome.value;
        } else {
          console.error(`Error processing row ${globalIndex}:`, outcome.reason);
          results[globalIndex] = {
            id: globalIndex + 1,
            p_id: '-',
            v_id: '-',
            produktname: 'Fehler',
            produktname_neu: '',
            produktbeschreibung: '',
            produktbeschreibung_html: '',
            produktname_nl: '',
            produktbeschreibung_nl: '',
            produktbeschreibung_html_nl: '',
            mediamarktname_v1: '',
            mediamarktname_v2: '',
            seo_beschreibung: '',
            seo_keywords: '',
            kurzbeschreibung: '',
          } satisfies BulkProduct;
        }
      });
    }

    const completedResults = results.filter(Boolean) as BulkProduct[];
    setBulkProducts(completedResults);
    setSuccessMessage(`${completedResults.length} Produkte erfolgreich verarbeitet`);
    setProgress(100);
    setProcessing(false);
  };

  const stripHtml = (html: string): string => {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  };

  // Bereinigt den SEO-Produktnamen: EMCOM entfernen, Wh/mAh entfernen, APN entfernen, Volt hinzufügen
  const cleanSeoProductName = (name: string, voltValue?: string): string => {
    if (!name) return '';
    let cleaned = name;
    
    // EMCOM am Anfang entfernen
    cleaned = cleaned.replace(/^EMCOM\s+/i, '');
    // EMCOM in der Mitte entfernen
    cleaned = cleaned.replace(/\s+EMCOM\s+/gi, ' ');
    // EMCOM am Ende entfernen
    cleaned = cleaned.replace(/\s+EMCOM$/i, '');
    // "von EMCOM" oder "by EMCOM" entfernen
    cleaned = cleaned.replace(/\s+(von|by|from)\s+EMCOM\b/gi, '');
    
    // APN-Angaben komplett entfernen
    // "entspricht APN 616-0579, 616-0580, 616-0581, 616-0582"
    cleaned = cleaned.replace(/,?\s*entspricht\s+APN\s+[\d\-,\s]+/gi, '');
    // "APN 616-0579, 616-0580"
    cleaned = cleaned.replace(/,?\s*APN\s+[\d\-,\s]+/gi, '');
    // "(APN: 616-0579)"
    cleaned = cleaned.replace(/\s*\(APN[:\s]*[\d\-,\s]+\)/gi, '');
    
    // Wh-Angaben entfernen (z.B. "37 Wh", "– 37 Wh")
    cleaned = cleaned.replace(/\s*–?\s*\d+\s*Wh\b/gi, '');
    
    // Falsche mAh-Angaben entfernen (z.B. "37mAh", "37 mAh" - unrealistisch kleine Werte)
    // Entferne mAh-Werte unter 100 (unrealistisch für Akkus)
    cleaned = cleaned.replace(/\s*–?\s*\d{1,2}\s*mAh\b/gi, '');
    
    // Wenn Volt-Wert vorhanden, am Ende hinzufügen
    if (voltValue && voltValue.trim()) {
      // Prüfe ob bereits Volt im Namen
      if (!/\d+[,.]?\d*\s*V(olt)?/i.test(cleaned)) {
        cleaned = cleaned.replace(/\s*–\s*$/, ''); // Entferne trailing –
        cleaned = `${cleaned.trim()} – ${voltValue.replace('.', ',')} V`;
      }
    }
    
    // Doppelte Leerzeichen und – am Ende bereinigen
    cleaned = cleaned.replace(/\s+/g, ' ').replace(/\s*–\s*$/, '').trim();
    // Komma am Ende entfernen
    cleaned = cleaned.replace(/,\s*$/, '').trim();
    
    return cleaned;
  };

  // Bereinigt die Produktbeschreibung: Falsche mAh/Wh-Werte entfernen
  const cleanDescription = (html: string): string => {
    if (!html) return '';
    let cleaned = html;
    
    // Falsche mAh-Angaben entfernen (unter 100 mAh = unrealistisch)
    cleaned = cleaned.replace(/\b\d{1,2}\s*mAh\b/gi, '');
    
    // Falsche Wh-Angaben entfernen (z.B. "37 Wh" ohne echte Daten)
    cleaned = cleaned.replace(/\b\d{1,2}\s*Wh\b/gi, '');
    
    // Doppelte Leerzeichen bereinigen
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    return cleaned;
  };

  const decodeHtmlEntities = (text: string): string => {
    if (!text) return '';
    const entities: Record<string, string> = {
      '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
      '&quot;': '"', '&apos;': "'", '&#39;': "'",
      '&auml;': 'ä', '&ouml;': 'ö', '&uuml;': 'ü',
      '&Auml;': 'Ä', '&Ouml;': 'Ö', '&Uuml;': 'Ü',
      '&szlig;': 'ß', '&euro;': '€', '&ndash;': '–', '&mdash;': '—',
      '&copy;': '©', '&reg;': '®', '&trade;': '™',
      '&laquo;': '«', '&raquo;': '»', '&bull;': '•',
    };
    let result = text;
    Object.keys(entities).forEach(entity => {
      result = result.replace(new RegExp(entity, 'gi'), entities[entity]);
    });
    result = result.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    return result;
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDownload = () => {
    try {
      const selectedColumns = exportColumns.filter(col => col.enabled);
      
      // Nur Zeilen mit generierter Beschreibung exportieren
      const productsWithDescription = bulkProducts.filter(p => 
        p.produktbeschreibung_html && p.produktbeschreibung_html.trim().length > 0
      );
      
      if (productsWithDescription.length === 0) {
        toast({
          title: "Keine Daten",
          description: "Bitte zuerst Beschreibungen generieren",
          variant: "destructive",
        });
        return;
      }
      
      const headers = selectedColumns.map(col => col.label);
      const rows = productsWithDescription.map(product => {
        return selectedColumns.map(col => {
          const value = product[col.key as keyof BulkProduct];
          const strValue = typeof value === 'string' ? value : String(value);
          return decodeHtmlEntities(strValue);
        });
      });

      const csvContent = [
        headers.map(h => `"${h}"`).join(';'),
        ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(';'))
      ].join('\n');

      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `produktbeschreibungen_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Export erfolgreich",
        description: `${productsWithDescription.length} Zeilen mit Beschreibung exportiert`,
      });
    } catch (err) {
      setError('Fehler beim Herunterladen der CSV-Datei');
    }
  };

  const toggleColumn = (key: string) => {
    setExportColumns(prev => 
      prev.map(col => col.key === key ? { ...col, enabled: !col.enabled } : col)
    );
  };

  const toggleAllColumns = (enabled: boolean) => {
    setExportColumns(prev => prev.map(col => ({ ...col, enabled })));
  };

  const handleUpdateProduct = (id: number, field: keyof BulkProduct, value: string) => {
    setBulkProducts(prev =>
      prev.map(product =>
        product.id === id ? { ...product, [field]: value } : product
      )
    );
  };

  const reset = () => {
    setFile(null);
    setRawData([]);
    setBulkProducts([]);
    setError("");
    setSuccessMessage("");
    setProgress(0);
    
    // SessionStorage komplett leeren für diese App
    sessionStorage.removeItem(SESSION_KEY_PRODUCTS);
    sessionStorage.removeItem(SESSION_KEY_RAW_DATA);
    sessionStorage.removeItem(SESSION_KEY_FILE_NAME);
    
    // Force clear: Alle csv-bulk Keys entfernen
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith('csv-bulk')) {
        sessionStorage.removeItem(key);
      }
    });
    
    console.log('[CSV Reset] All session data cleared');
  };

  const handleSaveToProject = async () => {
    // Wenn neues Projekt: Projektname erforderlich
    if (selectedProjectId === "new" && !projectName.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie einen Projektnamen ein",
        variant: "destructive",
      });
      return;
    }

    // Wenn bestehendes Projekt: Projekt muss ausgewählt sein
    if (selectedProjectId !== "new" && !selectedProjectId) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie ein Projekt aus",
        variant: "destructive",
      });
      return;
    }

    setSavingProject(true);
    try {
      if (selectedProjectId === "new") {
        // Neues Projekt erstellen
        await apiRequest('POST', '/api/bulk-save-to-project', {
          projectName: projectName.trim(),
          products: bulkProducts,
        });
        
        toast({
          title: "Projekt gespeichert",
          description: `${bulkProducts.length} Produkte wurden erfolgreich in "${projectName}" gespeichert`,
        });
      } else {
        // Zu bestehendem Projekt hinzufügen
        const savedCount = await addProductsToExistingProject(selectedProjectId, bulkProducts);
        const project = existingProjects.find(p => p.id === selectedProjectId);
        
        // Invalidate queries to refresh product counts
        queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
        // Invalidate all product-counts queries
        queryClient.invalidateQueries({ 
          predicate: (query) => 
            Array.isArray(query.queryKey) && 
            query.queryKey[0] === '/api/projects/product-counts'
        });
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${selectedProjectId}/products`] });
        
        toast({
          title: "Produkte hinzugefügt",
          description: `${savedCount} Produkte wurden erfolgreich zu "${project?.name}" hinzugefügt`,
        });
      }

      // Invalidate queries for new project case as well
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      // Invalidate all product-counts queries
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          Array.isArray(query.queryKey) && 
          query.queryKey[0] === '/api/projects/product-counts'
      });

      setShowSaveDialog(false);
      setProjectName("");
      setSelectedProjectId("new");
      
      // Weiterleitung zu Projekten nach 1 Sekunde
      setTimeout(() => {
        setLocation('/projects');
      }, 1000);
      
    } catch (err) {
      toast({
        title: "Fehler",
        description: err instanceof Error ? err.message : 'Projekt konnte nicht gespeichert werden',
        variant: "destructive",
      });
    } finally {
      setSavingProject(false);
    }
  };

  const addProductsToExistingProject = async (projectId: string, products: BulkProduct[]): Promise<number> => {
    let savedCount = 0;
    for (const product of products) {
      const extractedDataArray = [
        product.ean ? { key: 'ean', value: product.ean, type: 'text' as const } : null,
        product.hersteller ? { key: 'hersteller', value: product.hersteller, type: 'text' as const } : null,
        product.preis ? { key: 'preis', value: product.preis, type: 'text' as const } : null,
        product.gewicht ? { key: 'gewicht', value: product.gewicht, type: 'text' as const } : null,
        product.kategorie ? { key: 'kategorie', value: product.kategorie, type: 'text' as const } : null,
      ].filter((item): item is { key: string; value: string; type: 'text' } => item !== null);

      const productData = {
        name: product.produktname || 'Unbekanntes Produkt',
        articleNumber: product.p_id || '',
        htmlCode: product.produktbeschreibung || '',
        previewText: product.seo_beschreibung || product.kurzbeschreibung || '',
        exactProductName: product.mediamarktname_v1 || product.mediamarktname_v2 || product.produktname || '',
        extractedData: extractedDataArray.length > 0 ? extractedDataArray : undefined,
        customAttributes: [
          { key: 'mediamarktname_v1', value: product.mediamarktname_v1 || '', type: 'text' },
          { key: 'mediamarktname_v2', value: product.mediamarktname_v2 || '', type: 'text' },
          { key: 'seo_titel', value: product.seo_titel || '', type: 'text' },
          { key: 'seo_beschreibung', value: product.seo_beschreibung || '', type: 'text' },
          { key: 'kurzbeschreibung', value: product.kurzbeschreibung || '', type: 'text' },
        ].filter(attr => attr.value),
      };

      try {
        await apiRequest('POST', `/api/projects/${projectId}/products`, productData);
        savedCount++;
      } catch (error) {
        console.error('Failed to save product:', error);
      }
    }
    return savedCount;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card border-b border-card-border shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 py-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            PIMPilot
          </h1>
          <p className="text-sm text-muted-foreground">
            Automatische PIM-Daten Generierung • AI-gestützte Produktbeschreibungen • MediaMarkt-konforme Titel • CSV Massenverarbeitung
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

        {successMessage && (
          <Alert className="mb-6 bg-chart-2/10 border-chart-2 text-chart-2">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription className="ml-2">{successMessage}</AlertDescription>
          </Alert>
        )}

        {!file && !processing && bulkProducts.length === 0 && (
          <Card
            className={`p-8 transition-colors ${
              isDragging ? 'border-primary bg-accent/50' : ''
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="flex flex-col items-center justify-center gap-6 min-h-[400px]">
              <div className="p-6 rounded-full bg-primary/10">
                <Upload className="w-12 h-12 text-primary" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-semibold text-foreground">
                  CSV-Datei hochladen
                </h2>
                <p className="text-muted-foreground max-w-md">
                  Laden Sie Ihre Produktdaten-CSV hoch und generieren Sie automatisch vollständige PIM-Attribute mit AI
                </p>
              </div>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload">
                <Button asChild size="lg">
                  <span className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    Datei auswählen
                  </span>
                </Button>
              </label>
            </div>
          </Card>
        )}

        {/* Schritt 1 & 2: CSV eingelesen - zeige Rohdaten + Live-Updates während AI-Generierung */}
        {rawData.length > 0 && bulkProducts.length < rawData.length && (
          <div className="space-y-6">
            {/* Button Card (nur wenn noch nicht gestartet) */}
            {!processing && bulkProducts.length === 0 && (
              <Card className="p-8">
                <div className="flex flex-col items-center justify-center gap-6">
                  <CheckCircle2 className="w-16 h-16 text-chart-2" />
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl font-bold text-foreground">
                      CSV erfolgreich eingelesen
                    </h2>
                    <p className="text-lg text-muted-foreground">
                      {rawData.length} Produkte bereit zur Verarbeitung
                    </p>
                  </div>
                  <Button
                    size="lg"
                    onClick={startAIGeneration}
                    className="px-8 py-6 text-lg"
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    AI Beschreibungen generieren ({rawData.length} Produkte)
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Die AI-Generierung benötigt ca. {Math.round(rawData.length * 8 / 60)} Minuten
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFile(null);
                      setRawData([]);
                      setBulkProducts([]);
                      setSuccessMessage("");
                      setError("");
                    }}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Zurück
                  </Button>
                </div>
              </Card>
            )}

            {/* Progress Bar während Generierung */}
            {processing && (
              <Card className="p-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
                          PIM-Daten werden generiert...
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {bulkProducts.length} von {rawData.length} Produkten fertig ({progress}%)
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={cancelGeneration}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Abbrechen
                    </Button>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </Card>
            )}

            {/* CSV Rohdaten Vorschau mit KI-Feldern */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                CSV Vorschau ({rawData.length} Zeilen) + KI-Felder {processing && '🔄'}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-muted">
                      {/* CSV Spalten */}
                      {Object.keys(rawData[0] || {}).map((header) => (
                        <th
                          key={header}
                          className="px-2 py-1 text-left font-semibold text-foreground border border-border whitespace-nowrap"
                        >
                          {header}
                        </th>
                      ))}
                      {/* KI-generierte Spalten */}
                      <th className="px-2 py-1 text-left font-semibold text-primary border border-border whitespace-nowrap bg-primary/10">
                        🤖 Produktname Neu
                      </th>
                      <th className="px-2 py-1 text-left font-semibold text-primary border border-border whitespace-nowrap bg-primary/10">
                        🤖 MediaMarkt V1
                      </th>
                      <th className="px-2 py-1 text-left font-semibold text-primary border border-border whitespace-nowrap bg-primary/10">
                        🤖 MediaMarkt V2
                      </th>
                      <th className="px-2 py-1 text-left font-semibold text-primary border border-border whitespace-nowrap bg-primary/10">
                        🤖 SEO Beschreibung
                      </th>
                      <th className="px-2 py-1 text-left font-semibold text-primary border border-border whitespace-nowrap bg-orange-500/20">
                        🔑 Keywords
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawData.slice(0, 15).map((row, index) => {
                      const generatedProduct = bulkProducts.find(p => p.id === index + 1);
                      
                      return (
                        <tr
                          key={index}
                          className={index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}
                        >
                          {/* CSV Daten */}
                          {Object.values(row).map((value, cellIndex) => (
                            <td
                              key={cellIndex}
                              className="px-2 py-1 text-foreground border border-border"
                            >
                              <span className="line-clamp-2">{value || '-'}</span>
                            </td>
                          ))}
                          {/* KI-Spalten */}
                          <td className="px-2 py-1 border border-border bg-green-500/10 text-foreground">
                            {generatedProduct ? (
                              <span className="line-clamp-2 font-medium text-green-700 dark:text-green-400">{generatedProduct.produktname_neu || '-'}</span>
                            ) : (
                              <span className="text-muted-foreground italic text-xs">wird generiert...</span>
                            )}
                          </td>
                          <td className="px-2 py-1 border border-border bg-primary/5 text-foreground">
                            {generatedProduct ? (
                              <span className="line-clamp-1 font-medium">{generatedProduct.mediamarktname_v1}</span>
                            ) : (
                              <span className="text-muted-foreground italic text-xs">wird generiert...</span>
                            )}
                          </td>
                          <td className="px-2 py-1 border border-border bg-primary/5 text-foreground">
                            {generatedProduct ? (
                              <span className="line-clamp-1 font-medium">{generatedProduct.mediamarktname_v2}</span>
                            ) : (
                              <span className="text-muted-foreground italic text-xs">wird generiert...</span>
                            )}
                          </td>
                          <td className="px-2 py-1 border border-border bg-primary/5 text-foreground">
                            {generatedProduct ? (
                              <span className="line-clamp-1 text-xs">{generatedProduct.seo_beschreibung}</span>
                            ) : (
                              <span className="text-muted-foreground italic text-xs">wird generiert...</span>
                            )}
                          </td>
                          <td className="px-2 py-1 border border-border bg-orange-500/10 text-foreground max-w-xs">
                            {generatedProduct ? (
                              <span className="line-clamp-2 text-xs text-orange-700 dark:text-orange-400">{generatedProduct.seo_keywords || '-'}</span>
                            ) : (
                              <span className="text-muted-foreground italic text-xs">wird generiert...</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rawData.length > 15 && (
                <p className="text-sm text-muted-foreground mt-4 text-center">
                  Zeige erste 15 von {rawData.length} Zeilen
                </p>
              )}
            </Card>
          </div>
        )}

        {bulkProducts.length > 0 && !processing && (
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Verarbeitete Produkte</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    <span className="font-medium text-foreground">{bulkProducts.length}</span> • 
                    Dateiname: <span className="font-mono text-xs">{file?.name}</span>
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowColumnSelector(!showColumnSelector)}
                  >
                    <Settings2 className="w-4 h-4 mr-2" />
                    Spalten auswählen
                  </Button>
                  <Button
                    onClick={() => setShowSaveDialog(true)}
                    disabled={bulkProducts.length === 0}
                    size="sm"
                    variant="default"
                  >
                    <FolderPlus className="w-4 h-4 mr-2" />
                    Als Projekt speichern
                  </Button>
                  <Button
                    onClick={handleDownload}
                    disabled={bulkProducts.length === 0}
                    size="sm"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    CSV Exportieren
                  </Button>
                  <Button
                    variant="outline"
                    onClick={reset}
                    size="sm"
                  >
                    Zurücksetzen
                  </Button>
                </div>
              </div>

              {showColumnSelector && (
                <div className="mt-6 p-4 bg-muted/30 rounded-lg border">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold">Spalten für Export auswählen</h3>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleAllColumns(true)}
                      >
                        Alle auswählen
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleAllColumns(false)}
                      >
                        Alle abwählen
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {exportColumns.map(col => (
                      <div key={col.key} className="flex items-center space-x-2">
                        <Checkbox
                          id={`col-${col.key}`}
                          checked={col.enabled}
                          onCheckedChange={() => toggleColumn(col.key)}
                        />
                        <Label
                          htmlFor={`col-${col.key}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {col.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <BulkDescriptionTable
              products={bulkProducts}
              onUpdateProduct={handleUpdateProduct}
              onPreviewHtml={(html, productName) => {
                setHtmlPreviewContent(html);
                setHtmlPreviewProductName(productName || 'Unbekanntes Produkt');
                setShowHtmlPreview(true);
              }}
            />
          </div>
        )}
      </main>

      {/* Dialog zum Projekt speichern */}
      <Dialog open={showSaveDialog} onOpenChange={(open) => {
        setShowSaveDialog(open);
        if (!open) {
          setProjectName("");
          setSelectedProjectId("new");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Als Projekt speichern</DialogTitle>
            <DialogDescription>
              Speichern Sie alle {bulkProducts.length} Produkte in "Meine Projekte" für spätere Bearbeitung
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="project-select" className="mb-2 block">
                Projekt wählen
              </Label>
              <Select
                value={selectedProjectId}
                onValueChange={setSelectedProjectId}
                disabled={savingProject}
              >
                <SelectTrigger id="project-select">
                  <SelectValue placeholder="Projekt auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">
                    <div className="flex items-center">
                      <FolderPlus className="w-4 h-4 mr-2" />
                      Neues Projekt erstellen
                    </div>
                  </SelectItem>
                  {existingProjects.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        Bestehende Projekte
                      </div>
                      {existingProjects.map(project => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedProjectId === "new" && (
              <div>
                <Label htmlFor="project-name" className="mb-2 block">
                  Name für neues Projekt
                </Label>
                <Input
                  id="project-name"
                  placeholder="z.B. Akku-Import November 2024"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !savingProject) {
                      handleSaveToProject();
                    }
                  }}
                  disabled={savingProject}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowSaveDialog(false);
                setProjectName("");
                setSelectedProjectId("new");
              }}
              disabled={savingProject}
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleSaveToProject}
              disabled={savingProject || (selectedProjectId === "new" && !projectName.trim())}
            >
              {savingProject ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Speichere...
                </>
              ) : selectedProjectId === "new" ? (
                <>
                  <FolderPlus className="w-4 h-4 mr-2" />
                  Projekt erstellen
                </>
              ) : (
                <>
                  <FolderPlus className="w-4 h-4 mr-2" />
                  Zu Projekt hinzufügen
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog für HTML-Vorschau */}
      <Dialog open={showHtmlPreview} onOpenChange={setShowHtmlPreview}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Akkushop Vorschau: {htmlPreviewProductName}</DialogTitle>
                <DialogDescription>
                  So wird das Produkt in Akkushop (BrickFox) dargestellt
                </DialogDescription>
              </div>
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <Button
                  variant={!isMobilePreview ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setIsMobilePreview(false)}
                  className="h-8 px-3"
                >
                  <Monitor className="w-4 h-4" />
                </Button>
                <Button
                  variant={isMobilePreview ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setIsMobilePreview(true)}
                  className="h-8 px-3"
                >
                  <Smartphone className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className={`flex justify-center ${isMobilePreview ? '' : 'overflow-auto max-h-[75vh]'}`}>
            <div 
              className={`border rounded-lg bg-white transition-all duration-300 ${
                isMobilePreview 
                  ? 'w-[375px] h-[667px] shadow-xl rounded-[2rem] border-4 border-slate-400 overflow-y-auto' 
                  : 'w-full p-6'
              }`}
            >
              <div className={`prose prose-sm max-w-none text-gray-700 ${isMobilePreview ? 'p-4' : ''}`}>
                <div dangerouslySetInnerHTML={{ __html: htmlPreviewContent }} />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
