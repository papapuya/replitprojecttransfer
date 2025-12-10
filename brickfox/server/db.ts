import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as schema from "@shared/schema";

// Always use PostgreSQL (Supabase) - no more SQLite
neonConfig.webSocketConstructor = ws;

let db: any;
let pool: any = null;

async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  // Log connection info (mask password)
  const dbUrlMasked = process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@');
  console.log(`[Database] Connecting to: ${dbUrlMasked}`);
  
  // Detect environment
  const isHelium = process.env.DATABASE_URL.includes('helium');
  const isSupabase = process.env.DATABASE_URL.includes('supabase.co');
  const dbType = isHelium ? 'Helium (Development)' : isSupabase ? 'Supabase (Production)' : 'PostgreSQL';
  console.log(`[Database] Type: ${dbType}`);
  
  try {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle({ client: pool, schema });
    
    console.log(`✅ [Database] Connected successfully to ${dbType}`);
  } catch (error: any) {
    console.error(`❌ [Database] Connection failed to ${dbType}:`, error.message);
    
    // Detailed error logging
    if (error.code === 'ENOTFOUND') {
      console.error(`[Database] DNS resolution failed - host not found`);
      console.error(`[Database] Hint: Check if hostname is reachable from Replit environment`);
    } else if (error.code === 'ETIMEDOUT') {
      console.error(`[Database] Connection timeout - check firewall/network`);
      console.error(`[Database] Hint: Supabase port 5432 may be blocked, try port 6543 (pooler)`);
    } else if (error.message?.includes('SSL') || error.message?.includes('ssl')) {
      console.error(`[Database] SSL error - check sslmode parameter`);
      console.error(`[Database] Hint: Add ?sslmode=require for Supabase or ?sslmode=disable for Helium`);
    }
    
    throw error;
  }
}

// Initialize database
initializeDatabase();

export { db, pool };