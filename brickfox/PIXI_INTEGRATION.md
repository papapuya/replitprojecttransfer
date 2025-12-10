# Pixi ERP Integration

## Überblick
Die Pixi-Integration ermöglicht es, CSV-Produktdaten automatisch mit Ihrem Pixi ERP-System abzugleichen, um neue Artikel zu identifizieren und Duplikate zu vermeiden.

## Features

✅ **CSV-Upload**: Laden Sie Produktlisten als CSV-Datei hoch  
✅ **API-Integration**: Automatischer Abgleich mit Pixi ERP via REST API  
✅ **Intelligenter Vergleich**: Artikel- und EAN-Nummern-Matching  
✅ **Status-Tracking**: Sofortige Kennzeichnung als "NEU" oder "VORHANDEN"  
✅ **Export-Funktion**: Ergebnisse als CSV herunterladen  
✅ **Performance**: Caching für 5 Minuten, um API-Calls zu reduzieren  
✅ **Multi-Tenant**: Vollständig organization_id-isoliert

## Architektur

### Backend-Komponenten

**1. Pixi Service** (`server/services/pixi-service.ts`)
- Verwaltet API-Calls zu Pixi ERP
- Implementiert intelligentes 5-Minuten-Caching
- Matching-Logik: Artikelnummer (primär) + EAN-Validierung (optional)
- TypeScript Interfaces für Type-Safety

**2. API Endpoints** (`server/routes-supabase.ts`)
```
POST /api/pixi/compare          # CSV-Upload & Vergleich
POST /api/pixi/compare-json     # JSON-basierter Vergleich
DELETE /api/pixi/cache          # Cache löschen
```

### Frontend

**Pixi Vergleich Page** (`client/src/pages/pixi-compare.tsx`)
- Benutzerfreundliche Upload-UI
- Live-Statistiken (Gesamt, Neu, Vorhanden)
- Detaillierte Produktliste mit Filter
- CSV-Export-Funktion

**Navigation**: Sidebar-Menü mit "Pixi Vergleich" Icon

## Verwendung

### 1. CSV-Datei vorbereiten

Ihre CSV-Datei sollte diese Spalten enthalten:
```csv
Artikelnummer,Produktname,EAN,Hersteller,Preis,Gewicht
NC-CG7,Nitecore Chameleon CG7,6952506407231,Nitecore,89.00,158
NC-CI7,Nitecore CI7,6952506405336,Nitecore,59.90,138
```

**Wichtige Spalten für den Vergleich:**
- `Artikelnummer` - Primäres Vergleichsfeld (wird mit Pixi `ItemNrSuppl` abgeglichen)
- `EAN` - Optional für Validierung (wird mit Pixi `EANUPC` verglichen)
- `Produktname` - Zur Anzeige
- `Hersteller` - Zur Anzeige

### 2. Vergleich durchführen

1. Navigieren Sie zu **"Pixi Vergleich"** in der Sidebar
2. Geben Sie die **Lieferantennummer** ein (z.B. `7077`)
3. Laden Sie Ihre **CSV-Datei** hoch
4. Klicken Sie auf **"Jetzt vergleichen"**

### 3. Ergebnisse analysieren

Nach dem Vergleich sehen Sie:

**Zusammenfassung:**
- 🔵 Gesamt: Anzahl aller Produkte
- 🟢 Neu: Produkte, die NICHT in Pixi existieren
- 🔵 Vorhanden: Produkte, die bereits in Pixi sind

**Detailliste:**
- Status-Badge für jedes Produkt (NEU/VORHANDEN)
- Artikelnummer, Produktname, EAN
- Pixi EAN zur Validierung

### 4. Ergebnisse exportieren

Klicken Sie auf **"Ergebnisse als CSV herunterladen"**, um eine exportierbare Liste zu erhalten.

## API-Konfiguration

### Erforderliche Secrets (bereits konfiguriert)

```bash
PIXI_API_URL=https://akkutools.laptopakku.eu/api/pixi/pixiItemSearch
PIXI_AUTH_TOKEN=<Ihr-API-Token>
```

