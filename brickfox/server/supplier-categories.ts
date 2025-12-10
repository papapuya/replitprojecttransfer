/**
 * Supplier Category Configurations
 * Defines product categories for each supplier for batch scraping
 */

export interface SupplierCategory {
  name: string;
  url: string;
  description?: string;
}

export interface SupplierCategoryConfig {
  supplierId: string;
  supplierName: string;
  categories: SupplierCategory[];
  defaultMaxProducts?: number;
  defaultMaxPages?: number;
}

/**
 * AkkuTeile B2B Categories
 */
export const akkuteileCategories: SupplierCategoryConfig = {
  supplierId: '85fc9a67-be4a-4b29-b19e-47b95611542b',
  supplierName: 'AkkuTeile',
  defaultMaxProducts: 500,
  defaultMaxPages: 10,
  categories: [
    {
      name: 'Lithium-Ionen Akkus',
      url: 'https://www.akkuteile-b2b.de/lithium-ionen-akkus',
      description: 'Alle Lithium-Ionen Akkupacks'
    },
    {
      name: 'Lithium-Polymer Akkus',
      url: 'https://www.akkuteile-b2b.de/lithium-polymer-akkus',
      description: 'LiPo Akkus für verschiedene Anwendungen'
    },
    {
      name: 'NiMH Akkus',
      url: 'https://www.akkuteile-b2b.de/nimh-akkus',
      description: 'Nickel-Metallhydrid Akkus'
    },
    {
      name: 'E-Bike Akkus',
      url: 'https://www.akkuteile-b2b.de/e-bike-akkus',
      description: 'Akkus für E-Bikes und Pedelecs'
    },
    {
      name: 'Powerbanks',
      url: 'https://www.akkuteile-b2b.de/powerbanks',
      description: 'Mobile Powerbanks und Ladegeräte'
    },
    {
      name: 'Ladegeräte',
      url: 'https://www.akkuteile-b2b.de/ladegeraete',
      description: 'Ladegeräte für verschiedene Akkutypen'
    }
  ]
};

/**
 * Nitecore Categories (Example for future expansion)
 */
export const nitecoreCategories: SupplierCategoryConfig = {
  supplierId: 'nitecore-id', // Replace with actual ID
  supplierName: 'Nitecore',
  defaultMaxProducts: 500,
  defaultMaxPages: 10,
  categories: [
    {
      name: 'Taschenlampen',
      url: 'https://www.nitecore.de/taschenlampen',
      description: 'Alle Nitecore Taschenlampen'
    },
    {
      name: 'Stirnlampen',
      url: 'https://www.nitecore.de/stirnlampen',
      description: 'Stirnlampen für Outdoor'
    },
    {
      name: 'Ladegeräte',
      url: 'https://www.nitecore.de/ladegeraete',
      description: 'Ladegeräte für Akkus'
    }
  ]
};

/**
 * Phonetastik Categories - Diamond Glass Displayschutz
 */
export const phonetastikCategories: SupplierCategoryConfig = {
  supplierId: '7b058c03-f670-4063-b3c8-cdbaec20087d',
  supplierName: 'Phonetastik',
  defaultMaxProducts: 1000,
  defaultMaxPages: 20,
  categories: [
    {
      name: 'Diamond Glass - iPhone 16 Serie',
      url: 'https://phonetastik.de/Diamond-Glass/?p=1&o=3&n=48&f=127%7C150%7C151%7C152',
      description: 'Diamond Glass für iPhone 16, 16 Plus, 16 Pro, 16 Pro Max'
    },
    {
      name: 'Diamond Glass - iPhone 15 Serie',
      url: 'https://phonetastik.de/Diamond-Glass/?p=1&o=3&n=48&f=127%7C142%7C143%7C144%7C145',
      description: 'Diamond Glass für iPhone 15, 15 Plus, 15 Pro, 15 Pro Max'
    },
    {
      name: 'Diamond Glass - iPhone 14 Serie',
      url: 'https://phonetastik.de/Diamond-Glass/?p=1&o=3&n=48&f=127%7C138%7C139%7C140%7C141',
      description: 'Diamond Glass für iPhone 14, 14 Plus, 14 Pro, 14 Pro Max'
    },
    {
      name: 'Diamond Glass - iPhone 13 Serie',
      url: 'https://phonetastik.de/Diamond-Glass/?p=1&o=3&n=48&f=127%7C134%7C135%7C136%7C137',
      description: 'Diamond Glass für iPhone 13, 13 Mini, 13 Pro, 13 Pro Max'
    },
    {
      name: 'Diamond Glass - Samsung Galaxy S Serie',
      url: 'https://phonetastik.de/Diamond-Glass/?p=1&o=3&n=48&f=128',
      description: 'Diamond Glass für Samsung Galaxy S-Modelle'
    },
    {
      name: 'Diamond Glass - Samsung Galaxy A Serie',
      url: 'https://phonetastik.de/Diamond-Glass/?p=1&o=3&n=48&f=129',
      description: 'Diamond Glass für Samsung Galaxy A-Modelle'
    },
    {
      name: 'Diamond Glass - Huawei',
      url: 'https://phonetastik.de/Diamond-Glass/?p=1&o=3&n=48&f=130',
      description: 'Diamond Glass für Huawei Smartphones'
    },
    {
      name: 'Diamond Glass - Xiaomi',
      url: 'https://phonetastik.de/Diamond-Glass/?p=1&o=3&n=48&f=131',
      description: 'Diamond Glass für Xiaomi Smartphones'
    },
    {
      name: 'Diamond Glass - Google Pixel',
      url: 'https://phonetastik.de/Diamond-Glass/?p=1&o=3&n=48&f=133',
      description: 'Diamond Glass für Google Pixel Smartphones'
    },
    {
      name: 'Diamond Glass - Alle Produkte',
      url: 'https://phonetastik.de/Diamond-Glass/',
      description: 'Alle Diamond Glass Displayschutzfolien'
    }
  ]
};

/**
 * Get categories for a specific supplier
 */
export function getSupplierCategories(supplierId: string): SupplierCategoryConfig | null {
  const configs = [akkuteileCategories, nitecoreCategories, phonetastikCategories];
  return configs.find(config => config.supplierId === supplierId) || null;
}

/**
 * Get all supplier category configs
 */
export function getAllSupplierCategories(): SupplierCategoryConfig[] {
  return [akkuteileCategories, nitecoreCategories, phonetastikCategories];
}
