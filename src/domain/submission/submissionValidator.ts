import type {
  UserSubmittedFoodInput,
  FoodSourceType,
  FoodCategory,
} from '../../types/userSubmittedFood';

// submissionValidator — pure sanity checks for a UserSubmittedFoodInput
// before it lands in the local user_submitted_foods table or syncs to
// public_foods.
//
// Contract:
//   - No DB access. Caller fetches reference data (e.g. submitter
//     history) and feeds it to the auto-approval scorer separately.
//   - No mutation. Returns structured issues so callers can decide
//     how to surface them (errors block submit, warnings can render
//     as "looks unusual — are you sure?" prompts).
//   - Two severities:
//       'error' — submission must be blocked. Hard rules: missing
//         name, negative calories, serving size <= 0, etc.
//       'warn'  — submission is plausible but suspicious. Soft rules
//         like "calories deviate >10% from PFC×Atwater", "sodium
//         exceeds soy-sauce levels per 100g". Auto-approval scoring
//         consumes these to decide review priority.
//
// Why the validator is its own thing (not a reuse of
// validateRecipeIngredient): the recipe path validates *amounts*
// against *known canonical foods*. Submissions validate *user-typed
// nutrition values* against *plausibility ranges*. The two share no
// rules.

export type SubmissionIssueCode =
  // Identity
  | 'name_empty'
  | 'name_too_long'
  // Serving
  | 'serving_size_invalid'
  | 'serving_size_unrealistic'
  // Macros — hard
  | 'calories_negative'
  | 'macro_negative'
  // Macros — plausibility
  | 'calories_unrealistic'
  | 'macro_unrealistic'
  | 'pfc_sum_too_high'
  | 'pfc_calorie_mismatch'
  // Source metadata
  | 'source_type_invalid'
  | 'food_category_invalid'
  // Category-driven required fields (Part 2)
  | 'brand_required_for_category'
  | 'barcode_required_for_category'
  // Extended nutrients
  | 'nutrient_unrealistic';

export type SubmissionIssueSeverity = 'error' | 'warn';

export interface SubmissionIssue {
  code: SubmissionIssueCode;
  severity: SubmissionIssueSeverity;
  // The input field (camelCase) the issue is anchored to. Null when
  // the issue spans multiple fields (e.g. PFC mismatch).
  field: keyof UserSubmittedFoodInput | null;
  message: string;
}

export interface SubmissionValidation {
  // True iff no `error`-severity issues. `warn` issues do not block.
  ok: boolean;
  issues: SubmissionIssue[];
}

// ---------------------------------------------------------------------------
// Bounds and tolerances. These are constants because the auto-approval
// scorer (commit 2) reads them too — keeping a single source of truth
// avoids drift.
// ---------------------------------------------------------------------------

export const SUBMISSION_BOUNDS = {
  // Per 100g.
  caloriesMaxPer100g: 900, // pure fat ≈ 900 kcal/100g
  // Per 100g — pure forms of each macro.
  proteinMaxPer100g: 100,
  fatMaxPer100g: 100,
  carbMaxPer100g: 100,
  // P+F+C sum cap. Some hydration/ash slop is allowed.
  pfcSumMaxPer100g: 120,
  // Serving size sanity.
  servingMinG: 0.1,
  servingMaxG: 10000, // 10kg per serving is already absurd
  // Name length cap matches public_foods.name_ja column convention.
  nameMaxChars: 200,
} as const;

// PFC × Atwater vs declared calories: how far off before we warn / fail.
// Real packaged labels are typically within 5%; aggressive rounding
// (1g grain) plus alcohol / sugar-alcohols / fiber bioavailability
// can push to ~10% on edge foods. >20% is almost always a typo.
export const PFC_ATWATER_TOLERANCES = {
  warnFraction: 0.10,
  errorFraction: 0.20,
} as const;

