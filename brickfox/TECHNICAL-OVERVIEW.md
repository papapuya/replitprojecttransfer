# Technische Übersicht: CodeCSVUpload App

## 🏗️ Architektur & Technologie-Stack

### **Frontend (Client)**
- **Framework**: React 18 mit TypeScript
- **Build Tool**: Vite (schneller als Webpack)
- **UI Framework**: Tailwind CSS + shadcn/ui Komponenten
- **State Management**: React Query (TanStack Query) für API-Calls
- **Port**: 3000 (Development)

### **Backend (Server)**
- **Runtime**: Node.js mit TypeScript
- **Framework**: Express.js
- **Build Tool**: tsx (TypeScript Execution)
- **Port**: 5000 (Development)

### **Datenbank**
- **Typ**: SQLite (lokale Datei: `local.db`)
- **ORM**: Prisma (Type-safe Database Access)
- **Schema**: Automatische Migrationen

### **AI & Machine Learning**
- **OpenAI GPT-4o**: Produktbeschreibungen generieren
- **OpenAI GPT Vision**: Bildanalyse und OCR
- **Tesseract.js**: Fallback OCR für Bilder
- **Firecrawl API**: Web-Scraping von Produktseiten

### **Dateiverarbeitung**
- **PDF**: pdf-parse für Text-Extraktion
- **CSV**: csv-parser für Tabellendaten
- **Bilder**: Sharp für Bildverarbeitung + OCR

## 🔧 Kernfunktionalitäten

### **1. Multi-Format Upload**
- PDF-Dokumente (Produktkataloge)
- CSV-Dateien (Produktlisten)
- Bilder (PNG, JPG) mit OCR
- URLs (direktes Web-Scraping)

### **2. KI-basierte Datenverarbeitung**
- Automatische Produktname-Generierung
- Technische Spezifikationen extrahieren
- Strukturierte HTML-Beschreibungen erstellen
- Einheitliche Formatierung (mm, g)

### **3. Web-Scraping**
- Firecrawl API für professionelles Scraping
- Fallback-Methoden bei Blockierung
- Automatische Datenbereinigung
- Bot-Erkennung umgehen

### **4. Projekt-Management**
- Mehrere Produkte pro Projekt
- Versionskontrolle
- Export-Funktionen

## 🚀 Deployment & Workflow-Integration

### **Lokale Entwicklung**
```bash
npm run dev    # Startet Frontend (3000) + Backend (5000)
npm run build  # Production Build
npm start      # Production Server
```

### **Produktions-Deployment**

#### **Option 1: Docker Container**
```dockerfile
# Dockerfile vorhanden
docker build -t codecsvupload .
docker run -p 5000:5000 codecsvupload
```

#### **Option 2: Cloud Deployment**
- **Vercel/Netlify**: Frontend (Static)
- **Railway/Render**: Backend (Node.js)
- **PlanetScale/Supabase**: Datenbank (PostgreSQL)

#### **Option 3: On-Premise Server**
- Windows Server mit Node.js
- IIS als Reverse Proxy
- SQL Server statt SQLite

### **Workflow-Integration**

#### **Für E-Commerce Teams**
1. **Produktmanager**: Upload von Katalogen/CSVs
2. **Content-Team**: KI-generierte Beschreibungen prüfen/anpassen
3. **IT-Team**: Export für Shop-Systeme (Shopware, Magento)

#### **API-Integration**
```typescript
// REST API Endpoints
POST /api/analyze-files     // Datei-Upload
POST /api/scrape-url        // URL-Scraping
POST /api/generate-description // KI-Generierung
GET  /api/projects          // Projekt-Management
```

## 🔒 Sicherheit & Compliance

### **API-Key Management**
- Verschlüsselte Speicherung (AES-256)
- Sichere Credential-Verwaltung
- Keine Hardcoded Keys

### **Datenverarbeitung**
- Lokale Verarbeitung (keine Cloud-Daten)
- GDPR-konform (lokale Speicherung)
- Automatische Datenbereinigung

## 📊 Performance & Skalierung

### **Aktuelle Limits**
- **Dateigröße**: 50MB pro Upload
- **Concurrent Users**: 10-20 (SQLite)
- **API Calls**: OpenAI Rate Limits

### **Skalierungsoptionen**
- **PostgreSQL**: Für mehr Nutzer
- **Redis**: Caching für bessere Performance
- **Queue System**: Bull/Agenda für Batch-Processing
- **CDN**: Für statische Assets

## 🛠️ Wartung & Monitoring

### **Logging**
- Strukturierte Logs (Winston)
- Error Tracking
- Performance Monitoring

### **Updates**
- Automatische Dependency Updates
- Schema-Migrationen
- Backward Compatibility

## 💰 Kostenstruktur

### **Laufende Kosten**
- **OpenAI API**: ~$0.01-0.05 pro Produkt
- **Firecrawl API**: ~$0.001 pro URL
- **Hosting**: $10-50/Monat (je nach Größe)

### **Einmalige Kosten**
- **Entwicklung**: Bereits abgeschlossen
- **Setup**: 1-2 Tage IT-Aufwand
- **Training**: 2-4 Stunden pro Nutzer

## 🔄 Integration in bestehende Systeme

### **Shop-Systeme**
- **Shopware**: CSV/JSON Export
- **Magento**: API-Integration möglich
- **WooCommerce**: WordPress Plugin

### **PIM-Systeme**
- **Akeneo**: API-Integration
- **Pimcore**: Custom Connector
- **inRiver**: Export-Funktionen

### **CMS-Systeme**
- **WordPress**: Plugin-Integration
- **Drupal**: Custom Module
- **Typo3**: Extension-Development

## 📈 Roadmap & Erweiterungen

### **Kurzfristig (1-3 Monate)**
- Bulk-Processing für große Kataloge
- Template-System für verschiedene Produkttypen
- Erweiterte Export-Formate

### **Mittelfristig (3-6 Monate)**
- Multi-Language Support
- Advanced AI Prompts
- Integration mit ERP-Systemen

### **Langfristig (6-12 Monate)**
- Machine Learning für bessere Extraktion
- Automatische Produktkategorisierung
- Real-time Collaboration

## 🎯 Business Value

### **Zeitersparnis**
- **Vorher**: 30-60 Min pro Produktbeschreibung
- **Nachher**: 5-10 Min pro Produktbeschreibung
- **ROI**: 80-90% Zeitersparnis

### **Qualität**
- Konsistente Formatierung
- Vollständige technische Daten
- SEO-optimierte Beschreibungen

### **Skalierbarkeit**
- Unbegrenzte Produktanzahl
- Automatisierte Workflows
- Reduzierte manuelle Fehler
