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

  // Extrahiere bestehende Beschreibung aus productData oder structuredData
  const existingDescription = productData?.existingDescription || 
                             productData?.structuredData?.['p_description[de]'] ||
                             productData?.structuredData?.['P Description[de]'] ||
                             productData?.structuredData?.beschreibung || '';
  
  // NEUE REGEL: Extrahiere NUR den "Weitere Informationen:" Abschnitt für Vorteile
  // Identische Logik wie im Monolith-Pfad für Konsistenz
  const extractWeitereInfoModular = (desc: string): string[] => {
    if (!desc) return [];
    // 1. HTML-Tags in Zeilenumbrüche umwandeln
    let normalized = desc.replace(/<br\s*\/?>/gi, '\n');
    normalized = normalized.replace(/<li[^>]*>/gi, '\n- ');
    normalized = normalized.replace(/<\/li>/gi, '');
    normalized = normalized.replace(/<[^>]+>/g, '');
    // Mehrfache Zeilenumbrüche auf einzelne reduzieren
    normalized = normalized.replace(/(\r?\n){2,}/g, '\n');
    // 2. Suche nach "Weitere Informationen:" - extrahiere alles danach
    const match = normalized.match(/weitere\s*informationen\s*:?\s*([\s\S]*)/i);
    if (!match) return [];
    const weitereInfo = match[1];
    // 3. NUR echte Bulletpoints
    const bullets: string[] = [];
    const lines = weitereInfo.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      // Abbrechen bei neuer Überschrift
      if (trimmed.match(/^[A-ZÄÖÜ].*:$/)) break;
      if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
        const bullet = trimmed.replace(/^[-•]\s*/, '').trim();
        if (bullet.length >= 1) bullets.push(bullet);  // Nur komplett leere Bullets filtern
      }
    }
    return bullets;
  };
  
  const weitereInfoVorteileModular = extractWeitereInfoModular(existingDescription);
  console.log(`📋 [MODULAR] "Weitere Informationen" gefunden: ${weitereInfoVorteileModular.length} Bulletpoints`);
  
  const context: PromptContext = {
    categoryName: categoryConfig.name,
    categoryDescription: categoryConfig.description,
    productData,
    availableFields: categoryConfig.technicalFields.map(f => 
      `${f.label}${f.unit ? ` (${f.unit})` : ''}`
    ),
    uspTemplates: categoryConfig.uspTemplates,
    existingDescription: weitereInfoVorteileModular.length >= 2 ? weitereInfoVorteileModular.join('\n') : '', // Nur "Weitere Informationen" übergeben
  };
  
  if (weitereInfoVorteileModular.length >= 2) {
    console.log(`📋 Vorteile aus "Weitere Informationen" für AI übergeben`);
  }

  try {
    const result = await orchestrator.generateFullProductCopy(context);

    // POST-PROCESSING: Validiere und bereinige AI-Output
    // Produktname für kategorie-spezifische USP-Ersetzung extrahieren
    const productName = productData?.productName || productData?.produktname || 
                        productData?.structuredData?.['p_name[de]'] || 
                        productData?.structuredData?.produktname || '';
    
    const processed = processProductCopy({
      narrative: result.narrative,
      uspBullets: result.uspBullets,
      productName: productName,
    });

    if (processed.validationIssues.length > 0) {
      console.log('⚠️ Post-processing applied:', processed.validationIssues);
    }

    // 1:1 TECH SPECS EXTRAKTION: Aus Vision-Text oder strukturierten Daten
    const structuredDataSource = productData.structuredData || productData;
    
    // Prüfe ob p_name[de] vorhanden ist
    const pNameValue = structuredDataSource['p_name[de]'] || structuredDataSource['P Name[de]'] || structuredDataSource['p_name'] || 'NICHT GEFUNDEN';
    
    const directTechSpecs = extractTechSpecs1to1(
      productData.extractedText || '',
      structuredDataSource,
      categoryConfig
    );
    
    
    // NUR 1:1 extrahierte Specs verwenden - KEINE AI-Fallbacks für technische Daten!
    // AI darf technische Werte nicht erfinden (z.B. falsche Kapazität)
    const mergedTechSpecs = directTechSpecs;


    // USPs nur zurückgeben wenn "Weitere Informationen" gefunden wurde
    // REGEL: Keine generischen Template-USPs mehr - nur echte extrahierte Vorteile
    // REGEL: Mindestens 2 Vorteile aus "Weitere Informationen" nötig, IMMER übernehmen (auch bei 400+ Produkten)
    const hasWeitereInfo = weitereInfoVorteileModular.length >= 2;
    const tempUsps = hasWeitereInfo ? processed.uspBullets : [];
    const realUsps = tempUsps.length >= 2 ? tempUsps : [];
    
    return {
      tagline: result.tagline, // Neue Tagline für h2
      narrative: processed.narrative,
      uspBullets: realUsps, // Nur echte USPs, keine Template-Fallbacks
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

VORTEILE (uspBullets):
⚠️ KEINE generischen Vorteile generieren!
⚠️ Vorteile NUR aus der BESTEHENDEN BESCHREIBUNG extrahieren (siehe userPrompt)!
⚠️ Wenn keine bestehende Beschreibung → uspBullets: []
VERBOTEN: "Zuverlässige Stromversorgung", "Lange Lebensdauer", "Einfache Installation"!`;

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

VORTEILE (uspBullets):
⚠️ KEINE generischen Vorteile generieren!
⚠️ Vorteile NUR aus der BESTEHENDEN BESCHREIBUNG extrahieren (siehe userPrompt)!
⚠️ Wenn keine bestehende Beschreibung → uspBullets: []
VERBOTEN: "Zuverlässige Stromversorgung", "Lange Lebensdauer", "Einfache Installation"!`;

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

VORTEILE (uspBullets):
⚠️ KEINE generischen Vorteile generieren!
⚠️ Vorteile NUR aus der BESTEHENDEN BESCHREIBUNG extrahieren (siehe userPrompt)!
⚠️ Wenn keine bestehende Beschreibung → uspBullets: []
VERBOTEN: "Zuverlässige Stromversorgung", "Lange Lebensdauer", "Einfache Installation"!`;
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

  // WICHTIG: Bestehende Beschreibung VOR dem AI-Call extrahieren
  const structuredDataSource = productData?.structuredData || {};
  const existingDescriptionForPrompt = productData?.existingDescription || 
                                        structuredDataSource['p_description[de]'] ||
                                        structuredDataSource['P Description[de]'] ||
                                        structuredDataSource['p_description'] ||
                                        structuredDataSource['beschreibung'] || '';
  
  // REGEL: Prüfe ob echte Vorteile extrahiert werden können
  // Nur wenn Beschreibung ECHTE Produktinfos enthält (nicht nur Produktname wiederholt)
  const productNameForCheck = productData?.productName || productData?.produktname || 
                              structuredDataSource['p_name[de]'] || '';
  
  // NEUE REGEL: Extrahiere NUR den "Weitere Informationen:" Abschnitt
  // Gemeinsame Hilfsfunktion für beide Pfade (Monolith + Modular)
  const extractWeitereInformationen = (desc: string): string[] => {
    if (!desc) return [];
    
    // 1. HTML-Tags in Zeilenumbrüche umwandeln (<br>, <br/>, <br />)
    let normalized = desc.replace(/<br\s*\/?>/gi, '\n');
    // Auch <li> Tags als Bulletpoint-Marker behandeln
    normalized = normalized.replace(/<li[^>]*>/gi, '\n- ');
    normalized = normalized.replace(/<\/li>/gi, '');
    // Sonstige HTML-Tags entfernen
    normalized = normalized.replace(/<[^>]+>/g, '');
    // Mehrfache Zeilenumbrüche auf einzelne reduzieren (damit <br><br> nicht als Stop gilt)
    normalized = normalized.replace(/(\r?\n){2,}/g, '\n');
    
    // 2. Suche nach "Weitere Informationen:" (case-insensitive)
    // Extrahiere alles danach bis zu einer neuen Überschrift oder Dokumentende
    const match = normalized.match(/weitere\s*informationen\s*:?\s*([\s\S]*)/i);
    if (!match) return [];
    
    const weitereInfo = match[1];
    
    // 3. STRIKT: NUR echte Bulletpoints akzeptieren (- oder • am Zeilenanfang)
    const bullets: string[] = [];
    const lines = weitereInfo.split(/\r?\n/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Abbrechen bei neuer Überschrift (Zeile endet mit :)
      if (trimmed.match(/^[A-ZÄÖÜ].*:$/)) break;
      // NUR Zeilen die explizit mit - oder • beginnen
      if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
        const bullet = trimmed.replace(/^[-•]\s*/, '').trim();
        if (bullet.length >= 1) {  // Nur komplett leere Bullets filtern
          bullets.push(bullet);
        }
      }
    }
    
    return bullets;
  };
  
  // Extrahiere Vorteile aus "Weitere Informationen"
  // REGEL: IMMER übernehmen wenn mind. 2 Vorteile vorhanden (auch bei 400+ Produkten)
  const weitereInfoVorteile = extractWeitereInformationen(existingDescriptionForPrompt);
  const hasExistingDesc = weitereInfoVorteile.length >= 2; // Mindestens 2 Vorteile nötig
  
  console.log(`📋 [VORTEILE] "Weitere Informationen" gefunden: ${weitereInfoVorteile.length} Bulletpoints`);
  
  // Extrahiere technische Attribute für Vorteile
  const akkuChemie = structuredDataSource['p_attributes[akku_ch][de]'] || 
                     structuredDataSource['akku_ch'] || 
                     structuredDataSource['Chemie'] || '';
  const akkuMah = structuredDataSource['p_attributes[akku_mah][de]'] || '';
  const akkuV = structuredDataSource['p_attributes[akku_v][de]'] || '';
  
  console.log(`📋 [PROMPT] Bestehende Beschreibung für AI: ${hasExistingDesc ? 'JA (echte Vorteile extrahierbar)' : 'NEIN (keine echten Vorteile)'}`);
  console.log(`📋 [PROMPT] Akku-Chemie aus CSV: ${akkuChemie || 'NICHT VORHANDEN'}`);

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
GRAMMATIK-REGELN (PFLICHT - SEHR WICHTIG!)
═══════════════════════════════════════════════════════════════
⚠️ JEDER SATZ MUSS GRAMMATIKALISCH VOLLSTÄNDIG SEIN!

FEHLER DIE NIE PASSIEREN DÜRFEN:
❌ "von sorgt" → FEHLT DIE MARKE! Richtig: "von [Markenname] sorgt"
❌ "3." → UNVOLLSTÄNDIG! Muss vollständige Zahl sein: "3,7 Volt"
❌ "mit einer Kapazität von mAh" → FEHLT DER WERT! Nur schreiben wenn Wert bekannt
❌ Sätze ohne Subjekt oder Verb
❌ Abgebrochene Sätze mit fehlendem Ende

REGELN:
1. IMMER prüfen: Hat der Satz Subjekt + Verb + Objekt?
2. NIEMALS Platzhalter oder unvollständige Werte einfügen
3. Wenn ein Wert NICHT aus den Daten bekannt ist → WEGLASSEN, nicht raten!
4. Jeder Satz endet mit Punkt, Fragezeichen oder Ausrufezeichen
5. Bei Marken: Entweder die echte Marke nennen ODER "Dieser Akku/Dieses Produkt" verwenden

BEISPIELE:
❌ FALSCH: "Der Akku von sorgt für zuverlässige Energie."
✅ RICHTIG: "Der Akku sorgt für zuverlässige Energie." (ohne unbekannte Marke)
✅ RICHTIG: "Der Akku von EMCOM sorgt für zuverlässige Energie." (mit bekannter Marke)

❌ FALSCH: "Mit einer Kapazität von 3. mAh bietet der Akku..."
✅ RICHTIG: "Der Akku bietet zuverlässige Leistung im Alltag." (Kapazität weglassen wenn unbekannt)
✅ RICHTIG: "Mit einer Kapazität von 1821 mAh bietet der Akku..." (nur mit vollständigem Wert)

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
  "einsatzbereiche": "3-4 Sätze mit Sie-Ansprache, verkaufsfördernd, ohne Call-to-Action. Beschreibt wo/wofür das Produkt verwendet wird.",
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
  ✅ "Geringe Selbstentladung – auch nach Monaten noch einsatzbereit"
  ✅ "Auslaufsicher und temperaturbeständig von -20°C bis +60°C"  
  ✅ "Stabile Spannungsabgabe bis zur vollständigen Entladung"
  ✅ "Werkzeugloser Akkutausch in wenigen Sekunden"
  ✅ "Integrierte Überladungs- und Tiefentladeschutz-Elektronik"
  ❌ NIEMALS: "Ideal für Uhren" → Das ist ein EINSATZBEREICH!

EINSATZBEREICHE = WO/WOFÜR wird das Produkt verwendet?
  ✅ "Ideal für Uhren, Fernbedienungen und medizinische Geräte."
  ✅ "Passend für Laptops und Notebooks verschiedener Hersteller."
  ❌ NIEMALS: "Lange Haltbarkeit" → Das ist ein VORTEIL!

- uspBullets: 3-4 SPEZIFISCHE Vorteile (50-80 Zeichen pro Vorteil).
  Vorteile müssen KONKRET und AUSSAGEKRÄFTIG sein – keine generischen Phrasen!
  
  ⚠️ GUTE VS. SCHLECHTE VORTEILE:
  ❌ SCHLECHT (zu kurz/generisch):
  - "Zuverlässige Stromversorgung" → zu vage
  - "Lange Lebensdauer" → nichtssagend
  - "Einfache Installation" → zu allgemein
  - "Hohe Qualität" → Floskel ohne Inhalt
  
  ✅ GUT (spezifisch und informativ):
  - "Geringe Selbstentladung – bleibt auch nach Monaten einsatzbereit"
  - "Konstante Spannung bis zur vollständigen Entladung"
  - "Passgenauer Einbau ohne Nachbearbeitung"
  - "Werkseitig geprüft und einzeln getestet"
  - "Optimierte Zellchemie für maximale Ladezyklen"
  
  ⚠️ BESTEHENDE BULLETPOINTS VERBESSERN:
  Wenn im Feld "existingBullets" bestehende Vorteile vorhanden sind:
  - Übernimm die INHALTLICHE Aussage, aber FORMULIERE SPEZIFISCHER
  - Erweitere auf 50-80 Zeichen mit konkreten Details
  - Entferne technische Daten (mAh, Volt, Modelle)
  
  Wenn KEINE bestehenden Bullets vorhanden sind:
  - Generiere 3-4 neue, produktspezifische Vorteile
  
  ❌ VERBOTEN in uspBullets:
  - "Ideal für...", "Passend für...", "Geeignet für..." → gehört in einsatzbereiche!
  - "Schutzschaltung" (nur wenn explizit in CSV!)
  - Modellnummern, mAh, Ah, Volt, Gerätenamen
  - Generische Phrasen: "Hohe Qualität", "Lange Lebensdauer", "Zuverlässig", "Einfache Installation"
  
  ✅ Lieber 3 spezifische Vorteile als 5 generische!

- einsatzbereiche: 3-4 Sätze zu konkreten Anwendungsgebieten. KANN LEER SEIN!
  ⚠️ WICHTIG: Wenn die CSV-Daten WENIG INFORMATIONEN enthalten (nur Produktname, keine Beschreibung, keine Anwendungsbeispiele), 
  dann LASSE EINSATZBEREICHE LEER: "" - es ist BESSER kein Einsatzbereich als ein generischer/wiederholender!
  
  ⚠️ KEINE WIEDERHOLUNGEN: Der Einsatzbereich darf NICHT die gleichen Aussagen wie die Anwendung (anwendung) enthalten!
  - Wenn du in "anwendung" schreibst "sorgt für zuverlässige Energie", darfst du das NICHT in einsatzbereiche wiederholen.
  - Wenn du keine NEUEN, EINZIGARTIGEN Inhalte für Einsatzbereiche hast → LEER LASSEN: ""
  
  STIL: Direkte Ansprache mit "Sie", verkaufsfördernd aber OHNE Call-to-Action!
  Beschreibe WO und WOFÜR das Produkt verwendet wird.
  Hebe den Nutzen für den Kunden hervor.
  
  ✅ GUTES BEISPIEL:
  "Mit diesem Akku sind Sie bestens für Ihre Outdoor-Abenteuer gerüstet. 
  Ob beim Wandern, Radfahren oder auf Reisen – Sie haben immer genügend Energie dabei. 
  Die kompakte Bauweise ermöglicht Ihnen einen schnellen Akkuwechsel auch unterwegs. 
  So verpassen Sie keinen wichtigen Moment mehr."
  
  ❌ STRENG VERBOTEN IN EINSATZBEREICHE:
  - KEINE Modellnamen (iPhone, GoPro, SJ4000, etc.) – stehen bereits in Kompatibilität!
  - KEINE Gerätenamen oder Produktnummern
  - KEINE technischen Daten (mAh, Volt, Kapazität)
  - KEINE Call-to-Actions ("Bestellen Sie jetzt", "Jetzt kaufen")
  - NIEMALS "Fachmann", "Werkstatt", "Fachbetrieb" erwähnen – klingt abschreckend!
  - NIEMALS "Reparatur" bei einfachen Ersatzteilen (Kabel, Flexkabel, Sensoren) – es ist nur ein Austausch!
  
  ⚠️ SPEZIALREGEL FÜR KABEL/FLEXKABEL/ERSATZTEILE:
  Bei Produkten wie Flexkabel, Ladekabel, Dock-Connector, Sensoren, Lautsprecher, Kamera-Module:
  - NICHT: "Lassen Sie das Teil vom Fachmann einbauen" → zu übertrieben
  - NICHT: "Für die Reparatur Ihres Geräts" → es ist nur ein Austausch
  - STATTDESSEN: Fokus auf den NUTZEN nach dem Austausch
  
  ✅ GUTES BEISPIEL für Flexkabel/Ersatzteile:
  "Nach dem Austausch funktioniert Ihr Gerät wieder wie am ersten Tag.
  Ob Musik hören, Laden oder Telefonieren – alle Funktionen stehen Ihnen wieder zur Verfügung.
  Mit etwas Geschick und dem richtigen Werkzeug ist der Einbau gut machbar."
  
  ✅ Stattdessen: Allgemeine Anwendungsszenarien beschreiben (Outdoor, Reisen, Fotografie, etc.)

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

  // USP-Anweisung basierend auf "Weitere Informationen" Abschnitt
  const uspInstructions = hasExistingDesc 
    ? `
═══════════════════════════════════════════════════════════════
⚠️ KRITISCH: VORTEILE AUS "WEITERE INFORMATIONEN" ÜBERNEHMEN
═══════════════════════════════════════════════════════════════
Die folgenden Vorteile wurden aus dem "Weitere Informationen" Abschnitt extrahiert.
ÜBERNEHME diese 1:1 als uspBullets! Du darfst sie leicht kürzen/umformulieren.

EXTRAHIERTE VORTEILE:
${weitereInfoVorteile.map((v, i) => `${i + 1}. ${v}`).join('\n')}

DEINE AUFGABE für uspBullets:
1. Übernehme ALLE obigen Vorteile (${weitereInfoVorteile.length} Stück)
2. Kürze sie auf max. 60-80 Zeichen wenn nötig
3. Format: [Eigenschaft] – [Nutzen/Erklärung] mit Gedankenstrich (–)
4. KEINE zusätzlichen Vorteile erfinden!

⚠️ WICHTIG: Akkutyp (Li-Ion, Ni-MH, etc.) gehört NICHT zu Vorteilen!
→ Akkutyp wird separat in den TECHNISCHEN DATEN angezeigt
`
    : `
═══════════════════════════════════════════════════════════════
⚠️ KEINE "WEITERE INFORMATIONEN" GEFUNDEN
═══════════════════════════════════════════════════════════════
Es wurde kein "Weitere Informationen" Abschnitt in der Beschreibung gefunden.
Setze uspBullets auf ein LEERES Array: "uspBullets": []
GENERIERE KEINE generischen Vorteile!
`;

  const userPrompt = `Produktdaten:
${JSON.stringify(productData, null, 2)}

Kategorie: ${categoryConfig.name}
Textstil: ${styleVariant.toUpperCase()} (verwende diesen Stil für ALLE Texte!)

${uspInstructions}

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
    
    const anwendung = parsedContent.anwendung || '';
    const beschreibung = parsedContent.narrative || parsedContent.beschreibung || '';
    const tagline = parsedContent.tagline || '';
    
    const rawVorteile = (parsedContent.vorteile || parsedContent.uspBullets || []).map((v: string) => {
      if (typeof v !== 'string') return v;
      // Entferne führende "> " oder ">" (Markdown-Zitat-Marker von GPT)
      return v.replace(/^>\s*/, '').trim();
    });
    
    // Extrahiere "Nicht geeignet für..." Hinweise aus Vorteilen für Kompatibilität
    const inkompatibilitaetsHinweise: string[] = [];
    
    // POST-PROCESSOR: Filter Vorteile mit technischen Daten (Modelle, mAh, Ah, Volt)
    const filteredVorteile = (Array.isArray(rawVorteile) ? rawVorteile : []).filter((vorteil: string) => {
      if (typeof vorteil !== 'string') return false;
      
      // "Nicht geeignet für..." -> als Inkompatibilitäts-Hinweis speichern, nicht als Vorteil
      if (/nicht\s+(geeignet|passend|kompatibel)\s+(für|mit)/i.test(vorteil)) {
        // Extrahiere den Modellnamen
        const match = vorteil.match(/nicht\s+(?:geeignet|passend|kompatibel)\s+(?:für|mit)\s+(.+?)(?:\s*[-–!]|$)/i);
        if (match) {
          inkompatibilitaetsHinweise.push(match[1].trim());
        }
        return false; // Nicht als Vorteil anzeigen
      }
      
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
          return false;
        }
      }
      
      for (const pattern of verbotenePatterns) {
        if (pattern.test(vorteil)) {
          return false;
        }
      }
      return true;
    });
    
    // Produkttypspezifische Fallback-Vorteile (50-80 Zeichen, spezifisch)
    const produktNameLower = (productData.name || '').toLowerCase();
    
    let fallbackVorteile: string[];
    if (produktTyp === 'akku') {
      fallbackVorteile = [
        "Geringe Selbstentladung – bleibt auch nach Monaten einsatzbereit",
        "Konstante Spannungsabgabe bis zur vollständigen Entladung",
        "Werkseitig geprüft und einzeln auf Kapazität getestet",
        "Optimierte Zellchemie für maximale Ladezyklen"
      ];
    } else if (produktTyp === 'werkzeug') {
      fallbackVorteile = [
        "Gehärteter Stahl für dauerhaft präzise Ergebnisse",
        "Ergonomische Griffe für ermüdungsfreies Arbeiten",
        "Korrosionsbeständige Oberfläche für lange Haltbarkeit",
        "Übersichtliche Sortierung im stabilen Aufbewahrungskoffer"
      ];
    } else if (/case|hülle|cover|schutzhülle|backcase|bumper/i.test(produktNameLower)) {
      fallbackVorteile = [
        "Millimetergenaue Passform für alle Anschlüsse und Tasten",
        "Stoßabsorbierende Materialien schützen bei Stürzen",
        "Schlankes Design ohne Auftragen in der Tasche",
        "Rutschfeste Oberfläche für sicheren Halt"
      ];
    } else if (/folie|displayschutz|screen.*protector/i.test(produktNameLower)) {
      fallbackVorteile = [
        "9H Härtegrad schützt zuverlässig vor Kratzern",
        "Selbstklebende Schicht für blasenfreie Montage",
        "Kristallklare Transparenz ohne Farbverfälschung",
        "Oleophobe Beschichtung reduziert Fingerabdrücke"
      ];
    } else if (/kabel|cable|adapter|ladegerät|charger/i.test(produktNameLower)) {
      fallbackVorteile = [
        "Verstärkte Knickschutzhülsen an den Steckern",
        "Abgeschirmtes Kabel für störungsfreie Übertragung",
        "Vergoldete Kontakte für optimale Leitfähigkeit",
        "Flexibles Material verhindert Kabelbruch"
      ];
    } else if (/tasche|halterung|ständer|halter|stand/i.test(produktNameLower)) {
      fallbackVorteile = [
        "Weiche Innenpolsterung schützt vor Kratzern",
        "Stabile Konstruktion für sicheren Stand",
        "Schnellverschluss für direkten Zugriff",
        "Kompaktes Faltmaß für einfachen Transport"
      ];
    } else {
      fallbackVorteile = [
        "Sorgfältig ausgewählte Materialien für lange Nutzungsdauer",
        "Passgenau gefertigt ohne Nachbearbeitung",
        "Jedes Produkt einzeln auf Funktion geprüft",
        "Durchdachtes Design für einfache Handhabung"
      ];
    }
    
    // REGEL: Vorteile nur anzeigen wenn bestehende Beschreibung vorhanden ist
    // Prüfe ob p_description[de] existiert und Inhalte hat
    // Suche nach allen möglichen Keys für die Beschreibung
    const structuredDataCheck = productData?.structuredData || {};
    const descriptionKeys = Object.keys(structuredDataCheck).filter(k => 
      k.toLowerCase().includes('description') || k.toLowerCase().includes('beschreibung')
    );
    console.log(`🔍 [USP-CHECK] Description keys found: ${descriptionKeys.join(', ') || 'KEINE'}`);
    
    const existingDescriptionMono = productData?.existingDescription || 
                                    structuredDataCheck['p_description[de]'] ||
                                    structuredDataCheck['P Description[de]'] ||
                                    structuredDataCheck['p_description'] ||
                                    structuredDataCheck['beschreibung'] || '';
    const hasExistingDescriptionMono = existingDescriptionMono && existingDescriptionMono.trim().length > 50;
    
    console.log(`📋 [USP-CHECK] Bestehende Beschreibung: ${hasExistingDescriptionMono ? 'JA (' + existingDescriptionMono.length + ' Zeichen)' : 'NEIN'}`);
    console.log(`📋 [USP-CHECK] Vorteile werden: ${hasExistingDescriptionMono ? 'ANGEZEIGT' : 'ÜBERSPRUNGEN'}`);
    
    // Nur echte Vorteile wenn bestehende Beschreibung vorhanden, sonst leer
    // REGEL: Mindestens 2 Vorteile müssen vorhanden sein, sonst komplett weglassen
    // REGEL: ALLE Vorteile aus CSV übernehmen (keine Begrenzung)
    const tempVorteile = hasExistingDescriptionMono ? filteredVorteile : [];
    const vorteile = tempVorteile.length >= 2 ? tempVorteile : [];
    
    if (tempVorteile.length === 1) {
      console.log(`📋 [USP-CHECK] Nur 1 Vorteil gefunden - "Ihre Vorteile" wird komplett weggelassen`);
    }
    
    // PRIORITÄT: Extrahierte Kompatibilität aus CSV-Beschreibung > AI-generierte Kompatibilität
    // Die directTechSpecs enthalten die aus p_description[de] extrahierten Modelle
    const structuredDataSource = productData.structuredData || productData;
    const extractedTechSpecs = extractTechSpecs1to1(
      productData.extractedText || '',
      structuredDataSource,
      categoryConfig
    );
    
    // ═══════════════════════════════════════════════════════════════
    // AUSSCHLUSSLISTE: Kategorien die KEINE Kompatibilität brauchen
    // ═══════════════════════════════════════════════════════════════
    const COMPAT_EXCLUSION_KEYWORDS = [
      'popsocket', 'pop socket', 'handyhalter',
      'desinfektionsmittel', 'desinfektion', 'hygiene', 'reinigungsmittel',
      'neoprentasche', 'neopren', 'tasche universal', 'schutztasche',
      'sicherheitskleidung', 'warnweste', 'schutzkleidung', 'arbeitskleidung',
      'werkzeugkoffer', 'aufbewahrung', 'organizer'
    ];
    
    const produktNameLowerCompat = (productData.name || '').toLowerCase();
    const shouldSkipCompatibility = COMPAT_EXCLUSION_KEYWORDS.some(keyword => 
      produktNameLowerCompat.includes(keyword)
    );
    
    // Nutze extrahierte Kompatibilität aus CSV (falls vorhanden)
    let kompatibleModelle: string[] = [];
    
    if (shouldSkipCompatibility) {
      console.log(`🚫 [COMPAT] Übersprungen - Kategorie braucht keine Kompatibilität: ${produktNameLowerCompat.substring(0, 50)}`);
      kompatibleModelle = [];
    } else if (extractedTechSpecs['Kompatibilität'] && extractedTechSpecs['Kompatibilität'].length > 0) {
      // Kompatibilität ist ein String mit komma-getrennten Modellen
      kompatibleModelle = extractedTechSpecs['Kompatibilität'].split(', ').map((m: string) => m.trim()).filter((m: string) => m.length > 0);
      console.log(`📋 [COMPAT] Verwende ${kompatibleModelle.length} Modelle aus CSV-Beschreibung`);
    } else {
      // Fallback: AI-generierte Kompatibilität
      kompatibleModelle = parsedContent.kompatibilitaet || parsedContent.kompatibleModelle || [];
      console.log(`📋 [COMPAT] Verwende AI-generierte Kompatibilität: ${kompatibleModelle.length} Modelle`);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // GLOBAL: Typencodes aus Produktnamen IMMER extrahieren und hinzufügen
    // z.B. "Akku für XY, wie 824, E92, LR03N" → [824, E92, LR03N]
    // Diese werden ZUSÄTZLICH zu bereits gefundenen Modellen hinzugefügt
    // ═══════════════════════════════════════════════════════════════
    if (!shouldSkipCompatibility) {
      // Extrahiere Typencodes aus Produktnamen (nach "wie", "ersetzt", "entspricht", "als")
      const produktName = productData.name || '';
      const wieMatch = produktName.match(/(?:wie|ersetzt|entspricht|als)\s+([A-Z0-9,\s\-\/]+)/i);
      if (wieMatch) {
        const codes = wieMatch[1].split(/[,\s]+/)
          .map((c: string) => c.replace(/^-+/, '')) // Führende Minuszeichen entfernen
          .filter((c: string) => c.length >= 2 && /[A-Z0-9]/i.test(c));
        if (codes.length > 0) {
          // MERGE: Füge Typencodes zu bestehenden Modellen hinzu (nicht ersetzen!)
          kompatibleModelle = [...kompatibleModelle, ...codes];
          console.log(`🔧 [COMPAT] Typencodes aus Produktname hinzugefügt: ${codes.join(', ')}`);
        }
      }
    }
    
    // Entferne generische Platzhalter wie "und weitere Modelle", "u.a.", "etc."
    kompatibleModelle = kompatibleModelle.filter((m: string) => {
      const lower = m.toLowerCase();
      return !/(und\s+)?weitere\s+modelle/i.test(m) &&
             !/^u\.?\s*a\.?$/i.test(m) &&
             !/^etc\.?$/i.test(m) &&
             !/^\.\.\.$/i.test(m) &&
             !/^und\s+mehr$/i.test(m);
    });
    
    // ═══════════════════════════════════════════════════════════════
    // DUPLIKATE ENTFERNEN (case-insensitive)
    // ═══════════════════════════════════════════════════════════════
    const seenModels = new Set<string>();
    kompatibleModelle = kompatibleModelle.filter((m: string) => {
      const normalized = m.toLowerCase().trim();
      if (seenModels.has(normalized)) return false;
      seenModels.add(normalized);
      return true;
    });
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
    // AI darf technische Werte nicht erfinden (nutze bereits oben extrahierte extractedTechSpecs)
    
    // ACHTUNG-Hinweis für ALLE Produkttypen extrahieren (nicht nur Akkus)
    let achtungHinweis = extractedTechSpecs['Achtung'] || '';
    
    // Füge Inkompatibilitäts-Hinweise hinzu (aus "Nicht geeignet für..." in Vorteilen)
    if (inkompatibilitaetsHinweise.length > 0) {
      const inkompatHinweis = `Nicht geeignet für: ${inkompatibilitaetsHinweise.join(', ')}`;
      achtungHinweis = achtungHinweis ? `${achtungHinweis}. ${inkompatHinweis}` : inkompatHinweis;
      console.log(`⚠️ Inkompatibilitäts-Hinweis hinzugefügt: ${inkompatHinweis}`);
    }
    
    if (achtungHinweis) {
      console.log(`⚠️ ACHTUNG-Hinweis wird weitergegeben: ${achtungHinweis}`);
    }
    
    // Technische Daten für ALLE Produkttypen extrahieren (V, mAh, Wh, Farbe, Akkutyp)
    // Bei Akkus: Vollständige Tabelle, bei anderen: nur vorhandene CSV-Werte
    const relevantTechSpecs: Record<string, string> = {};
    const techFieldsToExtract = ['spannung', 'kapazität', 'akkutyp', 'farbe', 'chemie', 'v_nominal', 'akku_v', 'akku_mah', 'achtung'];
    
    for (const [key, value] of Object.entries(extractedTechSpecs)) {
      const keyLower = key.toLowerCase();
      // Prüfe ob es ein relevantes technisches Feld ist
      if (techFieldsToExtract.some(f => keyLower.includes(f)) || 
          /\b(v|mah|wh|volt)\b/i.test(keyLower)) {
        relevantTechSpecs[key] = value;
      }
    }
    
    // Bei Akkus alle Specs, bei anderen nur die relevanten
    const finalTechSpecs = produktTyp === 'akku' ? extractedTechSpecs : relevantTechSpecs;
    console.log(`📊 Technische Specs für ${produktTyp}: ${Object.keys(finalTechSpecs).length} Felder`);

    return {
      tagline: tagline,
      narrative: beschreibung,
      uspBullets: Array.isArray(vorteile) ? vorteile : [],
      technicalSpecs: finalTechSpecs,
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
      achtungHinweis: achtungHinweis,
    };

  } catch (error) {
    console.error('AI generation error:', error);
    return getFallbackCopy(categoryConfig);
  }
}

function getFallbackCopy(categoryConfig: ProductCategoryConfig): ProductCopyPayload {
  return {
    narrative: 'Hochwertiges Produkt für professionelle Anwendungen. Zeichnet sich durch zuverlässige Leistung und langlebige Qualität aus.',
    uspBullets: [], // REGEL: Keine generischen Vorteile ohne echte Beschreibung
    technicalSpecs: {},
    packageContents: 'Produkt wie beschrieben',
    productHighlights: [],
  };
}
