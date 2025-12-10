import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Users,
  TrendingUp,
  Building2,
  Plus,
  Search,
  Crown,
  Settings,
  Package,
  CheckCircle2,
  Truck,
  RefreshCcw,
  Bot,
  AlertCircle,
  Trash2,
  Database,
  Shield,
  FileText,
} from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import { queryClient } from '@/lib/queryClient';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';

interface TenantSettings {
  features: {
    pixiIntegration: boolean;
    sapIntegration: boolean;
    urlScraper: boolean;
    csvBulkImport: boolean;
    aiDescriptions: boolean;
  };
  erp: {
    type: string | null;
  };
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  settings: TenantSettings;
  userCount: number;
  projectCount: number;
  supplierCount: number;
  subscriptionStatus?: string;
  planId?: string;
  createdAt: string;
}

interface TenantsData {
  success: boolean;
  tenants: Tenant[];
}

interface KPIsData {
  success: boolean;
  kpis: {
    totalProducts: number;
    completenessPercentage: number;
    suppliers: {
      active: number;
      successful: number;
      error: number;
    };
    lastPixiSync: string;
    aiTextsToday: number;
  };
}

export default function AdminDashboard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [newTenantName, setNewTenantName] = useState('');
  const { toast } = useToast();

  const { data, isLoading } = useQuery<TenantsData>({
    queryKey: ['admin-tenants'],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch('/api/admin/tenants', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Zugriff verweigert - nur für Administratoren');
        }
        throw new Error('Failed to load tenants');
      }
      return res.json();
    },
  });

  const { data: kpisData } = useQuery<KPIsData>({
    queryKey: ['admin-kpis'],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch('/api/admin/kpis', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error('Failed to load KPIs');
      return res.json();
    },
  });

  const createTenantMutation = useMutation({
    mutationFn: async (name: string) => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create tenant');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Kunde angelegt',
        description: `${newTenantName} wurde erfolgreich erstellt!`,
      });
      setIsCreateDialogOpen(false);
      setNewTenantName('');
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['admin-kpis'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateTenantMutation = useMutation({
    mutationFn: async ({ id, settings }: { id: string; settings: TenantSettings }) => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update tenant');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Einstellungen gespeichert',
        description: `Einstellungen für ${selectedTenant?.name} wurden erfolgreich aktualisiert!`,
      });
      setIsSettingsDialogOpen(false);
      setSelectedTenant(null);
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteTenantMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete tenant');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Kunde gelöscht',
        description: `${tenantToDelete?.name} wurde erfolgreich gelöscht!`,
      });
      setIsDeleteDialogOpen(false);
      setTenantToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['admin-kpis'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteSelectedTenantsMutation = useMutation({
    mutationFn: async (tenantIds: string[]) => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch('/api/admin/tenants/bulk-delete', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenantIds }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete selected tenants');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Kunden gelöscht',
        description: `${data.deletedCount} Kunden wurden erfolgreich gelöscht!`,
      });
      setIsBulkDeleteDialogOpen(false);
      setSelectedTenantIds([]);
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['admin-kpis'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleOpenSettings = (tenant: Tenant) => {
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
    };

    setSelectedTenant({
      ...tenant,
      settings: {
        ...defaultSettings,
        ...tenant.settings,
        features: {
          ...defaultSettings.features,
          ...(tenant.settings?.features || {}),
        },
      },
    });
    setIsSettingsDialogOpen(true);
  };

  const handleToggleFeature = (feature: keyof TenantSettings['features']) => {
    if (!selectedTenant) return;
    
    setSelectedTenant({
      ...selectedTenant,
      settings: {
        ...selectedTenant.settings,
        features: {
          ...selectedTenant.settings.features,
          [feature]: !selectedTenant.settings.features[feature],
        },
      },
    });
  };

  const handleSaveSettings = () => {
    if (!selectedTenant) return;
    updateTenantMutation.mutate({
      id: selectedTenant.id,
      settings: selectedTenant.settings,
    });
  };

  const tenants = data?.tenants || [];
  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleTenant = (tenantId: string) => {
    setSelectedTenantIds(prev => 
      prev.includes(tenantId) 
        ? prev.filter(id => id !== tenantId)
        : [...prev, tenantId]
    );
  };

  const handleToggleAll = () => {
    if (selectedTenantIds.length === filteredTenants.length) {
      setSelectedTenantIds([]);
    } else {
      setSelectedTenantIds(filteredTenants.map(t => t.id));
    }
  };

  const isAllSelected = filteredTenants.length > 0 && selectedTenantIds.length === filteredTenants.length;

  const kpis = kpisData?.kpis;
  const lastPixiSync = kpis?.lastPixiSync ? new Date(kpis.lastPixiSync) : null;

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Crown className="h-8 w-8 text-amber-500" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              Admin Dashboard
            </h1>
          </div>
          <p className="text-gray-600">Systemübersicht und Kundenverwaltung</p>
        </div>
        
        <div className="flex gap-3">
          <Dialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                size="lg" 
                variant="destructive" 
                className="gap-2"
                disabled={selectedTenantIds.length === 0}
              >
                <Trash2 className="h-5 w-5" />
                Ausgewählte löschen ({selectedTenantIds.length})
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ausgewählte Kunden löschen?</DialogTitle>
                <DialogDescription>
                  Diese Aktion löscht die ausgewählten Kunden unwiderruflich.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <p className="font-semibold text-red-900">
                        Ausgewählte Kunden: {selectedTenantIds.length}
                      </p>
                      <p className="text-sm text-red-800">
                        Alle Kundendaten (User, Projekte, Lieferanten) werden unwiderruflich gelöscht.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsBulkDeleteDialogOpen(false)}
                >
                  Abbrechen
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteSelectedTenantsMutation.mutate(selectedTenantIds)}
                  disabled={deleteSelectedTenantsMutation.isPending}
                >
                  {deleteSelectedTenantsMutation.isPending ? 'Wird gelöscht...' : `${selectedTenantIds.length} Kunden löschen`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2">
                <Plus className="h-5 w-5" />
                Neuen Kunden anlegen
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neuen Kunden anlegen</DialogTitle>
              <DialogDescription>
                Legen Sie einen neuen Mandanten (z.B. AkkuShop.de, Sport2000) für Ihre SaaS-Plattform an.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="tenant-name">Kundenname</Label>
                <Input
                  id="tenant-name"
                  placeholder="z.B. AkkuShop.de oder Sport2000"
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                />
                <p className="text-xs text-gray-500">
                  Der Slug wird automatisch generiert (z.B. akkushop-de)
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  setNewTenantName('');
                }}
              >
                Abbrechen
              </Button>
              <Button
                onClick={() => createTenantMutation.mutate(newTenantName)}
                disabled={!newTenantName.trim() || createTenantMutation.isPending}
              >
                {createTenantMutation.isPending ? 'Wird erstellt...' : 'Kunde anlegen'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>

      {/* Enterprise Security Features Navigation */}
      <div className="mb-8">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-600" />
            Enterprise-Sicherheits-Features
          </h2>
          <p className="text-sm text-gray-600 mt-1">Verwalten Sie Backups, Berechtigungen und Audit-Logs</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/admin/backups">
            <Card className="hover:shadow-lg transition-all cursor-pointer border-indigo-100 hover:border-indigo-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-indigo-700">
                  <Database className="h-5 w-5" />
                  Backup-Management
                </CardTitle>
                <CardDescription>
                  Erstellen, wiederherstellen und verwalten Sie Daten-Backups mit Point-in-Time Recovery
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/admin/permissions">
            <Card className="hover:shadow-lg transition-all cursor-pointer border-purple-100 hover:border-purple-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-700">
                  <Shield className="h-5 w-5" />
                  Berechtigungen (RBAC)
                </CardTitle>
                <CardDescription>
                  Verwalten Sie Benutzer-Rollen und granulare Zugriffsrechte mit Scope-Kontrolle
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/admin/audit-logs">
            <Card className="hover:shadow-lg transition-all cursor-pointer border-amber-100 hover:border-amber-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-700">
                  <FileText className="h-5 w-5" />
                  Audit-Logs
                </CardTitle>
                <CardDescription>
                  Überwachen Sie alle CRUD-Operationen mit detaillierten Change-Logs und Filterung
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <Card className="border-blue-100 hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Produkte im System</CardTitle>
                <Package className="h-5 w-5 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {kpis?.totalProducts?.toLocaleString('de-DE') || 0}
                </div>
                <p className="text-xs text-gray-500 mt-1">Gesamt-Produkte</p>
              </CardContent>
            </Card>

            <Card className="border-green-100 hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Daten vollständig</CardTitle>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {kpis?.completenessPercentage || 0}%
                </div>
                <p className="text-xs text-gray-500 mt-1">Qualitätsscore</p>
              </CardContent>
            </Card>

            <Card className="border-amber-100 hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Lieferanten aktiv</CardTitle>
                <Truck className="h-5 w-5 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-600">{kpis?.suppliers.active || 0}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {kpis?.suppliers.successful || 0} OK
                  </span>
                  {(kpis?.suppliers.error || 0) > 0 && (
                    <span className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {kpis?.suppliers.error} Fehler
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-purple-100 hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Letzter Pixi-Sync</CardTitle>
                <RefreshCcw className="h-5 w-5 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-purple-600">
                  {lastPixiSync ? lastPixiSync.toLocaleDateString('de-DE') : '—'}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {lastPixiSync ? lastPixiSync.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : 'Noch kein Sync'}
                </p>
              </CardContent>
            </Card>

            <Card className="border-indigo-100 hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">KI-Texte heute</CardTitle>
                <Bot className="h-5 w-5 text-indigo-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-indigo-600">{kpis?.aiTextsToday || 0}</div>
                <p className="text-xs text-gray-500 mt-1">Generiert</p>
              </CardContent>
            </Card>
          </div>

          {/* Tenant Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Kunden-Übersicht</CardTitle>
                  <CardDescription>Alle Mandanten mit Details und Statistiken</CardDescription>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Kunden suchen..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-12">
                        <Checkbox 
                          checked={isAllSelected}
                          onCheckedChange={handleToggleAll}
                        />
                      </TableHead>
                      <TableHead className="font-semibold">Kundenname</TableHead>
                      <TableHead className="font-semibold">Slug</TableHead>
                      <TableHead className="font-semibold">Abo-Status</TableHead>
                      <TableHead className="font-semibold text-right">User</TableHead>
                      <TableHead className="font-semibold text-right">Projekte</TableHead>
                      <TableHead className="font-semibold text-right">Lieferanten</TableHead>
                      <TableHead className="font-semibold">Erstellt am</TableHead>
                      <TableHead className="font-semibold">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTenants.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                          {searchQuery ? 'Keine Kunden gefunden' : 'Noch keine Kunden angelegt'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTenants.map((tenant) => (
                        <TableRow key={tenant.id} className="hover:bg-gray-50">
                          <TableCell>
                            <Checkbox 
                              checked={selectedTenantIds.includes(tenant.id)}
                              onCheckedChange={() => handleToggleTenant(tenant.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-indigo-600" />
                              <div className="font-medium text-gray-900">{tenant.name}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-gray-50 text-gray-700 font-mono text-xs">
                              {tenant.slug}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {tenant.subscriptionStatus === 'active' ? (
                              <Badge className="bg-green-100 text-green-800 border-green-300">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                {tenant.planId === 'professional' ? 'Professional' : tenant.planId === 'enterprise' ? 'Enterprise' : 'Aktiv'}
                              </Badge>
                            ) : tenant.subscriptionStatus === 'trial' ? (
                              <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                                <Crown className="h-3 w-3 mr-1" />
                                Trial
                              </Badge>
                            ) : (
                              <Badge className="bg-gray-100 text-gray-800 border-gray-300">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                {tenant.subscriptionStatus || 'Unbekannt'}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {tenant.userCount}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {tenant.projectCount}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {tenant.supplierCount}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {new Date(tenant.createdAt).toLocaleDateString('de-DE')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => handleOpenSettings(tenant)}
                              >
                                <Settings className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  setTenantToDelete(tenant);
                                  setIsDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Settings Dialog */}
      <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-indigo-600" />
              Einstellungen für {selectedTenant?.name}
            </DialogTitle>
            <DialogDescription>
              Konfigurieren Sie welche Features für diesen Kunden verfügbar sind.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Feature-Flags
              </h3>
              
              {/* Pixi Integration */}
              <div className="flex items-center justify-between p-4 rounded-lg border bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">Pixi ERP Integration</div>
                  <p className="text-sm text-gray-500 mt-1">
                    Automatischer Produktabgleich mit Pixi ERP System
                  </p>
                </div>
                <Switch
                  checked={selectedTenant?.settings.features.pixiIntegration || false}
                  onCheckedChange={() => handleToggleFeature('pixiIntegration')}
                />
              </div>

              {/* SAP Integration */}
              <div className="flex items-center justify-between p-4 rounded-lg border bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">SAP Integration</div>
                  <p className="text-sm text-gray-500 mt-1">
                    Anbindung an SAP-Systeme für Datenimport/Export
                  </p>
                </div>
                <Switch
                  checked={selectedTenant?.settings.features.sapIntegration || false}
                  onCheckedChange={() => handleToggleFeature('sapIntegration')}
                />
              </div>

              {/* URL Scraper */}
              <div className="flex items-center justify-between p-4 rounded-lg border bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">URL Web-Scraper</div>
                  <p className="text-sm text-gray-500 mt-1">
                    Produktdaten von Lieferanten-Webseiten extrahieren
                  </p>
                </div>
                <Switch
                  checked={selectedTenant?.settings.features.urlScraper || false}
                  onCheckedChange={() => handleToggleFeature('urlScraper')}
                />
              </div>

              {/* CSV Bulk Import */}
              <div className="flex items-center justify-between p-4 rounded-lg border bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">CSV Massenimport</div>
                  <p className="text-sm text-gray-500 mt-1">
                    Große Mengen an Produkten via CSV hochladen
                  </p>
                </div>
                <Switch
                  checked={selectedTenant?.settings.features.csvBulkImport || false}
                  onCheckedChange={() => handleToggleFeature('csvBulkImport')}
                />
              </div>

              {/* AI Descriptions */}
              <div className="flex items-center justify-between p-4 rounded-lg border bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">KI-Produktbeschreibungen</div>
                  <p className="text-sm text-gray-500 mt-1">
                    Automatische Generierung von Produkttexten mit GPT-4o-mini
                  </p>
                </div>
                <Switch
                  checked={selectedTenant?.settings.features.aiDescriptions || false}
                  onCheckedChange={() => handleToggleFeature('aiDescriptions')}
                />
              </div>
            </div>

            {/* Summary */}
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="bg-indigo-600 text-white rounded p-1">
                  <Settings className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-indigo-900 mb-1">
                    Aktive Features
                  </h4>
                  <p className="text-xs text-indigo-700">
                    {Object.values(selectedTenant?.settings.features || {}).filter(Boolean).length} von 5 Features aktiviert
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsSettingsDialogOpen(false);
                setSelectedTenant(null);
              }}
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleSaveSettings}
              disabled={updateTenantMutation.isPending}
              className="gap-2"
            >
              {updateTenantMutation.isPending ? 'Wird gespeichert...' : 'Einstellungen speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Kunden löschen?
            </DialogTitle>
            <DialogDescription>
              Möchten Sie den Kunden <span className="font-semibold text-gray-900">{tenantToDelete?.name}</span> wirklich löschen?
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-3">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-red-900 mb-1">
                    Achtung: Diese Aktion kann nicht rückgängig gemacht werden!
                  </h4>
                  <p className="text-xs text-red-700">
                    Alle Daten dieses Kunden (User, Projekte, Produkte, Lieferanten) werden unwiderruflich gelöscht.
                  </p>
                </div>
              </div>
            </div>

            {tenantToDelete && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Anzahl User:</span>
                  <span className="font-medium">{tenantToDelete.userCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Anzahl Projekte:</span>
                  <span className="font-medium">{tenantToDelete.projectCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Anzahl Lieferanten:</span>
                  <span className="font-medium">{tenantToDelete.supplierCount}</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setTenantToDelete(null);
              }}
              disabled={deleteTenantMutation.isPending}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (tenantToDelete) {
                  deleteTenantMutation.mutate(tenantToDelete.id);
                }
              }}
              disabled={deleteTenantMutation.isPending}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {deleteTenantMutation.isPending ? 'Wird gelöscht...' : 'Endgültig löschen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
