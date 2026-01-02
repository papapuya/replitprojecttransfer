import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Users,
  Crown,
  Package,
  FolderOpen,
  Bot,
} from 'lucide-react';
import { Link } from 'wouter';

interface StatsData {
  success: boolean;
  stats: {
    totalUsers: number;
    totalProjects: number;
    totalProducts: number;
    aiTextsToday: number;
  };
}

export default function AdminDashboard() {
  const { data, isLoading } = useQuery<StatsData>({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch('/api/admin/stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Zugriff verweigert - nur für Administratoren');
        }
        throw new Error('Failed to load stats');
      }
      return res.json();
    },
    refetchInterval: 30000,
  });

  const stats = data?.stats;

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Crown className="h-8 w-8 text-indigo-600" />
          <h1 className="text-4xl font-bold text-indigo-600">
            Admin Dashboard
          </h1>
        </div>
        <p className="text-gray-600">Systemübersicht für Akkushop Brickfox</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card className="border-indigo-100 hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Mitarbeiter</CardTitle>
                <Users className="h-5 w-5 text-indigo-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-indigo-600">
                  {stats?.totalUsers || 0}
                </div>
                <p className="text-xs text-gray-500 mt-1">Registrierte Benutzer</p>
              </CardContent>
            </Card>

            <Card className="border-indigo-100 hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Projekte</CardTitle>
                <FolderOpen className="h-5 w-5 text-indigo-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-indigo-600">
                  {stats?.totalProjects || 0}
                </div>
                <p className="text-xs text-gray-500 mt-1">Gesamt</p>
              </CardContent>
            </Card>

            <Card className="border-indigo-100 hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Produkte</CardTitle>
                <Package className="h-5 w-5 text-indigo-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-indigo-600">
                  {stats?.totalProducts || 0}
                </div>
                <p className="text-xs text-gray-500 mt-1">Verarbeitet</p>
              </CardContent>
            </Card>

            <Card className="border-indigo-100 hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">KI-Texte heute</CardTitle>
                <Bot className="h-5 w-5 text-indigo-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-indigo-600">{stats?.aiTextsToday || 0}</div>
                <p className="text-xs text-gray-500 mt-1">Generiert</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link href="/admin/users">
              <Card className="hover:shadow-lg transition-all cursor-pointer border-indigo-100 hover:border-indigo-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-indigo-600">
                    <Users className="h-5 w-5" />
                    Mitarbeiterverwaltung
                  </CardTitle>
                  <CardDescription>
                    Benutzerkonten verwalten, Passwörter zurücksetzen und Statistiken einsehen
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
