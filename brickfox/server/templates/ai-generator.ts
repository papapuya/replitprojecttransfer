import OpenAI from 'openai';
import { ProductCopyPayload } from './types';
import { ProductCategoryConfig } from './category-config';
import { createOrchestrator } from '../prompts/orchestrator';
import type { PromptContext } from '../prompts/types';
import { processProductCopy } from './post-processor';
import { extractTechSpecs1to1 } from './tech-spec-parser';

export async function generateProductCopy(
  productData: any,
  categoryConfig: ProductCategoryConfig,
  openaiKey: string,
  openaiBaseUrl?: string,
  model: string = 'gpt-4o-mini',
  useModularPrompts: boolean = false
): Promise<ProductCopyPayload> {
  if (useModularPrompts || categoryConfig.subpromptPreferences?.useModularPrompts) {
    return await generateProductCopyModular(productData, categoryConfig, openaiKey, openaiBaseUrl, model);
  } else {
    return await generateProductCopyMonolithic(productData, categoryConfig, openaiKey, openaiBaseUrl, model);
  }
}

async function generateProductCopyModular(
  productData: any,
  categoryConfig: ProductCategoryConfig,
  openaiKey: string,
  openaiBaseUrl?: string,
  model: string = 'gpt-4o-mini'
): Promise<ProductCopyPayload> {
  console.log(`🔧 Using MODULAR subprompt architecture with ${model}`);

  const orchestrator = createOrchestrator({
    openaiKey,
    openaiBaseUrl,
    model, // Pass model to orchestrator
  });

  const context: PromptContext = {
    categoryName: categoryConfig.name,
    categoryDescription: categoryConfig.description,
    productData,
    availableFields: categoryConfig.technicalFields.map(f => 
      `${f.label}${f.unit ? ` (${f.unit})` : ''}`
    ),
    uspTemplates: categoryConfig.uspTemplates,
  };

  try {
    const result = await orchestrator.generateFullProductCopy(context);

    // POST-PROCESSING: Validiere und bereinige AI-Output
    const processed = processProductCopy({
      narrative: result.narrative,
      uspBullets: result.uspBullets,
    });

    if (processed.validationIssues.length > 0) {
      console.log('⚠️ Post-processing applied:', processed.validationIssues);
    }

    // 1:1 TECH SPECS EXTRAKTION: Aus Vision-Text oder strukturierten Daten
    const structuredDataSource = productData.structuredData || productData;
    console.log(`🔍 structuredData Typ: ${typeof structuredDataSource}, Schlüssel: ${Object.keys(structuredDataSource).slice(0, 5).join(', ')}`);
    
    // Prüfe ob p_name[de] vorhanden ist
    const pNameValue = structuredDataSource['p_name[de]'] || structuredDataSource['P Name[de]'] || structuredDataSource['p_name'] || 'NICHT GEFUNDEN';
    console.log(`🔍 p_name[de] Wert: ${typeof pNameValue === 'string' ? pNameValue.substring(0, 100) : 'kein String'}`);
    
    const directTechSpecs = extractTechSpecs1to1(
      productData.extractedText || '',
      structuredDataSource,
      categoryConfig
    );
    
    console.log(`🔍 directTechSpecs nach Extraktion: ${JSON.stringify(directTechSpecs)}`);
    
    // NUR 1:1 extrahierte Specs verwenden - KEINE AI-Fallbacks für technische Daten!
    // AI darf technische Werte nicht erfinden (z.B. falsche Kapazität)
    const mergedTechSpecs = directTechSpecs;

    console.log(`📊 Tech Specs: ${Object.keys(mergedTechSpecs).length} Felder (nur 1:1 aus CSV, AI-Specs ignoriert)`);

    return {
      tagline: result.tagline, // Neue Tagline für h2
      narrative: processed.narrative,
      uspBullets: processed.uspBullets.length >= 5 
        ? processed.uspBullets.slice(0, 5)
        : [...processed.uspBullets, ...categoryConfig.uspTemplates].slice(0, 5),
      technicalSpecs: mergedTechSpecs,
      safetyNotice: result.safetyNotice || categoryConfig.safetyNotice,
      packageContents: result.packageContents,
      productHighlights: categoryConfig.productHighlights.slice(0, 5),
    };
  } catch (error) {
    console.error('Modular generation failed, using fallback:', error);
    return getFallbackCopy(categoryConfig);
  }
}

