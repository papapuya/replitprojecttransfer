import { useState } from "react";
import { Home, FileSpreadsheet, Globe, FolderOpen, Zap, Building2, User, LayoutDashboard, GitCompare, LogOut, ShoppingCart, Scale, ChevronDown, ChevronRight, Store, Wrench, FileCode, DollarSign, Sparkles } from "lucide-react";
import { useLocation, Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// General menu items (not shop-specific)
const generalMenuItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
];

// Shop-specific configurations - each tool has its own project page
const shopMenus = [
  {
    id: "akku500",
    title: "Akku500",
    icon: Store,
    items: [
      { title: "CSV Bulk Beschreibungen", url: "/csv-bulk-description", icon: Zap, feature: "csvBulkImport", projectsUrl: "/csv-bulk-projects" },
      { title: "Alle Projekte", url: "/projects", icon: FolderOpen },
    ],
  },
  {
    id: "akkushop",
    title: "Akkushop.de",
    icon: Store,
    items: [
      { title: "Produkt Neuanlage", url: "", icon: Wrench, isHeader: true },
      { title: "URL Webscraper", url: "/url-scraper", icon: Globe, feature: "urlScraper", indent: true },
      { title: "PDF/CSV Auto-Scraper", url: "/pdf-auto-scraper", icon: FileSpreadsheet, feature: "urlScraper", indent: true },
      { title: "Alle Projekte", url: "/projects", icon: FolderOpen },
    ],
  },
];

// Tools menu items (not shop-specific)
const toolsMenuItems = [
  { title: "Lieferanten-Profile", url: "/suppliers", icon: Building2 },
  { title: "CSV Vergleich", url: "/csv-compare", icon: GitCompare },
  { title: "Attribut-Befüller", url: "/attribute-filler", icon: FileSpreadsheet },
  { title: "Pixi Vergleich", url: "/pixi-compare", icon: GitCompare, feature: "pixiIntegration" },
  { title: "MediaMarkt Generator", url: "/mediamarkt-generator", icon: ShoppingCart },
  { title: "Gewichte-Generator", url: "/weight-generator", icon: Scale },
  { title: "Text/Bild zu HTML", url: "/html-generator", icon: FileCode },
  { title: "Preisabgleich", url: "/price-matcher", icon: DollarSign },
  { title: "Akkushop Generator", url: "/akkushop-generator", icon: Zap },
  { title: "Beschreibungs-Analyse", url: "/description-analyzer", icon: FileSpreadsheet },
  { title: "Beschreibungs-Generator", url: "/desc-generator", icon: Sparkles },
  { title: "Brickfox Attribut-Tool", url: "/volt-fixer", icon: Zap },
  { title: "CSV-Reparatur", url: "/csv-repair", icon: Wrench },
];

// Account menu items
const accountMenuItems = [
  { title: "Mein Account", url: "/account", icon: User },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  
  // State for open shop dropdowns
  const [openShops, setOpenShops] = useState<Record<string, boolean>>({ akku500: true });

  const tenantFeatures = currentTenant?.settings?.features || {};

  // Helper to check if a feature is enabled
  const isFeatureEnabled = (feature?: string) => {
    if (!feature) return true;
    if (feature === "csvBulkImport") return tenantFeatures.csvBulkImport !== false;
    if (feature === "urlScraper") return tenantFeatures.urlScraper !== false;
    if (feature === "pixiIntegration") return tenantFeatures.pixiIntegration === true;
    return true;
  };

  // Filter tools based on features
  const filteredTools = toolsMenuItems.filter(item => isFeatureEnabled(item.feature));

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Logout fehlgeschlagen');
      return res.json();
    },
    onSuccess: () => {
      localStorage.removeItem('supabase_token');
      toast({
        title: 'Erfolgreich abgemeldet',
        description: 'Sie wurden abgemeldet.',
      });
      setLocation('/login');
    },
    onError: () => {
      toast({
        title: 'Fehler',
        description: 'Logout fehlgeschlagen',
        variant: 'destructive',
      });
    },
  });

  const toggleShop = (shopId: string) => {
    setOpenShops(prev => ({ ...prev, [shopId]: !prev[shopId] }));
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-border">
        <div>
          <h2 className="text-lg font-bold text-foreground">PIMPilot</h2>
          <p className="text-xs text-muted-foreground">Produktmanagement</p>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {/* General Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-indigo-600 font-bold">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {generalMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url} className="hover:bg-indigo-50 hover:text-indigo-600">
                    <Link href={item.url} className="text-gray-700">
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Shops with Dropdowns */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-indigo-600 font-bold">Shops</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {shopMenus.map((shop) => (
                <Collapsible
                  key={shop.id}
                  open={openShops[shop.id]}
                  onOpenChange={() => toggleShop(shop.id)}
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="w-full justify-between text-gray-700 hover:bg-indigo-50 hover:text-indigo-600">
                        <div className="flex items-center gap-2">
                          <shop.icon className="w-4 h-4" />
                          <span>{shop.title}</span>
                        </div>
                        {openShops[shop.id] ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {shop.items
                          .filter(item => isFeatureEnabled((item as any).feature))
                          .map((item: any) => (
                            <SidebarMenuSubItem key={item.title}>
                              {item.isHeader ? (
                                <div className="px-2 py-1 mt-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                  <item.icon className="w-3 h-3 inline mr-1" />
                                  {item.title}
                                </div>
                              ) : (
                                <>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={location === item.url || location === item.projectsUrl}
                                    className={item.indent ? "pl-6 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600" : "text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"}
                                  >
                                    <Link href={item.url}>
                                      <item.icon className="w-4 h-4" />
                                      <span>{item.title}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                  {item.projectsUrl && (
                                    <SidebarMenuSubButton
                                      asChild
                                      isActive={location === item.projectsUrl}
                                      className="pl-8 text-xs text-muted-foreground"
                                    >
                                      <Link href={item.projectsUrl}>
                                        <FolderOpen className="w-3 h-3" />
                                        <span>Projekte</span>
                                      </Link>
                                    </SidebarMenuSubButton>
                                  )}
                                </>
                              )}
                            </SidebarMenuSubItem>
                          ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Tools */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-indigo-600 font-bold">Werkzeuge</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredTools.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url} className="hover:bg-indigo-50 hover:text-indigo-600">
                    <Link href={item.url} className="text-gray-700">
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin */}
        {user?.isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-indigo-600 font-bold">Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === '/admin/dashboard'} className="hover:bg-indigo-50 hover:text-indigo-600">
                    <Link href="/admin/dashboard" className="text-gray-700">
                      <LayoutDashboard className="w-4 h-4" />
                      <span>Admin Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === '/admin/users'} className="hover:bg-indigo-50 hover:text-indigo-600">
                    <Link href="/admin/users" className="text-gray-700">
                      <User className="w-4 h-4" />
                      <span>Mitarbeiter</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Account */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-indigo-600 font-bold">Konto</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accountMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url} className="hover:bg-indigo-50 hover:text-indigo-600">
                    <Link href={item.url} className="text-gray-700">
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-border">
        <div className="space-y-3">
          {user && (
            <div className="flex items-center justify-between px-2 py-1">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user.email}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {user.isAdmin && (
                    <Badge variant="default" className="text-xs">
                      Admin
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <LogOut className="w-4 h-4 mr-2" />
            {logoutMutation.isPending ? 'Wird abgemeldet...' : 'Abmelden'}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
