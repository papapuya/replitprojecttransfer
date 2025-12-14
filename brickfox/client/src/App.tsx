import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider } from "@/lib/auth-context";
import { TenantProvider } from "@/lib/tenant-context";
import { ProtectedRoute } from "@/components/protected-route";
import { AdminProtectedRoute } from "@/components/admin-protected-route";
import { SubscriptionBadge } from "@/components/subscription-badge";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { useAuth } from "@/lib/auth-context";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminBackups from "@/pages/admin-backups";
import AdminPermissions from "@/pages/admin-permissions";
import AdminAuditLogs from "@/pages/admin-audit-logs";
import CSVBulkDescription from "@/pages/csv-bulk-description";
import URLScraper from "@/pages/url-scraper";
import PDFAutoScraper from "@/pages/pdf-auto-scraper";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import CredentialsPage from "@/pages/credentials";
import Suppliers from "@/pages/suppliers";
import SupplierDetail from "@/pages/supplier-detail";
import PixiComparePage from "@/pages/pixi-compare";
import MediaMarktGeneratorPage from "@/pages/mediamarkt-generator";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Pricing from "@/pages/pricing";
import Contact from "@/pages/contact";
import Success from "@/pages/success";
import Account from "@/pages/account";
import NotFound from "@/pages/not-found";
import FieldMappingDemo from "@/pages/field-mapping-demo";
import WeightGenerator from "@/pages/weight-generator";
import PromptAssistant from "@/pages/prompt-assistant";

function Router() {
  return (
    <Switch>
      {/* Public routes - no sidebar */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/contact" component={Contact} />
      <Route path="/success" component={Success} />
      <Route path="/" component={Landing} />
      
      {/* Protected routes - with sidebar */}
      <Route path="/dashboard">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/dashboard">
        <AdminProtectedRoute>
          <AdminDashboard />
        </AdminProtectedRoute>
      </Route>
      <Route path="/admin/backups">
        <AdminProtectedRoute>
          <AdminBackups />
        </AdminProtectedRoute>
      </Route>
      <Route path="/admin/permissions">
        <AdminProtectedRoute>
          <AdminPermissions />
        </AdminProtectedRoute>
      </Route>
      <Route path="/admin/audit-logs">
        <AdminProtectedRoute>
          <AdminAuditLogs />
        </AdminProtectedRoute>
      </Route>
      <Route path="/csv-bulk-description">
        <ProtectedRoute>
          <CSVBulkDescription />
        </ProtectedRoute>
      </Route>
      <Route path="/url-scraper">
        <ProtectedRoute>
          <URLScraper />
        </ProtectedRoute>
      </Route>
      <Route path="/pdf-auto-scraper">
        <ProtectedRoute>
          <PDFAutoScraper />
        </ProtectedRoute>
      </Route>
      <Route path="/projects">
        <ProtectedRoute>
          <Projects />
        </ProtectedRoute>
      </Route>
      <Route path="/project/:id">
        <ProtectedRoute>
          <ProjectDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/suppliers">
        <ProtectedRoute>
          <Suppliers />
        </ProtectedRoute>
      </Route>
      <Route path="/suppliers/:id">
        <ProtectedRoute>
          <SupplierDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/pixi-compare">
        <ProtectedRoute>
          <PixiComparePage />
        </ProtectedRoute>
      </Route>
      <Route path="/mediamarkt-generator">
        <ProtectedRoute>
          <MediaMarktGeneratorPage />
        </ProtectedRoute>
      </Route>
      <Route path="/credentials">
        <ProtectedRoute>
          <CredentialsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/account">
        <ProtectedRoute>
          <Account />
        </ProtectedRoute>
      </Route>
      <Route path="/field-mapping-demo">
        <ProtectedRoute>
          <FieldMappingDemo />
        </ProtectedRoute>
      </Route>
      <Route path="/weight-generator">
        <ProtectedRoute>
          <WeightGenerator />
        </ProtectedRoute>
      </Route>
      <Route path="/prompt-assistant">
        <ProtectedRoute>
          <PromptAssistant />
        </ProtectedRoute>
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [location] = useLocation();
  const { user } = useAuth();
  
  // Public routes that should NOT show sidebar
  const publicRoutes = ['/', '/login', '/register', '/pricing', '/success'];
  const isPublicRoute = publicRoutes.includes(location);

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  if (isPublicRoute) {
    // Public layout - no sidebar
    return (
      <>
        <Router />
        <Toaster />
      </>
    );
  }

  // Protected layout - with sidebar
  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-4">
              {user?.isAdmin && <TenantSwitcher />}
              <SubscriptionBadge />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </div>
      </div>
      <Toaster />
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TenantProvider>
          <TooltipProvider>
            <AppContent />
          </TooltipProvider>
        </TenantProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
