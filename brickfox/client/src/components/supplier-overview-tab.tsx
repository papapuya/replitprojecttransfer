import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle } from "lucide-react";

export interface Supplier {
  id: string;
  name: string;
  supplNr?: string;
  urlPattern?: string;
  description?: string;
  selectors: Record<string, string>;
  productLinkSelector?: string;
  sessionCookies?: string;
  userAgent?: string;
  loginUrl?: string;
  loginUsernameField?: string;
  loginPasswordField?: string;
  loginUsername?: string;
  loginPassword?: string;
  verifiedFields?: string[];
  lastVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface SupplierOverviewTabProps {
  supplier: Supplier;
  onUpdate: () => void;
}

export default function SupplierOverviewTab({ supplier }: SupplierOverviewTabProps) {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Grundinformationen</h3>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Name</dt>
            <dd className="mt-1 text-sm">{supplier.name}</dd>
          </div>
          
          {supplier.supplNr && (
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Lieferantennummer (Pixi)</dt>
              <dd className="mt-1 text-sm">{supplier.supplNr}</dd>
            </div>
          )}
          
          {supplier.urlPattern && (
            <div>
              <dt className="text-sm font-medium text-muted-foreground">URL-Muster</dt>
              <dd className="mt-1 text-sm font-mono text-xs">{supplier.urlPattern}</dd>
            </div>
          )}
          
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Erstellt am</dt>
            <dd className="mt-1 text-sm">
              {new Date(supplier.createdAt).toLocaleDateString('de-DE', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </dd>
          </div>
        </dl>
      </Card>

      {supplier.description && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-2">Beschreibung</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{supplier.description}</p>
        </Card>
      )}

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">CSS-Selektoren</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Anzahl konfigurierter Selektoren:</span>
            <Badge variant="secondary">{Object.keys(supplier.selectors).length}</Badge>
          </div>
          
          {supplier.verifiedFields && supplier.verifiedFields.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Verifizierte Felder:</span>
              <Badge variant="default" className="bg-green-600">
                <CheckCircle className="w-3 h-3 mr-1" />
                {supplier.verifiedFields.length}
              </Badge>
            </div>
          )}
          
          {supplier.lastVerifiedAt && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Zuletzt verifiziert:</span>
              <span className="text-sm text-muted-foreground">
                {new Date(supplier.lastVerifiedAt).toLocaleString('de-DE')}
              </span>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t">
          <p className="text-xs text-muted-foreground mb-2">Konfigurierte Felder:</p>
          <div className="flex flex-wrap gap-2">
            {Object.keys(supplier.selectors).map((field) => (
              <Badge
                key={field}
                variant={supplier.verifiedFields?.includes(field) ? "default" : "outline"}
                className={supplier.verifiedFields?.includes(field) ? "bg-green-600" : ""}
              >
                {field}
              </Badge>
            ))}
          </div>
        </div>
      </Card>

      {(supplier.sessionCookies || supplier.loginUrl) && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">🔐 Authentifizierung</h3>
          <div className="space-y-3">
            {supplier.sessionCookies && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground mb-1">Session Cookies</dt>
                <dd className="text-xs font-mono bg-muted p-2 rounded truncate">
                  {supplier.sessionCookies.substring(0, 100)}...
                </dd>
              </div>
            )}
            
            {supplier.loginUrl && (
              <>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground mb-1">Login-URL</dt>
                  <dd className="text-xs font-mono bg-muted p-2 rounded">{supplier.loginUrl}</dd>
                </div>
                
                {supplier.loginUsername && (
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground mb-1">Benutzername</dt>
                    <dd className="text-xs bg-muted p-2 rounded">{supplier.loginUsername}</dd>
                  </div>
                )}
                
                <Badge variant="secondary">Automatischer Login konfiguriert</Badge>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
