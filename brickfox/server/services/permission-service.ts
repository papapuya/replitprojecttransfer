import { db as heliumDb } from '../db';
import { permissions, users } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

export type Resource = 'products' | 'projects' | 'suppliers' | 'backups' | 'users' | 'templates' | 'exports';
export type Action = 'read' | 'create' | 'update' | 'delete' | 'export' | 'import' | 'restore';
export type Scope = 'all' | 'own' | 'team' | 'none';

export interface PermissionCheck {
  userId: string;
  resource: Resource;
  action: Action;
  resourceOwnerId?: string;
  tenantId?: string;
}

export class PermissionService {
  async hasPermission(check: PermissionCheck): Promise<boolean> {
    try {
      const { userId, resource, action, resourceOwnerId, tenantId } = check;

      const [user] = await heliumDb
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        console.log(`[Permission] User ${userId} not found`);
        return false;
      }

      if (user.isAdmin) {
        console.log(`[Permission] Admin user ${userId} has full access`);
        return true;
      }

      const userPermissions = await heliumDb
        .select()
        .from(permissions)
        .where(
          and(
            eq(permissions.userId, userId),
            eq(permissions.resource, resource),
            eq(permissions.action, action)
          )
        );

      if (userPermissions.length === 0) {
        const defaultPermissions = this.getDefaultPermissionsForRole(user.role || 'member');
        const matchingDefaults = defaultPermissions.filter(
          (p) => p.resource === resource && p.action === action
        );

        if (matchingDefaults.length === 0) {
          console.log(`[Permission] User ${userId} has no permissions for ${action} on ${resource}`);
          return false;
        }

        for (const defaultPerm of matchingDefaults) {
          if (defaultPerm.scope === 'all') {
            console.log(`[Permission] User ${userId} has default ${action} on ${resource} with 'all' scope via role ${user.role}`);
            return true;
          }

          if (defaultPerm.scope === 'own') {
            if (action === 'create') {
              console.log(`[Permission] User ${userId} allowed to create ${resource} with 'own' scope (will own created resource)`);
              return true;
            }
            
            if (resourceOwnerId === userId) {
              console.log(`[Permission] User ${userId} has default ${action} on ${resource} with 'own' scope and owns resource`);
              return true;
            }
          }

          if (defaultPerm.scope === 'team') {
            if (action === 'create') {
              console.log(`[Permission] User ${userId} allowed to create ${resource} with 'team' scope within tenant`);
              return true;
            }
            
            if (user.tenantId === tenantId) {
              console.log(`[Permission] User ${userId} has default ${action} on ${resource} with 'team' scope within tenant`);
              return true;
            }
          }
        }

        console.log(`[Permission] User ${userId} has default permissions but scope check failed`);
        return false;
      }

      for (const permission of userPermissions) {
        const scope = permission.scope as Scope;

        if (scope === 'all') {
          console.log(`[Permission] User ${userId} has 'all' scope for ${action} on ${resource}`);
          return true;
        }

        if (scope === 'own') {
          if (action === 'create') {
            console.log(`[Permission] User ${userId} allowed to create ${resource} with 'own' scope`);
            return true;
          }
          
          if (resourceOwnerId === userId) {
            console.log(`[Permission] User ${userId} has 'own' scope and owns resource`);
            return true;
          }
        }

        if (scope === 'team') {
          if (action === 'create') {
            console.log(`[Permission] User ${userId} allowed to create ${resource} with 'team' scope`);
            return true;
          }
          
          if (user.tenantId === tenantId) {
            console.log(`[Permission] User ${userId} has 'team' scope within tenant`);
            return true;
          }
        }
      }

      console.log(`[Permission] User ${userId} denied ${action} on ${resource}`);
      return false;
    } catch (error) {
      console.error('[Permission] Check failed:', error);
      return false;
    }
  }

  async grantPermission(data: {
    userId: string;
    tenantId?: string;
    resource: Resource;
    action: Action;
    scope?: Scope;
    conditions?: any;
  }) {
    try {
      const [permission] = await heliumDb
        .insert(permissions)
        .values({
          userId: data.userId,
          tenantId: data.tenantId || null,
          resource: data.resource,
          action: data.action,
          scope: data.scope || 'all',
          conditions: data.conditions || null,
        })
        .returning();

      console.log(`✅ [Permission] Granted ${data.action} on ${data.resource} to user ${data.userId}`);
      return permission;
    } catch (error: any) {
      console.error('[Permission] Grant failed:', error);
      throw new Error(`Failed to grant permission: ${error.message}`);
    }
  }

  async revokePermission(permissionId: string) {
    try {
      await heliumDb
        .delete(permissions)
        .where(eq(permissions.id, permissionId));

      console.log(`🗑️ [Permission] Revoked permission ${permissionId}`);
      return { success: true };
    } catch (error: any) {
      console.error('[Permission] Revoke failed:', error);
      throw new Error(`Failed to revoke permission: ${error.message}`);
    }
  }

  async listUserPermissions(userId: string) {
    try {
      const userPermissions = await heliumDb
        .select()
        .from(permissions)
        .where(eq(permissions.userId, userId));

      return userPermissions;
    } catch (error: any) {
      console.error('[Permission] List failed:', error);
      throw new Error(`Failed to list permissions: ${error.message}`);
    }
  }

  async updateUserRole(userId: string, newRole: string) {
    try {
      const [user] = await heliumDb
        .update(users)
        .set({ role: newRole })
        .where(eq(users.id, userId))
        .returning();

      console.log(`✅ [Permission] Updated user ${userId} to role ${newRole}`);
      return user;
    } catch (error: any) {
      console.error('[Permission] Role update failed:', error);
      throw new Error(`Failed to update role: ${error.message}`);
    }
  }

  getDefaultPermissionsForRole(role: string): Array<{ resource: Resource; action: Action; scope: Scope }> {
    const rolePermissions: Record<string, Array<{ resource: Resource; action: Action; scope: Scope }>> = {
      admin: [
        { resource: 'products', action: 'read', scope: 'all' },
        { resource: 'products', action: 'create', scope: 'all' },
        { resource: 'products', action: 'update', scope: 'all' },
        { resource: 'products', action: 'delete', scope: 'all' },
        { resource: 'products', action: 'export', scope: 'all' },
        { resource: 'projects', action: 'read', scope: 'all' },
        { resource: 'projects', action: 'create', scope: 'all' },
        { resource: 'projects', action: 'update', scope: 'all' },
        { resource: 'projects', action: 'delete', scope: 'all' },
        { resource: 'suppliers', action: 'read', scope: 'all' },
        { resource: 'suppliers', action: 'create', scope: 'all' },
        { resource: 'suppliers', action: 'update', scope: 'all' },
        { resource: 'suppliers', action: 'delete', scope: 'all' },
        { resource: 'backups', action: 'read', scope: 'all' },
        { resource: 'backups', action: 'create', scope: 'all' },
        { resource: 'backups', action: 'restore', scope: 'all' },
        { resource: 'users', action: 'read', scope: 'all' },
        { resource: 'users', action: 'create', scope: 'all' },
        { resource: 'users', action: 'update', scope: 'all' },
      ],
      editor: [
        { resource: 'products', action: 'read', scope: 'all' },
        { resource: 'products', action: 'create', scope: 'all' },
        { resource: 'products', action: 'update', scope: 'all' },
        { resource: 'products', action: 'export', scope: 'all' },
        { resource: 'projects', action: 'read', scope: 'all' },
        { resource: 'projects', action: 'create', scope: 'all' },
        { resource: 'projects', action: 'update', scope: 'all' },
        { resource: 'suppliers', action: 'read', scope: 'all' },
        { resource: 'suppliers', action: 'create', scope: 'all' },
        { resource: 'suppliers', action: 'update', scope: 'all' },
      ],
      viewer: [
        { resource: 'products', action: 'read', scope: 'all' },
        { resource: 'products', action: 'export', scope: 'all' },
        { resource: 'projects', action: 'read', scope: 'all' },
        { resource: 'suppliers', action: 'read', scope: 'all' },
      ],
      project_manager: [
        { resource: 'products', action: 'read', scope: 'all' },
        { resource: 'products', action: 'create', scope: 'all' },
        { resource: 'products', action: 'update', scope: 'own' },
        { resource: 'products', action: 'delete', scope: 'own' },
        { resource: 'projects', action: 'read', scope: 'all' },
        { resource: 'projects', action: 'create', scope: 'all' },
        { resource: 'projects', action: 'update', scope: 'own' },
        { resource: 'projects', action: 'delete', scope: 'own' },
        { resource: 'suppliers', action: 'read', scope: 'all' },
      ],
      member: [
        { resource: 'products', action: 'read', scope: 'own' },
        { resource: 'products', action: 'create', scope: 'own' },
        { resource: 'products', action: 'update', scope: 'own' },
        { resource: 'projects', action: 'read', scope: 'own' },
        { resource: 'projects', action: 'create', scope: 'own' },
        { resource: 'suppliers', action: 'read', scope: 'all' },
      ],
    };

    return rolePermissions[role] || rolePermissions.member;
  }

  async initializeDefaultPermissions(userId: string, role: string, tenantId?: string) {
    try {
      const defaultPerms = this.getDefaultPermissionsForRole(role);

      for (const perm of defaultPerms) {
        await this.grantPermission({
          userId,
          tenantId,
          resource: perm.resource,
          action: perm.action,
          scope: perm.scope,
        });
      }

      console.log(`✅ [Permission] Initialized ${defaultPerms.length} default permissions for user ${userId} (${role})`);
    } catch (error: any) {
      console.error('[Permission] Initialize defaults failed:', error);
    }
  }
}

export const permissionService = new PermissionService();
