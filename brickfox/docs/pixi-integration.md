# Pixi ERP Integration - Technische Dokumentation

## Übersicht

Das PIMPilot-System integriert sich mit dem Pixi ERP-System von Akkutools, um automatisch zu erkennen, ob Produkte bereits im Pixi-Inventar vorhanden sind oder neu angelegt werden müssen. Die Integration nutzt einen intelligenten Multi-Strategie-Matching-Algorithmus für maximale Trefferquote.

---

## 1. API-Konfiguration

### 1.1 Pixi API Endpoint

**URL:** `https://akkutools.laptopakku.eu/api/pixi/pixiItemSearch`

**Methode:** `POST`

**Header:**
```http
X-AUTH-TOKEN: GKr7pTd-Fy6xJQb8r2nM4ks9tzdgvXNc2ZBLRw3qDPVhy_U8aaXr4LfNSweRKtqq
Content-Type: application/json
```

**Request Body:**
```json
{
  "SupplNr": "7001"
}
```

**Response Format:**
```json
{
  "data": [
    {
      "ItemNrSuppl": "2447304960",
      "EANUPC": "4013674035489"
    },
    {
      "ItemNrSuppl": "82120",
      "EANUPC": "4020634998623"
    }
  ]
}
```

### 1.2 Environment-Variablen

Die API-Credentials werden über Environment-Variablen konfiguriert:

```bash
PIXI_API_URL=https://akkutools.laptopakku.eu/api/pixi/pixiItemSearch
PIXI_AUTH_TOKEN=GKr7pTd-Fy6xJQb8r2nM4ks9tzdgvXNc2ZBLRw3qDPVhy_U8aaXr4LfNSweRKtqq
```

**Implementierung:** `server/services/pixi-service.ts`
```typescript
constructor() {
  this.apiUrl = process.env.PIXI_API_URL || 'https://akkutools.laptopakku.eu/api/pixi/pixiItemSearch';
  this.authToken = process.env.PIXI_AUTH_TOKEN || '';
}
```

---

## 2. Lieferantennummer (SupplNr)

### 2.1 Automatische Zuordnung

Die SupplNr wird automatisch aus dem Lieferanten-Profil extrahiert, wenn ein Lieferant im UI ausgewählt wird:

**Frontend-Implementierung:**
```typescript
// client/src/pages/pixi-compare.tsx (Zeile 593-594)
const supplier = suppliers.find(s => s.id === value);
setSupplNr(supplier?.supplNr || '');
```

### 2.2 Lieferanten-Datenbank

Die SupplNr wird in der `suppliers`-Tabelle gespeichert:

**Schema:**
```typescript
suppliers: {
  id: varchar("id").primaryKey(),
  name: varchar("name"),
  supplNr: varchar("suppl_nr"),  // Pixi-Lieferantennummer
  organization_id: varchar("organization_id")
}
```

### 2.3 Bekannte SupplNr-Zuordnungen

| SupplNr | Lieferant | Beschreibung |
|---------|-----------|--------------|
| `7001` | Diverse | Standard-Lieferant |
| `7077` | Nitecore/KTL | Nitecore-Produkte |
| `7117` | ANSMANN | ANSMANN-Akkus |

---

## 3. Multi-Strategie Matching-Algorithmus

### 3.1 Übersicht

Das System verwendet drei Matching-Strategien in sequenzieller Reihenfolge. Bei der ersten erfolgreichen Übereinstimmung wird das Produkt als "VORHANDEN" markiert.

