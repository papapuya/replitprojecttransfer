import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sparkles, Eye, Settings, CheckCircle2, Columns, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ExtractedProductData } from "@shared/schema";

// Helper function to clean extracted text from markdown formatting
function cleanExtractedText(content: string): string {
  // Remove markdown code blocks (```plaintext, ```, etc.)
  let cleaned = content.replace(/^```(?:plaintext|html|HTML)?\s*\n?/gm, '');
  cleaned = cleaned.replace(/\n?```\s*$/gm, '');
  
  // Remove ALL occurrences of markdown bold indicators (**)
  cleaned = cleaned.replace(/\*\*/g, '');
  
  // Remove ALL occurrences of markdown italic indicators (*)
  cleaned = cleaned.replace(/\*/g, '');
  
  // Remove any remaining markdown formatting
  cleaned = cleaned.trim();
  
  return cleaned;
}

// Helper functions to convert units
function convertWeightToGrams(weightStr: string): string {
  // Convert kg to g
  const kgMatch = weightStr.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  if (kgMatch) {
    const kgValue = parseFloat(kgMatch[1].replace(',', '.'));
    const grams = Math.round(kgValue * 1000);
    return weightStr.replace(kgMatch[0], `${grams} g`);
  }
  
  // If already in grams, return as is
  return weightStr;
}

function convertDimensionsToMm(dimensionsStr: string): string {
  // Convert cm to mm
  const cmMatch = dimensionsStr.match(/(\d+(?:[.,]\d+)?)\s*×\s*(\d+(?:[.,]\d+)?)\s*×\s*(\d+(?:[.,]\d+)?)\s*cm/i);
  if (cmMatch) {
    const dim1 = Math.round(parseFloat(cmMatch[1].replace(',', '.')) * 10);
    const dim2 = Math.round(parseFloat(cmMatch[2].replace(',', '.')) * 10);
    const dim3 = Math.round(parseFloat(cmMatch[3].replace(',', '.')) * 10);
    return dimensionsStr.replace(cmMatch[0], `${dim1} × ${dim2} × ${dim3} mm`);
  }
  
  // If already in mm, return as is
  return dimensionsStr;
}

// Helper function to clean measurement values with different formatting options
function cleanMeasurementValue(value: string, format: 'voltage' | 'capacity' | 'weight' | 'dimension' | 'default' = 'default'): string {
  // 1. Remove common measurement units, qualifiers, and tolerance values
  let cleaned = value
    .replace(/\s*(mm|cm|m|km|inch|in|ft|feet)\s*/gi, '') // Length units
    .replace(/\s*(g|kg|mg|lb|pound|oz|ounce)\s*/gi, '') // Weight units
    .replace(/\s*(ml|l|dl|cl|gal|gallon)\s*/gi, '') // Volume units
    .replace(/\s*(V|mV|kV|volt)\s*/gi, '') // Voltage units
    .replace(/\s*(A|mA|kA|amp|ampere)\s*/gi, '') // Current units
    .replace(/\s*(W|mW|kW|watt)\s*/gi, '') // Power units
    .replace(/\s*(mAh|Ah|Wh|kWh)\s*/gi, '') // Energy/Capacity units
    .replace(/\s*(Hz|kHz|MHz|GHz)\s*/gi, '') // Frequency units
    .replace(/\s*(°C|°F|K|celsius|fahrenheit|kelvin)\s*/gi, '') // Temperature units
    .replace(/\s*(bar|psi|pa|pascal|atm)\s*/gi, '') // Pressure units
    .replace(/\s*(rpm|U\/min|UPM)\s*/gi, '') // Rotation units
    .replace(/\s*(dB|db)\s*/gi, '') // Decibel units
    .replace(/\s*(lux|lx)\s*/gi, '') // Light units
    .replace(/\s*(dpi|ppi)\s*/gi, '') // Resolution units
    .replace(/\s*(bit|byte|kb|mb|gb|tb)\s*/gi, '') // Data units
    .replace(/\s*(h|min|sec|s|ms|μs|ns)\s*/gi, '') // Time units
    .replace(/\s*(typisch|typical|ca\.|approx\.|~|±)\s*/gi, '') // Common qualifiers
    .replace(/\s*(\+\/\-|\+\-|\-\+)\s*\d+(?:[.,]\d+)?\s*(?:order)?\s*/gi, '') // +/- tolerance values like +/-0,3
    .replace(/\s*order\s*(\+\/\-|\+\-|\-\+)?\s*\d+(?:[.,]\d+)?\s*/gi, '') // order +/-0,3
    .replace(/\s*\d+(?:[.,]\d+)?\s*order\s*/gi, '') // 0,3 order
    .replace(/\s*\d+(?:[.,]\d+)?\s*(\+\/\-|\+\-|\-\+)\s*\d+(?:[.,]\d+)?\s*order\s*/gi, '') // 0,3 +/-0,1 order
    .replace(/\s*\d+(?:[.,]\d+)?\s*(\+\/\-|\+\-|\-\+)\s*\d+(?:[.,]\d+)?\s*/gi, '') // 0,3 +/-0,1
    .replace(/\s*\+\d+(?:[.,]\d+)?\s*\-\d+(?:[.,]\d+)?\s*/gi, '') // +0.3-0.1
    .trim();

  // 2. Extract the first plausible number and format it according to type
  const numberMatch = cleaned.match(/(\d+([.,]\d+)?)/);
  if (numberMatch && numberMatch[1]) {
    let numStr = numberMatch[1];
    // Replace comma with dot for consistent parseFloat parsing
    numStr = numStr.replace(/,/g, '.');
    const num = parseFloat(numStr);
    if (!isNaN(num)) {
      switch (format) {
        case 'voltage':
          return num.toFixed(1); // 1 decimal place for voltage
        case 'capacity':
          return Math.round(num).toString(); // No decimal places for capacity
        case 'weight':
          return Math.round(num).toString(); // No decimal places for weight
        case 'dimension':
          return num.toFixed(1); // 1 decimal place for dimensions
        default:
          return num.toFixed(2); // 2 decimal places for everything else
      }
    }
  }

  return ''; // Return empty string if no valid number found or parsed
}

