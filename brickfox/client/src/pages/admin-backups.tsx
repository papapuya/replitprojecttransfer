import { AdminBackupManagement } from '@/components/admin-backup-management';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';

export default function AdminBackups() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-6">
        <Link href="/admin/dashboard">
          <Button variant="ghost" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Zurück zum Admin-Dashboard
          </Button>
        </Link>
      </div>
      <AdminBackupManagement />
    </div>
  );
}
