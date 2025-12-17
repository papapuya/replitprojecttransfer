import Papa from "papaparse";

export interface BatteryData {
  produktname: string;
  spannung: string;
  kapazitaet: string;
  chemie: string;
  zellentyp: string;
  masse: string; // Keeping this for backward compatibility or generic usage
  durchmesser: string; // New
  hoehe: string; // New
  gewicht: string;
  kabellaenge: string;
  kompatibilitaet_kurz: string;
  einsatzzweck: string;
  besonderheiten: string;
  bezeichnungen: string; // New
  lagereigenschaften: string; // New
  betriebstemperatur: string; // New
  lieferumfang: string;
}

const NA = "Angabe nicht verfügbar";

const KNOWN_BRANDS = [
  "Acer", "Alcatel", "Apple", "Asus", "BlackBerry", "Bosch", "Canon", "Casio", "Dell", "DeWalt", "Dyson",
  "Epson", "Fuji", "Fujifilm", "Garmin", "Gigaset", "GoPro", "Hitachi", "HP", "HTC", "Huawei", "IBM",
  "JVC", "Kodak", "Kyocera", "Lenovo", "LG", "Makita", "Medion", "Metabo", "Microsoft", "Milwaukee",
  "Motorola", "Nikon", "Nintendo", "Nokia", "Olympus", "Panasonic", "Pentax", "Philips", "Ricoh",
  "Samsung", "Sanyo", "Sharp", "Siemens", "Sony", "Sony Ericsson", "TomTom", "Toshiba", "Xiaomi", "ZTE",
  "Agilia", "Fresenius" // Added from user example
];

const CHEMISTRY_MAP: Record<string, string> = {
  "li-ion": "Li-Ion",
  "lithium-ionen": "Li-Ion",
  "lithium ionen": "Li-Ion",
  "lion": "Li-Ion",
  "nimh": "NiMH",
  "ni-mh": "NiMH",
  "nickel-metallhydrid": "NiMH",
  "li-polymer": "Li-Polymer",
  "li-po": "Li-Polymer",
  "lipo": "Li-Polymer",
  "nicd": "NiCd",
  "ni-cd": "NiCd",
  "lead-acid": "Blei-Säure",
  "blei": "Blei-Säure",
  "lithium": "Lithium (Li-MnO₂)" // Adapted for coin cells
};

