import { ProductCopyPayload } from './types';
import { ProductCategoryConfig, TechnicalField } from './category-config';
import { filterToWhitelist, isWhitelistedField } from '../../shared/tech-spec-whitelist';
import { correctVoltageValue } from './tech-spec-parser';

export interface RenderOptions {
  productName: string;
  categoryConfig: ProductCategoryConfig;
  copy: ProductCopyPayload;
  layoutStyle?: 'mediamarkt' | 'minimal' | 'detailed';
  technicalDataTable?: string; // Original HTML table from supplier website
  safetyWarnings?: string; // 1:1 safety warnings from supplier (without icons)
  pdfManualUrl?: string; // PDF manual URL for reference
}

function cleanMarkdown(text: string): string {
  if (!text) return text;
  
  let cleaned = text;
  
  // Entferne "- **" am Anfang
  cleaned = cleaned.replace(/^-\s*\*\*/gm, '');
  
  // Entferne alle ** (bold markers)
  cleaned = cleaned.replace(/\*\*/g, '');
  
  // Entferne alle * (italic markers)
  cleaned = cleaned.replace(/\*/g, '');
  
  // Entferne führende/folgende Leerzeichen
  cleaned = cleaned.trim();
  
  return cleaned;
}

function encodeHtmlEntities(text: string): string {
  if (!text) return text;
  
  return text
    .replace(/ä/g, '&auml;')
    .replace(/Ä/g, '&Auml;')
    .replace(/ö/g, '&ouml;')
    .replace(/Ö/g, '&Ouml;')
    .replace(/ü/g, '&uuml;')
    .replace(/Ü/g, '&Uuml;')
    .replace(/ß/g, '&szlig;')
    .replace(/×/g, '&times;')
    .replace(/–/g, '&ndash;')
    .replace(/—/g, '&mdash;')
    .replace(/€/g, '&euro;')
    .replace(/°/g, '&deg;');
}

/**
 * Entfernt EMCOM-Marke aus Text (Eigenmarke soll nicht sichtbar sein)
 */
