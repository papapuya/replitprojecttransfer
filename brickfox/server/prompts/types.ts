export interface PromptContext {
  categoryName: string;
  categoryDescription: string;
  productData: any;
  availableFields?: string[];
  uspTemplates?: string[];
}

export interface SubpromptResult {
  success: boolean;
  data: any;
  error?: string;
}

export type SubpromptName = 
  | 'usp-generation'
  | 'tech-extraction'
  | 'narrative'
  | 'safety-warnings'
  | 'package-contents';

export interface SubpromptConfig {
  name: SubpromptName;
  systemPrompt: (context: PromptContext) => string;
  userPrompt: (context: PromptContext) => string;
  temperature: number;
  maxTokens: number;
  responseFormat?: 'json_object' | 'text';
}
