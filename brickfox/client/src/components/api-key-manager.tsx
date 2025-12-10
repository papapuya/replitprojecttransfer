import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Lock, Unlock, Trash2 } from 'lucide-react';

interface ApiKeyStatus {
  openai: string | null;
  firecrawl: string | null;
}

export default function ApiKeyManager() {
  const [apiKeys, setApiKeys] = useState<ApiKeyStatus>({ openai: null, firecrawl: null });
  const [newApiKey, setNewApiKey] = useState('');
  const [selectedService, setSelectedService] = useState<'openai' | 'firecrawl'>('openai');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // API-Schlüssel-Status laden
  const loadApiKeyStatus = async () => {
    try {
      const response = await fetch('/api/api-key-status');
      if (response.ok) {
        const status = await response.json();
        setApiKeys(status);
      }
    } catch (error) {
      console.error('Fehler beim Laden des API-Schlüssel-Status:', error);
    }
  };

  useEffect(() => {
    loadApiKeyStatus();
  }, []);

  // API-Schlüssel verschlüsselt speichern
  const saveApiKey = async () => {
    if (!newApiKey.trim()) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bitte geben Sie einen API-Schlüssel ein",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/encrypt-api-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service: selectedService,
          apiKey: newApiKey,
        }),
      });

      if (response.ok) {
        toast({
          title: "Erfolgreich",
          description: `${selectedService} API-Schlüssel wurde verschlüsselt gespeichert`,
        });
        setNewApiKey('');
        loadApiKeyStatus();
      } else {
        const error = await response.json();
        toast({
          variant: "destructive",
          title: "Fehler",
          description: error.error || "Fehler beim Speichern des API-Schlüssels",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Netzwerkfehler beim Speichern des API-Schlüssels",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Alle API-Schlüssel löschen
  const clearAllApiKeys = async () => {
    if (!confirm('Sind Sie sicher, dass Sie alle API-Schlüssel löschen möchten?')) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/clear-api-keys', {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: "Erfolgreich",
          description: "Alle API-Schlüssel wurden gelöscht",
        });
        setApiKeys({ openai: null, firecrawl: null });
      } else {
        const error = await response.json();
        toast({
          variant: "destructive",
          title: "Fehler",
          description: error.error || "Fehler beim Löschen der API-Schlüssel",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Netzwerkfehler beim Löschen der API-Schlüssel",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            API-Schlüssel-Verwaltung
          </CardTitle>
          <CardDescription>
            Sichere Verschlüsselung und Verwaltung Ihrer API-Schlüssel
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Aktueller Status */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Aktueller Status</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  {apiKeys.openai ? <Unlock className="w-4 h-4 text-green-500" /> : <Lock className="w-4 h-4 text-red-500" />}
                  <span className="font-medium">OpenAI</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {apiKeys.openai || 'Nicht gesetzt'}
                </p>
              </div>
              
              <div className="p-3 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  {apiKeys.firecrawl ? <Unlock className="w-4 h-4 text-green-500" /> : <Lock className="w-4 h-4 text-red-500" />}
                  <span className="font-medium">Firecrawl</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {apiKeys.firecrawl || 'Nicht gesetzt'}
                </p>
              </div>
            </div>
          </div>

          {/* Neuen API-Schlüssel hinzufügen */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Neuen API-Schlüssel hinzufügen</h3>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="service">Service auswählen</Label>
                <select
                  id="service"
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value as 'openai' | 'firecrawl')}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="openai">OpenAI</option>
                  <option value="firecrawl">Firecrawl</option>
                </select>
              </div>
              
              <div>
                <Label htmlFor="apiKey">API-Schlüssel</Label>
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showApiKey ? 'text' : 'password'}
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    placeholder="Ihr API-Schlüssel..."
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              
              <Button 
                onClick={saveApiKey} 
                disabled={isLoading || !newApiKey.trim()}
                className="w-full"
              >
                {isLoading ? 'Speichere...' : 'Verschlüsselt speichern'}
              </Button>
            </div>
          </div>

          {/* Sicherheitshinweise */}
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              <strong>Sicherheitshinweise:</strong>
              <ul className="mt-2 space-y-1 text-sm">
                <li>• API-Schlüssel werden mit AES-256 verschlüsselt gespeichert</li>
                <li>• Schlüssel werden nur im Arbeitsspeicher entschlüsselt</li>
                <li>• Keine API-Schlüssel werden in Logs oder Datenbanken gespeichert</li>
                <li>• Bei Server-Neustart müssen Schlüssel neu eingegeben werden</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* Alle Schlüssel löschen */}
          <div className="pt-4 border-t">
            <Button 
              variant="destructive" 
              onClick={clearAllApiKeys}
              disabled={isLoading}
              className="w-full"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Alle API-Schlüssel löschen
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
