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
  
  const tableRowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
  let match;
  
  while ((match = tableRowRegex.exec(html)) !== null) {
    const key = stripHtmlTags(match[1]).toLowerCase().replace(/[:\s]+$/, '').trim();
    const value = stripHtmlTags(match[2]).trim();
    
    if (key && value && value !== '-' && value !== '–') {
      fields[key] = value;
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

export function parseDescription(description: string, productName?: string): ParseResult {
  if (!description || description.trim().length === 0) {
    return { success: false, error: 'Leere Beschreibung' };
  }

  const rawFields: Record<string, string> = {};
  const parsed: Partial<ParsedProduct> = { rawFields, originalHtml: description };

  const tableFields = extractFromHtmlTable(description);
  Object.assign(rawFields, tableFields);

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

  if (!parsed.produkttyp) {
    if (/notleuchte/i.test(productName || '')) {
      parsed.produkttyp = 'Notleuchtenakku';
    } else if (/akku/i.test(productName || '')) {
      parsed.produkttyp = 'Akku';
    } else {
      parsed.produkttyp = 'Akku';
    }
  }

  const requiredFields: (keyof ParsedProduct)[] = ['spannung', 'kapazitaet'];
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (!parsed[field]) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    return { 
      success: false, 
      error: `Pflichtfelder fehlen: ${missingFields.join(', ')}. Gefundene Felder: ${Object.keys(rawFields).join(', ')}`,
      missingFields 
    };
  }

  const hasLaengeBreiteHoehe = parsed.laenge && parsed.breite && parsed.hoehe;
  const hasLaengeDurchmesser = parsed.laenge && parsed.durchmesser;
  const hasMixed = (parsed.durchmesser && (parsed.breite || parsed.hoehe)) || 
                   (hasLaengeBreiteHoehe && parsed.durchmesser);

  if (hasMixed) {
    return { 
      success: false, 
      error: 'Maßsystem gemischt (Durchmesser + Breite/Höhe)',
      missingFields 
    };
  }

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
