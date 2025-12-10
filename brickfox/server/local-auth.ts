import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './db';
import { users as usersTable, tenants as tenantsTable } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { Request, Response, NextFunction } from 'express';
import type { User } from '@shared/schema';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createLocalUser(email: string, password: string, options?: {
  username?: string;
  isAdmin?: boolean;
  tenantId?: string;
}): Promise<User> {
  const passwordHash = await hashPassword(password);
  
  const [user] = await db.insert(usersTable).values({
    email,
    passwordHash,
    username: options?.username || email.split('@')[0],
    isAdmin: options?.isAdmin || false,
    tenantId: options?.tenantId,
    role: options?.isAdmin ? 'admin' : 'member',
    subscriptionStatus: 'trial',
    planId: 'trial',
    apiCallsLimit: 50,
    apiCallsUsed: 0,
  }).returning();

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
    currentPeriodEnd: user.currentPeriodEnd?.toISOString() || undefined,
    apiCallsUsed: user.apiCallsUsed || 0,
    apiCallsLimit: user.apiCallsLimit || 50,
    createdAt: user.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: user.updatedAt?.toISOString() || new Date().toISOString(),
  };
}

export async function loginUser(email: string, password: string): Promise<User | null> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  
  if (!user || !user.passwordHash) {
    return null;
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

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
    currentPeriodEnd: user.currentPeriodEnd?.toISOString() || undefined,
    apiCallsUsed: user.apiCallsUsed || 0,
    apiCallsLimit: user.apiCallsLimit || 50,
    createdAt: user.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: user.updatedAt?.toISOString() || new Date().toISOString(),
  };
}

export async function getUserById(id: string): Promise<User | null> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  
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
    currentPeriodEnd: user.currentPeriodEnd?.toISOString() || undefined,
    apiCallsUsed: user.apiCallsUsed || 0,
    apiCallsLimit: user.apiCallsLimit || 50,
    createdAt: user.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: user.updatedAt?.toISOString() || new Date().toISOString(),
  };
}

export async function createAdminUser(email: string, password: string): Promise<void> {
  const existingUsers = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  
  if (existingUsers.length > 0) {
    console.log(`User ${email} already exists, updating to admin...`);
    const passwordHash = await hashPassword(password);
    await db.update(usersTable)
      .set({ 
        passwordHash, 
        isAdmin: true, 
        role: 'admin' 
      })
      .where(eq(usersTable.email, email));
    return;
  }

  let akkushopTenantId: string | undefined;
  const tenants = await db.select().from(tenantsTable).where(eq(tenantsTable.slug, 'akkushop')).limit(1);
  
  if (tenants.length === 0) {
    const [newTenant] = await db.insert(tenantsTable).values({
      name: 'AkkuShop',
      slug: 'akkushop',
      settings: {},
    }).returning();
    akkushopTenantId = newTenant.id;
    console.log('Created AkkuShop tenant');
  } else {
    akkushopTenantId = tenants[0].id;
  }

  await createLocalUser(email, password, {
    username: 'Admin',
    isAdmin: true,
    tenantId: akkushopTenantId,
  });

  console.log(`✅ Admin user created: ${email}`);
}

const sessions = new Map<string, { userId: string; expiresAt: Date }>();

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function createSession(userId: string): string {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  sessions.set(token, { userId, expiresAt });
  return token;
}

export function getSession(token: string): { userId: string } | null {
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    sessions.delete(token);
    return null;
  }
  return { userId: session.userId };
}

export function deleteSession(token: string): void {
  sessions.delete(token);
}

export function localAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    (req as any).user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];
  const session = getSession(token);

  if (!session) {
    (req as any).user = null;
    return next();
  }

  getUserById(session.userId)
    .then(user => {
      (req as any).user = user;
      next();
    })
    .catch(() => {
      (req as any).user = null;
      next();
    });
}
