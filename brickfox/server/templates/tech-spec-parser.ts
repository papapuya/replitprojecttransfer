/**
 * Parst technische Daten 1:1 aus extrahiertem Text
 * KEINE AI-Interpretation - nur direktes Mapping
 */

import { ProductCategoryConfig } from './category-config';

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
 * Extrahiert BrickFox-spezifische Attribute aus CSV-Daten
 * z.B. p_attributes[akku_v][de] -> Spannung, p_attributes[akku_mah][de] -> Kapazität
 * Erweitert um: Maße, Gewicht, Farbe und alle technischen Daten
 */
function extractBrickfoxAttributes(structuredData: any): Record<string, string> {
  const specs: Record<string, string> = {};
  
  if (!structuredData) {
    console.log('⚠️ extractBrickfoxAttributes: structuredData ist null/undefined');
    return specs;
  }
  
  // Debug: Zeige alle Schlüssel in structuredData
  const keys = Object.keys(structuredData);
  console.log(`📋 extractBrickfoxAttributes: ${keys.length} Felder vorhanden`);
  console.log(`📋 Erste 10 Schlüssel: ${keys.slice(0, 10).join(', ')}`);
  
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
          console.log(`🔖 Modelle aus Produktname extrahiert: ${modelle}`);
          break;
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // KOMPATIBILITÄT EXTRAKTION: Geräte aus Produktbeschreibung
  // Format: "Marke: Modell1, Modell2" oder einfach Modellcodes
  // ═══════════════════════════════════════════════════════════════
  const descriptionFields = ['p_description[de]', 'beschreibung', 'description', 'produktbeschreibung'];
  for (const field of descriptionFields) {
    const description = structuredData[field];
    if (description && typeof description === 'string' && description.length > 10) {
      // Suche nach Modellcodes im Format "Marke: Modell" oder reine Modellcodes
      const allModels: string[] = [];
      
      // Pattern 1: "Marke: Modell1, Modell2" (z.B. "Midland: XTC-300, XTC-350")
      // Nur Modellcodes mit mindestens 3 Zeichen und Bindestrich oder Zahlen
      const brandModelPattern = /([A-Za-z][A-Za-z\s]*?):\s*([A-Z0-9][A-Z0-9\-]{2,}(?:,\s*[A-Z0-9][A-Z0-9\-]{2,})*)/gi;
      let brandMatch;
      while ((brandMatch = brandModelPattern.exec(description)) !== null) {
        const brand = brandMatch[1].trim();
        const models = brandMatch[2].trim();
        // Ignoriere technische Labels, CSS-Properties und kurze Wörter
        const technicalLabels = [
          'spannung', 'kapazität', 'typ', 'farbe', 'gewicht', 'länge', 'breite', 'höhe', 'chemie', 
          'voltage', 'capacity', 'weight', 'color', 'font', 'style', 'border', 'margin', 'padding',
          'width', 'height', 'background', 'display', 'text', 'size', 'family'
        ];
        // Ignoriere wenn Marke ein CSS-Property ist oder zu kurz
        if (!technicalLabels.includes(brand.toLowerCase()) && brand.length > 2) {
          // Ignoriere CSS-Werte wie "bold", "normal", "italic"
          const cssValues = ['bold', 'normal', 'italic', 'none', 'block', 'inline', 'flex', 'grid', 'auto'];
          if (!cssValues.includes(models.toLowerCase())) {
            allModels.push(`${brand}: ${models}`);
          }
        }
      }
      
      // Pattern 2: Eigenständige Modellcodes (z.B. "AHDBT-001", "HDDV2100")
      // Nur wenn keine Marken-Modell-Paare gefunden wurden
      if (allModels.length === 0) {
        const standaloneModels = description.match(/\b[A-Z]{2,}[\-]?[A-Z0-9]{2,}[\-]?[A-Z0-9]*\b/g);
        if (standaloneModels) {
          // Filtere technische Begriffe heraus
          const filtered = standaloneModels.filter(m => 
            !['LI-ION', 'LI-POLYMER', 'NIMH', 'NICD', 'USB-C', 'MICRO-USB'].includes(m.toUpperCase())
          );
          allModels.push(...filtered);
        }
      }
      
      if (allModels.length > 0) {
        // Dedupliziere und formatiere
        const uniqueModels = Array.from(new Set(allModels));
        specs['Kompatibilität'] = uniqueModels.join(', ');
        console.log(`📱 Kompatibilität aus Beschreibung extrahiert: ${uniqueModels.length} Einträge`);
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
      const correctedVoltage = correctVoltageValue(valTrimmed);
      specs['Spannung'] = correctedVoltage;
      console.log(`⚡ BrickFox Spannung: ${value} → ${correctedVoltage}`);
    }
    
    // Kapazität: p_attributes[akku_mah][de] - einfach Zahl + "mAh" anhängen
    if (keyLower.includes('akku_mah')) {
      // Extrahiere nur die Zahl(en) und formatiere
      const numMatch = valTrimmed.match(/^(\d+)/);
      if (numMatch) {
        const capacityValue = `${numMatch[1]} mAh`;
        specs['Kapazität'] = capacityValue;
        console.log(`🔋 CSV-Kapazität: ${valTrimmed} → ${capacityValue}`);
        console.log(`🔋 specs['Kapazität'] jetzt: "${specs['Kapazität']}"`);
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
      console.log(`⚖️ BrickFox Gewicht: ${value} → ${gewichtVal}`);
    }
    
    // Länge - IMMER in mm umrechnen
    if ((keyLower.includes('länge') || keyLower.includes('laenge') || keyLower.includes('length') || keyLower.includes('p_length')) && !specs['Länge']) {
      specs['Länge'] = convertToMm(valTrimmed);
      console.log(`📏 BrickFox Länge: ${value} → ${specs['Länge']}`);
    }
    
    // Breite - IMMER in mm umrechnen
    if ((keyLower.includes('breite') || keyLower.includes('width') || keyLower.includes('p_width')) && !specs['Breite']) {
      specs['Breite'] = convertToMm(valTrimmed);
      console.log(`📐 BrickFox Breite: ${value} → ${specs['Breite']}`);
    }
    
    // Höhe / Dicke - IMMER in mm umrechnen
    if ((keyLower.includes('höhe') || keyLower.includes('hoehe') || keyLower.includes('height') || 
         keyLower.includes('dicke') || keyLower.includes('thickness') || keyLower.includes('p_height')) && !specs['Höhe']) {
      specs['Höhe'] = convertToMm(valTrimmed);
      console.log(`📊 BrickFox Höhe: ${value} → ${specs['Höhe']}`);
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
          console.log(`🎯 Produktname-Feld gefunden: "${key}" = "${value.substring(0, 60)}..."`);
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
    console.log(`📋 Produktname-Felder für Extraktion: ${fieldsToCheck.length} gefunden`);
    console.log(`📋 Erstes Feld: "${fieldsToCheck[0]?.substring(0, 80)}..."`);
  }
  
  // 1. KAPAZITÄT IMMER aus Produktname extrahieren (dort steht der korrekte Wert wie "40 mAh")
  // Das CSV-Feld p_attributes[akku_mah][de] enthält oft nur die Zahl ohne Einheit oder ist leer
  console.log(`🔍 Suche Kapazität in ${fieldsToCheck.length} Produktname-Feldern...`);
  
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
      console.log(`🔋 Kapazität aus Produktname: ${specs['Kapazität']} (aus: "${field.substring(0, 60)}")`);
      break;
    }
    
    // Pattern 2: "5 Ah", "5Ah", "2.5 Ah" → in mAh umrechnen
    const ahMatch = field.match(/(\d+[.,]?\d*)\s*Ah\b/i);
    if (ahMatch && !field.match(/mAh/i)) { // Nur wenn NICHT auch mAh vorkommt
      let ahValue = parseFloat(ahMatch[1].replace(',', '.'));
      const mahValue = Math.round(ahValue * 1000);
      specs['Kapazität'] = `${mahValue} mAh`;
      console.log(`🔋 Kapazität aus Produktname (Ah→mAh): ${ahMatch[1]} Ah → ${specs['Kapazität']} (aus: "${field.substring(0, 60)}")`);
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
        console.log(`⚡ Akku-Chemie aus Produktname: ${specs['Akkutyp']}`);
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
