import { useState, useEffect, useRef } from "react";
import { Upload, Download, FileText, CheckCircle2, Loader2, AlertTriangle, Settings2, FolderPlus, Sparkles, Eye, Monitor, Smartphone, ArrowLeft, XCircle, Languages, RefreshCw, Copy, Search, Filter, X } from "lucide-react";
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
  p_item_number: string;
  produktname: string;
  produktname_neu: string;
  produktname_csv_original: string; // Vollständiger Original-Name aus CSV
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
  akku_mah?: string;
  akku_v?: string;
  akku_wh?: string;
  akku_ch?: string;
  farbe?: string;
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
  const [previewFilter, setPreviewFilter] = useState<string>('');
  const [previewPidFilter, setPreviewPidFilter] = useState<string>('');
  const [showPreviewColumnSelector, setShowPreviewColumnSelector] = useState(false);
  const [visibleKiColumns, setVisibleKiColumns] = useState<string[]>(['produktname_neu', 'mediamarkt_v1', 'mediamarkt_v2', 'seo_beschreibung', 'keywords']);
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
  const [isTranslating, setIsTranslating] = useState(false);
  const [exportFileName, setExportFileName] = useState<string>("");
  
  // Filter für bereits generierte Produkte (zum selektiven Regenerieren)
  const [productFilter, setProductFilter] = useState<string>('');
  const [regeneratePrompt, setRegeneratePrompt] = useState<string>('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateProgress, setRegenerateProgress] = useState({ current: 0, total: 0 });
  
  // Timer für Generierungsdauer
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [avgTimePerProduct, setAvgTimePerProduct] = useState<number>(0);
  
  // Statistiken nach Abschluss
  const [generationStats, setGenerationStats] = useState<{
    totalTime: number;
    avgPerProduct: number;
    productCount: number;
    translationTime?: number;
  } | null>(null);
  
  // Abbruch-Referenz für die AI-Generierung
  const abortRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Lade bestehende Projekte
  const { data: projectsData } = useQuery<{ success: boolean; projects: Project[] }>({
    queryKey: ['/api/projects'],
    enabled: showSaveDialog,
  });

  const existingProjects = projectsData?.projects || [];
  
  const [exportColumns, setExportColumns] = useState<ExportColumn[]>([
    // Standard-Export-Reihenfolge: p_id, p_name[de], p_name[nl], p_description[de], p_description[nl]
    { key: 'p_id', label: 'p_id', enabled: true },
    { key: 'produktname_neu', label: 'p_name[de]', enabled: true },
    { key: 'produktname_nl', label: 'p_name[nl]', enabled: true },
    { key: 'produktbeschreibung_html', label: 'p_description[de]', enabled: true },
    { key: 'produktbeschreibung_html_nl', label: 'p_description[nl]', enabled: true },
    // Zusätzliche optionale Spalten
    { key: 'v_id', label: 'v_id', enabled: false },
    { key: 'p_item_number', label: 'p_item_number', enabled: false },
    { key: 'produktname', label: 'p_name_original[de]', enabled: false },
    { key: 'produktbeschreibung', label: 'p_description_text[de]', enabled: false },
    { key: 'produktbeschreibung_original', label: 'p_description_original[de]', enabled: false },
    { key: 'mediamarktname_v1', label: 'p_mediamarkt_v1', enabled: false },
    { key: 'mediamarktname_v2', label: 'p_mediamarkt_v2', enabled: false },
    { key: 'seo_beschreibung', label: 'p_seo_description[de]', enabled: false },
    { key: 'seo_keywords', label: 'p_seo_keywords[de]', enabled: false },
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

  // Bei Änderungen: Daten in sessionStorage speichern (nur für kleine Datensätze)
  useEffect(() => {
    if (bulkProducts.length > 0 && bulkProducts.length <= 50) {
      try {
        sessionStorage.setItem(SESSION_KEY_PRODUCTS, JSON.stringify(bulkProducts));
        sessionStorage.setItem(SESSION_KEY_RAW_DATA, JSON.stringify(rawData));
        if (file) {
          sessionStorage.setItem(SESSION_KEY_FILE_NAME, file.name);
        }
      } catch (e) {
        console.warn('[CSV] SessionStorage quota exceeded, skipping cache');
        sessionStorage.removeItem(SESSION_KEY_PRODUCTS);
        sessionStorage.removeItem(SESSION_KEY_RAW_DATA);
        sessionStorage.removeItem(SESSION_KEY_FILE_NAME);
      }
    } else if (bulkProducts.length > 50) {
      sessionStorage.removeItem(SESSION_KEY_PRODUCTS);
      sessionStorage.removeItem(SESSION_KEY_RAW_DATA);
      sessionStorage.removeItem(SESSION_KEY_FILE_NAME);
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
    setBulkProducts([]); // Liste zurücksetzen für neuen Durchlauf
    
    // Timer starten
    const startTime = Date.now();
    setGenerationStartTime(startTime);
    setElapsedTime(0);
    setAvgTimePerProduct(0);
    
    // Timer-Intervall für Live-Update
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    
    try {
      await generateDescriptions(rawData);
    } catch (err) {
      console.error('Generierungsfehler:', err);
      if (!abortRef.current) {
        setError(err instanceof Error ? err.message : 'Fehler bei der AI-Generierung');
      }
    } finally {
      // Timer stoppen
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const totalTime = (Date.now() - startTime) / 1000;
      setElapsedTime(Math.floor(totalTime));
      setProcessing(false);
      
      // Statistiken speichern
      const productCount = bulkProducts.length || rawData.length;
      if (productCount > 0 && !abortRef.current) {
        setGenerationStats({
          totalTime: Math.round(totalTime),
          avgPerProduct: Math.round((totalTime / productCount) * 10) / 10,
          productCount: productCount,
        });
      }
    }
  };
  
  const cancelGeneration = () => {
    abortRef.current = true;
    // Timer stoppen
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setProcessing(false);
    toast({
      title: "Abgebrochen",
      description: `Generierung abgebrochen. ${bulkProducts.length} Produkte wurden bereits verarbeitet.`,
    });
  };

  const generateDescriptions = async (data: RawCSVRow[]) => {
    const BATCH_SIZE = 15; // 15 parallele Anfragen für schnellere Generierung
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

          // Funktion zum Extrahieren des Produktnamens aus der Beschreibung
          const extractProductNameFromDescription = (desc: string): string => {
            if (!desc) return 'Unbekanntes Produkt';
            // Suche nach "Das [Produktname]" am Anfang des Texts
            const dasMatch = desc.match(/<p>Das\s+([^<]+?)\s+(bietet|ermöglicht|ist|sorgt|verfügt|garantiert|liefert|zeichnet)/i);
            if (dasMatch && dasMatch[1].length > 5 && dasMatch[1].length < 80) {
              return dasMatch[1].trim();
            }
            // Suche nach "Der/Die [Produktname]" am Anfang
            const derDieMatch = desc.match(/<p>(?:Der|Die)\s+([^<]+?)\s+(bietet|ermöglicht|ist|sorgt|verfügt|garantiert|liefert|zeichnet)/i);
            if (derDieMatch && derDieMatch[1].length > 5 && derDieMatch[1].length < 80) {
              return derDieMatch[1].trim();
            }
            // Suche in <strong> Tags nach Produktnamen
            const strongMatch = desc.match(/<strong>([^<]{5,60})<\/strong>/);
            if (strongMatch) {
              return strongMatch[1].trim();
            }
            return 'Unbekanntes Produkt';
          };

          // Produktname aus verschiedenen möglichen Spalten lesen (inklusive BrickFox Format)
          const existingDescription = row['p_description[de]'] || row['P Description[de]'] || 
                                      row['p_description'] || row['beschreibung'] || '';
          
          const rawProduktname =
            productData.produktname ||
            productData.bezeichnung ||
            productData.name ||
            productData['p_name_de'] ||
            productData['p_name[de]'] ||
            row['p_name[de]'] ||
            row['P_name[de]'] ||
            row['Produktname'] ||
            row['Bezeichnung'] ||
            row['Name'] ||
            row['produktname'] ||
            row['bezeichnung'] ||
            row['P Name[de]'] ||
            row['P Name de'] ||
            extractProductNameFromDescription(existingDescription);

          // Bereinige abgeschnittene Produktnamen
          // z.B. "Apple Akku für iPhone 4 – ersetzt." → "Apple Ersatzakku für iPhone 4"
          // z.B. "Apple Earpiece Hörmuschel für iPhone 6 Plus – passend für..." → "Apple Earpiece Hörmuschel für iPhone 6 Plus"
          const cleanProductName = (name: string): string => {
            // Entferne abgeschnittene Endungen wie "– ersetzt.", "– passend für...", "– passend für", etc.
            let cleaned = name
              .replace(/\s*[–-]\s*(ersetzt\.?|passend für\.{0,3}|passend\s*für\s*\.{0,3}|kompatibel mit\.{0,3})\s*$/i, '')
              .replace(/\s*[–-]\s*\.{2,}$/, '') // Entferne "– ..."
              .replace(/\s*\.{3}$/, '') // Entferne "..." am Ende
              .trim();
            
            // Wenn "– ersetzt" entfernt wurde, füge "Ersatz" vor dem Produkttyp ein
            // z.B. "Apple Akku für iPhone 4" → "Apple Ersatzakku für iPhone 4"
            if (name.toLowerCase().includes('– ersetzt') || name.toLowerCase().includes('- ersetzt')) {
              // Finde Produkttypen und füge "Ersatz" davor
              cleaned = cleaned.replace(/\b(Akku|Batterie|Display|Screen|Ladekabel|Kabel)\b/i, (match) => {
                return 'Ersatz' + match.toLowerCase();
              });
            }
            
            return cleaned;
          };
          
          const produktname = cleanProductName(rawProduktname);

          productData.productName = produktname;

          // Bestehende Bulletpoints aus CSV extrahieren (falls vorhanden)
          const existingBullets: string[] = [];
          // Suche nach p_bullet1, p_bullet2, etc. oder ähnlichen Feldern
          for (let bulletNum = 1; bulletNum <= 10; bulletNum++) {
            const bullet = row[`p_bullet${bulletNum}`] || row[`p_usp${bulletNum}`] || 
                          row[`bullet${bulletNum}`] || row[`usp${bulletNum}`] ||
                          productData[`p_bullet${bulletNum}`] || productData[`bullet${bulletNum}`];
            if (bullet && bullet.trim()) {
              existingBullets.push(bullet.trim());
            }
          }
          // Auch "vorteile" oder "features" als einzelnes Feld (kommasepariert)
          const vorteileFeld = row['vorteile'] || row['features'] || row['p_features'] || 
                              productData['vorteile'] || productData['features'] || '';
          if (vorteileFeld) {
            const splitBullets = vorteileFeld.split(/[,;|]/).map((b: string) => b.trim()).filter((b: string) => b.length > 3);
            existingBullets.push(...splitBullets);
          }
          
          // Füge existierende Bullets zu productData hinzu
          if (existingBullets.length > 0) {
            productData.existingBullets = existingBullets.join('|');
            console.log(`📋 ${existingBullets.length} bestehende Bulletpoints gefunden für: ${produktname}`);
          }
          
          // Kompatibilität 1:1 aus CSV-Spalten extrahieren (WICHTIG: Alle Modelle übernehmen!)
          // Suche in verschiedenen CSV-Spalten nach Kompatibilitätsdaten
          const csvKompatibilitaet = 
            row['p_attributes[akku1][de]'] || row['v_attributes[akku1][de]'] ||
            row['p_attributes[kompatibilitaet][de]'] || row['v_attributes[kompatibilitaet][de]'] ||
            row['p_attributes[passend_fuer][de]'] || row['v_attributes[passend_fuer][de]'] ||
            row['p_group_part[de]'] || row['v_group_part[de]'] ||
            row['kompatibilitaet'] || row['compatible_models'] || row['passend_fuer'] || '';
          
          if (csvKompatibilitaet && csvKompatibilitaet.trim()) {
            console.log(`📋 Kompatibilität direkt aus CSV: ${csvKompatibilitaet.substring(0, 100)}...`);
          }

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
              customAttributes: { 
                exactProductName: produktname,
                existingBullets: existingBullets.length > 0 ? existingBullets : undefined,
                existingDescription: existingDescription, // Bestehende Beschreibung als Basis
                csvKompatibilitaet: csvKompatibilitaet.trim() || undefined // 1:1 aus CSV
              },
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
            p_item_number: artikelnummer,
            produktname: produktname,
            produktname_neu: limitModelsInName(produktname), // Modelle auf max. 2 begrenzen
            produktname_csv_original: rawProduktname, // Vollständiger Original-Name aus CSV
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
            akku_mah: row['p_attributes[akku_mah][de]'] || '',
            akku_v: row['p_attributes[akku_v][de]'] || '',
            akku_wh: row['p_attributes[akku_wh][de]'] || '',
            akku_ch: row['p_attributes[akku_ch][de]'] || '',
            farbe: row['p_attributes[farbe][de]'] || '',
          } satisfies BulkProduct;
        })
      );

      const batchResults: BulkProduct[] = [];
      settled.forEach((outcome, batchIndex) => {
        const globalIndex = i + batchIndex;
        processedCount += 1;
        setProgress(Math.round((processedCount / total) * 100));

        if (outcome.status === 'fulfilled') {
          results[globalIndex] = outcome.value;
          if (outcome.value) batchResults.push(outcome.value);
        } else {
          console.error(`Error processing row ${globalIndex}:`, outcome.reason);
          const errorProduct = {
            id: globalIndex + 1,
            p_id: '-',
            v_id: '-',
            p_item_number: '',
            produktname: 'Fehler',
            produktname_neu: '',
            produktname_csv_original: '',
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
          results[globalIndex] = errorProduct;
          batchResults.push(errorProduct);
        }
      });
      
      // Inkrementell nach jedem Batch aktualisieren für Echtzeit-Fortschritt
      setBulkProducts(prev => [...prev, ...batchResults]);
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

  // Begrenzt Modellnummern im Produktnamen auf maximal 2
  const limitModelsInName = (text: string): string => {
    if (!text) return text;
    
    // Finde "für" Position - Modelle kommen danach
    const fuerMatch = text.match(/\b(für|for)\s+/i);
    if (!fuerMatch || fuerMatch.index === undefined) return text;
    
    const prefix = text.substring(0, fuerMatch.index + fuerMatch[0].length);
    const afterFuer = text.substring(fuerMatch.index + fuerMatch[0].length);
    
    // Teile bei Kommas auf
    const parts = afterFuer.split(/,\s*/);
    
    // Finde wo "wie" oder "–" beginnt (technische Daten)
    let wieIndex = -1;
    for (let i = 0; i < parts.length; i++) {
      if (/^(wie|–)\s*/i.test(parts[i].trim())) {
        wieIndex = i;
        break;
      }
    }
    
    // Modell-Teile sind vor "wie"/"–", technische Teile sind danach
    const modelParts = wieIndex >= 0 ? parts.slice(0, wieIndex) : parts;
    const techParts = wieIndex >= 0 ? parts.slice(wieIndex) : [];
    
    // Wenn 2 oder weniger Modell-Teile, nichts ändern
    if (modelParts.length <= 2) return text;
    
    // Nur erste 2 Modell-Teile behalten
    const limitedModels = modelParts.slice(0, 2);
    
    // Zusammenbauen: Prefix + 2 Modelle + technische Teile
    let result = prefix + limitedModels.join(', ');
    if (techParts.length > 0) {
      result += ', ' + techParts.join(', ');
    }
    
    // Bereinigen
    result = result.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
    
    console.log(`✂️ SEO-Modelle begrenzt: "${text.substring(0, 60)}..." → "${result.substring(0, 60)}..."`);
    return result;
  };

  // Bereinigt den SEO-Produktnamen: EMCOM entfernen, Wh/mAh entfernen, APN entfernen, Volt hinzufügen, Modelle begrenzen
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
    
    // HINWEIS: Kleine mAh-Werte (z.B. 15-80 mAh) sind bei CMOS-Batterien korrekt
    // Keine automatische Filterung - CSV-Daten sind valide
    
    // Modellnummern auf maximal 2 begrenzen
    cleaned = limitModelsInName(cleaned);
    
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

  // Bereinigt die Produktbeschreibung
  const cleanDescription = (html: string): string => {
    if (!html) return '';
    let cleaned = html;
    
    // HINWEIS: Kleine mAh/Wh-Werte (z.B. 15-80 mAh) sind bei CMOS-Batterien korrekt
    // Backend liefert validierte Daten - keine automatische Filterung
    
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
      
      // Produkte filtern: Nur mit gültiger Beschreibung UND Produktname
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
          let value = product[col.key as keyof BulkProduct];
          
          // Fallback: Wenn produktname_neu leer ist, Original-Produktname verwenden
          if (col.key === 'produktname_neu' && (!value || String(value).trim() === '')) {
            value = product.produktname || product.produktname_csv_original || '';
          }
          
          const strValue = typeof value === 'string' ? value : String(value);
          return decodeHtmlEntities(strValue);
        });
      });

      const csvContent = [
        headers.map(h => `"${h}"`).join(';'),
        ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(';'))
      ].join('\n');

      // UTF-8 ohne BOM für Brickfox
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      const baseName = exportFileName.trim() || file?.name?.replace('.csv', '') || 'produktbeschreibungen';
      link.download = `${baseName}_${new Date().toISOString().split('T')[0]}.csv`;
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

  // Gefilterte Produkte berechnen
  const filteredProducts = productFilter.trim()
    ? bulkProducts.filter(p => 
        p.produktname.toLowerCase().includes(productFilter.toLowerCase()) ||
        p.produktname_neu.toLowerCase().includes(productFilter.toLowerCase()) ||
        p.produktbeschreibung.toLowerCase().includes(productFilter.toLowerCase())
      )
    : bulkProducts;

  // Selektives Regenerieren nur für gefilterte Produkte
  const handleRegenerateFiltered = async () => {
    if (filteredProducts.length === 0) {
      toast({
        title: "Keine Produkte gefunden",
        description: "Bitte Filter anpassen",
        variant: "destructive",
      });
      return;
    }

    if (!regeneratePrompt.trim()) {
      toast({
        title: "Prompt fehlt",
        description: "Bitte beschreiben Sie, was geändert werden soll",
        variant: "destructive",
      });
      return;
    }

    setIsRegenerating(true);
    setRegenerateProgress({ current: 0, total: filteredProducts.length });
    let updated = 0;
    let processed = 0;

    try {
      for (const product of filteredProducts) {
        if (abortRef.current) break;

        try {
          const token = localStorage.getItem('authToken') || 'local-admin-token-pimpilot-dev';
          
          const response = await fetch('/api/adjust-description', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              produktname: product.produktname,
              produktnameNeu: product.produktname_neu,
              existingDescription: product.produktbeschreibung_html,
              adjustmentPrompt: regeneratePrompt.trim()
            })
          });

          if (response.ok) {
            const result = await response.json();
            
            setBulkProducts(prev =>
              prev.map(p =>
                p.id === product.id
                  ? { 
                      ...p, 
                      produktbeschreibung_html: result.description || p.produktbeschreibung_html,
                      produktbeschreibung: result.descriptionText || p.produktbeschreibung
                    }
                  : p
              )
            );
            updated++;
          }
        } catch (err) {
          console.error(`Fehler bei Produkt ${product.id}:`, err);
        }
        
        processed++;
        setRegenerateProgress({ current: processed, total: filteredProducts.length });
      }

      toast({
        title: "Regenerierung abgeschlossen",
        description: `${updated} von ${filteredProducts.length} Produkten aktualisiert`,
      });
    } catch (err) {
      toast({
        title: "Fehler",
        description: "Fehler bei der Regenerierung",
        variant: "destructive",
      });
    } finally {
      setIsRegenerating(false);
      setRegenerateProgress({ current: 0, total: 0 });
    }
  };

  // NL-Übersetzung für alle Produkte (on-demand)
  const handleTranslateAll = async () => {
    const productsToTranslate = bulkProducts.filter(p => 
      (p.produktname_neu && !p.produktname_nl) || 
      (p.produktbeschreibung_html && !p.produktbeschreibung_html_nl)
    );

    if (productsToTranslate.length === 0) {
      toast({
        title: "Info",
        description: "Alle Produkte sind bereits übersetzt",
      });
      return;
    }

    setIsTranslating(true);
    const translationStart = Date.now();
    let translated = 0;

    try {
      for (const product of productsToTranslate) {
        try {
          const response = await fetch('/api/translate-product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              produktTitel: product.produktname_neu,
              produktBeschreibung: product.produktbeschreibung_html
            })
          });

          if (response.ok) {
            const result = await response.json();
            
            setBulkProducts(prev =>
              prev.map(p =>
                p.id === product.id
                  ? {
                      ...p,
                      produktname_nl: result.produktTitelNL || p.produktname_nl,
                      produktbeschreibung_nl: result.produktBeschreibungNL || p.produktbeschreibung_nl,
                      produktbeschreibung_html_nl: result.produktBeschreibungNL || p.produktbeschreibung_html_nl
                    }
                  : p
              )
            );
            translated++;
          }
        } catch (err) {
          console.error(`Übersetzungsfehler bei Produkt ${product.id}:`, err);
        }
      }

      const translationTime = Math.round((Date.now() - translationStart) / 1000);
      
      // Übersetzungszeit zu Statistiken hinzufügen
      setGenerationStats(prev => prev ? { ...prev, translationTime } : null);

      toast({
        title: "Erfolg",
        description: `${translated} Produkt(e) übersetzt in ${Math.floor(translationTime / 60)}:${(translationTime % 60).toString().padStart(2, '0')}`,
      });
    } catch (error) {
      console.error('Übersetzungsfehler:', error);
      toast({
        title: "Fehler",
        description: "Fehler bei der Übersetzung",
        variant: "destructive",
      });
    } finally {
      setIsTranslating(false);
    }
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
      const productsToSave = bulkProducts.length > 0 
        ? bulkProducts 
        : rawData.map((row, idx) => {
            const pidKey = Object.keys(row).find(k => k.toLowerCase() === 'p_id') || 'p_id';
            const vidKey = Object.keys(row).find(k => k.toLowerCase() === 'v_id') || 'v_id';
            const itemNumKey = Object.keys(row).find(k => k.toLowerCase() === 'p_item_number') || 'p_item_number';
            const nameKey = Object.keys(row).find(k => k.toLowerCase().includes('p_name[de]')) || 'p_name[de]';
            const nameNlKey = Object.keys(row).find(k => k.toLowerCase().includes('p_name[nl]')) || 'p_name[nl]';
            const descKey = Object.keys(row).find(k => k.toLowerCase().includes('p_description[de]')) || 'p_description[de]';
            const descNlKey = Object.keys(row).find(k => k.toLowerCase().includes('p_description[nl]')) || 'p_description[nl]';
            return {
              id: idx + 1,
              p_id: String(row[pidKey] || ''),
              v_id: String(row[vidKey] || ''),
              p_item_number: String(row[itemNumKey] || ''),
              produktname: String(row[nameKey] || ''),
              produktname_neu: String(row[nameKey] || ''),
              produktbeschreibung_html: String(row[descKey] || ''),
              produktbeschreibung_original: String(row[descKey] || ''),
              produktname_nl: String(row[nameNlKey] || ''),
              produktbeschreibung_html_nl: String(row[descNlKey] || ''),
              ean: String(row['ean'] || row['EAN'] || ''),
              hersteller: String(row['hersteller'] || row['Hersteller'] || row['p_manufacturer'] || ''),
              preis: String(row['preis'] || row['Preis'] || row['p_price'] || ''),
              gewicht: String(row['gewicht'] || row['Gewicht'] || row['p_weight'] || ''),
              kategorie: String(row['kategorie'] || row['Kategorie'] || row['p_category'] || ''),
            };
          });
      
      if (selectedProjectId === "new") {
        const enabledExportColumns = exportColumns
          .filter(col => col.enabled)
          .map(col => ({ key: col.key, label: col.label, enabled: col.enabled }));
        
        await apiRequest('POST', '/api/bulk-save-to-project', {
          projectName: projectName.trim(),
          products: productsToSave,
          sourceType: 'csv-bulk',
          exportColumns: enabledExportColumns,
        });
        
        toast({
          title: "Projekt gespeichert",
          description: `${productsToSave.length} Produkte wurden erfolgreich in "${projectName}" gespeichert`,
        });
      } else {
        const savedCount = await addProductsToExistingProject(selectedProjectId, productsToSave as BulkProduct[]);
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
          <div className="space-y-6">
            {/* Upload-Bereich */}
            <Card
              className={`p-8 transition-colors ${
                isDragging ? 'border-primary bg-accent/50' : ''
              }`}
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
          </div>
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
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-mono font-semibold text-foreground">
                          {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {bulkProducts.length > 0 
                            ? `~${(elapsedTime / bulkProducts.length).toFixed(1)}s/Produkt` 
                            : 'berechne...'}
                        </p>
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
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {bulkProducts.length > 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Geschätzte Restzeit: ~{Math.ceil((rawData.length - bulkProducts.length) * (elapsedTime / bulkProducts.length) / 60)} Min.
                    </p>
                  )}
                </div>
              </Card>
            )}

            {/* CSV Rohdaten Vorschau mit KI-Feldern */}
            <Card className="p-6">
              <div className="flex flex-col gap-4 mb-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h3 className="text-lg font-semibold text-foreground whitespace-nowrap">
                    CSV Vorschau ({rawData.length} Zeilen) + KI-Felder {processing && '🔄'}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => setShowSaveDialog(true)}
                    disabled={rawData.length === 0}
                    size="sm"
                    variant="default"
                  >
                    <FolderPlus className="w-4 h-4 mr-2" />
                    Als Projekt speichern
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPreviewColumnSelector(!showPreviewColumnSelector)}
                  >
                    <Settings2 className="w-4 h-4 mr-2" />
                    Spalten
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      // DeepL Übersetzung für rawData - parallel für Geschwindigkeit
                      const descKey = Object.keys(rawData[0] || {}).find(k => k.toLowerCase().includes('p_description[de]'));
                      const nameKey = Object.keys(rawData[0] || {}).find(k => k.toLowerCase().includes('p_name[de]'));
                      if (!descKey) {
                        toast({ title: "Fehler", description: "Keine p_description[de] Spalte gefunden", variant: "destructive" });
                        return;
                      }
                      
                      const nlDescKey = descKey.replace('[de]', '[nl]');
                      const nlNameKey = nameKey?.replace('[de]', '[nl]');
                      
                      setIsTranslating(true);
                      
                      // Finde Zeilen die übersetzt werden müssen
                      const toTranslate = rawData.map((row, i) => ({ row, index: i }))
                        .filter(({ row }) => !row[nlDescKey] || String(row[nlDescKey]).length < 10);
                      
                      toast({ title: "Starte Übersetzung", description: `${toTranslate.length} Produkte werden übersetzt...` });
                      
                      // Parallel übersetzen in Batches von 10
                      const BATCH_SIZE = 10;
                      let translated = 0;
                      
                      for (let batch = 0; batch < toTranslate.length; batch += BATCH_SIZE) {
                        const batchItems = toTranslate.slice(batch, batch + BATCH_SIZE);
                        
                        const results = await Promise.allSettled(
                          batchItems.map(async ({ row, index }) => {
                            const response = await fetch('/api/translate-product', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                produktTitel: nameKey ? row[nameKey] : '',
                                produktBeschreibung: row[descKey]
                              })
                            });
                            
                            if (response.ok) {
                              const result = await response.json();
                              return { 
                                index, 
                                nlDesc: result.produktBeschreibungNL || '',
                                nlName: result.produktTitelNL || ''
                              };
                            }
                            return null;
                          })
                        );
                        
                        // Update rawData mit den Ergebnissen
                        setRawData(prev => {
                          const updated = [...prev];
                          results.forEach(r => {
                            if (r.status === 'fulfilled' && r.value) {
                              const { index, nlDesc, nlName } = r.value;
                              updated[index] = {
                                ...updated[index],
                                [nlDescKey]: nlDesc,
                                ...(nlNameKey ? { [nlNameKey]: nlName } : {})
                              };
                              translated++;
                            }
                          });
                          return updated;
                        });
                      }
                      
                      setIsTranslating(false);
                      toast({ title: "Übersetzung abgeschlossen", description: `${translated} Produkte übersetzt` });
                    }}
                    disabled={isTranslating}
                  >
                    {isTranslating ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Übersetze...
                      </>
                    ) : (
                      <>
                        <Languages className="w-4 h-4 mr-2" />
                        NL
                      </>
                    )}
                  </Button>
                  <div className="flex items-center gap-1">
                    <Input
                      value={exportFileName}
                      onChange={(e) => setExportFileName(e.target.value)}
                      placeholder={file?.name?.replace('.csv', '') || 'Dateiname'}
                      className="w-32 h-8 text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        // CSV Export für rawData
                        if (rawData.length === 0) return;
                        
                        const headers = Object.keys(rawData[0]);
                        const csvContent = [
                          headers.join(';'),
                          ...rawData.map(row => 
                            headers.map(h => {
                              const val = String(row[h] || '');
                              return `"${val.replace(/"/g, '""')}"`;
                            }).join(';')
                          )
                        ].join('\n');
                        
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        const baseName = exportFileName.trim() || file?.name?.replace('.csv', '') || 'export';
                        a.download = `${baseName}_${new Date().toISOString().split('T')[0]}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                        
                        toast({ title: "Export erfolgreich", description: `${rawData.length} Zeilen exportiert` });
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      <Input
                        value={previewPidFilter}
                        onChange={(e) => setPreviewPidFilter(e.target.value)}
                        placeholder="p_id..."
                        className="w-28 h-8 text-sm pl-7"
                      />
                    </div>
                    <div className="relative">
                      <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      <Input
                        value={previewFilter}
                        onChange={(e) => setPreviewFilter(e.target.value)}
                        placeholder="Suche..."
                        className="w-40 h-8 text-sm pl-7"
                      />
                    </div>
                    {(previewFilter || previewPidFilter) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setPreviewFilter(''); setPreviewPidFilter(''); }}
                        className="h-8 px-2"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  {(previewFilter || previewPidFilter) && (
                    <span className="text-xs text-muted-foreground">
                      {rawData.filter(row => {
                        const pidKey = Object.keys(row).find(k => k.toLowerCase() === 'p_id') || 'p_id';
                        const matchesPid = !previewPidFilter || String(row[pidKey] || '').toLowerCase().includes(previewPidFilter.toLowerCase());
                        const matchesText = !previewFilter || Object.values(row).some(v => String(v).toLowerCase().includes(previewFilter.toLowerCase()));
                        return matchesPid && matchesText;
                      }).length} gefunden
                    </span>
                  )}
                  </div>
                </div>
              </div>

              {/* Spaltenkonfigurator für KI-Spalten */}
              {showPreviewColumnSelector && (
                <div className="mb-4 p-4 bg-muted/30 rounded-lg border">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold">Sichtbare KI-Spalten auswählen</h4>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setVisibleKiColumns(['produktname_neu', 'mediamarkt_v1', 'mediamarkt_v2', 'seo_beschreibung', 'keywords'])}
                      >
                        Alle
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setVisibleKiColumns([])}
                      >
                        Keine
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { key: 'produktname_neu', label: 'Produktname Neu' },
                      { key: 'mediamarkt_v1', label: 'MediaMarkt V1' },
                      { key: 'mediamarkt_v2', label: 'MediaMarkt V2' },
                      { key: 'seo_beschreibung', label: 'SEO Beschreibung' },
                      { key: 'keywords', label: 'Keywords' }
                    ].map(col => (
                      <div key={col.key} className="flex items-center space-x-2">
                        <Checkbox
                          id={`ki-col-${col.key}`}
                          checked={visibleKiColumns.includes(col.key)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setVisibleKiColumns(prev => [...prev, col.key]);
                            } else {
                              setVisibleKiColumns(prev => prev.filter(c => c !== col.key));
                            }
                          }}
                        />
                        <Label
                          htmlFor={`ki-col-${col.key}`}
                          className="text-sm cursor-pointer"
                        >
                          {col.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="table-scroll-visible max-h-[600px] border rounded-lg" style={{ scrollbarWidth: 'auto', scrollbarColor: '#888 #f1f1f1' }}>
                <table className="w-full border-collapse text-xs min-w-max">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-muted">
                      {/* CSV Spalten - nur p_id, p_name[de/nl], p_description[de/nl] */}
                      {['p_id', 'p_name[de]', 'p_name[nl]', 'p_description[de]', 'p_description[nl]']
                        .filter(col => Object.keys(rawData[0] || {}).some(k => k.toLowerCase() === col.toLowerCase() || k.includes(col)))
                        .map((header) => {
                          const actualKey = Object.keys(rawData[0] || {}).find(k => k.toLowerCase() === header.toLowerCase() || k.includes(header)) || header;
                          return (
                            <th
                              key={actualKey}
                              className="px-2 py-1 text-left font-semibold text-foreground border border-border whitespace-nowrap bg-muted"
                            >
                              {actualKey}
                            </th>
                          );
                        })}
                      {/* KI-generierte Spalten - nur sichtbare */}
                      {visibleKiColumns.includes('produktname_neu') && (
                        <th className="px-2 py-1 text-left font-semibold text-primary border border-border whitespace-nowrap bg-primary/10">
                          🤖 Produktname Neu
                        </th>
                      )}
                      {visibleKiColumns.includes('mediamarkt_v1') && (
                        <th className="px-2 py-1 text-left font-semibold text-primary border border-border whitespace-nowrap bg-primary/10">
                          🤖 MediaMarkt V1
                        </th>
                      )}
                      {visibleKiColumns.includes('mediamarkt_v2') && (
                        <th className="px-2 py-1 text-left font-semibold text-primary border border-border whitespace-nowrap bg-primary/10">
                          🤖 MediaMarkt V2
                        </th>
                      )}
                      {visibleKiColumns.includes('seo_beschreibung') && (
                        <th className="px-2 py-1 text-left font-semibold text-primary border border-border whitespace-nowrap bg-primary/10">
                          🤖 SEO Beschreibung
                        </th>
                      )}
                      {visibleKiColumns.includes('keywords') && (
                        <th className="px-2 py-1 text-left font-semibold text-primary border border-border whitespace-nowrap bg-orange-500/20">
                          🔑 Keywords
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const filteredRawData = rawData.filter(row => {
                        const pidKey = Object.keys(row).find(k => k.toLowerCase() === 'p_id') || 'p_id';
                        const matchesPid = !previewPidFilter || String(row[pidKey] || '').toLowerCase().includes(previewPidFilter.toLowerCase());
                        const matchesText = !previewFilter || Object.values(row).some(v => String(v).toLowerCase().includes(previewFilter.toLowerCase()));
                        return matchesPid && matchesText;
                      });
                      
                      return filteredRawData.map((row, filteredIndex) => {
                        const originalIndex = rawData.indexOf(row);
                        const generatedProduct = bulkProducts.find(p => p.id === originalIndex + 1);
                      
                        return (
                          <tr
                            key={filteredIndex}
                            className={filteredIndex % 2 === 0 ? 'bg-background' : 'bg-muted/30'}
                          >
                          {/* CSV Daten - nur p_id, p_name[de/nl], p_description[de/nl] */}
                          {['p_id', 'p_name[de]', 'p_name[nl]', 'p_description[de]', 'p_description[nl]']
                            .map(col => {
                              const actualKey = Object.keys(row).find(k => k.toLowerCase() === col.toLowerCase() || k.includes(col));
                              if (!actualKey) return null;
                              const value = row[actualKey];
                              const isDescriptionCol = actualKey.toLowerCase().includes('p_description');
                              const htmlContent = String(value || '');
                              
                              return (
                                <td
                                  key={actualKey}
                                  className="px-2 py-1 text-foreground border border-border"
                                >
                                  {isDescriptionCol && htmlContent.length > 10 ? (
                                    <div className="flex items-center gap-1">
                                      <span className="line-clamp-2 flex-1 text-xs">{htmlContent.substring(0, 60)}...</span>
                                      <div className="flex gap-0.5 shrink-0">
                                        <button
                                          onClick={() => {
                                            setHtmlPreviewContent(htmlContent);
                                            setHtmlPreviewProductName(row['p_name[de]'] || row['produktname'] || 'Produkt');
                                            setShowHtmlPreview(true);
                                          }}
                                          className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                                          title="HTML Vorschau"
                                        >
                                          <Eye className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={() => {
                                            navigator.clipboard.writeText(htmlContent);
                                            toast({ title: "Kopiert", description: "HTML in Zwischenablage" });
                                          }}
                                          className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                                          title="HTML kopieren"
                                        >
                                          <Copy className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="line-clamp-2">{value || '-'}</span>
                                  )}
                                </td>
                              );
                            }).filter(Boolean)}
                          {/* KI-Spalten - nur sichtbare */}
                          {visibleKiColumns.includes('produktname_neu') && (
                            <td className="px-2 py-1 border border-border bg-green-500/10 text-foreground">
                              {generatedProduct ? (
                                <span className="line-clamp-2 font-medium text-green-700 dark:text-green-400">{generatedProduct.produktname_neu || '-'}</span>
                              ) : (
                                <span className="text-muted-foreground italic text-xs">wird generiert...</span>
                              )}
                            </td>
                          )}
                          {visibleKiColumns.includes('mediamarkt_v1') && (
                            <td className="px-2 py-1 border border-border bg-primary/5 text-foreground">
                              {generatedProduct ? (
                                <span className="line-clamp-1 font-medium">{generatedProduct.mediamarktname_v1}</span>
                              ) : (
                                <span className="text-muted-foreground italic text-xs">wird generiert...</span>
                              )}
                            </td>
                          )}
                          {visibleKiColumns.includes('mediamarkt_v2') && (
                            <td className="px-2 py-1 border border-border bg-primary/5 text-foreground">
                              {generatedProduct ? (
                                <span className="line-clamp-1 font-medium">{generatedProduct.mediamarktname_v2}</span>
                              ) : (
                                <span className="text-muted-foreground italic text-xs">wird generiert...</span>
                              )}
                            </td>
                          )}
                          {visibleKiColumns.includes('seo_beschreibung') && (
                            <td className="px-2 py-1 border border-border bg-primary/5 text-foreground">
                              {generatedProduct ? (
                                <span className="line-clamp-1 text-xs">{generatedProduct.seo_beschreibung}</span>
                              ) : (
                                <span className="text-muted-foreground italic text-xs">wird generiert...</span>
                              )}
                            </td>
                          )}
                          {visibleKiColumns.includes('keywords') && (
                            <td className="px-2 py-1 border border-border bg-orange-500/10 text-foreground max-w-xs">
                              {generatedProduct ? (
                                <span className="line-clamp-2 text-xs text-orange-700 dark:text-orange-400">{generatedProduct.seo_keywords || '-'}</span>
                              ) : (
                                <span className="text-muted-foreground italic text-xs">wird generiert...</span>
                              )}
                            </td>
                          )}
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Anpassungsfunktion für bereits generierte CSVs */}
              {(() => {
                const hasExistingDescriptions = rawData.some(row => 
                  Object.entries(row).some(([key, value]) => 
                    key.toLowerCase().includes('p_description') && String(value || '').length > 50
                  )
                );
                
                if (!hasExistingDescriptions) return null;
                
                const hasAnyFilter = previewFilter || previewPidFilter;
                const filteredForAdjust = hasAnyFilter 
                  ? rawData.filter(row => {
                      const pidKey = Object.keys(row).find(k => k.toLowerCase() === 'p_id') || 'p_id';
                      const matchesPid = !previewPidFilter || String(row[pidKey] || '').toLowerCase().includes(previewPidFilter.toLowerCase());
                      const matchesText = !previewFilter || Object.values(row).some(v => String(v).toLowerCase().includes(previewFilter.toLowerCase()));
                      return matchesPid && matchesText;
                    })
                  : [];
                
                return (
                  <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 text-primary">
                      <Sparkles className="w-4 h-4" />
                      Bestehende Beschreibungen anpassen
                    </h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      Diese CSV enthält bereits generierte Beschreibungen. Nutze den Filter oben, um Produkte auszuwählen und gezielt anzupassen.
                    </p>
                    
                    {hasAnyFilter && filteredForAdjust.length > 0 && (
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">
                            Was soll bei den {filteredForAdjust.length} gefilterten Produkten geändert werden?
                          </Label>
                          <textarea
                            value={regeneratePrompt}
                            onChange={(e) => setRegeneratePrompt(e.target.value)}
                            placeholder="z.B. 'Ändere den Einsatzbereich: Fokussiere auf den Nutzen nach dem Austausch'"
                            className="w-full min-h-[60px] p-3 text-sm border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        <Button
                          onClick={async () => {
                            if (!regeneratePrompt.trim()) return;
                            setIsRegenerating(true);
                            setRegenerateProgress({ current: 0, total: filteredForAdjust.length });
                            
                            let processed = 0;
                            for (const row of filteredForAdjust) {
                              const descKey = Object.keys(row).find(k => k.toLowerCase().includes('p_description'));
                              const nameKey = Object.keys(row).find(k => k.toLowerCase().includes('p_name'));
                              if (!descKey) continue;
                              
                              try {
                                const token = localStorage.getItem('authToken') || 'local-admin-token-pimpilot-dev';
                                const rowIndex = rawData.indexOf(row);
                                const generatedProduct = bulkProducts.find(p => p.id === rowIndex + 1);
                                
                                const response = await fetch('/api/adjust-description', {
                                  method: 'POST',
                                  headers: { 
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                  },
                                  body: JSON.stringify({
                                    produktname: nameKey ? row[nameKey] : '',
                                    produktnameNeu: generatedProduct?.produktname_neu || (nameKey ? row[nameKey] : ''),
                                    existingDescription: generatedProduct?.produktbeschreibung_html || row[descKey],
                                    adjustmentPrompt: regeneratePrompt.trim()
                                  })
                                });
                                
                                if (response.ok) {
                                  const result = await response.json();
                                  if (rowIndex >= 0) {
                                    setRawData(prev => {
                                      const updated = [...prev];
                                      updated[rowIndex] = { ...updated[rowIndex], [descKey]: result.description || row[descKey] };
                                      return updated;
                                    });
                                  }
                                  if (generatedProduct) {
                                    setBulkProducts(prev =>
                                      prev.map(p =>
                                        p.id === generatedProduct.id
                                          ? { 
                                              ...p, 
                                              produktbeschreibung_html: result.description || p.produktbeschreibung_html,
                                              produktbeschreibung: result.descriptionText || p.produktbeschreibung
                                            }
                                          : p
                                      )
                                    );
                                  }
                                }
                              } catch (err) {
                                console.error('Fehler bei Anpassung:', err);
                              }
                              
                              processed++;
                              setRegenerateProgress({ current: processed, total: filteredForAdjust.length });
                            }
                            
                            setIsRegenerating(false);
                            setRegenerateProgress({ current: 0, total: 0 });
                            toast({ title: "Anpassung abgeschlossen", description: `${processed} Beschreibungen aktualisiert` });
                          }}
                          disabled={isRegenerating || !regeneratePrompt.trim()}
                          size="sm"
                          className="w-full"
                        >
                          {isRegenerating ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              Passe an... ({regenerateProgress.current}/{regenerateProgress.total})
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-2" />
                              {filteredForAdjust.length} Beschreibungen anpassen
                            </>
                          )}
                        </Button>
                        
                        {isRegenerating && regenerateProgress.total > 0 && (
                          <div className="w-full bg-muted rounded-full h-2">
                            <div 
                              className="bg-primary h-2 rounded-full transition-all duration-300" 
                              style={{ width: `${(regenerateProgress.current / regenerateProgress.total) * 100}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    
                    {!previewFilter && (
                      <p className="text-xs text-primary">
                        Gib oben einen Filter ein (z.B. "Flexkabel"), um Produkte zur Anpassung auszuwählen.
                      </p>
                    )}
                  </div>
                );
              })()}
            </Card>
          </div>
        )}

        {bulkProducts.length > 0 && !processing && (
          <div className="space-y-6">
            {/* Statistik-Box nach Abschluss */}
            {generationStats && (
              <Card className="p-4 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <span className="text-green-600 dark:text-green-400 font-semibold">Generierung abgeschlossen</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Dauer:</span>{' '}
                        <span className="font-mono font-semibold">
                          {Math.floor(generationStats.totalTime / 60)}:{(generationStats.totalTime % 60).toString().padStart(2, '0')}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Produkte:</span>{' '}
                        <span className="font-semibold">{generationStats.productCount}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Durchschnitt:</span>{' '}
                        <span className="font-mono font-semibold">{generationStats.avgPerProduct}s</span>/Produkt
                      </div>
                      {generationStats.translationTime && (
                        <div>
                          <span className="text-muted-foreground">Übersetzung:</span>{' '}
                          <span className="font-mono font-semibold">
                            {Math.floor(generationStats.translationTime / 60)}:{(generationStats.translationTime % 60).toString().padStart(2, '0')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => setGenerationStats(null)} 
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>
              </Card>
            )}
            
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
                    onClick={handleTranslateAll}
                    disabled={bulkProducts.length === 0 || isTranslating}
                    size="sm"
                    variant="outline"
                  >
                    {isTranslating ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Übersetze...
                      </>
                    ) : (
                      <>
                        <Languages className="w-4 h-4 mr-2" />
                        NL Übersetzen
                      </>
                    )}
                  </Button>
                  <div className="flex items-center gap-1">
                    <Input
                      value={exportFileName}
                      onChange={(e) => setExportFileName(e.target.value)}
                      placeholder={file?.name?.replace('.csv', '') || 'Dateiname'}
                      className="w-40 h-8 text-sm"
                    />
                    <Button
                      onClick={handleDownload}
                      disabled={bulkProducts.length === 0}
                      size="sm"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    onClick={reset}
                    size="sm"
                  >
                    Zurücksetzen
                  </Button>
                  <Input
                    value={productFilter}
                    onChange={(e) => setProductFilter(e.target.value)}
                    placeholder="Filter..."
                    className="w-48 h-8 text-sm"
                  />
                  {productFilter && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {filteredProducts.length} von {bulkProducts.length}
                    </span>
                  )}
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

              {/* Filter und Selektive Regenerierung */}
              <div className="mt-6 p-4 bg-blue-500/5 rounded-lg border border-blue-500/20">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Produkte filtern & gezielt regenerieren
                </h3>
                <div className="space-y-4">
                  <div className="flex gap-4 items-end">
                    <div className="flex-1">
                      <Label htmlFor="product-filter" className="text-xs text-muted-foreground mb-1 block">
                        Filter (durchsucht Produktname und Beschreibung)
                      </Label>
                      <Input
                        id="product-filter"
                        value={productFilter}
                        onChange={(e) => setProductFilter(e.target.value)}
                        placeholder="z.B. Kabel, Flexkabel, Dock-Connector..."
                        className="w-full"
                      />
                    </div>
                    <div className="text-sm text-muted-foreground whitespace-nowrap">
                      {productFilter ? (
                        <span className="font-medium text-blue-600">{filteredProducts.length} von {bulkProducts.length} gefunden</span>
                      ) : (
                        <span>{bulkProducts.length} Produkte</span>
                      )}
                    </div>
                  </div>
                  
                  {productFilter && filteredProducts.length > 0 && (
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="regenerate-prompt" className="text-xs text-muted-foreground mb-1 block">
                          Was soll bei den gefilterten Produkten geändert werden?
                        </Label>
                        <textarea
                          id="regenerate-prompt"
                          value={regeneratePrompt}
                          onChange={(e) => setRegeneratePrompt(e.target.value)}
                          placeholder="z.B. 'Ändere den Einsatzbereich: Kein Fachmann nötig, fokussiere auf den Nutzen nach dem Austausch'"
                          className="w-full min-h-[80px] p-3 text-sm border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      {isRegenerating && regenerateProgress.total > 0 && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Fortschritt</span>
                            <span className="font-medium">{regenerateProgress.current} / {regenerateProgress.total}</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2.5">
                            <div 
                              className="bg-primary h-2.5 rounded-full transition-all duration-300" 
                              style={{ width: `${(regenerateProgress.current / regenerateProgress.total) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                      <Button
                        onClick={handleRegenerateFiltered}
                        disabled={isRegenerating || !regeneratePrompt.trim()}
                        size="sm"
                        className="w-full"
                      >
                        {isRegenerating ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Regeneriere... ({regenerateProgress.current}/{regenerateProgress.total})
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            {filteredProducts.length} gefilterte Produkte regenerieren
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <BulkDescriptionTable
              products={productFilter ? filteredProducts : bulkProducts}
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
