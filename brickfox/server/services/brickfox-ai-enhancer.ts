/**
 * Brickfox AI Enhancement Service
 * Uses OpenAI to generate missing Brickfox fields
 */

import OpenAI from 'openai';
import type { ProductInProject } from '../../shared/schema';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface AIEnhancementResult {
  customs_tariff_number?: string;
  customs_tariff_text?: string;
  optimized_description?: string;
}

/**
 * Generate customs tariff number (Zolltarifnummer) using AI
 */
async function generateCustomsTariffNumber(product: ProductInProject): Promise<{ number: string; text: string } | null> {
  try {
    const extractedData = product.extractedData?.[0];
    const customAttrs = product.customAttributes || [];
    
    const productInfo = `
      Produktname: ${product.name || product.exactProductName || 'Unbekannt'}
      Artikelnummer: ${product.articleNumber || 'Unbekannt'}
      Kategorie: ${customAttrs.find(a => a.key === 'kategorie')?.value || extractedData?.fileName || 'Unbekannt'}
      Hersteller: ${customAttrs.find(a => a.key === 'hersteller')?.value || 'Unbekannt'}
    `.trim();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Du bist ein Experte für Zolltarifnummern (HS-Codes). Generiere die korrekte 8-stellige Zolltarifnummer für das beschriebene Produkt. Antworte NUR mit der Nummer und einer kurzen Beschreibung im Format: "12345678|Beschreibung".'
        },
        {
          role: 'user',
          content: `Bestimme die Zolltarifnummer für folgendes Produkt:\n\n${productInfo}`
        }
      ],
      temperature: 0.3,
      max_tokens: 100,
    });

    const result = response.choices[0]?.message?.content?.trim();
    if (!result) return null;

    const [number, ...textParts] = result.split('|');
    const text = textParts.join('|').trim();

    return {
      number: number.trim(),
      text: text || number.trim()
    };
  } catch (error) {
    console.error('[AI Enhancer] Failed to generate customs tariff:', error);
    return null;
  }
}

/**
 * Optimize product description for Brickfox/OTTO Market
 */
async function optimizeDescription(product: ProductInProject): Promise<string | null> {
  try {
    const extractedData = product.extractedData?.[0];
    const customAttrs = product.customAttributes || [];
    
    // Use description from customAttributes (scraped from supplier)
    const scrapedDesc = customAttrs.find(a => a.key === 'description')?.value;
    const originalDescription = scrapedDesc || product.previewText || extractedData?.extractedText || extractedData?.description || '';
    
    if (!originalDescription) return null;

    const productInfo = `
      Produktname: ${product.name || product.exactProductName}
      Hersteller: ${customAttrs.find(a => a.key === 'manufacturer')?.value || ''}
      Kategorie: ${customAttrs.find(a => a.key === 'category')?.value || ''}
      Original-Beschreibung: ${originalDescription}
    `.trim();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Du bist ein Experte für E-Commerce Produktbeschreibungen. Optimiere die Produktbeschreibung für bessere Verkaufschancen: kurz, prägnant, verkaufsfördernd, SEO-optimiert. Verwende Bullet-Points für Features. Max. 500 Zeichen.'
        },
        {
          role: 'user',
          content: `Optimiere folgende Produktbeschreibung:\n\n${productInfo}`
        }
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    return response.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error('[AI Enhancer] Failed to optimize description:', error);
    return null;
  }
}

/**
 * Enhance product data with AI-generated fields
 */
export async function enhanceProductWithAI(product: ProductInProject): Promise<AIEnhancementResult> {
  const result: AIEnhancementResult = {};

  try {
    // Generate all AI fields in parallel for speed
    const [tariff, description] = await Promise.all([
      generateCustomsTariffNumber(product),
      optimizeDescription(product),
    ]);

    if (tariff) {
      result.customs_tariff_number = tariff.number;
      result.customs_tariff_text = tariff.text;
    }

    if (description) {
      result.optimized_description = description;
    }

    return result;
  } catch (error) {
    console.error('[AI Enhancer] Error enhancing product:', error);
    return result;
  }
}

/**
 * Batch enhance multiple products
 */
export async function enhanceProductsWithAI(products: ProductInProject[]): Promise<Map<string, AIEnhancementResult>> {
  const results = new Map<string, AIEnhancementResult>();

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (product) => {
        const enhancement = await enhanceProductWithAI(product);
        return { id: product.id, enhancement };
      })
    );

    batchResults.forEach(({ id, enhancement }) => {
      results.set(id, enhancement);
    });

    // Small delay between batches
    if (i + batchSize < products.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}
