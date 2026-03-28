# PIMPilot - Brickfox Product Data Optimization Pipeline

## Overview

PIMPilot is a Brickfox/Akkushop product data management tool. The app uses a single-pipeline workflow:
**CSV Upload → CSV-Reparatur → Attribut-Engine → Beschreibungs-Generator → Download**

Key design principles:
- Original CSV is **never overwritten** (kept in browser state as immutable Blob)
- Each step creates a new version of the data
- Per-step change-log tracks field, old→new value
- Each step individually runnable + "Alles optimieren" button for full pipeline
- Frontend orchestrates existing backend APIs directly (no backend pipeline coordinator)

The system handles three main product types:
- **Type A (Batteries/Akkus)**: Includes technical data tables
- **Type B (Electronics/Accessories)**: Standard descriptions without tables
- **Type C (Tool Sets)**: Includes tool overview lists

## User Preferences

Preferred communication style: Simple, everyday German language (UI in German).

## App Structure

### Pages
- `/login` — Authentication page
- `/pipeline` — Main pipeline page (default after login)
- `/account` — User account management

### Pipeline Steps (Frontend Orchestration)
1. **CSV-Reparatur** (`/api/csv-repair/upload` + `/api/csv-repair/download/:jobId`) — SSE stream from POST, fixes line structure and encoding
2. **Attribut-Engine** (`/api/volt-fixer/upload` → poll `/progress/:jobId` → `/result/:jobId` → `/download/:jobId`) — Async job with polling, normalizes Volt/mAh/Wh attributes and syncs into descriptions
3. **Beschreibungs-Generator** (`/api/desc-generator/progress/:sessionId` SSE + `/api/desc-generator/generate` POST) — EventSource for progress, POST returns final CSV, AI-generates structured HTML descriptions

### Key Frontend Files
- `brickfox/client/src/pages/pipeline.tsx` — Main pipeline UI with stepper, change-log, detail views
- `brickfox/client/src/App.tsx` — Routing (login, pipeline, account)
- `brickfox/client/src/components/app-sidebar.tsx` — Sidebar with single "Pipeline" entry

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and production builds
- **Styling**: Tailwind CSS with shadcn/ui component library (Radix UI primitives)
- **State Management**: TanStack Query (React Query) for server state and API calls
- **Path Aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js REST API
- **Build**: esbuild for production bundling, tsx for development
- **API Pattern**: RESTful endpoints under `/api/` prefix
- **File Uploads**: Multer for handling CSV, PDF, and image uploads

### Database Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Production Database**: PostgreSQL via Neon serverless or Supabase
- **Schema Location**: `shared/schema.ts`
- **Migrations**: Drizzle Kit (`drizzle-kit push` for schema sync)

### Multi-Tenancy
- Organization-based isolation using `organization_id` on data tables
- User authentication via Supabase Auth with webhook sync to local database
- Tenant assignment happens automatically on user registration

### AI Content Generation
The system uses a modular prompt architecture with specialized modules:
1. USP generation for sales benefits
2. Technical data extraction
3. SEO-optimized product titles following specific schema
4. HTML-formatted descriptions with strict structure rules

**Product Title Schema**: `[Brand] [ProductType] for [Device/Series], [additional devices] – [measurable attributes]`

**HTML Structure Rules**:
- Single `<h1>` for product name only
- No product name repetition in body text
- Benefits marked with ✅ checkmarks
- Technical tables only for battery products

**Kompatibilität/Typ Regeln**:
- **Batterien/Knopfzellen (CR2032, LR44, etc.)**: Kein Kompatibilitätsfeld, stattdessen:
  - `Typ: CR2032 (entspricht DL2032, ECR2032, EA-2032C)`
- **Andere Produkte (Akkus, Kabel, etc.)**: Kompatibilität direkt mit Modellen:
  - `Kompatibilität: Modell1, Modell2, Modell3` (ohne "Passend für")

**Vorteile-Regeln**:
- Vorteile werden NUR aus dem "Weitere Informationen:" Abschnitt in p_description[de] extrahiert
- Nur Bulletpoints die mit "-" oder "•" beginnen werden als Vorteile erkannt
- HTML-Tags (<br>, <li>, etc.) werden automatisch in Zeilenumbrüche konvertiert
- Mindestens 2 echte Vorteile erforderlich, sonst "Ihre Vorteile" komplett weglassen
- Keine generischen Template-USPs mehr - nur echte extrahierte Vorteile
- Abbruch bei neuer Überschrift (Zeile endet mit ":")

### Prompt-Assistent
- **Chat-Interface**: Separate Seite (`/prompt-assistant`) für strategische Fragen zur Prompt-Optimierung
- **Kontextbezogene Hilfe**: "Warum wurde so generiert?"-Buttons im Bulk-Editor neben jeder HTML-Beschreibung
- **API-Endpoints**: `/api/prompt-assistant/chat` für Chat, `/api/prompt-assistant/explain` für kontextbezogene Erklärungen
- **System-Prompt**: Enthält komplettes PIMPilot-Regelwerk (Titel-Schema, HTML-Struktur, Vorteile-Regeln, etc.)

## External Dependencies

### AI Services
- **OpenAI GPT-4o**: Primary AI for text generation and image analysis (Vision API)
- **Firecrawl API**: Professional web scraping for supplier product pages
- **Tesseract.js**: Fallback OCR for product images

### Authentication & Database
- **Supabase**: Cloud authentication provider with webhook integration
- **Neon/PostgreSQL**: Serverless PostgreSQL for production data storage

### Payment Processing
- **Stripe**: Subscription billing with three tiers (Starter €29, Pro €79, Enterprise €199)

### Third-Party Integrations
- **Pixi ERP**: Product comparison and duplicate detection via REST API with 5-minute caching
- **Brickfox CSV Export**: Target format for product data mapping

### Key Environment Variables
```
DATABASE_URL          # PostgreSQL connection string
OPENAI_API_KEY        # OpenAI API for content generation
FIRECRAWL_API_KEY     # Web scraping service
STRIPE_SECRET_KEY     # Payment processing
VITE_SUPABASE_URL     # Supabase project URL
VITE_SUPABASE_ANON_KEY # Supabase public key
```