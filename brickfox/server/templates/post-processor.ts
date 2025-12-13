/**
 * Post-Processing für AI-generierten Content
 * Stellt sicher, dass AI-Output sauber und konsistent ist
 */

// Blacklist: Generische Phrasen, die entfernt werden sollen
const GENERIC_PHRASE_BLACKLIST = [
  'steht für Qualität, Zuverlässigkeit und Langlebigkeit',
  'ideal für den täglichen Einsatz',
  'perfekte Wahl für',
  'hochwertiges Produkt für professionelle Anwendungen',
  'zeichnet sich durch zuverlässige Leistung',
];

// Blacklist: Generische USPs die NIEMALS erscheinen dürfen
const GENERIC_USP_BLACKLIST = [
  'zuverlässige stromversorgung',
  'lange lebensdauer',
  'einfache installation',
  'hochwertige qualität',
  'hohe qualität',
  'beste qualität',
  'langlebig und robust',
  'robust und langlebig',
  'einfache handhabung',
  'leichte handhabung',
  'sichere nutzung',
  'vielseitig einsetzbar',
  'universell einsetzbar',
  'optimal für den alltag',
  'perfekt für den alltag',
  'ideal für den alltag',
  'komfortable nutzung',
  'bequeme nutzung',
  'zuverlässiger betrieb',
  'sichere anwendung',
  'einfache anwendung',
  'unkomplizierte installation',
  'schnelle installation',
  'problemlose installation',
  'hochwertige verarbeitung',
  'erstklassige verarbeitung',
  'optimale leistung',
  'maximale leistung',
  'beste leistung',
];

// Technisch sinnvolle Ersatz-USPs nach Kategorie
function getTechnicalReplacementUSPs(productName: string): string[] {
  const name = productName.toLowerCase();
  
  // Knopfzellen
  if (name.match(/cr\d{4}|cr123|knopfzelle|lithium.*batter/i)) {
    return [
      '3V Spannung bei kompakter Bauform',
      'Geringe Selbstentladung für lange Lagerung',
      'Konstante Spannung über die Lebensdauer',
      'Breiter Temperaturbereich (-20°C bis +60°C)',
      'Auslaufsichere Lithium-Technologie',
      'Ideal für Uhren und Fernbedienungen',
      'Bis zu 10 Jahre Haltbarkeit',
    ];
  }
  
  // Akkus
  if (name.match(/akku|akkupack|battery.*pack|li-ion|li-polymer|nimh/i)) {
    return [
      'BMS-Schutzschaltung integriert',
      'Tiefentladeschutz für längere Lebensdauer',
      'Überladeschutz verhindert Schäden',
      'Kurzschlussschutz für sicheren Betrieb',
      'Hohe Zyklenfestigkeit (500+ Ladezyklen)',
      'Schnellladefähig',
      'Temperaturüberwachung integriert',
    ];
  }
  
  // Kabel
  if (name.match(/kabel|flex|cable|dock|connector|lightning|usb/i)) {
    return [
      'Vergoldete Kontakte für optimale Übertragung',
      'Abgeschirmte Leitungen gegen Störungen',
      'Knickschutz an Kabelenden',
      'Hochwertige Lötverbindungen',
      'Originale Steckerbauform',
      'Präzise Passgenauigkeit',
      'Stabile Signalübertragung',
    ];
  }
  
  // Displays
  if (name.match(/display|screen|lcd|oled|touchscreen/i)) {
    return [
      'Hohe Farbgenauigkeit',
      'Touch-Digitizer integriert',
      'Originale Auflösung',
      'Kratzfeste Oberfläche',
      'Werkskalibriert für optimale Darstellung',
      'Präzise Touch-Erkennung',
      'Entspiegelte Oberfläche',
    ];
  }
  
  // Ladegeräte
  if (name.match(/ladegerät|charger|netzteil|adapter|power.*supply/i)) {
    return [
      'Kurzschlussschutz integriert',
      'Überspannungsschutz für Geräteschutz',
      'Temperaturüberwachung',
      'Automatische Ladeabschaltung',
      'CE-zertifiziert',
      'Kompaktes, platzsparendes Design',
      'Energieeffizient im Standby',
    ];
  }
  
  // Fallback
  return [
    'Geprüfte Produktqualität',
    'Präzise Verarbeitung',
    'Optimale Materialauswahl',
    'Funktionsgeprüft vor Versand',
    'Passgenau gefertigt',
  ];
}

// Prüft ob ein USP generisch ist
function isGenericUSP(usp: string): boolean {
  const normalized = usp.toLowerCase().trim();
  return GENERIC_USP_BLACKLIST.some(generic => 
    normalized.includes(generic) || generic.includes(normalized)
  );
}

