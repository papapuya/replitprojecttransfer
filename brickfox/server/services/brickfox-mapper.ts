/**
 * Brickfox Mapper Service
 * Transforms scraped product data into Brickfox CSV format
 */

import { 
  BRICKFOX_FIELDS, 
  BrickfoxExportMapping, 
  DEFAULT_BRICKFOX_MAPPING,
  getBrickfoxField 
} from '../../shared/brickfox-schema';
import type { ProductInProject } from '../../shared/schema';

// Debug logging helper - only logs when DEBUG_MODE=true
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';
function debugLog(...args: any[]) {
  if (DEBUG_MODE) {
    console.log('[Brickfox Mapper DEBUG]', ...args);
  }
}

export interface BrickfoxRow {
  [key: string]: string | number | boolean | null;
}

export interface BrickfoxMapperOptions {
  supplierName?: string;
  customMapping?: BrickfoxExportMapping;
  enableAI?: boolean;
  fixedValues?: Record<string, string | number>;
  autoGenerateRules?: Record<string, {
    dependsOn: string;
    rule: string;
    fallback?: string;
  }>;
}

/**
 * Calculate sales price from purchase price
 * Formula: (EK * 2) + 19% = EK * 2 * 1.19
 * Rounded to 2 decimal places (e.g., 27.06 instead of 27.060599999999997)
 */
function calculateSalesPrice(purchasePrice: number): number {
  return Math.round(purchasePrice * 2 * 1.19 * 100) / 100;
}

/**
 * Parse weight from string (e.g., "150g" → 150, "1.5 kg" → 1500)
 */
function parseWeight(weight: string | number | null): number | null {
  if (weight === null || weight === undefined) return null;
  if (typeof weight === 'number') return weight;
  
  const str = weight.toString().toLowerCase().trim();
  
  // German decimal format handling:
  // - Comma = decimal separator
  // - Dot = thousand separator
  // Examples: "1.234,5 kg", "2.500 g", "1,5 kg", "101 g"
  let normalized = str;
  if (str.includes(',')) {
    // Has comma → German format with decimal
    // Remove all dots (thousand separators), replace comma with dot
    // "1.234,5 kg" → "1234.5", "39,75" → "39.75"
    normalized = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes('.')) {
    // Has dot but no comma → Could be German thousand separator OR English decimal
    // Most data has commas, but some numbers use dots as thousand separators
    
    // Extract just the number part
    const numPart = str.match(/[\d.]+/)?.[0] || str;
    
    // Heuristic: Dot followed by exactly 3 digits → German thousand separator
    // "2.500 g" → 2500g (thousand)
    // "2.5 kg" → 2.5kg (decimal)
    // "1.234 €" → 1234€ (thousand)
    const dotMatch = numPart.match(/\.(\d+)$/);
    if (dotMatch && dotMatch[1].length === 3) {
      // Exactly 3 digits after last dot → German thousand separator
      normalized = str.replace(/\./g, '');
    }
    // Otherwise keep dot as decimal: "1.5 kg", "0.75 kg", "10.99 €"
  }
  // No dot or comma: "101 g" → "101", "250 g" → "250"
  
  const match = normalized.match(/(\d+\.?\d*)\s*(g|kg|gram|kilogram)?/);
  if (!match) return null;
  
  const value = parseFloat(match[1]);
  const unit = match[2];
  
  if (unit && (unit.startsWith('kg') || unit.startsWith('kilogram'))) {
    return value * 1000; // Convert kg to g
  }
  
  return value;
}

/**
 * Parse price from string (e.g., "12,50 €" → 12.50, "$15.99" → 15.99)
 */
