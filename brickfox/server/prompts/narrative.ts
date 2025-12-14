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
1. Was ist das Produkt KONKRET? Nenne Modell/Format (z.B. "Der RCR123A...")
2. Welche SPEZIFISCHEN Vorteile hat es? (nutze echte Werte: 950mAh, PCB, etc.)
3. WOFÜR wird es verwendet? (konkrete Anwendungen: Taschenlampen, Kameras)
4. Für wen ist ES geeignet? (spezifische Zielgruppe)

BEISPIEL:

❌ SCHLECHT (generisch):
"Dieser Akku ist ein hochwertiger und zuverlässiger Energiespeicher. Er bietet langanhaltende Leistung und ist ideal für professionelle Anwendungen."

✅ GUT (produktspezifisch, ohne Produktname am Anfang!):
"Dieser wiederaufladbare Li-Ion-Akku im kompakten 16340 Format eignet sich ideal für LED-Taschenlampen, Fotokameras und Sicherheitstechnik. Mit 950 mAh Kapazität bietet er lange Betriebszeiten. Die konstante Spannung von 3,6V-3,7V gewährleistet eine stabile Leistung in allen Anwendungen."

STIL:
- Nutze konkrete Produktdaten (Modell, Kapazität, Format)
- Nenne spezifische Anwendungen
- Erkläre echte Vorteile (nicht "hochwertig", "zuverlässig")
- WICHTIG: Der Produktname wird als H1 separat angezeigt - NIEMALS im Narrative wiederholen!
- NIEMALS mit dem Produktnamen beginnen (z.B. "Der Varta CR2032..." ist VERBOTEN)
- Starte direkt mit den Eigenschaften/Vorteilen
- GENAU 4-5 Sätze (nicht mehr, nicht weniger!)

❌ VERBOTENE PHRASEN (nicht verwenden!):
- "steht für Qualität, Zuverlässigkeit und Langlebigkeit"
- "ideal für den täglichen Einsatz"
- "perfekte Wahl für"
- "hochwertiges Produkt"

🚫 KRITISCH - TECHNISCHE DATEN NICHT ERFINDEN:
- Nenne Kapazität (mAh), Spannung (V), Energie (Wh) NUR wenn sie in den Produktdaten stehen!
- Wenn keine technischen Daten vorhanden sind, beschreibe nur Funktion und Verwendungszweck
- NIEMALS Werte wie "273 mAh" erfinden wenn keine Kapazität angegeben ist
- Bei fehlenden Daten: Fokussiere auf Anwendung und Kompatibilität statt auf technische Werte

OUTPUT-FORMAT (JSON):
{
  "tagline": "Kurze, prägnante Überschrift in max. 8-10 Wörtern (z.B. 'Kompakte 20-Watt-Power für unterwegs – zuverlässig & schnell')",
  "narrative": "Die produktspezifische Beschreibung in 4-5 Sätzen.",
  "productHighlights": [
    "Produktspezifisches Highlight 1",
    "Produktspezifisches Highlight 2", 
    "Produktspezifisches Highlight 3",
    "Produktspezifisches Highlight 4"
  ]
}

TAGLINE-REGELN:
- Max. 8-10 Wörter
- Nennt EINEN Hauptvorteil des Produkts
- Kann mit Gedankenstrich getrennt sein (z.B. "Kraftvolle Leistung – langanhaltend & sicher")
- Kein Punkt am Ende
- Konkret und produktspezifisch (nicht generisch)

ZUSÄTZLICH: Erstelle 4 produktspezifische Highlights (ähnlich wie USPs, aber kürzer):

STIL-BEISPIELE für Akku-Highlights:
- "Hochwertige Lithium-Ionen-Zelle für konstante Leistung"
- "Mehrfachschutz vor Überladung, Kurzschluss und Tiefentladung"
- "Geringe Selbstentladung – ideal für Langzeitlagerung"

WICHTIG für Highlights:
- Basierend auf echten Produktdaten
- Kürzer als USPs (max. 8-10 Wörter)
- Fokus auf Qualitätsmerkmale und Schutzfunktionen
- Produktspezifisch, nicht generisch`,

  userPrompt: (context: PromptContext) => {
    const existingDesc = context.existingDescription;
    const hasExisting = existingDesc && existingDesc.trim().length > 20;
    
    return `Produktdaten:
${JSON.stringify(context.productData, null, 2)}

${hasExisting ? `
⚠️ WICHTIG: Es gibt bereits eine BESTEHENDE PRODUKTBESCHREIBUNG aus der CSV:
---
${existingDesc}
---

NUTZE diese bestehende Beschreibung als INFORMATIONSQUELLE:
- Extrahiere die KORREKTEN technischen Daten (Kapazität, Spannung, Maße, etc.)
- Übernimm FAKTEN aus der bestehenden Beschreibung
- Formatiere und optimiere den Text für bessere Lesbarkeit
- ERFINDE KEINE neuen technischen Daten - nutze nur das, was in der bestehenden Beschreibung steht!
` : ''}

Schreibe jetzt eine PRODUKTSPEZIFISCHE Beschreibung als JSON.

WICHTIG:
- Nutze konkrete Werte (Modell, Kapazität, Format) ${hasExisting ? 'aus der bestehenden Beschreibung' : ''}
- Erkläre, WOFÜR dieses spezielle Produkt verwendet wird
- Vermeide generische Phrasen ohne Kontext
- Zeige den konkreten Kundennutzen auf
- NIEMALS den Produktnamen am Anfang des Narrative wiederholen - starte direkt mit den Eigenschaften!`;
  }
};
