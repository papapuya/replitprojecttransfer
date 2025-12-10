import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import CredentialsManager from "@/components/credentials-manager";

export default function CredentialsPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-6">
        <Button
          variant="outline"
          onClick={() => setLocation('/')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück zur Übersicht
        </Button>
        <h1 className="text-3xl font-bold">API Credentials</h1>
        <p className="text-muted-foreground mt-2">
          Verwalten Sie Ihre API-Schlüssel für OpenAI, Pixi, Channel-Engine und Brickfox
        </p>
      </div>

      <CredentialsManager />
    </div>
  );
}
