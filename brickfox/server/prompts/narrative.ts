import { PromptContext, SubpromptConfig } from './types';

export const narrativeConfig: SubpromptConfig = {
  name: 'narrative',
  temperature: 0.5,
  maxTokens: 400,
  responseFormat: 'json_object',
  
  systemPrompt: (context: PromptContext) => `Du schreibst PRODUKTSPEZIFISCHE Produktbeschreibungen.

PRODUKTKATEGORIE: ${context.categoryName}
${context.categoryDescription}

⚠️ KRITISCH: Schreibe eine Beschreibung, die NUR auf DIESES Produkt passt!
NICHT generische Texte, die auf jedes Produkt der Kategorie passen!

DEINE AUFGABE:
Schreibe eine professionelle, produktspezifische Beschreibung in GENAU 4-5 Sätzen.

INHALT (produktspezifisch):
1. Was ist das Produkt KONKRET? Nenne Modell/Format und technische Daten
2. WOFÜR wird es verwendet? (konkrete Anwendungen)
3. Welche VORTEILE hat es?
4. Für wen ist ES geeignet? (spezifische Zielgruppe)

STIL:
- Nenne das Produktmodell/Format
- Nenne spezifische Anwendungen und technische Daten
- WICHTIG: Der Produktname wird als H1 separat angezeigt - NIEMALS im Narrative wiederholen!
- NIEMALS mit dem Produktnamen beginnen (z.B. "Der Varta CR2032..." ist VERBOTEN)
- Starte direkt mit den Eigenschaften/Vorteilen
- GENAU 4-5 Sätze (nicht mehr, nicht weniger!)

OUTPUT-FORMAT (JSON):
{
  "tagline": "Kurze Überschrift in max. 8-10 Wörtern",
  "narrative": "Die produktspezifische Beschreibung in 4-5 Sätzen.",
  "productHighlights": [
    "Highlight 1",
    "Highlight 2", 
    "Highlight 3",
    "Highlight 4"
  ]
}

TAGLINE-REGELN:
- Max. 8-10 Wörter
- Nennt EINEN Hauptvorteil des Produkts
- Kein Punkt am Ende`,

  userPrompt: (context: PromptContext) => {
    const existingDesc = context.existingDescription;
    const hasExisting = existingDesc && existingDesc.trim().length > 20;
    
    return `Produktdaten:
${JSON.stringify(context.productData, null, 2)}

${hasExisting ? `
Es gibt eine bestehende Produktbeschreibung als Referenz:
---
${existingDesc}
---
Nutze diese als Informationsquelle.
` : ''}

Schreibe jetzt eine PRODUKTSPEZIFISCHE Beschreibung als JSON.

WICHTIG:
- Erkläre, WOFÜR dieses Produkt verwendet wird
- Beschreibe den NUTZEN für den Kunden
- Nenne technische Daten wie Spannung und Kapazität
- NIEMALS den Produktnamen am Anfang wiederholen`;
  }
};
