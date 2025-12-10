import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Settings, Map, Info } from "lucide-react";
import { apiGet } from "@/lib/api";
import { FieldMappingEditor } from "@/components/field-mapping-editor";
import SupplierOverviewTab, { Supplier as SupplierOverviewType } from "@/components/supplier-overview-tab";
import SupplierSelectorsTab, { Supplier as SupplierSelectorsType } from "@/components/supplier-selectors-tab";

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

export default function SupplierDetail() {
  const [, params] = useRoute("/suppliers/:id");
  const [, setLocation] = useLocation();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const { toast } = useToast();

  useEffect(() => {
    if (params?.id) {
      loadSupplier(params.id);
    }
  }, [params?.id]);

  const loadSupplier = async (id: string) => {
    setIsLoading(true);
    setSupplier(null);
    try {
      const data = await apiGet<{ success: boolean; supplier: Supplier }>(`/api/suppliers/${id}`);
      if (data.success && data.supplier) {
        setSupplier(data.supplier);
      } else {
        toast({
          title: "Fehler",
          description: "Lieferant nicht gefunden",
          variant: "destructive",
        });
        setLocation("/suppliers");
      }
    } catch (error) {
      console.error('Error loading supplier:', error);
      toast({
        title: "Fehler",
        description: "Lieferant konnte nicht geladen werden",
        variant: "destructive",
      });
      setLocation("/suppliers");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Lade Lieferant...</p>
        </div>
      </div>
    );
  }

  if (!supplier) {
    return null;
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => setLocation("/suppliers")}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück zu Lieferanten
        </Button>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">{supplier.name}</h1>
            {supplier.description && (
              <p className="text-muted-foreground mt-2">{supplier.description}</p>
            )}
            {supplier.urlPattern && (
              <p className="text-sm text-muted-foreground mt-1">
                URL-Muster: {supplier.urlPattern}
              </p>
            )}
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Info className="w-4 h-4" />
            Übersicht
          </TabsTrigger>
          <TabsTrigger value="selectors" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            CSS-Selektoren
          </TabsTrigger>
          <TabsTrigger value="field-mapping" className="flex items-center gap-2">
            <Map className="w-4 h-4" />
            Field Mapping
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <SupplierOverviewTab supplier={supplier} onUpdate={() => loadSupplier(supplier.id)} />
        </TabsContent>

        <TabsContent value="selectors">
          <SupplierSelectorsTab supplier={supplier} onUpdate={() => loadSupplier(supplier.id)} />
        </TabsContent>

        <TabsContent value="field-mapping">
          <Card className="p-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Field Mapping Tool</h2>
              <p className="text-sm text-muted-foreground">
                Definieren Sie, wie gescrapte Felder auf Brickfox-CSV-Spalten gemappt werden sollen.
                Diese Mappings werden automatisch beim CSV-Export verwendet.
              </p>
            </div>
            <FieldMappingEditor
              supplierId={supplier.id}
              sourceType="url_scraper"
            />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
