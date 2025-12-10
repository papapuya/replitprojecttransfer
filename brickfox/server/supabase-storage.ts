import { supabase, supabaseAdmin } from './supabase';
import { encryptionService } from './services/encryption-service';
import { db as heliumDb } from './db'; // Helium/Neon PostgreSQL client
import { eq, desc, and } from 'drizzle-orm';
import { users as usersTable, tenants as tenantsTable, suppliers as suppliersTable, projects as projectsTable, productsInProjects as productsInProjectsTable } from '@shared/schema';

// Use admin client for backend operations to bypass RLS
const db = supabaseAdmin || supabase;
import type {
  Project,
  CreateProject,
  ProductInProject,
  CreateProductInProject,
  UpdateProductInProject,
  Template,
  Supplier,
  CreateSupplier,
  UpdateSupplier,
  User,
  RegisterUser,
  CreateTenant,
  UpdateTenant,
  TenantSettings
} from '@shared/schema';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  settings: TenantSettings;
  createdAt: string;
  updatedAt: string;
}

export interface IStorage {
  createUser(data: RegisterUser): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User & { passwordHash: string } | null>;
  getUserByUsername(username: string): Promise<User & { passwordHash: string } | null>;
  getAllUsers(): Promise<User[]>;
  updateUserSubscription(userId: string, data: {
    stripeCustomerId?: string;
    subscriptionStatus?: string;
    subscriptionId?: string;
    planId?: string;
    currentPeriodEnd?: string;
    apiCallsLimit?: number;
  }): Promise<User | null>;
  incrementApiCalls(userId: string): Promise<void>;
  resetApiCalls(userId: string): Promise<void>;
  
  createProject(userId: string, data: CreateProject): Promise<Project>;
  getProjects(): Promise<Project[]>;
  getProjectsByUserId(userId: string): Promise<Project[]>;
  getProject(id: string, userId?: string): Promise<Project | null>;
  deleteProject(id: string, userId?: string): Promise<boolean>;
  
  createProduct(projectId: string, data: CreateProductInProject, userId?: string): Promise<ProductInProject>;
  getProducts(projectId: string, userId?: string): Promise<ProductInProject[]>;
  getProduct(id: string, userId?: string): Promise<ProductInProject | null>;
  updateProduct(id: string, data: UpdateProductInProject, userId?: string): Promise<ProductInProject | null>;
  deleteProduct(id: string, userId?: string): Promise<boolean>;
  
  createTemplate(userId: string, data: { name: string; content: string; templateType?: string; productType?: string; isDefault?: boolean }): Promise<Template>;
  getTemplates(userId?: string): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | null>;
  updateTemplate(id: string, data: { name?: string; content?: string; templateType?: string; productType?: string; isDefault?: boolean }): Promise<Template | null>;
  deleteTemplate(id: string): Promise<boolean>;
  
  createSupplier(userId: string, data: CreateSupplier): Promise<Supplier>;
  getSuppliers(userId: string): Promise<Supplier[]>;
  getSupplier(id: string): Promise<Supplier | null>;
  updateSupplier(id: string, data: UpdateSupplier): Promise<Supplier | null>;
  deleteSupplier(id: string): Promise<boolean>;
  
  updateProductPixiStatus(productId: string, pixiData: {
    pixi_status: 'NEU' | 'VORHANDEN';
    pixi_ean: string | null;
    pixi_checked_at: string;
  }): Promise<boolean>;
  batchUpdateProductsPixiStatus(updates: Array<{
    id: string;
    pixi_status: 'NEU' | 'VORHANDEN';
    pixi_ean: string | null;
    pixi_checked_at: string;
  }>): Promise<boolean>;
}

export class SupabaseStorage implements IStorage {
  private safeDecrypt(ciphertext: string | null | undefined): string | null {
    try {
      return encryptionService.decrypt(ciphertext);
    } catch (error) {
      console.error('[Storage] Decryption failed, returning null:', error);
      return null;
    }
  }

  async createUser(data: RegisterUser): Promise<User> {
    throw new Error('Use Supabase Auth signUp instead');
  }

