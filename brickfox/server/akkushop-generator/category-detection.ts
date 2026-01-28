export type ProductCategory = 
  | 'NOTLEUCHTE'
  | 'FUNKAKKU'
  | 'WERKZEUGAKKU'
  | 'TELEFON'
  | 'MEDIZIN'
  | 'GENERISCH';

const CATEGORY_KEYWORDS: Record<ProductCategory, RegExp[]> = {
  NOTLEUCHTE: [
    /notleuchte/i,
    /notleuchtenakku/i,
    /sicherheitsbeleuchtung/i,
    /notbeleuchtung/i,
    /notlicht/i,
    /rettungszeichen/i,
  ],
  FUNKAKKU: [
    /funkakku/i,
    /funkgerät/i,
    /kenwood/i,
    /motorola/i,
    /icom/i,
    /sepura/i,
    /hytera/i,
    /fug\b/i,
    /handfunk/i,
    /betriebsfunk/i,
    /bos[-\s]?funk/i,
  ],
  WERKZEUGAKKU: [
    /werkzeugakku/i,
    /bosch\s+(akkuschrauber|professional|green)/i,
    /makita/i,
    /dewalt/i,
    /milwaukee/i,
    /metabo/i,
    /akkuschrauber/i,
    /akkubohrer/i,
    /elektrowerkzeug/i,
  ],
  TELEFON: [
    /telefon/i,
    /dect/i,
    /schnurlos/i,
    /festnetz/i,
    /gigaset/i,
    /panasonic.*telefon/i,
    /siemens.*telefon/i,
  ],
  MEDIZIN: [
    /messgerät/i,
    /scanner/i,
    /terminal/i,
    /industrie/i,
    /medical/i,
    /medizin/i,
    /patienten/i,
    /monitoring/i,
    /diagnose/i,
  ],
  GENERISCH: [],
};

export function detectProductCategory(productName: string, description: string): ProductCategory {
  const combined = `${productName} ${description}`.toLowerCase();
  
  const categoryScores: Record<ProductCategory, number> = {
    NOTLEUCHTE: 0,
    FUNKAKKU: 0,
    WERKZEUGAKKU: 0,
    TELEFON: 0,
    MEDIZIN: 0,
    GENERISCH: 0,
  };

  for (const [category, patterns] of Object.entries(CATEGORY_KEYWORDS) as [ProductCategory, RegExp[]][]) {
    if (category === 'GENERISCH') continue;
    
    for (const pattern of patterns) {
      if (pattern.test(combined)) {
        categoryScores[category] += pattern.source.length > 10 ? 2 : 1;
      }
    }
  }

  let maxCategory: ProductCategory = 'GENERISCH';
  let maxScore = 0;
  
  for (const [category, score] of Object.entries(categoryScores) as [ProductCategory, number][]) {
    if (score > maxScore) {
      maxScore = score;
      maxCategory = category;
    }
  }

  return maxCategory;
}

export interface CategoryTextBlocks {
  absatz1: string;
  absatz2: string;
  absatz3: string;
  usps: [string, string, string, string];
}

