/**
 * Brickfox CSV Export Schema
 * Defines all Brickfox fields, their types, scopes, and default values
 */

export type BrickfoxFieldScope = 'product' | 'variant';
export type BrickfoxFieldType = 'string' | 'number' | 'boolean' | 'price';
export type BrickfoxSourceType = 'scraped' | 'constant' | 'calculated' | 'ai_generated';

export interface BrickfoxFieldMeta {
  key: string;
  label: string;
  scope: BrickfoxFieldScope;
  type: BrickfoxFieldType;
  locale?: string;
  required?: boolean;
  defaultValue?: string | number | boolean;
  sourceType: BrickfoxSourceType;
  description?: string;
  calculation?: string; // Formula description
}

export const BRICKFOX_FIELDS: BrickfoxFieldMeta[] = [
  // Product-level fields
  {
    key: 'p_item_number',
    label: 'Eigene Artikelnummer',
    scope: 'product',
    type: 'string',
    required: true,
    sourceType: 'scraped',
    description: 'Eindeutige Artikelnummer des Produkts (ohne Bindestriche)'
  },
  {
    key: 'p_group_path[de]',
    label: 'Kategoriepfad',
    scope: 'product',
    type: 'string',
    locale: 'de',
    sourceType: 'scraped',
    description: 'Kategoriepfad (z.B. "Akkus > Werkzeugakkus > Makita")'
  },
  {
    key: 'p_brand',
    label: 'Marke / Hersteller',
    scope: 'product',
    type: 'string',
    sourceType: 'scraped',
    description: 'Marke oder Hersteller des Produkts'
  },
  {
    key: 'p_status',
    label: 'Produktstatus',
    scope: 'product',
    type: 'string',
    defaultValue: '1',
    sourceType: 'constant',
    description: 'Status des Produkts (1=Aktiv, 0=Inaktiv)'
  },
  {
    key: 'p_name[de]',
    label: 'Produktname (deutsch)',
    scope: 'product',
    type: 'string',
    locale: 'de',
    required: true,
    sourceType: 'scraped',
    description: 'Produktname in deutscher Sprache'
  },
  {
    key: 'p_tax_class',
    label: 'Steuerklasse',
    scope: 'product',
    type: 'string',
    defaultValue: '1',
    sourceType: 'constant',
    description: 'Steuerklasse für das Produkt (1=Standard 19%)'
  },
  {
    key: 'p_never_out_of_stock',
    label: 'Immer lieferbar',
    scope: 'product',
    type: 'string',
    defaultValue: '1',
    sourceType: 'constant',
    description: 'Ob das Produkt immer lieferbar ist (1=Ja, 0=Nein)'
  },
  {
    key: 'p_condition',
    label: 'Zustand',
    scope: 'product',
    type: 'string',
    defaultValue: 'Neu',
    sourceType: 'constant',
    description: 'Zustand des Produkts (Neu/Gebraucht)'
  },
  {
    key: 'p_country',
    label: 'Herkunftsland',
    scope: 'product',
    type: 'string',
    defaultValue: 'China',
    sourceType: 'constant',
    description: 'Herkunftsland des Produkts'
  },
  {
    key: 'p_description[de]',
    label: 'Produktbeschreibung (deutsch)',
    scope: 'product',
    type: 'string',
    locale: 'de',
    sourceType: 'ai_generated',
    description: 'KI-optimierte Produktbeschreibung basierend auf Lieferantenbeschreibung'
  },
  // Variant-level fields
  {
    key: 'v_item_number',
    label: 'Varianten-Artikelnummer',
    scope: 'variant',
    type: 'string',
    sourceType: 'scraped',
    description: 'Artikelnummer der Variante (kann gleich p_item_number sein)'
  },
  {
    key: 'v_ean',
    label: 'EAN / GTIN',
    scope: 'variant',
    type: 'string',
    sourceType: 'scraped',
    description: 'EAN-Code der Variante'
  },
  {
    key: 'v_manufacturers_item_number',
    label: 'Herstellerartikelnummer',
    scope: 'variant',
    type: 'string',
    sourceType: 'scraped',
    description: 'Artikelnummer beim Hersteller'
  },
  {
    key: 'v_status',
    label: 'Variantenstatus',
    scope: 'variant',
    type: 'string',
    defaultValue: '1',
    sourceType: 'constant',
    description: 'Status der Variante'
  },
  {
    key: 'v_classification',
    label: 'Variantenklassifizierung',
    scope: 'variant',
    type: 'string',
    defaultValue: 'X',
    sourceType: 'constant',
    description: 'Klassifizierung der Variante (z.B. Größe, Farbe, Kapazität)'
  },
  {
    key: 'v_price[Eur]',
    label: 'Verkaufspreis (EUR)',
    scope: 'variant',
    type: 'price',
    locale: 'Eur',
    sourceType: 'calculated',
    calculation: 'EK * 2 + 19%',
    description: 'Berechneter Verkaufspreis: (Einkaufspreis * 2) + 19% MwSt'
  },
  {
    key: 'v_delivery_time[de]',
    label: 'Lieferzeit (deutsch)',
    scope: 'variant',
    type: 'string',
    locale: 'de',
    defaultValue: '3-5 Tage',
    sourceType: 'constant',
    description: 'Lieferzeit für die Variante'
  },
  {
    key: 'v_supplier[Eur]',
    label: 'Lieferant',
    scope: 'variant',
    type: 'string',
    locale: 'Eur',
    sourceType: 'constant',
    description: 'Name des Lieferanten (automatisch vom Supplier-Namen)'
  },
  {
    key: 'v_supplier_item_number',
    label: 'Artikelnummer beim Lieferanten',
    scope: 'variant',
    type: 'string',
    sourceType: 'scraped',
    description: 'Artikelnummer wie beim Lieferanten gelistet'
  },
  {
    key: 'v_purchase_price',
    label: 'Einkaufspreis',
    scope: 'variant',
    type: 'price',
    sourceType: 'scraped',
    description: 'Einkaufspreis vom Lieferanten'
  },
  {
    key: 'v_never_out_of_stock[standard]',
    label: 'Immer verfügbar (Variante)',
    scope: 'variant',
    type: 'string',
    defaultValue: '1',
    sourceType: 'constant',
    description: 'Ob die Variante immer verfügbar ist'
  },
  {
    key: 'v_weight',
    label: 'Gewicht (g)',
    scope: 'variant',
    type: 'number',
    sourceType: 'scraped',
    description: 'Gewicht der Variante in Gramm'
  },
  {
    key: 'v_length',
    label: 'Länge (mm)',
    scope: 'variant',
    type: 'number',
    sourceType: 'scraped',
    description: 'Länge der Variante in Millimetern'
  },
  {
    key: 'v_width',
    label: 'Breite (mm)',
    scope: 'variant',
    type: 'number',
    sourceType: 'scraped',
    description: 'Breite der Variante in Millimetern'
  },
  {
    key: 'v_height',
    label: 'Höhe (mm)',
    scope: 'variant',
    type: 'number',
    sourceType: 'scraped',
    description: 'Höhe der Variante in Millimetern'
  },
  {
    key: 'v_capacity_mah',
    label: 'Kapazität (mAh)',
    scope: 'variant',
    type: 'number',
    sourceType: 'scraped',
    description: 'Akkukapazität in Milliamperestunden'
  },
  {
    key: 'v_customs_tariff_number',
    label: 'Zolltarifnummer',
    scope: 'variant',
    type: 'string',
    sourceType: 'ai_generated',
    description: 'KI-generierte Zolltarifnummer (falls nicht gescraped)'
  },
  {
    key: 'v_customs_tariff_text',
    label: 'Beschreibung des Zolltarifs',
    scope: 'variant',
    type: 'string',
    sourceType: 'scraped',
    description: 'Beschreibung des Zolltarifs'
  },
  // Produktbilder (bis zu 10 Bilder)
  {
    key: 'p_image[1]',
    label: 'Produktbild 1',
    scope: 'product',
    type: 'string',
    sourceType: 'scraped',
    description: 'URL oder Pfad zum ersten Produktbild'
  },
  {
    key: 'p_image[2]',
    label: 'Produktbild 2',
    scope: 'product',
    type: 'string',
    sourceType: 'scraped',
    description: 'URL oder Pfad zum zweiten Produktbild'
  },
  {
    key: 'p_image[3]',
    label: 'Produktbild 3',
    scope: 'product',
    type: 'string',
    sourceType: 'scraped',
    description: 'URL oder Pfad zum dritten Produktbild'
  },
  {
    key: 'p_image[4]',
    label: 'Produktbild 4',
    scope: 'product',
    type: 'string',
    sourceType: 'scraped',
    description: 'URL oder Pfad zum vierten Produktbild'
  },
  {
    key: 'p_image[5]',
    label: 'Produktbild 5',
    scope: 'product',
    type: 'string',
    sourceType: 'scraped',
    description: 'URL oder Pfad zum fünften Produktbild'
  },
  {
    key: 'p_image[6]',
    label: 'Produktbild 6',
    scope: 'product',
    type: 'string',
    sourceType: 'scraped',
    description: 'URL oder Pfad zum sechsten Produktbild'
  },
  {
    key: 'p_image[7]',
    label: 'Produktbild 7',
    scope: 'product',
    type: 'string',
    sourceType: 'scraped',
    description: 'URL oder Pfad zum siebten Produktbild'
  },
  {
    key: 'p_image[8]',
    label: 'Produktbild 8',
    scope: 'product',
    type: 'string',
    sourceType: 'scraped',
    description: 'URL oder Pfad zum achten Produktbild'
  },
  {
    key: 'p_image[9]',
    label: 'Produktbild 9',
    scope: 'product',
    type: 'string',
    sourceType: 'scraped',
    description: 'URL oder Pfad zum neunten Produktbild'
  },
  {
    key: 'p_image[10]',
    label: 'Produktbild 10',
    scope: 'product',
    type: 'string',
    sourceType: 'scraped',
    description: 'URL oder Pfad zum zehnten Produktbild'
  },
  // PDF Media Files
  {
    key: 'p_media[1][pdf]',
    label: 'PDF-Datei 1 (MSDS/Manual)',
    scope: 'product',
    type: 'string',
    sourceType: 'scraped',
    description: 'URL zur ersten PDF-Datei (z.B. MSDS, Bedienungsanleitung)'
  },
  {
    key: 'p_media[2][pdf]',
    label: 'PDF-Datei 2 (Manual/PIB)',
    scope: 'product',
    type: 'string',
    sourceType: 'scraped',
    description: 'URL zur zweiten PDF-Datei (z.B. Produktinformationsblatt)'
  }
];

