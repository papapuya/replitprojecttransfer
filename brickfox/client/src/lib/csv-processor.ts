import { Product } from "@shared/schema";
import Papa from "papaparse";

interface RawCSVRow {
  [key: string]: string;
}

export interface CSVParseResult {
  data: RawCSVRow[];
  warnings: Papa.ParseError[];
}

/**
 * Parse a CSV line respecting quotes and delimiters
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Try to read file with different encodings using TextDecoder
 */
async function readFileWithEncoding(file: File): Promise<string> {
  // Read as ArrayBuffer first for proper encoding detection
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  let text = '';
  
  // First try: ISO-8859-1 (Western European) - common for German/European CSVs
  try {
    text = new TextDecoder('iso-8859-1').decode(uint8Array);
    
    // Check for UTF-8 BOM or UTF-8 specific characters
    if (text.charCodeAt(0) === 0xFEFF) {
      // Has UTF-8 BOM, re-decode as UTF-8
      text = new TextDecoder('utf-8').decode(uint8Array);
      text = text.slice(1); // Remove BOM
      console.log('[CSV] Detected UTF-8 with BOM');
    } else {
      // Check if ISO-8859-1 looks correct (has valid Western European chars)
      const hasWesternEuropeanChars = /[äöüßÄÖÜ€àâéèêëîïôùûüçñ]/g.test(text);
      if (hasWesternEuropeanChars) {
        console.log('[CSV] Detected Western European encoding (ISO-8859-1)');
      } else {
        // Fallback to UTF-8 if no Western European chars found
        const utf8Text = new TextDecoder('utf-8').decode(uint8Array);
        if (utf8Text.charCodeAt(0) === 0xFEFF) {
          text = utf8Text.slice(1);
        } else {
          text = utf8Text;
        }
        console.log('[CSV] Detected UTF-8 encoding');
      }
    }
  } catch (err: any) {
    // Last resort: UTF-8
    text = new TextDecoder('utf-8').decode(uint8Array);
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.slice(1);
    }
    console.log('[CSV] Fallback to UTF-8 encoding');
  }
  
  // Remove surrounding quotes from each line if present
  // This fixes files where each line is wrapped in quotes
  const lines = text.split('\n');
  const cleanedLines = lines.map(line => {
    line = line.trim();
    // Remove quotes if line starts and ends with them
    if (line.startsWith('"') && line.endsWith('"')) {
      return line.slice(1, -1);
    }
    return line;
  });
  
  const cleanedText = cleanedLines.join('\n');
  return cleanedText;
}

/**
 * Detect CSV delimiter by analyzing the first few lines
 */
function detectDelimiter(text: string): string {
  const lines = text.split('\n').slice(0, 3); // Check first 3 lines
  const delimiters = [';', ',', '\t', '|'];
  
  const scores = delimiters.map(delimiter => {
    const counts = lines.map(line => (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length);
    const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.every(c => c === counts[0]) ? 0 : 1; // Prefer consistent counts
    return { delimiter, score: avgCount, variance };
  });
  
  // Sort by score (highest count) and consistency (lowest variance)
  scores.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.variance - b.variance;
  });
  
  return scores[0].score > 0 ? scores[0].delimiter : ',';
}

/**
 * Parse CSV file and return raw data rows using PapaParse
 */