// Per-nutrient plausibility caps per 100g. Sources picked at the high
// end of real foods so we only flag clearly-wrong entries:
//   - sodiumMg: soy sauce ≈ 5700, salt ≈ 38758 → cap at 50000
//   - sugarG: pure sugar ≈ 100
//   - saltG: pure salt ≈ 100
//   - saturatedFatG: butter ≈ 51 → cap at 100
//   - cholesterolMg: egg yolk ≈ 1085 → cap at 3000
//   - fiberG: dried wheat bran ≈ 43 → cap at 100 (supplements push high)
//   - calcium/iron/etc. capped at supplement-tier upper bounds
const PER_100G_NUTRIENT_CAPS: Partial<
  Record<keyof UserSubmittedFoodInput, number>
> = {
  fiberG: 100,
  sugarG: 100,
  saltG: 100,
  sodiumMg: 50000,
  saturatedFatG: 100,
  cholesterolMg: 3000,
  calciumMg: 5000,
  ironMg: 200,
  vitaminAUg: 100000,
  vitaminB1Mg: 500,
  vitaminB2Mg: 500,
  vitaminCMg: 5000,
  vitaminDUg: 1000,
  vitaminEMg: 1000,
  potassiumMg: 10000,
  magnesiumMg: 5000,
  zincMg: 500,
};

const VALID_SOURCE_TYPES: ReadonlySet<FoodSourceType> = new Set([
  'package_label',
  'menu_board',
  'official_site',
  'estimation',
  'other',
]);

const VALID_FOOD_CATEGORIES: ReadonlySet<FoodCategory> = new Set([
  'home_cooking',
  'restaurant',
  'convenience_store',
  'packaged_food',
  'beverage',
  'supplement',
  'other',
]);

// Per-category required-field rules. The form mirrors these for
// visibility (hidden fields are not rendered), but the validator is
// the source of truth at submit time so that a hidden-but-pre-filled
// value gets ignored cleanly when it doesn't apply.
//
// Rationale per category — see Part 2 design doc:
//   home_cooking      — homemade food has neither brand nor barcode
//   restaurant        — venue name is required; menu items have no SKU
//   convenience_store — full SKU products: brand + barcode
//   packaged_food     — same as conveni for retail packages
//   beverage          — spans branded (Coca-Cola) and generic (麦茶)
//   supplement        — brand-driven identity; some imports lack JP
//                       barcodes, so barcode stays optional
//   other             — catch-all, no constraints
export const CATEGORY_RULES: Record<
  FoodCategory,
  { brandRequired: boolean; barcodeRequired: boolean }
> = {
  home_cooking:      { brandRequired: false, barcodeRequired: false },
  restaurant:        { brandRequired: true,  barcodeRequired: false },
  convenience_store: { brandRequired: true,  barcodeRequired: true  },
  packaged_food:     { brandRequired: true,  barcodeRequired: true  },
  beverage:          { brandRequired: false, barcodeRequired: false },
  supplement:        { brandRequired: true,  barcodeRequired: false },
  other:             { brandRequired: false, barcodeRequired: false },
};

// ---------------------------------------------------------------------------
// Helpers — exposed for the auto-approval scorer in commit 2.
// ---------------------------------------------------------------------------

// Atwater-factor calorie estimate from PFC grams: 4 P + 9 F + 4 C.
// Returns NaN if any input is non-finite.
export function pfcAtwaterCalories(
  proteinG: number,
  fatG: number,
  carbG: number,
): number {
  if (
    !Number.isFinite(proteinG) ||
    !Number.isFinite(fatG) ||
    !Number.isFinite(carbG)
  ) {
    return NaN;
  }
  return 4 * proteinG + 9 * fatG + 4 * carbG;
}

// Relative deviation between Atwater-derived calories and the user's
// declared calories. Returns 0 when both are 0; returns null when a
// reasonable deviation cannot be computed (declared is non-finite).
export function pfcAtwaterDeviation(
  proteinG: number,
  fatG: number,
  carbG: number,
  declaredCalories: number,
): number | null {
  if (!Number.isFinite(declaredCalories) || declaredCalories < 0) return null;
  const atwater = pfcAtwaterCalories(proteinG, fatG, carbG);
  if (!Number.isFinite(atwater)) return null;
  const denom = Math.max(declaredCalories, atwater, 1);
  return Math.abs(atwater - declaredCalories) / denom;
}

