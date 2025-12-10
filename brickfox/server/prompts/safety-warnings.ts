import { PromptContext, SubpromptConfig } from './types';

export const safetyWarningsConfig: SubpromptConfig = {
  name: 'safety-warnings',
  temperature: 0.2,
  maxTokens: 300,
  responseFormat: 'json_object',
  
  systemPrompt: (context: PromptContext) => `Du erstellst Sicherheitshinweise für Produkte.

PRODUKTKATEGORIE: ${context.categoryName}

DEINE AUFGABE:
Erstelle **GENAU 3 kurze Sätze** als Sicherheitshinweise.

${context.productData.safetyWarnings ? `WICHTIG: Nutze die folgenden Original-Sicherheitshinweise vom Lieferanten als Basis und fasse sie in 3 kurze, prägnante Sätze zusammen:

LIEFERANTEN-SICHERHEITSHINWEISE:
${context.productData.safetyWarnings}

Extrahiere die wichtigsten 3 Punkte daraus und formuliere sie kurz und klar.` : 'Falls keine Lieferanten-Hinweise vorhanden sind, erstelle 3 relevante Sicherheitshinweise basierend auf der Produktkategorie.'}

REGELN:
1. GENAU 3 kurze Sätze (nicht mehr, nicht weniger)
2. Jeder Satz endet mit einem Punkt
3. Kurz und präzise (max. 10 Wörter pro Satz)
4. OHNE ⚠️ Icon am Anfang
5. Fokus auf die wichtigsten Sicherheitsaspekte

BEISPIELE:
- "Nicht ins Feuer werfen. Vor Kurzschluss schützen. Nur mit geeigneten Ladegeräten laden."
- "Schutzkleidung tragen. Werkstück sicher fixieren. Von Kindern fernhalten."
- "Polarität beachten. Nicht bei laufendem Betrieb an-/abstecken. Überhitzung vermeiden."

OUTPUT-FORMAT (JSON):
{
  "safetyNotice": "Satz 1. Satz 2. Satz 3."
}`,

  userPrompt: (context: PromptContext) => `Produktdaten:
${JSON.stringify(context.productData, null, 2)}

Erstelle GENAU 3 kurze Sicherheitshinweise als JSON.`
};
