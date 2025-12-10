import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';

export default function Pricing() {
  const [, setLocation] = useLocation();

  const handleDemo = (plan: string) => {
    setLocation('/register');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => setLocation('/')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Button>
        </div>
        
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Der passende Tarif für deinen Erfolg
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            PIMPilot unterstützt dich bei der Produktdatenverwaltung – unabhängig von deiner 
            Unternehmensgröße und Branche. Starte jetzt mit einer kostenlosen Testphase und wähle 
            anschließend das für dich passende Paket.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto items-stretch">
          {/* Professional Plan */}
          <Card className="relative bg-white shadow-lg hover:shadow-xl transition-shadow flex flex-col">
            <CardHeader className="pb-8">
              <CardTitle className="text-3xl font-bold text-gray-900">Professional</CardTitle>
              <CardDescription className="text-gray-600 mt-2">
                Hervorragend für Start-Ups, Scale-Ups, kleinere Unternehmen und kleinere Agenturen geeignet.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pb-8 flex-grow">
              <div className="space-y-3">
                <div className="flex items-start">
                  <Check className="h-5 w-5 text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">
                    <span className="text-blue-600 font-medium">CSV Bulk-Import</span> – Hunderte Produkte auf einmal importieren
                  </span>
                </div>
                <div className="flex items-start">
                  <Check className="h-5 w-5 text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">
                    <span className="text-blue-600 font-medium">URL Scraper</span> – Automatisches Auslesen von Lieferanten-Websites
                  </span>
                </div>
                <div className="flex items-start">
                  <Check className="h-5 w-5 text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">
                    <span className="text-blue-600 font-medium">AI-Produktbeschreibungen</span> – SEO-optimierte Texte per KI
                  </span>
                </div>
                <div className="flex items-start">
                  <Check className="h-5 w-5 text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">
                    <span className="text-blue-600 font-medium">Lieferanten-Verwaltung</span> – Gespeicherte CSS-Selektoren
                  </span>
                </div>
                <div className="flex items-start">
                  <Check className="h-5 w-5 text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">
                    <span className="text-blue-600 font-medium">CSV-Export mit Field-Mapping</span> – Flexibles Export-System
                  </span>
                </div>
                <div className="flex items-start">
                  <Check className="h-5 w-5 text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">
                    <span className="text-blue-600 font-medium">Bis zu 500 Produkte/Monat</span>
                  </span>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-4">
              <p className="text-2xl font-semibold text-blue-600 text-center w-full">
                Preis auf Anfrage
              </p>
              <Button 
                onClick={() => handleDemo('professional')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-6 text-base"
              >
                Kostenlos starten
              </Button>
            </CardFooter>
          </Card>

          {/* Enterprise Plan */}
          <Card className="relative bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-300 shadow-xl hover:shadow-2xl transition-shadow flex flex-col">
            <CardHeader className="pb-8">
              <CardTitle className="text-3xl font-bold text-gray-900">Enterprise</CardTitle>
              <CardDescription className="text-gray-700 mt-2">
                Die perfekte Lösung für große Unternehmen und Agenturen, die viel Content in kurzer Zeit erstellen.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pb-8 flex-grow">
              <div className="space-y-3">
                <div className="flex items-start">
                  <Check className="h-5 w-5 text-purple-600 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-800">Alle Features aus Professional</span>
                </div>
                <div className="flex items-start">
                  <Check className="h-5 w-5 text-purple-600 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-800">
                    <span className="text-purple-600 font-medium">PDF Auto-Scraper</span> – Automatische URL-Extraktion aus PDFs
                  </span>
                </div>
                <div className="flex items-start">
                  <Check className="h-5 w-5 text-purple-600 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-800">
                    <span className="text-purple-600 font-medium">ERP-Integration</span> – Duplikat-Erkennung & Abgleich
                  </span>
                </div>
                <div className="flex items-start">
                  <Check className="h-5 w-5 text-purple-600 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-800">
                    <span className="text-purple-600 font-medium">MediaMarkt-Formatierung</span> – Automatische Titelgenerierung
                  </span>
                </div>
                <div className="flex items-start">
                  <Check className="h-5 w-5 text-purple-600 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-800">Persönlicher Ansprechpartner & Support</span>
                </div>
                <div className="flex items-start">
                  <Check className="h-5 w-5 text-purple-600 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-800">
                    <span className="text-purple-600 font-medium">Unbegrenzte Produktgenerierung</span>
                  </span>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-4">
              <p className="text-2xl font-semibold text-purple-600 text-center w-full">
                Preis auf Anfrage
              </p>
              <Button 
                onClick={() => handleDemo('enterprise')}
                className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 text-white font-medium py-6 text-base shadow-lg"
              >
                Kostenlos starten
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="mt-16 text-center">
          <p className="text-gray-600">
            Alle Pläne beinhalten 7 Tage Geld-zurück-Garantie
          </p>
          <p className="text-gray-600 mt-2">
            Monatlich kündbar • Keine versteckten Kosten
          </p>
        </div>
      </div>
    </div>
  );
}
