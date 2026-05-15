import type { Food } from '../types/food';
import type { ParsedNutritionLabel } from './submission/nutritionLabelParser';

// v1.4 ステージ 4 Phase 4E-1 — ParsedNutritionLabel → Food candidate.
//
// Takes the OCR parser's structured output and produces a synthetic
// Food-shape object suitable for ServingQuantityModal pre-fill. The
// returned shape mirrors `Food` (full type, not Partial) but uses an
// empty `id` to signal "this is a candidate, not a saved row" — the
// add-flow consumer must skip `foodId` when calling addFood so the
// meal log entry is recorded as a manual addition rather than a
// foreign-key reference to a row that doesn't exist.
//
// perBasis behavior (judgment D in Turn 2 recon):
//   - per_serving: use parsed.calories/protein/fat/carb as-is, with
//     servingSizeG defaulting to 100 (label doesn't carry it explicitly)
//   - per_100g:    same values but servingSizeG = 100 (semantic match)
//   - unknown:     treat as per_serving with servingSizeG = 100 and
//     fire `onUnknownBasis` (non-blocking warning toast in caller)
//     so the user knows to verify the unit before saving.

export interface ParsedLabelToFoodOptions {
  /** Fired when perBasis === 'unknown' so the caller can show a
   * non-blocking warning. The mapping itself does NOT throw — we
   * still produce a usable candidate, the user can correct it. */
  onUnknownBasis?: () => void;
}

export function mapParsedLabelToFood(
  parsed: ParsedNutritionLabel,
  options: ParsedLabelToFoodOptions = {},
): Food {
  if (parsed.perBasis === 'unknown') {
    options.onUnknownBasis?.();
  }

  // All three perBasis cases collapse to "100g default" today — the
  // OCR parser doesn't recover the printed serving size, only the
  // basis label. servingSizeG is editable via the gram-mode toggle
  // in ServingQuantityModal so the user can adjust if needed.
  const servingSizeG = 100;
  const servingUnit = 'g';

  // The OCR parser doesn't recover a product name (the panel parser
  // only looks at nutrient rows). We seed a generic placeholder so
  // ServingQuantityModal has something to display in its header; the
  // user can rename later by long-pressing the meal log entry and
  // re-saving. A future UX iteration may insert a name-input step
  // before the Modal, but v1.4 keeps the path single-step.
  const now = new Date().toISOString();
  return {
    id: '',
    nameJa: '栄養成分ラベルから登録',
    nameEn: null,
    brand: null,
    barcode: null,
    servingSizeG,
    servingUnit,
    caloriesPerServing: parsed.calories ?? 0,
    proteinG: parsed.proteinG ?? 0,
    fatG: parsed.fatG ?? 0,
    carbG: parsed.carbG ?? 0,
    source: 'user',
    externalId: null,
    isCustom: false,
    isFavorite: false,
    isUserAdded: false,
    verified: false,
    addedAt: null,
    useCount: 0,
    createdAt: now,
    updatedAt: now,
    // Extended nutrients — null when the parser couldn't extract them.
    fiberG: parsed.fiberG,
    sodiumMg: parsed.sodiumMg,
    calciumMg: parsed.calciumMg,
    ironMg: parsed.ironMg,
    vitaminAUg: null,
    vitaminB1Mg: null,
    vitaminB2Mg: null,
    vitaminB6Mg: null,
    vitaminB12Ug: null,
    folateUg: null,
    vitaminCMg: null,
    vitaminDUg: null,
    vitaminEMg: null,
    potassiumMg: null,
    magnesiumMg: null,
    zincMg: null,
    cholesterolMg: parsed.cholesterolMg,
    saturatedFatG: parsed.saturatedFatG,
    sugarG: parsed.sugarG,
    saltG: parsed.saltG,
  };
}
