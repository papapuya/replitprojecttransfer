import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Copy, Download, Image, FileText, Trash2 } from "lucide-react";

export default function HtmlGenerator() {
  const { toast } = useToast();
  const [textInput, setTextInput] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [htmlOutput, setHtmlOutput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      if (textInput) {
        formData.append("text", textInput);
      }
      if (imageFile) {
        formData.append("image", imageFile);
      }

      const token = localStorage.getItem("supabase_token");
      const response = await fetch("/api/generate-html-description", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Generierung fehlgeschlagen");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setHtmlOutput(data.html);
      toast({
        title: "HTML generiert",
        description: "Die Produktbeschreibung wurde erfolgreich erstellt.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Datei zu groß",
          description: "Maximale Dateigröße ist 5 MB.",
          variant: "destructive",
        });
        return;
      }

      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Datei zu groß",
          description: "Maximale Dateigröße ist 5 MB.",
          variant: "destructive",
        });
        return;
      }

      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(htmlOutput);
    toast({
      title: "Kopiert",
      description: "HTML wurde in die Zwischenablage kopiert.",
    });
  };

  const exportAsFile = () => {
    const blob = new Blob([htmlOutput], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "produkt-beschreibung.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Exportiert",
      description: "HTML-Datei wurde heruntergeladen.",
    });
  };

  const canGenerate = textInput.trim() || imageFile;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Text/Bild zu HTML</h1>
        <p className="text-muted-foreground mt-2">
          Wandle Text oder Screenshots in strukturierte HTML-Produktbeschreibungen um.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Text eingeben
              </CardTitle>
              <CardDescription>
                Gib Produktinformationen als Freitext, Stichpunkte oder unformatiert ein.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="z.B. Akku für iPhone 12 Pro, 2815 mAh, Li-Ion, passend für A2407, A2341..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="w-5 h-5" />
                Screenshot hochladen
              </CardTitle>
              <CardDescription>
                Lade einen Screenshot mit Produktdaten hoch (PNG, JPG, WebP, max. 5 MB).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  imagePreview ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                {imagePreview ? (
                  <div className="space-y-4">
                    <img
                      src={imagePreview}
                      alt="Vorschau"
                      className="max-h-48 mx-auto rounded-lg shadow-md"
                    />
                    <div className="flex justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage();
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Entfernen
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-10 h-10 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Bild hierher ziehen oder klicken zum Auswählen
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={() => generateMutation.mutate()}
            disabled={!canGenerate || generateMutation.isPending}
            className="w-full"
            size="lg"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generiere HTML...
              </>
            ) : (
              "HTML generieren"
            )}
          </Button>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Generiertes HTML</CardTitle>
            <CardDescription>
              Das erzeugte HTML kann direkt kopiert oder als Datei exportiert werden.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={copyToClipboard}
                disabled={!htmlOutput}
              >
                <Copy className="w-4 h-4 mr-2" />
                HTML kopieren
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportAsFile}
                disabled={!htmlOutput}
              >
                <Download className="w-4 h-4 mr-2" />
                Als .html exportieren
              </Button>
            </div>
            <Textarea
              value={htmlOutput}
              onChange={(e) => setHtmlOutput(e.target.value)}
              placeholder="Hier erscheint das generierte HTML..."
              className="min-h-[400px] font-mono text-xs"
            />
            {htmlOutput && (
              <div className="space-y-2">
                <Label>Vorschau</Label>
                <div
                  className="border rounded-lg p-4 bg-white text-black prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: htmlOutput }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
