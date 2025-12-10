import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, RefreshCw, Eye, Settings } from "lucide-react";
import type { ProductInProject } from "@shared/schema";
import { apiDownload, apiPost } from "@/lib/api";

interface BrickfoxRow {
  [key: string]: string | number | boolean | null;
}

interface BrickfoxDataPreviewProps {
  products: ProductInProject[];
  projectName?: string;
  projectId: string; // Required for backend export
  supplierId?: string;
}

export default function BrickfoxDataPreview({ products, projectName, projectId, supplierId }: BrickfoxDataPreviewProps) {
  const [brickfoxData, setBrickfoxData] = useState<BrickfoxRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [allColumns, setAllColumns] = useState<string[]>([]);
  const [isColumnDialogOpen, setIsColumnDialogOpen] = useState(false);

  // Load Brickfox preview data from API
  const loadPreviewData = async () => {
    if (!projectId) {
      setError('No project ID provided');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await apiPost<{ success: boolean; rows: any[]; error?: string }>(
        '/api/brickfox/preview',
        { projectId, supplierId }
      );
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate Brickfox preview');
      }

      setBrickfoxData(data.rows || []);

      // Extract all column names from first row
      if (data.rows && data.rows.length > 0) {
        const columns = Object.keys(data.rows[0]);
        setAllColumns(columns);
        
        // Show important columns by default
        const defaultColumns = columns.filter(col => 
          col.includes('p_item_number') ||
          col.includes('p_name') ||
          col.includes('v_manufacturers_item_number') ||
          col.includes('v_supplier_item_number') ||
          col.includes('v_ean') ||
          col.includes('v_purchase_price') ||
          col.includes('v_price[Eur]') ||
          col.includes('p_brand')
        );
        setVisibleColumns(defaultColumns.length > 0 ? defaultColumns : columns.slice(0, 10));
      }
    } catch (err: any) {
      console.error('[Brickfox Preview] Error:', err);
      setError(err.message || 'Failed to load Brickfox preview');
    } finally {
      setIsLoading(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    loadPreviewData();
  }, [projectId, supplierId]);

  // Handle column toggle
  const handleColumnToggle = (column: string) => {
    setVisibleColumns(prev => {
      if (prev.includes(column)) {
        return prev.filter(c => c !== column);
      } else {
        return [...prev, column];
      }
    });
  };

  // Export to CSV via Backend API (ensures exact parity with preview)
  const handleExport = async () => {
    if (!projectId) {
      alert('Projekt-ID fehlt - Export nicht möglich');
      return;
    }

    try {
      // Use same parameters as preview to ensure parity
      await apiDownload(
        '/api/brickfox/export',
        { projectId, supplierId },
        `brickfox-export-${projectId}.csv`
      );
    } catch (error) {
      console.error('[Brickfox Export] Error:', error);
      alert('Export fehlgeschlagen');
    }
  };

  // Filtered data (only visible columns)
  const filteredData = brickfoxData.map(row => {
    const filteredRow: BrickfoxRow = {};
    visibleColumns.forEach(col => {
      filteredRow[col] = row[col];
    });
    return filteredRow;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Brickfox CSV Vorschau</CardTitle>
            <CardDescription>
              Vorschau der Brickfox-Exportdaten mit Fixed Values und Auto-Generate Feldern
              {brickfoxData.length > 0 && ` • ${brickfoxData.length} Produkte • ${allColumns.length} Spalten`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadPreviewData} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Neu laden
            </Button>
            <Dialog open={isColumnDialogOpen} onOpenChange={setIsColumnDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  Spalten ({visibleColumns.length}/{allColumns.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Sichtbare Spalten auswählen</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-4">
                  {allColumns.map(column => (
                    <div key={column} className="flex items-center space-x-2">
                      <Checkbox
                        id={column}
                        checked={visibleColumns.includes(column)}
                        onCheckedChange={() => handleColumnToggle(column)}
                      />
                      <Label htmlFor={column} className="text-sm cursor-pointer">
                        {column}
                      </Label>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setVisibleColumns(allColumns)}
                  >
                    Alle auswählen
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setVisibleColumns([])}
                  >
                    Alle abwählen
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button onClick={handleExport} disabled={isLoading || brickfoxData.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              CSV Exportieren
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Lade Brickfox-Daten...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-red-800 font-medium">Fehler beim Laden der Daten</p>
            <p className="text-red-600 text-sm mt-1">{error}</p>
            <Button onClick={loadPreviewData} variant="outline" size="sm" className="mt-3">
              Erneut versuchen
            </Button>
          </div>
        )}

        {!isLoading && !error && brickfoxData.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Eye className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Keine Daten vorhanden</p>
          </div>
        )}

        {!isLoading && !error && brickfoxData.length > 0 && (
          <div className="border rounded-md">
            <div className="overflow-x-auto max-h-[600px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    {visibleColumns.map(column => (
                      <TableHead key={column} className="min-w-[150px] font-semibold">
                        {column}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((row, index) => (
                    <TableRow key={index}>
                      {visibleColumns.map(column => (
                        <TableCell key={column} className="max-w-[300px]">
                          <div className="truncate" title={String(row[column] || '')}>
                            {row[column] !== null && row[column] !== undefined ? String(row[column]) : '-'}
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
