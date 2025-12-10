import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Scale, Upload, Download, RefreshCw, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";
import { apiRequest } from "@/lib/queryClient";

interface ProductRow {
  originalData: Record<string, string>;
  estimatedWeight: number | null;
  confidence: "high" | "medium" | "low" | "error";
  needsEstimation: boolean;
}

export default function WeightGenerator() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<"upload" | "estimating" | "done">("upload");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setIsProcessing(true);
    setProgress(0);
    setProducts([]);
    setHeaders([]);
    setCurrentStep("upload");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: ";",
      encoding: "ISO-8859-1",
      complete: (results) => {
        if (results && results.data && results.meta.fields) {
          const csvHeaders = results.meta.fields;
          setHeaders(csvHeaders);
          
          const parsed = (results.data as Record<string, string>[]).map((row) => {
            const currentWeight = row["v_weight"] || "";
            const needsEstimation = !currentWeight || currentWeight === "0" || currentWeight === "0.00";
            
            return {
              originalData: row,
              estimatedWeight: null,
              confidence: "low" as const,
              needsEstimation
            };
          });
          
          setProducts(parsed);
          setIsProcessing(false);
          
          const needsCount = parsed.filter(p => p.needsEstimation).length;
          toast({
            title: "CSV geladen",
            description: `${parsed.length} Produkte geladen, ${needsCount} benötigen Gewichtsschätzung.`,
          });
        }
      },
      error: (error) => {
        setIsProcessing(false);
        toast({
          variant: "destructive",
          title: "Fehler beim Laden",
          description: error.message
        });
      }
    });
  };

  const getProductId = (row: ProductRow) => {
    return row.originalData["p_id"] || row.originalData["v_id"] || "";
  };

  const getProductName = (row: ProductRow) => {
    return row.originalData["p_name[de]"] || row.originalData["p_name"] || "";
  };

  const getProductDescription = (row: ProductRow) => {
    return row.originalData["p_description[de]"] || row.originalData["p_description"] || "";
  };

  const getProductBrand = (row: ProductRow) => {
    return row.originalData["p_brand"] || "";
  };

  const getProductCategory = (row: ProductRow) => {
    return row.originalData["p_group_path[de]"] || row.originalData["p_group_path"] || "";
  };

  const estimateWeights = async () => {
    const productsToEstimate = products.filter(p => p.needsEstimation);
    
    if (productsToEstimate.length === 0) {
      toast({
        title: "Keine Schätzung nötig",
        description: "Alle Produkte haben bereits ein Gewicht.",
      });
      return;
    }

    setIsProcessing(true);
    setCurrentStep("estimating");
    setProgress(0);

    const batchSize = 10;
    const updatedProducts = [...products];

    for (let i = 0; i < productsToEstimate.length; i += batchSize) {
      const batch = productsToEstimate.slice(i, i + batchSize);
      
      try {
        const response = await apiRequest("POST", "/api/estimate-weight", {
          products: batch.map(p => ({
            id: getProductId(p),
            name: getProductName(p),
            description: getProductDescription(p),
            brand: getProductBrand(p),
            category: getProductCategory(p)
          }))
        });

        const data = await response.json();
        
        if (data.success && data.results) {
          data.results.forEach((result: any) => {
            const index = updatedProducts.findIndex(p => getProductId(p) === result.id);
            if (index !== -1) {
              updatedProducts[index] = {
                ...updatedProducts[index],
                estimatedWeight: result.estimatedWeight,
                confidence: result.confidence
              };
            }
          });
        }
      } catch (error) {
        console.error("Batch estimation error:", error);
      }

      const processedCount = Math.min(i + batchSize, productsToEstimate.length);
      setProgress(Math.round((processedCount / productsToEstimate.length) * 100));
      setProducts([...updatedProducts]);
    }

    setIsProcessing(false);
    setCurrentStep("done");
    setProgress(100);

    const estimated = updatedProducts.filter(p => p.estimatedWeight !== null).length;
    toast({
      title: "Schätzung abgeschlossen",
      description: `${estimated} Gewichte wurden geschätzt.`,
    });
  };

  const downloadResults = () => {
    if (products.length === 0) return;

    const csvData = products.map(p => {
      const row = { ...p.originalData };
      if (p.needsEstimation && p.estimatedWeight !== null) {
        row["v_weight"] = p.estimatedWeight.toString();
      }
      row["v_weight_estimated"] = p.estimatedWeight !== null ? p.estimatedWeight.toString() : "";
      row["confidence"] = p.confidence;
      return row;
    });

    const exportHeaders = [...headers];
    if (!exportHeaders.includes("v_weight_estimated")) {
      exportHeaders.push("v_weight_estimated");
    }
    if (!exportHeaders.includes("confidence")) {
      exportHeaders.push("confidence");
    }

    const csv = "\uFEFF" + Papa.unparse(csvData, { quotes: true, delimiter: ";", columns: exportHeaders });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `gewichte_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case "high":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Hoch</Badge>;
      case "medium":
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Mittel</Badge>;
      case "error":
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Fehler</Badge>;
      default:
        return <Badge variant="outline">Niedrig</Badge>;
    }
  };

  const needsEstimationCount = products.filter(p => p.needsEstimation).length;
  const estimatedCount = products.filter(p => p.estimatedWeight !== null).length;

  const displayHeaders = headers.length > 0 
    ? [...headers.slice(0, 8), "Geschätzt (g)", "Status"]
    : [];

  return (
    <div className="p-6 bg-background overflow-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-primary/10 p-2 rounded-lg">
          <Scale className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Gewichte-Generator</h1>
          <p className="text-sm text-muted-foreground">KI-basierte Gewichtsschätzung für Produkte ohne Gewichtsangabe</p>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>CSV Hochladen</CardTitle>
            <CardDescription>
              Laden Sie eine Brickfox-CSV hoch. Produkte ohne Gewicht (v_weight = 0 oder leer) werden markiert.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div 
              className={`
                border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center transition-all
                ${isProcessing && currentStep === "upload" ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 cursor-pointer'}
              `}
              onClick={() => !isProcessing && fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                accept=".csv,.txt"
                onChange={handleFileUpload}
                disabled={isProcessing}
              />
              
              {isProcessing && currentStep === "upload" ? (
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                  <span>CSV wird geladen...</span>
                </div>
              ) : (
                <>
                  <div className="bg-muted p-4 rounded-full mb-4">
                    <Upload className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">CSV Datei hochladen</h3>
                  <p className="text-muted-foreground mb-4">Brickfox-Export mit Produktdaten</p>
                  <Button>Datei auswählen</Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {products.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="text-lg py-1 px-3">
                  {products.length} Produkte
                </Badge>
                {needsEstimationCount > 0 && (
                  <Badge variant="secondary" className="text-lg py-1 px-3 bg-yellow-500/10 text-yellow-600">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {needsEstimationCount} ohne Gewicht
                  </Badge>
                )}
                {estimatedCount > 0 && (
                  <Badge className="text-lg py-1 px-3 bg-green-500/10 text-green-600">
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {estimatedCount} geschätzt
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => { setProducts([]); setHeaders([]); }}
                  disabled={isProcessing}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Reset
                </Button>
                <Button 
                  variant="secondary"
                  onClick={estimateWeights}
                  disabled={isProcessing || needsEstimationCount === 0}
                >
                  <Scale className="w-4 h-4 mr-2" /> 
                  {isProcessing ? "Schätze..." : "Gewichte schätzen"}
                </Button>
                <Button onClick={downloadResults} disabled={products.length === 0}>
                  <Download className="w-4 h-4 mr-2" /> CSV Export
                </Button>
              </div>
            </div>

            {isProcessing && currentStep === "estimating" && (
              <Card>
                <CardContent className="py-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <RefreshCw className="w-5 h-5 text-primary animate-spin" />
                      <span className="font-medium">KI schätzt Gewichte...</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <p className="text-sm text-muted-foreground">{progress}% abgeschlossen</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[500px]">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted sticky top-0 z-10">
                      <tr>
                        {displayHeaders.map((header, idx) => (
                          <th key={idx} className="p-3 font-medium text-muted-foreground whitespace-nowrap text-xs">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {products.slice(0, 100).map((item, i) => (
                        <tr key={i} className={`hover:bg-muted/50 transition-colors ${item.needsEstimation ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''}`}>
                          {headers.slice(0, 8).map((header, idx) => (
                            <td key={idx} className="p-3 text-xs max-w-[200px] truncate" title={item.originalData[header] || ""}>
                              {item.originalData[header] || "-"}
                            </td>
                          ))}
                          <td className="p-3 text-xs">
                            {item.estimatedWeight !== null ? (
                              <span className="font-semibold text-primary">{item.estimatedWeight} g</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3">
                            {item.needsEstimation ? (
                              item.estimatedWeight !== null ? (
                                <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Geschätzt
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-xs">
                                  <AlertCircle className="w-3 h-3 mr-1" /> Ausstehend
                                </Badge>
                              )
                            ) : (
                              <Badge variant="outline" className="bg-gray-500/10 text-xs">OK</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {products.length > 100 && (
                    <div className="p-4 text-center text-muted-foreground border-t">
                      ... und {products.length - 100} weitere Produkte (Export enthält alle)
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
