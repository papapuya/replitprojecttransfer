import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Key, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Credentials {
  openaiApiKey: string;
  pixiApiKey: string;
  channelEngineApiKey: string;
  brickfoxApiKey: string;
}

export default function CredentialsManager() {
  const [credentials, setCredentials] = useState<Credentials>({
    openaiApiKey: '',
    pixiApiKey: '',
    channelEngineApiKey: '',
    brickfoxApiKey: '',
  });
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Load credentials on mount
  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    try {
      setIsLoading(true);
      const response = await apiRequest('GET', '/api/credentials');
      const data = await response.json();
      
      if (data.success && data.credentials) {
        setCredentials({
          openaiApiKey: data.credentials.openaiApiKey || '',
          pixiApiKey: data.credentials.pixiApiKey || '',
          channelEngineApiKey: data.credentials.channelEngineApiKey || '',
          brickfoxApiKey: data.credentials.brickfoxApiKey || '',
        });
      }
    } catch (error) {
      console.error('Failed to load credentials:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveCredentials = async () => {
    try {
      setIsSaving(true);
      
      const response = await apiRequest('POST', '/api/saveKeys', {
        openaiKey: credentials.openaiApiKey,
        pixiKey: credentials.pixiApiKey,
        channelEngineKey: credentials.channelEngineApiKey,
        brickfoxKey: credentials.brickfoxApiKey,
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Erfolg",
          description: data.message || "API-Schlüssel wurde gespeichert!",
        });
      } else {
        toast({
          title: "Fehler",
          description: data.message || "Fehler beim Speichern",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Failed to save credentials:', error);
      toast({
        title: "Fehler beim Speichern",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            API Credentials
          </CardTitle>
          <CardDescription>
            Verwalten Sie Ihren OpenAI API-Schlüssel
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          API Credentials
        </CardTitle>
        <CardDescription>
          Verwalten Sie Ihre API-Schlüssel für AI-Generierung und Integration mit Pixi, Channel-Engine und Brickfox
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* OpenAI API Key */}
        <div className="space-y-3">
          <Label htmlFor="openai-key" className="flex items-center gap-2">
            <Key className="w-4 h-4" />
            OpenAI API Key
          </Label>
          <div className="flex gap-2">
            <Input
              id="openai-key"
              type={showKey ? "text" : "password"}
              placeholder="sk-..."
              value={credentials.openaiApiKey}
              onChange={(e) => setCredentials({ ...credentials, openaiApiKey: e.target.value })}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Benötigt für die AI-gestützte Produktbeschreibungs-Generierung
          </p>
        </div>

        {/* Pixi API Key */}
        <div className="space-y-3">
          <Label htmlFor="pixi-key" className="flex items-center gap-2">
            <Key className="w-4 h-4" />
            Pixi API Key
          </Label>
          <div className="flex gap-2">
            <Input
              id="pixi-key"
              type={showKey ? "text" : "password"}
              placeholder="Pixi API-Schlüssel"
              value={credentials.pixiApiKey}
              onChange={(e) => setCredentials({ ...credentials, pixiApiKey: e.target.value })}
              className="flex-1"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Benötigt für die Integration mit Pixi
          </p>
        </div>

        {/* Channel-Engine API Key */}
        <div className="space-y-3">
          <Label htmlFor="channel-engine-key" className="flex items-center gap-2">
            <Key className="w-4 h-4" />
            Channel-Engine API Key
          </Label>
          <div className="flex gap-2">
            <Input
              id="channel-engine-key"
              type={showKey ? "text" : "password"}
              placeholder="Channel-Engine API-Schlüssel"
              value={credentials.channelEngineApiKey}
              onChange={(e) => setCredentials({ ...credentials, channelEngineApiKey: e.target.value })}
              className="flex-1"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Benötigt für die Integration mit Channel-Engine
          </p>
        </div>

        {/* Brickfox API Key */}
        <div className="space-y-3">
          <Label htmlFor="brickfox-key" className="flex items-center gap-2">
            <Key className="w-4 h-4" />
            Brickfox API Key
          </Label>
          <div className="flex gap-2">
            <Input
              id="brickfox-key"
              type={showKey ? "text" : "password"}
              placeholder="Brickfox API-Schlüssel"
              value={credentials.brickfoxApiKey}
              onChange={(e) => setCredentials({ ...credentials, brickfoxApiKey: e.target.value })}
              className="flex-1"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Benötigt für die Integration mit Brickfox
          </p>
        </div>

        <Button 
          onClick={saveCredentials}
          disabled={isSaving}
          className="w-full"
        >
          {isSaving ? 'Speichern...' : 'API-Schlüssel speichern'}
        </Button>
      </CardContent>
    </Card>
  );
}
