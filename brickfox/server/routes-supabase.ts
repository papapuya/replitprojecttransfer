import type { Express } from "express";
import { createServer, type Server } from "http";
import { supabase, supabaseAdmin } from './supabase';
import { supabaseStorage } from './supabase-storage';
import { loginUser, createLocalUser, getUserById, createSession, getSession, deleteSession, createAdminUser } from './local-auth';
import { registerUserSchema, loginUserSchema } from '@shared/schema';
import { db as heliumDb } from './db';
import { sql, eq, and, isNotNull } from 'drizzle-orm';
import { 
  productsInProjects as productsInProjectsTable, 
  suppliers as suppliersTable,
  scrapeSession as scrapeSessionTable,
  users as usersTable,
  auditLogs as auditLogsTable,
  backups as backupsTable,
  permissions as permissionsTable,
} from '@shared/schema';
import Stripe from 'stripe';
import { 
  createCheckoutSession, 
  createPortalSession, 
  handleWebhookEvent, 
  getSubscriptionStatus,
  PLANS 
} from './stripe-service';
import multer from "multer";
import { analyzeCSV, generateProductDescription, convertTextToHTML, refineDescription, generateProductName, processProductWithNewWorkflow, generateShopDescription, generateSEOTitle, generateSEODescription, generateAltText } from "./ai-service";
import { scrapeProduct, scrapeProductList, defaultSelectors, brickfoxSelectors, type ScraperSelectors, performLogin, testSelector, getSelectorsForSupplier } from "./scraper-service";
import { pixiService } from "./services/pixi-service";
import { mapProductsToBrickfox, brickfoxRowsToCSV } from "./services/brickfox-mapper";
import { enhanceProductsWithAI } from "./services/brickfox-ai-enhancer";
import { loadMappingsForSupplier, loadMappingsForProject } from "./services/brickfox-mapping-loader";
import Papa from "papaparse";
import { nanoid } from "nanoid";
import { createProjectSchema, createProductInProjectSchema, updateProductInProjectSchema } from "@shared/schema";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'text/csv',
      'image/jpeg',
      'image/png',
      'image/webp',
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

import { apiKeyManager } from './api-key-manager';
import webhooksRouter from './webhooks-supabase';
import mappingRouter from './routes-mapping';
import { pdfParserService } from './services/pdf-parser';
import { deeplService } from './services/deepl-service';

async function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }

  const token = authHeader.split(' ')[1]?.trim();
  
  // Local session-based auth
  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Ungültiges Token' });
  }
  
  const user = await getUserById(session.userId);

  if (!user) {
    return res.status(401).json({ error: 'Benutzer nicht gefunden' });
  }

  req.user = user;
  req.userId = user.id;
  req.tenantId = user.tenantId || null;

  // CRITICAL: Set tenant_id on the ACTUAL Drizzle database connection for RLS
  if (user.tenantId) {
    try {
      const { pool } = await import('./db');
      if (pool) {
        const jwtClaims = JSON.stringify({
          sub: user.id,
          tenant_id: user.tenantId,
          role: user.role || 'member',
          user_role: user.role || 'member'
        });
        
        // Set config on the PostgreSQL connection that Drizzle uses
        await pool.query("SELECT set_config('request.jwt.claims', $1, true)", [jwtClaims]);
        console.log(`[RLS] Set tenant context for user ${user.email}: tenant_id=${user.tenantId}`);
      }
    } catch (error) {
      console.error('[requireAuth] CRITICAL: Failed to set tenant context on DB connection:', error);
      return res.status(500).json({ error: 'Fehler beim Setzen des Tenant-Kontexts' });
    }
  }

  next();
}

async function requireAdmin(req: any, res: any, next: any) {
  await requireAuth(req, res, async () => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin-Zugriff erforderlich' });
    }
    next();
  });
}

// Super Admin check: Only for system-wide admin (sarahzerrer@icloud.com)
async function requireSuperAdmin(req: any, res: any, next: any) {
  await requireAuth(req, res, async () => {
    const isSuperAdmin = req.user?.email === 'sarahzerrer@icloud.com';
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'System-Admin-Zugriff erforderlich' });
    }
    next();
  });
}

// Middleware: Check if tenant has a specific feature enabled
function requireFeature(featureName: keyof NonNullable<import('@shared/schema').TenantSettings['features']>) {
  return async (req: any, res: any, next: any) => {
    if (!req.user?.tenantId) {
      return res.status(401).json({ error: 'Nicht authentifiziert' });
    }

    const tenant = await supabaseStorage.getTenant(req.user.tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant nicht gefunden' });
    }

    const features = tenant.settings?.features || {};
    const isEnabled = features[featureName];

    // Default values: urlScraper, csvBulkImport, aiDescriptions are enabled by default
    const defaultEnabled = ['urlScraper', 'csvBulkImport', 'aiDescriptions'];
    const featureAllowed = defaultEnabled.includes(featureName) 
      ? isEnabled !== false  // Enabled unless explicitly disabled
      : isEnabled === true;  // Disabled unless explicitly enabled

    if (!featureAllowed) {
      return res.status(403).json({ 
        error: `Feature "${featureName}" ist für Ihren Account nicht freigeschaltet. Bitte upgraden Sie Ihr Abonnement.` 
      });
    }

    next();
  };
}

async function checkApiLimit(req: any, res: any, next: any) {
  if (!req.user) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }

  const user = await supabaseStorage.getUserById(req.user.id);
  
  if (!user) {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  if (user.apiCallsUsed >= user.apiCallsLimit) {
    return res.status(429).json({ 
      error: 'API-Limit erreicht', 
      limit: user.apiCallsLimit,
      used: user.apiCallsUsed 
    });
  }

  next();
}

async function trackApiUsage(req: any, res: any, next: any) {
  if (req.user) {
    await supabaseStorage.incrementApiCalls(req.user.id);
  }
  next();
}

/**
 * Helper function to perform login if supplier has login credentials configured
 * Returns cookies to use for scraping requests
 */