// Helper: Get all fields by scope
export function getBrickfoxFieldsByScope(scope: BrickfoxFieldScope): BrickfoxFieldMeta[] {
  return BRICKFOX_FIELDS.filter(f => f.scope === scope);
}

// Helper: Get field by key
export function getBrickfoxField(key: string): BrickfoxFieldMeta | undefined {
  return BRICKFOX_FIELDS.find(f => f.key === key);
}

// Helper: Get all scraped fields (for UI mapping dropdown)
export function getScrapedFields(): BrickfoxFieldMeta[] {
  return BRICKFOX_FIELDS.filter(f => f.sourceType === 'scraped');
}

// Helper: Get all constant fields
export function getConstantFields(): BrickfoxFieldMeta[] {
  return BRICKFOX_FIELDS.filter(f => f.sourceType === 'constant');
}

// Helper: Get all AI-generated fields
export function getAIGeneratedFields(): BrickfoxFieldMeta[] {
  return BRICKFOX_FIELDS.filter(f => f.sourceType === 'ai_generated');
}

// Mapping configuration type for suppliers
export interface BrickfoxExportMapping {
  [brickfoxField: string]: {
    source: 'scraped' | 'constant' | 'calculated' | 'ai';
    field?: string; // Scraped field name (e.g., 'articleNumber', 'productName')
    value?: string | number | boolean; // Constant value
  };
}

