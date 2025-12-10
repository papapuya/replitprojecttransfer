export interface TechnicalField {
  key: string;
  label: string;
  unit?: string;
  required: boolean;
  fallback?: string;
}

export interface SubpromptPreferences {
  useModularPrompts?: boolean;
  customUSPStyle?: 'benefits' | 'features' | 'mixed';
  safetyLevel?: 'standard' | 'detailed' | 'minimal';
}

export interface ProductCategoryConfig {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  technicalFields: TechnicalField[];
  uspTemplates: string[];
  safetyNotice: string;
  productHighlights: string[];
  subpromptPreferences?: SubpromptPreferences;
}

export const PRODUCT_CATEGORIES: Record<string, ProductCategoryConfig> = {
  flashlight: {
    id: 'flashlight',
    name: 'Taschenlampe',
    description: 'LED-Taschenlampen und Stirnlampen',
    keywords: ['taschenlampe', 'flashlight', 'torch', 'lampe', 'lumen', 'led', 'licht', 'leuchtweite', 'chameleon', 'nitecore', 'stirnlampe', 'headlamp'],
    technicalFields: [
      { key: 'led1', label: 'LED Weißlicht', required: false },
      { key: 'led2', label: 'LED Farblicht', required: false },
      { key: 'maxLuminosity', label: 'Max. Helligkeit', unit: 'Lumen', required: true, fallback: 'Nicht angegeben' },
      { key: 'spotIntensity', label: 'Spot-Intensität', unit: 'cd', required: false },
      { key: 'maxBeamDistance', label: 'Max. Leuchtweite', unit: 'm', required: false },
      { key: 'powerSupply', label: 'Stromversorgung', required: false },
      { key: 'length', label: 'Länge', unit: 'mm', required: false },
      { key: 'bodyDiameter', label: 'Körperdurchmesser', unit: 'mm', required: false },
      { key: 'headDiameter', label: 'Kopfdurchmesser', unit: 'mm', required: false },
      { key: 'weightWithoutBattery', label: 'Gewicht ohne Akku', unit: 'g', required: false },
      { key: 'waterResistance', label: 'Wasserdichtigkeit', required: false },
      { key: 'impactResistance', label: 'Stoßfestigkeit', required: false },
    ],
    uspTemplates: [
      'Extrem leistungsstark - ideal für Outdoor, Camping und professionellen Einsatz',
      'Mehrfarbige LEDs - vielseitig einsetzbar für verschiedene Anwendungen',
      'Robustes Aluminiumgehäuse - stoßfest und wetterfest',
      'Lange Leuchtdauer - dank effizienter LED-Technologie',
      'Mehrere Leuchtmodi - anpassbar an jede Situation',
      'Kompakt und handlich - perfekt für unterwegs',
      'Wiederaufladbar - umweltfreundlich und kosteneffizient',
    ],
    safetyNotice: '⚠️ Nicht direkt in die Augen leuchten. Vor Wasser schützen (außer bei wasserdichten Modellen). Akkus nur mit geeigneten Ladegeräten laden. Von Kindern fernhalten.',
    productHighlights: [
      'Hochwertige LED-Technologie für maximale Helligkeit',
      'Langlebiges Aluminiumgehäuse für jahrelangen Einsatz',
      'Vielseitige Leuchtmodi für jeden Einsatzzweck',
      'Kompakte Bauweise - ideal für unterwegs',
      'Hervorragendes Preis-Leistungs-Verhältnis',
    ],
  },

  battery: {
    id: 'battery',
    name: 'Akku/Batterie',
    description: 'Wiederaufladbare Akkus und Einwegbatterien',
    keywords: ['akku', 'batterie', 'battery', 'li-ion', 'lithium', 'nimh', 'nicd', 'mah', 'wh'],
    technicalFields: [
      // Mapping-Definitionen für konsistente Labels (dynamische Tabelle zeigt alle gefundenen Specs)
      { key: 'model', label: 'Modell', required: false },
      { key: 'type', label: 'Typ', required: false },
      { key: 'capacity', label: 'Kapazität', required: false },
      { key: 'voltage', label: 'Spannung', required: false },
      { key: 'chemistry', label: 'Technologie', required: false },
      { key: 'chargingMethod', label: 'Ladeverfahren', required: false },
      { key: 'maxChargeCurrent', label: 'Max. Ladestrom', required: false },
      { key: 'maxDischargeCurrent', label: 'Max. Entladestrom', required: false },
      { key: 'current', label: 'Stromstärke', required: false },
      { key: 'dimensions', label: 'Maße', required: false },
      { key: 'abmessungen', label: 'Abmessungen', required: false },
      { key: 'weight', label: 'Gewicht', required: false },
      { key: 'protection', label: 'Schutzschaltung', required: false },
      { key: 'features', label: 'Besonderheiten', required: false },
    ],
    uspTemplates: [
      'Integrierte BMS-Schutzelektronik für maximale Zellensicherheit',
      'Kompatibel mit Geräten, die CR123A Primärzellen nutzen – wiederaufladbare Alternative',
      'Hervorragende Spannungsstabilität auch bei hoher Belastung',
      'Qualitätszelle mit langer Lebensdauer – ideal für Dauerbetrieb',
      'Entwickelt für professionelle Anwendungen (z. B. Taschenlampen, Messgeräte, Fotoausrüstung)',
      'Kein Memory-Effekt - jederzeit nachladbar ohne Kapazitätsverlust',
      'Geringe Selbstentladung – optimal für Langzeitlagerung',
    ],
    safetyNotice: '⚠️ Nicht ins Feuer werfen oder erhitzen. Vor Kurzschluss schützen. Nur mit geeigneten Ladegeräten laden. Von Kindern fernhalten. Bei Beschädigung nicht mehr verwenden.',
    productHighlights: [
      'Hochwertige Lithium-Ionen-Zelle für konstante Leistung',
      'Mehrfachschutz vor Überladung, Kurzschluss und Tiefentladung',
      'Geringe Selbstentladung – ideal für Langzeitlagerung',
      'Zuverlässige Energieversorgung für professionelle Anwendungen',
      'Optimales Preis-Leistungs-Verhältnis bei hoher Qualität',
    ],
  },

  charger: {
    id: 'charger',
    name: 'Ladegerät',
    description: 'Ladegeräte für Akkus und Batterien',
    keywords: ['ladegerät', 'charger', 'lader', 'charging', 'laden', 'netzteil'],
    technicalFields: [
      { key: 'input', label: 'Eingang', unit: 'V/A', required: true, fallback: '230V AC' },
      { key: 'output', label: 'Ausgang', unit: 'V/A', required: true, fallback: 'Nicht angegeben' },
      { key: 'chargingTime', label: 'Ladezeit', unit: 'h', required: false, fallback: 'Abhängig von Akkukapazität' },
      { key: 'compatibility', label: 'Kompatibilität', required: false, fallback: 'Siehe Beschreibung' },
      { key: 'features', label: 'Funktionen', required: false, fallback: 'Standard-Ladefunktion' },
      { key: 'weight', label: 'Gewicht', unit: 'g', required: false, fallback: 'Nicht angegeben' },
    ],
    uspTemplates: [
      'Intelligente Ladesteuerung - optimale Ladung für maximale Akkulebensdauer',
      'Mehrfachschutz - gegen Überladung, Überhitzung und Kurzschluss',
      'Schnellladefunktion - spart wertvolle Zeit',
      'Universal einsetzbar - kompatibel mit verschiedenen Akkutypen',
      'LED-Anzeige - zeigt den aktuellen Ladestatus',
      'Kompaktes Design - ideal für unterwegs',
      'Energieeffizient - niedriger Standby-Verbrauch',
    ],
    safetyNotice: '⚠️ Nur in trockenen Räumen verwenden. Nicht abdecken während des Ladevorgangs. Bei Überhitzung sofort vom Netz trennen. Kinder beaufsichtigen. Nur mit kompatiblen Akkus verwenden.',
    productHighlights: [
      'Hochwertige Elektronik für sichere Ladung',
      'Langlebige Konstruktion für jahrelangen Einsatz',
      'Einfache Bedienung und klare Anzeigen',
      'Zuverlässige Leistung bei kompakter Bauweise',
      'Optimales Preis-Leistungs-Verhältnis',
    ],
  },

  tool: {
    id: 'tool',
    name: 'Werkzeug',
    description: 'Elektrowerkzeuge und Handwerkzeuge',
    keywords: ['werkzeug', 'tool', 'bohrmaschine', 'säge', 'schleifer', 'schrauber', 'akkuschrauber'],
    technicalFields: [
      { key: 'power', label: 'Leistung', unit: 'W', required: true, fallback: 'Nicht angegeben' },
      { key: 'torque', label: 'Drehmoment', unit: 'Nm', required: false, fallback: 'Nicht angegeben' },
      { key: 'speed', label: 'Drehzahl', unit: 'min⁻¹', required: false, fallback: 'Nicht angegeben' },
      { key: 'voltage', label: 'Spannung', unit: 'V', required: false, fallback: 'Nicht angegeben' },
      { key: 'weight', label: 'Gewicht', unit: 'kg', required: false, fallback: 'Nicht angegeben' },
      { key: 'dimensions', label: 'Abmessungen', unit: 'mm', required: false, fallback: 'Nicht angegeben' },
    ],
    uspTemplates: [
      'Kraftvolle Leistung - für anspruchsvolle Arbeiten',
      'Ergonomisches Design - ermüdungsfreies Arbeiten auch bei langen Einsätzen',
      'Robuste Konstruktion - langlebig und zuverlässig',
      'Vielseitig einsetzbar - für professionelle und private Anwendungen',
      'Präzise Arbeitsweise - exakte Ergebnisse',
      'Einfache Handhabung - intuitive Bedienung',
      'Sicheres Arbeiten - integrierte Sicherheitsfunktionen',
    ],
    safetyNotice: '⚠️ Bedienungsanleitung vor Gebrauch lesen. Schutzkleidung (Brille, Handschuhe, Gehörschutz) tragen. Werkstück sicher fixieren. Von Kindern fernhalten. Regelmäßige Wartung durchführen.',
    productHighlights: [
      'Professionelle Qualität für anspruchsvolle Aufgaben',
      'Langlebige Verarbeitung und hochwertige Materialien',
      'Optimal ausbalanciert für präzise Kontrolle',
      'Vielseitig einsetzbar in Werkstatt und auf der Baustelle',
      'Hervorragendes Preis-Leistungs-Verhältnis',
    ],
  },

  accessory: {
    id: 'accessory',
    name: 'Zubehör',
    description: 'Kabel, Adapter, Klemmen, Taschen und weiteres Zubehör',
    keywords: ['kabel', 'cable', 'adapter', 'klemme', 'clip', 'tasche', 'case', 'halter', 'halterung', 'mount', 'zubehör', 'accessory', 'krokodilklemme', 'verbindung', 'stecker', 'buchse', 'connector'],
    technicalFields: [
      { key: 'connector', label: 'Anschluss', required: false, fallback: 'Standard' },
      { key: 'compatibility', label: 'Kompatibilität', required: true, fallback: 'Siehe Beschreibung' },
      { key: 'cableLength', label: 'Kabellänge', unit: 'cm', required: false, fallback: 'Nicht angegeben' },
      { key: 'material', label: 'Material', required: false, fallback: 'Hochwertige Verarbeitung' },
      { key: 'features', label: 'Besonderheiten', required: false, fallback: 'Zuverlässige Qualität' },
      { key: 'weight', label: 'Gewicht', unit: 'g', required: false, fallback: 'Nicht angegeben' },
    ],
    uspTemplates: [
      'Präzise Verbindung - zuverlässiger Kontakt für exakte Messungen',
      'Hochwertige Kontaktflächen - minimaler Übergangswiderstand',
      'Einfache Handhabung - schnelle Anbringung ohne Werkzeug',
      'Robust und langlebig - für den täglichen professionellen Einsatz',
      'Isolierte Ausführung - Schutz vor Kurzschlüssen',
      'Universal kompatibel - passend für viele Geräte',
      'Professionelle Qualität - zuverlässig in jeder Situation',
    ],
    safetyNotice: '⚠️ Vor dem Anschluss Polarität beachten. Nicht bei laufendem Betrieb an-/abstecken. Beschädigte Kabel nicht verwenden. Von Kindern fernhalten. Bei Defekten sofort austauschen.',
    productHighlights: [
      'Robuste Verarbeitung für langen Einsatz',
      'Hochwertige Materialien für beste Leitfähigkeit',
      'Einfache Installation und Handhabung',
      'Zuverlässige Kontaktierung',
      'Optimales Preis-Leistungs-Verhältnis',
    ],
  },

  testing_equipment: {
    id: 'testing_equipment',
    name: 'Messgerät',
    description: 'Mess- und Prüfgeräte für Akkus, Batterien und Elektronik',
    keywords: ['messgerät', 'tester', 'prüfgerät', 'multimeter', 'innenwiderstand', 'kapazität', 'measuring', 'testing', 'analyzer', 'meter'],
    technicalFields: [
      { key: 'measurementRange', label: 'Messbereich', required: true, fallback: 'Siehe Beschreibung' },
      { key: 'accuracy', label: 'Genauigkeit', unit: '%', required: false, fallback: 'Hoch' },
      { key: 'display', label: 'Anzeige', required: false, fallback: 'LCD' },
      { key: 'powerSupply', label: 'Stromversorgung', required: false, fallback: 'Batterie' },
      { key: 'features', label: 'Funktionen', required: false, fallback: 'Siehe Beschreibung' },
      { key: 'dimensions', label: 'Abmessungen', unit: 'mm', required: false, fallback: 'Nicht angegeben' },
    ],
    uspTemplates: [
      'Präzise Messungen - professionelle Genauigkeit für zuverlässige Ergebnisse',
      'Einfache Bedienung - intuitive Handhabung auch für Einsteiger',
      'Übersichtliches Display - klare Anzeige aller Messwerte',
      'Vielseitig einsetzbar - für verschiedene Mess-Anwendungen',
      'Robustes Gehäuse - langlebig und stoßfest',
      'Schnelle Messungen - Ergebnisse in Sekundenschnelle',
      'Professionelle Qualität - zuverlässig im täglichen Einsatz',
    ],
    safetyNotice: '⚠️ Nicht an stromführenden Teilen messen ohne entsprechende Schutzmaßnahmen. Messbereich beachten. Vor Feuchtigkeit schützen. Batterie bei längerer Nichtbenutzung entfernen. Kalibrierung regelmäßig prüfen.',
    productHighlights: [
      'Professionelle Messgenauigkeit',
      'Langlebige und robuste Konstruktion',
      'Einfache und sichere Handhabung',
      'Vielseitige Einsatzmöglichkeiten',
      'Hervorragendes Preis-Leistungs-Verhältnis',
    ],
  },
};

