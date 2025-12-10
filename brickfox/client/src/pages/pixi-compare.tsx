import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, FileText, CheckCircle, XCircle, Download, Database, Save } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useLocation } from 'wouter';
import type { Project, Supplier } from '@shared/schema';

interface ComparisonResult {
  artikelnummer: string;
  manufacturerArticleNumber?: string;
  produktname: string;
  ean: string;
  hersteller: string;
  pixi_status: 'NEU' | 'VORHANDEN';
  pixi_ean: string | null;
  originalData?: any;
}

interface ComparisonResponse {
  success: boolean;
  summary: {
    total: number;
    neu: number;
    vorhanden: number;
  };
  products: ComparisonResult[];
  error?: string;
}

export default function PixiComparePage() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  
  // CSV Mode State
  const [file, setFile] = useState<File | null>(null);
  const [supplNr, setSupplNr] = useState('');
  const [selectedCsvSupplier, setSelectedCsvSupplier] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Project Mode State
  const [projects, setProjects] = useState<Project[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [manualSupplNr, setManualSupplNr] = useState<string>('');
  const [loadingData, setLoadingData] = useState(false);
  
  // Shared State
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'csv' | 'project'>('project');
  
  // Save Project Dialog State
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Pagination for results table
  const [currentPage, setCurrentPage] = useState(1);
  const productsPerPage = 100; // Show more products to enable scrolling

  useEffect(() => {
    if (activeTab === 'project' || activeTab === 'csv') {
      loadProjectsAndSuppliers();
    }
  }, [activeTab]);

  // Check if data from Scrapers exists and auto-load
  useEffect(() => {
    const pdfData = sessionStorage.getItem('pixi_compare_data');
    const pdfSource = sessionStorage.getItem('pixi_compare_source');
    const pdfSupplNr = sessionStorage.getItem('pixi_compare_supplNr');
    
    if (pdfData && (pdfSource === 'pdf-scraper' || pdfSource === 'pdf-auto-scraper' || pdfSource === 'url-scraper')) {
      try {
        const csvData = JSON.parse(pdfData);
        
        if (!pdfSupplNr) {
          console.error(`[Pixi Compare] Missing supplier number from ${pdfSource}`);
          setError('Lieferantennummer fehlt. Bitte wählen Sie einen Lieferanten aus.');
          // Clear sessionStorage
          sessionStorage.removeItem('pixi_compare_data');
          sessionStorage.removeItem('pixi_compare_source');
          return;
        }
        
        
        // Auto-trigger comparison with the stored supplier number
        handleDirectDataCompare(csvData, pdfSupplNr).then(() => {
          // Clear sessionStorage AFTER successful comparison
          sessionStorage.removeItem('pixi_compare_data');
          sessionStorage.removeItem('pixi_compare_source');
          sessionStorage.removeItem('pixi_compare_supplNr');
        });
      } catch (error) {
        console.error(`[Pixi Compare] Failed to parse ${pdfSource} data:`, error);
      }
    }
  }, [location]);

  const loadProjectsAndSuppliers = async () => {
    setLoadingData(true);
    try {
      const token = localStorage.getItem('supabase_token');
      
      const [projectsRes, suppliersRes] = await Promise.all([
        fetch('/api/projects', {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch('/api/suppliers', {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        setProjects(projectsData.projects || []);
      }

      if (suppliersRes.ok) {
        const suppliersData = await suppliersRes.json();
        setSuppliers(suppliersData.suppliers || []);
      }
    } catch (err: any) {
      console.error('Failed to load data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
        console.error('[Pixi Compare] Invalid file type:', selectedFile.name);
        setError('Bitte wählen Sie eine CSV-Datei aus');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setResult(null);
    } else {
    }
  };

  const handleProjectCompare = async () => {
    if (!selectedProject) {
      setError('Bitte wählen Sie ein Projekt aus');
      return;
    }

    if (!selectedSupplier && !manualSupplNr) {
      setError('Bitte wählen Sie einen Lieferanten aus oder geben Sie eine Lieferantennummer ein');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = localStorage.getItem('supabase_token');

      const requestBody: any = {
        projectId: selectedProject,
      };

      // Use supplier ID if selected, otherwise use manual supplNr
      if (selectedSupplier) {
        requestBody.supplierId = selectedSupplier;
      } else if (manualSupplNr) {
        requestBody.supplNr = manualSupplNr;
      }

      const response = await fetch('/api/pixi/compare-project', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Vergleich fehlgeschlagen');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Ein Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  };

  const handleCSVCompare = async () => {
    
    if (!file) {
      console.error('[Pixi Compare] No file selected');
      setError('Bitte wählen Sie eine CSV-Datei aus');
      return;
    }

    if (!supplNr) {
      console.error('[Pixi Compare] No supplier number entered');
      setError('Bitte geben Sie eine Lieferantennummer ein');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = localStorage.getItem('supabase_token');
      if (!token) {
        console.error('[Pixi Compare] No authentication token found');
        throw new Error('Nicht authentifiziert. Bitte melden Sie sich erneut an.');
      }
      
      const formData = new FormData();
      formData.append('csvFile', file);
      formData.append('supplNr', supplNr);

      const response = await fetch('/api/pixi/compare', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Vergleich fehlgeschlagen');
      }

      setResult(data);
    } catch (err: any) {
      console.error('[Pixi Compare] Error:', err);
      setError(err.message || 'Ein Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  };

  const handleDirectDataCompare = async (csvData: any[], supplierNumber: string) => {
    
    if (!supplierNumber) {
      setError('Bitte geben Sie eine Lieferantennummer ein');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setActiveTab('csv'); // Switch to CSV tab to show results

    try {
      const token = localStorage.getItem('supabase_token');
      if (!token) {
        throw new Error('Nicht authentifiziert. Bitte melden Sie sich erneut an.');
      }
      
      // Send JSON data instead of FormData
      const response = await fetch('/api/pixi/compare-direct', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          products: csvData,
          supplNr: supplierNumber,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Vergleich fehlgeschlagen');
      }

      setResult(data);
      setSupplNr(supplierNumber); // Update the UI with the supplier number
    } catch (err: any) {
      console.error('[Pixi Compare] Error:', err);
      setError(err.message || 'Ein Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  };

  const downloadResults = () => {
    if (!result) return;

    // Helper function to escape CSV values
    const escapeCsvValue = (value: any): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    let csvRows: string[] = [];

    // Check if we have originalData (Brickfox format)
    if (result.products.length > 0 && result.products[0].originalData) {
      // Get all column names from the first product's originalData
      const firstProduct = result.products[0].originalData;
      const columnNames = Object.keys(firstProduct);
      
      // Create header with original columns + Pixi Status (use semicolon for Brickfox format)
      const headers = [...columnNames, 'Pixi_Status'];
      csvRows.push(headers.join(';'));

      // Create data rows with all original data + Pixi columns
      result.products.forEach(product => {
        if (product.originalData) {
          const rowValues = columnNames.map(col => 
            escapeCsvValue(product.originalData[col])
          );
          // Add Pixi status
          rowValues.push(escapeCsvValue(product.pixi_status));
          csvRows.push(rowValues.join(';'));
        }
      });
    } else {
      // Fallback: Simple format if no originalData available (use semicolon)
      csvRows = [
        ['Artikelnummer', 'Produktname', 'EAN', 'Hersteller', 'Pixi Status'].join(';'),
        ...result.products.map(p => 
          [
            escapeCsvValue(p.artikelnummer),
            escapeCsvValue(p.produktname),
            escapeCsvValue(p.ean),
            escapeCsvValue(p.hersteller),
            escapeCsvValue(p.pixi_status)
          ].join(';')
        )
      ];
    }

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pixi-vergleich-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleSaveAsProject = async () => {
    if (!projectName.trim()) {
      setError('Bitte geben Sie einen Projektnamen ein');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('supabase_token');

      // Create new project
      const projectResponse = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: projectName.trim(),
        }),
      });

      if (!projectResponse.ok) {
        throw new Error('Projekt konnte nicht erstellt werden');
      }

      const projectData = await projectResponse.json();
      const newProjectId = projectData.project.id;

      // Convert comparison results to products and save them
      const productsToSave = result!.products.map((p) => ({
        name: p.produktname,
        articleNumber: p.artikelnummer,
        ean: p.ean,
        manufacturer: p.hersteller,
        pixi_status: p.pixi_status,
      }));

      for (const product of productsToSave) {
        await fetch('/api/products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...product,
            projectId: newProjectId,
          }),
        });
      }

      // Navigate to the new project
      setShowSaveDialog(false);
      setProjectName('');
      setLocation(`/projects/${newProjectId}`);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern des Projekts');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Pixi ERP Vergleich</h1>
          <p className="text-muted-foreground">
            Vergleichen Sie Ihre Produktdaten mit dem Pixi ERP-System um neue Artikel zu identifizieren
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'csv' | 'project')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="project">
              <Database className="mr-2 h-4 w-4" />
              Projekt-basiert
            </TabsTrigger>
            <TabsTrigger value="csv">
              <Upload className="mr-2 h-4 w-4" />
              CSV-Upload
            </TabsTrigger>
          </TabsList>

          <TabsContent value="project">
            <Card>
              <CardHeader>
                <CardTitle>Projekt-basierter Vergleich</CardTitle>
                <CardDescription>
                  Wählen Sie ein Projekt und einen Lieferanten aus Ihrer Datenbank
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="project">Projekt</Label>
                  <Select
                    value={selectedProject}
                    onValueChange={setSelectedProject}
                    disabled={loading || loadingData}
                  >
                    <SelectTrigger id="project">
                      <SelectValue placeholder="Projekt auswählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="supplier">Lieferant (optional)</Label>
                    <Select
                      value={selectedSupplier}
                      onValueChange={(value) => {
                        setSelectedSupplier(value);
                        if (value) setManualSupplNr('');
                      }}
                      disabled={loading || loadingData || !!manualSupplNr}
                    >
                      <SelectTrigger id="supplier">
                        <SelectValue placeholder="Lieferant auswählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">
                            Keine Lieferanten vorhanden
                          </div>
                        ) : (
                          suppliers.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.name}
                              {supplier.supplNr && ` (${supplier.supplNr})`}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        Oder
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="manualSupplNr">Lieferantennummer manuell eingeben</Label>
                    <Input
                      id="manualSupplNr"
                      value={manualSupplNr}
                      onChange={(e) => {
                        setManualSupplNr(e.target.value);
                        if (e.target.value) setSelectedSupplier('');
                      }}
                      placeholder="z.B. 7077 für Nitecore"
                      disabled={loading || loadingData || !!selectedSupplier}
                    />
                    <p className="text-xs text-muted-foreground">
                      Pixi-Lieferantennummer (z.B. 7077 = Nitecore/KTL, 7001 = andere)
                    </p>
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleProjectCompare}
                  disabled={!selectedProject || (!selectedSupplier && !manualSupplNr) || loading || loadingData}
                  className="w-full"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {loading ? 'Vergleiche mit Pixi...' : 'Jetzt vergleichen'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="csv">
            <Card>
              <CardHeader>
                <CardTitle>CSV-Upload & Vergleich</CardTitle>
                <CardDescription>
                  Laden Sie eine CSV-Datei mit Produktdaten hoch und vergleichen Sie diese mit Pixi
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="csvSupplier">Lieferant</Label>
                    <Select
                      value={selectedCsvSupplier}
                      onValueChange={(value) => {
                        setSelectedCsvSupplier(value);
                        if (value) {
                          const supplier = suppliers.find(s => s.id === value);
                          setSupplNr(supplier?.supplNr || '');
                        }
                      }}
                      disabled={loading || loadingData || !!supplNr}
                    >
                      <SelectTrigger id="csvSupplier">
                        <SelectValue placeholder="Lieferant auswählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">
                            Keine Lieferanten vorhanden
                          </div>
                        ) : (
                          suppliers.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.name}
                              {supplier.supplNr && ` (${supplier.supplNr})`}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        Oder
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="supplNr">Lieferantennummer manuell eingeben</Label>
                    <Input
                      id="supplNr"
                      value={supplNr}
                      onChange={(e) => {
                        setSupplNr(e.target.value);
                        if (e.target.value) setSelectedCsvSupplier('');
                      }}
                      placeholder="z.B. 7077"
                      disabled={loading || !!selectedCsvSupplier}
                    />
                    <p className="text-xs text-muted-foreground">
                      Pixi-Lieferantennummer (z.B. 7077 = Nitecore/KTL, 7117 = Ansmann)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="csvFile">CSV-Datei</Label>
                    <div className="flex gap-2">
                      <Input
                        ref={fileInputRef}
                        id="csvFile"
                        type="file"
                        accept=".csv"
                        onChange={handleFileChange}
                        disabled={loading}
                        className="flex-1"
                      />
                      {file && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            setFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          disabled={loading}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {file && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <FileText className="h-4 w-4" />
                        {file.name} ({(file.size / 1024).toFixed(1)} KB)
                      </p>
                    )}
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleCSVCompare}
                  disabled={!file || !supplNr.trim() || loading}
                  className="w-full"
                  size="lg"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {loading ? 'Vergleiche mit Pixi...' : 'Jetzt vergleichen'}
                </Button>
                
                {!file && (
                  <p className="text-sm text-muted-foreground text-center">
                    ℹ️ Bitte wählen Sie zuerst eine CSV-Datei aus
                  </p>
                )}
                {file && !supplNr.trim() && (
                  <p className="text-sm text-muted-foreground text-center">
                    ℹ️ Bitte geben Sie eine Lieferantennummer ein
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {result && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Vergleichsergebnis</CardTitle>
                <CardDescription>
                  Zusammenfassung des Pixi-Abgleichs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-muted p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold">{result.summary.total}</div>
                    <div className="text-sm text-muted-foreground">Gesamt</div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg text-center border border-green-200 dark:border-green-800">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {result.summary.neu}
                    </div>
                    <div className="text-sm text-green-700 dark:text-green-300">Neu</div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg text-center border border-blue-200 dark:border-blue-800">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {result.summary.vorhanden}
                    </div>
                    <div className="text-sm text-blue-700 dark:text-blue-300">Vorhanden</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-4">
                  <Button
                    onClick={downloadResults}
                    variant="outline"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    CSV Download
                  </Button>
                  <Button
                    onClick={() => {
                      setProjectName(`Pixi Vergleich ${new Date().toLocaleDateString('de-DE')}`);
                      setShowSaveDialog(true);
                    }}
                    variant="default"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Projekt speichern
                  </Button>
                  <Button
                    onClick={async () => {
                      try {
                        const token = localStorage.getItem('supabase_token');
                        await fetch('/api/pixi/cache', {
                          method: 'DELETE',
                          headers: { 'Authorization': `Bearer ${token}` }
                        });
                        alert('Pixi Cache wurde geleert. Bitte vergleichen Sie erneut.');
                      } catch (err) {
                        console.error('Cache clear failed:', err);
                      }
                    }}
                    variant="outline"
                  >
                    Cache leeren
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Produktliste ({result.products.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg">
                  <div className="max-h-96 overflow-auto">
                    <Table>
                      <TableHeader className="bg-muted sticky top-0 z-20">
                        <TableRow>
                          <TableHead className="w-12 sticky left-0 bg-muted z-20">#</TableHead>
                          <TableHead className="min-w-[120px]">Status</TableHead>
                        
                        {/* Dynamic columns based on data source */}
                        {result.products.length > 0 && result.products[0].originalData ? (
                          // CSV Upload: Show all original CSV columns
                          Object.keys(result.products[0].originalData)
                            .filter(columnName => columnName !== 'pixi_ean')
                            .map((columnName, idx) => (
                              <TableHead key={idx} className="min-w-[150px]">
                                {columnName}
                              </TableHead>
                            ))
                        ) : (
                          // Project-based: Show basic product fields
                          <>
                            <TableHead className="min-w-[120px]">ANS-Artikelnummer</TableHead>
                            <TableHead className="min-w-[150px]">Hersteller-Artikelnr.</TableHead>
                            <TableHead className="min-w-[200px]">Produktname</TableHead>
                            <TableHead className="min-w-[120px]">EAN</TableHead>
                            <TableHead className="min-w-[120px]">Hersteller</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.products
                        .slice((currentPage - 1) * productsPerPage, currentPage * productsPerPage)
                        .map((product, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="sticky left-0 bg-background">
                            {((currentPage - 1) * productsPerPage) + idx + 1}
                          </TableCell>
                          
                          <TableCell>
                            <Badge
                              variant={product.pixi_status === 'NEU' ? 'default' : 'secondary'}
                              className={
                                product.pixi_status === 'NEU'
                                  ? 'bg-green-600 hover:bg-green-700'
                                  : 'bg-blue-600 hover:bg-blue-700'
                              }
                            >
                              {product.pixi_status === 'NEU' ? (
                                <CheckCircle className="mr-1 h-3 w-3" />
                              ) : (
                                <FileText className="mr-1 h-3 w-3" />
                              )}
                              {product.pixi_status}
                            </Badge>
                          </TableCell>
                          
                          {/* Data columns - dynamic based on source */}
                          {product.originalData ? (
                            // CSV Upload: Show all original data columns
                            Object.keys(result.products[0].originalData || {})
                              .filter(columnName => columnName !== 'pixi_ean')
                              .map((columnName, colIdx) => (
                                <TableCell key={colIdx}>
                                  {product.originalData[columnName] || '-'}
                                </TableCell>
                              ))
                          ) : (
                            // Project-based: Show basic product fields
                            <>
                              <TableCell className="font-medium">{product.artikelnummer || '-'}</TableCell>
                              <TableCell>{product.manufacturerArticleNumber || '-'}</TableCell>
                              <TableCell>{product.produktname || '-'}</TableCell>
                              <TableCell>{product.ean || '-'}</TableCell>
                              <TableCell>{product.hersteller || '-'}</TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                  
                  {/* Pagination Controls */}
                  {result.products.length > productsPerPage && (
                    <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
                      <div className="text-sm text-muted-foreground">
                        Zeige {((currentPage - 1) * productsPerPage) + 1} bis {Math.min(currentPage * productsPerPage, result.products.length)} von {result.products.length} Produkten
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
                          {Array.from({ length: Math.ceil(result.products.length / productsPerPage) }, (_, i) => i + 1).map((page) => (
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
                          onClick={() => setCurrentPage(Math.min(Math.ceil(result.products.length / productsPerPage), currentPage + 1))}
                          disabled={currentPage === Math.ceil(result.products.length / productsPerPage)}
                        >
                          Weiter
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Als Projekt speichern</DialogTitle>
              <DialogDescription>
                Speichern Sie die Vergleichsergebnisse als neues Projekt in Ihrer Datenbank
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="project-name">Projektname</Label>
                <Input
                  id="project-name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="z.B. Nitecore Katalog 2025"
                  autoFocus
                />
              </div>
              {result && (
                <div className="text-sm text-muted-foreground">
                  Es werden {result.summary.total} Produkte gespeichert 
                  ({result.summary.neu} neu, {result.summary.vorhanden} vorhanden)
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowSaveDialog(false);
                  setProjectName('');
                }}
                disabled={saving}
              >
                Abbrechen
              </Button>
              <Button
                onClick={handleSaveAsProject}
                disabled={!projectName.trim() || saving}
              >
                {saving ? 'Speichere...' : 'Projekt speichern'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