function extractSupplierTechnicalData(
  productData: any,
  categoryConfig: ProductCategoryConfig
): Record<string, string> {
  const extracted: Record<string, string> = {};
  
  // Prüfe auf strukturierte CSV/Excel-Daten
  if (productData.technicalData || productData.technicalSpecs || productData.specs) {
    const source = productData.technicalData || productData.technicalSpecs || productData.specs;
    
    for (const field of categoryConfig.technicalFields) {
      const value = source[field.label] || source[field.key];
      if (value && value !== 'Nicht angegeben' && value !== 'Nicht sichtbar') {
        extracted[field.label] = value;
        console.log(`✅ 1:1 Übernahme: ${field.label} = ${value}`);
      }
    }
  }
  
  // Prüfe auf direkte Felder im productData (z.B. von CSV-Import)
  for (const field of categoryConfig.technicalFields) {
    if (!extracted[field.label]) {
      const value = productData[field.label] || productData[field.key];
      if (value && value !== 'Nicht angegeben' && value !== 'Nicht sichtbar') {
        extracted[field.label] = value;
        console.log(`✅ 1:1 Übernahme: ${field.label} = ${value}`);
      }
    }
  }
  
  return extracted;
}

// 3 Textstil-Vorlagen für Variation
type StyleVariant = 'sachlich' | 'nutzen' | 'premium';

function getRandomStyleVariant(): StyleVariant {
  const styles: StyleVariant[] = ['sachlich', 'nutzen', 'premium'];
  return styles[Math.floor(Math.random() * styles.length)];
}

function getStyleInstructions(style: StyleVariant): string {
  switch (style) {
    case 'sachlich':
      return `STIL: SACHLICH-TECHNISCH (Version A)
Dieser Text wirkt wie von einem technischen Händler oder Hersteller.

ANWENDUNGSTEXT (EIN kompakter Absatz, 3-4 Sätze max):
- Kombiniere Produktbeschreibung + Einsatz + Nutzen in EINEM flüssigen Absatz
- Fokus auf technischen Werten und Kompatibilität
- Keine überflüssigen Adjektive, klarer Informationsstil
- KEINE Wiederholungen von Wörtern oder Phrasen
- Beispiel: "Dieser Ersatzakku für das iPhone 4S bietet zuverlässige Energie mit Li-Polymer Technologie. Bei nachlassender Akkuleistung ermöglicht er die volle Funktionalität des Geräts. Die integrierten Schutzschaltungen gewährleisten sicheren Betrieb."

EINSATZBEREICHE (Version A - beginne mit "Geeignet für..."):
- Beginne mit "Geeignet für..." oder "Passend für..."
- Beispiel: "Geeignet für Uhren, Fernbedienungen und Taschenrechner."
- NICHT mit "Ideal" beginnen!

VORTEILE (Max 30 Zeichen pro Vorteil, KEINE Modelle/mAh/Volt):
- "Zuverlässige Stromversorgung"
- "Lange Lebensdauer"
- "Einfache Installation"
- "Sichere Schutzschaltung"
- "Geprüfte Qualität"
VERBOTEN: Modellnummern, mAh, Ah, Volt in Vorteilen!`;

    case 'nutzen':
      return `STIL: NUTZENORIENTIERT & ALLTAGSNAH (Version B)
Dieser Text ist kundenzentriert und vermeidet den "Datenblatt-Stil".

ANWENDUNGSTEXT (EIN kompakter Absatz, 3-4 Sätze max):
- Kombiniere Alltagsszenario + Problemlösung + Nutzen in EINEM flüssigen Absatz
- Stelle das Alltagsszenario in den Fokus
- KEINE Wiederholungen von Wörtern oder Phrasen
- Beispiel: "Wenn das iPhone 4S nicht mehr den ganzen Tag durchhält, schafft dieser Ersatzakku Abhilfe. Mit hochwertigen Li-Polymer Zellen liefert er zuverlässige Energie für den Alltag. Der Austausch ist unkompliziert und bringt die gewohnte Laufzeit zurück."

EINSATZBEREICHE (Version B - beginne mit "Ideal für..."):
- Beginne mit "Ideal für..." oder "Perfekt für..."
- Beispiel: "Ideal für Uhren, Fernbedienungen und Taschenrechner."

VORTEILE (Max 30 Zeichen pro Vorteil, KEINE Modelle/mAh/Volt):
- "Zuverlässige Stromversorgung"
- "Lange Lebensdauer"
- "Einfache Installation"
- "Sichere Schutzschaltung"
- "Geprüfte Qualität"
VERBOTEN: Modellnummern, mAh, Ah, Volt in Vorteilen!`;

    case 'premium':
      return `STIL: PREMIUM & BERATEND (Version C)
Dieser Text wirkt wie von einem Premium-Elektronikhändler – hochwertig und vertrauensbildend.

ANWENDUNGSTEXT (EIN kompakter Absatz, 3-4 Sätze max):
- Kombiniere Qualitätsversprechen + Einsatz + Empfehlung in EINEM flüssigen Absatz
- Betone Qualität, Zuverlässigkeit, geprüfte Komponenten
- KEINE Wiederholungen von Wörtern oder Phrasen
- Beispiel: "Für Anwender, die Wert auf geprüfte Qualität legen, ist dieser iPhone 4S Ersatzakku die richtige Wahl. Die hochwertigen Li-Polymer Zellen bieten konstante Leistung und lange Lebensdauer. Integrierte Schutzschaltungen sorgen für sicheren Betrieb im täglichen Einsatz."

EINSATZBEREICHE (Version C - beginne mit "Findet Verwendung..."):
- Beginne mit "Findet Verwendung in..." oder "Bewährt sich in..."
- Beispiel: "Findet Verwendung in Uhren, Fernbedienungen und medizinischen Geräten."
- NICHT mit "Ideal" oder "Geeignet" beginnen!

VORTEILE (Max 30 Zeichen pro Vorteil, KEINE Modelle/mAh/Volt):
- "Zuverlässige Stromversorgung"
- "Lange Lebensdauer"
- "Einfache Installation"
- "Sichere Schutzschaltung"
- "Geprüfte Qualität"
VERBOTEN: Modellnummern, mAh, Ah, Volt in Vorteilen!`;
  }
}