export function parseBatteryCSV(input: string | any): BatteryData {
  let data: BatteryData = {
    produktname: "",
    spannung: "",
    kapazitaet: "",
    chemie: "",
    zellentyp: "",
    masse: "",
    durchmesser: "",
    hoehe: "",
    gewicht: "",
    kabellaenge: "",
    kompatibilitaet_kurz: "",
    einsatzzweck: "",
    besonderheiten: "",
    bezeichnungen: "",
    lagereigenschaften: "",
    betriebstemperatur: "",
    lieferumfang: ""
  };

  let columns: string[] = [];
  let isStructured = false;

  // Determine input type
  if (typeof input === 'string') {
      if (!input.trim()) return getEmptyData();
      // Detect delimiter if possible or assume semicolon for German CSV if not comma
      const delimiter = input.includes(";") ? ";" : ",";
      const parseResult = Papa.parse(input, { header: false, delimiter });
      columns = (parseResult.data[0] as string[]) || [];
  } else if (typeof input === 'object' && input !== null) {
      // Structured object from bulk import
      isStructured = true;
      
      // Direct mapping from user provided keys
      // Handle Voltage
      if (input["p_attributes[akku_v][de]"]) {
          let val = input["p_attributes[akku_v][de]"].trim();
          if (val && !val.toLowerCase().includes("v")) val += " V";
          data.spannung = val.replace('.', ',');
      }

      // Handle Weight
      if (input["v_weight"]) {
          let val = input["v_weight"].trim();
          // If it's just a number (and not 0?), append g
          // Note: User screenshot shows "0" for some weights, maybe ignore 0?
          if (val && val !== "0") {
               if (!val.toLowerCase().includes("g")) val += " g";
               data.gewicht = val;
          }
      }
      
      // Handle Product Type / Cell Type
      if (input["p_attributes[akku_produktart][de]"]) {
          const val = input["p_attributes[akku_produktart][de]"].trim();
          if (val) {
               // Map common values to celltype or usage
               if (val.toLowerCase().includes("knopfzelle") || val.match(/CR\d{4}/)) {
                   data.zellentyp = val;
               } else {
                   // It's likely usage or category
                   data.einsatzzweck = val;
                   // Also try to set celltype if it looks like one
                   if (val.match(/\bAA\b/) || val.match(/\bAAA\b/)) data.zellentyp = val;
               }
          }
      }
      
      // Handle Dimensions
      let height = input["v_height"]?.trim();
      let width = input["v_width"]?.trim();
      let length = input["v_length"]?.trim();
      
      if (height) height = height.replace('.', ',');
      if (width) width = width.replace('.', ',');
      if (length) length = length.replace('.', ',');

      if (height && width && length) {
          data.masse = `${length} x ${width} x ${height} mm`;
          data.hoehe = `${height} mm`;
          data.durchmesser = `${width} mm`; // Fallback assignment
      } else if (height && width) {
           // Assume coin cell or cylindrical?
           data.hoehe = `${height} mm`;
           data.durchmesser = `${width} mm`;
           data.masse = `${width} x ${height} mm`;
      }

      // Handle Name
      if (input["p_name[de]"]) data.produktname = input["p_name[de]"];

      // Handle Description (Optional, maybe extract capacity if missing)
      if (input["p_description[de]"]) {
           const desc = input["p_description[de]"];
           if (!data.kapazitaet) {
               const match = desc.match(/(\d+)\s*(mAh|Ah|Wh)\b/i);
               if (match) data.kapazitaet = `${match[1]} ${match[2]}`;
           }
      }
      
      // Extract all values into an array to run the regex scanners as fallback/enhancement
      columns = Object.values(input).map(v => String(v));
  } else {
      return getEmptyData();
  }

  const detectedBrands = new Set<string>();
  let rawFeatures: string[] = [];
  let designations: string[] = [];

  // Regex definitions
  const voltRegex = /(\d+[.,]?\d*)\s*V(olt)?\b/i;
  const capRegex = /(\d+)\s*(mAh|Ah|Wh)\b/i;
  // Dimensions regex updated to capture specific formats
  const dimRegex = /(\d+[.,]?\d*)\s*[xX*]\s*(\d+[.,]?\d*)\s*[xX*]\s*(\d+[.,]?\d*)\s*(mm|cm)/i;
  const dimCoinRegex = /(\d+[.,]?\d*)\s*[xX*]\s*(\d+[.,]?\d*)\s*(mm)/i; // 20 x 3.2 mm
  
  const weightRegex = /(\d+)\s*(g|gr|gramm)\b/i;
  const cableRegex = /kabel.*?(\d+)\s*(cm|mm|m)\b/i; // needs context usually
  const cableSimpleRegex = /(\d+)\s*(cm|mm|m)\b/i;
  const tempRegex = /(-?\d+\s*°C\s*(?:bis|-)\s*\+?\d+\s*°C)/i;

  columns.forEach((col) => {
    const val = col.trim();
    if (!val) return;

    // Voltage
    if (!data.spannung) {
      const match = val.match(voltRegex);
      if (match) {
        data.spannung = match[1].replace('.', ',') + " V";
      }
    }

    // Capacity
    if (!data.kapazitaet) {
      const match = val.match(capRegex);
      if (match) {
        data.kapazitaet = `${match[1]} ${match[2]}`;
      }
    }

    // Dimensions (Try coin cell format first if celltype is coin)
    if (!data.durchmesser && !data.hoehe) {
       // Look for explicit diameter/height labeling in description? 
       // Or just 2 numbers for coin cells
       const coinMatch = val.match(dimCoinRegex);
       if (coinMatch && (data.zellentyp === "CR2032" || val.includes("mm"))) {
         // Assuming larger is diameter, smaller is height
         const v1 = parseFloat(coinMatch[1].replace(',', '.'));
         const v2 = parseFloat(coinMatch[2].replace(',', '.'));
         const dia = Math.max(v1, v2);
         const h = Math.min(v1, v2);
         data.durchmesser = dia.toString().replace('.', ',') + " mm";
         data.hoehe = h.toString().replace('.', ',') + " mm";
         data.masse = `${data.durchmesser} x ${data.hoehe}`; // Fallback
       } else {
          const match = val.match(dimRegex);
          if (match) {
            data.masse = `${match[1]} x ${match[2]} x ${match[3]} ${match[4]}`;
          }
       }
    }

    // Weight
    if (!data.gewicht) {
      const match = val.match(weightRegex);
      if (match) {
        data.gewicht = `${match[1]} g`;
      }
    }

    // Chemistry
    if (!data.chemie) {
      const lowerVal = val.toLowerCase();
      for (const [key, value] of Object.entries(CHEMISTRY_MAP)) {
        if (lowerVal.includes(key)) {
          data.chemie = value;
          break;
        }
      }
    }

    // Cell Type
    if (!data.zellentyp) {
      const lowerVal = val.toLowerCase();
      if (val.match(/\b18650\b/)) data.zellentyp = "18650";
      else if (val.match(/\b26650\b/)) data.zellentyp = "26650";
      else if (val.match(/\bCR2032\b/i)) data.zellentyp = "CR2032";
      else if (val.match(/\bAA\b/)) data.zellentyp = "AA (Mignon)";
      else if (val.match(/\bAAA\b/)) data.zellentyp = "AAA (Micro)";
      else if (lowerVal.includes("knopfzelle")) data.zellentyp = "Knopfzelle";
    }

    // Temperature
    if (!data.betriebstemperatur) {
      const match = val.match(tempRegex);
      if (match) {
        data.betriebstemperatur = match[1];
      }
    }

    // Cable Length
    if (!data.kabellaenge && !val.match(dimRegex) && !val.match(dimCoinRegex)) {
       if (val.toLowerCase().includes("kabel")) {
          const match = val.match(cableSimpleRegex);
          if (match) data.kabellaenge = `${match[1]} ${match[2]}`;
       }
    }

    // Compatibility extraction
    KNOWN_BRANDS.forEach(brand => {
      if (val.toLowerCase().includes(brand.toLowerCase())) {
        detectedBrands.add(brand);
      }
    });

    // Designations / Part numbers (Heuristic: Capital letters + numbers, len > 3)
    // This is risky, so we only take explicit "Replaces" or similar if possible
    // Or if we find typical CR2032 aliases
    if (val.includes("DL2032") || val.includes("ECR2032")) {
       designations.push(val);
    }

    // Features extraction
    const lowerVal = val.toLowerCase();
    if (lowerVal.includes("schutz") || lowerVal.includes("protection") || lowerVal.includes("sicher")) {
        if (!lowerVal.includes("ohne")) rawFeatures.push("Schutzelektronik");
    }
    if (lowerVal.includes("gold")) rawFeatures.push("Vergoldete Kontakte");
    if (lowerVal.includes("low self discharge") || lowerVal.includes("geringe selbstentladung")) {
        rawFeatures.push("Geringe Selbstentladung");
        data.lagereigenschaften = "Sehr geringe Selbstentladung"; // Also set specific field
    }
    if (lowerVal.includes("ce")) rawFeatures.push("CE-Zertifiziert");

    // Product Name Guessing (Usually first column or contains 'Akku')
    if (!data.produktname && (val.toLowerCase().includes("akku") || val.toLowerCase().includes("battery") || val.toLowerCase().includes("netzteil"))) {
        if (val.length < 100) {
            data.produktname = val;
        }
    }
  });

  // Post-Processing

  // Compatibility
  if (detectedBrands.size > 0) {
    const brands = Array.from(detectedBrands).slice(0, 6); // Max 6
    const brandString = brands.length > 1
      ? brands.slice(0, -1).join(", ") + " und " + brands.slice(-1)
      : brands[0];
    data.kompatibilitaet_kurz = `Kompatibel mit Geräten der Hersteller ${brandString}.`;
  } else {
    data.kompatibilitaet_kurz = NA;
  }

  // Features
  if (rawFeatures.length > 0) {
    data.besonderheiten = Array.from(new Set(rawFeatures)).join(", ");
  } else {
    data.besonderheiten = NA;
  }
  
  // Designations
  if (designations.length > 0) {
     data.bezeichnungen = designations.join(", ");
  } else {
     // Default aliases for standard types if empty
     if (data.zellentyp === "CR2032") data.bezeichnungen = "CR2032, DL2032, ECR2032, EA-2032C";
     else data.bezeichnungen = NA;
  }

  // Defaults for specific fields if missing
  if (!data.lagereigenschaften) data.lagereigenschaften = "Kühl und trocken lagern";
  if (!data.betriebstemperatur) data.betriebstemperatur = "-20 °C bis +60 °C"; // Standard for Lithium often

  // Product Name Fallback
  if (!data.produktname) {
    data.produktname = "Hochwertiger Ersatzakku";
    if (data.chemie && data.chemie !== NA) data.produktname += ` (${data.chemie})`;
  }

  // Usage (Inference)
  if (data.einsatzzweck === "") {
     const lowerName = data.produktname.toLowerCase();
     if (lowerName.includes("notebook") || lowerName.includes("laptop")) data.einsatzzweck = "Notebook-Akku";
     else if (lowerName.includes("werkzeug") || lowerName.includes("drill")) data.einsatzzweck = "Werkzeug-Akku";
     else if (lowerName.includes("kamera") || lowerName.includes("camera") || lowerName.includes("digicam")) data.einsatzzweck = "Kamera-Akku";
     else if (lowerName.includes("smartphone") || lowerName.includes("handy")) data.einsatzzweck = "Smartphone-Akku";
     else if (lowerName.includes("medizin")) data.einsatzzweck = "Akku für medizinische Geräte";
     else data.einsatzzweck = "Universal-Akku";
  }

  // Fill missing with NA
  Object.keys(data).forEach((key) => {
    if (!data[key as keyof BatteryData]) {
      data[key as keyof BatteryData] = NA;
    }
  });

  // Lieferumfang
  data.lieferumfang = `1x ${data.produktname}`;

  return data;
}

