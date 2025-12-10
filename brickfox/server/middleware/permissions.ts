import { Request, Response, NextFunction } from 'express';
import { permissionService, Resource, Action } from '../services/permission-service';

export interface PermissionRequest extends Request {
  userId?: string;
  tenantId?: string;
  user?: any;
}

export function requirePermission(resource: Resource, action: Action, options?: { 
  loadOwnership?: boolean;
  resourceIdParam?: string;
}) {
  return async (req: PermissionRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId;
      const tenantId = req.tenantId;

      if (!userId) {
        return res.status(401).json({ 
          error: 'Authentifizierung erforderlich',
          message: 'Sie müssen angemeldet sein, um auf diese Ressource zuzugreifen.'
        });
      }

      let resourceOwnerId: string | undefined = undefined;

      if (action !== 'create') {
        const resourceIdParam = options?.resourceIdParam || 'id';
        const resourceId = req.params[resourceIdParam];
        
        if (resourceId) {
          const { db } = await import('../db');

          if (resource === 'projects') {
            const { projects } = await import('../../shared/schema');
            const { eq } = await import('drizzle-orm');
            const [project] = await db.select().from(projects).where(eq(projects.id, resourceId)).limit(1);
            resourceOwnerId = project?.userId;
          } else if (resource === 'products') {
            const { productsInProjects } = await import('../../shared/schema');
            const { projects } = await import('../../shared/schema');
            const { eq } = await import('drizzle-orm');
            const [product] = await db.select().from(productsInProjects).where(eq(productsInProjects.id, resourceId)).limit(1);
            if (product?.projectId) {
              const [project] = await db.select().from(projects).where(eq(projects.id, product.projectId)).limit(1);
              resourceOwnerId = project?.userId;
            }
          } else if (resource === 'suppliers') {
            const { suppliers } = await import('../../shared/schema');
            const { eq } = await import('drizzle-orm');
            const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, resourceId)).limit(1);
            resourceOwnerId = supplier?.userId;
          }
        }
      }

      const hasPermission = await permissionService.hasPermission({
        userId,
        resource,
        action,
        resourceOwnerId,
        tenantId,
      });

      if (!hasPermission) {
        return res.status(403).json({ 
          error: 'Zugriff verweigert',
          message: `Sie haben keine Berechtigung für '${action}' auf '${resource}'.`,
          required: { resource, action }
        });
      }

      next();
    } catch (error: any) {
      console.error('[Permission Middleware] Error:', error);
      return res.status(500).json({ 
        error: 'Interner Serverfehler',
        message: 'Berechtigungsprüfung fehlgeschlagen.'
      });
    }
  };
}

export function requireAnyPermission(checks: Array<{ resource: Resource; action: Action }>) {
  return async (req: PermissionRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId;
      const tenantId = req.tenantId;

      if (!userId) {
        return res.status(401).json({ 
          error: 'Authentifizierung erforderlich'
        });
      }

      for (const check of checks) {
        const hasPermission = await permissionService.hasPermission({
          userId,
          resource: check.resource,
          action: check.action,
          tenantId,
        });

        if (hasPermission) {
          next();
          return;
        }
      }

      return res.status(403).json({ 
        error: 'Zugriff verweigert',
        message: 'Sie haben keine der erforderlichen Berechtigungen.',
        required: checks
      });
    } catch (error: any) {
      console.error('[Permission Middleware] Error:', error);
      return res.status(500).json({ 
        error: 'Interner Serverfehler'
      });
    }
  };
}

export function requireRole(allowedRoles: string[]) {
  return async (req: PermissionRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ 
          error: 'Authentifizierung erforderlich'
        });
      }

      if (user.isAdmin) {
        next();
        return;
      }

      const userRole = user.role || 'member';

      if (allowedRoles.includes(userRole)) {
        next();
        return;
      }

      return res.status(403).json({ 
        error: 'Zugriff verweigert',
        message: `Ihre Rolle '${userRole}' hat keinen Zugriff. Erforderlich: ${allowedRoles.join(', ')}`,
        required: { roles: allowedRoles },
        current: { role: userRole }
      });
    } catch (error: any) {
      console.error('[Role Middleware] Error:', error);
      return res.status(500).json({ 
        error: 'Interner Serverfehler'
      });
    }
  };
}
