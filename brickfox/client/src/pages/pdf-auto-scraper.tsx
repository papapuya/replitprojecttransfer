import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, Loader2, ExternalLink, ArrowRight, Mail, Database, GitCompare } from 'lucide-react';
import { useLocation } from 'wouter';
import Papa from 'papaparse';

interface PDFProduct {
  productName: string;
  url: string | null;
  articleNumber: string | null;
  manufacturerArticleNumber?: string | null;  // Hersteller-Artikelnummer (ohne Präfix)
  eanCode: string | null;
  ekPrice: string | null;
  description: string | null;
  marke: string | null;
  ve: string | null;
  liefermenge: string | null;
  images?: string[];  // Bild-URLs vom URL-Scraper
  localImagePaths?: string[];  // Lokale Bildpfade
}

interface PDFPreviewResult {
  success: boolean;
  totalProducts: number;
  products: PDFProduct[]; // Legacy: products with URL
  withURL: PDFProduct[];
  withoutURL: PDFProduct[];
}

export default function PDFAutoScraper() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedProducts, setExtractedProducts] = useState<PDFProduct[]>([]);
  const [productsWithoutURL, setProductsWithoutURL] = useState<PDFProduct[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("__none__");
  const [activeTab, setActiveTab] = useState<'withURL' | 'withoutURL'>('withURL');
  
  // CSV Raw Data for dynamic columns
  const [csvRawDataWithURL, setCsvRawDataWithURL] = useState<Record<string, string>[]>([]);
  const [csvRawDataWithoutURL, setCsvRawDataWithoutURL] = useState<Record<string, string>[]>([]);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  
  // Email Dialog State
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('Anfrage: Produkt-URLs für EAN-Codes');
  const [emailMessage, setEmailMessage] = useState(`Sehr geehrte Damen und Herren,

wir benötigen für folgende Produkte (EAN-Codes) die entsprechenden Produkt-URLs:

[Die EAN-Codes werden automatisch unten angefügt]

Bitte senden Sie uns die URLs zu den aufgelisteten EAN-Codes.

Vielen Dank im Voraus!`);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const productsPerPage = 6;

  // ===== SCRAPE SESSION PERSISTENCE =====
  // Save scraped data to server session (persists across page navigation)
  const saveScrapeSession = async (products: PDFProduct[], productsNoUrl: PDFProduct[]) => {
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
          pdfScraper: {
            withURL: products,
            withoutURL: productsNoUrl,
            supplierId: selectedSupplierId,
          },
        }),
      });
      
    } catch (error) {
      console.error('Failed to save PDF scrape session:', error);
    }
  };

  // Load extracted products from sessionStorage on mount (when returning from URL-Scraper)
  useEffect(() => {
    const savedProducts = sessionStorage.getItem('pdf_auto_scraper_extracted_products');
    const savedProductsWithoutURL = sessionStorage.getItem('pdf_auto_scraper_products_without_url');
    const savedSupplierId = sessionStorage.getItem('pdf_auto_scraper_selected_supplier');
    const scrapedData = sessionStorage.getItem('pdf_url_scraped_data');
    
    if (savedProducts) {
      try {
        let products = JSON.parse(savedProducts);
        
        // Merge scraped data (images, descriptions, etc.) if available
        if (scrapedData) {
          const urlToScrapedData = JSON.parse(scrapedData);
          
          products = products.map((product: PDFProduct) => {
            if (product.url && urlToScrapedData[product.url]) {
              const scraped = urlToScrapedData[product.url];
              return {
                ...product,
                images: scraped.images || [],
                localImagePaths: scraped.localImagePaths || [],
                description: scraped.description || product.description,
              };
            }
            return product;
          });
          
          // CRITICAL: Save merged data back to sessionStorage so images persist across navigation
          sessionStorage.setItem('pdf_auto_scraper_extracted_products', JSON.stringify(products));
          
          // Clear scraped data after merging
          sessionStorage.removeItem('pdf_url_scraped_data');
          
          toast({
            title: 'Scraping-Daten übernommen',
            description: `Bilder und Beschreibungen wurden von ${Object.keys(urlToScrapedData).length} Produkten übernommen`,
          });
        }
        
        setExtractedProducts(products);
      } catch (error) {
        console.error('Failed to parse saved products:', error);
      }
    }
    
    if (savedProductsWithoutURL) {
      try {
        const products = JSON.parse(savedProductsWithoutURL);
        setProductsWithoutURL(products);
      } catch (error) {
        console.error('Failed to parse saved products without URL:', error);
      }
    }
    
    if (savedSupplierId) {
      setSelectedSupplierId(savedSupplierId);
    }
  }, []);

  // Load scraped data from server session on mount (restore after navigation)
  useEffect(() => {
    const loadScrapeSession = async () => {
      try {
        const token = localStorage.getItem('supabase_token');
        if (!token) return;
        
        // Don't load if we already have sessionStorage data
        const hasSessionStorage = sessionStorage.getItem('pdf_auto_scraper_extracted_products');
        if (hasSessionStorage) return;
        
        const response = await fetch('/api/scrape-session', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (!response.ok) return;
        
        const { success, session } = await response.json();
        
        if (success && session && session.scrapedProducts) {
          const pdfScraperData = session.scrapedProducts.pdfScraper;
          
          if (pdfScraperData) {
            if (pdfScraperData.withURL && Array.isArray(pdfScraperData.withURL) && pdfScraperData.withURL.length > 0) {
              setExtractedProducts(pdfScraperData.withURL);
            }
            
            if (pdfScraperData.withoutURL && Array.isArray(pdfScraperData.withoutURL)) {
              setProductsWithoutURL(pdfScraperData.withoutURL);
            }
            
            if (pdfScraperData.supplierId) {
              setSelectedSupplierId(pdfScraperData.supplierId);
            }
            
            const totalProducts = (pdfScraperData.withURL?.length || 0) + (pdfScraperData.withoutURL?.length || 0);
            if (totalProducts > 0) {
              toast({
                title: "PDF-Daten wiederhergestellt",
                description: `${totalProducts} Produkte aus vorheriger Sitzung geladen`,
              });
            }
          }
        }
      } catch (error) {
        console.error('Failed to load PDF scrape session:', error);
      }
    };
    
    loadScrapeSession();
  }, []);

  // Auto-save session when PDF products change
  useEffect(() => {
    if (extractedProducts.length === 0 && productsWithoutURL.length === 0) return;
    
    const timeoutId = setTimeout(() => {
      saveScrapeSession(extractedProducts, productsWithoutURL);
    }, 1000); // Debounce 1 second
    
    return () => clearTimeout(timeoutId);
  }, [extractedProducts, productsWithoutURL, selectedSupplierId]);

  // Auto-save selected supplier to sessionStorage whenever it changes
  useEffect(() => {
    if (selectedSupplierId) {
      sessionStorage.setItem('pdf_auto_scraper_selected_supplier', selectedSupplierId);
    }
  }, [selectedSupplierId]);

  // Load suppliers
  const { data: suppliersData } = useQuery<{ success: boolean; suppliers: any[] }>({
    queryKey: ['/api/suppliers'],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token') || sessionStorage.getItem('supabase_token');
      const response = await fetch('/api/suppliers', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch suppliers');
      }
      return response.json();
    },
  });

  const extractMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('pdf', file);

      const response = await fetch('/api/pdf/preview', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase_token') || sessionStorage.getItem('supabase_token')}`,
        },
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('PDF-Verarbeitung fehlgeschlagen');
      }

      return response.json() as Promise<PDFPreviewResult>;
    },
    onSuccess: (data) => {
      setExtractedProducts(data.withURL);
      setProductsWithoutURL(data.withoutURL);
      setCurrentPage(1); // Reset to first page
      
      // Set default active tab based on what's available
      if (data.withURL.length > 0) {
        setActiveTab('withURL');
      } else if (data.withoutURL.length > 0) {
        setActiveTab('withoutURL');
      }
      
      // Save to sessionStorage so it persists when returning from URL-Scraper
      sessionStorage.setItem('pdf_auto_scraper_extracted_products', JSON.stringify(data.withURL));
      sessionStorage.setItem('pdf_auto_scraper_products_without_url', JSON.stringify(data.withoutURL));
      
      toast({
        title: 'PDF analysiert',
        description: `${data.totalProducts} Produkte gefunden (${data.withURL.length} mit URL, ${data.withoutURL.length} ohne URL)`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Email Mutation - Send URL request to supplier
  const emailMutation = useMutation({
    mutationFn: async (params: { to: string; subject: string; message: string; eanCodes: string[] }) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000); // 35s timeout

      try {
        const response = await fetch('/api/email/request-urls', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('supabase_token') || sessionStorage.getItem('supabase_token')}`,
          },
          body: JSON.stringify(params),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'E-Mail konnte nicht gesendet werden');
        }

        return response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('SMTP-Server antwortet nicht (Timeout). Bitte prüfen Sie die Server-Einstellungen.');
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: 'E-Mail gesendet',
        description: 'Die Anfrage wurde erfolgreich an den Lieferanten gesendet',
      });
      setIsEmailDialogOpen(false);
      setEmailTo('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler beim Senden',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSendEmail = () => {
    if (!emailTo || !emailSubject || !emailMessage) {
      toast({
        title: 'Fehlende Eingaben',
        description: 'Bitte füllen Sie alle Felder aus',
        variant: 'destructive',
      });
      return;
    }

    // Extract EAN codes from products without URL
    const eanCodes = productsWithoutURL
      .map(p => p.eanCode)
      .filter(Boolean) as string[];

    if (eanCodes.length === 0) {
      toast({
        title: 'Keine EAN-Codes',
        description: 'Keine EAN-Codes zum Senden verfügbar',
        variant: 'destructive',
      });
      return;
    }

    emailMutation.mutate({
      to: emailTo,
      subject: emailSubject,
      message: emailMessage,
      eanCodes,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isPDF = file.type === 'application/pdf' || file.name.endsWith('.pdf');
      const isCSV = file.type === 'text/csv' || file.name.endsWith('.csv');
      
      if (!isPDF && !isCSV) {
        toast({
          title: 'Ungültiger Dateityp',
          description: 'Bitte wählen Sie eine PDF- oder CSV-Datei',
          variant: 'destructive',
        });
        return;
      }
      setSelectedFile(file);
      setExtractedProducts([]);
      setProductsWithoutURL([]);
    }
  };

  const handleExtract = () => {
    if (!selectedFile) {
      toast({
        title: 'Keine Datei ausgewählt',
        description: 'Bitte wählen Sie eine PDF- oder CSV-Datei',
        variant: 'destructive',
      });
      return;
    }

    // Check file type
    const isCSV = selectedFile.type === 'text/csv' || selectedFile.name.endsWith('.csv');
    
    if (isCSV) {
      // Handle CSV parsing client-side
      handleCSVExtract(selectedFile);
    } else {
      // Handle PDF extraction via backend
      extractMutation.mutate(selectedFile);
    }
  };

  const handleCSVExtract = (file: File) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const csvText = e.target?.result as string;
      
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        delimiter: ',', // Auto-detect delimiter
        quoteChar: '"',
        escapeChar: '"',
        dynamicTyping: false,
        complete: (parseResult) => {
          if (parseResult.errors.length > 0) {
            console.error('CSV parse errors:', parseResult.errors);
          }

          const rows = parseResult.data as Record<string, string>[];
          
          if (!rows || rows.length === 0) {
            toast({
              title: 'Leere CSV',
              description: 'CSV-Datei enthält keine Daten',
              variant: 'destructive',
            });
            return;
          }

          // Auto-detect URL column (before unfolding)
          const headers = Object.keys(rows[0] || {});
          const urlColumn = headers.find(h => 
            h.toLowerCase().includes('url') || 
            h.toLowerCase().includes('link') ||
            h.toLowerCase().includes('produktlink')
          );

          if (!urlColumn) {
            toast({
              title: 'Keine URL-Spalte gefunden',
              description: `CSV muss eine Spalte mit "URL", "Link" oder "Produktlink" enthalten. Verfügbare Spalten: ${headers.join(', ')}`,
              variant: 'destructive',
            });
            return;
          }
          
          console.log('🔗 URL Column:', urlColumn);

          // Store CSV columns for dynamic table and add calculated VK column
          console.log('📋 CSV Headers:', headers);
          
          // Filter out empty columns by checking if ALL values in that column are empty
          const nonEmptyHeaders = headers.filter(header => {
            // Check if at least one row has a non-empty value for this column
            return rows.some(row => {
              const value = row[header];
              return value && value.trim() !== '';
            });
          });
          console.log('📋 Non-empty Headers:', nonEmptyHeaders);
          
          // SMART COLUMN UNFOLDING: Extract properties from "properties-label" columns
          // Example: "Material: Panzerglas" → Column "Material" with value "Panzerglas"
          const unfoldedRows: Record<string, string>[] = [];
          const dynamicColumnNames = new Set<string>();
          
          rows.forEach(row => {
            const unfoldedRow: Record<string, string> = {};
            
            // Copy all non-properties columns as-is
            nonEmptyHeaders.forEach(header => {
              if (!header.toLowerCase().includes('properties-label')) {
                unfoldedRow[header] = row[header] || '';
              }
            });
            
            // Extract and unfold properties-label columns
            nonEmptyHeaders.forEach(header => {
              if (header.toLowerCase().includes('properties-label')) {
                const value = row[header];
                if (value && value.includes(':')) {
                  // Split "Material: Panzerglas" → ["Material", "Panzerglas"]
                  const [key, ...valueParts] = value.split(':');
                  const cleanKey = key.trim();
                  const cleanValue = valueParts.join(':').trim();
                  
                  if (cleanKey && cleanValue) {
                    unfoldedRow[cleanKey] = cleanValue;
                    dynamicColumnNames.add(cleanKey);
                  }
                }
              }
            });
            
            unfoldedRows.push(unfoldedRow);
          });
          
          // Build final column list: base columns + dynamic unfolded columns
          const baseColumns = nonEmptyHeaders.filter(h => !h.toLowerCase().includes('properties-label'));
          const unfoldedColumns = Array.from(dynamicColumnNames).sort();
          const finalHeaders = [...baseColumns, ...unfoldedColumns];
          
          console.log('🔄 Unfolded Columns:', unfoldedColumns);
          console.log('📊 Final Headers:', finalHeaders);
          
          const ekColumnName = finalHeaders.find(h => 
            h.toLowerCase().includes('ek') && 
            !h.toLowerCase().includes('vk') &&
            (h.toLowerCase().includes('netto') || h.toLowerCase().includes('preis') || h.toLowerCase() === 'ek')
          );
          
          console.log('💰 EK Column Name:', ekColumnName);
          const hasEkColumn = !!ekColumnName;
          const columnsWithVK = hasEkColumn ? [...finalHeaders, 'VK (berechnet)'] : finalHeaders;
          console.log('📊 Columns with VK:', columnsWithVK);
          setCsvColumns(columnsWithVK);

          // Extract products with URLs
          const productsWithURL: PDFProduct[] = [];
          const productsNoURL: PDFProduct[] = [];
          const rawDataWithURL: Record<string, string>[] = [];
          const rawDataWithoutURL: Record<string, string>[] = [];

          unfoldedRows.forEach((row, index) => {
            // Debug: Log first row
            if (index === 0) {
              console.log('🔍 First Unfolded Row:', row);
            }
            
            // Calculate VK if EK exists
            let enrichedRow = { ...row };
            if (hasEkColumn && ekColumnName) {
              const ekValue = row[ekColumnName];
              if (index === 0) {
                console.log(`💵 EK Value from column "${ekColumnName}":`, ekValue);
              }
              if (ekValue && !isNaN(parseFloat(ekValue.replace(',', '.')))) {
                const ek = parseFloat(ekValue.replace(',', '.'));
                const vk = ek * 2 * 1.19; // EK * 2 + 19% MwSt
                enrichedRow['VK (berechnet)'] = vk.toFixed(2).replace('.', ',');
                if (index === 0) {
                  console.log(`✅ Calculated VK: ${enrichedRow['VK (berechnet)']} (from EK: ${ekValue})`);
                }
              }
            }
            
            row = enrichedRow;
            const url = row[urlColumn]?.trim();
            const hasValidURL = url && url.startsWith('http');
            
            // Auto-detect common column names
            const productName = row['Produktname'] || row['product-name'] || row['Name'] || row['Bezeichnung'] || `Produkt ${index + 1}`;
            const eanCode = row['EAN'] || row['eanCode'] || row['ean'] || null;
            const ekPrice = row['Netto-EK'] || row['EK'] || row['ekPrice'] || row['Preis'] || null;
            const articleNumber = row['Artikelnummer'] || row['articleNumber'] || null;
            const manufacturerArticleNumber = row['Hersteller-Artikelnr.'] || row['manufacturerArticleNumber'] || null;
            const marke = row['Hersteller'] || row['Marke'] || row['Brand'] || null;

            const product: PDFProduct = {
              productName,
              url: hasValidURL ? url : null,
              articleNumber,
              manufacturerArticleNumber,
              eanCode,
              ekPrice,
              description: null,
              marke,
              ve: null,
              liefermenge: null,
            };

            if (hasValidURL) {
              productsWithURL.push(product);
              rawDataWithURL.push(enrichedRow);
            } else {
              productsNoURL.push(product);
              rawDataWithoutURL.push(enrichedRow);
            }
          });

          // Update state
          setExtractedProducts(productsWithURL);
          setProductsWithoutURL(productsNoURL);
          setCsvRawDataWithURL(rawDataWithURL); // Diese enthalten bereits die entfalteten Daten!
          setCsvRawDataWithoutURL(rawDataWithoutURL);
          
          console.log('✅ CSV Data saved:', {
            productsWithURL: productsWithURL.length,
            productsNoURL: productsNoURL.length,
            csvColumns: columnsWithVK.length,
            rawDataSample: rawDataWithURL[0]
          });
          setCurrentPage(1);

          // Set default tab
          if (productsWithURL.length > 0) {
            setActiveTab('withURL');
          } else if (productsNoURL.length > 0) {
            setActiveTab('withoutURL');
          }

          // Save to sessionStorage
          sessionStorage.setItem('pdf_auto_scraper_extracted_products', JSON.stringify(productsWithURL));
          sessionStorage.setItem('pdf_auto_scraper_products_without_url', JSON.stringify(productsNoURL));

          toast({
            title: 'CSV analysiert',
            description: `${rows.length} Produkte gefunden (${productsWithURL.length} mit URL, ${productsNoURL.length} ohne URL)`,
          });
        },
        error: (error: Error) => {
          toast({
            title: 'Fehler beim Parsen',
            description: `CSV konnte nicht gelesen werden: ${error.message}`,
            variant: 'destructive',
          });
        },
      });
    };
    
    reader.onerror = () => {
      toast({
        title: 'Fehler beim Lesen',
        description: 'Datei konnte nicht gelesen werden',
        variant: 'destructive',
      });
    };

    reader.readAsText(file);
  };

  // Pixi Compare Handler
  const handlePixiCompare = () => {
    const allProducts = [...extractedProducts, ...productsWithoutURL];
    
    if (allProducts.length === 0) {
      toast({
        title: 'Keine Produkte',
        description: 'Bitte extrahieren Sie zuerst Produkte aus dem PDF',
        variant: 'destructive',
      });
      return;
    }

    // Get supplier number from selected supplier
    const selectedSupplier = suppliersData?.suppliers?.find(s => s.id === selectedSupplierId);
    
    if (!selectedSupplier?.supplNr) {
      toast({
        title: 'Kein Lieferant ausgewählt',
        description: 'Bitte wählen Sie einen Lieferanten mit konfigurierter SupplNr aus',
        variant: 'destructive',
      });
      return;
    }

    // Prepare data for Pixi comparison with Brickfox-compatible column names
    const pixiData = allProducts.map(product => ({
      // Primary matching fields (Brickfox format)
      'p_item_number': product.articleNumber || '',  // ANS13110002 (Primary match!)
      'v_manufacturers_item_number': product.manufacturerArticleNumber || product.articleNumber?.replace(/^ANS/, '') || '',  // 1311-0002
      'ItemNrSuppl': product.manufacturerArticleNumber || product.articleNumber?.replace(/^ANS/, '') || '',  // Alternative name
      'v_ean': product.eanCode || '',
      'EAN': product.eanCode || '',  // Alternative name
      'EANUPC': product.eanCode || '',  // Alternative name
      
      // Additional fields
      'p_name[de]': product.productName || '',
      'Produktname': product.productName || '',
      'p_brand': product.marke || selectedSupplier.name,
      'Hersteller': product.marke || selectedSupplier.name,
      'v_purchase_price': product.ekPrice || '',
      'EK (netto)': product.ekPrice || '',
      'Liefermenge': product.liefermenge || '1',
      'URL': product.url || ''
    }));


    // Store in sessionStorage
    sessionStorage.setItem('pixi_compare_data', JSON.stringify(pixiData));
    sessionStorage.setItem('pixi_compare_source', 'pdf-auto-scraper');
    sessionStorage.setItem('pixi_compare_supplNr', selectedSupplier.supplNr);
    
    toast({
      title: 'Daten vorbereitet',
      description: `${allProducts.length} Produkte werden zum Pixi-Vergleich übertragen (${selectedSupplier.name}: ${selectedSupplier.supplNr})`,
    });
    
    // Navigate to Pixi Compare
    setLocation('/pixi-compare?from=pdf-scraper');
  };

  const handleScrapeWithURLScraper = () => {
    if (extractedProducts.length === 0) {
      toast({
        title: 'Keine Produkte',
        description: 'Bitte extrahieren Sie zuerst Produkte aus dem PDF',
        variant: 'destructive',
      });
      return;
    }

    // Filter products with URLs and create URL→metadata map
    const productsWithUrls = extractedProducts.filter(p => p.url);
    
    if (productsWithUrls.length === 0) {
      toast({
        title: 'Keine URLs gefunden',
        description: 'Keine Produkte mit URLs im PDF gefunden',
        variant: 'destructive',
      });
      return;
    }

    // Create map: URL → Product metadata + CSV row data (for correct merging in URL-Scraper)
    const urlToMetadata: Record<string, any> = {};
    productsWithUrls.forEach((product, index) => {
      if (product.url) {
        // Get the corresponding CSV raw data row (with unfolded columns)
        const csvRowData = csvRawDataWithURL[index] || {};
        
        console.log(`📦 Product ${index}: URL=${product.url}, csvRowData keys=${Object.keys(csvRowData).join(', ')}`);
        
        urlToMetadata[product.url] = {
          ekPrice: product.ekPrice,
          articleNumber: product.articleNumber,
          manufacturerArticleNumber: product.manufacturerArticleNumber,
          eanCode: product.eanCode,
          productName: product.productName,
          marke: product.marke,
          csvRowData: csvRowData, // Complete CSV row with UNFOLDED columns
        };
      }
    });
    
    // Store URLs, metadata map, and CSV columns in sessionStorage
    const urls = productsWithUrls.map(p => p.url).join('\n');
    sessionStorage.setItem('pdf_extracted_urls', urls);
    sessionStorage.setItem('pdf_url_metadata_map', JSON.stringify(urlToMetadata));
    sessionStorage.setItem('pdf_csv_columns', JSON.stringify(csvColumns)); // Store column names
    
    // Store selected supplier ID for URL-Scraper
    if (selectedSupplierId && selectedSupplierId !== "__none__") {
      sessionStorage.setItem('pdf_selected_supplier_id', selectedSupplierId);
    }
    
    // Store selected supplier ID for PDF-Auto-Scraper (to restore when returning)
    sessionStorage.setItem('pdf_auto_scraper_selected_supplier', selectedSupplierId);
    
    setLocation('/url-scraper?from=pdf-auto-scraper');
  };

  const handleBrickfoxAutoMapping = async () => {
    if (extractedProducts.length === 0) {
      toast({
        title: 'Keine Produkte',
        description: 'Bitte extrahieren Sie zuerst Produkte aus dem PDF',
        variant: 'destructive',
      });
      return;
    }

    try {
      toast({
        title: 'Mapping wird durchgeführt...',
        description: 'Ihre Daten werden in Brickfox-Format konvertiert',
      });

      const sourceData = extractedProducts.map(product => ({
        'Artikelnummer': product.articleNumber || '',
        'Produktname': product.productName || '',
        'EAN': product.eanCode || '',
        'Hersteller': product.marke || '',
        'EK (netto) €': product.ekPrice || '',
        'Nominalspannung (V)': '',
        'Nominalkapazität (mAh)': '',
        'Länge (mm)': '',
        'Breite (mm)': '',
        'Höhe (mm)': '',
        'Gewicht (g)': '',
        'Energie (Wh)': '',
        'Zellenchemie': '',
        'SEO Titel': '',
        'SEO Produktbeschreibung': product.description || '',
        'SEO Keywords': '',
        'Produktbeschreibung (HTML)': product.description || '',
        'Schutzschaltung (Li-Ion)': '',
      }));

      const token = localStorage.getItem('supabase_token');
      if (!token) {
        toast({
          title: 'Nicht authentifiziert',
          description: 'Bitte melden Sie sich an',
          variant: 'destructive',
        });
        return;
      }

      const response = await fetch('/api/mapping/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          sourceData,
          exportToCsv: true,
          filename: 'brickfox_pdf_export',
        }),
      });

      const result = await response.json();

      if (!result.success) {
        toast({
          title: 'Mapping fehlgeschlagen',
          description: result.error || 'Ein Fehler ist aufgetreten',
          variant: 'destructive',
        });
        console.error('Mapping errors:', result.errors);
        return;
      }

      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `brickfox_export_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();

      toast({
        title: 'Export erfolgreich!',
        description: `${result.stats.validRows} Produkte wurden in Brickfox-Format exportiert`,
      });

      if (result.warnings && result.warnings.length > 0) {
        console.warn('Mapping warnings:', result.warnings);
      }
    } catch (error) {
      console.error('Brickfox mapping error:', error);
      toast({
        title: 'Fehler beim Export',
        description: error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">PDF/CSV Auto-Scraper</h1>
        <p className="text-muted-foreground">
          Extrahieren Sie Produkt-URLs und EK-Preise aus Lieferanten-PDFs oder CSVs und verarbeiten Sie diese mit dem URL-Scraper
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>1. PDF oder CSV hochladen</CardTitle>
            <CardDescription>
              Lieferanten-PDF mit anklickbaren Produkt-URLs oder CSV-Datei mit URL-Spalte
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pdf">PDF- oder CSV-Datei</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="pdf"
                  type="file"
                  accept=".pdf,.csv"
                  onChange={handleFileChange}
                  disabled={extractMutation.isPending}
                />
                {selectedFile && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    {selectedFile.name}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-select">Lieferant auswählen (optional)</Label>
              <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                <SelectTrigger id="supplier-select">
                  <SelectValue placeholder="Keine Vorlage (Auto-Erkennung)" />
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
              <p className="text-xs text-muted-foreground">
                💡 Gespeicherte CSS-Selektoren für diesen Lieferanten laden
              </p>
            </div>

            <Button
              onClick={handleExtract}
              disabled={!selectedFile || extractMutation.isPending}
              className="w-full"
            >
              {extractMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  PDF wird analysiert...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  URLs & Preise extrahieren
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {(extractedProducts.length > 0 || productsWithoutURL.length > 0) && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>2. Extrahierte Produkte</CardTitle>
                <CardDescription>
                  Produkte aufgeteilt nach Verfügbarkeit von URLs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'withURL' | 'withoutURL')}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="withURL" className="flex items-center gap-2">
                      Mit URL ({extractedProducts.length})
                      <Badge variant="secondary">{extractedProducts.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="withoutURL" className="flex items-center gap-2">
                      Ohne URL ({productsWithoutURL.length})
                      <Badge variant="secondary">{productsWithoutURL.length}</Badge>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="withURL" className="mt-4">
                <div className="rounded-md border">
                  <div className="max-h-96 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky left-0 bg-muted z-10 min-w-[50px]">#</TableHead>
                          {csvColumns.length > 0 ? (
                            csvColumns.map((column, idx) => (
                              <TableHead key={idx} className="min-w-[150px]">{column}</TableHead>
                            ))
                          ) : (
                            <>
                              <TableHead className="min-w-[250px]">Produktname</TableHead>
                              <TableHead className="min-w-[150px]">Hersteller-Artikelnr.</TableHead>
                              <TableHead className="min-w-[130px]">EAN</TableHead>
                              <TableHead className="min-w-[100px]">Netto-EK</TableHead>
                              <TableHead className="min-w-[100px]">Liefermenge</TableHead>
                              <TableHead className="min-w-[400px]">URL</TableHead>
                            </>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {csvColumns.length > 0 ? (
                          csvRawDataWithURL
                            .slice((currentPage - 1) * productsPerPage, currentPage * productsPerPage)
                            .map((row, index) => {
                              const actualIndex = (currentPage - 1) * productsPerPage + index + 1;
                              return (
                                <TableRow key={index}>
                                  <TableCell className="sticky left-0 bg-background z-10 font-medium text-muted-foreground">
                                    {actualIndex}
                                  </TableCell>
                                  {csvColumns.map((column, colIdx) => {
                                    const value = row[column] || '-';
                                    const isUrl = column.toLowerCase().includes('url') || 
                                                  column.toLowerCase().includes('link') ||
                                                  column.toLowerCase().includes('produktlink');
                                    const isPrice = column.toLowerCase().includes('vk') || 
                                                    column.toLowerCase().includes('ek') ||
                                                    column.toLowerCase().includes('preis') ||
                                                    column.toLowerCase().includes('price') ||
                                                    column.includes('berechnet');
                                    
                                    return (
                                      <TableCell key={colIdx} className={isUrl ? "max-w-[400px]" : ""}>
                                        {isUrl && value !== '-' && value.startsWith('http') ? (
                                          <a 
                                            href={value} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline flex items-center gap-1"
                                          >
                                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                            <span className="break-all">{value}</span>
                                          </a>
                                        ) : isPrice && value !== '-' && !isNaN(parseFloat(value.replace(',', '.'))) ? (
                                          <span className="whitespace-nowrap font-medium">
                                            {new Intl.NumberFormat('de-DE', { 
                                              style: 'currency', 
                                              currency: 'EUR' 
                                            }).format(parseFloat(value.replace(',', '.')))}
                                          </span>
                                        ) : (
                                          <span className="break-words">{value}</span>
                                        )}
                                      </TableCell>
                                    );
                                  })}
                                </TableRow>
                              );
                            })
                        ) : (
                          extractedProducts
                            .filter(p => p.url)
                            .slice((currentPage - 1) * productsPerPage, currentPage * productsPerPage)
                            .map((product, index) => {
                              const actualIndex = (currentPage - 1) * productsPerPage + index + 1;
                              return (
                                <TableRow key={index}>
                                  <TableCell className="sticky left-0 bg-background z-10 font-medium text-muted-foreground">
                                    {actualIndex}
                                  </TableCell>
                                  <TableCell className="font-medium">{product.productName || '-'}</TableCell>
                                  <TableCell className="text-muted-foreground">{product.manufacturerArticleNumber || '-'}</TableCell>
                                  <TableCell>{product.eanCode || '-'}</TableCell>
                                  <TableCell className="whitespace-nowrap">{product.ekPrice ? `${product.ekPrice} €` : '-'}</TableCell>
                                  <TableCell className="whitespace-nowrap">{product.liefermenge || '1 Stück'}</TableCell>
                                  <TableCell>
                                    <a 
                                      href={product.url!} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline flex items-center gap-1"
                                    >
                                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                      <span className="break-all">{product.url}</span>
                                    </a>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {/* Pagination Controls */}
                  {((csvColumns.length > 0 ? csvRawDataWithURL.length : extractedProducts.filter(p => p.url).length) > productsPerPage) && (
                    <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
                      <div className="text-sm text-muted-foreground">
                        Zeige {((currentPage - 1) * productsPerPage) + 1} bis {Math.min(currentPage * productsPerPage, csvColumns.length > 0 ? csvRawDataWithURL.length : extractedProducts.filter(p => p.url).length)} von {csvColumns.length > 0 ? csvRawDataWithURL.length : extractedProducts.filter(p => p.url).length} Produkten
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
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.ceil((csvColumns.length > 0 ? csvRawDataWithURL.length : extractedProducts.filter(p => p.url).length) / productsPerPage) }, (_, i) => i + 1).map((page) => (
                            <Button
                              key={page}
                              variant={currentPage === page ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPage(page)}
                              className="w-8 h-8 p-0"
                            >
                              {page}
                            </Button>
                          ))}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(Math.min(Math.ceil((csvColumns.length > 0 ? csvRawDataWithURL.length : extractedProducts.filter(p => p.url).length) / productsPerPage), currentPage + 1))}
                          disabled={currentPage === Math.ceil((csvColumns.length > 0 ? csvRawDataWithURL.length : extractedProducts.filter(p => p.url).length) / productsPerPage)}
                        >
                          Weiter
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                  </TabsContent>

                  <TabsContent value="withoutURL" className="mt-4">
                    {productsWithoutURL.length > 0 ? (
                      <div className="space-y-4">
                        <div className="rounded-md border">
                          <div className="max-h-96 overflow-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="sticky left-0 bg-muted z-10 min-w-[50px]">#</TableHead>
                                  {csvColumns.length > 0 ? (
                                    csvColumns.map((column, idx) => (
                                      <TableHead key={idx} className="min-w-[150px]">{column}</TableHead>
                                    ))
                                  ) : (
                                    <>
                                      <TableHead className="min-w-[150px]">Hersteller-Artikelnr.</TableHead>
                                      <TableHead className="min-w-[130px]">EAN</TableHead>
                                      <TableHead className="min-w-[100px]">Netto-EK</TableHead>
                                      <TableHead className="min-w-[100px]">Liefermenge</TableHead>
                                    </>
                                  )}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {csvColumns.length > 0 ? (
                                  csvRawDataWithoutURL.map((row, index) => (
                                    <TableRow key={index}>
                                      <TableCell className="sticky left-0 bg-background z-10 font-medium text-muted-foreground">
                                        {index + 1}
                                      </TableCell>
                                      {csvColumns.map((column, colIdx) => {
                                        const value = row[column] || '-';
                                        const isPrice = column.toLowerCase().includes('vk') || 
                                                        column.toLowerCase().includes('ek') ||
                                                        column.toLowerCase().includes('preis') ||
                                                        column.toLowerCase().includes('price') ||
                                                        column.includes('berechnet');
                                        
                                        return (
                                          <TableCell key={colIdx}>
                                            {isPrice && value !== '-' && !isNaN(parseFloat(value.replace(',', '.'))) ? (
                                              <span className="whitespace-nowrap font-medium">
                                                {new Intl.NumberFormat('de-DE', { 
                                                  style: 'currency', 
                                                  currency: 'EUR' 
                                                }).format(parseFloat(value.replace(',', '.')))}
                                              </span>
                                            ) : (
                                              <span className="break-words">{value}</span>
                                            )}
                                          </TableCell>
                                        );
                                      })}
                                    </TableRow>
                                  ))
                                ) : (
                                  productsWithoutURL.map((product, index) => (
                                    <TableRow key={index}>
                                      <TableCell className="sticky left-0 bg-background z-10 font-medium text-muted-foreground">
                                        {index + 1}
                                      </TableCell>
                                      <TableCell className="text-muted-foreground">{product.manufacturerArticleNumber || '-'}</TableCell>
                                      <TableCell>{product.eanCode || '-'}</TableCell>
                                      <TableCell className="whitespace-nowrap">{product.ekPrice ? `${product.ekPrice} €` : '-'}</TableCell>
                                      <TableCell className="whitespace-nowrap">{product.liefermenge || '1 Stück'}</TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-4 bg-orange-50 border border-orange-200 rounded-md">
                          <Mail className="h-5 w-5 text-orange-600" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-orange-900">URLs erforderlich</p>
                            <p className="text-xs text-orange-700">Kontaktieren Sie den Lieferanten, um Produkt-URLs zu erhalten</p>
                          </div>
                          <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" className="border-orange-300">
                                <Mail className="h-4 w-4 mr-2" />
                                URLs anfragen
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>E-Mail an Lieferanten senden</DialogTitle>
                                <DialogDescription>
                                  Senden Sie eine Anfrage mit den EAN-Codes an Ihren Lieferanten
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                  <Label htmlFor="email-to">Empfänger-E-Mail *</Label>
                                  <Input
                                    id="email-to"
                                    type="email"
                                    placeholder="lieferant@beispiel.de"
                                    value={emailTo}
                                    onChange={(e) => setEmailTo(e.target.value)}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="email-subject">Betreff *</Label>
                                  <Input
                                    id="email-subject"
                                    value={emailSubject}
                                    onChange={(e) => setEmailSubject(e.target.value)}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="email-message">Nachricht *</Label>
                                  <Textarea
                                    id="email-message"
                                    rows={8}
                                    value={emailMessage}
                                    onChange={(e) => setEmailMessage(e.target.value)}
                                    className="font-mono text-sm"
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    💡 Die EAN-Codes ({productsWithoutURL.filter(p => p.eanCode).length} Stück) werden automatisch am Ende der E-Mail angefügt
                                  </p>
                                </div>
                              </div>
                              <DialogFooter>
                                <Button
                                  variant="outline"
                                  onClick={() => setIsEmailDialogOpen(false)}
                                  disabled={emailMutation.isPending}
                                >
                                  Abbrechen
                                </Button>
                                <Button
                                  onClick={handleSendEmail}
                                  disabled={emailMutation.isPending}
                                >
                                  {emailMutation.isPending ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Wird gesendet...
                                    </>
                                  ) : (
                                    <>
                                      <Mail className="mr-2 h-4 w-4" />
                                      E-Mail senden
                                    </>
                                  )}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <p>Keine Produkte ohne URL gefunden</p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card className="border-purple-200 bg-purple-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitCompare className="h-5 w-5 text-purple-600" />
                  3. Pixi ERP-Vergleich
                </CardTitle>
                <CardDescription>
                  Vergleichen Sie extrahierte Produkte mit Ihrem Pixi ERP-System (NEU vs. VORHANDEN)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={handlePixiCompare}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  size="lg"
                  disabled={extractedProducts.length === 0 && productsWithoutURL.length === 0}
                >
                  <GitCompare className="mr-2 h-4 w-4" />
                  Pixi-Vergleich starten
                </Button>
                <p className="text-sm text-muted-foreground mt-2">
                  Matching nach Artikelnummer (z.B. ANS13110002) → Sichere Erkennung
                </p>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowRight className="h-5 w-5 text-blue-600" />
                  4. Mit URL-Scraper weiterverarbeiten
                </CardTitle>
                <CardDescription>
                  Nutzen Sie den URL-Scraper, um vollständige Produktdaten von den extrahierten URLs zu laden
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={handleScrapeWithURLScraper}
                  className="w-full"
                  size="lg"
                >
                  Zum URL-Scraper wechseln
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <p className="text-sm text-muted-foreground mt-2">
                  Die extrahierten URLs und EK-Preise werden automatisch übernommen
                </p>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-green-600" />
                  5. Automatischer Brickfox-Export
                </CardTitle>
                <CardDescription>
                  Konvertieren Sie die PDF-Daten automatisch in Brickfox-CSV-Format
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={handleBrickfoxAutoMapping}
                  className="w-full bg-green-600 hover:bg-green-700"
                  size="lg"
                  disabled={extractedProducts.length === 0}
                >
                  <Database className="mr-2 h-4 w-4" />
                  Brickfox-CSV generieren
                </Button>
                <p className="text-sm text-muted-foreground mt-2">
                  Automatisches Mapping: Spannung → Kategorie, Preise, Attribute, Bilder uvm.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
