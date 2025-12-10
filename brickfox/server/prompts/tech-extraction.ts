import { PromptContext, SubpromptConfig } from './types';

export const techExtractionConfig: SubpromptConfig = {
  name: 'tech-extraction',
  temperature: 0.1,
  maxTokens: 500,
  responseFormat: 'json_object',
  
  systemPrompt: (context: PromptContext) => `Du extrahierst technische Produktdaten aus ALLEN verfügbaren Informationen.

PRODUKTKATEGORIE: ${context.categoryName}

WICHTIGE TECHNISCHE FELDER:
${context.availableFields?.map(field => `- ${field}`).join('\n') || 'Keine Felder definiert'}

DEINE AUFGABE:
Extrahiere die technischen Daten aus ALLEN Quellen:
1. Produkttitel/Name
2. Produktbeschreibung
3. Strukturierte Felder
4. Freitext-Informationen

REGELN FÜR EXTRAKTION:
1. Suche ÜBERALL nach technischen Werten (auch im Titel!)
2. Erkenne Muster wie:
   - "5000mAh" oder "5000 mAh" → Kapazität
   - "3.6V" oder "3,6 V" oder "3.6-3.7V" → Spannung
   - "25A" oder "25 Ampere" → Stromstärke
   - "21700" oder "18650" → Format/Bauform
   - "184 g" oder "184g" → Gewicht
   - "70×37.5×37.5 mm" → Abmessungen
   - "Li-Ion" oder "Lithium-Ionen" → Technologie
3. Verwende die Feld-Labels von oben
4. Normalisiere Einheiten (z.B. "5000 mAh" → "5000 mAh")
5. Wenn mehrere Werte (z.B. "3.6V - 3.7V") → behalte beide
6. Nur Felder mit echten Werten zurückgeben

BEISPIELE:
Titel: "XTAR 21700-HP 25A 5000mAh 3.6V - 3.7V Li-Ionen-Akku"
→ Extrahiere:
  - Kapazität: 5000 mAh
  - Spannung: 3.6V - 3.7V
  - Stromstärke: 25A
  - Maße: Ø 21mm × 70mm (falls vorhanden)
  - Technologie: Li-Ion
  - Gewicht: 184 g (falls vorhanden)

WICHTIG: Schaue in ALLEN Produktdaten, nicht nur in strukturierten Feldern!

OUTPUT-FORMAT (JSON):
{
  "technicalSpecs": {
    "Feldname1": "Wert1",
    "Feldname2": "Wert2"
  }
}`,

  userPrompt: (context: PromptContext) => {
    // Baue einen umfassenden Text mit ALLEN verfügbaren Daten
    const allText: string[] = [];
    
    if (context.productData.product_name || context.productData.titel) {
      allText.push(`PRODUKTTITEL: ${context.productData.product_name || context.productData.titel}`);
    }
    
    if (context.productData.short_intro) {
      allText.push(`KURZBESCHREIBUNG: ${context.productData.short_intro}`);
    }
    
    if (context.productData.description || context.productData.beschreibung) {
      allText.push(`BESCHREIBUNG: ${context.productData.description || context.productData.beschreibung}`);
    }
    
    if (context.productData.extractedText) {
      allText.push(`EXTRAHIERTER TEXT: ${context.productData.extractedText}`);
    }
    
    if (context.productData.bullets && Array.isArray(context.productData.bullets)) {
      allText.push(`EIGENSCHAFTEN: ${context.productData.bullets.join(' | ')}`);
    }
    
    // Strukturierte technische Daten, falls vorhanden
    if (context.productData.technischeDaten) {
      allText.push(`STRUKTURIERTE DATEN: ${JSON.stringify(context.productData.technischeDaten)}`);
    }

    return `Produktdaten (suche in ALLEN Texten nach technischen Werten):

${allText.join('\n\n')}

---

Extrahiere jetzt ALLE technischen Daten, die du finden kannst, als JSON.
Schaue besonders im Produkttitel nach Zahlen mit Einheiten!`;
  }
};
