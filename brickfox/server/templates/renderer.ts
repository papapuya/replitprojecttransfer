import { ProductCopyPayload } from './types';
import { ProductCategoryConfig, TechnicalField } from './category-config';
import { filterToWhitelist, isWhitelistedField } from '../../shared/tech-spec-whitelist';

export interface RenderOptions {
  productName: string;
  categoryConfig: ProductCategoryConfig;
  copy: ProductCopyPayload;
  layoutStyle?: 'mediamarkt' | 'minimal' | 'detailed';
  technicalDataTable?: string; // Original HTML table from supplier website
  safetyWarnings?: string; // 1:1 safety warnings from supplier (without icons)
  pdfManualUrl?: string; // PDF manual URL for reference
}

function cleanMarkdown(text: string): string {
  if (!text) return text;
  
  let cleaned = text;
  
  // Entferne "- **" am Anfang
  cleaned = cleaned.replace(/^-\s*\*\*/gm, '');
  
  // Entferne alle ** (bold markers)
  cleaned = cleaned.replace(/\*\*/g, '');
  
  // Entferne alle * (italic markers)
  cleaned = cleaned.replace(/\*/g, '');
  
  // Entferne führende/folgende Leerzeichen
  cleaned = cleaned.trim();
  
  return cleaned;
}

function encodeHtmlEntities(text: string): string {
  if (!text) return text;
  
  return text
    .replace(/ä/g, '&auml;')
    .replace(/Ä/g, '&Auml;')
    .replace(/ö/g, '&ouml;')
    .replace(/Ö/g, '&Ouml;')
    .replace(/ü/g, '&uuml;')
    .replace(/Ü/g, '&Uuml;')
    .replace(/ß/g, '&szlig;')
    .replace(/×/g, '&times;')
    .replace(/–/g, '&ndash;')
    .replace(/—/g, '&mdash;')
    .replace(/€/g, '&euro;')
    .replace(/°/g, '&deg;');
}

export function renderProductHtml(options: RenderOptions): string {
  const { productName, categoryConfig, copy, layoutStyle = 'mediamarkt', technicalDataTable, safetyWarnings, pdfManualUrl } = options;
  
  const cleanProductName = cleanMarkdown(productName);

  const packageContents = cleanMarkdown(copy.packageContents || '');

  const technicalSpecs = buildTechnicalSpecsTable(
    copy.technicalSpecs,
    categoryConfig.technicalFields
  );

  const cleanNarrative = cleanMarkdown(copy.narrative);
  const uspBullets = copy.uspBullets
    .map(usp => cleanMarkdown(usp))
    .filter(usp => usp && usp.trim().length > 0)
    .slice(0, 5);

  const einleitung = cleanMarkdown(copy.einleitung || '');
  const anwendung = cleanMarkdown(copy.anwendung || '');
  const beschreibung = cleanMarkdown(copy.beschreibung || '');
  const tagline = cleanMarkdown(copy.tagline || '');
  const kompatibleModelle = (copy.kompatibleModelle || []).map(m => cleanMarkdown(m));
  const werkzeuguebersicht = (copy.werkzeuguebersicht || []).map(w => cleanMarkdown(w));
  const apnSatz = cleanMarkdown(copy.apnSatz || '');
  const fazit = cleanMarkdown(copy.fazit || '');
  const produktTyp = copy.produktTyp || 'elektronik';
  const zeigeTabelle = copy.zeigeTabelle === true;
  
  // Verwende AI-generierten produktTitel wenn vorhanden, sonst Original-Produktname
  const produktTitel = cleanMarkdown(copy.produktTitel || '') || cleanProductName;

  return renderMediaMarktLayout({
    productName: produktTitel,
    tagline,
    narrative: cleanNarrative,
    uspBullets,
    technicalSpecs,
    packageContents,
    technicalDataTable,
    pdfManualUrl,
    einleitung,
    anwendung,
    beschreibung,
    kompatibleModelle,
    werkzeuguebersicht,
    apnSatz,
    fazit,
    categoryId: categoryConfig.id,
    zeigeTabelle,
    produktTyp,
  });
}

