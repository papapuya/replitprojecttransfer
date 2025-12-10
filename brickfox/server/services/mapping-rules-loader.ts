import { readFileSync } from 'fs';
import { join } from 'path';

export interface MappingRules {
  version: string;
  description: string;
  source: string;
  target: string;
  mapping: Record<string, string[]>;
  mappingPriority: Record<string, string[]>;
  fixedValues: Record<string, string | number>;
  autoGenerate: Record<string, {
    dependsOn: string;
    rule: string;
    fallback?: string;
  }>;
  transformations: Record<string, {
    type: string;
    from?: string;
    to?: string;
    formula?: string;
  }>;
  validation: {
    required: string[];
    dataTypes: Record<string, string>;
    ranges: Record<string, { min: number; max: number }>;
  };
  outputFormat: {
    type: string;
    delimiter: string;
    encoding: string;
    includeHeader: boolean;
    columns: string[];
  };
}

/**
 * Load mapping rules from mappingRules.json
 */
export function loadMappingRules(): MappingRules {
  try {
    const filePath = join(process.cwd(), 'mappingRules.json');
    const fileContent = readFileSync(filePath, 'utf-8');
    const rules = JSON.parse(fileContent) as MappingRules;
    
    console.log(`[Mapping Rules] Loaded rules version ${rules.version}`);
    console.log(`[Mapping Rules] Fixed values: ${Object.keys(rules.fixedValues).length} fields`);
    
    return rules;
  } catch (error: any) {
    console.error('[Mapping Rules] Error loading mappingRules.json:', error.message);
    throw new Error('Failed to load mapping rules');
  }
}

/**
 * Apply transformations to a value
 */
export function applyTransformation(
  value: string | number,
  transformation: MappingRules['transformations'][string]
): string | number {
  if (!value || !transformation) return value;
  
  try {
    if (transformation.type === 'unit_conversion') {
      const numValue = typeof value === 'string' ? parseFloat(value) : value;
      if (isNaN(numValue)) return value;
      
      // Execute transformation formula
      if (transformation.formula === 'value / 1000') {
        return (numValue / 1000).toFixed(3);
      } else if (transformation.formula === 'value / 10') {
        return (numValue / 10).toFixed(1);
      }
    }
  } catch (error) {
    console.error('[Transformation] Error applying transformation:', error);
  }
  
  return value;
}

/**
 * Generate auto-generated fields (e.g., category path from voltage)
 */
export function generateAutoField(
  rule: MappingRules['autoGenerate'][string],
  productData: any
): string | null {
  if (!rule) return null;
  
  try {
    // Extract value from product data
    const dependsOnValue = productData[rule.dependsOn];
    
    if (dependsOnValue) {
      // Replace template variables in rule (e.g., {{Nominalspannung (V)}})
      let result = rule.rule.replace(
        new RegExp(`\\{\\{${rule.dependsOn}\\}\\}`, 'g'),
        dependsOnValue
      );
      return result;
    } else if (rule.fallback) {
      return rule.fallback;
    }
  } catch (error) {
    console.error('[Auto-Generate] Error generating auto field:', error);
  }
  
  return rule.fallback || null;
}
