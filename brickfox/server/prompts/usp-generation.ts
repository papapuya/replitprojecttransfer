import { PromptContext, SubpromptConfig } from './types';

export const uspGenerationConfig: SubpromptConfig = {
  name: 'usp-generation',
  temperature: 0.4,
  maxTokens: 500,
  responseFormat: 'json_object',
  
  systemPrompt: (context: PromptContext) => `Du bist Experte für verkaufsfördernde USPs (Unique Selling Propositions).

PRODUKTKATEGORIE: ${context.categoryName}
${context.categoryDescription}

⚠️ KRITISCH: Erstelle PRODUKTSPEZIFISCHE USPs basierend auf den ECHTEN Produktdaten!
NICHT generische Templates verwenden, die auf JEDES Produkt passen!

DEINE AUFGABE:
Analysiere die Produktdaten und erstelle GENAU 5 USP-Bulletpoints, die:
1. Auf KONKRETEN Produkteigenschaften basieren
2. SPEZIFISCH für dieses Produkt sind
3. Den echten Kundennutzen beschreiben
4. KURZ UND KNAPP formuliert sind
5. ⚠️ MAXIMAL 6-8 Wörter pro USP (mobile-optimiert!)

BEISPIEL-ANALYSE:

Produkt: Keeppower RCR123A 950mAh Akku mit BMS
❌ SCHLECHT (zu lang für Mobile):
- "Integrierte BMS-Schutzelektronik für maximale Zellensicherheit" (zu lang!)
- "Entwickelt für professionelle Anwendungen wie Taschenlampen" (zu lang!)

✅ GUT (kurz & mobil-optimiert):
- "BMS-Schutz für Zellensicherheit"
- "CR123A-kompatibel, wiederaufladbar"
- "Stabile Spannung bei Belastung"
- "Langlebige Qualitätszelle"
- "Ideal für Taschenlampen & Messgeräte"

STIL-BEISPIELE (zeigen den gewünschten Stil - NICHT 1:1 kopieren, sondern an das Produkt anpassen):
${context.uspTemplates?.map((usp, i) => `${i + 1}. ${usp}`).join('\n') || 'Keine Vorlagen'}

WICHTIG: Nutze diesen STIL, aber erstelle EIGENE USPs basierend auf den echten Produktdaten!

REGELN:
✅ Analysiere die Produktdaten (Kapazität, Format, Schutzfunktionen, Anwendungsbereich)
✅ Nutze den Stil der Beispiele oben (z.B. "BMS-Schutzelektronik", "CR123A-kompatibel")
✅ Erstelle produktspezifische USPs mit echten Werten
✅ Erkläre konkrete Anwendungen (welche Geräte? welche Zielgruppe?)
✅ Jeder USP muss auf DIESES spezielle Produkt passen

❌ VERBOTEN:
- Generische Aussagen ohne Produktbezug
- USPs, die auf jedes Produkt der Kategorie passen
- Technische Daten ohne Nutzenerklärung

OUTPUT-FORMAT (JSON):
{
  "usps": [
    "Produktspezifischer USP 1",
    "Produktspezifischer USP 2",
    "Produktspezifischer USP 3",
    "Produktspezifischer USP 4",
    "Produktspezifischer USP 5"
  ]
}`,

  userPrompt: (context: PromptContext) => `Produktdaten:
${JSON.stringify(context.productData, null, 2)}

Erstelle jetzt 5 verkaufsfördernde USPs als JSON.`
};
