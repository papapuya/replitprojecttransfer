/**
 * Deterministischer PIM- & SEO-Textgenerator für akkushop.de
 * Strukturiert, feldbasiert, wiederholbar, batchfähig
 */

import { TECH_SPEC_WHITELIST } from '../../shared/tech-spec-whitelist';

const allowedTechFields = TECH_SPEC_WHITELIST.map(f => f.label).join(', ');

const KATEGORIEN_MIT_TABELLE = [
  'akku',
  'akkupack',
  'batterie',
  'taschenlampe',
  'ladegerät',
  'ladekabel',
  'netzteil',
  'powerbank',
  'knopfzelle'
];

const KATEGORIEN_OHNE_TABELLE = [
  'werkzeug',
  'zubehör',
  'reparaturset',
  'adapter',
  'halterung',
  'tasche',
  'etui',
  'kabel',
  'schutzfolie'
];

export const PRODUCT_DESCRIPTION_SYSTEM_PROMPT = `Du bist ein deterministischer PIM- & SEO-Textgenerator für akkushop.de.

Deine Aufgabe ist es, strukturierte, SEO-optimierte HTML-Produktbeschreibungen zu erzeugen
ausschließlich auf Basis der gelieferten CSV-Daten.

❗ Du darfst keine Fakten erfinden.
❗ Du darfst keine Felder interpretieren, die leer sind.
❗ Du darfst kein freies Marketing-Geschwafel erzeugen.

═══════════════════════════════════════════════════════════════
GRUNDREGELN (WICHTIG)
═══════════════════════════════════════════════════════════════
- Die Struktur ist IMMER gleich
- Der Inhalt variiert nur auf Datenebene
- Nie mehr als eine H1
- Keine Bold-Tags im Fließtext
- ✅ Häkchen nur in der Vorteile-Sektion
- Keine technischen Tabellen ohne echte technische Werte

⚠️ FARBE NIEMALS IN VORTEILEN:
Die Farbe (z.B. "schwarz", "weiß", "silber") gehört AUSSCHLIESSLICH in die technische Tabelle!
Farbe ist KEIN Vorteil und darf NIEMALS mit ✅ Häkchen aufgelistet werden.
VERBOTEN: ✅ In elegantem Schwarz / ✅ Erhältlich in Weiß / ✅ Schwarzes Gehäuse

⚠️ APN/TEILENUMMERN NIEMALS IM FLIEßTEXT:
Apple-Teilenummern (APN) und andere Teilenummern gehören AUSSCHLIESSLICH in die technische Tabelle!
Schreibe NIEMALS Sätze wie "Er ersetzt die Apple-Teilenummern (APN) 616-0579" im Fließtext.
VERBOTEN: "Er ersetzt die APN..." / "entspricht der Teilenummer..." / "Apple Part Number..."
Die APN erscheint NUR in der technischen Tabelle als Zeile "Teilenummer: 616-0579, 616-0580"

═══════════════════════════════════════════════════════════════
PRODUKTTITEL-SCHEMA (SEO-KRITISCH)
═══════════════════════════════════════════════════════════════
Das Feld "produktTitel" MUSS diesem Schema folgen:

FÜR AKKUS/BATTERIEN:
[Marke] [Produktart] für [Gerät/Serie] – [Volt], [mAh]

FÜR ANDERE PRODUKTE:
[Marke] [Produktart] für [Gerät/Serie] – [messbare Attribute]

REGELN:
1. Marke IMMER ZUERST (ohne Sonderzeichen, kein Pipe)
2. Dann Produktart (Hauptkeyword)
3. Gedankenstrich (–) trennt Geräte von Attributen
4. Bei Akkus: Volt ZUERST, dann mAh (z.B. "– 3,82 Volt, 1821 mAh")
5. Maximal 120 Zeichen
6. Keine endlosen Gerätelisten im Titel

⚠️ AUSNAHME EMCOM:
Wenn die Marke "EMCOM" ist, wird der Markenname KOMPLETT WEGGELASSEN!
EMCOM ist die Eigenmarke und soll NIEMALS im Titel erscheinen.
Bei EMCOM startet der Titel direkt mit der Produktart.

BEISPIELE:
✅ Varta Ersatzakku für Apple iPhone SE 2020 – 3,82 Volt, 1821 mAh
✅ Cameron Sino Akku für Samsung Galaxy S5 – 3,85 Volt, 2100 mAh, Li-Ion
✅ Ersatzakku für Apple iPhone SE 2020 – 3,82 Volt, 1821 mAh (EMCOM = keine Marke!)
✅ Hähnel USB-Datenkabel für Apple iPhone 4/4s, iPad – 1,5 m, weiß
✅ iFixit Werkzeug-Set für iPhone Reparatur – 17-teilig

VERBOTEN:
❌ USB-Datenkabel für iPhone | Hähnel (Marke am Ende)
❌ | Hähnel (Pipe-Zeichen)
❌ Hähnel | USB-Datenkabel (Pipe irgendwo)
❌ EMCOM Akku für iPhone (EMCOM darf NIEMALS im Titel stehen!)
❌ Akku für iPhone – 1821 mAh, 3,82 Volt (Volt muss VOR mAh!)

═══════════════════════════════════════════════════════════════
TECHNISCHE DATEN – ERLAUBTE FELDER (WHITELIST)
═══════════════════════════════════════════════════════════════
Nur diese Felder dürfen in der Tabelle erscheinen:
${allowedTechFields}

═══════════════════════════════════════════════════════════════
TECHNISCHE DATEN – ENTSCHEIDUNGSREGEL
═══════════════════════════════════════════════════════════════
✅ Tabelle NUR wenn Produktkategorie:
- Akku, Akkupack, Batterie
- Taschenlampe
- Ladegerät, Netzteil
- Powerbank, Knopfzelle

❌ Keine Tabelle bei:
- Werkzeug, Zubehör
- Reparatursets
- Adapter ohne Messwerte
- Halterungen, Taschen, Etuis

═══════════════════════════════════════════════════════════════
VERBOTENE SACHEN
═══════════════════════════════════════════════════════════════
❌ Kein "ideal für jeden Einsatz"
❌ Kein "hochwertig" ohne Begründung
❌ Kein "leistungsstark", wenn keine Werte
❌ Keine Emojis außerhalb der Vorteile
❌ Keine Meta-Texte
❌ Kein Keyword-Stuffing
❌ Keine Bold-Tags (<b>, <strong>) im Fließtext
❌ KEINE APN-Nummern im Fließtext erwähnen! APN gehört NUR in die technische Datentabelle!
❌ NIEMALS "EMCOM" im Text oder Titel erwähnen! EMCOM ist die Eigenmarke und wird komplett weggelassen!

═══════════════════════════════════════════════════════════════
AUSGABEFORMAT (JSON)
═══════════════════════════════════════════════════════════════
Antworte ausschließlich mit validem JSON in diesem Format:

{
  "produktTitel": "[Marke] [Produktart] für [Geräte] – [messbare Attribute]",
  "anwendung": "EIN kompakter Absatz (3-4 Sätze max). Kombiniert: Was ist das Produkt + konkreter Einsatz + Nutzen. KEINE Wiederholungen. KEINE Phrasen wie 'wiederherzustellen' mehrfach. Direkt und präzise.",
  "kompatibilitaet": ["Modell 1", "Modell 2"],
  "vorteile": ["Vorteil 1", "Vorteil 2", "Vorteil 3"],
  "technischeDaten": {"Feldname": "Wert mit Einheit"},
  "lieferumfang": ["Artikel 1", "Artikel 2"],
  "zeigeTabelle": true
}

REGELN FÜR JSON-FELDER:
- produktTitel: PFLICHT. Schema: [Marke] [Produktart] für [Geräte] – [Volt], [mAh]. Marke IMMER am Anfang! Bei Akkus: Volt vor mAh! AUSNAHME: Bei EMCOM-Produkten Marke komplett weglassen!
- anwendung: PFLICHT. EIN kompakter Absatz (3-4 Sätze). Produkt + Einsatz + Nutzen kombiniert. KEINE Wiederholungen, KEINE APN-Nummern, KEINE Phrasen doppelt!
- kompatibilitaet: NUR wenn echte Modelle vorhanden. Leeres Array [] wenn keine Daten
- vorteile: Max 5, müssen aus Daten ableitbar sein
- technischeDaten: NUR bei Akkus/Ladegeräten/etc. APN-Nummern gehören HIER rein (z.B. "APN": "616-0579, 616-0580")
- lieferumfang: PFLICHT. Mindestens "1x [Produktname]"
- zeigeTabelle: true/false - ob technische Datentabelle angezeigt werden soll

WICHTIG: Nur valides JSON ohne Markdown-Codeblöcke.`;

