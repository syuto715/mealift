import {
  validateSubmission,
  pfcAtwaterCalories,
  pfcAtwaterDeviation,
  SUBMISSION_BOUNDS,
  PFC_ATWATER_TOLERANCES,
} from '../submissionValidator';
import type { UserSubmittedFoodInput } from '../../../types/userSubmittedFood';

// A baseline well-formed submission. Each test starts from this and
// perturbs the field under test. Numbers chosen so PFC×Atwater closes
// to within ~1% (4*10 + 9*5 + 4*30 = 205 ≈ 200 declared, dev≈2.4%).
function baseInput(overrides: Partial<UserSubmittedFoodInput> = {}): UserSubmittedFoodInput {
  return {
    nameJa: 'テスト食品',
    servingSizeG: 100,
    caloriesPerServing: 200,
    proteinG: 10,
    fatG: 5,
    carbG: 30,
    sourceType: 'package_label',
    ...overrides,
  };
}

describe('pfcAtwaterCalories', () => {
  it('computes 4P + 9F + 4C', () => {
    expect(pfcAtwaterCalories(10, 5, 30)).toBe(4 * 10 + 9 * 5 + 4 * 30);
  });

  it('returns 0 when all macros are 0', () => {
    expect(pfcAtwaterCalories(0, 0, 0)).toBe(0);
  });

  it('returns NaN when any macro is non-finite', () => {
    expect(pfcAtwaterCalories(NaN, 5, 30)).toBeNaN();
    expect(pfcAtwaterCalories(10, Infinity, 30)).toBeNaN();
  });
});

describe('pfcAtwaterDeviation', () => {
  it('returns 0 when atwater equals declared', () => {
    // 4*0 + 9*0 + 4*0 = 0; declared 0; both zero → denom max(0,0,1)=1
    expect(pfcAtwaterDeviation(0, 0, 0, 0)).toBe(0);
  });

  it('returns relative deviation against the larger of declared and atwater', () => {
    // atwater = 4*10 + 9*5 + 4*30 = 205. declared = 220.
    // denom = max(220, 205, 1) = 220. diff = 15. → 15/220 ≈ 0.0682.
    const dev = pfcAtwaterDeviation(10, 5, 30, 220);
    expect(dev).not.toBeNull();
    expect(dev!).toBeCloseTo(15 / 220, 4);
  });

  it('returns null for non-finite declared calories', () => {
    expect(pfcAtwaterDeviation(10, 5, 30, NaN)).toBeNull();
  });

  it('returns null for negative declared calories', () => {
    expect(pfcAtwaterDeviation(10, 5, 30, -10)).toBeNull();
  });
});

describe('validateSubmission — success case', () => {
  it('accepts a baseline well-formed submission with no issues', () => {
    const result = validateSubmission(baseInput());
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

describe('validateSubmission — name', () => {
  it('errors on empty name', () => {
    const r = validateSubmission(baseInput({ nameJa: '' }));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'name_empty')).toBe(true);
  });

  it('errors on whitespace-only name', () => {
    const r = validateSubmission(baseInput({ nameJa: '   ' }));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'name_empty')).toBe(true);
  });

  it('errors when name exceeds nameMaxChars', () => {
    const long = 'a'.repeat(SUBMISSION_BOUNDS.nameMaxChars + 1);
    const r = validateSubmission(baseInput({ nameJa: long }));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'name_too_long')).toBe(true);
  });

  it('accepts a name exactly at nameMaxChars', () => {
    const limit = 'a'.repeat(SUBMISSION_BOUNDS.nameMaxChars);
    const r = validateSubmission(baseInput({ nameJa: limit }));
    expect(r.issues.some((i) => i.code === 'name_too_long')).toBe(false);
  });
});

