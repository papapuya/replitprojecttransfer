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
1. Was ist das Produkt KONKRET? Nenne Modell/Format
2. WOFÜR wird es verwendet? (konkrete Anwendungen)
3. Welche VORTEILE hat es? (Nutzen beschreiben, KEINE technischen Zahlen!)
4. Für wen ist ES geeignet? (spezifische Zielgruppe)

BEISPIEL:

❌ SCHLECHT (mit technischen Werten):
"Dieser Akku bietet 950 mAh Kapazität und 3,7V Spannung. Mit 12 V Leistung..."

✅ GUT (ohne technische Werte, nur Nutzen):
"Dieser wiederaufladbare Li-Ion-Akku im kompakten 16340 Format eignet sich ideal für LED-Taschenlampen, Fotokameras und Sicherheitstechnik. Er bietet lange Betriebszeiten und gewährleistet eine stabile Leistung in allen Anwendungen. Der integrierte Schutz vor Überladung sorgt für zusätzliche Sicherheit."

STIL:
- Nenne das Produktmodell/Format
- Nenne spezifische Anwendungen
- Erkläre den NUTZEN (nicht technische Zahlen)
- WICHTIG: Der Produktname wird als H1 separat angezeigt - NIEMALS im Narrative wiederholen!
- NIEMALS mit dem Produktnamen beginnen (z.B. "Der Varta CR2032..." ist VERBOTEN)
- Starte direkt mit den Eigenschaften/Vorteilen
- GENAU 4-5 Sätze (nicht mehr, nicht weniger!)

❌ VERBOTENE PHRASEN (nicht verwenden!):
- "steht für Qualität, Zuverlässigkeit und Langlebigkeit"
- "ideal für den täglichen Einsatz"
- "perfekte Wahl für"
- "hochwertiges Produkt"

🚫🚫🚫 ABSOLUT VERBOTEN - KEINE TECHNISCHEN WERTE IM TEXT 🚫🚫🚫
- NIEMALS Kapazität nennen (mAh, Ah)
- NIEMALS Spannung nennen (V, Volt)
- NIEMALS Energie nennen (Wh)
- NIEMALS Maße nennen (mm, cm)
- NIEMALS Gewicht nennen (g, kg)
- Technische Daten gehören NUR in die TABELLE!

VERBOTEN: "mit 12 V", "3500 mAh", "80 Ah", "Spannung von", "Kapazität von"
ERLAUBT: "zuverlässige Energieversorgung", "lange Betriebszeiten", "stabile Leistung"

OUTPUT-FORMAT (JSON):
{
  "tagline": "Kurze Überschrift in max. 8-10 Wörtern OHNE technische Werte",
  "narrative": "Die produktspezifische Beschreibung in 4-5 Sätzen OHNE technische Werte.",
  "productHighlights": [
    "Highlight 1 (OHNE Zahlen)",
    "Highlight 2 (OHNE Zahlen)", 
    "Highlight 3 (OHNE Zahlen)",
    "Highlight 4 (OHNE Zahlen)"
  ]
}

TAGLINE-REGELN:
- Max. 8-10 Wörter
- KEINE technischen Werte (keine V, mAh, Ah, Wh, mm, g)
- Nennt EINEN Hauptvorteil des Produkts
- Kein Punkt am Ende

WICHTIG für Highlights:
- KEINE Zahlen, KEINE Einheiten
- Fokus auf Qualitätsmerkmale und Schutzfunktionen
- Produktspezifisch, nicht generisch`,

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
Nutze diese als Informationsquelle für Anwendungsgebiete und Kompatibilität.
IGNORIERE alle technischen Werte (Spannung, Kapazität, etc.) - diese gehören NUR in die Tabelle!
` : ''}

Schreibe jetzt eine PRODUKTSPEZIFISCHE Beschreibung als JSON.

WICHTIG:
- KEINE technischen Werte im Text (keine V, mAh, Ah, Wh, mm, g)!
- Erkläre, WOFÜR dieses Produkt verwendet wird
- Beschreibe den NUTZEN für den Kunden
- NIEMALS den Produktnamen am Anfang wiederholen`;
  }
};
