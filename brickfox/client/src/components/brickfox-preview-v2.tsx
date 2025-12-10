import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, Download } from "lucide-react";
import type { ProductInProject } from "@shared/schema";
import { apiDownload, apiPost } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BrickfoxRow {
  [key: string]: string | number | boolean | null;
}

interface BrickfoxPreviewV2Props {
  products: ProductInProject[];
  projectName?: string;
  projectId: string;
  supplierId?: string;
}

export default function BrickfoxPreviewV2({ 
  products, 
  projectName, 
  projectId, 
  supplierId 
}: BrickfoxPreviewV2Props) {
  const [brickfoxData, setBrickfoxData] = useState<BrickfoxRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

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
      toast({
        title: "Vorschau geladen",
        description: `${data.rows?.length || 0} Produkte erfolgreich verarbeitet`,
      });
    } catch (err: any) {
      console.error('[Brickfox Preview] Error:', err);
      setError(err.message || 'Failed to load Brickfox preview');
      toast({
        title: "Fehler",
        description: err.message || 'Vorschau konnte nicht geladen werden',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    loadPreviewData();
  }, [projectId, supplierId]);

  // All columns - must be before conditional returns (React Rules of Hooks)
  const allColumns = useMemo(() => {
    if (brickfoxData.length === 0) return [];
    return Object.keys(brickfoxData[0]);
  }, [brickfoxData]);

  // Export to CSV via Backend API
  const handleExport = async () => {
    if (!projectId) {
      toast({
        title: "Fehler",
        description: "Projekt-ID fehlt - Export nicht möglich",
        variant: "destructive",
      });
      return;
    }

    try {
      await apiDownload(
        '/api/brickfox/export',
        { projectId, supplierId },
        `${projectName || 'brickfox'}_export.csv`
      );
      
      toast({
        title: "Export erfolgreich",
        description: "CSV-Datei wurde heruntergeladen",
      });
    } catch (err: any) {
      console.error('[Brickfox Export] Error:', err);
      toast({
        title: "Export fehlgeschlagen",
        description: err.message || 'CSV-Export konnte nicht erstellt werden',
        variant: "destructive",
      });
    }
  };

  if (error && !isLoading && brickfoxData.length === 0) {
    return (
      <div className="text-center py-12 text-destructive">
        <p className="font-medium">Fehler beim Laden der Vorschau</p>
        <p className="text-sm text-muted-foreground mt-2">{error}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={loadPreviewData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Erneut versuchen
        </Button>
      </div>
    );
  }

  if (isLoading && brickfoxData.length === 0) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground mt-4">
          Brickfox-Vorschau wird generiert...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <DialogHeader className="pb-4 border-b">
        <div className="flex items-center justify-between">
          <div>
            <DialogTitle className="text-2xl">Brickfox CSV Export</DialogTitle>
            <DialogDescription className="mt-1">
              {brickfoxData.length} Produkte • {allColumns.length} Spalten
            </DialogDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadPreviewData}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Neu laden
            </Button>
            <Button
              onClick={handleExport}
              disabled={brickfoxData.length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              <Download className="h-4 w-4 mr-2" />
              CSV exportieren
            </Button>
          </div>
        </div>
      </DialogHeader>

      {/* Table with Vertical & Horizontal Scrollbars */}
      <div className="mt-4 flex-1 flex flex-col border rounded-md" style={{ height: 'calc(90vh - 200px)' }}>
        {/* Scrollable container with both scrollbars */}
        <div className="overflow-auto flex-1">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted sticky top-0 z-20">
              <tr className="border-b">
                <th className="sticky left-0 bg-muted z-30 border-r px-2 py-3 text-center font-medium w-12">
                  #
                </th>
                {allColumns.map((col) => (
                  <th 
                    key={col} 
                    className="border-r px-3 py-3 text-left font-medium whitespace-nowrap min-w-[150px]"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {brickfoxData.map((row, index) => (
                <tr key={index} className="border-b hover:bg-muted/50">
                  <td className="sticky left-0 bg-white z-10 border-r px-2 py-2 text-center font-mono">
                    {index + 1}
                  </td>
                  {allColumns.map((col) => (
                    <td 
                      key={col}
                      className="border-r px-3 py-2 whitespace-nowrap"
                      title={String(row[col] ?? '')}
                    >
                      {String(row[col] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Info Footer */}
        <div className="px-4 py-2 border-t bg-muted/30 text-sm text-muted-foreground text-center">
          {brickfoxData.length} Produkte • {allColumns.length} Spalten
        </div>
      </div>
    </div>
  );
}
