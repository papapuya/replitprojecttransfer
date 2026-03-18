/**
 * DeepL Translation Service
 * Übersetzt Produktnamen und Beschreibungen ins Niederländische
 */

interface DeepLTranslation {
  detected_source_language: string;
  text: string;
}

interface DeepLResponse {
  translations: DeepLTranslation[];
}

/**
 * Entfernt EMCOM aus übersetzten Texten
 * EMCOM ist die Eigenmarke und darf nie im Text erscheinen
 */
function removeEmcomFromText(text: string): string {
  if (!text) return text;
  
  let cleaned = text;
  // EMCOM mit Bindestrich am Anfang entfernen (z.B. "EMCOM-batterij")
  cleaned = cleaned.replace(/^EMCOM[-–]?\s*/gi, '');
  // EMCOM mit Bindestrich in der Mitte entfernen
  cleaned = cleaned.replace(/\s+EMCOM[-–]?\s*/gi, ' ');
  // "von EMCOM", "by EMCOM", "van EMCOM" entfernen
  cleaned = cleaned.replace(/\s+(von|by|from|van|door)\s+EMCOM\b/gi, '');
  // EMCOM mit nachfolgendem Bindestrich/Komma/Doppelpunkt
  cleaned = cleaned.replace(/\bEMCOM[-–,:]\s*/gi, '');
  // Alleinstehend "EMCOM" entfernen
  cleaned = cleaned.replace(/\bEMCOM\b/gi, '');
  // Führende Bindestriche nach Entfernung bereinigen
  cleaned = cleaned.replace(/^[-–]\s*/g, '');
  // Doppelte Leerzeichen und Bindestriche bereinigen
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

export class DeepLService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.DEEPL_API_KEY || '';
    this.baseUrl = this.apiKey.endsWith(':fx') 
      ? 'https://api-free.deepl.com/v2' 
      : 'https://api.deepl.com/v2';
  }

  async translateToNL(text: string): Promise<string> {
    if (!this.apiKey) {
      console.warn('⚠️ DEEPL_API_KEY nicht gesetzt');
      return '';
    }

    if (!text || text.trim() === '') {
      return '';
    }

    try {
      const response = await fetch(`${this.baseUrl}/translate`, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: [text],
          source_lang: 'DE',
          target_lang: 'NL',
          preserve_formatting: true,
          tag_handling: 'html',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ DeepL API Fehler: ${response.status} - ${errorText}`);
        return '';
      }

      const data: DeepLResponse = await response.json();
      const translatedText = removeEmcomFromText(data.translations[0]?.text || '');
      console.log(`🇳🇱 Übersetzt: "${text.substring(0, 50)}..." → "${translatedText.substring(0, 50)}..."`);
      return translatedText;
    } catch (error) {
      console.error('❌ DeepL Übersetzungsfehler:', error);
      return '';
    }
  }

  async translateBatch(texts: string[]): Promise<string[]> {
    return this.translateBatchGeneric(texts, 'DE', 'NL');
  }

  async translateBatchToDE(texts: string[]): Promise<string[]> {
    return this.translateBatchGeneric(texts, 'NL', 'DE');
  }

  async translateBatchGeneric(texts: string[], sourceLang: string, targetLang: string): Promise<string[]> {
    if (!this.apiKey) {
      console.warn('⚠️ DEEPL_API_KEY nicht gesetzt');
      return texts;
    }

    const CHUNK_SIZE = 50;
    const results: string[] = [...texts];

    // Indizes der gültigen Texte sammeln
    const validIndices: number[] = [];
    for (let i = 0; i < texts.length; i++) {
      if (texts[i] && texts[i].trim() !== '') validIndices.push(i);
    }
    if (validIndices.length === 0) return results;

    // In Chunks aufteilen und parallel verarbeiten
    const chunks: number[][] = [];
    for (let i = 0; i < validIndices.length; i += CHUNK_SIZE) {
      chunks.push(validIndices.slice(i, i + CHUNK_SIZE));
    }

    await Promise.all(chunks.map(async (chunk) => {
      const chunkTexts = chunk.map(i => texts[i]);
      try {
        const response = await fetch(`${this.baseUrl}/translate`, {
          method: 'POST',
          headers: {
            'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: chunkTexts,
            source_lang: sourceLang,
            target_lang: targetLang,
            preserve_formatting: true,
            tag_handling: 'html',
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ DeepL API Fehler: ${response.status} - ${errorText}`);
          return;
        }

        const data: DeepLResponse = await response.json();
        chunk.forEach((originalIdx, j) => {
          const translated = removeEmcomFromText(data.translations[j]?.text || texts[originalIdx]);
          results[originalIdx] = translated;
        });
      } catch (error) {
        console.error('❌ DeepL Chunk-Übersetzungsfehler:', error);
      }
    }));

    console.log(`🌐 DeepL ${sourceLang}→${targetLang}: ${validIndices.length} Texte in ${chunks.length} Chunks übersetzt`);
    return results;
  }
}

export const deeplService = new DeepLService();
