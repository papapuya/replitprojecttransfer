import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, FolderOpen, Trash2, Calendar } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { Project } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function Projects() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState("");

  // Fetch projects
  const { data: projectsData, isLoading } = useQuery<{ success: boolean; projects: Project[] }>({
    queryKey: ['/api/projects'],
  });

  const projects = projectsData?.projects || [];

  // Create project mutation
  const createProjectMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest('POST', '/api/projects', { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      setIsDialogOpen(false);
      setProjectName("");
      toast({
        title: "Projekt erstellt",
        description: "Das Projekt wurde erfolgreich erstellt.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message || "Projekt konnte nicht erstellt werden.",
        variant: "destructive",
      });
    },
  });

  // Delete project mutation
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

  const handleCreateProject = () => {
    if (projectName.trim()) {
      createProjectMutation.mutate(projectName.trim());
    }
  };

  const handleDeleteProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (confirm("Möchten Sie dieses Projekt wirklich löschen? Alle Produkte im Projekt werden ebenfalls gelöscht.")) {
      deleteProjectMutation.mutate(projectId);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Meine Projekte</h1>
            <p className="text-muted-foreground mt-1">
              Verwalten Sie Ihre Produktbeschreibungs-Projekte
            </p>
          </div>
          
          {projects.length > 0 && (
            <Button onClick={() => setIsDialogOpen(true)} data-testid="button-create-project">
              <Plus className="w-4 h-4 mr-2" />
              Neues Projekt
            </Button>
          )}
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent data-testid="dialog-create-project">
            <DialogHeader>
              <DialogTitle>Neues Projekt erstellen</DialogTitle>
              <DialogDescription>
                Geben Sie einen Namen für Ihr neues Projekt ein
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="project-name">Projektname</Label>
                <Input
                  id="project-name"
                  placeholder="z.B. MediaMarkt Batterien März 2025"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateProject();
                    }
                  }}
                  data-testid="input-project-name"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                data-testid="button-cancel-create"
              >
                Abbrechen
              </Button>
              <Button
                onClick={handleCreateProject}
                disabled={!projectName.trim() || createProjectMutation.isPending}
                data-testid="button-confirm-create"
              >
                {createProjectMutation.isPending ? "Wird erstellt..." : "Erstellen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Projects Grid */}
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
        ) : projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FolderOpen className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Noch keine Projekte</h3>
              <p className="text-muted-foreground text-center mb-6">
                Erstellen Sie Ihr erstes Projekt, um mit der Produktbeschreibung zu beginnen
              </p>
              <Button onClick={() => setIsDialogOpen(true)} data-testid="button-create-first-project">
                <Plus className="w-4 h-4 mr-2" />
                Erstes Projekt erstellen
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="hover-elevate active-elevate-2 cursor-pointer transition-all"
                onClick={() => setLocation(`/project/${project.id}`)}
                data-testid={`card-project-${project.id}`}
              >
                <CardHeader className="space-y-0 pb-3">
                  <CardTitle className="text-xl flex items-start justify-between gap-2">
                    <span className="line-clamp-2">{project.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0 h-8 w-8"
                      onClick={(e) => handleDeleteProject(e, project.id)}
                      data-testid={`button-delete-project-${project.id}`}
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
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    Klicken zum Öffnen
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
