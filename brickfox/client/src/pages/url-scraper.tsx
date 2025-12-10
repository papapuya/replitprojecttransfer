import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, Globe, Settings2, FolderPlus, List, Download, Table as TableIcon, Eye, Sparkles, FileText, Save, Copy, Check, Maximize2, ArrowLeft, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Project } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

// ===== DYNAMIC TABLE HELPER FUNCTIONS =====
function getSupplierColumns(supplierId: string, suppliers: any[]): string[] {
  if (supplierId === "__none__" || !supplierId || !suppliers) {
    return ['articleNumber', 'productName', 'ean', 'manufacturer', 'price', 'description', 'images'];
  }

  const supplier = suppliers.find(s => s.id === supplierId);
  if (!supplier || !supplier.selectors) {
    return ['articleNumber', 'productName', 'ean', 'manufacturer', 'price', 'description', 'images'];
  }

  const selectorKeys = Object.keys(supplier.selectors || {});
  const coreFields = ['articleNumber', 'productName', 'ean', 'manufacturer', 'price', 'description', 'images'];
  const combined = [...coreFields, ...selectorKeys];
  const uniqueColumns = Array.from(new Set(combined));
  
  return uniqueColumns.filter(col => !['rawHtml', 'url', 'imagesCount', 'autoExtractedDescription', 'technicalDataTable', 'pdfManualUrl', 'safetyWarnings'].includes(col));
}

function getColumnLabel(column: string): string {
  const labels: Record<string, string> = {
    'articleNumber': 'Artikelnummer',
    'productName': 'Produktname',
    'ean': 'EAN',
    'manufacturer': 'Hersteller',
    'price': 'Preis',
    'description': 'Beschreibung',
    'images': 'Bilder',
    'weight': 'Gewicht',
    'category': 'Kategorie',
    'nominalspannung': 'Nominalspannung',
    'nominalkapazitaet': 'Nominalkapazität',
    'maxEntladestrom': 'Max. Entladestrom',
    'laenge': 'Länge',
    'breite': 'Breite',
    'hoehe': 'Höhe',
    'gewicht': 'Gewicht',
    'zellenchemie': 'Zellenchemie',
    'energie': 'Energie',
    'farbe': 'Farbe',
  };
  return labels[column] || column;
}

function getProductValue(product: any, column: string): string {
  const value = product[column];
  if (column === 'images') {
    return Array.isArray(value) ? `${value.length} Bilder` : '0 Bilder';
  }
  if (!value && value !== 0 && value !== '') return '-';
  if (Array.isArray(value)) return value.join(', ');
  const strValue = String(value);
  return strValue.length > 100 ? strValue.substring(0, 100) + '...' : strValue;
}

function getColumnWidth(column: string): string {
  const widths: Record<string, string> = {
    'articleNumber': 'min-w-[120px]',
    'productName': 'min-w-[180px]',
    'ean': 'min-w-[120px]',
    'manufacturer': 'min-w-[120px]',
    'price': 'min-w-[100px]',
    'description': 'min-w-[200px]',
    'images': 'min-w-[100px]',
  };
  return widths[column] || 'min-w-[120px]';
}

interface ScrapedProduct {
  articleNumber: string;
  productName: string;
  ean?: string;
  manufacturer?: string;
  price?: string;
  description?: string;
  images: string[];
  localImagePaths?: string[]; // Lokale Bildpfade
  weight?: string;
  category?: string;
  // ANSMANN technical specifications
  nominalspannung?: string;
  nominalkapazitaet?: string;
  maxEntladestrom?: string;
  laenge?: string;
  breite?: string;
  hoehe?: string;
  gewicht?: string;
  zellenchemie?: string;
  energie?: string;
  farbe?: string;
  // Nitecore technical specifications
  length?: string;
  bodyDiameter?: string;
  headDiameter?: string;
  weightWithoutBattery?: string;
  totalWeight?: string;
  powerSupply?: string;
  led1?: string;
  led2?: string;
  spotIntensity?: string;
  maxLuminosity?: string;
  maxBeamDistance?: string;
  manufacturerArticleNumber?: string;
  // Pricing
  ekPrice?: string;
  vkPrice?: string;
  // Auto-extracted data
  autoExtractedDescription?: string;
  technicalDataTable?: string;
  pdfManualUrl?: string;
  safetyWarnings?: string;
  rawHtml?: string;
  // Special
  [key: string]: any; // Allow dynamic fields
}

interface GeneratedContent {
  description: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords?: string;
  categoryId?: string;
}

