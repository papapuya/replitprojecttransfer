# 🎨 Visual Mapping Tool - Konzept & UI Design

## Übersicht
Visuelles Drag & Drop Interface zum Mapping von Scraper-Feldern → Brickfox CSV-Spalten

---

## 📊 Database Schema

### 1. `field_mappings` Tabelle
```sql
- id (UUID)
- supplier_id (FK → suppliers.id)
- source_field (TEXT) // "product.title", "product.ean"
- target_field (TEXT) // "Produktname", "EAN"
- transformation (JSONB) // optional: { type: "uppercase" }
- display_order (TEXT)
- is_active (BOOLEAN)
- created_at, updated_at
```

### 2. `mapping_presets` Tabelle
```sql
- id (UUID)
- name (TEXT) // "Brickfox Standard"
- description (TEXT)
- mapping_config (JSONB) // Complete preset
- is_system (BOOLEAN) // System presets can't be deleted
- created_at, updated_at
```

---

## 🎨 UI Design (React Component)

### Layout:
```
┌─────────────────────────────────────────────────────────────┐
│  Visual Field Mapper                           [Save] [Test]│
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │ Scraper Fields   │         │ Brickfox CSV     │          │
│  ├──────────────────┤         ├──────────────────┤          │
│  │ □ product.title  │────────>│ ✓ Produktname    │          │
│  │ □ product.ean    │────────>│ ✓ EAN            │          │
│  │ □ product.price  │────────>│ ✓ Verkaufspreis  │          │
│  │ □ product.desc   │   /---->│ □ Beschreibung   │          │
│  │ □ custom.brand   │  /      │ □ Hersteller     │          │
│  │                  │         │ □ Marke          │          │
│  │ [+ Custom Field] │         │ □ Kategorie      │          │
│  └──────────────────┘         └──────────────────┘          │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Transformationen (optional)                             ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ product.title → Produktname                             ││
│  │   [x] Uppercase  [ ] Lowercase  [ ] Trim                ││
│  │   [ ] Prefix: ___  [ ] Suffix: ___                      ││
│  │   [ ] Custom Regex: _________________                   ││
│  └─────────────────────────────────────────────────────────┘│
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Preview (first 3 products)                              ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ Produktname       │ EAN          │ Verkaufspreis       ││
│  │ POWERBANK 20000   │ 4260123456   │ 29.99              ││
│  │ USB-C KABEL 2M    │ 4260789012   │ 12.99              ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 User Flow

### 1. **Supplier auswählen**
   - User navigiert zu Supplier-Detail-Seite
   - Klickt auf Tab "Field Mapping"

### 2. **Mapping konfigurieren**
   - Drag & Drop: Linke Spalte → Rechte Spalte
   - **Alternative:** Click-to-Connect (einfacher als Drag & Drop)
   - Optional: Transformation hinzufügen

### 3. **Vorschau testen**
   - "Test Preview" Button
   - System lädt letzte 3 gescrapte Produkte
   - Zeigt Mapping-Ergebnis als Tabelle

### 4. **Speichern**
   - "Save Mapping" → Speichert in `field_mappings` Tabelle
   - Wird automatisch beim nächsten Brickfox-Export verwendet

---

## 🛠️ Implementation Plan

### Phase 1: Backend (Tag 1)
- [x] DB Schema erstellt (`shared/mapping-schema.ts`)
- [ ] Migration ausführen (`npm run db:push`)
- [ ] API Routes:
  - `GET /api/suppliers/:id/mappings`
  - `POST /api/suppliers/:id/mappings`
  - `PUT /api/mappings/:id`
  - `DELETE /api/mappings/:id`

### Phase 2: Frontend (Tag 2-3)
- [ ] React Component `FieldMappingEditor.tsx`
- [ ] Drag & Drop Library (React DnD oder simpler: Click-to-Connect)
- [ ] Transformation UI
- [ ] Preview Component

### Phase 3: Integration (Tag 4)
- [ ] Brickfox Mapper: Dynamisches Mapping laden
- [ ] Fallback auf Standard-Mapping
- [ ] Testing mit echten Supplier-Daten

---

## 🎯 Technologie-Entscheidungen

### UI Libraries (Optionen):
1. **React DnD** (komplex, aber mächtig)
2. **React Beautiful DnD** (einfacher, deprecated aber stabil)
3. **Custom Click-to-Connect** (am einfachsten!) ✅ EMPFOHLEN

### Warum Click-to-Connect statt Drag & Drop?
✅ Einfacher zu bedienen (kein Dragging nötig)  
✅ Mobile-friendly  
✅ Weniger Code  
✅ Bessere Accessibility  

**Beispiel Click-to-Connect:**
```
1. User klickt "product.title" (links)
2. Button wird grün markiert
3. User klickt "Produktname" (rechts)
4. Verbindungslinie erscheint
5. Fertig!
```

---

## 📝 Offene Fragen für Sie:

1. **UI-Style:** Drag & Drop oder Click-to-Connect?
2. **Transformationen:** Welche sind wichtig?
   - Uppercase/Lowercase ✓
   - Prefix/Suffix (z.B. "Akku - " + Titel)
   - Regex-Replace
   - Concat (mehrere Felder zusammen)
3. **Presets:** Brauchen Sie vordefinierte Templates?
   - "Brickfox Standard"
   - "MediaMarkt Format"
   - "Custom"

---

## 🚀 Nächste Schritte

**Wenn Sie bereit sind:**
1. Ich erstelle die Migration für die neuen Tabellen
2. Ich implementiere die API-Endpoints
3. Sie geben Feedback zum UI-Konzept
4. Ich baue das Frontend

**Oder soll ich direkt loslegen mit der Standard-Variante (Click-to-Connect)?**
