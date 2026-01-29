export type ProductCategory = 
  | 'NOTLEUCHTE'
  | 'FUNKAKKU'
  | 'WERKZEUGAKKU'
  | 'TELEFON'
  | 'MEDIZIN'
  | 'KAMERAAKKU'
  | 'POWERBANK'
  | 'HAUSHALT'
  | 'AIRSOFT'
  | 'GARTEN'
  | 'MOTORRAD'
  | 'KRANAKKU'
  | 'SPEICHERBATTERIE'
  | 'BLEIAKKU'
  | 'TUERSTEURUNG'
  | 'PUFFERBATTERIE'
  | 'FAHRRAD'
  | 'RASIERER'
  | 'HANDLEUCHTE'
  | 'ZELLENTAUSCH'
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
    /albrecht/i,
    /cb[-\s]?funk/i,
    /walkie[-\s]?talkie/i,
    /pmr[-\s]?funk/i,
    /mc[-\s]?\d+/i,
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
    /handyakku/i,
    /handy[-\s]?akku/i,
    /smartphone[-\s]?akku/i,
    /mobiltelefon/i,
  ],
  MEDIZIN: [
    /medical/i,
    /medizin/i,
    /medizinakku/i,
    /medizingerät/i,
    /patienten/i,
    /patientenlifter/i,
    /lifter[-\s]?akku/i,
    /pflegebett/i,
    /rollstuhl/i,
    /elektrorollstuhl/i,
    /rehatechnik/i,
    /therapiegerät/i,
    /infusionspumpe/i,
    /beatmungsgerät/i,
    /defibrillator/i,
    /cpap/i,
    /sauerstoffkonzentrator/i,
    /blutdruckmessgerät/i,
    /blutzuckermessgerät/i,
    /invacare/i,
    /permobil/i,
    /otto[-\s]?bock/i,
    /sunrise[-\s]?medical/i,
  ],
  KAMERAAKKU: [
    /kamera/i,
    /camera/i,
    /foto/i,
    /camcorder/i,
    /videoakku/i,
    /videokamera/i,
    /video[-\s]?akku/i,
    /canon\s*(eos|powershot)?/i,
    /nikon\s*(d\d|z\d|coolpix)?/i,
    /sony\s*(alpha|a\d|nex)?/i,
    /fuji(film)?\s*(x-|np-)?/i,
    /panasonic\s*(lumix|dmw|vw-vb)?/i,
    /olympus/i,
    /pentax/i,
    /gopro/i,
    /veracity/i,
    /pointsource/i,
    /vad[-\s]?ps[-\s]?bm/i,
    /poe[-\s]?injector/i,
    /ip[-\s]?kamera/i,
    /überwachungskamera/i,
    /np-f/i,
    /np-w/i,
    /lp-e/i,
    /en-el/i,
    /bp-\d/i,
    /blc12/i,
    /blf19/i,
    /vw-vb\w+/i,
    /cga-d\d+/i,
    /cgr-d\d+/i,
    /ladeschale/i,
    /ladestation/i,
  ],
  POWERBANK: [
    /powerbank/i,
    /power\s*bank/i,
    /mobil(e|er)?\s*lader/i,
    /externer?\s*akku\s*(pack)?$/i,
    /usb[-\s]?lader/i,
    /portable\s*charger/i,
  ],
  HAUSHALT: [
    /staubsauger/i,
    /handstaubsauger/i,
    /saugroboter/i,
    /reinigungsgerät/i,
    /reinigungsgeräteakku/i,
    /bodenstaubsauger/i,
    /akkusauger/i,
    /kirby/i,
    /dyson/i,
    /vorwerk/i,
    /miele.*sauger/i,
    /roomba/i,
    /irobot/i,
    /fensterreiniger/i,
    /wischroboter/i,
    /zahnbürste/i,
    /zahnbürstenakku/i,
    /oral[-\s]?b/i,
    /philips\s*sonicare/i,
    /black\s*&?\s*decker.*cv/i,
    /black\s*&?\s*decker.*dustbuster/i,
    /black\s*&?\s*decker.*reinig/i,
    /cv\s*\d{4}/i,
    /dustbuster/i,
    /bose/i,
    /acoustic\s*wave/i,
    /music\s*system/i,
    /soundlink/i,
    /sounddock/i,
    /sonos/i,
    /jbl/i,
    /harman[-\s]?kardon/i,
    /bluetooth[-\s]?lautsprecher/i,
    /lautsprecher[-\s]?akku/i,
    /audio[-\s]?system/i,
    /hi[-\s]?fi/i,
    /musikanlage/i,
  ],
  AIRSOFT: [
    /airsoft/i,
    /softair/i,
    /aeg[-\s]?akku/i,
    /classic\s*army/i,
    /tokyo\s*marui/i,
    /g&g\s*armament/i,
    /ics\s*airsoft/i,
    /krytac/i,
    /vfc/i,
    /cyma/i,
    /jg\s*works/i,
    /asg/i,
    /umarex/i,
    /gewehr[-\s]?akku/i,
    /mp5[-\s]?akku/i,
    /m4[-\s]?akku/i,
    /ak47[-\s]?akku/i,
    /akkupack.*l\d+x\d+/i,
    /nimh.*gewehr/i,
    /lipo.*airsoft/i,
    /mini[-\s]?tamiya/i,
    /large[-\s]?tamiya/i,
    /dean.*stecker/i,
    /socom/i,
  ],
  GARTEN: [
    /gartengerät/i,
    /gartengeräteakku/i,
    /garten[-\s]?akku/i,
    /rasenmäher/i,
    /akkurasenmäher/i,
    /heckenschere/i,
    /akkuheckenschere/i,
    /rasentrimmer/i,
    /grasschere/i,
    /laubbläser/i,
    /laubsauger/i,
    /astschere/i,
    /kettensäge/i,
    /akku[-\s]?säge/i,
    /gardena/i,
    /husqvarna/i,
    /stihl/i,
    /einhell/i,
    /wolf[-\s]?garten/i,
    /black\s*&?\s*decker/i,
    /greenworks/i,
    /worx/i,
    /ryobi.*garten/i,
    /al[-\s]?ko/i,
    /bosch.*garten/i,
    /robomow/i,
    /automower/i,
    /mähroboter/i,
    /rebschere/i,
    /akku[-\s]?rebschere/i,
    /weinberg/i,
    /baumschere/i,
    /gartenschere/i,
    /strauchschere/i,
    /pellenc/i,
    /felco/i,
    /campagnola/i,
    /infaco/i,
  ],
  MOTORRAD: [
    /motorrad/i,
    /motorradbatterie/i,
    /roller/i,
    /rollerbatterie/i,
    /quad/i,
    /atv/i,
    /schneemobil/i,
    /jetski/i,
    /starterbatterie/i,
    /blei[-\s]?gel/i,
    /gel[-\s]?akku/i,
    /gel[-\s]?batterie/i,
    /agm[-\s]?batterie/i,
    /agm[-\s]?akku/i,
    /bleiakku/i,
    /powersports/i,
    /ytx\d+/i,
    /ctx\d+/i,
    /gtx\d+/i,
    /yb\d+/i,
    /cb\d+/i,
    /12n\d+/i,
    /din\s*\d{5}/i,
    /etn\s*\d{3}/i,
    /\d+a\s*\(en\)/i,
    /kaltstartstrom/i,
    /panther/i,
    /yuasa/i,
    /varta\s*powersports/i,
    /banner/i,
    /exide/i,
    /intact/i,
    /landport/i,
    /bs[-\s]?battery/i,
    /honda.*batterie/i,
    /yamaha.*batterie/i,
    /suzuki.*batterie/i,
    /kawasaki.*batterie/i,
    /bmw.*batterie/i,
    /harley.*batterie/i,
    /vespa.*batterie/i,
    /piaggio.*batterie/i,
    /startkoffer/i,
    /starterkoffer/i,
    /startgerät/i,
    /starthilfe/i,
    /starthilfegerät/i,
    /jumpstarter/i,
    /jump[-\s]?starter/i,
    /booster/i,
    /minibooster/i,
    /powerstart/i,
    /noco/i,
    /ctek/i,
    /dino[-\s]?kraftpaket/i,
    /kunzer/i,
    /apa/i,
    /einhell.*start/i,
  ],
  KRANAKKU: [
    /kranakku/i,
    /kransteuerung/i,
    /fernsteuerung.*kran/i,
    /autec/i,
    /hbc/i,
    /hetronic/i,
    /palfinger/i,
    /ikusi/i,
    /hiab/i,
    /nbb/i,
    /laird/i,
    /cattron/i,
    /theimeg/i,
    /gross[-\s]?funk/i,
    /funkfernsteuerung/i,
    /lpm\d+/i,
    /fub\d+/i,
    /ba\d{6}/i,
  ],
  SPEICHERBATTERIE: [
    /speicherbatterie/i,
    /speicherakku/i,
    /pufferbatterie.*sps/i,
    /sps[-\s]?batterie/i,
    /plc[-\s]?batterie/i,
    /steuerungsbatterie/i,
    /siemens\s*6es/i,
    /omron.*batterie/i,
    /mitsubishi.*batterie/i,
    /fanuc/i,
    /yaskawa/i,
    /motoman/i,
    /allen[-\s]?bradley/i,
    /modicon/i,
    /schneider.*batterie/i,
    /bosch[-\s]?rexroth/i,
    /toshiba.*batterie/i,
    /honeywell.*batterie/i,
    /er\d{5}/i,
    /cr\d{5}/i,
    /digitaler[-\s]?tachograph/i,
    /dtco/i,
  ],
  BLEIAKKU: [
    /bleiakku/i,
    /bleibatterie/i,
    /blei[-\s]?gel/i,
    /deep[-\s]?cycle/i,
    /tracline/i,
    /ogiv\d+/i,
    /longlife.*blei/i,
    /fiamm\s*\d/i,
    /fiamm\s*(monolite|2sla|4sla|6sla|12sla)/i,
    /multipower\s*(mp|ml)/i,
    /ultracell\s*(ul|ucg|uc)/i,
    /ssb\s*s(b|bl|bv|bh)/i,
    /wing\s*btx/i,
    /rpower\s*ogiv/i,
    /monolite/i,
    /2sla\d+/i,
    /4sla\d+/i,
    /6sla\d+/i,
    /12sla\d+/i,
    /agm\s*blei/i,
  ],
  TUERSTEURUNG: [
    /türsteuerung/i,
    /akku.*türsteuerung/i,
    /automatiktür/i,
    /besam/i,
    /dorma/i,
    /record\s*(sta|atre)/i,
    /portalp/i,
    /ats.*automatik/i,
    /karusselltür/i,
    /schiebetür.*akku/i,
  ],
  PUFFERBATTERIE: [
    /pufferbatterie.*alarm/i,
    /alarmbatterie/i,
    /alarmanlage.*akku/i,
    /alarmanlage.*batterie/i,
    /daitem/i,
    /elkron/i,
    /technoalarm/i,
    /silentron/i,
    /jablotron/i,
    /visonic.*batterie/i,
    /telenot.*batterie/i,
    /batli\d+/i,
    /batxu\d+/i,
    /batv\d+/i,
    /sicherheitssystem.*batterie/i,
  ],
  FAHRRAD: [
    /fahrradakku/i,
    /e[-\s]?bike[-\s]?akku/i,
    /pedelec/i,
    /elektrofahrrad/i,
    /heinzmann/i,
    /hercules.*akku/i,
    /giant.*akku/i,
    /pegasus.*akku/i,
    /sparta.*akku/i,
    /mercedes.*bike/i,
    /schachner/i,
    /nta\d{4}/i,
    /lafree/i,
    /twist.*energy/i,
  ],
  RASIERER: [
    /rasiererakku/i,
    /rasiererbatterie/i,
    /haarschneider.*akku/i,
    /trimmer.*akku/i,
    /braun.*rasierer/i,
    /philips.*rasierer/i,
    /norelco/i,
    /remington.*akku/i,
    /wella.*akku/i,
    /kadus/i,
    /silvercrest.*rasierer/i,
    /panasonic.*rasierer/i,
    /ep\d{2,3}/i,
    /bht\s*\d{4}/i,
  ],
  HANDLEUCHTE: [
    /handleuchte/i,
    /handleuchtenakku/i,
    /taschenlampe.*akku/i,
    /arbeitsleuchte.*akku/i,
    /streamlight/i,
    /survivor.*akku/i,
    /acculux/i,
    /euras.*starlight/i,
    /ceag.*handleuchte/i,
    /bosch.*b\d{4}/i,
    /eisemann/i,
    /ex[-\s]?geschützt/i,
    /atex.*lampe/i,
    /knicklampe/i,
  ],
  ZELLENTAUSCH: [
    /zellentausch/i,
    /zellenwechsel/i,
    /zellenersatz/i,
    /ersatz[-\s]?zellen/i,
    /reparatur[-\s]?akku/i,
    /selbsteinbau/i,
    /zum\s*einbau/i,
  ],
  GENERISCH: [],
};