function removeEmcomBrand(text: string): string {
  if (!text) return text;
  
  // EMCOM am Anfang entfernen
  let cleaned = text.replace(/^EMCOM\s+/i, '');
  // EMCOM in der Mitte entfernen
  cleaned = cleaned.replace(/\s+EMCOM\s+/gi, ' ');
  // EMCOM am Ende entfernen
  cleaned = cleaned.replace(/\s+EMCOM$/i, '');
  // "von EMCOM" oder "by EMCOM" entfernen
  cleaned = cleaned.replace(/\s+(von|by|from)\s+EMCOM\b/gi, '');
  // Doppelte Leerzeichen bereinigen
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

/**
 * Entfernt Größenangaben wie "38mm", "42mm", "44mm" aus Text
 * Diese gehören NICHT in Produktnamen, Fließtext oder Kompatibilität
 */
function removeSizeSpecs(text: string): string {
  if (!text) return text;
  
  let cleaned = text;
  // Größenangaben entfernen: "38mm", "38 mm", "38-mm" (mit optionalem Leerzeichen davor)
  cleaned = cleaned.replace(/\s+\d{2,3}\s*-?\s*mm\b/gi, '');
  // Auch am Wortanfang: "38mm" ohne Leerzeichen davor (z.B. nach Bindestrich)
  cleaned = cleaned.replace(/\b\d{2,3}\s*-?\s*mm\b/gi, '');
  // Doppelte Leerzeichen bereinigen
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  console.log(`🔧 removeSizeSpecs: "${text.substring(0, 50)}..." → "${cleaned.substring(0, 50)}..."`);
  
  return cleaned;
}

/**
 * Prüft ob ein Vorteil/Bullet eine Farbe enthält (Farbe gehört NUR in Tabelle)
 */
function isFarbeBullet(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  
  // Farben-Keywords die nicht als Vorteile gelten
  const farbePatterns = [
    /\b(in\s+)?(schwarz|weiß|weiss|silber|grau|blau|rot|grün|gelb|orange|pink|lila|gold|bronze)\b/i,
    /\bfarbe\b/i,
    /\bgehäusefarbe\b/i,
    /\bfarbig\b/i,
    /\belegant(es|em)?\s+(schwarz|weiß|silber)/i,
    /\bschwarzes?\s+gehäuse/i,
    /\bweißes?\s+gehäuse/i,
    /\berhältlich\s+in\s+/i
  ];
  
  return farbePatterns.some(pattern => pattern.test(lower));
}

/**
 * Filtert Farb-Bullets aus der Vorteile-Liste
 */
function filterFarbeBullets(bullets: string[]): string[] {
  return bullets.filter(bullet => {
    if (isFarbeBullet(bullet)) {
      console.log(`🎨 Farbe aus Vorteilen gefiltert: "${bullet}"`);
      return false;
    }
    return true;
  });
}

/**
 * Extrahiert APN/Teilenummern aus Text
 * Gibt die gefundenen Nummern zurück
 */
function extractApnFromText(text: string): string | null {
  if (!text) return null;
  
  // Pattern für APN-Nummern
  const apnPatterns = [
    /APN[:\s]+([0-9\-,\s]+)/i,
    /entspricht\s+APN\s+([0-9\-,\s]+)/i,
    /Apple-?Teilenummer[n]?\s*[:\s]*([0-9\-,\s]+)/i,
  ];
  
  for (const pattern of apnPatterns) {
    const match = text.match(pattern);
    if (match) {
      const apn = match[1].trim().replace(/\s+/g, ' ').replace(/,\s*/g, ', ');
      console.log(`🔢 APN extrahiert: ${apn}`);
      return apn;
    }
  }
  
  return null;
}

/**
 * Entfernt APN/Teilenummern-Sätze aus dem Fließtext
 * Diese gehören nur in die technische Tabelle
 */
function removeApnFromText(text: string): string {
  if (!text) return text;
  
  // Pattern für APN-Sätze die entfernt werden sollen
  const apnPatterns = [
    // "Er ersetzt die Apple-Teilenummern (APN) 616-0579, 616-0580."
    /\s*Er\s+ersetzt\s+die\s+(Apple-)?Teilenummer[n]?\s*\(?(APN)?\)?\s*[0-9\-,\s]+\.?/gi,
    // "entspricht APN 616-0579, 616-0580"
    /\s*entspricht\s+(der\s+)?(APN|Teilenummer)\s*[0-9\-,\s]+\.?/gi,
    // "Apple Part Number: 616-0579"
    /\s*Apple\s+Part\s+Number[:\s]+[0-9\-,\s]+\.?/gi,
    // "Teilenummer: 616-0579" im Fließtext
    /\s*Teilenummer[:\s]+[0-9\-,\s]+\.?/gi,
    // "(APN: 616-0579, 616-0580)"
    /\s*\(APN[:\s]*[0-9\-,\s]+\)/gi,
    // "APN 616-0579, 616-0580" als eigenständiger Satz
    /\s*APN[:\s]+[0-9\-,\s]+\.?/gi,
  ];
  
  let cleaned = text;
  for (const pattern of apnPatterns) {
    if (pattern.test(cleaned)) {
      console.log(`🔢 APN aus Fließtext entfernt: ${cleaned.match(pattern)?.[0]}`);
      cleaned = cleaned.replace(pattern, '');
    }
  }
  
  // Doppelte Leerzeichen und Punkte bereinigen
  cleaned = cleaned.replace(/\s+/g, ' ').replace(/\.\s*\./g, '.').trim();
  
  return cleaned;
}

export function renderProductHtml(options: RenderOptions): string {
  const { productName, categoryConfig, copy, layoutStyle = 'mediamarkt', technicalDataTable, safetyWarnings, pdfManualUrl } = options;
  
  const cleanProductName = cleanMarkdown(productName);

  const packageContents = cleanMarkdown(copy.packageContents || '');

  const technicalSpecs = buildTechnicalSpecsTable(
    copy.technicalSpecs,
    categoryConfig.technicalFields
  );

  const cleanNarrative = removeApnFromText(cleanMarkdown(copy.narrative));
  const uspBullets = filterFarbeBullets(
    copy.uspBullets
      .map(usp => cleanMarkdown(usp))
      .filter(usp => usp && usp.trim().length > 0)
  ).slice(0, 5);

  const einleitung = removeSizeSpecs(removeApnFromText(removeEmcomBrand(cleanMarkdown(copy.einleitung || ''))));
  const anwendung = removeSizeSpecs(removeApnFromText(removeEmcomBrand(cleanMarkdown(copy.anwendung || ''))));
  const beschreibung = removeSizeSpecs(removeApnFromText(removeEmcomBrand(cleanMarkdown(copy.beschreibung || ''))));
  const tagline = removeSizeSpecs(cleanMarkdown(copy.tagline || ''));
  const kompatibleModelle = (copy.kompatibleModelle || []).map(m => removeSizeSpecs(cleanMarkdown(m)));
  const werkzeuguebersicht = (copy.werkzeuguebersicht || []).map(w => cleanMarkdown(w));
  const fazit = cleanMarkdown(copy.fazit || '');
  const produktTyp = copy.produktTyp || 'elektronik';
  const zeigeTabelle = copy.zeigeTabelle === true;
  const einsatzbereiche = removeSizeSpecs(cleanMarkdown(copy.einsatzbereiche || ''));
  const achtungHinweis = cleanMarkdown(copy.achtungHinweis || '');
  
  // Extrahiere APN aus dem Produktnamen für den Fließtext unter der Tabelle
  const extractedApn = extractApnFromText(productName);
  const apnSatz = extractedApn 
    ? `Akku passend f&uuml;r folgende Teilenummer (APN): ${extractedApn}`
    : cleanMarkdown(copy.apnSatz || '');
  
  // Verwende AI-generierten produktTitel wenn vorhanden, sonst Original-Produktname
  let produktTitel = cleanMarkdown(copy.produktTitel || '') || cleanProductName;
  
  // EMCOM aus Produkttitel entfernen (Eigenmarke soll nicht erscheinen)
  produktTitel = removeEmcomBrand(produktTitel);
  
  // Größenangaben entfernen (38mm, 42mm etc. gehören nicht in Produktnamen)
  produktTitel = removeSizeSpecs(produktTitel);
  
  // Entferne falsche Wh-Angaben aus dem Titel (nur wenn es keine echte Wh-Kapazität ist)
  produktTitel = produktTitel.replace(/\s*–?\s*\d+\s*Wh\b/gi, '').trim();
  
  // Entferne "Zubehör" und Marketing-Floskeln aus dem Produktnamen
  produktTitel = produktTitel
    .replace(/\bZubeh[öo]r\b/gi, '')
    .replace(/\bhochwertig(e|er|es|en|em)?\b/gi, '')
    .replace(/\bpremium\b/gi, '')
    .replace(/\bprofessionell(e|er|es|en|em)?\b/gi, '')
    .replace(/\boriginal\b/gi, '')
    .replace(/\bexklusiv(e|er|es|en|em)?\b/gi, '')
    .trim();
  
  // "V" durch "Volt" ersetzen im Produktnamen (z.B. "3,7 V" -> "3,7 Volt")
  produktTitel = produktTitel.replace(/(\d+[,.]?\d*)\s*V\b/g, '$1 Volt');
  
  // Entferne doppelte Leerzeichen und – am Ende
  produktTitel = produktTitel.replace(/\s+/g, ' ').replace(/\s*–\s*$/, '').trim();

  return renderMediaMarktLayout({
    productName: produktTitel,
    tagline,
    narrative: cleanNarrative,
    uspBullets,
    technicalSpecs,
    packageContents,
    technicalDataTable,
    pdfManualUrl,
    einleitung,
    anwendung,
    beschreibung,
    kompatibleModelle,
    werkzeuguebersicht,
    apnSatz,
    fazit,
    categoryId: categoryConfig.id,
    zeigeTabelle,
    produktTyp,
    einsatzbereiche,
    achtungHinweis,
  });
}

// Felder die NICHT in die technische Tabelle gehören (Metadaten/interne Felder)
const EXCLUDED_METADATA_FIELDS = new Set([
  'id', 'p id', 'extern id', 'p extern id', 
  'artikelnummer', 'p item number', 'item number',
  'name', 'name(de)', 'p name', 'p name(de)', 'product name',
  'group part', 'group part(de)', 'p group part',
  'attributesets', 'attributesets(debc)', 'attributeset',
  'short intro', 'p short intro', 'short intro(de)',
  'beschreibung', 'description', 'p description',
  'category', 'kategorie', 'p category',
  'status', 'p status', 'active', 'p active',
  'created', 'modified', 'timestamp',
  'sku', 'ean', 'gtin', 'upc', 'isbn',
  'price', 'preis', 'msrp', 'cost',
  'stock', 'quantity', 'bestand', 'menge',
  'image', 'images', 'bild', 'bilder', 'p image',
  'url', 'link', 'p url',
  'brand', 'marke', 'manufacturer', 'hersteller',
  'tags', 'keywords', 'seo',
]);

const CSV_TO_GERMAN_LABELS: Record<string, string> = {
  'Akku1': 'Modell',
  'Typ': 'Typ',
  'Allgemeiner Produkttyp(de)': 'Produkttyp',
  'V Nominal': 'Nennspannung',
  'V Kapazität': 'Kapazität',
  'V Anzahl/Menge': 'Anzahl/Menge',
  'V Chemie/System': 'Chemie/System',
  'V Kompatible Gerätehersteller (Zelle)': 'Kompatible Gerätehersteller',
  'V Height': 'Höhe',
  'V Durchmesser / Dicke': 'Durchmesser/Dicke',
  'V Width': 'Breite',
  'V Length': 'Länge',
  'V Weight': 'Gewicht',
  'Gewicht': 'Gewicht',
  'V Bauform': 'Bauform',
  'V Schutzschaltung': 'Schutzschaltung',
  'V Anschluss': 'Anschluss',
  'V Ladegerät': 'Ladegerät',
  'V Hersteller': 'Hersteller',
  'V Farbe': 'Farbe',
  'Farbe': 'Farbe',
  'V Spannung': 'Spannung',
  'V Leistung': 'Leistung',
  'V Stromstärke': 'Stromstärke',
  'V Material': 'Material',
  'Material': 'Material',
  'V Zellenzahl': 'Zellenzahl',
  'V Zellentyp': 'Zellentyp',
  'V Ladezyklen': 'Ladezyklen',
  'V Ladezeit': 'Ladezeit',
  'V Betriebstemperatur': 'Betriebstemperatur',
  'V Lagertemperatur': 'Lagertemperatur',
  'V Selbstentladung': 'Selbstentladung',
  'V Zertifizierung': 'Zertifizierung',
  'V EAN': 'EAN',
  'V Kabellänge': 'Kabellänge',
  'Kabellänge': 'Kabellänge',
  'V Max. Ladeleistung': 'Max. Ladeleistung',
  'V Datenübertragung': 'Datenübertragung',
  'V Stecker': 'Stecker',
  'Stecker': 'Stecker',
};

function translateToGermanLabel(csvLabel: string): string {
  if (CSV_TO_GERMAN_LABELS[csvLabel]) {
    return CSV_TO_GERMAN_LABELS[csvLabel];
  }
  
  const normalizedLabel = csvLabel.replace(/^V\s+/, '').replace(/^P\s+/, '');
  
  for (const [csv, german] of Object.entries(CSV_TO_GERMAN_LABELS)) {
    const normalizedCsv = csv.replace(/^V\s+/, '').replace(/^P\s+/, '');
    if (normalizedCsv.toLowerCase() === normalizedLabel.toLowerCase()) {
      return german;
    }
  }
  
  return normalizedLabel.charAt(0).toUpperCase() + normalizedLabel.slice(1);
}

function isExcludedMetadataField(label: string): boolean {
  const normalizedLabel = label.toLowerCase().trim();
  
  // Direkte Übereinstimmung
  if (EXCLUDED_METADATA_FIELDS.has(normalizedLabel)) {
    return true;
  }
  
  // Partielle Übereinstimmung für zusammengesetzte Feldnamen
  const excludedArray = Array.from(EXCLUDED_METADATA_FIELDS);
  for (let i = 0; i < excludedArray.length; i++) {
    const excluded = excludedArray[i];
    if (normalizedLabel.includes(excluded) || excluded.includes(normalizedLabel)) {
      // Aber nicht wenn es ein technisches Feld ist (z.B. "gewicht" in "versandgewicht")
      if (normalizedLabel.includes('gewicht') && !normalizedLabel.includes('versand')) {
        return false;
      }
      return true;
    }
  }
  
  return false;
}

function isEmptyOrInvalidValue(value: string): boolean {
  if (!value) return true;
  
  const trimmed = value.trim().toLowerCase();
  
  // Leere oder bedeutungslose Werte
  if (trimmed === '' || 
      trimmed === '0' || 
      trimmed === '-' || 
      trimmed === 'n/a' ||
      trimmed === 'nicht angegeben' || 
      trimmed === 'nicht sichtbar' ||
      trimmed === 'null' ||
      trimmed === 'undefined') {
    return true;
  }
  
  // Interne Referenzen (##|##)
  if (trimmed.includes('##|##')) {
    return true;
  }
  
  return false;
}

function buildTechnicalSpecsTable(
  specs: Record<string, string>,
  fields: TechnicalField[]
): Array<{label: string, value: string}> {
  const result: Array<{label: string, value: string}> = [];

  for (const [label, value] of Object.entries(specs)) {
    if (isExcludedMetadataField(label)) continue;
    if (isEmptyOrInvalidValue(value)) continue;
    
    const whitelistedField = isWhitelistedField(label);
    if (!whitelistedField) continue;
    
    let processedValue = cleanMarkdown(value);
    
    // Korrigiere unlogische Volt-Werte (z.B. 37 → 3,7 V)
    const labelLower = label.toLowerCase();
    if (labelLower.includes('spannung') || labelLower.includes('volt') || 
        labelLower.includes('v_nominal') || labelLower.includes('akku_v') ||
        whitelistedField.label.toLowerCase().includes('spannung')) {
      // Nur korrigieren wenn kein "V" bereits im Wert ist oder Wert numerisch aussieht
      const numericValue = parseFloat(processedValue.replace(',', '.').replace(/[^\d.,]/g, ''));
      if (!isNaN(numericValue) && !processedValue.toLowerCase().includes(' v')) {
        processedValue = correctVoltageValue(numericValue);
      }
    }
    
    // Filtere ungültige Kapazitätswerte
    if (whitelistedField.label.toLowerCase().includes('kapazität')) {
      const valueLower = processedValue.toLowerCase();
      
      // Kapazität MUSS eine Zahl mit mAh oder Ah enthalten
      const hasValidCapacity = /\d+\s*(mah|ah)/i.test(processedValue);
      
      // Wenn keine gültige Kapazitätsangabe, überspringen
      if (!hasValidCapacity) continue;
      
      // Wenn der Wert "Wh" enthält, komplett überspringen (AI-Halluzination)
      if (valueLower.includes('wh') && !valueLower.includes('mah')) continue;
    }
    
    // Filtere ungültige Spannungswerte
    if (whitelistedField.label.toLowerCase().includes('spannung')) {
      const hasNumeric = /\d/.test(processedValue);
      if (!hasNumeric) continue;
    }
    
    // Filtere ungültige Akkutyp-Werte
    if (whitelistedField.label.toLowerCase().includes('akkutyp') || 
        whitelistedField.label.toLowerCase().includes('chemie')) {
      const validAkkuTypes = ['li-ion', 'li-polymer', 'lipo', 'nimh', 'nicd', 'lifepo4', 'lithium'];
      const hasValidType = validAkkuTypes.some(type => processedValue.toLowerCase().includes(type));
      if (!hasValidType && !/[a-z]{2,}/i.test(processedValue)) continue;
    }
    
    result.push({
      label: whitelistedField.label,
      value: processedValue
    });
  }

  return result;
}

/**
 * Gruppiert Modelle nach Kategorie (iPhone, iPad, iPod, Watch, MacBook, etc.)
 */
function groupModelsByCategory(models: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  
  const categoryPatterns: [RegExp, string][] = [
    [/iphone/i, 'iPhone'],
    [/ipad/i, 'iPad'],
    [/ipod\s*nano/i, 'iPod Nano'],
    [/ipod\s*touch/i, 'iPod Touch'],
    [/ipod\s*classic/i, 'iPod Classic'],
    [/ipod\s*shuffle/i, 'iPod Shuffle'],
    [/ipod/i, 'iPod'],
    [/watch/i, 'Apple Watch'],
    [/macbook/i, 'MacBook'],
    [/imac/i, 'iMac'],
    [/mac\s?(pro|mini|studio)/i, 'Mac'],
    [/airpod/i, 'AirPods'],
    [/samsung/i, 'Samsung'],
    [/huawei/i, 'Huawei'],
    [/xiaomi/i, 'Xiaomi'],
    [/sony/i, 'Sony'],
    [/lg/i, 'LG'],
    [/nokia/i, 'Nokia'],
    [/motorola/i, 'Motorola'],
    [/google|pixel/i, 'Google'],
  ];
  
  for (const model of models) {
    let assigned = false;
    for (const [pattern, category] of categoryPatterns) {
      if (pattern.test(model)) {
        if (!groups[category]) groups[category] = [];
        groups[category].push(model);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      if (!groups['Weitere Modelle']) groups['Weitere Modelle'] = [];
      groups['Weitere Modelle'].push(model);
    }
  }
  
  return groups;
}

/**
 * Rendert die Kompatibilitäts-Sektion mit intelligenter Gruppierung
 * - ≤ 8 Modelle: einfache Liste
 * - > 8 Modelle: gruppierte h3 + ul Blöcke (Ultra-Safe, ohne Inline-Styles)
 */
function renderKompatibilitaet(models: string[], e: (s: string) => string): string {
  if (!models || models.length === 0) {
    return '';
  }
  
  // Kompaktes Inline-Format mit Kommas
  const modelsInline = models.map(model => e(model)).join(', ');
  
  return `<p><strong>Kompatibilit&auml;t:</strong> ${modelsInline}</p>`;
}

function cleanTechnicalTable(htmlTable: string): string {
  // Remove wrapper divs and clean up the table for left-aligned display
  let cleaned = htmlTable;
  
  // Remove wrapper divs
  cleaned = cleaned.replace(/<div[^>]*class="[^"]*additional-attributes-wrapper[^"]*"[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/div>/gi, '');
  
  // Remove caption
  cleaned = cleaned.replace(/<caption[^>]*>.*?<\/caption>/gi, '');
  
  // Remove all class attributes from table, tr, th, td
  cleaned = cleaned.replace(/\s+class="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+id="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+data-th="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+scope="[^"]*"/gi, '');
  
  // Add left-aligned inline styles to table
  cleaned = cleaned.replace(/<table/gi, '<table border="0" style="border-collapse: collapse; width: 100%; max-width: 600px;"');
  
  // Make both th and td left-aligned with proper padding
  cleaned = cleaned.replace(/<th/gi, '<th style="padding: 4px 12px 4px 0; text-align: left; vertical-align: top; font-weight: 600;"');
  cleaned = cleaned.replace(/<td/gi, '<td style="padding: 4px 0 4px 0; text-align: left; vertical-align: top;"');
  
  return cleaned.trim();
}

function renderMediaMarktLayout(data: {
  productName: string;
  tagline?: string;
  narrative: string;
  uspBullets: string[];
  technicalSpecs: Array<{label: string, value: string}>;
  packageContents: string;
  technicalDataTable?: string;
  pdfManualUrl?: string;
  einleitung?: string;
  anwendung?: string;
  beschreibung?: string;
  kompatibleModelle?: string[];
  werkzeuguebersicht?: string[];
  apnSatz?: string;
  fazit?: string;
  categoryId?: string;
  zeigeTabelle?: boolean;
  produktTyp?: 'akku' | 'elektronik' | 'werkzeug';
  einsatzbereiche?: string;
  achtungHinweis?: string;
}): string {
  const e = encodeHtmlEntities;
  
  const produktTyp: 'akku' | 'elektronik' | 'werkzeug' = data.produktTyp || 'elektronik';
  
  const einleitung = e(data.einleitung || '');
  const anwendung = e(data.anwendung || data.beschreibung || data.narrative || '');
  
  // Bei Werkzeugen: KEINE Vorteile anzeigen (vermeidet Wiederholungen mit Werkzeugübersicht)
  // Vorteile ohne <ul> Liste - nur Häkchen, keine Punkte
  const vorteileHtml = (produktTyp !== 'werkzeug' && data.uspBullets.length > 0)
    ? data.uspBullets.slice(0, 5).map(usp => {
        // Entferne führende ">" Zeichen (von GPT als Markdown-Zitat generiert)
        const cleanedUsp = usp.replace(/^>\s*/, '').trim();
        return `✅ ${e(cleanedUsp)}`;
      }).join('<br />\n')
    : '';

  // Dynamische technische Tabelle (ohne Kompatibilität - die kommt als Fließtext darunter)
  const allSpecs: Array<{label: string, value: string}> = [];
  
  // Prüfe ob es eine Batterie/Knopfzelle ist (CR2032, LR44, V76PX, etc.)
  const productNameLower = data.productName.toLowerCase();
  const isBatteryProduct = /\b(cr\d{4}|cr123a?|cr2|lr\d+|sr\d+|ag\d+|v\d+px|knopfzelle|fotobatterie|lithium.?batterie?)\b/i.test(productNameLower) && 
                           !/\b(akku|akkupack|wiederaufladbar|rechargeable|li-ion|li-polymer|nimh|nicd)\b/i.test(productNameLower);
  
  // Batterie-Alternativen Map
  const batteryAlternatives: Record<string, string[]> = {
    'CR2032': ['DL2032', 'ECR2032', 'EA-2032C'],
    'CR2025': ['DL2025', 'ECR2025', 'BR2025'],
    'CR2016': ['DL2016', 'ECR2016', 'BR2016'],
    'CR1632': ['DL1632', 'ECR1632', 'BR1632'],
    'CR1620': ['DL1620', 'ECR1620', 'BR1620'],
    'CR1616': ['DL1616', 'ECR1616', 'BR1616'],
    'CR1220': ['DL1220', 'ECR1220', 'BR1220'],
    'CR123A': ['DL123A', 'EL123A', 'K123LA'],
    'CR2': ['DL-CR2', 'DLCR2', 'EL1CR2'],
    'LR44': ['A76', 'AG13', 'G13', 'V13GA'],
    'SR44': ['357', '303', 'V357'],
    'LR41': ['AG3', 'G3', 'LR736'],
    'LR43': ['AG12', 'G12', 'V12GA'],
    'LR1130': ['AG10', 'G10', 'LR54'],
    'V76PX': ['SR44', 'S76', '357', '303'],
    'V13GA': ['LR44', 'A76', 'AG13'],
    'V357': ['SR44W', 'SR44', '303'],
    '4SR44': ['PX28', '4G13', 'A544'],
    '9V': ['6LR61', '6F22', 'PP3'],
    'AA': ['LR6', 'MN1500', 'Mignon'],
    'AAA': ['LR03', 'MN2400', 'Micro'],
  };
  
  // Extrahiere Batterietyp aus Produktname
  let batteryTypeHtml = '';
  if (isBatteryProduct) {
    const productNameUpper = data.productName.toUpperCase();
    for (const [type, alts] of Object.entries(batteryAlternatives)) {
      if (productNameUpper.includes(type)) {
        batteryTypeHtml = `<p style="margin-top: 1em; margin-bottom: 32px;"><strong>Typ:</strong> ${type} (entspricht ${alts.join(', ')})</p>`;
        break;
      }
    }
  }
  
  // Kompatibilität als Fließtext unter die Tabelle (nicht in Tabelle!)
  // REGEL: Bei Batterien KEIN Kompatibilitätsfeld, bei anderen direkt mit Modellen beginnen
  // REGEL: Keine technischen Spezifikationen wie "12 Volt Systeme" oder "ab 10.1 Ah" als Kompatibilität!
  const filterValidCompatibility = (models: string[]): string[] => {
    if (!models || models.length === 0) return [];
    
    return models.filter(model => {
      const m = model.trim().toLowerCase();
      
      // Technische Spezifikationen sind KEINE gültige Kompatibilität
      const invalidPatterns = [
        /^\d+\s*volt/i,           // "12 Volt Systeme"
        /volt\s*system/i,         // "Volt Systeme"
        /\d+\s*ah\b/i,            // "10.1 Ah"
        /\d+\s*mah\b/i,           // "2000 mAh"
        /\d+\s*wh\b/i,            // "50 Wh"
        /ab\s*\d+/i,              // "ab 10.1"
        /^system/i,               // "Systeme..."
        /^\d+\s*v\s/i,            // "12 V ..."
      ];
      
      for (const pattern of invalidPatterns) {
        if (pattern.test(m)) {
          console.log(`🚫 [COMPAT] Gefiltert (keine echte Kompatibilität): "${model}"`);
          return false;
        }
      }
      
      // Muss mindestens einen Buchstaben enthalten (kein reiner Zahlenwert)
      if (!/[a-z]/i.test(model)) {
        console.log(`🚫 [COMPAT] Gefiltert (nur Zahlen): "${model}"`);
        return false;
      }
      
      return true;
    });
  };
  
  const validKompatibleModelle = filterValidCompatibility(data.kompatibleModelle || []);
  
  // REGEL: Kompatibilität 1:1 aus CSV übernehmen - ALLE Modelle anzeigen
  // Auch bei nur 1 Modell anzeigen (z.B. "iPhone 4")
  let kompatibilitaetHtml = (validKompatibleModelle.length >= 1)
    ? `<p style="margin-top: 1em; margin-bottom: 16px;"><strong>Kompatibilit&auml;t:</strong> ${validKompatibleModelle.join(', ')}</p>`
    : '';
  
  // ACHTUNG-Hinweise fett unter Kompatibilität anzeigen
  // Priorität: 1. Direkt übergebenes Feld, 2. technicalSpecs Array, 3. technicalSpecs Object
  let achtungText = data.achtungHinweis || '';
  if (!achtungText) {
    if (Array.isArray(data.technicalSpecs)) {
      achtungText = data.technicalSpecs?.find(s => s.label === 'Achtung')?.value || '';
    } else if (data.technicalSpecs && typeof data.technicalSpecs === 'object') {
      achtungText = (data.technicalSpecs as Record<string, string>)['Achtung'] || '';
    }
  }
  if (achtungText) {
    kompatibilitaetHtml += `<p style="margin-top: 0; margin-bottom: 32px;"><strong>Achtung: ${encodeHtmlEntities(achtungText)}</strong></p>`;
    console.log(`⚠️ ACHTUNG-Hinweis in HTML eingefügt: ${achtungText}`);
  }
  
  // Technische Specs hinzufügen - für ALLE Produkttypen (wenn Daten vorhanden)
  if (data.technicalSpecs && data.technicalSpecs.length > 0) {
    const existingLabels = new Set(allSpecs.map(s => s.label.toLowerCase()));
    
    const filteredSpecs = data.technicalSpecs.filter(spec => {
      const labelLower = spec.label.toLowerCase();
      const valueTrimmed = (spec.value || '').replace(/[\s\u00A0\u200B\uFEFF]/g, '').trim();
      
      // Leere Werte filtern
      if (!valueTrimmed || valueTrimmed === '' || valueTrimmed === '-' || valueTrimmed === '0' ||
          valueTrimmed === '&nbsp;' || valueTrimmed.length === 0) {
        return false;
      }
      
      // Duplikate filtern
      if (existingLabels.has(labelLower)) return false;
      
      // Bestimmte Felder ausschließen
      return !labelLower.includes('teilenummer') && 
             !labelLower.includes('apn') &&
             !labelLower.includes('kompatibil') &&
             !labelLower.includes('modell') &&
             !labelLower.includes('schutzschaltung') &&
             !labelLower.includes('achtung') &&
             labelLower !== 'part number';
    });
    allSpecs.push(...filteredSpecs);
  }
  
  // Teilenummer (APN) wird UNTER der Tabelle angezeigt, nicht IN der Tabelle
  let teilenummerHtml = '';
  if (data.apnSatz && data.apnSatz.trim()) {
    // Extrahiere die APN-Nummern aus dem Satz
    const apnMatch = data.apnSatz.match(/(\d{3}-\d{4}[\d\s,\-]*)/);
    if (apnMatch) {
      const apnValue = apnMatch[0].replace(/,\s*/g, ', ').trim();
      teilenummerHtml = `<p style="margin-top: 1em;"><strong>Teilenummer (APN):</strong> ${e(apnValue)}</p>`;
    }
  }
  
  // Finale Filterung: leere und ungültige Werte entfernen
  const finalSpecs = allSpecs.filter(spec => {
    const val = (spec.value || '').trim();
    const valLower = val.toLowerCase();
    
    if (!val || val.length === 0) return false;
    
    if (valLower === '-' || valLower === '0' || valLower === 'n/a' || 
        valLower === 'null' || valLower === 'undefined' || valLower === 'nicht angegeben' ||
        valLower === 'keine angabe' || valLower === 'unbekannt') {
      return false;
    }
    
    return true;
  });
  
  // Tabelle mit dynamischer Spaltenbreite: erste Spalte passt sich an längsten Label an
  const techTableHtml = finalSpecs.length > 0
    ? `<h2>Technische Daten</h2>
<table style="width: auto; border-collapse: collapse;">
${finalSpecs.map(spec => `<tr><td style="white-space: nowrap; padding-right: 2em; vertical-align: top;">${e(spec.label)}</td><td style="vertical-align: top;">${e(spec.value)}</td></tr>`).join('\n')}
</table>`
    : '';

  const werkzeugItems = data.werkzeuguebersicht || [];
  const werkzeuguebersichtHtml = (produktTyp === 'werkzeug' && werkzeugItems.length > 0)
    ? `<h2>Werkzeug&uuml;bersicht</h2>
<ul>
${werkzeugItems.map(item => `<li>${e(item)}</li>`).join('\n')}
</ul>`
    : '';

  const packageItems = data.packageContents
    .split(/\n/)
    .map(item => item.trim())
    .filter(item => item.length > 0);
  
  const lieferumfangHtml = packageItems.length > 0
    ? `<h2 style="margin-top: 1.5em;">Lieferumfang</h2>
<ul>
${packageItems.map(item => `<li>${e(item)}</li>`).join('\n')}
</ul>`
    : '';

  const productName = e(data.productName);
  
  // H1 entfernt - Shop generiert eigenen Titel
  // Nur noch ein kompakter Anwendungsabsatz (einleitung+fazit entfernt)
  let html = `<p>${anwendung}</p>`;

  if (werkzeuguebersichtHtml) {
    html += `
${werkzeuguebersichtHtml}`;
  }

  if (vorteileHtml) {
    html += `
<h2>Ihre Vorteile</h2>
<p>
${vorteileHtml}
</p>`;
  }

  // Einsatzbereiche als Fließtext nach den Vorteilen
  // REGEL: Nur anzeigen wenn genügend einzigartige Inhalte UND keine Wiederholung zur Anwendung
  const einsatzbereicheText = data.einsatzbereiche ? e(data.einsatzbereiche).trim() : '';
  const shouldShowEinsatzbereiche = (() => {
    if (!einsatzbereicheText || einsatzbereicheText.length < 50) {
      console.log(`⏭️ Einsatzbereiche übersprungen: zu kurz (${einsatzbereicheText.length} Zeichen)`);
      return false;
    }
    
    // Prüfe auf Wiederholung zur Anwendung/Einleitung
    const anwendungLower = anwendung.toLowerCase().replace(/[^\w\s]/g, '');
    const einsatzLower = einsatzbereicheText.toLowerCase().replace(/[^\w\s]/g, '');
    
    // Extrahiere Schlüsselwörter (Wörter > 4 Zeichen)
    const anwendungWords = new Set(anwendungLower.split(/\s+/).filter(w => w.length > 4));
    const einsatzWords = einsatzLower.split(/\s+/).filter(w => w.length > 4);
    
    // Zähle überlappende Wörter
    let overlap = 0;
    for (const word of einsatzWords) {
      if (anwendungWords.has(word)) overlap++;
    }
    
    // Wenn >40% der Wörter bereits in Anwendung vorkommen = Wiederholung (verschärft von 60%)
    const overlapRatio = einsatzWords.length > 0 ? overlap / einsatzWords.length : 0;
    if (overlapRatio > 0.4) {
      console.log(`⏭️ Einsatzbereiche übersprungen: ${Math.round(overlapRatio * 100)}% Überlappung mit Anwendung`);
      return false;
    }
    
    return true;
  })();
  
  if (shouldShowEinsatzbereiche) {
    html += `
<h2 style="margin-top: 1.5em;">Einsatzbereiche</h2>
<p style="margin-bottom: 32px;">${einsatzbereicheText}</p>`;
  }

  if (techTableHtml) {
    html += `
${techTableHtml}`;
  }

  // Teilenummer (APN) direkt unter die Technische Daten Tabelle
  if (teilenummerHtml) {
    html += teilenummerHtml;
  }

  // Kompatibilität als Fließtext unter die Tabelle (für Nicht-Batterien)
  if (kompatibilitaetHtml) {
    html += `
${kompatibilitaetHtml}`;
  }
  
  // Typ mit alternativen Bezeichnungen für Batterien/Knopfzellen
  if (batteryTypeHtml) {
    html += `
${batteryTypeHtml}`;
  }

  // Lieferumfang immer zum Schluss - mit mehr Abstand zur Tabelle
  if (lieferumfangHtml) {
    html += `
<br />
${lieferumfangHtml}`;
  }

  return html;
}

/**
 * Teilt den Narrative-Text in 2-3 sinnvolle Absätze auf
 */
function splitNarrativeIntoParagraphs(narrative: string): string[] {
  if (!narrative) return [];
  
  // Teile an Satzenden (. ! ?) gefolgt von Leerzeichen
  const sentences = narrative.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  
  if (sentences.length <= 2) {
    return [narrative]; // Zu kurz für Aufteilung
  }
  
  if (sentences.length <= 4) {
    // 2 Absätze
    const mid = Math.ceil(sentences.length / 2);
    return [
      sentences.slice(0, mid).join(' '),
      sentences.slice(mid).join(' ')
    ];
  }
  
  // 3 Absätze für längere Texte
  const third = Math.ceil(sentences.length / 3);
  return [
    sentences.slice(0, third).join(' '),
    sentences.slice(third, third * 2).join(' '),
    sentences.slice(third * 2).join(' ')
  ];
}
