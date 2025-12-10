import { createContext, useContext, ReactNode, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

interface User {
  id: string;
  email: string;
  username?: string;
  isAdmin: boolean;
  tenantId?: string;
  subscriptionStatus?: string;
  planId?: string;
  apiCallsUsed: number;
  apiCallsLimit: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Helper to get the correct storage based on rememberMe preference
  const getTokenStorage = () => {
    const saved = localStorage.getItem('rememberMe');
    // Default to true if not set (matches login page default and DynamicStorage)
    const rememberMe = saved === null ? true : saved === 'true';
    return rememberMe ? localStorage : sessionStorage;
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['/api/auth/user'],
    queryFn: async () => {
      // Check for local admin token first
      const storage = getTokenStorage();
      let token = storage.getItem('supabase_token') || localStorage.getItem('supabase_token');
      
      // If no token, use local admin fallback
      if (!token) {
        // Try Supabase session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session) {
          // Use local admin fallback token if no Supabase session
          token = 'local-admin-token-pimpilot-dev';
          console.log('[AUTH] Using local admin fallback token');
        } else {
          token = session.access_token;
        }
      }

      // Store token in the correct storage
      const storage2 = getTokenStorage();
      const otherStorage = storage2 === localStorage ? sessionStorage : localStorage;
      
      storage2.setItem('supabase_token', token);
      otherStorage.removeItem('supabase_token');
      
      // Fetch user data from backend
      const res = await fetch('/api/auth/user', { 
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!res.ok) {
        // Only clear on actual 401 errors, not other failures
        if (res.status === 401) {
          localStorage.removeItem('supabase_token');
          sessionStorage.removeItem('supabase_token');
        }
        return { user: null };
      }
      
      return res.json();
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Listen for auth changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.access_token) {
          const storage = getTokenStorage();
          const otherStorage = storage === localStorage ? sessionStorage : localStorage;
          
          storage.setItem('supabase_token', session.access_token);
          otherStorage.removeItem('supabase_token'); // Clean up other storage
          refetch();
        }
      } else if (event === 'SIGNED_OUT') {
        // Remove token from both storages
        localStorage.removeItem('supabase_token');
        sessionStorage.removeItem('supabase_token');
        refetch();
      }
    });

    return () => subscription.unsubscribe();
  }, [refetch]);

  const value: AuthContextType = {
    user: data?.user || null,
    isLoading,
    isAuthenticated: !!data?.user,
    refetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