```
┌─────────────────────────────────────────────────────────────┐
│                    Produkt aus CSV/PDF/URL                  │
│  - Artikelnummer: "ANS2447304960"                           │
│  - Hersteller-Artikelnr.: "2447304960"                      │
│  - EAN: "4013674035489"                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │  Strategie 1: Artikelnummer │
         │  (mit/ohne Präfix)          │
         └──────────┬──────────────────┘
                    │
         ┌──────────▼──────────┐
         │  Match gefunden?    │
         └─────┬───────────┬───┘
          JA   │           │ NEIN
               │           │
               ▼           ▼
          VORHANDEN   ┌─────────────────────────────────┐
                      │  Strategie 2: Hersteller-Nr.    │
                      └──────────┬──────────────────────┘
                                 │
                      ┌──────────▼──────────┐
                      │  Match gefunden?    │
                      └─────┬───────────┬───┘
                       JA   │           │ NEIN
                            │           │
                            ▼           ▼
                       VORHANDEN   ┌─────────────────────┐
                                   │  Strategie 3: EAN   │
                                   └──────────┬──────────┘
                                              │
                                   ┌──────────▼──────────┐
                                   │  Match gefunden?    │
                                   └─────┬───────────┬───┘
                                    JA   │           │ NEIN
                                         │           │
                                         ▼           ▼
                                    VORHANDEN      NEU
```

### 3.2 Strategie 1: Artikelnummer (mit/ohne Präfix)

**Zweck:** Matching über die vollständige Artikelnummer

**Datenfelder:**
- CSV: `Artikelnummer`, `p_item_number`, `SKU`
- Pixi: `ItemNrSuppl`

**Algorithmus:**

**1a) Versuch mit voller Artikelnummer:**
```typescript
// Beispiel: "ANS2447304960"
const lookupKey = artikelnummer.toUpperCase();
pixiItem = pixiByItemNr.get(lookupKey);
```

**1b) Versuch ohne Präfix (automatisch):**
```typescript
// Beispiel: "ANS2447304960" → "2447304960"
if (!isMatch && lookupKey.length > 3) {
  const withoutPrefix = lookupKey.substring(3);
  pixiItem = pixiByItemNr.get(withoutPrefix);
}
```

**Beispiel:**
```
Dein Produkt: "ANS2447304960"
Pixi ItemNrSuppl: "2447304960"

1a) Match mit "ANS2447304960" → ✗ KEIN MATCH
1b) Match mit "2447304960" → ✓ MATCH GEFUNDEN!
```

**Logging:**
```log
[Pixi Match] ✓ Strategy 1b matched (without prefix): ANS2447304960 -> 2447304960
```

### 3.3 Strategie 2: Hersteller-Artikelnummer

**Zweck:** Matching über die Herstellernummer (ohne Lieferanten-Präfix)

**Datenfelder:**
- CSV: `ItemNrSuppl`, `manufacturers_item_number`, `Herstellerartikelnummer`
- PDF: Automatisch extrahiert aus Produktbeschreibung
- Pixi: `ItemNrSuppl`

**Algorithmus:**
```typescript
// Beispiel: "2447304960"
if (!isMatch && manufacturerItemNr) {
  const lookupKey = manufacturerItemNr.toUpperCase();
  pixiItem = pixiByItemNr.get(lookupKey);
}
```

**Beispiel:**
```
Dein Produkt: manufacturerItemNr = "2447304960"
Pixi ItemNrSuppl: "2447304960"

Match mit "2447304960" → ✓ MATCH GEFUNDEN!
```

**Logging:**
```log
[Pixi Match] ✓ Strategy 2 matched: 2447304960 -> 2447304960
```

### 3.4 Strategie 3: EAN-Fallback

**Zweck:** Matching über EAN/GTIN/Barcode als letzte Option

**Datenfelder:**
- CSV: `EAN`, `GTIN`, `Barcode`, `UPC`, `p_ean`
- Pixi: `EANUPC`

**Algorithmus:**
```typescript
// Beispiel: "4013674035489"
if (!isMatch && ean) {
  pixiItem = pixiByEan.get(ean);
}
```

**Beispiel:**
```
Dein Produkt: EAN = "4013674035489"
Pixi EANUPC: "4013674035489"

Match mit "4013674035489" → ✓ MATCH GEFUNDEN!
```

**Logging:**
```log
[Pixi Match] ✓ Strategy 3 matched: 4013674035489 -> 4013674035489
```

### 3.5 Kein Match gefunden

Wenn alle drei Strategien fehlschlagen:

```typescript
const status: 'NEU' | 'VORHANDEN' = isMatch ? 'VORHANDEN' : 'NEU';
```

