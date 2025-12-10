# PIMPilot - Produktmanagement SaaS

## Overview
PIMPilot is a multi-tenant B2B SaaS platform automating AI-powered product description and PIM metadata generation from supplier data. It processes product data via CSV uploads for multiple business customers, ensuring strict data isolation. The platform leverages OpenAI's GPT-4o-mini for text generation and a custom Cheerio-based web scraper. Its core capabilities include a robust multi-tenant architecture, secure authentication, Stripe-based subscription management, real-time API call monitoring, dynamic AI prompting, and a sophisticated category-based template system. The project aims to streamline product information management and enhance e-commerce content creation with a business vision to automate product content creation for e-commerce.

## Recent Changes (Nov 22, 2025)
- **Fixed critical Phonetastik scraper hanging issue**: Implemented comprehensive try-catch error handling in all parsing functions to prevent indefinite hangs during HTML processing
- **Implemented aggressive technical spec extraction**: Enhanced regex patterns for EAN (13-digit), weight (grams/kg), thickness (mm), and price (€) extraction with multiple pattern fallbacks
- **Added fallback product-area selector**: When no specific product-detail area found, now extracts from entire page text for supplier sites without standard semantic markup
- **Default weight handling**: For Phonetastik screen protectors (very light products), automatically assigns 1g default weight when thickness is detected but weight unavailable
- **Performance target achieved**: Reduced scraping time from 1-2 minutes (hanging) to 10-15 seconds with functional table display

## User Preferences

### AI-Generierung: Agent Version 2 (SEO + Kategorie-Intelligenz)

**HTML-Struktur (Standard für alle Produkttypen):**
```html
<h1>{Produktname}</h1>           <!-- EINZIGE Stelle für Produktnamen -->
<p>{Einleitung 2-3 Sätze}</p>
<h2>Anwendung & Einsatzbereich</h2>
<p>{Konkrete Einsatzgebiete}</p>
<h2>Kompatibilität</h2>
<ul><li>Modell 1</li>...</ul>
<h2>Werkzeugübersicht</h2>       <!-- NUR bei Werkzeug-Sets -->
<ul><li>Schraubendreher</li>...</ul>
<h2>Ihre Vorteile</h2>
<p>✅ Vorteil 1<br />✅ Vorteil 2...</p>
<h2>Technische Daten</h2>        <!-- NUR bei Akkus -->
<table>...</table>
<h2>Lieferumfang</h2>
<ul><li>Artikel</li></ul>
```

**Drei Produkttypen:**
- **Typ A (Akku)**: MIT Technische Datentabelle
- **Typ B (Elektronik/Zubehör)**: OHNE Tabelle
- **Typ C (Werkzeug-Set)**: MIT Werkzeugübersicht, OHNE Tabelle

**Produkttitel-Schema (SEO-kritisch):**
```
[Marke] [Produktart] für [Gerät/Serie], [weitere Geräte] – [messbare Attribute]
```
- Marke IMMER ZUERST (ohne Sonderzeichen, kein Pipe!)
- Dann Produktart (Hauptkeyword)
- Gedankenstrich (–) trennt Geräte von Attributen
- Max. 120 Zeichen
- Keine endlosen Gerätelisten → gehören in Beschreibung
- Was im Titel steht, MUSS auch in technicalSpecs sein!

Beispiele:
- ✅ Hähnel USB-Datenkabel für Apple iPhone 4/4s, 3G/3GS, iPad, iPod – 1,5 m, weiß
- ✅ EMCOM Ersatzakku für Apple iPhone SE 2020 – 1821 mAh, 3,82 V
- ❌ USB-Datenkabel für iPhone | Hähnel (Marke am Ende verboten!)

**Absolute Regeln:**
1. Produktname NUR EINMAL als h1 (niemals im Text wiederholen)
2. KEIN "Produktbeschreibung"-Heading
3. Keine Marketing-Floskeln
4. Keine Bold-Tags im Fließtext
5. Vorteile immer mit ✅

**Sprachliche Variation (sehr wichtig für 90.000 Produkte):**
- 5 rotierende Einleitungsmuster (A-E)
- Synonyme für häufige Phrasen
- Tonalität passt sich Kategorie an:
  - Akku: sachlich & technisch
  - Werkzeug: lösungsorientiert
  - Zubehör: komfortbetont
  - Case: schützend & alltagstauglich

**Apple-Akkus: APN-Regeln (Apple Part Numbers):**
- H1: Nur EINE APN, Schema "ersetzt APN <Nummer>"
- Einleitung: ALLE APNs mit "ersetzt die Apple-Teilenummern (APN) ..."
- Technische Daten: Feld "APN / ersetzt" mit allen APNs kommagetrennt
- Verboten: Mehrere APNs im Titel, APN-Listen in Vorteilen

**Kompatibilität: Intelligente Gruppierung:**
- ≤ 8 Modelle: einfache ul/li-Liste
- > 8 Modelle: Flexbox-Layout mit max. 4 Kategorien (iPhone, iPad, iPod Nano, Samsung, etc.)
- Automatische Erkennung von Gerätegruppen (Apple, Samsung, Huawei, etc.)
- iPod-Untergruppen: iPod Nano, iPod Touch, iPod Classic, iPod Shuffle
- Mobile-freundlich durch flex-wrap

**Abschlussregel**: Bei Unsicherheit:
- LASS DAS FELD WEG
- ERFINDE NICHTS
- BLEIB STRUKTURIERT

## System Architecture

**Ausführliche Dokumentation:** Siehe [docs/architecture.md](docs/architecture.md) für detaillierte Architekturdiagramme und Datenfluss-Beschreibungen.