interface CustomAttribute {
  key: string;
  value: string;
  type: string;
  enabled: boolean;
  category: 'basic' | 'technical' | 'dimensions' | 'features' | 'seo' | 'business' | 'images';
  required?: boolean;
}

interface CustomAttributesPreviewProps {
  extractedData: ExtractedProductData[];
  onAttributesChange: (attributes: Array<{key: string, value: string, type: string}>) => void;
  onExactProductNameChange: (name: string) => void;
  onArticleNumberChange: (number: string) => void;
  articleNumber: string;
  customAttributes?: Array<{key: string, value: string, type: string}>;
  generatedHtmlDescription?: string;
}

export default function CustomAttributesPreview({
  extractedData,
  onAttributesChange,
  onExactProductNameChange,
  onArticleNumberChange,
  articleNumber,
  customAttributes = [],
  generatedHtmlDescription
}: CustomAttributesPreviewProps) {
  const [availableAttributes, setAvailableAttributes] = useState<CustomAttribute[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const { toast } = useToast();

  // Load saved attributes from localStorage on component mount
  useEffect(() => {
    const savedAttributes = localStorage.getItem('customAttributes');
    if (savedAttributes) {
      try {
        const parsed = JSON.parse(savedAttributes);
        setAvailableAttributes(parsed);
      } catch (error) {
        console.error('Error loading saved attributes:', error);
      }
    }
  }, []);

  // Save attributes to localStorage whenever they change
  useEffect(() => {
    if (availableAttributes.length > 0) {
      localStorage.setItem('customAttributes', JSON.stringify(availableAttributes));
    }
  }, [availableAttributes]);

  // Sync customAttributes from parent component - prevent flickering with stable comparison
  useEffect(() => {
    if (customAttributes.length > 0) {
      setAvailableAttributes(prev => {
        // Create a stable comparison by checking if any values actually changed
        let hasChanges = false;
        const updated = [...prev];
        
        customAttributes.forEach(customAttr => {
          const index = updated.findIndex(attr => attr.key === customAttr.key);
          if (index !== -1 && updated[index].value !== customAttr.value) {
            updated[index] = { ...updated[index], value: customAttr.value };
            hasChanges = true;
          }
        });
        
        // Only return new array if there were actual changes
        return hasChanges ? updated : prev;
      });
    }
  }, [customAttributes]);

  // Auto-insert generated HTML description into "Produktbeschreibung" field
  useEffect(() => {
    if (generatedHtmlDescription && generatedHtmlDescription.trim()) {
      setAvailableAttributes(prev => {
        const updated = prev.map(attr => {
          if (attr.key === 'Produktbeschreibung') {
            return { ...attr, value: generatedHtmlDescription };
          } else if (attr.key === 'SEO Beschreibung') {
            // Generate SEO description from HTML content
            const seoDescription = generateSeoDescription(generatedHtmlDescription);
            return { ...attr, value: seoDescription };
          } else if (attr.key === 'SEO Content') {
            // Generate SEO content from HTML content
            const seoContent = generateSeoContent(generatedHtmlDescription);
            return { ...attr, value: seoContent };
          }
          return attr;
        });
        return updated;
      });
    }
  }, [generatedHtmlDescription]);

  // Convert units in existing custom attributes
  useEffect(() => {
    if (customAttributes.length > 0) {
      const updatedAttributes = customAttributes.map(attr => {
        if (attr.key.toLowerCase().includes('gewicht') || attr.key.toLowerCase().includes('weight')) {
          const convertedValue = convertWeightToGrams(attr.value);
          return { ...attr, value: convertedValue };
        } else if (attr.key.toLowerCase().includes('abmessung') || attr.key.toLowerCase().includes('dimension') || 
                   attr.key.toLowerCase().includes('größe') || attr.key.toLowerCase().includes('size')) {
          const convertedValue = convertDimensionsToMm(attr.value);
          return { ...attr, value: convertedValue };
        }
        return attr;
      });
      
      // Only update if there are changes
      const hasChanges = updatedAttributes.some((attr, index) => 
        attr.value !== customAttributes[index].value
      );
      
      if (hasChanges) {
        onAttributesChange(updatedAttributes);
      }
    }
  }, [customAttributes, onAttributesChange]);

  // Helper function to generate SEO description
  function generateSeoDescription(htmlContent: string): string {
    // Remove HTML tags and extract clean text
    const cleanText = htmlContent
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/✅/g, '') // Remove checkmarks
      .trim();
    
    // Extract the main product description (first paragraph)
    const sentences = cleanText.split('.').filter(s => s.trim().length > 10);
    const mainDescription = sentences[0] || cleanText.substring(0, 150);
    
    // Take first 150 characters for SEO description
    const seoDesc = mainDescription.substring(0, 150);
    const result = seoDesc.endsWith('.') ? seoDesc : seoDesc + '...';
    
    return result;
  }

  // Helper function to generate SEO content
  function generateSeoContent(htmlContent: string): string {
    // Remove HTML tags and extract clean text
    const cleanText = htmlContent
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/✅/g, '') // Remove checkmarks
      .trim();
    
    // Extract the main product description and key features
    const sentences = cleanText.split('.').filter(s => s.trim().length > 10);
    const mainContent = sentences.slice(0, 3).join('. ') || cleanText.substring(0, 300);
    
    // Take first 300 characters for SEO content
    const seoContent = mainContent.substring(0, 300);
    const result = seoContent.endsWith('.') ? seoContent : seoContent + '...';
    
    return result;
  }

  // Define all actual attributes based on user requirements (removed duplicates)
  const allAttributes: CustomAttribute[] = [
    // Basic Product Information
    { key: 'Produktname', value: '', type: 'text', enabled: true, category: 'basic', required: true },
    { key: 'Mediamarktname V1', value: '', type: 'text', enabled: true, category: 'basic', required: true },
    { key: 'Mediamarktname V2', value: '', type: 'text', enabled: true, category: 'basic', required: true },
    { key: 'Produktbeschreibung', value: '', type: 'text', enabled: true, category: 'basic', required: true },
    { key: 'Status', value: 'Aktiv', type: 'text', enabled: true, category: 'basic', required: true },
    { key: 'Marke', value: '', type: 'text', enabled: true, category: 'basic', required: true },
    { key: 'Produktart', value: '', type: 'text', enabled: true, category: 'basic', required: true },
    { key: 'Farbe', value: '', type: 'text', enabled: true, category: 'basic', required: true },
    { key: 'Bauform', value: '', type: 'text', enabled: true, category: 'basic', required: true },
    { key: 'passend für Hersteller / Marke', value: '', type: 'text', enabled: true, category: 'basic', required: true },
    { key: 'Artikelnummer', value: '', type: 'text', enabled: true, category: 'basic', required: true },
    
    // Business Information
    { key: 'Regelsteuersatz', value: '19', type: 'text', enabled: true, category: 'business', required: true },
    { key: 'Herstellungsland', value: 'China', type: 'text', enabled: true, category: 'business', required: true },
    
    // SEO Information
    { key: 'SEO Name', value: '', type: 'text', enabled: true, category: 'seo', required: true },
    { key: 'SEO Beschreibung', value: '', type: 'text', enabled: true, category: 'seo', required: true },
    { key: 'SEO Content', value: '', type: 'text', enabled: true, category: 'seo', required: true },
    { key: 'SEO Keywords', value: '', type: 'text', enabled: true, category: 'seo', required: true },
    
    // Product Lists
    { key: 'Auflistung 1', value: '', type: 'text', enabled: false, category: 'features', required: false },
    { key: 'Auflistung 2', value: '', type: 'text', enabled: false, category: 'features', required: false },
    { key: 'Auflistung 3', value: '', type: 'text', enabled: false, category: 'features', required: false },
    { key: 'Auflistung 4', value: '', type: 'text', enabled: false, category: 'features', required: false },
    
    // Technical Specifications
    { key: 'Spannung V', value: '', type: 'text', enabled: true, category: 'technical', required: true },
    { key: 'Wiederaufladbar', value: 'Ja', type: 'text', enabled: true, category: 'technical', required: true },
    { key: 'Kapazität mAh', value: '', type: 'text', enabled: true, category: 'technical', required: true },
    { key: 'Kapazität Wh', value: '', type: 'text', enabled: true, category: 'technical', required: true },
    { key: 'Anschlussart Akku', value: '', type: 'text', enabled: true, category: 'technical', required: true },
    { key: 'Schutzschaltung', value: 'Ja', type: 'text', enabled: true, category: 'technical', required: true },
    
    // Dimensions
    { key: 'Durchmesser mm', value: '', type: 'text', enabled: true, category: 'dimensions', required: true },
    { key: 'Länge mm', value: '', type: 'text', enabled: true, category: 'dimensions', required: true },
    { key: 'Breite mm', value: '', type: 'text', enabled: true, category: 'dimensions', required: true },
    { key: 'Höhe mm', value: '', type: 'text', enabled: true, category: 'dimensions', required: true },
    { key: 'Plus Pol', value: 'Erhöht', type: 'text', enabled: true, category: 'technical', required: true },
    
    // Chemical and Safety
    { key: 'Zusammensetzung (Chemie)', value: '', type: 'text', enabled: true, category: 'technical', required: true },
    { key: 'Gefahrgut', value: 'Nein', type: 'text', enabled: true, category: 'business', required: true },
    
    // Logistics
    { key: 'Verpackungseinheit', value: '1', type: 'text', enabled: true, category: 'business', required: true },
    { key: 'Klassifizierung', value: '', type: 'text', enabled: true, category: 'business', required: true },
    { key: 'Lieferzeit', value: '2-3 Werktage', type: 'text', enabled: true, category: 'business', required: true },
    { key: 'Neber out of Stock', value: 'Nein', type: 'text', enabled: true, category: 'business', required: true },
    { key: 'Zolltarifnummer', value: '', type: 'text', enabled: true, category: 'business', required: true },
    { key: 'Warenbeschreibung', value: '', type: 'text', enabled: true, category: 'business', required: true },
    
    // Pricing
    { key: 'Preis VK', value: '', type: 'text', enabled: true, category: 'business', required: true },
    { key: 'Stück', value: '1', type: 'text', enabled: true, category: 'business', required: true },
    { key: 'Lieferant', value: '', type: 'text', enabled: true, category: 'business', required: true },
    { key: 'Lieferanten-Art. nr', value: '', type: 'text', enabled: true, category: 'business', required: true },
    { key: 'EK', value: '', type: 'text', enabled: true, category: 'business', required: true },
    
    // Images
    { key: 'Bild 1', value: '', type: 'text', enabled: true, category: 'images', required: true },
    { key: 'Bild 2', value: '', type: 'text', enabled: false, category: 'images', required: false },
    { key: 'Bild 3', value: '', type: 'text', enabled: false, category: 'images', required: false },
    { key: 'Bild 4', value: '', type: 'text', enabled: false, category: 'images', required: false },
    { key: 'Bild 5', value: '', type: 'text', enabled: false, category: 'images', required: false },
    { key: 'Bild 6', value: '', type: 'text', enabled: false, category: 'images', required: false },
    { key: 'Media Upload', value: '', type: 'text', enabled: false, category: 'images', required: false }
  ];

  // Extract technical attributes from extracted data
  const extractTechnicalAttributes = (extractedText: string): CustomAttribute[] => {
    const attributes: CustomAttribute[] = [];
    
    // Extract voltage
    const voltageMatch = extractedText.match(/(?:Spannung|Nennspannung):\s*([^\n\r]+)/i);
    if (voltageMatch) {
      let voltage = cleanMeasurementValue(voltageMatch[1], 'voltage');
      // Handle voltage ranges like "3,6V - 3,7V" by taking first value
      if (voltage.includes('-')) {
        voltage = voltage.split('-')[0].trim();
      }
      attributes.push({
        key: 'Spannung V',
        value: voltage,
        type: 'text',
        enabled: true,
        category: 'technical',
        required: true
      });
    }

    // Extract capacity in mAh
    const capacityMatch = extractedText.match(/(?:Kapazität|Nennkapazität|Min\. Kapazität):\s*([^\n\r]+)/i);
    if (capacityMatch) {
      const capacity = cleanMeasurementValue(capacityMatch[1], 'capacity');
      attributes.push({
        key: 'Kapazität mAh',
        value: capacity,
        type: 'text',
        enabled: true,
        category: 'technical',
        required: true
      });
    }

    // Extract weight
    const weightMatch = extractedText.match(/Gewicht:\s*([^\n\r]+)/i);
    if (weightMatch) {
      const convertedWeight = convertWeightToGrams(weightMatch[1]);
      const weight = cleanMeasurementValue(convertedWeight, 'weight');
      attributes.push({
        key: 'Gewicht',
        value: weight,
        type: 'text',
        enabled: true,
        category: 'technical',
        required: false
      });
    }

    // Extract dimensions
    const dimensionsMatch = extractedText.match(/(?:Abmessungen|Größe|Durchmesser|Höhe):\s*([^\n\r]+)/i);
    if (dimensionsMatch) {
      const convertedDimensions = convertDimensionsToMm(dimensionsMatch[1]);
      const dimensions = cleanMeasurementValue(convertedDimensions, 'dimension');
      if (dimensions.includes('x')) {
        const parts = dimensions.split('x');
        if (parts.length >= 3) {
          // Format: Länge x Breite x Höhe
          attributes.push({
            key: 'Länge mm',
            value: parts[0].trim(),
            type: 'text',
            enabled: true,
            category: 'dimensions',
            required: true
          });
          attributes.push({
            key: 'Breite mm',
            value: parts[1].trim(),
            type: 'text',
            enabled: true,
            category: 'dimensions',
            required: true
          });
          attributes.push({
            key: 'Höhe mm',
            value: parts[2].trim(),
            type: 'text',
            enabled: true,
            category: 'dimensions',
            required: true
          });
        } else if (parts.length >= 2) {
          // Format: Durchmesser x Länge
          attributes.push({
            key: 'Durchmesser mm',
            value: parts[0].trim(),
            type: 'text',
            enabled: true,
            category: 'dimensions',
            required: true
          });
          attributes.push({
            key: 'Länge mm',
            value: parts[1].trim(),
            type: 'text',
            enabled: true,
            category: 'dimensions',
            required: true
          });
        }
      } else {
        attributes.push({
          key: 'Durchmesser mm',
          value: dimensions,
          type: 'text',
          enabled: true,
          category: 'dimensions',
          required: true
        });
      }
    }

    // Extract chemistry
    const chemistryMatch = extractedText.match(/(?:Zellchemie|Chemie|Zusammensetzung):\s*([^\n\r]+)/i);
    if (chemistryMatch) {
      const chemistry = cleanExtractedText(chemistryMatch[1]);
      attributes.push({
        key: 'Zusammensetzung (Chemie)',
        value: chemistry,
        type: 'text',
        enabled: true,
        category: 'technical',
        required: true
      });
    }

    // Extract protection circuit
    const protectionMatch = extractedText.match(/(?:Schutzschaltung|Schutz|PCB|BMS):\s*([^\n\r]+)/i);
    if (protectionMatch) {
      const protection = cleanExtractedText(protectionMatch[1]);
      attributes.push({
        key: 'Schutzschaltung',
        value: protection === 'Ja' ? 'Ja' : 'Nein',
        type: 'text',
        enabled: true,
        category: 'technical',
        required: true
      });
    }

    return attributes;
  };

  // Apply automatic rules to attributes
  const applyAttributeRules = (attributes: CustomAttribute[]): CustomAttribute[] => {
    return attributes.map(attr => {
      let newAttr = { ...attr };
      
      // Auto-detect product type and set defaults based on extracted data
      const extractedText = extractedData.length > 0 ? extractedData[0].extractedText : '';
      if (extractedText) {
        const lowerExtractedText = extractedText.toLowerCase();
        
        // Battery/Akku specific rules
        if (lowerExtractedText.includes('akku') || lowerExtractedText.includes('batterie') || lowerExtractedText.includes('battery')) {
          if (attr.key === 'Produktart' && !attr.value) {
            newAttr.value = 'Akku';
            newAttr.enabled = true;
          }
          if (attr.key === 'Bauform' && !attr.value) {
            newAttr.value = 'Zylindrisch';
            newAttr.enabled = true;
          }
          if (attr.key === 'Zusammensetzung (Chemie)' && !attr.value) {
            newAttr.value = 'Li-Ion';
            newAttr.enabled = true;
          }
          if (attr.key === 'Wiederaufladbar' && !attr.value) {
            newAttr.value = 'Ja';
            newAttr.enabled = true;
          }
          if (attr.key === 'Schutzschaltung' && !attr.value) {
            newAttr.value = 'Ja';
            newAttr.enabled = true;
          }
        }
        
        // Cable/Kabel specific rules
        if (lowerExtractedText.includes('kabel') || lowerExtractedText.includes('cable')) {
          if (attr.key === 'Produktart' && !attr.value) {
            newAttr.value = 'Kabel';
            newAttr.enabled = true;
          }
        }
        
        // Power supply/Netzteil specific rules
        if (lowerExtractedText.includes('netzteil') || lowerExtractedText.includes('ladegerät') || lowerExtractedText.includes('charger')) {
          if (attr.key === 'Produktart' && !attr.value) {
            newAttr.value = 'Netzteil';
            newAttr.enabled = true;
          }
        }
      }
      
      return newAttr;
    });
  };

  // Extract all possible attributes from the extracted data
  useEffect(() => {
    if (extractedData.length === 0) {
      // Don't clear attributes if we have saved ones
      const savedAttributes = localStorage.getItem('customAttributes');
      if (!savedAttributes) {
        setAvailableAttributes([]);
      }
      return;
    }

    const extractedText = extractedData[0].extractedText;
    const attributes: CustomAttribute[] = [];

    // Helper function to extract field value from text
    const extractFieldValue = (fieldName: string, patterns: RegExp[] = []): string => {
      // Try explicit field pattern first
      const explicitPattern = new RegExp(`${fieldName}\\s*:\\s*([^\\n\\r]+)`, 'i');
      const explicitMatch = extractedText.match(explicitPattern);
      if (explicitMatch) {
        return cleanExtractedText(explicitMatch[1].trim());
      }
      
      // Try additional patterns
      for (const pattern of patterns) {
        const match = extractedText.match(pattern);
        if (match) {
          return cleanExtractedText(match[1] || match[0]).trim();
        }
      }
      
      return '';
    };

    // Extract product name with USP
    let baseProductName = '';
    
    // First try to get from extracted text
    const productNameMatch = extractedText.match(/Produktname:\s*([^\n\r]+)/i);
    if (productNameMatch) {
      baseProductName = cleanExtractedText(productNameMatch[1].trim());
    } else {
      // Fallback to productName field
      baseProductName = extractedData[0].productName || extractedData[0].extractedText;
    }
    
    // Extract USP from bullets if available
    let productNameWithUSP = baseProductName;
    if (extractedData[0].bullets && extractedData[0].bullets.length > 0) {
      // Find the best USP from bullets
      const bestUSP = findBestUSP(extractedData[0].bullets);
      if (bestUSP) {
        productNameWithUSP = `${baseProductName} - ${bestUSP}`;
      }
    }
    
    // Helper function to find the best USP
    function findBestUSP(bullets: string[]): string {
      const productName = baseProductName.toLowerCase();
      
      // Generate context-aware, benefit-focused USPs based on product type and specifications
      if (productName.includes('akkupack') || productName.includes('akku')) {
        // For battery products, create capacity-based USPs
        for (const bullet of bullets) {
          const cleanBullet = bullet.replace(/^[-•]\s*/, '').trim();
          const lowerBullet = cleanBullet.toLowerCase();
          
          // Look for capacity indicators and create benefit-focused USPs
          if (lowerBullet.includes('kapazität') || lowerBullet.includes('mah')) {
            const capacityMatch = lowerBullet.match(/(\d+)\s*mah/i);
            if (capacityMatch) {
              const capacity = parseInt(capacityMatch[1]);
              if (capacity >= 7000) {
                return 'Extra hohe Kapazität für maximale Laufzeit';
              } else if (capacity >= 5000) {
                return 'Hohe Kapazität für langanhaltende Nutzung';
              } else if (capacity >= 3000) {
                return 'Optimale Kapazität für den täglichen Gebrauch';
              }
            }
            return 'Hohe Kapazität für langanhaltende Nutzung';
          }
        }
        
        // Look for voltage indicators for power-focused USPs
        for (const bullet of bullets) {
          const cleanBullet = bullet.replace(/^[-•]\s*/, '').trim();
          const lowerBullet = cleanBullet.toLowerCase();
          
          if (lowerBullet.includes('spannung') || lowerBullet.includes('v')) {
            const voltageMatch = lowerBullet.match(/(\d+[,.]?\d*)\s*v/i);
            if (voltageMatch) {
              const voltage = parseFloat(voltageMatch[1].replace(',', '.'));
              if (voltage >= 10) {
                return 'Hohe Leistung für anspruchsvolle Geräte';
              } else if (voltage >= 7) {
                return 'Optimale Leistung für mobile Geräte';
              }
            }
            return 'Zuverlässige Leistung für den täglichen Gebrauch';
          }
        }
        
        // Fallback for battery products
        return 'Für den alltäglichen Gebrauch';
      }
      
      if (productName.includes('ladegerät') || productName.includes('charger')) {
        // For chargers, prioritize speed and convenience
        for (const bullet of bullets) {
          const cleanBullet = bullet.replace(/^[-•]\s*/, '').trim();
          const lowerBullet = cleanBullet.toLowerCase();
          
          if (lowerBullet.includes('schnell') || lowerBullet.includes('fast') || lowerBullet.includes('quick')) {
            return 'Schnelles Aufladen für maximale Effizienz';
          }
        }
        return 'Schnelles Aufladen für maximale Effizienz';
      }
      
      if (productName.includes('netzteil') || productName.includes('power')) {
        // For power supplies, prioritize reliability
        return 'Zuverlässige Stromversorgung für sichere Nutzung';
      }
      
      // Look for sales-promoting keywords as fallback
      const salesKeywords = ['hoch', 'max', 'schnell', 'langanhaltend', 'zuverlässig', 'optimal', 'effizient', 'leistungsstark', 'robust', 'sicher'];
      
      for (const bullet of bullets) {
        const cleanBullet = bullet.replace(/^[-•]\s*/, '').trim();
        const lowerBullet = cleanBullet.toLowerCase();
        
        // Check if bullet contains sales-promoting keywords
        const hasSalesKeyword = salesKeywords.some(keyword => lowerBullet.includes(keyword));
        
        if (hasSalesKeyword) {
          // Extract the most important part (before dash, colon, or colon with value)
          let shortUSP = cleanBullet.split(' - ')[0] || cleanBullet.split(' – ')[0] || cleanBullet;
          
          // Remove value after colon (e.g., "max. Entladestrom: 7,8 A" -> "max. Entladestrom")
          if (shortUSP.includes(':')) {
            shortUSP = shortUSP.split(':')[0].trim();
          }
          
          return shortUSP.trim();
        }
      }
      
      // Final fallback: use first bullet if no sales-promoting keyword found
      if (bullets.length > 0) {
        const firstBullet = bullets[0].replace(/^[-•]\s*/, '').trim();
        let shortUSP = firstBullet.split(' - ')[0] || firstBullet.split(' – ')[0] || firstBullet;
        
        // Remove value after colon
        if (shortUSP.includes(':')) {
          shortUSP = shortUSP.split(':')[0].trim();
        }
        
        return shortUSP.trim();
      }
      
      return '';
    }
    
    // Extract article number first
    const articleNumber = extractFieldValue('Artikelnummer');
    
    // Extract all basic product information
    const basicFields = [
      { key: 'Produktname', value: productNameWithUSP },
      { key: 'Status', value: 'Aktiv', patterns: [/Status:\s*([^\n\r]+)/i] },
      { key: 'Marke', value: extractedData[0].url?.includes('ansmann') ? 'Accucell' : extractFieldValue('Marke') },
      { key: 'Produktart', value: extractProductType() },
      { key: 'Farbe', value: extractFieldValue('Farbe', [/Color:\s*([^\n\r]+)/i, /Farbton:\s*([^\n\r]+)/i]) },
      { key: 'Bauform', value: extractFieldValue('Bauform', [/Form:\s*([^\n\r]+)/i, /Shape:\s*([^\n\r]+)/i]) },
      { key: 'passend für Hersteller / Marke', value: extractFieldValue('passend für', [/Kompatibel mit:\s*([^\n\r]+)/i]) },
    ];

    // Add article number directly to basic fields
    if (articleNumber) {
      // Generate article number from supplier name + article number
      let supplierName = '';
      if (extractedData[0].url) {
        const urlMatch = extractedData[0].url.match(/https?:\/\/(?:www\.)?([^\/]+)/);
        if (urlMatch) {
          supplierName = urlMatch[1].split('.')[0]; // Take domain without extension
        }
      } else if (extractedData[0].fileName) {
        supplierName = extractedData[0].fileName.split('.')[0];
      }
      
      // Get first 3 uppercase letters from supplier name
      const supplierPrefix = supplierName.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 3);
      
      // Remove dashes from article number
      const cleanArticleNumber = articleNumber.replace(/-/g, '');
      
      // Combine: Supplier prefix + clean article number
      const generatedArticleNumber = `${supplierPrefix}${cleanArticleNumber}`;
      
      basicFields.push({ key: 'Artikelnummer', value: generatedArticleNumber });
    }

    // Extract dimensions and add to basic fields
    const dimensionsMatch = extractedText.match(/(?:Abmessungen|Größe|Durchmesser|Höhe):\s*([^\n\r]+)/i);
    if (dimensionsMatch) {
      const dimensions = cleanMeasurementValue(dimensionsMatch[1], 'dimension');
      if (dimensions.includes('x')) {
        const parts = dimensions.split('x');
        if (parts.length >= 3) {
          // Format: Länge x Breite x Höhe
          basicFields.push({ key: 'Länge mm', value: parts[0].trim() });
          basicFields.push({ key: 'Breite mm', value: parts[1].trim() });
          basicFields.push({ key: 'Höhe mm', value: parts[2].trim() });
        } else if (parts.length >= 2) {
          // Format: Durchmesser x Länge
          basicFields.push({ key: 'Durchmesser mm', value: parts[0].trim() });
          basicFields.push({ key: 'Länge mm', value: parts[1].trim() });
        }
    } else {
        basicFields.push({ key: 'Durchmesser mm', value: dimensions });
      }
    }
    
    // Extract business information
    const businessFields = [
      { key: 'Regelsteuersatz', value: '19' },
      { key: 'Herstellungsland', value: 'China' },
    ];
    
    // Extract SEO information
    const seoFields = [
      { key: 'SEO Name', value: baseProductName },
      { key: 'SEO Beschreibung', value: extractedData[0].description || '' },
      { key: 'SEO Content', value: extractedData[0].description || '' },
      { key: 'SEO Keywords', value: generateKeywords() },
    ];
    
    // Extract technical information
    const technicalFields = [
      { key: 'Wiederaufladbar', value: 'Ja' },
      { key: 'Schutzschaltung', value: 'Ja' },
      { key: 'Plus Pol', value: 'Erhöht' },
      { key: 'Zusammensetzung (Chemie)', value: 'Li-Ion' },
      { key: 'Gefahrgut', value: 'Nein' },
      { key: 'Verpackungseinheit', value: '1' },
      { key: 'Lieferzeit', value: '3-5 Werktage' },
      { key: 'Neber out of Stock', value: 'Nein' },
      { key: 'Stück', value: '1' },
    ];
    
    // Helper functions
    function extractProductType(): string {
      const productName = baseProductName.toLowerCase();
      const description = extractedData[0].description?.toLowerCase() || '';
      const fullText = (productName + ' ' + description).toLowerCase();
      
      if (fullText.includes('akkupack')) return 'Akkupack';
      if (fullText.includes('akku') || fullText.includes('battery')) return 'Akku';
      if (fullText.includes('ladegerät') || fullText.includes('charger')) return 'Ladegerät';
      if (fullText.includes('netzteil') || fullText.includes('power supply')) return 'Netzteil';
      return 'Akku';
    }
    
    function generateKeywords(): string {
      const keywords = [];
      
      // Extract product type and specifications
      const productType = extractProductType();
      const productName = baseProductName.toLowerCase();
      
      // Generate 6 short-tail keywords based on product data
      if (productName.includes('lithium') && productName.includes('ionen')) {
        keywords.push('Lithium-Ionen Akku');
      } else if (productName.includes('lithium')) {
        keywords.push('Lithium Akku');
      } else if (productName.includes('ionen')) {
        keywords.push('Ionen Akku');
      } else {
        keywords.push('Akku');
      }
      
      // Add product type specific keywords
      if (productType === 'Akkupack') {
        keywords.push('Akkupack');
      } else if (productType === 'Ladegerät') {
        keywords.push('Ladegerät');
      } else if (productType === 'Netzteil') {
        keywords.push('Netzteil');
      }
      
      // Add brand keyword
      if (extractedData[0].url?.includes('ansmann')) {
        keywords.push('Accucell');
      }
      
      // Add voltage/capacity keywords
      const voltageMatch = productName.match(/(\d+[,.]?\d*)\s*v/i);
      if (voltageMatch) {
        keywords.push(`${voltageMatch[1]}V Akku`);
      }
      
      const capacityMatch = productName.match(/(\d+[,.]?\d*)\s*mah/i);
      if (capacityMatch) {
        keywords.push(`${capacityMatch[1]}mAh`);
      }
      
      // Ensure we have exactly 6 keywords
      const finalKeywords = keywords.slice(0, 6);
      
      // Fill remaining slots with generic terms if needed
      while (finalKeywords.length < 6) {
        if (!finalKeywords.includes('Batterie')) {
          finalKeywords.push('Batterie');
        } else if (!finalKeywords.includes('Energie')) {
          finalKeywords.push('Energie');
        } else if (!finalKeywords.includes('Power')) {
          finalKeywords.push('Power');
        } else {
          finalKeywords.push('Akku Zubehör');
        }
      }
      
      return finalKeywords.slice(0, 6).join(', ');
    }
    
    // Add all fields to attributes
    [...basicFields, ...businessFields, ...seoFields, ...technicalFields].forEach(field => {
      if (field.value) {
          attributes.push({
          key: field.key,
          value: field.value,
            type: 'text',
            enabled: true,
          category: getCategory(field.key),
          required: isRequired(field.key),
        });
      }
    });
    
    function getCategory(key: string): 'basic' | 'technical' | 'dimensions' | 'features' | 'seo' | 'business' | 'images' {
      if (['Produktname', 'Status', 'Marke', 'Produktart', 'Farbe', 'Bauform', 'passend für Hersteller / Marke', 'Artikelnummer', 'Mediamarktname V1', 'Mediamarktname V2'].includes(key)) return 'basic';
      if (['Regelsteuersatz', 'Herstellungsland'].includes(key)) return 'business';
      if (key.startsWith('SEO')) return 'seo';
      if (['Durchmesser mm', 'Länge mm', 'Breite mm', 'Höhe mm'].includes(key)) return 'dimensions';
      return 'features';
    }
    
    function isRequired(key: string): boolean {
      return ['Produktname', 'Status', 'Marke', 'Produktart', 'Regelsteuersatz', 'Herstellungsland', 'Artikelnummer', 'Mediamarktname V1', 'Mediamarktname V2'].includes(key);
    }


    // Generate Mediamarkt V1 and V2 names
    let mediamarktV1 = '';
    let mediamarktV2 = `${baseProductName} - MediaMarkt`;
    
    // Generate V1 from extracted text with product type + model number
    const productType = extractProductType();
    let modelNumber = '';
    if (articleNumber) {
      modelNumber = articleNumber;
      } else {
      // Try to extract from product name
      const modelMatch = baseProductName.match(/(\d+[A-Z]?\d*[A-Z]?\d*)/);
      if (modelMatch) {
        modelNumber = modelMatch[1];
      }
    }
    
    mediamarktV1 = `${productType} ${modelNumber}`;
    
    // Add Mediamarkt names to basic fields
    basicFields.push(
      { key: 'Mediamarktname V1', value: mediamarktV1 },
      { key: 'Mediamarktname V2', value: mediamarktV2 }
    );




    // Add price to business fields
    const price = extractFieldValue('Preis');
    if (price) {
      businessFields.push({ key: 'Preis VK', value: price });
    }
    
    // Add technical attributes
    const technicalAttributes = extractTechnicalAttributes(extractedText);
    technicalAttributes.forEach(attr => {
      technicalFields.push({ key: attr.key, value: attr.value });
    });

    // Merge with all attributes and apply rules
    const mergedAttributes = allAttributes.map(allAttr => {
      const extractedAttr = attributes.find(attr => attr.key === allAttr.key);
      if (extractedAttr) {
        return { ...allAttr, value: extractedAttr.value, enabled: true };
      }
      return allAttr;
    });

    const finalAttributes = applyAttributeRules(mergedAttributes);
    
    // Merge with existing saved attributes to preserve user changes
    setAvailableAttributes(prev => {
      const savedAttributes = localStorage.getItem('customAttributes');
      if (savedAttributes) {
        try {
          const saved = JSON.parse(savedAttributes);
          // Merge saved attributes with new ones, preserving user values
          const merged = finalAttributes.map(newAttr => {
            const savedAttr = saved.find((s: CustomAttribute) => s.key === newAttr.key);
            if (savedAttr && savedAttr.value) {
              return { ...newAttr, value: savedAttr.value };
            }
            return newAttr;
          });
          return merged;
        } catch (error) {
          console.error('Error merging saved attributes:', error);
        }
      }
      return finalAttributes;
    });
  }, [extractedData]);

  // Memoize enabled attributes to prevent unnecessary re-renders
  const enabledAttributes = useMemo(() => {
    return availableAttributes
      .filter(attr => attr.enabled)
      .map(attr => ({
        key: attr.key,
        value: attr.value,
        type: attr.type
      }));
  }, [availableAttributes]);

  // Update parent component when attributes change
  useEffect(() => {
    onAttributesChange(enabledAttributes);
  }, [enabledAttributes, onAttributesChange]);

  const handleAttributeToggle = (key: string) => {
    setAvailableAttributes(prev => 
      prev.map(attr => 
        attr.key === key ? { ...attr, enabled: !attr.enabled } : attr
      )
    );
  };

  const handleAttributeValueChange = (key: string, value: string) => {
    setAvailableAttributes(prev => 
      prev.map(attr => 
        attr.key === key ? { ...attr, value } : attr
      )
    );
  };

  const handleAIGeneration = async (attributeKey: string) => {
    if (extractedData.length === 0) {
      toast({
        variant: "destructive",
        title: "Keine Daten",
        description: "Bitte laden Sie zuerst Dateien hoch für die AI-Generierung",
      });
      return;
    }

    setIsGenerating(true);

    try {
      const extractedText = extractedData.map(d => d.extractedText).join('\n\n');
      
      let prompt = '';
      switch (attributeKey) {
        case 'SEO Name':
          prompt = `Generiere einen SEO-optimierten Produktnamen basierend auf den Produktdaten. Der Name sollte:
- Maximal 60 Zeichen lang sein
- Die wichtigsten Keywords enthalten
- Suchmaschinenfreundlich sein
- Den Produkttyp und die Marke hervorheben

Produktdaten: ${extractedText}`;
          break;
        case 'SEO Beschreibung':
          prompt = `Generiere eine SEO-optimierte Produktbeschreibung basierend auf den Produktdaten. Die Beschreibung sollte:
- Maximal 160 Zeichen lang sein
- Die wichtigsten Features und Vorteile hervorheben
- Suchmaschinenfreundlich sein
- Zum Klicken animieren

Produktdaten: ${extractedText}`;
          break;
        case 'SEO Content':
          prompt = `Generiere SEO-optimierten Content für das Produkt basierend auf den Produktdaten. Der Content sollte:
- Strukturiert und informativ sein
- Alle wichtigen technischen Daten enthalten
- Suchmaschinenfreundlich formatiert sein
- Zwischen 200-300 Wörtern lang sein

Produktdaten: ${extractedText}`;
          break;
        case 'SEO Keywords':
          prompt = `Generiere relevante SEO-Keywords für das Produkt basierend auf den Produktdaten. Die Keywords sollten:
- Komma-getrennt sein
- Relevante Suchbegriffe enthalten
- Verschiedene Keyword-Varianten umfassen
- Maximal 20 Keywords enthalten

Produktdaten: ${extractedText}`;
          break;
    case 'Mediamarktname V1':
      prompt = `Generiere einen Mediamarkt-optimierten Produktnamen V1 basierend auf den Produktdaten. Der Name sollte:
- Mit einem generischen Produkttyp beginnen (z.B. "Akku", "Kabel", "Notebook Netzteil")
- Wichtige Identifikatoren enthalten (Artikelnummer, Kapazität, Spannung)
- Maximal 60 Zeichen lang sein
- Für Mediamarkt-Kunden verständlich sein

Produktdaten: ${extractedText}`;
      break;
    case 'Mediamarktname V2':
      prompt = `Generiere einen Mediamarkt-optimierten Produktnamen V2 basierend auf den Produktdaten. Der Name sollte:
- Eine kompakte Version von V1 sein (ohne generischen Produkttyp)
- Nur die wichtigsten Identifikatoren enthalten (Artikelnummer, Kapazität, Spannung)
- Maximal 40 Zeichen lang sein
- Für Mediamarkt-Kunden verständlich sein

Produktdaten: ${extractedText}`;
      break;
        default:
          prompt = `Generiere einen Wert für "${attributeKey}" basierend auf den Produktdaten: ${extractedText}`;
      }

      const response = await fetch('/api/generate-description', {
        method: 'POST',
        body: JSON.stringify({
          extractedData: [prompt],
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      if (result.success && result.description) {
        const generatedValue = cleanExtractedText(result.description);
        handleAttributeValueChange(attributeKey, generatedValue);
        
        toast({
          title: "AI-Generierung erfolgreich",
          description: `${attributeKey} wurde automatisch generiert`,
        });
      } else {
        throw new Error('Keine Antwort von der AI erhalten');
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "AI-Generierung fehlgeschlagen",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const getCategoryCount = (category: string) => {
    return availableAttributes.filter(attr => attr.category === category).length;
  };

  const getEnabledCount = (category: string) => {
    return availableAttributes.filter(attr => attr.category === category && attr.enabled).length;
  };

  const getRequiredCount = () => {
    return availableAttributes.filter(attr => attr.required).length;
  };

  const getEnabledRequiredCount = () => {
    return availableAttributes.filter(attr => attr.required && attr.enabled).length;
  };

  const categories = [
    { key: 'basic', label: 'Grunddaten', icon: '📋' },
    { key: 'technical', label: 'Technisch', icon: '⚙️' },
    { key: 'dimensions', label: 'Abmessungen', icon: '📏' },
    { key: 'features', label: 'Features', icon: '✨' },
    { key: 'seo', label: 'SEO', icon: '🔍' },
    { key: 'business', label: 'Business', icon: '💼' },
    { key: 'images', label: 'Bilder', icon: '🖼️' }
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Grunddaten (Custom Attributes)
              </CardTitle>
              <CardDescription>
                Konfigurieren Sie die Attribute, die automatisch generiert werden sollen
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                <Eye className="w-4 h-4 mr-2" />
                Vorschau
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsConfigDialogOpen(true)}
              >
                <Columns className="w-4 h-4 mr-2" />
                Spalten konfigurieren
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* All Attributes in Single List */}
          <div className="space-y-4">
            {availableAttributes.map((attr, index) => (
              <div key={index} className="border rounded-lg p-4 bg-card">
                {/* Attribute Header */}
                <div className="flex items-center gap-3 mb-3">
                  <Checkbox
                    checked={attr.enabled}
                    onCheckedChange={() => handleAttributeToggle(attr.key)}
                  />
                  <Label className="text-sm font-semibold flex-1">{attr.key}</Label>
                </div>
                
                {/* Input Field */}
                <div className="space-y-3">
                  {attr.key === 'Produktbeschreibung' ? (
                    <textarea
                      value={attr.value}
                      onChange={(e) => handleAttributeValueChange(attr.key, e.target.value)}
                      placeholder={`${attr.key} eingeben...`}
                      className="w-full px-3 py-2 text-sm border rounded-md min-h-[100px] resize-y focus:ring-2 focus:ring-primary focus:border-primary"
                      rows={4}
                    />
                  ) : (
                    <input
                      type="text"
                      value={attr.value}
                      onChange={(e) => handleAttributeValueChange(attr.key, e.target.value)}
                      placeholder={`${attr.key} eingeben...`}
                      className="w-full px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                  )}
                  
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Attribute Vorschau</DialogTitle>
            <DialogDescription>
              Vorschau aller ausgewählten Attribute für den Export
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {availableAttributes
              .filter(attr => attr.enabled)
              .map((attr, index) => (
                <div key={index} className="flex justify-between items-center p-3 border rounded">
                  <span className="font-medium">{attr.key}</span>
                  <span className="text-muted-foreground">{attr.value || '(leer)'}</span>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Spalten konfigurieren Dialog */}
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Columns className="w-5 h-5" />
              Spalten konfigurieren
            </DialogTitle>
            <DialogDescription>
              Wählen Sie die Attribute aus, die in der CSV-Export enthalten sein sollen
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1">
            <div className="space-y-6">
              {categories.map(category => {
                const categoryAttributes = availableAttributes.filter(attr => attr.category === category.key);
                
                return (
                  <div key={category.key} className="space-y-4">
                    {/* Category Header */}
                    <div className="flex items-center gap-3 border-b pb-2">
                      <span className="text-xl">{category.icon}</span>
                      <h3 className="text-lg font-semibold">{category.label}</h3>
                      <div className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
                        {getEnabledCount(category.key)}/{getCategoryCount(category.key)} aktiviert
                      </div>
                    </div>
                    
                    {/* Attributes List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {categoryAttributes.map((attr, index) => (
                        <div key={index} className="flex items-center space-x-3 p-3 border rounded-lg bg-card">
                          <Checkbox
                            checked={attr.enabled}
                            onCheckedChange={() => handleAttributeToggle(attr.key)}
                            className="h-4 w-4"
                          />
                          <div className="flex-1">
                            <Label className="text-sm font-medium">
                              {attr.key}
                            </Label>
                            {attr.value && (
                              <p className="text-xs text-muted-foreground mt-1 truncate">
                                {attr.value}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsConfigDialogOpen(false)}>
              Schließen
            </Button>
            <Button onClick={() => setIsConfigDialogOpen(false)}>
              Speichern
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