export function detectCategory(productData: any): string {
  // Support both snake_case (CSV/PDF) and camelCase (URL Scraper)
  const searchText = [
    productData.product_name || productData.productName || '',
    productData.short_intro || productData.shortIntro || '',
    productData.description || '',
    productData.extractedText || '',
    JSON.stringify(productData.bullets || []),
    // WICHTIG: ALLE technischen Felder prüfen (snake_case + camelCase)
    // Taschenlampen-Felder
    productData.led1 || '',
    productData.led2 || '',
    productData.maxLuminosity || productData.max_luminosity || '',
    productData.spotIntensity || productData.spot_intensity || '',
    productData.maxBeamDistance || productData.max_beam_distance || '',
    productData.powerSupply || productData.power_supply || '',
    // Batterie/Akku-Felder
    productData.nominalspannung || productData.nominalSpannung || '',
    productData.nominalkapazitaet || productData.nominalKapazitaet || '',
    productData.zellenchemie || productData.zellenChemie || '',
    productData.energie || '',
    // Abmessungen
    productData.laenge || productData.length || '',
    productData.breite || productData.width || '',
    productData.hoehe || productData.height || '',
  ].join(' ').toLowerCase();

  let bestCategory = 'battery';
  let bestScore = 0;

  for (const [categoryId, config] of Object.entries(PRODUCT_CATEGORIES)) {
    const matches = config.keywords.filter(keyword => 
      searchText.includes(keyword.toLowerCase())
    ).length;

    if (matches > bestScore) {
      bestScore = matches;
      bestCategory = categoryId;
    }
  }

  console.log(`Category detection: "${bestCategory}" with ${bestScore} keyword matches`);
  return bestCategory;
}

export function getCategoryConfig(categoryId: string): ProductCategoryConfig {
  return PRODUCT_CATEGORIES[categoryId] || PRODUCT_CATEGORIES.battery;
}

export function getAllCategories(): ProductCategoryConfig[] {
  return Object.values(PRODUCT_CATEGORIES);
}
