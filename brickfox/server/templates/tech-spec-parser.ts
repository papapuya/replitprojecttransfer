/**
 * Parst technische Daten 1:1 aus extrahiertem Text
 * KEINE AI-Interpretation - nur direktes Mapping
 */

import { ProductCategoryConfig } from './category-config';

// Alternative Bezeichnungen für gängige Batterietypen
const BATTERY_ALTERNATIVES: Record<string, string[]> = {
  'CR2032': ['DL2032', 'ECR2032', 'EA-2032C', 'BR2032', 'KCR2032', 'L14'],
  'CR2025': ['DL2025', 'ECR2025', 'BR2025', 'KCR2025'],
  'CR2016': ['DL2016', 'ECR2016', 'BR2016', 'KCR2016'],
  'CR1632': ['DL1632', 'ECR1632', 'BR1632', 'KCR1632'],
  'CR1620': ['DL1620', 'ECR1620', 'BR1620'],
  'CR1616': ['DL1616', 'ECR1616', 'BR1616'],
  'CR1220': ['DL1220', 'ECR1220', 'BR1220'],
  'CR123A': ['DL123A', 'EL123A', 'K123LA', 'CR17345'],
  'CR2': ['DL-CR2', 'DLCR2', 'EL1CR2', 'KCR2'],
  'LR44': ['A76', 'AG13', 'G13', 'PX76A', 'V13GA', 'L1154'],
  'SR44': ['357', '303', 'V357', 'SR44W', 'SR44SW'],
  'LR41': ['AG3', 'G3', 'LR736', 'V384'],
  'LR43': ['AG12', 'G12', 'V12GA', '186'],
  'LR1130': ['AG10', 'G10', 'LR54', '189'],
  '9V': ['6LR61', '6F22', 'PP3', 'MN1604'],
  'AA': ['LR6', 'MN1500', 'Mignon', 'AM3'],
  'AAA': ['LR03', 'MN2400', 'Micro', 'AM4'],
  'C': ['LR14', 'MN1400', 'Baby', 'AM2'],
  'D': ['LR20', 'MN1300', 'Mono', 'AM1'],
};

/**
 * Extrahiert Batterietyp und alternative Bezeichnungen aus dem Produktnamen
 */
function extractBatteryTypeInfo(productName: string): { type: string; alternatives: string[] } | null {
  const nameUpper = productName.toUpperCase();
  
  for (const [type, alts] of Object.entries(BATTERY_ALTERNATIVES)) {
    // Prüfe ob der Batterietyp im Namen vorkommt
    if (nameUpper.includes(type)) {
      return { type, alternatives: alts };
    }
  }
  
  return null;
}

/**
 * Prüft ob ein Produkt eine Batterie/Knopfzelle ist (keine wiederaufladbaren Akkus)
 */
function isBattery(productName: string): boolean {
  const nameLower = productName.toLowerCase();
  
  // Batterien/Knopfzellen - NICHT wiederaufladbar
  const batteryPatterns = [
    /\bcr\d{4}\b/i,           // CR2032, CR2025, etc.
    /\bcr123a?\b/i,           // CR123, CR123A
    /\bcr2\b/i,               // CR2
    /\blr\d+\b/i,             // LR44, LR41, etc.
    /\bsr\d+\b/i,             // SR44, SR626, etc.
    /\bag\d+\b/i,             // AG13, AG10, etc.
    /\bknopfzelle\b/i,        // Knopfzelle
    /\blithium.?batter/i,     // Lithium-Batterie
    /\balkaline\b/i,          // Alkaline
    /\bmignon\b/i,            // Mignon (AA)
    /\bmicro\b/i,             // Micro (AAA)
  ];
  
  // Ausschluss: Wiederaufladbare Akkus
  const isRechargeable = /\b(akku|akkupack|wiederaufladbar|rechargeable|li-ion|li-polymer|nimh|nicd)\b/i.test(nameLower);
  
  if (isRechargeable) return false;
  
  return batteryPatterns.some(pattern => pattern.test(nameLower));
}

/**
 * Konvertiert Maße in mm (von cm oder m)
 * KONSERVATIV: Nur explizite einfache Werte konvertieren, alles andere unverändert lassen
 * Behält volle Dezimalpräzision bei
 */
function convertToMm(value: string): string {
  const trimmed = value.trim();
  
  // Bereits mm oder keine Einheit erkennbar - unverändert lassen
  if (/\bmm\b/i.test(trimmed)) {
    return trimmed;
  }
  
  // Nur einfache "Zahl cm" oder "Zahl m" Muster konvertieren
  // Alles andere (Bereiche, Toleranzen, Qualifizierer, unitlose Werte) bleibt unverändert
  
  // Pattern: "5 cm" oder "5,5 cm" oder "5.5cm" - exakt nur Zahl + cm
  const cmMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*cm$/i);
  if (cmMatch) {
    const numVal = parseFloat(cmMatch[1].replace(',', '.')) * 10;
    return `${numVal} mm`;
  }
  
  // Pattern: "0.5 m" oder "1,5 m" - exakt nur Zahl + m
  const mMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*m$/i);
  if (mMatch) {
    const numVal = parseFloat(mMatch[1].replace(',', '.')) * 1000;
    return `${numVal} mm`;
  }
  
  // Alle anderen Fälle unverändert lassen (Bereiche, Toleranzen, Qualifizierer, unitlose Werte)
  return trimmed;
}

/**
 * Prüft ob eine Farbe auf DEUTSCH angegeben ist
 * REGEL: Nur deutsche Farben übernehmen - englische Farben wie "Black" gehören oft zu Modellnamen (z.B. "Hero7 Black")
 * Gibt die normalisierte deutsche Farbe zurück oder null wenn keine gültige deutsche Farbe
 */
function getGermanColorOnly(color: string): string | null {
  // NUR deutsche Farben sind gültig
  const germanColors: Record<string, string> = {
    'schwarz': 'Schwarz',
    'weiß': 'Weiß',
    'weiss': 'Weiß',
    'rot': 'Rot',
    'blau': 'Blau',
    'grün': 'Grün',
    'gruen': 'Grün',
    'gelb': 'Gelb',
    'orange': 'Orange',
    'lila': 'Lila',
    'violett': 'Violett',
    'rosa': 'Rosa',
    'pink': 'Pink',
    'grau': 'Grau',
    'silber': 'Silber',
    'gold': 'Gold',
    'bronze': 'Bronze',
    'braun': 'Braun',
    'beige': 'Beige',
    'türkis': 'Türkis',
    'tuerkis': 'Türkis',
    'cyan': 'Cyan',
    'magenta': 'Magenta',
    'dunkelblau': 'Dunkelblau',
    'hellblau': 'Hellblau',
    'oliv': 'Oliv',
    'transparent': 'Transparent',
  };
  
  const lowerColor = color.trim().toLowerCase();
  if (germanColors[lowerColor]) {
    console.log(`🎨 Deutsche Farbe erkannt: ${color} → ${germanColors[lowerColor]}`);
    return germanColors[lowerColor];
  }
  
  // Englische Farben wie "black", "white" werden IGNORIERT - gehören oft zu Modellnamen
  console.log(`⏭️ Farbe ignoriert (nicht deutsch): ${color}`);
  return null;
}

export interface ParsedTechSpecs {
  specs: Record<string, string>;
  source: 'vision_text' | 'structured_data' | 'none';
}

/**
 * Extrahiert Tech Specs 1:1 aus Vision-extrahiertem Text
 * DYNAMISCH: Extrahiert ALLE "Feld: Wert" Paare, nicht nur vordefinierte
 */
