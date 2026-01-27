import { ParsedProduct } from './parser';

const TEXT_VARIANTS = {
  A: {
    absatz1: 'Dieser hochwertige Ersatzakku wurde speziell für den professionellen Einsatz in Notbeleuchtungssystemen entwickelt. Er bietet zuverlässige Leistung und gewährleistet die Sicherheit in kritischen Situationen.',
    absatz2: 'Dank der bewährten Zelltechnologie liefert dieser Akku eine konstante und langanhaltende Energieversorgung. Die robuste Bauweise garantiert eine lange Lebensdauer auch bei häufigem Gebrauch.',
    absatz3: 'Der Akku lässt sich problemlos in bestehende Systeme integrieren. Die kompakten Abmessungen und die standardisierten Anschlüsse ermöglichen einen schnellen und unkomplizierten Austausch.',
  },
  B: {
    absatz1: 'Ein zuverlässiger Energiespeicher für anspruchsvolle Anwendungen in der Notbeleuchtung. Dieser Akku erfüllt höchste Qualitätsstandards und ist für den dauerhaften Betrieb ausgelegt.',
    absatz2: 'Die verwendete Zelltechnologie zeichnet sich durch ihre Zuverlässigkeit und Langlebigkeit aus. Dieser Akku behält auch nach vielen Ladezyklen seine volle Kapazität.',
    absatz3: 'Durch die durchdachte Konstruktion gestaltet sich der Einbau besonders einfach. Die mitgelieferten Anschlüsse passen zu gängigen Notleuchten-Systemen.',
  },
  C: {
    absatz1: 'Dieser Notleuchtenakku ist die ideale Wahl für sicherheitsrelevante Anwendungen. Er liefert zuverlässig Energie, wenn sie am dringendsten benötigt wird.',
    absatz2: 'Gefertigt nach strengen Qualitätsvorgaben überzeugt dieser Akku durch seine Beständigkeit und gleichbleibende Leistung. Die moderne Zelltechnologie sorgt für optimale Ergebnisse.',
    absatz3: 'Der Austausch ist schnell erledigt und erfordert kein Spezialwerkzeug. Die Bauform entspricht den gängigen Standards für Notbeleuchtungssysteme.',
  },
  D: {
    absatz1: 'Für den Einsatz in Notbeleuchtungsanlagen konzipiert, bietet dieser Akku maximale Zuverlässigkeit. Er ist die optimale Lösung für den professionellen Bereich.',
    absatz2: 'Die hochwertige Zelltechnologie garantiert eine stabile Energieabgabe über die gesamte Lebensdauer. Selbst unter anspruchsvollen Bedingungen liefert dieser Akku konstante Leistung.',
    absatz3: 'Der Akku fügt sich nahtlos in vorhandene Installationen ein. Die standardkonforme Ausführung vereinfacht den Einbau erheblich.',
  },
};

const USP_VARIANTS = {
  A: [
    'Zuverlässige Energieversorgung für Notbeleuchtungssysteme',
    'Langlebige Zelltechnologie für dauerhaften Einsatz',
    'Kompatibel mit gängigen Notleuchten-Systemen',
    'Einfacher Austausch ohne Spezialwerkzeug',
  ],
  B: [
    'Optimiert für sicherheitsrelevante Anwendungen',
    'Konstante Leistung über viele Ladezyklen',
    'Passend für standardisierte Notbeleuchtung',
    'Kompakte Bauform für flexible Installation',
  ],
  C: [
    'Hohe Kapazität für lange Betriebszeiten',
    'Robuste Konstruktion für den Dauereinsatz',
    'Universelle Kompatibilität mit vielen Systemen',
    'Schneller und unkomplizierter Wechsel',
  ],
  D: [
    'Professionelle Qualität für kritische Anwendungen',
    'Bewährte Technologie für maximale Zuverlässigkeit',
    'Breite Kompatibilität mit Notleuchten',
    'Werkzeugfreie Montage möglich',
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

export function renderAkkuHtml(
  productName: string,
  parsed: ParsedProduct,
  rowIndex: number
): RenderResult {
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
<tr><td>Produkttyp</td><td>${parsed.produkttyp || 'Akku'}</td></tr>${teilenummerRow}
<tr><td>Chemisches System</td><td>${parsed.type}</td></tr>
<tr><td>Spannung</td><td>${parsed.spannung}</td></tr>
<tr><td>Kapazität</td><td>${parsed.kapazitaet}</td></tr>
<tr><td>Energiegehalt</td><td>${parsed.energiegehalt || '-'}</td></tr>${dimensionRows}
<tr><td>Gewicht</td><td>${parsed.gewicht}</td></tr>${kabellaengeRow}
<tr><td>Kompatibilität</td><td>${parsed.kompatibilitaet}</td></tr>
</table>

<p><br /><br /><br /></p>

<h3>Lieferumfang</h3>
<ul>
<li>${parsed.produkttyp || 'Akku'} ${parsed.type}, ${parsed.spannung}, ${parsed.kapazitaet}</li>
</ul>`;

  const bullet1 = productName;
  const bullet2 = `${parsed.spannung}, ${parsed.kapazitaet}${parsed.energiegehalt ? ', ' + parsed.energiegehalt : ''}`;
  const bullet3 = `${parsed.produkttyp || 'Akku'} für ${parsed.kompatibilitaet}`;

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
