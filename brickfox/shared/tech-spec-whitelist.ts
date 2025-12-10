/**
 * Whitelist für erlaubte technische Datenfelder
 * Nur diese Felder dürfen in der technischen Tabelle erscheinen
 */

export interface TechSpecField {
  key: string;
  label: string;
  unit?: string;
  aliases: string[];
}

export const TECH_SPEC_WHITELIST: TechSpecField[] = [
  {
    key: 'modell',
    label: 'Modell',
    aliases: ['model', 'modellnummer', 'modell-nr', 'artikelmodell']
  },
  {
    key: 'typ',
    label: 'Typ / Bauform',
    aliases: ['type', 'bauform', 'produkttyp', 'zellentyp', 'batterietyp']
  },
  {
    key: 'led',
    label: 'LED',
    aliases: ['led-typ', 'leuchtmittel', 'lichtquelle', 'led1', 'led2']
  },
  {
    key: 'spannung',
    label: 'Spannung',
    unit: 'V',
    aliases: ['voltage', 'volt', 'nennspannung', 'v nominal', 'betriebsspannung']
  },
  {
    key: 'kapazitaet',
    label: 'Kapazität',
    unit: 'mAh',
    aliases: ['capacity', 'akkukapazität', 'batteriekapazität', 'v kapazität', 'nennkapazität']
  },
  {
    key: 'lichtleistung',
    label: 'Lichtleistung',
    unit: 'Lumen',
    aliases: ['lumen', 'lichtstrom', 'max. lumen', 'helligkeit', 'maxluminosity']
  },
  {
    key: 'reichweite',
    label: 'Reichweite',
    unit: 'm',
    aliases: ['range', 'leuchtweite', 'max. reichweite', 'strahlreichweite']
  },
  {
    key: 'lichtstaerke',
    label: 'Lichtstärke',
    unit: 'cd',
    aliases: ['candela', 'intensity', 'max. lichtstärke']
  },
  {
    key: 'leuchtmodi',
    label: 'Leuchtmodi',
    aliases: ['modes', 'modi', 'betriebsmodi', 'lichtmodi', 'helligkeitsstufen']
  },
  {
    key: 'akkutyp',
    label: 'Akkutyp',
    aliases: ['battery type', 'zellenchemie', 'chemie', 'v chemie/system', 'batteriesystem']
  },
  {
    key: 'ladeschnittstelle',
    label: 'Ladeschnittstelle',
    aliases: ['charging', 'ladeanschluss', 'usb', 'usb-c', 'micro-usb', 'ladeport']
  },
  {
    key: 'wasserschutz',
    label: 'Wasserschutz',
    aliases: ['ip', 'ip-schutz', 'schutzart', 'ip-rating', 'wasserdicht', 'ipx']
  },
  {
    key: 'stossfestigkeit',
    label: 'Stoßfestigkeit',
    unit: 'm',
    aliases: ['impact resistance', 'fallhöhe', 'sturzfest', 'schlagfest']
  },
  {
    key: 'durchmesser',
    label: 'Durchmesser',
    unit: 'mm',
    aliases: ['diameter', 'kopfdurchmesser', 'ø', 'v durchmesser / dicke']
  },
  {
    key: 'laenge',
    label: 'Länge',
    unit: 'mm',
    aliases: ['length', 'höhe', 'v length', 'v height', 'gesamtlänge']
  },
  {
    key: 'breite',
    label: 'Breite',
    unit: 'mm',
    aliases: ['width', 'v width']
  },
  {
    key: 'gewicht',
    label: 'Gewicht',
    unit: 'g',
    aliases: ['weight', 'v weight', 'masse', 'produktgewicht']
  },
  {
    key: 'farbe',
    label: 'Farbe',
    aliases: ['color', 'colour', 'v farbe', 'gehäusefarbe']
  },
  {
    key: 'material',
    label: 'Material',
    aliases: ['v material', 'gehäusematerial', 'werkstoff']
  },
  {
    key: 'kabellaenge',
    label: 'Kabellänge',
    unit: 'm',
    aliases: ['cable length', 'v kabellänge', 'leitungslänge']
  },
  {
    key: 'anschluss',
    label: 'Anschluss',
    aliases: ['connector', 'stecker', 'v anschluss', 'v stecker']
  },
  {
    key: 'ladeleistung',
    label: 'Max. Ladeleistung',
    unit: 'W',
    aliases: ['charging power', 'v max. ladeleistung', 'ladepower']
  },
  {
    key: 'ladezeit',
    label: 'Ladezeit',
    unit: 'h',
    aliases: ['charging time', 'v ladezeit', 'vollladung']
  },
  {
    key: 'betriebstemperatur',
    label: 'Betriebstemperatur',
    unit: '°C',
    aliases: ['operating temperature', 'v betriebstemperatur', 'arbeitstemperatur']
  },
  {
    key: 'zertifizierung',
    label: 'Zertifizierung',
    aliases: ['certification', 'v zertifizierung', 'ce', 'rohs']
  },
  {
    key: 'apn',
    label: 'APN',
    aliases: ['apple part number', 'apple-partnummer', 'partnummer', 'part number', 'teilenummer']
  }
];

/**
 * Prüft ob ein Feldname in der Whitelist enthalten ist
 * Unterstützt auch Labels mit Einheiten wie "Spannung (V)" oder "Kapazität (mAh)"
 */
export function isWhitelistedField(fieldName: string): TechSpecField | null {
  const normalized = fieldName.toLowerCase().trim();
  
  const withoutUnit = normalized.replace(/\s*\([^)]*\)\s*$/g, '').trim();
  
  for (const field of TECH_SPEC_WHITELIST) {
    const fieldLabelNormalized = field.label.toLowerCase();
    const fieldLabelWithoutUnit = fieldLabelNormalized.replace(/\s*\([^)]*\)\s*$/g, '').trim();
    
    if (field.key === normalized || 
        field.key === withoutUnit ||
        fieldLabelNormalized === normalized || 
        fieldLabelNormalized === withoutUnit ||
        fieldLabelWithoutUnit === normalized ||
        fieldLabelWithoutUnit === withoutUnit) {
      return field;
    }
    
    for (const alias of field.aliases) {
      const aliasNormalized = alias.toLowerCase();
      if (aliasNormalized === normalized || 
          aliasNormalized === withoutUnit ||
          normalized.includes(aliasNormalized) ||
          withoutUnit.includes(aliasNormalized)) {
        return field;
      }
    }
  }
  
  return null;
}

/**
 * Gibt das korrekte deutsche Label für ein Feld zurück
 */
export function getGermanLabel(fieldName: string): string | null {
  const field = isWhitelistedField(fieldName);
  return field ? field.label : null;
}

/**
 * Filtert technische Daten auf Whitelist-Felder
 */
export function filterToWhitelist(specs: Record<string, string>): Array<{label: string, value: string, unit?: string}> {
  const result: Array<{label: string, value: string, unit?: string}> = [];
  
  for (const [key, value] of Object.entries(specs)) {
    if (!value || value.trim() === '' || value === '-' || value === 'n/a') {
      continue;
    }
    
    const field = isWhitelistedField(key);
    if (field) {
      let formattedValue = value.trim();
      
      if (field.unit && !formattedValue.includes(field.unit)) {
        formattedValue = `${formattedValue} ${field.unit}`;
      }
      
      result.push({
        label: field.label,
        value: formattedValue,
        unit: field.unit
      });
    }
  }
  
  return result;
}
