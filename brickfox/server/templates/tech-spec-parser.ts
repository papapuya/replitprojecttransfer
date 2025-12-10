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
 * Kombinierte Extraktion: Strukturierte Daten > Text-Parsing
 */
export function extractTechSpecs1to1(
  extractedText: string,
  structuredData: any,
  categoryConfig: ProductCategoryConfig
): Record<string, string> {
  // Priorität 1: Strukturierte Daten (wenn vorhanden)
  const structuredResult = extractTechSpecsFromStructured(structuredData, categoryConfig);
  if (structuredResult.source !== 'none') {
    console.log(`📊 Using ${Object.keys(structuredResult.specs).length} specs from structured data`);
    return structuredResult.specs;
  }
  
  // Priorität 2: Text-Parsing
  const textResult = parseTechSpecsFromText(extractedText, categoryConfig);
  if (textResult.source !== 'none') {
    console.log(`📊 Using ${Object.keys(textResult.specs).length} specs from text parsing`);
    return textResult.specs;
  }
  
  console.log('⚠️ No tech specs found in data');
  return {};
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

function formatFieldName(key: string): string {
  // Entferne Unterstriche und formatiere
  let formatted = key.replace(/_/g, ' ');
  
  // Großschreibe ersten Buchstaben jedes Wortes
  formatted = formatted.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  return formatted;
}
