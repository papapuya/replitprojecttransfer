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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Database, Download, Trash2, RefreshCcw, Clock, HardDrive } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface Backup {
  id: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  size_bytes: number;
  description: string | null;
  data: any;
}

export function AdminBackupManagement() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
  const { toast } = useToast();

  const { data: backups, isLoading } = useQuery<{ success: boolean; backups: Backup[] }>({
    queryKey: ['admin-backups'],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch('/api/backups', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        throw new Error('Failed to load backups');
      }
      return res.json();
    },
  });

  const createBackupMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch('/api/backups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ description: 'Manual Backup' }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create backup');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Backup erstellt',
        description: 'Das Backup wurde erfolgreich erstellt!',
      });
      setIsCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin-backups'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch(`/api/backups/${backupId}/restore`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to restore backup');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Backup wiederhergestellt',
        description: 'Die Daten wurden erfolgreich wiederhergestellt!',
      });
      setIsRestoreDialogOpen(false);
      setSelectedBackup(null);
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch(`/api/backups/${backupId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete backup');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Backup gelöscht',
        description: 'Das Backup wurde erfolgreich gelöscht!',
      });
      setIsDeleteDialogOpen(false);
      setSelectedBackup(null);
      queryClient.invalidateQueries({ queryKey: ['admin-backups'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd.MM.yyyy HH:mm', { locale: de });
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6" />
            Backup-Management
          </h2>
          <p className="text-muted-foreground mt-1">
            Verwalten Sie System-Backups für Datensicherheit und Wiederherstellung
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <HardDrive className="mr-2 h-4 w-4" />
          Backup erstellen
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Verfügbare Backups</CardTitle>
          <CardDescription>
            Point-in-Time Recovery für Business-Daten (30 Tage Retention)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Lade Backups...
            </div>
          ) : backups?.backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Keine Backups vorhanden
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Erstellt am</TableHead>
                  <TableHead>Beschreibung</TableHead>
                  <TableHead>Größe</TableHead>
                  <TableHead>Läuft ab</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups?.backups.map((backup) => (
                  <TableRow key={backup.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        {formatDate(backup.created_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {backup.description || 'Automatisches Backup'}
                    </TableCell>
                    <TableCell>{formatBytes(backup.size_bytes)}</TableCell>
                    <TableCell>{formatDate(backup.expires_at)}</TableCell>
                    <TableCell>
                      {isExpired(backup.expires_at) ? (
                        <Badge variant="destructive">Abgelaufen</Badge>
                      ) : (
                        <Badge variant="success" className="bg-green-500">Aktiv</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedBackup(backup);
                            setIsRestoreDialogOpen(true);
                          }}
                          disabled={isExpired(backup.expires_at)}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Wiederherstellen
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedBackup(backup);
                            setIsDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
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

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Backup erstellen</DialogTitle>
            <DialogDescription>
              Erstellt ein vollständiges Backup aller Geschäftsdaten (Users, Projects, Products, Suppliers, Templates, Permissions).
              Das Backup läuft automatisch nach 30 Tagen ab.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => createBackupMutation.mutate()}
              disabled={createBackupMutation.isPending}
            >
              {createBackupMutation.isPending ? (
                <>
                  <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                  Wird erstellt...
                </>
              ) : (
                <>
                  <HardDrive className="mr-2 h-4 w-4" />
                  Backup erstellen
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isRestoreDialogOpen} onOpenChange={setIsRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Backup wiederherstellen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion stellt alle Daten aus dem Backup vom{' '}
              <strong>{selectedBackup && formatDate(selectedBackup.created_at)}</strong> wieder her.
              {' '}Aktuelle Daten werden überschrieben. Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedBackup(null)}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedBackup && restoreBackupMutation.mutate(selectedBackup.id)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Wiederherstellen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Backup löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie das Backup vom{' '}
              <strong>{selectedBackup && formatDate(selectedBackup.created_at)}</strong> wirklich löschen?
              {' '}Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedBackup(null)}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedBackup && deleteBackupMutation.mutate(selectedBackup.id)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
