/**
 * Brickfox Mapping Loader
 * Loads saved field mappings from database and converts to Brickfox format
 */

import { eq, and } from 'drizzle-orm';
import { db as heliumDb } from '../db';
import { fieldMappings } from '../../shared/mapping-schema';
import { BrickfoxExportMapping, DEFAULT_BRICKFOX_MAPPING } from '../../shared/brickfox-schema';

export async function loadMappingsForSupplier(
  supplierId: string,
  tenantId: string,
  sourceType: 'csv' | 'url_scraper' = 'url_scraper'
): Promise<BrickfoxExportMapping> {
  try {
    const savedMappings = await heliumDb
      .select()
      .from(fieldMappings)
      .where(
        and(
          eq(fieldMappings.supplierId, supplierId),
          eq(fieldMappings.tenantId, tenantId),
          eq(fieldMappings.sourceType, sourceType),
          eq(fieldMappings.isActive, true)
        )
      );

    if (!savedMappings || savedMappings.length === 0) {
      console.log(`[Mapping Loader] No custom mappings found for supplier ${supplierId}, using defaults`);
      return DEFAULT_BRICKFOX_MAPPING;
    }

    console.log(`[Mapping Loader] Found ${savedMappings.length} custom mappings for supplier ${supplierId}`);

    const customMapping: BrickfoxExportMapping = { ...DEFAULT_BRICKFOX_MAPPING };

    for (const mapping of savedMappings) {
      customMapping[mapping.targetField] = {
        source: 'scraped',
        field: mapping.sourceField,
      };
    }

    return customMapping;
  } catch (error) {
    console.error('[Mapping Loader] Error loading mappings:', error);
    return DEFAULT_BRICKFOX_MAPPING;
  }
}

export async function loadMappingsForProject(
  projectId: string,
  tenantId: string,
  sourceType: 'csv' | 'url_scraper' = 'csv'
): Promise<BrickfoxExportMapping> {
  try {
    const savedMappings = await heliumDb
      .select()
      .from(fieldMappings)
      .where(
        and(
          eq(fieldMappings.tenantId, tenantId),
          eq(fieldMappings.sourceType, sourceType),
          eq(fieldMappings.isActive, true)
        )
      );

    if (!savedMappings || savedMappings.length === 0) {
      console.log(`[Mapping Loader] No CSV mappings found for tenant ${tenantId}, using defaults`);
      return DEFAULT_BRICKFOX_MAPPING;
    }

    console.log(`[Mapping Loader] Found ${savedMappings.length} CSV mappings`);

    const customMapping: BrickfoxExportMapping = { ...DEFAULT_BRICKFOX_MAPPING };

    for (const mapping of savedMappings) {
      customMapping[mapping.targetField] = {
        source: 'scraped',
        field: mapping.sourceField,
      };
    }

    return customMapping;
  } catch (error) {
    console.error('[Mapping Loader] Error loading CSV mappings:', error);
    return DEFAULT_BRICKFOX_MAPPING;
  }
}
