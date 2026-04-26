import {
  FDC_NUTRIENT_IDS,
  convertServingToGrams,
  filterFdcFoodForImport,
  lookupBrandJa,
  mapFdcFoodToImportedRow,
  mapFdcFoodsToImportedRows,
  type FdcFoodRecord,
} from '../adapters/usda-fdc';

// ---- Fixtures ---------------------------------------------------------

// Branded protein bar: 60g serving, 20g protein, complete macros.
const proteinBar: FdcFoodRecord = {
  fdcId: 1000001,
  dataType: 'Branded',
  description: 'PROTEIN BAR, CHOCOLATE PEANUT BUTTER',
  brandOwner: 'Quest Nutrition',
  brandName: 'Quest Bar',
  brandedFoodCategory: 'Snacks',
  servingSize: 60,
  servingSizeUnit: 'g',
  householdServingFullText: '1 BAR (60g)',
  marketCountry: 'United States',
  publicationDate: '2024-01-15',
  foodNutrients: [
    { nutrient: { id: FDC_NUTRIENT_IDS.energyKcal }, amount: 333.33 }, // 200 kcal/serving when scaled
    { nutrient: { id: FDC_NUTRIENT_IDS.proteinG }, amount: 33.33 }, // 20g/serving
    { nutrient: { id: FDC_NUTRIENT_IDS.fatG }, amount: 11.67 }, // 7g/serving
    { nutrient: { id: FDC_NUTRIENT_IDS.carbG }, amount: 36.67 }, // 22g/serving
    { nutrient: { id: FDC_NUTRIENT_IDS.fiberG }, amount: 23.33 },
    { nutrient: { id: FDC_NUTRIENT_IDS.sugarsG }, amount: 1.67 },
    { nutrient: { id: FDC_NUTRIENT_IDS.sodiumMg }, amount: 333 }, // 200 mg/serving
  ],
};

// Foundation row: per-100g, no servingSize → defaults to 100g.
const skinlessChicken: FdcFoodRecord = {
  fdcId: 1000002,
  dataType: 'Foundation',
  description: 'CHICKEN, BREAST, SKINLESS, RAW',
  foodNutrients: [
    { nutrient: { id: FDC_NUTRIENT_IDS.energyKcal }, amount: 120 },
    { nutrient: { id: FDC_NUTRIENT_IDS.proteinG }, amount: 22.5 },
    { nutrient: { id: FDC_NUTRIENT_IDS.fatG }, amount: 2.6 },
    { nutrient: { id: FDC_NUTRIENT_IDS.carbG }, amount: 0 },
  ],
};

// Low-protein record (cookie): should be filtered out by min-protein default.
const cookie: FdcFoodRecord = {
  fdcId: 1000003,
  dataType: 'Branded',
  description: 'CHOCOLATE CHIP COOKIE',
  brandOwner: 'Generic Cookie Co',
  servingSize: 30,
  servingSizeUnit: 'g',
  foodNutrients: [
    { nutrient: { id: FDC_NUTRIENT_IDS.energyKcal }, amount: 480 },
    { nutrient: { id: FDC_NUTRIENT_IDS.proteinG }, amount: 5 }, // 1.5g/serving — too low
    { nutrient: { id: FDC_NUTRIENT_IDS.fatG }, amount: 25 },
    { nutrient: { id: FDC_NUTRIENT_IDS.carbG }, amount: 60 },
  ],
};

// Missing macros: should not map.
const incompleteRow: FdcFoodRecord = {
  fdcId: 1000004,
  dataType: 'Branded',
  description: 'MYSTERY POWDER',
  brandOwner: 'Unknown',
  foodNutrients: [
    { nutrient: { id: FDC_NUTRIENT_IDS.proteinG }, amount: 80 },
    // no fat, carb, or kcal
  ],
};

// Energy in kJ only (no kcal): adapter should fall back to kJ→kcal.
const kjOnly: FdcFoodRecord = {
  fdcId: 1000005,
  dataType: 'Foundation',
  description: 'WHEY PROTEIN ISOLATE',
  servingSize: 30,
  servingSizeUnit: 'g',
  foodNutrients: [
    { nutrient: { id: FDC_NUTRIENT_IDS.energyKj }, amount: 1673.6 }, // 400 kcal/100g
    { nutrient: { id: FDC_NUTRIENT_IDS.proteinG }, amount: 90 },
    { nutrient: { id: FDC_NUTRIENT_IDS.fatG }, amount: 1 },
    { nutrient: { id: FDC_NUTRIENT_IDS.carbG }, amount: 5 },
  ],
};

