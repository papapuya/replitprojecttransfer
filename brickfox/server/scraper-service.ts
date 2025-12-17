import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

/**
 * Find Chromium executable path in Nix environment
 */
function findChromiumPath(): string {
  try {
    // Try to find chromium using 'which' command
    const path = execSync('which chromium', { encoding: 'utf8' }).trim();
    if (path) {
      console.log(`[Browser] Found Chromium at: ${path}`);
      return path;
    }
  } catch (error) {
    console.log('[Browser] Chromium not found with "which", trying alternative paths...');
  }
  
  // Fallback: Let Puppeteer use its bundled Chromium
  console.log('[Browser] Using Puppeteer bundled Chromium');
  return '';  // Empty string = use bundled version
}

/**
 * Extract technical specifications from description text
 * Looks for patterns like "0,3 mm", "Dicke: 0,3 mm", "Stärke 0.3mm"
 * Also extracts EAN, Weight (kg/g), and Prices
 */
function extractTechnicalSpecsFromText(text: string): Record<string, string> {
  const specs: Record<string, string> = {};
  
  console.log('[ExtractSpecs] Starting text extraction, text length:', text.length);
  console.log('[ExtractSpecs] TEXT SAMPLE (first 500 chars):', text.substring(0, 500));
  console.log('[ExtractSpecs] TEXT SAMPLE (chars 1000-1500):', text.substring(1000, 1500));
  
  // Pattern: "0,3 mm" or "0.3 mm" (thickness/Dicke) - return only number
  const thicknessPattern = /(?:dicke|stärke|thickness)?\s*[:\-]?\s*([\d,\.]+)\s*mm/gi;
  const thicknessMatches = text.match(thicknessPattern);
  console.log('[ExtractSpecs] Thickness matches:', thicknessMatches);
  if (thicknessMatches && thicknessMatches.length > 0) {
    const match = thicknessMatches[0].match(/([\d,\.]+)\s*mm/i);
    if (match) {
      specs.dicke = match[1].replace('.', ','); // Only number, no unit
      console.log('[ExtractSpecs] Found thickness:', specs.dicke);
    }
  }
  
  // Pattern: Weight in kilograms "0.023 kg" or "0,023kg" - convert to grams
  const weightKgPattern = /(\d+[.,]\d+)\s*kg/gi;
  const weightKgMatches = text.match(weightKgPattern);
  console.log('[ExtractSpecs] Weight kg matches:', weightKgMatches);
  if (weightKgMatches && weightKgMatches.length > 0) {
    const match = weightKgMatches[0].match(/(\d+[.,]\d+)/);
    if (match) {
      const kgValue = parseFloat(match[1].replace(',', '.'));
      const grams = Math.round(kgValue * 1000); // Convert kg to g
      specs.gewicht = grams.toString(); // Only number, no unit
      console.log('[ExtractSpecs] Found weight (kg->g):', specs.gewicht);
    }
  }
  
  // Pattern: Weight in grams - EXTREMELY AGGRESSIVE: any number close to "g" or "Gramm"
  if (!specs.gewicht) {
    // Try: "23g", "23 g", "Gewicht 23 g", "weight 23g", "23 Gramm", etc.
    const patterns = [
      /gewicht[:\s]+(\d+(?:[.,]\d+)?)/gi,  // "Gewicht: 23" or "Gewicht 23"
      /weight[:\s]+(\d+(?:[.,]\d+)?)/gi,   // "Weight: 23" or "Weight 23"
      /(\d+)\s*g(?:\s|$|$|,|\.)/gi,        // "23g " or "23g," or "23g."
      /(\d+(?:[.,]\d+)?)\s*gramm/gi,       // "23 gramm" or "23,5 gramm"
    ];
    
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        const match = matches[0].match(/(\d+(?:[.,]\d+)?)/);
        if (match) {
          const gValue = parseFloat(match[1].replace(',', '.'));
          specs.gewicht = Math.round(gValue).toString();
          console.log('[ExtractSpecs] Found weight (g) via pattern:', specs.gewicht, 'from:', matches[0]);
          break;
        }
      }
    }
  }
  
  // Pattern: EAN - EXTREMELY AGGRESSIVE
  // Try multiple patterns: 13-digit, with EAN/GTIN label, just numbers
  const eanPatterns = [
    /EAN[:\s]*(\d{13})/gi,
    /GTIN[:\s]*(\d{13})/gi,
    /(?:EAN|GTIN|Code)[:\s\-]*(\d{13})/gi,
    /(\d{13})/g,  // ANY 13-digit number as last resort
  ];
  
  for (const eanPattern of eanPatterns) {
    const eanMatches = text.match(eanPattern);
    console.log('[ExtractSpecs] EAN pattern', eanPattern, 'matches:', eanMatches);
    if (eanMatches && eanMatches.length > 0) {
      const match = eanMatches[0].match(/(\d{13})/);
      if (match) {
        specs.ean = match[1];
        console.log('[ExtractSpecs] Found EAN:', specs.ean);
        break;
      }
    }
  }
  
  // Pattern: Price - EXTREMELY AGGRESSIVE
  // Try: "€19,99", "19,99 €", "Price: 19,99", "0,89€", "$19.99", etc.
  const pricePatterns = [
    /(\d+[.,]\d{2})\s*€/gi,           // "19,99 €"
    /€\s*(\d+[.,]\d{2})/gi,           // "€ 19,99"
    /preis[:\s]+(\d+[.,]\d{2})/gi,    // "Preis: 19,99"
    /price[:\s]+(\d+[.,]\d{2})/gi,    // "Price: 19,99"
    /(\d+[.,]\d{2})\s*(?:euro|€|eur)/gi, // "19,99 euro" or "19,99 €" or "19,99 eur"
  ];
  
  for (const pricePattern of pricePatterns) {
    const priceMatches = text.match(pricePattern);
    console.log('[ExtractSpecs] Price pattern', pricePattern, 'matches:', priceMatches);
    if (priceMatches && priceMatches.length > 0) {
      const match = priceMatches[0].match(/(\d+[.,]\d{2})/);
      if (match) {
        specs.price = match[1].replace('.', ',');
        console.log('[ExtractSpecs] Found price:', specs.price);
        break;
      }
    }
  }
  
  console.log('[ExtractSpecs] Final specs:', specs);
  return specs;
}

export interface LoginConfig {
  loginUrl: string;
  usernameField: string;
  passwordField: string;
  username: string;
  password: string;
  userAgent?: string;
}

export interface ScraperSelectors {
  articleNumber?: string;
  productName?: string;
  ean?: string;
  manufacturer?: string;
  price?: string;
  priceGross?: string;  // Händler-EK-Preis (Brutto)
  rrp?: string;  // UVP / Empfohlener VK-Preis
  description?: string;
  longDescription?: string;  // Ausführliche Beschreibung
  images?: string;
  weight?: string;
  dimensions?: string;  // Abmessungen (L×B×H)
  category?: string;
  length?: string;
  bodyDiameter?: string;
  headDiameter?: string;
  weightWithoutBattery?: string;
  totalWeight?: string;
  powerSupply?: string;
  led1?: string;
  led2?: string;
  spotIntensity?: string;
  maxLuminosity?: string;
  maxBeamDistance?: string;
}

export interface ScrapedProduct {
  articleNumber: string;  // Brickfox Article Number (ANS + manufacturer number)
  manufacturerArticleNumber?: string;  // Original manufacturer article number
  productName: string;
  ean?: string;
  manufacturer?: string;
  price?: string;
  priceGross?: string;  // Händler-EK-Preis (Brutto)
  rrp?: string;  // UVP / Empfohlener VK-Preis
  ekPrice?: string;  // Einkaufspreis (Purchase Price)
  vkPrice?: string;  // Verkaufspreis (Sales Price) - calculated as EK * 2.38, rounded to .95
  description?: string;
  longDescription?: string;  // Ausführliche Beschreibung
  images: string[];
  weight?: string;
  dimensions?: string;  // Abmessungen (L×B×H)
  category?: string;
  length?: string;
  bodyDiameter?: string;
  headDiameter?: string;
  weightWithoutBattery?: string;
  totalWeight?: string;
  powerSupply?: string;
  led1?: string;
  led2?: string;
  spotIntensity?: string;
  maxLuminosity?: string;
  maxBeamDistance?: string;
  pdfManualUrl?: string;
  safetyWarnings?: string;
  rawHtml?: string;
  technicalDataTable?: string;
  autoExtractedDescription?: string;
}

export interface ScrapeOptions {
  url: string;
  selectors: ScraperSelectors;
  userAgent?: string;
  cookies?: string;
  timeout?: number;
}

/**
 * Login to a website and retrieve session cookies
 * Sends login form data and captures cookies from response
 */
