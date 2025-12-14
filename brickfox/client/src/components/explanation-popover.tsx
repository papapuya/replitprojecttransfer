import { useState } from "react";
import { HelpCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface ExplanationPopoverProps {
  productData: {
    produktname?: string;
    produktname_neu?: string;
    produktbeschreibung_html?: string;
    akku_mah?: string;
    akku_v?: string;
    akku_ch?: string;
  };
  generatedContent?: string;
}

const QUICK_QUESTIONS = [
  "Warum wurde keine technische Tabelle erstellt?",
  "Warum fehlt 'Ihre Vorteile'?",
  "Wie wurde der SEO-Titel generiert?",
  "Warum wurde die Kompatibilität weggelassen?"
];

export function ExplanationPopover({ productData, generatedContent }: ExplanationPopoverProps) {
  const [open, setOpen] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);

  const explainMutation = useMutation({
    mutationFn: async (question: string) => {
      const truncatedContent = generatedContent?.substring(0, 1000) || '';
      const limitedProductData = {
        produktname: productData.produktname?.substring(0, 200),
        produktname_neu: productData.produktname_neu?.substring(0, 200),
        akku_mah: productData.akku_mah,
        akku_v: productData.akku_v,
        akku_ch: productData.akku_ch
      };
      
      const response = await apiRequest("POST", "/api/prompt-assistant/explain", {
        productData: limitedProductData,
        generatedContent: truncatedContent,
        question
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success && data.explanation) {
        setExplanation(data.explanation);
      } else {
        setExplanation(data.explanation || 'Keine Erklärung verfügbar.');
      }
    }
  });

  const handleQuestionClick = (question: string) => {
    setSelectedQuestion(question);
    setExplanation(null);
    explainMutation.mutate(question);
  };

  const handleClose = () => {
    setOpen(false);
    setExplanation(null);
    setSelectedQuestion(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="p-1 h-auto"
          title="Warum wurde so generiert?"
        >
          <HelpCircle className="w-4 h-4 text-muted-foreground hover:text-primary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Warum wurde so generiert?</h4>
            <Button variant="ghost" size="sm" className="p-1 h-auto" onClick={handleClose}>
              <X className="w-3 h-3" />
            </Button>
          </div>
          
          {!selectedQuestion && !explanation && (
            <div className="space-y-2">
              {QUICK_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleQuestionClick(q)}
                  className="w-full text-left text-xs p-2 rounded border border-border hover:bg-accent transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {explainMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analysiere...</span>
            </div>
          )}

          {explanation && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{selectedQuestion}</p>
              <p className="text-sm">{explanation}</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  setExplanation(null);
                  setSelectedQuestion(null);
                }}
              >
                Andere Frage stellen
              </Button>
            </div>
          )}

          {explainMutation.isError && (
            <p className="text-sm text-destructive">
              Fehler beim Laden der Erklärung
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
