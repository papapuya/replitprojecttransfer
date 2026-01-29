export interface ParsedProduct {
  produkttyp?: string;
  teilenummer?: string;
  type?: string;
  spannung?: string;
  kapazitaet?: string;
  energiegehalt?: string;
  laenge?: string;
  breite?: string;
  hoehe?: string;
  durchmesser?: string;
  gewicht?: string;
  kabellaenge?: string;
  kompatibilitaet?: string;
  rawFields: Record<string, string>;
  originalHtml?: string;
}

export interface ParseResult {
  success: boolean;
  data?: ParsedProduct;
  error?: string;
  missingFields?: string[];
}

const FIELD_MAPPINGS: Record<string, keyof ParsedProduct> = {
  'produkttyp': 'produkttyp',
  'product type': 'produkttyp',
  'typ': 'produkttyp',
  'teilenummer': 'teilenummer',
  'part number': 'teilenummer',
  'article number': 'teilenummer',
  'artikelnummer': 'teilenummer',
  'type': 'type',
  'chemie': 'type',
  'chemisches system': 'type',
  'zelltyp': 'type',
  'akkutyp': 'type',
  'batterietyp': 'type',
  'spannung': 'spannung',
  'voltage': 'spannung',
  'nennspannung': 'spannung',
  'kapazität': 'kapazitaet',
  'kapazitaet': 'kapazitaet',
  'capacity': 'kapazitaet',
  'nennkapazität': 'kapazitaet',
  'energiegehalt': 'energiegehalt',
  'energy': 'energiegehalt',
  'wh': 'energiegehalt',
  'energie': 'energiegehalt',
  'länge': 'laenge',
  'laenge': 'laenge',
  'length': 'laenge',
  'breite': 'breite',
  'width': 'breite',
  'höhe': 'hoehe',
  'hoehe': 'hoehe',
  'height': 'hoehe',
  'durchmesser': 'durchmesser',
  'diameter': 'durchmesser',
  'gewicht': 'gewicht',
  'weight': 'gewicht',
  'kabellänge': 'kabellaenge',
  'kabellaenge': 'kabellaenge',
  'cable length': 'kabellaenge',
  'kompatibilität': 'kompatibilitaet',
  'kompatibilitaet': 'kompatibilitaet',
  'compatibility': 'kompatibilitaet',
  'passend für': 'kompatibilitaet',
  'passend fuer': 'kompatibilitaet',
  'ersetzt': 'kompatibilitaet',
  'geeignet für': 'kompatibilitaet',
};

export function stripHtmlTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFromHtmlTable(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  
  // Standard table rows mit td-Elementen
  const tableRowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
  let match;
  
  while ((match = tableRowRegex.exec(html)) !== null) {
    const key = stripHtmlTags(match[1]).toLowerCase().replace(/[:\s]+$/, '').trim();
    const value = stripHtmlTags(match[2]).trim();
    
    if (key && value && value !== '-' && value !== '–') {
      fields[key] = value;
    }
  }
  
  // bpsDesc Format: pd-spec-name und pd-spec-value Klassen (auch mit escaped quotes "")
  const bpsSpecRegex = /<td[^>]*class=[""]?[^"]*pd-spec-name[^"]*[""]?[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*class=[""]?[^"]*pd-spec-value[^"]*[""]?[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/gi;
  
  while ((match = bpsSpecRegex.exec(html)) !== null) {
    const key = stripHtmlTags(match[1]).toLowerCase().replace(/[:\s]+$/, '').trim();
    const value = stripHtmlTags(match[2]).trim();
    
    if (key && value && value !== '-' && value !== '–') {
      fields[key] = value;
    }
  }
  
  // Alternative: Suche direkt nach dem Muster pd-spec-name...pd-spec-value
  const altBpsRegex = /pd-spec-name[^>]*>([\s\S]*?)<\/td>[\s\S]*?pd-spec-value[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/gi;
  
  while ((match = altBpsRegex.exec(html)) !== null) {
    const key = stripHtmlTags(match[1]).toLowerCase().replace(/[:\s]+$/, '').trim();
    const value = stripHtmlTags(match[2]).trim();
    
    if (key && value && value !== '-' && value !== '–' && !fields[key]) {
      fields[key] = value;
    }
  }
  
  // Abmessungen (LxBxH) in Länge, Breite, Höhe aufteilen
  if (fields['abmessungen']) {
    const dimMatch = fields['abmessungen'].match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*mm/i);
    if (dimMatch) {
      if (!fields['länge'] && !fields['laenge']) fields['länge'] = dimMatch[1] + ' mm';
      if (!fields['breite']) fields['breite'] = dimMatch[2] + ' mm';
      if (!fields['höhe'] && !fields['hoehe']) fields['höhe'] = dimMatch[3] + ' mm';
    }
  }
  
  // Passend für / Ersetzt aus bpsDesc extrahieren
  const passendFuerMatch = html.match(/<h2>Passend für:\s*<\/h2>([\s\S]*?)(?:<hr|<h[234])/i);
  if (passendFuerMatch) {
    const value = stripHtmlTags(passendFuerMatch[1]).trim();
    if (value && !fields['passend für'] && !fields['kompatibilität']) {
      fields['passend für'] = value;
    }
  }
  
  const ersetztMatch = html.match(/<h3>Ersetzt:\s*<\/h3>([\s\S]*?)(?:<hr|<h[234])/i);
  if (ersetztMatch) {
    const value = stripHtmlTags(ersetztMatch[1]).trim();
    if (value && !fields['ersetzt'] && !fields['kompatibilität']) {
      fields['ersetzt'] = value;
    }
  }
  
  return fields;
}

function extractFromText(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lines = text.split(/[\n|]+/).map(l => l.trim()).filter(l => l.length > 0);
  
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1 || colonIndex < 2) continue;
    
    const key = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();
    
    if (key && value && value.length > 0 && value !== '-' && value !== '–') {
      fields[key] = value;
    }
  }
  
  return fields;
}

