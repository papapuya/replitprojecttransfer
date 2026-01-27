import { ParsedProduct, extractProductTypeFromName } from './parser';
import OpenAI from 'openai';

const openai = new OpenAI();

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

const TEXT_VARIANTS = {
  A: {
    absatz1: 'Dieser Akku basiert auf bewährter Zelltechnologie und liefert die spezifizierten elektrischen Werte konstant über die gesamte Lebensdauer. Die technischen Parameter entsprechen den Herstellervorgaben.',
    absatz2: 'Die Zellen sind thermisch stabil und weisen eine geringe Selbstentladung auf. Der Innenwiderstand bleibt auch nach vielen Ladezyklen im optimalen Bereich für eine zuverlässige Leistungsabgabe.',
    absatz3: 'Die Bauform und Anschlusskonfiguration entsprechen den gängigen Industriestandards. Die elektrischen Verbindungen sind für den vorgesehenen Stromfluss dimensioniert.',
  },
  B: {
    absatz1: 'Dieser Akku wurde für sicherheitsrelevante Anwendungen entwickelt, bei denen Zuverlässigkeit an erster Stelle steht. Er gewährleistet die Energieversorgung auch in kritischen Situationen.',
    absatz2: 'Bei korrekter Anwendung und Lagerung erreicht dieser Akku seine maximale Lebensdauer. Vermeiden Sie Tiefentladung und extreme Temperaturen für beste Ergebnisse.',
    absatz3: 'Der Einbau sollte gemäß den Herstellerangaben des Geräts erfolgen. Achten Sie auf korrekte Polarität und sichere Befestigung der Anschlüsse.',
  },
  C: {
    absatz1: 'Der perfekte Ersatz für Ihren verschlissenen Originalakku. Dieser Akku bietet gleichwertige oder bessere Leistung und ist sofort einsatzbereit.',
    absatz2: 'Ein Akkutausch lohnt sich: Statt teurer Neuanschaffung bringt ein frischer Akku Ihr Gerät wieder auf volle Leistung. Die Investition macht sich schnell bezahlt.',
    absatz3: 'Der Wechsel ist unkompliziert und in wenigen Minuten erledigt. Kein Spezialwerkzeug erforderlich – einfach den alten Akku entfernen und den neuen einsetzen.',
  },
  D: {
    absatz1: 'Hochwertiger Ersatzakku mit optimaler Leistung. Passend und sofort einsatzbereit.',
    absatz2: 'Langlebig und zuverlässig. Viele Ladezyklen bei gleichbleibender Kapazität.',
    absatz3: 'Schneller Austausch, einfache Montage. Originale Passform garantiert.',
  },
};

const USP_VARIANTS = {
  A: [
    'Zuverlässige Energieversorgung im Not- und Bereitschaftsbetrieb',
    'Bewährte Zelltechnologie für konstante Leistung',
    'Direkter Ersatz für den Originalakku',
    'Einfache Integration in bestehende Systeme',
  ],
  B: [
    'Entwickelt für sicherheitsrelevante Dauereinsätze',
    'Langlebige Zellen für maximale Betriebssicherheit',
    'Passgenauer Austausch ohne Anpassungen',
    'Robuste Bauweise für zuverlässigen Betrieb',
  ],
  C: [
    'Sofort einsatzbereit als Ersatzakku',
    'Hochwertige Zelltechnologie für lange Lebensdauer',
    'Schneller Wechsel ohne Spezialwerkzeug',
    'Optimale Passform für problemlose Montage',
  ],
  D: [
    'Zuverlässig im Bereitschafts- und Notbetrieb',
    'Bewährte Akkutechnologie für den Dauereinsatz',
    'Idealer Ersatz für verschlissene Originalakkus',
    'Unkomplizierter Einbau in wenigen Minuten',
  ],
};

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

export async function renderAkkuHtml(
  productName: string,
  parsed: ParsedProduct,
  rowIndex: number
): Promise<RenderResult> {
  const variant = getVariant(rowIndex);
  const texts = TEXT_VARIANTS[variant];
  const usps = USP_VARIANTS[variant];

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
      .trim();
  }

  const html = `<h2>${productName}</h2>

<p>${texts.absatz1}</p>
<p>${texts.absatz2}</p>
<p>${texts.absatz3}</p>

<h3>Produkteigenschaften</h3>
<p>
✅ ${usps[0]}<br />
✅ ${usps[1]}<br />
✅ ${usps[2]}<br />
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
<li>${parsed.produkttyp || 'Akku'} ${parsed.type}, ${parsed.spannung}, ${parsed.kapazitaet}</li>
</ul>`;

  const bullet1 = productName;
  // Bullet 2: "Ersatzakku" oder "Akku" + technische Daten
  const produktLabel = productName.toLowerCase().includes('ersatz') ? 'Ersatzakku' : 'Akku';
  const bullet2 = `${produktLabel} ${parsed.spannung}, ${parsed.kapazitaet}${energiegehalt ? ', ' + energiegehalt : ''}`;
  // Bullet 3: Nur wenn Kompatibilität vorhanden, sonst weglassen
  const bullet3 = kompatibilitaet 
    ? `${parsed.produkttyp || 'Akku'} für ${kompatibilitaet}`
    : undefined;

  return {
    success: true,
    html,
    unNumber,
    hsCode,
    bullet1,
    bullet2,
    bullet3,
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
