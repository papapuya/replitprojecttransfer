import { Router } from 'express';
import { db } from './db';
import { users, tenants } from '@shared/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

const router = Router();

// Database Webhook format (triggered on auth.users table changes)
interface SupabaseDatabaseWebhook {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: {
    id: string;
    email: string;
    created_at: string;
    updated_at?: string;
    raw_user_meta_data?: {
      username?: string;
      [key: string]: any;
    };
    [key: string]: any;
  } | null;
  old_record: any | null;
}

// Legacy format for test endpoint
interface SupabaseAuthEvent {
  type: 'user_created' | 'user_updated' | 'user_deleted';
  data: {
    id: string;
    email: string;
    created_at: string;
    updated_at?: string;
    user_metadata?: {
      username?: string;
      [key: string]: any;
    };
  };
}

/**
 * Webhook Signature Verification for Database Webhooks
 * Simple shared-secret approach: X-Supabase-Signature header must match secret
 * 
 * Note: Supabase Database Webhooks don't natively generate HMAC signatures.
 * This uses a simple shared-secret header that you configure in the webhook.
 */
function verifyWebhookSignature(signature: string | undefined, secret: string): boolean {
  if (!signature) {
    console.warn('[Webhook] No signature provided');
    return false;
  }

  // Simple string comparison with timing-safe function
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(secret)
    );
  } catch (error) {
    console.error('[Webhook] Signature comparison failed:', error);
    return false;
  }
}

/**
 * Get or create AkkuShop tenant
 */
async function getOrCreateAkkuShopTenant(): Promise<string> {
  // Try to find existing tenant
  const existingTenant = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, 'akkushop'))
    .limit(1);

  if (existingTenant.length > 0) {
    return existingTenant[0].id;
  }

  // Create new tenant
  console.log('[Webhook] Creating AkkuShop tenant');
  const newTenant = await db
    .insert(tenants)
    .values({
      name: 'AkkuShop',
      slug: 'akkushop',
      settings: {
        default_categories: ['battery', 'charger', 'tool', 'gps', 'drone', 'camera'],
        mediamarkt_title_format: 'Kategorie + Artikelnummer'
      }
    })
    .returning();

  return newTenant[0].id;
}

/**
 * Handle database INSERT event (user created in auth.users)
 */
async function handleUserInsert(record: SupabaseDatabaseWebhook['record']) {
  if (!record) {
    throw new Error('No record provided');
  }

  const { id, email, created_at, raw_user_meta_data } = record;
  
  console.log(`[Webhook] Creating user in Helium DB: ${email}`);

  // Get tenant ID from user metadata (set during registration)
  // If not present, fall back to AkkuShop for backward compatibility
  let tenantId: string;
  if (raw_user_meta_data?.tenant_id) {
    tenantId = raw_user_meta_data.tenant_id;
    console.log(`[Webhook] Using tenant from user metadata: ${tenantId} (${raw_user_meta_data.company_name || 'Unknown'})`);
  } else {
    console.warn(`[Webhook] No tenant_id in user metadata, falling back to AkkuShop (legacy user)`);
    tenantId = await getOrCreateAkkuShopTenant();
  }

  // Check if user already exists
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (existingUser.length > 0) {
    console.log(`[Webhook] User ${email} already exists, skipping creation`);
    return {
      status: 'skipped',
      reason: 'User already exists',
      user_id: id
    };
  }

  // Create user in Helium DB
  // First user of a new tenant becomes admin
  const isFirstUserOfTenant = await db
    .select()
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .limit(1);

  const isAdmin = isFirstUserOfTenant.length === 0; // First user = admin

  await db.insert(users).values({
    id,
    email,
    username: raw_user_meta_data?.username || email.split('@')[0],
    tenantId,
    isAdmin,
    role: isAdmin ? 'admin' : 'member',
    subscriptionStatus: 'trial',
    planId: 'trial',
    apiCallsLimit: 50,
    apiCallsUsed: 0,
    createdAt: new Date(created_at),
    updatedAt: new Date(created_at),
  });

  console.log(`✅ [Webhook] User ${email} created successfully in Helium DB`);
  console.log(`   - Tenant: ${tenantId}`);
  console.log(`   - Role: ${isAdmin ? 'admin (first user)' : 'member'}`);

  return {
    status: 'success',
    action: 'user_insert',
    user_id: id,
    email,
    tenant_id: tenantId,
    is_admin: isAdmin
  };
}

/**
 * Handle database UPDATE event (user updated in auth.users)
 */
async function handleUserUpdate(record: SupabaseDatabaseWebhook['record']) {
  if (!record) {
    throw new Error('No record provided');
  }

  const { id, email, raw_user_meta_data } = record;
  
  console.log(`[Webhook] Updating user in Helium DB: ${email}`);

  // Update user in Helium DB
  await db
    .update(users)
    .set({
      email,
      username: raw_user_meta_data?.username,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id));

  console.log(`✅ [Webhook] User ${email} updated successfully`);

  return {
    status: 'success',
    action: 'user_update',
    user_id: id,
    email
  };
}

/**
 * Handle database DELETE event (user deleted from auth.users)
 */
async function handleUserDelete(old_record: any) {
  const { id, email } = old_record;
  
  console.log(`[Webhook] Soft-deleting user in Helium DB: ${email}`);

  // Soft delete: Update status instead of hard delete
  // Note: We don't have a 'status' field yet, so we could add it or just log
  // For now, we'll just log the deletion
  console.log(`⚠️ [Webhook] User deletion logged but not implemented: ${email}`);

  return {
    status: 'success',
    action: 'user_delete',
    user_id: id,
    email,
    note: 'Logged but not deleted from Helium DB'
  };
}

