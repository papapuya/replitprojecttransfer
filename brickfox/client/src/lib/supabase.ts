import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lxemqwvdaxzeldpjmxoc.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseAnonKey) {
  console.error('⚠️ VITE_SUPABASE_ANON_KEY is missing! Supabase Auth will not work.');
}

// Dynamic storage adapter that respects "Remember Me" preference
class DynamicStorage implements Storage {
  private getRememberMe(): boolean {
    const saved = localStorage.getItem('rememberMe');
    // Default to true if not set (matches login page default)
    return saved === null ? true : saved === 'true';
  }

  private getStorage(): Storage {
    return this.getRememberMe() ? localStorage : sessionStorage;
  }

  get length(): number {
    return this.getStorage().length;
  }

  key(index: number): string | null {
    return this.getStorage().key(index);
  }

  getItem(key: string): string | null {
    const rememberMe = this.getRememberMe();
    
    // Only read from the storage matching the current preference
    if (rememberMe) {
      return localStorage.getItem(key);
    } else {
      return sessionStorage.getItem(key);
    }
  }

  setItem(key: string, value: string): void {
    const storage = this.getStorage();
    const rememberMe = this.getRememberMe();
    
    // Write to the appropriate storage
    storage.setItem(key, value);
    
    // IMPORTANT: Clean up the OTHER storage to prevent token resurrection
    if (rememberMe) {
      sessionStorage.removeItem(key);
    } else {
      localStorage.removeItem(key);
    }
  }

  removeItem(key: string): void {
    // Remove from both storages to ensure cleanup
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }

  clear(): void {
    // Clear both storages
    localStorage.clear();
    sessionStorage.clear();
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: new DynamicStorage(),
    storageKey: 'sb-auth-token',
  },
});