  async getUserById(id: string): Promise<User | null> {
    // CRITICAL: Use Helium/Neon DB directly (not Supabase remote DB!)
    const users = await heliumDb.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    const user = users[0];

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      username: user.username || undefined,
      isAdmin: user.isAdmin || false,
      tenantId: user.tenantId || undefined,
      role: user.role || 'member',
      stripeCustomerId: user.stripeCustomerId || undefined,
      subscriptionStatus: user.subscriptionStatus || undefined,
      subscriptionId: user.subscriptionId || undefined,
      planId: user.planId || undefined,
      currentPeriodEnd: user.currentPeriodEnd || undefined,
      apiCallsUsed: user.apiCallsUsed || 0,
      apiCallsLimit: user.apiCallsLimit || 50,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async getUserByEmail(email: string): Promise<User & { passwordHash: string } | null> {
    if (!supabaseAdmin) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) return null;

    return {
      id: user.id,
      email: user.email,
      username: user.username || undefined,
      isAdmin: user.is_admin || false,
      tenantId: user.tenant_id || undefined,
      role: user.role || 'member',
      passwordHash: '', // Not used with Supabase Auth
      stripeCustomerId: user.stripe_customer_id || undefined,
      subscriptionStatus: user.subscription_status || undefined,
      subscriptionId: user.subscription_id || undefined,
      planId: user.plan_id || undefined,
      currentPeriodEnd: user.current_period_end || undefined,
      apiCallsUsed: user.api_calls_used || 0,
      apiCallsLimit: user.api_calls_limit || 50,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  async getUserByUsername(username: string): Promise<User & { passwordHash: string } | null> {
    // CRITICAL: Query Helium DB directly (local PostgreSQL), not Supabase remote DB!
    const users = await heliumDb.select()
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);

    if (!users || users.length === 0) return null;

    const user = users[0];

    return {
      id: user.id,
      email: user.email,
      username: user.username || undefined,
      isAdmin: user.isAdmin || false,
      tenantId: user.tenantId || undefined,
      role: user.role || 'member',
      passwordHash: '', // Not used with Supabase Auth
      stripeCustomerId: user.stripeCustomerId || undefined,
      subscriptionStatus: user.subscriptionStatus || undefined,
      subscriptionId: user.subscriptionId || undefined,
      planId: user.planId || undefined,
      currentPeriodEnd: user.currentPeriodEnd ? user.currentPeriodEnd.toISOString() : undefined,
      apiCallsUsed: user.apiCallsUsed || 0,
      apiCallsLimit: user.apiCallsLimit || 50,
      createdAt: user.createdAt ? user.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: user.updatedAt ? user.updatedAt.toISOString() : new Date().toISOString(),
    };
  }

  async getAllUsers(): Promise<User[]> {
    if (!supabaseAdmin) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .order('created_at');

    if (error || !users) return [];

    return users.map(user => ({
      id: user.id,
      email: user.email,
      username: user.username || undefined,
      isAdmin: user.is_admin || false,
      tenantId: user.tenant_id || undefined,
      role: user.role || 'member',
      stripeCustomerId: user.stripe_customer_id || undefined,
      subscriptionStatus: user.subscription_status || undefined,
      subscriptionId: user.subscription_id || undefined,
      planId: user.plan_id || undefined,
      currentPeriodEnd: user.current_period_end || undefined,
      apiCallsUsed: user.api_calls_used || 0,
      apiCallsLimit: user.api_calls_limit || 50,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    }));
  }

  async updateUserSubscription(userId: string, data: {
    stripeCustomerId?: string;
    subscriptionStatus?: string;
    subscriptionId?: string;
    planId?: string;
    currentPeriodEnd?: string;
    apiCallsLimit?: number;
  }): Promise<User | null> {
    if (!supabaseAdmin) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    const updateData: any = {};
    if (data.stripeCustomerId) updateData.stripe_customer_id = data.stripeCustomerId;
    if (data.subscriptionStatus) updateData.subscription_status = data.subscriptionStatus;
    if (data.subscriptionId) updateData.subscription_id = data.subscriptionId;
    if (data.planId) updateData.plan_id = data.planId;
    if (data.currentPeriodEnd) updateData.current_period_end = data.currentPeriodEnd;
    if (data.apiCallsLimit !== undefined) updateData.api_calls_limit = data.apiCallsLimit;

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error || !user) return null;

    return {
      id: user.id,
      email: user.email,
      username: user.username || undefined,
      isAdmin: user.is_admin || false,
      role: user.role || 'member',
      stripeCustomerId: user.stripe_customer_id || undefined,
      subscriptionStatus: user.subscription_status || undefined,
      subscriptionId: user.subscription_id || undefined,
      planId: user.plan_id || undefined,
      currentPeriodEnd: user.current_period_end || undefined,
      apiCallsUsed: user.api_calls_used || 0,
      apiCallsLimit: user.api_calls_limit || 50,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  async incrementApiCalls(userId: string): Promise<void> {
    if (!supabaseAdmin) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('api_calls_used')
      .eq('id', userId)
      .single();

    if (user) {
      await supabaseAdmin
        .from('users')
        .update({ api_calls_used: (user.api_calls_used || 0) + 1 })
        .eq('id', userId);
    }
  }

  async resetApiCalls(userId: string): Promise<void> {
    if (!supabaseAdmin) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    await supabaseAdmin
      .from('users')
      .update({ api_calls_used: 0 })
      .eq('id', userId);
  }

  async createProject(userId: string, data: CreateProject): Promise<Project> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');
    
    if (!user.tenantId) {
      console.error(`[SECURITY CRITICAL] User ${userId} has NO tenant_id - cannot create project`);
      throw new Error('User must belong to an organization to create projects');
    }

    console.log('[createProject] Attempting to insert:', {
      user_id: userId,
      tenant_id: user.tenantId,
      name: data.name,
    });

    // Use Helium DB in development, Supabase in production
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (isDevelopment) {
      // Use Drizzle ORM with Helium DB
      const [project] = await heliumDb
        .insert(projectsTable)
        .values({
          userId,
          tenantId: user.tenantId,
          name: data.name,
        })
        .returning();

      if (!project) {
        throw new Error('Failed to create project: No data returned');
      }

      return {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt!.toISOString(),
      };
    } else {
      // Use Supabase in production
      if (!supabaseAdmin) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
      }

      const { data: project, error } = await supabaseAdmin
        .from('projects')
        .insert({
          user_id: userId,
          tenant_id: user.tenantId,
          name: data.name,
        })
        .select()
        .single();

      if (error) {
        console.error('[createProject] Supabase error:', JSON.stringify(error, null, 2));
        throw new Error(`Failed to create project: ${error.message}`);
      }
      
      if (!project) {
        console.error('[createProject] No project returned but no error');
        throw new Error('Failed to create project: No data returned');
      }

      return {
        id: project.id,
        name: project.name,
        createdAt: project.created_at,
      };
    }
  }

  async getProjects(): Promise<Project[]> {
    throw new Error('Use getProjectsByUserId instead - organization filtering required');
  }

  async getProjectsByUserId(userId: string): Promise<Project[]> {
    const isDevelopment = process.env.NODE_ENV === 'development';

    const user = await this.getUserById(userId);
    if (!user) return [];

    if (isDevelopment) {
      // Use Helium DB in development
      let query = heliumDb
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.userId, userId))
        .orderBy(desc(projectsTable.createdAt));

      const projects = await query;