function parsePrice(price: string | number | null): number | null {
  if (price === null || price === undefined) return null;
  if (typeof price === 'number') return price;
  
  // Remove currency symbols and whitespace
  let str = price.toString().replace(/[^\d,.-]/g, '').trim();
  
  // German decimal format handling (same logic as parseWeight):
  // - Comma = decimal separator
  // - Dot = thousand separator
  // Examples: "1.234,56 €" → 1234.56, "39,75 €" → 39.75, "9,92 €" → 9.92
  let normalized = str;
  if (str.includes(',')) {
    // Has comma → German format with decimal
    // Remove all dots (thousand separators), replace comma with dot
    // "1.234,56" → "1234.56", "39,75" → "39.75"
    normalized = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes('.')) {
    // Has dot but no comma → Could be German thousand separator OR English decimal
    // Most data has commas, but some numbers use dots as thousand separators
    
    // Heuristic: Dot followed by exactly 3 digits → German thousand separator
    // "1.234 €" → 1234€ (thousand)
    // "2.500 €" → 2500€ (thousand)
    // "15.99 €" → 15.99€ (decimal, only 2 digits)
    const dotMatch = str.match(/\.(\d+)$/);
    if (dotMatch && dotMatch[1].length === 3) {
      // Exactly 3 digits after last dot → German thousand separator
      normalized = str.replace(/\./g, '');
    }
    // Otherwise keep dot as decimal: "15.99", "9.95"
  }
  
  const value = parseFloat(normalized);
  return isNaN(value) ? null : value;
}

/**
 * Intelligentes Auto-Mapping: Erkennt automatisch Felder aus den Produktdaten
 * basierend auf Label-Namen (z.B. "Produktbeschreibung", "VK (Verkaufspreis)", "Länge")
 */
function autoMapFieldByLabel(
  product: ProductInProject,
  brickfoxField: string
): string | number | boolean | null {
  if (!product.extractedData || product.extractedData.length === 0) {
    return null;
  }

  // Mapping von Brickfox-Feldern zu möglichen Label-Namen (case-insensitive)
  const labelMappings: Record<string, string[]> = {
    'p_item_number': ['artikelnummer', 'art.-nr', 'art.nr', 'artnr', 'item number', 'sku'],
    'p_name[de]': ['produktname', 'name', 'bezeichnung', 'product name', 'title'],
    'p_description[de]': ['produktbeschreibung', 'beschreibung', 'description', 'langtext', 'long text'],
    'v_ean': ['ean', 'ean-code', 'ean code', 'barcode', 'gtin'],
    'v_price[Eur]': ['vkprice', 'vk (verkaufspreis)', 'vk', 'verkaufspreis', 'uvp', 'preis', 'price', 'rrp'],
    'v_purchase_price': ['ekprice', 'ek-preis', 'ek', 'einkaufspreis', 'purchase price', 'cost'],
    'v_weight': ['gewicht', 'weight', 'netto-gewicht', 'bruttogewicht'],
    'v_width': ['breite', 'width', 'b'],
    'v_height': ['höhe', 'hoehe', 'height', 'h'],
    'v_depth': ['länge', 'laenge', 'tiefe', 'length', 'depth', 'l'],
    'v_brand': ['hersteller', 'marke', 'brand', 'manufacturer'],
  };

  const possibleLabels = labelMappings[brickfoxField];
  if (!possibleLabels) return null;

  // Suche nach passendem Label in extractedData
  for (const item of product.extractedData) {
    // Prüfe sowohl 'label' als auch 'key' Felder
    const labelLower = item.label ? item.label.toLowerCase().trim() : '';
    const keyLower = item.key ? item.key.toLowerCase().trim() : '';
    
    // Exakte Übereinstimmung oder enthält das Schlüsselwort
    for (const keyword of possibleLabels) {
      if (labelLower === keyword || labelLower.includes(keyword) ||
          keyLower === keyword || keyLower.includes(keyword)) {
        return item.value;
      }
    }
  }

  return null;
}

/**
 * Get value from product data using field mapping
 */
