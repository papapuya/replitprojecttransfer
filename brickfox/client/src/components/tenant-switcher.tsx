import { Building2, Check, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/lib/tenant-context';

export function TenantSwitcher() {
  const { currentTenant, tenants, switchTenant, isLoading } = useTenant();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Lädt...</span>
      </div>
    );
  }

  if (!currentTenant || tenants.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 h-9">
          <Building2 className="h-4 w-4 text-indigo-600" />
          <span className="font-medium">{currentTenant.name}</span>
          <Badge variant="secondary" className="ml-1 text-xs">
            Aktiv
          </Badge>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Kunde wechseln</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tenants.map((tenant) => (
          <DropdownMenuItem
            key={tenant.id}
            onClick={() => switchTenant(tenant.id)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-500" />
              <div>
                <div className="font-medium">{tenant.name}</div>
                <div className="text-xs text-muted-foreground">
                  {tenant.userCount} User · {tenant.projectCount} Projekte
                </div>
              </div>
            </div>
            {currentTenant.id === tenant.id && (
              <Check className="h-4 w-4 text-indigo-600" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
