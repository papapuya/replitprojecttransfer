import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Sparkles, CheckCircle2, Zap, TrendingUp, Shield, Package, ChevronDown, Linkedin, Facebook, Twitter } from "lucide-react";
import { useState } from "react";

export default function Landing() {
  const [productMenuOpen, setProductMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white">
      {/* Header Navigation - Modern Clean Design */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer group">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold text-gray-900">
                  PIMPilot
                </span>
              </div>
            </Link>

            {/* Navigation Links - Desktop */}
            <nav className="hidden md:flex items-center gap-8">
              {/* Produkt Dropdown */}
              <div 
                className="relative"
                onMouseEnter={() => setProductMenuOpen(true)}
                onMouseLeave={() => setProductMenuOpen(false)}
              >
                <button className="flex items-center gap-1 text-gray-700 hover:text-indigo-600 font-medium transition-colors py-2">
                  Produkt
                  <ChevronDown className="w-4 h-4" />
                </button>
                {productMenuOpen && (
                  <div className="absolute top-full left-0 pt-1 w-56">
                    <div className="bg-white rounded-lg shadow-xl border border-gray-200 py-2">
                      <a href="#features" className="block px-4 py-3 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                        Tool Funktionen
                      </a>
                      <a href="#features" className="block px-4 py-3 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                        CSV Bulk Import
                      </a>
                      <a href="#features" className="block px-4 py-3 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                        URL Scraper
                      </a>
                      <a href="#features" className="block px-4 py-3 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                        AI-Generierung
                      </a>
                    </div>
                  </div>
                )}
              </div>

              <Link href="/pricing">
                <span className="text-gray-700 hover:text-indigo-600 font-medium transition-colors cursor-pointer">
                  Tarife
                </span>
              </Link>
              
              <a href="#" className="text-gray-700 hover:text-indigo-600 font-medium transition-colors">
                Über uns
              </a>
              
              <Link href="/contact">
                <span className="text-gray-700 hover:text-indigo-600 font-medium transition-colors cursor-pointer">
                  Kontakt
                </span>
              </Link>
            </nav>

            {/* Auth Buttons */}
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button asChild variant="outline" className="text-gray-700 border-gray-300 hover:text-indigo-600 hover:border-indigo-300">
                  <span>Einloggen</span>
                </Button>
              </Link>
              <Link href="/register">
                <Button asChild className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md">
                  <span>Demo anfordern</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section - PromptPop Style */}
      <section className="relative">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">
          <div className="text-center space-y-8 max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
              Produktdaten-Management neu gedacht – <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Automatisiert, intelligent, zeitsparend</span>
            </h1>
            
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Schluss mit manuellen Excel-Marathons und endlosen Copy-Paste-Aufgaben. Unser Produktdaten-Manager automatisiert deine Produkttexte, Mappings und Exporte – in Sekunden statt Stunden.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
              <Link href="/pricing">
                <Button asChild size="lg" className="text-lg px-8 py-6 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl shadow-lg">
                  <span>Kostenlos starten</span>
                </Button>
              </Link>
              <a href="#features">
                <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50 rounded-xl">
                  Mehr erfahren
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section - PromptPop Style */}
      <section className="py-16 bg-white" id="features">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Produktdaten-Management in Zahlen</h2>
            <p className="text-lg text-gray-600">Erlebe echte Zeitersparnis und Effizienz bei deiner täglichen Arbeit</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl p-6 text-center border border-indigo-100">
              <div className="text-4xl font-bold text-indigo-600 mb-2">10.000+</div>
              <div className="text-sm text-gray-600">Produkte in Minuten verarbeitet</div>
            </div>
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl p-6 text-center border border-indigo-100">
              <div className="text-4xl font-bold text-indigo-600 mb-2">95%</div>
              <div className="text-sm text-gray-600">Weniger manuelle Arbeit</div>
            </div>
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl p-6 text-center border border-indigo-100">
              <div className="text-4xl font-bold text-indigo-600 mb-2">Alle</div>
              <div className="text-sm text-gray-600">MediaMarkt, Brickfox & mehr</div>
            </div>
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl p-6 text-center border border-indigo-100">
              <div className="text-4xl font-bold text-indigo-600 mb-2">2-5 Min</div>
              <div className="text-sm text-gray-600">Statt 4-8 Stunden pro Produkt</div>
            </div>
          </div>
        </div>
      </section>

      {/* Pain Points Section */}
      <section className="py-20 bg-gradient-to-b from-white to-indigo-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Kennst du diese Probleme?</h2>
            <p className="text-lg text-gray-600">Typische Herausforderungen im Produktdaten-Management</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl p-8 shadow-md hover:shadow-xl transition-shadow border border-gray-100">
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Endlose Excel-Arbeit</h3>
              <p className="text-gray-600">
                Stunden über Stunden mit Copy-Paste, Formatieren und manuellen Anpassungen. Deine wertvolle Zeit geht für repetitive Aufgaben drauf.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-md hover:shadow-xl transition-shadow border border-gray-100">
              <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-violet-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Chaos bei Plattform-Mappings</h3>
              <p className="text-gray-600">
                Jede Plattform will andere Felder. MediaMarkt, Brickfox, Channel-Engine – alle haben ihre eigenen Anforderungen. Ein Alptraum ohne System.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-md hover:shadow-xl transition-shadow border border-gray-100">
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Inkonsistente Produkttexte</h3>
              <p className="text-gray-600">
                Mal gut, mal schlecht. Keine einheitliche Qualität. SEO-Optimierung? Fehlanzeige. Deine Produkte verschwinden in der Masse.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature 2: Individualization */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center space-y-8">
            <div className="inline-block bg-indigo-100 text-indigo-600 px-4 py-2 rounded-full text-sm font-semibold">
              Individualisierung
            </div>
            <h2 className="text-4xl font-bold text-gray-900">
              Maßgeschneiderte Texte dank individuell trainierter Software
            </h2>
            <ul className="space-y-4 text-left max-w-2xl mx-auto">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="text-lg text-gray-700">Individuelle und CI-konforme Produktbeschreibungen</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="text-lg text-gray-700">Tonalität und Vokabular perfekt auf Ihre Zielgruppe abgestimmt</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="text-lg text-gray-700">Branchenunabhängige Anpassung</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="text-lg text-gray-700">Interner, persönlicher Kontakt für Support & Onboarding</p>
                </div>
              </li>
            </ul>
            <Link href="/pricing">
              <Button size="lg" className="mt-4 bg-indigo-600 hover:bg-indigo-700">
                Mehr über Anpassungen
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Feature 3: ROI / Results */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-block bg-green-100 text-green-600 px-4 py-2 rounded-full text-sm font-semibold">
                Erfolg & ROI
              </div>
              <h2 className="text-4xl font-bold text-gray-900">
                Mehr Sichtbarkeit & Conversions aus unserer 30-jährigen Erfahrung
              </h2>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="text-lg text-gray-700">Sales-Steigerung von bis zu 28% durch Conversion Uplift</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="text-lg text-gray-700">Bis zu 10× höhere SEO-Sichtbarkeit</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="text-lg text-gray-700">Zeitersparnis von 500+ Stunden bei 2.000 Produkten</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="text-lg text-gray-700">Kostenersparnis von bis zu 97% gegenüber manueller Erstellung</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-green-100 to-emerald-100 rounded-2xl p-8 shadow-xl">
                <div className="space-y-6">
                  <div className="bg-white rounded-lg p-6 shadow-md text-center">
                    <div className="text-5xl font-bold text-green-600 mb-2">+28%</div>
                    <div className="text-gray-600">mehr Conversions durch<br/>hervorragende Texte</div>
                  </div>
                  <div className="bg-white rounded-lg p-6 shadow-md text-center">
                    <div className="text-5xl font-bold text-indigo-600 mb-2">~1€</div>
                    <div className="text-gray-600">pro perfektem<br/>Text</div>
                  </div>
                  <div className="bg-white rounded-lg p-6 shadow-md text-center">
                    <div className="text-5xl font-bold text-violet-600 mb-2">+80%</div>
                    <div className="text-gray-600">mehr Traffic durch SEO-<br/>optimierte Inhalte</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-indigo-600 to-violet-700">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Sprechen wir über Ihren individuellen Anwendungsfall
          </h2>
          <p className="text-xl text-white mb-12">
            Vereinbaren Sie jetzt einen unverbindlichen 30-Minuten-Termin
          </p>
          <Link href="/pricing">
            <Button size="lg" className="text-lg px-10 py-6 bg-white text-indigo-600 hover:bg-gray-100 rounded-lg shadow-xl">
              Jetzt 30-Minuten-Termin vereinbaren
            </Button>
          </Link>
        </div>
      </section>

      {/* Media Mentions */}
      <section className="py-12 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-center text-sm uppercase tracking-wide text-gray-500 font-semibold mb-8">
            Bekannt aus führenden Medien
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 items-center opacity-50">
            <div className="flex items-center justify-center text-gray-400 font-bold">OMR</div>
            <div className="flex items-center justify-center text-gray-400 font-bold">T3N</div>
            <div className="flex items-center justify-center text-gray-400 font-bold">Horizont</div>
            <div className="flex items-center justify-center text-gray-400 font-bold">Hubspot</div>
            <div className="flex items-center justify-center text-gray-400 font-bold">Online Marketing</div>
          </div>
        </div>
      </section>

      {/* Footer - Modern Dark Design */}
      <footer className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-12">
            {/* Company Info - 4 columns */}
            <div className="md:col-span-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold text-white">PIMPilot</span>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed mb-6">
                Textoptimierung mit AI – die perfekte Lösung für erfolgreiche Online-Shops und große Unternehmen
              </p>
              <div className="flex items-center gap-4">
                <a href="#" className="w-9 h-9 bg-gray-800 hover:bg-emerald-500 rounded-lg flex items-center justify-center transition-colors group">
                  <Linkedin className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                </a>
                <a href="#" className="w-9 h-9 bg-gray-800 hover:bg-emerald-500 rounded-lg flex items-center justify-center transition-colors group">
                  <Facebook className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                </a>
                <a href="#" className="w-9 h-9 bg-gray-800 hover:bg-emerald-500 rounded-lg flex items-center justify-center transition-colors group">
                  <Twitter className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                </a>
              </div>
            </div>

            {/* Tarife - 2 columns */}
            <div className="md:col-span-2">
              <h4 className="font-semibold mb-4 text-white text-sm uppercase tracking-wider">Tarife</h4>
              <ul className="space-y-3 text-sm">
                <li><Link href="/pricing" className="text-gray-400 hover:text-white transition-colors">Starter</Link></li>
                <li><Link href="/pricing" className="text-gray-400 hover:text-white transition-colors">Professional</Link></li>
                <li><Link href="/pricing" className="text-gray-400 hover:text-white transition-colors">Enterprise</Link></li>
                <li><Link href="/register" className="text-gray-400 hover:text-white transition-colors">Kostenlos testen</Link></li>
              </ul>
            </div>

            {/* Tools - 2 columns */}
            <div className="md:col-span-2">
              <h4 className="font-semibold mb-4 text-white text-sm uppercase tracking-wider">Tools</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#features" className="text-gray-400 hover:text-white transition-colors">CSV Bulk Import</a></li>
                <li><a href="#features" className="text-gray-400 hover:text-white transition-colors">URL Scraper</a></li>
                <li><a href="#features" className="text-gray-400 hover:text-white transition-colors">AI-Generierung</a></li>
                <li><a href="#features" className="text-gray-400 hover:text-white transition-colors">Projekt-Management</a></li>
              </ul>
            </div>

            {/* Unternehmen - 2 columns */}
            <div className="md:col-span-2">
              <h4 className="font-semibold mb-4 text-white text-sm uppercase tracking-wider">Unternehmen</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Über uns</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Karriere</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Kontakt</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Impressum</a></li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-gray-800 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="text-sm text-gray-400">
                © {new Date().getFullYear()} PIMPilot. Alle Rechte vorbehalten.
              </div>
              <div className="flex items-center gap-6 text-sm">
                <a href="#" className="text-gray-400 hover:text-white transition-colors">Datenschutz</a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors">AGB</a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors">Cookies</a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
