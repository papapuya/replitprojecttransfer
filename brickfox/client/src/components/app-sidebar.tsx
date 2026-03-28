import { Zap, User, LogOut } from "lucide-react";
import { useLocation, Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
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
  { title: "Pipeline", url: "/pipeline", icon: Zap },
];

const accountItems = [
  { title: "Mein Account", url: "/account", icon: User },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

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
          <p className="text-xs text-muted-foreground">Produktdaten-Optimierung</p>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-indigo-600 font-bold">Werkzeuge</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
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

        <SidebarGroup>
          <SidebarGroupLabel className="text-indigo-600 font-bold">Konto</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accountItems.map((item) => (
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