export function parseTechSpecsFromText(
  extractedText: string,
  categoryConfig: ProductCategoryConfig
): ParsedTechSpecs {
  const specs: Record<string, string> = {};
  
  // Pattern für Tech Spec Zeilen: "- Feldname: Wert" oder "Feldname: Wert"
  const lines = extractedText.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Skip JSON objects (lines starting with { or containing JSON-like structure)
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      console.log(`⏭️ Skipping JSON line: ${trimmed.substring(0, 50)}...`);
      continue;
    }
    
    // Pattern: "- Kapazität: 3800mAh" oder "Kapazität: 3800mAh"
    const match = trimmed.match(/^-?\s*\*?\*?\s*([^:]+):\s*(.+)$/);
    if (!match) continue;
    
    let fieldName = match[1].trim();
    const value = match[2].trim();
    
    // Skip invalide Werte
    if (!isValidValue(value)) continue;
    
    // Bereinige Feldnamen (entferne **, etc.)
    fieldName = fieldName.replace(/\*\*/g, '').trim();
    
    // Mappe auf bekannte Kategorie-Felder (für konsistente Labels)
    let mappedFieldName = fieldName;
    for (const field of categoryConfig.technicalFields) {
      const normalizedFieldName = normalizeFieldName(fieldName);
      const normalizedLabel = normalizeFieldName(field.label);
      const normalizedKey = normalizeFieldName(field.key);
      
      if (normalizedFieldName === normalizedLabel || normalizedFieldName === normalizedKey) {
        mappedFieldName = field.label; // Nutze konsistenten Label
        break;
      }
    }
    
    // SPEZIAL: Vereinfache Schutzschaltung (entferne redundante "Schutz"-Wörter)
    let cleanedValue = value;
    if (mappedFieldName === 'Schutzschaltung' || normalizeFieldName(fieldName).includes('schutz')) {
      // "PCB/BMS Schutz, Überlade- und Entladeschutz, Kurzschlussschutz" → "PCB/BMS"
      cleanedValue = value.split(',')[0].replace(/schutz$/i, '').trim();
    }
    
    // Speichere ALLE Specs (auch unbekannte)
    specs[mappedFieldName] = cleanedValue;
    console.log(`✅ 1:1 Text-Parse: ${mappedFieldName} = ${cleanedValue}`);
  }
  
  // SPEZIAL: Extrahiere APN-Nummern aus dem gesamten Text
  const apnMatch = extractedText.match(/APN[:\s]+([0-9\-,\s]+)/i);
  if (apnMatch) {
    const apnValue = apnMatch[1].trim().replace(/\s+/g, ' ');
    if (apnValue && apnValue.length > 0) {
      specs['APN'] = apnValue;
      console.log(`✅ APN extrahiert: ${apnValue}`);
    }
  }
  
  // Alternative APN-Patterns (z.B. "entspricht APN 616-0579, 616-0580")
  if (!specs['APN']) {
    const altApnMatch = extractedText.match(/entspricht\s+APN\s+([0-9\-,\s]+)/i);
    if (altApnMatch) {
      const apnValue = altApnMatch[1].trim().replace(/\s+/g, ' ');
      if (apnValue && apnValue.length > 0) {
        specs['APN'] = apnValue;
        console.log(`✅ APN extrahiert (alt): ${apnValue}`);
      }
    }
  }
  
  return {
    specs,
    source: Object.keys(specs).length > 0 ? 'vision_text' : 'none',
  };
}

/**
 * Filtert CSV-Metadaten aus, die nicht in technische Tabelle gehören
 */
function isCSVMetadataField(fieldName: string): boolean {
  // Ignoriere BrickFox/CSV interne METADATEN-Felder (aber NICHT "P Name[de]" = Produktname!)
  const metadataFields = [
    /^P\s+Id$/i,                   // P Id
    /^P\s+Extern\s+Id$/i,          // P Extern Id
    /^P\s+Item\s+Number$/i,        // P Item Number
    /^P\s+Group\s+Path/i,          // P Group Path[de]
    /^P\s+Attributes/i,            // P Attributes[akku V][de]
    /^P\s+Namefeld$/i,             // P Namefeld
    /^V\s+Weight$/i,               // V Weight (Versandgewicht)
    /^V\s+Height$/i,               // V Height (wenn nicht echte Abmessungen)
    /^V\s+Width$/i,                // V Width
    /^V\s+Length$/i,               // V Length
  ];
  
  return metadataFields.some(pattern => pattern.test(fieldName));
}

/**
 * Extrahiert Tech Specs aus strukturierten Daten (falls vorhanden)
 */
export function extractTechSpecsFromStructured(
  structuredData: any,
  categoryConfig: ProductCategoryConfig
): ParsedTechSpecs {
  if (!structuredData) {
    return { specs: {}, source: 'none' };
  }
  
  const specs: Record<string, string> = {};
  
  // Prüfe auf verschiedene mögliche Strukturen
  const sources = [
    structuredData.technicalData,
    structuredData.technicalSpecs,
    structuredData.specs,
    structuredData.technischeDaten,
    structuredData, // WICHTIG: Auch direkt im Hauptobjekt suchen (für CSV-Daten)
  ].filter(Boolean);
  
  for (const source of sources) {
    for (const field of categoryConfig.technicalFields) {
      // Suche nach verschiedenen Varianten des Feldnamens
      const possibleKeys = [
        field.key,
        field.label,
        field.key.toLowerCase(),
        field.label.toLowerCase(),
        // CSV-spezifische Varianten
        field.key.replace(/_/g, ''),
        field.key.replace(/_/g, ' '),
      ];
      
      let value = null;
      for (const key of possibleKeys) {
        // WICHTIG: Filtere CSV-Metadaten (P Id, P Extern Id, V Weight, etc.)
        if (isCSVMetadataField(key) || isCSVMetadataField(field.label)) {
          continue;
        }
        
        if (source[key] && isValidValue(source[key])) {
          value = source[key];
          break;
        }
      }
      
      if (value) {
        // SPEZIAL: Vereinfache Schutzschaltung
        let cleanedValue = value;
        if (field.key === 'protection' || field.label === 'Schutzschaltung') {
          cleanedValue = value.split(',')[0].replace(/schutz$/i, '').trim();
        }
        
        specs[field.label] = cleanedValue;
        console.log(`✅ 1:1 Strukturierte Daten: ${field.label} = ${cleanedValue}`);
      }
    }
  }
  
  // DYNAMISCH: Extrahiere ALLE übrigen Felder (auch wenn nicht in categoryConfig)
  // Dies ermöglicht dynamische Tabellen mit 18+ Specs
  const processedKeys = new Set();
  
  // Sammle alle bereits verarbeiteten Feldnamen (normalisiert)
  for (const specKey of Object.keys(specs)) {
    processedKeys.add(normalizeFieldName(specKey));
  }
  
  // Sammle auch alle Quell-Keys die bereits verarbeitet wurden
  for (const field of categoryConfig.technicalFields) {
    processedKeys.add(normalizeFieldName(field.key));
    processedKeys.add(normalizeFieldName(field.label));
  }
  
  for (const key of Object.keys(structuredData)) {
    const value = structuredData[key];
    
    // Skip bereits verarbeitete Felder (normalisiert vergleichen)
    const normalizedKeyField = normalizeFieldName(key);
    if (processedKeys.has(normalizedKeyField)) {
      console.log(`⏭️ Skipping ${key} (already processed as ${normalizedKeyField})`);
      continue;
    }
    
    // Skip Meta-Felder und Business-Daten (nur echte technische Spezifikationen erlauben)
    const metaFields = [
      'productname', 'produktname', 'bezeichnung', 'name',
      'seoname', 'description', 'beschreibung', 'beschreibunglieferant',
      'hersteller', 'manufacturer', 'brand', 'marke',
      'artikelnummer', 'sku', 'modellnummer',
      'kategorie', 'category',
      'ean', 'gtin', 'barcode',
      'preis', 'price', 'uvp', 'cost',
      'lieferant', 'supplier', 'vendor',
      'lagerbestand', 'stock', 'availability',
      'bild', 'image', 'foto', 'picture',
      'url', 'link', 'website',
      'extractedtext', 'extracteddata', // Rohdaten von Vision/OCR - nicht als Tech Spec anzeigen
    ];
    
    // Normalisiere Feldname: entferne Leerzeichen, Sonderzeichen, Unterstriche
    const normalizedMetaKey = key.toLowerCase().replace(/[\s()€_-]/g, '');
    
    // Check exakte Übereinstimmung
    if (metaFields.includes(normalizedMetaKey)) {
      console.log(`⏭️ Skipping ${key} (meta/business field, normalized: ${normalizedMetaKey})`);
      continue;
    }
    
    // Check Teilstrings: "beschreibung" in beliebigem Kontext blockieren
    if (normalizedMetaKey.includes('beschreibung') || 
        normalizedMetaKey.includes('description') ||
        normalizedMetaKey.includes('lieferant') ||
        normalizedMetaKey.includes('supplier')) {
      console.log(`⏭️ Skipping ${key} (contains description/supplier keyword)`);
      continue;
    }
    
    // Nur gültige Werte
    if (!isValidValue(value)) {
      console.log(`⏭️ Skipping ${key} (invalid value: ${value})`);
      continue;
    }
    
    // Formatiere Feldnamen (z.B. "capacity_mah" → "Kapazität Mah", "Länge mm" → "Länge Mm")
    const formattedKey = formatFieldName(key);
    specs[formattedKey] = value;
    processedKeys.add(normalizedKeyField);
    console.log(`✅ 1:1 Dynamisches Feld: ${formattedKey} = ${value}`);
  }
  
  return {
    specs,
    source: Object.keys(specs).length > 0 ? 'structured_data' : 'none',
  };
}