import OpenAI from 'openai';

const openai = new OpenAI();

const CATEGORY_DESCRIPTIONS: Record<ProductCategory, string> = {
  NOTLEUCHTE: 'Akkus für Notbeleuchtung, Sicherheitsbeleuchtung, Rettungszeichenleuchten, Fluchtwegleuchten',
  FUNKAKKU: 'Akkus für Funkgeräte, Walkie-Talkies, BOS-Funk, Betriebsfunk (Motorola, Kenwood, Hytera)',
  WERKZEUGAKKU: 'Akkus für Elektrowerkzeuge, Akkuschrauber, Bohrmaschinen (Bosch, Makita, DeWalt)',
  TELEFON: 'Akkus für schnurlose Telefone, DECT-Telefone, Haustelefone',
  MEDIZIN: 'Akkus für medizinische Geräte, Rollstühle, Patientenlifter, Reha-Geräte, Pflegebetten',
  KAMERAAKKU: 'Akkus für Digitalkameras, Camcorder, Videokameras (Canon, Sony, Nikon)',
  POWERBANK: 'Mobile Powerbanks, externe Akkupacks für USB-Geräte',
  HAUSHALT: 'Akkus für Staubsauger, Saugroboter, Zahnbürsten (Dyson, Vorwerk, Oral-B)',
  AIRSOFT: 'Akkupacks für Airsoft-Gewehre, AEG-Systeme, Softair',
  GARTEN: 'Akkus für Gartengeräte, Rasenmäher, Heckenscheren, Laubbläser',
  MOTORRAD: 'Starterbatterien für Motorräder, Roller, Quad, Schneemobile (YTX, CTX, GTX)',
  KRANAKKU: 'Akkus für Kranfernsteuerungen, industrielle Funksteuerungen (Autec, HBC, Hetronic)',
  SPEICHERBATTERIE: 'Speicherbatterien für SPS, Industriesteuerungen (Siemens, Omron, Mitsubishi)',
  BLEIAKKU: 'Bleiakkus AGM/Gel für USV-Anlagen, Solaranlagen, stationäre Anwendungen',
  TUERSTEURUNG: 'Akkus für automatische Türsteuerungen, Automatiktüren (Besam, Dorma, Record)',
  PUFFERBATTERIE: 'Pufferbatterien für Alarmanlagen, Sicherheitssysteme (Daitem, Elkron)',
  FAHRRAD: 'Akkus für E-Bikes, Pedelecs, Elektrofahrräder (Bosch, Shimano)',
  RASIERER: 'Akkus für elektrische Rasierer, Haarschneider (Braun, Philips, Wella)',
  HANDLEUCHTE: 'Akkus für professionelle Handleuchten, Arbeitsleuchten, Taschenlampen (Streamlight, Acculux)',
  ZELLENTAUSCH: 'Zellentausch-Sets, Akkupacks zum Einbau in Originalgehäuse, Reparatur-Akkus, Startkoffer',
  GENERISCH: 'Allgemeine Akkus ohne spezifische Kategorie',
};

