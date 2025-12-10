import { CreatorProduct, HtmlTemplate, ProductImage } from "@shared/schema";

/**
 * MediaMarkt Template
 * Professional MediaMarkt-style product description with advantages, technical specs table, and safety info
 */
function mediaMarktTemplate(product: CreatorProduct): string {
  const advantages = product.advantages || product.features || [];
  const technicalSpecs = product.technicalSpecs || {};
  const safetyInfo = product.safetyInfo || 'Produkt entspricht den geltenden Sicherheitsstandards.';
  const packageContents = product.packageContents || `1 × ${product.name}`;

  return `
<h2>${product.name}</h2>
<p>${product.description}</p>

<h4>Vorteile & Eigenschaften:</h4>
${advantages.map((adv: string) => `<p>✅ ${adv}</p>`).join('\n')}

<h4>Technische Daten</h4>
<table border="0" summary="">
<tbody>
${Object.entries(technicalSpecs).map(([key, value]) => 
  `<tr><td>${key}:</td><td>${value}</td></tr>`
).join('\n')}
</tbody>
</table>

<h4>Sicherheit & Technologie</h4>
<p>${safetyInfo}</p>

<h4>Lieferumfang</h4>
<p>${packageContents}</p>
`.trim();
}

/**
 * Technical Data Block Template
 * Structured layout with product images and technical specifications
 */
function technicalTemplate(product: CreatorProduct): string {
  const images = product.images || [];
  const imageHtml = images.map((img: ProductImage, index: number) => 
    `<img src="${img.dataUrl}" alt="${product.name} - Bild ${index + 1}" style="max-width: 100%; height: auto; margin-bottom: 15px; border-radius: 4px;" />`
  ).join('\n');

  return `
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <h2 style="color: #d50000; font-size: 24px; margin-bottom: 20px;">${product.name}</h2>
  
  <div style="margin-bottom: 30px;">
    ${imageHtml}
  </div>
  
  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h3 style="color: #d50000; font-size: 18px; margin-bottom: 15px;">Produktbeschreibung</h3>
    <p style="margin: 0; line-height: 1.8;">${product.description}</p>
  </div>
  
  <div style="margin-top: 30px;">
    <p style="color: #666; font-size: 14px; margin: 0;">SKU: ${product.sku}</p>
  </div>
</div>
`.trim();
}

/**
 * Storytelling Template
 * Engaging narrative style with emphasis on benefits
 */
function storytellingTemplate(product: CreatorProduct): string {
  const images = product.images || [];
  const mainImage = images[0];
  const additionalImages = images.slice(1);

  return `
<div style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.8; color: #2c3e50;">
  ${mainImage ? `
  <div style="text-align: center; margin-bottom: 30px;">
    <img src="${mainImage.dataUrl}" alt="${product.name}" style="max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />
  </div>
  ` : ''}
  
  <h1 style="color: #d50000; font-size: 28px; font-weight: bold; margin-bottom: 20px; text-align: center;">
    ${product.name}
  </h1>
  
  <div style="background: linear-gradient(135deg, #fff 0%, #f8f9fa 100%); padding: 25px; border-left: 4px solid #d50000; margin-bottom: 25px; border-radius: 4px;">
    <p style="font-size: 16px; margin: 0; color: #444;">${product.description}</p>
  </div>
  
  ${additionalImages.length > 0 ? `
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 25px;">
    ${additionalImages.map((img: ProductImage, index: number) => 
      `<img src="${img.dataUrl}" alt="${product.name} - Detail ${index + 1}" style="width: 100%; height: auto; border-radius: 8px;" />`
    ).join('\n')}
  </div>
  ` : ''}
  
  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
    <p style="color: #888; font-size: 13px; margin: 0;">Art.-Nr.: ${product.sku}</p>
  </div>
</div>
`.trim();
}

/**
 * Minimal Template
 * Clean and simple layout focusing on essential information
 */
