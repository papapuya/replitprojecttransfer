import { PromptContext, SubpromptConfig } from './types';

// Kategorie-spezifische technisch sinnvolle USP-Beispiele
function getCategorySpecificExamples(productData: any): string {
  const productName = (productData?.productName || productData?.produktname || '').toLowerCase();
  
  // Knopfzellen / Lithium-Batterien (CR2032, CR2025, CR123A, etc.)
  if (productName.match(/cr\d{4}|cr123|knopfzelle|lithium.*batter/i)) {
    return `
TECHNISCH SINNVOLLE USPs für KNOPFZELLEN/LITHIUM-BATTERIEN:
- "3V Spannung, kompakte Bauform"
- "Geringe Selbstentladung"
- "Konstante Spannung über Jahre"
- "Breiter Temperaturbereich"
- "Auslaufsichere Lithium-Technologie"
- "Ideal für Uhren und Fernbedienungen"
- "Lange Lagerfähigkeit"`;
  }
  
  // Akkus / Wiederaufladbare Batterien
  if (productName.match(/akku|akkupack|battery.*pack|li-ion|li-polymer|nimh|nicd/i)) {
    return `
TECHNISCH SINNVOLLE USPs für AKKUS:
- "BMS-Schutzschaltung integriert"
- "Tiefentladeschutz"
- "Überladeschutz"
- "Kurzschlussschutz"
- "Hohe Zyklenfestigkeit"
- "Schnellladefähig"
- "Temperaturüberwachung"
- "Originalkapazität"`;
  }
  
  // Kabel / Flexkabel / Datenkabel
  if (productName.match(/kabel|flex|cable|dock|connector|lightning|usb/i)) {
    return `
TECHNISCH SINNVOLLE USPs für KABEL:
- "Vergoldete Kontakte"
- "Abgeschirmte Leitungen"
- "Knickschutz an Enden"
- "Hochwertige Lötverbindungen"
- "Originale Steckerbauform"
- "Präzise Passform"
- "Stabile Datenübertragung"`;
  }
  
  // Displays / Screens
  if (productName.match(/display|screen|lcd|oled|touchscreen/i)) {
    return `
TECHNISCH SINNVOLLE USPs für DISPLAYS:
- "Hohe Farbgenauigkeit"
- "Touch-Digitizer integriert"
- "Originale Auflösung"
- "Kratzfeste Oberfläche"
- "Werkskalibriert"
- "Präzise Touch-Erkennung"
- "Hochwertige Bildwiedergabe"`;
  }
  
  // Ladegeräte / Netzteile
  if (productName.match(/ladegerät|charger|netzteil|adapter|power.*supply/i)) {
    return `
TECHNISCH SINNVOLLE USPs für LADEGERÄTE:
- "Kurzschlussschutz"
- "Überspannungsschutz"
- "Temperaturüberwachung"
- "Automatische Abschaltung"
- "CE-zertifiziert"
- "Kompaktes Design"
- "Energieeffizient"`;
  }
  
  // Default für unbekannte Kategorien
  return `
TECHNISCH SINNVOLLE USPs (allgemein):
- Nenne konkrete technische Eigenschaften
- Erkläre den Nutzen der Technologie
- Beschreibe Schutzfunktionen
- Betone Qualitätsmerkmale
- Hebe Kompatibilität hervor`;
}

export const uspGenerationConfig: SubpromptConfig = {
  name: 'usp-generation',
  temperature: 0.4,
  maxTokens: 500,
  responseFormat: 'json_object',
  
  systemPrompt: (context: PromptContext) => `Du bist Experte für TECHNISCH SINNVOLLE Produktvorteile.

PRODUKTKATEGORIE: ${context.categoryName}
${context.categoryDescription}

⚠️ KRITISCH: Erstelle TECHNISCH SINNVOLLE USPs - keine generischen Marketing-Phrasen!

${getCategorySpecificExamples(context.productData)}

DEINE AUFGABE:
Analysiere die Produktdaten und erstelle GENAU 5 technisch sinnvolle Vorteile:

REGELN:
✅ Jeder Vorteil muss TECHNISCH BEGRÜNDBAR sein
✅ Beschreibe echte Produkteigenschaften (Schutzfunktionen, Materialien, Technologie)
✅ 50-80 Zeichen pro Vorteil (nicht zu kurz, nicht zu lang)
✅ Spezifisch für diese Produktkategorie
✅ Nutzen muss erkennbar sein

❌ VERBOTEN:
- "Zuverlässige Stromversorgung" (zu generisch)
- "Lange Lebensdauer" (zu generisch)  
- "Einfache Installation" (zu generisch)
- "Hochwertige Qualität" (nichtssagend)
- Alles was auf JEDES Produkt passen würde

BEISPIEL für Knopfzelle CR2032:
✅ "3V Spannung bei kompakter Bauform"
✅ "Geringe Selbstentladung für lange Lagerung"
✅ "Konstante Spannung über die Lebensdauer"
✅ "Breiter Temperaturbereich (-20°C bis +60°C)"
✅ "Auslaufsichere Lithium-Technologie"

OUTPUT-FORMAT (JSON):
{
  "usps": [
    "Technisch sinnvoller Vorteil 1",
    "Technisch sinnvoller Vorteil 2",
    "Technisch sinnvoller Vorteil 3",
    "Technisch sinnvoller Vorteil 4",
    "Technisch sinnvoller Vorteil 5"
  ]
}`,

  userPrompt: (context: PromptContext) => `Produktdaten:
${JSON.stringify(context.productData, null, 2)}

Erstelle jetzt 5 TECHNISCH SINNVOLLE Vorteile als JSON. Keine generischen Phrasen!`
};
