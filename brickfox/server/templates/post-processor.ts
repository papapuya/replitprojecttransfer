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
}): {
  narrative: string;
  uspBullets: string[];
  validationIssues: string[];
} {
  const narrativeResult = validateNarrative(copy.narrative);
  const uspResult = validateUSPs(copy.uspBullets);

  const allIssues = [...narrativeResult.issues, ...uspResult.issues];

  if (allIssues.length > 0) {
    console.log('⚠️ Validation issues found:', allIssues);
  }

  return {
    narrative: narrativeResult.cleaned,
    uspBullets: copy.uspBullets.map(usp => {
      let clean = usp.trim();
      for (const { pattern, replacement } of CLEANUP_PATTERNS) {
        clean = clean.replace(pattern, replacement);
      }
      return clean.replace(/^✅\s*/, '');
    }),
    validationIssues: allIssues,
  };
}
