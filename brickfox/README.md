# CodeCSVUpload - KI-gestützte Produktbeschreibungen

Eine moderne Web-Anwendung zur automatischen Generierung von Produktbeschreibungen aus Lieferantendaten mit Hilfe von KI.

## 🚀 Features

- **URL-Analyse**: Direkte Analyse von Lieferanten-Websites
- **Bildanalyse**: KI-gestützte Analyse von Produktbildern und Screenshots
- **Automatische Generierung**: Intelligente Produktbeschreibungen im Akkushop.de Format
- **Technische Daten**: Automatische Extraktion und Formatierung
- **Custom Attributes**: Flexible Anpassung von Produkteigenschaften

## 📦 Installation

### Voraussetzungen
- Node.js (Version 18 oder höher)
- npm oder yarn

### Setup

1. **ZIP-Datei entpacken**
   ```bash
   # Entpacken Sie CodeCSVUpload-App.zip in einen Ordner Ihrer Wahl
   ```

2. **Abhängigkeiten installieren**
   ```bash
   npm install
   ```

3. **Umgebungsvariablen konfigurieren**
   ```bash
   # Kopieren Sie .env.example zu .env (falls vorhanden)
   # Oder erstellen Sie eine neue .env Datei mit folgenden Inhalten:
   ```
   
   Erstellen Sie eine `.env` Datei mit:
   ```env
   # API Keys (erforderlich für KI-Funktionen)
   OPENAI_API_KEY=your_openai_api_key_here
   FIRECRAWL_API_KEY=your_firecrawl_api_key_here
   
   # Server Konfiguration
   PORT=5000
   NODE_ENV=development
   ```

4. **Datenbank initialisieren**
   ```bash
   npm run migrate
   ```

5. **Anwendung starten**
   ```bash
   # Windows
   .\start-app.ps1
   
   # Oder manuell:
   npm run dev
   ```

6. **Anwendung öffnen**
   - Öffnen Sie http://localhost:5000 in Ihrem Browser

## 🔧 API Keys Setup

Die Anwendung benötigt API Keys für folgende Services:

### OpenAI API Key
- Registrieren Sie sich bei https://platform.openai.com/
- Erstellen Sie einen API Key
- Fügen Sie ihn in die `.env` Datei ein

### Firecrawl API Key
- Registrieren Sie sich bei https://firecrawl.dev/
- Erstellen Sie einen API Key
- Fügen Sie ihn in die `.env` Datei ein

## 📖 Verwendung

1. **URL analysieren**: Geben Sie eine Produkt-URL ein und klicken Sie auf "URL analysieren"
2. **Bilder hochladen**: Laden Sie Produktbilder oder Screenshots hoch
3. **KI generieren**: Wählen Sie Dateien aus und klicken Sie auf "KI generieren"
4. **Anpassen**: Bearbeiten Sie die generierte Beschreibung nach Bedarf

## 🛠️ Entwicklung

### Projektstruktur
```
├── client/          # React Frontend
├── server/          # Express Backend
├── shared/          # Gemeinsame TypeScript Typen
└── dist/           # Build Output
```

### Verfügbare Scripts
```bash
npm run dev          # Startet Entwicklungsserver
npm run build        # Erstellt Production Build
npm run migrate      # Führt Datenbankmigrationen aus
```

## 📝 Dokumentation

- `API-SETUP.md` - Detaillierte API-Konfiguration
- `TECHNICAL-OVERVIEW.md` - Technische Übersicht
- `TECHNICAL-FAQ.md` - Häufige Fragen
- `DEPLOYMENT.md` - Deployment-Anweisungen

## 🐛 Support

Bei Problemen oder Fragen:
1. Prüfen Sie die Logs in der Konsole
2. Stellen Sie sicher, dass alle API Keys korrekt konfiguriert sind
3. Überprüfen Sie die Netzwerkverbindung

## 📄 Lizenz

Dieses Projekt ist für den internen Gebrauch bestimmt.

---

**Erstellt am:** $(Get-Date -Format "dd.MM.yyyy")
**Version:** 1.0.0