function getFieldValue(
  product: ProductInProject,
  mapping: BrickfoxExportMapping,
  brickfoxField: string,
  supplierName?: string
): string | number | boolean | null {
  const config = mapping[brickfoxField];
  const fieldMeta = getBrickfoxField(brickfoxField);
  if (!fieldMeta) return null;
  
  // SPECIAL CASE: p_item_number - Eigene Artikelnummer (bereits OHNE Bindestriche beim Scraping generiert)
  if (brickfoxField === 'p_item_number') {
    // articleNumber ist bereits im Format "ANS15200010" (ohne Bindestriche)
    let articleNumber = (product as any).articleNumber;
    
    if (!articleNumber && product.extractedData && product.extractedData.length > 0) {
      // Fallback: Auto-Mapping
      articleNumber = autoMapFieldByLabel(product, 'p_item_number');
    }
    
    debugLog(`[SPECIAL] p_item_number → Using articleNumber directly: "${articleNumber}"`);
    return articleNumber;
  }
  
  // SPECIAL CASE: v_manufacturers_item_number - Herstellerartikelnummer MIT Bindestrichen, OHNE ANS-Präfix
  if (brickfoxField === 'v_manufacturers_item_number') {
    // Verwende manufacturerArticleNumber (hat die Original-Bindestriche)
    let manufacturerArticleNumber = (product as any).manufacturerArticleNumber;
    
    if (!manufacturerArticleNumber && product.extractedData && product.extractedData.length > 0) {
      // Fallback: Auto-Mapping
      manufacturerArticleNumber = autoMapFieldByLabel(product, 'v_manufacturers_item_number');
    }
    
    if (manufacturerArticleNumber && typeof manufacturerArticleNumber === 'string') {
      debugLog(`[SPECIAL] v_manufacturers_item_number → Using manufacturerArticleNumber: "${manufacturerArticleNumber}"`);
      return manufacturerArticleNumber;
    }
    
    return manufacturerArticleNumber;
  }
  
  // SPECIAL CASE: p_description[de] soll IMMER Beschreibung verwenden (nicht Auto-Mapping!)
  if (brickfoxField === 'p_description[de]') {
    // Priority 1: htmlCode Feld (AI-generierter HTML-Code)
    const htmlCode = (product as any).htmlCode;
    if (htmlCode && htmlCode.trim()) {
      debugLog(`[SPECIAL] p_description[de] → htmlCode (${htmlCode.length} chars)`);
      return htmlCode;
    }
    
    // Priority 2: autoExtractedDescription aus extractedData
    if (product.extractedData && product.extractedData.length > 0) {
      const autoExtracted = product.extractedData.find((item: any) => 
        item.key === 'autoExtractedDescription'
      );
      if (autoExtracted && autoExtracted.value) {
        debugLog(`[SPECIAL] p_description[de] → autoExtractedDescription (${autoExtracted.value.length} chars)`);
        return autoExtracted.value;
      }
      
      // Priority 3: Fallback auf "Produktbeschreibung" Label
      const descItem = product.extractedData.find((item: any) => 
        item.label && item.label.toLowerCase().includes('produktbeschreibung')
      );
      if (descItem && descItem.value) {
        debugLog(`[SPECIAL] p_description[de] → Produktbeschreibung label (${descItem.value.length} chars)`);
        return descItem.value;
      }
    }
  }
  
  // SPECIAL CASE: p_image[1] bis p_image[10] - Extrahiere Bilder aus Original-URLs oder lokalen Pfaden
  if (brickfoxField.startsWith('p_image[')) {
    const imageIndex = parseInt(brickfoxField.match(/\[(\d+)\]/)?.[1] || '0') - 1; // p_image[1] → Index 0
    
    // PRIORITY 1: Original image URLs aus extractedData.originalImageUrls (gespeicherte URLs)
    // Diese sind die Original-URLs von der Lieferanten-Website
    if (product.extractedData && product.extractedData.length > 0) {
      const originalUrlsItem = product.extractedData.find((item: any) => 
        item.key === 'originalImageUrls'
      );
      if (originalUrlsItem && originalUrlsItem.value) {
        let originalUrls: string[] = [];
        
        // Parse JSON string to array
        if (typeof originalUrlsItem.value === 'string') {
          try {
            originalUrls = JSON.parse(originalUrlsItem.value);
          } catch (e) {
            // Fallback: komma-separierte Liste
            originalUrls = originalUrlsItem.value.split(',').map((p: string) => p.trim()).filter(Boolean);
          }
        } else if (Array.isArray(originalUrlsItem.value)) {
          originalUrls = originalUrlsItem.value.filter(Boolean);
        }
        
        if (originalUrls[imageIndex]) {
          debugLog(`[SPECIAL] ${brickfoxField} → Original URLs from extractedData[${imageIndex}]: ${originalUrls[imageIndex]}`);
          return originalUrls[imageIndex];
        }
      }
    }
    
    // PRIORITY 2: Fallback auf product.images (falls vorhanden, z.B. bei Live-Scraping ohne DB-Speicherung)
    const productImages = (product as any).images;
    if (productImages && Array.isArray(productImages) && productImages.length > 0) {
      if (productImages[imageIndex]) {
        debugLog(`[SPECIAL] ${brickfoxField} → product.images[${imageIndex}]: ${productImages[imageIndex]}`);
        return productImages[imageIndex];
      }
    }
    
    // PRIORITY 3: localImagePaths aus extractedData (lokale Pfade als letzter Fallback)
    // Nur wenn keine Original-URLs vorhanden sind, verwenden wir lokale Pfade
    if (product.extractedData && product.extractedData.length > 0) {
      const localImagesItem = product.extractedData.find((item: any) => 
        item.key === 'localImagePaths'
      );
      if (localImagesItem && localImagesItem.value) {
        // localImagePaths kann ein String "/path/to/image.jpg" oder ein Array sein
        let imagePaths: string[] = [];
        if (typeof localImagesItem.value === 'string') {
          // Einzelner Pfad oder komma-separierte Liste
          imagePaths = localImagesItem.value.split(',').map((p: string) => p.trim()).filter(Boolean);
        } else if (Array.isArray(localImagesItem.value)) {
          imagePaths = localImagesItem.value.filter(Boolean);
        }
        
        if (imagePaths[imageIndex]) {
          debugLog(`[SPECIAL] ${brickfoxField} → localImagePaths[${imageIndex}]: ${imagePaths[imageIndex]}`);
          return imagePaths[imageIndex];
        }
      }
    }
    
    // PRIORITY 3: Direkt aus product.extractedData nach "images" oder ähnlichen Feldern suchen
    if (product.extractedData && product.extractedData.length > 0) {
      const imagesItem = product.extractedData.find((item: any) => 
        item.key === 'images' || item.key === 'productImages' || item.key === 'downloadedImages'
      );
      if (imagesItem && imagesItem.value) {
        let images: string[] = [];
        if (typeof imagesItem.value === 'string') {
          images = imagesItem.value.split(',').map((p: string) => p.trim()).filter(Boolean);
        } else if (Array.isArray(imagesItem.value)) {
          images = imagesItem.value.filter(Boolean);
        }
        
        if (images[imageIndex]) {
          debugLog(`[SPECIAL] ${brickfoxField} → images[${imageIndex}]: ${images[imageIndex]}`);
          return images[imageIndex];
        }
      }
    }
    
    // Kein Bild für diesen Index gefunden
    return null;
  }
  
  // SPECIAL CASE: p_media[1][pdf] und p_media[2][pdf] - Extrahiere PDFs aus extractedData
  if (brickfoxField.startsWith('p_media[') && brickfoxField.endsWith('[pdf]')) {
    const mediaIndex = parseInt(brickfoxField.match(/\[(\d+)\]/)?.[1] || '0') - 1; // p_media[1][pdf] → Index 0
    
    // Extract PDFs from extractedData.pdfFiles
    if (product.extractedData && product.extractedData.length > 0) {
      const pdfFilesItem = product.extractedData.find((item: any) => 
        item.key === 'pdfFiles'
      );
      if (pdfFilesItem && pdfFilesItem.value) {
        let pdfUrls: string[] = [];
        try {
          // pdfFiles ist ein JSON-Array von URLs
          if (typeof pdfFilesItem.value === 'string') {
            pdfUrls = JSON.parse(pdfFilesItem.value);
          } else if (Array.isArray(pdfFilesItem.value)) {
            pdfUrls = pdfFilesItem.value;
          }
          
          if (pdfUrls[mediaIndex]) {
            debugLog(`[SPECIAL] ${brickfoxField} → pdfFiles[${mediaIndex}]: ${pdfUrls[mediaIndex]}`);
            return pdfUrls[mediaIndex];
          }
        } catch (error) {
          // Silently handle parse errors - pdfFiles might be a simple string URL instead of JSON array
          debugLog(`[INFO] pdfFiles is not a JSON array, treating as single value`);
        }
      }
    }
    
    // Kein PDF für diesen Index gefunden
    return null;
  }
  
  // Falls kein Config vorhanden, versuche Auto-Mapping
  if (!config) {
    const autoMappedValue = autoMapFieldByLabel(product, brickfoxField);
    if (autoMappedValue !== null && autoMappedValue !== undefined && autoMappedValue !== '') {
      let value: any = autoMappedValue;
      
      // Parse based on field type
      if (fieldMeta.type === 'number' || fieldMeta.key === 'v_weight') {
        value = parseWeight(value);
      } else if (fieldMeta.type === 'price') {
        value = parsePrice(value);
      }
      
      debugLog(`[AUTO-MAPPED] ${brickfoxField} → ${value}`);
      return value;
    }
    return fieldMeta.defaultValue || null;
  }
  
  // Special handling for v_supplier[Eur] - always use supplierName if available
  if (brickfoxField === 'v_supplier[Eur]') {
    return supplierName || config.value || fieldMeta.defaultValue || 'Unbekannt';
  }
  
  // Constant value
  if (config.source === 'constant') {
    return config.value ?? fieldMeta.defaultValue ?? null;
  }
  
  // Calculated value - PRIORITÄT: Berechnung ZUERST, dann Fallback auf extractedData
  if (config.source === 'calculated') {
    if (brickfoxField === 'v_price[Eur]') {
      // PRIORITY 1: Berechne VK aus EK (wenn EK vorhanden)
      const purchasePrice = getFieldValue(product, mapping, 'v_purchase_price', supplierName);
      if (typeof purchasePrice === 'number' && purchasePrice > 0) {
        const calculated = calculateSalesPrice(purchasePrice);
        debugLog(`[CALCULATED] v_price[Eur] → Calculated from EK ${purchasePrice}: ${calculated}`);
        return calculated;
      }
      
      // PRIORITY 2: Fallback auf vkPrice aus extractedData (nur wenn EK fehlt)
      const existingVkPrice = autoMapFieldByLabel(product, 'v_price[Eur]');
      if (existingVkPrice !== null && existingVkPrice !== undefined && existingVkPrice !== '') {
        let value: any = existingVkPrice;
        if (fieldMeta.type === 'price') {
          value = parsePrice(value);
        }
        debugLog(`[CALCULATED-FALLBACK] v_price[Eur] → Existing vkPrice from extractedData: ${value}`);
        return value;
      }
    }
    return null;
  }
  
  // Scraped value
  if (config.source === 'scraped' && config.field) {
    // Try direct product fields first
    let value: any = (product as any)[config.field];
    
    // If not found, try extractedData array (new format: [{key, value, type}])
    if (!value && product.extractedData && product.extractedData.length > 0) {
      const extracted = product.extractedData.find((item: any) => item.key === config.field);
      if (extracted) {
        value = (extracted as any).value;
      }
    }
    
    // FALLBACK: If still not found, try auto-mapping by label
    // This ensures ekPrice, vkPrice, marke etc. from PDF are recognized
    if (!value || value === null || value === undefined || value === '') {
      const autoMapped = autoMapFieldByLabel(product, brickfoxField);
      if (autoMapped !== null && autoMapped !== undefined && autoMapped !== '') {
        value = autoMapped;
        debugLog(`[SCRAPED-FALLBACK] ${brickfoxField} → Auto-mapped: ${value}`);
      }
    }
    
    // Debug logging - only when DEBUG_MODE=true
    debugLog(`Field: ${config.field}, Found value:`, value);
    
    // Parse based on field type
    if (fieldMeta.type === 'number' || fieldMeta.key === 'v_weight') {
      value = parseWeight(value);
    } else if (fieldMeta.type === 'price') {
      value = parsePrice(value);
    }
    
    return value ?? null;
  }
  
  // AI-generated values from customAttributes
  if (config.source === 'ai') {
    const customAttrs = product.customAttributes || [];
    
    // Map Brickfox field to AI custom attribute key
    const aiFieldMap: Record<string, string> = {
      'p_description[de]': 'ai_description',
      'v_customs_tariff_number': 'ai_customs_tariff_number',
      'v_customs_tariff_text': 'ai_customs_tariff_text',
    };
    
    const aiKey = aiFieldMap[brickfoxField];
    if (aiKey) {
      const aiAttr = customAttrs.find(a => a.key === aiKey);
      return aiAttr?.value || null;
    }
    
    return null;
  }
  
  return null;
}

