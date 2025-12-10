import Papa from "papaparse";

export interface ProductData {
  id: string;
  sku: string;
  name: string;
  description: string;
  brand: string;
  category: string;
  currentWeight: string;
  estimatedWeight: string;
  confidence: "high" | "medium" | "low";
}

export function parseProductCSV(row: Record<string, string>): ProductData {
  return {
    id: row["p_id"] || row["v_id"] || "",
    sku: row["p_item_number"] || row["v_sku"] || "",
    name: row["p_name[de]"] || row["p_name"] || "",
    description: row["p_description[de]"] || row["p_description"] || "",
    brand: row["p_brand"] || "",
    category: row["p_group_path[de]"] || row["p_group_path"] || "",
    currentWeight: row["v_weight"] || "",
    estimatedWeight: "",
    confidence: "low"
  };
}

export function needsWeightEstimation(product: ProductData): boolean {
  const weight = product.currentWeight?.trim();
  return !weight || weight === "0" || weight === "0.00";
}
