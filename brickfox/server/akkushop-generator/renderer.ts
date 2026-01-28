import { ParsedProduct, extractProductTypeFromName } from './parser';
import { detectProductCategoryWithAI, getCategoryTextBlocks, ProductCategory } from './category-detection';
import OpenAI from 'openai';

const openai = new OpenAI();

// Häufige Rechtschreibfehler korrigieren
const SPELLING_CORRECTIONS: [RegExp, string][] = [
  [/Werzeuge/gi, 'Werkzeuge'],
  [/Werzeug([^e])/gi, 'Werkzeug$1'],
  [/Akku's/gi, 'Akkus'],
  [/Batterie's/gi, 'Batterien'],
  [/Taschelampe/gi, 'Taschenlampe'],
  [/Notleuchteakku/gi, 'Notleuchtenakku'],
  [/Ersatzakku's/gi, 'Ersatzakkus'],
];

// Übertriebene Marketing-Phrasen entfernen
const MARKETING_PHRASES_TO_REMOVE: RegExp[] = [
  /aus frischer Fertigung,?\s*/gi,
  /frische Fertigung,?\s*/gi,
  /brandneu,?\s*/gi,
  /nagelneu,?\s*/gi,
  /Top[-\s]?Qualität!?\s*/gi,
  /Premium[-\s]?Qualität!?\s*/gi,
  /Beste Qualität!?\s*/gi,
  /Höchste Qualität!?\s*/gi,
  /unschlagbar(er)?\s*(Preis)?!?\s*/gi,
  /Schnäppchen!?\s*/gi,
  /Hammerpreis!?\s*/gi,
  /Super[-\s]?Angebot!?\s*/gi,
  /Wow!?\s*/gi,
  /Wahnsinn!?\s*/gi,
  /Sensationell!?\s*/gi,
  /!{2,}/g, // Mehrfache Ausrufezeichen
];

function removeMarketingPhrases(text: string): string {
  let result = text;
  for (const pattern of MARKETING_PHRASES_TO_REMOVE) {
    result = result.replace(pattern, '');
  }
  // Doppelte Leerzeichen entfernen
  return result.replace(/\s{2,}/g, ' ').trim();
}

function correctSpelling(text: string): string {
  let result = text;
  for (const [pattern, replacement] of SPELLING_CORRECTIONS) {
    result = result.replace(pattern, replacement);
  }
  // Auch Marketing-Phrasen entfernen
  result = removeMarketingPhrases(result);
  return result;
}

export async function searchCompatibility(productName: string, productType: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Du bist ein Experte für Notbeleuchtung, Akkus und Ersatzteile. Analysiere den Produktnamen und finde heraus, für welche Geräte/Systeme dieser Akku passend ist.

Achte besonders auf:
- Herstellernamen im Produktnamen (z.B. Olympia, Beghelli, Saft, Ceag)
- Teilenummern oder Modellnummern
- Zellformat-Angaben (z.B. Sub-C, AA, etc.)

Antworte im Format: "Passend für [Hersteller]-[Systemtyp]" oder nur "[Hersteller], [Hersteller2]" wenn mehrere.
Keine langen Erklärungen, nur die Kompatibilitätsangabe.`
        },
        {
          role: 'user',
          content: `Produktname: "${productName}"\nProdukttyp: ${productType}\n\nFür welche Notleuchten/Geräte ist dieser Akku kompatibel?`
        }
      ],
      max_tokens: 150,
      temperature: 0.2,
    });
    
    return response.choices[0]?.message?.content?.trim() || '';
  } catch (error) {
    console.error('[Compatibility Search] Error:', error);
    return '';
  }
}

export function calculateEnergyContent(voltage: string, capacity: string): string {
  const voltageNum = parseFloat(voltage.replace(',', '.').replace(/[^0-9.]/g, ''));
  const capacityNum = parseFloat(capacity.replace(',', '.').replace(/[^0-9.]/g, ''));
  
  if (isNaN(voltageNum) || isNaN(capacityNum)) return '';
  
  const wh = (voltageNum * capacityNum) / 1000;
  return wh.toFixed(2).replace('.', ',') + ' Wh';
}

// Legacy-Varianten entfernt - jetzt kategoriespezifisch in category-detection.ts

export interface RenderResult {
  success: boolean;
  html?: string;
  error?: string;
  unNumber?: string;
  hsCode?: string;
  bullet1?: string;
  bullet2?: string;
  bullet3?: string;
}

function getVariant(rowIndex: number): 'A' | 'B' | 'C' | 'D' {
  const variants: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
  return variants[rowIndex % 4];
}

function determineUnHs(type: string): { unNumber: string; hsCode: string } {
  const typeLower = type.toLowerCase();

  if (typeLower.includes('nicd') || typeLower.includes('nickel-cadmium') || typeLower.includes('nickel cadmium')) {
    return { unNumber: 'UN 2796', hsCode: '8507 2000' };
  }

  if (typeLower.includes('nimh') || typeLower.includes('nickel-metall-hydrid') || typeLower.includes('nickel metall hydrid')) {
    return { unNumber: 'UN 3496', hsCode: '8507 6000' };
  }

  if (typeLower.includes('li-ion') || typeLower.includes('lithium')) {
    return { unNumber: 'UN 3481', hsCode: '8507 6000' };
  }

  return { unNumber: '', hsCode: '' };
}

function isRoundCell(parsed: ParsedProduct): boolean {
  return !!(parsed.durchmesser && parsed.laenge && !parsed.breite && !parsed.hoehe);
}

function buildLieferumfang(parsed: ParsedProduct, category: ProductCategory): string {
  // Produktbezeichnung je nach Kategorie
  let produktLabel: string;
  if (category === 'POWERBANK') {
    produktLabel = '1x Powerbank';
  } else if (category === 'KAMERAAKKU') {
    produktLabel = '1x Kamera-Akku';
  } else if (category === 'HAUSHALT') {
    produktLabel = parsed.produkttyp ? `1x ${parsed.produkttyp}` : '1x Geräteakku';
  } else if (category === 'MEDIZIN') {
    produktLabel = parsed.produkttyp ? `1x ${parsed.produkttyp}` : '1x Medizinakku';
  } else if (category === 'AIRSOFT') {
    produktLabel = '1x Airsoft-Akkupack';
  } else if (category === 'GARTEN') {
    produktLabel = '1x Gartengeräteakku';
  } else if (category === 'MOTORRAD') {
    produktLabel = '1x Motorrad-Starterbatterie';
  } else if (category === 'KRANAKKU') {
    produktLabel = '1x Kransteuerungsakku';
  } else if (category === 'SPEICHERBATTERIE') {
    produktLabel = '1x Speicherbatterie';
  } else if (category === 'BLEIAKKU') {
    produktLabel = '1x Bleiakku AGM/Gel';
  } else if (category === 'TUERSTEURUNG') {
    produktLabel = '1x Türsteuerungsakku';
  } else if (category === 'PUFFERBATTERIE') {
    produktLabel = '1x Pufferbatterie';
  } else if (category === 'FAHRRAD') {
    produktLabel = '1x E-Bike-Akku';
  } else if (category === 'RASIERER') {
    produktLabel = '1x Rasiererakku';
  } else if (category === 'HANDLEUCHTE') {
    produktLabel = '1x Handleuchtenakku';
  } else if (category === 'ZELLENTAUSCH') {
    produktLabel = '1x Zellentausch-Set / Akkupack zum Einbau';
  } else {
    produktLabel = parsed.produkttyp ? `1x ${parsed.produkttyp}` : '1x Akku';
  }
  
  // Technische Details sammeln (nur wenn vorhanden)
  const details: string[] = [];
  if (parsed.type && parsed.type !== 'undefined') {
    details.push(parsed.type);
  }
  if (parsed.spannung && parsed.spannung !== 'undefined') {
    details.push(parsed.spannung);
  }
  if (parsed.kapazitaet && parsed.kapazitaet !== 'undefined') {
    details.push(parsed.kapazitaet);
  }
  
  if (details.length > 0) {
    return `${produktLabel} ${details.join(', ')}`;
  }
  return produktLabel;
}

export async function renderAkkuHtml(
  productName: string,
  parsed: ParsedProduct,
  rowIndex: number
): Promise<RenderResult> {
  const variant = getVariant(rowIndex);
  
  // KI-gestützte Produktkategorisierung für bessere Genauigkeit
  const category = await detectProductCategoryWithAI(productName, parsed.originalHtml || '');
  const categoryTexts = getCategoryTextBlocks(category, variant);
  const texts = {
    absatz1: categoryTexts.absatz1,
    absatz2: categoryTexts.absatz2,
    absatz3: categoryTexts.absatz3,
  };
  const usps = categoryTexts.usps;

  const { unNumber, hsCode } = determineUnHs(parsed.type || '');

  let dimensionRows = '';
  if (isRoundCell(parsed)) {
    dimensionRows = `
<tr><td>Länge</td><td>${parsed.laenge}</td></tr>
<tr><td>Durchmesser</td><td>${parsed.durchmesser}</td></tr>`;
  } else {
    if (parsed.laenge) dimensionRows += `\n<tr><td>Länge</td><td>${parsed.laenge}</td></tr>`;
    if (parsed.breite) dimensionRows += `\n<tr><td>Breite</td><td>${parsed.breite}</td></tr>`;
    if (parsed.hoehe) dimensionRows += `\n<tr><td>Höhe</td><td>${parsed.hoehe}</td></tr>`;
  }

  const teilenummerRow = parsed.teilenummer 
    ? `\n<tr><td>Teilenummer</td><td>${parsed.teilenummer}</td></tr>` 
    : '';

  const kabellaengeRow = parsed.kabellaenge 
    ? `\n<tr><td>Kabellänge</td><td>${parsed.kabellaenge}</td></tr>` 
    : '';

  let energiegehalt = parsed.energiegehalt;
  if (!energiegehalt && parsed.spannung && parsed.kapazitaet) {
    energiegehalt = calculateEnergyContent(parsed.spannung, parsed.kapazitaet);
  }

  let kompatibilitaet = parsed.kompatibilitaet;
  
  if (!kompatibilitaet || kompatibilitaet === 'undefined' || kompatibilitaet === '-') {
    kompatibilitaet = extractProductTypeFromName(productName);
  }
  
  if (kompatibilitaet) {
    kompatibilitaet = kompatibilitaet
      .replace(/^Passend für\s*/i, '')
      .replace(/^Geeignet für\s*/i, '')
      .replace(/^Kompatibel mit\s*/i, '')
      .replace(/Technische Daten[:\s].*$/gi, '')
      .replace(/chemisches System.*$/gi, '')
      .replace(/Spannung.*$/gi, '')
      .replace(/Kapazität.*$/gi, '')
      .replace(/Energiegehalt.*$/gi, '')
      .replace(/Gewicht.*$/gi, '')
      .replace(/\s*\/\s*$/, '')
      .replace(/Ersetzt:\s*/gi, ', ') // "Ersetzt:" durch Komma ersetzen
      .replace(/([a-z])([A-Z])/g, '$1, $2') // "BoschBosch" -> "Bosch, Bosch"
      .trim();
    
    // Duplikate entfernen
    const parts = kompatibilitaet.split(/[,\/]+/).map(p => p.trim()).filter(Boolean);
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const part of parts) {
      // Normalisieren: Leerzeichen entfernen für Vergleich (z.B. "1 609 203 X10" vs "1609203X10")
      const normalized = part.toLowerCase().replace(/\s+/g, '');
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(part);
      }
    }
    kompatibilitaet = unique.join(', ');
  }

  // Bei kurzen Absätzen (Variante D oder generell kurze Texte) in einem Block zusammenfassen
  const totalLength = texts.absatz1.length + texts.absatz2.length + texts.absatz3.length;
  const isCompact = totalLength < 300 || variant === 'D';
  
  const textSection = isCompact
    ? `<p>${texts.absatz1} ${texts.absatz2} ${texts.absatz3}</p>`
    : `<p>${texts.absatz1}</p>
<p>${texts.absatz2}</p>
<p>${texts.absatz3}</p>`;

  const html = `<h2>${productName}</h2>

${textSection}

<h3>Produkteigenschaften</h3>
<p>
✅ ${usps[0]}<br>
✅ ${usps[1]}<br>
✅ ${usps[2]}<br>
✅ ${usps[3]}
</p>

<h3>Technische Daten</h3>
<table>
${parsed.produkttyp ? `<tr><td>Produkttyp</td><td>${parsed.produkttyp}</td></tr>` : ''}${teilenummerRow}${parsed.type ? `
<tr><td>Chemisches System</td><td>${parsed.type}</td></tr>` : ''}${parsed.spannung ? `
<tr><td>Spannung</td><td>${parsed.spannung}</td></tr>` : ''}${parsed.kapazitaet ? `
<tr><td>Kapazität</td><td>${parsed.kapazitaet}</td></tr>` : ''}${energiegehalt ? `
<tr><td>Energiegehalt</td><td>${energiegehalt}</td></tr>` : ''}${dimensionRows}${parsed.gewicht ? `
<tr><td>Gewicht</td><td>${parsed.gewicht}</td></tr>` : ''}${kabellaengeRow}${kompatibilitaet ? `
<tr><td>Kompatibilität</td><td>${kompatibilitaet}</td></tr>` : ''}
</table>

<p><br /><br /><br /></p>

<h3>Lieferumfang</h3>
<ul>
<li>${buildLieferumfang(parsed, category)}</li>
</ul>`;

  // Bulletpoints auf maximal 60 Zeichen begrenzen und Satzzeichen am Ende entfernen
  const truncateBullet = (text: string, maxLength: number = 60): string => {
    let result = text;
    if (result.length > maxLength) {
      // Am letzten Leerzeichen vor dem Limit abschneiden
      const truncated = result.substring(0, maxLength);
      const lastSpace = truncated.lastIndexOf(' ');
      if (lastSpace > maxLength - 15) {
        result = truncated.substring(0, lastSpace);
      } else {
        result = truncated;
      }
    }
    // Satzzeichen am Ende entfernen
    return result.replace(/[.,;:!?]+$/, '').trim();
  };

  const bullet1 = truncateBullet(productName);
  // Bullet 2: Produktlabel basierend auf Kategorie
  let produktLabel: string;
  if (category === 'POWERBANK') {
    produktLabel = 'Powerbank';
  } else if (category === 'KAMERAAKKU') {
    produktLabel = 'Kamera-Akku';
  } else if (category === 'HAUSHALT') {
    produktLabel = parsed.produkttyp || 'Geräteakku';
  } else if (category === 'MEDIZIN') {
    produktLabel = parsed.produkttyp || 'Medizinakku';
  } else if (category === 'AIRSOFT') {
    produktLabel = 'Airsoft-Akkupack';
  } else if (category === 'GARTEN') {
    produktLabel = 'Gartengeräteakku';
  } else if (category === 'MOTORRAD') {
    produktLabel = 'Motorrad-Starterbatterie';
  } else if (category === 'KRANAKKU') {
    produktLabel = 'Kransteuerungsakku';
  } else if (category === 'SPEICHERBATTERIE') {
    produktLabel = 'Speicherbatterie';
  } else if (category === 'BLEIAKKU') {
    produktLabel = 'Bleiakku';
  } else if (category === 'TUERSTEURUNG') {
    produktLabel = 'Türsteuerungsakku';
  } else if (category === 'PUFFERBATTERIE') {
    produktLabel = 'Pufferbatterie';
  } else if (category === 'FAHRRAD') {
    produktLabel = 'E-Bike-Akku';
  } else if (category === 'RASIERER') {
    produktLabel = 'Rasiererakku';
  } else if (category === 'HANDLEUCHTE') {
    produktLabel = 'Handleuchtenakku';
  } else if (category === 'ZELLENTAUSCH') {
    produktLabel = 'Zellentausch-Set';
  } else {
    produktLabel = productName.toLowerCase().includes('ersatz') ? 'Ersatzakku' : 'Akku';
  }
  
  // Bullet 2 zusammenstellen (nur vorhandene Werte)
  const bullet2Parts: string[] = [produktLabel];
  if (parsed.spannung && parsed.spannung !== 'undefined') {
    bullet2Parts.push(parsed.spannung);
  }
  if (parsed.kapazitaet && parsed.kapazitaet !== 'undefined') {
    bullet2Parts.push(parsed.kapazitaet);
  }
  if (energiegehalt) {
    bullet2Parts.push(energiegehalt);
  }
  const bullet2 = truncateBullet(bullet2Parts.join(', ').replace(/,\s*,/g, ','));
  
  // Bullet 3: Nur wenn Kompatibilität vorhanden, sonst weglassen
  let bullet3Label: string;
  if (category === 'POWERBANK') {
    bullet3Label = 'Powerbank';
  } else if (category === 'AIRSOFT') {
    bullet3Label = 'Airsoft-Akkupack';
  } else if (category === 'GARTEN') {
    bullet3Label = 'Gartengeräteakku';
  } else if (category === 'MOTORRAD') {
    bullet3Label = 'Motorrad-Starterbatterie';
  } else if (category === 'KRANAKKU') {
    bullet3Label = 'Kransteuerungsakku';
  } else if (category === 'SPEICHERBATTERIE') {
    bullet3Label = 'Speicherbatterie';
  } else if (category === 'BLEIAKKU') {
    bullet3Label = 'Bleiakku';
  } else if (category === 'TUERSTEURUNG') {
    bullet3Label = 'Türsteuerungsakku';
  } else if (category === 'PUFFERBATTERIE') {
    bullet3Label = 'Pufferbatterie';
  } else if (category === 'FAHRRAD') {
    bullet3Label = 'E-Bike-Akku';
  } else if (category === 'RASIERER') {
    bullet3Label = 'Rasiererakku';
  } else if (category === 'HANDLEUCHTE') {
    bullet3Label = 'Handleuchtenakku';
  } else if (category === 'ZELLENTAUSCH') {
    bullet3Label = 'Zellentausch-Set';
  } else {
    bullet3Label = parsed.produkttyp || 'Akku';
  }
  const bullet3 = kompatibilitaet 
    ? truncateBullet(`${bullet3Label} für ${kompatibilitaet}`)
    : undefined;

  return {
    success: true,
    html: correctSpelling(html),
    unNumber,
    hsCode,
    bullet1: correctSpelling(bullet1),
    bullet2: correctSpelling(bullet2),
    bullet3: bullet3 ? correctSpelling(bullet3) : undefined,
  };
}

export function validateRenderedHtml(html: string): { valid: boolean; error?: string } {
  const h2Match = html.match(/<h2>[\s\S]*?<\/h2>/);
  const h3Produkteigenschaften = html.indexOf('<h3>Produkteigenschaften</h3>');
  const h3TechnischeDaten = html.indexOf('<h3>Technische Daten</h3>');

  if (!h2Match || h3Produkteigenschaften === -1 || h3TechnischeDaten === -1) {
    return { valid: false, error: 'HTML-Struktur unvollständig' };
  }

  const textBeforeTable = html.substring(0, h3TechnischeDaten);

  const paragraphsMatch = textBeforeTable.match(/<p>[^<]*<\/p>/g);
  if (paragraphsMatch) {
    for (const p of paragraphsMatch) {
      if (p.includes('✅')) continue;
      if (/\d/.test(p)) {
        return { valid: false, error: 'Regelverstoß: technische Werte (Zahlen) in Fließtext-Absätzen' };
      }
    }
  }

  return { valid: true };
}