// Felder die NICHT in die technische Tabelle gehören (Metadaten/interne Felder)
const EXCLUDED_METADATA_FIELDS = new Set([
  'id', 'p id', 'extern id', 'p extern id', 
  'artikelnummer', 'p item number', 'item number',
  'name', 'name(de)', 'p name', 'p name(de)', 'product name',
  'group part', 'group part(de)', 'p group part',
  'attributesets', 'attributesets(debc)', 'attributeset',
  'short intro', 'p short intro', 'short intro(de)',
  'beschreibung', 'description', 'p description',
  'category', 'kategorie', 'p category',
  'status', 'p status', 'active', 'p active',
  'created', 'modified', 'timestamp',
  'sku', 'ean', 'gtin', 'upc', 'isbn',
  'price', 'preis', 'msrp', 'cost',
  'stock', 'quantity', 'bestand', 'menge',
  'image', 'images', 'bild', 'bilder', 'p image',
  'url', 'link', 'p url',
  'brand', 'marke', 'manufacturer', 'hersteller',
  'tags', 'keywords', 'seo',
]);

const CSV_TO_GERMAN_LABELS: Record<string, string> = {
  'Akku1': 'Modell',
  'Typ': 'Typ',
  'Allgemeiner Produkttyp(de)': 'Produkttyp',
  'V Nominal': 'Nennspannung',
  'V Kapazität': 'Kapazität',
  'V Anzahl/Menge': 'Anzahl/Menge',
  'V Chemie/System': 'Chemie/System',
  'V Kompatible Gerätehersteller (Zelle)': 'Kompatible Gerätehersteller',
  'V Height': 'Höhe',
  'V Durchmesser / Dicke': 'Durchmesser/Dicke',
  'V Width': 'Breite',
  'V Length': 'Länge',
  'V Weight': 'Gewicht',
  'Gewicht': 'Gewicht',
  'V Bauform': 'Bauform',
  'V Schutzschaltung': 'Schutzschaltung',
  'V Anschluss': 'Anschluss',
  'V Ladegerät': 'Ladegerät',
  'V Hersteller': 'Hersteller',
  'V Farbe': 'Farbe',
  'Farbe': 'Farbe',
  'V Spannung': 'Spannung',
  'V Leistung': 'Leistung',
  'V Stromstärke': 'Stromstärke',
  'V Material': 'Material',
  'Material': 'Material',
  'V Zellenzahl': 'Zellenzahl',
  'V Zellentyp': 'Zellentyp',
  'V Ladezyklen': 'Ladezyklen',
  'V Ladezeit': 'Ladezeit',
  'V Betriebstemperatur': 'Betriebstemperatur',
  'V Lagertemperatur': 'Lagertemperatur',
  'V Selbstentladung': 'Selbstentladung',
  'V Zertifizierung': 'Zertifizierung',
  'V EAN': 'EAN',
  'V Kabellänge': 'Kabellänge',
  'Kabellänge': 'Kabellänge',
  'V Max. Ladeleistung': 'Max. Ladeleistung',
  'V Datenübertragung': 'Datenübertragung',
  'V Stecker': 'Stecker',
  'Stecker': 'Stecker',
};

function translateToGermanLabel(csvLabel: string): string {
  if (CSV_TO_GERMAN_LABELS[csvLabel]) {
    return CSV_TO_GERMAN_LABELS[csvLabel];
  }
  
  const normalizedLabel = csvLabel.replace(/^V\s+/, '').replace(/^P\s+/, '');
  
  for (const [csv, german] of Object.entries(CSV_TO_GERMAN_LABELS)) {
    const normalizedCsv = csv.replace(/^V\s+/, '').replace(/^P\s+/, '');
    if (normalizedCsv.toLowerCase() === normalizedLabel.toLowerCase()) {
      return german;
    }
  }
  
  return normalizedLabel.charAt(0).toUpperCase() + normalizedLabel.slice(1);
}

