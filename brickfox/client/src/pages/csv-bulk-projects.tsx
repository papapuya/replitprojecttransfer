import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FolderOpen, Trash2, Calendar, FileSpreadsheet, Package, ArrowLeft } from "lucide-react";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { Project } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function CSVBulkProjects() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: projectsData, isLoading } = useQuery<{ success: boolean; projects: Project[] }>({
    queryKey: ['/api/projects'],
  });

  const allProjects = projectsData?.projects || [];
  const csvBulkProjects = allProjects.filter(p => p.sourceType === 'csv-bulk');

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({
        title: "Projekt gelöscht",
        description: "Das Projekt wurde erfolgreich gelöscht.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message || "Projekt konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (confirm("Möchten Sie dieses Projekt wirklich löschen? Alle Produkte im Projekt werden ebenfalls gelöscht.")) {
      deleteProjectMutation.mutate(projectId);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/csv-bulk-description">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                <FileSpreadsheet className="w-8 h-8 text-primary" />
                CSV Bulk Projekte
              </h1>
              <p className="text-muted-foreground mt-1">
                Ihre gespeicherten CSV Bulk Beschreibungs-Projekte
              </p>
            </div>
          </div>
          
          <Button asChild>
            <Link href="/csv-bulk-description">
              <Plus className="w-4 h-4 mr-2" />
              Neues CSV Bulk Projekt
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="space-y-3">
                  <div className="h-5 bg-muted rounded w-3/4"></div>
                  <div className="h-4 bg-muted rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-4 bg-muted rounded w-full"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : csvBulkProjects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileSpreadsheet className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Noch keine CSV Bulk Projekte</h3>
              <p className="text-muted-foreground text-center mb-6">
                Erstellen Sie Beschreibungen im CSV Bulk Tool und speichern Sie sie als Projekt
              </p>
              <Button asChild>
                <Link href="/csv-bulk-description">
                  <Plus className="w-4 h-4 mr-2" />
                  Zum CSV Bulk Tool
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {csvBulkProjects.map((project) => (
              <Card
                key={project.id}
                className="hover-elevate active-elevate-2 cursor-pointer transition-all"
                onClick={() => setLocation(`/csv-bulk-project/${project.id}`)}
              >
                <CardHeader className="space-y-0 pb-3">
                  <CardTitle className="text-xl flex items-start justify-between gap-2">
                    <span className="line-clamp-2">{project.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0 h-8 w-8"
                      onClick={(e) => handleDeleteProject(e, project.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1 text-xs">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(project.createdAt), "dd. MMM yyyy", { locale: de })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Package className="w-4 h-4" />
                      <span>Produkte anzeigen</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      CSV Bulk
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