// Older-format nutrient shape: top-level nutrientId rather than nutrient.id.
const oldFormat: FdcFoodRecord = {
  fdcId: 1000006,
  dataType: 'SR Legacy',
  description: 'EGG, WHOLE, RAW, FRESH',
  foodNutrients: [
    { nutrientId: FDC_NUTRIENT_IDS.energyKcal, amount: 143 },
    { nutrientId: FDC_NUTRIENT_IDS.proteinG, amount: 12.6 },
    { nutrientId: FDC_NUTRIENT_IDS.fatG, amount: 9.5 },
    { nutrientId: FDC_NUTRIENT_IDS.carbG, amount: 0.7 },
  ],
};

// ---- convertServingToGrams ----

describe('convertServingToGrams', () => {
  it('passes grams through', () => {
    expect(convertServingToGrams(60, 'g')).toBe(60);
    expect(convertServingToGrams(60, 'GRAMS')).toBe(60);
  });

  it('converts ounces to grams', () => {
    expect(convertServingToGrams(1, 'oz')).toBeCloseTo(28.3495, 4);
    expect(convertServingToGrams(8, 'OUNCE')).toBeCloseTo(226.796, 2);
  });

  it('converts pounds to grams', () => {
    expect(convertServingToGrams(1, 'lb')).toBeCloseTo(453.592, 3);
  });

  it('converts mg / kg', () => {
    expect(convertServingToGrams(1000, 'mg')).toBe(1);
    expect(convertServingToGrams(1.5, 'kg')).toBe(1500);
  });

  it('treats ml as ~grams (RTD assumption)', () => {
    expect(convertServingToGrams(250, 'ml')).toBe(250);
  });

  it('returns null for unknown / invalid units', () => {
    expect(convertServingToGrams(1, 'cup')).toBeNull();
    expect(convertServingToGrams(1, undefined)).toBeNull();
    expect(convertServingToGrams(0, 'g')).toBeNull();
    expect(convertServingToGrams(-5, 'g')).toBeNull();
    expect(convertServingToGrams(NaN, 'g')).toBeNull();
  });
});

// ---- lookupBrandJa ----

describe('lookupBrandJa', () => {
  const map = {
    'Optimum Nutrition': 'オプティマムニュートリション',
    Myprotein: 'マイプロテイン',
  };

  it('finds an exact-case match', () => {
    expect(lookupBrandJa('Optimum Nutrition', map)).toBe('オプティマムニュートリション');
  });

  it('matches case-insensitively', () => {
    expect(lookupBrandJa('OPTIMUM NUTRITION', map)).toBe('オプティマムニュートリション');
    expect(lookupBrandJa('myprotein', map)).toBe('マイプロテイン');
  });

  it('returns null for unknown brands', () => {
    expect(lookupBrandJa('Unknown Brand', map)).toBeNull();
  });

  it('returns null when brand or map is empty', () => {
    expect(lookupBrandJa(null, map)).toBeNull();
    expect(lookupBrandJa('Optimum Nutrition', undefined)).toBeNull();
    expect(lookupBrandJa('', map)).toBeNull();
  });
});

// ---- filterFdcFoodForImport ----

describe('filterFdcFoodForImport', () => {
  it('keeps protein-rich records by default', () => {
    expect(filterFdcFoodForImport(proteinBar)).toBe(true);
  });

  it('drops low-protein records under the default 15g/100g threshold', () => {
    expect(filterFdcFoodForImport(cookie)).toBe(false);
  });

  it('drops records missing required macros', () => {
    expect(filterFdcFoodForImport(incompleteRow)).toBe(false);
  });

  it('respects an explicit min-protein override', () => {
    // Cookie has 5g/100g — keep it when threshold drops to 0
    expect(filterFdcFoodForImport(cookie, { minProteinPer100g: 0 })).toBe(true);
  });

  it('enforces brand allowlist when supplied', () => {
    expect(
      filterFdcFoodForImport(proteinBar, { brandAllowlist: ['Quest Nutrition'] }),
    ).toBe(true);
    expect(
      filterFdcFoodForImport(proteinBar, { brandAllowlist: ['Optimum Nutrition'] }),
    ).toBe(false);
  });

  it('enforces dataType allowlist when supplied', () => {
    expect(
      filterFdcFoodForImport(proteinBar, { allowedDataTypes: ['Branded'] }),
    ).toBe(true);
    expect(
      filterFdcFoodForImport(proteinBar, { allowedDataTypes: ['Foundation'] }),
    ).toBe(false);
  });
});

