export interface ProductCopyPayload {
  tagline?: string;
  narrative: string;
  uspBullets: string[];
  technicalSpecs: Record<string, string>;
  safetyNotice?: string;
  packageContents?: string;
  productHighlights?: string[];
  einleitung?: string;
  anwendung?: string;
  beschreibung?: string;
  kompatibleModelle?: string[];
  werkzeuguebersicht?: string[];
  apnSatz?: string;
  fazit?: string;
  zeigeTabelle?: boolean;
  produktTyp?: 'akku' | 'elektronik' | 'werkzeug';
  produktTitel?: string;
}

export interface GenerateDescriptionInput {
  extractedData: any;
  categoryId: string;
  layoutId?: string;
  customAttributes?: {
    exactProductName?: string;
    articleNumber?: string;
    customAttributes?: Array<{key: string, value: string, type: string}>;
  };
}
