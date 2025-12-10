# PIMPilot - Anwendungsarchitektur

**Letzte Aktualisierung:** 08. Dezember 2025

## Änderungsprotokoll

### 08.12.2025 - Monolithischer Sachlicher Prompt
- Modulares Subprompt-System durch einzelnen monolithischen "sachlich" Prompt ersetzt
- Neue HTML-Struktur: h1, Einleitungs-p, h2 Produktbeschreibung, h2 Vorteile (✅), h2 Technische Daten (Tabelle), h2 Lieferumfang (ul)
- Technische Daten Whitelist implementiert (25 erlaubte Felder in shared/tech-spec-whitelist.ts)
- Whitelist-Matching unterstützt Unit-Suffixe (z.B. "Spannung (V)", "Kapazität (mAh)")
- Marketing-Sprache und Superlative komplett eliminiert

---

## Übersicht

PIMPilot ist ein deutsches Produktdaten-Management-System (PIM) für Akkushop/BrickFox. Die Anwendung ermöglicht die automatische Generierung von MediaMarkt-konformen Produktbeschreibungen durch KI.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PIMPilot                                       │
│                     Produktdaten-Management-System                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐ │
│  │    Frontend     │    │     Backend     │    │     Externe Services    │ │
│  │   React/Vite    │◄──►│  Express/Node   │◄──►│   Supabase | OpenAI    │ │
│  │   Port 5000     │    │   Port 5000     │    │   Stripe | Puppeteer   │ │
│  └─────────────────┘    └─────────────────┘    └─────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Gesamtarchitektur

