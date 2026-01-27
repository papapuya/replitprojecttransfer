import { parseDescription, detectProductType, ParseResult, ProductType } from './parser';
import { renderAkkuHtml, validateRenderedHtml, RenderResult } from './renderer';

export interface ProductRow {
  'p_name[de]': string;
  'p_description[de]': string;
  [key: string]: any;
}

export interface GeneratedRow extends ProductRow {
  'p_description[de]': string;
  un_number?: string;
  hs_code?: string;
  bullet_1?: string;
  bullet_2?: string;
  bullet_3?: string;
  error?: string;
  _status: 'success' | 'error' | 'skipped';
}

export interface GenerationResult {
  rows: GeneratedRow[];
  summary: {
    total: number;
    success: number;
    errors: number;
    skipped: number;
  };
}

export async function processProducts(rows: ProductRow[]): Promise<GenerationResult> {
  const results: GeneratedRow[] = [];
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const productName = row['p_name[de]'] || '';
    const description = row['p_description[de]'] || '';

    if (!productName || !description) {
      results.push({
        ...row,
        error: 'Fehlende Pflichtspalten (p_name[de] oder p_description[de])',
        _status: 'error',
      });
      errorCount++;
      continue;
    }

    const productType: ProductType = detectProductType(productName, description);

    if (productType === 'unknown') {
      results.push({
        ...row,
        error: 'Produkttyp unklar (weder Akku noch Lampe erkannt)',
        _status: 'skipped',
      });
      skippedCount++;
      continue;
    }

    if (productType === 'lampe') {
      results.push({
        ...row,
        error: 'Lampen-Generierung noch nicht implementiert',
        _status: 'skipped',
      });
      skippedCount++;
      continue;
    }

    const parseResult: ParseResult = parseDescription(description, productName);

    if (!parseResult.success || !parseResult.data) {
      results.push({
        ...row,
        error: parseResult.error || 'Parsing fehlgeschlagen',
        _status: 'error',
      });
      errorCount++;
      continue;
    }

    const renderResult: RenderResult = await renderAkkuHtml(productName, parseResult.data, i);

    if (!renderResult.success || !renderResult.html) {
      results.push({
        ...row,
        error: renderResult.error || 'Rendering fehlgeschlagen',
        _status: 'error',
      });
      errorCount++;
      continue;
    }

    const validation = validateRenderedHtml(renderResult.html);
    if (!validation.valid) {
      results.push({
        ...row,
        error: validation.error,
        _status: 'error',
      });
      errorCount++;
      continue;
    }

    results.push({
      ...row,
      original_description: description,
      'p_description[de]': renderResult.html,
      bullet_1: renderResult.bullet1,
      bullet_2: renderResult.bullet2,
      bullet_3: renderResult.bullet3,
      _status: 'success',
    });
    successCount++;
  }

  return {
    rows: results,
    summary: {
      total: rows.length,
      success: successCount,
      errors: errorCount,
      skipped: skippedCount,
    },
  };
}