### UI/UX Decisions
The frontend utilizes React 18, TypeScript, Vite, shadcn/ui, Radix UI, and Tailwind CSS for a modern and responsive user experience. Standardized `Table`-components ensure consistent design and functionality across the entire platform (URL-Scraper, PDF-Scraper, Pixi-Vergleich, Projektdetails, etc.), including features like sticky headers, hover effects, numbered rows, and compact layouts. The pricing page features a modern, two-column layout with gradient designs and consistent button heights.

### Technical Implementations
- **Frontend**: React 18, TypeScript, Vite, shadcn/ui, Radix UI, Tailwind CSS
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL (Helium Dev / Supabase Production) with Drizzle ORM
- **AI/ML**: OpenAI API (GPT-4o-mini for text generation, GPT-4o-mini Vision for image analysis)
- **Web Scraping**: Cheerio (Custom scraper service with error handling)
- **Browser Automation**: Puppeteer for JavaScript-rendered content (Phonetastik login + dynamic rendering)
- **Authentication**: Supabase Auth (JWT-based)

### Feature Specifications
- **Multi-Tenant Architecture**: Ensures data isolation, dynamic tenant creation, and robust slug generation.
- **User Authentication**: Supabase Auth with session management.
- **Subscription Management**: Stripe integration for tiered access and trials, with default features for new customers (URL Web-Scraper, CSV Mass Import, AI Product Descriptions).
- **Usage Tracking**: Real-time API call monitoring with limit enforcement.
- **CSV Bulk Processing**: Upload and process product data for mass AI generation, with standardized column selection for PIM mapping and full image URL export. Brickfox CSV export now includes separate columns for up to 10 image URLs and consistent preview/export.
- **URL Web Scraper**: Custom Cheerio-based scraper with configurable CSS selectors (restructured for better data capture of base data, prices, media, descriptions, technical data), intelligent auto-recognition, table parsing, multi-URL scraping, automatic login, session cookie capture, automatic image download, and Magento-specific JSON gallery parsing. MediaMarkt V1/V2 columns removed from main scraper table. **NEW: Phonetastik integration with Puppeteer browser automation, technical spec extraction (thickness, weight defaults), and robust error handling preventing hangs.**
- **CSV Bulk-Scraper**: Upload CSV files with product URLs, automatically scrape all products using supplier selectors, and generate AI-powered shop descriptions (HTML templates), SEO titles (max 60 chars), SEO descriptions (max 160 chars), and image alt-text using Vision API. Includes template management system with CRUD operations and CSV export functionality.
- **MediaMarkt Generator**: Dedicated CSV-based tool for generating MediaMarkt V1 (Produkttyp + Modellcode) and V2 (Modellcode only) descriptions with automatic product type detection and ANS-prefix removal.
- **AI Generation**: Automated product descriptions using OpenAI GPT-4o-mini, including AI-powered image analysis for color detection and dynamic product type extraction.
- **Project Management**: Organize generated products into projects.
- **Supplier Profiles**: Manage multiple suppliers with saved selectors.
- **ERP Integration (e.g., Pixi)**: Automated product comparison for identifying new vs. existing products, intelligent multi-strategy matching (item number, manufacturer's item number, EAN), and CSV export. Direct integration for PDF Scraper to Pixi Compare without intermediate CSV steps. Ensures hyphens in manufacturer item numbers are preserved for correct matching.
- **CSS Selector Verification System**: Workflow for testing and verifying supplier-specific CSS selectors with visual feedback.
- **Field Mapping Tool**: Visual "Click-to-Connect" interface for mapping scraped data or CSV columns to export fields, supporting custom transformations and reusable presets. A new automatic mapping module utilizes `mappingRules.json` for centralized configuration, including priority logic, fixed values, auto-generation (e.g., category path), validation, and unit transformations.
- **Admin Dashboard**: Professional dashboard with real-time KPIs and tenant management capabilities (subscription status, customer deletion, feature flags). Includes a checkbox-based bulk delete for customers.
- **PDF Parser**: Improved PDF parser for accurate extraction of purchase and selling prices.
- **Image Handling**: Static file server for local product images, automatic image download during scraping, and an interactive image gallery for scraped products.
- **Contact Form**: Professional contact form with direct email sending to admin.
- **Enterprise Security Features**: Implemented automatic backup system (Point-in-Time Recovery, multi-tenant isolation, audit-logging), granular RBAC with 5 roles (`admin`, `editor`, `viewer`, `project_manager`, `member`) and resource/action/scope-based permissions, comprehensive audit-log system for all CRUD operations, and field-level AES-256-GCM encryption for sensitive data (e.g., passwords, API keys).

### System Design
The application employs a modular subprompt architecture for specialized AI tasks, centrally orchestrated. A 3-layer category-based template system (Category Configuration, AI Generator, Template Renderer) facilitates automatic category recognition and dynamic AI prompt adaptation. Multi-tenancy is enforced server-side using `organization_id` foreign keys to ensure data isolation.

## Known Limitations (Phonetastik Integration)
- EAN and individual price fields may not be extractable without CSS selectors (not visible in page structure)
- Weight defaults to 1g for screen protectors as actual weight not available in text
- Recommend configuring Phonetastik supplier with CSS selectors for price/EAN if needed for export

## External Dependencies
- **OpenAI API**: For AI-driven text generation (GPT-4o-mini) and image analysis (GPT-4o-mini Vision).
- **Supabase**: Provides PostgreSQL database, multi-tenancy support, and authentication services.
- **Stripe**: Integrated for subscription management and payment processing.
- **Pixi ERP API**: Used for product inventory comparison and duplicate detection.
- **Greyhound SMTP**: E-mail sending for automated supplier requests via nodemailer.
- **Puppeteer**: Browser automation for JavaScript-rendered content and login sessions.
