import OpenAI from 'openai';
import { 
  PromptContext, 
  SubpromptResult, 
  SubpromptConfig,
  SubpromptName 
} from './types';
import { getBaseSystemPrompt } from './base-system';
import { uspGenerationConfig } from './usp-generation';
import { techExtractionConfig } from './tech-extraction';
import { narrativeConfig } from './narrative';
import { safetyWarningsConfig } from './safety-warnings';
import { packageContentsConfig } from './package-contents';

const SUBPROMPT_CONFIGS: Record<SubpromptName, SubpromptConfig> = {
  'usp-generation': uspGenerationConfig,
  'tech-extraction': techExtractionConfig,
  'narrative': narrativeConfig,
  'safety-warnings': safetyWarningsConfig,
  'package-contents': packageContentsConfig,
};

export interface OrchestratorOptions {
  openaiKey: string;
  openaiBaseUrl?: string;
  model?: string;
}

export class PromptOrchestrator {
  private openai: OpenAI;
  private model: string;

  constructor(options: OrchestratorOptions) {
    this.openai = new OpenAI({
      apiKey: options.openaiKey,
      baseURL: options.openaiBaseUrl,
    });
    this.model = options.model || 'gpt-4o';
  }

  async executeSubprompt(
    name: SubpromptName,
    context: PromptContext,
    retries = 5
  ): Promise<SubpromptResult> {
    const config = SUBPROMPT_CONFIGS[name];
    if (!config) {
      return {
        success: false,
        data: null,
        error: `Unknown subprompt: ${name}`,
      };
    }

    // RETRY LOGIC: Exponential Backoff bei Rate Limit Errors
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const basePrompt = getBaseSystemPrompt();
        const systemPrompt = `${basePrompt}\n\n${config.systemPrompt(context)}`;
        const userPrompt = config.userPrompt(context);

        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          response_format: config.responseFormat ? { type: config.responseFormat } : undefined,
        });

        const content = response.choices[0]?.message?.content?.trim() || '{}';
        
        if (config.responseFormat === 'json_object') {
          try {
            const parsedData = JSON.parse(content);
            return {
              success: true,
              data: parsedData,
            };
          } catch (parseError) {
            console.error(`Failed to parse JSON from ${name}:`, content);
            return {
              success: false,
              data: null,
              error: 'Invalid JSON response',
            };
          }
        } else {
          return {
            success: true,
            data: content,
          };
        }
      } catch (error: any) {
        // Rate Limit Error: Retry with exponential backoff
        if (error.status === 429 && attempt < retries - 1) {
          const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s, 16s
          console.log(`⚠️ Rate limit hit for ${name}, retrying in ${waitTime}ms (attempt ${attempt + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue; // Retry
        }
        
        // Other errors or max retries reached
        console.error(`Subprompt ${name} failed:`, error);
        return {
          success: false,
          data: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
    
    // Should never reach here, but TypeScript requires it
    return {
      success: false,
      data: null,
      error: 'Max retries exceeded',
    };
  }

  async executeMultiple(
    subprompts: SubpromptName[],
    context: PromptContext
  ): Promise<Record<SubpromptName, SubpromptResult>> {
    const results = await Promise.all(
      subprompts.map(name => 
        this.executeSubprompt(name, context).then(result => ({ name, result }))
      )
    );

    return results.reduce((acc, { name, result }) => {
      acc[name] = result;
      return acc;
    }, {} as Record<SubpromptName, SubpromptResult>);
  }

  async generateFullProductCopy(context: PromptContext): Promise<{
    tagline?: string;
    narrative: string;
    uspBullets: string[];
    technicalSpecs: Record<string, string>;
    safetyNotice?: string;
    packageContents?: string;
    productHighlights: string[];
  }> {
    const results = await this.executeMultiple(
      ['narrative', 'usp-generation', 'tech-extraction', 'safety-warnings', 'package-contents'],
      context
    );

    const tagline = results['narrative']?.success 
      ? results['narrative'].data.tagline || ''
      : undefined;

    const narrative = results['narrative']?.success 
      ? results['narrative'].data.narrative || ''
      : 'Hochwertiges Produkt für professionelle Anwendungen.';

    const uspBullets = results['usp-generation']?.success
      ? results['usp-generation'].data.usps || []
      : [];

    const technicalSpecs = results['tech-extraction']?.success
      ? results['tech-extraction'].data.technicalSpecs || {}
      : {};

    const safetyNotice = results['safety-warnings']?.success
      ? results['safety-warnings'].data.safetyNotice
      : undefined;

    const packageContents = results['package-contents']?.success
      ? results['package-contents'].data.packageContents
      : undefined;

    return {
      tagline,
      narrative,
      uspBullets,
      technicalSpecs,
      safetyNotice,
      packageContents,
      productHighlights: results['narrative'].success && results['narrative'].data?.productHighlights 
        ? results['narrative'].data.productHighlights 
        : []
    };
  }
}

export function createOrchestrator(options: OrchestratorOptions): PromptOrchestrator {
  return new PromptOrchestrator(options);
}