      return projects.map((p: any) => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt!.toISOString(),
      }));
    } else {
      // Use Supabase in production
      if (!supabaseAdmin) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
      }

      const query = supabaseAdmin
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .order('created_at');

      if (user.tenantId) {
        query.eq('tenant_id', user.tenantId);
      }

      const { data: projects, error } = await query;

      if (error || !projects) return [];

      return projects.map(p => ({
        id: p.id,
        name: p.name,
        createdAt: p.created_at,
      }));
    }
  }

  async getProject(id: string, userId?: string): Promise<Project | null> {
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (isDevelopment) {
      // Use Helium DB in development
      const [project] = await heliumDb
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.id, id))
        .limit(1);

      if (!project) return null;

      if (userId) {
        const user = await this.getUserById(userId);
        if (!user) {
          console.warn(`[SECURITY] Invalid user ${userId} tried to access project ${id}`);
          return null;
        }
        
        if (!user.tenantId) {
          console.warn(`[SECURITY CRITICAL] User ${userId} has NO tenant_id - blocking ALL access`);
          return null;
        }
        
        if (!project.tenantId) {
          console.warn(`[SECURITY CRITICAL] Project ${id} has NO tenant_id - blocking access (needs backfill)`);
          return null;
        }
        
        if (user.tenantId !== project.tenantId) {
          console.warn(`[SECURITY] User ${userId} (org: ${user.tenantId}) tried to access project ${id} (org: ${project.tenantId})`);
          return null;
        }
      }

      return {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt!.toISOString(),
      };
    } else {
      // Use Supabase in production
      if (!supabaseAdmin) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
      }

      const { data: project, error } = await supabaseAdmin
        .from('projects')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !project) return null;

      if (userId) {
        const user = await this.getUserById(userId);
        if (!user) {
          console.warn(`[SECURITY] Invalid user ${userId} tried to access project ${id}`);
          return null;
        }
        
        if (!user.tenantId) {
          console.warn(`[SECURITY CRITICAL] User ${userId} has NO tenant_id - blocking ALL access`);
          return null;
        }
        
        if (!project.tenant_id) {
          console.warn(`[SECURITY CRITICAL] Project ${id} has NO tenant_id - blocking access (needs backfill)`);
          return null;
        }
        
        if (user.tenantId !== project.tenant_id) {
          console.warn(`[SECURITY] User ${userId} (org: ${user.tenantId}) tried to access project ${id} (org: ${project.tenant_id})`);
          return null;
        }
      }

      return {
        id: project.id,
        name: project.name,
        createdAt: project.created_at,
      };
    }
  }

  async deleteProject(id: string, userId?: string): Promise<boolean> {
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (userId) {
      const project = await this.getProject(id, userId);
      if (!project) {
        console.warn(`[SECURITY] User ${userId} tried to delete project ${id} from different org`);
        return false;
      }
    }

    if (isDevelopment) {
      // Use Helium DB in development
      // First delete all products in this project (CASCADE delete)
      await heliumDb
        .delete(productsInProjectsTable)
        .where(eq(productsInProjectsTable.projectId, id));
      
      // Then delete the project itself
      await heliumDb
        .delete(projectsTable)
        .where(eq(projectsTable.id, id));
      return true;
    } else {
      // Use Supabase in production
      if (!supabaseAdmin) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
      }

      // First delete all products in this project (CASCADE delete)
      await supabaseAdmin
        .from('products_in_projects')
        .delete()
        .eq('project_id', id);

      // Then delete the project itself
      const { error } = await supabaseAdmin
        .from('projects')
        .delete()
        .eq('id', id);

      return !error;
    }
  }

  async createProduct(projectId: string, data: CreateProductInProject, userId?: string): Promise<ProductInProject> {
    const isDevelopment = process.env.NODE_ENV === 'development';

    const project = await this.getProject(projectId, userId);
    if (!project) {
      if (userId) console.warn(`[SECURITY] User ${userId} tried to create product in non-existent/unauthorized project ${projectId}`);
      throw new Error('Project not found or access denied');
    }

    if (isDevelopment) {
      // Use Helium DB in development
      const [projectData] = await heliumDb
        .select({ tenantId: projectsTable.tenantId })
        .from(projectsTable)
        .where(eq(projectsTable.id, projectId))
        .limit(1);

      const [product] = await heliumDb
        .insert(productsInProjectsTable)
        .values({
          projectId,
          tenantId: projectData?.tenantId || null,
          name: data.name,
          files: data.files || null,
          htmlCode: data.htmlCode,
          previewText: data.previewText,
          extractedData: data.extractedData || null,
          template: data.template,
          customAttributes: data.customAttributes || null,
          exactProductName: data.exactProductName,
          articleNumber: data.articleNumber,
          manufacturerArticleNumber: data.manufacturerArticleNumber,
        })
        .returning();

      if (!product) throw new Error('Failed to create product');

      return this.mapProduct(product);
    } else {
      // Use Supabase in production
      if (!supabaseAdmin) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
      }

      const projectData = await supabaseAdmin
        .from('projects')
        .select('tenant_id')
        .eq('id', projectId)
        .single();

      const { data: product, error} = await supabaseAdmin
        .from('products_in_projects')
        .insert({
          project_id: projectId,
          tenant_id: projectData.data?.tenant_id || null,
          name: data.name,
          files: data.files || null,
          html_code: data.htmlCode,
          preview_text: data.previewText,
          extracted_data: data.extractedData || null,
          template: data.template,
          custom_attributes: data.customAttributes || null,
          exact_product_name: data.exactProductName,
          article_number: data.articleNumber,
          manufacturer_article_number: data.manufacturerArticleNumber,
        })
        .select()
        .single();

      if (error || !product) throw new Error('Failed to create product');

      return this.mapProduct(product);
    }
  }

  async getProducts(projectId: string, userId?: string): Promise<ProductInProject[]> {
    const isDevelopment = process.env.NODE_ENV === 'development';

    const project = await this.getProject(projectId, userId);
    if (!project) return [];

    if (isDevelopment) {
      // Use Helium DB in development
      const products = await heliumDb
        .select()
        .from(productsInProjectsTable)
        .where(eq(productsInProjectsTable.projectId, projectId))
        .orderBy(desc(productsInProjectsTable.createdAt));

      return products.map((p: any) => this.mapProduct(p));
    } else {
      // Use Supabase in production
      if (!supabaseAdmin) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
      }

      const { data: products, error } = await supabaseAdmin
        .from('products_in_projects')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at');

      if (error || !products) return [];

      return products.map(p => this.mapProduct(p));
    }
  }

  async getProduct(id: string, userId?: string): Promise<ProductInProject | null> {
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (isDevelopment) {
      // Use Helium DB in development
      const [product] = await heliumDb
        .select()
        .from(productsInProjectsTable)
        .where(eq(productsInProjectsTable.id, id))
        .limit(1);

      if (!product) return null;

      if (userId) {
        const user = await this.getUserById(userId);
        if (!user) {
          console.warn(`[SECURITY] Invalid user ${userId} tried to access product ${id}`);
          return null;
        }
        
        if (!user.tenantId) {
          console.warn(`[SECURITY CRITICAL] User ${userId} has NO tenant_id - blocking ALL access`);
          return null;
        }
        
        if (!product.tenantId) {
          console.warn(`[SECURITY CRITICAL] Product ${id} has NO tenant_id - blocking access (needs backfill)`);
          return null;
        }
        
        if (user.tenantId !== product.tenantId) {
          console.warn(`[SECURITY] User ${userId} (org: ${user.tenantId}) tried to access product ${id} (org: ${product.tenantId})`);
          return null;
        }
      }

      return this.mapProduct(product);
    } else {
      // Use Supabase in production
      if (!supabaseAdmin) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
      }

      const { data: product, error } = await supabaseAdmin
        .from('products_in_projects')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !product) return null;

      if (userId) {
        const user = await this.getUserById(userId);
        if (!user) {
          console.warn(`[SECURITY] Invalid user ${userId} tried to access product ${id}`);
          return null;
        }
        
        if (!user.tenantId) {
          console.warn(`[SECURITY CRITICAL] User ${userId} has NO tenant_id - blocking ALL access`);
          return null;
        }
        
        if (!product.tenant_id) {
          console.warn(`[SECURITY CRITICAL] Product ${id} has NO tenant_id - blocking access (needs backfill)`);
          return null;
        }
        
        if (user.tenantId !== product.tenant_id) {
          console.warn(`[SECURITY] User ${userId} (org: ${user.tenantId}) tried to access product ${id} (org: ${product.tenant_id})`);
          return null;
        }
      }

      return this.mapProduct(product);
    }
  }

  async updateProduct(id: string, data: UpdateProductInProject, userId?: string): Promise<ProductInProject | null> {
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (userId) {
      const existingProduct = await this.getProduct(id, userId);
      if (!existingProduct) {
        console.warn(`[SECURITY] User ${userId} tried to update product ${id} from different org`);
        return null;
      }
    }

    if (isDevelopment) {
      // Use Helium DB in development
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.files !== undefined) updateData.files = data.files;
      if (data.htmlCode !== undefined) updateData.htmlCode = data.htmlCode;
      if (data.previewText !== undefined) updateData.previewText = data.previewText;
      if (data.extractedData !== undefined) updateData.extractedData = data.extractedData;
      if (data.template !== undefined) updateData.template = data.template;
      if (data.customAttributes !== undefined) updateData.customAttributes = data.customAttributes;
      if (data.exactProductName !== undefined) updateData.exactProductName = data.exactProductName;
      if (data.articleNumber !== undefined) updateData.articleNumber = data.articleNumber;
      if (data.pixi_status !== undefined) updateData.pixiStatus = data.pixi_status;
      if (data.pixi_ean !== undefined) updateData.pixiEan = data.pixi_ean;
      if (data.pixi_checked_at !== undefined) updateData.pixiCheckedAt = data.pixi_checked_at;

      const [product] = await heliumDb
        .update(productsInProjectsTable)
        .set(updateData)
        .where(eq(productsInProjectsTable.id, id))
        .returning();

      if (!product) return null;

      return this.mapProduct(product);
    } else {
      // Use Supabase in production
      if (!supabaseAdmin) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
      }

      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.files !== undefined) updateData.files = data.files;
      if (data.htmlCode !== undefined) updateData.html_code = data.htmlCode;
      if (data.previewText !== undefined) updateData.preview_text = data.previewText;
      if (data.extractedData !== undefined) updateData.extracted_data = data.extractedData;
      if (data.template !== undefined) updateData.template = data.template;
      if (data.customAttributes !== undefined) updateData.custom_attributes = data.customAttributes;
      if (data.exactProductName !== undefined) updateData.exact_product_name = data.exactProductName;
      if (data.articleNumber !== undefined) updateData.article_number = data.articleNumber;
      if (data.pixi_status !== undefined) updateData.pixi_status = data.pixi_status;
      if (data.pixi_ean !== undefined) updateData.pixi_ean = data.pixi_ean;
      if (data.pixi_checked_at !== undefined) updateData.pixi_checked_at = data.pixi_checked_at;

      const { data: product, error } = await supabaseAdmin
        .from('products_in_projects')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error || !product) return null;

      return this.mapProduct(product);
    }
  }

  async deleteProduct(id: string, userId?: string): Promise<boolean> {
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (userId) {
      const product = await this.getProduct(id, userId);
      if (!product) {
        console.warn(`[SECURITY] User ${userId} tried to delete product ${id} from different org`);
        return false;
      }
    }

    if (isDevelopment) {
      // Use Helium DB in development
      await heliumDb
        .delete(productsInProjectsTable)
        .where(eq(productsInProjectsTable.id, id));
      return true;
    } else {
      // Use Supabase in production
      if (!supabaseAdmin) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
      }

      const { error } = await supabaseAdmin
        .from('products_in_projects')
        .delete()
        .eq('id', id);

      return !error;
    }
  }

  async createTemplate(userId: string, data: { name: string; content: string; templateType?: string; productType?: string; isDefault?: boolean }): Promise<Template> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');

    // Use Drizzle (heliumDb) instead of Supabase client to avoid RLS issues
    const { templates } = await import('@shared/schema');
    
    const [template] = await heliumDb
      .insert(templates)
      .values({
        tenantId: user.tenantId || null,
        name: data.name,
        content: data.content,
        templateType: data.templateType || 'html_description',
        productType: data.productType || null,
        isDefault: data.isDefault || false,
      })
      .returning();

    if (!template) throw new Error('Failed to create template');

    return {
      id: template.id,
      name: template.name,
      content: template.content,
      templateType: template.templateType || 'html_description',
      productType: template.productType || null,
      isDefault: template.isDefault || false,
      createdAt: template.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: template.updatedAt?.toISOString() || new Date().toISOString(),
    };
  }

  async getTemplates(userId?: string): Promise<Template[]> {
    let tenantId: string | null = null;
    
    if (userId) {
      const user = await this.getUserById(userId);
      tenantId = user?.tenantId || null;
    }

    const query = supabase
      .from('templates')
      .select('*')
      .order('created_at');

    if (tenantId) {
      query.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
    } else {
      query.is('tenant_id', null);
    }

    const { data: templates, error } = await query;

    if (error || !templates) return [];

    return templates.map(t => ({
      id: t.id,
      name: t.name,
      content: t.content,
      templateType: t.template_type,
      productType: t.product_type,
      isDefault: t.is_default || false,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));
  }

  async getTemplate(id: string): Promise<Template | null> {
    const { data: template, error } = await supabase
      .from('templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !template) return null;

    return {
      id: template.id,
      name: template.name,
      content: template.content,
      templateType: template.template_type,
      productType: template.product_type,
      isDefault: template.is_default || false,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
    };
  }

  async updateTemplate(id: string, data: { name?: string; content?: string; templateType?: string; productType?: string; isDefault?: boolean }): Promise<Template | null> {
    const updateData: any = { updated_at: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.templateType !== undefined) updateData.template_type = data.templateType;
    if (data.productType !== undefined) updateData.product_type = data.productType;
    if (data.isDefault !== undefined) updateData.is_default = data.isDefault;

    const { data: template, error } = await supabase
      .from('templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !template) return null;

    return {
      id: template.id,
      name: template.name,
      content: template.content,
      templateType: template.template_type,
      productType: template.product_type,
      isDefault: template.is_default || false,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
    };
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('id', id);

    return !error;
  }

  async createSupplier(userId: string, data: CreateSupplier): Promise<Supplier> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');

    const insertData: any = {
      userId: userId,
      tenantId: user.tenantId || null,
      name: data.name,
      supplNr: data.supplNr || null,
      urlPattern: data.urlPattern || null,
      description: data.description || null,
      selectors: data.selectors || {},
      productLinkSelector: data.productLinkSelector || null,
      sessionCookies: encryptionService.encrypt(data.sessionCookies) || null,
      userAgent: data.userAgent || null,
      loginUrl: data.loginUrl || null,
      loginUsernameField: data.loginUsernameField || null,
      loginPasswordField: data.loginPasswordField || null,
      loginUsername: data.loginUsername || null,
      verifiedFields: data.verifiedFields || null,
      lastVerifiedAt: data.lastVerifiedAt || null,
    };

    // SECURITY: Encrypt password before storing
    if (data.loginPassword) {
      insertData.loginPassword = encryptionService.encrypt(data.loginPassword);
    }

    // CRITICAL: Use Helium DB with Drizzle (same as reads!)
    const [newSupplier] = await heliumDb
      .insert(suppliersTable)
      .values(insertData)
      .returning();

    if (!newSupplier) throw new Error('Failed to create supplier');

    return {
      id: newSupplier.id,
      name: newSupplier.name,
      supplNr: newSupplier.supplNr || undefined,
      urlPattern: newSupplier.urlPattern || undefined,
      description: newSupplier.description || undefined,
      selectors: newSupplier.selectors as any,
      productLinkSelector: newSupplier.productLinkSelector || undefined,
      sessionCookies: newSupplier.sessionCookies || undefined,
      userAgent: newSupplier.userAgent || undefined,
      loginUrl: newSupplier.loginUrl || undefined,
      loginUsernameField: newSupplier.loginUsernameField || undefined,
      loginPasswordField: newSupplier.loginPasswordField || undefined,
      loginUsername: newSupplier.loginUsername || undefined,
      verifiedFields: newSupplier.verifiedFields || undefined,
      lastVerifiedAt: newSupplier.lastVerifiedAt || undefined,
      createdAt: newSupplier.createdAt!,
      updatedAt: newSupplier.updatedAt!,
    };
  }

  async getSuppliers(userId: string): Promise<Supplier[]> {
    const user = await this.getUserById(userId);
    if (!user) {
      console.log('[getSuppliers] User not found:', userId);
      return [];
    }

    // CRITICAL: Use Helium DB with Drizzle
    let suppliers;
    if (user.tenantId) {
      console.log('[getSuppliers] Filtering by tenant_id:', user.tenantId);
      suppliers = await heliumDb
        .select()
        .from(suppliersTable)
        .where(eq(suppliersTable.tenantId, user.tenantId))
        .orderBy(suppliersTable.name);
    } else {
      console.log('[getSuppliers] Filtering by user_id:', userId);
      suppliers = await heliumDb
        .select()
        .from(suppliersTable)
        .where(eq(suppliersTable.userId, userId))
        .orderBy(suppliersTable.name);
    }

    console.log('[getSuppliers] Found suppliers:', suppliers.length);
    
    return suppliers.map((s: any) => ({
      id: s.id,
      userId: s.userId,
      tenantId: s.tenantId || undefined,
      name: s.name,
      supplNr: s.supplNr || undefined,
      urlPattern: s.urlPattern || undefined,
      description: s.description || undefined,
      selectors: s.selectors as any,
      productLinkSelector: s.productLinkSelector || undefined,
      sessionCookies: this.safeDecrypt(s.sessionCookies) || undefined,
      userAgent: s.userAgent || undefined,
      loginUrl: s.loginUrl || undefined,
      loginUsernameField: s.loginUsernameField || undefined,
      loginPasswordField: s.loginPasswordField || undefined,
      loginUsername: s.loginUsername || undefined,
      exportMappings: s.exportMappings as any || undefined,
      verifiedFields: s.verifiedFields || undefined,
      lastVerifiedAt: s.lastVerifiedAt || undefined,
      createdAt: s.createdAt!,
      updatedAt: s.updatedAt!,
    }));
  }

  async getSupplier(id: string): Promise<Supplier | null> {
    // Use Helium DB with Drizzle instead of Supabase to avoid RLS issues
    const [supplier] = await heliumDb
      .select()
      .from(suppliersTable)
      .where(eq(suppliersTable.id, id))
      .limit(1);

    if (!supplier) return null;

    return {
      id: supplier.id,
      tenantId: supplier.tenantId || undefined,
      name: supplier.name,
      supplNr: supplier.supplNr || undefined,
      urlPattern: supplier.urlPattern || undefined,
      description: supplier.description || undefined,
      selectors: supplier.selectors as any,
      productLinkSelector: supplier.productLinkSelector || undefined,
      sessionCookies: this.safeDecrypt(supplier.sessionCookies) || undefined,
      userAgent: supplier.userAgent || undefined,
      loginUrl: supplier.loginUrl || undefined,
      loginUsernameField: supplier.loginUsernameField || undefined,
      loginPasswordField: supplier.loginPasswordField || undefined,
      loginUsername: supplier.loginUsername || undefined,
      loginPassword: this.safeDecrypt(supplier.loginPassword) || undefined,
      verifiedFields: supplier.verifiedFields || undefined,
      lastVerifiedAt: supplier.lastVerifiedAt || undefined,
      createdAt: supplier.createdAt!,
      updatedAt: supplier.updatedAt!,
    };
  }

  async updateSupplier(id: string, data: UpdateSupplier): Promise<Supplier | null> {
    const updateData: any = { updated_at: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.supplNr !== undefined) updateData.suppl_nr = data.supplNr;
    if (data.urlPattern !== undefined) updateData.url_pattern = data.urlPattern;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.selectors !== undefined) updateData.selectors = data.selectors;
    if (data.productLinkSelector !== undefined) updateData.product_link_selector = data.productLinkSelector;
    if (data.sessionCookies !== undefined) updateData.session_cookies = data.sessionCookies ? encryptionService.encrypt(data.sessionCookies) : null;
    if (data.userAgent !== undefined) updateData.user_agent = data.userAgent;
    if (data.loginUrl !== undefined) updateData.login_url = data.loginUrl;
    if (data.loginUsernameField !== undefined) updateData.login_username_field = data.loginUsernameField;
    if (data.loginPasswordField !== undefined) updateData.login_password_field = data.loginPasswordField;
    if (data.loginUsername !== undefined) updateData.login_username = data.loginUsername;
    if (data.verifiedFields !== undefined) updateData.verified_fields = data.verifiedFields || null;
    if (data.lastVerifiedAt !== undefined) updateData.last_verified_at = data.lastVerifiedAt ? new Date(data.lastVerifiedAt) : null;
    if (data.sessionCookiesUpdatedAt !== undefined) updateData.session_cookies_updated_at = data.sessionCookiesUpdatedAt ? new Date(data.sessionCookiesUpdatedAt) : null;
    
    // SECURITY: Encrypt password before storing (only if explicitly provided and not empty)
    if (data.loginPassword !== undefined && data.loginPassword !== null && data.loginPassword.trim() !== '') {
      updateData.login_password = encryptionService.encrypt(data.loginPassword);
    }
    
    // Handle use_browser field
    if ((data as any).useBrowser !== undefined) {
      updateData.use_browser = (data as any).useBrowser;
    }

    console.log('[updateSupplier] updateData BEFORE DB write:', {
      has_login_url: !!updateData.login_url,
      has_login_username: !!updateData.login_username,
      has_login_password: !!updateData.login_password,
      login_password_length: updateData.login_password?.length || 0,
      has_login_username_field: !!updateData.login_username_field,
      has_login_password_field: !!updateData.login_password_field,
      updateData_keys: Object.keys(updateData),
      actual_values: {
        login_url: updateData.login_url,
        login_username: updateData.login_username,
        login_password: updateData.login_password?.substring(0, 20) + '...',
        login_username_field: updateData.login_username_field,
        login_password_field: updateData.login_password_field
      }
    });

    // CRITICAL FIX: Use camelCase (TypeScript property names), not snake_case (DB column names)!
    const directUpdate: any = {
      updatedAt: updateData.updated_at,              // updated_at → updatedAt
      name: updateData.name,
      supplNr: updateData.suppl_nr,                  // suppl_nr → supplNr
      urlPattern: updateData.url_pattern,            // url_pattern → urlPattern
      description: updateData.description,
      selectors: updateData.selectors,
      productLinkSelector: updateData.product_link_selector,  // product_link_selector → productLinkSelector
      loginUrl: updateData.login_url,                // login_url → loginUrl ✅
      loginUsernameField: updateData.login_username_field,    // login_username_field → loginUsernameField ✅
      loginPasswordField: updateData.login_password_field,    // login_password_field → loginPasswordField ✅
      loginUsername: updateData.login_username,      // login_username → loginUsername ✅
      loginPassword: updateData.login_password,      // login_password → loginPassword ✅
      useBrowser: updateData.use_browser,            // use_browser → useBrowser
      verifiedFields: updateData.verified_fields,    // verified_fields → verifiedFields
      lastVerifiedAt: updateData.last_verified_at,   // last_verified_at → lastVerifiedAt
    };

    // Remove undefined fields
    Object.keys(directUpdate).forEach(key => {
      if (directUpdate[key] === undefined) {
        delete directUpdate[key];
      }
    });

    console.log('[updateSupplier] directUpdate keys:', Object.keys(directUpdate));

    // Build the update query
    const updateQuery = heliumDb
      .update(suppliersTable)
      .set(directUpdate)
      .where(eq(suppliersTable.id, id))
      .returning();

    // Log the SQL that will be executed
    console.log('[updateSupplier] SQL Query:', updateQuery.toSQL());

    // CRITICAL: Use Helium DB with Drizzle (same as reads!)
    const [updatedSupplier] = await updateQuery;

    if (!updatedSupplier) return null;

    console.log('[updateSupplier] DB returned supplier fields:', {
      has_login_username: !!updatedSupplier.loginUsername,     // Use camelCase!
      has_login_password: !!updatedSupplier.loginPassword,     // Use camelCase!
      login_password_length: updatedSupplier.loginPassword?.length || 0,
      has_suppl_nr: !!updatedSupplier.supplNr,
      has_url_pattern: !!updatedSupplier.urlPattern
    });

    // Decrypt password for response (Drizzle returns camelCase property names)
    let decryptedPassword: string | undefined = undefined;
    if (updatedSupplier.loginPassword) {  // Use camelCase!
      decryptedPassword = this.safeDecrypt(updatedSupplier.loginPassword) || undefined;
      console.log('[updateSupplier] Password decryption:', {
        encrypted_length: updatedSupplier.loginPassword.length,
        decrypted_success: !!decryptedPassword,
        decrypted_length: decryptedPassword?.length || 0
      });
    }

    // Drizzle already returns camelCase property names (matches TypeScript schema)
    return {
      id: updatedSupplier.id,
      name: updatedSupplier.name,
      supplNr: updatedSupplier.supplNr || undefined,
      urlPattern: updatedSupplier.urlPattern || undefined,
      description: updatedSupplier.description || undefined,
      selectors: updatedSupplier.selectors as any,
      productLinkSelector: updatedSupplier.productLinkSelector || undefined,
      sessionCookies: updatedSupplier.sessionCookies || undefined,
      userAgent: updatedSupplier.userAgent || undefined,
      loginUrl: updatedSupplier.loginUrl || undefined,
      loginUsernameField: updatedSupplier.loginUsernameField || undefined,
      loginPasswordField: updatedSupplier.loginPasswordField || undefined,
      loginUsername: updatedSupplier.loginUsername || undefined,
      loginPassword: decryptedPassword, // Decrypted for display in edit form
      verifiedFields: updatedSupplier.verifiedFields as any,
      lastVerifiedAt: updatedSupplier.lastVerifiedAt || undefined,
      createdAt: updatedSupplier.createdAt!,
      updatedAt: updatedSupplier.updatedAt!,
    } as any;
  }

  async deleteSupplier(id: string): Promise<boolean> {
    // CRITICAL: Use Helium DB with Drizzle (same as reads!)
    await heliumDb
      .delete(suppliersTable)
      .where(eq(suppliersTable.id, id));

    return true;
  }

  async updateProductPixiStatus(productId: string, pixiData: {
    pixi_status: 'NEU' | 'VORHANDEN';
    pixi_ean: string | null;
    pixi_checked_at: string;
  }): Promise<boolean> {
    const { error } = await supabase
      .from('products_in_projects')
      .update({
        pixi_status: pixiData.pixi_status,
        pixi_ean: pixiData.pixi_ean,
        pixi_checked_at: pixiData.pixi_checked_at,
      })
      .eq('id', productId);

    return !error;
  }

  async batchUpdateProductsPixiStatus(updates: Array<{
    id: string;
    pixi_status: 'NEU' | 'VORHANDEN';
    pixi_ean: string | null;
    pixi_checked_at: string;
  }>): Promise<boolean> {
    try {
      const timestamp = new Date().toISOString();
      
      for (const update of updates) {
        const { error } = await supabase
          .from('products_in_projects')
          .update({
            pixi_status: update.pixi_status,
            pixi_ean: update.pixi_ean,
            pixi_checked_at: update.pixi_checked_at || timestamp,
          })
          .eq('id', update.id);

        if (error) {
          console.error(`[Supabase] Failed to update product ${update.id}:`, error);
          return false;
        }
      }

      console.log(`[Supabase] Successfully updated ${updates.length} products with Pixi status`);
      return true;
    } catch (error) {
      console.error('[Supabase] Batch update failed:', error);
      return false;
    }
  }

  private mapProduct(product: any): ProductInProject {
    // Support both snake_case (Supabase) and camelCase (Drizzle/Helium)
    return {
      id: product.id,
      projectId: product.projectId || product.project_id,
      name: product.name || undefined,
      files: product.files || undefined,
      htmlCode: product.htmlCode || product.html_code || undefined,
      previewText: product.previewText || product.preview_text || undefined,
      extractedData: product.extractedData || product.extracted_data || undefined,
      template: product.template || undefined,
      customAttributes: product.customAttributes || product.custom_attributes || undefined,
      exactProductName: product.exactProductName || product.exact_product_name || undefined,
      articleNumber: product.articleNumber || product.article_number || undefined,
      pixi_status: product.pixi_status || undefined,
      pixi_ean: product.pixi_ean || undefined,
      pixi_checked_at: product.pixi_checked_at || undefined,
      createdAt: product.createdAt?.toISOString?.() || product.created_at,
    };
  }

  private mapSupplier(supplier: any): Supplier {
    // SECURITY: DO NOT return decrypted password in API responses
    // Password is only decrypted internally when needed for login
    return {
      id: supplier.id,
      name: supplier.name,
      supplNr: supplier.suppl_nr || undefined,
      urlPattern: supplier.url_pattern || undefined,
      description: supplier.description || undefined,
      selectors: supplier.selectors || {},
      productLinkSelector: supplier.product_link_selector || undefined,
      sessionCookies: supplier.session_cookies || undefined,
      userAgent: supplier.user_agent || undefined,
      loginUrl: supplier.login_url || undefined,
      loginUsernameField: supplier.login_username_field || undefined,
      loginPasswordField: supplier.login_password_field || undefined,
      loginUsername: supplier.login_username || undefined,
      loginPassword: undefined, // SECURITY: Never expose password to clients
      verifiedFields: supplier.verified_fields ? JSON.parse(supplier.verified_fields) : undefined,
      lastVerifiedAt: supplier.last_verified_at || undefined,
      createdAt: supplier.created_at,
      updatedAt: supplier.updated_at,
    };
  }

  /**
   * Internal method to get supplier with decrypted password for login purposes
   * SECURITY: Only use this internally, never expose to API responses
   */
  async getSupplierWithCredentials(id: string): Promise<Supplier | null> {
    // Use Helium DB (development environment) - suppliers are stored there
    const suppliers = await heliumDb
      .select()
      .from(suppliersTable)
      .where(eq(suppliersTable.id, id))
      .limit(1);

    const supplier = suppliers[0];
    if (!supplier) {
      console.log(`[getSupplierWithCredentials] No supplier found in Helium for ID: ${id}`);
      return null;
    }

    // Decrypt password for internal use (Drizzle returns camelCase property names)
    let decryptedPassword: string | undefined = undefined;
    if (supplier.loginPassword) {  // Use camelCase!
      decryptedPassword = this.safeDecrypt(supplier.loginPassword) || undefined;
      console.log('[getSupplierWithCredentials] Decrypted password:', {
        encrypted_length: supplier.loginPassword.length,
        decrypted_success: !!decryptedPassword,
        decrypted_length: decryptedPassword?.length || 0
      });
    }

    // Drizzle returns camelCase property names (matches TypeScript schema)
    return {
      id: supplier.id,
      name: supplier.name,
      supplNr: supplier.supplNr || undefined,
      urlPattern: supplier.urlPattern || undefined,
      description: supplier.description || undefined,
      selectors: supplier.selectors || {},
      productLinkSelector: supplier.productLinkSelector || undefined,
      sessionCookies: supplier.sessionCookies || undefined,
      userAgent: supplier.userAgent || undefined,
      loginUrl: supplier.loginUrl || undefined,
      loginUsernameField: supplier.loginUsernameField || undefined,
      loginPasswordField: supplier.loginPasswordField || undefined,
      loginUsername: supplier.loginUsername || undefined,
      loginPassword: decryptedPassword, // Decrypted for internal use
      useBrowser: supplier.useBrowser || false,
      verifiedFields: supplier.verifiedFields as any,
      lastVerifiedAt: supplier.lastVerifiedAt || undefined,
      createdAt: supplier.createdAt,
      updatedAt: supplier.updatedAt,
    } as any;
  }

  // Tenant Management Methods
  async getAllTenants(): Promise<Tenant[]> {
    const tenants = await heliumDb.select().from(tenantsTable).orderBy(desc(tenantsTable.createdAt));

    return tenants.map((tenant: any) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      settings: tenant.settings as TenantSettings || {},
      createdAt: tenant.createdAt!,
      updatedAt: tenant.updatedAt!,
    }));
  }

  async getTenant(id: string): Promise<Tenant | null> {
    const tenants = await heliumDb.select().from(tenantsTable).where(eq(tenantsTable.id, id)).limit(1);
    const tenant = tenants[0];

    if (!tenant) return null;

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      settings: tenant.settings as TenantSettings || {},
      createdAt: tenant.createdAt!,
      updatedAt: tenant.updatedAt!,
    };
  }

  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    const tenants = await heliumDb.select().from(tenantsTable).where(eq(tenantsTable.slug, slug)).limit(1);
    const tenant = tenants[0];

    if (!tenant) return null;

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      settings: tenant.settings as TenantSettings || {},
      createdAt: tenant.createdAt!,
      updatedAt: tenant.updatedAt!,
    };
  }

  async createTenant(data: CreateTenant): Promise<Tenant> {
    // Generate slug from name if not provided
    const slug = data.slug || data.name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Default settings with all features enabled
    const defaultSettings: TenantSettings = {
      features: {
        pixiIntegration: false,
        sapIntegration: false,
        urlScraper: true,
        csvBulkImport: true,
        aiDescriptions: true,
      },
      erp: {
        type: null,
      },
      ...data.settings,
    };

    const result = await heliumDb.insert(tenantsTable).values({
      name: data.name,
      slug,
      settings: defaultSettings,
    }).returning();

    const tenant = result[0];

    if (!tenant) {
      throw new Error(`Failed to create tenant`);
    }

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      settings: tenant.settings as TenantSettings || {},
      createdAt: tenant.createdAt!,
      updatedAt: tenant.updatedAt!,
    };
  }

  async updateTenant(id: string, data: UpdateTenant): Promise<Tenant | null> {
    const updates: any = {
      updatedAt: new Date(),
    };

    if (data.name) updates.name = data.name;
    if (data.settings) updates.settings = data.settings;

    const result = await heliumDb
      .update(tenantsTable)
      .set(updates)
      .where(eq(tenantsTable.id, id))
      .returning();

    const tenant = result[0];

    if (!tenant) return null;

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      settings: tenant.settings as TenantSettings || {},
      createdAt: tenant.createdAt!,
      updatedAt: tenant.updatedAt!,
    };
  }

  async deleteTenant(id: string): Promise<boolean> {
    try {
      await heliumDb.delete(tenantsTable).where(eq(tenantsTable.id, id));
      return true;
    } catch (error) {
      return false;
    }
  }

  async getTenantStats(tenantId: string): Promise<{
    userCount: number;
    projectCount: number;
    supplierCount: number;
    subscriptionStatus?: string;
    planId?: string;
  }> {
    const { data: users } = await db
      .from('users')
      .select('id, subscription_status, plan_id')
      .eq('tenant_id', tenantId);

    const { data: projects } = await db
      .from('projects')
      .select('id')
      .eq('tenant_id', tenantId);

    const { data: suppliers } = await db
      .from('suppliers')
      .select('id')
      .eq('tenant_id', tenantId);

    const owner = users?.[0];

    return {
      userCount: users?.length || 0,
      projectCount: projects?.length || 0,
      supplierCount: suppliers?.length || 0,
      subscriptionStatus: owner?.subscription_status || 'trial',
      planId: owner?.plan_id || 'trial',
    };
  }
}

export const supabaseStorage = new SupabaseStorage();
