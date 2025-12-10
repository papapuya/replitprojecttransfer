import { Router, Request, Response } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { db as heliumDb } from './db';
import { fieldMappings, mappingPresets } from '../shared/mapping-schema';
import { supabaseStorage } from './supabase-storage';
import { supabase } from './supabase';
import { detectFieldsFromUrlScraper, detectFieldsFromCSV } from './services/field-detection-service';

const router = Router();

async function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }
  
  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return res.status(401).json({ error: 'Ungültiges Token' });
  }
  
  req.user = user;
  next();
}

router.get('/suppliers/:supplierId/mappings', requireAuth, async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params;
    const { source_type } = req.query;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await supabaseStorage.getUserById(userId);
    if (!user?.tenantId) {
      return res.status(403).json({ error: 'No tenant assigned' });
    }

    let query = heliumDb
      .select()
      .from(fieldMappings)
      .where(
        and(
          eq(fieldMappings.supplierId, supplierId),
          eq(fieldMappings.tenantId, user.tenantId)
        )
      )
      .orderBy(desc(fieldMappings.displayOrder));

    if (source_type) {
      query = query.where(
        and(
          eq(fieldMappings.supplierId, supplierId),
          eq(fieldMappings.tenantId, user.tenantId),
          eq(fieldMappings.sourceType, source_type as string)
        )
      );
    }

    const mappings = await query;

    res.json({
      success: true,
      mappings: mappings.map((m: typeof fieldMappings.$inferSelect) => ({
        id: m.id,
        supplierId: m.supplierId,
        sourceType: m.sourceType,
        sourceField: m.sourceField,
        targetField: m.targetField,
        transformation: m.transformation,
        displayOrder: m.displayOrder,
        isActive: m.isActive,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
    });
  } catch (error) {
    console.error('[GET /suppliers/:supplierId/mappings] Error:', error);
    res.status(500).json({ error: 'Failed to fetch mappings' });
  }
});

router.post('/suppliers/:supplierId/mappings', requireAuth, async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params;
    const { sourceType, sourceField, targetField, transformation, displayOrder } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await supabaseStorage.getUserById(userId);
    if (!user?.tenantId) {
      return res.status(403).json({ error: 'No tenant assigned' });
    }

    if (!sourceType || !sourceField || !targetField) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [mapping] = await heliumDb
      .insert(fieldMappings)
      .values({
        tenantId: user.tenantId,
        supplierId,
        sourceType,
        sourceField,
        targetField,
        transformation: transformation || null,
        displayOrder: displayOrder || '0',
        isActive: true,
      })
      .returning();

    res.json({
      success: true,
      mapping: {
        id: mapping.id,
        supplierId: mapping.supplierId,
        sourceType: mapping.sourceType,
        sourceField: mapping.sourceField,
        targetField: mapping.targetField,
        transformation: mapping.transformation,
        displayOrder: mapping.displayOrder,
        isActive: mapping.isActive,
        createdAt: mapping.createdAt,
        updatedAt: mapping.updatedAt,
      },
    });
  } catch (error) {
    console.error('[POST /suppliers/:supplierId/mappings] Error:', error);
    res.status(500).json({ error: 'Failed to create mapping' });
  }
});

router.put('/mappings/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { sourceField, targetField, transformation, displayOrder, isActive } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await supabaseStorage.getUserById(userId);
    if (!user?.tenantId) {
      return res.status(403).json({ error: 'No tenant assigned' });
    }

    const [existingMapping] = await heliumDb
      .select()
      .from(fieldMappings)
      .where(
        and(
          eq(fieldMappings.id, id),
          eq(fieldMappings.tenantId, user.tenantId)
        )
      )
      .limit(1);

    if (!existingMapping) {
      return res.status(404).json({ error: 'Mapping not found or access denied' });
    }

    const [updatedMapping] = await heliumDb
      .update(fieldMappings)
      .set({
        sourceField: sourceField || existingMapping.sourceField,
        targetField: targetField || existingMapping.targetField,
        transformation: transformation !== undefined ? transformation : existingMapping.transformation,
        displayOrder: displayOrder || existingMapping.displayOrder,
        isActive: isActive !== undefined ? isActive : existingMapping.isActive,
        updatedAt: new Date(),
      })
      .where(eq(fieldMappings.id, id))
      .returning();

    res.json({
      success: true,
      mapping: {
        id: updatedMapping.id,
        supplierId: updatedMapping.supplierId,
        sourceType: updatedMapping.sourceType,
        sourceField: updatedMapping.sourceField,
        targetField: updatedMapping.targetField,
        transformation: updatedMapping.transformation,
        displayOrder: updatedMapping.displayOrder,
        isActive: updatedMapping.isActive,
        createdAt: updatedMapping.createdAt,
        updatedAt: updatedMapping.updatedAt,
      },
    });
  } catch (error) {
    console.error('[PUT /mappings/:id] Error:', error);
    res.status(500).json({ error: 'Failed to update mapping' });
  }
});