function isExcludedMetadataField(label: string): boolean {
  const normalizedLabel = label.toLowerCase().trim();
  
  // Direkte Übereinstimmung
  if (EXCLUDED_METADATA_FIELDS.has(normalizedLabel)) {
    return true;
  }
  
  // Partielle Übereinstimmung für zusammengesetzte Feldnamen
  const excludedArray = Array.from(EXCLUDED_METADATA_FIELDS);
  for (let i = 0; i < excludedArray.length; i++) {
    const excluded = excludedArray[i];
    if (normalizedLabel.includes(excluded) || excluded.includes(normalizedLabel)) {
      // Aber nicht wenn es ein technisches Feld ist (z.B. "gewicht" in "versandgewicht")
      if (normalizedLabel.includes('gewicht') && !normalizedLabel.includes('versand')) {
        return false;
      }
      return true;
    }
  }
  
  return false;
}

function isEmptyOrInvalidValue(value: string): boolean {
  if (!value) return true;
  
  const trimmed = value.trim().toLowerCase();
  
  // Leere oder bedeutungslose Werte
  if (trimmed === '' || 
      trimmed === '0' || 
      trimmed === '-' || 
      trimmed === 'n/a' ||
      trimmed === 'nicht angegeben' || 
      trimmed === 'nicht sichtbar' ||
      trimmed === 'null' ||
      trimmed === 'undefined') {
    return true;
  }
  
  // Interne Referenzen (##|##)
  if (trimmed.includes('##|##')) {
    return true;
  }
  
  return false;
}

function buildTechnicalSpecsTable(
  specs: Record<string, string>,
  fields: TechnicalField[]
): Array<{label: string, value: string}> {
  const result: Array<{label: string, value: string}> = [];

  for (const [label, value] of Object.entries(specs)) {
    if (isExcludedMetadataField(label)) {
      console.log(`🚫 Gefiltert (Metadaten): ${label}`);
      continue;
    }
    
    if (isEmptyOrInvalidValue(value)) {
      console.log(`🚫 Gefiltert (leerer Wert): ${label} = "${value}"`);
      continue;
    }
    
    const whitelistedField = isWhitelistedField(label);
    if (!whitelistedField) {
      console.log(`🚫 Gefiltert (nicht in Whitelist): ${label}`);
      continue;
    }
    
    result.push({
      label: whitelistedField.label,
      value: cleanMarkdown(value)
    });
  }

  console.log(`📊 Technische Daten: ${result.length} Felder (Whitelist-gefiltert)`);
  return result;
}

/**
 * Gruppiert Modelle nach Kategorie (iPhone, iPad, iPod, Watch, MacBook, etc.)
 */