const CATEGORY_TEXT_BLOCKS: Record<ProductCategory, Record<'A' | 'B' | 'C' | 'D', CategoryTextBlocks>> = {
  NOTLEUCHTE: {
    A: {
      absatz1: 'Dieser Akku wurde speziell für den Einsatz in Notbeleuchtungssystemen konzipiert und gewährleistet die zuverlässige Energieversorgung im Bereitschaftsbetrieb.',
      absatz2: 'Die verwendete Zelltechnologie zeichnet sich durch geringe Selbstentladung und hohe Zyklenfestigkeit aus. Auch nach langer Standzeit im Ladezustand bleibt die volle Leistungsfähigkeit erhalten.',
      absatz3: 'Die Bauform entspricht den gängigen Standards für Notleuchten. Die Integration in bestehende Systeme erfolgt ohne aufwendige Anpassungen.',
      usps: [
        'Konzipiert für Notbeleuchtung und Sicherheitssysteme',
        'Zuverlässige Leistung auch nach langer Bereitschaftszeit',
        'Direkter Austausch gegen den Originalakku möglich',
        'Einfache Integration in bestehende Notleuchten',
      ],
    },
    B: {
      absatz1: 'Für sicherheitsrelevante Notbeleuchtungssysteme entwickelt, bei denen Ausfallsicherheit höchste Priorität hat. Der Akku gewährleistet die Stromversorgung genau dann, wenn sie gebraucht wird.',
      absatz2: 'Die Zelltechnologie ist auf maximale Zuverlässigkeit und Langlebigkeit ausgelegt. Regelmäßige Wartungsintervalle gemäß den geltenden Vorschriften sichern die Funktionsfähigkeit.',
      absatz3: 'Die Installation erfolgt gemäß den Vorgaben des Leuchtenherstellers. Auf korrekte Polarität und sichere Verbindungen ist zu achten.',
      usps: [
        'Entwickelt für sicherheitsrelevante Dauereinsätze',
        'Langlebige Zellen für maximale Betriebssicherheit',
        'Passgenauer Austausch ohne technische Anpassungen',
        'Robuste Ausführung für zuverlässigen Betrieb',
      ],
    },
    C: {
      absatz1: 'Der ideale Ersatz für verschlissene Akkus in Notleuchten und Rettungszeichenleuchten. Mit diesem Akku bringen Sie Ihre Sicherheitsbeleuchtung wieder auf den neuesten Stand.',
      absatz2: 'Ein rechtzeitiger Akkutausch stellt die Funktionsfähigkeit der Notbeleuchtung sicher und vermeidet kostspielige Ausfälle bei Prüfungen. Die Investition rechnet sich schnell.',
      absatz3: 'Der Wechsel ist unkompliziert und kann ohne Spezialwerkzeug durchgeführt werden. Alte Akkus fachgerecht entsorgen.',
      usps: [
        'Sofort einsatzbereiter Ersatz für Notleuchtenakkus',
        'Hochwertige Zellen für lange Nutzungsdauer',
        'Schneller Austausch ohne Spezialwerkzeug',
        'Optimale Passform für problemlose Montage',
      ],
    },
    D: {
      absatz1: 'Ersatzakku für Notleuchten und Sicherheitsbeleuchtung. Passend und sofort einsatzbereit.',
      absatz2: 'Langlebig und zuverlässig im Bereitschaftsbetrieb. Geringe Selbstentladung für dauerhafte Funktionsfähigkeit.',
      absatz3: 'Schnelle Montage, einfacher Einbau. Originale Passform garantiert.',
      usps: [
        'Zuverlässig im Bereitschafts- und Notbetrieb',
        'Bewährte Akkutechnologie für Dauereinsatz',
        'Direkter Ersatz für den Originalakku',
        'Unkomplizierter Einbau',
      ],
    },
  },
  FUNKAKKU: {
    A: {
      absatz1: 'Dieser Akku ist eine zuverlässige Energiequelle, die speziell für die Verwendung mit professionellen Funkgeräten und Walkie-Talkies entwickelt wurde.',
      absatz2: 'Die verwendete Zelltechnologie bietet eine langanhaltende Leistung, die für den Einsatz in anspruchsvollen Umgebungen geeignet ist. Auch bei intensiver Nutzung im Schichtdienst bleibt die volle Kapazität erhalten.',
      absatz3: 'Die Bauform entspricht den Spezifikationen des Funkgeräteherstellers. Die elektrischen Anschlüsse sind für den vorgesehenen Einsatz dimensioniert.',
      usps: [
        'Speziell für professionelle Funkgeräte entwickelt',
        'Langanhaltende Leistung im Dauerbetrieb',
        'Hochwertiger Ersatz für den Originalakku',
        'Passgenau für gängige Funkgerätemodelle',
      ],
    },
    B: {
      absatz1: 'Dieser Ersatzakku ist passend für eine Reihe von professionellen Funkgeräten und als hochwertiger Zubehörartikel konzipiert.',
      absatz2: 'Die robuste Zelltechnologie verkraftet häufiges Laden und Entladen ohne Leistungsverlust. Optimal für den täglichen Einsatz im Betriebs-, BOS- und Sicherheitsfunk.',
      absatz3: 'Der Einbau erfolgt werkzeuglos durch einfaches Einrasten. Vor der ersten Nutzung vollständig laden.',
      usps: [
        'Passend für verschiedene Funkgerätemodelle',
        'Hochwertiger markenkompatibeler Ersatz',
        'Passgenauer Austausch ohne Anpassungen',
        'Robuste Ausführung für den harten Arbeitsalltag',
      ],
    },
    C: {
      absatz1: 'Dieser Akku wurde speziell für die Kompatibilität mit professionellen Funkgeräten entwickelt.',
      absatz2: 'Durch die Integration moderner Zelltechnologie verfügt der Akku über eine hohe Energiedichte und ist dabei besonders langlebig.',
      absatz3: 'Der Wechsel ist schnell erledigt – einfach den alten Akku lösen und den neuen einsetzen.',
      usps: [
        'Speziell für Funkgerätkompatibilität entwickelt',
        'Hohe Energiedichte für lange Einsatzzeiten',
        'Schneller Akkuwechsel ohne Werkzeug',
        'Optimale Passform für problemloses Einsetzen',
      ],
    },
    D: {
      absatz1: 'Zuverlässiger Ersatzakku für professionelle Funkgeräte. Passend und sofort einsatzbereit.',
      absatz2: 'Langlebig und leistungsstark für den Dauereinsatz im Schichtdienst.',
      absatz3: 'Schneller Wechsel, einfache Handhabung. Originale Passform garantiert.',
      usps: [
        'Zuverlässig im Funkbetrieb',
        'Hohe Kapazität für lange Einsatzzeiten',
        'Direkter Ersatz für den Originalakku',
        'Unkomplizierter Akkuwechsel',
      ],
    },
  },
  WERKZEUGAKKU: {
    A: {
      absatz1: 'Dieser Akku liefert die benötigte Leistung für kraftvolle Einsätze mit Elektrowerkzeugen und gewährleistet konstante Arbeitsergebnisse.',
      absatz2: 'Die Zelltechnologie ist auf hohe Entladeströme ausgelegt und bietet auch bei anspruchsvollen Aufgaben volle Leistung bis zur letzten Ladung.',
      absatz3: 'Die Bauform entspricht den Vorgaben des Werkzeugherstellers. Der Akku rastet sicher ein und sitzt fest im Werkzeug.',
      usps: [
        'Konzipiert für kraftvolle Werkzeugeinsätze',
        'Konstante Leistung bis zur letzten Ladung',
        'Direkter Austausch gegen den Originalakku',
        'Sichere Verbindung mit dem Werkzeug',
      ],
    },
    B: {
      absatz1: 'Für den professionellen Einsatz auf der Baustelle und in der Werkstatt entwickelt. Der Akku hält auch bei Dauerbelastung zuverlässig durch.',
      absatz2: 'Die robuste Zelltechnologie ist auf viele Ladezyklen ausgelegt. Auch bei täglicher Nutzung bleibt die Kapazität lange erhalten.',
      absatz3: 'Der Einbau erfolgt werkzeuglos durch Einrasten. Ladegerät gemäß Herstellerangaben verwenden.',
      usps: [
        'Entwickelt für professionelle Dauereinsätze',
        'Langlebige Zellen für maximale Nutzungsdauer',
        'Passgenauer Austausch ohne Anpassungen',
        'Robuste Ausführung für den Arbeitsalltag',
      ],
    },
    C: {
      absatz1: 'Der ideale Ersatz für verbrauchte Werkzeugakkus. Mit diesem Akku arbeiten Ihre Elektrowerkzeuge wieder mit voller Kraft.',
      absatz2: 'Ein frischer Akku bringt neue Energie in Ihre Werkzeuge und erspart die teure Neuanschaffung.',
      absatz3: 'Der Wechsel ist schnell erledigt – einfach den alten Akku lösen und den neuen einsetzen.',
      usps: [
        'Sofort einsatzbereit als Ersatzakku',
        'Hochwertige Zellen für lange Nutzungsdauer',
        'Schneller Akkuwechsel ohne Werkzeug',
        'Optimale Passform für problemloses Einsetzen',
      ],
    },
    D: {
      absatz1: 'Ersatzakku für Elektrowerkzeuge. Passend und sofort einsatzbereit.',
      absatz2: 'Langlebig und leistungsstark. Viele Ladezyklen bei voller Kapazität.',
      absatz3: 'Schneller Wechsel, sichere Verbindung. Originale Passform.',
      usps: [
        'Zuverlässig unter Belastung',
        'Bewährte Akkutechnologie',
        'Idealer Ersatz für den Originalakku',
        'Unkomplizierter Akkuwechsel',
      ],
    },
  },
  TELEFON: {
    A: {
      absatz1: 'Dieser Akku wurde für den Einsatz in schnurlosen Telefonen entwickelt und gewährleistet lange Gesprächs- und Standby-Zeiten.',
      absatz2: 'Die Zelltechnologie zeichnet sich durch geringe Selbstentladung und hohe Zyklenfestigkeit aus. Die Leistung bleibt über viele Ladezyklen konstant.',
      absatz3: 'Die Bauform entspricht den Vorgaben des Telefonherstellers. Der Einbau erfolgt ohne Werkzeug.',
      usps: [
        'Konzipiert für schnurlose Telefone',
        'Lange Gesprächs- und Standby-Zeiten',
        'Direkter Austausch gegen den Originalakku',
        'Einfacher Einbau ohne Werkzeug',
      ],
    },
    B: {
      absatz1: 'Für den zuverlässigen Betrieb von schnurlosen Telefonen im Alltag entwickelt. Der Akku sorgt für unterbrechungsfreie Erreichbarkeit.',
      absatz2: 'Die Zelltechnologie ist auf häufiges Laden und Entladen ausgelegt und behält ihre Kapazität auch nach langer Nutzung.',
      absatz3: 'Die Installation ist einfach – Akkufach öffnen, alten Akku entnehmen, neuen einsetzen.',
      usps: [
        'Entwickelt für zuverlässigen Telefonbetrieb',
        'Langlebige Zellen für dauerhafte Leistung',
        'Passgenauer Austausch ohne Anpassungen',
        'Schnelle Installation in Minuten',
      ],
    },
    C: {
      absatz1: 'Der ideale Ersatz für schwache Telefonakkus. Mit diesem Akku telefonieren Sie wieder so lange wie am ersten Tag.',
      absatz2: 'Ein neuer Akku bringt Ihr Telefon wieder auf volle Leistung – günstiger als ein neues Gerät.',
      absatz3: 'Der Wechsel ist schnell erledigt – einfach Akkufach öffnen und tauschen.',
      usps: [
        'Sofort einsatzbereit als Ersatzakku',
        'Hochwertige Zellen für lange Nutzungsdauer',
        'Schneller Akkuwechsel ohne Werkzeug',
        'Optimale Passform für problemloses Einsetzen',
      ],
    },
    D: {
      absatz1: 'Ersatzakku für schnurlose Telefone. Passend und sofort einsatzbereit.',
      absatz2: 'Langlebig und zuverlässig. Lange Gesprächszeiten bei voller Kapazität.',
      absatz3: 'Schneller Wechsel, einfache Handhabung. Originale Passform.',
      usps: [
        'Zuverlässig im täglichen Einsatz',
        'Bewährte Akkutechnologie',
        'Idealer Ersatz für den Originalakku',
        'Unkomplizierter Akkuwechsel',
      ],
    },
  },
  MEDIZIN: {
    A: {
      absatz1: 'Dieser Akku wurde für den Einsatz in professionellen Mess- und Diagnosegeräten entwickelt und liefert konstante Leistung für präzise Ergebnisse.',
      absatz2: 'Die Zelltechnologie ist auf hohe Zuverlässigkeit ausgelegt. Die Leistung bleibt auch nach vielen Ladezyklen auf konstantem Niveau.',
      absatz3: 'Die Bauform entspricht den Spezifikationen des Geräteherstellers. Der Einbau erfolgt gemäß den Herstellerangaben.',
      usps: [
        'Konzipiert für professionelle Messgeräte',
        'Konstante Leistung für präzise Ergebnisse',
        'Direkter Austausch gegen den Originalakku',
        'Sichere Integration in bestehende Geräte',
      ],
    },
    B: {
      absatz1: 'Für den anspruchsvollen Einsatz in medizinischen und industriellen Geräten entwickelt. Der Akku gewährleistet zuverlässigen Betrieb.',
      absatz2: 'Die robuste Zelltechnologie ist auf Dauereinsatz ausgelegt und behält ihre Kapazität auch bei intensiver Nutzung.',
      absatz3: 'Der Einbau sollte gemäß den Vorgaben des Geräteherstellers erfolgen. Auf korrekte Polarität achten.',
      usps: [
        'Entwickelt für anspruchsvolle Dauereinsätze',
        'Langlebige Zellen für maximale Zuverlässigkeit',
        'Passgenauer Austausch ohne Anpassungen',
        'Robuste Ausführung für den Profieinsatz',
      ],
    },
    C: {
      absatz1: 'Der ideale Ersatz für verbrauchte Akkus in Mess- und Diagnosegeräten. Mit diesem Akku arbeitet Ihr Gerät wieder zuverlässig.',
      absatz2: 'Ein neuer Akku stellt die volle Funktionsfähigkeit wieder her und ist günstiger als ein Gerätetausch.',
      absatz3: 'Der Wechsel ist unkompliziert – den alten Akku entnehmen und den neuen einsetzen.',
      usps: [
        'Sofort einsatzbereit als Ersatzakku',
        'Hochwertige Zellen für lange Nutzungsdauer',
        'Schneller Akkuwechsel ohne Spezialwerkzeug',
        'Optimale Passform für problemloses Einsetzen',
      ],
    },
    D: {
      absatz1: 'Ersatzakku für professionelle Geräte. Passend und sofort einsatzbereit.',
      absatz2: 'Langlebig und zuverlässig. Konstante Leistung bei voller Kapazität.',
      absatz3: 'Schneller Wechsel, einfache Handhabung. Originale Passform.',
      usps: [
        'Zuverlässig im Profieinsatz',
        'Bewährte Akkutechnologie',
        'Idealer Ersatz für den Originalakku',
        'Unkomplizierter Akkuwechsel',
      ],
    },
  },
  GENERISCH: {
    A: {
      absatz1: 'Dieser Akku basiert auf bewährter Zelltechnologie und liefert konstante Leistung über die gesamte Lebensdauer.',
      absatz2: 'Die Zellen sind auf Zuverlässigkeit und Langlebigkeit ausgelegt. Die Selbstentladung ist gering, sodass auch nach längerer Lagerung volle Leistung abrufbar ist.',
      absatz3: 'Die Bauform und Anschlusskonfiguration entsprechen den gängigen Standards. Die Integration in bestehende Geräte erfolgt ohne Anpassungen.',
      usps: [
        'Zuverlässige Energieversorgung für vielfältige Einsätze',
        'Bewährte Zelltechnologie für konstante Leistung',
        'Direkter Ersatz für den Originalakku',
        'Einfache Integration in bestehende Systeme',
      ],
    },
    B: {
      absatz1: 'Für Anwendungen entwickelt, bei denen Zuverlässigkeit an erster Stelle steht. Der Akku gewährleistet die Energieversorgung auch bei intensiver Nutzung.',
      absatz2: 'Bei korrekter Anwendung und Lagerung erreicht dieser Akku seine maximale Lebensdauer. Die Zelltechnologie ist auf Langlebigkeit ausgelegt.',
      absatz3: 'Der Einbau sollte gemäß den Herstellerangaben des Geräts erfolgen. Auf korrekte Polarität und sichere Befestigung achten.',
      usps: [
        'Entwickelt für zuverlässige Dauereinsätze',
        'Langlebige Zellen für maximale Betriebssicherheit',
        'Passgenauer Austausch ohne Anpassungen',
        'Robuste Bauweise für zuverlässigen Betrieb',
      ],
    },
    C: {
      absatz1: 'Der perfekte Ersatz für verschlissene Akkus. Dieser Akku bietet gleichwertige oder bessere Leistung und ist sofort einsatzbereit.',
      absatz2: 'Ein Akkutausch lohnt sich: Statt teurer Neuanschaffung bringt ein frischer Akku Ihr Gerät wieder auf volle Leistung.',
      absatz3: 'Der Wechsel ist unkompliziert und in wenigen Minuten erledigt. Kein Spezialwerkzeug erforderlich.',
      usps: [
        'Sofort einsatzbereit als Ersatzakku',
        'Hochwertige Zelltechnologie für lange Lebensdauer',
        'Schneller Wechsel ohne Spezialwerkzeug',
        'Optimale Passform für problemlose Montage',
      ],
    },
    D: {
      absatz1: 'Hochwertiger Ersatzakku mit optimaler Leistung. Passend und sofort einsatzbereit.',
      absatz2: 'Langlebig und zuverlässig. Viele Ladezyklen bei gleichbleibender Kapazität.',
      absatz3: 'Schneller Austausch, einfache Montage. Originale Passform garantiert.',
      usps: [
        'Zuverlässig im Bereitschafts- und Dauerbetrieb',
        'Bewährte Akkutechnologie für den Dauereinsatz',
        'Idealer Ersatz für verschlissene Originalakkus',
        'Unkomplizierter Einbau in wenigen Minuten',
      ],
    },
  },
};

export function getCategoryTextBlocks(
  category: ProductCategory,
  variant: 'A' | 'B' | 'C' | 'D'
): CategoryTextBlocks {
  return CATEGORY_TEXT_BLOCKS[category][variant];
}
