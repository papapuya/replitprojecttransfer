import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Save, TestTube, CheckCircle, AlertCircle } from "lucide-react";
import { apiPut } from "@/lib/api";

export interface Supplier {
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

interface SupplierSelectorsTabProps {
  supplier: Supplier;
  onUpdate: () => void;
}

export default function SupplierSelectorsTab({ supplier, onUpdate }: SupplierSelectorsTabProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [verifiedFields, setVerifiedFields] = useState<Set<string>>(
    new Set(supplier.verifiedFields || [])
  );
  const [testingField, setTestingField] = useState<string | null>(null);
  const [testUrl, setTestUrl] = useState<string>(supplier.urlPattern || "");
  const [formData, setFormData] = useState({
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
    selectors: { ...supplier.selectors }
  });
  const { toast } = useToast();

  useEffect(() => {
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
      selectors: { ...supplier.selectors }
    });
    setVerifiedFields(new Set(supplier.verifiedFields || []));
    setTestUrl(supplier.urlPattern || "");
  }, [supplier.id]);

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
          supplierId: supplier.id,
        }),
      });

      const result = await response.json();

      if (result.success) {
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

      const payload: any = {
        name: formData.name.trim(),
        supplNr: formData.supplNr || undefined,
        urlPattern: formData.urlPattern || undefined,
        description: formData.description || undefined,
        productLinkSelector: formData.productLinkSelector || undefined,
        sessionCookies: formData.sessionCookies || undefined,
        userAgent: formData.userAgent || undefined,
        loginUrl: formData.loginUrl || undefined,
        loginUsernameField: formData.loginUsernameField || undefined,
        loginPasswordField: formData.loginPasswordField || undefined,
        loginUsername: formData.loginUsername || undefined,
        selectors: activeSelectors,
        verifiedFields: Array.from(verifiedFields),
        lastVerifiedAt: verifiedFields.size > 0 ? new Date().toISOString() : undefined,
      };

      if (formData.loginPassword && formData.loginPassword.trim()) {
        payload.loginPassword = formData.loginPassword.trim();
      }

      const data = await apiPut<{ success: boolean; error?: string }>(`/api/suppliers/${supplier.id}`, payload);

      if (data.success) {
        toast({
          title: "Erfolg",
          description: "Lieferant aktualisiert",
        });
        onUpdate();
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

  const selectorFields = [
    // Basis-Produktdaten
    { key: 'productName', label: 'Produktname', group: 'Basis-Daten', placeholder: 'h1.product-name, .product-title' },
    { key: 'articleNumber', label: 'Artikelnummer (Hersteller)', group: 'Basis-Daten', placeholder: '.sku, .product-code, [itemprop="sku"]' },
    { key: 'ean', label: 'EAN / GTIN', group: 'Basis-Daten', placeholder: '.ean, [itemprop="gtin13"]' },
    { key: 'manufacturer', label: 'Hersteller / Marke', group: 'Basis-Daten', placeholder: '.brand, [itemprop="brand"]' },
    
    // Preise (wichtig für Händler!)
    { key: 'price', label: '💰 Händler-EK-Preis (Netto)', group: 'Preise', placeholder: '.dealer-price, .wholesale-price, .net-price' },
    { key: 'priceGross', label: '💰 Händler-EK-Preis (Brutto)', group: 'Preise', placeholder: '.gross-price, .price-incl-tax' },
    { key: 'rrp', label: 'UVP / Empf. VK-Preis', group: 'Preise', placeholder: '.rrp, .msrp, [itemprop="price"]' },
    
    // Bilder und Medien
    { key: 'images', label: 'Produktbilder', group: 'Medien', placeholder: '.product-image img, .gallery img' },
    
    // Beschreibungen
    { key: 'description', label: 'Kurzbeschreibung', group: 'Beschreibungen', placeholder: '.short-description, .product-intro' },
    { key: 'longDescription', label: 'Ausführliche Beschreibung', group: 'Beschreibungen', placeholder: '.long-description, .product-details' },
    
    // Technische Daten
    { key: 'weight', label: 'Gewicht', group: 'Technische Daten', placeholder: '.weight, [itemprop="weight"]' },
    { key: 'dimensions', label: 'Abmessungen (L×B×H)', group: 'Technische Daten', placeholder: '.dimensions, .size' },
    { key: 'category', label: 'Kategorie', group: 'Technische Daten', placeholder: '.category, .breadcrumb' },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Grundeinstellungen</h3>
          <Button onClick={handleSave} disabled={isLoading}>
            <Save className="w-4 h-4 mr-2" />
            {isLoading ? "Speichere..." : "Speichern"}
          </Button>
        </div>

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
          </div>

          <div>
            <Label htmlFor="urlPattern">URL-Muster (optional)</Label>
            <Input
              id="urlPattern"
              value={formData.urlPattern}
              onChange={(e) => setFormData({ ...formData, urlPattern: e.target.value })}
              placeholder="z.B. conrad.de, reichelt.de"
            />
          </div>

          <div>
            <Label htmlFor="description">Beschreibung (optional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Notizen zu diesem Lieferanten..."
              rows={3}
            />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Automatischer Login (optional)</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Konfigurieren Sie einen automatischen Login für Lieferanten, die eine Anmeldung erfordern.
        </p>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="loginUrl">Login-URL</Label>
            <Input
              id="loginUrl"
              value={formData.loginUrl}
              onChange={(e) => setFormData({ ...formData, loginUrl: e.target.value })}
              placeholder="https://shop.example.com/login"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="loginUsernameField">🔍 Benutzername-Feld (CSS-Selektor)</Label>
              <Input
                id="loginUsernameField"
                value={formData.loginUsernameField}
                onChange={(e) => setFormData({ ...formData, loginUsernameField: e.target.value })}
                placeholder="z.B. input[name='email'] oder #username"
                className="font-mono"
              />
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-muted-foreground flex-1">
                  Der CSS-Selektor für das Benutzername-Eingabefeld im Login-Formular
                </p>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, loginUsernameField: "input[name='email'], input[name='username'], #email, #username" })}
                  className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                >
                  📝 Standard setzen
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor="loginPasswordField">🔍 Passwort-Feld (CSS-Selektor)</Label>
              <Input
                id="loginPasswordField"
                value={formData.loginPasswordField}
                onChange={(e) => setFormData({ ...formData, loginPasswordField: e.target.value })}
                placeholder="z.B. input[name='password'] oder #password"
                className="font-mono"
              />
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-muted-foreground flex-1">
                  Der CSS-Selektor für das Passwort-Eingabefeld im Login-Formular
                </p>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, loginPasswordField: "input[name='password'], input[type='password'], #password" })}
                  className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                >
                  📝 Standard setzen
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="loginUsername">👤 Benutzername (Ihre Login-Daten)</Label>
              <Input
                id="loginUsername"
                value={formData.loginUsername}
                onChange={(e) => setFormData({ ...formData, loginUsername: e.target.value })}
                placeholder="z.B. kundenservice@shop.de"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ihr tatsächlicher Benutzername für den Login
              </p>
            </div>

            <div>
              <Label htmlFor="loginPassword">🔑 Passwort (Ihre Login-Daten)</Label>
              <Input
                id="loginPassword"
                type="password"
                value={formData.loginPassword}
                onChange={(e) => setFormData({ ...formData, loginPassword: e.target.value })}
                placeholder="Ihr Passwort"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ihr tatsächliches Passwort für den Login
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">CSS-Selektoren testen</h3>
        
        <div className="mb-4">
          <Label htmlFor="testUrl">Test-URL</Label>
          <Input
            id="testUrl"
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            placeholder="https://example.com/product/123"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Verwenden Sie eine echte Produktseite zum Testen der Selektoren
          </p>
        </div>

        <div className="space-y-6">
          {/* Group selectors by category */}
          {['Basis-Daten', 'Preise', 'Medien', 'Beschreibungen', 'Technische Daten'].map(group => {
            const groupFields = selectorFields.filter(f => f.group === group);
            if (groupFields.length === 0) return null;
            
            return (
              <div key={group} className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-sm mb-3 text-blue-700">{group}</h4>
                <div className="space-y-3">
                  {groupFields.map(({ key, label, placeholder }) => {
                    const isVerified = verifiedFields.has(key);
                    const isTesting = testingField === key;
                    
                    return (
                      <div key={key} className="flex gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Label htmlFor={key} className="text-sm">{label}</Label>
                            {isVerified && (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            )}
                          </div>
                          <Input
                            id={key}
                            value={formData.selectors[key] || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              selectors: { ...formData.selectors, [key]: e.target.value }
                            })}
                            placeholder={placeholder || `.${key}`}
                            className={`font-mono text-xs ${isVerified ? "border-green-500" : ""}`}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleTestSelector(key, formData.selectors[key])}
                          disabled={isTesting || !formData.selectors[key] || !testUrl}
                          className="mt-6"
                        >
                          {isTesting ? (
                            <AlertCircle className="w-4 h-4 animate-spin" />
                          ) : (
                            <TestTube className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