export async function parseCSV(file: File): Promise<CSVParseResult> {
  try {
    const text = await readFileWithEncoding(file);
    
    // Detect delimiter
    const delimiter = detectDelimiter(text);
    
    console.log(`[CSV] Using delimiter: "${delimiter === '\t' ? 'TAB' : delimiter}"`);
    
    // Use PapaParse to parse the CSV with multiline support
    const parseConfig: Papa.ParseConfig = {
      header: true,
      delimiter: delimiter,
      skipEmptyLines: 'greedy', // Skip all empty lines including whitespace-only
      transformHeader: (header: string) => header.trim(),
      transform: (value: string) => value.trim(),
      dynamicTyping: false,
      quoteChar: '"',           // Standard quote character
      escapeChar: '"',          // Standard escape for quotes
      newline: undefined,       // Auto-detect newline
      comments: false,          // No comment lines
      fastMode: false           // Disable fast mode for proper quote handling
    };
    
    const result = Papa.parse<RawCSVRow>(text, parseConfig);
    
    if (result.errors && result.errors.length > 0) {
      console.warn(`[CSV] Parse Warnungen: ${result.errors.length} Warnungen gefunden`);
      // Log first few errors for debugging
      result.errors.slice(0, 5).forEach((err, i) => {
        console.warn(`[CSV] Error ${i + 1}: ${err.message} (row ${err.row})`);
      });
    }
    
    if (!result.data || result.data.length === 0) {
      throw new Error('CSV enthält keine Daten');
    }
    
    // Filter out rows that don't have the expected number of columns
    // This removes broken rows caused by malformed multiline data
    const headers = Object.keys(result.data[0]);
    const expectedColumnCount = headers.length;
    
    const validRows = result.data.filter((row, index) => {
      const rowColumnCount = Object.keys(row).length;
      
      // Skip rows with too few columns (likely broken by line breaks)
      if (rowColumnCount < expectedColumnCount * 0.5) {
        console.warn(`[CSV] Skipping row ${index + 1}: Only ${rowColumnCount}/${expectedColumnCount} columns`);
        return false;
      }
      
      // Skip rows where most values are empty (likely part of a multiline field)
      const nonEmptyValues = Object.values(row).filter(v => v && v.toString().trim().length > 0);
      if (nonEmptyValues.length < 2) {
        console.warn(`[CSV] Skipping row ${index + 1}: Only ${nonEmptyValues.length} non-empty values`);
        return false;
      }
      
      return true;
    });
    
    console.log(`[CSV] Parsed ${result.data.length} rows, ${validRows.length} valid after filtering`);
    console.log(`[CSV] Columns: ${headers.slice(0, 5).join(', ')}...`);
    
    return {
      data: validRows,
      warnings: result.errors || []
    };
  } catch (error) {
    console.error('CSV Parse Fehler:', error);
    throw new Error(`Fehler beim Parsen der CSV: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
  }
}

/**
 * Categorize product based on name and description
 */
function categorizeProduct(name: string, description: string): string {
  const combinedText = (name + ' ' + description).toLowerCase();
  
  // Specific categories (highest priority)
  if (combinedText.match(/\b(akku|battery|batterie|hochleistungs-akku|li-ion|lithium|cell)\b/i)) {
    return 'Akku';
  }
  if (combinedText.match(/\b(netzteil|notebook netzteil|notebook-netzteil|power supply|ac adapter|netzadapter|stromversorgung)\b/i)) {
    return 'Notebook Netzteil';
  }
  if (combinedText.match(/\b(kfz|auto|car)\b/i) && combinedText.match(/\b(ladekabel|ladegeraet|charger)\b/i)) {
    return 'KFZ Ladekabel';
  }
  if (combinedText.match(/\b(ladegeraet|ladestation|charger|charging station|lader)\b/i)) {
    return 'Ladegerät';
  }
  if (combinedText.match(/\b(speicherkarte|memory card|sd|sdhc|sdxc|microsd)\b/i)) {
    return 'Speicherkarte';
  }
  if (combinedText.match(/\b(hdmi)\b/i) && combinedText.match(/\b(umschaltbox|switch)\b/i)) {
    return 'HDMI Umschaltbox';
  }
  if (combinedText.match(/\b(hdmi)\b/i) && combinedText.match(/\b(konverter|converter|adapter)\b/i)) {
    return 'HDMI Konverter';
  }
  if (combinedText.match(/\b(tv|fernseh)\b/i) && combinedText.match(/\b(kupplung|verteiler)\b/i)) {
    return 'TV Kupplung';
  }
  if (combinedText.match(/\b(dockingstation|docking station|dock)\b/i)) {
    return 'Dockingstation';
  }
  if (combinedText.match(/\b(led)\b/i) && combinedText.match(/\b(lampe|leuchte|light)\b/i)) {
    return 'LED Lampe';
  }
  if (combinedText.match(/\b(adapter|stromadapter)\b/i)) {
    return 'Adapter';
  }
  if (combinedText.match(/\b(kabel|cable|stromkabel|netzkabel)\b/i)) {
    return 'Kabel';
  }
  
  // Fallback: use first 2 words from product name
  if (name) {
    const words = name.split(/[\s,;.\-]+/).filter(w => w.length > 2);
    if (words.length > 0) {
      return words.slice(0, 2).join(' ').trim();
    }
  }
  
  return 'Zubehör';
}

/**
 * Extract model numbers from text
 */
function extractModelNumbers(text: string): string[] {
  const modelPattern = /\b[A-Z0-9]{3,}[\dA-Z\-\/]{0,}\b/g;
  const matches = text.match(modelPattern) || [];
  
  // Filter out technical values, years, and invalid patterns
  const validModels = matches.filter(m => 
    m.length >= 3 && m.length <= 20 && 
    (/\d/.test(m) || m.match(/^(SDHC|SDXC|USB|HDMI|LED)$/i)) &&
    !m.match(/^(DE|EN|FR|IT|ES|NL|PL|VGA|DVI|AUX|RGB)$/i) &&
    !m.match(/^\d+V$/i) &&
    !m.match(/^\d+W$/i) &&
    !m.match(/^\d+Wh$/i) &&
    !m.match(/^\d+mAh$/i) &&
    !m.match(/^\d+Ah$/i) &&
    !m.match(/^(19|20)\d{2}$/i)  // Filter out years like 2019, 2020, 2021, etc.
  );
  
  return Array.from(new Set(validModels));
}

/**
 * Find column name from CSV headers using multiple possible variants
 */
function findColumn(row: RawCSVRow, possibleNames: string[]): string {
  const headers = Object.keys(row);
  
  for (const name of possibleNames) {
    // Exact match (case-insensitive)
    const exactMatch = headers.find(h => h.toLowerCase() === name.toLowerCase());
    if (exactMatch) return exactMatch;
    
    // Partial match (case-insensitive)
    const partialMatch = headers.find(h => 
      h.toLowerCase().includes(name.toLowerCase()) || 
      name.toLowerCase().includes(h.toLowerCase())
    );
    if (partialMatch) return partialMatch;
  }
  
  return '';
}

/**
 * Generate MediaMarkt optimized title V1
 * Format: [Produkttyp] [Modellnummer(n)] - NO brand names!
 * Examples: "Notebook Netzteil K42JQ", "Akku P210 P290", "Dockingstation USB Q10"
 */
function generateMarketplaceTitle(name: string, description: string): string {
  const combinedText = (name + ' ' + description).toLowerCase();
  
  // Determine product type (NO brand names!)
  let productType = '';
  
  if (combinedText.match(/\b(netzteil|notebook netzteil|notebook-netzteil|power supply|ac adapter|netzadapter|stromversorgung)\b/i)) {
    productType = 'Notebook Netzteil';
  } else if (combinedText.match(/\b(akku|battery|batterie|hochleistungs-akku|li-ion|lithium|cell)\b/i)) {
    productType = 'Akku';
  } else if (combinedText.match(/\b(kfz|auto|car)\b/i) && combinedText.match(/\b(ladekabel|ladegeraet|charger)\b/i)) {
    productType = 'KFZ Ladekabel';
  } else if (combinedText.match(/\b(ladegeraet|ladestation|charger|charging station|lader)\b/i)) {
    productType = 'Ladegerät';
  } else if (combinedText.match(/\b(speicherkarte|memory card|sd|sdhc|sdxc|microsd)\b/i)) {
    productType = 'Speicherkarte';
  } else if (combinedText.match(/\b(hdmi)\b/i) && combinedText.match(/\b(umschaltbox|switch)\b/i)) {
    productType = 'HDMI Umschaltbox';
  } else if (combinedText.match(/\b(hdmi)\b/i) && combinedText.match(/\b(konverter|converter|adapter)\b/i)) {
    productType = 'HDMI Konverter';
  } else if (combinedText.match(/\b(dockingstation|docking station|dock)\b/i)) {
    productType = 'Dockingstation';
  } else if (combinedText.match(/\b(led)\b/i) && combinedText.match(/\b(lampe|leuchte|light)\b/i)) {
    productType = 'LED Lampe';
  } else if (combinedText.match(/\b(adapter|stromadapter)\b/i)) {
    productType = 'Adapter';
  } else if (combinedText.match(/\b(kabel|cable|stromkabel|netzkabel)\b/i)) {
    productType = 'Kabel';
  } else if (combinedText.match(/\b(tv|fernseh)\b/i) && combinedText.match(/\b(kupplung|verteiler)\b/i)) {
    productType = 'TV Kupplung';
  } else {
    // Fallback: Use first 2 words from name, but filter out brand names
    const words = name.split(/[\s,;.\-]+/).filter(w => {
      const lower = w.toLowerCase();
      // Filter out common brand names and unwanted words
      return w.length > 2 && 
        !lower.match(/^(asus|hp|dell|lenovo|acer|samsung|apple|sony|lg|toshiba|msi|asus|ibm|fujitsu|medion|für|fuer|kein|original|passend|geeignet)$/i);
    });
    productType = words.slice(0, 2).join(' ');
  }
  
  // Extract model numbers (alphanumeric codes)
  const models = extractModelNumbers(name + ' ' + description);
  
  // Build title: ProductType + Model Numbers
  let title = productType;
  if (models.length > 0) {
    // Add up to 3 model numbers
    const modelStr = models.slice(0, 3).join(' ');
    title += ' ' + modelStr;
  }
  
  // Clean up whitespace
  title = title.replace(/\s+/g, ' ').trim();
  
  // Limit length to 100 characters
  if (title.length > 100) {
    title = title.substring(0, 100).trim();
    const lastSpace = title.lastIndexOf(' ');
    if (lastSpace > 80) {
      title = title.substring(0, lastSpace);
    }
  }
  
  return title;
}

/**
 * Generate MediaMarkt optimized title V2 (follows TTL and TTB rules)
 * Format: ONLY model numbers - NO product type, NO brand names!
 * MediaMarkt automatically adds product type and attributes.
 * Examples: "K42JQ", "P210 P290", "USB Q10"
 */
function generateMarketplaceTitleV2(name: string, description: string): string {
  // Extract model numbers only
  const models = extractModelNumbers(name + ' ' + description);
  
  if (models.length === 0) {
    // If no models found, try to extract meaningful words from name (no brands)
    const words = name.split(/[\s,;.\-]+/).filter(w => {
      const lower = w.toLowerCase();
      return w.length > 2 && 
        !lower.match(/^(asus|hp|dell|lenovo|acer|samsung|apple|sony|lg|toshiba|msi|ibm|fujitsu|medion|netzteil|akku|für|fuer|kein|original|passend|geeignet|notebook|laptop|charger|adapter|cable|kabel)$/i);
    });
    
    if (words.length > 0) {
      return words.slice(0, 3).join(' ').trim();
    }
    
    return '';
  }
  
  // Build title: ONLY Model Numbers (up to 3)
  let title = models.slice(0, 3).join(' ');
  
  // Clean up whitespace
  title = title.replace(/\s+/g, ' ').trim();
  
  // Limit length to 80 characters (shorter for MediaMarkt)
  if (title.length > 80) {
    title = title.substring(0, 80).trim();
    const lastSpace = title.lastIndexOf(' ');
    if (lastSpace > 60) {
      title = title.substring(0, lastSpace);
    }
  }
  
  return title;
}

/**
 * Extract Verpackungseinheit from description
 */
function extractVerpackungseinheit(description: string): string {
  // Look for patterns like "1 Stück", "2er Pack", "10-er Set", etc.
  const patterns = [
    /(\d+)\s*(?:er)?[\s-]*(?:Pack|Set|Stück|Stuck|Stueck|pcs|pieces|pc)/i,
    /(?:Pack|Set)\s*(?:mit|zu|a)\s*(\d+)/i,
    /(\d+)[\s-]*teilig/i,
    /Einzelstueck|Einzelstück/i
  ];
  
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      if (match[0].match(/Einzelstueck|Einzelstück/i)) {
        return '1 Stück';
      }
      if (match[1]) {
        return `${match[1]} Stück`;
      }
    }
  }
  
  return '';
}

/**
 * Extract Lieferumfang from description
 */
function extractLieferumfang(description: string): string {
  // Look for sections mentioning "Lieferumfang", "enthält", "inkl.", etc.
  const lieferumfangPatterns = [
    /Lieferumfang:\s*([^.;]+)/i,
    /Im Lieferumfang enthalten:\s*([^.;]+)/i,
    /Enthält:\s*([^.;]+)/i,
    /Inklusive:\s*([^.;]+)/i,
    /inkl\.\s*([^.;]+)/i
  ];
  
  for (const pattern of lieferumfangPatterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      let umfang = match[1].trim();
      // Clean up and limit length
      if (umfang.length > 200) {
        umfang = umfang.substring(0, 200).trim();
        const lastComma = umfang.lastIndexOf(',');
        if (lastComma > 150) {
          umfang = umfang.substring(0, lastComma);
        }
      }
      return umfang;
    }
  }
  
  return '';
}

/**
 * Clean HTML tags and decode HTML entities
 */
function cleanHTML(text: string): string {
  if (!text) return '';
  
  // Remove script and style tags with their content
  let cleaned = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  
  // Remove style attributes from HTML tags (e.g., style="font-family: tahoma...")
  cleaned = cleaned.replace(/\s+style\s*=\s*"[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+style\s*=\s*'[^']*'/gi, '');
  
  // Remove all other HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, ' ');
  
  // Decode common HTML entities
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&nbsp': ' ',
    '&amp;': '&',
    '&amp': '&',
    '&lt;': '<',
    '&lt': '<',
    '&gt;': '>',
    '&gt': '>',
    '&quot;': '"',
    '&quot': '"',
    '&apos;': "'",
    '&apos': "'",
    '&#39;': "'",
    '&#39': "'",
    '&auml;': 'ä',
    '&ouml;': 'ö',
    '&uuml;': 'ü',
    '&Auml;': 'Ä',
    '&Ouml;': 'Ö',
    '&Uuml;': 'Ü',
    '&szlig;': 'ß',
    '&euro;': '€'
  };
  
  // Replace all HTML entities
  Object.keys(entities).forEach(entity => {
    const regex = new RegExp(entity, 'gi');
    cleaned = cleaned.replace(regex, entities[entity]);
  });
  
  // Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

/**
 * Enrich raw CSV data with categorization and technical specs
 */
export function enrichProducts(rawData: RawCSVRow[]): Product[] {
  const enriched: Product[] = [];
  
  // Find the correct column names from the first row
  if (rawData.length === 0) {
    return enriched;
  }
  
  const firstRow = rawData[0];
  const skuColumn = findColumn(firstRow, ['Shop SKU', 'SKU', 'Artikelnummer', 'p_item_number', 'Item Number', 'Article Number']);
  const titleColumn = findColumn(firstRow, ['Titel (DE)', 'Title', 'Produktname', 'p_name[de]', 'Product Name', 'Name']);
  const descColumn = findColumn(firstRow, ['Produktbeschreibung (DE)', 'Description', 'Beschreibung', 'p_description[de]', 'Product Description']);
  const brandColumn = findColumn(firstRow, ['Brand', 'Marke', 'p_group_path[de]', 'Hersteller', 'Manufacturer']);
  
  
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    
    // Debug: Log first 3 rows to see what's in the SKU column
    if (i < 3) {
    }
    
    // Clean all text fields from HTML tags and entities
    let artikelnummer = cleanHTML(row[skuColumn] || '');
    
    // Extra cleaning for SKU: Remove everything except alphanumeric, dash, underscore
    // This removes any remaining CSS, HTML, or special characters
    artikelnummer = artikelnummer.replace(/[^a-zA-Z0-9\-_]/g, '').trim();
    
    const produktname = cleanHTML(row[titleColumn] || '');
    const produktbeschreibung = row[descColumn] || '';
    const marke = cleanHTML(row[brandColumn] || '');
    
    // Debug: Log cleaned value
    if (i < 3) {
    }
    
    // Clean HTML tags and entities from description
    const cleanBeschreibung = cleanHTML(produktbeschreibung);
    
    // Extract technical specifications
    // Preserve original voltage string for ranges, extract single values
    let spannung = '';
    const voltageRangeMatch = produktbeschreibung.match(/\d+[,.]?\d*\s*(?:bis|-|to)\s*\d+[,.]?\d*\s*(?:Volt|V)(?!\w)/i);
    if (voltageRangeMatch) {
      // Preserve the exact original range string
      spannung = voltageRangeMatch[0].trim();
    } else {
      // Single voltage value - extract and format
      const spannungMatch = produktbeschreibung.match(/(\d+[,.]?\d*)\s*(?:Volt|V)(?!\w)/i);
      if (spannungMatch) {
        const value = spannungMatch[1];
        spannung = value + ' V';
      }
    }
    
    const kapazitaetMatch = produktbeschreibung.match(/(\d+)\s*mAh/i);
    const kapazitaet = kapazitaetMatch ? kapazitaetMatch[1] + ' mAh' : '';
    
    const wattMatch = produktbeschreibung.match(/(\d+)\s*W(?!h)/i);
    const energiegehalt = wattMatch ? wattMatch[1] + ' W' : '';
    
    const whMatch = produktbeschreibung.match(/(\d+[,.]?\d*)\s*Wh/i);
    const leistung = whMatch ? whMatch[1].replace(',', '.') + ' Wh' : '';
    
    // Extract Verpackungseinheit and Lieferumfang
    const verpackungseinheit = extractVerpackungseinheit(produktbeschreibung);
    const lieferumfang = extractLieferumfang(produktbeschreibung);
    
    // Generate marketplace titles (both versions)
    const titelMarktplatz = generateMarketplaceTitle(produktname, cleanBeschreibung);
    const titelMarktplatzV2 = generateMarketplaceTitleV2(produktname, cleanBeschreibung);
    
    enriched.push({
      id: i,
      sku: artikelnummer,
      titel: produktname,
      produktbeschreibung: cleanBeschreibung,
      marke: marke,
      titel_marktplatz: titelMarktplatz,
      titel_marktplatz_v2: titelMarktplatzV2,
      spannung: spannung,
      kapazitaet: kapazitaet,
      energiegehalt: energiegehalt,
      leistung: leistung,
      verpackungseinheit: verpackungseinheit,
      lieferumfang: lieferumfang,
    });
    
    if (i % 500 === 0 && i > 0) {
    }
  }
  
  // Filter out empty descriptions and CSV header rows
  const filtered = enriched.filter(item => {
    // Remove rows with empty descriptions
    if (item.produktbeschreibung.length === 0) return false;
    
    // Remove CSV header row (e.g., SKU = "SHOP_SKU" or "p_item_number")
    const skuUpper = item.sku.toUpperCase();
    if (skuUpper === 'SHOP_SKU' || skuUpper === 'P_ITEM_NUMBER' || skuUpper === 'SKU' || skuUpper === 'ARTIKELNUMMER') {
      return false;
    }
    
    // Remove rows where title looks like a header (e.g., "TITLE" or "Product_Description")
    const titleUpper = item.titel.toUpperCase();
    if (titleUpper === 'TITLE' || titleUpper === 'PRODUKTNAME' || titleUpper === 'P_NAME[DE]') {
      return false;
    }
    
    // Remove rows where description looks like a header (e.g., "Product_Description")
    const descUpper = item.produktbeschreibung.toUpperCase();
    if (descUpper === 'PRODUCT_DESCRIPTION' || descUpper === 'PRODUKTBESCHREIBUNG' || descUpper === 'P_DESCRIPTION[DE]' || descUpper === 'DESCRIPTION') {
      return false;
    }
    
    return true;
  });
  
  // Detect duplicates by SKU
  const skuCounts: Record<string, number> = {};
  filtered.forEach(item => {
    if (item.sku) {
      skuCounts[item.sku] = (skuCounts[item.sku] || 0) + 1;
    }
  });
  
  const withDuplicates = filtered.map(item => ({
    ...item,
    isDuplicate: item.sku ? skuCounts[item.sku] > 1 : false,
  }));
  
  return withDuplicates;
}

export interface ExportColumn {
  key: string;
  label: string;
  enabled: boolean;
}

/**
 * Export products to CSV using PapaParse library
 */
export function exportToCSV(products: Product[], selectedColumns: ExportColumn[]): void {
  try {
    // Map column keys to product properties and export labels
    const columnMapping: Record<string, { property: keyof Product; label: string }> = {
      'sku': { property: 'sku', label: 'Artikelnummer' },
      'titel': { property: 'titel', label: 'Produktname_Brickfox' },
      'titel_marktplatz': { property: 'titel_marktplatz', label: 'Produktname_MediaMarkt_V1' },
      'titel_marktplatz_v2': { property: 'titel_marktplatz_v2', label: 'Produktname_MediaMarkt_V2' },
      'energiegehalt': { property: 'energiegehalt', label: 'Energiegehalt_W' },
      'spannung': { property: 'spannung', label: 'Spannung_V' },
      'kapazitaet': { property: 'kapazitaet', label: 'Kapazitaet_mAh' },
      'leistung': { property: 'leistung', label: 'Leistung_Wh' },
      'verpackungseinheit': { property: 'verpackungseinheit', label: 'Verpackungseinheit' },
      'lieferumfang': { property: 'lieferumfang', label: 'Lieferumfang' },
    };

    // Build data with only selected columns
    const data = products.map(row => {
      const exportRow: Record<string, string> = {};
      selectedColumns.forEach(col => {
        const mapping = columnMapping[col.key];
        if (mapping) {
          exportRow[mapping.label] = (row[mapping.property] as string) || '';
        }
      });
      return exportRow;
    });
    
    // Use PapaParse to generate CSV with proper formatting
    const csv = Papa.unparse(data, {
      delimiter: ';',
      header: true,
      quotes: true,
      quoteChar: '"',
      escapeChar: '"',
      newline: '\r\n'
    });
    
    // Add BOM for proper encoding in Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = `mediamarkt_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Cleanup
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
    
  } catch (error) {
    console.error('Download-Fehler:', error);
    throw new Error('Fehler beim Herunterladen der CSV-Datei');
  }
}