function minimalTemplate(product: CreatorProduct): string {
  const images = product.images || [];
  const imageGallery = images.map((img: ProductImage, index: number) => 
    `<img src="${img.dataUrl}" alt="${product.name} ${index + 1}" style="width: 100%; max-width: 400px; height: auto; margin: 10px 0;" />`
  ).join('\n');

  return `
<div style="font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; max-width: 800px;">
  <h2 style="font-size: 22px; font-weight: 600; margin-bottom: 16px; color: #000;">${product.name}</h2>
  
  ${imageGallery}
  
  <p style="font-size: 15px; line-height: 1.7; margin: 20px 0; color: #555;">${product.description}</p>
  
  <p style="font-size: 13px; color: #999; margin-top: 24px;">Artikelnummer: ${product.sku}</p>
</div>
`.trim();
}

/**
 * Feature List Template
 * Bullet-point style highlighting key features
 */
function featureListTemplate(product: CreatorProduct): string {
  const images = product.images || [];
  const mainImage = images[0];
  
  // Extract features from description (split by periods, newlines, or bullet points)
  const features = product.description
    .split(/[.•\n]/)
    .map((f: string) => f.trim())
    .filter((f: string) => f.length > 10)
    .slice(0, 5);

  return `
<div style="font-family: Arial, sans-serif; color: #333;">
  <div style="background: #d50000; color: white; padding: 20px; margin-bottom: 25px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0; font-size: 24px; font-weight: bold;">${product.name}</h2>
  </div>
  
  ${mainImage ? `
  <div style="text-align: center; margin-bottom: 25px;">
    <img src="${mainImage.dataUrl}" alt="${product.name}" style="max-width: 100%; height: auto; border-radius: 8px;" />
  </div>
  ` : ''}
  
  <div style="background: #fafafa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h3 style="color: #d50000; font-size: 18px; margin-bottom: 15px;">✓ Highlights</h3>
    <ul style="list-style: none; padding: 0; margin: 0;">
      ${features.map((feature: string) => 
        `<li style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
          <span style="color: #d50000; margin-right: 8px;">▸</span>${feature}
        </li>`
      ).join('\n')}
    </ul>
  </div>
  
  ${images.length > 1 ? `
  <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px;">
    ${images.slice(1).map((img: ProductImage, index: number) => 
      `<img src="${img.dataUrl}" alt="Detail ${index + 1}" style="width: calc(33.333% - 7px); height: auto; border-radius: 4px;" />`
    ).join('\n')}
  </div>
  ` : ''}
  
  <div style="color: #666; font-size: 13px; margin-top: 20px;">
    <p style="margin: 0;">Artikel: ${product.sku}</p>
  </div>
</div>
`.trim();
}

/**
 * Available HTML templates for product descriptions
 */
export const htmlTemplates: HtmlTemplate[] = [
  {
    id: 'mediamarkt',
    name: 'MediaMarkt',
    description: 'MediaMarkt-konformes Template mit Vorteilen, technischer Tabelle und Lieferumfang',
    category: 'technical',
    templateFunction: mediaMarktTemplate,
  },
  {
    id: 'technical',
    name: 'Technische Daten',
    description: 'Strukturiertes Layout mit Bildern und technischen Spezifikationen',
    category: 'technical',
    templateFunction: technicalTemplate,
  },
  {
    id: 'storytelling',
    name: 'Storytelling',
    description: 'Ansprechende Narrative mit Fokus auf Benefits und Produktvorteilen',
    category: 'storytelling',
    templateFunction: storytellingTemplate,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Klares und einfaches Layout mit essentiellen Informationen',
    category: 'minimal',
    templateFunction: minimalTemplate,
  },
  {
    id: 'feature-list',
    name: 'Feature-Liste',
    description: 'Aufzählungsstil mit Hervorhebung der wichtigsten Produktmerkmale',
    category: 'technical',
    templateFunction: featureListTemplate,
  },
];

/**
 * Get template by ID
 */
export function getTemplateById(id: string): HtmlTemplate | undefined {
  return htmlTemplates.find(t => t.id === id);
}

/**
 * Generate HTML description for a product using a specific template
 */
export function generateHtmlDescription(
  product: CreatorProduct,
  templateId: string
): string {
  const template = getTemplateById(templateId);
  if (!template) {
    throw new Error(`Template with ID "${templateId}" not found`);
  }
  return template.templateFunction(product);
}