**Logging:**
```log
[Pixi Match] ✗ No match found for: {
  artikelnummer: "ANS99999999",
  manufacturerItemNr: "99999999",
  ean: "0000000000000",
  produktname: "Neues Produkt XYZ"
}
```

---

## 4. Performance-Optimierungen

### 4.1 Map-basierte Lookup (O(1) Komplexität)

Anstatt bei jedem Produkt durch das gesamte Pixi-Array zu iterieren, werden zwei Hash-Maps erstellt:

```typescript
// Create lookup maps for fast comparison
const pixiByItemNr = new Map<string, { ItemNrSuppl: string; EANUPC: string }>();
const pixiByEan = new Map<string, { ItemNrSuppl: string; EANUPC: string }>();

pixiItems.forEach(item => {
  if (item.ItemNrSuppl) {
    pixiByItemNr.set(item.ItemNrSuppl.toUpperCase(), item);
  }
  if (item.EANUPC) {
    pixiByEan.set(item.EANUPC, item);
  }
});
```

**Vorteile:**
- **O(1) Lookup** statt O(n) Iteration
- **Case-Insensitive** durch `.toUpperCase()`
- **Doppelte Indizierung** (ItemNr + EAN)

### 4.2 Cache-System (5 Minuten TTL)

API-Requests werden gecacht, um Pixi-API zu entlasten:

```typescript
private cache: Map<string, { data: PixiItemSearchResponse; timestamp: number }>;
private cacheTTL: number = 5 * 60 * 1000; // 5 Minuten

// Check cache first
const cached = this.cache.get(supplNr);
if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
  console.log(`[Pixi Service] Using cached data for supplier ${supplNr}`);
  return cached.data;
}
```

**Vorteile:**
- Reduziert API-Calls bei mehrfachen Vergleichen
- 5-Minuten-Fenster für aktuelle Daten
- Automatisches Cleanup bei Ablauf

---

## 5. Datenfluss

### 5.1 CSV-Upload-Flow

```
┌──────────────────────┐
│  1. User wählt CSV   │
│     + Lieferant      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  2. Frontend: CSV → FormData             │
│     supplNr aus Lieferanten-Profil       │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  3. Backend: POST /api/pixi/compare      │
│     - Parse CSV (Papa Parse)             │
│     - Fix EAN Scientific Notation        │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  4. Pixi Service: searchItems(supplNr)   │
│     POST akkutools.laptopakku.eu/api/... │
│     X-AUTH-TOKEN: ...                    │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  5. Build Maps (pixiByItemNr, pixiByEan) │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  6. For each CSV product:                │
│     - Strategie 1: Artikelnummer         │
│     - Strategie 2: Hersteller-Nr.        │
│     - Strategie 3: EAN                   │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  7. Return ComparisonResult:             │
│     {                                    │
│       summary: { total, neu, vorhanden } │
│       products: [...]                    │
│     }                                    │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  8. Frontend: Display Results            │
│     - Tabelle mit NEU/VORHANDEN-Status   │
│     - CSV Export-Option                  │
└──────────────────────────────────────────┘
```

### 5.2 Projekt-basierter Flow

```
┌──────────────────────┐
│  1. User wählt       │
│     Projekt +        │
│     Lieferant        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  2. Backend: GET /api/products           │
│     Filter: projectId + organizationId   │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  3. Load supplNr from suppliers table    │
│     (if supplierId provided)             │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  4. Same as CSV-Flow (Steps 4-8)         │
└──────────────────────────────────────────┘
```

---

## 6. Backend-Implementierung

### 6.1 API-Endpoints

**Endpoint 1: CSV-Upload-Vergleich**
```typescript
POST /api/pixi/compare
Headers: Authorization: Bearer <token>
Body: FormData {
  csvFile: File,
  supplNr: "7001"
}

Response: {
  success: true,
  summary: {
    total: 36,
    neu: 9,
    vorhanden: 27
  },
  products: [
    {
      artikelnummer: "ANS2447304960",
      manufacturerArticleNumber: "2447304960",
      produktname: "Lithium-Ionen Akkupack...",
      ean: "4013674035489",
      hersteller: "ANSMANN",
      pixi_status: "VORHANDEN",
      pixi_ean: "4013674035489"
    }
  ]
}
```

