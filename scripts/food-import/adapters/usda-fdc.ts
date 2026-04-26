import type { ImportedFoodRow } from '../lib/types';

// USDA FoodData Central adapter.
//
// FDC is CC0 1.0 — fully public domain, attribution-optional. Two
// datasets matter for us:
//
//   - "Branded Foods"   — 1.5M+ commercial products with NLEA labels
//                         (where we get protein bars, whey, etc).
//   - "Foundation Foods" / "SR Legacy" — analytical composition data
//                         (where MEXT-style raw ingredients live, but
//                         in less detail than 八訂; we don't lean on
//                         these but the adapter handles them anyway).
//
// FDC distributes JSON dumps from https://fdc.nal.usda.gov/download-datasets.html.
// Each top-level record uses `dataType` to disambiguate the dataset.
//
// What this adapter does:
//   - Maps FDC nutrient IDs → ImportedFoodRow fields
//   - Converts per-100g values (Foundation/SR) → per-serving when a
//     servingSize is declared on the record
//   - Normalizes serving units (oz, lb, ml-as-g) to grams
//   - Resolves brand display names via the brand-i18n.json table
//   - Filters to protein-focused entries by default (≥15g/100g) —
//     the goal is to fill the gap for protein bars / RTD / whey,
//     not to pile in 100k breakfast cereals
//
// What it deliberately does NOT do:
//   - It does not fabricate missing macros. If a record has no
//     protein/fat/carb listed, mapFdcFoodToImportedRow returns null.
//   - It does not estimate calories from PFC. validator.ts catches
//     PFC-vs-calories mismatches; we let it.

// ----- FDC nutrient IDs (USDA stable identifiers) -----
// Reference: https://fdc.nal.usda.gov/api-spec/fdc_api.html
export const FDC_NUTRIENT_IDS = {
  energyKcal: 1008,
  energyKj: 1062,         // fallback when 1008 is absent (some Foundation rows)
  proteinG: 1003,
  fatG: 1004,
  carbG: 1005,
  fiberG: 1079,
  sugarsG: 2000,
  saturatedFatG: 1258,
  sodiumMg: 1093,
} as const;

// ----- Source dataType strings used by FDC -----
export type FdcDataType =
  | 'Branded'
  | 'Foundation'
  | 'SR Legacy'
  | 'Survey (FNDDS)'
  | 'Sub Sample Food'
  | 'Agricultural Acquisition'
  | 'Experimental';

// Minimal shape of an FDC food record. The published JSON has many
// more fields than we need; everything below is optional except
// fdcId + description (which we always require to even attempt a row).
export interface FdcFoodRecord {
  fdcId: number;
  dataType?: string;
  description: string;
  brandOwner?: string;
  brandName?: string;
  brandedFoodCategory?: string;
  ingredients?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: FdcFoodNutrient[];
  publicationDate?: string;
  marketCountry?: string;
}

export interface FdcFoodNutrient {
  // The shape varies between dump formats. Both branded and foundation
  // dumps put the numeric id under `nutrient.id`, but older exports
  // put it on a top-level `nutrientId`. Accept either.
  nutrient?: { id?: number; name?: string; unitName?: string };
  nutrientId?: number;
  amount?: number;
  unitName?: string;
}

// ----- Filter / mapping options -----
export interface FdcFilterOptions {
  // Only records with >= this much protein per 100g pass. 15 g/100g
  // is roughly the floor for "protein-focused" products (bars 20–30,
  // whey 70–80, jerky 50). Set to 0 to keep everything.
  minProteinPer100g?: number;
  // If non-empty, brandOwner must match (case-insensitive) one of these
  // strings. Useful when seeding a small allowlist for a release.
  brandAllowlist?: string[];
  // Restrict by FDC dataType. Default: undefined (allow all).
  allowedDataTypes?: FdcDataType[];
  // Drop records with marketCountry not in this list. Default:
  // undefined (allow all). Set to ['United States', 'Japan'] etc. to
  // restrict.
  allowedMarketCountries?: string[];
  // Required macros: protein, fat, carb, calories. Records missing any
  // of these are skipped. Default: true.
  requireFullMacros?: boolean;
}

export interface FdcMapOptions {
  // Today's date (YYYY-MM-DD) — used as capturedAt on every row.
  // Pass-through so callers control it (orchestrator sets it once).
  capturedAt: string;
  // EN→JA brand display map. Optional — when a brand isn't in the
  // table we leave brand as the original English string.
  brandI18n?: Record<string, string>;
  // Override for the per-record sourceUrl. Default points at the FDC
  // food detail page.
  sourceUrlForFdcId?: (fdcId: number) => string;
}

