import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2, Save, TestTube, CheckCircle, AlertCircle } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";

interface Supplier {
  id: string;
  name: string;
  supplNr?: string;
  urlPattern?: string;
  description?: string;
  selectors: Record<string, string>;
  productLinkSelector?: string;
  sessionCookies?: string;
  userAgent?: string;
  loginUrl?: string;
  loginUsernameField?: string;
  loginPasswordField?: string;
  loginUsername?: string;
  loginPassword?: string;
  verifiedFields?: string[];
  lastVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export default function Suppliers() {
  const [, setLocation] = useLocation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [verifiedFields, setVerifiedFields] = useState<Set<string>>(new Set());
  const [testingField, setTestingField] = useState<string | null>(null);
  const [testUrl, setTestUrl] = useState<string>("");
  const { toast } = useToast();
  
  // Pagination for suppliers table
  const [currentPage, setCurrentPage] = useState(1);
  const suppliersPerPage = 6;

  const [formData, setFormData] = useState({
    name: "",
    supplNr: "",
    urlPattern: "",
    description: "",
    productLinkSelector: "",
    sessionCookies: "",
    userAgent: "",
    loginUrl: "",
    loginUsernameField: "",
    loginPasswordField: "",
    loginUsername: "",
    loginPassword: "",
    selectors: {
      articleNumber: ".product-code",
      productName: "h1.product-title",
      ean: ".ean",
      manufacturer: ".brand",
      price: ".price",
      description: ".product-description",
      images: ".product-image img",
      weight: ".weight",
      category: ".breadcrumb"
    }
  });

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    try {
      const data = await apiGet<{ success: boolean; suppliers: Supplier[] }>('/api/suppliers');
      if (data.success) {
        setSuppliers(data.suppliers);
      }
    } catch (error) {
      console.error('Error loading suppliers:', error);
      toast({
        title: "Fehler",
        description: "Lieferanten konnten nicht geladen werden",
        variant: "destructive",
      });
    }
  };

