import { parseDescription, detectProductType, ParseResult, ProductType } from './parser';
import { renderAkkuHtml, validateRenderedHtml, RenderResult, renderAkkuHtmlWithCategory } from './renderer';
import { detectProductCategoryWithAI, ProductCategory } from './category-detection';

export interface ProductRow {
  'p_item_number': string;
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
  _category?: string;
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

export type ProgressCallback = (current: number, total: number, productName: string) => void;

// Schritt 1: Nur Kategorisierung
export interface CategorizedRow extends ProductRow {
  _category: string;
  _rowIndex: number;
  error?: string;
  _status: 'ready' | 'error';
}

export interface CategorizeResult {
  rows: CategorizedRow[];
  summary: {
    total: number;
    ready: number;
    errors: number;
    categories: Record<string, number>;
  };
}

export async function categorizeProducts(
  rows: ProductRow[],
  onProgress?: ProgressCallback
): Promise<CategorizeResult> {
  const results: CategorizedRow[] = [];
  let readyCount = 0;
  let errorCount = 0;
  const categoryCount: Record<string, number> = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const productName = row['p_name[de]'] || '';
    const description = row['p_description[de]'] || '';

    if (onProgress) {
      onProgress(i + 1, rows.length, productName.substring(0, 50));
    }

    if (!productName || !description || description.trim().length === 0) {
      results.push({
        ...row,
        _category: '-',
        _rowIndex: i,
        error: !productName ? 'Fehlende Pflichtspalte: p_name[de]' : 'Keine Produktbeschreibung vorhanden',
        _status: 'error',
      });
      errorCount++;
      continue;
    }

    try {
      const category = await detectProductCategoryWithAI(productName, description);
      categoryCount[category] = (categoryCount[category] || 0) + 1;
      
      results.push({
        ...row,
        _category: category,
        _rowIndex: i,
        _status: 'ready',
      });
      readyCount++;
    } catch (error: any) {
      results.push({
        ...row,
        _category: 'GENERISCH',
        _rowIndex: i,
        error: 'Kategorisierung fehlgeschlagen',
        _status: 'error',
      });
      errorCount++;
    }
  }

  return {
    rows: results,
    summary: {
      total: rows.length,
      ready: readyCount,
      errors: errorCount,
      categories: categoryCount,
    },
  };
}

// Schritt 2: Generierung mit vorgegebenen Kategorien
export async function generateFromCategorized(
  categorizedRows: CategorizedRow[],
  onProgress?: ProgressCallback
): Promise<GenerationResult> {
  const results: GeneratedRow[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < categorizedRows.length; i++) {
    const row = categorizedRows[i];
    const productName = row['p_name[de]'] || '';
    const description = row['p_description[de]'] || '';
    const category = row._category as ProductCategory;

    if (onProgress) {
      onProgress(i + 1, categorizedRows.length, productName.substring(0, 50));
    }

    if (row._status === 'error' || !productName || !description) {
      results.push({
        ...row,
        original_description: description,
        error: row.error || 'Keine Produktbeschreibung vorhanden',
        _status: 'error',
        _category: category,
      });
      errorCount++;
      continue;
    }

    const parseResult: ParseResult = parseDescription(description, productName);

    if (!parseResult.success || !parseResult.data) {
      results.push({
        ...row,
        original_description: description,
        error: parseResult.error || 'Parsing fehlgeschlagen',
        _status: 'error',
        _category: category,
      });
      errorCount++;
      continue;
    }

    const renderResult: RenderResult = await renderAkkuHtmlWithCategory(productName, parseResult.data, row._rowIndex, category);

    if (!renderResult.success || !renderResult.html) {
      results.push({
        ...row,
        original_description: description,
        error: renderResult.error || 'Rendering fehlgeschlagen',
        _status: 'error',
        _category: category,
      });
      errorCount++;
      continue;
    }

    const validation = validateRenderedHtml(renderResult.html);
    if (!validation.valid) {
      results.push({
        ...row,
        original_description: description,
        error: validation.error,
        _status: 'error',
        _category: category,
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
      _category: category,
    });
    successCount++;
  }

  return {
    rows: results,
    summary: {
      total: categorizedRows.length,
      success: successCount,
      errors: errorCount,
      skipped: 0,
    },
  };
}

export async function processProducts(
  rows: ProductRow[],
  onProgress?: ProgressCallback
): Promise<GenerationResult> {
  const results: GeneratedRow[] = [];
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const productName = row['p_name[de]'] || '';
    const description = row['p_description[de]'] || '';

    if (onProgress) {
      onProgress(i + 1, rows.length, productName.substring(0, 50));
    }

    // Einfache Logik: Beschreibung vorhanden = Erfolg möglich, keine Beschreibung = Fehler
    if (!productName || !description || description.trim().length === 0) {
      results.push({
        ...row,
        original_description: description,
        error: !productName ? 'Fehlende Pflichtspalte: p_name[de]' : 'Keine Produktbeschreibung vorhanden',
        _status: 'error',
      });
      errorCount++;
      continue;
    }

    // Produkttyp erkennen (nur für interne Logik, kein Überspringen mehr)
    const productType: ProductType = detectProductType(productName, description);

    const parseResult: ParseResult = parseDescription(description, productName);

    if (!parseResult.success || !parseResult.data) {
      results.push({
        ...row,
        original_description: description,
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
        original_description: description,
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
        original_description: description,
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
      _category: renderResult.category,
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