function groupModelsByCategory(models: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  
  const categoryPatterns: [RegExp, string][] = [
    [/iphone/i, 'iPhone'],
    [/ipad/i, 'iPad'],
    [/ipod\s*nano/i, 'iPod Nano'],
    [/ipod\s*touch/i, 'iPod Touch'],
    [/ipod\s*classic/i, 'iPod Classic'],
    [/ipod\s*shuffle/i, 'iPod Shuffle'],
    [/ipod/i, 'iPod'],
    [/watch/i, 'Apple Watch'],
    [/macbook/i, 'MacBook'],
    [/imac/i, 'iMac'],
    [/mac\s?(pro|mini|studio)/i, 'Mac'],
    [/airpod/i, 'AirPods'],
    [/samsung/i, 'Samsung'],
    [/huawei/i, 'Huawei'],
    [/xiaomi/i, 'Xiaomi'],
    [/sony/i, 'Sony'],
    [/lg/i, 'LG'],
    [/nokia/i, 'Nokia'],
    [/motorola/i, 'Motorola'],
    [/google|pixel/i, 'Google'],
  ];
  
  for (const model of models) {
    let assigned = false;
    for (const [pattern, category] of categoryPatterns) {
      if (pattern.test(model)) {
        if (!groups[category]) groups[category] = [];
        groups[category].push(model);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      if (!groups['Weitere Modelle']) groups['Weitere Modelle'] = [];
      groups['Weitere Modelle'].push(model);
    }
  }
  
  return groups;
}

/**
 * Rendert die Kompatibilitäts-Sektion mit intelligenter Gruppierung
 * - ≤ 8 Modelle: einfache Liste
 * - > 8 Modelle: gruppierte h3 + ul Blöcke (Ultra-Safe, ohne Inline-Styles)
 */
function renderKompatibilitaet(models: string[], e: (s: string) => string): string {
  if (!models || models.length === 0) {
    return '';
  }
  
  // Bei 8 oder weniger Modellen: einfache Liste
  if (models.length <= 8) {
    return `<h2>Kompatibilit&auml;t</h2>
<ul>
${models.map(model => `<li>${e(model)}</li>`).join('\n')}
</ul>`;
  }
  
  // Bei mehr als 8 Modellen: gruppiertes Layout
  const groups = groupModelsByCategory(models);
  const groupNames = Object.keys(groups);
  
  // Wenn nur eine oder keine sinnvolle Gruppe: alle in einer Liste
  if (groupNames.length <= 1) {
    return `<h2>Kompatibilit&auml;t</h2>
<ul>
${models.map(model => `<li>${e(model)}</li>`).join('\n')}
</ul>`;
  }
  
  // Sortiere Gruppen nach Größe (größte zuerst), max 4 Gruppen
  const sortedGroups = groupNames
    .sort((a, b) => groups[b].length - groups[a].length)
    .slice(0, 4);
  
  // Sammle übrige Modelle (aus nicht-angezeigten Gruppen)
  const displayedModels = new Set(sortedGroups.flatMap(g => groups[g]));
  const remainingModels = models.filter(m => !displayedModels.has(m));
  
  // Wenn es übrige Modelle gibt, füge sie zur "Weitere Modelle" Gruppe hinzu
  if (remainingModels.length > 0) {
    const weitereIndex = sortedGroups.indexOf('Weitere Modelle');
    if (weitereIndex >= 0) {
      groups['Weitere Modelle'] = [...groups['Weitere Modelle'], ...remainingModels];
    } else if (sortedGroups.length < 4) {
      sortedGroups.push('Weitere Modelle');
      groups['Weitere Modelle'] = remainingModels;
    } else {
      // Füge zu kleinster Gruppe hinzu
      const smallestGroup = sortedGroups[sortedGroups.length - 1];
      groups[smallestGroup] = [...groups[smallestGroup], ...remainingModels];
    }
  }
  
  // Generiere Ultra-Safe HTML (ohne Inline-Styles, marktplatzsicher)
  const groupsHtml = sortedGroups.map(groupName => {
    const groupModels = groups[groupName];
    return `<h3>${e(groupName)}</h3>
<ul>
${groupModels.map(model => `<li>${e(model)}</li>`).join('\n')}
</ul>`;
  }).join('\n');
  
  return `<h2>Kompatibilit&auml;t</h2>
${groupsHtml}`;
}

function cleanTechnicalTable(htmlTable: string): string {
  // Remove wrapper divs and clean up the table for left-aligned display
  let cleaned = htmlTable;
  
  // Remove wrapper divs
  cleaned = cleaned.replace(/<div[^>]*class="[^"]*additional-attributes-wrapper[^"]*"[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/div>/gi, '');
  
  // Remove caption
  cleaned = cleaned.replace(/<caption[^>]*>.*?<\/caption>/gi, '');
  
  // Remove all class attributes from table, tr, th, td
  cleaned = cleaned.replace(/\s+class="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+id="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+data-th="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+scope="[^"]*"/gi, '');
  
  // Add left-aligned inline styles to table
  cleaned = cleaned.replace(/<table/gi, '<table border="0" style="border-collapse: collapse; width: 100%; max-width: 600px;"');
  
  // Make both th and td left-aligned with proper padding
  cleaned = cleaned.replace(/<th/gi, '<th style="padding: 4px 12px 4px 0; text-align: left; vertical-align: top; font-weight: 600;"');
  cleaned = cleaned.replace(/<td/gi, '<td style="padding: 4px 0 4px 0; text-align: left; vertical-align: top;"');
  
  return cleaned.trim();
}

function renderMediaMarktLayout(data: {
  productName: string;
  tagline?: string;
  narrative: string;
  uspBullets: string[];
  technicalSpecs: Array<{label: string, value: string}>;
  packageContents: string;
  technicalDataTable?: string;
  pdfManualUrl?: string;
  einleitung?: string;
  anwendung?: string;
  beschreibung?: string;
  kompatibleModelle?: string[];
  werkzeuguebersicht?: string[];
  apnSatz?: string;
  fazit?: string;
  categoryId?: string;
  zeigeTabelle?: boolean;
  produktTyp?: 'akku' | 'elektronik' | 'werkzeug';
}): string {
  const e = encodeHtmlEntities;
  
  const produktTyp: 'akku' | 'elektronik' | 'werkzeug' = data.produktTyp || 'elektronik';
  
  const einleitung = e(data.einleitung || '');
  const anwendung = e(data.anwendung || data.beschreibung || data.narrative || '');
  
  const vorteileHtml = data.uspBullets.length > 0
    ? data.uspBullets.slice(0, 5).map(usp => `✅ ${e(usp)}`).join('<br />\n')
    : '';

  const showTable = produktTyp === 'akku' && data.zeigeTabelle !== false && data.technicalSpecs.length > 0;
  const techTableHtml = showTable
    ? `<h2>Technische Daten</h2>
<table>
${data.technicalSpecs.map(spec => `<tr><td>${e(spec.label)}</td><td>${e(spec.value)}</td></tr>`).join('\n')}
</table>`
    : '';

  const kompatibleModelleHtml = renderKompatibilitaet(data.kompatibleModelle || [], e);

  const werkzeugItems = data.werkzeuguebersicht || [];
  const werkzeuguebersichtHtml = (produktTyp === 'werkzeug' && werkzeugItems.length > 0)
    ? `<h2>Werkzeug&uuml;bersicht</h2>
<ul>
${werkzeugItems.map(item => `<li>${e(item)}</li>`).join('\n')}
</ul>`
    : '';

  const packageItems = data.packageContents
    .split(/\n/)
    .map(item => item.trim())
    .filter(item => item.length > 0);
  
  const lieferumfangHtml = packageItems.length > 0
    ? `<h2>Lieferumfang</h2>
<ul>
${packageItems.map(item => `<li>${e(item)}</li>`).join('\n')}
</ul>`
    : '';

  const productName = e(data.productName);
  
  let html = `<h1>${productName}</h1>
<p>${einleitung}</p>
<h2>Anwendung &amp; Einsatzbereich</h2>
<p>${anwendung}</p>`;

  if (kompatibleModelleHtml) {
    html += `
${kompatibleModelleHtml}`;
  }

  // APN-Satz nach Kompatibilität (SEO-optimiert)
  if (data.apnSatz && data.apnSatz.trim()) {
    html += `
<p>${e(data.apnSatz)}</p>`;
  }

  if (werkzeuguebersichtHtml) {
    html += `
${werkzeuguebersichtHtml}`;
  }

  if (vorteileHtml) {
    html += `
<h2>Ihre Vorteile</h2>
<p>
${vorteileHtml}
</p>`;
  }

  if (techTableHtml) {
    html += `
${techTableHtml}`;
  }

  if (lieferumfangHtml) {
    html += `
${lieferumfangHtml}`;
  }

  // Fazit/Schlusssatz am Ende
  if (data.fazit && data.fazit.trim()) {
    html += `
<p><strong>Fazit:</strong> ${e(data.fazit)}</p>`;
  }

  return html;
}

/**
 * Teilt den Narrative-Text in 2-3 sinnvolle Absätze auf
 */
function splitNarrativeIntoParagraphs(narrative: string): string[] {
  if (!narrative) return [];
  
  // Teile an Satzenden (. ! ?) gefolgt von Leerzeichen
  const sentences = narrative.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  
  if (sentences.length <= 2) {
    return [narrative]; // Zu kurz für Aufteilung
  }
  
  if (sentences.length <= 4) {
    // 2 Absätze
    const mid = Math.ceil(sentences.length / 2);
    return [
      sentences.slice(0, mid).join(' '),
      sentences.slice(mid).join(' ')
    ];
  }
  
  // 3 Absätze für längere Texte
  const third = Math.ceil(sentences.length / 3);
  return [
    sentences.slice(0, third).join(' '),
    sentences.slice(third, third * 2).join(' '),
    sentences.slice(third * 2).join(' ')
  ];
}
