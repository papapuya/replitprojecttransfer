/**
 * Pixi ERP API Integration Service
 * 
 * Provides methods to interact with the Pixi ERP system for product comparison
 * and inventory management.
 */

import type { ProductInProject, Supplier } from '@shared/schema';
import type { IStorage } from '../supabase-storage';

interface PixiItemSearchRequest {
  SupplNr: string;
}

interface PixiItemSearchResponse {
  data: Array<{
    ItemNrSuppl: string;
    EANUPC: string;
  }>;
}

interface PixiComparisonResult {
  artikelnummer: string;
  manufacturerArticleNumber?: string;
  produktname: string;
  ean: string;
  hersteller: string;
  pixi_status: 'NEU' | 'VORHANDEN';
  pixi_ean: string | null;
  originalData?: any; // Complete original CSV row data
}

interface PixiComparisonSummary {
  success: boolean;
  summary: {
    total: number;
    neu: number;
    vorhanden: number;
  };
  products: PixiComparisonResult[];
}

interface PixiSupabaseComparisonResult extends PixiComparisonResult {
  id: string;
  pixi_checked_at: string;
}

interface PixiSupabaseComparisonSummary {
  success: boolean;
  projectId: string;
  supplierId?: string;
  summary: {
    total: number;
    neu: number;
    vorhanden: number;
  };
  products: PixiSupabaseComparisonResult[];
}

interface CSVProduct {
  Artikelnummer?: string;
  Produktname?: string;
  EAN?: string;
  Hersteller?: string;
  [key: string]: any;
}

/**
 * Pixi ERP API Service
 */
