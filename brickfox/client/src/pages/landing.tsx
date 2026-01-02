import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white flex items-center justify-center">
      <div className="text-center space-y-8 p-8">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Package className="w-10 h-10 text-white" />
          </div>
          <span className="text-4xl font-bold text-gray-900">PIMPilot</span>
        </div>
        
        <p className="text-xl text-gray-600 max-w-md mx-auto">
          Produktdaten-Management für Akkushop
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
          <Link href="/login">
            <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-xl min-w-[180px]">
              Einloggen
            </Button>
          </Link>
          <Link href="/register">
            <Button size="lg" className="text-lg px-8 py-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg min-w-[180px]">
              Registrieren
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
