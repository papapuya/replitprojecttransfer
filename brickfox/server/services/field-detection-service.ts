import { supabaseStorage } from '../supabase-storage';

/**
 * Auto-Detection Service
 * Extracts available fields from recent products (URL Scraper or CSV)
 */

export interface DetectedField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'array' | 'object' | 'url';
  sampleValue?: any;
  count: number;
}

/**
 * Detect fields from URL Scraper products
 */
export async function detectFieldsFromUrlScraper(
  supplierId: string,
  userId: string,
  limit: number = 10
): Promise<DetectedField[]> {
  try {
    const user = await supabaseStorage.getUserById(userId);
    if (!user?.tenantId) {
      console.warn('[Field Detection] User has no tenant ID');
      return [];
    }

    const projectsResponse = await supabaseStorage.getProjectsByUserId(userId);
    if (!projectsResponse || projectsResponse.length === 0) {
      console.warn('[Field Detection] No projects found for user');
      return [];
    }

    let allProducts: any[] = [];
    for (const project of projectsResponse.slice(0, 5)) {
      const projectProducts = await supabaseStorage.getProducts(project.id, userId);
      allProducts = allProducts.concat(projectProducts || []);
    }

    if (allProducts.length === 0) {
      console.warn('[Field Detection] No products found in user projects');
      return [];
    }

    const urlScraperProducts = allProducts.filter(p => 
      p.extractedData && Array.isArray(p.extractedData) && p.extractedData.length > 0
    ).slice(0, limit);

    if (urlScraperProducts.length === 0) {
      return [];
    }

    const fieldMap = new Map<string, { count: number; type: string; samples: any[] }>();

    urlScraperProducts.forEach(product => {
      if (!product.extractedData) return;

      extractFieldsRecursive(product.extractedData, '', fieldMap);

      if (product.name) {
        addOrUpdateField(fieldMap, 'name', product.name, 'string');
      }
      if (product.exactProductName) {
        addOrUpdateField(fieldMap, 'exactProductName', product.exactProductName, 'string');
      }
      if (product.articleNumber) {
        addOrUpdateField(fieldMap, 'articleNumber', product.articleNumber, 'string');
      }
      if (product.customAttributes) {
        extractFieldsRecursive(product.customAttributes, 'customAttributes', fieldMap);
      }
    });

    const detectedFields: DetectedField[] = [];
    
    fieldMap.forEach((value, key) => {
      // Filtere NUR sehr spezifische technische Metadaten-Felder aus:
      // - Array-Index-Eigenschaften die GENAU auf .key, .type, .label enden
      // - Beispiel: FILTERN: "[0].key", "[1].type", "[2].label"
      // - Beispiel: BEHALTEN: "preis", "ean", "beschreibung", "hersteller"
      const isArrayMetadata = /\[\d+\]\.(key|type|label)$/i.test(key);
      
      if (!isArrayMetadata) {
        detectedFields.push({
          key,
          label: formatFieldLabel(key),
          type: value.type as any,
          sampleValue: value.samples[0],
          count: value.count,
        });
      }
    });

    return detectedFields.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  } catch (error) {
    console.error('[Field Detection URL Scraper] Error:', error);
    return [];
  }
}

/**
 * Detect fields from CSV products
 */
export async function detectFieldsFromCSV(
  projectId?: string,
  userId?: string,
  limit: number = 10
): Promise<DetectedField[]> {
  try {
    if (!projectId || !userId) {
      return [];
    }

    const products = await supabaseStorage.getProducts(projectId, userId);
    if (!products || products.length === 0) {
      return [];
    }

    const csvProducts = products.filter(p => 
      p.extractedData && typeof p.extractedData === 'object'
    ).slice(0, limit);

    if (csvProducts.length === 0) {
      return [];
    }

    const fieldMap = new Map<string, { count: number; type: string; samples: any[] }>();

    csvProducts.forEach(product => {
      if (!product.extractedData) return;

      if (Array.isArray(product.extractedData)) {
        product.extractedData.forEach((item: any) => {
          if (typeof item === 'object') {
            Object.keys(item).forEach(key => {
              addOrUpdateField(fieldMap, key, item[key], detectType(item[key]));
            });
          }
        });
      } else if (typeof product.extractedData === 'object') {
        Object.keys(product.extractedData).forEach(key => {
          addOrUpdateField(fieldMap, key, (product.extractedData as any)[key], detectType((product.extractedData as any)[key]));
        });
      }
    });

    const detectedFields: DetectedField[] = [];
    
    fieldMap.forEach((value, key) => {
      // Für CSV: Keine Filterung nötig, da CSV normalerweise saubere Spalten hat
      detectedFields.push({
        key,
        label: formatFieldLabel(key),
        type: value.type as any,
        sampleValue: value.samples[0],
        count: value.count,
      });
    });

    return detectedFields.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  } catch (error) {
    console.error('[Field Detection CSV] Error:', error);
    return [];
  }
}