function getEmptyData(): BatteryData {
  return {
    produktname: NA,
    spannung: NA,
    kapazitaet: NA,
    chemie: NA,
    zellentyp: NA,
    masse: NA,
    durchmesser: NA,
    hoehe: NA,
    gewicht: NA,
    kabellaenge: NA,
    kompatibilitaet_kurz: NA,
    einsatzzweck: NA,
    besonderheiten: NA,
    bezeichnungen: NA,
    lagereigenschaften: NA,
    betriebstemperatur: NA,
    lieferumfang: NA
  };
}

function escapeHtmlTags(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function generateHTML(data: BatteryData): string {
  // Logic to choose table rows based on data availability (e.g. coin cell vs block)
  let tableRows = "";
  if (data.zellentyp !== NA) tableRows += `<tr><td>Zellentyp:</td><td>${data.zellentyp}</td></tr>\n`;
  if (data.bezeichnungen !== NA) tableRows += `<tr><td>Bezeichnungen:</td><td>${data.bezeichnungen}</td></tr>\n`;
  if (data.spannung !== NA) tableRows += `<tr><td>Spannung:</td><td>${data.spannung}</td></tr>\n`;
  if (data.chemie !== NA) tableRows += `<tr><td>Chemie:</td><td>${data.chemie}</td></tr>\n`;
  if (data.kapazitaet !== NA) tableRows += `<tr><td>Kapazität:</td><td>${data.kapazitaet}</td></tr>\n`;
  
  if (data.durchmesser !== NA && data.hoehe !== NA) {
     tableRows += `<tr><td>Durchmesser:</td><td>${data.durchmesser}</td></tr>\n`;
     tableRows += `<tr><td>Höhe:</td><td>${data.hoehe}</td></tr>\n`;
  } else if (data.masse !== NA) {
     tableRows += `<tr><td>Maße:</td><td>${data.masse}</td></tr>\n`;
  }
  
  if (data.gewicht !== NA) tableRows += `<tr><td>Gewicht:</td><td>${data.gewicht}</td></tr>\n`;
  if (data.lagereigenschaften !== NA) tableRows += `<tr><td>Lagereigenschaften:</td><td>${data.lagereigenschaften}</td></tr>\n`;
  if (data.betriebstemperatur !== NA) tableRows += `<tr><td>Betriebstemperatur:</td><td>${data.betriebstemperatur}</td></tr>\n`;
  if (data.kompatibilitaet_kurz !== NA) tableRows += `<tr><td>Kompatibilität:</td><td>${data.kompatibilitaet_kurz}</td></tr>\n`;

  // Use direct UTF-8 characters - no HTML entity encoding for German umlauts
  return `<h1>${data.produktname}</h1>

<h2>Zuverlässige Energie für professionelle Anwendungen</h2>
<p>Die ${data.produktname} ist eine hochwertige Energiequelle, die speziell für zuverlässige Leistung in anspruchsvollen Anwendungen entwickelt wurde. Mit ihrer stabilen Spannung${data.spannung !== NA ? " von " + data.spannung : ""} und einer hohen Energiedichte eignet sie sich ideal für ${data.einsatzzweck} und elektronische Systeme mit dauerhaftem Energiebedarf.</p>
<p>Diese Batterie zeichnet sich durch ihre lange Lebensdauer, ${data.lagereigenschaften !== NA ? data.lagereigenschaften.toLowerCase() : "geringe selbstentladung"} und hohe Zuverlässigkeit aus. Sie ist perfekt für professionelle Anforderungen geeignet.</p>
<p>Passend für folgende Geräte:</p>
<p>✅ ${data.kompatibilitaet_kurz.replace("Kompatibel mit Geräten der Hersteller ", "").replace(".", "")}</p>

<h2>Technische Daten</h2>
<table border="0" summary="">
<tbody>
${tableRows}
</tbody>
</table>

<h2>Lieferumfang</h2>
<ul>
<li>${data.lieferumfang}</li>
</ul>`;
}
