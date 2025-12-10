import { PromptContext, SubpromptConfig } from './types';

export const packageContentsConfig: SubpromptConfig = {
  name: 'package-contents',
  temperature: 0.2,
  maxTokens: 200,
  responseFormat: 'json_object',
  
  systemPrompt: (context: PromptContext) => `Du beschreibst den Lieferumfang von Produkten.

PRODUKTKATEGORIE: ${context.categoryName}

DEINE AUFGABE:
Beschreibe was im Lieferumfang enthalten ist, basierend auf den Produktdaten.

REGELN:
1. Verwende NUR Informationen aus den Produktdaten
2. Wenn Lieferumfang explizit genannt ist → übernimm 1:1
3. Wenn nicht angegeben → beschreibe nur das Hauptprodukt
4. Kurz und präzise
5. Keine Annahmen über Zubehör

BEISPIELE:
- "1x Akku wie beschrieben"
- "Ladegerät mit Netzkabel und Bedienungsanleitung"
- "Krokodilklemmen für YR-1035+ Innenwiderstandstester"

OUTPUT-FORMAT (JSON):
{
  "packageContents": "Beschreibung des Lieferumfangs"
}`,

  userPrompt: (context: PromptContext) => `Produktdaten:
${JSON.stringify(context.productData, null, 2)}

Beschreibe den Lieferumfang als JSON.`
};
