import { supabase, supabaseAdmin } from './supabase';
import { supabaseStorage } from './supabase-storage';
import type { Request, Response, NextFunction } from 'express';
import type { User } from '@shared/schema';

export async function getSupabaseUser(accessToken: string): Promise<User | null> {
  if (!supabaseAdmin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  }

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  
  if (error || !user) return null;

  // CRITICAL: Use supabaseStorage which queries Helium DB (local), not Supabase remote DB!
  const userData = await supabaseStorage.getUserById(user.id);

  if (!userData) {
    console.error(`[getSupabaseUser] No user data found in Helium DB for id: ${user.id}`);
    return null;
  }

  console.log(`[getSupabaseUser] User data from Helium DB:`, {
    id: userData.id,
    email: userData.email,
    tenant_id: userData.tenantId,
    role: userData.role,
    is_admin: userData.isAdmin
  });

  return userData;
}

export async function createAdminUser(email: string, password: string): Promise<void> {
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
      username: 'Admin',
      is_admin: true,
      role: 'admin',
      tenant_id: akkushopTenant?.id,
      subscription_status: 'trial',
      plan_id: 'trial',
      api_calls_limit: 50, // Trial limit: 50 calls per tool
      api_calls_used: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'id'
    });

  if (insertError) {
    throw new Error(`Failed to create user record: ${insertError.message}`);
  }

  console.log(`✅ Admin user created: ${email}`);
}

export function supabaseAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    (req as any).user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];

  getSupabaseUser(token)
    .then(user => {
      (req as any).user = user;
      next();
    })
    .catch(() => {
      (req as any).user = null;
      next();
    });
}
