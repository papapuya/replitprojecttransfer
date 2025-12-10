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
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ DeepL API Fehler: ${response.status} - ${errorText}`);
        return '';
      }

      const data: DeepLResponse = await response.json();
      const translatedText = data.translations[0]?.text || '';
      console.log(`🇳🇱 Übersetzt: "${text.substring(0, 50)}..." → "${translatedText.substring(0, 50)}..."`);
      return translatedText;
    } catch (error) {
      console.error('❌ DeepL Übersetzungsfehler:', error);
      return '';
    }
  }

  async translateBatch(texts: string[]): Promise<string[]> {
    if (!this.apiKey) {
      console.warn('⚠️ DEEPL_API_KEY nicht gesetzt');
      return texts.map(() => '');
    }

    const validTexts = texts.filter(t => t && t.trim() !== '');
    if (validTexts.length === 0) {
      return texts.map(() => '');
    }

    try {
      const response = await fetch(`${this.baseUrl}/translate`, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: validTexts,
          source_lang: 'DE',
          target_lang: 'NL',
          preserve_formatting: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ DeepL API Fehler: ${response.status} - ${errorText}`);
        return texts.map(() => '');
      }

      const data: DeepLResponse = await response.json();
      
      const results: string[] = [];
      let translationIndex = 0;
      
      for (const originalText of texts) {
        if (originalText && originalText.trim() !== '') {
          results.push(data.translations[translationIndex]?.text || '');
          translationIndex++;
        } else {
          results.push('');
        }
      }
      
      console.log(`🇳🇱 Batch-Übersetzung: ${validTexts.length} Texte übersetzt`);
      return results;
    } catch (error) {
      console.error('❌ DeepL Batch-Übersetzungsfehler:', error);
      return texts.map(() => '');
    }
  }
}

export const deeplService = new DeepLService();