### 1.1 Schichten-Übersicht

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React + Vite)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Wouter     │  │  TanStack    │  │   Shadcn/UI  │  │   Tailwind   │   │
│  │   Routing    │  │   Query      │  │  Components  │  │     CSS      │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
├────────────────────────────────────────────────────────────────────────────┤
│                              REST API (/api/*)                             │
├────────────────────────────────────────────────────────────────────────────┤
│                          BACKEND (Express + Node.js)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Routes     │  │  AI-Service  │  │   Scraper    │  │   Templates  │   │
│  │   Supabase   │  │   OpenAI     │  │  Puppeteer   │  │   Renderer   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
├────────────────────────────────────────────────────────────────────────────┤
│                           DATENBANK & STORAGE                              │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                    Supabase (PostgreSQL + Storage)                    │ │
│  │                    + lokaler Dev-Fallback (SQLite)                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Technologie-Stack

| Schicht | Technologie | Zweck |
|---------|-------------|-------|
| Frontend | React 18 + Vite | SPA mit Hot Module Replacement |
| Routing | Wouter | Leichtgewichtiges Client-Routing |
| State | TanStack Query | Server-State-Management & Caching |
| UI | Shadcn/UI + Radix | Barrierefreie Komponenten |
| Styling | Tailwind CSS | Utility-first CSS |
| Backend | Express.js | REST API Server |
| ORM | Drizzle ORM | Type-safe Datenbankzugriffe |
| Datenbank | Supabase (PostgreSQL) | Persistente Datenspeicherung |
| Auth | Supabase Auth | Session-basierte Authentifizierung |
| KI | OpenAI gpt-4o-mini | Produktbeschreibungs-Generierung |
| Scraping | Puppeteer + Cheerio | Web- und PDF-Scraping |

---

## 2. Verzeichnisstruktur

```
pimpilot/
├── client/                      # Frontend-Code
│   └── src/
│       ├── components/          # React-Komponenten
│       │   └── ui/              # Shadcn/UI-Basiskomponenten
│       ├── hooks/               # Custom React Hooks
│       ├── lib/                 # Hilfsfunktionen
│       │   ├── csv-processor.ts # CSV-Parsing & Validierung
│       │   └── queryClient.ts   # TanStack Query Client
│       └── pages/               # Seitenkomponenten
│           ├── dashboard.tsx    # Hauptdashboard
│           ├── csv-bulk-description.tsx  # CSV-Import
│           ├── url-webscraper.tsx        # URL-Scraping
│           └── ...
│
├── server/                      # Backend-Code
│   ├── index.ts                 # Express-Server-Einstieg
│   ├── routes-supabase.ts       # API-Endpunkte
│   ├── ai-service.ts            # OpenAI-Integration
│   ├── scraper-service.ts       # Web/PDF-Scraping
│   ├── prompts/                 # KI-Prompts (modular)
│   │   ├── orchestrator.ts      # Prompt-Koordination
│   │   ├── narrative.ts         # Produkterzählung
│   │   ├── tech-extraction.ts   # Technische Daten
│   │   ├── usp-generation.ts    # Vorteile/USPs
│   │   ├── safety-warnings.ts   # Sicherheitshinweise
│   │   └── package-contents.ts  # Lieferumfang
│   └── templates/               # HTML-Rendering
│       ├── renderer.ts          # MediaMarkt-HTML
│       ├── tech-spec-parser.ts  # Technische Tabellen
│       ├── ai-generator.ts      # KI-Generierung
│       ├── types.ts             # TypeScript-Typen
│       └── category-config.ts   # Kategorie-Konfiguration
│
├── shared/                      # Gemeinsame Typen
│   └── schema.ts                # Drizzle-Datenbankschema
│
└── docs/                        # Dokumentation
    └── architecture.md          # Diese Datei
```

---

## 3. Kernmodule

### 3.1 CSV-Processor (Frontend)

**Datei:** `client/src/lib/csv-processor.ts`

```
┌─────────────────────────────────────────────────────────────────┐
│                      CSV-Processor                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │  Encoding   │───►│  Delimiter  │───►│   PapaParse         │ │
│  │  Detection  │    │  Detection  │    │   Parsing           │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
│         │                                        │              │
│         ▼                                        ▼              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Zeilenvalidierung                         ││
│  │  - Spaltenanzahl-Prüfung                                    ││
│  │  - Leere Zeilen entfernen                                   ││
│  │  - Multiline-Zellen behandeln                               ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                  │
│                              ▼                                  │
│                    Gültige CSV-Datenzeilen                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Funktionen:**
- `readFileWithEncoding()` - UTF-8 BOM + ISO-8859-1/Windows-1252 Fallback
- `detectDelimiter()` - Automatische Erkennung (`,`, `;`, `\t`)
- `parseCSV()` - PapaParse mit Multiline-Support
- `validateRow()` - Produktdaten-Validierung
- `categorizeProduct()` - Automatische Kategorie-Erkennung

### 3.2 AI-Service (Backend)

**Datei:** `server/ai-service.ts`

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI-Service                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  generateProductDescription()                                   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Prompt Orchestrator                             ││
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐││
│  │  │Narrative│ │  Tech   │ │   USP   │ │ Safety  │ │Package │││
│  │  │  4-5    │ │Extract  │ │Benefits │ │Warnings │ │Content │││
│  │  │Sentences│ │ Table   │ │   ✅    │ │    ⚠    │ │   📦   │││
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └───┬────┘││
│  │       │           │           │           │          │      ││
│  │       └───────────┴───────────┼───────────┴──────────┘      ││
│  │                               ▼                              ││
│  │                    Parallel OpenAI Calls                     ││
│  │                      (gpt-4o-mini)                          ││
│  └─────────────────────────────────────────────────────────────┘│
│                               │                                 │
│                               ▼                                 │
│                    Post-Processing & Merge                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Haupt-Funktionen:**
- `generateProductDescription()` - Haupteinstieg für Beschreibungsgenerierung
- `generateSEOMetadata()` - Meta-Title & Description
- `generateSEOKeywords()` - SEO-Schlüsselwörter
- `analyzeCSV()` - CSV-Struktur analysieren

### 3.3 Template Renderer (Backend)

**Datei:** `server/templates/renderer.ts`

```
┌─────────────────────────────────────────────────────────────────┐
│                    MediaMarkt HTML-Struktur                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  <h1>Produktname</h1>                                          │
│  <h2>Einzeilige Tagline</h2>                                   │
│                                                                 │
│  <p>Absatz 1 der Produktbeschreibung...</p>                    │
│  <p>Absatz 2 der Produktbeschreibung...</p>                    │
│  <p>Absatz 3 der Produktbeschreibung...</p>                    │
│  <p>Absatz 4-5 der Produktbeschreibung...</p>                  │
│                                                                 │
│  <p>                                                           │
│    ✅ Vorteil 1<br>                                            │
│    ✅ Vorteil 2<br>                                            │
│    ✅ Vorteil 3                                                │
│  </p>                                                          │
│                                                                 │
│  <table>                                                       │
│    <tr><td>Lichtleistung:</td><td>1000 Lumen</td></tr>        │
│    <tr><td>Kapazität:</td><td>3500 mAh</td></tr>              │
│    <tr><td>Kabellänge:</td><td>1,5 m</td></tr>                │
│  </table>                                                      │
│                                                                 │
│  <p>⚠️ Sicherheitshinweise...</p>                             │
│  <p>📦 Lieferumfang: ...</p>                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Regeln:**
- Nur EIN `<h2>` pro Beschreibung (Tagline)
- Produktname NICHT im Fließtext wiederholen
- Technische Tabelle mit deutschen Labels (z.B. "Lichtleistung:", "Max. Ladeleistung:")
- Benefits mit ✅-Icons und `<br>` Trennzeichen

---

## 4. Datenfluss

### 4.1 CSV-Import bis Produktbeschreibung

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          DATENFLUSS: CSV → HTML                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Browser   │     │   Client    │     │   Server    │     │    OpenAI       │
│  (Nutzer)   │     │   React     │     │   Express   │     │   gpt-4o-mini   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └────────┬────────┘
       │                   │                   │                      │
       │ 1. CSV hochladen  │                   │                      │
       │──────────────────►│                   │                      │
       │                   │                   │                      │
       │                   │ 2. CSV parsen     │                      │
       │                   │ (PapaParse)       │                      │
       │                   │                   │                      │
       │                   │ 3. POST /api/     │                      │
       │                   │ generate-description                     │
       │                   │──────────────────►│                      │
       │                   │                   │                      │
       │                   │                   │ 4. Orchestrate       │
       │                   │                   │ Subprompts           │
       │                   │                   │─────────────────────►│
       │                   │                   │                      │
       │                   │                   │    ┌─────────────────┤
       │                   │                   │    │ 5a. Narrative   │
       │                   │                   │    │ 5b. Tech-Specs  │
       │                   │                   │    │ 5c. USPs        │
       │                   │                   │    │ 5d. Safety      │
       │                   │                   │    │ 5e. Package     │
       │                   │                   │    └─────────────────┤
       │                   │                   │                      │
       │                   │                   │◄─────────────────────│
       │                   │                   │ 6. Merge Results     │
       │                   │                   │                      │
       │                   │                   │ 7. Render HTML       │
       │                   │                   │ (MediaMarkt-Format)  │
       │                   │                   │                      │
       │                   │◄──────────────────│ 8. Response          │
       │                   │                   │                      │
       │◄──────────────────│ 9. Vorschau       │                      │
       │  HTML anzeigen    │ anzeigen          │                      │
       │                   │                   │                      │
```

### 4.2 SessionStorage-Management

```
┌─────────────────────────────────────────────────────────────────┐
│                    SessionStorage-Schlüssel                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  csv_data_<hash>        → Geparsete CSV-Rohdaten               │
│  csv_results_<hash>     → Generierte Beschreibungen            │
│  csv_generation_state   → Aktueller Fortschritt                │
│  csv_file_hash          → Datei-Identifikator                  │
│                                                                 │
│  ⚠️ Wird bei neuem Upload automatisch gelöscht                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Prompt-Architektur

### 5.1 Modulare Subprompts

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          PROMPT ORCHESTRATOR                                 │
│                      server/prompts/orchestrator.ts                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────┐                                                          │
│  │  Base System   │  Gemeinsame Anweisungen für alle Prompts:               │
│  │     Prompt     │  - Deutsche Sprache                                      │
│  │                │  - Akkushop/Brickfox Kontext                            │
│  │                │  - MediaMarkt-Stil                                       │
│  └───────┬────────┘                                                          │
│          │                                                                   │
│          ▼                                                                   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      PARALLELE SUBPROMPTS                              │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │                                                                        │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │  │
│  │  │   NARRATIVE      │  │  TECH-EXTRACTION │  │   USP-GENERATION     │ │  │
│  │  │ narrative.ts     │  │ tech-extraction. │  │   usp-generation.ts  │ │  │
│  │  │                  │  │      ts          │  │                      │ │  │
│  │  │ 4-5 Sätze        │  │ Technische Daten │  │ 3-5 Vorteile mit ✅  │ │  │
│  │  │ Fließtext        │  │ als Key-Value    │  │                      │ │  │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────────┘ │  │
│  │                                                                        │  │
│  │  ┌──────────────────┐  ┌──────────────────┐                           │  │
│  │  │  SAFETY-WARNINGS │  │ PACKAGE-CONTENTS │                           │  │
│  │  │ safety-warnings. │  │ package-contents │                           │  │
│  │  │       ts         │  │       .ts        │                           │  │
│  │  │                  │  │                  │                           │  │
│  │  │ Sicherheits-     │  │ Lieferumfang     │                           │  │
│  │  │ hinweise ⚠️      │  │ 📦               │                           │  │
│  │  └──────────────────┘  └──────────────────┘                           │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Kategorie-spezifische Konfiguration

**Datei:** `server/templates/category-config.ts`

| Kategorie | Schlüsselwörter | Spezielle Felder |
|-----------|-----------------|------------------|
| Taschenlampe | flashlight, torch, LED | Lichtleistung, LEDs, Reichweite |
| Akku/Batterie | battery, akku, cell | Kapazität, Spannung, Chemie |
| Ladegerät | charger, loader | Max. Ladeleistung, Ladeschächte |
| Kabel | cable, cord, adapter | Kabellänge, Anschlüsse |
| Werkzeug | tool, knife, multi | Material, Funktionen |

---

## 6. Authentifizierung

### 6.1 Dual-Auth-System

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        AUTHENTIFIZIERUNG                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                      PRIMÄR: Supabase Auth                               ││
│  │  - Session-basiert (Cookies)                                            ││
│  │  - Magic Link oder Passwort                                             ││
│  │  - Tenant-Kontext für Multi-Mandantenfähigkeit                          ││
│  │  - Row Level Security (RLS)                                             ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                              │                                               │
│                              │ Bei DNS-Fehler/Ausfall                        │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    FALLBACK: Lokaler Admin                               ││
│  │  - E-Mail: admin@pimpilot.de                                            ││
│  │  - Passwort: Admin040582                                                 ││
│  │  - Token: local-admin-token-pimpilot-dev                                ││
│  │  - Nur für Entwicklung/Notfall                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Route-Protection

**Frontend:**
- `ProtectedRoute` - Allgemeine Auth-Prüfung
- `AdminProtectedRoute` - Admin-Rolle erforderlich

**Backend:**
- Session-Validierung via Supabase
- Permissions-Tabelle für Berechtigungen

---

## 7. Externe Services

### 7.1 OpenAI API

| Einstellung | Wert |
|-------------|------|
| Modell | gpt-4o-mini |
| Kosten | ~30x günstiger als gpt-4o |
| Retry | 5 Versuche mit exponentieller Backoff |
| Rate Limit | Automatisches Retry bei 429 |

### 7.2 Supabase

| Service | Verwendung |
|---------|------------|
| PostgreSQL | Produkte, Projekte, Benutzer |
| Auth | Session-Management |
| Storage | Produktbilder |

### 7.3 Stripe (Optional)

- Zahlungsabwicklung für Premium-Features
- Webhook-Integration für Events

---

## 8. Bekannte Einschränkungen

| Problem | Ursache | Lösung |
|---------|---------|--------|
| 429 Rate Limit | OpenAI-Guthaben erschöpft | Guthaben aufladen |
| ERR_NAME_NOT_RESOLVED | Supabase DNS-Fehler | Lokaler Admin-Fallback |
| 89 statt 4 CSV-Zeilen | Multiline-Felder ohne Quotes | Verbesserte Validierung |

---

## 9. Entwicklung

### 9.1 Server starten

```bash
npm run dev
```

### 9.2 Umgebungsvariablen

| Variable | Beschreibung |
|----------|--------------|
| OPENAI_API_KEY | OpenAI API-Schlüssel |
| SUPABASE_URL | Supabase Projekt-URL |
| SUPABASE_ANON_KEY | Supabase anonymer Schlüssel |
| STRIPE_SECRET_KEY | Stripe Geheimschlüssel (optional) |

---

## 10. Diagramm-Legende

| Symbol | Bedeutung |
|--------|-----------|
| ─────► | Datenfluss |
| ◄────► | Bidirektional |
| │      | Vertikale Verbindung |
| ┌ ┐ └ ┘ | Boxen/Container |
| ✅     | Vorteil/USP |
| ⚠️     | Warnung/Sicherheit |
| 📦     | Lieferumfang |

---

*Letzte Aktualisierung: Dezember 2025*