// Regex-Patterns für Cleanup
const CLEANUP_PATTERNS = [
  { pattern: /^-\s*/gm, replacement: '' },           // Führende Bindestriche
  { pattern: /^\*\*\s*/gm, replacement: '' },        // Markdown Bold-Marker
  { pattern: /\*\*/g, replacement: '' },             // Alle Bold-Marker
  { pattern: /^-\s*\*\*\s*/gm, replacement: '' },   // Kombinierte Marker
  { pattern: /\s{2,}/g, replacement: ' ' },          // Mehrfache Leerzeichen
];

export interface ValidationResult {
  isValid: boolean;
  cleaned: string;
  issues: string[];
}

/**
 * Validiert und bereinigt AI-generierten Narrative-Text
 */
export function validateNarrative(text: string): ValidationResult {
  const issues: string[] = [];
  let cleaned = text.trim();

  // Cleanup Patterns anwenden
  for (const { pattern, replacement } of CLEANUP_PATTERNS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // Blacklist-Phrasen entfernen
  for (const phrase of GENERIC_PHRASE_BLACKLIST) {
    if (cleaned.includes(phrase)) {
      cleaned = cleaned.replace(phrase, '').trim();
      issues.push(`Removed generic phrase: "${phrase}"`);
    }
  }

  // Satzanzahl prüfen (sollte 3-5 Sätze sein)
  const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length < 2) {
    issues.push('Too few sentences (minimum 2)');
  } else if (sentences.length > 6) {
    issues.push('Too many sentences (maximum 6)');
  }

  // Prüfe auf produktspezifische Inhalte (mindestens eine Zahl oder spezifischer Begriff)
  const hasSpecificContent = /\d+\s*(mAh|V|A|Wh|mm|g|kg|W)/.test(cleaned);
  if (!hasSpecificContent) {
    issues.push('No specific product data found (capacity, voltage, etc.)');
  }

  const isValid = issues.length === 0 || issues.every(i => i.startsWith('Removed'));

  return {
    isValid,
    cleaned: cleaned.trim(),
    issues,
  };
}

/**
 * Validiert und bereinigt USP-Bullets
 */
export function validateUSPs(usps: string[]): ValidationResult {
  const issues: string[] = [];
  const cleaned = usps.map(usp => {
    let clean = usp.trim();
    
    // Cleanup Patterns
    for (const { pattern, replacement } of CLEANUP_PATTERNS) {
      clean = clean.replace(pattern, replacement);
    }
    
    // Entferne führende ✅ falls vorhanden
    clean = clean.replace(/^✅\s*/, '');
    
    return clean;
  }).filter(usp => usp.length > 0);

  // Prüfe Anzahl
  if (cleaned.length < 5) {
    issues.push(`Too few USPs: ${cleaned.length} (expected 5)`);
  } else if (cleaned.length > 5) {
    issues.push(`Too many USPs: ${cleaned.length} (expected 5)`);
  }

  // Prüfe Länge pro USP
  cleaned.forEach((usp, idx) => {
    if (usp.length > 100) {
      issues.push(`USP ${idx + 1} too long: ${usp.length} chars`);
    }
    if (usp.length < 10) {
      issues.push(`USP ${idx + 1} too short: ${usp.length} chars`);
    }
  });

  const isValid = issues.length === 0;

  return {
    isValid,
    cleaned: cleaned.join('|'), // Dummy für string return
    issues,
  };
}

/**
 * Hauptfunktion: Validiert und bereinigt komplettes Produktcopy
 */
export function processProductCopy(copy: {
  narrative: string;
  uspBullets: string[];
  productName?: string;
}): {
  narrative: string;
  uspBullets: string[];
  validationIssues: string[];
} {
  const narrativeResult = validateNarrative(copy.narrative);
  const uspResult = validateUSPs(copy.uspBullets);

  const allIssues = [...narrativeResult.issues, ...uspResult.issues];

  // Bereinige USPs und ersetze generische durch technisch sinnvolle
  const productName = copy.productName || '';
  const replacementUSPs = getTechnicalReplacementUSPs(productName);
  let replacementIndex = 0;
  
  const cleanedUSPs = copy.uspBullets.map(usp => {
    let clean = usp.trim();
    for (const { pattern, replacement } of CLEANUP_PATTERNS) {
      clean = clean.replace(pattern, replacement);
    }
    clean = clean.replace(/^✅\s*/, '');
    
    // Prüfe ob generisch - wenn ja, ersetze durch technisch sinnvolle Alternative
    if (isGenericUSP(clean)) {
      const replacement = replacementUSPs[replacementIndex % replacementUSPs.length];
      replacementIndex++;
      allIssues.push(`⚠️ Generischer USP ersetzt: "${clean}" → "${replacement}"`);
      console.log(`🔄 Generischer USP ersetzt: "${clean}" → "${replacement}"`);
      return replacement;
    }
    
    return clean;
  });

  if (allIssues.length > 0) {
    console.log('⚠️ Validation issues found:', allIssues);
  }

  return {
    narrative: narrativeResult.cleaned,
    uspBullets: cleanedUSPs,
    validationIssues: allIssues,
  };
}