/**
 * Normalisiert und bereinigt Kompatibilitäts-Modelle nach spezifischen Regeln:
 * 1. Hersteller normalisieren: COMPAQ, HEWLETT-PACKARD → HP
 * 2. Produktfamilien vereinheitlichen: SMART ARRAY → HP Smart Array, ProLiant → HP ProLiant
 * 3. Modelle bereinigen: CPU-Takte, Speicherangaben, IDs entfernen
 * 4. Duplikate zusammenführen
 * 5. Ausschlüsse: HP Smart Array 5302, 5304 → "Nicht kompatibel mit"
 */
function normalizeCompatibilityModels(rawModels: string[]): { compatible: string[]; incompatible: string[] } {
  const compatible: string[] = [];
  const incompatible: string[] = [];
  
  // Feste Ausschlüsse (NIEMALS als kompatibel)
  const exclusionPatterns = [
    /\b5302\b/i,
    /\b5304\b/i,
  ];
  
  for (const rawModel of rawModels) {
    let model = rawModel.trim();
    if (!model || model.length < 3) continue;
    
    // ═══════════════════════════════════════════════════════════════
    // TYPENCODES FILTERN: Modelle die mit "-" beginnen sind Typencodes/Artikelnummern
    // z.B. "-SFB150", "-9000", "-7000", "-4932353638" → RAUS!
    // ═══════════════════════════════════════════════════════════════
    if (model.startsWith('-')) {
      console.log(`🚫 [NORM] Typencode gefiltert: "${model}"`);
      continue;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // NUR-ZAHLEN FILTERN: Reine Zahlenwerte sind keine echten Modellnamen
    // z.B. "190100", "190130" → RAUS!
    // ABER: "SF 151-A", "6093DW" bleiben (haben Buchstaben)
    // ═══════════════════════════════════════════════════════════════
    if (/^\d+$/.test(model)) {
      console.log(`🚫 [NORM] Nur-Zahlen gefiltert: "${model}"`);
      continue;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // SCHRITT 1: Hersteller normalisieren → HP
    // ═══════════════════════════════════════════════════════════════
    model = model.replace(/^COMPAQ\s+/i, 'HP ');
    model = model.replace(/^HEWLETT[\s-]*PACKARD\s+/i, 'HP ');
    model = model.replace(/^HP\s+HP\s+/i, 'HP '); // Doppelte HP entfernen
    
    // ═══════════════════════════════════════════════════════════════
    // SCHRITT 2: Produktfamilien vereinheitlichen
    // ═══════════════════════════════════════════════════════════════
    // SMART ARRAY ohne HP-Prefix → HP Smart Array
    if (/^SMART\s+ARRAY/i.test(model)) {
      model = model.replace(/^SMART\s+ARRAY/i, 'HP Smart Array');
    }
    // HP SMART ARRAY → HP Smart Array (Konsistente Groß-/Kleinschreibung)
    model = model.replace(/HP\s+SMART\s+ARRAY/gi, 'HP Smart Array');
    
    // ProLiant → HP ProLiant
    if (/^ProLiant/i.test(model)) {
      model = 'HP ' + model;
    }
    model = model.replace(/HP\s+PROLIANT/gi, 'HP ProLiant');
    model = model.replace(/HP\s+Proliant/gi, 'HP ProLiant');
    
    // StorageWorks / MSA → HP StorageWorks MSA
    // Bare "MSA 2040" → "HP StorageWorks MSA 2040"
    if (/^MSA\s/i.test(model)) {
      model = 'HP StorageWorks ' + model;
    }
    // "StorageWorks MSA 2040" → "HP StorageWorks MSA 2040"
    if (/^StorageWorks/i.test(model)) {
      model = 'HP ' + model;
    }
    // Normalize case: HP STORAGEWORKS → HP StorageWorks
    model = model.replace(/HP\s+STORAGEWORKS/gi, 'HP StorageWorks');
    // Fix double prefix: HP StorageWorks StorageWorks → HP StorageWorks
    model = model.replace(/HP\s+StorageWorks\s+StorageWorks/gi, 'HP StorageWorks');
    
    // ═══════════════════════════════════════════════════════════════
    // SCHRITT 3: Modelle bereinigen - Unwichtige Details entfernen
    // ═══════════════════════════════════════════════════════════════
    // CPU-Takte entfernen (1.3GHz, 1.5Ghz, 2.0 GHz)
    model = model.replace(/\s*\d+[.,]?\d*\s*GHz/gi, '');
    // Speicherangaben entfernen (2GB, 4GB, 8GB, 512MB)
    model = model.replace(/\s*\d+\s*(GB|MB|TB)/gi, '');
    // Seriennummern/Bundle-Namen entfernen (oft in Klammern)
    model = model.replace(/\s*\([^)]*\)/g, '');
    // Interne IDs entfernen (z.B. "G1", "G2", "Gen8", etc. am Ende NICHT entfernen - wichtig!)
    // Nur lange alphanumerische IDs am Ende entfernen
    model = model.replace(/\s+[A-Z]{2,}\d{5,}$/i, '');
    // Mehrfache Leerzeichen zu einem
    model = model.replace(/\s+/g, ' ').trim();
    
    if (!model || model.length < 5) continue;
    
    // ═══════════════════════════════════════════════════════════════
    // SCHRITT 5: Prüfe auf Ausschlüsse
    // ═══════════════════════════════════════════════════════════════
    const isExcluded = exclusionPatterns.some(pattern => pattern.test(model));
    
    if (isExcluded) {
      incompatible.push(model);
    } else {
      compatible.push(model);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SCHRITT 4: Duplikate entfernen und sortieren
  // ═══════════════════════════════════════════════════════════════
  const uniqueCompatible = Array.from(new Set(compatible));
  const uniqueIncompatible = Array.from(new Set(incompatible));
  
  // ═══════════════════════════════════════════════════════════════
  // SCHRITT 6: Intelligente Gruppierung nach Produktfamilie
  // "HP ProLiant ML350, HP ProLiant ML370" → "HP ProLiant ML350, ML370"
  // ═══════════════════════════════════════════════════════════════
  const groupedCompatible = groupByProductFamily(uniqueCompatible);
  const groupedIncompatible = groupByProductFamily(uniqueIncompatible);
  
  console.log(`🔧 Normalisierung: ${rawModels.length} → ${groupedCompatible.length} kompatibel, ${groupedIncompatible.length} Ausschlüsse`);
  
  return { compatible: groupedCompatible, incompatible: groupedIncompatible };
}

/**
 * Gruppiert Modelle nach Marke+Serie für kompaktere Ausgabe
 * "DELL: XPS: M1720, DELL: XPS: M1730" → "DELL XPS: M1720, M1730"
 * "HP ProLiant ML350, HP ProLiant ML370" → "HP ProLiant ML350, ML370"
 */
function groupByProductFamily(models: string[]): string[] {
  if (models.length === 0) return [];
  
  // Gruppiere nach Serie (dynamisch erkannt)
  const groups: Map<string, string[]> = new Map();
  
  for (const model of models) {
    // Pattern 1: "SERIE: MODELL" (z.B. "SF: 150-A", "DA: 390DW", "ML: 700")
    // Nur kurze Serien-Präfixe (2-4 Buchstaben) mit Doppelpunkt
    const seriesColonMatch = model.match(/^([A-Z]{2,4}):\s*(.+)$/i);
    if (seriesColonMatch) {
      const series = seriesColonMatch[1].trim().toUpperCase();
      const modelNum = seriesColonMatch[2].trim();
      
      if (!groups.has(series)) {
        groups.set(series, []);
      }
      groups.get(series)!.push(modelNum);
      continue;
    }
    
    // Pattern 2: "MARKE SERIE MODELL" (z.B. "HP ProLiant ML350")
    const knownSeries = ['ProLiant', 'Smart Array', 'StorageWorks', 'MSA', 'NAS', 'PAVILION', 'PRESARIO', 'XPS', 'Latitude', 'Inspiron', 'ThinkPad', 'ThinkCentre'];
    let matched = false;
    
    for (const series of knownSeries) {
      const seriesPattern = new RegExp(`^([A-Z][A-Z\\-\\s]*?)\\s+(${series})\\s+(.+)$`, 'i');
      const seriesMatch = model.match(seriesPattern);
      if (seriesMatch) {
        const brand = seriesMatch[1].trim();
        const seriesName = seriesMatch[2].trim();
        const modelNum = seriesMatch[3].trim();
        const familyKey = `${brand} ${seriesName}`;
        
        if (!groups.has(familyKey)) {
          groups.set(familyKey, []);
        }
        groups.get(familyKey)!.push(modelNum);
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      // Kein Pattern erkannt - als eigenständiges Modell behalten
      if (!groups.has('_ungrouped_')) {
        groups.set('_ungrouped_', []);
      }
      groups.get('_ungrouped_')!.push(model);
    }
  }
  
  // Baue gruppierte Ausgabe
  const result: string[] = [];
  
  groups.forEach((modelNumbers: string[], family: string) => {
    if (family === '_ungrouped_') return; // Später hinzufügen
    
    // Sortiere und dedupliziere Modellnummern
    const uniqueModels = Array.from(new Set(modelNumbers));
    uniqueModels.sort((a: string, b: string) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
    
    // Format: "SF: 150-A, 151-A" oder "HP ProLiant: ML350, ML370"
    result.push(`${family}: ${uniqueModels.join(', ')}`);
  });
  
  // Füge nicht-gruppierte Modelle hinzu
  const ungrouped = groups.get('_ungrouped_') || [];
  if (ungrouped.length > 0) {
    const uniqueUngrouped = Array.from(new Set(ungrouped));
    uniqueUngrouped.sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
    result.push(...uniqueUngrouped);
  }
  
  // Sortiere Ergebnis
  result.sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
  
  return result;
}

/**
 * Extrahiert BrickFox-spezifische Attribute aus CSV-Daten
 * z.B. p_attributes[akku_v][de] -> Spannung, p_attributes[akku_mah][de] -> Kapazität
 * Erweitert um: Maße, Gewicht, Farbe und alle technischen Daten
 */
function extractBrickfoxAttributes(structuredData: any): Record<string, string> {
  const specs: Record<string, string> = {};
  
  if (!structuredData) return specs;
  
  // ═══════════════════════════════════════════════════════════════
  // MODELLE EXTRAKTION: "wie ABPAK-001, AHDBT-001" aus Produktnamen
  // ═══════════════════════════════════════════════════════════════
  const productNameFields = ['p_name[de]', 'produktname', 'productname', 'name', 'bezeichnung'];
  for (const field of productNameFields) {
    const productName = structuredData[field];
    if (productName && typeof productName === 'string') {
      // Pattern: "wie ABPAK-001, AHDBT-001, AHDBT-002"
      // Erfasst alphanumerische Modellcodes mit Bindestrichen
      // Stoppt vor Einheiten wie Li-Ion, Li-Polymer, V, mAh, Wh
      const wieMatch = productName.match(/,?\s*wie[:\s]+([A-Z0-9][A-Z0-9\-]+(?:,\s*[A-Z0-9][A-Z0-9\-]+)*)/i);
      if (wieMatch) {
        let modelle = wieMatch[1].trim();
        // Entferne nachfolgende Einheiten/Chemie-Angaben die versehentlich erfasst wurden
        modelle = modelle.replace(/,?\s*(Li-Ion|Li-Polymer|Li-Po|NiMH|NiCd|Lithium|Alkaline)\b.*/i, '');
        modelle = modelle.replace(/,?\s*\d+[.,]?\d*\s*(V|mAh|Ah|Wh|W)\b.*/i, '');
        modelle = modelle.trim().replace(/,\s*$/, ''); // Trailing comma entfernen
        
        if (modelle && modelle.length > 2) {
          specs['Modelle'] = modelle;
          break;
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // KOMPATIBILITÄT EXTRAKTION: ALLE Geräte aus Produktbeschreibung
  // Erfasst: "Marke Modell" Zeilen, "Marke: Modell" und Modellcodes
  // Mit Normalisierung: COMPAQ/HEWLETT-PACKARD → HP, Bereinigung, Ausschlüsse
  // ═══════════════════════════════════════════════════════════════
  const descriptionFields = ['p_description[de]', 'beschreibung', 'description', 'produktbeschreibung'];
  for (const field of descriptionFields) {
    const description = structuredData[field];
    if (description && typeof description === 'string' && description.length > 10) {
      const allModels: string[] = [];
      
      // Normalisiere: HTML-Tags in Zeilenumbrüche umwandeln (ERWEITERT)
      let normalized = description;
      // Alle <br> Varianten, <li>, <p>, <div> werden zu Zeilenumbrüchen
      normalized = normalized.replace(/<br\s*\/?>/gi, '\n');
      normalized = normalized.replace(/<\/?(li|p|div|tr)[^>]*>/gi, '\n');
      // Alle anderen HTML-Tags entfernen
      normalized = normalized.replace(/<[^>]+>/g, ' ');
      // HTML-Entities dekodieren
      normalized = normalized.replace(/&nbsp;/gi, ' ');
      normalized = normalized.replace(/&amp;/gi, '&');
      // Mehrfache Leerzeichen zu einem
      normalized = normalized.replace(/[ \t]+/g, ' ');
      
      // ═══════════════════════════════════════════════════════════════
      // ACHTUNG-HINWEISE EXTRAKTION: Separate fett unter Kompatibilität
      // z.B. "ACHTUNG: Artikel ist nur passend für iPhone 4 - nicht für iPhone 4S!"
      // ═══════════════════════════════════════════════════════════════
      const achtungHinweise: string[] = [];
      const achtungPattern = /ACHTUNG[:\s]+([^\n]+)/gi;
      let achtungMatch;
      while ((achtungMatch = achtungPattern.exec(normalized)) !== null) {
        const hinweis = achtungMatch[1].trim();
        if (hinweis.length > 5) {
          achtungHinweise.push(hinweis);
          console.log(`⚠️ ACHTUNG-Hinweis gefunden: ${hinweis}`);
        }
      }
      if (achtungHinweise.length > 0) {
        specs['Achtung'] = achtungHinweise.join(' | ');
      }
      
      // ═══════════════════════════════════════════════════════════════
      // KOMPATIBILITÄT 1:1 EXTRAKTION: ALLE Modelle aus Beschreibung übernehmen
      // KEINE Filterung - alles was nach "Kompatibilität" kommt wird übernommen
      // ═══════════════════════════════════════════════════════════════
      
      // Pattern: Finde "Kompatibilität" Überschrift und extrahiere ALLES bis zur nächsten Überschrift
      const compatEndMarkers = [
        'Lieferumfang', 'Weitere Informationen', 'Technische Daten', 
        'Ihre Vorteile', 'Typ:', 'Einsatzbereiche', 'Hinweis'
      ];
      const endMarkersPattern = compatEndMarkers.join('|');
      
      // Breites Pattern das ALLES nach Kompatibilität erfasst
      const compatPatterns = [
        // H2-Tag mit Kompatibilität - alles bis zum nächsten H2 oder bekannten Überschriften
        new RegExp(`<h2[^>]*>\\s*Kompatibilit[äa]t\\s*</h2>\\s*<p[^>]*>([\\s\\S]+?)</p>`, 'i'),
        // Kompatibilität: gefolgt von mehrzeiligem Content
        new RegExp(`Kompatibilit[äa]t[:\\s]+([\\s\\S]+?)(?=(?:${endMarkersPattern})|$)`, 'i'),
        // Fallback: Einzelne Zeile
        /Kompatibilit[äa]t[:\s]+([^\n]+(?:\n[^\n]+)*)/i
      ];
      
      for (const pattern of compatPatterns) {
        const compatMatch = normalized.match(pattern);
        if (compatMatch) {
          let rawCompat = compatMatch[1].trim();
          
          // HTML-Tags entfernen falls noch vorhanden
          rawCompat = rawCompat.replace(/<[^>]+>/g, ' ');
          
          // Bereinige: Zeilenumbrüche zu Kommas, aber behalte ALLE Modelle
          rawCompat = rawCompat
            .replace(/\n+/g, ', ')
            .replace(/\s+/g, ' ')
            .replace(/,\s*,/g, ', ')
            .replace(/,\s*$/, '')
            .trim();
          
          if (rawCompat.length > 10) {
            specs['Kompatibilität'] = rawCompat;
            console.log(`📋 [COMPAT] 1:1 KOMPLETT übernommen: ${rawCompat.length} Zeichen`);
            console.log(`📋 [COMPAT] Inhalt: ${rawCompat.substring(0, 200)}...`);
            break;
          }
        }
      }
      
      // Wenn Kompatibilität bereits 1:1 übernommen wurde, überspringe den Rest
      if (specs['Kompatibilität']) {
        console.log(`✅ [COMPAT] Überspringe weitere Extraktion - 1:1 Daten vorhanden`);
        break;
      }
      
      // FALLBACK: Alte Methode nur wenn keine direkte "Kompatibilität:" gefunden
      const lines = normalized.split(/\r?\n/);
      let inCompatSection = false;
      
      // Produktkategorien die NICHT als Modell gelten (zum Filtern)
      const productCategories = [
        'schutzfolien', 'akkus', 'ladegeräte', 'kabel', 'adapter', 'hüllen', 'cases',
        'taschen', 'zubehör', 'ersatzteile', 'batterien', 'netzteile', 'ladekabel',
        'displayschutz', 'covers', 'bumper', 'powerbanks', 'halterungen'
      ];
      
      console.log(`🔍 [COMPAT] Suche "passend für folgende Modelle" Abschnitt...`);
      
      // 1:1 RAW EXTRAKTION: Alle Zeilen im Kompatibilitäts-Abschnitt sammeln (OHNE Normalisierung!)
      const rawCompatLines: string[] = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length < 3) continue;
        
        // Prüfe auf Abschnitts-Start
        if (/passend\s+f[üu]r\s+folgende\s+Modelle/i.test(trimmed) ||
            /Dieser\s+Artikel\s+ist\s+passend/i.test(trimmed)) {
          inCompatSection = true;
          console.log(`✅ [COMPAT] Abschnitt gefunden: "${trimmed.substring(0, 50)}..."`);
          continue;
        }
        
        // Prüfe auf Abschnitts-Ende (neue Überschrift)
        if (inCompatSection && (
          /^(Weitere\s+Informationen|Lieferumfang|Einsatzbereiche|Technische\s+Daten|Ihre\s+Vorteile)/i.test(trimmed) ||
          trimmed.endsWith(':')
        )) {
          console.log(`🛑 [COMPAT] Abschnitt beendet bei: "${trimmed.substring(0, 30)}..."`);
          break;
        }
        
        // Nur im Kompatibilitäts-Abschnitt parsen
        if (inCompatSection) {
          // Pattern: "Marke: Modell" → extrahiere MARKE + MODELL zusammen (z.B. "Audioline CDL971")
          const colonMatch = trimmed.match(/^([^:]+):\s*(.+)$/);
          if (colonMatch) {
            const marke = colonMatch[1].trim();
            const modell = colonMatch[2].trim();
            
            // Technische Labels ausschließen
            const technicalLabels = ['spannung', 'kapazität', 'typ', 'farbe', 'gewicht', 'chemie', 'voltage', 'capacity', 'lieferumfang', 'hinweis', 'achtung', 'typencode'];
            if (!technicalLabels.includes(marke.toLowerCase()) && modell.length > 1) {
              // MARKE + MODELL zusammen speichern (z.B. "Audioline CDL971 Universal")
              const fullModel = `${marke} ${modell}`;
              allModels.push(fullModel);
              console.log(`   📱 Modell extrahiert: "${fullModel}"`);
            }
            continue;
          }
          
          // Einfache Zeile ohne Doppelpunkte
          if (!trimmed.includes(':') && trimmed.length > 3 && trimmed.length < 80) {
            allModels.push(trimmed);
            console.log(`   📱 Modell direkt: "${trimmed}"`);
          }
        }
      }
      
      console.log(`   🔍 Gefundene Modelle: ${allModels.length}`);
      
      // NORMALISIERUNG aktiviert: Typencodes raus, Duplikate entfernen
      if (allModels.length > 0) {
        const { compatible, incompatible } = normalizeCompatibilityModels(allModels);
        
        if (compatible.length > 0) {
          specs['Kompatibilität'] = compatible.join(', ');
          console.log(`📋 Kompatibilität: ${compatible.length} Modelle (normalisiert)`);
        }
        
        if (incompatible.length > 0) {
          specs['Nicht kompatibel mit'] = incompatible.join(', ');
          console.log(`⛔ Nicht kompatibel: ${incompatible.length} Modelle (Ausschlüsse)`);
        }
        break;
      }
    }
  }
  
  // Durchsuche alle Spalten nach p_attributes Pattern und anderen technischen Feldern
  for (const [key, value] of Object.entries(structuredData)) {
    if (!value || typeof value !== 'string' || value.trim() === '') continue;
    
    const keyLower = key.toLowerCase();
    const valTrimmed = value.trim();
    
    // Spannung: p_attributes[akku_v][de]
    if (keyLower.includes('akku_v') || keyLower.includes('voltage') || keyLower.includes('spannung')) {
      specs['Spannung'] = correctVoltageValue(valTrimmed);
    }
    
    // Kapazität: p_attributes[akku_mah][de] - einfach Zahl + "mAh" anhängen
    if (keyLower.includes('akku_mah')) {
      const numMatch = valTrimmed.match(/^(\d+)/);
      if (numMatch) {
        specs['Kapazität'] = `${numMatch[1]} mAh`;
      }
    }
    
    // Akkutyp/Chemie: p_attributes[akku_ch][de] oder p_attributes[akku_chemie][de]
    if (keyLower.includes('akku_ch') || keyLower.includes('chemie') || keyLower.includes('chemistry') || keyLower.includes('akku_typ')) {
      specs['Akkutyp'] = valTrimmed;
    }
    
    // Energieinhalt (Wh): v_attributes[akku_wh][de]
    if (keyLower.includes('akku_wh') || (keyLower.includes('energie') && keyLower.includes('wh'))) {
      let whVal = valTrimmed;
      if (!/\bwh\b/i.test(whVal)) {
        whVal = `${whVal} Wh`;
      }
      specs['Energieinhalt'] = whVal;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // DYNAMISCHE ERWEITERUNG: Maße, Gewicht, Farbe, technische Daten
    // ═══════════════════════════════════════════════════════════════
    
    // Gewicht - KONSERVATIV: Nur explizite kg-Werte in g umrechnen
    if ((keyLower.includes('gewicht') || keyLower.includes('weight') || keyLower.includes('p_weight')) && !specs['Gewicht']) {
      let gewichtVal = valTrimmed;
      
      // Nur einfache "Zahl kg" Muster konvertieren - alles andere unverändert lassen
      const kgMatch = gewichtVal.match(/^(\d+(?:[.,]\d+)?)\s*(kg|kilogramm)$/i);
      if (kgMatch) {
        const numVal = parseFloat(kgMatch[1].replace(',', '.')) * 1000;
        gewichtVal = `${numVal} g`;
      }
      // Alle anderen Werte (g, gramm, unitlos, Bereiche, Toleranzen) unverändert lassen
      
      specs['Gewicht'] = gewichtVal;
    }
    
    // Länge - IMMER in mm umrechnen
    if ((keyLower.includes('länge') || keyLower.includes('laenge') || keyLower.includes('length') || keyLower.includes('p_length')) && !specs['Länge']) {
      specs['Länge'] = convertToMm(valTrimmed);
    }
    
    // Breite - IMMER in mm umrechnen
    if ((keyLower.includes('breite') || keyLower.includes('width') || keyLower.includes('p_width')) && !specs['Breite']) {
      specs['Breite'] = convertToMm(valTrimmed);
    }
    
    // Höhe / Dicke - IMMER in mm umrechnen
    if ((keyLower.includes('höhe') || keyLower.includes('hoehe') || keyLower.includes('height') || 
         keyLower.includes('dicke') || keyLower.includes('thickness') || keyLower.includes('p_height')) && !specs['Höhe']) {
      specs['Höhe'] = convertToMm(valTrimmed);
    }
    
    // Durchmesser - IMMER in mm umrechnen
    if ((keyLower.includes('durchmesser') || keyLower.includes('diameter') || keyLower.includes('ø')) && !specs['Durchmesser']) {
      specs['Durchmesser'] = convertToMm(valTrimmed);
      console.log(`⭕ BrickFox Durchmesser: ${value} → ${specs['Durchmesser']}`);
    }
    
    // Farbe - NUR wenn auf Deutsch angegeben (englische Farben gehören oft zu Modellnamen)
    if ((keyLower.includes('farbe') || keyLower.includes('color') || keyLower.includes('colour')) && !specs['Farbe']) {
      const germanColor = getGermanColorOnly(valTrimmed);
      if (germanColor) {
        specs['Farbe'] = germanColor;
        console.log(`🎨 BrickFox Farbe: ${value} → ${specs['Farbe']}`);
      }
    }
    
    // Material
    if ((keyLower.includes('material') || keyLower.includes('werkstoff')) && !specs['Material']) {
      specs['Material'] = valTrimmed;
      console.log(`🔧 BrickFox Material: ${value}`);
    }
    
    // Kabellänge
    if ((keyLower.includes('kabellänge') || keyLower.includes('kabellaenge') || keyLower.includes('cable_length')) && !specs['Kabellänge']) {
      let kabelVal = valTrimmed;
      if (!/\b(m|cm|mm)\b/i.test(kabelVal)) {
        kabelVal = `${kabelVal} m`;
      }
      specs['Kabellänge'] = kabelVal;
      console.log(`🔌 BrickFox Kabellänge: ${value} → ${kabelVal}`);
    }
    
    // Anschluss/Stecker
    if ((keyLower.includes('anschluss') || keyLower.includes('stecker') || keyLower.includes('connector')) && !specs['Anschluss']) {
      specs['Anschluss'] = valTrimmed;
      console.log(`🔌 BrickFox Anschluss: ${value}`);
    }
    
    // Ladezeit
    if ((keyLower.includes('ladezeit') || keyLower.includes('charging_time')) && !specs['Ladezeit']) {
      let ladezeitVal = valTrimmed;
      if (!/\b(h|min|stunden|minuten)\b/i.test(ladezeitVal)) {
        ladezeitVal = `${ladezeitVal} h`;
      }
      specs['Ladezeit'] = ladezeitVal;
      console.log(`⏱️ BrickFox Ladezeit: ${value} → ${ladezeitVal}`);
    }
    
    // Ladeleistung
    if ((keyLower.includes('ladeleistung') || keyLower.includes('charging_power') || keyLower.includes('watt')) && !specs['Max. Ladeleistung']) {
      let leistungVal = valTrimmed;
      if (!/\b(w|watt)\b/i.test(leistungVal)) {
        leistungVal = `${leistungVal} W`;
      }
      specs['Max. Ladeleistung'] = leistungVal;
    }
    
    // IP-Schutzart
    if ((keyLower.includes('ip_') || keyLower.includes('schutzart') || keyLower.includes('wasserschutz') || keyLower.includes('ipx')) && !specs['Wasserschutz']) {
      specs['Wasserschutz'] = valTrimmed;
      console.log(`💧 BrickFox Wasserschutz: ${value}`);
    }
    
    // Zertifizierung
    if ((keyLower.includes('zertifizierung') || keyLower.includes('certification') || keyLower.includes('ce_')) && !specs['Zertifizierung']) {
      specs['Zertifizierung'] = valTrimmed;
      console.log(`✅ BrickFox Zertifizierung: ${value}`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SPEZIAL: APN/Teilenummer aus ALLEN Feldern extrahieren
  // CSV-Spalten werden vom Frontend zu Kleinbuchstaben normalisiert!
  // ═══════════════════════════════════════════════════════════════
  if (!specs['APN']) {
    // Erstelle eine normalisierte Map für einfacheren Zugriff
    const normalizedData: Record<string, string> = {};
    for (const [key, value] of Object.entries(structuredData)) {
      if (value && typeof value === 'string') {
        normalizedData[key.toLowerCase()] = value;
      }
    }
    
    // Produktname-Felder in verschiedenen Schreibweisen (alle lowercase)
    const productNameKeys = [
      'p_name[de]', 'p name[de]', 'p_name', 'p name', 
      'p_name_lang[de]', 'p_name_kurz[de]', 'p_short_description[de]',
      'produktname', 'name', 'titel', 'title', 'description', 'beschreibung',
      'product_name', 'extractedtext'
    ];
    
    // Suche in Produktname-Feldern nach APN
    for (const key of productNameKeys) {
      const value = normalizedData[key];
      if (!value) continue;
      
      // Pattern: "APN 616-0579, 616-0580" oder "APN: 616-0579"
      let apnMatch = value.match(/APN[:\s]+([0-9\-,\s]+)/i);
      if (apnMatch) {
        specs['APN'] = apnMatch[1].trim().replace(/\s+/g, ' ').replace(/,\s*/g, ', ');
        console.log(`🔢 APN aus "${key}": ${specs['APN']}`);
        break;
      }
      
      // Pattern: "entspricht APN 616-0579"
      apnMatch = value.match(/entspricht\s+APN\s+([0-9\-,\s]+)/i);
      if (apnMatch) {
        specs['APN'] = apnMatch[1].trim().replace(/\s+/g, ' ').replace(/,\s*/g, ', ');
        console.log(`🔢 APN (entspricht) aus "${key}": ${specs['APN']}`);
        break;
      }
      
      // Pattern: "Apple-Teilenummern 616-0579, 616-0580"
      apnMatch = value.match(/Apple-?Teilenummer[n]?\s*[:\s]*([0-9\-,\s]+)/i);
      if (apnMatch) {
        specs['APN'] = apnMatch[1].trim().replace(/\s+/g, ' ').replace(/,\s*/g, ', ');
        console.log(`🔢 Apple-Teilenummer aus "${key}": ${specs['APN']}`);
        break;
      }
    }
    
    // Falls nicht gefunden, durchsuche ALLE Felder
    if (!specs['APN']) {
      for (const [key, value] of Object.entries(normalizedData)) {
        // Pattern: "APN 616-0579" irgendwo im Text
        const apnMatch = value.match(/APN[:\s]+([0-9\-,\s]+)/i);
        if (apnMatch) {
          specs['APN'] = apnMatch[1].trim().replace(/\s+/g, ' ').replace(/,\s*/g, ', ');
          console.log(`🔢 APN aus beliebigem Feld "${key}": ${specs['APN']}`);
          break;
        }
      }
    }
  }
  
  return specs;
}

/**
 * Kombinierte Extraktion: Strukturierte Daten > Text-Parsing
 */
export function extractTechSpecs1to1(
  extractedText: string,
  structuredData: any,
  categoryConfig: ProductCategoryConfig
): Record<string, string> {
  let specs: Record<string, string> = {};
  
  // HÖCHSTE PRIORITÄT: BrickFox-Attribute direkt aus CSV
  const brickfoxSpecs = extractBrickfoxAttributes(structuredData);
  if (Object.keys(brickfoxSpecs).length > 0) {
    specs = { ...brickfoxSpecs };
  }
  
  // Priorität 2: Strukturierte Daten (wenn vorhanden)
  const structuredResult = extractTechSpecsFromStructured(structuredData, categoryConfig);
  if (structuredResult.source !== 'none') {
    // BrickFox-Specs haben Vorrang, nur fehlende ergänzen
    for (const [key, value] of Object.entries(structuredResult.specs)) {
      if (!specs[key]) {
        specs[key] = value;
      }
    }
  }
  
  // Priorität 3: Text-Parsing (als Ergänzung, nicht als Ersatz)
  const textResult = parseTechSpecsFromText(extractedText, categoryConfig);
  if (textResult.source !== 'none') {
    // Ergänze fehlende Felder aus Text-Parsing (z.B. APN)
    for (const [key, value] of Object.entries(textResult.specs)) {
      if (!specs[key]) {
        specs[key] = value;
      }
    }
  }
  
  // SPEZIAL: Extrahiere APN aus Produktname falls noch nicht vorhanden
  if (!specs['APN'] && structuredData) {
    // Suche in verschiedenen Produktname-Spalten
    const productName = structuredData['P Name[de]'] || 
                       structuredData['P_name[de]'] || 
                       structuredData['p_name[de]'] ||
                       structuredData['P Name'] ||
                       structuredData['p_name[de]'] ||
                       structuredData.produktname || 
                       structuredData.name || '';
    
    // Pattern 1: "APN: 616-0579, 616-0580" oder "APN 616-0579"
    let apnMatch = productName.match(/APN[:\s]+([0-9\-,\s]+)/i);
    if (apnMatch) {
      specs['APN'] = apnMatch[1].trim().replace(/\s+/g, ' ');
      console.log(`✅ APN aus Produktname: ${specs['APN']}`);
    }
    
    // Pattern 2: "entspricht APN 616-0579, 616-0580"
    if (!specs['APN']) {
      const altMatch = productName.match(/entspricht\s+APN\s+([0-9\-,\s]+)/i);
      if (altMatch) {
        specs['APN'] = altMatch[1].trim().replace(/\s+/g, ' ');
        console.log(`✅ APN aus Produktname (entspricht): ${specs['APN']}`);
      }
    }
    
    // Pattern 3: Suche in ALLEN Spalten nach APN
    if (!specs['APN']) {
      for (const [key, value] of Object.entries(structuredData)) {
        if (typeof value === 'string' && value.includes('APN')) {
          const apnInValue = value.match(/APN[:\s]*([0-9\-,\s]+)/i);
          if (apnInValue) {
            specs['APN'] = apnInValue[1].trim().replace(/\s+/g, ' ');
            console.log(`✅ APN aus Spalte ${key}: ${specs['APN']}`);
            break;
          }
        }
      }
    }
    
    // Pattern 4: Suche auch im extractedText nach APN falls noch nicht gefunden
    if (!specs['APN'] && extractedText) {
      const textApnMatch = extractedText.match(/APN[:\s]+([0-9\-,\s]+)/i);
      if (textApnMatch) {
        specs['APN'] = textApnMatch[1].trim().replace(/\s+/g, ' ');
        console.log(`✅ APN aus extractedText: ${specs['APN']}`);
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // REGEL: Fehlende Werte aus Produktname extrahieren
  // Kapazität, Farbe, Akku-Chemie aus Produktname holen wenn nicht in CSV
  // ═══════════════════════════════════════════════════════════════
  
  // Suche Produktname in allen möglichen Feldvarianten
  const fieldsToCheck: string[] = [];
  if (structuredData) {
    // PRIORITÄT 1: Exaktes p_name[de] Feld (mit Klammern im Key)
    for (const [key, value] of Object.entries(structuredData)) {
      if (typeof value === 'string' && value.trim()) {
        // Exakte Matches für p_name[de] (verschiedene Schreibweisen)
        if (key === 'p_name[de]' || key === 'P Name[de]' || key === 'P_name[de]') {
          fieldsToCheck.unshift(value);
        }
      }
    }
    
    // PRIORITÄT 2: Andere Produktname-Felder
    for (const [key, value] of Object.entries(structuredData)) {
      if (typeof value === 'string' && value.trim()) {
        const keyLower = key.toLowerCase();
        // Produktname-Felder (aber nicht wenn schon hinzugefügt)
        if ((keyLower.includes('p_name') || keyLower.includes('produktname') || 
            keyLower.includes('productname') || keyLower === 'name' || keyLower === 'bezeichnung') &&
            !fieldsToCheck.includes(value)) {
          fieldsToCheck.push(value);
        }
      }
    }
    
    // PRIORITÄT 3: Beschreibungs-Felder (nur als Fallback)
    for (const [key, value] of Object.entries(structuredData)) {
      if (typeof value === 'string' && value.trim()) {
        const keyLower = key.toLowerCase();
        if ((keyLower.includes('p_description') || keyLower.includes('beschreibung')) &&
            !fieldsToCheck.includes(value)) {
          fieldsToCheck.push(value);
        }
      }
    }
  }
  
  // Debug: Zeige welche Felder gefunden wurden
  if (fieldsToCheck.length > 0) {
  }
  
  // 1. KAPAZITÄT IMMER aus Produktname extrahieren (dort steht der korrekte Wert wie "40 mAh")
  // Das CSV-Feld p_attributes[akku_mah][de] enthält oft nur die Zahl ohne Einheit oder ist leer
  
  for (const field of fieldsToCheck) {
    // Pattern 1: "50 mAh", "1821mAh", "1.821 mAh", auch nach Komma: ", 50 mAh"
    const mahMatch = field.match(/(\d+[.,]?\d*)\s*mAh/i);
    if (mahMatch) {
      let mahValue = mahMatch[1];
      // Tausenderpunkte entfernen
      if (mahValue.includes('.') && mahValue.split('.')[1]?.length >= 3) {
        mahValue = mahValue.replace('.', '');
      }
      mahValue = mahValue.replace(',', '');
      specs['Kapazität'] = `${mahValue} mAh`;
      break;
    }
    
    // Pattern 2: "5 Ah", "5Ah", "2.5 Ah" → in mAh umrechnen
    const ahMatch = field.match(/(\d+[.,]?\d*)\s*Ah\b/i);
    if (ahMatch && !field.match(/mAh/i)) { // Nur wenn NICHT auch mAh vorkommt
      let ahValue = parseFloat(ahMatch[1].replace(',', '.'));
      const mahValue = Math.round(ahValue * 1000);
      specs['Kapazität'] = `${mahValue} mAh`;
      break;
    }
  }
  
  // Fallback: Falls nichts im Produktnamen, prüfe CSV-Feld
  if (!specs['Kapazität']) {
    const csvKapazitaet = specs['Kapazität']?.trim();
    if (csvKapazitaet && csvKapazitaet !== '' && csvKapazitaet !== '-') {
      console.log(`✅ Kapazität aus CSV-Feld: "${csvKapazitaet}"`);
    } else {
      console.log(`⚠️ Keine Kapazität gefunden`);
    }
  }
  
  // 2. FARBE aus Produktname extrahieren - NUR deutsche Farben (englische gehören zu Modellnamen wie "Hero7 Black")
  if (!specs['Farbe'] && structuredData) {
    // NUR deutsche Farben suchen - englische wie "Black", "White" werden ignoriert
    const deutscheFarbenPattern = /\b(Schwarz|Weiß|Weiss|Rot|Blau|Grün|Gruen|Gelb|Orange|Lila|Violett|Rosa|Pink|Grau|Silber|Gold|Bronze|Braun|Beige|Türkis|Tuerkis)\b/i;
    for (const field of fieldsToCheck) {
      const farbeMatch = field.match(deutscheFarbenPattern);
      if (farbeMatch) {
        const germanColor = getGermanColorOnly(farbeMatch[1]);
        if (germanColor) {
          specs['Farbe'] = germanColor;
          console.log(`🎨 Deutsche Farbe aus Produktname: ${farbeMatch[1]} → ${specs['Farbe']}`);
          break;
        }
      }
    }
  }
  
  // 3. AKKU-CHEMIE aus Produktname extrahieren (falls nicht vorhanden)
  if (!specs['Akkutyp'] && structuredData) {
    const chemiePattern = /\b(Li-Ion|Li-Polymer|Li-Po|LiPo|LiFePO4|NiMH|NiCd|Ni-MH|Ni-Cd|Lithium-Ion|Lithium-Polymer|Alkaline|Zink-Kohle|Zink-Luft)\b/i;
    for (const field of fieldsToCheck) {
      const chemieMatch = field.match(chemiePattern);
      if (chemieMatch) {
        // Normalisiere Chemie-Namen
        let chemie = chemieMatch[1];
        if (chemie.toLowerCase() === 'li-polymer' || chemie.toLowerCase() === 'li-po' || chemie.toLowerCase() === 'lipo') {
          chemie = 'Li-Polymer';
        } else if (chemie.toLowerCase() === 'li-ion' || chemie.toLowerCase() === 'lithium-ion') {
          chemie = 'Li-Ion';
        } else if (chemie.toLowerCase() === 'nimh' || chemie.toLowerCase() === 'ni-mh') {
          chemie = 'NiMH';
        } else if (chemie.toLowerCase() === 'nicd' || chemie.toLowerCase() === 'ni-cd') {
          chemie = 'NiCd';
        }
        specs['Akkutyp'] = chemie;
        break;
      }
    }
  }
  
  // WICHTIG: Entferne jegliche "Wh" Kapazität wenn nicht explizit in CSV
  if (specs['Kapazität'] && specs['Kapazität'].toLowerCase().includes('wh')) {
    // Prüfe ob Wh wirklich in den Originaldaten war
    let hasWhInOriginal = false;
    for (const [key, value] of Object.entries(structuredData || {})) {
      if (typeof value === 'string' && value.toLowerCase().includes('wh')) {
        hasWhInOriginal = true;
        break;
      }
    }
    if (!hasWhInOriginal) {
      // Wh wurde fälschlicherweise hinzugefügt - entfernen oder zu mAh ändern
      const numericPart = specs['Kapazität'].replace(/[^\d.,]/g, '');
      if (numericPart) {
        specs['Kapazität'] = `${numericPart} mAh`;
      } else {
        delete specs['Kapazität'];
      }
    }
  }
  
  if (Object.keys(specs).length === 0) {
    console.log('⚠️ No tech specs found in data');
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SPEZIALFALL BATTERIEN: "Typ/Bezeichnung" + "Alternative Bezeichnungen"
  // Bei Batterien/Knopfzellen NICHT "Kompatibilität" anzeigen!
  // ═══════════════════════════════════════════════════════════════
  const productName = structuredData?.['p_name[de]'] || 
                     structuredData?.['P Name[de]'] || 
                     structuredData?.produktname || 
                     structuredData?.name || '';
  
  if (isBattery(productName)) {
    console.log(`🔋 Batterie erkannt: ${productName}`);
    
    // Entferne "Kompatibilität" - passt nicht zu Batterien
    delete specs['Kompatibilität'];
    
    // Extrahiere Batterietyp aus Produktname
    const batteryInfo = extractBatteryTypeInfo(productName);
    if (batteryInfo) {
      specs['Typ / Bezeichnung'] = batteryInfo.type;
      
      // DYNAMISCH: Alternative Bezeichnungen aus p_description[de] extrahieren
      const description = structuredData?.['p_description[de]'] || 
                         structuredData?.['P Description[de]'] || 
                         structuredData?.beschreibung || '';
      
      // Pattern: Suche nach alternativen Bezeichnungen im Text
      // z.B. "DL2032, ECR2032, EA-2032C" oder "ersetzt DL2032, ECR2032"
      const altPattern = new RegExp(
        `(?:ersetzt|alternativ|auch|entspricht|compatible|kompatibel|passend)[:\\s]+([A-Z]{1,3}[\\-]?\\d{2,5}[A-Z]?(?:[,\\s]+[A-Z]{1,3}[\\-]?\\d{2,5}[A-Z]?)*)`,
        'i'
      );
      const altMatch = description.match(altPattern);
      
      // Oder direkt Codes suchen die dem Haupttyp ähneln
      const typeBase = batteryInfo.type.replace(/\d+.*/, ''); // z.B. "CR" aus "CR2032"
      const similarCodesPattern = new RegExp(
        `\\b([A-Z]{1,3}[\\-]?${batteryInfo.type.replace(/[A-Z]+/, '\\d+')}[A-Z]?)\\b`,
        'gi'
      );
      
      let dynamicAlternatives: string[] = [];
      
      if (altMatch) {
        // Gefundene Alternativen aus dem Text
        dynamicAlternatives = altMatch[1]
          .split(/[,\s]+/)
          .map((s: string) => s.trim().toUpperCase())
          .filter((s: string) => s.length >= 3 && s !== batteryInfo.type);
        console.log(`🔋 Dynamische Alternativen aus Beschreibung: ${dynamicAlternatives.join(', ')}`);
      }
      
      // Fallback: Statische Alternativen nur wenn keine dynamischen gefunden
      if (dynamicAlternatives.length === 0) {
        dynamicAlternatives = batteryInfo.alternatives;
        console.log(`🔋 Fallback auf statische Alternativen: ${dynamicAlternatives.join(', ')}`);
      }
      
      if (dynamicAlternatives.length > 0) {
        specs['Alternative Bezeichnungen'] = dynamicAlternatives.join(', ');
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // REGEL: Farbe nur anzeigen wenn mind. 2 weitere ECHTE technische Daten
  // Farbe allein oder mit nur 1 anderen Spec → Farbe entfernen
  // Meta-Felder wie P Id, P Name, P Brand zählen NICHT als technische Daten
  // ═══════════════════════════════════════════════════════════════
  if (specs['Farbe']) {
    // NUR diese Felder zählen als echte technische Daten:
    const realTechFields = [
      'Spannung', 'Kapazität', 'Akkutyp', 'Energieinhalt', 'Gewicht',
      'Länge', 'Breite', 'Höhe', 'Durchmesser', 'Material',
      'Kabellänge', 'Anschluss', 'Ladezeit', 'Max. Ladeleistung',
      'Wasserschutz', 'Zertifizierung', 'Typ / Bezeichnung', 'Modelle'
    ];
    
    const otherRealSpecsCount = Object.keys(specs).filter(key => realTechFields.includes(key)).length;
    
    if (otherRealSpecsCount < 2) {
      console.log(`🎨 Farbe entfernt: nur ${otherRealSpecsCount} echte technische Daten (mind. 2 nötig)`);
      delete specs['Farbe'];
    } else {
      console.log(`🎨 Farbe beibehalten: ${otherRealSpecsCount} echte technische Daten vorhanden`);
    }
  }
  
  return specs;
}

/**
 * Normalisiert Feldnamen für besseres Matching
 */
function normalizeFieldName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[äöüß]/g, match => {
      const map: Record<string, string> = { 'ä': 'a', 'ö': 'o', 'ü': 'u', 'ß': 'ss' };
      return map[match] || match;
    })
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Prüft, ob ein Wert gültig ist (nicht "Nicht angegeben" etc.)
 */
function isValidValue(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  
  const invalid = [
    'nicht angegeben',
    'nicht spezifiziert',
    'nicht sichtbar',
    'unbekannt',
    'n/a',
    'na',
    'keine angabe',
  ];
  
  const normalized = value.toLowerCase().trim();
  return !invalid.includes(normalized) && normalized.length > 0;
}

/**
 * Korrigiert unlogische Volt-Werte (z.B. 37 → 3,7 V)
 * Akkus haben typischerweise Spannungen zwischen 1,2 V und 48 V
 */
export function correctVoltageValue(value: string | number): string {
  const numValue = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
  
  if (isNaN(numValue)) return String(value);
  
  // Typische Akku-Spannungen: 1.2V, 3.6V, 3.7V, 3.8V, 7.2V, 7.4V, 10.8V, 11.1V, 14.4V, 18V, 36V, 48V
  // Wenn Wert > 50, ist wahrscheinlich das Komma falsch (z.B. 37 = 3,7 oder 72 = 7,2)
  
  let correctedValue = numValue;
  
  if (numValue >= 100) {
    // 370 → 3,70, 720 → 7,20, 1108 → 11,08
    correctedValue = numValue / 100;
  } else if (numValue >= 30 && numValue <= 49) {
    // 37 → 3,7, 38 → 3,8, 36 → 3,6
    correctedValue = numValue / 10;
  } else if (numValue >= 70 && numValue <= 79) {
    // 72 → 7,2, 74 → 7,4
    correctedValue = numValue / 10;
  } else if (numValue >= 108 && numValue <= 115) {
    // 108 → 10,8, 111 → 11,1
    correctedValue = numValue / 10;
  } else if (numValue >= 144 && numValue <= 148) {
    // 144 → 14,4
    correctedValue = numValue / 10;
  }
  
  // Formatiere mit Komma (deutsches Format)
  const formatted = correctedValue.toFixed(1).replace('.', ',');
  
  // Füge "V" hinzu wenn nicht bereits vorhanden
  return `${formatted} V`;
}

function formatFieldName(key: string): string {
  // Entferne Unterstriche und formatiere
  let formatted = key.replace(/_/g, ' ');
  
  // Großschreibe ersten Buchstaben jedes Wortes
  formatted = formatted.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  return formatted;
}