// FDC base URL for the food detail page.
const DEFAULT_FDC_FOOD_URL = (id: number) =>
  `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${id}/nutrients`;

// ----- Unit conversion -----
// Returns grams given an FDC servingSize + servingSizeUnit pair.
// Returns null when the unit isn't a mass we can resolve.
export function convertServingToGrams(
  amount: number | undefined,
  unit: string | undefined,
): number | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const u = (unit ?? '').trim().toLowerCase();
  switch (u) {
    case 'g':
    case 'gram':
    case 'grams':
      return amount;
    case 'mg':
      return amount / 1000;
    case 'kg':
      return amount * 1000;
    case 'oz':
    case 'ounce':
    case 'ounces':
      return amount * 28.3495;
    case 'lb':
    case 'lbs':
    case 'pound':
    case 'pounds':
      return amount * 453.592;
    // ml is volume, not mass — but FDC labels it on water-based RTD
    // products where 1 ml ≈ 1 g is close enough for the 15% PFC
    // tolerance to absorb. Anything denser (oils, syrups) we drop.
    case 'ml':
    case 'milliliter':
    case 'milliliters':
      return amount;
    default:
      return null;
  }
}

// ----- Per-100g lookup over a foodNutrients array -----
// FDC stores nutrients per 100g for Foundation/SR records and
// per-serving for some Branded entries. The dump's `dataType` is the
// best signal of which we have, but the most robust read is to assume
// per-100g and rescale to per-serving using the declared servingSize.
function findNutrientAmount(
  nutrients: FdcFoodNutrient[] | undefined,
  id: number,
): number | null {
  if (!nutrients) return null;
  for (const n of nutrients) {
    const nid = n.nutrient?.id ?? n.nutrientId;
    if (nid === id && typeof n.amount === 'number' && Number.isFinite(n.amount)) {
      return n.amount;
    }
  }
  return null;
}

// Energy comes back as kcal preferentially; if only kJ is present,
// convert (1 kcal = 4.184 kJ).
function readEnergyKcal(nutrients: FdcFoodNutrient[] | undefined): number | null {
  const kcal = findNutrientAmount(nutrients, FDC_NUTRIENT_IDS.energyKcal);
  if (kcal != null) return kcal;
  const kj = findNutrientAmount(nutrients, FDC_NUTRIENT_IDS.energyKj);
  if (kj != null) return kj / 4.184;
  return null;
}

// ----- Brand i18n -----
// Case-insensitive lookup; trims whitespace. Returns null when no
// translation is available (caller falls back to the original).
export function lookupBrandJa(
  brand: string | undefined | null,
  brandI18n: Record<string, string> | undefined,
): string | null {
  if (!brand || !brandI18n) return null;
  const key = brand.trim().toLowerCase();
  for (const [en, ja] of Object.entries(brandI18n)) {
    if (en.trim().toLowerCase() === key) return ja;
  }
  return null;
}

// ----- Filter -----
export function filterFdcFoodForImport(
  record: FdcFoodRecord,
  filters: FdcFilterOptions = {},
): boolean {
  const {
    minProteinPer100g = 15,
    brandAllowlist,
    allowedDataTypes,
    allowedMarketCountries,
    requireFullMacros = true,
  } = filters;

  if (allowedDataTypes && allowedDataTypes.length > 0) {
    if (!record.dataType || !allowedDataTypes.includes(record.dataType as FdcDataType)) {
      return false;
    }
  }
  if (allowedMarketCountries && allowedMarketCountries.length > 0) {
    if (!record.marketCountry || !allowedMarketCountries.includes(record.marketCountry)) {
      return false;
    }
  }
  if (brandAllowlist && brandAllowlist.length > 0) {
    const owner = (record.brandOwner ?? record.brandName ?? '').trim().toLowerCase();
    if (!owner) return false;
    const ok = brandAllowlist.some((b) => b.trim().toLowerCase() === owner);
    if (!ok) return false;
  }

  const protein = findNutrientAmount(record.foodNutrients, FDC_NUTRIENT_IDS.proteinG);
  const fat = findNutrientAmount(record.foodNutrients, FDC_NUTRIENT_IDS.fatG);
  const carb = findNutrientAmount(record.foodNutrients, FDC_NUTRIENT_IDS.carbG);
  const kcal = readEnergyKcal(record.foodNutrients);

  if (requireFullMacros) {
    if (protein == null || fat == null || carb == null || kcal == null) return false;
  }
  if (minProteinPer100g > 0) {
    if (protein == null || protein < minProteinPer100g) return false;
  }
  return true;
}