export function extractProductTypeFromName(name: string): string {
  const productTypes = [
    { pattern: /Notleuchtenakku|Notleuchte/i, value: 'Notleuchten' },
    { pattern: /Notbeleuchtung/i, value: 'Notbeleuchtung' },
    { pattern: /Taschenlampe/i, value: 'Taschenlampen' },
    { pattern: /Handlampe/i, value: 'Handlampen' },
    { pattern: /Stirnlampe/i, value: 'Stirnlampen' },
    { pattern: /Werkzeug|Werkzeuge/i, value: 'Werkzeuge' },
    { pattern: /Rasenmäher/i, value: 'Rasenmäher' },
    { pattern: /Staubsauger/i, value: 'Staubsauger' },
    { pattern: /Telefon/i, value: 'Telefone' },
    { pattern: /Handy/i, value: 'Handys' },
    { pattern: /Laptop/i, value: 'Laptops' },
    { pattern: /Notebook/i, value: 'Notebooks' },
    { pattern: /Kamera/i, value: 'Kameras' },
    { pattern: /Camcorder/i, value: 'Camcorder' },
    { pattern: /Funkgerät/i, value: 'Funkgeräte' },
    { pattern: /Walkie/i, value: 'Funkgeräte' },
    { pattern: /E-Bike/i, value: 'E-Bikes' },
    { pattern: /Fahrrad/i, value: 'Fahrräder' },
    { pattern: /Modellbau/i, value: 'Modellbau' },
    { pattern: /RC[-\s]/i, value: 'RC-Modelle' },
    { pattern: /Spielzeug/i, value: 'Spielzeug' },
    { pattern: /Alarm/i, value: 'Alarmanlagen' },
    { pattern: /USV/i, value: 'USV-Anlagen' },
    { pattern: /Solar/i, value: 'Solaranlagen' },
  ];
  
  const found: string[] = [];
  for (const { pattern, value } of productTypes) {
    if (pattern.test(name) && !found.includes(value)) {
      found.push(value);
    }
  }
  
  return found.join(', ');
}