/**
 * Generate auto-generated field value (e.g., category path from voltage)
 */
function generateAutoFieldValue(
  rule: {
    dependsOn: string;
    rule: string;
    fallback?: string;
  },
  product: ProductInProject
): string | null {
  if (!rule) return null;
  
  try {
    // Extract value from product's extractedData
    let dependsOnValue: string | null = null;
    
    if (product.extractedData && Array.isArray(product.extractedData)) {
      const attr = product.extractedData.find((item: any) => 
        item.key === rule.dependsOn || item.label === rule.dependsOn
      );
      if (attr) {
        dependsOnValue = attr.value?.toString();
      }
    }
    
    if (dependsOnValue) {
      // Replace template variables in rule (e.g., {{Nominalspannung (V)}})
      let result = rule.rule.replace(
        new RegExp(`\\{\\{${rule.dependsOn}\\}\\}`, 'g'),
        dependsOnValue
      );
      return result;
    } else if (rule.fallback) {
      return rule.fallback;
    }
  } catch (error) {
    console.error('[Auto-Generate] Error generating auto field:', error);
  }
  
  return rule.fallback || null;
}

/**
 * Transform a single product into Brickfox row(s)
 * Note: Most products have single variant, so we create one row per product
 */
export function mapProductToBrickfox(
  product: ProductInProject,
  options: BrickfoxMapperOptions = {}
): BrickfoxRow {
  const mapping = options.customMapping || DEFAULT_BRICKFOX_MAPPING;
  const row: BrickfoxRow = {};
  
  // Map all Brickfox fields
  for (const field of BRICKFOX_FIELDS) {
    const value = getFieldValue(product, mapping, field.key, options.supplierName);
    row[field.key] = value;
  }
  
  // Apply fixed values from mappingRules.json (if provided)
  if (options.fixedValues) {
    for (const [key, value] of Object.entries(options.fixedValues)) {
      row[key] = value;
    }
  }
  
  // Apply auto-generated fields (e.g., category path from voltage)
  if (options.autoGenerateRules) {
    for (const [fieldName, rule] of Object.entries(options.autoGenerateRules)) {
      const generatedValue = generateAutoFieldValue(rule, product);
      if (generatedValue) {
        row[fieldName] = generatedValue;
      }
    }
  }
  
  return row;
}

