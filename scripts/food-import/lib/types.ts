// Canonical row shape produced by every importer in scripts/food-import.
// Stays loose vs. the DB schema on purpose: importers should output what
// the source provides (in source units, with provenance), and a separate
// seed step is responsible for mapping into the foods/barcode_foods
// tables. Keeping the import shape decoupled from the DB shape lets us
// add new sources without dragging migrations along.
export interface ImportedFoodRow {
  // Identity
  nameJa: string;
  nameEn?: string | null;
  brand?: string | null;

  // Serving size in grams. Required because every macro below is
  // expressed PER SERVING; the seed step can compute per-100g if needed.
  servingG: number;
  servingDescription?: string | null;

  // Macros — per serving
  caloriesKcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;

  // Optional micros — null/undefined when not present in the source.
  // Importers MUST NOT fabricate these; missing data stays missing.
  fiberG?: number | null;
  saltG?: number | null;
  sodiumMg?: number | null;
  saturatedFatG?: number | null;
  sugarG?: number | null;

  // Provenance — required for every row. sourceUrl must point at the
  // exact page or file the data came from; "the MEXT website" is not
  // sufficient. capturedAt is ISO YYYY-MM-DD.
  sourceUrl: string;
  sourceLicense: SourceLicense;
  capturedAt: string;

  notes?: string | null;
}

// The set of sources we have legal clearance for. Anything not on this
// list is prohibited until reviewed in docs/data-sources.md.
export type SourceLicense =
  | 'mext-8th'           // MEXT 八訂 — free, attribution required
  | 'cc0-usda-fdc'       // USDA FoodData Central — CC0 1.0 (public domain)
  | 'odbl-openfoodfacts' // Open Food Facts — ODbL share-alike
  | 'manual'             // hand-entered from a printed label / PDF
  | 'user-submitted';    // future: in-app user submissions

export interface ValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
}

export interface ValidatedRow {
  row: ImportedFoodRow;
  issues: ValidationIssue[];
}