describe('validateSubmission — serving size', () => {
  it('errors on serving size of 0', () => {
    const r = validateSubmission(baseInput({ servingSizeG: 0 }));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'serving_size_invalid')).toBe(true);
  });

  it('errors on negative serving size', () => {
    const r = validateSubmission(baseInput({ servingSizeG: -10 }));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'serving_size_invalid')).toBe(true);
  });

  it('errors on NaN serving size', () => {
    const r = validateSubmission(baseInput({ servingSizeG: NaN }));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'serving_size_invalid')).toBe(true);
  });

  it('warns (does not error) on serving size above servingMaxG', () => {
    const r = validateSubmission(
      baseInput({
        servingSizeG: SUBMISSION_BOUNDS.servingMaxG + 1,
        // Scale macros so per-100g doesn't trip other warnings.
        caloriesPerServing: 1,
        proteinG: 0,
        fatG: 0,
        carbG: 0,
      }),
    );
    expect(r.issues.some((i) => i.code === 'serving_size_unrealistic')).toBe(true);
    // Warning should not flip ok=false.
    expect(r.issues.find((i) => i.code === 'serving_size_unrealistic')?.severity).toBe('warn');
  });
});

describe('validateSubmission — source type', () => {
  it('errors on unknown source type', () => {
    const r = validateSubmission(
      baseInput({ sourceType: 'invalid' as never }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'source_type_invalid')).toBe(true);
  });

  it.each([
    'package_label',
    'menu_board',
    'official_site',
    'estimation',
    'other',
  ] as const)('accepts %s', (sourceType) => {
    const r = validateSubmission(baseInput({ sourceType }));
    expect(r.issues.some((i) => i.code === 'source_type_invalid')).toBe(false);
  });
});

describe('validateSubmission — macros (hard checks)', () => {
  it('errors on negative calories', () => {
    const r = validateSubmission(baseInput({ caloriesPerServing: -1 }));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'calories_negative')).toBe(true);
  });

  it('errors on NaN calories', () => {
    const r = validateSubmission(baseInput({ caloriesPerServing: NaN }));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'calories_negative')).toBe(true);
  });

  it('errors on negative protein', () => {
    const r = validateSubmission(baseInput({ proteinG: -1 }));
    expect(r.ok).toBe(false);
    expect(
      r.issues.some(
        (i) => i.code === 'macro_negative' && i.field === 'proteinG',
      ),
    ).toBe(true);
  });

  it('errors on negative fat and carb', () => {
    const r = validateSubmission(baseInput({ fatG: -1, carbG: -1 }));
    expect(r.ok).toBe(false);
    const negs = r.issues.filter((i) => i.code === 'macro_negative');
    expect(negs.some((i) => i.field === 'fatG')).toBe(true);
    expect(negs.some((i) => i.field === 'carbG')).toBe(true);
  });
});

describe('validateSubmission — macro plausibility (per 100g)', () => {
  it('warns when calories per 100g exceed cap', () => {
    // 100g serving, 1000 kcal → > 900 cap.
    const r = validateSubmission(
      baseInput({
        servingSizeG: 100,
        caloriesPerServing: 1000,
        // Keep PFC consistent enough to avoid the calorie-mismatch error.
        proteinG: 0,
        fatG: 111,
        carbG: 0,
      }),
    );
    expect(r.issues.some((i) => i.code === 'calories_unrealistic')).toBe(true);
  });

  it('warns when protein per 100g exceeds cap', () => {
    // 50g serving with 60g protein → 120g/100g.
    const r = validateSubmission(
      baseInput({
        servingSizeG: 50,
        caloriesPerServing: 240,
        proteinG: 60,
        fatG: 0,
        carbG: 0,
      }),
    );
    expect(
      r.issues.some(
        (i) => i.code === 'macro_unrealistic' && i.field === 'proteinG',
      ),
    ).toBe(true);
  });

  it('warns when PFC sum per 100g exceeds 120g', () => {
    // 100g serving, P+F+C = 60+30+50 = 140 > 120.
    const r = validateSubmission(
      baseInput({
        servingSizeG: 100,
        // Match Atwater roughly to avoid mismatch errors here.
        caloriesPerServing: 4 * 60 + 9 * 30 + 4 * 50,
        proteinG: 60,
        fatG: 30,
        carbG: 50,
      }),
    );
    expect(r.issues.some((i) => i.code === 'pfc_sum_too_high')).toBe(true);
  });
});