router.delete('/mappings/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await supabaseStorage.getUserById(userId);
    if (!user?.tenantId) {
      return res.status(403).json({ error: 'No tenant assigned' });
    }

    const [existingMapping] = await heliumDb
      .select()
      .from(fieldMappings)
      .where(
        and(
          eq(fieldMappings.id, id),
          eq(fieldMappings.tenantId, user.tenantId)
        )
      )
      .limit(1);

    if (!existingMapping) {
      return res.status(404).json({ error: 'Mapping not found or access denied' });
    }

    await heliumDb
      .delete()
      .from(fieldMappings)
      .where(eq(fieldMappings.id, id));

    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE /mappings/:id] Error:', error);
    res.status(500).json({ error: 'Failed to delete mapping' });
  }
});

router.get('/fields/detect', requireAuth, async (req: Request, res: Response) => {
  try {
    const { source_type, supplier_id, project_id } = req.query;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!source_type) {
      return res.status(400).json({ error: 'source_type is required (csv or url_scraper)' });
    }

    let detectedFields = [];

    if (source_type === 'url_scraper' && supplier_id) {
      detectedFields = await detectFieldsFromUrlScraper(supplier_id as string, userId);
    } else if (source_type === 'csv' && project_id) {
      detectedFields = await detectFieldsFromCSV(project_id as string, userId);
    } else {
      return res.status(400).json({ 
        error: 'Missing required parameters: supplier_id for url_scraper or project_id for csv' 
      });
    }

    res.json({
      success: true,
      sourceType: source_type,
      fields: detectedFields,
      count: detectedFields.length,
    });
  } catch (error) {
    console.error('[GET /fields/detect] Error:', error);
    res.status(500).json({ error: 'Failed to detect fields' });
  }
});

router.get('/presets', requireAuth, async (req: Request, res: Response) => {
  try {
    const { source_type } = req.query;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await supabaseStorage.getUserById(userId);
    if (!user?.tenantId) {
      return res.status(403).json({ error: 'No tenant assigned' });
    }

    let query = heliumDb
      .select()
      .from(mappingPresets)
      .where(
        and(
          eq(mappingPresets.tenantId, user.tenantId)
        )
      )
      .orderBy(desc(mappingPresets.createdAt));

    if (source_type) {
      query = query.where(
        and(
          eq(mappingPresets.tenantId, user.tenantId),
          eq(mappingPresets.sourceType, source_type as string)
        )
      );
    }

    const presets = await query;

    res.json({
      success: true,
      presets: presets.map((p: typeof mappingPresets.$inferSelect) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        sourceType: p.sourceType,
        mappingConfig: p.mappingConfig,
        isSystem: p.isSystem,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (error) {
    console.error('[GET /presets] Error:', error);
    res.status(500).json({ error: 'Failed to fetch presets' });
  }
});

router.post('/mapping/apply', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sourceData, exportToCsv = false, filename = 'brickfox_export' } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!sourceData || !Array.isArray(sourceData) || sourceData.length === 0) {
      return res.status(400).json({ 
        error: 'sourceData is required and must be a non-empty array' 
      });
    }

    const { mappingService } = await import('./services/mapping-service');
    const result = await mappingService.applyMapping(sourceData);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Mapping failed',
        errors: result.errors,
        warnings: result.warnings,
        stats: result.stats,
      });
    }

    if (exportToCsv && result.csv) {
      const filePath = await mappingService.exportToFile(result.csv, filename);
      
      return res.json({
        success: true,
        message: 'Mapping erfolgreich angewendet und als CSV exportiert',
        data: result.data,
        csv: result.csv,
        filePath,
        errors: result.errors,
        warnings: result.warnings,
        stats: result.stats,
      });
    }

    res.json({
      success: true,
      message: 'Mapping erfolgreich angewendet',
      data: result.data,
      csv: result.csv,
      errors: result.errors,
      warnings: result.warnings,
      stats: result.stats,
    });
  } catch (error) {
    console.error('[POST /mapping/apply] Error:', error);
    res.status(500).json({ 
      error: 'Mapping failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
