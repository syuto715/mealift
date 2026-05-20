import type {
  SearchIndexDetail,
  SearchIndexNutrition,
} from '../infra/repositories/searchIndexRepository';
import type { MealLogItemInput } from '../types/nutrition';

// v1.5 Phase 2.4 Sprint 2.4.1 — search-result → meal-log snapshot adapter.
//
// Drafting 166 (point-in-time meal-log snapshot pattern) — the
// search_index nutrition snapshot at selection time is copied into
// the meal_log_items row as-is, so a later refresh of search_index
// (re-seed, chain data update) does NOT mutate past meal log
// entries. This matches the user expectation set by MyFitnessPal /
// あすけん / カロミル and avoids history drift.
//
// `foodId` is intentionally `null` for both source types — the
// 八訂 row id (`mext_NNNNN`) and the restaurant_menu pseudo-id
// (`<slug>_NNNN`) don't line up with the v1 `foods` table primary
// key (UUID + is_custom). Phase 2.4.2 favorites will land an
// `addCustomFood` round-trip when the user explicitly stars an
// entry; routine meal log writes don't need that pivot.
//
// `foodName` carries the chain brand on restaurant rows so the
// meal log timeline can render "セブン-イレブン / 海老天むす" without
// re-joining against the index later.

const SERVING_LABEL: Record<'food' | 'restaurant_menu', string> = {
  food: 'g',
  restaurant_menu: '個',
};

function pick(value: number | null | undefined): number | undefined {
  return value == null || !Number.isFinite(value) ? undefined : value;
}

export function searchIndexToMealLogItem(
  detail: SearchIndexDetail,
  opts: { servingAmount?: number; note?: string | null } = {},
): MealLogItemInput {
  const n = detail.nutrition as SearchIndexNutrition;
  const servingAmount = opts.servingAmount ?? 1;
  const servingUnit = n.servingUnit ?? SERVING_LABEL[detail.sourceType] ?? 'g';
  const displayName =
    detail.brand && detail.sourceType === 'restaurant_menu'
      ? `${detail.brand} / ${detail.nameJa}`
      : detail.nameJa;

  return {
    foodId: null,
    foodName: displayName,
    servingAmount,
    servingUnit,
    calories: n.caloriesPerServing,
    proteinG: n.proteinG,
    fatG: n.fatG,
    carbG: n.carbG,
    fiberG: pick(n.fiberG),
    sodiumMg: pick(n.sodiumMg),
    calciumMg: pick(n.calciumMg),
    ironMg: pick(n.ironMg),
    vitaminAUg: pick(n.vitaminAUg),
    vitaminB1Mg: pick(n.vitaminB1Mg),
    vitaminB2Mg: pick(n.vitaminB2Mg),
    vitaminB6Mg: pick(n.vitaminB6Mg),
    vitaminB12Ug: pick(n.vitaminB12Ug),
    folateUg: pick(n.folateUg),
    vitaminCMg: pick(n.vitaminCMg),
    vitaminDUg: pick(n.vitaminDUg),
    vitaminEMg: pick(n.vitaminEMg),
    potassiumMg: pick(n.potassiumMg),
    magnesiumMg: pick(n.magnesiumMg),
    zincMg: pick(n.zincMg),
    cholesterolMg: pick(n.cholesterolMg),
    saturatedFatG: pick(n.saturatedFatG),
    sugarG: pick(n.sugarG),
    saltG: pick(n.saltG),
    note: opts.note ?? null,
  };
}