// ---- mapFdcFoodToImportedRow ----

describe('mapFdcFoodToImportedRow', () => {
  const opts = {
    capturedAt: '2026-04-26',
    brandI18n: { 'Quest Nutrition': 'クエストニュートリション' },
  };

  it('maps a Branded record per-serving with i18n brand', () => {
    const row = mapFdcFoodToImportedRow(proteinBar, opts);
    expect(row).not.toBeNull();
    expect(row!.servingG).toBe(60);
    expect(row!.brand).toBe('クエストニュートリション');
    expect(row!.proteinG).toBeCloseTo(20, 0);
    expect(row!.caloriesKcal).toBeCloseTo(200, 0);
    expect(row!.sodiumMg).toBeCloseTo(200, 0);
    expect(row!.sourceLicense).toBe('cc0-usda-fdc');
    expect(row!.capturedAt).toBe('2026-04-26');
    expect(row!.servingDescription).toBe('1 BAR (60g)');
  });

  it('falls back to per-100g when servingSize is absent (Foundation)', () => {
    const row = mapFdcFoodToImportedRow(skinlessChicken, opts);
    expect(row).not.toBeNull();
    expect(row!.servingG).toBe(100);
    expect(row!.proteinG).toBeCloseTo(22.5, 1);
    expect(row!.caloriesKcal).toBeCloseTo(120, 0);
  });

  it('keeps the original brand string when no i18n entry exists', () => {
    const row = mapFdcFoodToImportedRow(proteinBar, {
      capturedAt: '2026-04-26',
      brandI18n: {},
    });
    expect(row!.brand).toBe('Quest Nutrition');
  });

  it('returns null when required macros are missing', () => {
    expect(mapFdcFoodToImportedRow(incompleteRow, opts)).toBeNull();
  });

  it('falls back to kJ when kcal is absent', () => {
    const row = mapFdcFoodToImportedRow(kjOnly, opts);
    expect(row).not.toBeNull();
    // 1673.6 kJ/100g ÷ 4.184 = 400 kcal/100g; serving 30g → 120 kcal
    expect(row!.caloriesKcal).toBeCloseTo(120, 0);
  });

  it('reads nutrients from the older nutrientId-on-top shape', () => {
    const row = mapFdcFoodToImportedRow(oldFormat, opts);
    expect(row).not.toBeNull();
    expect(row!.proteinG).toBeCloseTo(12.6, 1);
    expect(row!.caloriesKcal).toBeCloseTo(143, 0);
  });

  it('leaves saltG null (FDC reports sodium, not salt)', () => {
    const row = mapFdcFoodToImportedRow(proteinBar, opts);
    expect(row!.saltG).toBeNull();
    expect(row!.sodiumMg).not.toBeNull();
  });

  it('builds a meaningful sourceUrl from fdcId', () => {
    const row = mapFdcFoodToImportedRow(proteinBar, opts);
    expect(row!.sourceUrl).toContain('1000001');
    expect(row!.sourceUrl).toMatch(/^https:\/\/fdc\.nal\.usda\.gov/);
  });

  it('returns null when description is empty', () => {
    const empty: FdcFoodRecord = { ...proteinBar, description: '' };
    expect(mapFdcFoodToImportedRow(empty, opts)).toBeNull();
  });
});

// ---- mapFdcFoodsToImportedRows ----

describe('mapFdcFoodsToImportedRows', () => {
  it('drops filtered + unmappable records and counts them as skipped', () => {
    const records = [proteinBar, cookie, incompleteRow, skinlessChicken];
    const out = mapFdcFoodsToImportedRows(
      records,
      { capturedAt: '2026-04-26' },
      { minProteinPer100g: 15, requireFullMacros: true },
    );
    // Filter min-protein 15g/100g → only proteinBar (33.3) and chicken (22.5) pass.
    expect(out.rows).toHaveLength(2);
    expect(out.skipped).toBe(2);
  });

  it('honors disabling the protein floor', () => {
    const records = [proteinBar, cookie, skinlessChicken];
    const out = mapFdcFoodsToImportedRows(
      records,
      { capturedAt: '2026-04-26' },
      { minProteinPer100g: 0, requireFullMacros: true },
    );
    expect(out.rows).toHaveLength(3);
  });
});