export async function performLogin(config: LoginConfig): Promise<string> {
  const {
    loginUrl,
    usernameField,
    passwordField,
    username,
    password,
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  } = config;

  console.log(`[Login] Attempting login to ${loginUrl}`);

  try {
    // Prepare form data
    const formData = new URLSearchParams();
    formData.append(usernameField, username);
    formData.append(passwordField, password);

    // Send POST request with credentials
    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'User-Agent': userAgent,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de,en-US;q=0.7,en;q=0.3'
      },
      body: formData.toString(),
      redirect: 'manual' // Don't follow redirects automatically
    });

    // Extract cookies from Set-Cookie headers
    const setCookieHeaders = response.headers.getSetCookie();
    
    if (!setCookieHeaders || setCookieHeaders.length === 0) {
      console.log('[Login] No cookies received from login response');
      return '';
    }

    // Parse cookies and build cookie string
    const cookies = setCookieHeaders.map(cookie => {
      // Extract cookie name and value (before first semicolon)
      const match = cookie.match(/^([^=]+)=([^;]+)/);
      return match ? `${match[1]}=${match[2]}` : '';
    }).filter(c => c).join('; ');

    console.log(`[Login] Successfully obtained ${setCookieHeaders.length} cookies`);
    return cookies;
  } catch (error) {
    console.error('[Login] Login failed:', error);
    throw new Error(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract dealer price from analytics JSON embedded in HTML
 * Searches <script> tags for Google Analytics/Tag Manager data with price information
 * Returns price in German format (e.g., "87,50") or undefined if not found
 */
function extractDealerPriceFromAnalytics(html: string, articleNumber?: string): string | undefined {
  try {
    const $ = cheerio.load(html);
    
    // Search all script tags for analytics data
    const scriptTags = $('script');
    
    for (let i = 0; i < scriptTags.length; i++) {
      const scriptContent = $(scriptTags[i]).html();
      if (!scriptContent) continue;
      
      // Look for JSON patterns containing "price" field
      // Common patterns: dataLayer.push(...), gtag(...), window.dataLayer = [...]
      const jsonPatterns = [
        /"price":\s*([0-9.]+)/g,  // Simple: "price":87.5
        /\{"price":([0-9.]+),"index":/g,  // GA4 ecommerce items
      ];
      
      for (const pattern of jsonPatterns) {
        const matches = Array.from(scriptContent.matchAll(pattern));
        
        for (const match of matches) {
          const priceValue = parseFloat(match[1]);
          if (!isNaN(priceValue) && priceValue > 0) {
            // Additional validation: if articleNumber provided, check if it's nearby in the JSON
            if (articleNumber) {
              const contextStart = Math.max(0, match.index! - 200);
              const contextEnd = Math.min(scriptContent.length, match.index! + 200);
              const context = scriptContent.substring(contextStart, contextEnd);
              
              // Check if article number appears in the same JSON object
              if (context.includes(`"item_id":"${articleNumber}"`)) {
                const germanPrice = priceValue.toFixed(2).replace('.', ',');
                console.log(`[Analytics Price] Found dealer price for ${articleNumber}: ${germanPrice}€`);
                return germanPrice;
              }
            } else {
              // No article number validation, return first valid price found
              const germanPrice = priceValue.toFixed(2).replace('.', ',');
              console.log(`[Analytics Price] Found dealer price: ${germanPrice}€`);
              return germanPrice;
            }
          }
        }
      }
    }
    
    console.log('[Analytics Price] No dealer price found in analytics data');
    return undefined;
  } catch (error) {
    console.log('[Analytics Price] Error extracting price:', error);
    return undefined;
  }
}

/**
 * Helper function: Convert measurement to German format (comma, no units)
 * Automatically converts to millimeters (mm) for length measurements
 * Examples: 
 *   "250g" → "250", "1.5kg" → "1,5"
 *   "120mm" → "120", "12cm" → "120", "1.5m" → "1500"
 */
function formatMeasurement(text: string): string {
  if (!text) return '';
  
  // Extract numeric portion and detect unit
  const match = text.match(/([\d,.]+)\s*([a-zA-Z]+)?/);
  if (!match) return '';
  
  let value = match[1];
  const unit = match[2]?.toLowerCase() || '';
  
  // Normalize to internal format (dot as decimal separator)
  const hasComma = value.includes(',');
  const hasDot = value.includes('.');
  
  if (hasComma && hasDot) {
    const lastComma = value.lastIndexOf(',');
    const lastDot = value.lastIndexOf('.');
    
    if (lastComma > lastDot) {
      // German format: 1.234,56 → 1234.56
      value = value.replace(/\./g, '').replace(',', '.');
    } else {
      // English format: 1,234.56 → 1234.56
      value = value.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    // Only comma: convert to dot (e.g., 0,25 → 0.25)
    value = value.replace(',', '.');
  }
  // If only dot or neither: keep as is
  
  // Convert to number for unit conversion
  let numValue = parseFloat(value);
  
  // Convert length units to millimeters (mm)
  if (unit === 'cm' || unit === 'zentimeter') {
    numValue = numValue * 10; // cm → mm
  } else if (unit === 'm' || unit === 'meter') {
    numValue = numValue * 1000; // m → mm
  } else if (unit === 'km' || unit === 'kilometer') {
    numValue = numValue * 1000000; // km → mm
  }
  
  // Convert weight units to grams (g)
  else if (unit === 'kg' || unit === 'kilogramm') {
    numValue = numValue * 1000; // kg → g
  } else if (unit === 't' || unit === 'tonne') {
    numValue = numValue * 1000000; // t → g
  }
  // mm and g stay as is
  
  // Convert back to string with German format (comma as decimal separator)
  const formattedValue = numValue.toString().replace('.', ',');
  
  return formattedValue;
}

/**
 * Scrape single product using Puppeteer browser (for JavaScript-rendered pages requiring login)
 */
async function scrapeProductWithBrowser(
  url: string,
  selectors: ScraperSelectors,
  loginConfig?: LoginConfig
): Promise<ScrapedProduct> {
  console.log(`[Browser] Scraping product from: ${url}`);

  const chromiumPath = findChromiumPath();
  const launchOptions: any = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  };
  
  if (chromiumPath) {
    launchOptions.executablePath = chromiumPath;
  }
  
  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Set cookies if needed (MUCH faster than browser login!)
    if (loginConfig && (loginConfig as any).sessionCookies) {
      console.log(`[Browser] Setting session cookies for ${loginConfig.loginUrl}`);
      
      try {
        // Parse cookies from string to cookie objects
        const cookiesArray = JSON.parse((loginConfig as any).sessionCookies);
        
        // Set each cookie in the browser
        for (const cookie of cookiesArray) {
          await page.setCookie(cookie);
        }
        
        console.log(`[Browser] ✅ Set ${cookiesArray.length} session cookies`);
      } catch (error) {
        console.error('[Browser] Error setting cookies:', error);
        throw new Error(`Failed to set session cookies: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Navigate to product page
    console.log(`[Browser] Navigating to product: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Wait for critical product data to load (smart wait for article number or product name)
    try {
      await Promise.race([
        page.waitForSelector('[itemprop="sku"], .article-number, .product-code, h1', { timeout: 8000 }),
        new Promise(resolve => setTimeout(resolve, 8000))
      ]);
      console.log('[Browser] Product elements loaded');
    } catch (error) {
      console.log('[Browser] Timeout waiting for elements, continuing anyway');
    }
    
    // Additional wait for JavaScript rendering (reduced to 500ms for faster response)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get HTML for Cheerio parsing
    const html = await page.content();
    console.log(`[Browser] HTML fetched, length: ${html.length} characters`);
    
    await browser.close();
    
    // Use Cheerio to parse the rendered HTML
    const $ = cheerio.load(html);
    
    console.log('[Browser] 🚀 About to parse HTML with Cheerio...');
    
    // Continue with normal parsing logic (no cookies needed since we used browser login)
    try {
      const parsedProduct = parseProductFromHTML($, url, selectors, html, undefined);
      console.log('[Browser] ✅ Parsing complete, returning product:', Object.keys(parsedProduct));
      return parsedProduct;
    } catch (parseError) {
      console.error('[Browser] ❌ ERROR during parseProductFromHTML:', parseError);
      throw parseError;
    }
    
  } catch (error) {
    await browser.close();
    throw error;
  }
}

/**
 * Parse product data from Cheerio object (shared logic for both browser and fetch)
 */
function parseProductFromHTML(
  $: cheerio.CheerioAPI, 
  url: string, 
  selectors: ScraperSelectors, 
  html: string, 
  cookies?: string
): ScrapedProduct {

  const product: ScrapedProduct = {
    articleNumber: '',
    productName: '',
    images: []
  };

  // Detect supplier from URL
  const isANSMANN = url.includes('pim.ansmann.de');
  const isNitecore = url.includes('nitecore.de');
  
  // Article Number / SKU (support both 'articleNumber' and 'productCode')
  const articleSelector = (selectors as any).productCode || selectors.articleNumber;
  if (articleSelector) {
    const element = $(articleSelector).first();
    let manufacturerNumber = element.text().trim() || element.attr('content')?.trim() || '';
    
    // Keep original format with hyphens (e.g., "2447-3049-60")
    // DO NOT remove hyphens - required for Pixi ERP matching!
    
    // Store manufacturer article number (keep original format)
    product.manufacturerArticleNumber = manufacturerNumber;
    
    // Generate Brickfox article number based on supplier
    if (manufacturerNumber) {
      if (isANSMANN) {
        // ANSMANN: ANS + manufacturer number WITHOUT hyphens (e.g., "ANS15200010")
        product.articleNumber = 'ANS' + manufacturerNumber.replace(/-/g, '');
        console.log(`📦 [ANSMANN] Generated Article Number: ${product.articleNumber} (from ${manufacturerNumber})`);
      } else if (isNitecore) {
        // Nitecore: Use manufacturer number as-is (no prefix)
        product.articleNumber = manufacturerNumber;
        console.log(`📦 [Nitecore] Using Article Number: ${product.articleNumber}`);
      } else {
        // Generic: Use manufacturer number as-is
        product.articleNumber = manufacturerNumber;
        console.log(`📦 [Generic] Using Article Number: ${product.articleNumber}`);
      }
    } else {
      product.articleNumber = '';
    }
  }

  // Product Name
  if (selectors.productName) {
    const element = $(selectors.productName).first();
    product.productName = element.text().trim() || element.attr('content')?.trim() || '';
  }

  // EAN / Barcode
  if (selectors.ean) {
    const element = $(selectors.ean).first();
    product.ean = element.text().trim() || element.attr('content')?.trim() || '';
    
    // Fallback: Search for 13-digit number in HTML (like PHP regex)
    if (!product.ean) {
      const eanMatch = html.match(/"\d{13}"/);
      if (eanMatch) {
        product.ean = eanMatch[0].replace(/"/g, '');
      }
    }
  }

  // Manufacturer / Brand
  if (selectors.manufacturer) {
    const element = $(selectors.manufacturer).first();
    // Try text first, then common attributes (content, alt, title, data-brand)
    product.manufacturer = element.text().trim() 
      || element.attr('content')?.trim() 
      || element.attr('alt')?.trim() 
      || element.attr('title')?.trim() 
      || element.attr('data-brand')?.trim() 
      || '';
  }
  
  // Auto-detect manufacturer from URL for ANSMANN
  if (!product.manufacturer && url.includes('pim.ansmann.de')) {
    product.manufacturer = 'ANSMANN';
  }

  // Price - Try analytics JSON extraction first (for dealer prices when logged in)
  // Always try analytics extraction (works for both browser login and cookie-based login)
  let priceFound = false;
  const analyticsPrice = extractDealerPriceFromAnalytics(html, product.articleNumber);
  if (analyticsPrice) {
    product.price = analyticsPrice;
    priceFound = true;
    console.log(`✅ Using dealer price from analytics: ${analyticsPrice}€`);
  }

  // Fallback to CSS selector if analytics extraction didn't find a price
  if (!priceFound && selectors.price) {
    console.log(`[Price Extraction] Using CSS selector: ${selectors.price}`);
    const element = $(selectors.price).first();
    let priceText = element.text().trim() || element.attr('content')?.trim() || '';
    console.log(`[Price Extraction] Found text: "${priceText}"`);
    
    if (priceText) {
      // Step 1: Extract only the numeric portion with separators
      const numericMatch = priceText.match(/[\d,.]+/);
      if (numericMatch) {
        priceText = numericMatch[0];
      } else {
        priceText = '';
      }
      
      if (priceText) {
        // Step 2: Normalize to English format (dot as decimal separator)
        const hasComma = priceText.includes(',');
        const hasDot = priceText.includes('.');
        
        if (hasComma && hasDot) {
          // Both present: last one is decimal separator
          const lastComma = priceText.lastIndexOf(',');
          const lastDot = priceText.lastIndexOf('.');
          
          if (lastComma > lastDot) {
            // German format: 1.234,56 -> convert to English
            priceText = priceText.replace(/\./g, ''); // Remove thousands separators (dots)
            priceText = priceText.replace(',', '.'); // Convert decimal comma to dot
          } else {
            // English format: 1,234.56 -> keep dot, remove comma
            priceText = priceText.replace(/,/g, ''); // Remove thousands separators (commas)
          }
        } else if (hasDot && !hasComma) {
          // Only dot: check if it's thousands separator or decimal
          const dotParts = priceText.split('.');
          if (dotParts.length === 2 && dotParts[1].length <= 2) {
            // Likely decimal: 89.90 -> keep as is
          } else {
            // Likely thousands separator: 1.234 -> 1234
            priceText = priceText.replace(/\./g, '');
          }
        } else if (hasComma && !hasDot) {
          // Only comma: check if it's thousands separator or decimal
          const commaParts = priceText.split(',');
          if (commaParts.length === 2 && commaParts[1].length <= 2) {
            // Likely decimal: 89,90 -> convert to 89.90
            priceText = priceText.replace(',', '.');
          } else {
            // Likely thousands separator: 1,234 -> 1234
            priceText = priceText.replace(/,/g, '');
          }
        }
        
        // Step 3: Ensure exactly 2 decimal places
        if (!priceText.includes('.')) {
          // No decimals: add .00
          priceText = priceText + '.00';
        } else {
          const parts = priceText.split('.');
          if (parts[1]) {
            // Pad or truncate to exactly 2 decimals
            parts[1] = parts[1].padEnd(2, '0').substring(0, 2);
          } else {
            parts[1] = '00';
          }
          priceText = parts.join('.');
        }
        
        // Step 4: Convert to German format (comma instead of dot)
        priceText = priceText.replace('.', ',');
        console.log(`✅ Extracted price: ${priceText}€ from selector: ${selectors.price}`);
      } else {
        console.log(`⚠️ Price text empty after numeric extraction`);
      }
    } else {
      console.log(`⚠️ No price text found with selector: ${selectors.price}`);
    }
    
    product.price = priceText;
  } else {
    console.log(`[Price Extraction] Skipping CSS fallback - priceFound: ${priceFound}, has selector: ${!!selectors.price}`);
  }

  // Description (can be HTML)
  if (selectors.description) {
    const element = $(selectors.description).first();
    product.description = element.html()?.trim() || element.text().trim() || '';
    console.log(`[CSS Selector] Description selector: "${selectors.description}"`);
    console.log(`[CSS Selector] Description found: ${product.description.length > 0 ? '✅ YES (' + product.description.length + ' chars)' : '❌ NO'}`);
    if (product.description.length > 0) {
      console.log(`[CSS Selector] Description preview:`, product.description.substring(0, 150));
    }
  }

  // Long Description (ausführliche Beschreibung)
  if (selectors.longDescription) {
    const element = $(selectors.longDescription).first();
    product.longDescription = element.html()?.trim() || element.text().trim() || '';
  }

  // Price Gross (Händler-EK-Preis Brutto)
  if (selectors.priceGross) {
    const element = $(selectors.priceGross).first();
    let priceText = element.text().trim() || element.attr('content')?.trim() || '';
    if (priceText) {
      const numericMatch = priceText.match(/[\d,.]+/);
      if (numericMatch) {
        priceText = numericMatch[0];
        // Convert to German format with comma
        if (priceText.includes('.') && !priceText.includes(',')) {
          priceText = priceText.replace('.', ',');
        }
      }
    }
    product.priceGross = priceText;
  }

  // RRP / UVP (Empfohlener Verkaufspreis)
  if (selectors.rrp) {
    const element = $(selectors.rrp).first();
    let priceText = element.text().trim() || element.attr('content')?.trim() || '';
    if (priceText) {
      const numericMatch = priceText.match(/[\d,.]+/);
      if (numericMatch) {
        priceText = numericMatch[0];
        // Convert to German format with comma
        if (priceText.includes('.') && !priceText.includes(',')) {
          priceText = priceText.replace('.', ',');
        }
      }
    }
    product.rrp = priceText;
  }

  // Dimensions (Abmessungen)
  if (selectors.dimensions) {
    const element = $(selectors.dimensions).first();
    product.dimensions = element.text().trim() || '';
  }

  // Images (support both 'images' and 'image')
  const imageSelector = (selectors as any).image || selectors.images;
  if (imageSelector) {
    console.log(`[Images] Using selector: ${imageSelector}`);
    const imageElements = $(imageSelector);
    console.log(`[Images] Found ${imageElements.length} elements`);
    product.images = imageElements.map((_, el) => {
      const $el = $(el);
      // Try src, data-src, href - also check for nested img elements
      let src = $el.attr('src') || $el.attr('data-src') || $el.attr('href') || '';
      
      // If this is a link (a tag), look for img inside or use href
      if (!src || src.startsWith('javascript:')) {
        const nestedImg = $el.find('img');
        if (nestedImg.length > 0) {
          src = nestedImg.attr('src') || nestedImg.attr('data-src') || '';
        }
      }
      
      // Make absolute URL if relative
      if (src && !src.startsWith('http') && !src.startsWith('//')) {
        try {
          const urlObj = new URL(url);
          src = new URL(src, urlObj.origin).toString();
        } catch {}
      }
      
      console.log(`[Images] Element src: ${src.substring(0, 100)}...`);
      return src.trim();
    }).get().filter(Boolean);
    console.log(`[Images] Extracted ${product.images.length} images`);
  }

  // ANSMANN/Magento: ALWAYS try to extract gallery images from JSON (Magento stores all images in JSON)
  // CRITICAL FIX: Don't skip this even if we found 1 image - Magento always has multiple images in JSON
  try {
    // Find Magento gallery init script
    const scripts = $('script[type="text/x-magento-init"]');
    let foundMagentoGallery = false;
    
    scripts.each((_, scriptEl) => {
      const scriptContent = $(scriptEl).html();
      if (scriptContent && scriptContent.includes('mage/gallery/gallery')) {
        try {
          const json = JSON.parse(scriptContent);
          // Find the gallery config
          for (const key of Object.keys(json)) {
            if (json[key]['mage/gallery/gallery']) {
              const gallery = json[key]['mage/gallery/gallery'];
              if (gallery.data && Array.isArray(gallery.data)) {
                const galleryImages = gallery.data
                  .map((img: any) => img.full || img.img || img.thumb)
                  .filter(Boolean);
                
                if (galleryImages.length > 0) {
                  product.images = galleryImages;
                  console.log(`[Magento Gallery] ✅ Extracted ${galleryImages.length} images from JSON`);
                  foundMagentoGallery = true;
                  return false; // Break the loop
                }
              }
            }
          }
        } catch (parseError) {
          // Silent fail - continue with other scripts
        }
      }
    });
    
    if (!foundMagentoGallery && product.images && product.images.length > 0) {
      console.log(`[Magento Gallery] ⚠️  No Magento gallery found, using ${product.images.length} images from CSS selectors`);
    }
  } catch (error) {
    console.error('[Magento Gallery] Error parsing gallery JSON:', error);
  }

  // ANSMANN: Extract high-resolution images AND PDFs from Downloads tab
  // The Downloads tab contains JPG files and PDF manuals (MSDS, PIB, Bedienungsanleitung)
  try {
    const downloadImages: string[] = [];
    const downloadPdfs: string[] = [];
    
    // Find all links in the Downloads tab that point to image files
    $('#product-info-downloads a[href$=".jpg"], #product-info-downloads a[href$=".JPG"], #product-info-downloads a[href$=".png"], #product-info-downloads a[href$=".PNG"]').each((_, link) => {
      const href = $(link).attr('href');
      if (href && href.startsWith('http')) {
        downloadImages.push(href);
      }
    });
    
    // Find all links in the Downloads tab that point to PDF files
    $('#product-info-downloads a[href$=".pdf"], #product-info-downloads a[href$=".PDF"]').each((_, link) => {
      const href = $(link).attr('href');
      const text = $(link).text().trim().toLowerCase();
      if (href && href.startsWith('http')) {
        downloadPdfs.push(href);
      }
    });
    
    // If we found download images, prefer them over gallery images (higher quality!)
    if (downloadImages.length > 0) {
      console.log(`[ANSMANN Downloads] ✅ Extracted ${downloadImages.length} high-res images from Downloads tab`);
      // Merge with existing gallery images, prioritizing download images (remove duplicates)
      const allImages = [...downloadImages, ...(product.images || [])];
      product.images = Array.from(new Set(allImages)); // Remove duplicates
      console.log(`[ANSMANN Downloads] 🖼️  Total unique images: ${product.images.length}`);
    }
    
    // Store PDFs for Brickfox export (MSDS, Manuals, etc.)
    if (downloadPdfs.length > 0) {
      (product as any).pdfFiles = downloadPdfs;
      console.log(`[ANSMANN Downloads] 📄 Extracted ${downloadPdfs.length} PDF files from Downloads tab`);
    }
  } catch (error) {
    console.error('[ANSMANN Downloads] Error extracting download files:', error);
  }

  // Weight - Format for Brickfox: German format with comma, NO units (e.g., 250 or 1,5)
  if (selectors.weight) {
    console.log(`[Weight] Using selector: ${selectors.weight}`);
    let element = $(selectors.weight).first();
    let weightText = element.text().trim() || '';
    console.log(`[Weight] Direct selector result: "${weightText}"`);
    
    // Fallback for :contains() selectors (Cheerio has limited support)
    // Handle Baltrade-style: .featRow:contains(Weight) .features-values-single-value
    if (!weightText && selectors.weight.includes(':contains(')) {
      const containsMatch = selectors.weight.match(/:contains\(([^)]+)\)/i);
      if (containsMatch) {
        const searchText = containsMatch[1].toLowerCase();
        console.log(`[Weight] Fallback: searching for rows containing "${searchText}"`);
        // Find all rows and look for the one containing the search text
        $('.featRow, .product-info-row, .specification-row, tr').each((_, row) => {
          const rowText = $(row).text().toLowerCase();
          if (rowText.includes(searchText) || rowText.includes('gewicht') || rowText.includes('weight')) {
            // Get the value from the row
            const valueEl = $(row).find('.features-values-single-value, .value, td:last-child, span:last-child');
            if (valueEl.length > 0) {
              weightText = valueEl.text().trim();
              console.log(`[Weight] Found in row: "${weightText}"`);
              return false; // break
            }
          }
        });
      }
    }
    
    // Baltrade-specific: Search in .productFeatures table for weight
    if (!weightText) {
      console.log(`[Weight] Trying Baltrade .productFeatures extraction...`);
      $('.productFeatures .featRow').each((_, row) => {
        const labelText = $(row).find('.features-name, .feature-label, .name').text().toLowerCase();
        if (labelText.includes('weight') || labelText.includes('gewicht') || labelText.includes('waga')) {
          const valueEl = $(row).find('.features-values-single-value, .feature-value, .value');
          if (valueEl.length > 0) {
            weightText = valueEl.text().trim();
            console.log(`[Weight] Found in Baltrade productFeatures: "${weightText}"`);
            return false; // break
          }
        }
      });
    }
    
    // Also try Schema.org markup for weight
    if (!weightText) {
      const schemaWeight = $('[itemprop="weight"]').text().trim();
      if (schemaWeight) {
        weightText = schemaWeight;
        console.log(`[Weight] Found via Schema.org: "${weightText}"`);
      }
    }
    
    // Fallback: Search for "gewicht: XXXg" or "weight: XXXg" in HTML
    if (!weightText) {
      const weightMatch = html.match(/(?:gewicht|weight|waga)[\s:]*(\d+[\.,]?\d*)\s*(?:g|kg|gram)/i);
      if (weightMatch) {
        weightText = weightMatch[1];
        console.log(`[Weight] Found via regex: "${weightText}"`);
      }
    }
    
    if (weightText) {
      product.weight = formatMeasurement(weightText);
      console.log(`[Weight] Final weight: ${product.weight}`);
    } else {
      console.log(`[Weight] ⚠️ No weight found for this product`);
    }
  }

  // Category (use .last() to get the most specific category from breadcrumb)
  if (selectors.category) {
    const elements = $(selectors.category);
    // Take the last element (most specific category) and skip "Home" / "Startseite"
    let categoryText = '';
    
    if (elements.length > 0) {
      // Try from last to first, skip common navigation items
      for (let i = elements.length - 1; i >= 0; i--) {
        const text = $(elements[i]).text().trim();
        const lowerText = text.toLowerCase();
        
        // Skip common navigation items
        if (lowerText && 
            lowerText !== 'home' && 
            lowerText !== 'startseite' &&
            lowerText !== 'sie sind hier' &&
            !lowerText.includes('›') &&
            !lowerText.includes('>')) {
          categoryText = text;
          break;
        }
      }
    }
    
    product.category = categoryText;
  }

  // Nitecore Technical Fields - extract and format measurements (German format, no units)
  if (selectors.length) {
    const element = $(selectors.length).first();
    product.length = formatMeasurement(element.text().trim());
  }

  if (selectors.bodyDiameter) {
    const element = $(selectors.bodyDiameter).first();
    product.bodyDiameter = formatMeasurement(element.text().trim());
  }

  if (selectors.headDiameter) {
    const element = $(selectors.headDiameter).first();
    product.headDiameter = formatMeasurement(element.text().trim());
  }

  if (selectors.weightWithoutBattery) {
    const element = $(selectors.weightWithoutBattery).first();
    product.weightWithoutBattery = formatMeasurement(element.text().trim());
  }

  if (selectors.totalWeight) {
    const element = $(selectors.totalWeight).first();
    product.totalWeight = formatMeasurement(element.text().trim());
  }

  if (selectors.powerSupply) {
    const element = $(selectors.powerSupply).first();
    product.powerSupply = element.text().trim() || '';
  }

  if (selectors.led1) {
    const element = $(selectors.led1).first();
    product.led1 = element.text().trim() || '';
  }

  if (selectors.led2) {
    const element = $(selectors.led2).first();
    product.led2 = element.text().trim() || '';
  }

  if (selectors.spotIntensity) {
    const element = $(selectors.spotIntensity).first();
    product.spotIntensity = formatMeasurement(element.text().trim());
  }

  if (selectors.maxLuminosity) {
    const element = $(selectors.maxLuminosity).first();
    product.maxLuminosity = formatMeasurement(element.text().trim());
  }

  if (selectors.maxBeamDistance) {
    const element = $(selectors.maxBeamDistance).first();
    product.maxBeamDistance = formatMeasurement(element.text().trim());
  }

  // ANSMANN Technical Fields - extract and format measurements (German format, no units)
  if ((selectors as any).nominalspannung) {
    const element = $((selectors as any).nominalspannung).first();
    const rawValue = element.text().trim();
    (product as any).nominalspannung = formatMeasurement(rawValue);
    if (rawValue) console.log(`⚡ Extracted Nominalspannung: ${rawValue} → ${(product as any).nominalspannung}`);
  }

  if ((selectors as any).nominalkapazitaet) {
    const element = $((selectors as any).nominalkapazitaet).first();
    const rawValue = element.text().trim();
    (product as any).nominalkapazitaet = formatMeasurement(rawValue);
    if (rawValue) console.log(`🔋 Extracted Nominalkapazität: ${rawValue} → ${(product as any).nominalkapazitaet}`);
  }

  if ((selectors as any).maxEntladestrom) {
    const element = $((selectors as any).maxEntladestrom).first();
    const rawValue = element.text().trim();
    (product as any).maxEntladestrom = formatMeasurement(rawValue);
    if (rawValue) console.log(`⚡ Extracted max. Entladestrom: ${rawValue} → ${(product as any).maxEntladestrom}`);
  }
  
  // Fallback: Extract max. Entladestrom from description if not found via selector
  if (!(product as any).maxEntladestrom || (product as any).maxEntladestrom === '') {
    const entladestromMatch = html.match(/max\.\s*entladestrom[:\s]+([\d.,]+)\s*a/i);
    if (entladestromMatch) {
      (product as any).maxEntladestrom = formatMeasurement(entladestromMatch[1]);
      console.log(`📊 Extracted max. Entladestrom from description: ${(product as any).maxEntladestrom}`);
    }
  }

  if ((selectors as any).laenge) {
    const element = $((selectors as any).laenge).first();
    (product as any).laenge = formatMeasurement(element.text().trim());
  }

  if ((selectors as any).breite) {
    const element = $((selectors as any).breite).first();
    (product as any).breite = formatMeasurement(element.text().trim());
  }

  if ((selectors as any).hoehe) {
    const element = $((selectors as any).hoehe).first();
    (product as any).hoehe = formatMeasurement(element.text().trim());
  }

  if ((selectors as any).gewicht) {
    const element = $((selectors as any).gewicht).first();
    (product as any).gewicht = formatMeasurement(element.text().trim());
  }

  if ((selectors as any).zellenchemie) {
    const element = $((selectors as any).zellenchemie).first();
    (product as any).zellenchemie = element.text().trim() || '';
  }

  if ((selectors as any).energie) {
    const element = $((selectors as any).energie).first();
    (product as any).energie = formatMeasurement(element.text().trim());
  }

  if ((selectors as any).farbe) {
    const element = $((selectors as any).farbe).first();
    (product as any).farbe = element.text().trim() || '';
  }

  // ANSMANN: Extract Abmessungen (Dimensions) and split into Länge, Breite, Höhe
  // Format: "1.5 × 1.5 × 5.1 cm" or "70×37.5×37.5 mm" or "70×37,5×37,5 mm je Zelle"
  if (!(product as any).laenge || !(product as any).breite || !(product as any).hoehe) {
    let abmessungenText = '';
    
    // First try: Use abmessungen selector if available
    if ((selectors as any).abmessungen) {
      const element = $((selectors as any).abmessungen).first();
      abmessungenText = element.text().trim();
      console.log(`🔍 Extracted Abmessungen via selector: "${abmessungenText}"`);
    }
    
    // Fallback: Search in HTML if selector didn't work
    if (!abmessungenText) {
      const abmessungenHtmlMatch = html.match(/abmessungen[:\s]+([\d.,]+)\s*[×x]\s*([\d.,]+)\s*[×x]\s*([\d.,]+)\s*(mm|cm)/i);
      if (abmessungenHtmlMatch) {
        abmessungenText = abmessungenHtmlMatch[0];
        console.log(`🔍 Extracted Abmessungen from HTML: "${abmessungenText}"`);
      }
    }
    
    // Parse the extracted text (from selector or HTML)
    const abmessungenMatch = abmessungenText.match(/([\d.,]+)\s*[×x]\s*([\d.,]+)\s*[×x]\s*([\d.,]+)\s*(mm|cm)/i);
    if (abmessungenMatch) {
      // Normalize numbers: handle both German (,) and English (.) decimal separators
      const normalizeNumber = (num: string): string => {
        // If both comma and dot present, assume German format (1.234,5)
        if (num.includes(',') && num.includes('.')) {
          return num.replace(/\./g, '').replace(',', '.');
        }
        // If only comma, assume decimal separator (37,5)
        if (num.includes(',')) {
          return num.replace(',', '.');
        }
        // Otherwise already English format
        return num;
      };
      
      let laenge = normalizeNumber(abmessungenMatch[1]);
      let breite = normalizeNumber(abmessungenMatch[2]);
      let hoehe = normalizeNumber(abmessungenMatch[3]);
      const unit = abmessungenMatch[4].toLowerCase();
      
      // Convert cm to mm if needed
      if (unit === 'cm') {
        laenge = (parseFloat(laenge) * 10).toString();
        breite = (parseFloat(breite) * 10).toString();
        hoehe = (parseFloat(hoehe) * 10).toString();
      }
      
      // Format with German comma and no units
      (product as any).laenge = formatMeasurement(laenge);
      (product as any).breite = formatMeasurement(breite);
      (product as any).hoehe = formatMeasurement(hoehe);
      
      console.log(`📏 Extracted Abmessungen: ${(product as any).laenge} × ${(product as any).breite} × ${(product as any).hoehe} mm`);
    }
  }

  // Store raw HTML for debugging
  product.rawHtml = html.substring(0, 1000); // First 1000 chars

  // SMART AUTO-EXTRACTION: Description + Technical Data Table + PDF + Safety Warnings
  let smartExtraction: Record<string, any> = {};
  try {
    smartExtraction = autoExtractProductDetails($, html, url);
    if (smartExtraction.description) {
      product.autoExtractedDescription = smartExtraction.description;
    }
    if (smartExtraction.technicalDataTable) {
      product.technicalDataTable = smartExtraction.technicalDataTable;
    }
    if (smartExtraction.pdfManualUrl) {
      product.pdfManualUrl = smartExtraction.pdfManualUrl;
    }
    if (smartExtraction.safetyWarnings) {
      product.safetyWarnings = smartExtraction.safetyWarnings;
    }
  } catch (autoError) {
    console.warn('[Parser] autoExtractProductDetails error (non-critical):', autoError);
  }

  // INTELLIGENT TABLE PARSER: Extract structured technical data from properties tables
  try {
    parsePropertiesTable($, product);
  } catch (tableError) {
    console.warn('[Parser] parsePropertiesTable error (non-critical):', tableError);
  }

  // EXTRACT FROM PRODUCT AREA TEXT: EAN, Weight, Price (especially for pages like Phonetastik)
  // Try specific product-detail areas first, fallback to all text if nothing found
  let productText = '';
  const productArea = $('.product-detail, .od-product, [class*="product-detail"], main, article').first();
  if (productArea.length > 0) {
    productText = productArea.text().substring(0, 10000); // Limit to first 10k chars
    console.log('[ExtractSpecs] Found productArea, text length:', productText.length);
  } else {
    // FALLBACK: Use entire HTML text if no specific area found (common on supplier sites)
    productText = $.text().substring(0, 15000); // More content for generic sites
    console.log('[ExtractSpecs] No productArea found, using full page text, length:', productText.length);
  }
  
  if (productText.length > 0) {
    const pageSpecs = extractTechnicalSpecsFromText(productText);
    console.log('[ExtractSpecs] pageSpecs extracted:', pageSpecs);
    
    // Only apply if not already found via CSS selectors
    if (pageSpecs.ean && !product.ean) {
      product.ean = pageSpecs.ean;
      console.log(`📌 Extracted EAN from page text: ${product.ean}`);
    }
    if (pageSpecs.gewicht && !product.weight) {
      product.weight = pageSpecs.gewicht;
      console.log(`⚖️ Extracted weight from page text: ${product.weight}`);
    }
    // For Phonetastik ONLY: if dicke (thickness) is found but no weight, set weight to "1" (very light product)
    const isPhonetastik = url.toLowerCase().includes('phonetastik');
    if (pageSpecs.dicke && !product.weight && !product.length && isPhonetastik) {
      product.length = pageSpecs.dicke;
      if (!product.weight) {
        product.weight = '1'; // Schutzglas is very light, assume ~1g
        console.log(`📏 [Phonetastik] Extracted thickness (dicke) & set default weight: thickness=${product.length}, weight=1g`);
      }
    } else if (pageSpecs.dicke && !product.length) {
      product.length = pageSpecs.dicke;
      console.log(`📏 Extracted thickness (dicke) from page text: ${product.length}`);
    }
    if (pageSpecs.price && !product.price) {
      product.price = pageSpecs.price;
      console.log(`💰 Extracted price from page text: ${product.price}`);
    }
  }

  // BUILD COMPLETE HTML TABLE from parsed data (if no complete HTML table was found)
  if (product.technicalDataTable && !product.technicalDataTable.includes('148,2')) {
    // The extracted table is incomplete, rebuild from parsed data
    const fullTableRows: string[] = [];
    
    if (product.length) fullTableRows.push(`<tr><td>Länge (mm)</td><td>${product.length}</td></tr>`);
    if (product.bodyDiameter) fullTableRows.push(`<tr><td>Gehäusedurchmesser (mm)</td><td>${product.bodyDiameter}</td></tr>`);
    if (product.headDiameter) fullTableRows.push(`<tr><td>Kopfdurchmesser</td><td>${product.headDiameter}</td></tr>`);
    if (product.weightWithoutBattery) fullTableRows.push(`<tr><td>Gewicht (ohne Batterien/Akku) (g)</td><td>${product.weightWithoutBattery}</td></tr>`);
    if (product.powerSupply) fullTableRows.push(`<tr><td>Stromversorgung</td><td>${product.powerSupply}</td></tr>`);
    if (product.led1) fullTableRows.push(`<tr><td>Leuchtmittel 1</td><td>${product.led1}</td></tr>`);
    if (product.led2) fullTableRows.push(`<tr><td>Leuchtmittel 2</td><td>${product.led2}</td></tr>`);
    if (product.spotIntensity) fullTableRows.push(`<tr><td>Spotintensität (cd)</td><td>${product.spotIntensity}</td></tr>`);
    if (product.maxLuminosity) fullTableRows.push(`<tr><td>Leuchtleistung max.</td><td>${product.maxLuminosity}</td></tr>`);
    if (product.maxBeamDistance) fullTableRows.push(`<tr><td>Leuchtweite max. (m)</td><td>${product.maxBeamDistance}</td></tr>`);
    
    if (fullTableRows.length > 0) {
      product.technicalDataTable = `<table border="0" summary="">\n<tbody>\n${fullTableRows.join('\n')}\n</tbody>\n</table>`;
      console.log(`✅ Rebuilt COMPLETE HTML table from parsed data (${fullTableRows.length} rows)`);
    }
  }

  // Calculate VK Price from EK Price: (EK × 2) + 19% = EK × 2.38, always ending in ,95
  // Format: German format with comma (e.g., 11,95)
  if (product.ekPrice) {
    const ekValue = parseFloat(product.ekPrice.replace(',', '.'));
    if (!isNaN(ekValue)) {
      const vkCalculated = ekValue * 2 * 1.19;
      // Round to ,95 ending (e.g., 11.90 → 11,95)
      const vkRounded = Math.floor(vkCalculated) + 0.95;
      product.vkPrice = vkRounded.toFixed(2).replace('.', ',');  // German format
      console.log(`💰 Calculated VK Price: EK ${product.ekPrice}€ → VK ${product.vkPrice}€ (calculated: ${vkCalculated.toFixed(2).replace('.', ',')})`);
    }
  } else if (product.price) {
    // If price field exists, treat it as EK and calculate VK
    const priceValue = parseFloat(product.price.replace(',', '.'));
    if (!isNaN(priceValue)) {
      product.ekPrice = product.price;
      const vkCalculated = priceValue * 2 * 1.19;
      // Round to ,95 ending (e.g., 11.90 → 11,95)
      const vkRounded = Math.floor(vkCalculated) + 0.95;
      product.vkPrice = vkRounded.toFixed(2).replace('.', ',');  // German format
      console.log(`💰 Calculated VK Price from price field: EK ${product.ekPrice}€ → VK ${product.vkPrice}€ (calculated: ${vkCalculated.toFixed(2).replace('.', ',')})`);
    }
  }

  console.log('Scraped product:', {
    articleNumber: product.articleNumber,
    productName: product.productName,
    ean: product.ean,
    imagesCount: product.images.length,
    autoExtractedDescription: !!product.autoExtractedDescription,
    technicalDataTable: !!product.technicalDataTable,
    pdfManualUrl: !!product.pdfManualUrl,
    safetyWarnings: !!product.safetyWarnings
  });

  return product;
}

/**
 * Scrape product data from a URL using custom CSS selectors
 * Routes to browser or fetch based on URL
 */
export async function scrapeProduct(
  options: ScrapeOptions, 
  loginConfig?: LoginConfig,
  useBrowser = false
): Promise<ScrapedProduct> {
  const { url, selectors, userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', cookies, timeout = 10000 } = options;

  console.log(`Scraping URL: ${url}`);

  // Use browser for suppliers with useBrowser flag OR AkkuTeile (fallback)
  if (useBrowser && loginConfig) {
    console.log('[Scraper] Using Puppeteer for JS-rendered content (useBrowser flag set)');
    return scrapeProductWithBrowser(url, selectors, loginConfig);
  }
  
  if (url.includes('akkuteile-b2b.de') && loginConfig) {
    return scrapeProductWithBrowser(url, selectors, loginConfig);
  }

  // Use fetch + Cheerio for other sites
  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'de,en-US;q=0.7,en;q=0.3'
  };

  if (cookies) {
    headers['Cookie'] = cookies;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let html: string;
  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    html = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  console.log(`HTML fetched, length: ${html.length} characters`);

  // Parse with Cheerio
  const $ = cheerio.load(html);
  
  return parseProductFromHTML($, url, selectors, html, cookies);
}

/**
 * SMART AUTO-EXTRACTION: Automatically find and extract description + technical data table + PDF + safety warnings
 * Searches for common tab patterns like "Beschreibung", "Technische Daten", "Bedienungsanleitungen", "Produktsicherheit"
 */
function autoExtractProductDetails($: cheerio.CheerioAPI, html: string, url: string): {
  description?: string;
  technicalDataTable?: string;
  pdfManualUrl?: string;
  safetyWarnings?: string;
} {
  const result: { description?: string; technicalDataTable?: string; pdfManualUrl?: string; safetyWarnings?: string } = {};

  console.log('[AutoExtract] Starting auto-extraction for URL:', url);

  // 1. AUTO-EXTRACT DESCRIPTION (look for "Beschreibung" tab or section)
  const descriptionSelectors = [
    '#description-tab-516d15ca626445a38719925615405a64-pane', // Nitecore specific
    '[id*="description"]',
    '[class*="description"]',
    '[id*="produktbeschreibung"]',
    '.product-description',
    '.product-detail-description-text', // Phonetastik/Mediacom specific
    'section.product-detail .product-detail__info', // Wentronic specific
    'section.product-detail .product-detail__accordions', // Wentronic accordion
    '.tab-content [id*="beschreibung"]',
    '.tab-pane:contains("Die")', // Generic German product descriptions start with "Die"
    '.product-short-description',
    '.product-page-summary-description',
    'div[data-ui-id="product-info-description"]',
    '#product-description',
    '[itemprop="description"]', // Schema.org structured data
  ];

  for (const selector of descriptionSelectors) {
    try {
      const element = $(selector).first();
      if (element.length > 0) {
        const text = element.text().trim();
        console.log(`[AutoExtract] Selector "${selector}" found, text length: ${text.length}`);
        if (text.length > 50) { // Minimum length to be valid description
          result.description = text;
          console.log(`[AutoExtract] AUTO-EXTRACTED description using: ${selector}`);
          console.log(`[AutoExtract] Description preview:`, text.substring(0, 200));
          
          // Extract technical values from description
          const extractedSpecs = extractTechnicalSpecsFromText(text);
          if (Object.keys(extractedSpecs).length > 0) {
            Object.assign(result, extractedSpecs);
            console.log('[AutoExtract] Extracted specs from description:', extractedSpecs);
          } else {
            console.log('[AutoExtract] NO SPECS FOUND in description text');
          }
          
          break;
        }
      }
    } catch (error) {
      console.log(`[AutoExtract] Selector "${selector}" error:`, (error as Error).message);
      continue;
    }
  }

  if (!result.description) {
    console.log('[AutoExtract] NO DESCRIPTION FOUND with any selector');
  }

  // 2. AUTO-EXTRACT TECHNICAL DATA TABLE - FULL HTML (look for "Technische Daten" tab content)
  // STRATEGY: Extract the entire tab pane content, not just a single table
  const technicalDataPaneSelectors = [
    '#technical-data-516d15ca626445a38719925615405a64-pane', // Nitecore specific tab pane (FULL CONTENT)
    '#additional', // ANSMANN: Magento "Zusatzinformation" tab containing technical data table
    '.additional-attributes-wrapper', // ANSMANN: Wrapper for technical attributes
    '[id$="-pane"][id*="technical"]', // Match IDs ending with -pane (NOT tab buttons)
    '.tab-pane[id*="technical"]', // Tab pane with class
    '.tab-pane[id*="technische-daten"]', // German technical data pane
  ];

  // Try to get the COMPLETE tab pane first (all DIVs and tables)
  for (const selector of technicalDataPaneSelectors) {
    try {
      const pane = $(selector).first();
      if (pane.length > 0) {
        const content = pane.html();
        // Make sure we got actual content, not just a tab button (should have table or multiple divs)
        if (content && content.length > 200 && (content.includes('<table') || content.includes('properties-row'))) {
          result.technicalDataTable = content; // Use raw HTML without wrapper div
          console.log(`Auto-extracted FULL technical data pane using: ${selector} (${content.length} chars)`);
          break;
        }
      }
    } catch (error) {
      continue;
    }
  }

  // Fallback: Try individual table selectors
  if (!result.technicalDataTable) {
    const tableSelectors = [
      '.tab-content table',
      'table.product-detail-properties-table',
      'table.table-striped',
      'table[border="0"]',
      'table.data.table.additional-attributes', // ANSMANN: Technical data table class
      '.additional-attributes', // ANSMANN: Additional attributes wrapper
    ];

    for (const selector of tableSelectors) {
      try {
        const table = $(selector).first();
        if (table.length > 0) {
          const rows = table.find('tr');
          if (rows.length >= 3) {
            result.technicalDataTable = table.toString();
            console.log(`Auto-extracted technical data table using: ${selector} (${rows.length} rows)`);
            break;
          }
        }
      } catch (error) {
        continue;
      }
    }
  }

  // Fallback: Search entire HTML for table with technical keywords
  if (!result.technicalDataTable) {
    $('table').each((_, el) => {
      const tableHtml = $(el).html() || '';
      const tableText = $(el).text().toLowerCase();
      
      // Check for technical keywords in German (including ANSMANN-specific fields)
      const technicalKeywords = [
        'länge', 'gewicht', 'durchmesser', 'stromversorgung', 'leuchtmittel', 'lumen', 'leuchtweite',
        'nominal-spannung', 'nominal-kapazität', 'entladestrom', 'zellenchemie', 'energie', 'breite', 'höhe',
        'spannung', 'kapazität', 'farbe', 'produktgewicht', 'ean-code', 'artikelnummer'
      ];
      const matchCount = technicalKeywords.filter(keyword => tableText.includes(keyword)).length;
      
      // ANSMANN tables typically have ≥5 rows with attribute-value pairs
      const rowCount = $(el).find('tr').length;
      const hasAttributeValueStructure = tableText.includes('ean-code') || tableText.includes('artikelnummer');
      
      if (matchCount >= 2 || (rowCount >= 5 && hasAttributeValueStructure)) { // Lowered threshold for ANSMANN
        result.technicalDataTable = $(el).toString();
        console.log(`Auto-extracted technical data table by keyword matching (${matchCount} keywords)`);
        return false; // Break loop
      }
    });
  }

  // 3. AUTO-EXTRACT PDF MANUAL URL (look for "Bedienungsanleitungen" download button)
  // Nitecore uses: <button onclick="download('https://www.nitecore.de/media/.../MANUAL.PDF')">
  const pdfButtons = $('button.downloadimg, button[onclick*="download"]');
  pdfButtons.each((_, btn) => {
    const onclick = $(btn).attr('onclick');
    if (onclick) {
      // Extract URL from onclick="download('URL')"
      const match = onclick.match(/download\(['"]([^'"]+)['"]\)/);
      if (match && match[1] && (match[1].toLowerCase().includes('.pdf') || match[1].toLowerCase().includes('bedienungsanleitung'))) {
        result.pdfManualUrl = match[1];
        console.log(`Auto-extracted PDF manual URL: ${result.pdfManualUrl}`);
        return false; // Found first PDF, break loop
      }
    }
  });

  // Fallback: Look for direct PDF links
  if (!result.pdfManualUrl) {
    const pdfLinks = $('a[href$=".pdf"], a[href*=".PDF"], a[href*="bedienungsanleitung"]');
    if (pdfLinks.length > 0) {
      const href = pdfLinks.first().attr('href');
      if (href) {
        try {
          result.pdfManualUrl = href.startsWith('http') ? href : `https://${new URL(url).hostname}${href}`;
          console.log(`Auto-extracted PDF manual URL (fallback): ${result.pdfManualUrl}`);
        } catch (error) {
          console.error(`Failed to parse PDF URL: ${href}`, error);
        }
      }
    }
  }

  // 4. AUTO-EXTRACT SAFETY WARNINGS (look for "Produktsicherheit" / "PRODUKT HINWEIS")
  const safetyWarnings: string[] = [];
  
  // Nitecore uses: <div class="custom-hint-text">Warning text here</div>
  $('.custom-hint-text, .safety-warning, .product-safety, [class*="warning"], [class*="hinweis"]').each((_, el) => {
    const text = $(el).text().trim();
    // Filter out short texts and navigation items
    if (text.length > 20 && !text.toLowerCase().includes('navigation') && !text.toLowerCase().includes('menu')) {
      safetyWarnings.push(text);
    }
  });

  // Also check for explicit safety icons/symbols
  $('img[src*="warning"], img[src*="hinweis"], img[src*="heat"], img[src*="strahlung"]').each((_, img) => {
    const parent = $(img).parent();
    const siblingText = parent.find('.custom-hint-text, p, span').text().trim();
    if (siblingText.length > 20 && !safetyWarnings.includes(siblingText)) {
      safetyWarnings.push(siblingText);
    }
  });

  // LIMIT: Nur die 4 wichtigsten Sicherheitshinweise
  if (safetyWarnings.length > 0) {
    const topWarnings = safetyWarnings.slice(0, 4);
    result.safetyWarnings = topWarnings.join('\n\n');
    console.log(`Auto-extracted ${topWarnings.length} safety warning(s) (top 4 from ${safetyWarnings.length} total)`);
  }

  return result;
}

/**
 * INTELLIGENT TABLE PARSER: Extract structured technical data from generic property tables
 * Supports two formats:
 * 1. Table: <th class="properties-label">Länge:</th><td class="properties-value">156 mm</td>
 * 2. DIVs: <div class="product-detail-technical-data-label">Länge (mm)</div><div class="product-detail-technical-data-value">148,2</div>
 */
function parsePropertiesTable($: cheerio.CheerioAPI, product: any): void {
  let foundData = false;

  // METHOD 1: Parse DIV-based technical data (Nitecore "Technische Daten" tab)
  const technicalDataContainer = $('.product-detail-technical-data, #lds-technical-data-tab-pane');
  if (technicalDataContainer.length > 0) {
    console.log('Found DIV-based technical data structure, parsing...');
    
    technicalDataContainer.find('.product-detail-technical-data-label').each((_, labelEl) => {
      const $label = $(labelEl);
      const label = $label.text().trim().toLowerCase();
      const $value = $label.next('.product-detail-technical-data-value');
      const value = $value.text().trim();

      if (!label || !value) return;
      foundData = true;

      // Map labels to product fields using keywords
      if (label.includes('länge') && !label.includes('leucht')) {
        product.length = value;
      } else if (label.includes('gehäusedurchmesser') || label.includes('body diameter') || label.includes('bodydurchmesser')) {
        product.bodyDiameter = value;
      } else if (label.includes('kopfdurchmesser') || label.includes('head diameter')) {
        product.headDiameter = value;
      } else if (label.includes('gewicht') && (label.includes('ohne') || label.includes('without'))) {
        product.weightWithoutBattery = value;
      } else if (label.includes('gesamt gewicht') || label.includes('total weight')) {
        product.totalWeight = value;
      } else if (label.includes('stromversorgung') || label.includes('power supply')) {
        product.powerSupply = value;
      } else if (label.includes('leuchtmittel 1') || label === 'leuchtmittel 1') {
        product.led1 = value;
      } else if (label.includes('leuchtmittel 2') || label === 'leuchtmittel 2') {
        product.led2 = value;
      } else if (label.includes('spotintensität') || label.includes('spot intensity')) {
        product.spotIntensity = value;
      } else if (label.includes('leuchtleistung')) {
        product.maxLuminosity = value;
      } else if (label.includes('leuchtweite')) {
        product.maxBeamDistance = value;
      }
    });
  }

  // METHOD 2: Parse TABLE-based properties (fallback)
  if (!foundData) {
    const table = $('.product-detail-properties-table, table.table-striped, .properties-table').first();
    
    if (table.length > 0) {
      console.log('Found TABLE-based properties, parsing...');
      
      table.find('tr').each((_, row) => {
        const $row = $(row);
        const label = $row.find('th, .properties-label').first().text().trim().toLowerCase();
        const value = $row.find('td, .properties-value').first().text().trim();

        if (!label || !value) return;

        // Map labels to product fields using keywords
        if (label.includes('länge') && !label.includes('leucht')) {
          product.length = value;
        } else if (label.includes('gehäusedurchmesser') || label.includes('body diameter')) {
          product.bodyDiameter = value;
        } else if (label.includes('kopfdurchmesser') || label.includes('head diameter')) {
          product.headDiameter = value;
        } else if (label.includes('gewicht ohne akku') || label.includes('weight without battery')) {
          product.weightWithoutBattery = value;
        } else if (label.includes('gesamt gewicht') || label.includes('total weight')) {
          product.totalWeight = value;
        } else if (label.includes('stromversorgung') || label.includes('power supply')) {
          product.powerSupply = value;
        } else if (label.includes('leuchtmittel 1') || label.includes('led 1')) {
          product.led1 = value;
        } else if (label.includes('leuchtmittel 2') || label.includes('led 2')) {
          product.led2 = value;
        } else if (label.includes('spotintensität') || label.includes('spot intensity')) {
          product.spotIntensity = value;
        } else if (label.includes('leuchtleistung') || label.includes('max output')) {
          product.maxLuminosity = value;
        } else if (label.includes('leuchtweite') || label.includes('beam distance')) {
          product.maxBeamDistance = value;
        }
      });
    }
  }

  console.log('Parsed technical data:', {
    length: product.length,
    bodyDiameter: product.bodyDiameter,
    headDiameter: product.headDiameter,
    weightWithoutBattery: product.weightWithoutBattery,
    totalWeight: product.totalWeight,
    powerSupply: product.powerSupply,
    led1: product.led1,
    led2: product.led2,
    spotIntensity: product.spotIntensity,
    maxLuminosity: product.maxLuminosity,
    maxBeamDistance: product.maxBeamDistance
  });
}

/**
 * Common product link selector patterns to try automatically
 */
const AUTO_DETECT_SELECTORS = [
  'a.product-link',
  'a.product-item-link',
  'a[href*="/product/"]',
  'a[href*="/products/"]',
  'a[href*="/p/"]',
  'a[href*="/item/"]',
  'a[href*="/artikel/"]',
  '.product-item a',
  '.product-card a',
  '.product a',
  'article a',
  'a[itemprop="url"]',
  'a.productTitle',
  'a.product-name',
  'h3 a',
  'h2 a'
];

/**
 * Auto-detect product link selector by trying common patterns
 */
function autoDetectProductLinks($: cheerio.CheerioAPI, url: string): string[] {
  const productUrls: string[] = [];
  
  for (const selector of AUTO_DETECT_SELECTORS) {
    try {
      const links: string[] = [];
      $(selector).each((_, el) => {
        const href = $(el).attr('href');
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          const absoluteUrl = href.startsWith('http') ? href : new URL(href, url).toString();
          links.push(absoluteUrl);
        }
      });
      
      // If we found at least 3 links with this selector, consider it successful
      if (links.length >= 3) {
        console.log(`Auto-detected product links using selector: ${selector} (${links.length} found)`);
        return links;
      }
    } catch (error) {
      // Skip invalid selectors
      continue;
    }
  }
  
  console.log('Auto-detection found no suitable product links');
  return productUrls;
}

/**
 * Find the next page URL from pagination
 */
function findNextPageUrl($: cheerio.CheerioAPI, currentUrl: string, paginationSelector?: string): string | null {
  // Method 1: Use provided pagination selector (e.g., '.pagination .next', 'a[rel="next"]')
  if (paginationSelector) {
    const nextLink = $(paginationSelector).first();
    const href = nextLink.attr('href');
    if (href && !nextLink.hasClass('disabled') && nextLink.attr('aria-disabled') !== 'true') {
      return href.startsWith('http') ? href : new URL(href, currentUrl).toString();
    }
  }

  // Method 2: Check for input-based pagination (Nitecore-style)
  // <li class="page-item page-next"><input type="radio" name="p" id="p-next" value="2">
  const nextInput = $('.page-next:not(.disabled) input[name="p"], input#p-next').first();
  if (nextInput.length > 0) {
    const nextPageValue = nextInput.attr('value');
    if (nextPageValue) {
      const urlObj = new URL(currentUrl);
      urlObj.searchParams.set('p', nextPageValue);
      console.log(`Found next page using input pagination: p=${nextPageValue}`);
      return urlObj.toString();
    }
  }

  // Method 3: Auto-detect common link-based pagination patterns
  const commonSelectors = [
    'a[rel="next"]',
    '.pagination .next:not(.disabled) a',
    '.pagination li.next:not(.disabled) a',
    'a.next:not(.disabled)',
    '.pager .next a',
    '[aria-label="Next"]',
    'a:contains("Weiter"):not(.disabled)',
    'a:contains("Next"):not(.disabled)',
    'a:contains("›"):not(.disabled)',
    'a:contains("»"):not(.disabled)'
  ];

  for (const selector of commonSelectors) {
    try {
      const nextLink = $(selector).first();
      if (nextLink.length > 0) {
        const href = nextLink.attr('href');
        if (href && !nextLink.hasClass('disabled')) {
          const absoluteUrl = href.startsWith('http') ? href : new URL(href, currentUrl).toString();
          console.log(`Found next page using selector: ${selector}`);
          return absoluteUrl;
        }
      }
    } catch (error) {
      continue;
    }
  }

  // Method 4: Try URL pattern increment (e.g., ?page=1 → ?page=2)
  const urlObj = new URL(currentUrl);
  const pageParam = urlObj.searchParams.get('page') || urlObj.searchParams.get('p');
  
  if (pageParam) {
    const currentPage = parseInt(pageParam, 10);
    if (!isNaN(currentPage)) {
      const nextPage = currentPage + 1;
      const paramName = urlObj.searchParams.has('page') ? 'page' : 'p';
      urlObj.searchParams.set(paramName, nextPage.toString());
      console.log(`Incremented URL parameter ${paramName} to ${nextPage}`);
      return urlObj.toString();
    }
  }

  return null;
}

/**
 * Scrape product list using Puppeteer browser (for JavaScript-rendered pages)
 */
export async function scrapeProductListWithBrowser(
  url: string,
  productLinkSelector: string | null,
  maxProducts: number = 50,
  loginConfig?: LoginConfig
): Promise<string[]> {
  console.log(`[Browser] Scraping product list from: ${url}`);

  const chromiumPath = findChromiumPath();
  const launchOptions: any = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions'
    ]
  };
  
  // Only set executablePath if we found Chromium
  if (chromiumPath) {
    launchOptions.executablePath = chromiumPath;
  }
  
  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    
    // Set realistic viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Perform login if credentials provided
    if (loginConfig) {
      console.log(`[Browser] Performing login to ${loginConfig.loginUrl}`);
      console.log(`[Browser] Username: ${loginConfig.username}`);
      
      try {
        // Navigate to login page
        await page.goto(loginConfig.loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        console.log('[Browser] Login page loaded');
        
        // Wait for login form to be visible
        await page.waitForSelector(`input[name="${loginConfig.usernameField}"], input[type="email"]`, { timeout: 20000 });
        console.log('[Browser] Login form found');
        
        // Fill username field
        const usernameSelector = `input[name="${loginConfig.usernameField}"]`;
        await page.waitForSelector(usernameSelector, { visible: true, timeout: 10000 });
        await page.click(usernameSelector);
        await page.type(usernameSelector, loginConfig.username, { delay: 50 });
        console.log('[Browser] Username filled');
        
        // Fill password field
        const passwordSelector = `input[name="${loginConfig.passwordField}"]`;
        await page.waitForSelector(passwordSelector, { visible: true, timeout: 10000 });
        await page.click(passwordSelector);
        await page.type(passwordSelector, loginConfig.password, { delay: 50 });
        console.log('[Browser] Password filled');
        
        // Wait a bit before clicking submit
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Click submit button and wait for navigation
        console.log('[Browser] Clicking submit button...');
        const submitSelector = 'button[type="submit"]';
        await page.waitForSelector(submitSelector, { visible: true, timeout: 10000 });
        
        await Promise.all([
          page.click(submitSelector),
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
        ]);
        
        // Wait for login to complete and page to settle
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check if login was successful
        const currentUrl = page.url();
        console.log(`[Browser] Current URL after login: ${currentUrl}`);
        
        if (currentUrl.includes('/login')) {
          console.error('[Browser] Still on login page - login may have failed!');
        } else {
          console.log('[Browser] Login successful - redirected away from login page');
        }
        
        // Extract and log session cookies
        const cookies = await page.cookies();
        const sessionCookies = cookies.filter(c => 
          c.name.toLowerCase().includes('session') || 
          c.name.toLowerCase().includes('phpsessid') ||
          c.name.toLowerCase().includes('auth')
        );
        
        console.log('[Browser] Session cookies found:', sessionCookies.map(c => `${c.name}=${c.value.substring(0, 20)}...`).join(', '));
        console.log('[Browser] Total cookies:', cookies.length);
        
        // Return cookies for storage (will be handled by caller)
        (loginConfig as any)._extractedCookies = cookies;
      } catch (error) {
        console.error('[Browser] Login error:', error);
        // Continue anyway
      }
    }
    
    // If we have pre-existing cookies from storage, set them before navigation
    if (loginConfig && (loginConfig as any)._storedCookies) {
      const storedCookies = (loginConfig as any)._storedCookies;
      console.log('[Browser] Setting pre-existing cookies from storage:', storedCookies.length, 'cookies');
      
      try {
        // Parse and set cookies
        const cookiesToSet = JSON.parse(storedCookies);
        for (const cookie of cookiesToSet) {
          await page.setCookie(cookie);
        }
        console.log('[Browser] Successfully set stored cookies, skipping login');
      } catch (error) {
        console.error('[Browser] Error setting stored cookies:', error);
        // Will fall back to login above
      }
    }

    // Navigate to product listing page
    console.log(`[Browser] Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 40000 });
    
    // Wait longer for Vue.js to render products
    console.log('[Browser] Waiting for Vue.js rendering (AkkuTeile uses Vue.js)...');
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    // Try to wait for products (multiple selectors)
    const productSelectors = [
      '.product-image-link',
      '.cmp-product-thumb a',
      '.product-item a',
      'a[href*="/lithium"]',
      '.item-link'
    ];
    
    for (const selector of productSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        console.log(`[Browser] Found products with selector: ${selector}`);
        break;
      } catch (error) {
        // Try next selector
      }
    }

    // Log page content for debugging
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log(`[Browser] Page content preview: ${bodyText}`);
    
    // Extract product URLs
    let productUrls: string[] = [];
    
    if (productLinkSelector && productLinkSelector.trim() !== '') {
      console.log(`[Browser] Using selector: ${productLinkSelector}`);
      productUrls = await page.$$eval(productLinkSelector, (elements) => 
        elements.map(el => (el as HTMLAnchorElement).href).filter(href => href)
      ).catch(() => {
        console.log(`[Browser] Selector ${productLinkSelector} failed, trying alternatives...`);
        return [];
      });
    }
    
    // If no products found, try multiple selectors
    if (productUrls.length === 0) {
      console.log('[Browser] Auto-detecting product links with multiple strategies...');
      
      const strategies = [
        'a.product-image-link',
        '.cmp-product-thumb a',
        'a[href*="/lithium"]',
        'a[href*="/akku"]',
        '.product-item a',
        '.item-link',
        'a[class*="product"]'
      ];
      
      for (const selector of strategies) {
        try {
          const urls = await page.$$eval(selector, (elements) => 
            elements.map(el => (el as HTMLAnchorElement).href).filter(href => href)
          );
          
          if (urls.length > 0) {
            console.log(`[Browser] Found ${urls.length} products using selector: ${selector}`);
            productUrls = urls;
            break;
          }
        } catch (error) {
          // Try next strategy
        }
      }
    }

    // Remove duplicates
    productUrls = Array.from(new Set(productUrls));
    
    console.log(`[Browser] Before filtering: ${productUrls.length} products`);
    if (productUrls.length > 0 && productUrls.length <= 10) {
      console.log('[Browser] Product URLs:', productUrls.slice(0, 5));
    }
    
    // Filter out ONLY navigation/category listing pages (not product pages)
    // Keep URLs that look like individual products
    productUrls = productUrls.filter(url => {
      const urlLower = url.toLowerCase();
      
      // Filter out these patterns (navigation pages)
      const isNavigationPage = 
        urlLower.includes('/kategorie/') ||  // Category listing
        urlLower.includes('/category/') ||   // Category listing
        urlLower.includes('/suche') ||       // Search results
        urlLower.includes('/search') ||      // Search results
        urlLower.endsWith('/kategorie') ||   // Category page
        urlLower.endsWith('/category');      // Category page
      
      return !isNavigationPage;
    });
    
    console.log(`[Browser] After filtering: ${productUrls.length} products`);

    // Limit results
    const limitedUrls = productUrls.slice(0, maxProducts);
    console.log(`[Browser] Final count: returning ${limitedUrls.length} products`);

    return limitedUrls;

  } finally {
    await browser.close();
  }
}

/**
 * Scrape multiple products from a listing page (single page only)
 */
export async function scrapeProductList(
  url: string,
  productLinkSelector: string | null,
  maxProducts: number = 50,
  options?: Partial<ScrapeOptions>,
  useBrowser: boolean = false,
  loginConfig?: LoginConfig
): Promise<string[]> {
  // Use Puppeteer for JavaScript-heavy sites
  if (useBrowser || url.includes('akkuteile-b2b.de')) {
    return scrapeProductListWithBrowser(url, productLinkSelector, maxProducts, loginConfig);
  }

  console.log(`Scraping product list from: ${url}`);

  const headers: Record<string, string> = {
    'User-Agent': options?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'de,en-US;q=0.7,en;q=0.3'
  };

  if (options?.cookies) {
    headers['Cookie'] = options.cookies;
  }

  const timeout = options?.timeout || 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let html: string;
  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    html = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
  const $ = cheerio.load(html);

  let productUrls: string[] = [];

  // Use auto-detection if no selector provided
  if (!productLinkSelector || productLinkSelector.trim() === '') {
    console.log('No selector provided, using auto-detection...');
    productUrls = autoDetectProductLinks($, url);
  } else {
    // Extract product URLs using provided selector
    $(productLinkSelector).each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        // Make absolute URL if relative
        const absoluteUrl = href.startsWith('http') ? href : new URL(href, url).toString();
        productUrls.push(absoluteUrl);
      }
    });
  }

  // Remove duplicates
  productUrls = Array.from(new Set(productUrls));

  // If no product links found, treat the current URL as a single product page
  if (productUrls.length === 0) {
    console.log('🎯 No product links found, treating current URL as single product page');
    productUrls.push(url);
  }

  // Limit results
  const limitedUrls = productUrls.slice(0, maxProducts);
  console.log(`Found ${productUrls.length} products, returning ${limitedUrls.length}`);

  return limitedUrls;
}

/**
 * Scrape multiple pages of a product listing with pagination
 */
export async function scrapeAllPages(
  startUrl: string,
  productLinkSelector: string | null,
  paginationSelector: string | null,
  maxPages: number = 10,
  maxProductsTotal: number = 500,
  options?: Partial<ScrapeOptions>,
  progressCallback?: (currentPage: number, totalProducts: number) => void,
  loginConfig?: LoginConfig
): Promise<string[]> {
  console.log(`Starting multi-page scraping from: ${startUrl}`);
  console.log(`Max pages: ${maxPages}, Max products: ${maxProductsTotal}`);

  const allProductUrls: string[] = [];
  let currentUrl: string | null = startUrl;
  let pageNumber = 1;
  let consecutiveEmptyPages = 0;
  const MAX_CONSECUTIVE_EMPTY_PAGES = 3; // Stop after 3 empty pages

  while (currentUrl && pageNumber <= maxPages && allProductUrls.length < maxProductsTotal) {
    console.log(`\n📄 Scraping Seite ${pageNumber}/${maxPages}: ${currentUrl}`);

    try {
      // Scrape current page
      const pageProducts = await scrapeProductList(
        currentUrl,
        productLinkSelector,
        maxProductsTotal - allProductUrls.length, // Remaining quota
        options,
        false,  // useBrowser - handled by scrapeProductList
        loginConfig  // Pass login config for browser authentication
      );

      console.log(`✓ Found ${pageProducts.length} products on page ${pageNumber}`);
      
      // Track consecutive empty pages
      if (pageProducts.length === 0) {
        consecutiveEmptyPages++;
        console.log(`⚠️ Empty page detected (${consecutiveEmptyPages}/${MAX_CONSECUTIVE_EMPTY_PAGES})`);
        
        if (consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES) {
          console.log(`🛑 Stopping: ${MAX_CONSECUTIVE_EMPTY_PAGES} consecutive empty pages found`);
          break;
        }
      } else {
        consecutiveEmptyPages = 0; // Reset counter when products are found
      }
      
      allProductUrls.push(...pageProducts);

      // Report progress
      if (progressCallback) {
        progressCallback(pageNumber, allProductUrls.length);
      }

      // Check if we've reached the limit
      if (allProductUrls.length >= maxProductsTotal) {
        console.log(`Reached maximum product limit (${maxProductsTotal})`);
        break;
      }

      // Fetch page HTML to find next page
      const headers: Record<string, string> = {
        'User-Agent': options?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de,en-US;q=0.7,en;q=0.3'
      };

      if (options?.cookies) {
        headers['Cookie'] = options.cookies;
      }

      const response = await fetch(currentUrl, { headers });
      const html = await response.text();
      const $ = cheerio.load(html);

      // Find next page
      const nextUrl = findNextPageUrl($, currentUrl, paginationSelector || undefined);
      
      if (!nextUrl) {
        console.log('No next page found, pagination complete');
        break;
      }

      if (nextUrl === currentUrl) {
        console.log('Next page URL is same as current, stopping to prevent infinite loop');
        break;
      }

      currentUrl = nextUrl;
      pageNumber++;

      // Polite delay between pages (2 seconds)
      await new Promise(resolve => setTimeout(resolve, 500)); // Reduced wait for faster scraping

    } catch (error) {
      console.error(`Error scraping page ${pageNumber}:`, error);
      break;
    }
  }

  // Remove duplicates (in case products appear on multiple pages)
  const uniqueProducts = Array.from(new Set(allProductUrls));
  
  console.log(`\n=== PAGINATION COMPLETE ===`);
  console.log(`Pages scraped: ${pageNumber}`);
  console.log(`Total products found: ${uniqueProducts.length}`);

  return uniqueProducts;
}

/**
 * Test a single CSS selector on a URL
 * Returns the extracted value for verification
 */
export async function testSelector(options: {
  url: string;
  selector: string;
  userAgent?: string;
  cookies?: string;
  timeout?: number;
}): Promise<{
  success: boolean;
  value?: string;
  html?: string;
  count?: number;
  error?: string;
}> {
  const { url, selector, userAgent, cookies, timeout = 30000 } = options;

  try {
    console.log(`[Test Selector] Testing selector "${selector}" on ${url}`);

    // Fetch the HTML
    const headers: Record<string, string> = {
      'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
    };

    if (cookies) {
      headers['Cookie'] = cookies;
    }

    let html = '';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      html = await response.text();
    } finally {
      clearTimeout(timeoutId);
    }

    // Parse with Cheerio
    const $ = cheerio.load(html);

    // Test the selector
    const elements = $(selector);
    const count = elements.length;

    if (count === 0) {
      return {
        success: false,
        count: 0,
        error: 'Kein Element gefunden - Selektor matched nichts auf der Seite'
      };
    }

    // Get the first element's value
    const firstElement = elements.first();
    const textValue = firstElement.text().trim();
    const contentAttr = firstElement.attr('content')?.trim();
    const htmlValue = firstElement.html()?.trim();

    const value = textValue || contentAttr || htmlValue || '';

    return {
      success: true,
      value: value.substring(0, 500), // Limit to 500 chars for preview
      html: htmlValue?.substring(0, 500),
      count
    };

  } catch (error: any) {
    console.error('[Test Selector] Error:', error);
    return {
      success: false,
      error: error.message || 'Unbekannter Fehler beim Testen des Selektors'
    };
  }
}

/**
 * Get the best selector for a supplier based on its name
 * Falls back to generic selectors if no specific match
 */
export function getSelectorsForSupplier(supplierName?: string, customSelectors?: ScraperSelectors): ScraperSelectors {
  if (customSelectors && Object.keys(customSelectors).length > 0) {
    return customSelectors; // Use custom selectors if provided
  }
  
  if (!supplierName) {
    return defaultSelectors.generic;
  }
  
  const lowerName = supplierName.toLowerCase();
  
  if (lowerName.includes('phonetastik')) {
    console.log('[Selector] Using Phonetastik-specific selectors');
    return defaultSelectors.phonetastik;
  }
  if (lowerName.includes('mediacom')) {
    console.log('[Selector] Using Mediacom-specific selectors');
    return defaultSelectors.mediacom;
  }
  if (lowerName.includes('wentronic')) {
    console.log('[Selector] Using Wentronic-specific selectors');
    return defaultSelectors.wentronic;
  }
  if (lowerName.includes('nitecore')) {
    console.log('[Selector] Using Nitecore-specific selectors');
    return defaultSelectors.nitecore;
  }
  if (lowerName.includes('shopware')) {
    console.log('[Selector] Using Shopware-specific selectors');
    return defaultSelectors.shopware;
  }
  
  console.log('[Selector] Using generic selectors for:', supplierName);
  return defaultSelectors.generic;
}

/**
 * Default selectors for common e-commerce platforms
 */
export const defaultSelectors: Record<string, ScraperSelectors> = {
  generic: {
    articleNumber: '[itemprop="sku"], .product-code, .article-number',
    productName: 'h1, [itemprop="name"], .product-title',
    ean: '[itemprop="gtin13"], .ean, .barcode',
    manufacturer: '[itemprop="brand"], .manufacturer, .brand',
    price: '[itemprop="price"], .price, .product-price',
    description: '[itemprop="description"], .product-description, .description',
    images: '[itemprop="image"], .product-image img, .gallery img',
    weight: '.weight, [itemprop="weight"]',
    category: '.breadcrumb, [itemprop="category"]'
  },
  shopware: {
    articleNumber: '.product-detail-ordernumber',
    productName: '.product-detail-name',
    ean: '.product-detail-ordernumber-container .product-detail-ordernumber',
    price: '.product-detail-price',
    description: '.product-detail-description',
    images: '.gallery-slider-image',
    category: '.breadcrumb-item'
  },
  phonetastik: {
    articleNumber: '.product-detail-ordernumber[itemprop="sku"]',
    productName: '.product-detail-name[itemprop="name"]',
    ean: '.product-detail-ordernumber-container .product-detail-ordernumber',
    manufacturer: '.product-detail-manufacturer img',
    price: '.product-detail-price',
    description: '.product-detail-description-text',
    images: '.product-detail-images img',
    weight: '.product-detail-weight',
    category: '.breadcrumb-item'
  },
  mediacom: {
    articleNumber: '.product-detail-ordernumber[itemprop="sku"]',
    productName: '.product-detail-name[itemprop="name"]',
    ean: '.product-detail-ordernumber-container .product-detail-ordernumber',
    manufacturer: '.product-detail-manufacturer img',
    price: '.product-detail-price',
    description: '.product-detail-description-text',
    images: '.product-image img',
    weight: '.product-detail-weight',
    category: '.breadcrumb-item'
  },
  wentronic: {
    articleNumber: '.product-detail__mpn, [itemprop="mpn"]',
    productName: '.product-info .product-detail__title, [itemprop="name"]',
    ean: '.product-detail__ean, [itemprop="gtin13"]',
    manufacturer: '.product-detail__supplier img, [itemprop="brand"]',
    price: '.product-detail__price, [itemprop="price"]',
    description: 'section.product-detail .product-detail__info, section.product-detail .product-detail__accordions',
    images: '.product-detail__image img, .gallery img',
    weight: '.product-detail__weight, [itemprop="weight"]',
    category: '.breadcrumb-item'
  },
  nitecore: {
    articleNumber: '[itemprop="sku"], .product-code',
    productName: '[itemprop="name"], h1.product-title',
    ean: '[itemprop="gtin13"], .ean-code',
    manufacturer: '[itemprop="brand"]',
    price: '[itemprop="price"], .product-price',
    description: '#description-tab-516d15ca626445a38719925615405a64-pane, [itemprop="description"]',
    images: '[itemprop="image"]',
    weight: '[itemprop="weight"]',
    category: '.breadcrumb-item'
  }
};

/**
 * Brickfox-optimized selectors
 * Only the 9 essential fields needed for Brickfox CSV export
 * This minimizes scraping overhead and database storage
 */
export const brickfoxSelectors: ScraperSelectors = {
  articleNumber: '[itemprop="sku"], .product-code, .article-number',
  productName: 'h1, [itemprop="name"], .product-title',
  ean: '[itemprop="gtin13"], .ean, .barcode',
  manufacturer: '[itemprop="brand"], .manufacturer, .brand',
  category: '.breadcrumb, [itemprop="category"]',
  price: '[itemprop="price"], .price, .product-price',
  weight: '.weight, [itemprop="weight"]',
  description: '[itemprop="description"], .product-description, .description',
  images: '[itemprop="image"], .product-image img, .gallery img'
};