export class PixiService {
  private apiUrl: string;
  private authToken: string;
  private cache: Map<string, { data: PixiItemSearchResponse; timestamp: number }>;
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.apiUrl = process.env.PIXI_API_URL || 'https://akkutools.laptopakku.eu/api/pixi/pixiItemSearch';
    this.authToken = process.env.PIXI_AUTH_TOKEN || '';
    this.cache = new Map();
  }

  /**
   * Search for items in Pixi ERP by supplier number
   * @param supplNr Supplier number (e.g., "7077")
   * @returns Pixi item search response
   */
  async searchItems(supplNr: string): Promise<PixiItemSearchResponse> {
    // Check cache first
    const cached = this.cache.get(supplNr);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.log(`[Pixi Service] Cache hit for supplier ${supplNr}`);
      return cached.data;
    }

    try {
      console.log(`[Pixi Service] Fetching items for supplier ${supplNr}`);
      
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'X-AUTH-TOKEN': this.authToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ SupplNr: supplNr }),
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        throw new Error(`Pixi API error: ${response.status} ${response.statusText}`);
      }

      const data: PixiItemSearchResponse = await response.json();
      
      // Debug: Log first raw item to see actual field names
      if (data.data && data.data.length > 0) {
        console.log('[Pixi Debug] RAW API Response - First item:', JSON.stringify(data.data[0], null, 2));
      }
      
      // Cache the result
      this.cache.set(supplNr, { data, timestamp: Date.now() });
      
      console.log(`[Pixi Service] Found ${data.data?.length || 0} items for supplier ${supplNr}`);
      
      return data;
    } catch (error: any) {
      console.error(`[Pixi Service] Error fetching items:`, error.message);
      throw new Error(`Failed to fetch items from Pixi API: ${error.message}`);
    }
  }

  /**
   * Helper function to extract column value with flexible column name matching
   */
  private getColumnValue(product: any, possibleNames: string[]): string {
    for (const name of possibleNames) {
      const value = product[name];
      if (value !== undefined && value !== null && value !== '') {
        return typeof value === 'string' ? value.trim() : value.toString().trim();
      }
    }
    return '';
  }

  /**
   * Compare CSV products with Pixi inventory
   * @param products Array of products from CSV
   * @param supplNr Supplier number
   * @returns Comparison results with status (NEU/VORHANDEN)
   */
  async compareProducts(products: CSVProduct[], supplNr: string): Promise<PixiComparisonSummary> {
    try {
      // Log the column names from the first product to help debug
      if (products.length > 0) {
        const columnNames = Object.keys(products[0]);
        console.log(`[Pixi Service] CSV columns detected:`, columnNames);
      }

      // Fetch all items from Pixi for this supplier
      const pixiResponse = await this.searchItems(supplNr);
      const pixiItems = pixiResponse.data || [];

      // Create lookup maps for fast comparison
      const pixiByItemNr = new Map<string, { ItemNrSuppl: string; EANUPC: string }>();
      const pixiByEan = new Map<string, { ItemNrSuppl: string; EANUPC: string }>();

      pixiItems.forEach(item => {
        if (item.ItemNrSuppl) {
          pixiByItemNr.set(item.ItemNrSuppl.toUpperCase(), item);
        }
        if (item.EANUPC) {
          pixiByEan.set(item.EANUPC, item);
        }
      });

      // Compare each product
      const results: PixiComparisonResult[] = [];
      let neuCount = 0;
      let vorhandenCount = 0;

      for (const product of products) {
        // Get both article numbers for better matching
        const artikelnummer = this.getColumnValue(product, [
          'Artikelnummer', 'artikelnummer', 'ARTIKELNUMMER',
          'Article Number', 'ArticleNumber', 'article_number',
          'Item Number', 'ItemNumber', 'item_number',
          'SKU', 'sku', 'Art.-Nr.', 'Art.Nr.',
          'p_item_number'  // Prioritize p_item_number
        ]);
        
        const manufacturerItemNr = this.getColumnValue(product, [
          'v_manufacturers_item_number',  // Brickfox export format (PRIMARY!)
          'ItemNrSuppl',                   // Alternative name
          'manufacturers_item_number',
          'Herstellerartikelnummer', 
          'Hersteller-Artikelnummer'
        ]);
        
        const produktname = this.getColumnValue(product, [
          'Produktname', 'produktname', 'PRODUKTNAME',
          'Product Name', 'ProductName', 'product_name',
          'Name', 'name', 'Bezeichnung', 'bezeichnung',
          'Description', 'description',
          'p_name[de]', 'p_name[en]', 'p_name'  // Export system columns
        ]);
        
        const ean = this.getColumnValue(product, [
          'v_ean',                         // Brickfox export format (PRIMARY!)
          'EAN', 'ean', 'EAN-Code', 'EAN Code',
          'GTIN', 'gtin', 'Barcode', 'barcode',
          'UPC', 'upc', 'EAN/UPC',
          'EANUPC', 'p_ean'  // Export system columns
        ]);
        
        const hersteller = this.getColumnValue(product, [
          'Hersteller', 'hersteller', 'HERSTELLER',
          'Manufacturer', 'manufacturer', 'Brand', 'brand',
          'Marke', 'marke', 'Supplier', 'supplier',
          'p_brand', 'v_brand'  // Export system columns
        ]);

        // Check if product exists in Pixi - try multiple strategies
        let pixiItem = null;
        let isMatch = false;
        let matchedEan: string | null = null;

        // DEBUG: Log first product for debugging
        if (results.length === 0) {
          console.log('[Pixi Match Debug] First product:', {
            artikelnummer,
            manufacturerItemNr,
            ean,
            produktname: produktname?.substring(0, 50)
          });
          console.log('[Pixi Match Debug] First 5 Pixi items:', 
            Array.from(pixiByItemNr.entries()).slice(0, 5).map(([key, val]) => ({
              ItemNrSuppl: key,
              EANUPC: val.EANUPC
            }))
          );
        }

        // Strategy 1: Try p_item_number (e.g., "PT237097" or "ANS2447304960")
        if (artikelnummer) {
          const lookupKey = artikelnummer.toUpperCase();
          pixiItem = pixiByItemNr.get(lookupKey);
          if (pixiItem) {
            console.log(`[Pixi Match] ✓ Strategy 1 matched: ${artikelnummer} -> ${pixiItem.ItemNrSuppl}`);
            isMatch = true;
            matchedEan = pixiItem.EANUPC || null;
          }
          
          // Try without 2-char prefix (e.g., "PT237097" -> "237097")
          if (!isMatch && lookupKey.length > 2) {
            const withoutPrefix2 = lookupKey.substring(2);
            pixiItem = pixiByItemNr.get(withoutPrefix2);
            if (pixiItem) {
              console.log(`[Pixi Match] ✓ Strategy 1a matched (without 2-char prefix): ${artikelnummer} -> ${pixiItem.ItemNrSuppl}`);
              isMatch = true;
              matchedEan = pixiItem.EANUPC || null;
            }
          }
          
          // Try without 3-char prefix (e.g., "ANS2447304960" -> "2447304960")
          if (!isMatch && lookupKey.length > 3) {
            const withoutPrefix3 = lookupKey.substring(3);
            pixiItem = pixiByItemNr.get(withoutPrefix3);
            if (pixiItem) {
              console.log(`[Pixi Match] ✓ Strategy 1b matched (without 3-char prefix): ${artikelnummer} -> ${pixiItem.ItemNrSuppl}`);
              isMatch = true;
              matchedEan = pixiItem.EANUPC || null;
            }
          }
        }

        // Strategy 2: Try ItemNrSuppl (e.g., "2447304960")
        if (!isMatch && manufacturerItemNr) {
          const lookupKey = manufacturerItemNr.toUpperCase();
          pixiItem = pixiByItemNr.get(lookupKey);
          if (pixiItem) {
            console.log(`[Pixi Match] ✓ Strategy 2 matched: ${manufacturerItemNr} -> ${pixiItem.ItemNrSuppl}`);
            isMatch = true;
            matchedEan = pixiItem.EANUPC || null;
          }
        }

        // Strategy 3: Try EAN as fallback
        if (!isMatch && ean) {
          pixiItem = pixiByEan.get(ean);
          if (pixiItem) {
            console.log(`[Pixi Match] ✓ Strategy 3 matched: ${ean} -> ${pixiItem.ItemNrSuppl}`);
            isMatch = true;
            matchedEan = pixiItem.EANUPC || null;
          }
        }

        // DEBUG: Log mismatches for first few products
        if (!isMatch && results.length < 3) {
          console.log(`[Pixi Match] ✗ No match found for:`, {
            artikelnummer,
            manufacturerItemNr,
            ean,
            produktname: produktname?.substring(0, 50)
          });
        }

        const status: 'NEU' | 'VORHANDEN' = isMatch ? 'VORHANDEN' : 'NEU';
        
        if (status === 'NEU') {
          neuCount++;
        } else {
          vorhandenCount++;
        }

        results.push({
          artikelnummer,
          manufacturerArticleNumber: manufacturerItemNr || undefined,
          produktname,
          ean,
          hersteller,
          pixi_status: status,
          pixi_ean: matchedEan,
          originalData: product, // Store complete original CSV row
        });
      }

      return {
        success: true,
        summary: {
          total: products.length,
          neu: neuCount,
          vorhanden: vorhandenCount,
        },
        products: results,
      };
    } catch (error: any) {
      console.error('[Pixi Service] Comparison failed:', error.message);
      throw error;
    }
  }

  /**
   * Compare products from Supabase with Pixi inventory and update database
   * @param projectId Project ID to load products from
   * @param storage Supabase storage instance
   * @param supplierIdOrSupplNr Supplier ID or direct SupplNr
   * @returns Comparison results with updated database records
   */
  async compareProductsFromSupabase(
    projectId: string,
    storage: IStorage,
    supplierIdOrSupplNr: string
  ): Promise<PixiSupabaseComparisonSummary> {
    try {
      console.log(`[Pixi Service] Starting Supabase comparison for project ${projectId}`);

      // Load products from Supabase
      const products = await storage.getProducts(projectId);
      if (!products || products.length === 0) {
        throw new Error('No products found in project');
      }

      console.log(`[Pixi Service] Loaded ${products.length} products from Supabase`);

      // Determine SupplNr - either direct value or lookup from supplier
      let supplNr: string;
      let supplierId: string | undefined;

      if (supplierIdOrSupplNr.match(/^\d+$/)) {
        // Looks like a SupplNr (numeric)
        supplNr = supplierIdOrSupplNr;
      } else {
        // Assume it's a supplier ID
        supplierId = supplierIdOrSupplNr;
        const supplier = await storage.getSupplier(supplierId);
        
        if (!supplier) {
          throw new Error(`Supplier ${supplierId} not found`);
        }
        
        if (!supplier.supplNr) {
          throw new Error(`Supplier ${supplier.name} has no SupplNr configured`);
        }
        
        supplNr = supplier.supplNr;
        console.log(`[Pixi Service] Using SupplNr ${supplNr} from supplier ${supplier.name}`);
      }

      // Fetch Pixi inventory
      const pixiResponse = await this.searchItems(supplNr);
      const pixiItems = pixiResponse.data || [];

      // Create lookup maps (case-insensitive, preserve hyphens!)
      const pixiByItemNr = new Map<string, { ItemNrSuppl: string; EANUPC: string }>();
      const pixiByEan = new Map<string, { ItemNrSuppl: string; EANUPC: string }>();
      
      pixiItems.forEach(item => {
        if (item.ItemNrSuppl) {
          // Only uppercase for case-insensitive matching - DO NOT remove hyphens!
          const normalized = item.ItemNrSuppl.trim().toUpperCase();
          pixiByItemNr.set(normalized, item);
        }
        if (item.EANUPC) {
          // Only uppercase for case-insensitive matching - DO NOT remove hyphens!
          const normalized = item.EANUPC.trim().toUpperCase();
          pixiByEan.set(normalized, item);
        }
      });

      console.log(`[Pixi Service] Loaded ${pixiItems.length} items from Pixi API`);
      
      // Debug: Show first 5 Pixi items to verify format
      if (pixiItems.length > 0) {
        console.log(`[Pixi Debug] First 5 Pixi items:`, 
          pixiItems.slice(0, 5).map(item => ({
            ItemNrSuppl: item.ItemNrSuppl,
            EANUPC: item.EANUPC
          }))
        );
      }

      // Compare and prepare updates
      const results: PixiSupabaseComparisonResult[] = [];
      const updates: Array<{
        id: string;
        pixi_status: 'NEU' | 'VORHANDEN';
        pixi_ean: string | null;
        pixi_checked_at: string;
      }> = [];
      
      let neuCount = 0;
      let vorhandenCount = 0;
      const timestamp = new Date().toISOString();

      for (const product of products) {
        const artikelnummer = product.articleNumber?.trim() || product.name?.trim() || '';
        const produktname = product.name?.trim() || '';
        
        // Try to get EAN from extractedData (primary) or customAttributes (fallback)
        let ean = '';
        let hersteller = '';
        let manufacturerItemNr = '';
        
        // extractedData is an array of {key, value, type}
        if (product.extractedData && Array.isArray(product.extractedData)) {
          const eanAttr = product.extractedData.find((attr: any) => 
            attr.key?.toLowerCase() === 'ean'
          );
          if (eanAttr) {
            ean = eanAttr.value?.toString().trim() || '';
          }
          
          const herstellerAttr = product.extractedData.find((attr: any) => 
            attr.key?.toLowerCase() === 'hersteller'
          );
          if (herstellerAttr) {
            hersteller = herstellerAttr.value?.toString().trim() || '';
          }
          
          const manuItemNrAttr = product.extractedData.find((attr: any) => 
            attr.key?.toLowerCase() === 'manufacturerarticlenumber'
          );
          if (manuItemNrAttr) {
            manufacturerItemNr = manuItemNrAttr.value?.toString().trim() || '';
          }
        }
        
        // Fallback to customAttributes if not found in extractedData
        if (!ean && product.customAttributes) {
          const eanAttr = product.customAttributes.find((attr: any) => 
            attr.key?.toLowerCase() === 'ean' || attr.key?.toLowerCase() === 'ean-nummer'
          );
          if (eanAttr) {
            ean = eanAttr.value?.toString().trim() || '';
          }
        }

        // Multi-strategy matching (case-insensitive, preserve hyphens!)
        let pixiItem = null;
        let matchStrategy = '';
        
        // Helper: Normalize strings for matching (only uppercase - DO NOT remove hyphens!)
        const normalize = (str: string) => str.trim().toUpperCase();
        
        // Strategy 1: Try exact match with full article number (normalized)
        pixiItem = pixiByItemNr.get(normalize(artikelnummer));
        if (pixiItem) {
          matchStrategy = 'artikelnummer_exact';
        }
        
        // Strategy 2: Try with manufacturer item number (normalized)
        if (!pixiItem && manufacturerItemNr) {
          pixiItem = pixiByItemNr.get(normalize(manufacturerItemNr));
          if (pixiItem) {
            matchStrategy = 'manufacturer_item_nr';
          }
        }
        
        // Strategy 3: Try removing common prefixes (normalized)
        if (!pixiItem && artikelnummer.length > 3) {
          const withoutPrefix = artikelnummer.replace(/^(ANS|BK|VK|ART)/i, '');
          if (withoutPrefix !== artikelnummer) {
            pixiItem = pixiByItemNr.get(normalize(withoutPrefix));
            if (pixiItem) {
              matchStrategy = 'artikelnummer_without_prefix';
            }
          }
        }
        
        // Strategy 4: Try EAN as fallback (normalized)
        if (!pixiItem && ean) {
          pixiItem = pixiByEan.get(normalize(ean));
          if (pixiItem) {
            matchStrategy = 'ean';
          }
        }
        
        const isMatch = !!pixiItem;
        const matchedEan = pixiItem?.EANUPC || null;
        const status: 'NEU' | 'VORHANDEN' = isMatch ? 'VORHANDEN' : 'NEU';
        
        // Debug logging for products that don't match
        if (!isMatch) {
          const withoutPrefix = artikelnummer.replace(/^(ANS|BK|VK|ART)/i, '');
          console.log(`[Pixi No-Match Debug] Product not found:`, {
            artikelnummer,
            manufacturerItemNr,
            ean,
            withoutPrefix,
            searchedKeys: [
              artikelnummer.toUpperCase(),
              manufacturerItemNr?.toUpperCase(),
              withoutPrefix !== artikelnummer ? withoutPrefix.toUpperCase() : null,
              ean?.toUpperCase()
            ].filter(Boolean)
          });
        }
        
        // Debug logging for first successful match
        if (isMatch && results.filter(r => r.pixi_status === 'VORHANDEN').length === 0) {
          console.log(`[Pixi Match Success] First matched product:`, {
            artikelnummer,
            matchStrategy,
            matchedItemNr: pixiItem?.ItemNrSuppl,
            matchedEan: pixiItem?.EANUPC,
          });
        }

        if (status === 'NEU') {
          neuCount++;
        } else {
          vorhandenCount++;
        }

        // Build Brickfox-formatted originalData
        const brickfoxData: any = {
          p_item_number: artikelnummer,
          ItemNrSuppl: manufacturerItemNr || artikelnummer,
          'p_name[de]': produktname,
          EANUPC: ean,
          p_brand: hersteller,
        };

        // Add ALL extractedData fields as Brickfox columns
        if (product.extractedData && Array.isArray(product.extractedData)) {
          product.extractedData.forEach((attr: any) => {
            if (attr.key && attr.value && !['ean', 'hersteller', 'manufacturerarticlenumber'].includes(attr.key.toLowerCase())) {
              // Map known fields to Brickfox format
              const fieldName = attr.key;
              brickfoxData[fieldName] = attr.value;
            }
          });
        }

        // Add custom attributes as additional Brickfox fields
        if (product.customAttributes) {
          product.customAttributes.forEach((attr: any) => {
            if (attr.key && attr.value) {
              brickfoxData[attr.key] = attr.value;
            }
          });
        }

        results.push({
          id: product.id,
          artikelnummer,
          manufacturerArticleNumber: manufacturerItemNr || undefined,
          produktname,
          ean,
          hersteller,
          pixi_status: status,
          pixi_ean: matchedEan,
          pixi_checked_at: timestamp,
          originalData: brickfoxData, // Add Brickfox-formatted data
        });

        updates.push({
          id: product.id,
          pixi_status: status,
          pixi_ean: matchedEan,
          pixi_checked_at: timestamp,
        });
      }

      // Batch update in Supabase
      console.log(`[Pixi Service] Updating ${updates.length} products in Supabase`);
      const updateSuccess = await storage.batchUpdateProductsPixiStatus(updates);
      
      if (!updateSuccess) {
        console.warn('[Pixi Service] Some database updates may have failed');
      }

      return {
        success: true,
        projectId,
        supplierId,
        summary: {
          total: products.length,
          neu: neuCount,
          vorhanden: vorhandenCount,
        },
        products: results,
      };
    } catch (error: any) {
      console.error('[Pixi Service] Supabase comparison failed:', error.message);
      throw error;
    }
  }

  /**
   * Clear the cache (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[Pixi Service] Cache cleared');
  }
}

// Export singleton instance
export const pixiService = new PixiService();
