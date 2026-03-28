import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Erstellt einen CSV-Blob in UTF-8 ohne BOM.
 * Brickfox erwartet dieses Format für den Import.
 */
export function makeCsvBlob(csvString: string): Blob {
  const bytes = new TextEncoder().encode(csvString);
  return new Blob([bytes], { type: 'text/csv;charset=utf-8' });
}