/**
 * LEGACY: Handle user_created event (for test endpoint)
 */
async function handleUserCreated(event: SupabaseAuthEvent) {
  const { id, email, created_at, user_metadata } = event.data;
  
  console.log(`[Webhook] Creating user in Helium DB: ${email}`);

  // Get tenant ID
  const tenantId = await getOrCreateAkkuShopTenant();

  // Check if user already exists
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (existingUser.length > 0) {
    console.log(`[Webhook] User ${email} already exists, skipping creation`);
    return {
      status: 'skipped',
      reason: 'User already exists',
      user_id: id
    };
  }

  // Create user in Helium DB
  await db.insert(users).values({
    id,
    email,
    username: user_metadata?.username || email.split('@')[0],
    tenantId,
    isAdmin: false,
    role: 'member',
    subscriptionStatus: 'trial',
    planId: 'trial',
    apiCallsLimit: 50,
    apiCallsUsed: 0,
    createdAt: new Date(created_at),
    updatedAt: new Date(created_at),
  });

  console.log(`✅ [Webhook] User ${email} created successfully in Helium DB`);

  return {
    status: 'success',
    action: 'user_created',
    user_id: id,
    email,
    tenant_id: tenantId
  };
}

/**
 * Handle user_updated event
 */
async function handleUserUpdated(event: SupabaseAuthEvent) {
  const { id, email, user_metadata } = event.data;
  
  console.log(`[Webhook] Updating user in Helium DB: ${email}`);

  // Update user in Helium DB
  await db
    .update(users)
    .set({
      email,
      username: user_metadata?.username,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id));

  console.log(`✅ [Webhook] User ${email} updated successfully`);

  return {
    status: 'success',
    action: 'user_updated',
    user_id: id,
    email
  };
}

/**
 * Handle user_deleted event
 */
async function handleUserDeleted(event: SupabaseAuthEvent) {
  const { id, email } = event.data;
  
  console.log(`[Webhook] Soft-deleting user in Helium DB: ${email}`);

  // Soft delete: Update status instead of hard delete
  // Note: We don't have a 'status' field yet, so we could add it or just log
  // For now, we'll just log the deletion
  console.log(`⚠️ [Webhook] User deletion logged but not implemented: ${email}`);

  return {
    status: 'success',
    action: 'user_deleted',
    user_id: id,
    email,
    note: 'Logged but not deleted from Helium DB'
  };
}

/**
 * Webhook endpoint for Supabase Database Webhooks
 * POST /api/webhooks/supabase-auth
 * 
 * Handles INSERT/UPDATE/DELETE events from auth.users table
 */
router.post('/supabase-auth', async (req, res) => {
  try {
    const signature = req.headers['x-supabase-signature'] as string | undefined;
    
    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.SUPABASE_WEBHOOK_SECRET;
    if (webhookSecret) {
      const isValid = verifyWebhookSignature(signature, webhookSecret);
      if (!isValid) {
        console.error('[Webhook] Invalid signature');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    } else {
      console.warn('[Webhook] No SUPABASE_WEBHOOK_SECRET configured - skipping signature verification');
    }

    const webhook = req.body as SupabaseDatabaseWebhook;
    
    // Validate webhook is from auth.users table
    if (webhook.schema !== 'auth' || webhook.table !== 'users') {
      console.warn(`[Webhook] Unexpected table: ${webhook.schema}.${webhook.table}`);
      return res.status(400).json({ error: 'Webhook must be from auth.users table' });
    }

    console.log(`[Webhook] Received ${webhook.type} event for user ${webhook.record?.email || 'unknown'}`);

    let result;
    switch (webhook.type) {
      case 'INSERT':
        if (!webhook.record) {
          return res.status(400).json({ error: 'No record provided for INSERT' });
        }
        result = await handleUserInsert(webhook.record);
        break;
      
      case 'UPDATE':
        if (!webhook.record) {
          return res.status(400).json({ error: 'No record provided for UPDATE' });
        }
        result = await handleUserUpdate(webhook.record);
        break;
      
      case 'DELETE':
        if (!webhook.old_record) {
          return res.status(400).json({ error: 'No old_record provided for DELETE' });
        }
        result = await handleUserDelete(webhook.old_record);
        break;
      
      default:
        console.warn(`[Webhook] Unknown event type: ${webhook.type}`);
        return res.status(400).json({ error: `Unknown event type: ${webhook.type}` });
    }

    return res.json({
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Webhook] Error processing event:', error);
    return res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * TEST endpoint - Simulate Supabase Auth webhook locally
 * POST /api/webhooks/supabase-auth-test
 */
router.post('/supabase-auth-test', async (req, res) => {
  try {
    const { email, userId } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    console.log(`[Webhook Test] Simulating user_created event for ${email}`);

    const event: SupabaseAuthEvent = {
      type: 'user_created',
      data: {
        id: userId || crypto.randomUUID(),
        email,
        created_at: new Date().toISOString(),
        user_metadata: {
          username: email.split('@')[0]
        }
      }
    };

    const result = await handleUserCreated(event);

    return res.json({
      ...result,
      timestamp: new Date().toISOString(),
      note: 'This was a test webhook call'
    });

  } catch (error) {
    console.error('[Webhook Test] Error:', error);
    return res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
