import {
  parseNutritionLabel,
  normalizeOcrText,
} from '../nutritionLabelParser';

// Tests against hand-crafted text fixtures. Real OCR output from
// production builds will surface failure modes these synthetic
// fixtures don't cover — accuracy verification is deferred to the
// 5/1+ build cycle. What this suite locks down:
//   - Per-basis detection across the common JP forms
//   - Label aliasing (たんぱく質 / タンパク質 / 蛋白質)
//   - kJ → kcal conversion + warning
//   - 飽和脂肪酸 doesn't get picked up as 脂質
//   - Sodium-only labels leave saltG null but populate sodiumMg
//   - Full-width digit normalization
//   - Graceful partial extraction (one nutrient missing doesn't
//     null out the others)

describe('normalizeOcrText', () => {
  it('converts full-width digits', () => {
    expect(normalizeOcrText('１２３')).toBe('123');
  });

  it('converts full-width period and comma', () => {
    expect(normalizeOcrText('１．５')).toBe('1.5');
    expect(normalizeOcrText('１，２')).toBe('1,2');
  });

  it('returns empty for empty input', () => {
    expect(normalizeOcrText('')).toBe('');
  });
});

describe('parseNutritionLabel — per-basis detection', () => {
  it('detects 100gあたり', () => {
    const result = parseNutritionLabel('栄養成分表示（100gあたり）');
    expect(result.perBasis).toBe('per_100g');
    expect(result.perBasisRaw).toContain('100g');
  });

  it('detects 100g当たり (kanji)', () => {
    const result = parseNutritionLabel('100g当たり');
    expect(result.perBasis).toBe('per_100g');
  });

  it('detects (100g)', () => {
    const result = parseNutritionLabel('栄養成分(100g)');
    expect(result.perBasis).toBe('per_100g');
  });

  it('detects 1食あたり', () => {
    const result = parseNutritionLabel('1食あたり');
    expect(result.perBasis).toBe('per_serving');
  });

  it('detects 1袋あたり', () => {
    const result = parseNutritionLabel('1袋あたり');
    expect(result.perBasis).toBe('per_serving');
  });

  it('detects 1本あたり', () => {
    const result = parseNutritionLabel('1本あたり');
    expect(result.perBasis).toBe('per_serving');
  });

  it('returns unknown when no per-basis indicator', () => {
    const result = parseNutritionLabel('エネルギー 200 kcal');
    expect(result.perBasis).toBe('unknown');
    expect(result.warnings).toContain('per_basis_unknown');
  });
});

describe('parseNutritionLabel — calorie extraction', () => {
  it('extracts kcal from エネルギー', () => {
    const result = parseNutritionLabel('エネルギー 180 kcal');
    expect(result.calories).toBe(180);
  });

  it('extracts kcal from 熱量', () => {
    const result = parseNutritionLabel('熱量 250 kcal');
    expect(result.calories).toBe(250);
  });

  it('extracts kcal from カロリー', () => {
    const result = parseNutritionLabel('カロリー 100 kcal');
    expect(result.calories).toBe(100);
  });

  it('converts kJ to kcal and emits warning', () => {
    // 836 kJ ≈ 199.8 kcal
    const result = parseNutritionLabel('エネルギー 836 kJ');
    expect(result.calories).not.toBeNull();
    expect(result.calories!).toBeCloseTo(199.8, 0);
    expect(result.warnings).toContain('calories_converted_from_kj');
  });

  it('prefers kcal over kJ when both are present', () => {
    const result = parseNutritionLabel(
      'エネルギー 200 kcal\nエネルギー 836 kJ',
    );
    expect(result.calories).toBe(200);
    expect(result.warnings).not.toContain('calories_converted_from_kj');
  });

  it('returns null when no calories found', () => {
    const result = parseNutritionLabel('たんぱく質 12 g');
    expect(result.calories).toBeNull();
  });
});

describe('parseNutritionLabel — protein aliases', () => {
  it.each(['たんぱく質', 'タンパク質', '蛋白質'])(
    'extracts protein from %s',
    (alias) => {
      const result = parseNutritionLabel(`${alias} 12.5 g`);
      expect(result.proteinG).toBe(12.5);
    },
  );
});

