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
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Shield, Users, Crown, Eye, Pencil, UserCog } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';

interface User {
  id: string;
  email: string;
  username: string | null;
  role: string;
  tenantId: string | null;
  createdAt: string;
}

interface Permission {
  id: string;
  userId: string;
  resource: string;
  action: string;
  scope: string;
  createdAt: string;
}

const ROLES = [
  { value: 'admin', label: 'Administrator', icon: Crown, color: 'text-yellow-500' },
  { value: 'editor', label: 'Editor', icon: Pencil, color: 'text-blue-500' },
  { value: 'viewer', label: 'Viewer', icon: Eye, color: 'text-gray-500' },
  { value: 'project_manager', label: 'Project Manager', icon: UserCog, color: 'text-purple-500' },
  { value: 'member', label: 'Member', icon: Users, color: 'text-green-500' },
];

const RESOURCES = ['users', 'projects', 'products', 'suppliers', 'templates', 'backups'];
const ACTIONS = ['create', 'read', 'update', 'delete'];
const SCOPES = ['all', 'own', 'team', 'none'];

export function AdminPermissionManagement() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isPermissionDialogOpen, setIsPermissionDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState('');
  const [newPermission, setNewPermission] = useState({
    resource: 'projects',
    action: 'read',
    scope: 'own',
  });
  const { toast } = useToast();

  const { data: users, isLoading: usersLoading } = useQuery<{ success: boolean; users: User[] }>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        throw new Error('Failed to load users');
      }
      return res.json();
    },
  });

  const { data: permissions, isLoading: permissionsLoading } = useQuery<{ success: boolean; permissions: Permission[] }>({
    queryKey: ['admin-permissions'],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch('/api/permissions', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        throw new Error('Failed to load permissions');
      }
      return res.json();
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch(`/api/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update role');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Rolle aktualisiert',
        description: 'Die Benutzerrolle wurde erfolgreich aktualisiert!',
      });
      setIsRoleDialogOpen(false);
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const createPermissionMutation = useMutation({
    mutationFn: async (permission: { userId: string; resource: string; action: string; scope: string }) => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch('/api/permissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(permission),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create permission');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Berechtigung erstellt',
        description: 'Die Berechtigung wurde erfolgreich erstellt!',
      });
      setIsPermissionDialogOpen(false);
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ['admin-permissions'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deletePermissionMutation = useMutation({
    mutationFn: async (permissionId: string) => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch(`/api/permissions/${permissionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete permission');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Berechtigung gelöscht',
        description: 'Die Berechtigung wurde erfolgreich gelöscht!',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-permissions'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const getRoleIcon = (role: string) => {
    const roleData = ROLES.find(r => r.value === role);
    if (!roleData) return Users;
    const Icon = roleData.icon;
    return <Icon className={`h-4 w-4 ${roleData.color}`} />;
  };

  const getRoleLabel = (role: string) => {
    return ROLES.find(r => r.value === role)?.label || role;
  };

  const getScopeBadgeVariant = (scope: string) => {
    switch (scope) {
      case 'all': return 'default';
      case 'own': return 'secondary';
      case 'team': return 'outline';
      default: return 'destructive';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6" />
          Berechtigungsverwaltung
        </h2>
        <p className="text-muted-foreground mt-1">
          Verwalten Sie Benutzerrollen und granulare Berechtigungen
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Benutzer & Rollen</CardTitle>
          <CardDescription>
            Weisen Sie Benutzern Rollen zu oder erstellen Sie spezifische Berechtigungen
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Lade Benutzer...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Benutzer</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Rolle</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {getRoleIcon(user.role)}
                        {user.username || 'Unbekannt'}
                      </div>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getRoleLabel(user.role)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.tenantId ? (
                        <Badge variant="secondary">Tenant-User</Badge>
                      ) : (
                        <Badge variant="outline">Kein Tenant</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user);
                            setNewRole(user.role);
                            setIsRoleDialogOpen(true);
                          }}
                        >
                          Rolle ändern
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user);
                            setIsPermissionDialogOpen(true);
                          }}
                        >
                          + Berechtigung
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom Permissions</CardTitle>
          <CardDescription>
            Granulare Berechtigungen die über Standard-Rollen hinausgehen
          </CardDescription>
        </CardHeader>
        <CardContent>
          {permissionsLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Lade Berechtigungen...
            </div>
          ) : permissions?.permissions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Keine Custom Permissions vorhanden
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Benutzer</TableHead>
                  <TableHead>Ressource</TableHead>
                  <TableHead>Aktion</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissions?.permissions.map((permission) => {
                  const user = users?.users.find(u => u.id === permission.userId);
                  return (
                    <TableRow key={permission.id}>
                      <TableCell className="font-medium">
                        {user?.username || user?.email || 'Unbekannt'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{permission.resource}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge>{permission.action}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getScopeBadgeVariant(permission.scope)}>
                          {permission.scope}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deletePermissionMutation.mutate(permission.id)}
                        >
                          Löschen
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rolle ändern</DialogTitle>
            <DialogDescription>
              Ändern Sie die Rolle für {selectedUser?.username || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rolle</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      <div className="flex items-center gap-2">
                        <role.icon className={`h-4 w-4 ${role.color}`} />
                        {role.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => selectedUser && updateRoleMutation.mutate({
                userId: selectedUser.id,
                role: newRole,
              })}
              disabled={updateRoleMutation.isPending}
            >
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPermissionDialogOpen} onOpenChange={setIsPermissionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Berechtigung hinzufügen</DialogTitle>
            <DialogDescription>
              Erstellen Sie eine spezifische Berechtigung für {selectedUser?.username || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Ressource</Label>
              <Select
                value={newPermission.resource}
                onValueChange={(value) => setNewPermission({ ...newPermission, resource: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCES.map(resource => (
                    <SelectItem key={resource} value={resource}>
                      {resource}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Aktion</Label>
              <Select
                value={newPermission.action}
                onValueChange={(value) => setNewPermission({ ...newPermission, action: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIONS.map(action => (
                    <SelectItem key={action} value={action}>
                      {action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select
                value={newPermission.scope}
                onValueChange={(value) => setNewPermission({ ...newPermission, scope: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map(scope => (
                    <SelectItem key={scope} value={scope}>
                      {scope}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPermissionDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => selectedUser && createPermissionMutation.mutate({
                userId: selectedUser.id,
                ...newPermission,
              })}
              disabled={createPermissionMutation.isPending}
            >
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