function extractFieldsRecursive(
  obj: any,
  prefix: string,
  fieldMap: Map<string, { count: number; type: string; samples: any[] }>
) {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      if (typeof item === 'object' && item !== null) {
        // SPECIAL CASE: If item has 'label' and 'value', use label as field name
        if (item.label && 'value' in item) {
          const fieldName = item.label;
          const fieldValue = item.value;
          const fieldType = item.type || detectType(fieldValue);
          addOrUpdateField(fieldMap, fieldName, fieldValue, fieldType);
        } else {
          extractFieldsRecursive(item, prefix ? `${prefix}[${index}]` : `[${index}]`, fieldMap);
        }
      } else {
        const key = prefix ? `${prefix}[${index}]` : `[${index}]`;
        addOrUpdateField(fieldMap, key, item, detectType(item));
      }
    });
  } else {
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (value !== null && typeof value === 'object') {
        extractFieldsRecursive(value, fullKey, fieldMap);
      } else {
        addOrUpdateField(fieldMap, fullKey, value, detectType(value));
      }
    });
  }
}

function addOrUpdateField(
  fieldMap: Map<string, { count: number; type: string; samples: any[] }>,
  key: string,
  value: any,
  type: string
) {
  const existing = fieldMap.get(key);
  if (existing) {
    existing.count++;
    if (existing.samples.length < 3 && !existing.samples.includes(value)) {
      existing.samples.push(value);
    }
  } else {
    fieldMap.set(key, { count: 1, type, samples: [value] });
  }
}

function detectType(value: any): string {
  if (value === null || value === undefined) return 'string';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') {
    if (value.match(/^https?:\/\//)) return 'url';
  }
  return 'string';
}

function formatFieldLabel(key: string): string {
  // Common field mappings for better labels
  const fieldLabels: Record<string, string> = {
    // Basis-Daten
    'ean': 'EAN',
    'articleNumber': 'Artikelnummer',
    'productName': 'Produktname',
    'name': 'Produktname',
    'exactProductName': 'Exakter Produktname',
    
    // Preise
    'price': 'Preis',
    'ekPrice': 'EK-Preis',
    'vkPrice': 'VK-Preis',
    'uvp': 'UVP',
    'vk': 'VK (Verkaufspreis)',
    'ek': 'EK (Einkaufspreis)',
    
    // Hersteller & Marke
    'manufacturer': 'Hersteller',
    'manufacturerArticleNumber': 'Hersteller-Artikelnummer',
    'brand': 'Marke',
    
    // Beschreibungen
    'description': 'Beschreibung',
    'htmlCode': 'HTML-Beschreibung',
    'previewText': 'Fließtext',
    'kurzbeschreibung': 'Kurzbeschreibung',
    'seoBeschreibung': 'SEO-Beschreibung',
    'seoTitle': 'SEO-Titel',
    'seoDescription': 'SEO-Beschreibung',
    'seoKeywords': 'SEO-Keywords',
    
    // Bilder & Medien
    'images': 'Bilder (URLs)',
    'files': 'Produktbilder',
    'localImagePaths': 'Lokale Bildpfade',
    'pdfManualUrl': 'PDF-Bedienungsanleitung',
    
    // Maße & Gewicht
    'weight': 'Gewicht',
    'gewicht': 'Gewicht',
    'height': 'Höhe',
    'hoehe': 'Höhe',
    'width': 'Breite',
    'breite': 'Breite',
    'length': 'Länge',
    'laenge': 'Länge',
    
    // Technische Daten (ANSMANN)
    'nominalspannung': 'Nominalspannung (V)',
    'nominalkapazitaet': 'Nominalkapazität (mAh)',
    'maxEntladestrom': 'Max. Entladestrom (A)',
    'zellenchemie': 'Zellenchemie',
    'energie': 'Energie (Wh)',
    'farbe': 'Farbe',
    
    // Technische Daten (Nitecore)
    'bodyDiameter': 'Gehäusedurchmesser',
    'headDiameter': 'Kopfdurchmesser',
    'led1': 'LED 1',
    'led2': 'LED 2',
    'maxLuminosity': 'Max. Helligkeit (Lumen)',
    'spotIntensity': 'Spotintensität',
    'maxBeamDistance': 'Max. Leuchtweite (m)',
    'powerSupply': 'Stromversorgung',
    'totalWeight': 'Gesamtgewicht',
    'weightWithoutBattery': 'Gewicht ohne Batterie',
    
    // Sonstige
    'category': 'Kategorie',
    'stock': 'Lagerbestand',
    'sku': 'SKU',
  };

  // Check for exact matches first
  const lowerKey = key.toLowerCase();
  for (const [fieldKey, label] of Object.entries(fieldLabels)) {
    if (lowerKey === fieldKey.toLowerCase() || lowerKey.endsWith(`.${fieldKey.toLowerCase()}`)) {
      return label;
    }
  }

  // Remove array indices and format nicely
  let formatted = key
    .replace(/\[\d+\]\./g, '') // Remove [0]. [1]. etc.
    .replace(/([A-Z])/g, ' $1') // Add space before capitals
    .replace(/[._]/g, ' ') // Replace dots and underscores with spaces
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return formatted;
}
