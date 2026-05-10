import { type MealPlan, MEAL_PLAN_OPTIONS } from '../types/profile';
import { FC_RATIOS } from './onboardingCalc';

// v1.3.0 / Onboarding v2 / Phase B-4 — pure helpers for the
// MealPlanCard component.
//
// All label / description / icon / qualitative-PFC / validation logic
// lives here so the component file stays render-only and the boundary
// is jest-testable without RNTL (Build 15+ TODO 12).
//
// Patterns applied:
//   #5  fail-fast on caller misuse — assertMealPlanCardProps throws on
//       empty / duplicate options or non-MealPlan values.
//   #15 readonly literal-union via `as const` — MEAL_PLAN_OPTIONS is
//       re-exported from profile.ts (A-3 deliverable, single source).
//   #18 single source of truth — qualitative PFC hint hand-mapped from
//       UX intent, but cross-checked against FC_RATIOS ordering in tests.
//   #25 pure-helper extraction — the component file owns no logic.
//   #28 __DEV__ assert + production sanitize hybrid.

export { type MealPlan, MEAL_PLAN_OPTIONS };

// === Labels / descriptions / icons ===
//
// Sign-off § Phase B-4 copy pinned. Japanese-only (Mealift JP-market).
// 和食型 carries a "★" suffix to flag it as the Mealift Original
// recommendation against the four orthodox international plans.

const LABELS: Record<MealPlan, string> = {
  balanced: 'バランス型',
  washoku: '和食型 ★',
  high_protein: '高タンパク型',
  low_carb: '低糖質型',
  fasting: 'ファスティング型',
};

const DESCRIPTIONS: Record<MealPlan, string> = {
  balanced: 'P/F/C をバランス良く。迷ったらこれ',
  washoku: 'ご飯と魚中心。日本人の体質に合った定番',
  high_protein: '筋肉維持を最優先。トレーニーの王道',
  low_carb: '糖質を抑えて脂質中心。ケトジェニック寄り',
  fasting: '食事の間隔を空けて代謝をリセット',
};

const ICONS: Record<MealPlan, string> = {
  balanced: '⚖️',
  washoku: '🍱',
  high_protein: '💪',
  low_carb: '🥗',
  fasting: '⏱️',
};

export function getMealPlanLabel(plan: MealPlan): string {
  return LABELS[plan];
}

export function getMealPlanDescription(plan: MealPlan): string {
  return DESCRIPTIONS[plan];
}

export function getMealPlanIcon(plan: MealPlan): string {
  return ICONS[plan];
}

// === getMealPlanPFCHint ===
//
// Qualitative hint badges shown on the right edge of each card.
// Sign-off § Phase B-4 §1 mapping pinned (UX-intent oriented):
//   balanced     P:mid F:mid C:mid
//   washoku      P:mid F:low C:high
//   high_protein P:high F:mid C:low
//   low_carb     P:high F:high C:low
//   fasting      P:mid F:mid C:mid
//
// The mapping doesn't strictly derive from FC_RATIOS thresholds
// because the Protein column is owned by the proteinFactor screen
// (Phase B-5), and "balanced" should *feel* mid/mid/mid even though
// FC_RATIOS.balanced.carbs = 0.7 is numerically high. The cross-check
// test in __tests__/mealPlanUtils.test.ts pins the *ordering* against
// FC_RATIOS so any future ratio retune surfaces a hint mismatch.

export type PFCLevel = 'low' | 'mid' | 'high';
export interface PFCHint {
  protein: PFCLevel;
  fat: PFCLevel;
  carb: PFCLevel;
}

const PFC_HINTS: Record<MealPlan, PFCHint> = {
  balanced: { protein: 'mid', fat: 'mid', carb: 'mid' },
  washoku: { protein: 'mid', fat: 'low', carb: 'high' },
  high_protein: { protein: 'high', fat: 'mid', carb: 'low' },
  low_carb: { protein: 'high', fat: 'high', carb: 'low' },
  fasting: { protein: 'mid', fat: 'mid', carb: 'mid' },
};

export function getMealPlanPFCHint(plan: MealPlan): PFCHint {
  return PFC_HINTS[plan];
}

// === isValidMealPlan ===
//
// Type predicate — narrows `string` to `MealPlan` so callers reading
// raw DB / form input can branch safely without `as MealPlan` casts.

export function isValidMealPlan(value: string): value is MealPlan {
  return (MEAL_PLAN_OPTIONS as readonly string[]).includes(value);
}

// === assertMealPlanCardProps + sanitizeMealPlanCardProps ===
//
// Pattern 28 hybrid: __DEV__ throws to surface caller misuse early;
// production sanitizes to keep the user-facing flow alive.

export interface MealPlanCardPropsCore {
  value: MealPlan | null;
  options: readonly MealPlan[];
}

export function assertMealPlanCardProps(input: MealPlanCardPropsCore): void {
  if (input.options.length === 0) {
    throw new Error('MealPlanCard: options must not be empty');
  }
  const seen = new Set<MealPlan>();
  for (const v of input.options) {
    if (!isValidMealPlan(v)) {
      throw new Error(
        `MealPlanCard: option ${String(v)} is not a valid MealPlan`,
      );
    }
    if (seen.has(v)) {
      throw new Error(
        `MealPlanCard: duplicate option ${v} in options array`,
      );
    }
    seen.add(v);
  }
  if (input.value !== null && !input.options.includes(input.value)) {
    throw new Error(
      `MealPlanCard: value ${input.value} is not in options [${input.options.join(', ')}]`,
    );
  }
}

// Production-safe sanitization — degrade gracefully rather than
// crashing. Returns a normalized props core that the component can
// render against:
//   - empty / no-valid options → MEAL_PLAN_OPTIONS
//   - invalid options dropped via filter
//   - duplicates deduped via Set construction
//   - value not in (sanitized) options → null (unselected)
export function sanitizeMealPlanCardProps(
  input: MealPlanCardPropsCore,
): MealPlanCardPropsCore {
  const dedupedOptions = Array.from(
    new Set(input.options.filter((v): v is MealPlan => isValidMealPlan(v))),
  );
  const safeOptions: readonly MealPlan[] =
    dedupedOptions.length > 0 ? dedupedOptions : MEAL_PLAN_OPTIONS;

  const safeValue =
    input.value !== null && safeOptions.includes(input.value)
      ? input.value
      : null;

  return {
    value: safeValue,
    options: safeOptions,
  };
}

// === FC_RATIOS re-export passthrough for tests ===
//
// Tests in __tests__/mealPlanUtils.test.ts cross-check that the
// qualitative carb/fat hints don't contradict the FC_RATIOS ordering
// (e.g., washoku.fat=0.20 < low_carb.fat=0.65 implies hint.fat 'low' <
// 'high'). Re-exporting here keeps the test surface entirely on
// mealPlanUtils so the test file's import block stays focused.
export { FC_RATIOS };
