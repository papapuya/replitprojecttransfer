import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Eye, Copy, Check, HelpCircle } from "lucide-react";
import { ExplanationPopover } from "@/components/explanation-popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  seo_beschreibung: string;
  kurzbeschreibung: string;
  akku_mah?: string;
  akku_ch?: string;
  farbe?: string;
  akku_wh?: string;
  akku_v?: string;
}

interface BulkDescriptionTableProps {
  products: BulkProduct[];
  onUpdateProduct: (id: number, field: keyof BulkProduct, value: string) => void;
  onPreviewHtml?: (htmlContent: string, productName?: string) => void;
}

export function BulkDescriptionTable({ products, onUpdateProduct, onPreviewHtml }: BulkDescriptionTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedIds, setCopiedIds] = useState<Set<number>>(new Set());
  const itemsPerPage = 6;

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

  const totalPages = Math.ceil(products.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayedProducts = products.slice(startIndex, endIndex);

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  return (
    <>
      <style>{`
        .bulk-description-textarea {
          line-height: 1.45 !important;
        }
      `}</style>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table data-testid="table-products">
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="min-w-[80px]">
                  p_id
                </TableHead>
                <TableHead className="min-w-[80px]">
                  v_id
                </TableHead>
                <TableHead className="min-w-[120px]">
                  p_item_number
                </TableHead>
                <TableHead className="min-w-[200px]">
                  Produktname (Original)
                </TableHead>
                <TableHead className="min-w-[250px]">
                  SEO-Produktname
                </TableHead>
                <TableHead className="min-w-[500px]">
                  Produktbeschreibung HTML
                </TableHead>
                <TableHead className="min-w-[400px]">
                  Produktbeschreibung (Original CSV)
                </TableHead>
                <TableHead className="min-w-[250px]">
                  Produktname (NL)
                </TableHead>
                <TableHead className="min-w-[500px]">
                  Produktbeschreibung (NL)
                </TableHead>
                <TableHead className="min-w-[300px]">
                  MediaMarkt Titel V1
                </TableHead>
                <TableHead className="min-w-[250px]">
                  MediaMarkt Titel V2
                </TableHead>
                <TableHead className="min-w-[300px]">
                  SEO Beschreibung
                </TableHead>
                <TableHead className="min-w-[350px]">
                  Kurzbeschreibung
                </TableHead>
                <TableHead className="min-w-[100px]">
                  mAh
                </TableHead>
                <TableHead className="min-w-[100px]">
                  Volt
                </TableHead>
                <TableHead className="min-w-[100px]">
                  Wh
                </TableHead>
                <TableHead className="min-w-[100px]">
                  Chemie
                </TableHead>
                <TableHead className="min-w-[100px]">
                  Farbe
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedProducts.map((product) => (
                <TableRow
                  key={product.id}
                  data-testid={`row-product-${product.id}`}
                >
                  <TableCell>
                    <span className="text-sm font-mono" data-testid={`text-pid-${product.id}`}>
                      {product.p_id || '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono" data-testid={`text-vid-${product.id}`}>
                      {product.v_id || '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono" data-testid={`text-item-number-${product.id}`}>
                      {product.p_item_number || '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-start gap-2">
                      <p className="text-sm line-clamp-3 flex-1">
                        {product.produktname || '-'}
                      </p>
                      {product.produktname_csv_original && product.produktname_csv_original !== product.produktname && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" className="p-1 h-auto flex-shrink-0">
                                <Eye className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-lg">
                              <p className="text-xs font-semibold mb-1">CSV Original:</p>
                              <p className="text-xs">{product.produktname_csv_original}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Textarea
                      value={product.produktname_neu || ''}
                      onChange={(e) => onUpdateProduct(product.id, 'produktname_neu', e.target.value)}
                      className="text-xs resize-none min-h-[80px] font-sans bulk-description-textarea"
                      placeholder="SEO-optimierter Produktname..."
                      data-testid={`input-produktname-neu-${product.id}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2 items-start">
                      <Textarea
                        value={product.produktbeschreibung_html}
                        onChange={(e) => onUpdateProduct(product.id, 'produktbeschreibung_html', e.target.value)}
                        className="text-xs resize-none min-h-[100px] font-mono flex-1 bulk-description-textarea"
                        data-testid={`input-beschreibung-html-${product.id}`}
                      />
                      <div className="flex flex-col gap-1 mt-1">
                        {onPreviewHtml && product.produktbeschreibung_html && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPreviewHtml(product.produktbeschreibung_html, product.produktname)}
                            title="HTML Vorschau anzeigen"
                            className="flex-shrink-0"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                        {product.produktbeschreibung_html && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyToClipboard(product.produktbeschreibung_html, product.id)}
                            title="HTML kopieren"
                            className="flex-shrink-0"
                          >
                            {copiedIds.has(product.id) ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                        {product.produktbeschreibung_html && (
                          <ExplanationPopover
                            productData={{
                              produktname: product.produktname,
                              produktname_neu: product.produktname_neu,
                              produktbeschreibung_html: product.produktbeschreibung_html,
                              akku_mah: product.akku_mah,
                              akku_v: product.akku_v,
                              akku_ch: product.akku_ch
                            }}
                            generatedContent={product.produktbeschreibung_html}
                          />
                        )}
                      </div>
                    </div>
                  </TableCell>
                  {/* Produktname Niederländisch */}
                  <TableCell>
                    <div className="flex gap-2 items-start">
                      <Textarea
                        value={product.produktname_nl || ''}
                        onChange={(e) => onUpdateProduct(product.id, 'produktname_nl', e.target.value)}
                        className="text-xs resize-none min-h-[80px] font-sans flex-1 bulk-description-textarea"
                        placeholder="Niederländischer Produktname..."
                        data-testid={`input-produktname-nl-${product.id}`}
                      />
                      <div className="flex flex-col gap-1 mt-1">
                        {product.produktname_nl && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyToClipboard(product.produktname_nl, product.id * 1000 + 1)}
                            title="NL Name kopieren"
                            className="flex-shrink-0"
                          >
                            {copiedIds.has(product.id * 1000 + 1) ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  {/* Produktbeschreibung Niederländisch */}
                  <TableCell>
                    <div className="flex gap-2 items-start">
                      <Textarea
                        value={product.produktbeschreibung_html_nl || ''}
                        onChange={(e) => onUpdateProduct(product.id, 'produktbeschreibung_html_nl', e.target.value)}
                        className="text-xs resize-none min-h-[100px] font-mono flex-1 bulk-description-textarea"
                        data-testid={`input-beschreibung-nl-${product.id}`}
                      />
                      <div className="flex flex-col gap-1 mt-1">
                        {onPreviewHtml && product.produktbeschreibung_html_nl && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPreviewHtml(product.produktbeschreibung_html_nl, `${product.produktname_nl || product.produktname} (NL)`)}
                            title="NL Vorschau anzeigen"
                            className="flex-shrink-0"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                        {product.produktbeschreibung_html_nl && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyToClipboard(product.produktbeschreibung_html_nl, product.id * 1000 + 2)}
                            title="NL HTML kopieren"
                            className="flex-shrink-0"
                          >
                            {copiedIds.has(product.id * 1000 + 2) ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  {/* Produktbeschreibung Original CSV */}
                  <TableCell>
                    <div className="flex gap-2 items-start">
                      <Textarea
                        value={product.produktbeschreibung_original || ''}
                        onChange={(e) => onUpdateProduct(product.id, 'produktbeschreibung_original', e.target.value)}
                        className="text-xs resize-none min-h-[100px] font-sans flex-1 bulk-description-textarea bg-muted/30"
                        readOnly
                        data-testid={`input-beschreibung-original-${product.id}`}
                      />
                      <div className="flex flex-col gap-1 mt-1">
                        {onPreviewHtml && product.produktbeschreibung_original && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPreviewHtml(product.produktbeschreibung_original || '', `${product.produktname} (Original)`)}
                            title="Original Vorschau anzeigen"
                            className="flex-shrink-0"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                        {product.produktbeschreibung_original && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyToClipboard(product.produktbeschreibung_original || '', product.id * 1000 + 3)}
                            title="Original kopieren"
                            className="flex-shrink-0"
                          >
                            {copiedIds.has(product.id * 1000 + 3) ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Textarea
                      value={product.mediamarktname_v1}
                      onChange={(e) => onUpdateProduct(product.id, 'mediamarktname_v1', e.target.value)}
                      className="text-sm resize-none min-h-[80px] font-sans font-medium bulk-description-textarea"
                      data-testid={`input-marktplatz-${product.id}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Textarea
                      value={product.mediamarktname_v2}
                      onChange={(e) => onUpdateProduct(product.id, 'mediamarktname_v2', e.target.value)}
                      className="text-sm resize-none min-h-[80px] font-sans font-medium bulk-description-textarea"
                      data-testid={`input-marktplatz-v2-${product.id}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Textarea
                      value={product.seo_beschreibung}
                      onChange={(e) => onUpdateProduct(product.id, 'seo_beschreibung', e.target.value)}
                      className="text-sm resize-none min-h-[80px] font-sans bulk-description-textarea"
                      data-testid={`input-seo-${product.id}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Textarea
                      value={product.kurzbeschreibung}
                      onChange={(e) => onUpdateProduct(product.id, 'kurzbeschreibung', e.target.value)}
                      className="text-sm resize-none min-h-[80px] font-sans bulk-description-textarea"
                      data-testid={`input-kurz-${product.id}`}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono">{product.akku_mah || '-'}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono">{product.akku_v || '-'}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono">{product.akku_wh || '-'}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono">{product.akku_ch || '-'}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono">{product.farbe || '-'}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {/* Pagination Controls */}
        {products.length > itemsPerPage && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
            <div className="text-sm text-muted-foreground">
              Zeige {startIndex + 1} bis {Math.min(endIndex, products.length)} von {products.length} Produkten
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPreviousPage}
                disabled={currentPage === 1}
              >
                Zurück
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
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
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
              >
                Weiter
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