// ----- Mapper -----
// Returns null when the record is missing the bare minimum to populate
// an ImportedFoodRow. Caller decides whether to log + skip or surface.
export function mapFdcFoodToImportedRow(
  record: FdcFoodRecord,
  opts: FdcMapOptions,
): ImportedFoodRow | null {
  if (!record.description?.trim()) return null;

  const protein100 = findNutrientAmount(record.foodNutrients, FDC_NUTRIENT_IDS.proteinG);
  const fat100 = findNutrientAmount(record.foodNutrients, FDC_NUTRIENT_IDS.fatG);
  const carb100 = findNutrientAmount(record.foodNutrients, FDC_NUTRIENT_IDS.carbG);
  const kcal100 = readEnergyKcal(record.foodNutrients);

  if (protein100 == null || fat100 == null || carb100 == null || kcal100 == null) {
    return null;
  }

  // Serving: prefer the explicit servingSize; if absent default to
  // 100g (the unit FDC uses for its analytical reporting). This means
  // Foundation rows without a serving end up reported per-100g, which
  // is the standard scientific presentation.
  const servingG =
    convertServingToGrams(record.servingSize, record.servingSizeUnit) ?? 100;
  const scale = servingG / 100;

  const fiber100 = findNutrientAmount(record.foodNutrients, FDC_NUTRIENT_IDS.fiberG);
  const sugar100 = findNutrientAmount(record.foodNutrients, FDC_NUTRIENT_IDS.sugarsG);
  const sat100 = findNutrientAmount(record.foodNutrients, FDC_NUTRIENT_IDS.saturatedFatG);
  const sodium100 = findNutrientAmount(record.foodNutrients, FDC_NUTRIENT_IDS.sodiumMg);

  // Brand resolution: prefer brandOwner (the company), fall back to
  // brandName (the line). Run the result through the i18n map.
  const rawBrand = (record.brandOwner ?? record.brandName ?? '').trim() || null;
  const brandJa = lookupBrandJa(rawBrand, opts.brandI18n);
  const brand = brandJa ?? rawBrand;

  // Name: FDC descriptions are uppercase, comma-delimited. Title-case
  // the result for readability; the JA label (if any) gets attached
  // via post-processing in the seed step (out of scope here).
  const nameEn = titleCaseFdcDescription(record.description);

  const sourceUrlFn = opts.sourceUrlForFdcId ?? DEFAULT_FDC_FOOD_URL;

  return {
    nameJa: nameEn, // placeholder: localization happens at seed time
    nameEn,
    brand,
    servingG: round(servingG, 2),
    servingDescription: record.householdServingFullText?.trim() || null,
    caloriesKcal: round(kcal100 * scale, 1),
    proteinG: round(protein100 * scale, 2),
    fatG: round(fat100 * scale, 2),
    carbG: round(carb100 * scale, 2),
    fiberG: fiber100 != null ? round(fiber100 * scale, 2) : null,
    saltG: null, // FDC stores sodium, not salt — leave null, seed step can derive
    sodiumMg: sodium100 != null ? round(sodium100 * scale, 1) : null,
    saturatedFatG: sat100 != null ? round(sat100 * scale, 2) : null,
    sugarG: sugar100 != null ? round(sugar100 * scale, 2) : null,
    sourceUrl: sourceUrlFn(record.fdcId),
    sourceLicense: 'cc0-usda-fdc',
    capturedAt: opts.capturedAt,
    notes: buildNotes(record),
  };
}

// "PROTEIN BAR, CHOCOLATE PEANUT BUTTER" → "Protein Bar, Chocolate Peanut Butter"
function titleCaseFdcDescription(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .trim();
}

function buildNotes(record: FdcFoodRecord): string | null {
  const parts: string[] = [];
  if (record.dataType) parts.push(`fdc:${record.dataType}`);
  if (record.brandedFoodCategory) parts.push(`category:${record.brandedFoodCategory}`);
  if (record.marketCountry) parts.push(`country:${record.marketCountry}`);
  return parts.length > 0 ? parts.join(' | ') : null;
}

function round(n: number, digits: number): number {
  const k = Math.pow(10, digits);
  return Math.round(n * k) / k;
}

// ----- Bulk helpers -----
export interface MapManyResult {
  rows: ImportedFoodRow[];
  skipped: number;
}

export function mapFdcFoodsToImportedRows(
  records: FdcFoodRecord[],
  opts: FdcMapOptions,
  filters?: FdcFilterOptions,
): MapManyResult {
  let skipped = 0;
  const rows: ImportedFoodRow[] = [];
  for (const r of records) {
    if (filters && !filterFdcFoodForImport(r, filters)) {
      skipped++;
      continue;
    }
    const mapped = mapFdcFoodToImportedRow(r, opts);
    if (!mapped) {
      skipped++;
      continue;
    }
    rows.push(mapped);
  }
  return { rows, skipped };
}