export default function URLScraper() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [scrapedProduct, setScrapedProduct] = useState<ScrapedProduct | null>(null);
  const [generatedDescription, setGeneratedDescription] = useState<string>("");
  const [singleProductAiData, setSingleProductAiData] = useState<GeneratedContent | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showBulkSaveDialog, setShowBulkSaveDialog] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("new");
  const [projectName, setProjectName] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  // Single vs Batch Scrape Mode
  const [scrapeMode, setScrapeMode] = useState<'single' | 'batch'>('single');

  // Multi-Product Scraping
  const [productLinkSelector, setProductLinkSelector] = useState("");
  const [maxProducts, setMaxProducts] = useState(50);
  const [scrapedProducts, setScrapedProducts] = useState<ScrapedProduct[]>([]);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, status: "" });
  
  // Pagination for preview table
  const [currentPage, setCurrentPage] = useState(1);
  const productsPerPage = 6;
  
  // Batch AI Generation
  const [generatedDescriptions, setGeneratedDescriptions] = useState<Map<string, GeneratedContent>>(new Map());
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [aiGenerationProgress, setAiGenerationProgress] = useState({ current: 0, total: 0 });
  
  // Abort scraping control
  const abortScrapingRef = useRef(false);
  
  // Pagination options for multi-page scraping
  const [enablePagination, setEnablePagination] = useState(false);
  const [paginationSelector, setPaginationSelector] = useState("");
  const [maxPages, setMaxPages] = useState(10);
  
  // Session cookies and userAgent for authenticated scraping
  const [sessionCookies, setSessionCookies] = useState("");
  const [userAgent, setUserAgent] = useState("");

  // CSV columns from PDF-Auto-Scraper
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  
  // HTML Preview Dialog
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [htmlPreviewContent, setHtmlPreviewContent] = useState("");
  
  // CSV Export Column Selection
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [exportColumns, setExportColumns] = useState([
    { key: 'articleNumber', label: 'Artikelnummer', enabled: true },
    { key: 'productName', label: 'Produktname', enabled: true },
    { key: 'ean', label: 'EAN', enabled: true },
    { key: 'manufacturer', label: 'Hersteller', enabled: true },
    { key: 'ekPrice', label: 'EK_Preis', enabled: true },
    { key: 'vkPrice', label: 'VK_Preis', enabled: true },
    { key: 'nominalspannung', label: 'Nominalspannung_V', enabled: true },
    { key: 'nominalkapazitaet', label: 'Nominalkapazität_mAh', enabled: true },
    { key: 'maxEntladestrom', label: 'Max_Entladestrom_A', enabled: true },
    { key: 'laenge', label: 'Länge_mm', enabled: true },
    { key: 'breite', label: 'Breite_mm', enabled: true },
    { key: 'hoehe', label: 'Höhe_mm', enabled: true },
    { key: 'gewicht', label: 'Gewicht_g', enabled: true },
    { key: 'zellenchemie', label: 'Zellenchemie', enabled: true },
    { key: 'energie', label: 'Energie_Wh', enabled: true },
    { key: 'farbe', label: 'Farbe', enabled: true },
    { key: 'category', label: 'Kategorie', enabled: true },
    { key: 'seoTitle', label: 'SEO_Titel', enabled: true },
    { key: 'seoDescription', label: 'SEO_Beschreibung', enabled: true },
    { key: 'seoKeywords', label: 'SEO_Keywords', enabled: false },
    { key: 'description', label: 'AI_Produktbeschreibung_HTML', enabled: true },
    { key: 'pdfManualUrl', label: 'PDF_Bedienungsanleitung_URL', enabled: false },
    { key: 'images', label: 'Bild_URLs', enabled: true },
  ]);
  
  // SEO Title Preview Dialog
  const [showSeoTitlePreview, setShowSeoTitlePreview] = useState(false);
  const [seoTitlePreviewContent, setSeoTitlePreviewContent] = useState("");
  
  // SEO Description Preview Dialog
  const [showSeoPreview, setShowSeoPreview] = useState(false);
  const [seoPreviewContent, setSeoPreviewContent] = useState("");
  
  // SEO Keywords Preview Dialog
  const [showKeywordsPreview, setShowKeywordsPreview] = useState(false);
  const [keywordsPreviewContent, setKeywordsPreviewContent] = useState("");
  
  // HTML Copy State
  const [copiedArticleNumber, setCopiedArticleNumber] = useState<string | null>(null);
  
  // Full View Dialog
  const [showFullView, setShowFullView] = useState(false);
  const [fullViewContent, setFullViewContent] = useState<{ title: string; seoDescription: string; keywords: string; html: string }>({ title: '', seoDescription: '', keywords: '', html: '' });
  
  // SERP Snippet Preview Dialog
  const [showSerpPreview, setShowSerpPreview] = useState(false);
  const [serpPreviewData, setSerpPreviewData] = useState<{ title: string; description: string; url: string; productName: string }>({ title: '', description: '', url: '', productName: '' });
  
  // Image Gallery State
  const [showImageGallery, setShowImageGallery] = useState(false);
  const [selectedProductImages, setSelectedProductImages] = useState<{ images: string[], productName: string, articleNumber: string }>({ images: [], productName: '', articleNumber: '' });
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Load existing projects
  const { data: projectsData } = useQuery<{ success: boolean; projects: Project[] }>({
    queryKey: ['/api/projects'],
    enabled: showSaveDialog || showBulkSaveDialog,
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/projects', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }
      return response.json();
    },
  });

  // Load suppliers
  const { data: suppliersData, isLoading: isSuppliersLoading } = useQuery<{ success: boolean; suppliers: any[] }>({
    queryKey: ['/api/suppliers'],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/suppliers', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch suppliers');
      }
      const data = await response.json();
      return data;
    },
  });

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("__none__");

  // Auto-detect supplier based on URL domain
  const autoDetectSupplier = (url: string, suppliers: any[]) => {
    if (!suppliers || suppliers.length === 0) return null;
    
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase();
      
      // Match supplier by url_pattern or name
      for (const supplier of suppliers) {
        const pattern = supplier.url_pattern?.toLowerCase() || '';
        const name = supplier.name?.toLowerCase() || '';
        
        if (domain.includes(pattern) || domain.includes(name)) {
          return supplier.id;
        }
      }
    } catch (err) {
      console.warn('Failed to auto-detect supplier:', err);
    }
    
    return null;
  };

  // ===== SCRAPE SESSION PERSISTENCE =====
  // Save scraped data to server session (persists across page navigation)
  const saveScrapeSession = async () => {
    try {
      const token = localStorage.getItem('supabase_token');
      if (!token) return;
      
      await fetch('/api/scrape-session', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          urlScraper: {
            scrapedProducts: scrapedProducts.length > 0 ? scrapedProducts : [],
            scrapedProduct: scrapedProduct,
            generatedDescription: generatedDescription || null,
          },
        }),
      });
      
    } catch (error) {
      console.error('Failed to save URL scrape session:', error);
    }
  };

  // Load scraped data from server session on mount
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const loadScrapeSession = async () => {
      try {
        const token = localStorage.getItem('supabase_token');
        if (!token) return;
        
        const response = await fetch('/api/scrape-session', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (!response.ok) return;
        
        const { success, session } = await response.json();
        
        if (success && session && session.scrapedProducts) {
          const urlScraperData = session.scrapedProducts.urlScraper;
          
          if (urlScraperData) {
            if (urlScraperData.scrapedProducts && Array.isArray(urlScraperData.scrapedProducts) && urlScraperData.scrapedProducts.length > 0) {
              setScrapedProducts(urlScraperData.scrapedProducts);
              
              toast({
                title: "URL-Daten wiederhergestellt",
                description: `${urlScraperData.scrapedProducts.length} Produkte aus vorheriger Sitzung geladen`,
              });
            }
            
            if (urlScraperData.scrapedProduct) {
              setScrapedProduct(urlScraperData.scrapedProduct);
            }
            
            if (urlScraperData.generatedDescription) {
              setGeneratedDescription(urlScraperData.generatedDescription);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load URL scrape session:', error);
      }
    };
    
    loadScrapeSession();
  }, [isAuthenticated]);

  // Auto-save session when scraped data changes
  useEffect(() => {
    if (!isAuthenticated) return;
    if (scrapedProducts.length === 0 && !scrapedProduct) return;
    
    const timeoutId = setTimeout(() => {
      saveScrapeSession();
    }, 1000); // Debounce 1 second
    
    return () => clearTimeout(timeoutId);
  }, [scrapedProducts, scrapedProduct, generatedDescription, isAuthenticated]);

  // Check for PDF-extracted URLs on component mount (only when authenticated)
  useEffect(() => {
    // Wait until user is authenticated
    if (!isAuthenticated) {
      return;
    }

    const pdfUrls = sessionStorage.getItem('pdf_extracted_urls');
    const pdfMetadataMap = sessionStorage.getItem('pdf_url_metadata_map');
    const pdfSupplierId = sessionStorage.getItem('pdf_selected_supplier_id');
    const pdfCsvColumns = sessionStorage.getItem('pdf_csv_columns');
    
    if (pdfUrls && pdfMetadataMap) {
      try {
        const urls = pdfUrls.split('\n').filter(url => url.trim());
        const metadataMap = JSON.parse(pdfMetadataMap);
        const csvCols = pdfCsvColumns ? JSON.parse(pdfCsvColumns) : [];
        setCsvColumns(csvCols);
        
        // Determine supplier ID
        let supplierIdToUse: string | undefined = undefined;
        
        // Use supplier from PDF-Auto-Scraper if set
        if (pdfSupplierId && pdfSupplierId !== "__none__" && suppliersData?.suppliers) {
          supplierIdToUse = pdfSupplierId;
          setSelectedSupplierId(pdfSupplierId);
          const supplier = suppliersData.suppliers.find((s: any) => s.id === pdfSupplierId);
          if (supplier) {
            // Load supplier selectors automatically
            handleSupplierSelect(pdfSupplierId);
            toast({
              title: "✅ Lieferant geladen",
              description: `${supplier.name} aus PDF-Upload übernommen`,
            });
          }
          // Clear from sessionStorage
          sessionStorage.removeItem('pdf_selected_supplier_id');
        }
        // Fallback: Auto-detect supplier from URL if no supplier was selected in PDF-Auto-Scraper
        else if (urls.length > 0 && suppliersData?.suppliers) {
          const detectedSupplierId = autoDetectSupplier(urls[0], suppliersData.suppliers);
          if (detectedSupplierId) {
            supplierIdToUse = detectedSupplierId;
            setSelectedSupplierId(detectedSupplierId);
            toast({
              title: "✅ Lieferant erkannt",
              description: `${suppliersData.suppliers.find((s: any) => s.id === detectedSupplierId)?.name} wurde automatisch ausgewählt`,
            });
          }
        }
        
        // Clear session storage
        sessionStorage.removeItem('pdf_extracted_urls');
        sessionStorage.removeItem('pdf_url_metadata_map');
        sessionStorage.removeItem('pdf_csv_columns');
        
        // Show notification
        toast({
          title: "PDF-Daten geladen",
          description: `${urls.length} Produkt-URLs aus PDF übernommen. Scraping wird gestartet...`,
        });
        
        // Start scraping automatically with detected supplier ID
        handleScrapeFromPDF(urls, metadataMap, supplierIdToUse);
      } catch (error) {
        console.error('Error loading PDF data:', error);
        toast({
          title: "Fehler beim Laden der PDF-Daten",
          description: "Bitte versuchen Sie es erneut",
          variant: "destructive",
        });
      }
    }
  }, [isAuthenticated, suppliersData]);

  const handleSupplierSelect = (supplierId: string) => {
    setSelectedSupplierId(supplierId);
    
    if (supplierId === "__none__") {
      // Clear selectors
      setSelectors({
        articleNumber: "",
        productName: "",
        ean: "",
        manufacturer: "",
        price: "",
        description: "",
        images: "",
        weight: "",
        category: "",
        nominalspannung: "",
        nominalkapazitaet: "",
        maxEntladestrom: "",
        laenge: "",
        breite: "",
        hoehe: "",
        gewicht: "",
        zellenchemie: "",
        energie: "",
        farbe: ""
      });
      setProductLinkSelector("");
      setSessionCookies("");
      setUserAgent("");
      return;
    }

    const supplier = suppliersData?.suppliers?.find(s => s.id === supplierId);
    if (supplier) {
      setSelectors({ ...selectors, ...supplier.selectors });
      // For Nitecore, ALWAYS force .product-image-link (not optional)
      if (supplier.name === 'Nitecore') {
        setProductLinkSelector('.product-image-link');
      } else {
        setProductLinkSelector(supplier.productLinkSelector || "");
      }
      setSessionCookies(supplier.sessionCookies || "");
      setUserAgent(supplier.userAgent || "");
      setShowAdvanced(true); // Automatically show selectors when a supplier is selected
      toast({
        title: "Lieferant geladen",
        description: `Selektoren und Authentifizierung für "${supplier.name}" wurden geladen`,
      });
    }
  };

  // Custom selectors
  const [selectors, setSelectors] = useState({
    articleNumber: ".product-code",
    productName: "h1.product-title",
    ean: ".ean",
    manufacturer: ".brand",
    price: ".price",
    description: ".product-description",
    images: ".product-image img",
    weight: ".weight",
    category: ".breadcrumb",
    // ANSMANN technical specifications
    nominalspannung: "",
    nominalkapazitaet: "",
    maxEntladestrom: "",
    laenge: "",
    breite: "",
    hoehe: "",
    gewicht: "",
    zellenchemie: "",
    energie: "",
    farbe: ""
  });


  // Single Product Scraping - uses batch scraper with maxProducts=1
  const handleScrapeSingleProduct = async () => {
    if (!url.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie eine URL ein",
        variant: "destructive",
      });
      return;
    }

    // Temporarily set batch mode params to scrape single product
    const originalMaxProducts = maxProducts;
    const originalEnablePagination = enablePagination;
    
    try {
      setMaxProducts(1);
      setEnablePagination(false);
      await handleScrapeProductList();
    } finally {
      // Restore original settings
      setMaxProducts(originalMaxProducts);
      setEnablePagination(originalEnablePagination);
    }
  };

  const handleScrapeProductList = async () => {
    if (!url.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie eine URL ein",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setScrapedProducts([]);
    setBatchProgress({ current: 0, total: 0, status: enablePagination ? "Scrape alle Seiten..." : "Suche nach Produkten..." });

    try {
      let productUrls: string[] = [];

      // Step 1: Get all product URLs from listing page
      if (enablePagination) {
        // Use SSE for multi-page scraping with live progress
        productUrls = await new Promise((resolve, reject) => {
          const requestBody = {
            url: url.trim(),
            productLinkSelector: productLinkSelector.trim() || null,
            paginationSelector: paginationSelector.trim() || null,
            maxPages,
            maxProducts,
            userAgent: userAgent || undefined,
            selectors: selectors,
            // Don't send cookies if supplier is selected - let backend handle login
            cookies: (selectedSupplierId && selectedSupplierId !== "__none__") ? undefined : sessionCookies,
            supplierId: selectedSupplierId !== "__none__" ? selectedSupplierId : undefined
          };

          // Create URL with query parameters for SSE
          const params = new URLSearchParams();
          Object.entries(requestBody).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              params.append(key, String(value));
            }
          });

          const token = localStorage.getItem('supabase_token');
          fetch('/api/scrape-all-pages', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestBody)
          }).then(response => {
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
              reject(new Error('No response body'));
              return;
            }

            const readStream = async () => {
              let buffer = ''; // Buffer for incomplete lines
              
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  // Decode chunk (do NOT flush decoder - keep state for multi-byte UTF-8)
                  buffer += decoder.decode(value, { stream: true });

                  // Split on newlines
                  const lines = buffer.split('\n');
                  
                  // Keep the last incomplete line in the buffer
                  buffer = lines.pop() || '';

                  // Process complete lines
                  for (const line of lines) {
                    if (line.trim() && line.startsWith('data: ')) {
                      try {
                        const data = JSON.parse(line.substring(6));
                        
                        if (data.type === 'progress') {
                          setBatchProgress({
                            current: data.currentPage,
                            total: maxPages,
                            status: data.message
                          });
                        } else if (data.type === 'complete') {
                          resolve(data.productUrls);
                          return;
                        } else if (data.type === 'error') {
                          reject(new Error(data.error));
                          return;
                        }
                      } catch (parseErr) {
                        console.error('Failed to parse SSE line:', line, parseErr);
                      }
                    }
                  }
                }

                // Process any remaining buffered data
                if (buffer.trim() && buffer.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(buffer.substring(6));
                    if (data.type === 'complete') {
                      resolve(data.productUrls);
                    } else if (data.type === 'error') {
                      reject(new Error(data.error));
                    }
                  } catch (parseErr) {
                    console.error('Failed to parse final SSE buffer:', buffer, parseErr);
                  }
                }
              } catch (err) {
                reject(err);
              }
            };

            readStream();
          }).catch(reject);
        });
      } else {
        // Single page scraping (no SSE needed)
        const requestBody = {
          listUrl: url.trim(),
          productLinkSelector: productLinkSelector.trim() || null,
          maxProducts,
          userAgent: userAgent || undefined,
          selectors: selectors,
          // Don't send cookies if supplier is selected - let backend handle login
          cookies: (selectedSupplierId && selectedSupplierId !== "__none__") ? undefined : sessionCookies,
          supplierId: selectedSupplierId !== "__none__" ? selectedSupplierId : undefined
        };

        const token = localStorage.getItem('supabase_token');
        const listResponse = await fetch('/api/scrape-product-list', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(requestBody),
        });

        if (!listResponse.ok) {
          const error = await listResponse.json();
          throw new Error(error.error || 'Fehler beim Abrufen der Produktliste');
        }

        const data = await listResponse.json();
        // Backend can return either an array directly or an object with productUrls property
        productUrls = Array.isArray(data) ? data : (data.productUrls || []);
      }

      if (!productUrls || productUrls.length === 0) {
        toast({
          title: "Keine Produkte gefunden",
          description: "Überprüfen Sie den CSS-Selektor für Produktlinks",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Produktliste gefunden",
        description: `${productUrls.length} Produkte gefunden. Starte Scraping...`,
      });

      // Step 2: Show product URLs immediately as preview (pending scraping)
      const previewProducts: ScrapedProduct[] = productUrls.map((url, idx) => ({
        productName: `Produkt ${idx + 1}`,
        articleNumber: url.split('/').pop() || '',
        url: url,
        ean: '',
        manufacturer: '',
        price: '',
        description: '(Wird gescraped...)',
        images: [],
        category: '',
        rawHtml: '',
        imagesCount: 0,
        autoExtractedDescription: '',
        technicalDataTable: '',
        pdfManualUrl: '',
        safetyWarnings: '',
      })) as ScrapedProduct[];

      setScrapedProducts(previewProducts);

      toast({
        title: "✅ Produktliste geladen",
        description: `${productUrls.length} ${productUrls.length === 1 ? 'Produkt' : 'Produkte'} - Starte Scraping...`,
      });

      // Step 3: Update preview with URL - For MVP, show found URLs
      const finalProducts: ScrapedProduct[] = productUrls.map((url, idx) => ({
        productName: url.split('/').slice(-2, -1)[0]?.replace(/-/g, ' ') || `Produkt ${idx + 1}`,
        articleNumber: url.split('/').pop() || '',
        url: url,
        ean: '',
        manufacturer: '',
        price: '',
        description: 'URL erfolgreich gescraped',
        images: [],
        category: '',
        rawHtml: '',
        imagesCount: 0,
        autoExtractedDescription: '',
        technicalDataTable: '',
        pdfManualUrl: '',
        safetyWarnings: '',
      })) as ScrapedProduct[];

      setScrapedProducts(finalProducts);
      setBatchProgress({ current: productUrls.length, total: productUrls.length, status: "✅ Fertig!" });

      toast({
        title: "✅ Scraping abgeschlossen",
        description: `${productUrls.length} ${productUrls.length === 1 ? 'Produkt-URL' : 'Produkt-URLs'} erfolgreich gefunden`,
      });

    } catch (error) {
      console.error('Product list scraping error:', error);
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : 'Scraping fehlgeschlagen',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      abortScrapingRef.current = false; // Reset abort flag
    }
  };

  // Handle scraping from PDF-extracted URLs
  const handleScrapeFromPDF = async (urls: string[], metadataMap: Record<string, any>, overrideSupplierId?: string) => {
    setIsLoading(true);
    setScrapedProducts([]);
    setBatchProgress({ current: 0, total: urls.length, status: "Erkenne Lieferanten..." });

    // Use override supplier ID if provided, otherwise use current state
    let detectedSupplierId = overrideSupplierId || selectedSupplierId;
    
    // Only auto-detect if no supplier ID was provided and current selection is "__none__"
    if (!overrideSupplierId && urls.length > 0 && suppliersData?.suppliers && detectedSupplierId === "__none__") {
      const detected = autoDetectSupplier(urls[0], suppliersData.suppliers);
      if (detected) {
        detectedSupplierId = detected;
        setSelectedSupplierId(detected);
        
        // Load supplier selectors (only if we just auto-detected)
        const supplier = suppliersData.suppliers.find((s: any) => s.id === detected);
        if (supplier) {
          setSelectors({ ...selectors, ...supplier.selectors });
          setProductLinkSelector(supplier.productLinkSelector || "");
          setSessionCookies(supplier.sessionCookies || "");
          setUserAgent(supplier.userAgent || "");
          
          toast({
            title: "✅ Lieferant erkannt",
            description: `${supplier.name} wurde automatisch ausgewählt`,
          });
        }
      }
    }
    // If supplier was provided via override, load selectors to ensure they're available
    else if (overrideSupplierId && suppliersData?.suppliers) {
      const supplier = suppliersData.suppliers.find((s: any) => s.id === overrideSupplierId);
      if (supplier) {
        // Load selectors explicitly to ensure they're available for scraping
        setSelectors({ ...selectors, ...supplier.selectors });
        setProductLinkSelector(supplier.productLinkSelector || "");
        setSessionCookies(supplier.sessionCookies || "");
        setUserAgent(supplier.userAgent || "");
        
      }
    }
    
    setBatchProgress({ current: 0, total: urls.length, status: "Scraping aus PDF gestartet..." });

    try {
      const products: ScrapedProduct[] = [];
      
      // Build active selectors - use supplier selectors if available
      let activeSelectors: any = {};
      if (detectedSupplierId !== "__none__" && suppliersData?.suppliers) {
        const supplier = suppliersData.suppliers.find((s: any) => s.id === detectedSupplierId);
        if (supplier && supplier.selectors) {
          // Use supplier selectors directly (not from state which might not be updated yet)
          activeSelectors = { ...supplier.selectors };
        }
      }
      
      // Fallback: use selectors from state if no supplier selectors
      if (Object.keys(activeSelectors).length === 0) {
        Object.entries(selectors).forEach(([key, value]) => {
          if (value.trim()) activeSelectors[key] = value;
        });
      }

      let failedCount = 0;
      for (let i = 0; i < urls.length; i++) {
        if (abortScrapingRef.current) {
          break;
        }

        const productUrl = urls[i];
        const pdfMetadata = metadataMap[productUrl]; // Use URL as key for correct mapping
        
        setBatchProgress({ 
          current: i + 1, 
          total: urls.length, 
          status: `Scrape Produkt ${i + 1}/${urls.length}...` 
        });

        try {
          const data = await apiPost('/api/scrape-product', {
            url: productUrl,
            selectors: Object.keys(activeSelectors).length > 0 ? activeSelectors : undefined,
            userAgent: userAgent || undefined,
            cookies: sessionCookies || undefined,
            supplierId: detectedSupplierId !== "__none__" ? detectedSupplierId : undefined
          }) as any;

          if (data && data.product) {
            // Merge PDF data with scraped data (only if metadata exists for this URL)
            let mergedProduct = pdfMetadata ? {
              ...data.product,
              // Add EK price from PDF
              ekPrice: pdfMetadata.ekPrice,
              // Add additional PDF metadata
              pdfArticleNumber: pdfMetadata.articleNumber,
              pdfEanCode: pdfMetadata.eanCode,
              pdfProductName: pdfMetadata.productName,
              // Preserve manufacturer article number from PDF if available
              manufacturerArticleNumber: pdfMetadata.manufacturerArticleNumber || data.product.manufacturerArticleNumber,
              // Add complete CSV row data for dynamic table columns
              csvRowData: pdfMetadata.csvRowData || {},
            } : data.product;
            
            // Calculate VK if EK exists: (EK × 2) + 19% = EK × 2.38, rounded to ,95
            if (mergedProduct.ekPrice) {
              const ekValue = parseFloat(mergedProduct.ekPrice.replace(',', '.'));
              if (!isNaN(ekValue)) {
                const vkValue = Math.floor(ekValue * 2 * 1.19) + 0.95;
                mergedProduct.vkPrice = vkValue.toFixed(2).replace('.', ',');
              }
            }
            
            products.push(mergedProduct);
            
            // 🔴 LIVE UPDATE: Tabelle sofort mit neuem Produkt aktualisieren
            setScrapedProducts([...products]);
          } else {
            console.error(`Fehler beim Scrapen von ${productUrl}`);
            failedCount++;
          }
        } catch (err) {
          console.error(`Fehler beim Scrapen von ${productUrl}:`, err);
          failedCount++;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (failedCount > 0) {
        toast({
          title: "Teilweise erfolgreich",
          description: `${products.length} erfolgreich, ${failedCount} fehlgeschlagen`,
          variant: "destructive",
        });
      }

      setScrapedProducts(products);
      
      // Save scraped products back to PDF-Auto-Scraper sessionStorage
      // Create URL→Product map for easy merging in PDF-Auto-Scraper
      const urlToScrapedData: Record<string, any> = {};
      products.forEach(product => {
        if (product.url) {
          urlToScrapedData[product.url] = {
            images: product.images || [],
            localImagePaths: product.localImagePaths || [],
            articleNumber: product.articleNumber,
            eanCode: product.ean,
            productName: product.productName,
            description: product.description,
            longDescription: product.longDescription,
          };
        }
      });
      sessionStorage.setItem('pdf_url_scraped_data', JSON.stringify(urlToScrapedData));
      
      if (abortScrapingRef.current) {
        setBatchProgress({ current: products.length, total: urls.length, status: "Abgebrochen" });
        toast({
          title: "Scraping abgebrochen",
          description: `${products.length} von ${urls.length} Produkten gescraped`,
          variant: "destructive",
        });
      } else {
        setBatchProgress({ current: products.length, total: urls.length, status: "Fertig!" });
        toast({
          title: "PDF-Scraping abgeschlossen",
          description: `${products.length} von ${urls.length} Produkten erfolgreich gescraped (inkl. EK-Preise aus PDF)`,
        });
      }
    } catch (error) {
      console.error('PDF scraping error:', error);
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : 'Scraping fehlgeschlagen',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      abortScrapingRef.current = false;
    }
  };


  // Navigate to Pixi Compare with scraped products
  const handlePixiCompare = () => {
    if (scrapedProducts.length === 0) {
      toast({
        title: 'Keine Produkte',
        description: 'Bitte scrapen Sie zuerst Produkte',
        variant: 'destructive',
      });
      return;
    }

    // Get the selected supplier to find the SupplNr
    const selectedSupplier = suppliersData?.suppliers?.find(s => s.id === selectedSupplierId);
    const supplNr = selectedSupplier?.supplNr;
    const supplierName = selectedSupplier?.name || 'Unbekannt';

    // STRICT VALIDATION: Supplier with SupplNr is required
    if (!supplNr || selectedSupplierId === '__none__') {
      toast({
        title: 'Lieferant erforderlich',
        description: 'Bitte wählen Sie einen Lieferanten mit hinterlegter Pixi-Lieferantennummer aus. Sie können diese im Lieferanten-Menü konfigurieren.',
        variant: 'destructive',
      });
      return;
    }

    // Convert scraped products to COMPLETE Brickfox CSV format for Pixi Compare
    const csvData = scrapedProducts.map(product => {
      // Get AI-generated description if available
      const generatedContent = generatedDescriptions.get(product.articleNumber);
      
      // Extract images: Prioritize URLs, then convert local paths to URLs
      let imageUrls: string[] = [];
      
      // First try: Original image URLs from scraping
      if (product.images && product.images.length > 0) {
        imageUrls = product.images;
      }
      // Second try: Convert local paths to full URLs
      else if (product.localImagePaths && product.localImagePaths.length > 0) {
        const domain = window.location.hostname === 'localhost' 
          ? 'http://localhost:5000'
          : `https://${window.location.host}`;
        imageUrls = product.localImagePaths.map(path => 
          `${domain}${path.startsWith('/') ? path : '/' + path}`
        );
      }
      
      
      // Create separate p_image[1] to p_image[10] columns
      const imageColumns: Record<string, string> = {};
      for (let i = 1; i <= 10; i++) {
        imageColumns[`p_image[${i}]`] = imageUrls[i - 1] || '';
      }
      
      // Helper: Parse price (EXACT backend logic - returns number | null)
      // Handles "UVP: 1.234,56 €" → 1234.56, "EUR 9,92" → 9.92, "–" → null, 0 → 0
      const parsePrice = (price: string | number | null | undefined): number | null => {
        if (price === null || price === undefined) return null;
        if (typeof price === 'number') return price;  // Early return for numbers (0 is valid!)
        
        const priceStr = String(price);
        
        // Remove ALL non-numeric characters except comma, dot, minus (like backend)
        // Handles "UVP: 39,75 €", "EUR 1.234,56", "Preis: 9,92 €" etc.
        let str = priceStr.replace(/[^\d,.-]/g, '').trim();
        
        // German decimal format handling:
        // - Comma = decimal separator
        // - Dot = thousand separator
        // Examples: "1.234,56" → 1234.56, "39,75" → 39.75, "9,92" → 9.92
        let normalized = str;
        if (str.includes(',')) {
          // Has comma → German format with decimal
          // Remove all dots (thousand separators), replace comma with dot
          // "1.234,56" → "1234.56", "39,75" → "39.75"
          normalized = str.replace(/\./g, '').replace(',', '.');
        } else if (str.includes('.')) {
          // Has dot but no comma → Could be German thousand separator OR English decimal
          // Heuristic: Dot followed by exactly 3 digits → German thousand separator
          // "1.234" → 1234 (thousand)
          // "2.500" → 2500 (thousand)
          // "15.99" → 15.99 (decimal, only 2 digits)
          const dotMatch = str.match(/\.(\d+)$/);
          if (dotMatch && dotMatch[1].length === 3) {
            // Exactly 3 digits after last dot → German thousand separator
            normalized = str.replace(/\./g, '');
          }
          // Otherwise keep dot as decimal: "15.99", "10.50"
        }
        // No dot or comma: "101" → "101", "250" → "250"
        
        // Convert to number and return null if invalid (like backend)
        const value = parseFloat(normalized);
        return isNaN(value) ? null : value;
      };
      
      // Helper: Calculate net sales price (EK * 2)
      const calculateVKNetto = (ek: number): number => {
        return ek * 2;
      };
      
      // Helper: Calculate gross sales price (EK * 2 + 19% = EK * 2 * 1.19)
      const calculateVKBrutto = (ek: number): number => {
        return ek * 2 * 1.19;
      };
      
      const ekPrice = parsePrice(product.price);
      const vkPriceNetto = ekPrice !== null ? calculateVKNetto(ekPrice) : null;
      const vkPriceBrutto = ekPrice !== null ? calculateVKBrutto(ekPrice) : null;
      
      return {
        // === PRODUCT FIELDS ===
        'p_item_number': product.articleNumber?.replace(/-/g, '') || '',  // OHNE Bindestriche: ANS1520-0010 → ANS15200010
        'p_group_path[de]': product.category || '',
        'p_brand': product.manufacturer || '',
        'p_status': '1',
        'p_name[de]': product.productName || '',
        'p_tax_class': '1',
        'p_never_out_of_stock': '1',
        'p_condition': 'Neu',
        'p_country': 'China',
        'p_description[de]': generatedContent?.description || product.description || product.longDescription || '',
        ...imageColumns,  // p_image[1] to p_image[10]
        
        // === VARIANT FIELDS ===
        'v_item_number': product.articleNumber?.replace(/-/g, '') || '',  // OHNE Bindestriche
        'v_ean': product.ean || '',
        'v_manufacturers_item_number': product.articleNumber?.replace(/^ANS/, '') || '',
        'v_supplier_item_number': product.articleNumber || '',
        'v_status': '1',
        'v_classification': 'X',
        'v_delivery_time[de]': '3-5 Tage',
        'v_supplier[Eur]': vkPriceBrutto !== null ? vkPriceBrutto.toFixed(2) : '',  // VK-Preis (EK * 2 * 1.19)
        'v_purchase_price': ekPrice !== null ? ekPrice.toFixed(2) : '',
        'v_price[Eur]': ekPrice !== null ? ekPrice.toFixed(2) : '',  // EK-Preis
        'v_price_net': vkPriceNetto !== null ? vkPriceNetto.toFixed(2) : '',  // EK * 2 (Netto-VK)
        'v_price_gross': vkPriceBrutto !== null ? vkPriceBrutto.toFixed(2) : '',  // EK * 2 * 1.19 (Brutto-VK)
        'v_never_out_of_stock[standard]': '1',
        'v_weight': product.weight || product.gewicht || '',
        'v_length': product.length || product.laenge || '',
        'v_width': product.bodyDiameter || product.breite || '',
        'v_height': product.headDiameter || product.hoehe || '',
        
        // === ANSMANN-SPEZIFISCHE FELDER ===
        'v_capacity_mah': product.nominalkapazitaet || '',
        'v_voltage': product.nominalspannung || '',
        'v_max_discharge_current': product.maxEntladestrom || '',
        'v_cell_chemistry': product.zellenchemie || '',
        'v_energy': product.energie || '',
        'v_color': product.farbe || '',
        
        // === NITECORE-SPEZIFISCHE FELDER ===
        'v_power_supply': product.powerSupply || '',
        'v_led_1': product.led1 || '',
        'v_led_2': product.led2 || '',
        'v_spot_intensity': product.spotIntensity || '',
        'v_max_luminosity': product.maxLuminosity || '',
        'v_max_beam_distance': product.maxBeamDistance || '',
        'v_runtime_high': product.runtimeHigh || '',
        'v_runtime_low': product.runtimeLow || '',
        'v_impact_resistance': product.impactResistance || '',
        'v_waterproof_rating': product.waterproofRating || '',
        
        // === SEO FELDER (wenn AI-generiert) ===
        'p_seo_title[de]': generatedContent?.seoTitle || '',
        'p_seo_description[de]': generatedContent?.seoDescription || '',
        'p_seo_keywords[de]': generatedContent?.seoKeywords || '',
      };
    });

    // Store data AND supplier number in sessionStorage for Pixi Compare
    sessionStorage.setItem('pixi_compare_data', JSON.stringify(csvData));
    sessionStorage.setItem('pixi_compare_source', 'url-scraper');
    sessionStorage.setItem('pixi_compare_supplNr', supplNr);
    
    toast({
      title: 'Daten vorbereitet',
      description: `${scrapedProducts.length} Produkte werden zum Pixi-Vergleich übertragen (Lieferant ${selectedSupplier.name}: ${supplNr})`,
    });
    
    // Navigate to Pixi Compare
    setLocation('/pixi-compare?from=url-scraper');
  };

  // Copy HTML to clipboard
  const handleCopyHtml = async (articleNumber: string) => {
    const htmlContent = generatedDescriptions.get(articleNumber)?.description;
    if (!htmlContent) return;

    try {
      await navigator.clipboard.writeText(htmlContent);
      setCopiedArticleNumber(articleNumber);
      
      toast({
        title: "Erfolgreich kopiert",
        description: "HTML-Code wurde in die Zwischenablage kopiert",
      });

      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopiedArticleNumber(null);
      }, 2000);
    } catch (error) {
      console.error('Copy error:', error);
      toast({
        title: "Fehler",
        description: "HTML konnte nicht kopiert werden",
        variant: "destructive",
      });
    }
  };

  const handleGenerateDescription = async () => {
    if (!scrapedProduct) return;

    setIsGenerating(true);
    try {
      // Refresh token before generation
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        localStorage.setItem('supabase_token', session.access_token);
      }

      const productData = {
        productName: scrapedProduct.productName,
        articleNumber: scrapedProduct.articleNumber,
        ean: scrapedProduct.ean,
        manufacturer: scrapedProduct.manufacturer,
        price: scrapedProduct.price,
        weight: scrapedProduct.weight,
        category: scrapedProduct.category,
        description: scrapedProduct.description,
      };

      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/generate-description', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          extractedData: [productData],
          customAttributes: {
            exactProductName: scrapedProduct.productName,
          },
          // SMART AUTO-EXTRACTION: Pass auto-extracted data to AI
          autoExtractedDescription: (scrapedProduct as any).autoExtractedDescription,
          technicalDataTable: (scrapedProduct as any).technicalDataTable,
          safetyWarnings: (scrapedProduct as any).safetyWarnings, // 1:1 safety warnings
          pdfManualUrl: (scrapedProduct as any).pdfManualUrl, // PDF manual URL
          // COST OPTIMIZATION: GPT-4o-mini ist 30× günstiger!
          model: 'gpt-4o-mini',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'AI-Generierung fehlgeschlagen');
      }

      const data = await response.json();
      setGeneratedDescription(data.description || '');
      
      // Store complete AI data including categoryId
      setSingleProductAiData({
        description: data.description || '',
        seoTitle: data.seoTitle || '',
        seoDescription: data.seoDescription || '',
        seoKeywords: data.seoKeywords || '',
        categoryId: data.categoryId || ''
      });
      
      // Update scrapedProduct with generated description
      if (scrapedProduct) {
        setScrapedProduct({
          ...scrapedProduct,
          description: data.description || ''
        });
      }
      
      toast({
        title: "Erfolgreich",
        description: "AI-Beschreibung wurde generiert",
      });

    } catch (error) {
      console.error('AI generation error:', error);
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : 'AI-Generierung fehlgeschlagen',
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // BATCH AI GENERATION: Generate descriptions for all scraped products (PARALLEL VERSION - 10× faster!)
  const handleGenerateAllDescriptions = async () => {
    if (scrapedProducts.length === 0) return;

    setIsGeneratingBatch(true);
    setAiGenerationProgress({ current: 0, total: scrapedProducts.length });

    const newDescriptions = new Map<string, GeneratedContent>();
    let successCount = 0;
    let errorCount = 0;

    try {
      // Refresh token before batch generation
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        localStorage.setItem('supabase_token', session.access_token);
      } else {
        throw new Error('Keine gültige Session. Bitte neu anmelden.');
      }

      const BATCH_SIZE = 5; // Process 5 products simultaneously
      const TIMEOUT_MS = 60000; // 60 seconds timeout per product
      const MAX_RETRIES = 2; // Retry up to 2 times on failure

      // Helper function to generate description with timeout and retry
      const generateWithTimeout = async (product: any, index: number, retryCount = 0): Promise<any> => {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout nach 60s')), TIMEOUT_MS)
        );

        const generatePromise = (async () => {
          const productData = {
            productName: product.productName,
            articleNumber: product.articleNumber,
            ean: product.ean,
            manufacturer: product.manufacturer,
            price: product.price,
            weight: product.weight,
            category: product.category,
            description: product.description,
          };

          // WICHTIG: Alle gescrapten technischen Felder übertragen (length, bodyDiameter, led1, etc.)
          const structuredData: any = {};
          Object.keys(product).forEach((key) => {
            // Überspringe Basis-Felder (die bereits in productData sind)
            const skipFields = ['productName', 'articleNumber', 'ean', 'manufacturer', 'price', 'weight', 'category', 'description', 'images', 'autoExtractedDescription', 'technicalDataTable', 'safetyWarnings', 'pdfManualUrl'];
            if (!skipFields.includes(key) && product[key] !== undefined && product[key] !== null && product[key] !== '') {
              structuredData[key] = product[key];
            }
          });

          const token = localStorage.getItem('supabase_token');
          const response = await fetch('/api/generate-description', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              extractedData: [productData],
              structuredData: Object.keys(structuredData).length > 0 ? structuredData : undefined,
              customAttributes: {
                exactProductName: product.productName,
              },
              autoExtractedDescription: (product as any).autoExtractedDescription,
              technicalDataTable: (product as any).technicalDataTable,
              safetyWarnings: (product as any).safetyWarnings,
              pdfManualUrl: (product as any).pdfManualUrl,
              model: 'gpt-4o-mini',
            }),
          });

          if (!response.ok) {
            throw new Error('AI-Generierung fehlgeschlagen');
          }

          return await response.json();
        })();

        try {
          return await Promise.race([generatePromise, timeoutPromise]);
        } catch (error) {
          // Retry logic with exponential backoff
          if (retryCount < MAX_RETRIES) {
            const waitTime = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return generateWithTimeout(product, index, retryCount + 1);
          }
          throw error;
        }
      };

      // Process products in batches of 5
      for (let i = 0; i < scrapedProducts.length; i += BATCH_SIZE) {
        const batch = scrapedProducts.slice(i, Math.min(i + BATCH_SIZE, scrapedProducts.length));
        
        // Process batch in parallel
        const results = await Promise.allSettled(
          batch.map((product, batchIndex) => generateWithTimeout(product, i + batchIndex))
        );

        // Process results
        results.forEach((result, batchIndex) => {
          const product = batch[batchIndex];
          if (result.status === 'fulfilled') {
            const data = result.value as any;
            // Store complete response with description, seoTitle, seoDescription, seoKeywords, categoryId
            newDescriptions.set(product.articleNumber, {
              description: data.description || '',
              seoTitle: data.seoTitle || '',
              seoDescription: data.seoDescription || '',
              seoKeywords: data.seoKeywords || '',
              categoryId: data.categoryId || '' // Store detected category
            });
            successCount++;
          } else {
            console.error(`❌ Fehler bei ${product.productName} (nach ${MAX_RETRIES} Versuchen):`, result.reason);
            errorCount++;
          }
        });

        // Update progress
        setAiGenerationProgress({ 
          current: Math.min(i + BATCH_SIZE, scrapedProducts.length), 
          total: scrapedProducts.length 
        });
      }

      setGeneratedDescriptions(newDescriptions);

      toast({
        title: "Batch-Generierung abgeschlossen",
        description: `${successCount} Beschreibungen erfolgreich generiert${errorCount > 0 ? `, ${errorCount} Fehler` : ''}`,
      });

    } catch (error) {
      console.error('Batch AI generation error:', error);
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : 'Batch-Generierung fehlgeschlagen',
        variant: "destructive",
      });
    } finally {
      setIsGeneratingBatch(false);
      setAiGenerationProgress({ current: 0, total: 0 });
    }
  };

  // Toggle column selection
  const toggleColumn = (key: string) => {
    setExportColumns(prev => 
      prev.map(col => col.key === key ? { ...col, enabled: !col.enabled } : col)
    );
  };

  const toggleAllColumns = (enabled: boolean) => {
    setExportColumns(prev => prev.map(col => ({ ...col, enabled })));
  };

  const convertToCSV = (products: ScrapedProduct[]): string => {
    if (products.length === 0) return '';

    // Use only enabled columns from exportColumns
    const selectedColumns = exportColumns.filter(col => col.enabled);
    const orderedKeys = selectedColumns.map(col => col.key);
    const headers = selectedColumns.map(col => col.label);

    // CSV Rows - keep HTML in description, escape quotes properly
    // Fill missing fields with empty strings
    const rows = products.map(product => 
      orderedKeys.map(key => {
        // Special handling for AI-generated fields
        if (key === 'seoTitle') {
          const aiData = generatedDescriptions.get(product.articleNumber);
          return (aiData?.seoTitle || '').replace(/"/g, '""');
        }
        if (key === 'seoDescription') {
          const aiData = generatedDescriptions.get(product.articleNumber);
          return (aiData?.seoDescription || '').replace(/"/g, '""');
        }
        if (key === 'seoKeywords') {
          const aiData = generatedDescriptions.get(product.articleNumber);
          return (aiData?.seoKeywords || '').replace(/"/g, '""');
        }
        if (key === 'description') {
          const aiData = generatedDescriptions.get(product.articleNumber);
          const aiDesc = aiData?.description || '';
          return aiDesc.replace(/"/g, '""');
        }
        
        const value = product[key as keyof ScrapedProduct];
        
        if (key === 'images') {
          // Return URLs, not local paths
          let urls: string[] = [];
          if (product.images && product.images.length > 0) {
            urls = product.images;
          } else if (product.localImagePaths && product.localImagePaths.length > 0) {
            // Convert local paths to full URLs
            const domain = window.location.hostname === 'localhost' 
              ? 'localhost:5000'
              : window.location.host;
            urls = product.localImagePaths.map(path => 
              `https://${domain}${path.startsWith('/') ? path : '/' + path}`
            );
          }
          return urls.join(' | ');
        }
        
        // Return empty string if field is missing
        return (value as string || '').replace(/"/g, '""');
      })
    );

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  };

  const downloadCSV = () => {
    if (scrapedProducts.length === 0) {
      toast({
        title: 'Keine Produkte',
        description: 'Bitte scrapen Sie zuerst Produkte',
        variant: 'destructive',
      });
      return;
    }

    // Get the selected supplier to find the SupplNr
    const selectedSupplier = suppliersData?.suppliers?.find(s => s.id === selectedSupplierId);
    const supplierName = selectedSupplier?.name || 'Unbekannt';

    // Convert scraped products to COMPLETE Brickfox CSV format (same as Pixi Compare)
    const csvData = scrapedProducts.map(product => {
      // Get AI-generated description if available
      const generatedContent = generatedDescriptions.get(product.articleNumber);
      
      // Extract images: Prioritize URLs, then convert local paths to URLs
      let imageUrls: string[] = [];
      
      // First try: Original image URLs from scraping
      if (product.images && product.images.length > 0) {
        imageUrls = product.images;
      }
      // Second try: Convert local paths to full URLs
      else if (product.localImagePaths && product.localImagePaths.length > 0) {
        const domain = window.location.hostname === 'localhost' 
          ? 'http://localhost:5000'
          : `https://${window.location.host}`;
        imageUrls = product.localImagePaths.map(path => 
          `${domain}${path.startsWith('/') ? path : '/' + path}`
        );
      }
      
      // Create separate p_image[1] to p_image[10] columns
      const imageColumns: Record<string, string> = {};
      for (let i = 1; i <= 10; i++) {
        imageColumns[`p_image[${i}]`] = imageUrls[i - 1] || '';
      }
      
      // Helper: Parse price (EXACT backend logic - returns number | null)
      const parsePrice = (price: string | number | null | undefined): number | null => {
        if (price === null || price === undefined) return null;
        if (typeof price === 'number') return price;
        
        const priceStr = String(price);
        let str = priceStr.replace(/[^\d,.-]/g, '').trim();
        
        let normalized = str;
        if (str.includes(',')) {
          normalized = str.replace(/\./g, '').replace(',', '.');
        } else if (str.includes('.')) {
          const dotMatch = str.match(/\.(\d+)$/);
          if (dotMatch && dotMatch[1].length === 3) {
            normalized = str.replace(/\./g, '');
          }
        }
        
        const value = parseFloat(normalized);
        return isNaN(value) ? null : value;
      };
      
      const calculateVKNetto = (ek: number): number => ek * 2;
      const calculateVKBrutto = (ek: number): number => ek * 2 * 1.19;
      
      const ekPrice = parsePrice(product.price);
      const vkPriceNetto = ekPrice !== null ? calculateVKNetto(ekPrice) : null;
      const vkPriceBrutto = ekPrice !== null ? calculateVKBrutto(ekPrice) : null;
      
      return {
        'p_item_number': product.articleNumber?.replace(/-/g, '') || '',  // OHNE Bindestriche: ANS1520-0010 → ANS15200010
        'p_group_path[de]': product.category || '',
        'p_brand': product.manufacturer || '',
        'p_status': '1',
        'p_name[de]': product.productName || '',
        'p_tax_class': '1',
        'p_never_out_of_stock': '1',
        'p_condition': 'Neu',
        'p_country': 'China',
        'p_description[de]': generatedContent?.description || product.description || product.longDescription || '',
        ...imageColumns,
        
        'v_item_number': product.articleNumber?.replace(/-/g, '') || '',  // OHNE Bindestriche
        'v_ean': product.ean || '',
        'v_manufacturers_item_number': product.articleNumber?.replace(/^ANS/, '') || '',
        'v_supplier_item_number': product.articleNumber || '',
        'v_status': '1',
        'v_classification': 'X',
        'v_delivery_time[de]': '3-5 Tage',
        'v_supplier[Eur]': vkPriceBrutto !== null ? vkPriceBrutto.toFixed(2) : '',
        'v_purchase_price': ekPrice !== null ? ekPrice.toFixed(2) : '',
        'v_price[Eur]': ekPrice !== null ? ekPrice.toFixed(2) : '',
        'v_price_net': vkPriceNetto !== null ? vkPriceNetto.toFixed(2) : '',
        'v_price_gross': vkPriceBrutto !== null ? vkPriceBrutto.toFixed(2) : '',
        'v_never_out_of_stock[standard]': '1',
        'v_weight': product.weight || product.gewicht || '',
        'v_length': product.length || product.laenge || '',
        'v_width': product.bodyDiameter || product.breite || '',
        'v_height': product.headDiameter || product.hoehe || '',
        
        'v_capacity_mah': product.nominalkapazitaet || '',
        'v_voltage': product.nominalspannung || '',
        'v_max_discharge_current': product.maxEntladestrom || '',
        'v_cell_chemistry': product.zellenchemie || '',
        'v_energy': product.energie || '',
        'v_color': product.farbe || '',
        
        'v_power_supply': product.powerSupply || '',
        'v_led_1': product.led1 || '',
        'v_led_2': product.led2 || '',
        'v_spot_intensity': product.spotIntensity || '',
        'v_max_output': product.maxOutput || '',
        'v_luminosity': product.luminosity || '',
        'v_runtime': product.runtime || '',
        'v_waterproof': product.waterproof || '',
        
        'p_seo_title[de]': generatedContent?.seoTitle || '',
        'p_seo_description[de]': generatedContent?.seoDescription || '',
        'p_seo_keywords[de]': generatedContent?.seoKeywords || '',
      };
    });

    // Convert to CSV
    if (csvData.length === 0) return;
    
    const headers = Object.keys(csvData[0]);
    const rows = csvData.map(row => 
      headers.map(header => {
        const value = row[header as keyof typeof row] || '';
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',')
    );
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    const csvWithBOM = '\ufeff' + csvContent;
    
    const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `brickfox_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Brickfox CSV heruntergeladen",
      description: `${scrapedProducts.length} Produkte im Brickfox-Format exportiert`,
    });
  };

  const handleSaveToProject = async () => {
    if (!scrapedProduct) return;

    if (selectedProjectId === "new" && !projectName.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie einen Projektnamen ein",
        variant: "destructive",
      });
      return;
    }

    if (selectedProjectId !== "new" && !selectedProjectId) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie ein Projekt aus",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      if (selectedProjectId === "new") {
        // Create new project with single product
        
        // Helper: Extract product type word directly from product name
        const extractProductTypeFromName = (productName: string): string => {
          const words = productName.split(/[\s-]+/);
          // Find product type keywords (usually nouns ending in common patterns)
          const productTypeKeywords = ['lampe', 'batterie', 'akku', 'ladegerät', 'ladestation', 'charger', 'pack'];
          
          for (const word of words) {
            const lowerWord = word.toLowerCase();
            if (productTypeKeywords.some(keyword => lowerWord.includes(keyword))) {
              // Return the capitalized word as found in product name
              return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
          }
          return 'Produkt';
        };
        
        // MediaMarkt V1: Produkttyp (aus Produktname) + Modellcode (z.B. "Taschenlampe NCCG7") - OHNE Marke!
        const productType = extractProductTypeFromName(scrapedProduct.productName);
        const modelCode = (scrapedProduct.articleNumber || '').replace(/^[A-Z]+-/, '').trim();
        const mmV1 = modelCode ? `${productType} ${modelCode}` : productType;
        
        // MediaMarkt V2: Nur Modellcodes (ohne ANS- Präfix)
        const mmV2 = modelCode;

        await apiPost('/api/bulk-save-to-project', {
          projectName: projectName.trim(),
          products: [{
            produktname: scrapedProduct.productName,
            artikelnummer: scrapedProduct.articleNumber || '',
            produktbeschreibung: generatedDescription || '',
            ean: scrapedProduct.ean || '',
            hersteller: scrapedProduct.manufacturer || '',
            preis: scrapedProduct.price || '',
            gewicht: scrapedProduct.weight || '',
            kategorie: scrapedProduct.category || '',
            mediamarktname_v1: mmV1,
            mediamarktname_v2: mmV2,
            seo_beschreibung: scrapedProduct.description?.substring(0, 200) || '',
            source_url: url,
          }],
        });

        toast({
          title: "Projekt erstellt",
          description: `Produkt wurde erfolgreich in "${projectName.trim()}" gespeichert`,
        });
      } else {
        // Add to existing project
        const extractedDataArray = [
          scrapedProduct.ean ? { key: 'ean', value: scrapedProduct.ean, type: 'text' as const } : null,
          scrapedProduct.manufacturer ? { key: 'hersteller', value: scrapedProduct.manufacturer, type: 'text' as const } : null,
          scrapedProduct.price ? { key: 'preis', value: scrapedProduct.price, type: 'text' as const } : null,
          scrapedProduct.weight ? { key: 'gewicht', value: scrapedProduct.weight, type: 'text' as const } : null,
          scrapedProduct.category ? { key: 'kategorie', value: scrapedProduct.category, type: 'text' as const } : null,
        ].filter((item): item is { key: string; value: string; type: 'text' } => item !== null);

        await apiPost(`/api/projects/${selectedProjectId}/products`, {
          name: scrapedProduct.productName,
          articleNumber: scrapedProduct.articleNumber || '',
          htmlCode: generatedDescription || '',
          previewText: scrapedProduct.description?.substring(0, 200) || '',
          exactProductName: scrapedProduct.productName,
          extractedData: extractedDataArray.length > 0 ? extractedDataArray : undefined,
          customAttributes: [
            { key: 'source_url', value: url, type: 'text' },
          ].filter(attr => attr.value),
        });

        const project = projectsData?.projects.find(p => p.id === selectedProjectId);
        toast({
          title: "Produkt hinzugefügt",
          description: `Produkt wurde erfolgreich zu "${project?.name}" hinzugefügt`,
        });
      }

      // Invalidate queries to refresh product counts
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      // Invalidate all product-counts queries
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          Array.isArray(query.queryKey) && 
          query.queryKey[0] === '/api/projects/product-counts'
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${selectedProjectId}/products`] });

      setShowSaveDialog(false);
      setProjectName("");
      setSelectedProjectId("new");

      // Clear scrape session after saving to project
      try {
        const token = localStorage.getItem('supabase_token');
        if (token) {
          await fetch('/api/scrape-session', {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
        }
      } catch (error) {
        console.error('Failed to clear scrape session:', error);
      }

      // Redirect to projects page
      setTimeout(() => {
        setLocation('/projects');
      }, 1000);

    } catch (err) {
      toast({
        title: "Fehler",
        description: err instanceof Error ? err.message : 'Speichern fehlgeschlagen',
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Bulk save all scraped products to project
  const handleBulkSaveToProject = async () => {
    if (scrapedProducts.length === 0) return;

    if (selectedProjectId === "new" && !projectName.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie einen Projektnamen ein",
        variant: "destructive",
      });
      return;
    }

    if (selectedProjectId !== "new" && !selectedProjectId) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie ein Projekt aus",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      // Convert all scraped products to the format expected by the API
      const products = scrapedProducts.map((product) => {
        const generatedContent = generatedDescriptions.get(product.articleNumber);
        
        // Extract ALL fields dynamically (exclude metadata fields)
        const excludeFields = ['articleNumber', 'productName', 'description', 'images', 'localImagePaths'];
        const extractedDataArray: any[] = [];
        
        Object.entries(product).forEach(([key, value]) => {
          if (!excludeFields.includes(key) && value !== undefined && value !== null && value !== '') {
            // Convert camelCase to lowercase (e.g., manufacturer -> hersteller)
            const fieldMap: { [key: string]: string } = {
              'manufacturer': 'hersteller',
              'price': 'preis',
              'weight': 'gewicht'
            };
            const mappedKey = fieldMap[key] || key;
            extractedDataArray.push({ key: mappedKey, value: String(value), type: 'text' as const });
          }
        });
        
        // CRITICAL: Add images, localImagePaths, and pdfFiles to extractedData for Brickfox export
        if (product.images && product.images.length > 0) {
          extractedDataArray.push({ key: 'images', value: JSON.stringify(product.images), type: 'text' as const });
        }
        if (product.localImagePaths && product.localImagePaths.length > 0) {
          extractedDataArray.push({ key: 'localImagePaths', value: JSON.stringify(product.localImagePaths), type: 'text' as const });
        }
        if ((product as any).pdfFiles && (product as any).pdfFiles.length > 0) {
          extractedDataArray.push({ key: 'pdfFiles', value: JSON.stringify((product as any).pdfFiles), type: 'text' as const });
        }
        
        // Helper: Extract product type word directly from product name
        const extractProductTypeFromName = (productName: string): string => {
          const words = productName.split(/[\s-]+/);
          // Find product type keywords (usually nouns ending in common patterns)
          const productTypeKeywords = ['lampe', 'batterie', 'akku', 'ladegerät', 'ladestation', 'charger', 'pack'];
          
          for (const word of words) {
            const lowerWord = word.toLowerCase();
            if (productTypeKeywords.some(keyword => lowerWord.includes(keyword))) {
              // Return the capitalized word as found in product name
              return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
          }
          return 'Produkt';
        };
        
        // MediaMarkt V1: Produkttyp (aus Produktname) + Modellcode (z.B. "Taschenlampe NCCG7") - OHNE Marke!
        const productType = extractProductTypeFromName(product.productName);
        const modelCode = (product.articleNumber || '').replace(/^[A-Z]+-/, '').trim();
        const mmV1 = modelCode ? `${productType} ${modelCode}` : productType;
        
        // MediaMarkt V2: Nur Modellcodes (ohne ANS- Präfix)
        const mmV2 = modelCode;
        
        return {
          produktname: product.productName,
          artikelnummer: product.articleNumber || '',
          produktbeschreibung: generatedContent?.description || '',
          extractedData: extractedDataArray, // ALL scraped fields as array
          mediamarktname_v1: mmV1,
          mediamarktname_v2: mmV2,
          seo_titel: generatedContent?.seoTitle || '',
          seo_beschreibung: generatedContent?.seoDescription || product.description?.substring(0, 200) || '',
          kurzbeschreibung: generatedContent?.seoKeywords || '',
          source_url: url,
          images: product.images || [],
        };
      });

      if (selectedProjectId === "new") {
        // Create new project with all products
        await apiPost('/api/bulk-save-to-project', {
          projectName: projectName.trim(),
          products,
        });

        toast({
          title: "Projekt erstellt",
          description: `${scrapedProducts.length} Produkte wurden erfolgreich in "${projectName.trim()}" gespeichert`,
        });
      } else {
        // Add all products to existing project
        for (const product of scrapedProducts) {
          const generatedContent = generatedDescriptions.get(product.articleNumber);
          const extractedDataArray = [
            product.ean ? { key: 'ean', value: product.ean, type: 'text' as const } : null,
            product.manufacturer ? { key: 'hersteller', value: product.manufacturer, type: 'text' as const } : null,
            product.price ? { key: 'preis', value: product.price, type: 'text' as const } : null,
            product.weight ? { key: 'gewicht', value: product.weight, type: 'text' as const } : null,
            // CRITICAL: Add images and PDFs for Brickfox export (original URLs have priority)
            product.images && product.images.length > 0 ? { key: 'images', value: JSON.stringify(product.images), type: 'text' as const } : null,
            product.localImagePaths && product.localImagePaths.length > 0 ? { key: 'localImagePaths', value: JSON.stringify(product.localImagePaths), type: 'text' as const } : null,
            (product as any).pdfFiles && (product as any).pdfFiles.length > 0 ? { key: 'pdfFiles', value: JSON.stringify((product as any).pdfFiles), type: 'text' as const } : null,
          ].filter((item): item is { key: string; value: string; type: 'text' } => item !== null);

          await apiPost(`/api/projects/${selectedProjectId}/products`, {
            name: product.productName,
            articleNumber: product.articleNumber || '',
            htmlCode: generatedContent?.description || '',
            previewText: generatedContent?.seoDescription || product.description?.substring(0, 200) || '',
            exactProductName: product.productName,
            images: product.images || [], // CRITICAL: Store original image URLs directly
            extractedData: extractedDataArray.length > 0 ? extractedDataArray : undefined,
            customAttributes: [
              { key: 'source_url', value: url, type: 'text' },
            ].filter(attr => attr.value),
          });
        }

        const project = projectsData?.projects.find(p => p.id === selectedProjectId);
        toast({
          title: "Produkte hinzugefügt",
          description: `${scrapedProducts.length} Produkte wurden erfolgreich zu "${project?.name}" hinzugefügt`,
        });
      }

      // Invalidate queries to refresh product counts
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          Array.isArray(query.queryKey) && 
          query.queryKey[0] === '/api/projects/product-counts'
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${selectedProjectId}/products`] });

      setShowBulkSaveDialog(false);
      setProjectName("");
      setSelectedProjectId("new");

      // Clear scrape session after saving to project
      try {
        const token = localStorage.getItem('supabase_token');
        if (token) {
          await fetch('/api/scrape-session', {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
        }
      } catch (error) {
        console.error('Failed to clear scrape session:', error);
      }

      // Redirect to projects page
      setTimeout(() => {
        setLocation('/projects');
      }, 1000);

    } catch (error) {
      toast({
        title: "Fehler",
        description: "Fehler beim Speichern der Produkte",
        variant: "destructive",
      });
      console.error('Error saving products:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Check if coming from PDF Auto-Scraper
  const isFromPdfAutoScraper = window.location.search.includes('from=pdf-auto-scraper');

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">URL Webscraper</h1>
            <p className="text-muted-foreground mt-2">
              Extrahieren Sie Produktdaten direkt von Lieferanten-Websites
            </p>
          </div>
          
          {/* Back to PDF Auto-Scraper button (only shown when coming from PDF-Auto-Scraper) */}
          {isFromPdfAutoScraper && (
            <Button
              variant="outline"
              onClick={() => setLocation('/pdf-auto-scraper')}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Zurück zum PDF-Auto-Scraper
            </Button>
          )}
        </div>

        {/* Scrape Mode Toggle */}
        <Card className="p-6 border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold mb-3 block">Scrape-Modus</Label>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="mode-single"
                    name="scrapeMode"
                    value="single"
                    checked={scrapeMode === 'single'}
                    onChange={() => setScrapeMode('single')}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="mode-single" className="cursor-pointer font-medium">
                    🎯 Einzelnes Produkt (Single)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="mode-batch"
                    name="scrapeMode"
                    value="batch"
                    checked={scrapeMode === 'batch'}
                    onChange={() => setScrapeMode('batch')}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="mode-batch" className="cursor-pointer font-medium">
                    📋 Produktliste (Batch)
                  </Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {scrapeMode === 'single' 
                  ? '⚡ Schnell: Eine Produktdetailseite scrapen'
                  : '⏱️ Batch: Mehrere Produkte aus einer Kategorie/Suchseite scrapen'
                }
              </p>
            </div>
          </div>
        </Card>

        {/* Lieferanten-Shop Scraper */}
        <Card className="p-6">
          <div className="space-y-4">
              <div>
                <Label htmlFor="list-url">
                  {scrapeMode === 'single' ? 'Produkt-URL' : 'Kategorieseiten-URL'}
                </Label>
                <Input
                  id="list-url"
                  type="url"
                  placeholder={
                    scrapeMode === 'single'
                      ? 'https://www.beispiel.de/produkt/name-12345'
                      : 'https://www.beispiel.de/kategorie/akkus'
                  }
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {scrapeMode === 'single'
                    ? 'URL zur Produktdetailseite'
                    : 'URL der Seite mit der Produktliste (z.B. Kategorie- oder Suchseite)'
                  }
                </p>
              </div>

              <div>
                <Label htmlFor="supplier-select">Lieferant auswählen (optional)</Label>
                <Select value={selectedSupplierId} onValueChange={handleSupplierSelect}>
                  <SelectTrigger id="supplier-select" className="mt-2">
                    <SelectValue placeholder="Lieferant wählen oder manuell konfigurieren" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Keine Vorlage (Auto-Erkennung)</SelectItem>
                    {suppliersData?.suppliers?.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  💡 Gespeicherte CSS-Selektoren für diesen Lieferanten laden
                </p>
              </div>


              {/* Single/Batch Mode Options */}
              {scrapeMode === 'single' ? (
                // Single Mode - Simple Selector Option
                <div className="p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 space-y-3">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    ⚙️ CSS-Selektoren für diese Produktseite (optional)
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Wenn der Lieferant keine Vorlage hat oder Auto-Erkennung fehlschlägt, können Sie hier CSS-Selektoren eintragen
                  </p>
                  <div>
                    <Label htmlFor="single-product-name">Produktname Selektor</Label>
                    <Input
                      id="single-product-name"
                      placeholder="h1, .product-title (leer für Auto-Erkennung)"
                      value={selectors.productName}
                      onChange={(e) => setSelectors({...selectors, productName: e.target.value})}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="single-description">Beschreibung Selektor</Label>
                    <Input
                      id="single-description"
                      placeholder=".description, [itemprop='description'] (leer für Auto-Erkennung)"
                      value={selectors.description}
                      onChange={(e) => setSelectors({...selectors, description: e.target.value})}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="single-ean">EAN Selektor</Label>
                    <Input
                      id="single-ean"
                      placeholder=".ean, [itemprop='sku'] (leer für Auto-Erkennung)"
                      value={selectors.ean}
                      onChange={(e) => setSelectors({...selectors, ean: e.target.value})}
                      className="mt-1 text-sm"
                    />
                  </div>
                </div>
              ) : (
                // Batch Mode - Full Options
                <>
                  <div>
                    <Label htmlFor="product-link-selector">Produktlink CSS-Selektor (optional)</Label>
                    <Input
                      id="product-link-selector"
                      placeholder="a.product-link (leer lassen für automatische Erkennung)"
                      value={productLinkSelector}
                      onChange={(e) => setProductLinkSelector(e.target.value)}
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      💡 Leer lassen für intelligente Auto-Erkennung. Nur ausfüllen, wenn die automatische Erkennung fehlschlägt.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="max-products">Maximale Anzahl Produkte</Label>
                    <Input
                      id="max-products"
                      type="number"
                      min="1"
                      value={maxProducts}
                      onChange={(e) => setMaxProducts(parseInt(e.target.value) || 50)}
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      💡 Sie können beliebig viele Produkte scrapen
                    </p>
                  </div>

                  {/* Pagination Options */}
                  <div className="p-4 border rounded-lg bg-muted/20 space-y-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="enable-pagination"
                        checked={enablePagination}
                        onCheckedChange={(checked) => setEnablePagination(!!checked)}
                      />
                      <Label htmlFor="enable-pagination" className="cursor-pointer font-medium">
                        🔄 Alle Seiten scrapen (Paginierung)
                      </Label>
                    </div>
                    
                    {enablePagination && (
                      <>
                        <div>
                          <Label htmlFor="pagination-selector" className="text-sm">Pagination CSS-Selektor (optional)</Label>
                          <Input
                            id="pagination-selector"
                            placeholder="a[rel='next'], .pagination .next (leer für Auto-Erkennung)"
                            value={paginationSelector}
                            onChange={(e) => setPaginationSelector(e.target.value)}
                            className="mt-2 text-sm"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            💡 Selektor für den "Nächste Seite"-Button. Leer lassen für automatische Erkennung.
                          </p>
                        </div>
                        
                        <div>
                          <Label htmlFor="max-pages" className="text-sm">Maximale Seitenanzahl</Label>
                          <Input
                            id="max-pages"
                            type="number"
                            min="1"
                            value={maxPages}
                            onChange={(e) => setMaxPages(parseInt(e.target.value) || 10)}
                            className="mt-2 text-sm"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            💡 Sie können beliebig viele Seiten scrapen
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <Button 
                  onClick={scrapeMode === 'single' ? handleScrapeSingleProduct : handleScrapeProductList} 
                  disabled={isLoading} 
                  className="flex-1"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {batchProgress.status}
                    </>
                  ) : (
                    <>
                      {scrapeMode === 'single' ? (
                        <>
                          <Globe className="w-4 h-4 mr-2" />
                          Produkt scrapen
                        </>
                      ) : (
                        <>
                          <List className="w-4 h-4 mr-2" />
                          Produktliste scrapen
                        </>
                      )}
                    </>
                  )}
                </Button>

                {isLoading && batchProgress.total > 0 && (
                  <Button
                    onClick={() => {
                      abortScrapingRef.current = true;
                      toast({
                        title: "Wird abgebrochen...",
                        description: "Das Scraping wird nach dem aktuellen Produkt gestoppt",
                      });
                    }}
                    variant="destructive"
                  >
                    Abbrechen
                  </Button>
                )}
              </div>

              {isLoading && batchProgress.total > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{batchProgress.status}</span>
                    <span className="font-semibold">
                      {batchProgress.current} / {batchProgress.total}
                      <span className="text-muted-foreground ml-2">
                        ({Math.round((batchProgress.current / batchProgress.total) * 100)}%)
                      </span>
                    </span>
                  </div>
                  <Progress value={(batchProgress.current / batchProgress.total) * 100} />
                </div>
              )}
          </div>

          {/* Advanced Selectors */}
          <div className="mt-4 space-y-4">
            {selectedSupplierId !== "__none__" ? (
              <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                <p className="text-sm font-medium text-green-900 dark:text-green-100 flex items-center gap-2">
                  ✅ Lieferanten-Selektoren geladen
                </p>
                <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                  {suppliersData?.suppliers?.find(s => s.id === selectedSupplierId)?.name} Selektoren werden automatisch beim Scraping verwendet
                </p>
              </div>
            ) : (
              <>
                <div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="advanced"
                      checked={showAdvanced}
                      onCheckedChange={(checked) => setShowAdvanced(!!checked)}
                    />
                    <Label htmlFor="advanced" className="cursor-pointer">
                      <Settings2 className="w-4 h-4 inline mr-1" />
                      Erweiterte CSS-Selektoren
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Standard-Selektoren funktionieren für die meisten Websites. Nur bei Bedarf anpassen.
                  </p>
                </div>

                {showAdvanced && (
              <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/30">
                <div>
                  <Label className="text-xs">Artikelnummer Selector</Label>
                  <Input
                    placeholder='.product-code'
                    value={selectors.articleNumber}
                    onChange={(e) => setSelectors({...selectors, articleNumber: e.target.value})}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Produktname Selector</Label>
                  <Input
                    placeholder='h1.product-title'
                    value={selectors.productName}
                    onChange={(e) => setSelectors({...selectors, productName: e.target.value})}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">EAN Selector</Label>
                  <Input
                    placeholder='.ean'
                    value={selectors.ean}
                    onChange={(e) => setSelectors({...selectors, ean: e.target.value})}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Hersteller Selector</Label>
                  <Input
                    placeholder='.brand'
                    value={selectors.manufacturer}
                    onChange={(e) => setSelectors({...selectors, manufacturer: e.target.value})}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Preis Selector</Label>
                  <Input
                    placeholder='.price'
                    value={selectors.price}
                    onChange={(e) => setSelectors({...selectors, price: e.target.value})}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Beschreibung Selector</Label>
                  <Input
                    placeholder='.product-description'
                    value={selectors.description}
                    onChange={(e) => setSelectors({...selectors, description: e.target.value})}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Bilder Selector</Label>
                  <Input
                    placeholder='.product-image img'
                    value={selectors.images}
                    onChange={(e) => setSelectors({...selectors, images: e.target.value})}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Gewicht Selector</Label>
                  <Input
                    placeholder='.weight'
                    value={selectors.weight}
                    onChange={(e) => setSelectors({...selectors, weight: e.target.value})}
                    className="text-sm"
                  />
                </div>
              </div>
                )}
              </>
            )}
          </div>
        </Card>

        {/* Scraped Data Display */}
        {scrapedProduct && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Extrahierte Produktdaten</h3>
            
            {/* Tabelle mit allen Feldern */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Feldname</TableHead>
                    <TableHead>Extrahierter Wert</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(scrapedProduct).map(([key, value]) => {
                    // Skip images array, we'll show it separately
                    if (key === 'images') return null;
                    
                    // Skip empty values
                    if (!value) return null;
                    
                    // Skip description if it's an HTML object or auto-extracted flag
                    if (key === 'autoExtractedDescription' || key === 'technicalDataTable' || key === 'pdfManualUrl' || key === 'safetyWarnings' || key === 'rawHtml') return null;
                    
                    // German field name mapping (Nitecore selector names)
                    const fieldNameMap: Record<string, string> = {
                      articleNumber: 'Artikelnummer',
                      productName: 'Produktname',
                      ean: 'EAN',
                      manufacturer: 'Hersteller',
                      price: 'Preis',
                      weight: 'Gewicht (g)',
                      description: 'Beschreibung',
                      length: 'Länge (mm)',
                      bodyDiameter: 'Gehäusedurchmesser (mm)',
                      headDiameter: 'Kopfdurchmesser (mm)',
                      weightWithoutBattery: 'Gewicht ohne Batterie (g)',
                      totalWeight: 'Gesamt Gewicht (g)',
                      powerSupply: 'Stromversorgung',
                      led1: 'Leuchtmittel 1',
                      led2: 'Leuchtmittel 2',
                      spotIntensity: 'Spotintensität (cd)',
                      maxLuminosity: 'Leuchtleistung max. (Lumen)',
                      maxBeamDistance: 'Max. Leuchtweite (m)',
                    };
                    
                    const fieldName = fieldNameMap[key] || key;
                    
                    return (
                      <TableRow key={key}>
                        <TableCell className="font-medium text-muted-foreground">{fieldName}</TableCell>
                        <TableCell className="font-mono text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 break-words">
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </div>
                            {key === 'description' && value && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="shrink-0 h-8 px-2"
                                onClick={() => {
                                  navigator.clipboard.writeText(String(value));
                                  toast({
                                    title: "Kopiert!",
                                    description: "Beschreibung wurde in die Zwischenablage kopiert",
                                  });
                                }}
                              >
                                📋
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  
                </TableBody>
              </Table>
            </div>

            {/* Image Gallery */}
            {scrapedProduct.images && scrapedProduct.images.length > 0 && (
              <div className="mt-6 border-t pt-6">
                <h4 className="text-md font-semibold mb-3">
                  Produktbilder ({scrapedProduct.images.length} gefunden)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {scrapedProduct.images.map((imgUrl, index) => (
                    <div key={index} className="relative group">
                      <img 
                        src={imgUrl} 
                        alt={`Produktbild ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-400 transition-all cursor-pointer"
                        onClick={() => window.open(imgUrl, '_blank')}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3EFehler%3C/text%3E%3C/svg%3E';
                        }}
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded-lg transition-all pointer-events-none" />
                      <span className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                        #{index + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex gap-2">
              <Button onClick={handleGenerateDescription} disabled={isGenerating}>
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    AI generiert...
                  </>
                ) : (
                  'AI-Beschreibung generieren'
                )}
              </Button>
              <Button 
                variant="outline" 
                disabled={!scrapedProduct}
                onClick={() => setShowSaveDialog(true)}
              >
                Zu Projekt hinzufügen
              </Button>
            </div>
          </Card>
        )}

        {/* Product List Preview */}
        {scrapedProducts.length > 0 && (
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Gescrapte Produkte ({scrapedProducts.length})</h3>
              <div className="flex gap-2">
                <Button 
                  onClick={handleGenerateAllDescriptions} 
                  variant="default"
                  disabled={isGeneratingBatch}
                >
                  {isGeneratingBatch ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {aiGenerationProgress.current}/{aiGenerationProgress.total} generiert...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Alle AI-Beschreibungen generieren
                    </>
                  )}
                </Button>
                <Button 
                  onClick={() => setShowBulkSaveDialog(true)} 
                  variant="default"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Als Projekt speichern
                </Button>
                <Button onClick={downloadCSV} variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  CSV Exportieren
                </Button>
                <Button 
                  onClick={handlePixiCompare} 
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Database className="w-4 h-4 mr-2" />
                  Mit Pixi vergleichen
                </Button>
              </div>
            </div>

            {/* AI Generation Progress Bar */}
            {isGeneratingBatch && (
              <div className="mb-4">
                <Progress value={(aiGenerationProgress.current / aiGenerationProgress.total) * 100} className="h-2" />
                <p className="text-sm text-muted-foreground mt-1">
                  Generiere MediaMarkt-Beschreibungen: {aiGenerationProgress.current} von {aiGenerationProgress.total}
                </p>
              </div>
            )}
            
            {/* Info Banner */}
            <div className="mb-4 p-4 bg-primary/10 rounded-lg border border-primary/20">
              <p className="text-sm text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <strong>KI-Felder (blau markiert)</strong> werden nach Klick auf "Alle AI-Beschreibungen generieren" automatisch befüllt
              </p>
            </div>
            
            <div className="border rounded-lg">
              <div className="mb-2 p-3 bg-blue-50 border-b text-sm">
                <p className="text-blue-900 font-medium">
                  {selectedSupplierId !== "__none__" && suppliersData?.suppliers
                    ? `📌 Lieferant: ${suppliersData.suppliers.find((s: any) => s.id === selectedSupplierId)?.name || 'Unbekannt'}`
                    : '📌 Auto-Erkennung aktiv'}
                </p>
              </div>
              <div className="max-h-96 overflow-auto">
                <Table>
                  <TableHeader className="bg-muted sticky top-0 z-20">
                    <TableRow>
                      <TableHead className="w-12 sticky left-0 bg-muted z-20">#</TableHead>
                      {getSupplierColumns(selectedSupplierId, suppliersData?.suppliers || []).map(col => (
                        <TableHead key={col} className={`${getColumnWidth(col)} font-semibold`}>
                          {getColumnLabel(col)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scrapedProducts
                      .slice((currentPage - 1) * productsPerPage, currentPage * productsPerPage)
                      .map((product, index) => {
                        const absoluteIndex = (currentPage - 1) * productsPerPage + index;
                        const columns = getSupplierColumns(selectedSupplierId, suppliersData?.suppliers || []);
                        
                        return (
                          <TableRow key={absoluteIndex}>
                            <TableCell className="font-mono text-sm sticky left-0 bg-white z-10">
                              {absoluteIndex + 1}
                            </TableCell>
                            {columns.map(col => (
                              <TableCell key={`${absoluteIndex}-${col}`} className={`text-sm ${getColumnWidth(col)}`}>
                                {col === 'images' ? (
                                  (() => {
                                    const displayImages = product.localImagePaths && product.localImagePaths.length > 0 
                                      ? product.localImagePaths.map((path: string) => {
                                          const domain = window.location.hostname === 'localhost' 
                                            ? 'http://localhost:5000'
                                            : `https://${window.location.host}`;
                                          return `${domain}${path.startsWith('/') ? path : '/' + path}`;
                                        })
                                      : product.images && product.images.length > 0 
                                        ? product.images 
                                        : [];
                                    
                                    return displayImages.length > 0 ? (
                                      <div className="flex items-center gap-2">
                                        <div 
                                          className="relative cursor-pointer group"
                                          onClick={() => {
                                            setSelectedProductImages({
                                              images: displayImages,
                                              productName: product.productName,
                                              articleNumber: product.articleNumber
                                            });
                                            setCurrentImageIndex(0);
                                            setShowImageGallery(true);
                                          }}
                                        >
                                          <img 
                                            src={displayImages[0]} 
                                            alt={product.productName}
                                            className="w-12 h-12 object-cover rounded border group-hover:ring-2 group-hover:ring-primary"
                                            onError={(e) => {
                                              (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="%23e5e7eb"/></svg>';
                                            }}
                                          />
                                        </div>
                                        <span className="text-xs text-muted-foreground">{displayImages.length}</span>
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground text-xs">0</span>
                                    );
                                  })()
                                ) : (
                                  <div className="truncate" title={getProductValue(product, col)}>
                                    {getProductValue(product, col)}
                                  </div>
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination */}
              {scrapedProducts.length > productsPerPage && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
                  <div className="text-sm text-muted-foreground">
                    Zeige {((currentPage - 1) * productsPerPage) + 1} bis {Math.min(currentPage * productsPerPage, scrapedProducts.length)} von {scrapedProducts.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      Zurück
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(Math.ceil(scrapedProducts.length / productsPerPage), currentPage + 1))}
                      disabled={currentPage === Math.ceil(scrapedProducts.length / productsPerPage)}
                    >
                      Weiter
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* HTML Preview (Fließtext) */}
        {generatedDescription && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">HTML-Vorschau (Fließtext)</h3>
            <div className="p-6 bg-white dark:bg-gray-900 border rounded-lg max-h-96 overflow-y-auto">
              <style dangerouslySetInnerHTML={{ __html: `
                .product-preview h2 { font-size: 1.5rem; font-weight: bold; margin-bottom: 1rem; }
                .product-preview h3 { font-size: 1.25rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.75rem; }
                .product-preview h4 { font-size: 1.1rem; font-weight: 600; margin-top: 1rem; margin-bottom: 0.5rem; }
                .product-preview p { margin: 0.75rem 0; line-height: 1.6; }
                .product-preview table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
                .product-preview table th,
                .product-preview table td { border: 1px solid #e5e7eb; padding: 0.75rem; text-align: left; }
                .product-preview table th { background-color: #f3f4f6; font-weight: 600; }
                .product-preview table tr:nth-child(even) { background-color: #f9fafb; }
                .product-preview .properties-label { font-weight: 600; width: 40%; }
                .product-preview .properties-value { width: 60%; }
                .dark .product-preview table th,
                .dark .product-preview table td { border-color: #374151; }
                .dark .product-preview table th { background-color: #1f2937; }
                .dark .product-preview table tr:nth-child(even) { background-color: #111827; }
              ` }} />
              <div 
                className="product-preview"
                dangerouslySetInnerHTML={{ __html: generatedDescription }} 
              />
            </div>
          </Card>
        )}

        {/* Save to Project Dialog */}
        <Dialog open={showSaveDialog} onOpenChange={(open) => {
          setShowSaveDialog(open);
          if (!open) {
            setProjectName("");
            setSelectedProjectId("new");
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Zu Projekt hinzufügen</DialogTitle>
              <DialogDescription>
                Speichern Sie das gescrapte Produkt in "Meine Projekte"
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
                  disabled={isSaving}
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
                    {projectsData?.projects && projectsData.projects.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Bestehende Projekte
                        </div>
                        {projectsData.projects.map(project => (
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
                    placeholder="z.B. Webscraping Dezember 2024"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isSaving) {
                        handleSaveToProject();
                      }
                    }}
                    disabled={isSaving}
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowSaveDialog(false)}
                disabled={isSaving}
              >
                Abbrechen
              </Button>
              <Button
                onClick={handleSaveToProject}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Speichern...
                  </>
                ) : (
                  'Speichern'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* HTML Preview Dialog */}
        <Dialog open={showHtmlPreview} onOpenChange={setShowHtmlPreview}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Produktbeschreibung Vorschau</DialogTitle>
              <DialogDescription>
                So würde die Beschreibung im MediaMarkt-Shop aussehen
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-6 bg-white border rounded-lg overflow-y-auto" style={{ maxHeight: '70vh' }}>
                <div dangerouslySetInnerHTML={{ __html: htmlPreviewContent }} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button 
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(htmlPreviewContent);
                    toast({ title: "Kopiert", description: "HTML wurde in die Zwischenablage kopiert" });
                  }}
                >
                  HTML kopieren
                </Button>
                <Button onClick={() => setShowHtmlPreview(false)}>
                  Schließen
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* SEO Title Preview Dialog */}
        <Dialog open={showSeoTitlePreview} onOpenChange={setShowSeoTitlePreview}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>SEO Produkttitel</DialogTitle>
              <DialogDescription>
                Vollständiger SEO-optimierter Titel für Suchmaschinen (max. 70 Zeichen)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-6 bg-muted/50 border rounded-lg">
                <p className="text-lg font-semibold leading-relaxed" style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
                  {seoTitlePreviewContent}
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button 
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(seoTitlePreviewContent);
                    toast({ title: "Kopiert", description: "SEO-Titel wurde in die Zwischenablage kopiert" });
                  }}
                >
                  Text kopieren
                </Button>
                <Button onClick={() => setShowSeoTitlePreview(false)}>
                  Schließen
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* SEO Description Preview Dialog */}
        <Dialog open={showSeoPreview} onOpenChange={setShowSeoPreview}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>SEO Produktbeschreibung</DialogTitle>
              <DialogDescription>
                Vollständige SEO-optimierte Beschreibung für Suchmaschinen
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-6 bg-muted/50 border rounded-lg">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{seoPreviewContent}</p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button 
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(seoPreviewContent);
                    toast({ title: "Kopiert", description: "SEO-Beschreibung wurde in die Zwischenablage kopiert" });
                  }}
                >
                  Text kopieren
                </Button>
                <Button onClick={() => setShowSeoPreview(false)}>
                  Schließen
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* SEO Keywords Preview Dialog */}
        <Dialog open={showKeywordsPreview} onOpenChange={setShowKeywordsPreview}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>SEO Keywords</DialogTitle>
              <DialogDescription>
                AI-generierte Keywords für optimale Suchmaschinenoptimierung
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-6 bg-muted/50 border rounded-lg overflow-y-auto" style={{ maxHeight: '60vh' }}>
                <p className="text-sm leading-relaxed">{keywordsPreviewContent}</p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button 
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(keywordsPreviewContent);
                    toast({ title: "Kopiert", description: "Keywords wurden in die Zwischenablage kopiert" });
                  }}
                >
                  Text kopieren
                </Button>
                <Button onClick={() => setShowKeywordsPreview(false)}>
                  Schließen
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Full View Dialog */}
        <Dialog open={showFullView} onOpenChange={setShowFullView}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Vollständige Produktinformationen</DialogTitle>
              <DialogDescription>
                Alle AI-generierten Inhalte im Detail
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              {/* SEO Title */}
              <div>
                <Label className="text-sm font-semibold mb-2 block">SEO-Titel</Label>
                <div className="p-4 bg-muted rounded-lg border">
                  <p className="text-sm">{fullViewContent.title}</p>
                </div>
              </div>

              {/* SEO Description */}
              <div>
                <Label className="text-sm font-semibold mb-2 block">SEO-Beschreibung</Label>
                <div className="p-4 bg-muted rounded-lg border">
                  <p className="text-sm">{fullViewContent.seoDescription}</p>
                </div>
              </div>

              {/* Keywords */}
              <div>
                <Label className="text-sm font-semibold mb-2 block">Keywords</Label>
                <div className="p-4 bg-muted rounded-lg border">
                  <p className="text-sm">{fullViewContent.keywords}</p>
                </div>
              </div>

              {/* HTML Description */}
              <div>
                <Label className="text-sm font-semibold mb-2 block">HTML-Beschreibung</Label>
                <div className="p-4 bg-muted rounded-lg border max-h-96 overflow-y-auto">
                  <pre className="text-xs whitespace-pre-wrap break-words font-mono">{fullViewContent.html}</pre>
                </div>
              </div>

              {/* Preview */}
              <div>
                <Label className="text-sm font-semibold mb-2 block">HTML-Vorschau</Label>
                <div className="p-6 bg-white border rounded-lg max-h-96 overflow-y-auto">
                  <div dangerouslySetInnerHTML={{ __html: fullViewContent.html }} />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button 
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(fullViewContent.html);
                    toast({ title: "Kopiert", description: "HTML wurde in die Zwischenablage kopiert" });
                  }}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  HTML kopieren
                </Button>
                <Button onClick={() => setShowFullView(false)}>
                  Schließen
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* SERP Snippet Preview Dialog */}
        <Dialog open={showSerpPreview} onOpenChange={setShowSerpPreview}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>SERP Snippet Vorschau</DialogTitle>
              <DialogDescription>
                So würde Ihr Produkt in Google-Suchergebnissen erscheinen
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              
              {/* Google SERP Preview */}
              <div className="p-6 bg-white border rounded-lg">
                <div className="space-y-2">
                  {/* URL Breadcrumb */}
                  <div className="flex items-center gap-1 text-sm text-gray-700">
                    <span className="font-normal">www.ihr-shop.de</span>
                    <span>›</span>
                    <span className="truncate max-w-md">{serpPreviewData.productName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}</span>
                  </div>
                  
                  {/* Meta Title */}
                  <div>
                    <h3 className="text-xl text-blue-600 hover:underline cursor-pointer font-normal leading-snug">
                      {serpPreviewData.title || 'SEO Titel wird hier angezeigt...'}
                    </h3>
                  </div>
                  
                  {/* Meta Description */}
                  <div>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {serpPreviewData.description || 'SEO Beschreibung wird hier angezeigt...'}
                    </p>
                  </div>
                </div>
              </div>

              {/* SEO Quality Metrics */}
              <div className="space-y-4">
                <h4 className="font-semibold text-sm">SEO-Qualitätsanalyse</h4>
                
                {/* Meta Title Metrics */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">Meta Title</span>
                    <span className={`font-semibold ${
                      (serpPreviewData.title.length * 8.5) >= 300 && (serpPreviewData.title.length * 8.5) <= 580 ? 'text-green-600' :
                      (serpPreviewData.title.length * 8.5) >= 200 && (serpPreviewData.title.length * 8.5) < 300 ? 'text-yellow-600' :
                      (serpPreviewData.title.length * 8.5) > 580 && (serpPreviewData.title.length * 8.5) <= 620 ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {Math.round(serpPreviewData.title.length * 8.5)} / 580 pixels
                    </span>
                  </div>
                  <div className="relative w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        (serpPreviewData.title.length * 8.5) >= 300 && (serpPreviewData.title.length * 8.5) <= 580 ? 'bg-green-500' :
                        (serpPreviewData.title.length * 8.5) >= 200 && (serpPreviewData.title.length * 8.5) < 300 ? 'bg-yellow-500' :
                        (serpPreviewData.title.length * 8.5) > 580 && (serpPreviewData.title.length * 8.5) <= 620 ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${Math.min((serpPreviewData.title.length * 8.5 / 580) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(serpPreviewData.title.length * 8.5) >= 300 && (serpPreviewData.title.length * 8.5) <= 580 ? 
                      '✓ Perfekte Länge - wird vollständig in Google angezeigt' :
                     (serpPreviewData.title.length * 8.5) < 300 ? 
                      '⚠ Etwas kurz - nutzen Sie mehr Platz für Keywords' :
                      '✗ Zu lang - wird in Google abgeschnitten'}
                  </p>
                </div>

                {/* Meta Description Metrics */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">Meta Description</span>
                    <span className={`font-semibold ${
                      (serpPreviewData.description.length * 6.3) >= 600 && (serpPreviewData.description.length * 6.3) <= 1000 ? 'text-green-600' :
                      (serpPreviewData.description.length * 6.3) >= 450 && (serpPreviewData.description.length * 6.3) < 600 ? 'text-yellow-600' :
                      (serpPreviewData.description.length * 6.3) > 1000 && (serpPreviewData.description.length * 6.3) <= 1100 ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {Math.round(serpPreviewData.description.length * 6.3)} / 1000 pixels
                    </span>
                  </div>
                  <div className="relative w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        (serpPreviewData.description.length * 6.3) >= 600 && (serpPreviewData.description.length * 6.3) <= 1000 ? 'bg-green-500' :
                        (serpPreviewData.description.length * 6.3) >= 450 && (serpPreviewData.description.length * 6.3) < 600 ? 'bg-yellow-500' :
                        (serpPreviewData.description.length * 6.3) > 1000 && (serpPreviewData.description.length * 6.3) <= 1100 ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${Math.min((serpPreviewData.description.length * 6.3 / 1000) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(serpPreviewData.description.length * 6.3) >= 600 && (serpPreviewData.description.length * 6.3) <= 1000 ? 
                      '✓ Perfekte Länge - wird vollständig in Google angezeigt' :
                     (serpPreviewData.description.length * 6.3) < 600 ? 
                      '⚠ Etwas kurz - fügen Sie mehr Details hinzu' :
                      '✗ Zu lang - wird in Google gekürzt'}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button 
                  variant="outline"
                  onClick={() => {
                    const copyText = `Meta Title: ${serpPreviewData.title}\n\nMeta Description: ${serpPreviewData.description}`;
                    navigator.clipboard.writeText(copyText);
                    toast({ title: "Kopiert", description: "SERP-Daten wurden in die Zwischenablage kopiert" });
                  }}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  SERP-Daten kopieren
                </Button>
                <Button onClick={() => setShowSerpPreview(false)}>
                  Schließen
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk Save Dialog */}
        <Dialog open={showBulkSaveDialog} onOpenChange={(open) => {
          setShowBulkSaveDialog(open);
          if (!open) {
            setProjectName("");
            setSelectedProjectId("new");
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Alle Produkte als Projekt speichern</DialogTitle>
              <DialogDescription>
                Speichern Sie {scrapedProducts.length} gescrapte Produkte in "Meine Projekte"
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div>
                <Label htmlFor="bulk-project-select" className="mb-2 block">
                  Projekt wählen
                </Label>
                <Select
                  value={selectedProjectId}
                  onValueChange={setSelectedProjectId}
                  disabled={isSaving}
                >
                  <SelectTrigger id="bulk-project-select">
                    <SelectValue placeholder="Projekt auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">
                      <div className="flex items-center">
                        <FolderPlus className="w-4 h-4 mr-2" />
                        Neues Projekt erstellen
                      </div>
                    </SelectItem>
                    {projectsData?.projects && projectsData.projects.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Bestehende Projekte
                        </div>
                        {projectsData.projects.map(project => (
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
                  <Label htmlFor="bulk-project-name" className="mb-2 block">
                    Name für neues Projekt
                  </Label>
                  <Input
                    id="bulk-project-name"
                    placeholder="z.B. Webscraping Dezember 2024"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isSaving) {
                        handleBulkSaveToProject();
                      }
                    }}
                    disabled={isSaving}
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowBulkSaveDialog(false)}
                disabled={isSaving}
              >
                Abbrechen
              </Button>
              <Button
                onClick={handleBulkSaveToProject}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Speichere...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {scrapedProducts.length} Produkte speichern
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Image Gallery Dialog */}
        <Dialog open={showImageGallery} onOpenChange={setShowImageGallery}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>
                {selectedProductImages.productName}
              </DialogTitle>
              <DialogDescription>
                Artikelnummer: {selectedProductImages.articleNumber} • {selectedProductImages.images.length} {selectedProductImages.images.length === 1 ? 'Bild' : 'Bilder'}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Main Image Display */}
              <div className="relative bg-muted rounded-lg overflow-hidden aspect-square flex items-center justify-center">
                {selectedProductImages.images.length > 0 && (
                  <img 
                    src={selectedProductImages.images[currentImageIndex]} 
                    alt={`${selectedProductImages.productName} - Bild ${currentImageIndex + 1}`}
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="%23e5e7eb"/><text x="200" y="200" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="24">Bild nicht verfügbar</text></svg>';
                    }}
                  />
                )}
                
                {/* Navigation Arrows */}
                {selectedProductImages.images.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
                      onClick={() => setCurrentImageIndex(prev => prev === 0 ? selectedProductImages.images.length - 1 : prev - 1)}
                    >
                      <ArrowLeft className="w-6 h-6" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
                      onClick={() => setCurrentImageIndex(prev => prev === selectedProductImages.images.length - 1 ? 0 : prev + 1)}
                    >
                      <Eye className="w-6 h-6 rotate-180" />
                    </Button>
                  </>
                )}
                
                {/* Image Counter */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-3 py-1 rounded-full text-sm">
                  {currentImageIndex + 1} / {selectedProductImages.images.length}
                </div>
              </div>
              
              {/* Thumbnail Strip */}
              {selectedProductImages.images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {selectedProductImages.images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={`relative shrink-0 w-20 h-20 rounded border-2 overflow-hidden transition-all ${
                        idx === currentImageIndex 
                          ? 'border-primary ring-2 ring-primary' 
                          : 'border-muted hover:border-primary/50'
                      }`}
                    >
                      <img 
                        src={img} 
                        alt={`Thumbnail ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="%23e5e7eb"/><text x="40" y="40" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="10">-</text></svg>';
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}
              
              {/* Image URL */}
              <div className="p-3 bg-muted rounded-lg">
                <Label className="text-xs text-muted-foreground mb-1 block">Bild-URL:</Label>
                <div className="flex items-center gap-2">
                  <code className="text-xs flex-1 break-all">
                    {selectedProductImages.images[currentImageIndex]}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedProductImages.images[currentImageIndex]);
                      toast({ title: "URL kopiert", description: "Bild-URL wurde in die Zwischenablage kopiert" });
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
