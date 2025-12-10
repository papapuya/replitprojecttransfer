import React from "react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Section } from "../components/ui/section";

export default function ComponentDemo() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white">
      <Section title="Willkommen in deiner Lovable App 💖">
        <div className="flex flex-col items-center gap-6">
          <Card className="max-w-md text-center">
            <h3 className="text-xl mb-2">Modernes UI</h3>
            <p className="text-gray-600 mb-4">
              Jetzt im Lovable-Style: runde Ecken, sanfte Schatten und klare Farben.
            </p>
            <Button>Los geht's 🚀</Button>
          </Card>
        </div>
      </Section>
    </main>
  );
}