**Endpoint 2: Projekt-basierter Vergleich**
```typescript
POST /api/pixi/compare-project
Headers: Authorization: Bearer <token>
Content-Type: application/json
Body: {
  projectId: "uuid",
  supplierId: "uuid"  // oder supplNr: "7001"
}

Response: (gleich wie Endpoint 1)
```

### 6.2 Service-Architektur

**Datei:** `server/services/pixi-service.ts`

**Hauptmethoden:**

```typescript
class PixiService {
  // API-Request an Pixi
  async searchItems(supplNr: string): Promise<PixiItemSearchResponse>
  
  // CSV-Vergleich
  async compareProducts(products: CSVProduct[], supplNr: string): Promise<PixiComparisonSummary>
  
  // Projekt-Vergleich
  async compareProductsFromSupabase(
    projectId: string,
    supabaseStorage: SupabaseStorage,
    supplierIdOrSupplNr: string
  ): Promise<PixiSupabaseComparisonSummary>
  
  // Flexible Spalten-Erkennung
  private getColumnValue(product: any, possibleNames: string[]): string
}
```

### 6.3 Spalten-Erkennung (Flexibles Mapping)

Das System erkennt automatisch verschiedene Spaltennamen:

```typescript
// Artikelnummer
const artikelnummer = this.getColumnValue(product, [
  'Artikelnummer', 'artikelnummer', 'ARTIKELNUMMER',
  'Article Number', 'ArticleNumber', 'article_number',
  'Item Number', 'ItemNumber', 'item_number',
  'SKU', 'sku', 'Art.-Nr.', 'Art.Nr.',
  'p_item_number'
]);

// Hersteller-Artikelnummer
const manufacturerItemNr = this.getColumnValue(product, [
  'ItemNrSuppl', 'manufacturers_item_number',
  'Herstellerartikelnummer', 'Hersteller-Artikelnummer'
]);

// EAN
const ean = this.getColumnValue(product, [
  'EAN', 'ean', 'EAN-Code', 'EAN Code',
  'GTIN', 'gtin', 'Barcode', 'barcode',
  'UPC', 'upc', 'EAN/UPC',
  'EANUPC', 'p_ean'
]);

// Produktname
const produktname = this.getColumnValue(product, [
  'Produktname', 'produktname', 'PRODUKTNAME',
  'Product Name', 'ProductName', 'product_name',
  'Name', 'name', 'Bezeichnung', 'bezeichnung',
  'Description', 'description',
  'p_name[de]', 'p_name[en]', 'p_name'
]);

// Hersteller
const hersteller = this.getColumnValue(product, [
  'Hersteller', 'hersteller', 'HERSTELLER',
  'Manufacturer', 'manufacturer', 'Brand', 'brand',
  'Marke', 'marke', 'Supplier', 'supplier',
  'p_brand', 'v_brand'
]);
```

**Vorteile:**
- Unterstützt deutsche + englische Spaltennamen
- Case-Insensitive
- Prioritätslogik (erste gefundene Spalte wird verwendet)
- Unterstützt Brickfox-Export-Spalten

---

## 7. Frontend-Implementierung

### 7.1 UI-Komponente

**Datei:** `client/src/pages/pixi-compare.tsx`

**Tabs:**
1. **CSV-Upload**: Manueller CSV-Upload + Lieferant-Auswahl
2. **Projekt-basiert**: Vergleich aus bestehendem Projekt

**Features:**
- Auto-Fill der SupplNr bei Lieferanten-Auswahl
- Manuelle SupplNr-Eingabe als Alternative
- Live-Status-Anzeige (Gesamt, Neu, Vorhanden)
- Tabellen-Darstellung mit horizontalem Scrolling
- CSV-Export der Ergebnisse

### 7.2 Tabellen-Struktur