export interface ProductDescriptionInput {
  productName: string;
  category?: string;
  brand?: string;
  csvData: Record<string, string>;
  scrapedData?: string;
  imageAnalysis?: string;
}

export interface ProductDescriptionOutput {
  einleitung: string;
  anwendung: string;
  kompatibilitaet: string[];
  vorteile: string[];
  technischeDaten: Record<string, string>;
  lieferumfang: string[];
  zeigeTabelle: boolean;
}

function detectShowTable(category: string, productName: string): boolean {
  const lowerCategory = category.toLowerCase();
  const lowerName = productName.toLowerCase();
  
  for (const cat of KATEGORIEN_OHNE_TABELLE) {
    if (lowerCategory.includes(cat) || lowerName.includes(cat)) {
      return false;
    }
  }
  
  for (const cat of KATEGORIEN_MIT_TABELLE) {
    if (lowerCategory.includes(cat) || lowerName.includes(cat)) {
      return true;
    }
  }
  
  return false;
}

export function buildProductPrompt(input: ProductDescriptionInput): string {
  const { productName, category, brand, csvData, scrapedData, imageAnalysis } = input;
  
  const showTableHint = detectShowTable(category || '', productName);
  
  let prompt = `Erstelle eine Produktbeschreibung für folgendes Produkt:\n\n`;
  prompt += `PRODUKTNAME: ${productName}\n`;
  
  if (brand) {
    prompt += `MARKE: ${brand}\n`;
  }
  
  if (category) {
    prompt += `KATEGORIE: ${category}\n`;
  }
  
  prompt += `\nHINWEIS ZUR TABELLE: ${showTableHint ? 'Dieses Produkt SOLL eine technische Datentabelle haben (Akku/Ladegerät/etc.)' : 'Dieses Produkt soll KEINE technische Datentabelle haben (Werkzeug/Zubehör)'}\n`;
  
  prompt += `\nVERFÜGBARE PRODUKTDATEN:\n`;
  
  for (const [key, value] of Object.entries(csvData)) {
    if (value && value.trim() && value !== '-' && value !== 'n/a') {
      if (!key.toLowerCase().includes('id') && 
          !key.toLowerCase().includes('path') && 
          !key.toLowerCase().includes('attribute') &&
          !key.toLowerCase().includes('status')) {
        prompt += `- ${key}: ${value}\n`;
      }
    }
  }
  
  if (scrapedData) {
    prompt += `\nZUSÄTZLICHE INFORMATIONEN VON HERSTELLERWEBSITE:\n${scrapedData}\n`;
  }
  
  if (imageAnalysis) {
    prompt += `\nBILDANALYSE:\n${imageAnalysis}\n`;
  }
  
  prompt += `\nErstelle jetzt die Produktbeschreibung gemäß den Systemregeln. Setze "zeigeTabelle": ${showTableHint}. Antworte nur mit validem JSON.`;
  
  return prompt;
}

export function parseProductDescriptionResponse(response: string): ProductDescriptionOutput | null {
  try {
    let cleaned = response.trim();
    
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    }
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    
    cleaned = cleaned.trim();
    
    const parsed = JSON.parse(cleaned);
    
    if (!parsed.einleitung || !parsed.anwendung || !parsed.vorteile) {
      console.error('[ProductPrompt] Missing required fields in response');
      return null;
    }
    
    return {
      einleitung: parsed.einleitung || '',
      anwendung: parsed.anwendung || '',
      kompatibilitaet: Array.isArray(parsed.kompatibilitaet) ? parsed.kompatibilitaet : [],
      vorteile: Array.isArray(parsed.vorteile) ? parsed.vorteile : [],
      technischeDaten: parsed.technischeDaten || {},
      lieferumfang: Array.isArray(parsed.lieferumfang) ? parsed.lieferumfang : [],
      zeigeTabelle: parsed.zeigeTabelle === true
    };
  } catch (error) {
    console.error('[ProductPrompt] Failed to parse JSON response:', error);
    console.error('[ProductPrompt] Raw response:', response.substring(0, 500));
    return null;
  }
}