// Default mapping template (can be overridden per supplier)
export const DEFAULT_BRICKFOX_MAPPING: BrickfoxExportMapping = {
  // Product fields - scraped
  'p_item_number': { source: 'scraped', field: 'articleNumber' },
  'p_group_path[de]': { source: 'scraped', field: 'kategorie' },  // German field name
  'p_brand': { source: 'scraped', field: 'hersteller' },  // German field name
  'p_name[de]': { source: 'scraped', field: 'productName' },
  
  // Product fields - constants
  'p_status': { source: 'constant', value: '1' },
  'p_tax_class': { source: 'constant', value: '1' },
  'p_never_out_of_stock': { source: 'constant', value: '1' },
  'p_condition': { source: 'constant', value: 'Neu' },
  'p_country': { source: 'constant', value: 'China' },
  
  // Product fields - AI
  'p_description[de]': { source: 'scraped', field: 'htmlCode' },  // Use scraped HTML description
  
  // Produktbilder - scraped (werden automatisch aus localImagePaths extrahiert)
  'p_image[1]': { source: 'scraped', field: 'localImagePaths[0]' },
  'p_image[2]': { source: 'scraped', field: 'localImagePaths[1]' },
  'p_image[3]': { source: 'scraped', field: 'localImagePaths[2]' },
  'p_image[4]': { source: 'scraped', field: 'localImagePaths[3]' },
  'p_image[5]': { source: 'scraped', field: 'localImagePaths[4]' },
  'p_image[6]': { source: 'scraped', field: 'localImagePaths[5]' },
  'p_image[7]': { source: 'scraped', field: 'localImagePaths[6]' },
  'p_image[8]': { source: 'scraped', field: 'localImagePaths[7]' },
  'p_image[9]': { source: 'scraped', field: 'localImagePaths[8]' },
  'p_image[10]': { source: 'scraped', field: 'localImagePaths[9]' },
  
  // Variant fields - scraped
  'v_item_number': { source: 'scraped', field: 'articleNumber' },
  'v_ean': { source: 'scraped', field: 'ean' },
  'v_manufacturers_item_number': { source: 'scraped', field: 'manufacturerArticleNumber' },  // OHNE Präfix (z.B. "1522-0045")
  'v_supplier_item_number': { source: 'scraped', field: 'manufacturerArticleNumber' },  // OHNE Präfix (z.B. "1522-0045")
  'v_purchase_price': { source: 'scraped', field: 'preis' },  // German field name
  'v_weight': { source: 'scraped', field: 'gewicht' },  // German field name
  'v_length': { source: 'scraped', field: 'laenge' },  // German field name
  'v_width': { source: 'scraped', field: 'breite' },  // German field name
  'v_height': { source: 'scraped', field: 'hoehe' },  // German field name
  'v_capacity_mah': { source: 'scraped', field: 'nominalkapazitaet' },  // German field name
  'v_customs_tariff_text': { source: 'scraped', field: 'customsTariff' },
  
  // Variant fields - constants
  'v_status': { source: 'constant', value: '1' },
  'v_classification': { source: 'constant', value: 'X' },
  'v_delivery_time[de]': { source: 'constant', value: '3-5 Tage' },
  'v_supplier[Eur]': { source: 'constant', value: 'Unbekannt' },  // Will be replaced with actual supplier name
  'v_never_out_of_stock[standard]': { source: 'constant', value: '1' },  // Always available
  
  // Variant fields - calculated
  'v_price[Eur]': { source: 'calculated' }, // Will be calculated from v_purchase_price
  
  // Variant fields - AI
  'v_customs_tariff_number': { source: 'ai' },
};