export function detectProductCategory(productName: string, description: string): ProductCategory {
  const combined = `${productName} ${description}`.toLowerCase();
  
  const categoryScores: Record<ProductCategory, number> = {
    NOTLEUCHTE: 0,
    FUNKAKKU: 0,
    WERKZEUGAKKU: 0,
    TELEFON: 0,
    MEDIZIN: 0,
    KAMERAAKKU: 0,
    POWERBANK: 0,
    HAUSHALT: 0,
    AIRSOFT: 0,
    GARTEN: 0,
    MOTORRAD: 0,
    KRANAKKU: 0,
    SPEICHERBATTERIE: 0,
    BLEIAKKU: 0,
    TUERSTEURUNG: 0,
    PUFFERBATTERIE: 0,
    FAHRRAD: 0,
    RASIERER: 0,
    HANDLEUCHTE: 0,
    ZELLENTAUSCH: 0,
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

// Extrahiert das Gerät nach "passend für" aus dem Produktnamen
export function extractDeviceFromProductName(productName: string): string | null {
  // Patterns für "passend für [Gerät]" - inkl. kaputtes Encoding "fÃ¼r"
  const patterns = [
    /passend\s+(?:f[üu]r|fÃ¼r)\s+(.+?)(?:\s*,\s*|\s*$)/i,
    /(?:f[üu]r|fÃ¼r)\s+(.+?)(?:\s*,\s*|\s*$)/i,
  ];
  
  for (const pattern of patterns) {
    const match = productName.match(pattern);
    if (match && match[1]) {
      // Bereinigen: Entferne führende/trailing Leerzeichen
      let device = match[1].trim();
      // Stoppe bei Komma oder "passend"
      const commaIndex = device.indexOf(',');
      if (commaIndex > 0) {
        device = device.substring(0, commaIndex).trim();
      }
      if (device.length > 3) {
        return device;
      }
    }
  }
  return null;
}

export async function detectProductCategoryWithAI(productName: string, description: string): Promise<ProductCategory | string> {
  // WICHTIG: Wenn Produktname mit "Zellentausch" beginnt, IMMER ZELLENTAUSCH zurückgeben
  if (/^zellentausch/i.test(productName.trim())) {
    console.log(`[CategoryDetection] "${productName.substring(0, 60)}" → ZELLENTAUSCH (Name beginnt mit Zellentausch)`);
    return 'ZELLENTAUSCH';
  }
  
  // VORRANG: Produkttyp aus Produktnamen hat Vorrang vor anderen Keywords
  const produktnameVorrang: { pattern: RegExp; category: ProductCategory }[] = [
    { pattern: /speicherbatterie/i, category: 'SPEICHERBATTERIE' },
    { pattern: /pufferbatterie/i, category: 'PUFFERBATTERIE' },
    { pattern: /notleuchtenakku/i, category: 'NOTLEUCHTE' },
    { pattern: /kranakku/i, category: 'KRANAKKU' },
    { pattern: /funkakku/i, category: 'FUNKAKKU' },
    { pattern: /werkzeugakku/i, category: 'WERKZEUGAKKU' },
    { pattern: /rasiererakku/i, category: 'RASIERER' },
    { pattern: /bleiakku/i, category: 'BLEIAKKU' },
  ];
  
  for (const { pattern, category } of produktnameVorrang) {
    if (pattern.test(productName)) {
      console.log(`[CategoryDetection] "${productName.substring(0, 60)}" → ${category} (Produkttyp im Namen)`);
      return category;
    }
  }
  
  const keywordCategory = detectProductCategory(productName, description);
  
  // Prüfe ob "passend für [Gerät]" im Namen steht
  const extractedDevice = extractDeviceFromProductName(productName);
  
  console.log(`[CategoryDetection] "${productName.substring(0, 60)}" → Keyword: ${keywordCategory}${extractedDevice ? `, Gerät: "${extractedDevice}"` : ''}`);
  
  // Gerät extrahiert: AI soll die richtige Kategorie bestimmen
  const needsAI = extractedDevice;
  
  if (!needsAI && keywordCategory !== 'GENERISCH') {
    return keywordCategory;
  }
  
  try {
    const categoryList = Object.entries(CATEGORY_DESCRIPTIONS)
      .map(([cat, desc]) => `- ${cat}: ${desc}`)
      .join('\n');

    const deviceHint = extractedDevice ? `\nExtrahiertes Gerät: "${extractedDevice}"` : '';
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Du bist ein Experte für Akkus und Batterien. Analysiere den Produktnamen und bestimme die passende Kategorie.

Verfügbare Kategorien:
${categoryList}

WICHTIGE REGELN:
1. Wähle die Kategorie basierend auf dem HAUPTZWECK des Akkus (für welches Gerät ist er gedacht?)
2. Bei "Zellentausch" oder "passend für" Produkten: Wähle die Kategorie des ZIELGERÄTS!
   - "Zellentausch für Handleuchte" → HANDLEUCHTE
   - "Zellentausch für Rasierer" → RASIERER
   - "passend für Bose Acoustic Wave" → HAUSHALT
   - "passend für Staubsauger" → HAUSHALT
   - "passend für Kress/Makita/Bosch" → WERKZEUGAKKU
   - "passend für Veracity/Pointsource/IP-Kamera" → KAMERAAKKU
   - "passend für Record/Besam/Dorma Türsteuerung" → TUERSTEURUNG
   - "Kranakku/Fernsteuerung" → KRANAKKU
   - "Zellentausch Startkoffer" → ZELLENTAUSCH (nur wenn KEIN Gerät)
3. WERKZEUGAKKU für: Akkuschrauber, Bohrmaschinen, Elektrowerkzeuge, Marken wie Kress, Makita, Bosch, DeWalt, Metabo, AEG Werkzeug, Fein, Festool, Hilti
4. HAUSHALT für: Staubsauger, Reinigungsgeräte, Saugroboter, Zahnbürsten, Audio-/Musiksysteme (Bose, Sonos, etc.), Lautsprecher, Hi-Fi-Geräte
5. MEDIZIN NUR für echte Medizingeräte: Rollstühle, Patientenlifter, Pflegebetten, Beatmungsgeräte
6. FUNKAKKU für: Funkgeräte, Walkie-Talkies, CB-Funk (z.B. Albrecht MC-2)
7. KAMERAAKKU für: Digitalkameras, Camcorder, Videokameras, IP-Kameras, Überwachungskameras, PoE-Injektoren (Veracity, Pointsource)
8. TUERSTEURUNG für: Automatiktüren, Türsteuerungen (Record, Besam, Dorma, Geze)
9. KRANAKKU für: Kranfernsteuerungen, industrielle Funksteuerungen (Autec, HBC, Hetronic)
10. TELEFON für: Handyakku, Smartphone-Akku, DECT-Telefone, schnurlose Telefone
11. Wenn "passend für [Gerätename]" steht, identifiziere das Gerät und wähle die passende Kategorie!
12. ZELLENTAUSCH NUR wenn wirklich KEIN spezifisches Gerät erkennbar ist (z.B. nur "Akkupack zum Selbsteinbau")
13. Antworte NUR mit dem Kategorienamen in Großbuchstaben, nichts anderes.`
        },
        {
          role: 'user',
          content: `Produktname: "${productName}"${deviceHint}\n${description ? `Beschreibung: "${description}"` : ''}\n\nWelche Kategorie?`
        }
      ],
      max_tokens: 20,
      temperature: 0,
    });

    const result = response.choices[0]?.message?.content?.trim().toUpperCase() as ProductCategory;
    
    if (result && Object.keys(CATEGORY_DESCRIPTIONS).includes(result)) {
      return result;
    }
  } catch (error) {
    console.error('[AI Category Detection] Error:', error);
  }
  
  return keywordCategory;
}

export interface CategoryTextBlocks {
  absatz1: string;
  absatz2: string;
  absatz3: string;
  usps: [string, string, string, string];
}

const CATEGORY_TEXT_BLOCKS: Record<ProductCategory, Record<'A' | 'B' | 'C', CategoryTextBlocks> & Partial<Record<'D', CategoryTextBlocks>>> = {
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
      absatz3: 'Die Installation erfolgt gemäß den Vorgaben des Leuchtenherstellers.',
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
      absatz1: 'Dieser Akku wurde für den Einsatz in medizinischen und rehabilitativen Geräten entwickelt und liefert zuverlässige Leistung.',
      absatz2: 'Die Zelltechnologie ist auf hohe Zuverlässigkeit und lange Lebensdauer ausgelegt. Die Leistung bleibt auch nach vielen Ladezyklen konstant.',
      absatz3: 'Die Bauform entspricht den Spezifikationen des Geräteherstellers. Der Einbau erfolgt gemäß den Herstellerangaben.',
      usps: [
        'Konzipiert für medizinische und Reha-Geräte',
        'Zuverlässige Leistung im Dauerbetrieb',
        'Direkter Austausch gegen den Originalakku',
        'Sichere Integration in bestehende Geräte',
      ],
    },
    B: {
      absatz1: 'Für den professionellen Einsatz in Medizin- und Pflegetechnik entwickelt. Der Akku gewährleistet zuverlässigen Betrieb.',
      absatz2: 'Die robuste Zelltechnologie ist auf Dauereinsatz ausgelegt und behält ihre Kapazität auch bei täglicher Nutzung.',
      absatz3: 'Der Einbau erfolgt gemäß den Vorgaben des Geräteherstellers.',
      usps: [
        'Entwickelt für den professionellen Pflegeeinsatz',
        'Langlebige Zellen für maximale Zuverlässigkeit',
        'Passgenauer Austausch ohne Anpassungen',
        'Robuste Ausführung für den Dauerbetrieb',
      ],
    },
    C: {
      absatz1: 'Hochwertiger Ersatzakku für medizinische und rehabilitative Geräte. Mit diesem Akku ist Ihr Gerät wieder voll einsatzbereit.',
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
      absatz1: 'Ersatzakku für medizinische Geräte. Passend und sofort einsatzbereit.',
      absatz2: 'Langlebig und zuverlässig. Konstante Leistung bei voller Kapazität.',
      absatz3: 'Schneller Wechsel, einfache Handhabung. Originale Passform.',
      usps: [
        'Zuverlässig im Dauerbetrieb',
        'Bewährte Akkutechnologie',
        'Idealer Ersatz für den Originalakku',
        'Unkomplizierter Akkuwechsel',
      ],
    },
  },
  KAMERAAKKU: {
    A: {
      absatz1: 'Dieser Akku ist die ideale Energiequelle für Ihre Kamera und bietet zuverlässige Leistung für ausgedehnte Fotosessions.',
      absatz2: 'Die hochwertige Lithium-Ionen-Zelltechnologie sorgt für eine konstante Spannungsversorgung und eine lange Lebensdauer. Auch bei intensiver Nutzung bleibt die volle Kapazität über viele Ladezyklen erhalten.',
      absatz3: 'Die Bauform entspricht exakt den Spezifikationen des Kameraherstellers. Der Akku rastet sicher ein und wird von der Kamera automatisch erkannt.',
      usps: [
        'Speziell für Digitalkameras und Camcorder entwickelt',
        'Zuverlässige Leistung für ausgedehnte Fotosessions',
        'Hochwertiger Ersatz für den Originalakku',
        'Passgenau mit automatischer Erkennung',
      ],
    },
    B: {
      absatz1: 'Maximale Flexibilität für Ihre Kamera-Akkus: Dieser Ersatzakku ermöglicht Ihnen längere Aufnahmezeiten ohne Unterbrechung.',
      absatz2: 'Ob im Studio, auf Reisen oder bei Outdoor-Shootings – dieser hochwertige Akku sorgt dafür, dass Ihre Kamera stets einsatzbereit ist. Die robuste Zelltechnologie verkraftet auch häufiges Laden und Entladen ohne Kapazitätsverlust.',
      absatz3: 'Einfach den Akku in die Kamera einsetzen und loslegen. Der Ladezustand wird korrekt im Display angezeigt.',
      usps: [
        'Ideal für Reisen und Outdoor-Shootings',
        'Lange Aufnahmezeiten ohne Unterbrechung',
        'Passgenauer Austausch ohne Anpassungen',
        'Korrekter Ladezustandsanzeige in der Kamera',
      ],
    },
    C: {
      absatz1: 'Hochwertiger Ersatzakku passend für Ihre Digitalkamera. Kompaktes Design, ideal für unterwegs.',
      absatz2: 'Zuverlässiges Zubehör für Fotografen mit vielseitigen Einsatzmöglichkeiten. Die hochwertige Zelltechnologie sorgt für langanhaltende Leistung.',
      absatz3: 'Der Wechsel ist schnell erledigt – einfach den alten Akku entnehmen und den neuen einsetzen.',
      usps: [
        'Kompaktes Design für unterwegs',
        'Zuverlässiges Zubehör für Fotografen',
        'Schneller Akkuwechsel ohne Werkzeug',
        'Optimale Passform für problemloses Einsetzen',
      ],
    },
    D: {
      absatz1: 'Hochwertiger Ersatzakku für Digitalkameras und Camcorder. Passend und sofort einsatzbereit.',
      absatz2: 'Langlebig und leistungsstark. Viele Ladezyklen bei voller Kapazität.',
      absatz3: 'Schneller Wechsel, einfache Handhabung. Originale Passform garantiert.',
      usps: [
        'Zuverlässig für ausgedehnte Fotosessions',
        'Hochwertige Li-Ion-Technologie',
        'Direkter Ersatz für den Originalakku',
        'Unkomplizierter Akkuwechsel',
      ],
    },
  },
  POWERBANK: {
    A: {
      absatz1: 'Diese Powerbank ist Ihr zuverlässiger Begleiter für unterwegs und versorgt Smartphones, Tablets und andere USB-Geräte mit frischer Energie.',
      absatz2: 'Die hochwertige Lithium-Ionen-Zelltechnologie bietet eine hohe Kapazität bei kompakten Abmessungen. Mehrere Ladezyklen für Ihr Smartphone sind problemlos möglich.',
      absatz3: 'Die USB-Anschlüsse ermöglichen das gleichzeitige Laden mehrerer Geräte. Die LED-Anzeige informiert über den aktuellen Ladestand.',
      usps: [
        'Mobiler Energiespeicher für unterwegs',
        'Hohe Kapazität bei kompakten Abmessungen',
        'Mehrere USB-Anschlüsse für simultanes Laden',
        'LED-Anzeige für den Ladestand',
      ],
    },
    B: {
      absatz1: 'Maximale Mobilität für Ihre Geräte: Diese Powerbank sorgt dafür, dass Smartphone, Tablet und Co. nie ohne Strom bleiben.',
      absatz2: 'Ob auf Reisen, beim Camping oder im Alltag – der externe Akku ist schnell zur Hand und liefert zuverlässig Energie. Die robuste Bauweise macht die Powerbank zum idealen Reisebegleiter.',
      absatz3: 'Einfach per USB anschließen und los geht das Laden. Kompatibel mit allen gängigen Smartphones und USB-Geräten.',
      usps: [
        'Ideal für Reisen, Camping und Alltag',
        'Zuverlässige Energiereserve für alle USB-Geräte',
        'Robuste Bauweise für unterwegs',
        'Universell kompatibel mit Smartphones und Tablets',
      ],
    },
    C: {
      absatz1: 'Kompakte Powerbank mit hoher Kapazität für Ihre mobilen Geräte. Ideal für unterwegs und auf Reisen.',
      absatz2: 'Schnelles Aufladen dank moderner Ladetechnologie. Kompatibel mit Smartphones, Tablets, Kameras und vielen weiteren USB-Geräten.',
      absatz3: 'Handliches Design, passt in jede Tasche. Einfache Bedienung ohne komplizierte Einstellungen.',
      usps: [
        'Kompakt und handlich',
        'Schnelles Aufladen für unterwegs',
        'Universell einsetzbar für USB-Geräte',
        'Einfache Bedienung',
      ],
    },
    D: {
      absatz1: 'Mobile Powerbank für Smartphones, Tablets und USB-Geräte. Kompakt und leistungsstark.',
      absatz2: 'Hohe Kapazität für mehrere Ladezyklen. Schnellladefunktion für kurze Ladezeiten.',
      absatz3: 'USB-Anschlüsse für simultanes Laden. LED-Anzeige zeigt Ladestand.',
      usps: [
        'Kompakt und leistungsstark',
        'Hohe Kapazität für mehrere Ladungen',
        'Schnellladefunktion',
        'Universell kompatibel',
      ],
    },
  },
  HAUSHALT: {
    A: {
      absatz1: 'Dieser Akku wurde speziell für den Einsatz in Haushaltsgeräten entwickelt und liefert zuverlässige Leistung für den täglichen Gebrauch.',
      absatz2: 'Die Zelltechnologie ist auf häufige Ladezyklen und konstante Leistungsabgabe ausgelegt. Auch bei regelmäßiger Nutzung bleibt die volle Kapazität über lange Zeit erhalten.',
      absatz3: 'Die Bauform entspricht den Spezifikationen des Geräteherstellers. Der Akku lässt sich problemlos gegen den Originalakku austauschen.',
      usps: [
        'Speziell für Haushaltsgeräte entwickelt',
        'Zuverlässige Leistung im täglichen Gebrauch',
        'Hochwertiger Ersatz für den Originalakku',
        'Passgenau für das jeweilige Gerät',
      ],
    },
    B: {
      absatz1: 'Dieser Ersatzakku bringt Ihr Haushaltsgerät wieder auf volle Leistung und sorgt für unterbrechungsfreien Betrieb.',
      absatz2: 'Die robuste Zelltechnologie ist auf Langlebigkeit und häufige Nutzung ausgelegt. Die Kapazität bleibt auch nach vielen Ladezyklen konstant.',
      absatz3: 'Der Einbau erfolgt einfach durch Austausch des alten Akkus. Bitte beachten Sie die Hinweise des Geräteherstellers.',
      usps: [
        'Bringt Ihr Gerät wieder auf volle Leistung',
        'Langlebige Zellen für häufige Nutzung',
        'Einfacher Austausch des alten Akkus',
        'Passgenau für Ihr Gerät',
      ],
    },
    C: {
      absatz1: 'Hochwertiger Ersatzakku passend für Ihr Haushaltsgerät. Zuverlässig und langlebig.',
      absatz2: 'Die bewährte Zelltechnologie sorgt für konstante Leistung bei jeder Anwendung. Ideal für den regelmäßigen Einsatz im Haushalt.',
      absatz3: 'Der Akkuwechsel ist schnell erledigt – einfach den alten Akku entnehmen und den neuen einsetzen.',
      usps: [
        'Passend für Ihr Gerät',
        'Zuverlässig im täglichen Einsatz',
        'Schneller Akkuwechsel',
        'Bewährte Zelltechnologie',
      ],
    },
    D: {
      absatz1: 'Ersatzakku für Haushaltsgeräte. Passend und sofort einsatzbereit.',
      absatz2: 'Langlebig und leistungsstark für den täglichen Gebrauch.',
      absatz3: 'Einfacher Austausch, originale Passform.',
      usps: [
        'Passend für Ihr Gerät',
        'Langlebig und zuverlässig',
        'Einfacher Akkuwechsel',
        'Originale Passform',
      ],
    },
  },
  AIRSOFT: {
    A: {
      absatz1: 'Dieser Akkupack wurde speziell für den Einsatz in elektrischen Airsoft-Gewehren (AEGs) entwickelt und liefert zuverlässige Leistung.',
      absatz2: 'Die Zelltechnologie ist auf die Anforderungen von AEG-Systemen abgestimmt und bietet konstante Leistung über die gesamte Laufzeit.',
      absatz3: 'Die Anschlusskonfiguration und Bauform sind auf gängige Airsoft-Systeme abgestimmt. Der Akkupack lässt sich problemlos einsetzen.',
      usps: [
        'Speziell für elektrische Airsoft-Gewehre entwickelt',
        'Konstante Leistung über die gesamte Laufzeit',
        'Robuste Bauweise',
        'Passend für gängige AEG-Systeme',
      ],
    },
    B: {
      absatz1: 'Dieser Ersatzakku ist für elektrische Airsoft-Gewehre konzipiert und bietet zuverlässige Leistung.',
      absatz2: 'Die hochwertige Zelltechnologie sorgt für eine gleichmäßige Energieabgabe und eine hohe Schusszahl pro Ladung.',
      absatz3: 'Der Einbau erfolgt je nach Modell in Schulterstütze, Handschutz oder externem Akkufach.',
      usps: [
        'Zuverlässige Leistung für AEG-Systeme',
        'Gleichmäßige Energieabgabe',
        'Langlebige Zellen',
        'Passend für verschiedene AEG-Modelle',
      ],
    },
    C: {
      absatz1: 'Hochwertiger Ersatz-Akkupack für Ihr Airsoft-Gewehr. Mit diesem Akku sind Sie wieder einsatzbereit.',
      absatz2: 'Ein frischer Akku bringt Ihre AEG wieder auf volle Leistung.',
      absatz3: 'Der Wechsel ist schnell erledigt – einfach den alten Akkupack entnehmen und den neuen einsetzen.',
      usps: [
        'Sofort einsatzbereit als Ersatz-Akkupack',
        'Volle Leistung für Ihre AEG',
        'Schneller Akkuwechsel',
        'Optimale Passform',
      ],
    },
    D: {
      absatz1: 'Akkupack für elektrische Airsoft-Gewehre. Passend und sofort einsatzbereit.',
      absatz2: 'Hohe Kapazität für langen Einsatz. Konstante Leistung.',
      absatz3: 'Robuste Bauweise.',
      usps: [
        'Passend für gängige AEG-Systeme',
        'Hohe Kapazität',
        'Konstante Leistung',
        'Robust und zuverlässig',
      ],
    },
  },
  GARTEN: {
    A: {
      absatz1: 'Dieser Akku wurde speziell für den Einsatz in Gartengeräten entwickelt und liefert zuverlässige Leistung für die Gartenpflege.',
      absatz2: 'Die Zelltechnologie ist auf die Anforderungen von Akku-Gartengeräten abgestimmt und bietet konstante Leistung über die gesamte Laufzeit.',
      absatz3: 'Die Bauform entspricht den Spezifikationen des Geräteherstellers. Der Akku lässt sich problemlos einsetzen.',
      usps: [
        'Speziell für Akku-Gartengeräte entwickelt',
        'Konstante Leistung für die Gartenpflege',
        'Direkter Austausch gegen den Originalakku',
        'Passend für gängige Gartengeräte',
      ],
    },
    B: {
      absatz1: 'Dieser Ersatzakku ist für Akku-Gartengeräte konzipiert und bietet zuverlässige Leistung.',
      absatz2: 'Die robuste Zelltechnologie ist auf häufige Nutzung ausgelegt und behält ihre Kapazität auch nach vielen Ladezyklen.',
      absatz3: 'Der Einbau erfolgt gemäß den Vorgaben des Geräteherstellers.',
      usps: [
        'Zuverlässige Leistung für Gartengeräte',
        'Langlebige Zellen für viele Ladezyklen',
        'Passgenauer Austausch ohne Anpassungen',
        'Robuste Ausführung für den Außeneinsatz',
      ],
    },
    C: {
      absatz1: 'Hochwertiger Ersatzakku für Ihr Gartengerät. Mit diesem Akku ist Ihr Gerät wieder einsatzbereit.',
      absatz2: 'Ein frischer Akku bringt Ihr Gartengerät wieder auf volle Leistung.',
      absatz3: 'Der Wechsel ist schnell erledigt – einfach den alten Akku entnehmen und den neuen einsetzen.',
      usps: [
        'Sofort einsatzbereit als Ersatzakku',
        'Volle Leistung für Ihr Gartengerät',
        'Schneller Akkuwechsel',
        'Optimale Passform',
      ],
    },
    D: {
      absatz1: 'Ersatzakku für Gartengeräte. Passend und sofort einsatzbereit.',
      absatz2: 'Langlebig und zuverlässig. Konstante Leistung.',
      absatz3: 'Schneller Wechsel, einfache Handhabung.',
      usps: [
        'Passend für Ihr Gartengerät',
        'Langlebig und zuverlässig',
        'Konstante Leistung',
        'Einfacher Akkuwechsel',
      ],
    },
  },
  MOTORRAD: {
    A: {
      absatz1: 'Diese Batterie basiert auf wartungsfreier Gel- bzw. AGM-Technologie und liefert zuverlässige Startleistung für Motorräder, Roller und weitere Powersports-Fahrzeuge.',
      absatz2: 'Die Konstruktion ist auslaufsicher und vibrationsfest. Die geringe Selbstentladung ermöglicht auch nach längerer Standzeit einen sicheren Start.',
      absatz3: 'Die Abmessungen und Polkonfiguration entsprechen den Originalspezifikationen. Der Einbau erfolgt als direkter Austausch.',
      usps: [
        'Wartungsfreie Gel/AGM-Technologie',
        'Auslaufsicher und vibrationsfest',
        'Zuverlässige Startleistung',
        'Direkter Austausch gegen die Originalbatterie',
      ],
    },
    B: {
      absatz1: 'Diese Starterbatterie ist für den Einsatz in Motorrädern und Rollern ausgelegt und bietet zuverlässige Leistung.',
      absatz2: 'Die wartungsfreie Technologie erfordert kein Nachfüllen von destilliertem Wasser. Die Batterie ist in jeder Einbaulage verwendbar.',
      absatz3: 'Die Abmessungen entsprechen den Originalspezifikationen für einen direkten Austausch.',
      usps: [
        'Wartungsfrei – kein Nachfüllen nötig',
        'Lageunabhängiger Einbau möglich',
        'Passgenauer Austausch',
        'Robuste Konstruktion für Vibrationen',
      ],
    },
    C: {
      absatz1: 'Hochwertige Ersatzbatterie für Ihr Motorrad oder Ihren Roller. Sofort einbaubereit.',
      absatz2: 'Eine frische Batterie sorgt für zuverlässigen Start – auch nach längerer Standzeit.',
      absatz3: 'Der Wechsel ist schnell erledigt – einfach die alte Batterie ausbauen und die neue einsetzen.',
      usps: [
        'Sofort einsatzbereit als Ersatz',
        'Zuverlässiger Start',
        'Schneller Batteriewechsel',
        'Passend für Ihr Fahrzeug',
      ],
    },
    D: {
      absatz1: 'Starterbatterie für Motorrad, Roller und Quad. Wartungsfrei und sofort einsatzbereit.',
      absatz2: 'Zuverlässige Startleistung. Auslaufsicher und vibrationsfest.',
      absatz3: 'Direkter Austausch, einfacher Einbau.',
      usps: [
        'Wartungsfreie Technologie',
        'Zuverlässiger Start',
        'Auslaufsicher',
        'Direkter Austausch',
      ],
    },
  },
  KRANAKKU: {
    A: {
      absatz1: 'Dieser Akku wurde für den Einsatz in industriellen Kransteuerungen entwickelt und liefert zuverlässige Leistung für den täglichen Betrieb.',
      absatz2: 'Die Zelltechnologie ist auf die Anforderungen von Funkfernsteuerungen ausgelegt und bietet konstante Spannung über die gesamte Entladezeit.',
      absatz3: 'Die Bauform entspricht den Originalspezifikationen. Der Akku lässt sich direkt in die Fernbedienung einsetzen.',
      usps: [
        'Für industrielle Kransteuerungen entwickelt',
        'Konstante Spannung für zuverlässigen Betrieb',
        'Direkter Austausch gegen den Originalakku',
        'Passend für gängige Fernsteuerungssysteme',
      ],
    },
    B: {
      absatz1: 'Dieser Ersatzakku ist für Kranfernsteuerungen konzipiert und bietet zuverlässige Leistung im Industrieeinsatz.',
      absatz2: 'Die robuste Zelltechnologie ist auf häufige Ladezyklen ausgelegt und behält ihre Kapazität auch bei intensiver Nutzung.',
      absatz3: 'Der Akkuwechsel ist einfach und schnell durchführbar.',
      usps: [
        'Zuverlässige Leistung im Industrieeinsatz',
        'Langlebige Zellen für viele Ladezyklen',
        'Passgenauer Austausch',
        'Robuste Ausführung',
      ],
    },
    C: {
      absatz1: 'Hochwertiger Ersatzakku für Ihre Kranfernsteuerung. Mit diesem Akku ist Ihre Fernbedienung wieder einsatzbereit.',
      absatz2: 'Ein frischer Akku sorgt für zuverlässige Funkverbindung und lange Betriebszeit.',
      absatz3: 'Der Wechsel ist schnell erledigt – einfach den alten Akku entnehmen und den neuen einsetzen.',
      usps: [
        'Sofort einsatzbereit als Ersatz',
        'Zuverlässige Funkverbindung',
        'Schneller Akkuwechsel',
        'Optimale Passform',
      ],
    },
    D: {
      absatz1: 'Ersatzakku für Kranfernsteuerungen. Passend und sofort einsatzbereit.',
      absatz2: 'Langlebig und zuverlässig. Konstante Leistung.',
      absatz3: 'Schneller Wechsel, einfache Handhabung.',
      usps: [
        'Passend für Ihre Kransteuerung',
        'Langlebig und zuverlässig',
        'Konstante Leistung',
        'Einfacher Akkuwechsel',
      ],
    },
  },
  SPEICHERBATTERIE: {
    A: {
      absatz1: 'Diese Speicherbatterie wird überwiegend in industriellen Anwendungen wie CNC-Maschinen, Servoantrieben und RAID-Controllern eingesetzt.',
      absatz2: 'Die Batterie dient als nicht wiederaufladbare Lithium-Einwegbatterie zur Datenspeicherung und Pufferung in professionellen Geräten. Sie wird in speicherprogrammierbaren Steuerungen (SPS) verwendet, oft in Verbindung mit CNC-Werkzeugmaschinen und Bearbeitungszentren, um Daten bei Stromausfall zu sichern.',
      absatz3: 'In Computersystemen kommt sie auch in bestimmten RAID-Controllern zum Einsatz, um Konfigurations- und Cache-Daten zu puffern. Die Abmessungen entsprechen den Originalspezifikationen für einen direkten Austausch.',
      usps: [
        'Für SPS, CNC-Systeme und Servoantriebe',
        'Geringe Selbstentladung',
        'Datensicherheit bei Stromausfall',
        'Direkter Austausch gegen die Originalbatterie',
      ],
    },
    B: {
      absatz1: 'Diese Speicherbatterie sichert Programm- und Parameterdaten in industriellen Steuerungsanlagen und gewährleistet die Absolutwert-Positionserkennung in Servosystemen.',
      absatz2: 'Ein Hauptanwendungsgebiet ist die Stromversorgung innerhalb von Servosystemen. Die lange Lebensdauer reduziert Wartungsintervalle in CNC-Maschinen und Bearbeitungszentren.',
      absatz3: 'Beim Batteriewechsel die Anlage nicht vom Netz trennen, um Datenverlust zu vermeiden. Ein rechtzeitiger Austausch verhindert Datenverlust.',
      usps: [
        'Sichert Programm- und Parameterdaten',
        'Für CNC-Maschinen und Servosysteme',
        'Reduzierte Wartungsintervalle',
        'Passgenauer Austausch',
      ],
    },
    C: {
      absatz1: 'Diese Speicherbatterie wird in speicherprogrammierbaren Steuerungen (SPS, auch PLC genannt) verwendet, um Daten bei Stromausfall zu sichern.',
      absatz2: 'Geeignet für SPS-Steuerungen, CNC-Werkzeugmaschinen und RAID-Controller. Die Batterie puffert zuverlässig Konfigurations- und Cache-Daten.',
      absatz3: 'Die Abmessungen entsprechen den Originalspezifikationen. Der Wechsel sollte zügig erfolgen, um Datenverlust zu vermeiden.',
      usps: [
        'Schutz vor Datenverlust',
        'Für SPS, CNC und RAID-Controller',
        'Schneller Batteriewechsel',
        'Passend für Ihre Anlage',
      ],
    },
  },
  BLEIAKKU: {
    A: {
      absatz1: 'Dieser Bleiakku basiert auf wartungsfreier AGM- oder Gel-Technologie und liefert zuverlässige Leistung für stationäre Anwendungen.',
      absatz2: 'Die Konstruktion ist auslaufsicher und für den Betrieb in jeder Lage geeignet. Die geringe Selbstentladung ermöglicht lange Standzeiten.',
      absatz3: 'Die Abmessungen und Polkonfiguration entsprechen den Standardmaßen. Der Einbau erfolgt als direkter Austausch.',
      usps: [
        'Wartungsfreie AGM/Gel-Technologie',
        'Auslaufsicher und lageunabhängig',
        'Geringe Selbstentladung',
        'Direkter Austausch',
      ],
    },
    B: {
      absatz1: 'Dieser Akku ist für Anwendungen wie USV-Anlagen, Notbeleuchtung oder Solaranlagen ausgelegt.',
      absatz2: 'Die zyklenfeste Ausführung ermöglicht viele Lade- und Entladezyklen. Die Technologie ist auf Langlebigkeit ausgelegt.',
      absatz3: 'Die Batterie sollte vor der ersten Nutzung vollständig geladen werden.',
      usps: [
        'Für USV, Notbeleuchtung, Solar',
        'Zyklenfeste Ausführung',
        'Langlebige Technologie',
        'Wartungsfrei',
      ],
    },
    C: {
      absatz1: 'Hochwertiger Ersatzakku für Ihre Anlage. Sofort einsatzbereit.',
      absatz2: 'Ein frischer Akku bringt Ihre USV oder Anlage wieder auf volle Kapazität.',
      absatz3: 'Der Wechsel ist schnell erledigt – einfach den alten Akku ausbauen und den neuen einsetzen.',
      usps: [
        'Sofort einsatzbereit',
        'Volle Kapazität',
        'Schneller Akkuwechsel',
        'Passend für Ihre Anlage',
      ],
    },
    D: {
      absatz1: 'Bleiakku AGM/Gel für USV, Notbeleuchtung und stationäre Anwendungen. Wartungsfrei.',
      absatz2: 'Auslaufsicher und zyklenfest. Lange Lebensdauer.',
      absatz3: 'Direkter Austausch, einfacher Einbau.',
      usps: [
        'Wartungsfrei',
        'Auslaufsicher',
        'Zyklenfest',
        'Direkter Austausch',
      ],
    },
  },
  TUERSTEURUNG: {
    A: {
      absatz1: 'Dieser Akku wurde für den Einsatz in automatischen Türsteuerungen entwickelt und gewährleistet die Notstromversorgung bei Stromausfall.',
      absatz2: 'Die Zelltechnologie ist auf die Anforderungen von Türantrieben ausgelegt und bietet zuverlässige Leistung.',
      absatz3: 'Die Bauform entspricht den Originalspezifikationen. Der Akku lässt sich direkt einsetzen.',
      usps: [
        'Für automatische Türsteuerungen',
        'Notstromversorgung bei Stromausfall',
        'Zuverlässige Leistung',
        'Direkter Austausch',
      ],
    },
    B: {
      absatz1: 'Dieser Ersatzakku sichert den Betrieb von Automatiktüren auch bei Netzausfall.',
      absatz2: 'Die robuste Ausführung ist auf den Dauerbetrieb in Türsystemen ausgelegt.',
      absatz3: 'Der Akkuwechsel ist einfach und schnell durchführbar.',
      usps: [
        'Sichert Betrieb bei Netzausfall',
        'Für Dauerbetrieb ausgelegt',
        'Passgenauer Austausch',
        'Robuste Ausführung',
      ],
    },
    C: {
      absatz1: 'Hochwertiger Ersatzakku für Ihre Türsteuerung. Sichert den Notbetrieb.',
      absatz2: 'Ein frischer Akku gewährleistet die Funktion bei Stromausfall.',
      absatz3: 'Der Wechsel ist schnell erledigt.',
      usps: [
        'Sichert den Notbetrieb',
        'Für Türsteuerungen',
        'Schneller Akkuwechsel',
        'Passend für Ihre Anlage',
      ],
    },
    D: {
      absatz1: 'Ersatzakku für Türsteuerungen. Passend und sofort einsatzbereit.',
      absatz2: 'Notstromversorgung bei Stromausfall. Zuverlässig.',
      absatz3: 'Direkter Austausch.',
      usps: [
        'Für Türsteuerungen',
        'Notstromversorgung',
        'Zuverlässig',
        'Direkter Austausch',
      ],
    },
  },
  PUFFERBATTERIE: {
    A: {
      absatz1: 'Diese Pufferbatterie dient zur Stromversorgung von Alarmanlagen und Sicherheitssystemen bei Netzausfall.',
      absatz2: 'Die Lithium-Technologie bietet eine hohe Energiedichte und lange Lebensdauer. Die Selbstentladung ist gering.',
      absatz3: 'Die Abmessungen und der Steckertyp entsprechen den Originalspezifikationen.',
      usps: [
        'Für Alarmanlagen und Sicherheitssysteme',
        'Lange Lebensdauer',
        'Geringe Selbstentladung',
        'Direkter Austausch',
      ],
    },
    B: {
      absatz1: 'Diese Batterie sichert den Betrieb von Alarmanlagen auch bei längerem Stromausfall.',
      absatz2: 'Die robuste Ausführung ist auf den Einsatz in Sicherheitssystemen ausgelegt.',
      absatz3: 'Beim Batteriewechsel die Anlage nicht scharfschalten. Nach dem Einbau die Funktion prüfen.',
      usps: [
        'Sichert Alarmanlagen bei Stromausfall',
        'Für Sicherheitssysteme',
        'Passgenauer Austausch',
        'Robuste Ausführung',
      ],
    },
    C: {
      absatz1: 'Hochwertige Ersatzbatterie für Ihre Alarmanlage. Sichert den Betrieb bei Stromausfall.',
      absatz2: 'Ein rechtzeitiger Batteriewechsel gewährleistet die Funktion Ihres Sicherheitssystems.',
      absatz3: 'Der Wechsel ist schnell erledigt.',
      usps: [
        'Sichert die Alarmanlage',
        'Für Sicherheitssysteme',
        'Schneller Batteriewechsel',
        'Passend für Ihre Anlage',
      ],
    },
    D: {
      absatz1: 'Pufferbatterie für Alarmanlagen. Passend und sofort einsatzbereit.',
      absatz2: 'Lange Lebensdauer. Geringe Selbstentladung.',
      absatz3: 'Direkter Austausch.',
      usps: [
        'Für Alarmanlagen',
        'Lange Lebensdauer',
        'Geringe Selbstentladung',
        'Direkter Austausch',
      ],
    },
  },
  FAHRRAD: {
    A: {
      absatz1: 'Dieser Akku wurde für den Einsatz in E-Bikes und Pedelecs entwickelt und liefert zuverlässige Leistung für längere Touren.',
      absatz2: 'Die Zelltechnologie ist auf die Anforderungen von Elektrofahrrädern abgestimmt und bietet hohe Reichweite.',
      absatz3: 'Die Bauform entspricht den Spezifikationen des Radherstellers. Der Akku lässt sich problemlos einsetzen.',
      usps: [
        'Für E-Bikes und Pedelecs',
        'Hohe Reichweite',
        'Direkter Austausch gegen den Originalakku',
        'Zuverlässige Leistung',
      ],
    },
    B: {
      absatz1: 'Dieser Ersatzakku ist für Elektrofahrräder konzipiert und bietet zuverlässige Leistung.',
      absatz2: 'Die robuste Zelltechnologie ist auf häufige Nutzung ausgelegt und behält ihre Kapazität auch nach vielen Ladezyklen.',
      absatz3: 'Der Einbau erfolgt gemäß den Vorgaben des Radherstellers.',
      usps: [
        'Zuverlässige Leistung für E-Bikes',
        'Langlebige Zellen für viele Ladezyklen',
        'Passgenauer Austausch',
        'Robuste Ausführung',
      ],
    },
    C: {
      absatz1: 'Hochwertiger Ersatzakku für Ihr E-Bike. Mit diesem Akku sind Sie wieder mobil.',
      absatz2: 'Ein frischer Akku bringt Ihr Elektrofahrrad wieder auf volle Reichweite.',
      absatz3: 'Der Wechsel ist schnell erledigt – einfach den alten Akku entnehmen und den neuen einsetzen.',
      usps: [
        'Sofort einsatzbereit',
        'Volle Reichweite',
        'Schneller Akkuwechsel',
        'Passend für Ihr E-Bike',
      ],
    },
    D: {
      absatz1: 'Ersatzakku für E-Bikes und Pedelecs. Passend und sofort einsatzbereit.',
      absatz2: 'Hohe Reichweite. Zuverlässige Leistung.',
      absatz3: 'Schneller Wechsel, einfache Handhabung.',
      usps: [
        'Für E-Bikes und Pedelecs',
        'Hohe Reichweite',
        'Zuverlässig',
        'Einfacher Akkuwechsel',
      ],
    },
  },
  RASIERER: {
    A: {
      absatz1: 'Dieser Akku wurde für den Einsatz in elektrischen Rasierern und Haarschneidern entwickelt.',
      absatz2: 'Die Zelltechnologie ist auf die Anforderungen von Körperpflegegeräten abgestimmt und bietet lange Laufzeit.',
      absatz3: 'Die Bauform entspricht den Spezifikationen. Der Einbau erfordert das Öffnen des Gehäuses.',
      usps: [
        'Für Rasierer und Haarschneider',
        'Lange Laufzeit',
        'Direkter Austausch gegen den Originalakku',
        'Passende Bauform',
      ],
    },
    B: {
      absatz1: 'Dieser Ersatzakku ist für elektrische Rasierer konzipiert und bietet zuverlässige Leistung.',
      absatz2: 'Die robuste Zelltechnologie behält ihre Kapazität auch nach vielen Ladezyklen.',
      absatz3: 'Der Einbau erfordert Lötkenntnisse.',
      usps: [
        'Zuverlässige Leistung',
        'Langlebige Zellen',
        'Passgenauer Austausch',
        'Für Körperpflegegeräte',
      ],
    },
    C: {
      absatz1: 'Hochwertiger Ersatzakku für Ihren Rasierer. Mit diesem Akku ist Ihr Gerät wieder einsatzbereit.',
      absatz2: 'Ein frischer Akku bringt Ihren Rasierer wieder auf volle Leistung.',
      absatz3: 'Der Wechsel erfordert das Öffnen des Gehäuses.',
      usps: [
        'Sofort einsatzbereit',
        'Volle Leistung',
        'Für Ihren Rasierer',
        'Passende Bauform',
      ],
    },
    D: {
      absatz1: 'Ersatzakku für Rasierer und Haarschneider. Passend und sofort einsatzbereit.',
      absatz2: 'Lange Laufzeit. Zuverlässige Leistung.',
      absatz3: 'Passende Bauform.',
      usps: [
        'Für Rasierer',
        'Lange Laufzeit',
        'Zuverlässig',
        'Passend',
      ],
    },
  },
  HANDLEUCHTE: {
    A: {
      absatz1: 'Dieser Akku wurde für den Einsatz in professionellen Handleuchten und Arbeitsleuchten entwickelt.',
      absatz2: 'Die Zelltechnologie ist auf die Anforderungen von Hochleistungslampen abgestimmt und bietet lange Leuchtdauer.',
      absatz3: 'Die Bauform entspricht den Originalspezifikationen. Der Akku lässt sich direkt einsetzen.',
      usps: [
        'Für professionelle Handleuchten',
        'Lange Leuchtdauer',
        'Direkter Austausch gegen den Originalakku',
        'Zuverlässige Leistung',
      ],
    },
    B: {
      absatz1: 'Dieser Ersatzakku ist für Handleuchten und Arbeitsleuchten konzipiert.',
      absatz2: 'Die robuste Zelltechnologie ist auf häufige Nutzung ausgelegt.',
      absatz3: 'Der Einbau erfolgt gemäß den Vorgaben des Lampenherstellers.',
      usps: [
        'Zuverlässige Leistung für Handleuchten',
        'Langlebige Zellen',
        'Passgenauer Austausch',
        'Robuste Ausführung',
      ],
    },
    C: {
      absatz1: 'Hochwertiger Ersatzakku für Ihre Handleuchte. Mit diesem Akku ist Ihre Lampe wieder einsatzbereit.',
      absatz2: 'Ein frischer Akku bringt Ihre Handleuchte wieder auf volle Leuchtkraft.',
      absatz3: 'Der Wechsel ist schnell erledigt.',
      usps: [
        'Sofort einsatzbereit',
        'Volle Leuchtkraft',
        'Schneller Akkuwechsel',
        'Passend für Ihre Handleuchte',
      ],
    },
    D: {
      absatz1: 'Ersatzakku für Handleuchten. Passend und sofort einsatzbereit.',
      absatz2: 'Lange Leuchtdauer. Zuverlässige Leistung.',
      absatz3: 'Direkter Austausch.',
      usps: [
        'Für Handleuchten',
        'Lange Leuchtdauer',
        'Zuverlässig',
        'Direkter Austausch',
      ],
    },
  },
  ZELLENTAUSCH: {
    A: {
      absatz1: 'Dieses Akkupack-Set ist für den Einbau in das Gehäuse des Originalakkus vorgesehen und ermöglicht die Wiederherstellung der vollen Leistung.',
      absatz2: 'Die neuen Zellen werden gegen die alten, verschlissenen Zellen im vorhandenen Akkugehäuse ausgetauscht. Die Zelltechnologie entspricht dem Original oder übertrifft dieses.',
      absatz3: 'Der Zellentausch erfordert technisches Geschick und ggf. Lötkenntnisse. Alternativ kann ein entsprechender Reparaturservice in Anspruch genommen werden.',
      usps: [
        'Vorkonfektioniertes Akkupack zum Einbau',
        'Kostengünstige Reparaturlösung',
        'Passend für das Originalgehäuse',
        'Verlängert die Lebensdauer des Geräts',
      ],
    },
    B: {
      absatz1: 'Mit diesem Zellentausch-Set können die alten Akkuzellen im Originalgehäuse durch neue, leistungsstarke Zellen ersetzt werden.',
      absatz2: 'Statt einen komplett neuen, oft teuren Originalakku zu kaufen, bietet der Zellentausch eine wirtschaftliche Alternative.',
      absatz3: 'Das Set ist für den Selbsteinbau konzipiert.',
      usps: [
        'Wirtschaftliche Alternative zum Neukauf',
        'Neue Zellen im bewährten Gehäuse',
        'Für Selbsteinbau oder Reparaturservice',
        'Originale Passform bleibt erhalten',
      ],
    },
    C: {
      absatz1: 'Dieses Zellentausch-Set ist die kostengünstige Lösung zur Wiederherstellung der Akkuleistung in Ihrem Gerät.',
      absatz2: 'Die neuen Zellen ersetzen die erschöpften Originalzellen und bringen den Akku wieder auf volle Kapazität.',
      absatz3: 'Der Austausch kann selbst durchgeführt oder von einem Fachmann erledigt werden.',
      usps: [
        'Kostengünstige Reparaturlösung',
        'Volle Kapazität wie beim Neukauf',
        'Passend für das Originalgehäuse',
        'Verlängert die Gerätelebensdauer',
      ],
    },
    D: {
      absatz1: 'Zellentausch-Set zum Einbau in das Originalgehäuse. Ersetzt die erschöpften Zellen.',
      absatz2: 'Kostengünstige Reparaturlösung statt teurem Neukauf.',
      absatz3: 'Für Selbsteinbau oder Reparaturservice.',
      usps: [
        'Zellentausch-Set zum Einbau',
        'Kostengünstige Reparatur',
        'Für das Originalgehäuse',
        'Volle Kapazität',
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
      absatz3: 'Der Einbau erfolgt gemäß den Herstellerangaben des Geräts.',
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
  variant: 'A' | 'B' | 'C'
): CategoryTextBlocks {
  return CATEGORY_TEXT_BLOCKS[category][variant];
}