// ---------------------------------------------------------------------------
// validateSubmission — the entry point.
// ---------------------------------------------------------------------------

export function validateSubmission(
  input: UserSubmittedFoodInput,
): SubmissionValidation {
  const issues: SubmissionIssue[] = [];

  // Name --------------------------------------------------------------------
  const name = (input.nameJa ?? '').trim();
  if (name.length === 0) {
    issues.push({
      code: 'name_empty',
      severity: 'error',
      field: 'nameJa',
      message: '料理名は必須です',
    });
  } else if (name.length > SUBMISSION_BOUNDS.nameMaxChars) {
    issues.push({
      code: 'name_too_long',
      severity: 'error',
      field: 'nameJa',
      message: `料理名は${SUBMISSION_BOUNDS.nameMaxChars}文字以内にしてください`,
    });
  }

  // Serving size ------------------------------------------------------------
  const servingG = input.servingSizeG;
  let servingValid = false;
  if (!Number.isFinite(servingG) || servingG < SUBMISSION_BOUNDS.servingMinG) {
    issues.push({
      code: 'serving_size_invalid',
      severity: 'error',
      field: 'servingSizeG',
      message: '1食分の量は0より大きくしてください',
    });
  } else if (servingG > SUBMISSION_BOUNDS.servingMaxG) {
    issues.push({
      code: 'serving_size_unrealistic',
      severity: 'warn',
      field: 'servingSizeG',
      message: `1食分の量が大きすぎます（${SUBMISSION_BOUNDS.servingMaxG}g以内）`,
    });
    servingValid = true;
  } else {
    servingValid = true;
  }

  // Source type -------------------------------------------------------------
  if (!VALID_SOURCE_TYPES.has(input.sourceType)) {
    issues.push({
      code: 'source_type_invalid',
      severity: 'error',
      field: 'sourceType',
      message: `情報源が不正です: ${String(input.sourceType)}`,
    });
  }

  // Food category -----------------------------------------------------------
  if (!VALID_FOOD_CATEGORIES.has(input.foodCategory)) {
    issues.push({
      code: 'food_category_invalid',
      severity: 'error',
      field: 'foodCategory',
      message: `食品カテゴリが不正です: ${String(input.foodCategory)}`,
    });
  } else {
    // Category-driven required fields. Only enforced when the category
    // itself is valid — an unknown category already fails above and
    // we don't double-report.
    const rules = CATEGORY_RULES[input.foodCategory];
    const brand = (input.brand ?? '').trim();
    if (rules.brandRequired && brand.length === 0) {
      issues.push({
        code: 'brand_required_for_category',
        severity: 'error',
        field: 'brand',
        message:
          input.foodCategory === 'restaurant'
            ? '店舗名は必須です'
            : 'ブランド名は必須です',
      });
    }
    const barcode = (input.barcode ?? '').trim();
    if (rules.barcodeRequired && barcode.length === 0) {
      issues.push({
        code: 'barcode_required_for_category',
        severity: 'error',
        field: 'barcode',
        message: 'バーコードは必須です',
      });
    }
  }

  // Macros — hard checks ----------------------------------------------------
  const cal = input.caloriesPerServing;
  const p = input.proteinG;
  const f = input.fatG;
  const c = input.carbG;

  if (!Number.isFinite(cal) || cal < 0) {
    issues.push({
      code: 'calories_negative',
      severity: 'error',
      field: 'caloriesPerServing',
      message: 'カロリーは0以上の数値で入力してください',
    });
  }
  for (const [key, val] of [
    ['proteinG', p],
    ['fatG', f],
    ['carbG', c],
  ] as const) {
    if (!Number.isFinite(val) || val < 0) {
      issues.push({
        code: 'macro_negative',
        severity: 'error',
        field: key,
        message: `${key}は0以上の数値で入力してください`,
      });
    }
  }

  // Macros — plausibility (only if servingValid AND macros are finite) -----
  if (
    servingValid &&
    Number.isFinite(cal) &&
    cal >= 0 &&
    Number.isFinite(p) &&
    p >= 0 &&
    Number.isFinite(f) &&
    f >= 0 &&
    Number.isFinite(c) &&
    c >= 0
  ) {
    const factor = 100 / servingG; // per-100g scaler
    const calPer100 = cal * factor;
    const pPer100 = p * factor;
    const fPer100 = f * factor;
    const cPer100 = c * factor;

    if (calPer100 > SUBMISSION_BOUNDS.caloriesMaxPer100g) {
      issues.push({
        code: 'calories_unrealistic',
        severity: 'warn',
        field: 'caloriesPerServing',
        message: `100gあたり${Math.round(calPer100)}kcalは異常に高い値です`,
      });
    }
    if (pPer100 > SUBMISSION_BOUNDS.proteinMaxPer100g) {
      issues.push({
        code: 'macro_unrealistic',
        severity: 'warn',
        field: 'proteinG',
        message: `100gあたりタンパク質${Math.round(pPer100)}gは過大です`,
      });
    }
    if (fPer100 > SUBMISSION_BOUNDS.fatMaxPer100g) {
      issues.push({
        code: 'macro_unrealistic',
        severity: 'warn',
        field: 'fatG',
        message: `100gあたり脂質${Math.round(fPer100)}gは過大です`,
      });
    }
    if (cPer100 > SUBMISSION_BOUNDS.carbMaxPer100g) {
      issues.push({
        code: 'macro_unrealistic',
        severity: 'warn',
        field: 'carbG',
        message: `100gあたり炭水化物${Math.round(cPer100)}gは過大です`,
      });
    }
    const sumPer100 = pPer100 + fPer100 + cPer100;
    if (sumPer100 > SUBMISSION_BOUNDS.pfcSumMaxPer100g) {
      issues.push({
        code: 'pfc_sum_too_high',
        severity: 'warn',
        field: null,
        message: `100gあたりPFC合計${Math.round(sumPer100)}gは100gを大きく超えています`,
      });
    }

    // PFC × Atwater vs declared calories.
    const dev = pfcAtwaterDeviation(p, f, c, cal);
    if (dev !== null) {
      if (dev >= PFC_ATWATER_TOLERANCES.errorFraction) {
        issues.push({
          code: 'pfc_calorie_mismatch',
          severity: 'error',
          field: null,
          message: `カロリーとPFCの整合性が取れていません（誤差${Math.round(
            dev * 100,
          )}%）`,
        });
      } else if (dev >= PFC_ATWATER_TOLERANCES.warnFraction) {
        issues.push({
          code: 'pfc_calorie_mismatch',
          severity: 'warn',
          field: null,
          message: `カロリーとPFCの整合性が低めです（誤差${Math.round(
            dev * 100,
          )}%）`,
        });
      }
    }
  }

  // Extended nutrients ------------------------------------------------------
  if (servingValid) {
    const factor = 100 / servingG;
    for (const [key, cap] of Object.entries(PER_100G_NUTRIENT_CAPS) as Array<
      [keyof UserSubmittedFoodInput, number]
    >) {
      const raw = input[key];
      if (raw == null) continue;
      const v = raw as number;
      if (!Number.isFinite(v)) continue;
      if (v < 0) {
        issues.push({
          code: 'macro_negative',
          severity: 'error',
          field: key,
          message: `${key}は0以上の数値で入力してください`,
        });
        continue;
      }
      const per100 = v * factor;
      if (per100 > cap) {
        issues.push({
          code: 'nutrient_unrealistic',
          severity: 'warn',
          field: key,
          message: `100gあたり${key}=${Math.round(per100)}は許容範囲を超えています`,
        });
      }
    }
  }

  const ok = issues.every((i) => i.severity !== 'error');
  return { ok, issues };
}