describe('parseNutritionLabel — fat vs saturated fat', () => {
  it('extracts fat without confusing 飽和脂肪酸', () => {
    const result = parseNutritionLabel(
      '脂質 8.0 g\n飽和脂肪酸 2.5 g',
    );
    expect(result.fatG).toBe(8.0);
    expect(result.saturatedFatG).toBe(2.5);
  });

  it('extracts saturated fat when 脂質 is missing', () => {
    const result = parseNutritionLabel('飽和脂肪酸 2.5 g');
    expect(result.saturatedFatG).toBe(2.5);
    expect(result.fatG).toBeNull();
  });

  it('handles 脂質 only without saturated', () => {
    const result = parseNutritionLabel('脂質 10.0 g');
    expect(result.fatG).toBe(10.0);
    expect(result.saturatedFatG).toBeNull();
  });

  it('handles 脂肪 alias for fat', () => {
    const result = parseNutritionLabel('脂肪 8.0 g');
    expect(result.fatG).toBe(8.0);
  });
});

describe('parseNutritionLabel — salt and sodium', () => {
  it('extracts salt from 食塩相当量', () => {
    const result = parseNutritionLabel('食塩相当量 0.5 g');
    expect(result.saltG).toBe(0.5);
  });

  it('extracts sodium-only label leaves saltG null', () => {
    const result = parseNutritionLabel('ナトリウム 200 mg');
    expect(result.saltG).toBeNull();
    expect(result.sodiumMg).toBe(200);
  });

  it('extracts both salt and sodium when both are present', () => {
    const result = parseNutritionLabel(
      '食塩相当量 1.0 g\nナトリウム 393 mg',
    );
    expect(result.saltG).toBe(1.0);
    expect(result.sodiumMg).toBe(393);
  });
});

describe('parseNutritionLabel — extended nutrients', () => {
  it('extracts fiber, sugar, cholesterol, calcium, iron', () => {
    const text = `
      食物繊維 3.0 g
      糖質 12.0 g
      コレステロール 50 mg
      カルシウム 100 mg
      鉄 2.5 mg
    `;
    const result = parseNutritionLabel(text);
    expect(result.fiberG).toBe(3.0);
    expect(result.sugarG).toBe(12.0);
    expect(result.cholesterolMg).toBe(50);
    expect(result.calciumMg).toBe(100);
    expect(result.ironMg).toBe(2.5);
  });

  it('handles 鉄分 alias for iron', () => {
    const result = parseNutritionLabel('鉄分 2.5 mg');
    expect(result.ironMg).toBe(2.5);
  });
});

describe('parseNutritionLabel — full-width digit normalization', () => {
  it('parses values written in full-width digits', () => {
    const result = parseNutritionLabel('エネルギー １８０ kcal');
    expect(result.calories).toBe(180);
  });

  it('parses decimals with full-width period', () => {
    const result = parseNutritionLabel('たんぱく質 １２．５ g');
    expect(result.proteinG).toBe(12.5);
  });
});

describe('parseNutritionLabel — realistic JP package label', () => {
  it('extracts macros + extended from a full nutrition panel', () => {
    const text = `
      栄養成分表示（100gあたり）
      エネルギー 180 kcal
      たんぱく質 12.0 g
      脂質 8.0 g
      　-飽和脂肪酸 2.5 g
      炭水化物 15.0 g
      　-糖質 12.0 g
      　-食物繊維 3.0 g
      食塩相当量 0.5 g
    `;
    const result = parseNutritionLabel(text);
    expect(result.perBasis).toBe('per_100g');
    expect(result.calories).toBe(180);
    expect(result.proteinG).toBe(12.0);
    expect(result.fatG).toBe(8.0);
    expect(result.saturatedFatG).toBe(2.5);
    expect(result.carbG).toBe(15.0);
    expect(result.sugarG).toBe(12.0);
    expect(result.fiberG).toBe(3.0);
    expect(result.saltG).toBe(0.5);
  });

  it('extracts what it can from a partial label and returns null for missing fields', () => {
    const text = `
      エネルギー 180 kcal
      たんぱく質 12.0 g
    `;
    const result = parseNutritionLabel(text);
    expect(result.calories).toBe(180);
    expect(result.proteinG).toBe(12.0);
    expect(result.fatG).toBeNull();
    expect(result.carbG).toBeNull();
    expect(result.saltG).toBeNull();
  });
});

describe('parseNutritionLabel — empty / garbage input', () => {
  it('returns all-null on empty string', () => {
    const result = parseNutritionLabel('');
    expect(result.calories).toBeNull();
    expect(result.proteinG).toBeNull();
    expect(result.fatG).toBeNull();
    expect(result.carbG).toBeNull();
    expect(result.perBasis).toBe('unknown');
  });

  it('returns all-null on text with no recognizable labels', () => {
    const result = parseNutritionLabel(
      '本日のおすすめメニューはこちらです',
    );
    expect(result.calories).toBeNull();
    expect(result.proteinG).toBeNull();
  });
});
