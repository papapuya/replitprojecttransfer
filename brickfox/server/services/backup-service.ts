import { db as heliumDb } from '../db';
import { 
  backups, 
  auditLogs, 
  projects, 
  productsInProjects, 
  suppliers, 
  templates,
  users,
  permissions,
} from '../../shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';

interface BackupMetadata {
  tablesIncluded: string[];
  recordCounts: Record<string, number>;
  duration: number;
  compression: boolean;
}

interface CreateBackupOptions {
  tenantId?: string;
  userId?: string;
  backupType: 'manual' | 'scheduled' | 'pre_migration';
  expiresInDays?: number;
}

interface RestoreBackupOptions {
  backupId: string;
  tenantId: string;
  userId: string;
}

export class BackupService {
  async createBackup(options: CreateBackupOptions) {
    const startTime = Date.now();
    const { tenantId, userId, backupType, expiresInDays = 30 } = options;

    try {
      console.log(`[Backup] Starting ${backupType} backup for tenant: ${tenantId || 'ALL'}`);

      const backupData: any = {};
      const recordCounts: Record<string, number> = {};

      if (tenantId) {
        backupData.users = await heliumDb
          .select()
          .from(users)
          .where(eq(users.tenantId, tenantId));
        recordCounts.users = backupData.users.length;

        backupData.projects = await heliumDb
          .select()
          .from(projects)
          .where(eq(projects.tenantId, tenantId));
        recordCounts.projects = backupData.projects.length;

        backupData.products = await heliumDb
          .select()
          .from(productsInProjects)
          .where(eq(productsInProjects.tenantId, tenantId));
        recordCounts.products = backupData.products.length;

        backupData.suppliers = await heliumDb
          .select()
          .from(suppliers)
          .where(eq(suppliers.tenantId, tenantId));
        recordCounts.suppliers = backupData.suppliers.length;

        backupData.templates = await heliumDb
          .select()
          .from(templates)
          .where(eq(templates.tenantId, tenantId));
        recordCounts.templates = backupData.templates.length;

        backupData.permissions = await heliumDb
          .select()
          .from(permissions)
          .where(eq(permissions.tenantId, tenantId));
        recordCounts.permissions = backupData.permissions.length;
      } else {
        backupData.projects = await heliumDb.select().from(projects);
        recordCounts.projects = backupData.projects.length;

        backupData.products = await heliumDb.select().from(productsInProjects);
        recordCounts.products = backupData.products.length;

        backupData.suppliers = await heliumDb.select().from(suppliers);
        recordCounts.suppliers = backupData.suppliers.length;

        backupData.templates = await heliumDb.select().from(templates);
        recordCounts.templates = backupData.templates.length;
      }

      const duration = Date.now() - startTime;
      const backupDataString = JSON.stringify(backupData);
      const size = Buffer.byteLength(backupDataString, 'utf8');

      const metadata: BackupMetadata = {
        tablesIncluded: Object.keys(recordCounts),
        recordCounts,
        duration,
        compression: false,
      };

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      const [backup] = await heliumDb
        .insert(backups)
        .values({
          tenantId: tenantId || null,
          backupType,
          status: 'completed',
          backupData: backupData,
          size,
          createdBy: userId || null,
          expiresAt,
          metadata,
        })
        .returning();

      console.log(`✅ [Backup] Created backup ${backup.id} (${(size / 1024 / 1024).toFixed(2)} MB, ${duration}ms)`);
      console.log(`   Tables: ${Object.entries(recordCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);

      await this.logAudit({
        tenantId: tenantId || null,
        userId: userId || null,
        action: 'create',
        resourceType: 'backup',
        resourceId: backup.id,
        changes: { metadata },
      });

      return backup;
    } catch (error: any) {
      console.error(`❌ [Backup] Failed:`, error);
      throw new Error(`Backup failed: ${error.message}`);
    }
  }

  async restoreBackup(options: RestoreBackupOptions) {
    const { backupId, tenantId, userId } = options;

    try {
      console.log(`[Backup] Starting restore from backup ${backupId} for tenant ${tenantId}`);

      const [backup] = await heliumDb
        .select()
        .from(backups)
        .where(eq(backups.id, backupId))
        .limit(1);

      if (!backup) {
        throw new Error('Backup not found');
      }

      if (backup.tenantId && backup.tenantId !== tenantId) {
        throw new Error('Backup does not belong to this tenant');
      }

      const backupData = backup.backupData as any;

      await heliumDb.transaction(async (tx) => {
        console.log('[Backup] Starting point-in-time restore transaction...');

        await tx.delete(permissions).where(eq(permissions.tenantId, tenantId));
        await tx.delete(productsInProjects).where(eq(productsInProjects.tenantId, tenantId));
        await tx.delete(projects).where(eq(projects.tenantId, tenantId));
        await tx.delete(suppliers).where(eq(suppliers.tenantId, tenantId));
        await tx.delete(templates).where(eq(templates.tenantId, tenantId));
        
        await tx.delete(users).where(eq(users.tenantId, tenantId));
        
        console.log('[Backup] Deleted existing tenant data for clean restore');

        if (backupData.users && Array.isArray(backupData.users)) {
          for (const user of backupData.users) {
            await tx
              .insert(users)
              .values(user);
          }
          console.log(`[Backup] Restored ${backupData.users.length} users`);
        }

        if (backupData.projects && Array.isArray(backupData.projects)) {
          for (const project of backupData.projects) {
            await tx
              .insert(projects)
              .values({
                ...project,
                tenantId,
              });
          }
          console.log(`[Backup] Restored ${backupData.projects.length} projects`);
        }

        if (backupData.products && Array.isArray(backupData.products)) {
          for (const product of backupData.products) {
            await tx
              .insert(productsInProjects)
              .values({
                ...product,
                tenantId,
              });
          }
          console.log(`[Backup] Restored ${backupData.products.length} products`);
        }

        if (backupData.suppliers && Array.isArray(backupData.suppliers)) {
          for (const supplier of backupData.suppliers) {
            await tx
              .insert(suppliers)
              .values({
                ...supplier,
                tenantId,
              });
          }
          console.log(`[Backup] Restored ${backupData.suppliers.length} suppliers`);
        }

        if (backupData.templates && Array.isArray(backupData.templates)) {
          for (const template of backupData.templates) {
            await tx
              .insert(templates)
              .values({
                ...template,
                tenantId,
              });
          }
          console.log(`[Backup] Restored ${backupData.templates.length} templates`);
        }

        if (backupData.permissions && Array.isArray(backupData.permissions)) {
          for (const permission of backupData.permissions) {
            await tx
              .insert(permissions)
              .values({
                ...permission,
                tenantId,
              });
          }
          console.log(`[Backup] Restored ${backupData.permissions.length} permissions`);
        }
      });

      console.log(`✅ [Backup] Restore completed from backup ${backupId}`);

      await this.logAudit({
        tenantId,
        userId,
        action: 'restore',
        resourceType: 'backup',
        resourceId: backupId,
        changes: { restoredAt: new Date().toISOString() },
      });

      return { success: true, message: 'Backup restored successfully' };
    } catch (error: any) {
      console.error(`❌ [Backup] Restore failed:`, error);
      throw new Error(`Restore failed: ${error.message}`);
    }
  }

  async listBackups(tenantId?: string) {
    try {
      const query = tenantId
        ? heliumDb.select().from(backups).where(eq(backups.tenantId, tenantId))
        : heliumDb.select().from(backups);

      const backupsList = await query
        .orderBy(desc(backups.createdAt))
        .limit(50);

      const sanitized = backupsList.map((b) => ({
        ...b,
        backupData: undefined,
      }));

      return sanitized;
    } catch (error: any) {
      console.error(`❌ [Backup] List failed:`, error);
      throw new Error(`Failed to list backups: ${error.message}`);
    }
  }

  async deleteBackup(backupId: string, tenantId?: string) {
    try {
      const conditions = tenantId
        ? and(eq(backups.id, backupId), eq(backups.tenantId, tenantId))
        : eq(backups.id, backupId);

      const deleted = await heliumDb
        .delete(backups)
        .where(conditions!)
        .returning();

      if (deleted.length === 0) {
        throw new Error('Backup not found or access denied');
      }

      console.log(`🗑️ [Backup] Deleted backup ${backupId}`);
      return { success: true };
    } catch (error: any) {
      console.error(`❌ [Backup] Delete failed:`, error);
      throw new Error(`Failed to delete backup: ${error.message}`);
    }
  }

  async cleanupExpiredBackups() {
    try {
      const now = new Date();
      const deleted = await heliumDb
        .delete(backups)
        .where(sql`${backups.expiresAt} < ${now}`)
        .returning();

      console.log(`🧹 [Backup] Cleaned up ${deleted.length} expired backups`);
      return { deleted: deleted.length };
    } catch (error: any) {
      console.error(`❌ [Backup] Cleanup failed:`, error);
      throw new Error(`Cleanup failed: ${error.message}`);
    }
  }

  async logAudit(data: {
    tenantId: string | null;
    userId: string | null;
    action: string;
    resourceType: string;
    resourceId: string;
    changes?: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    try {
      await heliumDb.insert(auditLogs).values({
        tenantId: data.tenantId,
        userId: data.userId,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        changes: data.changes || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
      });
    } catch (error) {
      console.error('[Audit] Failed to log:', error);
    }
  }
}

export const backupService = new BackupService();
