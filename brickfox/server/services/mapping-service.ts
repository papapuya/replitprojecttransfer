import { promises as fs } from 'fs';
import path from 'path';

interface MappingRules {
  version: string;
  description: string;
  source: string;
  target: string;
  mapping: Record<string, string[]>;
  mappingPriority: Record<string, string[]>;
  fixedValues: Record<string, string>;
  autoGenerate: Record<string, {
    dependsOn: string;
    rule: string;
    fallback?: string;
  }>;
  transformations: Record<string, {
    type: string;
    from: string;
    to: string;
    formula: string;
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

interface MappingResult {
  success: boolean;
  data?: Record<string, string>[];
  csv?: string;
  errors?: string[];
  warnings?: string[];
  stats?: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    missingFields: string[];
  };
}

export class MappingService {
  private rules: MappingRules | null = null;
  private rulesPath = path.join(process.cwd(), 'mappingRules.json');

  async loadRules(): Promise<void> {
    try {
      const content = await fs.readFile(this.rulesPath, 'utf-8');
      this.rules = JSON.parse(content);
      console.log('[MappingService] Mapping rules loaded successfully');
    } catch (error) {
      console.error('[MappingService] Failed to load mapping rules:', error);
      throw new Error('Failed to load mapping rules');
    }
  }

