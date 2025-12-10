import { pgTable, uuid, text, jsonb, timestamp, boolean } from 'drizzle-orm/pg-core';
import { suppliers } from './schema';

/**
 * Field Mappings Table
 * Stores visual mapping configurations for Scraper → Brickfox CSV conversion
 * 
 * Example:
 * - source_field: "product.title" (from scraper)
 * - target_field: "Produktname" (Brickfox CSV column)
 * - transformation: { type: "uppercase", params: {} }
 */
export const fieldMappings = pgTable("field_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // Multi-tenancy
  tenantId: uuid("tenant_id"),
  
  // Link to supplier (each supplier can have custom mappings)
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "cascade" }),
  
  // Source type: "csv" or "url_scraper"
  sourceType: text("source_type").notNull().default('url_scraper'),
  
  // Source field from scraper (JSON path notation) or CSV column name
  // Examples: 
  // - URL Scraper: "product.title", "product.price", "customAttributes.brand"
  // - CSV: "Produktname", "EAN", "Preis"
  sourceField: text("source_field").notNull(),
  
  // Target field in Brickfox CSV
  // Examples: "Produktname", "EAN", "Verkaufspreis", "Beschreibung"
  targetField: text("target_field").notNull(),
  
  // Optional transformation to apply
  // Examples: 
  // - { type: "uppercase" }
  // - { type: "regex", pattern: "\\d+", replacement: "" }
  // - { type: "concat", separator: " - ", fields: ["brand", "model"] }
  transformation: jsonb("transformation"),
  
  // Display order in UI (for sorting)
  displayOrder: text("display_order").default('0'),
  
  // Is this mapping active?
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

/**
 * Mapping Presets Table
 * Pre-configured mapping templates for common scenarios
 */
export const mappingPresets = pgTable("mapping_presets", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // Multi-tenancy
  tenantId: uuid("tenant_id"),
  
  // Preset name (e.g., "Brickfox Standard", "MediaMarkt Format")
  name: text("name").notNull(),
  
  // Description
  description: text("description"),
  
  // Source type this preset is for: "csv" or "url_scraper"
  sourceType: text("source_type").notNull().default('url_scraper'),
  
  // Complete mapping configuration (JSON array of field mappings)
  mappingConfig: jsonb("mapping_config").notNull(),
  
  // Is this a system preset (not deletable by users)?
  isSystem: boolean("is_system").default(false),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

/**
 * Available Brickfox CSV Fields
 * Exakte Spaltennamen wie von Brickfox erwartet
 */
export const brickfoxFields = [
  // Produkt-Stammdaten (p_*)
  { key: 'p_item_number', label: 'Produkt Artikelnummer', required: true, type: 'string', category: 'Produktdaten' },
  { key: 'p_group_path[de]', label: 'Kategoriepfad (DE)', required: false, type: 'string', category: 'Produktdaten' },
  { key: 'p_brand', label: 'Marke', required: false, type: 'string', category: 'Produktdaten' },
  { key: 'p_status', label: 'Produkt Status', required: false, type: 'string', category: 'Produktdaten' },
  { key: 'p_name[de]', label: 'Produktname (DE)', required: true, type: 'string', category: 'Produktdaten' },
  { key: 'p_tax_class', label: 'Steuerklasse', required: false, type: 'string', category: 'Produktdaten' },
  { key: 'p_never_out_of_stock', label: 'Nie ausverkauft', required: false, type: 'boolean', category: 'Produktdaten' },
  { key: 'p_condition', label: 'Zustand', required: false, type: 'string', category: 'Produktdaten' },
  { key: 'p_country', label: 'Land', required: false, type: 'string', category: 'Produktdaten' },
  { key: 'p_description[de]', label: 'Beschreibung (DE)', required: false, type: 'html', category: 'Produktdaten' },
  
  // Varianten-Daten (v_*)
  { key: 'v_item_number', label: 'Varianten Artikelnummer', required: false, type: 'string', category: 'Variantendaten' },
  { key: 'v_ean', label: 'EAN', required: false, type: 'string', category: 'Variantendaten' },
  { key: 'v_manufacturers_item_number', label: 'Hersteller Artikelnummer', required: false, type: 'string', category: 'Variantendaten' },
  { key: 'v_status', label: 'Varianten Status', required: false, type: 'string', category: 'Variantendaten' },
  { key: 'v_classification', label: 'Klassifizierung', required: false, type: 'string', category: 'Variantendaten' },
  { key: 'v_price[Eur]', label: 'Verkaufspreis (EUR)', required: false, type: 'number', category: 'Variantendaten' },
  { key: 'v_delivery_time[de]', label: 'Lieferzeit (DE)', required: false, type: 'string', category: 'Variantendaten' },
  { key: 'v_supplier[Eur]', label: 'Lieferant (EUR)', required: false, type: 'string', category: 'Variantendaten' },
  { key: 'v_supplier_item_number', label: 'Lieferanten Artikelnummer', required: false, type: 'string', category: 'Variantendaten' },
  { key: 'v_purchase_price', label: 'Einkaufspreis', required: false, type: 'number', category: 'Variantendaten' },
  { key: 'v_never_out_of_stock[standard]', label: 'Standard nie ausverkauft', required: false, type: 'boolean', category: 'Variantendaten' },
  { key: 'v_weight', label: 'Gewicht', required: false, type: 'number', category: 'Variantendaten' },
  { key: 'v_customs_tariff_number', label: 'Zolltarifnummer', required: false, type: 'string', category: 'Variantendaten' },
  { key: 'v_customs_tariff_text', label: 'Zolltarif Text', required: false, type: 'string', category: 'Variantendaten' },
] as const;

/**
 * Transformation Types
 */
export type TransformationType = 
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  | 'regex'
  | 'concat'
  | 'prefix'
  | 'suffix'
  | 'custom';

export interface FieldTransformation {
  type: TransformationType;
  params?: Record<string, any>;
}
