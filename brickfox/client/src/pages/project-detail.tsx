import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { apiDownload, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowLeft, Plus, FileText, Trash2, Upload, Download, Calendar, FolderOpen, Table as TableIcon, TrendingUp, CheckCircle, XCircle, FileSpreadsheet, Eye, Copy, Check, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocation, useParams } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { Project, ProductInProject, ExportColumn } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"products" | "pixi">("products");
  const [selectedProduct, setSelectedProduct] = useState<ProductInProject | null>(null);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  
  // Pixi comparison state
  const [isPixiDialogOpen, setIsPixiDialogOpen] = useState(false);
  const [pixiSupplNr, setPixiSupplNr] = useState('');
  const [pixiLoading, setPixiLoading] = useState(false);
  const [pixiResults, setPixiResults] = useState<any>(null);

  // Brickfox preview state
  
  // Preview Dialog States for AI-generated content
  const [showSeoTitlePreview, setShowSeoTitlePreview] = useState(false);
  const [seoTitlePreviewContent, setSeoTitlePreviewContent] = useState('');
  const [showSeoPreview, setShowSeoPreview] = useState(false);
  const [seoPreviewContent, setSeoPreviewContent] = useState('');
  const [showKeywordsPreview, setShowKeywordsPreview] = useState(false);
  const [keywordsPreviewContent, setKeywordsPreviewContent] = useState('');
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [htmlPreviewContent, setHtmlPreviewContent] = useState('');
  const [copiedHtml, setCopiedHtml] = useState(false);
  
  // Pagination for product table
  const [currentPage, setCurrentPage] = useState(1);
  const productsPerPage = 6;

  const defaultColumns: ExportColumn[] = [
    // Basis-Informationen
    { id: 'articleNumber', label: 'Artikelnummer', field: 'articleNumber', enabled: true },
    { id: 'name', label: 'Produktname', field: 'name', enabled: true },
    { id: 'exactProductName', label: 'Exakter Produktname', field: 'exactProductName', enabled: false },
    
    // Beschreibungen
    { id: 'htmlCode', label: 'HTML-Beschreibung', field: 'htmlCode', enabled: true },
    { id: 'previewText', label: 'Fließtext', field: 'previewText', enabled: false },
    { id: 'seoBeschreibung', label: 'SEO Beschreibung', field: 'seoBeschreibung', enabled: false },
    { id: 'kurzbeschreibung', label: 'Kurzbeschreibung', field: 'kurzbeschreibung', enabled: false },
    
    // Produktdaten
    { id: 'ean', label: 'EAN', field: 'ean', enabled: false },
    { id: 'manufacturer', label: 'Hersteller', field: 'manufacturer', enabled: false },
    { id: 'category', label: 'Kategorie', field: 'category', enabled: false },
    
    // Preise
    { id: 'vk', label: 'VK (Verkaufspreis)', field: 'vk', enabled: false },
    { id: 'ek', label: 'EK (Einkaufspreis)', field: 'ek', enabled: false },
    { id: 'uvp', label: 'UVP', field: 'uvp', enabled: false },
    
    // Bilder & Medien
    { id: 'files', label: 'Produktbilder (URLs)', field: 'files', enabled: true },
    
    // Maße & Gewicht
    { id: 'weight', label: 'Gewicht', field: 'weight', enabled: false },
    { id: 'height', label: 'Höhe', field: 'height', enabled: false },
    { id: 'width', label: 'Breite', field: 'width', enabled: false },
    { id: 'length', label: 'Länge', field: 'length', enabled: false },
    
    // Meta-Daten
    { id: 'createdAt', label: 'Erstellt am', field: 'createdAt', enabled: false },
    { id: 'status', label: 'Status', field: 'status', enabled: false },
  ];

  const [selectedColumns, setSelectedColumns] = useState<ExportColumn[]>(defaultColumns);

  // Generate dynamic columns based on products' custom attributes
  const generateDynamicColumns = (products: ProductInProject[]): ExportColumn[] => {
    const baseColumns = [...defaultColumns];
    const customAttributeColumns = new Map<string, ExportColumn>();

    // Extract all unique custom attributes from all products
    products.forEach(product => {
      if (product.customAttributes && product.customAttributes.length > 0) {
        product.customAttributes.forEach(attr => {
          if (!customAttributeColumns.has(attr.key)) {
            customAttributeColumns.set(attr.key, {
              id: `custom_${attr.key}`,
              label: attr.key,
              field: `custom_${attr.key}`,
              enabled: false, // Custom attributes are disabled by default
            });
          }
        });
      }
    });

    // Add custom attribute columns
    customAttributeColumns.forEach((column, key) => {
      if (!baseColumns.find(col => col.id === column.id)) {
        baseColumns.push(column);
      }
    });

    
    return baseColumns;
  };

  // Fetch project
  const { data: project, isLoading: isLoadingProject } = useQuery<Project>({
    queryKey: [`/api/projects/${id}`],
    enabled: !!id,
  });

  // Fetch products
  const { data: productsData, isLoading: isLoadingProducts } = useQuery<{ success: boolean; products: ProductInProject[] }>({
    queryKey: [`/api/projects/${id}/products`],
    enabled: !!id,
  });

  const products = productsData?.products || [];

  // Memoize columns when products change to avoid infinite loops
  const dynamicColumns = useMemo(() => generateDynamicColumns(products), [products]);

  // Mapping from CSV-Bulk export column keys to ProductInProject fields
  const csvBulkToProductMapping: Record<string, string> = {
    'p_id': 'articleNumber',
    'produktname_neu': 'name',
    'produktname_nl': 'custom_produktname_nl',
    'produktbeschreibung_html': 'htmlCode',
    'produktbeschreibung_html_nl': 'custom_produktbeschreibung_html_nl',
    'v_id': 'custom_v_id',
    'p_item_number': 'custom_p_item_number',
    'produktname': 'exactProductName',
    'produktbeschreibung': 'previewText',
    'produktbeschreibung_original': 'custom_produktbeschreibung_original',
    'mediamarktname_v1': 'custom_mediamarktname_v1',
    'mediamarktname_v2': 'custom_mediamarktname_v2',
    'seo_titel': 'custom_seo_titel',
    'seo_beschreibung': 'custom_seo_beschreibung',
    'seo_keywords': 'custom_seo_keywords',
    'kurzbeschreibung': 'custom_kurzbeschreibung',
  };

  // Update selectedColumns when dynamic columns change (only on mount and when products change)
  // Use project.exportColumns if available, otherwise fall back to defaultColumns
  useEffect(() => {
    if (products.length === 0) return;
    
    // Check if project has saved exportColumns from CSV-Bulk tool
    if (project?.exportColumns && Array.isArray(project.exportColumns) && project.exportColumns.length > 0) {
      // Convert saved exportColumns to ExportColumn format for display
      // Map CSV-Bulk keys to actual ProductInProject fields
      const savedColumns: ExportColumn[] = project.exportColumns.map((col: { key: string; label: string; enabled: boolean }, idx: number) => {
        const mappedField = csvBulkToProductMapping[col.key] || col.key;
        return {
          id: col.key,
          label: col.label,
          field: mappedField,
          enabled: col.enabled,
        };
      });
      setSelectedColumns(savedColumns);
      return;
    }
    
    // Fall back to dynamicColumns if no saved exportColumns
    setSelectedColumns(prev => {
      const updatedColumns = [...prev];
      
      // Add new columns that don't exist yet
      dynamicColumns.forEach(dynCol => {
        if (!updatedColumns.find(col => col.id === dynCol.id)) {
          updatedColumns.push(dynCol);
        }
      });
      
      // Remove columns that no longer exist
      return updatedColumns.filter(col => 
        dynamicColumns.find(dynCol => dynCol.id === col.id)
      );
    });
  }, [products.length, project?.exportColumns]);

  // Delete product mutation
  const deleteProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      return apiRequest('DELETE', `/api/products/${productId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/products`] });
      // Invalidate all product-counts queries
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          Array.isArray(query.queryKey) && 
          query.queryKey[0] === '/api/projects/product-counts'
      });
      setIsProductDialogOpen(false);
      setSelectedProduct(null);
      toast({
        title: "Produkt gelöscht",
        description: "Das Produkt wurde erfolgreich gelöscht.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message || "Produkt konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteProduct = (e: React.MouseEvent, productId: string) => {
    e.stopPropagation();
    if (confirm("Möchten Sie dieses Produkt wirklich löschen?")) {
      deleteProductMutation.mutate(productId);
    }
  };

  const handleProductClick = (product: ProductInProject) => {
    setSelectedProduct(product);
    setIsProductDialogOpen(true);
  };

  const handleOpenPixiDialog = async () => {
    try {
      const response = await apiRequest('GET', '/api/suppliers');
      const data = await response.json() as { suppliers: Array<{ id: string; name: string; supplNr?: string }> };
      
      if (data.suppliers && data.suppliers.length > 0) {
        const suppliersWithNr = data.suppliers.filter((s: { id: string; name: string; supplNr?: string }) => s.supplNr);
        
        if (suppliersWithNr.length >= 1) {
          setPixiSupplNr(suppliersWithNr[0].supplNr || '');
        } else {
          setPixiSupplNr('');
        }
      } else {
        setPixiSupplNr('');
      }
    } catch (error) {
      console.error('Error loading suppliers:', error);
      toast({
        title: "Hinweis",
        description: "Lieferanten konnten nicht geladen werden",
        variant: "default",
      });
    }
    
    setIsPixiDialogOpen(true);
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleBrickfoxExport = async () => {
    if (products.length === 0) {
      toast({
        title: "Keine Produkte",
        description: "Es gibt keine Produkte zum Exportieren.",
        variant: "destructive",
      });
      return;
    }

    if (isExporting) return; // Prevent multiple clicks

    setIsExporting(true);
    try {
      toast({
        title: "Export wird erstellt",
        description: "Bitte warten Sie, während die CSV-Datei generiert wird...",
      });

      await apiDownload(
        '/api/brickfox/export',
        { projectId: id },
        `${project?.name || 'brickfox'}_export.csv`
      );
      
      toast({
        title: "Export erfolgreich",
        description: "Brickfox CSV wurde heruntergeladen",
      });
    } catch (err: any) {
      console.error('[Brickfox Export] Error:', err);
      toast({
        title: "Export fehlgeschlagen",
        description: err.message || 'CSV-Export konnte nicht erstellt werden',
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };


  const handlePixiCompare = async () => {
    if (!pixiSupplNr) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie eine Lieferantennummer ein",
        variant: "destructive",
      });
      return;
    }

    setPixiLoading(true);
    setPixiResults(null);

    try {
      // Helper: Get field from extractedData or customAttributes
      const getField = (p: any, key: string) => {
        const extractedData = p.extractedData || [];
        const customAttrs = p.customAttributes || [];
        
        if (Array.isArray(extractedData)) {
          const item = extractedData.find((d: any) => d.key === key);
          if (item?.value) return item.value;
        }
        
        if (Array.isArray(customAttrs)) {
          const item = customAttrs.find((d: any) => d.key === key);
          if (item?.value) return item.value;
        }
        
        return '';
      };

      // Convert project products to Pixi format with ALL matching fields (like PDF-Auto-Scraper)
      const csvProducts = products.map(p => {
        const manufacturerArticleNumber = getField(p, 'manufacturerArticleNumber') || p.articleNumber?.replace(/^ANS/, '') || '';
        const ean = getField(p, 'ean');
        const hersteller = getField(p, 'hersteller') || getField(p, 'manufacturer');
        
        return {
          // Primary matching fields (Brickfox format)
          'p_item_number': p.articleNumber || '',  // ANS13110002 (Primary match!)
          'v_manufacturers_item_number': manufacturerArticleNumber,  // 1311-0002 (with hyphens!)
          'ItemNrSuppl': manufacturerArticleNumber,  // Alternative name
          'v_ean': ean,
          'EAN': ean,  // Alternative name
          'EANUPC': ean,  // Alternative name
          
          // Additional fields
          'p_name[de]': p.name || '',
          'Produktname': p.name || '',
          'p_brand': hersteller,
          'Hersteller': hersteller,
          'v_purchase_price': getField(p, 'ekPrice'),
          'EK (netto)': getField(p, 'ekPrice'),
        };
      });

      const token = localStorage.getItem('supabase_token');
      const response = await fetch('/api/pixi/compare-json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          products: csvProducts,
          supplNr: pixiSupplNr,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Vergleich fehlgeschlagen');
      }

      setPixiResults(data);
      setIsPixiDialogOpen(false);
      setActiveTab('pixi');
      
      toast({
        title: "Pixi-Vergleich abgeschlossen",
        description: `${data.summary.neu} neue, ${data.summary.vorhanden} vorhandene Produkte`,
      });
    } catch (err: any) {
      toast({
        title: "Fehler",
        description: err.message || 'Pixi-Vergleich fehlgeschlagen',
        variant: "destructive",
      });
    } finally {
      setPixiLoading(false);
    }
  };

  const downloadPixiResults = () => {
    if (!pixiResults) return;

    const csvContent = [
      ['Artikelnummer', 'Produktname', 'EAN', 'Hersteller', 'Pixi Status'].join(';'),
      ...pixiResults.products.map((p: any) => 
        [
          p.artikelnummer,
          `"${p.produktname}"`,
          p.ean,
          p.hersteller,
          p.pixi_status
        ].join(';')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${project?.name || 'projekt'}_pixi-vergleich.csv`;
    link.click();
  };

  const handleExportProject = () => {
    if (products.length === 0) {
      toast({
        title: "Keine Produkte",
        description: "Es gibt keine Produkte zum Exportieren.",
        variant: "destructive",
      });
      return;
    }

    const enabledColumns = selectedColumns.filter(col => col.enabled);
    
    // Get the base URL for images
    const baseUrl = window.location.origin;
    
    const csvData = products.map(product => {
      const row: Record<string, string> = {};
      enabledColumns.forEach(col => {
        if (col.field.startsWith('custom_')) {
          // Handle custom attributes
          const attrKey = col.field.replace('custom_', '');
          const customAttr = product.customAttributes?.find(attr => attr.key === attrKey);
          row[col.label] = customAttr?.value || '';
        } else {
          const value = product[col.field as keyof ProductInProject];
          
          // Special handling for specific fields
          if (col.field === 'createdAt' && value) {
            row[col.label] = format(new Date(value as string), "dd.MM.yyyy HH:mm");
          } else if (col.field === 'files' && Array.isArray(value)) {
            // Convert all image filenames to full URLs
            row[col.label] = value.map((f: any) => {
              const filename = f.fileName || f.filename || '';
              if (filename) {
                return `${baseUrl}/product-images/${filename}`;
              }
              return '';
            }).filter(url => url).join(', ');
          } else if (col.field === 'ean' || col.field === 'manufacturer' || col.field === 'category' || 
                     col.field === 'vk' || col.field === 'ek' || col.field === 'uvp' ||
                     col.field === 'weight' || col.field === 'height' || col.field === 'width' || col.field === 'length') {
            // Try to extract from extractedData first
            if (product.extractedData && product.extractedData.length > 0) {
              try {
                const extracted = JSON.parse(product.extractedData[0].extractedText || '{}');
                row[col.label] = extracted[col.field] || '';
              } catch {
                row[col.label] = '';
              }
            } else {
              row[col.label] = '';
            }
          } else {
            row[col.label] = String(value || '');
          }
        }
      });
      return row;
    });

    const csv = Papa.unparse(csvData, {
      delimiter: ";",
      header: true,
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${project?.name || 'projekt'}_export.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setIsExportDialogOpen(false);
    toast({
      title: "Export erfolgreich",
      description: `${products.length} Produkt${products.length !== 1 ? 'e' : ''} wurden exportiert.`,
    });
  };

  if (!project && !isLoadingProject && !isLoadingProducts) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Projekt nicht gefunden</h2>
          <Button onClick={() => setLocation('/projects')} data-testid="button-back-to-projects">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Zurück zu Projekten
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation('/projects')}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Zurück zu Projekten
          </Button>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{project?.name}</h1>
              {project && (
                <p className="text-muted-foreground mt-1 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Erstellt am {format(new Date(project.createdAt), "dd. MMMM yyyy", { locale: de })}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleOpenPixiDialog}
                disabled={products.length === 0}
                data-testid="button-pixi-compare"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Mit Pixi vergleichen
              </Button>
              <Button
                variant="default"
                onClick={handleBrickfoxExport}
                disabled={products.length === 0 || isExporting}
                data-testid="button-brickfox-export"
                className="bg-green-600 hover:bg-green-700"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Exportiere...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Brickfox CSV exportieren
                  </>
                )}
              </Button>
              <Button
                onClick={() => setLocation('/url-scraper')}
                data-testid="button-add-product"
              >
                <Plus className="w-4 h-4 mr-2" />
                Neues Produkt
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs für verschiedene Ansichten */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "products" | "pixi")} className="mb-6">
          <TabsList>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4" />
              Produkte ({products.length})
            </TabsTrigger>
            <TabsTrigger value="pixi" className="flex items-center gap-2" disabled={!pixiResults}>
              <TrendingUp className="w-4 h-4" />
              Pixi Vergleich {pixiResults && `(${pixiResults.summary.total})`}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="products" className="mt-6">
            {/* Products Table */}
            {isLoadingProducts ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="animate-pulse space-y-4">
                    <div className="h-10 bg-muted rounded"></div>
                    <div className="h-10 bg-muted rounded"></div>
                    <div className="h-10 bg-muted rounded"></div>
                  </div>
                </CardContent>
              </Card>
            ) : products.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <FolderOpen className="w-16 h-16 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Noch keine Produkte</h3>
                  <p className="text-muted-foreground text-center mb-6">
                    Fügen Sie Ihr erstes Produkt hinzu, um mit der Beschreibung zu beginnen
                  </p>
                  <Button
                    onClick={() => setLocation('/url-scraper')}
                    data-testid="button-add-first-product"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Produkt erstellen
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Gescrapte Produktdaten</CardTitle>
                  <CardDescription>{products.length} Produkte</CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Info Banner */}
                  <div className="mb-4 p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <p className="text-sm text-foreground flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <strong>KI-Felder (blau markiert)</strong> zeigen die gespeicherten AI-generierten Inhalte
                    </p>
                  </div>

                  <div className="rounded-md border overflow-hidden">
                    <div className="max-h-96 overflow-y-auto overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-muted sticky top-0 z-20">
                          <TableRow>
                            {/* Scraped Data Columns (weiß) */}
                            <TableHead className="w-12 sticky left-0 bg-muted z-20">#</TableHead>
                            <TableHead className="min-w-[200px]">Produktname</TableHead>
                            <TableHead className="sticky left-12 bg-muted z-20">Bild (Anzahl)</TableHead>
                            <TableHead className="min-w-[120px]">Artikelnummer</TableHead>
                            <TableHead className="min-w-[150px]">Hersteller-Artikelnr.</TableHead>
                            <TableHead className="min-w-[120px]">EAN</TableHead>
                            <TableHead className="min-w-[120px]">Hersteller</TableHead>
                            <TableHead className="min-w-[100px]">EK (netto) €</TableHead>
                            <TableHead className="min-w-[100px]">VK (brutto) €</TableHead>
                            {/* ANSMANN Technical Specifications */}
                            <TableHead className="min-w-[120px]">Nominalspannung (V)</TableHead>
                            <TableHead className="min-w-[140px]">Nominalkapazität (mAh)</TableHead>
                            <TableHead className="min-w-[140px]">max. Entladestrom (A)</TableHead>
                            <TableHead className="min-w-[100px]">Länge (mm)</TableHead>
                            <TableHead className="min-w-[100px]">Breite (mm)</TableHead>
                            <TableHead className="min-w-[100px]">Höhe (mm)</TableHead>
                            <TableHead className="min-w-[100px]">Gewicht (g)</TableHead>
                            <TableHead className="min-w-[120px]">Zellenchemie</TableHead>
                            <TableHead className="min-w-[100px]">Energie (Wh)</TableHead>
                            <TableHead className="min-w-[100px]">Farbe</TableHead>
                            
                            {/* KI-generierte Spalten (blau markiert) */}
                            <TableHead className="min-w-[200px] bg-primary/10 text-primary font-semibold">
                              🤖 SEO Titel
                            </TableHead>
                            <TableHead className="min-w-[250px] bg-primary/10 text-primary font-semibold">
                              🤖 SEO Produktbeschreibung
                            </TableHead>
                            <TableHead className="min-w-[200px] bg-primary/10 text-primary font-semibold">
                              🤖 SEO Keywords
                            </TableHead>
                            <TableHead className="min-w-[250px] bg-primary/10 text-primary font-semibold">
                              🤖 Produktbeschreibung (HTML)
                            </TableHead>
                            <TableHead className="w-32 text-right sticky right-0 bg-muted z-20">Aktionen</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                        {products
                          .slice((currentPage - 1) * productsPerPage, currentPage * productsPerPage)
                          .map((product, index) => {
                          const absoluteIndex = (currentPage - 1) * productsPerPage + index;
                          
                          // Extract values from extractedData or customAttributes
                          const getFieldValue = (key: string) => {
                            const extractedData = product.extractedData || [];
                            const customAttrs = product.customAttributes || [];
                            
                            if (Array.isArray(extractedData)) {
                              const item = extractedData.find((d: any) => d.key === key) as any;
                              if (item?.value) return item.value;
                            }
                            
                            if (Array.isArray(customAttrs)) {
                              const item = customAttrs.find((d: any) => d.key === key) as any;
                              if (item?.value) return item.value;
                            }
                            
                            return '-';
                          };
                          
                          return (
                            <TableRow key={product.id}>
                              <TableCell className="font-mono text-sm sticky left-0 bg-white z-10">{absoluteIndex + 1}</TableCell>
                              <TableCell className="font-medium whitespace-normal break-words">
                                {product.name || product.exactProductName || '-'}
                              </TableCell>
                              <TableCell className="sticky left-12 bg-white z-10">
                                {product.files && product.files.length > 0 ? (
                                  <span className="text-xs text-muted-foreground font-medium">
                                    {product.files.length} {product.files.length === 1 ? 'Bild' : 'Bilder'}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">-</span>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-sm whitespace-nowrap">{product.articleNumber || '-'}</TableCell>
                              <TableCell className="font-mono text-sm text-muted-foreground whitespace-nowrap">{getFieldValue('manufacturerArticleNumber')}</TableCell>
                              <TableCell className="font-mono text-sm whitespace-nowrap">{getFieldValue('ean')}</TableCell>
                              <TableCell className="whitespace-nowrap">{getFieldValue('hersteller')}</TableCell>
                              <TableCell className="font-semibold whitespace-nowrap text-green-700">{getFieldValue('ekPrice')}</TableCell>
                              <TableCell className="font-semibold whitespace-nowrap text-blue-700">{getFieldValue('vkPrice')}</TableCell>
                              {/* ANSMANN Technical Specifications */}
                              <TableCell className="text-sm">{getFieldValue('nominalspannung')}</TableCell>
                              <TableCell className="text-sm">{getFieldValue('nominalkapazitaet')}</TableCell>
                              <TableCell className="text-sm">{getFieldValue('maxEntladestrom')}</TableCell>
                              <TableCell className="text-sm">{getFieldValue('laenge')}</TableCell>
                              <TableCell className="text-sm">{getFieldValue('breite')}</TableCell>
                              <TableCell className="text-sm">{getFieldValue('hoehe')}</TableCell>
                              <TableCell className="text-sm">{getFieldValue('gewicht')}</TableCell>
                              <TableCell className="text-sm">{getFieldValue('zellenchemie')}</TableCell>
                              <TableCell className="text-sm">{getFieldValue('energie')}</TableCell>
                              <TableCell className="text-sm">{getFieldValue('farbe')}</TableCell>
                              
                              {/* KI-generierte Spalten (blau markiert) */}
                              <TableCell className="bg-primary/5 text-xs">
                                {getFieldValue('seo_titel') !== '-' ? (
                                  <div className="flex items-center gap-2">
                                    <div className="max-w-md whitespace-normal">
                                      {getFieldValue('seo_titel')}
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSeoTitlePreviewContent(getFieldValue('seo_titel'));
                                        setShowSeoTitlePreview(true);
                                      }}
                                      title="Vollständigen SEO-Titel anzeigen"
                                      className="shrink-0"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="italic text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="bg-primary/5 text-xs">
                                {getFieldValue('seo_beschreibung') !== '-' ? (
                                  <div className="flex items-center gap-2">
                                    <div className="max-w-md whitespace-normal line-clamp-3">
                                      {getFieldValue('seo_beschreibung')}
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSeoPreviewContent(getFieldValue('seo_beschreibung'));
                                        setShowSeoPreview(true);
                                      }}
                                      title="Vollständige SEO-Beschreibung anzeigen"
                                      className="shrink-0"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="italic text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="bg-primary/5 text-xs italic text-muted-foreground">
                                {getFieldValue('kurzbeschreibung') !== '-' ? (
                                  <div className="flex items-center gap-2">
                                    <span className="line-clamp-1">{getFieldValue('kurzbeschreibung')}</span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setKeywordsPreviewContent(getFieldValue('kurzbeschreibung'));
                                        setShowKeywordsPreview(true);
                                      }}
                                      title="Vollständige Keywords anzeigen"
                                      className="shrink-0"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  '-'
                                )}
                              </TableCell>
                              <TableCell className="bg-primary/5 text-xs font-mono">
                                {product.htmlCode && product.htmlCode.trim() !== '' ? (
                                  <div className="flex items-center gap-2">
                                    <span className="max-w-xs truncate text-muted-foreground" title={product.htmlCode}>
                                      {(product.htmlCode || '').substring(0, 60) + '...'}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setHtmlPreviewContent(product.htmlCode || '');
                                        setShowHtmlPreview(true);
                                      }}
                                      title="HTML Vorschau anzeigen"
                                      className="shrink-0"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="italic text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right sticky right-0 bg-white z-10">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteProduct(e, product.id);
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  
                  {/* Pagination Controls */}
                  {products.length > productsPerPage && (
                    <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
                      <div className="text-sm text-muted-foreground">
                        Zeige {((currentPage - 1) * productsPerPage) + 1} bis {Math.min(currentPage * productsPerPage, products.length)} von {products.length} Produkten
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
                          {Array.from({ length: Math.ceil(products.length / productsPerPage) }, (_, i) => i + 1).map((page) => (
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
                          onClick={() => setCurrentPage(Math.min(Math.ceil(products.length / productsPerPage), currentPage + 1))}
                          disabled={currentPage === Math.ceil(products.length / productsPerPage)}
                        >
                          Weiter
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="pixi" className="mt-6">
            {pixiResults && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5" />
                        Pixi ERP Vergleich
                      </CardTitle>
                      <CardDescription>
                        {pixiResults.summary.total} Produkte verglichen
                      </CardDescription>
                    </div>
                    <Button onClick={downloadPixiResults} variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      CSV Export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Statistiken */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <div className="text-2xl font-bold">{pixiResults.summary.total}</div>
                          <div className="text-xs text-muted-foreground">Gesamt</div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-green-200 bg-green-50">
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-700">{pixiResults.summary.neu}</div>
                          <div className="text-xs text-green-700">Neu</div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-blue-200 bg-blue-50">
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-700">{pixiResults.summary.vorhanden}</div>
                          <div className="text-xs text-blue-700">Vorhanden</div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Tabelle */}
                  <div className="border rounded-md">
                    <div className="max-h-[500px] overflow-auto">
                      <table className="w-full">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="text-left p-3 text-sm font-medium">Status</th>
                            <th className="text-left p-3 text-sm font-medium">Artikelnummer</th>
                            <th className="text-left p-3 text-sm font-medium">Produktname</th>
                            <th className="text-left p-3 text-sm font-medium">EAN</th>
                            <th className="text-left p-3 text-sm font-medium">Hersteller</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pixiResults.products.map((product: any, idx: number) => (
                            <tr key={idx} className="border-t hover:bg-muted/50">
                              <td className="p-3">
                                {product.pixi_status === 'NEU' ? (
                                  <Badge className="bg-green-100 text-green-800 hover:bg-green-200">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    NEU
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">
                                    <XCircle className="w-3 h-3 mr-1" />
                                    VORHANDEN
                                  </Badge>
                                )}
                              </td>
                              <td className="p-3 text-sm">{product.artikelnummer}</td>
                              <td className="p-3 text-sm">{product.produktname}</td>
                              <td className="p-3 text-sm font-mono text-xs">{product.ean}</td>
                              <td className="p-3 text-sm">{product.hersteller}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Pixi Comparison Dialog */}
        <Dialog open={isPixiDialogOpen} onOpenChange={setIsPixiDialogOpen}>
          <DialogContent data-testid="dialog-pixi-compare">
            <DialogHeader>
              <DialogTitle>Mit Pixi ERP vergleichen</DialogTitle>
              <DialogDescription>
                Vergleichen Sie die Produkte dieses Projekts mit Ihrem Pixi ERP-System
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="pixi-supplnr">Lieferantennummer</Label>
                <Input
                  id="pixi-supplnr"
                  placeholder="z.B. 7077"
                  value={pixiSupplNr}
                  onChange={(e) => setPixiSupplNr(e.target.value)}
                  disabled={pixiLoading}
                />
                <p className="text-xs text-muted-foreground">
                  {products.length} Produkt{products.length !== 1 ? 'e' : ''} werden verglichen
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsPixiDialogOpen(false)}
                disabled={pixiLoading}
              >
                Abbrechen
              </Button>
              <Button
                onClick={handlePixiCompare}
                disabled={pixiLoading || !pixiSupplNr}
              >
                {pixiLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                    Vergleichen...
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Vergleichen
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Product Detail Dialog */}
        <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-product-detail">
            <DialogHeader>
              <DialogTitle>{selectedProduct?.name || 'Produktdetails'}</DialogTitle>
              <DialogDescription>
                {selectedProduct && format(new Date(selectedProduct.createdAt), "dd. MMMM yyyy 'um' HH:mm 'Uhr'", { locale: de })}
              </DialogDescription>
            </DialogHeader>
            {selectedProduct && (
              <div className="space-y-6 mt-4">
                {/* HTML Description - Main Preview */}
                {selectedProduct.htmlCode && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Produktbeschreibung (HTML)
                      </h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedProduct.htmlCode || '');
                          setCopiedHtml(true);
                          setTimeout(() => setCopiedHtml(false), 2000);
                          toast({
                            title: "HTML kopiert",
                            description: "Der HTML-Code wurde in die Zwischenablage kopiert",
                          });
                        }}
                      >
                        {copiedHtml ? (
                          <>
                            <Check className="w-4 h-4 mr-2" />
                            Kopiert!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 mr-2" />
                            HTML kopieren
                          </>
                        )}
                      </Button>
                    </div>
                    <div 
                      className="prose prose-sm max-w-none border rounded-md p-4 bg-muted/30"
                      dangerouslySetInnerHTML={{ __html: selectedProduct.htmlCode }}
                    />
                  </div>
                )}

                {/* Custom Attributes - Filter out unwanted fields */}
                {selectedProduct.customAttributes && selectedProduct.customAttributes.length > 0 && (() => {
                  const filteredAttributes = selectedProduct.customAttributes.filter((attr: any) => 
                    !['mediamarktname_v1', 'mediamarktname_v2', 'seo_beschreibung', 'seo_titel', 'kurzbeschreibung'].includes(attr.key)
                  );
                  
                  return filteredAttributes.length > 0 ? (
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Produktattribute
                      </h3>
                      <div className="grid gap-3 md:grid-cols-2">
                        {filteredAttributes.map((attr: any, idx: number) => (
                          <div key={idx} className="rounded-md border p-3">
                            <div className="text-xs text-muted-foreground mb-1">{attr.key}</div>
                            <div className="text-sm">{attr.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Files */}
                {selectedProduct.files && selectedProduct.files.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Upload className="w-4 h-4" />
                      Dateien ({selectedProduct.files.length})
                    </h3>
                    <div className="space-y-2">
                      {selectedProduct.files.map((file: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 text-sm border rounded-md p-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <span>{file.fileName || file.filename || `Datei ${idx + 1}`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="destructive"
                    onClick={(e) => {
                      if (confirm("Möchten Sie dieses Produkt wirklich löschen?")) {
                        deleteProductMutation.mutate(selectedProduct.id);
                      }
                    }}
                    disabled={deleteProductMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {deleteProductMutation.isPending ? "Wird gelöscht..." : "Produkt löschen"}
                  </Button>
                  <Button onClick={() => setIsProductDialogOpen(false)}>
                    Schließen
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Export Dialog */}
        <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
          <DialogContent data-testid="dialog-export-project">
            <DialogHeader>
              <DialogTitle>Projekt exportieren</DialogTitle>
              <DialogDescription>
                Wählen Sie die Spalten für den CSV-Export
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {/* Select All Controls */}
              <div className="flex items-center gap-4 pb-3 border-b">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedColumns(prev => {
                      const updated = [...prev];
                      dynamicColumns.forEach(dynCol => {
                        const existingIndex = updated.findIndex(col => col.id === dynCol.id);
                        if (existingIndex >= 0) {
                          updated[existingIndex] = { ...updated[existingIndex], enabled: true };
                        } else {
                          updated.push({ ...dynCol, enabled: true });
                        }
                      });
                      return updated;
                    });
                  }}
                >
                  Alle auswählen
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedColumns(prev => {
                      const updated = [...prev];
                      dynamicColumns.forEach(dynCol => {
                        const existingIndex = updated.findIndex(col => col.id === dynCol.id);
                        if (existingIndex >= 0) {
                          updated[existingIndex] = { ...updated[existingIndex], enabled: false };
                        } else {
                          updated.push({ ...dynCol, enabled: false });
                        }
                      });
                      return updated;
                    });
                  }}
                >
                  Alle abwählen
                </Button>
                <span className="text-xs text-muted-foreground">
                  {selectedColumns.filter(col => col.enabled).length} von {dynamicColumns.length} ausgewählt
                </span>
              </div>

              {/* Column List */}
              <div className="max-h-60 overflow-y-auto space-y-2">
                {dynamicColumns.map((col) => {
                  const selectedCol = selectedColumns.find(sc => sc.id === col.id);
                  const isChecked = selectedCol ? selectedCol.enabled : col.enabled;
                  
                  return (
                    <div key={col.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={col.id}
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          setSelectedColumns(prev =>
                            prev.map(c => c.id === col.id ? { ...c, enabled: !!checked } : c)
                          );
                        }}
                        data-testid={`checkbox-export-${col.id}`}
                      />
                      <Label htmlFor={col.id} className="text-sm font-normal cursor-pointer">
                        {col.label}
                        {col.field.startsWith('custom_') && (
                          <span className="ml-2 text-xs text-muted-foreground">(Custom)</span>
                        )}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setIsExportDialogOpen(false)}
                data-testid="button-cancel-export"
              >
                Abbrechen
              </Button>
              <Button
                onClick={handleExportProject}
                disabled={!selectedColumns.some(col => col.enabled)}
                data-testid="button-confirm-export"
              >
                <Download className="w-4 h-4 mr-2" />
                Exportieren
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* SEO Title Preview Dialog */}
        <Dialog open={showSeoTitlePreview} onOpenChange={setShowSeoTitlePreview}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>SEO Titel</DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              <div className="p-4 bg-muted/30 rounded-lg whitespace-pre-wrap text-sm">
                {seoTitlePreviewContent}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* SEO Description Preview Dialog */}
        <Dialog open={showSeoPreview} onOpenChange={setShowSeoPreview}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>SEO Produktbeschreibung</DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              <div className="p-4 bg-muted/30 rounded-lg whitespace-pre-wrap text-sm">
                {seoPreviewContent}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Keywords Preview Dialog */}
        <Dialog open={showKeywordsPreview} onOpenChange={setShowKeywordsPreview}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>SEO Keywords / Kurzbeschreibung</DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              <div className="p-4 bg-muted/30 rounded-lg whitespace-pre-wrap text-sm italic">
                {keywordsPreviewContent}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* HTML Preview Dialog */}
        <Dialog open={showHtmlPreview} onOpenChange={setShowHtmlPreview}>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Produktbeschreibung (HTML)</DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              <ScrollArea className="h-[60vh]">
                <div 
                  className="prose prose-sm max-w-none p-4 bg-muted/30 rounded-lg"
                  dangerouslySetInnerHTML={{ __html: htmlPreviewContent }}
                />
              </ScrollArea>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