  async applyMapping(sourceData: Record<string, any>[]): Promise<MappingResult> {
    if (!this.rules) {
      await this.loadRules();
    }

    if (!this.rules) {
      return {
        success: false,
        errors: ['Mapping rules not loaded']
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const mappedData: Record<string, string>[] = [];
    let validRows = 0;
    let invalidRows = 0;

    for (let i = 0; i < sourceData.length; i++) {
      const row = sourceData[i];
      const rowErrors: string[] = [];

      try {
        const mappedRow = await this.mapSingleRow(row, rowErrors, warnings);
        
        if (rowErrors.length > 0) {
          invalidRows++;
          errors.push(`Row ${i + 1}: ${rowErrors.join(', ')}`);
        } else {
          validRows++;
          mappedData.push(mappedRow);
        }
      } catch (error) {
        invalidRows++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Row ${i + 1}: ${errorMsg}`);
      }
    }

    const csv = this.generateCSV(mappedData);

    return {
      success: validRows > 0,
      data: mappedData,
      csv,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      stats: {
        totalRows: sourceData.length,
        validRows,
        invalidRows,
        missingFields: this.getMissingRequiredFields(mappedData)
      }
    };
  }

  private async mapSingleRow(
    sourceRow: Record<string, any>,
    errors: string[],
    warnings: string[]
  ): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    if (!this.rules) throw new Error('Rules not loaded');

    for (const column of this.rules.outputFormat.columns) {
      result[column] = '';
    }

    const pendingMappings: Record<string, Array<{ sourceField: string; value: string; priority: number }>> = {};

    for (const [sourceField, targetFields] of Object.entries(this.rules.mapping)) {
      const sourceValue = sourceRow[sourceField];

      if (sourceValue === undefined || sourceValue === null || sourceValue === '') {
        continue;
      }

      for (const targetField of targetFields) {
        if (!pendingMappings[targetField]) {
          pendingMappings[targetField] = [];
        }

        let priority = 999;
        if (this.rules.mappingPriority[targetField]) {
          const priorityFields = this.rules.mappingPriority[targetField];
          const priorityIndex = priorityFields.indexOf(sourceField);
          if (priorityIndex !== -1) {
            priority = priorityIndex;
          }
        }

        pendingMappings[targetField].push({
          sourceField,
          value: String(sourceValue),
          priority,
        });
      }
    }

    for (const [targetField, candidates] of Object.entries(pendingMappings)) {
      candidates.sort((a, b) => a.priority - b.priority);
      result[targetField] = candidates[0].value;
    }

    for (const [field, value] of Object.entries(this.rules.fixedValues)) {
      result[field] = value;
    }

    for (const [field, config] of Object.entries(this.rules.autoGenerate)) {
      const dependsOnValue = sourceRow[config.dependsOn];
      
      if (dependsOnValue !== undefined && dependsOnValue !== null && dependsOnValue !== '') {
        const generatedValue = config.rule.replace(
          `{{${config.dependsOn}}}`,
          String(dependsOnValue)
        );
        result[field] = generatedValue;
      } else if (config.fallback) {
        result[field] = config.fallback;
        warnings.push(`Field ${field}: Using fallback value (${config.dependsOn} is missing)`);
      }
    }

    for (const [field, transformation] of Object.entries(this.rules.transformations)) {
      if (result[field] && result[field] !== '') {
        try {
          const value = parseFloat(result[field]);
          if (!isNaN(value)) {
            const transformed = this.applyTransformation(value, transformation.formula);
            if (transformed !== null) {
              result[field] = String(transformed);
            } else {
              warnings.push(`Unsupported transformation formula for ${field}: ${transformation.formula}`);
            }
          }
        } catch (error) {
          warnings.push(`Failed to transform ${field}: ${error}`);
        }
      }
    }

    const validationErrors = this.validateRow(result);
    if (validationErrors.length > 0) {
      errors.push(...validationErrors);
    }

    return result;
  }

  private applyTransformation(value: number, formula: string): number | null {
    const match = formula.match(/value\s*([+\-*/])\s*([\d.]+)/);
    if (!match) {
      return null;
    }

    const operator = match[1];
    const operand = parseFloat(match[2]);

    if (isNaN(operand)) {
      return null;
    }

    switch (operator) {
      case '+':
        return value + operand;
      case '-':
        return value - operand;
      case '*':
        return value * operand;
      case '/':
        return operand !== 0 ? value / operand : null;
      default:
        return null;
    }
  }

  private validateRow(row: Record<string, string>): string[] {
    const errors: string[] = [];

    if (!this.rules) return errors;

    for (const requiredField of this.rules.validation.required) {
      if (!row[requiredField] || row[requiredField] === '') {
        errors.push(`Required field missing: ${requiredField}`);
      }
    }

    for (const [field, dataType] of Object.entries(this.rules.validation.dataTypes)) {
      const value = row[field];
      if (value && value !== '') {
        if (dataType === 'number') {
          const numValue = parseFloat(value);
          if (isNaN(numValue)) {
            errors.push(`Field ${field} must be a number, got: ${value}`);
          }
        }
      }
    }

    for (const [field, range] of Object.entries(this.rules.validation.ranges)) {
      const value = row[field];
      if (value && value !== '') {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          if (numValue < range.min || numValue > range.max) {
            errors.push(
              `Field ${field} out of range: ${numValue} (expected ${range.min}-${range.max})`
            );
          }
        }
      }
    }

    return errors;
  }

  private getMissingRequiredFields(data: Record<string, string>[]): string[] {
    if (!this.rules || data.length === 0) return [];

    const missingFields = new Set<string>();

    for (const row of data) {
      for (const requiredField of this.rules.validation.required) {
        if (!row[requiredField] || row[requiredField] === '') {
          missingFields.add(requiredField);
        }
      }
    }

    return Array.from(missingFields);
  }

  private generateCSV(data: Record<string, string>[]): string {
    if (!this.rules || data.length === 0) return '';

    const delimiter = this.rules.outputFormat.delimiter;
    const columns = this.rules.outputFormat.columns;
    const lines: string[] = [];

    if (this.rules.outputFormat.includeHeader) {
      lines.push(columns.join(delimiter));
    }

    for (const row of data) {
      const values = columns.map(col => {
        const value = row[col] || '';
        if (value.includes(delimiter) || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      lines.push(values.join(delimiter));
    }

    return lines.join('\n');
  }

  async exportToFile(csv: string, filename: string): Promise<string> {
    const outputDir = path.join(process.cwd(), 'exports');
    
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (error) {
      console.error('[MappingService] Failed to create output directory:', error);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const outputPath = path.join(outputDir, `${filename}_${timestamp}.csv`);

    await fs.writeFile(outputPath, csv, 'utf-8');
    console.log(`[MappingService] CSV exported to: ${outputPath}`);

    return outputPath;
  }
}

export const mappingService = new MappingService();