async function generateProductCopyMonolithic(
  productData: any,
  categoryConfig: ProductCategoryConfig,
  openaiKey: string,
  openaiBaseUrl?: string,
  model: string = 'gpt-4o-mini'
): Promise<ProductCopyPayload> {
  console.log(`📦 Using NEW SACHLICH prompt with ${model}`);

  const openai = new OpenAI({
    apiKey: openaiKey,
    baseURL: openaiBaseUrl,
  });

  const categoryId = categoryConfig.id;
  const isToolOrAccessory = categoryId === 'tool' || categoryId === 'accessory';
  const isBatteryOrCharger = categoryId === 'battery' || categoryId === 'charger' || categoryId === 'flashlight';

  const categorySpecificInstructions = isToolOrAccessory 
    ? `
═══════════════════════════════════════════════════════════════
KATEGORIE: WERKZEUG / ZUBEHÖR (Typ C)
═══════════════════════════════════════════════════════════════
Bei Werkzeugen und Zubehör:
- "produktTyp": "werkzeug"
- "werkzeuguebersicht": Liste der enthaltenen Werkzeuge als Array (WICHTIG!)
  z.B. ["Schraubendreher (Pentalobe)", "Kreuzschlitz-Schraubendreher", "Hebelwerkzeug", "Plektron"]
- "kompatibilitaet": Liste der kompatiblen Geräte/Modelle
- "technicalSpecs": LEER {} - keine Tabelle bei Werkzeugen!
- Extrahiere Werkzeuge aus Produktnamen/Beschreibung`
    : isBatteryOrCharger 
    ? `
═══════════════════════════════════════════════════════════════
KATEGORIE: AKKU / BATTERIE (Typ A)
═══════════════════════════════════════════════════════════════
- "produktTyp": "akku"
- "technicalSpecs": Technische Daten als Objekt (Spannung, Kapazität, etc.)
- "kompatibilitaet": Kompatible Geräte als Array
- "zeigeTabelle": true`
    : `
═══════════════════════════════════════════════════════════════
KATEGORIE: ELEKTRONIK / ZUBEHÖR (Typ B)
═══════════════════════════════════════════════════════════════
- "produktTyp": "elektronik"
- "technicalSpecs": LEER {} - keine Tabelle!
- "kompatibilitaet": Kompatible Geräte als Array
- "zeigeTabelle": false`;

  const showTableHint = !isToolOrAccessory;
  
  // Zufälligen Textstil wählen für Variation
  const styleVariant = getRandomStyleVariant();
  console.log(`🎨 Textstil: ${styleVariant.toUpperCase()}`);

  const systemPrompt = `Du bist ein deterministischer PIM- & SEO-Textgenerator für akkushop.de.

Deine Aufgabe ist es, strukturierte, SEO-optimierte HTML-Produktbeschreibungen zu erzeugen
ausschließlich auf Basis der gelieferten Produktdaten.

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

═══════════════════════════════════════════════════════════════
H1 / PRODUKTTITEL – EINHEITLICHES SCHEMA (SEO-KRITISCH)
═══════════════════════════════════════════════════════════════
SCHEMA: [Marke] [Produktart] für [Gerät/Serie], [weitere Geräte] – [messbare Attribute]

⚠️ WICHTIGSTE REGEL: MARKE IMMER ZUERST! ⚠️

FESTE REGELN:
1. MARKE IMMER ZUERST (ohne Sonderzeichen, KEIN Pipe!)
2. Dann Produktart (Hauptkeyword)
3. Gedankenstrich (–) trennt Geräte von messbaren Attributen
4. KEIN Pipe-Symbol (|) im Titel!
5. KEINE endlosen Gerätelisten im Titel → gehören in Beschreibung
6. Maximal 120 Zeichen

MESSBARE ATTRIBUTE (gehören in Titel UND Tabelle):
✅ Länge (m, cm)
✅ Spannung (V)
✅ Kapazität (mAh, Ah)
✅ Stromstärke (A)
✅ Leistung (W)
✅ Gewicht (g, kg)
✅ Maße (mm, cm)
✅ Farbe
✅ Zelltyp/Chemie (Li-Ion, Li-Po)

NICHT MESSBAR (gehört NICHT in Titel):
❌ "hochwertig", "premium", "original"
❌ "kompatibel mit" (ohne konkretes Gerät)
❌ Marketingbegriffe
❌ Pipe-Symbol (|)

BEISPIELE (MARKE ZUERST!):
✅ "Hähnel USB-Datenkabel für Apple iPhone 4/4s, 3G/3GS, iPad, iPod – 1,5 m, weiß"
✅ "EMCOM Ersatzakku für Apple iPhone SE 2020 – 1821 mAh, 3,82 V"
✅ "iFixit Werkzeug-Set für iPhone Reparatur – 17-teilig"

VERBOTEN (Marke am Ende):
❌ "USB-Datenkabel für iPhone | Hähnel"
❌ "Ersatzakku für iPhone SE | EMCOM"

HARTE REGEL:
Was im Titel messbar steht, MUSS auch in technicalSpecs erfasst sein!

═══════════════════════════════════════════════════════════════
VERBOTENE SACHEN
═══════════════════════════════════════════════════════════════
❌ Kein "ideal für jeden Einsatz"
❌ Kein "hochwertig" ohne Begründung
❌ Kein "leistungsstark", wenn keine Werte
❌ Keine Emojis außerhalb der Vorteile
❌ Keine Meta-Texte
❌ Kein Keyword-Stuffing
❌ Keine Bold-Tags im Fließtext

═══════════════════════════════════════════════════════════════
TECHNISCHE DATEN – ENTSCHEIDUNGSREGEL
═══════════════════════════════════════════════════════════════
${showTableHint 
  ? '✅ Dieses Produkt SOLL eine technische Datentabelle haben (Akku/Ladegerät/Taschenlampe)' 
  : '❌ Dieses Produkt soll KEINE technische Datentabelle haben (Werkzeug/Zubehör)'}

✅ Tabelle NUR wenn Produktkategorie: Akku, Akkupack, Batterie, Taschenlampe, Ladegerät, Netzteil, Powerbank
❌ Keine Tabelle bei: Werkzeug, Zubehör, Reparatursets, Adapter ohne Messwerte

${categorySpecificInstructions}

═══════════════════════════════════════════════════════════════
AUSGABEFORMAT (JSON)
═══════════════════════════════════════════════════════════════
{
  "produktTitel": "SEO-optimierter Titel nach Schema: [Marke] [Produktart] für [Gerät] – [Specs]",
  "produktTyp": "akku" | "elektronik" | "werkzeug",
  "anwendung": "EIN kompakter Absatz (3-4 Sätze max). Produkt + Einsatz + Nutzen kombiniert. KEINE Wiederholungen. Direkt und präzise.",
  "kompatibilitaet": ["Modell 1", "Modell 2"],
  "apnSatz": "Dieser Akku ersetzt die Apple-Teilenummern (APN) 616-0579, 616-0580.",
  "werkzeuguebersicht": ["Werkzeug 1", "Werkzeug 2"],
  "uspBullets": ["Produkteigenschaft 1", "Produkteigenschaft 2"],
  "einsatzbereiche": "1-2 Sätze wo/wofür das Produkt verwendet wird. Beispiel: Ideal für Uhren, Fernbedienungen und Taschenrechner.",
  "technicalSpecs": {"Feldname": "Wert mit Einheit"},
  "packageContents": ["Artikel 1", "Artikel 2"],
  "zeigeTabelle": true/false
}

REGELN FÜR JSON-FELDER:
- produktTitel: PFLICHT. Siehe PRODUKTTITEL-REGELN unten.
- produktTyp: PFLICHT. "akku" für Akkus/Batterien, "werkzeug" für Werkzeug-Sets, sonst "elektronik"

═══════════════════════════════════════════════════════════════
PRODUKTTITEL-REGELN (produktTitel)
═══════════════════════════════════════════════════════════════
- Maximal 120 Zeichen
- Schema: [Marke] [Produktart] für [Gerät] – [Specs]
- MARKE IMMER ZUERST! Kein Pipe-Symbol.
- Muss Produktart + Marke + Hauptgerät enthalten
- DARF NICHT identisch zum Original-Produktnamen sein (verbessere ihn!)
- DARF NICHT wörtlich in der Beschreibung wiederholt werden
- Keine Aufzählungen im Titel
- Keine Sätze, sondern Titelstruktur
- VERBOTEN im Titel: "Zubehör", "hochwertig", "premium", "professionell", "original", "exklusiv"
- Volt IMMER ausgeschrieben: "3,7 Volt" statt "3,7 V"

WEITERE JSON-FELDER:
- anwendung: PFLICHT. EIN kompakter Absatz (3-4 Sätze). Produkt + Einsatz + Nutzen kombiniert. KEINE Wiederholungen!
  VERBOTEN IM FLIEßTEXT: Gewicht, Maße (mm/cm), Kapazität (mAh/Wh), Spannung (V/Volt), Teilenummern, APNs, technische Werte.
  Alle technischen Daten gehören NUR in die Tabelle, NICHT in den Fließtext!
- kompatibilitaet: NUR wenn echte Modelle vorhanden. Leeres Array [] wenn keine Daten
- apnSatz: NUR bei Apple-Akkus mit APNs. SEO-Satz nach Kompatibilität. Leer "" wenn keine APNs.
- werkzeuguebersicht: NUR bei Werkzeug-Sets. Liste der enthaltenen Werkzeuge
═══════════════════════════════════════════════════════════════
WICHTIG: UNTERSCHIED VORTEILE vs. EINSATZBEREICHE
═══════════════════════════════════════════════════════════════

VORTEILE (uspBullets) = Was KANN das Produkt? Produkteigenschaften!
  ✅ "Bis zu 10 Jahre lagerfähig"
  ✅ "Auslaufsicher und temperaturbeständig"  
  ✅ "Konstante Spannungsabgabe"
  ✅ "Einfacher Akkutausch möglich"
  ❌ NIEMALS: "Ideal für Uhren" → Das ist ein EINSATZBEREICH!

EINSATZBEREICHE = WO/WOFÜR wird das Produkt verwendet?
  ✅ "Ideal für Uhren, Fernbedienungen und medizinische Geräte."
  ✅ "Passend für Laptops und Notebooks verschiedener Hersteller."
  ❌ NIEMALS: "Lange Haltbarkeit" → Das ist ein VORTEIL!

- uspBullets: 2-4 PRODUKTSPEZIFISCHE Vorteile (max 50 Zeichen).
  NUR Produkteigenschaften, KEINE Einsatzbereiche!
  
  ❌ VERBOTEN in uspBullets:
  - "Ideal für...", "Passend für...", "Geeignet für..." → gehört in einsatzbereiche!
  - "Schutzschaltung" (nur wenn explizit in CSV!)
  - Modellnummern, mAh, Ah, Volt, Gerätenamen
  - Generische Phrasen: "Hohe Qualität", "Lange Lebensdauer"
  
  ✅ Lieber 2 gute Vorteile als 4 generische!

- einsatzbereiche: 1-2 Sätze zu konkreten Anwendungsgebieten.
  NUR wo/wofür das Produkt verwendet wird!
  Beispiel: "Ideal für Uhren, Fernbedienungen und Taschenrechner."

⚠️ BATTERIEN vs. AKKUS - WORTWAHL:
Bei BATTERIEN (CR2032, AA, AAA): "passend zu", "geeignet für", "ersetzt" - NICHT "kompatibel"!
Bei AKKUS (wiederaufladbar): "kompatibel mit", "Ersatzakku für"

⚠️ BATTERIE-TYPEN IN DIE TABELLE:
Wenn eine Batterie andere Typen ersetzt (z.B. CR2032, DL2032, ECR2032, EA-2032C),
dann gehören diese in die technische Tabelle als:
"Batterie-Typ": "CR2032, DL2032, ECR2032, EA-2032C"
NICHT in die Vorteile, NICHT in den Fließtext!

- technicalSpecs: Bei Akkus UND Batterien (produktTyp="akku"). Leeres Objekt {} bei Werkzeug/Elektronik.
  WICHTIG: Nur Felder mit ECHTEN Werten aus der CSV eintragen! KEINE leeren Felder wie "Kapazität": "" generieren!
- packageContents: PFLICHT. NUR das Hauptprodukt selbst, z.B. ["1x Akku"] oder ["1x Ladegerät"] oder ["1x Werkzeug-Set"]. KEINE Kompatibilitätsinfos, KEINE Geräteliste!
- zeigeTabelle: true NUR bei Akkus, sonst false

═══════════════════════════════════════════════════════════════
ABSOLUTE REGEL: PRODUKTNAME NUR EINMAL (SEHR WICHTIG!)
═══════════════════════════════════════════════════════════════
Der Produktname wird vom System als <h1> ausgegeben.
Du darfst den Produktnamen NICHT in deinen Texten wiederholen!

❌ VERBOTEN:
- Produktname am Satzanfang wiederholen
- Produktname identisch im Text nennen
- Produktname im Anwendungstext einfügen

✅ ERLAUBT:
- Allgemeine Begriffe: "Dieses Werkzeug-Set", "Der Akku", "Das Zubehör"
- Natürliche Einbettung mit Synonymen: "das Set", "der Ersatzakku"

═══════════════════════════════════════════════════════════════
TEXTSTIL-VORLAGE (PFLICHT - verwende den zugewiesenen Stil!)
═══════════════════════════════════════════════════════════════
${getStyleInstructions(styleVariant)}

WICHTIG: Satzanfänge innerhalb eines Absatzes dürfen sich NICHT wiederholen!

═══════════════════════════════════════════════════════════════
APPLE-AKKUS: APN-REGELN (Apple Part Numbers) - ZWINGENDE REGELN
═══════════════════════════════════════════════════════════════

PRODUKTNAME / H1 – ZWINGENDE REGEL:
- Der Produktname darf NIEMALS eine Liste von APNs enthalten.
- Der Produktname darf MAXIMAL EINE APN enthalten.
- Wenn mehrere APNs existieren:
  → verwende ausschließlich die ERSTE APN aus der Liste.
  → alle weiteren APNs sind im Titel VERBOTEN.

ERLAUBTES FORMAT:
Akku für Apple <Modell> – ersetzt APN <eine Nummer>

VERBOTEN IM TITEL:
❌ Aufzählungen (Kommas, "und", mehrere Nummern)
❌ Texte wie "entspricht APN 123, 456, 789"
❌ Mehr als eine Ziffernfolge im Titel

VALIDIERUNG:
Wenn der Titel mehr als eine APN enthält → Ausgabe abbrechen und neu erzeugen.

═══════════════════════════════════════════════════════════════
SEMANTISCHE REGELN FÜR APNs
═══════════════════════════════════════════════════════════════
APNs sind technische Referenznummern, KEINE Vorteile!

APNs dürfen NUR in folgenden Bereichen erscheinen:
1. Einleitung (einmal gesammelt als Fließtext)
2. Technische Daten → Feld "APN / ersetzt"

APNs sind in diesen Bereichen STRIKT VERBOTEN:
❌ Vorteile / uspBullets
❌ Marketingtexte
❌ Bulletpoints mit Nutzenargumenten
❌ Überschriften außer H1 (optional eine APN)

Wenn APNs in Vorteilen auftauchen → neu generieren.

KORREKTE VORTEILE (ohne APNs, ohne Modelle, ohne mAh/Volt):
✅ "Lange Laufzeit für den Alltag"
✅ "Hochwertige Zelltechnologie"
✅ "Zuverlässige Leistung"
✅ "Einfache Montage"
✅ "Integrierte Schutzschaltungen"

FALSCHE VORTEILE:
❌ "Ersetzt APN 616-00351"
❌ "Kompatibel mit APN 616-00352"

EINLEITUNG:
- ALLE APNs vollständig auflisten
- Formulierung: "ersetzt die Apple-Teilenummern (APN) ..."
- Keine Bulletpoints, sondern Fließtext mit Kommas

TECHNISCHE DATEN (technicalSpecs):
- Feld "APN / ersetzt" mit ALLEN APNs kommagetrennt
- Beispiel: {"APN / ersetzt": "616-00351, 616-00352, 616-00346"}`;

  const userPrompt = `Produktdaten:
${JSON.stringify(productData, null, 2)}

Kategorie: ${categoryConfig.name}
Textstil: ${styleVariant.toUpperCase()} (verwende diesen Stil für ALLE Texte!)

Erstelle jetzt das JSON-Objekt mit Produkttexten basierend auf diesen Daten.
Wichtig: Schreibe im Stil "${styleVariant}" wie in den Stil-Anweisungen beschrieben.`;

  try {
    const response = await openai.chat.completions.create({
      model, // COST OPTIMIZATION: Use GPT-4o-mini by default (30× günstiger!)
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content?.trim() || '{}';
    let parsedContent: any;

    try {
      parsedContent = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', content);
      throw new Error('AI returned invalid JSON');
    }

    const produktTyp = parsedContent.produktTyp || 'elektronik';
    const produktTitel = parsedContent.produktTitel || '';
    const einleitung = parsedContent.einleitung || '';
    
    // POST-PROCESSOR: Entferne technische Daten (mAh, Ah, Volt) aus Fließtext
    const cleanTechDataFromText = (text: string): string => {
      if (!text) return text;
      let cleaned = text;
      // Entferne Volt-Angaben
      cleaned = cleaned.replace(/\b\d+[.,]?\d*\s*V(olt)?\b/gi, '');
      // Entferne mAh-Angaben
      cleaned = cleaned.replace(/\b\d+\s*mAh\b/gi, '');
      // Entferne Ah-Angaben
      cleaned = cleaned.replace(/\b\d+[.,]?\d*\s*Ah\b/gi, '');
      // Entferne Wh-Angaben
      cleaned = cleaned.replace(/\b\d+[.,]?\d*\s*Wh\b/gi, '');
      // Doppelte Leerzeichen bereinigen
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
      // Doppelte Kommas/Punkte bereinigen
      cleaned = cleaned.replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.');
      return cleaned;
    };
    
    const anwendung = cleanTechDataFromText(parsedContent.anwendung || '');
    const beschreibung = cleanTechDataFromText(parsedContent.narrative || parsedContent.beschreibung || '');
    const tagline = parsedContent.tagline || '';
    
    const rawVorteile = (parsedContent.vorteile || parsedContent.uspBullets || []).map((v: string) => {
      if (typeof v !== 'string') return v;
      // Entferne führende "> " oder ">" (Markdown-Zitat-Marker von GPT)
      return v.replace(/^>\s*/, '').trim();
    });
    
    // POST-PROCESSOR: Filter Vorteile mit technischen Daten (Modelle, mAh, Ah, Volt)
    const filteredVorteile = (Array.isArray(rawVorteile) ? rawVorteile : []).filter((vorteil: string) => {
      if (typeof vorteil !== 'string') return false;
      
      // Patterns für verbotene technische Daten in Vorteilen
      const verbotenePatterns = [
        /\b\d+\s*mAh\b/i,           // mAh-Werte
        /\b\d+\s*Ah\b/i,            // Ah-Werte
        /\b\d+[.,]?\d*\s*V(olt)?\b/i, // Volt-Werte
        /\b(V|M)\d{3,}/i,           // Modellnummern wie V2000, M2000
        /\b[A-Z]{2,}\d{4,}/i,       // Modelle wie CR2032, DL2032
        /Passgenau für .+[A-Z]\d/i, // "Passgenau für" mit Modellnummer
        /Kompatibel mit .+\d{3,}/i, // "Kompatibel mit" gefolgt von Nummern
        /iPhone\s+\d+/i,            // iPhone Modelle
        /iPad\s+(Pro|Air|Mini)?\s*\d*/i, // iPad Modelle
        /Galaxy\s+[SA]\d+/i,        // Samsung Galaxy Modelle
        /Presario\s+[A-Z]?\d+/i,    // Compaq Presario Modelle
        /ECR\d+|EA-\d+/i,           // Batterie-Codes
        /Schutzschaltung/i,         // Schutzschaltung nur wenn explizit in CSV
      ];
      
      // Kategoriespezifische verbotene Begriffe (bei Batterien macht "Installation" keinen Sinn)
      const produktNameLowerCheck = (productData.name || '').toLowerCase();
      const istBatterie = /batterie|knopfzelle|cr\d{4}|lr\d{2}|aa|aaa/i.test(produktNameLowerCheck);
      
      if (istBatterie) {
        // Bei Batterien: Installation, Montage, Einbau etc. filtern
        const batterieVerboten = [
          /Installation/i,
          /Montage/i,
          /Einbau/i,
        ];
        for (const pattern of batterieVerboten) {
          if (pattern.test(vorteil)) {
            console.log(`🚫 Vorteil gefiltert (nicht passend für Batterie): "${vorteil}"`);
            return false;
          }
        }
      }
      
      // Einsatzbereiche gehören NICHT in Vorteile - diese filtern
      const einsatzbereichePatterns = [
        /^Ideal für/i,
        /^Passend für/i,
        /^Geeignet für/i,
        /^Perfekt für/i,
        /für Uhren/i,
        /für Fernbedienungen/i,
        /für Taschenrechner/i,
        /für Laptops/i,
        /für Notebooks/i,
      ];
      for (const pattern of einsatzbereichePatterns) {
        if (pattern.test(vorteil)) {
          console.log(`🚫 Vorteil gefiltert (ist Einsatzbereich): "${vorteil}"`);
          return false;
        }
      }
      
      for (const pattern of verbotenePatterns) {
        if (pattern.test(vorteil)) {
          console.log(`🚫 Vorteil gefiltert (technische Daten): "${vorteil}"`);
          return false;
        }
      }
      return true;
    });
    
    // Produkttypspezifische Fallback-Vorteile (max 30 Zeichen)
    // Wähle Fallbacks basierend auf Produktname für bessere Relevanz
    const produktNameLower = (productData.name || '').toLowerCase();
    
    let fallbackVorteile: string[];
    if (produktTyp === 'akku') {
      fallbackVorteile = [
        "Zuverlässige Stromversorgung",
        "Lange Lebensdauer",
        "Hohe Kapazität",
        "Konstante Spannung",
        "Geprüfte Qualität"
      ];
    } else if (produktTyp === 'werkzeug') {
      fallbackVorteile = [
        "Robuste Qualität",
        "Ergonomisches Design",
        "Langlebige Materialien",
        "Präzise Verarbeitung",
        "Vielseitig einsetzbar"
      ];
    } else if (/case|hülle|cover|schutzhülle|backcase|bumper/i.test(produktNameLower)) {
      fallbackVorteile = [
        "Perfekte Passform",
        "Optimaler Schutz",
        "Schlankes Design",
        "Einfache Montage",
        "Hochwertige Verarbeitung"
      ];
    } else if (/folie|displayschutz|screen.*protector/i.test(produktNameLower)) {
      fallbackVorteile = [
        "Optimaler Displayschutz",
        "Kratzfeste Oberfläche",
        "Blasenfreie Montage",
        "Hohe Transparenz",
        "Einfache Anbringung"
      ];
    } else if (/kabel|cable|adapter|ladegerät|charger/i.test(produktNameLower)) {
      fallbackVorteile = [
        "Schnelle Datenübertragung",
        "Robustes Kabel",
        "Sichere Verbindung",
        "Universell einsetzbar",
        "Kompaktes Design"
      ];
    } else if (/tasche|halterung|ständer|halter|stand/i.test(produktNameLower)) {
      fallbackVorteile = [
        "Sichere Aufbewahrung",
        "Praktische Handhabung",
        "Robustes Material",
        "Platzsparend",
        "Schneller Zugriff"
      ];
    } else {
      fallbackVorteile = [
        "Hochwertige Verarbeitung",
        "Perfekte Passform",
        "Optimaler Schutz",
        "Einfache Handhabung",
        "Geprüfte Qualität"
      ];
    }
    
    // Dynamische Anzahl Vorteile: Keine künstliche Auffüllung, max. 4
    const vorteile = filteredVorteile.slice(0, 4);
    
    const kompatibleModelle = parsedContent.kompatibilitaet || parsedContent.kompatibleModelle || [];
    const werkzeuguebersicht = parsedContent.werkzeuguebersicht || [];
    const einsatzbereiche = parsedContent.einsatzbereiche || '';
    const apnSatz = parsedContent.apnSatz || '';
    const fazit = parsedContent.fazit || '';
    const lieferumfang = parsedContent.lieferumfang || parsedContent.packageContents || [];
    const lieferumfangString = Array.isArray(lieferumfang) 
      ? lieferumfang.join('\n') 
      : lieferumfang;
    const zeigeTabelle = produktTyp === 'akku' ? (parsedContent.zeigeTabelle !== false) : false;

    // NUR 1:1 extrahierte Specs verwenden - KEINE AI-Fallbacks für technische Daten!
    // AI darf technische Werte nicht erfinden
    const structuredDataSource = productData.structuredData || productData;
    const directTechSpecs = extractTechSpecs1to1(
      productData.extractedText || '',
      structuredDataSource,
      categoryConfig
    );
    console.log(`📊 Tech Specs (monolithic): ${Object.keys(directTechSpecs).length} Felder (nur 1:1 aus CSV)`);

    return {
      tagline: tagline,
      narrative: beschreibung,
      uspBullets: Array.isArray(vorteile) ? vorteile : [],
      technicalSpecs: produktTyp === 'akku' ? directTechSpecs : {},
      safetyNotice: '',
      packageContents: lieferumfangString,
      productHighlights: [],
      einleitung: einleitung,
      anwendung: anwendung,
      beschreibung: beschreibung,
      kompatibleModelle: Array.isArray(kompatibleModelle) ? kompatibleModelle : [],
      werkzeuguebersicht: Array.isArray(werkzeuguebersicht) ? werkzeuguebersicht : [],
      apnSatz: apnSatz,
      fazit: fazit,
      zeigeTabelle: zeigeTabelle,
      produktTyp: produktTyp as 'akku' | 'elektronik' | 'werkzeug',
      produktTitel: produktTitel,
      einsatzbereiche: einsatzbereiche,
    };

  } catch (error) {
    console.error('AI generation error:', error);
    return getFallbackCopy(categoryConfig);
  }
}

function getFallbackCopy(categoryConfig: ProductCategoryConfig): ProductCopyPayload {
  return {
    narrative: 'Hochwertiges Produkt für professionelle Anwendungen. Zeichnet sich durch zuverlässige Leistung und langlebige Qualität aus.',
    uspBullets: categoryConfig.uspTemplates.slice(0, 5),
    technicalSpecs: {},
    packageContents: 'Produkt wie beschrieben',
    productHighlights: categoryConfig.productHighlights.slice(0, 5),
  };
}
