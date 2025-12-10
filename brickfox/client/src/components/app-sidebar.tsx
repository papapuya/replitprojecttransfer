import { Home, FileSpreadsheet, Globe, FolderOpen, Settings, Zap, Building2, User, CreditCard, LayoutDashboard, Crown, GitCompare, LogOut, ShoppingCart, Upload, Battery } from "lucide-react";
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
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";

const menuItems = [
  {
    title: "Home",
    url: "/",
    icon: Home,
  },
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "CSV Bulk Beschreibungen",
    url: "/csv-bulk-description",
    icon: Zap,
  },
  {
    title: "Meine Projekte",
    url: "/projects",
    icon: FolderOpen,
  },
  {
    title: "URL Webscraper",
    url: "/url-scraper",
    icon: Globe,
  },
  {
    title: "PDF/CSV Auto-Scraper",
    url: "/pdf-auto-scraper",
    icon: FileSpreadsheet,
  },
  {
    title: "Lieferanten-Profile",
    url: "/suppliers",
    icon: Building2,
  },
  {
    title: "Pixi Vergleich",
    url: "/pixi-compare",
    icon: GitCompare,
  },
  {
    title: "MediaMarkt Generator",
    url: "/mediamarkt-generator",
    icon: ShoppingCart,
  },
  {
    title: "CSV Parser",
    url: "/csv-parser",
    icon: Battery,
  },
  {
    title: "Mein Account",
    url: "/account",
    icon: User,
  },
  {
    title: "Abonnement",
    url: "/pricing",
    icon: CreditCard,
  },
  {
    title: "API Credentials",
    url: "/credentials",
    icon: Settings,
  },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { toast } = useToast();

  // Filter menu items based on tenant features
  const tenantFeatures = currentTenant?.settings?.features || {};
  const filteredMenuItems = menuItems.filter(item => {
    // Hide "Abonnement" and "API Credentials" for Super-Admins (they use Replit Secrets)
    if (item.url === '/pricing' || item.url === '/credentials') {
      return !user?.isAdmin;
    }
    
    // Always show these basic items
    if (['/', '/dashboard', '/projects', '/suppliers', '/account'].includes(item.url)) {
      return true;
    }
    
    // Show Pixi Compare only if tenant has pixiIntegration enabled
    if (item.url === '/pixi-compare') {
      return tenantFeatures.pixiIntegration === true;
    }
    
    // Show CSV Bulk if enabled (default: true)
    if (item.url === '/csv-bulk-description') {
      return tenantFeatures.csvBulkImport !== false;
    }
    
    // Show URL Scraper if enabled (default: true)
    if (item.url === '/url-scraper') {
      return tenantFeatures.urlScraper !== false;
    }
    
    // Show PDF Auto-Scraper if URL Scraper is enabled (uses same feature)
    if (item.url === '/pdf-auto-scraper') {
      return tenantFeatures.urlScraper !== false;
    }
    
    return true;
  });

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

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-border">
        <div>
          <h2 className="text-lg font-bold text-foreground">PIMPilot</h2>
          <p className="text-xs text-muted-foreground">Produktmanagement</p>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`sidebar-${item.url.replace('/', '')}`}
                  >
                    <Link href={item.url}>
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
