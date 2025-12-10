# 📊 PIMPilot System-Diagramme

## 🚀 Schnellstart

### Option 1: HTML-Datei (⭐ EMPFOHLEN)

1. **Öffnen:** `docs/pimpilot-architecture.html` im Browser (Doppelklick)
2. **Downloaden:** Klick auf "Als SVG herunterladen" oder "Als PNG herunterladen"
3. **Fertig!** Sie haben Ihr Diagramm als Bilddatei

---

## 📝 Weitere Optionen

### Option 2: Mermaid Live Editor (Online)

1. Öffnen Sie: https://mermaid.live
2. Kopieren Sie den Inhalt von `docs/pimpilot-architecture.mmd`
3. Einfügen in den Editor
4. Klicken Sie auf **Actions** → **Export SVG** oder **Export PNG**

### Option 3: VS Code Extension

1. Installieren Sie **"Mermaid Preview"** in VS Code
2. Öffnen Sie `docs/pimpilot-architecture.mmd`
3. Rechtsklick → **"Open Preview"**
4. Im Preview: Rechtsklick → **"Export as SVG/PNG"**

---

## 🎨 Für Figma-Import

Da Figma keine programmatische Erstellung unterstützt:

1. **SVG exportieren** (siehe oben)
2. In Figma: **File** → **Import** → SVG auswählen
3. Das Diagramm wird als editierbare Shapes importiert
4. Jetzt können Sie es in Figma bearbeiten

---

## 📐 Diagramm-Struktur

Das Diagramm zeigt die **vollständige PIMPilot-Architektur** in 6 Schichten:

### 🎨 Frontend Layer (Blau)
- Dashboard, Projects, Products
- AI Generator, Web Scraper, Pixi Compare

### 🔐 Authentication (Orange)
- Passport.js Middleware
- JWT Token Validation
- Multi-Tenant Isolation

### ⚙️ Backend API (Lila)
- REST Endpoints für alle Features
- CRUD-Operationen
- Multi-Tenant-Filterung

### 🔧 Service Layer (Grün)
- AI Service (OpenAI)
- Scraper Service (Cheerio)
- Pixi Service (ERP Integration)
- Stripe Service (Payments)
- Supabase Storage (Database)

### 🗄️ Database (Rosa)
- Multi-Tenant PostgreSQL
- Organizations, Users, Projects
- Products, Suppliers, API Logs
- **⭐ = Pixi-Integration Fields**

### 🌐 External Services (Gelb)
- OpenAI API
- Pixi ERP API
- Stripe API

---

## 🔄 Datenfluss-Beispiel

```
User interagiert mit Frontend
    ↓
JWT-Token wird validiert (Auth Middleware)
    ↓
API-Endpoint empfängt Request
    ↓
Service-Layer verarbeitet Business Logic
    ↓
Datenbank-Queries mit organization_id-Filter
    ↓
Response zurück an Frontend
```

---

## 🛠️ Technologie-Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Backend:** Express.js, TypeScript, Passport.js
- **Database:** PostgreSQL (Supabase/Neon)
- **AI:** OpenAI GPT-4o-mini
- **Web Scraping:** Cheerio
- **Payments:** Stripe

---

## 📞 Support

Bei Fragen zur Architektur:
- Siehe `replit.md` für detaillierte Dokumentation
- Alle Pixi-Integration Details in `PIXI_INTEGRATION.md`

---

**Zuletzt aktualisiert:** 31. Oktober 2025  
**Version:** 2.0 (mit Pixi-Supabase-Integration)