describe('validateSubmission — PFC × Atwater consistency', () => {
  it('warns when deviation is between warnFraction and errorFraction', () => {
    // atwater = 4*10+9*5+4*30 = 205. Want ~12% off, so declared ≈ 233.
    // dev = |205-233|/233 = 28/233 ≈ 0.12.
    const r = validateSubmission(baseInput({ caloriesPerServing: 233 }));
    const issue = r.issues.find((i) => i.code === 'pfc_calorie_mismatch');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warn');
    expect(r.ok).toBe(true);
  });

  it('errors when deviation reaches errorFraction', () => {
    // atwater = 205. Want ≥20% off; declared = 300 → dev = 95/300 ≈ 0.317.
    const r = validateSubmission(baseInput({ caloriesPerServing: 300 }));
    const issue = r.issues.find((i) => i.code === 'pfc_calorie_mismatch');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('error');
    expect(r.ok).toBe(false);
  });

  it('does not flag when deviation is below warnFraction', () => {
    // atwater = 205, declared = 210 → dev ≈ 2.4%, well below warn(10%).
    const r = validateSubmission(baseInput({ caloriesPerServing: 210 }));
    expect(r.issues.some((i) => i.code === 'pfc_calorie_mismatch')).toBe(false);
  });

  it('uses tolerance constants exported for the auto-approval scorer', () => {
    expect(PFC_ATWATER_TOLERANCES.warnFraction).toBe(0.1);
    expect(PFC_ATWATER_TOLERANCES.errorFraction).toBe(0.2);
  });
});

describe('validateSubmission — extended nutrients', () => {
  it('skips nutrient checks when the field is null', () => {
    const r = validateSubmission(baseInput({ sodiumMg: null }));
    expect(r.issues.some((i) => i.code === 'nutrient_unrealistic')).toBe(false);
  });

  it('warns when sodiumMg per 100g exceeds 50000', () => {
    // 100g serving, sodium 60000mg → exceeds 50000 cap.
    const r = validateSubmission(baseInput({ sodiumMg: 60000 }));
    expect(
      r.issues.some(
        (i) => i.code === 'nutrient_unrealistic' && i.field === 'sodiumMg',
      ),
    ).toBe(true);
  });

  it('errors when an extended nutrient is negative', () => {
    const r = validateSubmission(baseInput({ fiberG: -5 }));
    expect(r.ok).toBe(false);
    expect(
      r.issues.some(
        (i) => i.code === 'macro_negative' && i.field === 'fiberG',
      ),
    ).toBe(true);
  });

  it('scales caps by serving size', () => {
    // 50g serving with sodium 30000mg → 60000/100g, exceeds 50000.
    const r = validateSubmission(
      baseInput({
        servingSizeG: 50,
        caloriesPerServing: 100,
        proteinG: 5,
        fatG: 2.5,
        carbG: 15,
        sodiumMg: 30000,
      }),
    );
    expect(
      r.issues.some(
        (i) => i.code === 'nutrient_unrealistic' && i.field === 'sodiumMg',
      ),
    ).toBe(true);
  });

  it('skips per-100g nutrient checks when serving size is invalid', () => {
    const r = validateSubmission(
      baseInput({ servingSizeG: 0, sodiumMg: 99999999 }),
    );
    expect(r.issues.some((i) => i.code === 'nutrient_unrealistic')).toBe(false);
  });
});

describe('validateSubmission — ok flag semantics', () => {
  it('ok=true when only warnings are present', () => {
    // Add a warn-only issue (sodium over cap) on an otherwise-valid input.
    const r = validateSubmission(baseInput({ sodiumMg: 60000 }));
    expect(r.issues.length).toBeGreaterThan(0);
    expect(r.issues.every((i) => i.severity !== 'error')).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('ok=false when any error is present, even alongside warnings', () => {
    const r = validateSubmission(
      baseInput({ nameJa: '', sodiumMg: 60000 }),
    );
    expect(r.ok).toBe(false);
  });
});