/**
 * Transform multiple products into Brickfox rows
 */
export function mapProductsToBrickfox(
  products: ProductInProject[],
  options: BrickfoxMapperOptions = {}
): BrickfoxRow[] {
  return products.map(product => mapProductToBrickfox(product, options));
}

/**
 * Get column headers in correct Brickfox order
 */
export function getBrickfoxColumns(): string[] {
  return BRICKFOX_FIELDS.map(f => f.key);
}

/**
 * Convert Brickfox rows to CSV string
 */
export function brickfoxRowsToCSV(rows: BrickfoxRow[]): string {
  if (rows.length === 0) return '';
  
  const columns = getBrickfoxColumns();
  const header = columns.join(',');
  
  const dataRows = rows.map(row => {
    return columns.map(col => {
      const value = row[col];
      
      if (value === null || value === undefined) return '';
      
      // Handle booleans
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }
      
      // Handle numbers - convert to German decimal format (comma instead of dot)
      if (typeof value === 'number') {
        // Convert to German format: 68.95 → "68,95"
        return value.toString().replace('.', ',');
      }
      
      // Handle strings - escape quotes and wrap if contains comma/quotes/newline
      const str = value.toString();
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      
      return str;
    }).join(',');
  });
  
  return [header, ...dataRows].join('\n');
}