async function getScrapingCookies(supplierId?: string, providedCookies?: string): Promise<string> {
  // If cookies are already provided, use them
  if (providedCookies) {
    console.log('[getScrapingCookies] Using provided cookies');
    return providedCookies;
  }

  // If no supplier ID, return empty cookies
  if (!supplierId) {
    console.log('[getScrapingCookies] No supplier ID, returning empty cookies');
    return '';
  }

  console.log(`[getScrapingCookies] Looking for supplier with ID: ${supplierId}`);

  // SECURITY: Fetch supplier data with decrypted credentials (internal use only)
  const supplier = await supabaseStorage.getSupplierWithCredentials(supplierId);
  if (!supplier) {
    console.log(`[getScrapingCookies] Supplier not found for ID: ${supplierId}`);
    return '';
  }
  
  console.log(`[getScrapingCookies] Found supplier: ${supplier.name}`);

  // Check if supplier has login credentials configured
  if (!supplier.loginUrl || !supplier.loginUsernameField || !supplier.loginPasswordField || 
      !supplier.loginUsername || !supplier.loginPassword) {
    console.log('[getScrapingCookies] Supplier has no login credentials configured');
    return supplier.sessionCookies || '';
  }

  // Check if we have cached cookies and if they're still fresh
  const COOKIE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  if (supplier.sessionCookies && supplier.sessionCookiesUpdatedAt) {
    const cookieAge = Date.now() - new Date(supplier.sessionCookiesUpdatedAt).getTime();
    
    if (cookieAge < COOKIE_TTL) {
      console.log(`[getScrapingCookies] Using cached cookies (age: ${Math.round(cookieAge / 1000 / 60)} minutes)`);
      return supplier.sessionCookies;
    } else {
      console.log(`[getScrapingCookies] Cached cookies expired (age: ${Math.round(cookieAge / 1000 / 60 / 60)} hours), performing fresh login`);
    }
  }

  // Perform login and get cookies
  try {
    console.log(`[getScrapingCookies] Performing login for supplier ${supplier.name}`);
    const cookies = await performLogin({
      loginUrl: supplier.loginUrl,
      usernameField: supplier.loginUsernameField,
      passwordField: supplier.loginPasswordField,
      username: supplier.loginUsername,
      password: supplier.loginPassword,
      userAgent: supplier.userAgent
    });

    // Update supplier with session cookies for future use
    if (cookies) {
      await supabaseStorage.updateSupplier(supplierId, { 
        sessionCookies: cookies,
        sessionCookiesUpdatedAt: new Date().toISOString()
      });
      console.log(`[getScrapingCookies] Updated supplier session cookies with fresh login`);
    }

    return cookies;
  } catch (error) {
    console.error('[getScrapingCookies] Login failed:', error);
    // Fallback to stored session cookies if login fails
    return supplier.sessionCookies || '';
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Contact Form Endpoint
  app.post('/api/contact', async (req, res) => {
    try {
      const { name, company, email, phone, message } = req.body;

      if (!name || !email || !message) {
        return res.status(400).json({ error: 'Name, E-Mail und Nachricht sind erforderlich' });
      }

      // Contact form submitted (email service removed)
      console.log(`✅ Contact form submitted by ${name} (${email})`);
      res.json({ success: true });
    } catch (error: any) {
      console.error('❌ Contact form error:', error);
      res.status(500).json({ error: error.message || 'Fehler beim Senden der Nachricht' });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const validatedData = registerUserSchema.parse(req.body);

      // Generate slug with proper German umlaut handling
      let tenantSlug = validatedData.companyName
        .toLowerCase()
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/--+/g, '-');

      if (!tenantSlug || tenantSlug.length === 0) {
        tenantSlug = 'company';
      }

      let finalSlug = tenantSlug;
      let counter = 2;
      let slugExists = true;
      
      while (slugExists) {
        const existing = await supabaseStorage.getTenantBySlug(finalSlug);
        if (!existing) {
          slugExists = false;
        } else {
          finalSlug = `${tenantSlug}-${counter}`;
          counter++;
        }
      }

      console.log(`[Register] Creating tenant: ${validatedData.companyName} (slug: ${finalSlug})`);

      const newTenant = await supabaseStorage.createTenant({
        name: validatedData.companyName,
        slug: finalSlug,
        settings: {
          default_categories: ['battery', 'charger', 'tool', 'gps', 'drone', 'camera'],
          mediamarkt_title_format: 'Kategorie + Artikelnummer'
        }
      });

      console.log(`[Register] Tenant created: ${newTenant.id}`);

      // Create user with local auth
      const user = await createLocalUser(validatedData.email, validatedData.password, {
        username: validatedData.username || validatedData.email.split('@')[0],
        isAdmin: true,
        tenantId: newTenant.id,
      });

      console.log(`✅ [Register] User ${validatedData.email} created locally (admin role)`);

      const token = createSession(user.id);

      res.json({ 
        user, 
        session: { access_token: token },
        access_token: token 
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Ungültige Registrierungsdaten' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      loginUserSchema.parse(req.body);
      
      let emailToUse = req.body.email;
      
      console.log(`[LOGIN] Input: "${emailToUse}"`);
      
      // Handle username login
      if (!emailToUse.includes('@')) {
        console.log(`[LOGIN] Looking up username: "${emailToUse}"`);
        const userByUsername = await supabaseStorage.getUserByUsername(emailToUse);
        if (userByUsername) {
          emailToUse = userByUsername.email;
        }
      }
      
      // Local auth login
      const user = await loginUser(emailToUse, req.body.password);

      if (!user) {
        console.log(`[LOGIN] ❌ Auth failed for: ${emailToUse}`);
        return res.status(401).json({ error: 'Ungültiger Benutzername/E-Mail oder Passwort' });
      }

      const token = createSession(user.id);
      console.log(`[LOGIN] ✅ Login successful for ${user.email}`);

      res.json({ 
        user,
        session: { access_token: token },
        access_token: token
      });
    } catch (error) {
      res.status(400).json({ error: 'Ungültige Login-Daten' });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      deleteSession(token);
    }
    res.json({ success: true });
  });

  app.get('/api/auth/user', async (req, res) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Nicht authentifiziert' });
    }

    const token = authHeader.split(' ')[1];
    
    // Local session-based auth
    const session = getSession(token);
    if (!session) {
      return res.status(401).json({ error: 'Ungültiges Token' });
    }

    const user = await getUserById(session.userId);
    if (!user) {
      return res.status(401).json({ error: 'Benutzer nicht gefunden' });
    }

    res.json({ user });
  });

  // Get current user's tenant (for both admins and regular users)
  app.get('/api/user/tenant', requireAuth, async (req: any, res) => {
    try {
      if (!req.user.tenantId) {
        return res.json({ tenant: null });
      }

      const tenant = await supabaseStorage.getTenant(req.user.tenantId);
      
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant nicht gefunden' });
      }

      const stats = await supabaseStorage.getTenantStats(tenant.id);
      
      res.json({
        tenant: {
          ...tenant,
          ...stats,
        },
      });
    } catch (error: any) {
      console.error('Get user tenant error:', error);
      res.status(500).json({ error: error.message || 'Fehler beim Laden des Tenants' });
    }
  });

  // Temporary: Update current user's API limit to 3000
  app.post('/api/auth/update-my-limit', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      
      const { error } = await supabaseAdmin!
        .from('users')
        .update({ 
          api_calls_limit: 50,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;

      console.log(`✅ Updated user ${user.email} limit from 100 to 3000`);
      
      res.json({ 
        success: true, 
        message: 'Dein API-Limit wurde auf 3.000 erhöht (GPT-4o-mini)',
        oldLimit: 100,
        newLimit: 3000
      });
    } catch (error: any) {
      console.error('Update limit error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/dashboard/stats', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      
      const projects = await supabaseStorage.getProjectsByUserId(user.id);
      
      let totalProducts = 0;
      for (const project of projects) {
        const products = await supabaseStorage.getProducts(project.id);
        totalProducts += products.length;
      }
      
      const freshUser = await supabaseStorage.getUserById(user.id);
      
      res.json({
        success: true,
        stats: {
          projectCount: projects.length,
          productCount: totalProducts,
          apiCallsUsed: freshUser?.apiCallsUsed || 0,
          apiCallsLimit: freshUser?.apiCallsLimit || 50,
          planId: freshUser?.planId || 'trial',
          subscriptionStatus: freshUser?.subscriptionStatus || 'trial',
        },
        recentProjects: projects.slice(0, 5),
      });
    } catch (error) {
      console.error('Dashboard stats error:', error);
      res.status(500).json({ error: 'Fehler beim Laden der Dashboard-Daten' });
    }
  });

  app.get('/api/admin/customers', requireSuperAdmin, async (req, res) => {
    try {
      const users = await supabaseStorage.getAllUsers();
      
      const customersWithStats = await Promise.all(
        users.map(async (user) => {
          const projects = await supabaseStorage.getProjectsByUserId(user.id);
          let totalProducts = 0;
          for (const project of projects) {
            const products = await supabaseStorage.getProducts(project.id);
            totalProducts += products.length;
          }
          
          return {
            ...user,
            projectCount: projects.length,
            productCount: totalProducts,
          };
        })
      );
      
      res.json({
        success: true,
        customers: customersWithStats,
      });
    } catch (error) {
      console.error('Admin customers error:', error);
      res.status(500).json({ error: 'Fehler beim Laden der Kundendaten' });
    }
  });

  app.get('/api/admin/users', requireSuperAdmin, async (req, res) => {
    try {
      const users = await supabaseStorage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: 'Fehler beim Laden der Benutzer' });
    }
  });

  // Initial Admin Setup - nur wenn noch KEIN Admin existiert
  app.post('/api/admin/initial-setup', async (req, res) => {
    try {
      const { email, password, username } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
      }

      // Check if any admin already exists
      const existingAdmins = await heliumDb.select()
        .from(usersTable)
        .where(eq(usersTable.isAdmin, true))
        .limit(1);

      if (existingAdmins.length > 0) {
        return res.status(403).json({ error: 'Admin-Benutzer existiert bereits' });
      }

      // Create the first admin user with custom username
      if (!supabaseAdmin) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
      }

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error) throw error;

      const { data: akkushopTenant } = await supabaseAdmin
        .from('tenants')
        .select('id')
        .eq('slug', 'akkushop')
        .single();

      if (!akkushopTenant) {
        console.error('AkkuShop tenant not found for admin user');
      }

      const { error: insertError } = await supabaseAdmin
        .from('users')
        .upsert({
          id: data.user.id,
          email: email,
          username: username || 'Admin',
          is_admin: true,
          role: 'admin',
          tenant_id: akkushopTenant?.id,
          subscription_status: 'trial',
          plan_id: 'trial',
          api_calls_limit: 999999, // Admin: unlimited
          api_calls_used: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id'
        });

      if (insertError) {
        throw new Error(`Failed to create user record: ${insertError.message}`);
      }

      console.log(`✅ Initial Admin user created: ${email} (Username: ${username || 'Admin'})`);
      res.json({ success: true, message: `Admin-Benutzer erstellt: ${username || 'Admin'}` });
    } catch (error: any) {
      console.error('Initial admin setup error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/create-admin', requireSuperAdmin, async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
      }

      await createAdminUser(email, password);
      res.json({ success: true, message: 'Admin-Benutzer erstellt' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Tenant Management Endpoints (Admin only)
  // Get user's own tenant (for regular customers)
  app.get('/api/user/tenant', requireAuth, async (req: any, res) => {
    try {
      const user = req.user; // Already set by requireAuth middleware
      if (!user || !user.tenantId) {
        return res.status(401).json({ error: 'Nicht authentifiziert' });
      }

      const tenant = await supabaseStorage.getTenant(user.tenantId);
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant nicht gefunden' });
      }

      const stats = await supabaseStorage.getTenantStats(tenant.id);

      res.json({
        success: true,
        tenant: {
          ...tenant,
          ...stats,
        },
      });
    } catch (error) {
      console.error('Get user tenant error:', error);
      res.status(500).json({ error: 'Fehler beim Laden des Tenants' });
    }
  });

  app.get('/api/admin/tenants', requireSuperAdmin, async (req, res) => {
    try {
      const tenants = await supabaseStorage.getAllTenants();
      
      // Get stats for each tenant
      const tenantsWithStats = await Promise.all(
        tenants.map(async (tenant) => {
          const stats = await supabaseStorage.getTenantStats(tenant.id);
          return {
            ...tenant,
            ...stats,
          };
        })
      );
      
      res.json({
        success: true,
        tenants: tenantsWithStats,
      });
    } catch (error) {
      console.error('Admin tenants error:', error);
      res.status(500).json({ error: 'Fehler beim Laden der Tenants' });
    }
  });

  app.post('/api/admin/tenants', requireSuperAdmin, async (req, res) => {
    try {
      const { name, settings } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Tenant-Name erforderlich' });
      }

      const tenant = await supabaseStorage.createTenant({ name, settings });
      const stats = await supabaseStorage.getTenantStats(tenant.id);
      
      res.json({
        success: true,
        tenant: {
          ...tenant,
          ...stats,
        },
      });
    } catch (error: any) {
      console.error('Create tenant error:', error);
      res.status(500).json({ error: error.message || 'Fehler beim Erstellen des Tenants' });
    }
  });

  // Bulk delete selected tenants (MUST be before /:id route!)
  app.delete('/api/admin/tenants/bulk-delete', requireSuperAdmin, async (req, res) => {
    try {
      const currentUser = (req as any).user;
      if (!currentUser) {
        return res.status(401).json({ error: 'Nicht authentifiziert' });
      }

      const { tenantIds } = req.body;

      if (!tenantIds || !Array.isArray(tenantIds) || tenantIds.length === 0) {
        return res.status(400).json({ error: 'Keine Tenant-IDs angegeben' });
      }

      // Prevent deleting super-admin's own tenant
      const tenantsToDelete = tenantIds.filter(id => id !== currentUser.tenant_id);

      let deletedCount = 0;
      for (const tenantId of tenantsToDelete) {
        const success = await supabaseStorage.deleteTenant(tenantId);
        if (success) {
          deletedCount++;
        }
      }

      res.json({
        success: true,
        deletedCount,
        message: `${deletedCount} Kunden wurden gelöscht`,
      });
    } catch (error: any) {
      console.error('Bulk delete tenants error:', error);
      res.status(500).json({ error: error.message || 'Fehler beim Löschen der Tenants' });
    }
  });

  app.delete('/api/admin/tenants/:id', requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const success = await supabaseStorage.deleteTenant(id);
      
      if (!success) {
        return res.status(404).json({ error: 'Tenant nicht gefunden oder konnte nicht gelöscht werden' });
      }
      
      res.json({
        success: true,
        message: 'Tenant erfolgreich gelöscht',
      });
    } catch (error: any) {
      console.error('Delete tenant error:', error);
      res.status(500).json({ error: error.message || 'Fehler beim Löschen des Tenants' });
    }
  });

  app.patch('/api/admin/tenants/:id', requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, settings } = req.body;
      
      const tenant = await supabaseStorage.updateTenant(id, { name, settings });
      
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant nicht gefunden' });
      }

      const stats = await supabaseStorage.getTenantStats(tenant.id);
      
      res.json({
        success: true,
        tenant: {
          ...tenant,
          ...stats,
        },
      });
    } catch (error: any) {
      console.error('Update tenant error:', error);
      res.status(500).json({ error: error.message || 'Fehler beim Aktualisieren des Tenants' });
    }
  });

  // Admin KPIs Dashboard Endpoint
  app.get('/api/admin/kpis', requireSuperAdmin, async (req, res) => {
    try {
      const tenantId = req.query.tenantId as string | undefined;
      
      // Get total products (mandantenübergreifend or filtered)
      const productsQuery = heliumDb
        .select({ count: sql<number>`count(*)::int` })
        .from(productsInProjectsTable);
      
      if (tenantId) {
        productsQuery.where(eq(productsInProjectsTable.tenantId, tenantId));
      }
      
      const [{ count: totalProducts }] = await productsQuery;
      
      // Get data completeness (Produkte mit allen Pflichtfeldern)
      const completeProductsQuery = heliumDb
        .select({ count: sql<number>`count(*)::int` })
        .from(productsInProjectsTable)
        .where(
          and(
            isNotNull(productsInProjectsTable.name),
            isNotNull(productsInProjectsTable.articleNumber),
            isNotNull(productsInProjectsTable.extractedData),
            tenantId ? eq(productsInProjectsTable.tenantId, tenantId) : undefined
          )
        );
      
      const [{ count: completeProducts }] = await completeProductsQuery;
      const completenessPercentage = totalProducts > 0 
        ? Math.round((completeProducts / totalProducts) * 100) 
        : 0;
      
      // Get supplier stats
      const suppliersQuery = heliumDb
        .select({
          id: suppliersTable.id,
          name: suppliersTable.name,
          lastVerifiedAt: suppliersTable.lastVerifiedAt,
        })
        .from(suppliersTable);
      
      if (tenantId) {
        suppliersQuery.where(eq(suppliersTable.tenantId, tenantId));
      }
      
      const suppliers = await suppliersQuery;
      const activeSuppliers = suppliers.length;
      const successfulSuppliers = suppliers.filter((s: any) => s.lastVerifiedAt).length;
      const errorSuppliers = activeSuppliers - successfulSuppliers;
      
      // Get last Pixi sync from latest successful comparison
      const lastPixiSync = new Date(); // Placeholder - real tracking would query scrape_sessions or pixi_comparisons table
      
      // Get AI texts generated today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const aiTextsQuery = heliumDb
        .select({ count: sql<number>`count(*)::int` })
        .from(scrapeSessionTable)
        .where(
          and(
            isNotNull(scrapeSessionTable.generatedDescription),
            sql`${scrapeSessionTable.createdAt} >= ${today}`,
            tenantId ? eq(scrapeSessionTable.tenantId, tenantId) : undefined
          )
        );
      
      const [{ count: aiTextsToday }] = await aiTextsQuery;
      
      res.json({
        success: true,
        kpis: {
          totalProducts,
          completenessPercentage,
          suppliers: {
            active: activeSuppliers,
            successful: successfulSuppliers,
            error: errorSuppliers,
          },
          lastPixiSync: lastPixiSync.toISOString(),
          aiTextsToday,
        },
      });
    } catch (error: any) {
      console.error('Admin KPIs error:', error);
      res.status(500).json({ error: error.message || 'Fehler beim Laden der KPIs' });
    }
  });

  app.get('/api/projects', requireAuth, async (req: any, res) => {
    try {
      const projects = await supabaseStorage.getProjectsByUserId(req.user.id);
      res.json({ success: true, projects });
    } catch (error) {
      res.status(500).json({ error: 'Fehler beim Laden der Projekte' });
    }
  });

  app.post('/api/projects', requireAuth, async (req: any, res) => {
    try {
      console.log('[POST /api/projects] Request body:', JSON.stringify(req.body, null, 2));
      const data = createProjectSchema.parse(req.body);
      const project = await supabaseStorage.createProject(req.user.id, data);
      res.json(project);
    } catch (error: any) {
      console.error('[POST /api/projects] Error:', error);
      res.status(400).json({ error: 'Ungültige Projektdaten', details: error.message });
    }
  });

  app.get('/api/projects/:id', requireAuth, async (req: any, res) => {
    try {
      const project = await supabaseStorage.getProject(req.params.id, req.user.id);
      if (!project) {
        return res.status(404).json({ error: 'Projekt nicht gefunden' });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: 'Fehler beim Laden des Projekts' });
    }
  });

  app.delete('/api/projects/:id', requireAuth, async (req: any, res) => {
    try {
      const success = await supabaseStorage.deleteProject(req.params.id, req.user.id);
      if (!success) {
        return res.status(404).json({ error: 'Projekt nicht gefunden' });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Fehler beim Löschen des Projekts' });
    }
  });

  app.get('/api/projects/:projectId/products', requireAuth, async (req: any, res) => {
    try {
      const products = await supabaseStorage.getProducts(req.params.projectId, req.user.id);
      console.log(`[GET /products] Project ${req.params.projectId}: Found ${products.length} products`);
      res.json({ success: true, products });
    } catch (error) {
      res.status(500).json({ error: 'Fehler beim Laden der Produkte' });
    }
  });

  app.post('/api/projects/:projectId/products', requireAuth, checkApiLimit, async (req: any, res) => {
    try {
      console.log('[POST /products] Request body:', JSON.stringify(req.body, null, 2));
      const data = createProductInProjectSchema.parse(req.body);
      const product = await supabaseStorage.createProduct(req.params.projectId, data, req.user.id);
      await trackApiUsage(req, res, () => {});
      res.json(product);
    } catch (error: any) {
      console.error('[POST /products] Validation error:', error);
      res.status(400).json({ error: error.message || 'Ungültige Produktdaten' });
    }
  });

  app.delete('/api/products/:id', requireAuth, async (req: any, res) => {
    try {
      const success = await supabaseStorage.deleteProduct(req.params.id, req.user.id);
      if (!success) {
        return res.status(404).json({ error: 'Produkt nicht gefunden oder keine Berechtigung' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('[DELETE /products] Error:', error);
      res.status(500).json({ error: 'Fehler beim Löschen des Produkts' });
    }
  });

  // Regenerate selected products with optional custom prompt
  app.post('/api/projects/:projectId/regenerate', requireAuth, checkApiLimit, async (req: any, res) => {
    try {
      const { productIds, customPrompt } = req.body;
      const projectId = req.params.projectId;

      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ error: 'Keine Produkte ausgewählt' });
      }

      console.log(`[REGENERATE] Starting regeneration for ${productIds.length} products in project ${projectId}`);
      if (customPrompt) {
        console.log(`[REGENERATE] Custom prompt: ${customPrompt.substring(0, 100)}...`);
      }

      // Get all products from project
      const allProducts = await supabaseStorage.getProducts(projectId, req.user.id);
      const productsToRegenerate = allProducts.filter(p => productIds.includes(p.id));

      if (productsToRegenerate.length === 0) {
        return res.status(404).json({ error: 'Keine passenden Produkte gefunden' });
      }

      // Send immediate response
      res.json({ 
        success: true, 
        message: `Regenerierung für ${productsToRegenerate.length} Produkte gestartet`,
        count: productsToRegenerate.length 
      });

      // Process regeneration in background
      (async () => {
        const { generateProductDescription } = await import('./ai-service');
        
        for (const product of productsToRegenerate) {
          try {
            // Get original description from customAttributes
            const originalDesc = product.customAttributes?.find(a => a.key === 'produktbeschreibung_original')?.value || product.previewText || '';
            const productName = product.exactProductName || product.name || '';

            // Build extractedData array for generateProductDescription
            const extractedData: Record<string, any>[] = [{
              productName,
              description: originalDesc,
              additionalInstructions: customPrompt || '',
              // Add any other relevant data from customAttributes
              ...product.customAttributes?.reduce((acc, attr) => {
                acc[attr.key] = attr.value;
                return acc;
              }, {} as Record<string, string>)
            }];

            // Add custom prompt to attributes if provided
            const customAttrs = {
              exactProductName: productName,
              articleNumber: product.articleNumber || '',
              customAttributes: product.customAttributes || [],
            };

            console.log(`[REGENERATE] Processing product: ${productName.substring(0, 50)}...`);

            // Call AI to regenerate description
            const result = await generateProductDescription(extractedData, undefined, customAttrs);

            if (result && result.html) {
              // Update product with new HTML
              await supabaseStorage.updateProduct(product.id, {
                htmlCode: result.html,
                name: result.produktTitel || product.name,
              }, req.user.id);
              console.log(`[REGENERATE] ✅ Updated product ${product.id}`);
            }
          } catch (err) {
            console.error(`[REGENERATE] ❌ Error processing product ${product.id}:`, err);
          }
        }
        console.log(`[REGENERATE] Finished regenerating ${productsToRegenerate.length} products`);
      })();

    } catch (error: any) {
      console.error('[REGENERATE] Error:', error);
      res.status(500).json({ error: error.message || 'Fehler bei der Neugenerierung' });
    }
  });

  app.post('/api/bulk-save-to-project', requireAuth, requireFeature('csvBulkImport'), checkApiLimit, async (req: any, res) => {
    try {
      const { projectName, products, sourceType, exportColumns } = req.body;

      if (!projectName || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ error: 'Projektname und Produkte sind erforderlich' });
      }

      console.log(`[BULK-SAVE] Saving ${products.length} products to project "${projectName}" (sourceType: ${sourceType || 'unspecified'})`);

      const project = await supabaseStorage.createProject(req.user.id, { 
        name: projectName,
        sourceType: sourceType || 'csv-bulk',
        exportColumns: exportColumns || undefined,
      });

      const savedProducts = [];
      for (const product of products) {
        // Use extractedData from request if provided, otherwise build from individual fields
        const extractedData = product.extractedData && Array.isArray(product.extractedData) 
          ? product.extractedData 
          : [
              // Basic product data
              product.ean ? { key: 'ean', value: product.ean, type: 'text' } : null,
              product.hersteller ? { key: 'hersteller', value: product.hersteller, type: 'text' } : null,
              product.manufacturer ? { key: 'manufacturer', value: product.manufacturer, type: 'text' } : null,
              
              // Prices
              product.preis ? { key: 'preis', value: product.preis, type: 'text' } : null,
              product.ekPrice ? { key: 'ekPrice', value: product.ekPrice, type: 'text' } : null,
              product.vkPrice ? { key: 'vkPrice', value: product.vkPrice, type: 'text' } : null,
              
              // Article numbers
              product.manufacturerArticleNumber ? { key: 'manufacturerArticleNumber', value: product.manufacturerArticleNumber, type: 'text' } : null,
              
              // Physical dimensions
              product.gewicht ? { key: 'gewicht', value: product.gewicht, type: 'text' } : null,
              product.laenge ? { key: 'laenge', value: product.laenge, type: 'text' } : null,
              product.breite ? { key: 'breite', value: product.breite, type: 'text' } : null,
              product.hoehe ? { key: 'hoehe', value: product.hoehe, type: 'text' } : null,
              
              // Technical specifications (ANSMANN batteries)
              product.nominalspannung ? { key: 'nominalspannung', value: product.nominalspannung, type: 'text' } : null,
              product.nominalkapazitaet ? { key: 'nominalkapazitaet', value: product.nominalkapazitaet, type: 'text' } : null,
              product.maxEntladestrom ? { key: 'maxEntladestrom', value: product.maxEntladestrom, type: 'text' } : null,
              product.energie ? { key: 'energie', value: product.energie, type: 'text' } : null,
              product.zellenchemie ? { key: 'zellenchemie', value: product.zellenchemie, type: 'text' } : null,
              product.farbe ? { key: 'farbe', value: product.farbe, type: 'text' } : null,
              
              // Category
              product.kategorie ? { key: 'kategorie', value: product.kategorie, type: 'text' } : null,
              product.source_url ? { key: 'source_url', value: product.source_url, type: 'text' } : null,
              
              // AI-generated content
              product.seo_titel ? { key: 'seo_titel', value: product.seo_titel, type: 'text' } : null,
              product.seo_beschreibung ? { key: 'seo_beschreibung', value: product.seo_beschreibung, type: 'text' } : null,
              product.kurzbeschreibung ? { key: 'kurzbeschreibung', value: product.kurzbeschreibung, type: 'text' } : null,
              
              // WICHTIG: Original-Bild-URLs speichern (für Brickfox CSV Export)
              product.images && Array.isArray(product.images) && product.images.length > 0
                ? { key: 'originalImageUrls', value: JSON.stringify(product.images), type: 'json' }
                : null,
            ].filter((item): item is { key: string; value: string; type: string } => item !== null);

        // Generate articleNumber with ANS prefix (same as URL scraper)
        let articleNumber = '';
        let manufacturerArticleNumber = product.artikelnummer || '';
        
        if (manufacturerArticleNumber) {
          // ANSMANN: ANS + manufacturer number WITHOUT hyphens (e.g., "ANS15200010")
          articleNumber = 'ANS' + manufacturerArticleNumber.replace(/-/g, '');
          console.log(`📦 [BULK-SAVE] Generated Article Number: ${articleNumber} (from ${manufacturerArticleNumber})`);
        }

        // Prepare files array from images
        const filesArray = product.images && Array.isArray(product.images) 
          ? product.images.map((url: string, idx: number) => ({
              url: url,
              fileName: `image_${idx + 1}.jpg`,
              type: 'image'
            }))
          : [];

        const productData = {
          projectId: project.id,
          name: product.produktname_neu || product.produktname || 'Unbekanntes Produkt',
          articleNumber: product.p_id || articleNumber,
          manufacturerArticleNumber: manufacturerArticleNumber,
          htmlCode: product.produktbeschreibung_html || product.produktbeschreibung || '',
          previewText: product.seo_beschreibung || product.kurzbeschreibung || '',
          exactProductName: product.produktname || product.mediamarktname_v1 || '',
          extractedData: extractedData,
          files: filesArray,
          customAttributes: [
            { key: 'produktname_nl', value: product.produktname_nl || '', type: 'text' },
            { key: 'produktbeschreibung_html_nl', value: product.produktbeschreibung_html_nl || '', type: 'text' },
            { key: 'v_id', value: product.v_id || '', type: 'text' },
            { key: 'p_item_number', value: product.p_item_number || '', type: 'text' },
            { key: 'produktbeschreibung_original', value: product.produktbeschreibung_original || '', type: 'text' },
            { key: 'mediamarktname_v1', value: product.mediamarktname_v1 || '', type: 'text' },
            { key: 'mediamarktname_v2', value: product.mediamarktname_v2 || '', type: 'text' },
            { key: 'seo_titel', value: product.seo_titel || '', type: 'text' },
            { key: 'seo_beschreibung', value: product.seo_beschreibung || '', type: 'text' },
            { key: 'seo_keywords', value: product.seo_keywords || '', type: 'text' },
            { key: 'kurzbeschreibung', value: product.kurzbeschreibung || '', type: 'text' },
          ].filter(attr => attr.value),
        };

        const savedProduct = await supabaseStorage.createProduct(project.id, productData, req.user.id);
        savedProducts.push(savedProduct);
      }

      await trackApiUsage(req, res, () => {});

      console.log(`[BULK-SAVE] Successfully saved ${savedProducts.length} products`);
      
      res.json({ 
        success: true, 
        project,
        productCount: savedProducts.length 
      });
    } catch (error: any) {
      console.error('[BULK-SAVE] Error:', error);
      res.status(500).json({ 
        error: error.message || 'Fehler beim Speichern der Produkte' 
      });
    }
  });

  // Template routes
  app.get('/api/templates', requireAuth, async (req: any, res) => {
    try {
      const templates = await supabaseStorage.getTemplates(req.user.id);
      res.json({ success: true, templates });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Fehler beim Laden der Vorlagen' });
    }
  });

  app.get('/api/templates/:id', requireAuth, async (req: any, res) => {
    try {
      const template = await supabaseStorage.getTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ success: false, error: 'Vorlage nicht gefunden' });
      }

      // SECURITY: Verify template belongs to user's tenant
      const user = await supabaseStorage.getUserById(req.user.id);
      if (!user || ((template as any).tenantId && (template as any).tenantId !== user.tenantId)) {
        return res.status(403).json({ success: false, error: 'Zugriff verweigert' });
      }

      res.json({ success: true, template });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Fehler beim Laden der Vorlage' });
    }
  });

  app.post('/api/templates', requireAuth, async (req: any, res) => {
    try {
      // SECURITY: Validate input
      if (!req.body.name || !req.body.content) {
        return res.status(400).json({ success: false, error: 'Name und Content sind erforderlich' });
      }
      
      const template = await supabaseStorage.createTemplate(req.user.id, req.body);
      res.json({ success: true, template });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Fehler beim Erstellen der Vorlage' });
    }
  });

  app.put('/api/templates/:id', requireAuth, async (req: any, res) => {
    try {
      // SECURITY: Verify template belongs to user's tenant before updating
      const existingTemplate = await supabaseStorage.getTemplate(req.params.id);
      if (!existingTemplate) {
        return res.status(404).json({ success: false, error: 'Vorlage nicht gefunden' });
      }

      const user = await supabaseStorage.getUserById(req.user.id);
      if (!user || ((existingTemplate as any).tenantId && (existingTemplate as any).tenantId !== user.tenantId)) {
        return res.status(403).json({ success: false, error: 'Zugriff verweigert' });
      }

      const template = await supabaseStorage.updateTemplate(req.params.id, req.body);
      res.json({ success: true, template });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Fehler beim Aktualisieren der Vorlage' });
    }
  });

  app.delete('/api/templates/:id', requireAuth, async (req: any, res) => {
    try {
      // SECURITY: Verify template belongs to user's tenant before deleting
      const existingTemplate = await supabaseStorage.getTemplate(req.params.id);
      if (!existingTemplate) {
        return res.status(404).json({ success: false, error: 'Vorlage nicht gefunden' });
      }

      const user = await supabaseStorage.getUserById(req.user.id);
      if (!user || ((existingTemplate as any).tenantId && (existingTemplate as any).tenantId !== user.tenantId)) {
        return res.status(403).json({ success: false, error: 'Zugriff verweigert' });
      }

      const success = await supabaseStorage.deleteTemplate(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Fehler beim Löschen der Vorlage' });
    }
  });

  app.get('/api/suppliers', requireAuth, async (req: any, res) => {
    try {
      const suppliers = await supabaseStorage.getSuppliers(req.user.id);
      res.json({ success: true, suppliers });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Fehler beim Laden der Lieferanten' });
    }
  });

  app.get('/api/suppliers/:id', requireAuth, async (req: any, res) => {
    try {
      // Use getSupplierWithCredentials to include decrypted password for editing
      const supplier = await supabaseStorage.getSupplierWithCredentials(req.params.id);
      if (!supplier) {
        return res.status(404).json({ success: false, error: 'Lieferant nicht gefunden' });
      }
      
      console.log('[GET /api/suppliers/:id] Returning supplier with decrypted data:', {
        name: supplier.name,
        has_loginUsername: !!(supplier as any).loginUsername,
        has_loginPassword: !!(supplier as any).loginPassword,
        loginPassword_length: (supplier as any).loginPassword?.length || 0,
        has_useBrowser: !!(supplier as any).useBrowser
      });
      
      res.json({ success: true, supplier });
    } catch (error) {
      console.error('[GET /api/suppliers/:id] Error:', error);
      res.status(500).json({ success: false, error: 'Fehler beim Laden des Lieferanten' });
    }
  });

  // Get Brickfox-optimized selector template
  app.get('/api/selectors/brickfox', requireAuth, (req: any, res) => {
    res.json({ success: true, selectors: brickfoxSelectors });
  });

  app.post('/api/suppliers', requireAuth, async (req: any, res) => {
    try {
      const supplier = await supabaseStorage.createSupplier(req.user.id, req.body);
      res.json({ success: true, supplier });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Fehler beim Erstellen des Lieferanten' });
    }
  });

  app.put('/api/suppliers/:id', requireAuth, async (req: any, res) => {
    try {
      console.log('[PUT /api/suppliers/:id] Received update data:', {
        id: req.params.id,
        has_loginUsername: !!req.body.loginUsername,
        has_loginPassword: !!req.body.loginPassword,
        loginPassword_length: req.body.loginPassword?.length || 0,
        has_useBrowser: req.body.useBrowser !== undefined,
        useBrowser_value: req.body.useBrowser
      });
      
      const supplier = await supabaseStorage.updateSupplier(req.params.id, req.body);
      
      console.log('[PUT /api/suppliers/:id] Update completed, returned supplier has:', {
        has_loginUsername: !!(supplier as any).loginUsername,
        has_loginPassword: !!(supplier as any).loginPassword
      });
      
      res.json({ success: true, supplier });
    } catch (error: any) {
      console.error('[PUT /api/suppliers/:id] Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Fehler beim Aktualisieren des Lieferanten' });
    }
  });

  app.delete('/api/suppliers/:id', requireAuth, async (req: any, res) => {
    try {
      await supabaseStorage.deleteSupplier(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Fehler beim Löschen des Lieferanten' });
    }
  });

  app.post('/api/scrape', requireAuth, requireFeature('urlScraper'), checkApiLimit, upload.none(), async (req, res) => {
    try {
      const { url, selectors } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL ist erforderlich' });
      }

      const parsedSelectors: ScraperSelectors = selectors ? JSON.parse(selectors) : defaultSelectors.generic;
      const result = await scrapeProduct({ url, selectors: parsedSelectors });
      
      // AI-Farbanalyse: Wenn Bilder vorhanden sind, analysiere das erste Bild
      if (result.images && result.images.length > 0) {
        const firstImageUrl = result.images[0];
        console.log('[Scraper] Starte AI-Farbanalyse für Produktbild...');
        
        try {
          const { analyzeProductImageColor } = await import('./ai-service');
          const aiDetectedColor = await analyzeProductImageColor(firstImageUrl);
          
          if (aiDetectedColor) {
            console.log(`[Scraper] AI erkannte Farbe: ${aiDetectedColor} (Original: ${(result as any).farbe || 'keine'})`);
            (result as any).farbe = aiDetectedColor;
            (result as any).colorDetectedByAI = true; // Flag für Frontend-Anzeige
          }
        } catch (error) {
          console.error('[Scraper] Fehler bei AI-Farbanalyse:', error);
          // Continue ohne Farbanalyse bei Fehler
        }
      }
      
      await trackApiUsage(req, res, () => {});
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Single product scraping is also FREE
  app.post('/api/scrape-product', requireAuth, requireFeature('urlScraper'), async (req, res) => {
    try {
      const { url, selectors, userAgent, cookies, supplierId } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL ist erforderlich' });
      }

      // Get login config and useBrowser flag if supplier has credentials
      let loginConfig: any = undefined;
      let useBrowser = false;
      const effectiveCookies = await getScrapingCookies(supplierId, cookies);
      
      if (supplierId && supplierId !== '__none__') {
        const supplier = await supabaseStorage.getSupplierWithCredentials(supplierId);
        console.log('[DEBUG] Supplier data:', {
          name: supplier?.name,
          useBrowser: (supplier as any)?.useBrowser,
          has_loginUsername: !!(supplier as any)?.loginUsername,
          has_loginPassword: !!(supplier as any)?.loginPassword
        });
        
        useBrowser = (supplier as any)?.useBrowser || false;
        
        // getSupplierWithCredentials() returns camelCase property names
        if (supplier && (supplier as any).loginUsername && (supplier as any).loginPassword) {
          loginConfig = {
            loginUrl: (supplier as any).loginUrl || `https://${new URL(url).hostname}/login`,
            usernameField: (supplier as any).loginUsernameField || 'email',
            passwordField: (supplier as any).loginPasswordField || 'password',
            username: (supplier as any).loginUsername,
            password: (supplier as any).loginPassword,
            sessionCookies: (supplier as any).sessionCookies || null
          };
          console.log('[LOGIN CONFIG] Created browser login config for supplier:', supplier.name, 'useBrowser:', useBrowser, 'hasCookies:', !!(supplier as any).sessionCookies);
        }
      }

      // Add 60-second timeout for scrapeProduct
      let product: any;
      try {
        // Use supplier-specific selectors if no custom selectors provided
        let effectiveSelectors = selectors;
        if (!effectiveSelectors && supplierId && supplierId !== '__none__') {
          const supplier = await supabaseStorage.getSupplierWithCredentials(supplierId);
          if (supplier) {
            effectiveSelectors = getSelectorsForSupplier(supplier.name, (supplier as any).selectors);
          }
        }
        
        product = await Promise.race([
          scrapeProduct({ 
            url, 
            selectors: effectiveSelectors || defaultSelectors.generic,
            userAgent,
            cookies: effectiveCookies
          }, loginConfig, useBrowser),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Scraping timeout nach 60 Sekunden')), 60000)
          )
        ]);
      } catch (timeoutErr: any) {
        console.error('[Timeout] scrapeProduct timed out:', timeoutErr.message);
        return res.status(408).json({ error: timeoutErr.message });
      }
      
      (product as any).localImagePaths = [];
      
      // DEBUG: Log all product fields to see what's being returned
      console.log('📦 [BACKEND] Product fields being returned:', Object.keys(product));
      console.log('📦 [BACKEND] Nitecore fields:', {
        length: product.length,
        bodyDiameter: product.bodyDiameter,
        led1: product.led1,
        led2: product.led2,
        maxLuminosity: product.maxLuminosity,
        spotIntensity: product.spotIntensity
      });
      
      res.json({ product });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/test-scrape-product', requireAuth, async (req, res) => {
    try {
      const { url, selectors, userAgent, cookies, supplierId } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL ist erforderlich' });
      }

      // Get cookies from login if supplier has credentials configured
      const effectiveCookies = await getScrapingCookies(supplierId, cookies);

      // Get login config and useBrowser flag if supplier has credentials
      let loginConfig: any = undefined;
      let useBrowser = false;
      
      if (supplierId && supplierId !== '__none__') {
        const supplier = await supabaseStorage.getSupplierWithCredentials(supplierId);
        useBrowser = (supplier as any)?.useBrowser || false;
        
        // getSupplierWithCredentials() returns camelCase property names
        if (supplier && (supplier as any).loginUsername && (supplier as any).loginPassword) {
          loginConfig = {
            loginUrl: (supplier as any).loginUrl || `https://${new URL(url).hostname}/login`,
            usernameField: (supplier as any).loginUsernameField || 'email',
            passwordField: (supplier as any).loginPasswordField || 'password',
            username: (supplier as any).loginUsername,
            password: (supplier as any).loginPassword
          };
        }
      }

      const product = await scrapeProduct({ 
        url, 
        selectors: selectors || defaultSelectors.generic,
        userAgent,
        cookies: effectiveCookies
      }, loginConfig, useBrowser);
      
      res.json({ product });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Test a single CSS selector (for supplier configuration verification)
  app.post('/api/scraper/test-selector', requireAuth, requireFeature('urlScraper'), async (req, res) => {
    try {
      const { url, selector, userAgent, cookies, supplierId } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL ist erforderlich' });
      }

      if (!selector) {
        return res.status(400).json({ error: 'CSS-Selektor ist erforderlich' });
      }

      // Get cookies from login if supplier has credentials configured
      const effectiveCookies = await getScrapingCookies(supplierId, cookies);

      const result = await testSelector({ 
        url, 
        selector,
        userAgent,
        cookies: effectiveCookies
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Scraping is FREE - no API limit check
  app.post('/api/scrape-product-list', requireAuth, requireFeature('urlScraper'), async (req, res) => {
    try {
      const { listUrl, productLinkSelector, maxProducts, selectors, userAgent, cookies, supplierId } = req.body;
      
      if (!listUrl) {
        return res.status(400).json({ error: 'Listen-URL ist erforderlich' });
      }

      // Get login config if supplier has credentials
      let loginConfig: any = undefined;
      const effectiveCookies = await getScrapingCookies(supplierId, cookies);
      
      // For browser-based scraping, prepare login config
      if (supplierId && supplierId !== '__none__') {
        const supplier = await supabaseStorage.getSupplierWithCredentials(supplierId);
        if (supplier && (supplier as any).loginEmail && (supplier as any).loginPassword) {
          loginConfig = {
            loginUrl: `https://${new URL(listUrl).hostname}/login`,
            usernameField: (supplier as any).emailField || 'email',
            passwordField: (supplier as any).passwordField || 'password',
            username: (supplier as any).loginEmail,
            password: (supplier as any).loginPassword
          };
        }
      }

      // Use supplier-specific selectors if no custom selectors provided
      let effectiveSelectors = selectors;
      if (!effectiveSelectors && supplierId && supplierId !== '__none__') {
        const supplier = await supabaseStorage.getSupplierWithCredentials(supplierId);
        if (supplier) {
          effectiveSelectors = getSelectorsForSupplier(supplier.name, (supplier as any).selectors);
        }
      }
      
      const result = await scrapeProductList(
        listUrl,
        productLinkSelector || 'a.product-link',
        maxProducts || 50,
        { selectors: effectiveSelectors || defaultSelectors.generic, userAgent, cookies: effectiveCookies },
        false,  // useBrowser
        loginConfig
      );
      
      // No usage tracking for scraping (it's free)
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Scraping is FREE - no API limit check (only AI generation costs credits)
  app.post('/api/scrape-all-pages', requireAuth, requireFeature('urlScraper'), async (req, res) => {
    try {
      const { url, listUrl, productLinkSelector, paginationSelector, maxPages, maxProducts, selectors, userAgent, cookies, supplierId } = req.body;
      
      // Support both 'url' and 'listUrl' for backwards compatibility
      const targetUrl = url || listUrl;
      
      if (!targetUrl) {
        return res.status(400).json({ error: 'URL ist erforderlich' });
      }

      // Get saved selectors from supplier if supplier is selected
      let effectiveProductLinkSelector = productLinkSelector;
      let effectivePaginationSelector = paginationSelector;
      let loginConfig: any = undefined;
      
      if (supplierId && supplierId !== '__none__') {
        const supplier = await supabaseStorage.getSupplierWithCredentials(supplierId);
        
        if (supplier) {
          // Use saved selectors if no manual selector provided
          // Note: getSupplierWithCredentials returns camelCase fields
          if (!productLinkSelector || productLinkSelector.trim() === '') {
            effectiveProductLinkSelector = (supplier as any).productLinkSelector || null;
            console.log(`[Supplier] Using saved product link selector: ${effectiveProductLinkSelector}`);
          }
          if (!paginationSelector || paginationSelector.trim() === '') {
            effectivePaginationSelector = (supplier as any).paginationSelector || null;
            console.log(`[Supplier] Using saved pagination selector: ${effectivePaginationSelector}`);
          }
          
          // Prepare login config for browser-based scraping
          if ((supplier as any).login_username && (supplier as any).login_password) {
            loginConfig = {
              loginUrl: `https://${new URL(targetUrl).hostname}/login`,
              usernameField: (supplier as any).login_username_field || 'email',
              passwordField: (supplier as any).login_password_field || 'password',
              username: (supplier as any).login_username,
              password: (supplier as any).login_password
            };
            
            // Check if we have stored cookies (and if they're still fresh - within 24 hours)
            if ((supplier as any).sessionCookies && (supplier as any).sessionCookiesUpdatedAt) {
              const cookieAge = Date.now() - new Date((supplier as any).sessionCookiesUpdatedAt).getTime();
              const COOKIE_TTL = 24 * 60 * 60 * 1000; // 24 hours
              
              if (cookieAge < COOKIE_TTL) {
                console.log('[COOKIE REUSE] Stored cookies are still fresh, using them instead of login');
                (loginConfig as any)._storedCookies = (supplier as any).sessionCookies;
              } else {
                console.log('[COOKIE EXPIRED] Stored cookies are too old, performing fresh login');
              }
            }
            
            console.log('[LOGIN CONFIG] Created browser login config for multi-page scraping:', loginConfig.loginUrl);
          }
        }
      }

      // Get cookies from login if supplier has credentials configured
      const effectiveCookies = await getScrapingCookies(supplierId, cookies);

      // Set headers for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      console.log(`Starting multi-page scraping from: ${targetUrl}`);
      console.log(`Max pages: ${maxPages || 10}, Max products: ${maxProducts || 500}`);

      // Import scrapeAllPages function
      const { scrapeAllPages } = await import('./scraper-service.js');

      // Progress callback to send updates
      const progressCallback = (currentPage: number, totalProducts: number) => {
        res.write(`data: ${JSON.stringify({ 
          type: 'progress',
          currentPage, 
          totalProducts,
          message: `📄 Seite ${currentPage} gescraped - ${totalProducts} Produkte gefunden`
        })}\n\n`);
      };

      const productUrls = await scrapeAllPages(
        targetUrl,
        effectiveProductLinkSelector || null,
        effectivePaginationSelector || null,
        maxPages || 10,
        maxProducts || 500,
        {
          userAgent,
          cookies: effectiveCookies,
          timeout: 15000
        },
        progressCallback,
        loginConfig  // ✅ CRITICAL: Pass login config for browser authentication!
      );
      
      // Save extracted cookies if login was performed
      if (loginConfig && (loginConfig as any)._extractedCookies && supplierId && supplierId !== '__none__') {
        const extractedCookies = (loginConfig as any)._extractedCookies;
        const cookiesJson = JSON.stringify(extractedCookies);
        
        console.log('[COOKIE STORAGE] Saving', extractedCookies.length, 'cookies to supplier profile');
        
        try {
          await supabaseStorage.updateSupplier(supplierId, {
            sessionCookies: cookiesJson,
            sessionCookiesUpdatedAt: new Date().toISOString()
          });
          console.log('[COOKIE STORAGE] ✓ Cookies saved successfully');
        } catch (error) {
          console.error('[COOKIE STORAGE] ❌ Failed to save cookies:', error);
        }
      }
      
      // No usage tracking for scraping (it's free)
      
      // Send final result
      res.write(`data: ${JSON.stringify({ 
        type: 'complete',
        success: true,
        productUrls,
        count: productUrls.length,
        message: `✓ Fertig! ${productUrls.length} Produkte von mehreren Seiten gescraped`
      })}\n\n`);
      res.end();
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
  });

  // Multi-Category Batch Scraping (Loop through multiple categories)
  app.post('/api/scrape-categories', requireAuth, requireFeature('urlScraper'), async (req, res) => {
    try {
      const { supplierId, categoryUrls, maxPages, maxProductsPerCategory } = req.body;
      
      if (!supplierId || supplierId === '__none__') {
        return res.status(400).json({ error: 'Lieferant ist erforderlich' });
      }

      if (!categoryUrls || !Array.isArray(categoryUrls) || categoryUrls.length === 0) {
        return res.status(400).json({ error: 'Mindestens eine Kategorie-URL ist erforderlich' });
      }

      // Get supplier configuration
      const supplier = await supabaseStorage.getSupplierWithCredentials(supplierId);
      if (!supplier) {
        return res.status(404).json({ error: 'Lieferant nicht gefunden' });
      }

      // Prepare login config for browser-based scraping
      let loginConfig: any = undefined;
      if ((supplier as any).login_username && (supplier as any).login_password) {
        const firstUrl = categoryUrls[0];
        loginConfig = {
          loginUrl: `https://${new URL(firstUrl).hostname}/login`,
          usernameField: (supplier as any).login_username_field || 'email',
          passwordField: (supplier as any).login_password_field || 'password',
          username: (supplier as any).login_username,
          password: (supplier as any).login_password
        };
        
        // Check if we have stored cookies (and if they're still fresh - within 24 hours)
        if ((supplier as any).sessionCookies && (supplier as any).sessionCookiesUpdatedAt) {
          const cookieAge = Date.now() - new Date((supplier as any).sessionCookiesUpdatedAt).getTime();
          const COOKIE_TTL = 24 * 60 * 60 * 1000; // 24 hours
          
          if (cookieAge < COOKIE_TTL) {
            console.log('[COOKIE REUSE] Stored cookies are still fresh, using them for category scraping');
            (loginConfig as any)._storedCookies = (supplier as any).sessionCookies;
          } else {
            console.log('[COOKIE EXPIRED] Stored cookies are too old, performing fresh login');
          }
        }
        
        console.log('[LOGIN CONFIG] Created browser login config for category scraping:', loginConfig.loginUrl);
      }

      // Get saved selectors
      const effectiveProductLinkSelector = (supplier as any).productLinkSelector || null;
      const effectivePaginationSelector = (supplier as any).paginationSelector || null;

      // Get cookies from login
      const effectiveCookies = await getScrapingCookies(supplierId, undefined);

      // Set headers for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const { scrapeAllPages } = await import('./scraper-service.js');
      const allProductUrls: string[] = [];
      let totalCategories = categoryUrls.length;
      let completedCategories = 0;

      // Loop through each category
      for (const categoryUrl of categoryUrls) {
        completedCategories++;
        
        res.write(`data: ${JSON.stringify({ 
          type: 'category_start',
          categoryUrl,
          categoryNumber: completedCategories,
          totalCategories,
          message: `📂 Kategorie ${completedCategories}/${totalCategories}: ${categoryUrl}`
        })}\n\n`);

        try {
          // Progress callback for this category
          const progressCallback = (currentPage: number, totalProducts: number) => {
            res.write(`data: ${JSON.stringify({ 
              type: 'progress',
              categoryNumber: completedCategories,
              currentPage, 
              totalProducts,
              message: `  📄 Seite ${currentPage} - ${totalProducts} Produkte gefunden`
            })}\n\n`);
          };

          const categoryProducts = await scrapeAllPages(
            categoryUrl,
            effectiveProductLinkSelector || null,
            effectivePaginationSelector || null,
            maxPages || 10,
            maxProductsPerCategory || 500,
            {
              userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              cookies: effectiveCookies,
              timeout: 15000
            },
            progressCallback,
            loginConfig  // ✅ Pass login config for browser authentication
          );

          allProductUrls.push(...categoryProducts);

          res.write(`data: ${JSON.stringify({ 
            type: 'category_complete',
            categoryUrl,
            categoryNumber: completedCategories,
            productsFound: categoryProducts.length,
            totalProducts: allProductUrls.length,
            message: `  ✓ Kategorie ${completedCategories} fertig: ${categoryProducts.length} Produkte`
          })}\n\n`);

        } catch (error: any) {
          res.write(`data: ${JSON.stringify({ 
            type: 'category_error',
            categoryUrl,
            categoryNumber: completedCategories,
            error: error.message,
            message: `  ❌ Fehler in Kategorie ${completedCategories}: ${error.message}`
          })}\n\n`);
        }
      }

      // Phase 2: Scrape individual product details
      res.write(`data: ${JSON.stringify({ 
        type: 'detail_scraping_start',
        totalProducts: allProductUrls.length,
        message: `🔍 Starte Detail-Scraping für ${allProductUrls.length} Produkte...`
      })}\n\n`);

      const { scrapeProduct } = await import('./scraper-service.js');
      const scrapedProducts: any[] = [];
      const selectors = (supplier as any).selectors || {};
      const useBrowser = (supplier as any).use_browser || false;

      for (let i = 0; i < allProductUrls.length; i++) {
        const productUrl = allProductUrls[i];
        
        try {
          res.write(`data: ${JSON.stringify({ 
            type: 'detail_progress',
            current: i + 1,
            total: allProductUrls.length,
            url: productUrl,
            message: `  📦 ${i + 1}/${allProductUrls.length}: ${productUrl}`
          })}\n\n`);

          const productDetails = await scrapeProduct({
            url: productUrl,
            selectors,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            cookies: effectiveCookies,
            timeout: 15000
          }, loginConfig, useBrowser);

          scrapedProducts.push(productDetails);

        } catch (error: any) {
          console.error(`[DETAIL SCRAPING] Failed for ${productUrl}:`, error.message);
          res.write(`data: ${JSON.stringify({ 
            type: 'detail_error',
            url: productUrl,
            error: error.message,
            message: `  ❌ Fehler beim Scrapen: ${error.message}`
          })}\n\n`);
        }
      }

      // Save scraped products to session
      const userId = (req as any).userId;
      const tenantId = (req as any).tenantId;
      
      if (scrapedProducts.length > 0 && userId) {
        try {
          // Update scrape session with products
          const [existingSession] = await heliumDb
            .select()
            .from(scrapeSessionTable)
            .where(eq(scrapeSessionTable.userId, userId));

          if (existingSession) {
            await heliumDb
              .update(scrapeSessionTable)
              .set({
                scrapedProducts: {
                  urlScraper: scrapedProducts,
                  pdfScraper: (existingSession.scrapedProducts as any)?.pdfScraper || null,
                },
                updatedAt: new Date(),
              })
              .where(eq(scrapeSessionTable.id, existingSession.id));
          } else {
            await heliumDb
              .insert(scrapeSessionTable)
              .values({
                userId,
                tenantId: tenantId || null,
                scrapedProducts: {
                  urlScraper: scrapedProducts,
                  pdfScraper: null,
                },
              });
          }
          
          console.log(`[SESSION] Saved ${scrapedProducts.length} products to scrape session`);
        } catch (error) {
          console.error('[SESSION] Failed to save products:', error);
        }
      }

      // Send final result
      res.write(`data: ${JSON.stringify({ 
        type: 'complete',
        success: true,
        productUrls: allProductUrls,
        scrapedProducts,
        count: allProductUrls.length,
        scrapedCount: scrapedProducts.length,
        categoriesScraped: completedCategories,
        message: `✅ Fertig! ${scrapedProducts.length} Produkte komplett gescraped`
      })}\n\n`);
      res.end();
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
  });

  // Get available categories for a supplier
  app.get('/api/supplier-categories/:supplierId', requireAuth, async (req, res) => {
    try {
      const { supplierId } = req.params;
      const { getSupplierCategories } = await import('./supplier-categories.js');
      
      const config = getSupplierCategories(supplierId);
      
      if (!config) {
        return res.json({ 
          success: true, 
          categories: [], 
          message: 'Keine vorkonfigurierten Kategorien für diesen Lieferanten' 
        });
      }

      res.json({ 
        success: true, 
        config 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/generate', requireAuth, requireFeature('aiDescriptions'), checkApiLimit, async (req, res) => {
    try {
      const { productData, template } = req.body;
      
      if (!productData) {
        return res.status(400).json({ error: 'Produktdaten fehlen' });
      }

      const { html: description } = await generateProductDescription(productData);
      const htmlCode = convertTextToHTML(description);
      
      await trackApiUsage(req, res, () => {});
      res.json({ description, htmlCode });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/generate-description', async (req, res) => {
    try {
      const { extractedData, structuredData, customAttributes, autoExtractedDescription, technicalDataTable, safetyWarnings, pdfManualUrl, model } = req.body;

      if (!extractedData || !Array.isArray(extractedData)) {
        return res.status(400).json({ error: 'Invalid extracted data' });
      }

      // SMART AUTO-EXTRACTION: Combine manual extracted data with auto-extracted data
      const enhancedData = [...extractedData];
      
      if (autoExtractedDescription) {
        enhancedData.push(`Produktbeschreibung:\n${autoExtractedDescription}`);
      }
      
      if (technicalDataTable) {
        enhancedData.push(`Technische Daten (HTML-Tabelle):\n${technicalDataTable}`);
      }

      if (safetyWarnings) {
        enhancedData.push(`Sicherheitshinweise:\n${safetyWarnings}`);
      }

      if (pdfManualUrl) {
        enhancedData.push(`Bedienungsanleitung verfügbar: ${pdfManualUrl}`);
      }

      // COST OPTIMIZATION: Use GPT-4o-mini (30× cheaper) by default
      const aiModel = model || 'gpt-4o-mini';
      let { html: description, categoryId: detectedCategory, enrichedProductData, produktTitel } = await generateProductDescription(
        enhancedData, 
        undefined, 
        {
          ...customAttributes,
          structuredData, // WICHTIG: Strukturierte Daten übertragen (length, bodyDiameter, led1, etc.)
          technicalDataTable, // Pass the original HTML table
          safetyWarnings, // Pass safety warnings for 1:1 rendering
          pdfManualUrl // Pass PDF URL for reference
        }, 
        aiModel
      );

      // Automatische Korrektur: Wiederholungen im Produktnamen entfernen
      // z.B. "Vibrationsmotor für iPhone 4 – passend für iPhone 4" → "Vibrationsmotor für iPhone 4"
      if (produktTitel) {
        const fuerMatch = produktTitel.match(/für\s+([^–]+?)(?:\s*–|$)/i);
        if (fuerMatch) {
          const devicePart = fuerMatch[1].trim();
          produktTitel = produktTitel.replace(new RegExp(`\\s*–\\s*(passend\\s+)?für\\s+${devicePart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '');
        }
      }

      // Extract SEO fields from product data
      const firstData = extractedData[0] || {};
      const productName = customAttributes?.exactProductName || firstData.productName || firstData.product_name || '';
      const manufacturer = firstData.manufacturer || firstData.Hersteller || '';
      const category = detectedCategory; // Use AI-detected category instead of scraped category
      const articleNumber = firstData.articleNumber || firstData.artikel_nr || '';
      
      console.log(`[SEO] Using detected category "${detectedCategory}" for SEO generation`);
      
      // Collect technical specs for SEO context
      const technicalSpecs: string[] = [];
      if (firstData.nominalspannung) technicalSpecs.push(`${firstData.nominalspannung}V`);
      if (firstData.nominalkapazitaet) technicalSpecs.push(`${firstData.nominalkapazitaet}mAh`);
      if (firstData.gewicht) technicalSpecs.push(firstData.gewicht);
      
      // Generate AI-powered SEO metadata
      const { generateSEOMetadata, generateSEOKeywords } = await import('./ai-service.js');
      const seoMetadata = await generateSEOMetadata({
        productName,
        manufacturer,
        category,
        articleNumber,
        description: autoExtractedDescription || description.replace(/<[^>]*>/g, '').substring(0, 300),
        technicalSpecs,
        nominalkapazitaet: enrichedProductData.nominalkapazitaet || firstData.nominalkapazitaet || structuredData?.nominalkapazitaet,
        zellenchemie: enrichedProductData.zellenchemie || firstData.zellenchemie || structuredData?.zellenchemie
      }, aiModel);
      
      const { seoTitle, seoDescription } = seoMetadata;
      
      // Generate AI-powered SEO Keywords (structured)
      const descriptionText = autoExtractedDescription || description.replace(/<[^>]*>/g, '').substring(0, 500);
      const seoKeywordsStructured = await generateSEOKeywords(
        productName,
        descriptionText,
        12, // max 12 keywords per category
        aiModel
      );
      
      // Combine all keywords into a comma-separated string for backward compatibility
      const allKeywords = [
        ...seoKeywordsStructured.hauptkeywords,
        ...seoKeywordsStructured.longtail_keywords,
        ...seoKeywordsStructured.brand_keywords,
        ...seoKeywordsStructured.intent_keywords
      ].slice(0, 20); // Limit to top 20 keywords
      const seoKeywords = allKeywords.join(', ');

      // DeepL-Übersetzung deaktiviert - wird nur on-demand über /api/translate-product aufgerufen
      // Spart Kosten: ~150.000 Produkte × 2 Übersetzungen = erhebliche DeepL-Kosten
      const descriptionNL = '';
      const produktTitelNL = '';

      await trackApiUsage(req, res, () => {});
      res.json({ 
        success: true, 
        description,
        descriptionNL, // Leer - wird on-demand übersetzt
        produktTitel, // AI-generierter SEO-optimierter Produktname
        produktTitelNL, // Leer - wird on-demand übersetzt
        seoTitle,
        seoDescription,
        seoKeywords,
        seoKeywordsStructured // Return structured keywords for advanced use
      });
    } catch (error) {
      console.error('Description generation error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Description generation failed' 
      });
    }
  });

  // Passe bestehende Beschreibungen nach individuellem Prompt an
  app.post('/api/adjust-description', async (req, res) => {
    try {
      const { produktname, existingDescription, adjustmentPrompt, produktnameNeu } = req.body;

      if (!existingDescription) {
        return res.status(400).json({ error: 'Bestehende Beschreibung fehlt' });
      }

      if (!adjustmentPrompt) {
        return res.status(400).json({ error: 'Anpassungs-Prompt fehlt' });
      }

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY 
      });
      
      const systemPrompt = `Du bist ein Experte für E-Commerce Produktbeschreibungen. 
Deine Aufgabe ist es, bestehende Produktbeschreibungen nach den Vorgaben des Benutzers anzupassen.

WICHTIGE REGELN:
- Behalte die HTML-Struktur bei (Tags wie <h1>, <h2>, <p>, <ul>, <li>, etc.)
- EMCOM darf NIEMALS im Text erscheinen - entferne jede Erwähnung
- Technische Daten (mAh, Volt, Modellnummern) gehören NUR in Tabellen, NICHT in Fließtext
- Der Produktname darf nicht im Fließtext wiederholt werden
- Behalte ✅ Checkmarks für Vorteile bei

KOMPATIBILITÄT FORMATIERUNG:
- "Kompatibilität" ist eine eigene Überschrift: <h2>Kompatibilität</h2>
- Produkttyp nur EINMAL erwähnen, danach Modellnummern KOMMAGETRENNT
- Pro Produkttyp eine NEUE ZEILE mit <br />
- KEIN Bold für Produkttypen
- Beispiel-Format:
  <h2>Kompatibilität</h2>
  <p>Makita Akku-Bohrschrauber 6002D, 6002DW, 6002DWK, 6010D, 6010DL<br />
  Akku-Grasschere UM 1000D, UM 1200DW<br />
  Akku-Heckenschere UH 1070DW, UH 3000D, UH 3000DW</p>

Passe die Beschreibung EXAKT nach dem Benutzer-Prompt an.`;

      const userPrompt = `Produktname: ${produktnameNeu || produktname}

BESTEHENDE BESCHREIBUNG:
${existingDescription}

ANPASSUNGS-ANWEISUNG:
${adjustmentPrompt}

Gib NUR die angepasste HTML-Beschreibung zurück, ohne Erklärungen.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      let adjustedDescription = response.choices[0]?.message?.content || existingDescription;
      
      // EMCOM-Filter anwenden
      adjustedDescription = adjustedDescription.replace(/\b(EMCOM[-–,:]?\s*|van\s+EMCOM\s*|EMCOM\s+)/gi, '');

      await trackApiUsage(req, res, () => {});
      res.json({ 
        success: true, 
        description: adjustedDescription,
        produktTitel: produktnameNeu || produktname
      });
    } catch (error) {
      console.error('Description adjustment error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Description adjustment failed' 
      });
    }
  });

  // Regeneriere nur den Produktnamen (für ausgewählte Produkte)
  app.post('/api/regenerate-product-name', async (req, res) => {
    try {
      const { produktname, csvData } = req.body;

      if (!produktname) {
        return res.status(400).json({ error: 'Produktname fehlt' });
      }

      // Extrahiere relevante Daten für den Produktnamen
      const manufacturer = csvData?.['p_manufacturer'] || csvData?.['Hersteller'] || '';
      const volt = csvData?.['V_Nominal'] || csvData?.['v_nominal'] || csvData?.['Spannung'] || '';
      const mah = csvData?.['Nominalkapazitaet'] || csvData?.['nominalkapazitaet'] || csvData?.['mAh'] || '';

      // Einfache Logik: Originalname übernehmen, bei Akkus Volt/mAh ergänzen
      let produktTitel = produktname;

      // Prüfe ob es ein Akku ist
      const isAkku = /akku|batterie|battery/i.test(produktname);

      if (isAkku && volt && mah) {
        // Entferne bestehende Volt/mAh falls vorhanden
        produktTitel = produktTitel.replace(/\s*–\s*[\d,.]+ ?V(olt)?,?\s*[\d,.]+ ?mAh/i, '');
        produktTitel = produktTitel.replace(/\s*–\s*[\d,.]+ ?mAh,?\s*[\d,.]+ ?V(olt)?/i, '');
        
        // Formatiere mAh (Ah zu mAh konvertieren)
        let mahValue = mah;
        if (/Ah$/i.test(mah) && !/mAh$/i.test(mah)) {
          const numericValue = parseFloat(mah.replace(/[^\d,.]/g, '').replace(',', '.'));
          mahValue = `${Math.round(numericValue * 1000)} mAh`;
        } else if (!/mAh$/i.test(mah)) {
          mahValue = `${mah} mAh`;
        }

        // Formatiere Volt
        let voltValue = volt;
        if (!/V(olt)?$/i.test(volt)) {
          voltValue = `${volt} Volt`;
        }

        produktTitel = `${produktTitel.trim()} – ${voltValue}, ${mahValue}`;
      }

      // EMCOM entfernen
      produktTitel = produktTitel.replace(/^EMCOM[-–]?\s*/gi, '');
      produktTitel = produktTitel.replace(/\bEMCOM\b/gi, '').trim();

      // Wiederholungen entfernen (z.B. "für iPhone 4 – passend für iPhone 4")
      // Entferne "– passend für X" wenn "für X" bereits im Titel steht
      const fuerMatch = produktTitel.match(/für\s+([^–]+?)(?:\s*–|$)/i);
      if (fuerMatch) {
        const devicePart = fuerMatch[1].trim();
        // Entferne redundante Suffixe wie "– passend für iPhone 4" oder "– für iPhone 4"
        produktTitel = produktTitel.replace(new RegExp(`\\s*–\\s*(passend\\s+)?für\\s+${devicePart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '');
      }

      // NL-Übersetzung
      let produktTitelNL = '';
      if (process.env.DEEPL_API_KEY) {
        try {
          const translatedTitle = await deeplService.translateToNL(produktTitel);
          produktTitelNL = translatedTitle;
          console.log(`🇳🇱 NL-Titel regeneriert: "${produktTitelNL}"`);
        } catch (error) {
          console.error('❌ DeepL Übersetzungsfehler:', error);
        }
      }

      res.json({
        success: true,
        produktTitel,
        produktTitelNL
      });
    } catch (error) {
      console.error('Regenerate product name error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Regenerierung fehlgeschlagen'
      });
    }
  });

  // On-demand NL-Übersetzung (spart DeepL-Kosten)
  app.post('/api/translate-product', async (req, res) => {
    try {
      const { produktTitel, produktBeschreibung } = req.body;

      if (!produktTitel && !produktBeschreibung) {
        return res.status(400).json({ error: 'Keine Daten zum Übersetzen' });
      }

      if (!process.env.DEEPL_API_KEY) {
        return res.status(400).json({ error: 'DeepL API Key nicht konfiguriert' });
      }

      let produktTitelNL = '';
      let produktBeschreibungNL = '';

      // Batch-Übersetzung für bessere Performance
      const textsToTranslate: string[] = [];
      if (produktTitel) textsToTranslate.push(produktTitel);
      if (produktBeschreibung) textsToTranslate.push(produktBeschreibung);

      const translated = await deeplService.translateBatch(textsToTranslate);

      let idx = 0;
      if (produktTitel) {
        produktTitelNL = translated[idx++] || '';
      }
      if (produktBeschreibung) {
        produktBeschreibungNL = translated[idx++] || '';
      }

      console.log(`🇳🇱 On-demand Übersetzung: Titel ${produktTitelNL.length} chars, Beschreibung ${produktBeschreibungNL.length} chars`);

      res.json({
        success: true,
        produktTitelNL,
        produktBeschreibungNL
      });
    } catch (error) {
      console.error('Translate product error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Übersetzung fehlgeschlagen'
      });
    }
  });

  // Attribut-Analyse aus Produktbeschreibung (für Wetterstation-Attribute etc.)
  app.post('/api/analyze-attributes', async (req, res) => {
    try {
      const { description, productName, attributes, productType, customPrompt } = req.body;

      if (!description || !attributes || attributes.length === 0) {
        return res.status(400).json({ error: 'Beschreibung und Attribute erforderlich' });
      }

      // Import OpenAI
      const { getSecureOpenAIKey } = await import('./api-key-manager');
      const apiKey = getSecureOpenAIKey();
      if (!apiKey) {
        return res.status(500).json({ error: 'OpenAI API Key nicht konfiguriert' });
      }
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey });

      // Attribute nach Typ trennen
      const yesNoAttrs = attributes.filter((a: any) => a.type === 'yesNo').map((a: any) => a.label);
      const textAttrs = attributes.filter((a: any) => a.type === 'text').map((a: any) => a.label);
      const choiceAttrs = attributes.filter((a: any) => a.type === 'choice');
      
      // Backwards compatibility: Falls nur Strings übergeben werden (alte Aufrufe)
      const isNewFormat = attributes.length > 0 && typeof attributes[0] === 'object';
      const allYesNo = isNewFormat ? yesNoAttrs : attributes;
      const allText = isNewFormat ? textAttrs : [];
      
      // Build prompt for attribute detection
      let attributeSection = '';
      if (allYesNo.length > 0) {
        attributeSection += `\nJa/Nein Attribute (true/false):\n${allYesNo.map((a: string) => `- ${a}`).join('\n')}`;
      }
      if (allText.length > 0) {
        attributeSection += `\n\nText-Attribute (extrahiere passenden Wert oder null):\n${allText.map((a: string) => `- ${a}`).join('\n')}`;
      }
      if (choiceAttrs.length > 0) {
        attributeSection += `\n\nAuswahl-Attribute (nur einen der erlaubten Werte verwenden):\n${choiceAttrs.map((a: any) => `- ${a.label}: Erlaubte Werte: ${a.choices?.join(', ') || 'keine'}`).join('\n')}`;
      }
      
      // Custom Prompt Anweisungen, falls vorhanden
      const customPromptSection = customPrompt ? `\n\nZUSÄTZLICHE ANWEISUNGEN:\n${customPrompt}` : '';
      
      const prompt = `Analysiere die folgenden Produktdaten und extrahiere Attribute.

Produktart: ${productType || 'Unbekannt'}
${productName ? `Produktname: ${productName}` : ''}

Produktbeschreibung:
${description}

Zu prüfende Attribute:${attributeSection}

REGELN:
- Antworte NUR mit einem JSON-Objekt
- Ja/Nein Attribute: true wenn erwähnt, false wenn nicht
- WICHTIG: Bei Kurzzeitweckern (Timer) ist WST_Weckalarm IMMER false, aber WST_Timer IMMER true (sie haben Timer, keinen Weckalarm!)
- WICHTIG: Bei Weckern (Wecker, Funkwecker, Reisewecker, Lichtwecker) ist WST_Weckalarm IMMER true (Wecker haben per Definition einen Weckalarm!)
- Text-Attribute:
  - akku_produktart: Extrahiere die EXAKTE Produktart aus dem Produktnamen - suche im GANZEN Namen, nicht nur am Anfang!
    - Die Produktart kann ÜBERALL im Namen stehen, nicht nur am Anfang!
    - "WS 6715 - Wetterstation mit..." → "Wetterstation" (Produktart steht NACH dem Modellnamen)
    - "WS6610 Wetterstation mit..." → "Wetterstation"
    - "Radiowecker WT500" → "Radiowecker"
    - "Funkwecker ABC" → "Funkwecker"
    - "Quarzwecker XY" → "Quarzwecker"
    - "Lichtwecker" → "Lichtwecker"
    - "Reisewecker" → "Reisewecker"
    - "Funk-Wetterstation" → "Funk-Wetterstation"
    - "Li-Ion Akku" → "Li-Ion Akku"
    - Bekannte Produktarten: Wetterstation, Funk-Wetterstation, Thermometer, Hygrometer, Radiowecker, Funkwecker, Quarzwecker, Lichtwecker, Reisewecker, Kurzzeitwecker, Kinderwecker, Akku, Batterie, Ladegerät, Netzteil, Kabel
    - Immer die spezifischste Bezeichnung verwenden!
  - allg_farbe_geheause: Extrahiere Gehäusefarbe aus Produktname ODER Beschreibung (z.B. "Schwarz", "Weiß", "Silber", "Grau", "Rot", "Blau", "Grün")
    - Prüfe zuerst den Produktnamen auf Farbangaben wie "-schwarz", "-weiß", "black", "white" etc.
  - tala_stromversorgung: Extrahiere NUR Anzahl und Batterietyp, NICHTS anderes!
    - Format: "[Anzahl] x [Typ]" z.B. "2 x AA Mignon", "3 x AAA Micro", "1 x CR2032"
    - Nur die Kurzform: "2 x AA Mignon" NICHT "2 x AA Mignon LR06 (nicht inklusive)"
    - Kein zusätzlicher Text wie "benötigt", "inklusive", "nicht enthalten", "erforderlich"
    - Bei mehreren Batterietypen: "2 x AA Mignon, 2 x AAA Micro"
  - OTTOMARKET_GEFAHRGUT: Prüfe ob das Produkt Gefahrgut ist:
    - Gefahrgut: Lithium-Ionen-Akkus, Li-Ion Batterien, Li-Po Akkus, Powerbanks mit Li-Ion → "Produkt fällt unter die Gefahrgutvorschriften."
    - KEIN Gefahrgut: Normale Alkaline-Batterien (AA, AAA, CR2032), Wecker, Uhren, Wetterstationen → "Produkt fällt nicht unter die Gefahrgutvorschriften."
  - Bei Text-Attributen: leeren String "" zurückgeben wenn nicht gefunden (NICHT "-" oder null)
- Bei Unsicherheit: false bzw. leeren String ""${customPromptSection}

Beispiel Antwort:
{"WST_Datumsanzeige": true, "WST_Weckalarm": false, "allg_farbe_geheause": "Schwarz", "tala_stromversorgung": "2 x AA Mignon"}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Du bist ein Produktdaten-Analyst. Analysiere Produktbeschreibungen und extrahiere Attribute. Antworte NUR mit validem JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content?.trim() || '{}';
      
      // Parse JSON response (AI antwortet mit label als Key)
      let aiResponse: Record<string, any> = {};
      try {
        // Extract JSON from response (might have markdown code blocks)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiResponse = JSON.parse(jsonMatch[0]);
        }
      } catch (parseErr) {
        console.error('JSON parse error:', parseErr, content);
      }

      // Mappe AI-Antwort (label-basiert) auf CSV-Keys (key-basiert)
      // So wird sichergestellt, dass Werte in die richtige Spalte kommen
      const mappedAttributes: Record<string, any> = {};
      attributes.forEach((attr: any) => {
        const key = attr.key || attr.label;  // Voller CSV-Spaltenname
        const label = attr.label || attr;     // Kurzer Name für AI-Lookup
        
        if (aiResponse.hasOwnProperty(label)) {
          mappedAttributes[key] = aiResponse[label];
        }
      });

      console.log('[Analyze-Attributes] AI Response (label-keys):', aiResponse);
      console.log('[Analyze-Attributes] Mapped Response (csv-keys):', mappedAttributes);

      res.json({
        success: true,
        attributes: mappedAttributes
      });
    } catch (error) {
      console.error('Analyze attributes error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Analyse fehlgeschlagen'
      });
    }
  });

  app.post('/api/pixi/compare', requireAuth, requireFeature('pixiIntegration'), upload.single('csvFile'), async (req: any, res) => {
    try {
      const { supplNr } = req.body;
      const file = req.file;

      if (!supplNr) {
        return res.status(400).json({ 
          success: false,
          error: 'Supplier number (supplNr) is required' 
        });
      }

      if (!file) {
        return res.status(400).json({ 
          success: false,
          error: 'CSV file is required' 
        });
      }

      console.log(`[Pixi Compare] Processing CSV for supplier ${supplNr}, file size: ${file.size} bytes`);

      // Smart encoding detection: Try ISO-8859-1 (Western European) first, then UTF-8
      let csvContent = '';
      
      // First try: ISO-8859-1 (Windows-1252 compatible) - common for German/European CSVs
      try {
        csvContent = file.buffer.toString('iso88591');
        
        // Check for UTF-8 BOM or UTF-8 specific characters
        if (csvContent.charCodeAt(0) === 0xFEFF) {
          // Has UTF-8 BOM, re-decode as UTF-8
          csvContent = file.buffer.toString('utf-8').slice(1);
          console.log('[Pixi Compare] Detected UTF-8 with BOM');
        } else {
          // Check if ISO-8859-1 looks correct (has valid Western European chars)
          const hasWesternEuropeanChars = /[äöüßÄÖÜ€àâéèêëîïôùûüçñ]/g.test(csvContent);
          if (hasWesternEuropeanChars) {
            console.log('[Pixi Compare] Detected Western European encoding (ISO-8859-1)');
          } else {
            // Fallback to UTF-8 if no Western European chars found
            const utf8Content = file.buffer.toString('utf-8');
            if (utf8Content.charCodeAt(0) === 0xFEFF) {
              csvContent = utf8Content.slice(1);
            } else {
              csvContent = utf8Content;
            }
            console.log('[Pixi Compare] Detected UTF-8 encoding');
          }
        }
      } catch (err: any) {
        // Last resort: UTF-8
        csvContent = file.buffer.toString('utf-8');
        if (csvContent.charCodeAt(0) === 0xFEFF) {
          csvContent = csvContent.slice(1);
        }
        console.log('[Pixi Compare] Fallback to UTF-8 encoding');
      }

      const parseResult = await new Promise<any>((resolve, reject) => {
        Papa.parse(csvContent, {
          header: true,
          skipEmptyLines: true,
          encoding: 'UTF-8',
          delimiter: ',',
          transformHeader: (header: string) => {
            // Preserve umlauts and special characters
            return header.trim().toLowerCase();
          },
          complete: (results) => resolve(results),
          error: (error: Error) => reject(error),
        });
      });

      if (!parseResult.data || parseResult.data.length === 0) {
        return res.status(400).json({ 
          success: false,
          error: 'CSV file is empty or invalid' 
        });
      }

      console.log(`[Pixi Compare] Parsed ${parseResult.data.length} products from CSV`);

      // Fix scientific notation in EAN fields FIRST (e.g., "4,01E+12" -> "4013674012345")
      parseResult.data.forEach((product: any) => {
        // Try to fix EAN field
        ['v_ean', 'ean', 'EAN'].forEach(key => {
          if (product[key]) {
            const eanStr = String(product[key]);
            // Check if it's in scientific notation (e.g., "4,01E+12" or "4.01E+12")
            if (eanStr.match(/[0-9],[0-9]+E\+[0-9]+/i) || eanStr.match(/[0-9]\.[0-9]+E\+[0-9]+/i)) {
              // Parse as number and convert back to string without scientific notation
              const eanNum = parseFloat(eanStr.replace(',', '.'));
              if (!isNaN(eanNum)) {
                product[key] = Math.round(eanNum).toString();
                console.log(`[Pixi Compare] Fixed EAN scientific notation: ${eanStr} -> ${product[key]}`);
              }
            }
          }
        });
      });

      // Filter out empty rows (where important fields are all empty)
      const products = parseResult.data.filter((row: any) => {
        // Check if at least one of the key fields has data
        const keyFields = [
          row.p_item_number, row.v_manufacturers_item_number, 
          row['p_name[de]'], row.v_ean, row.p_brand
        ];
        const hasKeyData = keyFields.some(val => 
          val !== null && val !== undefined && String(val).trim() !== ''
        );
        return hasKeyData;
      });

      console.log(`[Pixi Compare] After filtering: ${products.length} valid products`);

      const comparisonResult = await pixiService.compareProducts(products, supplNr);

      console.log(
        `[Pixi Compare] Comparison complete: ${comparisonResult.summary.total} total, ` +
        `${comparisonResult.summary.neu} new, ${comparisonResult.summary.vorhanden} existing`
      );

      res.json(comparisonResult);
    } catch (error: any) {
      console.error('[Pixi Compare] Error:', error);
      res.status(500).json({ 
        success: false,
        error: error.message || 'Failed to compare products with Pixi API' 
      });
    }
  });

  app.post('/api/pixi/compare-json', requireAuth, requireFeature('pixiIntegration'), async (req: any, res) => {
    try {
      const { products, supplNr } = req.body;

      if (!supplNr) {
        return res.status(400).json({ 
          success: false,
          error: 'Supplier number (supplNr) is required' 
        });
      }

      if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ 
          success: false,
          error: 'Products array is required and must not be empty' 
        });
      }

      console.log(`[Pixi Compare JSON] Processing ${products.length} products for supplier ${supplNr}`);

      const comparisonResult = await pixiService.compareProducts(products, supplNr);

      console.log(
        `[Pixi Compare JSON] Comparison complete: ${comparisonResult.summary.total} total, ` +
        `${comparisonResult.summary.neu} new, ${comparisonResult.summary.vorhanden} existing`
      );

      res.json(comparisonResult);
    } catch (error: any) {
      console.error('[Pixi Compare JSON] Error:', error);
      res.status(500).json({ 
        success: false,
        error: error.message || 'Failed to compare products with Pixi API' 
      });
    }
  });

  // Direct comparison from PDF-Scraper (alias for compare-json)
  app.post('/api/pixi/compare-direct', requireAuth, requireFeature('pixiIntegration'), async (req: any, res) => {
    try {
      const { products, supplNr } = req.body;

      if (!supplNr) {
        return res.status(400).json({ 
          success: false,
          error: 'Supplier number (supplNr) is required' 
        });
      }

      if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ 
          success: false,
          error: 'Products array is required and must not be empty' 
        });
      }

      console.log(`[Pixi Compare Direct] Processing ${products.length} products from PDF-Scraper for supplier ${supplNr}`);

      const comparisonResult = await pixiService.compareProducts(products, supplNr);

      console.log(
        `[Pixi Compare Direct] Comparison complete: ${comparisonResult.summary.total} total, ` +
        `${comparisonResult.summary.neu} new, ${comparisonResult.summary.vorhanden} existing`
      );

      res.json(comparisonResult);
    } catch (error: any) {
      console.error('[Pixi Compare Direct] Error:', error);
      res.status(500).json({ 
        success: false,
        error: error.message || 'Failed to compare products with Pixi API' 
      });
    }
  });

  app.delete('/api/pixi/cache', requireAuth, async (req: any, res) => {
    try {
      pixiService.clearCache();
      res.json({ success: true, message: 'Pixi cache cleared' });
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        error: error.message || 'Failed to clear cache' 
      });
    }
  });

  // Brickfox CSV Preview - Preview Brickfox data before export
  app.post('/api/brickfox/preview', requireAuth, async (req: any, res) => {
    try {
      const { projectId, supplierId } = req.body;

      if (!projectId) {
        return res.status(400).json({ 
          success: false,
          error: 'Project ID is required' 
        });
      }

      console.log(`[Brickfox Preview] Generating preview for project ${projectId}`);

      // Get all products in project
      const products = await supabaseStorage.getProducts(projectId, req.user.id);
      
      if (!products || products.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No products found in project'
        });
      }

      // Get supplier name and load custom mappings
      let supplierName = undefined;
      let customMapping = undefined;
      const user = await supabaseStorage.getUserById(req.user.id);
      
      if (supplierId && user?.tenantId) {
        const supplier = await supabaseStorage.getSupplier(supplierId);
        supplierName = supplier?.name;
        
        // Load custom field mappings for this supplier (URL scraper)
        customMapping = await loadMappingsForSupplier(supplierId, user.tenantId, 'url_scraper');
        console.log(`[Brickfox Preview] Loaded custom URL scraper mappings for supplier ${supplierId}`);
      } else if (projectId && user?.tenantId) {
        // Load custom field mappings for this project (CSV)
        customMapping = await loadMappingsForProject(projectId, user.tenantId, 'csv');
        console.log(`[Brickfox Preview] Loaded custom CSV mappings for project ${projectId}`);
      }

      // Load mappingRules.json for fixed values and auto-generate rules
      let fixedValues = undefined;
      let autoGenerateRules = undefined;
      
      try {
        const { loadMappingRules } = await import('./services/mapping-rules-loader');
        const mappingRules = loadMappingRules();
        fixedValues = mappingRules.fixedValues;
        autoGenerateRules = mappingRules.autoGenerate;
        console.log(`[Brickfox Preview] Loaded mappingRules.json with ${Object.keys(fixedValues).length} fixed values`);
      } catch (error: any) {
        console.warn(`[Brickfox Preview] Could not load mappingRules.json: ${error.message}`);
      }

      // Transform to Brickfox format (without AI enhancement for faster preview)
      const brickfoxRows = mapProductsToBrickfox(products, {
        supplierName: supplierName || 'Unbekannt',
        customMapping,
        fixedValues,
        autoGenerateRules,
        enableAI: false // Disable AI for preview to speed up
      });

      console.log(`[Brickfox Preview] Generated preview with ${brickfoxRows.length} rows`);
      
      res.json({
        success: true,
        rows: brickfoxRows,
        totalRows: brickfoxRows.length
      });
    } catch (error: any) {
      console.error('[Brickfox Preview] Error:', error);
      res.status(500).json({ 
        success: false,
        error: error.message || 'Failed to generate Brickfox preview' 
      });
    }
  });

  // Brickfox CSV Export - Export project products as Brickfox-formatted CSV
  app.post('/api/brickfox/export', requireAuth, async (req: any, res) => {
    try {
      const { projectId, supplierId } = req.body;

      if (!projectId) {
        return res.status(400).json({ 
          success: false,
          error: 'Project ID is required' 
        });
      }

      console.log(`[Brickfox Export] Exporting project ${projectId}`);

      // Get all products in project
      const products = await supabaseStorage.getProducts(projectId, req.user.id);
      
      if (!products || products.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No products found in project'
        });
      }

      // Get supplier name and load custom mappings
      let supplierName = undefined;
      let customMapping = undefined;
      const user = await supabaseStorage.getUserById(req.user.id);
      
      if (supplierId && user?.tenantId) {
        const supplier = await supabaseStorage.getSupplier(supplierId);
        supplierName = supplier?.name;
        
        // Load custom field mappings for this supplier (URL scraper)
        customMapping = await loadMappingsForSupplier(supplierId, user.tenantId, 'url_scraper');
        console.log(`[Brickfox Export] Loaded custom URL scraper mappings for supplier ${supplierId}`);
      } else if (projectId && user?.tenantId) {
        // Load custom field mappings for this project (CSV)
        customMapping = await loadMappingsForProject(projectId, user.tenantId, 'csv');
        console.log(`[Brickfox Export] Loaded custom CSV mappings for project ${projectId}`);
      }

      // AI Enhancement: Generate missing fields
      console.log(`[Brickfox Export] Running AI enhancement for ${products.length} products...`);
      const aiEnhancements = await enhanceProductsWithAI(products);
      console.log(`[Brickfox Export] AI enhancement complete: ${aiEnhancements.size} products enhanced`);

      // Merge AI enhancements into products
      products.forEach(product => {
        const enhancement = aiEnhancements.get(product.id);
        if (enhancement) {
          // Add AI data to customAttributes
          if (!product.customAttributes) product.customAttributes = [];
          
          if (enhancement.customs_tariff_number) {
            product.customAttributes.push({ 
              key: 'ai_customs_tariff_number', 
              value: enhancement.customs_tariff_number,
              type: 'string'
            });
          }
          if (enhancement.customs_tariff_text) {
            product.customAttributes.push({ 
              key: 'ai_customs_tariff_text', 
              value: enhancement.customs_tariff_text,
              type: 'string'
            });
          }
          if (enhancement.optimized_description) {
            product.customAttributes.push({ 
              key: 'ai_description', 
              value: enhancement.optimized_description,
              type: 'string'
            });
          }
        }
      });

      // Load mappingRules.json for fixed values and auto-generate rules
      let fixedValues = undefined;
      let autoGenerateRules = undefined;
      
      try {
        const { loadMappingRules } = await import('./services/mapping-rules-loader');
        const mappingRules = loadMappingRules();
        fixedValues = mappingRules.fixedValues;
        autoGenerateRules = mappingRules.autoGenerate;
        console.log(`[Brickfox Export] Loaded mappingRules.json with ${Object.keys(fixedValues).length} fixed values`);
      } catch (error: any) {
        console.warn(`[Brickfox Export] Could not load mappingRules.json: ${error.message}`);
      }

      // Transform to Brickfox format
      const brickfoxRows = mapProductsToBrickfox(products, {
        supplierName: supplierName || 'Unbekannt',
        customMapping,
        fixedValues,
        autoGenerateRules,
        enableAI: true
      });

      // Convert to CSV
      const csv = brickfoxRowsToCSV(brickfoxRows);

      // Set headers for file download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="brickfox-export-${projectId}.csv"`);
      
      console.log(`[Brickfox Export] Generated CSV with ${brickfoxRows.length} rows`);
      
      res.send(csv);
    } catch (error: any) {
      console.error('[Brickfox Export] Error:', error);
      res.status(500).json({ 
        success: false,
        error: error.message || 'Failed to export Brickfox CSV' 
      });
    }
  });

  // Pixi Supabase Integration - Compare project products with Pixi ERP
  app.post('/api/pixi/compare-project', requireAuth, requireFeature('pixiIntegration'), async (req: any, res) => {
    try {
      const { projectId, supplierId, supplNr } = req.body;

      if (!projectId) {
        return res.status(400).json({ 
          success: false,
          error: 'Project ID is required' 
        });
      }

      if (!supplierId && !supplNr) {
        return res.status(400).json({ 
          success: false,
          error: 'Either supplier ID or supplier number (supplNr) is required' 
        });
      }

      console.log(
        `[Pixi Compare Project] Starting comparison for project ${projectId} ` +
        `with ${supplierId ? `supplier ${supplierId}` : `supplNr ${supplNr}`}`
      );

      const supplierIdOrSupplNr = supplierId || supplNr;
      const comparisonResult = await pixiService.compareProductsFromSupabase(
        projectId,
        supabaseStorage,
        supplierIdOrSupplNr
      );

      console.log(
        `[Pixi Compare Project] Comparison complete: ${comparisonResult.summary.total} total, ` +
        `${comparisonResult.summary.neu} new, ${comparisonResult.summary.vorhanden} existing`
      );

      res.json(comparisonResult);
    } catch (error: any) {
      console.error('[Pixi Compare Project] Error:', error);
      res.status(500).json({ 
        success: false,
        error: error.message || 'Failed to compare products with Pixi API' 
      });
    }
  });

  // PDF Preview - Extract URLs without scraping (no automatic scraping)
  app.post('/api/pdf/preview', requireAuth, upload.single('pdf'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          error: 'Keine PDF-Datei hochgeladen' 
        });
      }

      console.log(`[PDF Preview] Processing PDF: ${req.file.originalname}`);

      // Extract products WITH and WITHOUT URLs
      const parseResult = await pdfParserService.extractProductsWithSeparation(req.file.buffer);

      console.log(`[PDF Preview] Found ${parseResult.withURL.length} products WITH URLs`);
      console.log(`[PDF Preview] Found ${parseResult.withoutURL.length} products WITHOUT URLs`);

      res.json({
        success: true,
        totalProducts: parseResult.totalProducts,
        withURL: parseResult.withURL,
        withoutURL: parseResult.withoutURL,
        // Legacy field for backwards compatibility
        products: parseResult.withURL,
      });
    } catch (error: any) {
      console.error('[PDF Preview] Error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Fehler beim Verarbeiten der PDF' 
      });
    }
  });


  // ===== SCRAPE SESSION MANAGEMENT =====
  // GET current scrape session for user (persists data between page navigation)
  app.get('/api/scrape-session', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const tenantId = (req as any).tenantId;
      
      // Get the most recent scrape session for this user
      const [session] = await heliumDb
        .select()
        .from(scrapeSessionTable)
        .where(
          and(
            eq(scrapeSessionTable.userId, userId),
            tenantId ? eq(scrapeSessionTable.tenantId, tenantId) : undefined
          )
        )
        .orderBy(sql`${scrapeSessionTable.updatedAt} DESC`)
        .limit(1);
      
      if (!session) {
        return res.json({ success: true, session: null });
      }
      
      res.json({
        success: true,
        session: {
          id: session.id,
          scrapedProducts: session.scrapedProducts,
          scrapedProduct: session.scrapedProduct,
          generatedDescription: session.generatedDescription,
          updatedAt: session.updatedAt,
        },
      });
    } catch (error: any) {
      console.error('[Scrape Session] GET error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // PUT/UPDATE scrape session (auto-save during scraping)
  app.put('/api/scrape-session', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const tenantId = (req as any).tenantId;
      const { urlScraper, pdfScraper, generatedDescription } = req.body;
      
      // Check if session already exists
      const [existingSession] = await heliumDb
        .select()
        .from(scrapeSessionTable)
        .where(
          and(
            eq(scrapeSessionTable.userId, userId),
            tenantId ? eq(scrapeSessionTable.tenantId, tenantId) : undefined
          )
        )
        .orderBy(sql`${scrapeSessionTable.updatedAt} DESC`)
        .limit(1);
      
      let session;
      
      if (existingSession) {
        // Merge existing data with new data (preserve both scrapers' data)
        const existingData = (existingSession.scrapedProducts as any) || {};
        const mergedData = {
          urlScraper: urlScraper || existingData.urlScraper || null,
          pdfScraper: pdfScraper || existingData.pdfScraper || null,
        };
        
        // Update existing session
        [session] = await heliumDb
          .update(scrapeSessionTable)
          .set({
            scrapedProducts: mergedData,
            generatedDescription: generatedDescription || existingSession.generatedDescription,
            updatedAt: new Date(),
          })
          .where(eq(scrapeSessionTable.id, existingSession.id))
          .returning();
        
        console.log(`[Scrape Session] Updated session ${session.id} for user ${userId} (urlScraper: ${!!urlScraper}, pdfScraper: ${!!pdfScraper})`);
      } else {
        // Create new session
        [session] = await heliumDb
          .insert(scrapeSessionTable)
          .values({
            userId,
            tenantId: tenantId || null,
            scrapedProducts: {
              urlScraper: urlScraper || null,
              pdfScraper: pdfScraper || null,
            },
            generatedDescription: generatedDescription || null,
          })
          .returning();
        
        console.log(`[Scrape Session] Created new session ${session.id} for user ${userId}`);
      }
      
      res.json({ success: true, session });
    } catch (error: any) {
      console.error('[Scrape Session] PUT error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // DELETE scrape session (when user saves to project)
  app.delete('/api/scrape-session', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const tenantId = (req as any).tenantId;
      
      await heliumDb
        .delete(scrapeSessionTable)
        .where(
          and(
            eq(scrapeSessionTable.userId, userId),
            tenantId ? eq(scrapeSessionTable.tenantId, tenantId) : undefined
          )
        );
      
      console.log(`[Scrape Session] Deleted session for user ${userId}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Scrape Session] DELETE error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ===== BACKUP SYSTEM API ENDPOINTS =====
  
  // Create manual backup
  app.post('/api/backups', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const tenantId = (req as any).tenantId;
      const { backupType = 'manual' } = req.body;
      
      const { backupService } = await import('./services/backup-service');
      
      const backup = await backupService.createBackup({
        tenantId,
        userId,
        backupType,
        expiresInDays: 30,
      });
      
      res.json({ success: true, backup });
    } catch (error: any) {
      console.error('[Backup API] Create failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // List all backups for tenant
  app.get('/api/backups', requireAuth, async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      
      const { backupService } = await import('./services/backup-service');
      const backupsList = await backupService.listBackups(tenantId);
      
      res.json({ success: true, backups: backupsList });
    } catch (error: any) {
      console.error('[Backup API] List failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // Restore from backup
  app.post('/api/backups/:id/restore', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const tenantId = (req as any).tenantId;
      const { id } = req.params;
      
      const { backupService } = await import('./services/backup-service');
      const result = await backupService.restoreBackup({
        backupId: id,
        tenantId,
        userId,
      });
      
      res.json({ ...result, success: true });
    } catch (error: any) {
      console.error('[Backup API] Restore failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // Delete backup
  app.delete('/api/backups/:id', requireAuth, async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const { id } = req.params;
      
      const { backupService } = await import('./services/backup-service');
      await backupService.deleteBackup(id, tenantId);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Backup API] Delete failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // Get audit logs (Admin only)
  app.get('/api/audit-logs', requireSuperAdmin, async (req, res) => {
    try {
      const { limit = 100, offset = 0, resourceType, userId } = req.query;
      
      let query = heliumDb
        .select()
        .from(auditLogsTable)
        .orderBy(sql`${auditLogsTable.createdAt} DESC`)
        .limit(Number(limit))
        .offset(Number(offset));
      
      if (resourceType) {
        query = query.where(eq(auditLogsTable.resourceType, String(resourceType)));
      }
      
      if (userId) {
        query = query.where(eq(auditLogsTable.userId, String(userId)));
      }
      
      const logs = await query;
      
      res.json({ success: true, logs });
    } catch (error: any) {
      console.error('[Audit API] List failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ===== PERMISSION SYSTEM API ENDPOINTS =====
  
  // Grant permission to user
  app.post('/api/permissions', requireSuperAdmin, async (req, res) => {
    try {
      const { userId, resource, action, scope, conditions } = req.body;
      const tenantId = (req as any).tenantId;
      
      const { permissionService } = await import('./services/permission-service');
      
      const permission = await permissionService.grantPermission({
        userId,
        tenantId,
        resource,
        action,
        scope,
        conditions,
      });
      
      res.json({ success: true, permission });
    } catch (error: any) {
      console.error('[Permission API] Grant failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // List user permissions
  app.get('/api/permissions/:userId', requireAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      const requestingUserId = (req as any).userId;
      const isAdmin = (req as any).user?.isAdmin;
      
      if (!isAdmin && requestingUserId !== userId) {
        return res.status(403).json({ 
          success: false, 
          error: 'Sie können nur Ihre eigenen Berechtigungen einsehen.' 
        });
      }
      
      const { permissionService } = await import('./services/permission-service');
      const userPermissions = await permissionService.listUserPermissions(userId);
      
      res.json({ success: true, permissions: userPermissions });
    } catch (error: any) {
      console.error('[Permission API] List failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // Revoke permission
  app.delete('/api/permissions/:id', requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const { permissionService } = await import('./services/permission-service');
      await permissionService.revokePermission(id);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Permission API] Revoke failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // Update user role
  app.put('/api/users/:userId/role', requireSuperAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      
      const allowedRoles = ['admin', 'editor', 'viewer', 'project_manager', 'member'];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ 
          success: false, 
          error: `Ungültige Rolle. Erlaubt: ${allowedRoles.join(', ')}` 
        });
      }
      
      const { permissionService } = await import('./services/permission-service');
      const user = await permissionService.updateUserRole(userId, role);
      
      res.json({ success: true, user });
    } catch (error: any) {
      console.error('[Permission API] Role update failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Mount webhook routes
  app.use('/api/webhooks', webhooksRouter);

  // Mount mapping routes
  app.use('/api', mappingRouter);

  // Weight estimation endpoint
  app.post('/api/estimate-weight', requireAuth, async (req, res) => {
    try {
      const { products } = req.body;
      
      if (!products || !Array.isArray(products)) {
        return res.status(400).json({ error: 'products array required' });
      }
      
      const { getSecureOpenAIKey } = await import('./api-key-manager');
      const apiKey = getSecureOpenAIKey();
      
      if (!apiKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured' });
      }
      
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ 
        apiKey,
        baseURL: process.env.OPENAI_BASE_URL || process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
      });
      
      const results = [];
      
      for (const product of products) {
        const { name, description, category, brand } = product;
        
        const prompt = `Schätze das Gewicht für folgendes Produkt in Gramm.

Produktname: ${name || 'Unbekannt'}
Marke: ${brand || 'Unbekannt'}
Kategorie: ${category || 'Unbekannt'}
Beschreibung: ${description || 'Keine Beschreibung'}

Antworte NUR mit einer Zahl (Gewicht in Gramm). Keine Einheit, keine Erklärung.
Beispiel: 150`;

        try {
          const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'Du bist ein Experte für Produktgewichte im E-Commerce. Schätze realistische Gewichte basierend auf Produktbeschreibungen.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 20,
            temperature: 0.3
          });
          
          const weightStr = response.choices[0]?.message?.content?.trim() || '';
          const weight = parseFloat(weightStr.replace(/[^\d.,]/g, '').replace(',', '.'));
          
          results.push({
            ...product,
            estimatedWeight: isNaN(weight) ? null : weight,
            confidence: isNaN(weight) ? 'low' : 'medium'
          });
        } catch (aiError) {
          console.error('[Weight Estimation] AI error for product:', name, aiError);
          results.push({
            ...product,
            estimatedWeight: null,
            confidence: 'error'
          });
        }
      }
      
      res.json({ success: true, results });
    } catch (error: any) {
      console.error('[Weight Estimation] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Prompt Assistant Chat Endpoint
  app.post('/api/prompt-assistant/chat', requireAuth, async (req, res) => {
    try {
      const { message, history = [] } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'message is required' });
      }
      
      const { getSecureOpenAIKey } = await import('./api-key-manager');
      const apiKey = getSecureOpenAIKey();
      
      if (!apiKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured' });
      }
      
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ 
        apiKey,
        baseURL: process.env.OPENAI_BASE_URL || process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
      });
      
      const systemPrompt = `Du bist ein Experte für PIMPilot, eine B2B SaaS-Plattform für automatisierte AI-Produktbeschreibungen.

Dein Wissen umfasst:

1. PRODUKTTITEL-SCHEMA:
   Format: [Marke] [Produkttyp] für [Gerät/Serie], [weitere Geräte] – [messbare Attribute]
   Beispiel: "vhbw Li-Ion Akku für Bosch GSR 12V-15, GSB 12V-15 – 2000mAh, 12V"

2. HTML-BESCHREIBUNGSSTRUKTUR:
   - Ein <h1> nur für Produktname
   - Keine Produktname-Wiederholung im Fließtext
   - Vorteile mit ✅ Checkmarks markieren
   - Technische Tabellen NUR für Akkus/Batterien (Typ A)
   - Mindestens 2 echte Vorteile erforderlich, sonst "Ihre Vorteile" weglassen

3. PRODUKTTYPEN:
   - Typ A (Akkus/Batterien): Mit technischen Datentabellen
   - Typ B (Elektronik/Zubehör): Standard-Beschreibungen ohne Tabellen
   - Typ C (Werkzeug-Sets): Mit Tool-Übersichtslisten

4. VORTEILE-REGELN:
   - Format: "[Eigenschaft] – [Nutzen]", max 60 Zeichen
   - Keine erfundenen Vorteile - nur aus CSV-Daten extrahieren
   - Akku-Chemie (Ni-MH, Li-Ion) als Vorteil nutzen

5. KOMPATIBILITÄT:
   - Bei Batterien/Knopfzellen: "Typ: CR2032 (entspricht DL2032, ECR2032)"
   - Bei anderen Produkten: "Kompatibilität: Modell1, Modell2, Modell3"
   - Technische Specs wie "12 Volt Systeme" herausfiltern

6. SEO-OPTIMIERUNG:
   - Keywords natürlich integrieren
   - Meta-Description: 150-160 Zeichen
   - Strukturierte Daten für E-Commerce

Antworte auf Deutsch, präzise und praxisorientiert.`;

      const messages: Array<{ role: 'system' | 'user' | 'assistant', content: string }> = [
        { role: 'system', content: systemPrompt }
      ];
      
      // Add history
      for (const msg of history.slice(-10)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
      
      // Add current message
      messages.push({ role: 'user', content: message });
      
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        max_tokens: 1500,
        temperature: 0.7
      });
      
      const assistantResponse = response.choices[0]?.message?.content || 'Keine Antwort erhalten.';
      
      res.json({ success: true, response: assistantResponse });
    } catch (error: any) {
      console.error('[Prompt Assistant] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Prompt Assistant - Explain Generation Decision
  app.post('/api/prompt-assistant/explain', requireAuth, async (req, res) => {
    try {
      const { productData, generatedContent, question } = req.body;
      
      if (!productData || !question) {
        return res.status(400).json({ error: 'productData and question are required' });
      }
      
      const { getSecureOpenAIKey } = await import('./api-key-manager');
      const apiKey = getSecureOpenAIKey();
      
      if (!apiKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured' });
      }
      
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ 
        apiKey,
        baseURL: process.env.OPENAI_BASE_URL || process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
      });
      
      const systemPrompt = `Du bist ein Experte für PIMPilot-Produktbeschreibungen. 
Erkläre kurz und präzise, warum bestimmte Entscheidungen bei der Generierung getroffen wurden.
Antworte immer auf Deutsch, max 3-4 Sätze.`;

      const userPrompt = `Produktdaten:
${JSON.stringify(productData, null, 2)}

${generatedContent ? `Generierte Beschreibung: ${generatedContent.substring(0, 500)}...` : ''}

Frage: ${question}`;
      
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 300,
        temperature: 0.5
      });
      
      const explanation = response.choices[0]?.message?.content || 'Keine Erklärung verfügbar.';
      
      res.json({ success: true, explanation });
    } catch (error: any) {
      console.error('[Prompt Assistant Explain] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