  const handleOpenDialog = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setFormData({
        name: supplier.name,
        supplNr: supplier.supplNr || "",
        urlPattern: supplier.urlPattern || "",
        description: supplier.description || "",
        productLinkSelector: supplier.productLinkSelector || "",
        sessionCookies: supplier.sessionCookies || "",
        userAgent: supplier.userAgent || "",
        loginUrl: supplier.loginUrl || "",
        loginUsernameField: supplier.loginUsernameField || "",
        loginPasswordField: supplier.loginPasswordField || "",
        loginUsername: supplier.loginUsername || "",
        loginPassword: supplier.loginPassword || "",
        selectors: { ...formData.selectors, ...supplier.selectors }
      });
    } else {
      setEditingSupplier(null);
      setFormData({
        name: "",
        supplNr: "",
        urlPattern: "",
        description: "",
        productLinkSelector: "",
        sessionCookies: "",
        userAgent: "",
        loginUrl: "",
        loginUsernameField: "",
        loginPasswordField: "",
        loginUsername: "",
        loginPassword: "",
        selectors: {
          articleNumber: ".product-code",
          productName: "h1.product-title",
          ean: ".ean",
          manufacturer: ".brand",
          price: ".price",
          description: ".product-description",
          images: ".product-image img",
          weight: ".weight",
          category: ".breadcrumb"
        }
      });
    }
    setIsDialogOpen(true);
    setVerifiedFields(new Set(supplier?.verifiedFields || []));
    setTestUrl(supplier?.urlPattern || "");
  };

  const handleTestSelector = async (fieldName: string, selector: string) => {
    if (!testUrl || !selector) {
      toast({
        title: "Fehlende Angaben",
        description: "Bitte geben Sie eine Test-URL und einen Selektor ein",
        variant: "destructive",
      });
      return;
    }

    setTestingField(fieldName);
    try {
      const response = await fetch('/api/scraper/test-selector', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('supabase_token')}`,
        },
        body: JSON.stringify({
          url: testUrl,
          selector,
          supplierId: editingSupplier?.id,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Mark field as verified
        setVerifiedFields(prev => new Set([...Array.from(prev), fieldName]));
        
        toast({
          title: "✅ Selektor funktioniert!",
          description: (
            <div>
              <div className="font-mono text-xs bg-muted p-2 rounded mt-1 max-h-32 overflow-auto">
                {result.value || '(leer)'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {result.count} Element(e) gefunden
              </div>
            </div>
          ),
        });
      } else {
        toast({
          title: "❌ Selektor fehlgeschlagen",
          description: result.error || 'Kein Element gefunden',
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Fehler beim Testen",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setTestingField(null);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.name.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie einen Namen ein",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const activeSelectors: Record<string, string> = {};
      Object.entries(formData.selectors).forEach(([key, value]) => {
        if (value.trim()) {
          activeSelectors[key] = value.trim();
        }
      });

      const payload = {
        name: formData.name.trim(),
        supplNr: formData.supplNr || undefined,
        urlPattern: testUrl || formData.urlPattern || undefined,
        description: formData.description || undefined,
        productLinkSelector: formData.productLinkSelector || undefined,
        sessionCookies: formData.sessionCookies || undefined,
        userAgent: formData.userAgent || undefined,
        loginUrl: formData.loginUrl || undefined,
        loginUsernameField: formData.loginUsernameField || undefined,
        loginPasswordField: formData.loginPasswordField || undefined,
        loginUsername: formData.loginUsername || undefined,
        loginPassword: formData.loginPassword || undefined,
        selectors: activeSelectors,
        verifiedFields: Array.from(verifiedFields),
        lastVerifiedAt: verifiedFields.size > 0 ? new Date().toISOString() : undefined,
      };

      const data = editingSupplier 
        ? await apiPut<{ success: boolean; error?: string }>(`/api/suppliers/${editingSupplier.id}`, payload)
        : await apiPost<{ success: boolean; error?: string }>('/api/suppliers', payload);

      if (data.success) {
        toast({
          title: "Erfolg",
          description: editingSupplier 
            ? "Lieferant aktualisiert" 
            : "Lieferant erstellt",
        });
        setIsDialogOpen(false);
        loadSuppliers();
      } else {
        throw new Error(data.error || 'Failed to save supplier');
      }
    } catch (error) {
      console.error('Error saving supplier:', error);
      toast({
        title: "Fehler",
        description: "Lieferant konnte nicht gespeichert werden",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Möchten Sie "${name}" wirklich löschen?`)) {
      return;
    }

    try {
      const data = await apiDelete<{ success: boolean; error?: string }>(`/api/suppliers/${id}`);

      if (data.success) {
        toast({
          title: "Erfolg",
          description: "Lieferant gelöscht",
        });
        loadSuppliers();
      } else {
        throw new Error(data.error || 'Failed to delete supplier');
      }
    } catch (error) {
      console.error('Error deleting supplier:', error);
      toast({
        title: "Fehler",
        description: "Lieferant konnte nicht gelöscht werden",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Lieferanten-Profile</h1>
          <p className="text-muted-foreground mt-2">
            Verwalten Sie CSS-Selektoren für häufig verwendete Lieferanten
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          Neuer Lieferant
        </Button>
      </div>

      <Card className="p-6">
        {suppliers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              Noch keine Lieferanten-Profile vorhanden
            </p>
            <Button onClick={() => handleOpenDialog()} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Ersten Lieferanten anlegen
            </Button>
          </div>
        ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Pixi-Nr.</TableHead>
                <TableHead>Selektoren</TableHead>
                <TableHead>Login</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers
                .slice((currentPage - 1) * suppliersPerPage, currentPage * suppliersPerPage)
                .map((supplier) => (
                <TableRow 
                  key={supplier.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setLocation(`/suppliers/${supplier.id}`)}
                >
                  <TableCell className="font-medium text-primary hover:underline">
                    {supplier.name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {supplier.supplNr || '-'}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs px-2 py-1 bg-muted rounded">
                      {Object.keys(supplier.selectors).length} Selektoren
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {supplier.loginUrl ? (
                      <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">✓ Konfiguriert</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDialog(supplier);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(supplier.id, supplier.name);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          
          {/* Pagination Controls */}
          {suppliers.length > suppliersPerPage && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30 mt-4">
              <div className="text-sm text-muted-foreground">
                Zeige {((currentPage - 1) * suppliersPerPage) + 1} bis {Math.min(currentPage * suppliersPerPage, suppliers.length)} von {suppliers.length} Lieferanten
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
                  {Array.from({ length: Math.ceil(suppliers.length / suppliersPerPage) }, (_, i) => i + 1).map((page) => (
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
                  onClick={() => setCurrentPage(Math.min(Math.ceil(suppliers.length / suppliersPerPage), currentPage + 1))}
                  disabled={currentPage === Math.ceil(suppliers.length / suppliersPerPage)}
                >
                  Weiter
                </Button>
              </div>
            </div>
          )}
          </>
        )}
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSupplier ? "Lieferant bearbeiten" : "Neuer Lieferant"}
            </DialogTitle>
            <DialogDescription>
              Konfigurieren Sie CSS-Selektoren für einen Lieferanten
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="z.B. Conrad Electronic"
              />
            </div>

            <div>
              <Label htmlFor="supplNr">Pixi-Lieferantennummer (optional)</Label>
              <Input
                id="supplNr"
                value={formData.supplNr}
                onChange={(e) => setFormData({ ...formData, supplNr: e.target.value })}
                placeholder="z.B. 1234 oder CONRAD-001"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Wird automatisch beim Pixi-Vergleich verwendet
              </p>
            </div>

            <div>
              <Label htmlFor="productLinkSelector">Produktlink CSS-Selektor (optional)</Label>
              <Input
                id="productLinkSelector"
                value={formData.productLinkSelector}
                onChange={(e) => setFormData({ ...formData, productLinkSelector: e.target.value })}
                placeholder="a.product-link"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Für Produktlisten-Scraping
              </p>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">🔐 Automatischer Login</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Für Shops, die eine Anmeldung erfordern
              </p>
                
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="loginUrl">Login-URL</Label>
                    <Input
                      id="loginUrl"
                      value={formData.loginUrl}
                      onChange={(e) => setFormData({ ...formData, loginUrl: e.target.value })}
                      placeholder="https://shop.example.com/login"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="loginUsernameField" className="text-xs">🔍 Benutzername-Feld (CSS-Selektor)</Label>
                      <Input
                        id="loginUsernameField"
                        value={formData.loginUsernameField}
                        onChange={(e) => setFormData({ ...formData, loginUsernameField: e.target.value })}
                        placeholder="input[name='email']"
                        className="text-sm font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, loginUsernameField: "input[name='email'], input[name='username'], #email, #username" })}
                        className="text-xs text-blue-600 hover:underline mt-1"
                      >
                        📝 Standard-Werte setzen
                      </button>
                    </div>

                    <div>
                      <Label htmlFor="loginPasswordField" className="text-xs">🔍 Passwort-Feld (CSS-Selektor)</Label>
                      <Input
                        id="loginPasswordField"
                        value={formData.loginPasswordField}
                        onChange={(e) => setFormData({ ...formData, loginPasswordField: e.target.value })}
                        placeholder="input[name='password']"
                        className="text-sm font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, loginPasswordField: "input[name='password'], input[type='password'], #password" })}
                        className="text-xs text-blue-600 hover:underline mt-1"
                      >
                        📝 Standard-Werte setzen
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="loginUsername" className="text-xs">👤 Benutzername (Ihre Login-Daten)</Label>
                      <Input
                        id="loginUsername"
                        value={formData.loginUsername}
                        onChange={(e) => setFormData({ ...formData, loginUsername: e.target.value })}
                        placeholder="z.B. kundenservice@shop.de"
                        className="text-sm"
                      />
                    </div>

                    <div>
                      <Label htmlFor="loginPassword" className="text-xs">🔑 Passwort (Ihre Login-Daten)</Label>
                      <Input
                        id="loginPassword"
                        type="password"
                        value={formData.loginPassword}
                        onChange={(e) => setFormData({ ...formData, loginPassword: e.target.value })}
                        placeholder="••••••••"
                        className="text-sm"
                      />
                      {editingSupplier && !formData.loginPassword && (
                        <p className="text-xs text-muted-foreground mt-1">
                          ✅ Passwort ist gespeichert (leer lassen, um beizubehalten)
                        </p>
                      )}
                    </div>
                  </div>
                </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Produkt-Selektoren (optional)</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/selectors/brickfox', {
                        credentials: 'include'
                      });
                      const data = await response.json();
                      if (data.success && data.selectors) {
                        setFormData({ ...formData, selectors: data.selectors });
                        setVerifiedFields(new Set());
                        toast({
                          title: "⚠️ Starter-Template geladen",
                          description: "Diese Selektoren müssen für Ihre Website angepasst werden. Bitte testen und verifizieren Sie jeden Selektor.",
                          variant: "default",
                        });
                      }
                    } catch (error) {
                      console.error('Fehler beim Laden der Brickfox-Selektoren:', error);
                    }
                  }}
                  className="text-xs"
                >
                  📋 Starter-Template laden
                </Button>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-3">
                <p className="text-xs text-amber-800">
                  <strong>⚠️ Wichtig:</strong> Jede Website hat unterschiedliche CSS-Strukturen. 
                  Passen Sie die Selektoren an Ihre spezifische Website an und testen Sie sie.
                </p>
              </div>

              <div className="mb-3">
                <Label htmlFor="testUrl" className="text-sm">Test-URL (für Selektor-Validierung)</Label>
                <Input
                  id="testUrl"
                  value={testUrl}
                  onChange={(e) => setTestUrl(e.target.value)}
                  placeholder="https://shop.example.com/produkt/beispiel-123"
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  URL zu einem Beispielprodukt, um Selektoren zu testen
                </p>
              </div>

              <p className="text-xs text-muted-foreground mb-4">
                {Object.keys(formData.selectors).length} Selektoren konfiguriert · {verifiedFields.size} verifiziert
              </p>
              <div className="grid grid-cols-2 gap-4 max-h-96 overflow-y-auto pr-2">
                {Object.entries(formData.selectors).map(([key, value]) => {
                  // Generate friendly label names
                  const labelMap: Record<string, string> = {
                    articleNumber: "Artikelnummer",
                    productName: "Produktname",
                    ean: "EAN",
                    manufacturer: "Hersteller",
                    price: "Preis",
                    weight: "Gewicht",
                    description: "Beschreibung",
                    images: "Bilder",
                    category: "Kategorie",
                    technicalTable: "Technische Tabelle",
                    length: "Länge (mm)",
                    bodyDiameter: "Gehäusedurchmesser (mm)",
                    headDiameter: "Kopfdurchmesser (mm)",
                    weightWithoutBattery: "Gewicht ohne Akku (g)",
                    totalWeight: "Gesamt Gewicht (g)",
                    powerSupply: "Stromversorgung",
                    led1: "Leuchtmittel 1",
                    led2: "Leuchtmittel 2",
                    spotIntensity: "Spotintensität (cd)",
                    maxLuminosity: "Leuchtleistung max.",
                    maxBeamDistance: "Leuchtweite max. (m)"
                  };

                  const label = labelMap[key] || key.charAt(0).toUpperCase() + key.slice(1);
                  const isVerified = verifiedFields.has(key);
                  const isTesting = testingField === key;
                  const hasValue = value && value.trim().length > 0;

                  return (
                    <div key={key} className="space-y-1">
                      <Label htmlFor={`selector-${key}`} className="text-sm flex items-center gap-1">
                        {label}
                        {isVerified && <CheckCircle className="w-3 h-3 text-green-600" />}
                        {!isVerified && hasValue && <AlertCircle className="w-3 h-3 text-amber-500" />}
                      </Label>
                      <div className="flex gap-1">
                        <Input
                          id={`selector-${key}`}
                          value={value || ""}
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              selectors: { ...formData.selectors, [key]: e.target.value }
                            });
                            setVerifiedFields(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(key);
                              return newSet;
                            });
                          }}
                          placeholder={`CSS-Selektor für ${label}`}
                          className={`text-sm ${!isVerified && hasValue ? 'border-amber-300 bg-amber-50' : ''} ${isVerified ? 'border-green-300 bg-green-50' : ''}`}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => handleTestSelector(key, value)}
                          disabled={!value || !testUrl || isTesting}
                          title="Selektor testen"
                          className="shrink-0"
                        >
                          <TestTube className={`w-4 h-4 ${isTesting ? 'animate-pulse' : ''}`} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              <Save className="w-4 h-4 mr-2" />
              {isLoading ? "Speichern..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
