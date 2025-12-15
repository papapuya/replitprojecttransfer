import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Download, FileSpreadsheet, Package, Eye, Copy, Check } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useParams, Link } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { Project, ProductInProject, ExportColumn } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface BulkProduct {
  id: number;
  p_id: string;
  v_id: string;
  p_item_number: string;
  produktname: string;
  produktname_neu: string;
  produktname_csv_original: string;
  produktbeschreibung: string;
  produktbeschreibung_html: string;
  produktname_nl: string;
  produktbeschreibung_nl: string;
  produktbeschreibung_html_nl: string;
  produktbeschreibung_original?: string;
  mediamarktname_v1: string;
  mediamarktname_v2: string;
  seo_titel: string;
  seo_beschreibung: string;
  seo_keywords: string;
  kurzbeschreibung: string;
  [key: string]: string | number | undefined;
}

export default function CSVBulkProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [htmlPreviewContent, setHtmlPreviewContent] = useState('');
  const [copiedIds, setCopiedIds] = useState<Set<number>>(new Set());
  const itemsPerPage = 6;

  const { data: project, isLoading: isLoadingProject } = useQuery<Project>({
    queryKey: [`/api/projects/${id}`],
    enabled: !!id,
  });

  const { data: productsData, isLoading: isLoadingProducts } = useQuery<{ success: boolean; products: ProductInProject[] }>({
    queryKey: [`/api/projects/${id}/products`],
    enabled: !!id,
  });

  const rawProducts = productsData?.products || [];

  const bulkProducts: BulkProduct[] = useMemo(() => {
    return rawProducts.map((p, idx) => {
      const getCustomAttr = (key: string) => {
        const attr = p.customAttributes?.find(a => a.key === key);
        return attr?.value || '';
      };

      return {
        id: idx + 1,
        p_id: p.articleNumber || '',
        v_id: getCustomAttr('v_id'),
        p_item_number: getCustomAttr('p_item_number'),
        produktname: p.exactProductName || p.name || '',
        produktname_neu: p.name || '',
        produktname_csv_original: getCustomAttr('produktname_csv_original') || p.exactProductName || '',
        produktbeschreibung: p.previewText || '',
        produktbeschreibung_html: p.htmlCode || '',
        produktname_nl: getCustomAttr('produktname_nl'),
        produktbeschreibung_nl: getCustomAttr('produktbeschreibung_nl'),
        produktbeschreibung_html_nl: getCustomAttr('produktbeschreibung_html_nl'),
        produktbeschreibung_original: getCustomAttr('produktbeschreibung_original'),
        mediamarktname_v1: getCustomAttr('mediamarktname_v1'),
        mediamarktname_v2: getCustomAttr('mediamarktname_v2'),
        seo_titel: getCustomAttr('seo_titel'),
        seo_beschreibung: getCustomAttr('seo_beschreibung'),
        seo_keywords: getCustomAttr('seo_keywords'),
        kurzbeschreibung: getCustomAttr('kurzbeschreibung'),
      };
    });
  }, [rawProducts]);

  const totalPages = Math.ceil(bulkProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayedProducts = bulkProducts.slice(startIndex, startIndex + itemsPerPage);

  const handleCopyToClipboard = (text: string, productId: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIds(prev => new Set(prev).add(productId));
      setTimeout(() => {
        setCopiedIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(productId);
          return newSet;
        });
      }, 2000);
    });
  };

  const handleExportCSV = () => {
    if (!project?.exportColumns || bulkProducts.length === 0) {
      toast({
        title: "Export nicht möglich",
        description: "Keine Spalten oder Produkte zum Exportieren vorhanden.",
        variant: "destructive",
      });
      return;
    }

    const enabledColumns = (project.exportColumns as Array<{ key: string; label: string; enabled: boolean }>)
      .filter(col => col.enabled);

    const csvData = bulkProducts.map(product => {
      const row: Record<string, string> = {};
      enabledColumns.forEach(col => {
        row[col.key] = (product as any)[col.key] || '';
      });
      return row;
    });

    const csv = Papa.unparse(csvData, {
      delimiter: ';',
      header: true,
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${project.name || 'export'}_brickfox.csv`;
    link.click();

    toast({
      title: "CSV exportiert",
      description: `${bulkProducts.length} Produkte exportiert.`,
    });
  };

  const isLoading = isLoadingProject || isLoadingProducts;

  if (isLoading) {
    return (
      <div className="h-full overflow-auto">
        <div className="container mx-auto p-6 max-w-7xl">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-full overflow-auto">
        <div className="container mx-auto p-6 max-w-7xl">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileSpreadsheet className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Projekt nicht gefunden</h3>
              <Button asChild className="mt-4">
                <Link href="/csv-bulk-projects">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Zurück zur Übersicht
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="container mx-auto p-6 max-w-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/csv-bulk-projects">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <FileSpreadsheet className="w-6 h-6 text-primary" />
                {project.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Erstellt am {format(new Date(project.createdAt), "dd. MMMM yyyy", { locale: de })} • {bulkProducts.length} Produkte
              </p>
            </div>
          </div>
          
          <Button onClick={handleExportCSV} disabled={bulkProducts.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            CSV Export
          </Button>
        </div>

        {bulkProducts.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Package className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Keine Produkte in diesem Projekt</h3>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="min-w-[80px]">p_id</TableHead>
                    <TableHead className="min-w-[80px]">v_id</TableHead>
                    <TableHead className="min-w-[120px]">p_item_number</TableHead>
                    <TableHead className="min-w-[200px]">Produktname (Original)</TableHead>
                    <TableHead className="min-w-[250px]">SEO-Produktname</TableHead>
                    <TableHead className="min-w-[500px]">Produktbeschreibung HTML</TableHead>
                    <TableHead className="min-w-[250px]">Produktname (NL)</TableHead>
                    <TableHead className="min-w-[400px]">Produktbeschreibung (NL)</TableHead>
                    <TableHead className="min-w-[500px]">Produktbeschreibung HTML (NL)</TableHead>
                    <TableHead className="min-w-[400px]">Produktbeschreibung (Original CSV)</TableHead>
                    <TableHead className="min-w-[250px]">MediaMarkt Name V1</TableHead>
                    <TableHead className="min-w-[250px]">MediaMarkt Name V2</TableHead>
                    <TableHead className="min-w-[200px]">SEO Titel</TableHead>
                    <TableHead className="min-w-[300px]">SEO Beschreibung</TableHead>
                    <TableHead className="min-w-[200px]">SEO Keywords</TableHead>
                    <TableHead className="min-w-[300px]">Kurzbeschreibung</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-mono text-xs">{product.p_id}</TableCell>
                      <TableCell className="font-mono text-xs">{product.v_id}</TableCell>
                      <TableCell className="font-mono text-xs">{product.p_item_number}</TableCell>
                      <TableCell>
                        <div className="text-sm max-w-[200px] truncate" title={product.produktname}>
                          {product.produktname}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Textarea
                          value={product.produktname_neu}
                          readOnly
                          className="min-h-[80px] text-sm resize-none"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="relative">
                          <Textarea
                            value={product.produktbeschreibung_html}
                            readOnly
                            className="min-h-[120px] text-xs font-mono resize-none pr-16"
                          />
                          <div className="absolute top-2 right-2 flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setHtmlPreviewContent(product.produktbeschreibung_html);
                                setShowHtmlPreview(true);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleCopyToClipboard(product.produktbeschreibung_html, product.id)}
                            >
                              {copiedIds.has(product.id) ? (
                                <Check className="w-4 h-4 text-green-500" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Textarea
                          value={product.produktname_nl}
                          readOnly
                          className="min-h-[80px] text-sm resize-none"
                        />
                      </TableCell>
                      <TableCell>
                        <Textarea
                          value={product.produktbeschreibung_nl}
                          readOnly
                          className="min-h-[100px] text-sm resize-none"
                        />
                      </TableCell>
                      <TableCell>
                        <Textarea
                          value={product.produktbeschreibung_html_nl}
                          readOnly
                          className="min-h-[120px] text-xs font-mono resize-none"
                        />
                      </TableCell>
                      <TableCell>
                        <Textarea
                          value={product.produktbeschreibung_original || ''}
                          readOnly
                          className="min-h-[100px] text-sm resize-none"
                        />
                      </TableCell>
                      <TableCell>
                        <Textarea
                          value={product.mediamarktname_v1}
                          readOnly
                          className="min-h-[60px] text-sm resize-none"
                        />
                      </TableCell>
                      <TableCell>
                        <Textarea
                          value={product.mediamarktname_v2}
                          readOnly
                          className="min-h-[60px] text-sm resize-none"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm max-w-[200px]">{product.seo_titel}</div>
                      </TableCell>
                      <TableCell>
                        <Textarea
                          value={product.seo_beschreibung}
                          readOnly
                          className="min-h-[80px] text-sm resize-none"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="text-xs max-w-[200px]">{product.seo_keywords}</div>
                      </TableCell>
                      <TableCell>
                        <Textarea
                          value={product.kurzbeschreibung}
                          readOnly
                          className="min-h-[80px] text-sm resize-none"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Zeige {startIndex + 1}-{Math.min(startIndex + itemsPerPage, bulkProducts.length)} von {bulkProducts.length} Produkten
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm">
                    Seite {currentPage} von {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        <Dialog open={showHtmlPreview} onOpenChange={setShowHtmlPreview}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>HTML Vorschau</DialogTitle>
            </DialogHeader>
            <div 
              className="prose prose-sm max-w-none dark:prose-invert p-4 border rounded-lg bg-white"
              dangerouslySetInnerHTML={{ __html: htmlPreviewContent }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
