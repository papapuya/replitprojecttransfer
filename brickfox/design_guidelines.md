# Design Guidelines: MediaMarkt CSV Enricher

## Design Approach: Function-First Data Processing Tool

**Selected System:** Material Design with clean, German enterprise aesthetics  
**Rationale:** Data-heavy utility application requiring clarity, efficiency, and reliable interaction patterns for CSV processing workflows.

**Core Principles:**
- Clarity over decoration
- Immediate functional feedback
- Scannable data presentation
- Error prevention and clear recovery

---

## Color Palette

**Light Mode:**
- Background: 240 5% 98%
- Surface: 0 0% 100%
- Primary: 210 90% 48% (professional blue)
- Success: 142 76% 36%
- Error: 0 84% 60%
- Warning: 38 92% 50%
- Text Primary: 220 13% 18%
- Text Secondary: 220 9% 46%
- Border: 220 13% 91%

**Dark Mode:**
- Background: 222 47% 11%
- Surface: 217 33% 17%
- Primary: 210 90% 58%
- Success: 142 76% 46%
- Error: 0 84% 70%
- Warning: 38 92% 60%
- Text Primary: 210 20% 98%
- Text Secondary: 215 20% 65%
- Border: 217 33% 25%

---

## Typography

**Font Family:** Inter (Google Fonts) for interface, JetBrains Mono for data/SKU display

**Scale:**
- Heading (H1): text-3xl font-bold (page title)
- Section Header (H2): text-xl font-semibold
- Table Header: text-sm font-medium uppercase tracking-wide
- Body: text-sm
- Data/Monospace: text-sm font-mono (for SKUs, technical specs)
- Helper Text: text-xs text-secondary

---

## Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 6, 8, 12, 16  
**Container:** max-w-7xl mx-auto px-6  
**Section Padding:** py-6 to py-8  
**Card Spacing:** p-6  
**Table Cell Padding:** px-4 py-3

---

## Component Library

### File Upload Zone
- Dashed border (border-dashed) with hover state
- Large drop area (min-h-64)
- Upload icon centered with instructional text
- File type restriction visible: "Nur CSV-Dateien (.csv)"
- Drag-over state with highlighted border (primary color)
- Selected file preview with name and size

### Processing States
- Loading spinner with animated pulse
- Progress indication: "X von Y Zeilen verarbeitet"
- Error alerts with clear, actionable messages in German
- Success confirmation with data count

### Data Table
- Sticky header row
- Alternating row backgrounds (subtle zebra striping)
- Editable cells with inline editing (click to edit)
- Duplicate row highlighting with warning-colored left border (4px)
- Column headers: Artikelnummer, Produktname, Produktbeschreibung, MediaMarkt Titel, Spannung, Kapazität, Energiegehalt, Leistung
- Horizontal scroll for overflow (overflow-x-auto)
- Monospace font for SKU/technical values
- Truncated text with tooltip on hover for long descriptions

### Buttons
- Primary: Download CSV (solid primary color)
- Secondary: File upload trigger
- Size: px-6 py-3 for primary actions
- Clear icons (Download, Upload from lucide-react)

### Status Indicators
- Duplicate badge: Small pill with warning background
- Processing count: "X Produkte verarbeitet"
- File info: Name, size, encoding detected

---

## Animations

**Minimal, Functional Only:**
- Subtle fade-in for loaded data (duration-300)
- Smooth row hover states (transition-colors)
- Button press feedback (active:scale-98)
- No decorative animations

---

## Layout Structure

1. **Header Section** (sticky)
   - App title: "MediaMarkt CSV Produktdaten-Anreicherung"
   - Brief description of functionality

2. **Upload Area** (prominent when no data)
   - Large drop zone centered
   - File requirements clearly stated
   - Sample CSV format hint

3. **Data Processing View** (when file uploaded)
   - Processing status bar
   - Error messages (if any) in alert component
   - Action buttons: Download, Clear/Reset

4. **Data Table Section** (full width)
   - Responsive table container
   - All enriched columns visible
   - Inline editing capability
   - Duplicate indicators

5. **Footer**
   - Export button (always accessible when data present)
   - Summary statistics: Total products, duplicates found

---

## German Language Requirements

- All interface text in German
- Button labels: "Hochladen", "CSV Exportieren", "Zurücksetzen"
- Error messages in German
- Date/number formatting per German locale

---

## Accessibility & Data Integrity

- Clear focus states on all interactive elements
- Keyboard navigation for table cells
- ARIA labels for icon-only buttons
- Color is not the only indicator (icons + text for duplicates)
- High contrast maintained in both modes
- Monospace fonts ensure data alignment and readability