function extractCompatibilityFromText(text: string): string {
  const patterns = [
    /passend\s+(?:für|fuer)\s+([A-Za-zÄÖÜäöüß]+-?(?:Notbeleuchtung|Notleuchte|Leuchten?))/i,
    /(?:für|fuer)\s+([A-Za-zÄÖÜäöüß]+-?(?:Notbeleuchtung|Notleuchte))/i,
    /([A-Z][a-zA-ZÄÖÜäöüß]+-Notbeleuchtung)/,
    /([A-Z][a-zA-ZÄÖÜäöüß]+-Notleuchte)/,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return '';
}

function extractFromProductName(name: string): Partial<ParsedProduct> {
  const result: Partial<ParsedProduct> = {};
  
  const voltageMatch = name.match(/(\d+[,.]?\d*)\s*V\b/i);
  if (voltageMatch) {
    result.spannung = voltageMatch[1].replace(',', '.') + 'V';
  }
  
  const capacityMatch = name.match(/(\d+)\s*mAh/i);
  if (capacityMatch) {
    result.kapazitaet = capacityMatch[1] + 'mAh';
  }
  
  const whMatch = name.match(/(\d+[,.]?\d*)\s*Wh/i);
  if (whMatch) {
    result.energiegehalt = whMatch[1].replace(',', '.') + 'Wh';
  }
  
  if (/NiMH|Nickel.?Metall.?Hydrid/i.test(name)) {
    result.type = 'NiMH';
  } else if (/NiCd|Nickel.?Cadmium/i.test(name)) {
    result.type = 'NiCd';
  } else if (/Li-?Ion|Lithium/i.test(name)) {
    result.type = 'Li-Ion';
  }
  
  const compat = extractCompatibilityFromText(name);
  if (compat) {
    result.kompatibilitaet = compat;
  }
  
  return result;
}

export function parseDescription(description: string, productName?: string, csvRow?: Record<string, any>): ParseResult {
  const rawFields: Record<string, string> = {};
  const parsed: Partial<ParsedProduct> = { rawFields, originalHtml: description || '' };

  if (csvRow) {
    if (csvRow.spannung || csvRow.voltage) parsed.spannung = csvRow.spannung || csvRow.voltage;
    if (csvRow.kapazitaet || csvRow.kapazität || csvRow.capacity) parsed.kapazitaet = csvRow.kapazitaet || csvRow.kapazität || csvRow.capacity;
    if (csvRow.gewicht || csvRow.weight) parsed.gewicht = csvRow.gewicht || csvRow.weight;
    if (csvRow.type || csvRow.typ || csvRow.chemie) parsed.type = csvRow.type || csvRow.typ || csvRow.chemie;
    if (csvRow.produkttyp || csvRow.product_type) parsed.produkttyp = csvRow.produkttyp || csvRow.product_type;
    if (csvRow.laenge || csvRow.länge) parsed.laenge = csvRow.laenge || csvRow.länge;
    if (csvRow.breite) parsed.breite = csvRow.breite;
    if (csvRow.hoehe || csvRow.höhe) parsed.hoehe = csvRow.hoehe || csvRow.höhe;
  }

  const tableFields = extractFromHtmlTable(description);
  Object.assign(rawFields, tableFields);
  
  // Debug: Zeige extrahierte Felder
  if (Object.keys(tableFields).length > 0) {
    console.log(`[Parser] Extrahierte Felder aus HTML:`, JSON.stringify(tableFields).substring(0, 300));
  }

  const cleanText = stripHtmlTags(description);
  const textFields = extractFromText(cleanText);
  
  for (const [key, value] of Object.entries(textFields)) {
    if (!rawFields[key]) {
      rawFields[key] = value;
    }
  }

  if (!rawFields['kompatibilität'] && !rawFields['kompatibilitaet']) {
    const compatFromDesc = extractCompatibilityFromText(cleanText);
    if (compatFromDesc) {
      rawFields['kompatibilität'] = compatFromDesc;
    }
  }

  for (const [rawKey, value] of Object.entries(rawFields)) {
    const normalizedKey = rawKey.toLowerCase().trim();
    for (const [pattern, field] of Object.entries(FIELD_MAPPINGS)) {
      if (normalizedKey.includes(pattern) || pattern.includes(normalizedKey)) {
        if (field !== 'rawFields' && field !== 'originalHtml') {
          if (!(parsed as any)[field]) {
            (parsed as any)[field] = value;
          }
        }
        break;
      }
    }
  }

  if (productName) {
    const nameExtracted = extractFromProductName(productName);
    for (const [key, value] of Object.entries(nameExtracted)) {
      if (!(parsed as any)[key] && value) {
        (parsed as any)[key] = value;
      }
    }
  }

  // Produkttyp direkt aus dem Produktnamen extrahieren
  const normalizeProdukttyp = (name: string, existingType?: string): string => {
    const nameLower = name.toLowerCase();
    
    // Direkte Begriffe aus dem Produktnamen übernehmen (exakte Schreibweise)
    const direkteTypen = [
      { pattern: /speicherbatterie/i, typ: 'Speicherbatterie' },
      { pattern: /pufferbatterie/i, typ: 'Pufferbatterie' },
      { pattern: /starterbatterie/i, typ: 'Starterbatterie' },
      { pattern: /bleiakku/i, typ: 'Bleiakku' },
      { pattern: /bleibatterie/i, typ: 'Bleibatterie' },
      { pattern: /notleuchtenakku/i, typ: 'Notleuchtenakku' },
      { pattern: /funkakku/i, typ: 'Funkakku' },
      { pattern: /werkzeugakku/i, typ: 'Werkzeugakku' },
      { pattern: /kranakku/i, typ: 'Kranakku' },
      { pattern: /telefonakku/i, typ: 'Telefonakku' },
      { pattern: /kameraakku/i, typ: 'Kameraakku' },
      { pattern: /lampenakku/i, typ: 'Lampenakku' },
      { pattern: /rasiererakku/i, typ: 'Rasiererakku' },
      { pattern: /staubsaugerakku/i, typ: 'Staubsaugerakku' },
      { pattern: /powerbank/i, typ: 'Powerbank' },
      { pattern: /akkupack/i, typ: 'Akkupack' },
      { pattern: /akkueinsatz/i, typ: 'Akkueinsatz' },
      { pattern: /zellentausch/i, typ: 'Zellentausch' },
      { pattern: /ersatzakku/i, typ: 'Ersatzakku' },
      { pattern: /taschenlampe/i, typ: 'Taschenlampe' },
      { pattern: /arbeitsleuchte/i, typ: 'Arbeitsleuchte' },
      { pattern: /handlampe/i, typ: 'Handlampe' },
      { pattern: /stirnlampe/i, typ: 'Stirnlampe' },
      { pattern: /ladegerät/i, typ: 'Ladegerät' },
      { pattern: /netzteil/i, typ: 'Netzteil' },
      { pattern: /adapter/i, typ: 'Adapter' },
    ];
    
    for (const { pattern, typ } of direkteTypen) {
      if (pattern.test(nameLower)) {
        return typ;
      }
    }
    
    // Fallback: Allgemeiner Akku/Batterie
    if (/batterie/i.test(nameLower)) return 'Batterie';
    if (/akku/i.test(nameLower)) return 'Akku';
    
    return 'Akku';
  };

  parsed.produkttyp = normalizeProdukttyp(productName || '', parsed.produkttyp);

  // Gewicht normalisieren: "Gramm" → "g", "Kilogramm" → "kg"
  if (parsed.gewicht) {
    parsed.gewicht = parsed.gewicht
      .replace(/\s*Gramm\b/gi, ' g')
      .replace(/\s*gramm\b/gi, ' g')
      .replace(/\s*Kilogramm\b/gi, ' kg')
      .replace(/\s*kilogramm\b/gi, ' kg')
      .trim();
  }

  // Keine Pflichtfeld-Prüfung mehr - wenn Beschreibung vorhanden ist, immer weitermachen
  // Fehlende technische Daten werden im Rendering als optionale Felder behandelt

  return { 
    success: true, 
    data: parsed as ParsedProduct 
  };
}

export type ProductType = 'akku' | 'lampe' | 'unknown';

export function detectProductType(name: string, description: string): ProductType {
  const combined = `${name} ${description}`.toLowerCase();

  const akkuKeywords = [
    'notleuchtenakku', 'akku', 'batterie', 'nicd', 'nimh', 'li-ion', 
    'lithium', 'mah', 'wh', 'akkupack', 'battery', 'nickel-cadmium',
    'nickel-metall-hydrid', 'nickel cadmium', 'nickel metall hydrid'
  ];

  const lampeKeywords = [
    'lampe', 'taschenlampe', 'led', 'lumen', 'acebeam', 'olight', 
    'leuchtmodi', 'flashlight', 'torch'
  ];

  const akkuScore = akkuKeywords.filter(k => combined.includes(k)).length;
  const lampeScore = lampeKeywords.filter(k => combined.includes(k)).length;

  if (akkuScore > lampeScore && akkuScore > 0) return 'akku';
  if (lampeScore > akkuScore && lampeScore > 0) return 'lampe';
  if (akkuScore > 0) return 'akku';

  return 'unknown';
}