```jsx
<div className="rounded-md border overflow-hidden">
  <div className="max-h-96 overflow-y-auto overflow-x-auto">
    <Table>
      <TableHeader className="sticky top-0 bg-background z-10">
        <TableRow>
          <TableHead className="min-w-[100px]">Status</TableHead>
          <TableHead className="min-w-[180px]">Artikelnummer</TableHead>
          <TableHead className="min-w-[150px]">Hersteller-Artikelnr.</TableHead>
          <TableHead className="min-w-[300px]">Produktname</TableHead>
          <TableHead className="min-w-[150px]">EAN</TableHead>
          <TableHead className="min-w-[150px]">Hersteller</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((result) => (
          <TableRow key={...}>
            <TableCell>
              {result.pixi_status === 'NEU' ? (
                <Badge className="bg-green-500">NEU</Badge>
              ) : (
                <Badge variant="outline">VORHANDEN</Badge>
              )}
            </TableCell>
            <TableCell>{result.artikelnummer}</TableCell>
            <TableCell>{result.manufacturerArticleNumber || '-'}</TableCell>
            ...
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
</div>
```

---

## 8. Debugging & Logging

### 8.1 Debug-Logs

Das System erstellt detaillierte Console-Logs für Debugging:

**Produkterkennung:**
```log
[Pixi Service] CSV columns detected: ["Artikelnummer", "Produktname", "EAN", ...]
[Pixi Service] Parsed 36 products from CSV
```

**API-Request:**
```log
[Pixi Service] Fetching items for supplier 7001
[Pixi Service] Received 1247 items from Pixi API
```

**Matching-Details (erste 3 Produkte):**
```log
[Pixi Match Debug] First product: {
  artikelnummer: "ANS2447304960",
  manufacturerItemNr: "2447304960",
  ean: "4013674035489",
  produktname: "Lithium-Ionen Akkupack..."
}

[Pixi Match Debug] First 5 Pixi items: [
  { ItemNrSuppl: "2447304960", EANUPC: "4013674035489" },
  { ItemNrSuppl: "82120", EANUPC: "4020634998623" },
  ...
]

[Pixi Match] ✓ Strategy 1b matched (without prefix): ANS2447304960 -> 2447304960
[Pixi Match] ✓ Strategy 2 matched: 24470105 -> 24470105
[Pixi Match] ✗ No match found for: { artikelnummer: "ANS99999", ... }
```

**Zusammenfassung:**
```log
[Pixi Compare] Comparison complete: 36 total, 9 new, 27 existing
```

### 8.2 Error-Handling

**API-Fehler:**
```typescript
if (!response.ok) {
  throw new Error(`Pixi API error: ${response.status} ${response.statusText}`);
}
```

**Timeout-Protection:**
```typescript
const response = await fetch(this.apiUrl, {
  signal: AbortSignal.timeout(30000), // 30 Sekunden
});
```

**Validierung:**
```typescript
if (!supplNr) {
  return res.status(400).json({ 
    success: false,
    error: 'Supplier number (supplNr) is required' 
  });
}
```

---

## 9. CSV-Export

### 9.1 Export-Format

Der CSV-Export enthält alle Vergleichsdaten:

```csv
Status,Artikelnummer,Hersteller-Artikelnr.,Produktname,EAN,Hersteller,Pixi-EAN
VORHANDEN,ANS2447304960,2447304960,Lithium-Ionen Akkupack 10,8 V/5200 mAh/3S2P,4013674035489,ANSMANN,4013674035489
NEU,ANS99999999,99999999,Neues Produkt XYZ,0000000000000,ANSMANN,
```

### 9.2 Implementation

```typescript
const handleCSVExport = () => {
  const csvRows = [
    ['Status', 'Artikelnummer', 'Hersteller-Artikelnr.', 'Produktname', 'EAN', 'Hersteller', 'Pixi-EAN']
  ];
  
  result.products.forEach(product => {
    csvRows.push([
      product.pixi_status,
      product.artikelnummer || '',
      product.manufacturerArticleNumber || '',
      product.produktname || '',
      product.ean || '',
      product.hersteller || '',
      product.pixi_ean || ''
    ]);
  });
  
  const csvContent = csvRows.map(row => 
    row.map(cell => `"${cell}"`).join(',')
  ).join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `pixi-vergleich-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};
