import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Erstellt einen CSV-Blob in Windows-1252-Kodierung (kein BOM).
 * LibreOffice/Excel erkennen Windows-1252 automatisch; Brickfox erwartet es ebenfalls.
 * Zeichen außerhalb von Windows-1252 (>U+00FF) werden durch '?' ersetzt.
 */
export function makeCsvBlob(csvString: string): Blob {
  const bytes = new Uint8Array(csvString.length);
  for (let i = 0; i < csvString.length; i++) {
    const code = csvString.charCodeAt(i);
    bytes[i] = code <= 0xFF ? code : 0x3F;
  }
  return new Blob([bytes], { type: 'text/csv;charset=windows-1252' });
}
