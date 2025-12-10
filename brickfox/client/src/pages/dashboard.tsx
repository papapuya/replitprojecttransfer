import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import {
  BarChart,
  FileText,
  Package,
  Zap,
  Plus,
  Upload,
  Link as LinkIcon,
  ArrowRight
} from 'lucide-react';

interface DashboardStats {
  projectCount: number;
  productCount: number;
  apiCallsUsed: number;
  apiCallsLimit: number;
  planId: string;
  subscriptionStatus: string;
}

interface Project {
  id: string;
  name: string;
  createdAt: string;
}

interface DashboardData {
  stats: DashboardStats;
  recentProjects: Project[];
}

export default function Dashboard() {
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<{ success: boolean; stats: DashboardStats; recentProjects: Project[] }>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/stats', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load dashboard stats');
      return res.json();
    },
  });

  const stats = data?.stats;
  const recentProjects = data?.recentProjects || [];
  const usagePercentage = stats ? (stats.apiCallsUsed / stats.apiCallsLimit) * 100 : 0;

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent mb-2">
          Dashboard
        </h1>
        <p className="text-gray-600">Willkommen zurück! Hier ist Ihre Übersicht.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Projects Card */}
            <Card className="border-indigo-100 hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Projekte</CardTitle>
                <FileText className="h-4 w-4 text-indigo-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-indigo-600">{stats?.projectCount || 0}</div>
                <p className="text-xs text-gray-500 mt-1">Gesamt erstellt</p>
              </CardContent>
            </Card>

            {/* Products Card */}
            <Card className="border-violet-100 hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Produkte</CardTitle>
                <Package className="h-4 w-4 text-violet-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-violet-600">{stats?.productCount || 0}</div>
                <p className="text-xs text-gray-500 mt-1">Generierte Beschreibungen</p>
              </CardContent>
            </Card>

            {/* API Usage Card */}
            <Card className="border-indigo-100 hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">AI-Generierungen</CardTitle>
                <Zap className="h-4 w-4 text-indigo-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-indigo-600">
                  {stats?.apiCallsUsed || 0}
                  <span className="text-lg text-gray-400">/{stats?.apiCallsLimit || 500}</span>
                </div>
                <Progress value={usagePercentage} className="mt-2" />
                <p className="text-xs text-gray-500 mt-1">{usagePercentage.toFixed(0)}% genutzt</p>
              </CardContent>
            </Card>

            {/* Plan Card */}
            <Card className="border-violet-100 hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Aktueller Plan</CardTitle>
                <BarChart className="h-4 w-4 text-violet-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold capitalize text-violet-600">
                  {stats?.planId === 'trial' ? 'Trial' : stats?.planId || 'Free'}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Status: {stats?.subscriptionStatus === 'active' ? 'Aktiv' : stats?.subscriptionStatus || 'Trial'}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Quick Actions */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg">Schnellzugriff</CardTitle>
                <CardDescription>Starten Sie direkt mit der Arbeit</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  onClick={() => setLocation('/csv')}
                  className="w-full justify-start bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  CSV hochladen
                </Button>
                <Button
                  onClick={() => setLocation('/creator')}
                  variant="outline"
                  className="w-full justify-start border-indigo-200 hover:bg-indigo-50"
                >
                  <LinkIcon className="h-4 w-4 mr-2" />
                  URL scrapen
                </Button>
                <Button
                  onClick={() => setLocation('/projects')}
                  variant="outline"
                  className="w-full justify-start border-violet-200 hover:bg-violet-50"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Neues Projekt
                </Button>
              </CardContent>
            </Card>

            {/* Recent Projects */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Letzte Projekte</CardTitle>
                    <CardDescription>Ihre zuletzt erstellten Projekte</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLocation('/projects')}
                    className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                  >
                    Alle anzeigen
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {recentProjects.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-4">Noch keine Projekte erstellt</p>
                    <Button
                      onClick={() => setLocation('/projects')}
                      className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Erstes Projekt erstellen
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentProjects.map((project) => (
                      <div
                        key={project.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all cursor-pointer"
                        onClick={() => setLocation(`/projects/${project.id}`)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
                            <FileText className="h-5 w-5 text-indigo-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{project.name}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(project.createdAt).toLocaleDateString('de-DE')}
                            </p>
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