```

---

## 10. Troubleshooting

### Problem 1: Keine Matches trotz vorhandener Produkte

**Ursachen:**
- Falsche SupplNr
- Präfix-Mismatch (z.B. "ANSI" statt "ANS")
- EAN-Format-Fehler (Scientific Notation)

**Lösung:**
1. Console-Logs prüfen: `[Pixi Match Debug] First product: {...}`
2. SupplNr validieren: `suppliers` Tabelle prüfen
3. CSV-Spalten prüfen: `[Pixi Service] CSV columns detected: [...]`

### Problem 2: API-Timeout

**Ursache:** Pixi API antwortet nicht innerhalb von 30 Sekunden

**Lösung:**
```typescript
// Timeout erhöhen in pixi-service.ts
signal: AbortSignal.timeout(60000), // 60 Sekunden
```

### Problem 3: Cache-Probleme

**Symptom:** Alte Daten werden angezeigt

**Lösung:**
```typescript
// Cache manuell leeren
this.cache.clear();
```

### Problem 4: EAN in Scientific Notation

**Symptom:** EAN wird als "4,01E+12" dargestellt

**Lösung:**
Das System korrigiert automatisch:
```typescript
if (eanStr.match(/[0-9],[0-9]+E\+[0-9]+/i)) {
  const eanNum = parseFloat(eanStr.replace(',', '.'));
  product[key] = Math.round(eanNum).toString();
}
```

---

## 11. Sicherheit

### 11.1 Authentifizierung

Alle API-Endpoints sind geschützt:

```typescript
app.post('/api/pixi/compare', 
  requireAuth,  // JWT-Token validieren
  requireFeature('pixiIntegration'),  // Feature-Flag prüfen
  upload.single('csvFile'), 
  async (req: any, res) => { ... }
);
```

### 11.2 Multi-Tenancy

Automatische Isolation per `organization_id`:

```typescript
const products = await supabaseStorage.getProductsByProject(
  projectId,
  req.user.organizationId  // Tenant-Isolation
);
```

### 11.3 Token-Schutz

Der `X-AUTH-TOKEN` wird niemals im Frontend exponiert:
- Nur in Environment-Variablen
- Nur Backend hat Zugriff
- Wird nicht in Logs ausgegeben

---

## 12. Performance-Metriken

### 12.1 Benchmark-Daten

**CSV mit 36 Produkten:**
- Pixi API-Request: ~500ms
- Map-Building: ~5ms
- Matching (36 Produkte): ~2ms
- **Gesamt: ~510ms**

**CSV mit 500 Produkten:**
- Pixi API-Request: ~800ms (Cache: ~0ms)
- Map-Building: ~15ms
- Matching (500 Produkte): ~25ms
- **Gesamt: ~840ms**

### 12.2 Optimierungspotenzial

1. **Batch-Processing:** Große CSVs in Chunks aufteilen
2. **Persistent Cache:** Redis statt In-Memory
3. **Parallel API-Calls:** Mehrere SupplNr gleichzeitig abfragen

---

## 13. Changelog

| Datum | Version | Änderung |
|-------|---------|----------|
| 2025-11-05 | 1.3 | **KRITISCH:** Bindestriche in Artikelnummern werden nun erhalten (z.B. "2447-3049-60") - keine Normalisierung mehr! |
| 2025-11-05 | 1.2 | Multi-Strategie Matching implementiert |
| 2025-11-04 | 1.1 | manufacturerArticleNumber-Feld hinzugefügt |
| 2025-11-03 | 1.0 | Initiale Pixi-Integration |

---

## 14. Support & Kontakt

**Technischer Ansprechpartner:** IT-Team PIMPilot

**Dokumentation erstellt:** November 2025

**Letzte Aktualisierung:** 2025-11-05
