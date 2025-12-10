import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './auth-context';
import type { TenantSettings } from '@shared/schema';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  settings: TenantSettings;
  userCount: number;
  projectCount: number;
  supplierCount: number;
  createdAt: string;
  updatedAt: string;
}

interface TenantContextType {
  currentTenant: Tenant | null;
  tenants: Tenant[];
  isLoading: boolean;
  switchTenant: (tenantId: string) => void;
  refetch: () => void;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);

  // Only true system admins can see tenant switcher (not regular tenant admins)
  const isSuperAdmin = user?.email === 'sarahzerrer@icloud.com';
  
  // Fetch all tenants (only for system admins)
  const { data: tenantsData, isLoading: tenantsLoading, refetch: refetchTenants } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: async () => {
      if (!isSuperAdmin) return { tenants: [] };
      
      const token = localStorage.getItem('supabase_token');
      const res = await fetch('/api/admin/tenants', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!res.ok) return { tenants: [] };
      return res.json();
    },
    enabled: isAuthenticated && isSuperAdmin,
  });

  // Fetch user's own tenant (for regular users)
  const { data: userTenantData, isLoading: userTenantLoading } = useQuery({
    queryKey: ['user-tenant'],
    queryFn: async () => {
      if (isSuperAdmin) return { tenant: null }; // System admins use tenant switcher
      
      const token = localStorage.getItem('supabase_token');
      const res = await fetch('/api/user/tenant', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!res.ok) return { tenant: null };
      return res.json();
    },
    enabled: isAuthenticated && !isSuperAdmin,
  });

  const isLoading = tenantsLoading || userTenantLoading;
  const tenants = tenantsData?.tenants || [];
  
  // For system admins: Auto-select first tenant if none selected
  useEffect(() => {
    if (isSuperAdmin && tenants.length > 0 && !currentTenantId) {
      const savedTenantId = localStorage.getItem('selected_tenant_id');
      if (savedTenantId && tenants.find((t: Tenant) => t.id === savedTenantId)) {
        setCurrentTenantId(savedTenantId);
      } else {
        setCurrentTenantId(tenants[0].id);
      }
    }
  }, [isSuperAdmin, tenants, currentTenantId]);

  // Determine current tenant based on user role
  let currentTenant: Tenant | null = null;
  if (isSuperAdmin) {
    // System admins use the tenant switcher
    currentTenant = tenants.find((t: Tenant) => t.id === currentTenantId) || null;
  } else {
    // Regular users use their assigned tenant
    currentTenant = userTenantData?.tenant || null;
  }

  const switchTenant = (tenantId: string) => {
    setCurrentTenantId(tenantId);
    localStorage.setItem('selected_tenant_id', tenantId);
  };

  const value: TenantContextType = {
    currentTenant,
    tenants,
    isLoading,
    switchTenant,
    refetch: refetchTenants,
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within TenantProvider');
  }
  return context;
}
