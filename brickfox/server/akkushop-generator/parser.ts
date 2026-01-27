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
  'teilenummer': 'teilenummer',
  'part number': 'teilenummer',
  'type': 'type',
  'chemie': 'type',
  'chemisches system': 'type',
  'spannung': 'spannung',
  'voltage': 'spannung',
  'kapazität': 'kapazitaet',
  'kapazitaet': 'kapazitaet',
  'capacity': 'kapazitaet',
  'energiegehalt': 'energiegehalt',
  'energy': 'energiegehalt',
  'wh': 'energiegehalt',
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
};

export function stripHtmlTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .trim();
}

export function parseDescription(description: string): ParseResult {
  if (!description || description.trim().length === 0) {
    return { success: false, error: 'Leere Beschreibung' };
  }

  const cleanText = stripHtmlTags(description);
  const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const rawFields: Record<string, string> = {};
  const parsed: Partial<ParsedProduct> = { rawFields };

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();

    if (!value) continue;

    rawFields[key] = value;

    const mappedKey = FIELD_MAPPINGS[key];
    if (mappedKey && mappedKey !== 'rawFields') {
      (parsed as any)[mappedKey] = value;
    }
  }

  const requiredFields: (keyof ParsedProduct)[] = ['type', 'spannung', 'kapazitaet', 'gewicht', 'kompatibilitaet'];
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (!parsed[field]) {
      missingFields.push(field);
    }
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

  if (!hasLaengeBreiteHoehe && !hasLaengeDurchmesser) {
    if (!parsed.laenge) missingFields.push('laenge');
    if (!parsed.durchmesser && !parsed.breite) missingFields.push('breite oder durchmesser');
  }

  if (missingFields.length > 0) {
    return { 
      success: false, 
      error: `Pflichtfelder fehlen: ${missingFields.join(', ')}`,
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
