import { useQuery } from '@tanstack/react-query';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Filter, Clock, User, Database } from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  changes: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  userEmail?: string;
}

export function AdminAuditLogViewer() {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [resourceFilter, setResourceFilter] = useState<string>('all');

  const { data: auditLogs, isLoading } = useQuery<{ success: boolean; logs: AuditLog[] }>({
    queryKey: ['admin-audit-logs'],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch('/api/audit-logs', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        throw new Error('Failed to load audit logs');
      }
      return res.json();
    },
  });

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd.MM.yyyy HH:mm:ss', { locale: de });
  };

  const getActionBadgeVariant = (action: string) => {
    switch (action) {
      case 'create':
      case 'backup_create':
        return 'default';
      case 'update':
        return 'secondary';
      case 'delete':
      case 'backup_delete':
        return 'destructive';
      case 'restore':
      case 'backup_restore':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const filteredLogs = auditLogs?.logs.filter(log => {
    const matchesSearch = 
      searchQuery === '' ||
      log.userEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.resourceType.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    const matchesResource = resourceFilter === 'all' || log.resourceType === resourceFilter;
    
    return matchesSearch && matchesAction && matchesResource;
  }) || [];

  const uniqueActions = [...new Set(auditLogs?.logs.map(log => log.action) || [])];
  const uniqueResources = [...new Set(auditLogs?.logs.map(log => log.resourceType) || [])];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" />
          Audit-Log-Viewer
        </h2>
        <p className="text-muted-foreground mt-1">
          Überwachen Sie alle CRUD-Operationen im System
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter & Suche</CardTitle>
          <CardDescription>
            Durchsuchen und filtern Sie Audit-Logs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Suche
              </label>
              <Input
                placeholder="Benutzer, Aktion, Ressource..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Aktion
              </label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Aktionen</SelectItem>
                  {uniqueActions.map(action => (
                    <SelectItem key={action} value={action}>
                      {action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4" />
                Ressource
              </label>
              <Select value={resourceFilter} onValueChange={setResourceFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Ressourcen</SelectItem>
                  {uniqueResources.map(resource => (
                    <SelectItem key={resource} value={resource}>
                      {resource}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit-Logs ({filteredLogs.length})</CardTitle>
          <CardDescription>
            Chronologische Übersicht aller Systemänderungen
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Lade Audit-Logs...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Keine Audit-Logs gefunden
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zeitpunkt</TableHead>
                    <TableHead>Benutzer</TableHead>
                    <TableHead>Aktion</TableHead>
                    <TableHead>Ressource</TableHead>
                    <TableHead>Ressource-ID</TableHead>
                    <TableHead>IP-Adresse</TableHead>
                    <TableHead>Änderungen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {formatDate(log.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {log.userEmail || 'System'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getActionBadgeVariant(log.action)}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {log.resourceType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.resourceId ? log.resourceId.substring(0, 8) + '...' : '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.ipAddress || '-'}
                      </TableCell>
                      <TableCell>
                        {log.changes ? (
                          <details className="cursor-pointer">
                            <summary className="text-sm text-blue-600 hover:underline">
                              Details anzeigen
                            </summary>
                            <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto max-w-sm">
                              {JSON.stringify(log.changes, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Statistiken</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Gesamt</p>
              <p className="text-2xl font-bold">{auditLogs?.logs.length || 0}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Heute</p>
              <p className="text-2xl font-bold">
                {auditLogs?.logs.filter(log => 
                  new Date(log.createdAt).toDateString() === new Date().toDateString()
                ).length || 0}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Create</p>
              <p className="text-2xl font-bold text-green-600">
                {auditLogs?.logs.filter(log => log.action.includes('create')).length || 0}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Delete</p>
              <p className="text-2xl font-bold text-red-600">
                {auditLogs?.logs.filter(log => log.action.includes('delete')).length || 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