Diese werden sicher als Replit Secrets gespeichert.

## API-Details

### Pixi ItemSearch API

**Endpoint:** `POST https://akkutools.laptopakku.eu/api/pixi/pixiItemSearch`

**Request:**
```json
{
  "SupplNr": "7077"
}
```

**Response:**
```json
{
  "data": [
    {
      "ItemNrSuppl": "NC-CG7",
      "EANUPC": "6952506407231"
    }
  ]
}
```

### PIMPilot Compare API

**Request:**
```bash
curl -X POST http://localhost:5000/api/pixi/compare \
  -H "Authorization: Bearer <token>" \
  -F "csvFile=@produktliste.csv" \
  -F "supplNr=7077"
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "total": 50,
    "neu": 15,
    "vorhanden": 35
  },
  "products": [
    {
      "artikelnummer": "NC-CG7",
      "produktname": "Nitecore Chameleon CG7",
      "ean": "6952506407231",
      "hersteller": "Nitecore",
      "pixi_status": "NEU",
      "pixi_ean": null
    }
  ]
}
```

## Matching-Logik

### Primärer Match: Artikelnummer
```typescript
const pixiItem = pixiByItemNr.get(artikelnummer.toUpperCase());
```
- Case-insensitive Vergleich
- Exact Match erforderlich

### Sekundäre Validierung: EAN
```typescript
if (ean && pixiItem.EANUPC && ean !== pixiItem.EANUPC) {
  console.warn(`EAN mismatch for ${artikelnummer}`);
}
```
- Warnung bei EAN-Diskrepanzen
- Verhindert falsche Zuordnungen

## Performance & Caching

**Cache-TTL:** 5 Minuten  
**Warum?** Reduziert API-Calls bei mehreren Vergleichen desselben Lieferanten

**Cache manuell löschen:**
```bash
curl -X DELETE http://localhost:5000/api/pixi/cache \
  -H "Authorization: Bearer <token>"
```

## Fehlerbehandlung

Das System behandelt folgende Fehler:

✅ **Ungültige CSV-Dateien** - Validierung vor Upload  
✅ **API-Timeouts** - 30 Sekunden Timeout  
✅ **Netzwerkfehler** - Retry-Logik im Service  
✅ **Leere Responses** - Fallback auf leere Arrays  
✅ **Authentifizierungsfehler** - 401/403 Handling

## Sicherheit

- ✅ **requireAuth Middleware**: Nur authentifizierte User
- ✅ **Multi-Tenant Isolation**: organization_id wird automatisch validiert
- ✅ **Token-basierte Auth**: Bearer Token aus localStorage
- ✅ **Secret Management**: API-Token in Replit Secrets

## Testing

**Test-CSV bereitgestellt:** `test-pixi-data.csv`

Enthält 5 Testprodukte:
- 2 existierende Nitecore Produkte (sollten als VORHANDEN erkannt werden)
- 3 neue Test-Produkte (sollten als NEU erkannt werden)

## Zukünftige Erweiterungen

Mögliche Features:
- [ ] Batch-Processing für große CSV-Dateien (>10.000 Zeilen)
- [ ] Webhook-Benachrichtigungen bei neuen Produkten
- [ ] Automatischer Export nach Pixi bei "NEU"-Produkten
- [ ] Duplikat-Erkennung via Fuzzy-Matching
- [ ] Historische Vergleichsberichte

## Technische Details

**Dependencies:**
- `papaparse` - CSV-Parsing
- Native `fetch` API - HTTP Requests (kein axios benötigt)
- TypeScript - Type-Safety

**Code-Qualität:**
- ✅ JSDoc Kommentare
- ✅ TypeScript Interfaces
- ✅ Error Handling
- ✅ Logging mit Prefixes `[Pixi Service]`, `[Pixi Compare]`

## Support

Bei Problemen:
1. Prüfen Sie die Browser-Console für Fehler
2. Überprüfen Sie die Server-Logs: `[Pixi Service]` und `[Pixi Compare]` Tags
3. Validieren Sie CSV-Format
4. Testen Sie mit `test-pixi-data.csv`
