/**
 * Parst technische Daten 1:1 aus extrahiertem Text
 * KEINE AI-Interpretation - nur direktes Mapping
 */

import { ProductCategoryConfig } from './category-config';

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
 * Extrahiert BrickFox-spezifische Attribute aus CSV-Daten
 * z.B. p_attributes[akku_v][de] -> Spannung, p_attributes[akku_mah][de] -> Kapazität
 * Erweitert um: Maße, Gewicht, Farbe und alle technischen Daten
 */
function extractBrickfoxAttributes(structuredData: any): Record<string, string> {
  const specs: Record<string, string> = {};
  
  if (!structuredData) return specs;
  
  // Durchsuche alle Spalten nach p_attributes Pattern und anderen technischen Feldern
  for (const [key, value] of Object.entries(structuredData)) {
    if (!value || typeof value !== 'string' || value.trim() === '') continue;
    
    const keyLower = key.toLowerCase();
    const valTrimmed = value.trim();
    
    // Spannung: p_attributes[akku_v][de]
    if (keyLower.includes('akku_v') || keyLower.includes('voltage') || keyLower.includes('spannung')) {
      const correctedVoltage = correctVoltageValue(valTrimmed);
      specs['Spannung'] = correctedVoltage;
      console.log(`⚡ BrickFox Spannung: ${value} → ${correctedVoltage}`);
    }
    
    // Kapazität: p_attributes[akku_mah][de] oder ähnlich
    if (keyLower.includes('akku_mah') || keyLower.includes('capacity') || 
        (keyLower.includes('kapazit') && !specs['Kapazität'])) {
      let capacityValue = valTrimmed;
      if (!value.toLowerCase().includes('wh') && !value.toLowerCase().includes('mah')) {
        capacityValue = `${capacityValue} mAh`;
      } else if (value.toLowerCase().includes('mah')) {
        capacityValue = value;
      }
      if (!value.toLowerCase().includes('wh')) {
        specs['Kapazität'] = capacityValue;
        console.log(`🔋 BrickFox Kapazität: ${value} → ${capacityValue}`);
      }
    }
    
    // Akkutyp/Chemie: p_attributes[akku_chemie][de]
    if (keyLower.includes('chemie') || keyLower.includes('chemistry') || keyLower.includes('akku_typ')) {
      specs['Akkutyp'] = valTrimmed;
      console.log(`🔬 BrickFox Akkutyp: ${value}`);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // DYNAMISCHE ERWEITERUNG: Maße, Gewicht, Farbe, technische Daten
    // ═══════════════════════════════════════════════════════════════
    
    // Gewicht
    if ((keyLower.includes('gewicht') || keyLower.includes('weight') || keyLower.includes('p_weight')) && !specs['Gewicht']) {
      let gewichtVal = valTrimmed;
      // Einheit hinzufügen wenn nicht vorhanden
      if (!/\b(g|kg|gramm|kilogramm)\b/i.test(gewichtVal)) {
        // Prüfe ob es eine kleine Zahl ist (wahrscheinlich kg) oder große (wahrscheinlich g)
        const numVal = parseFloat(gewichtVal.replace(',', '.'));
        if (!isNaN(numVal)) {
          gewichtVal = numVal < 10 ? `${gewichtVal} kg` : `${gewichtVal} g`;
        }
      }
      specs['Gewicht'] = gewichtVal;
      console.log(`⚖️ BrickFox Gewicht: ${value} → ${gewichtVal}`);
    }
    
    // Länge
    if ((keyLower.includes('länge') || keyLower.includes('laenge') || keyLower.includes('length') || keyLower.includes('p_length')) && !specs['Länge']) {
      let laengeVal = valTrimmed;
      if (!/\b(mm|cm|m)\b/i.test(laengeVal)) {
        laengeVal = `${laengeVal} mm`;
      }
      specs['Länge'] = laengeVal;
      console.log(`📏 BrickFox Länge: ${value} → ${laengeVal}`);
    }
    
    // Breite
    if ((keyLower.includes('breite') || keyLower.includes('width') || keyLower.includes('p_width')) && !specs['Breite']) {
      let breiteVal = valTrimmed;
      if (!/\b(mm|cm|m)\b/i.test(breiteVal)) {
        breiteVal = `${breiteVal} mm`;
      }
      specs['Breite'] = breiteVal;
      console.log(`📐 BrickFox Breite: ${value} → ${breiteVal}`);
    }
    
    // Höhe / Dicke
    if ((keyLower.includes('höhe') || keyLower.includes('hoehe') || keyLower.includes('height') || 
         keyLower.includes('dicke') || keyLower.includes('thickness') || keyLower.includes('p_height')) && !specs['Höhe']) {
      let hoeheVal = valTrimmed;
      if (!/\b(mm|cm|m)\b/i.test(hoeheVal)) {
        hoeheVal = `${hoeheVal} mm`;
      }
      specs['Höhe'] = hoeheVal;
      console.log(`📊 BrickFox Höhe: ${value} → ${hoeheVal}`);
    }
    
    // Durchmesser
    if ((keyLower.includes('durchmesser') || keyLower.includes('diameter') || keyLower.includes('ø')) && !specs['Durchmesser']) {
      let dmVal = valTrimmed;
      if (!/\b(mm|cm)\b/i.test(dmVal)) {
        dmVal = `${dmVal} mm`;
      }
      specs['Durchmesser'] = dmVal;
      console.log(`⭕ BrickFox Durchmesser: ${value} → ${dmVal}`);
    }
    
    // Farbe
    if ((keyLower.includes('farbe') || keyLower.includes('color') || keyLower.includes('colour')) && !specs['Farbe']) {
      specs['Farbe'] = valTrimmed;
      console.log(`🎨 BrickFox Farbe: ${value}`);
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
      console.log(`⚡ BrickFox Ladeleistung: ${value} → ${leistungVal}`);
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
    console.log(`📊 Using ${Object.keys(brickfoxSpecs).length} specs from BrickFox attributes`);
    specs = { ...brickfoxSpecs };
  }
  
  // Priorität 2: Strukturierte Daten (wenn vorhanden)
  const structuredResult = extractTechSpecsFromStructured(structuredData, categoryConfig);
  if (structuredResult.source !== 'none') {
    console.log(`📊 Using ${Object.keys(structuredResult.specs).length} specs from structured data`);
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
        console.log(`📊 Added from text parsing: ${key} = ${value}`);
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
        console.log(`🔋 Wh zu mAh korrigiert: ${specs['Kapazität']}`);
      } else {
        delete specs['Kapazität'];
        console.log(`🔋 Kapazität mit falschem Wh entfernt`);
      }
    }
  }
  
  if (Object.keys(specs).length === 0) {
    console.log('⚠️ No tech specs found in data');
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
