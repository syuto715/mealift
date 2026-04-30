// Nutrition-label OCR parser. Pure function: takes raw OCR text,
// returns a structured guess at what nutrient values appear on the
// package's 栄養成分表示 panel.
//
// IMPORTANT: this parser cannot be evaluated for accuracy from unit
// tests alone. It needs real-world OCR output from real Japanese
// product packages, which only manifests on a 5/1+ build with the
// ML Kit native module hooked up. The unit tests here only validate
// the parser's behavior on hand-crafted text fixtures and locked
// invariants (per-basis detection, kJ→kcal conversion, label aliasing,
// graceful partial extraction).
//
// Design choices:
//   - Best-effort: every field is independently extracted. Failure
//     on one field doesn't block the others. The caller decides what
//     to do with partial data.
//   - The parser does NOT decide what serving_size_g or category to
//     use — it only extracts what's printed. The form retains
//     whatever per-basis the user typed and pre-fills numeric fields.
//   - Aliases: nutrient labels in JP have legitimate variations
//     (たんぱく質 / タンパク質 / 蛋白質). The pattern lists are
//     ordered most-specific-first so 飽和脂肪酸 matches before 脂質.

export interface ParsedNutritionLabel {
  // Detection of which basis the label values are stated in.
  perBasis: 'per_serving' | 'per_100g' | 'unknown';
  perBasisRaw: string | null;

  // Required macros — null when we couldn't find a confident match.
  calories: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbG: number | null;

  // Extended nutrients.
  saltG: number | null;
  sodiumMg: number | null;
  fiberG: number | null;
  sugarG: number | null;
  saturatedFatG: number | null;
  cholesterolMg: number | null;
  calciumMg: number | null;
  ironMg: number | null;

  // Per-field warnings (e.g. kJ-only label, ambiguous match).
  warnings: string[];
}

interface NutrientPattern {
  // Aliases that anchor this nutrient. Listed most-specific-first so
  // 飽和脂肪酸 wins over 脂質 on the same line.
  aliases: string[];
  // Allowed unit literals. The unit is part of the regex so we don't
  // accidentally pick up a value with the wrong unit (e.g. mg in a
  // g-only field).
  units: ('g' | 'mg' | 'μg' | 'mcg' | 'ug' | 'kcal' | 'kJ' | 'kj')[];
  // Output multiplier — e.g. mg→g would be 1/1000. We don't generally
  // convert here since we want to match the unit used on the label.
  // Calories is the exception: kJ gets converted to kcal.
}

const KJ_TO_KCAL = 1 / 4.184;

const CALORIES_LABELS = ['エネルギー', '熱量', 'カロリー'];
const PROTEIN_LABELS = [
  'たんぱく質',
  'タンパク質',
  '蛋白質',
  '蛋白',
];
const FAT_LABELS = ['脂質', '脂肪'];
const SAT_FAT_LABELS = ['飽和脂肪酸'];
const CARB_LABELS = ['炭水化物'];
const FIBER_LABELS = ['食物繊維'];
const SUGAR_LABELS = ['糖質'];
const SALT_LABELS = ['食塩相当量', '食塩'];
const SODIUM_LABELS = ['ナトリウム'];
const CHOLESTEROL_LABELS = ['コレステロール'];
const CALCIUM_LABELS = ['カルシウム'];
const IRON_LABELS = ['鉄分', '鉄'];

// Normalize text — full-width digits/dots/commas to half-width,
// collapse whitespace, drop common separators that confuse regex.
export function normalizeOcrText(input: string): string {
  if (!input) return '';
  let t = input;
  // Full-width digits → half-width.
  t = t.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
  // Full-width period and comma.
  t = t.replace(/．/g, '.').replace(/，/g, ',');
  // Various spaces (full-width space, no-break space, etc.) → single space.
  t = t.replace(/[　  -​]+/g, ' ');
  return t;
}

// Build a regex that matches "<one of the aliases> ... <number> <unit>"
// where the alias and number can be separated by whitespace, colons,
// dashes, or table delimiters. The number captures decimals and may be
// preceded by approximation markers (約, 〜).
function buildLineRegex(aliases: string[], units: string[]): RegExp {
  // Aliases are escaped only for literal characters that occur in JP
  // labels (none of them have regex metachars normally).
  const aliasGroup = aliases
    .map((a) => a.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&'))
    .join('|');
  const unitGroup = units.map((u) => u.replace(/\\/g, '\\\\')).join('|');
  // Match: alias, then up to ~30 chars of separators (whitespace,
  // colons, dashes, table dots), then a number, then unit.
  return new RegExp(
    `(?:${aliasGroup})[\\s:：=・\\-\\.]{0,30}?(?:約|〜)?\\s*(-?\\d+(?:\\.\\d+)?)\\s*(${unitGroup})\\b`,
    'u',
  );
}

function extractNumber(
  text: string,
  aliases: string[],
  units: string[],
): { value: number; unit: string } | null {
  const re = buildLineRegex(aliases, units);
  const match = text.match(re);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  return { value, unit: match[2] };
}

function detectPerBasis(text: string): {
  basis: ParsedNutritionLabel['perBasis'];
  raw: string | null;
} {
  // Per-100g indicators. Order matters: '100g' must match before bare
  // '1g' wouldn't be a per-basis marker anyway.
  const per100Patterns = [
    /100\s*g\s*(?:あたり|当たり)/u,
    /\(\s*100\s*g\s*\)/u,
  ];
  for (const pat of per100Patterns) {
    const m = text.match(pat);
    if (m) return { basis: 'per_100g', raw: m[0] };
  }

  // Per-serving indicators — many forms.
  const perServingPatterns = [
    /1\s*食(?:分)?\s*(?:あたり|当たり)?/u,
    /1\s*袋\s*(?:あたり|当たり)?/u,
    /1\s*本\s*(?:あたり|当たり)?/u,
    /1\s*個\s*(?:あたり|当たり)?/u,
    /1\s*パック\s*(?:あたり|当たり)?/u,
    /1\s*杯\s*(?:あたり|当たり)?/u,
  ];
  for (const pat of perServingPatterns) {
    const m = text.match(pat);
    if (m) return { basis: 'per_serving', raw: m[0] };
  }

  return { basis: 'unknown', raw: null };
}

export function parseNutritionLabel(input: string): ParsedNutritionLabel {
  const text = normalizeOcrText(input);
  const warnings: string[] = [];

  const { basis, raw: perBasisRaw } = detectPerBasis(text);
  if (basis === 'unknown') {
    warnings.push('per_basis_unknown');
  }

  // Calories — try kcal first, fall back to kJ with conversion.
  let calories: number | null = null;
  const kcalMatch = extractNumber(text, CALORIES_LABELS, ['kcal']);
  if (kcalMatch) {
    calories = kcalMatch.value;
  } else {
    const kjMatch = extractNumber(text, CALORIES_LABELS, ['kJ', 'kj']);
    if (kjMatch) {
      calories = Math.round(kjMatch.value * KJ_TO_KCAL * 10) / 10;
      warnings.push('calories_converted_from_kj');
    }
  }

  // Protein, fat (NOT saturated), carb — all in grams.
  // Saturated fat is extracted before fat so the fat regex doesn't
  // win on a "飽和脂肪酸" line.
  const satFatMatch = extractNumber(text, SAT_FAT_LABELS, ['g']);
  const saturatedFatG = satFatMatch?.value ?? null;

  const proteinMatch = extractNumber(text, PROTEIN_LABELS, ['g']);
  const proteinG = proteinMatch?.value ?? null;

  // Strip the saturated-fat sub-line before searching for fat to
  // prevent the fat regex from matching the 飽和脂肪酸 line.
  const textWithoutSatFat = text.replace(
    /飽和脂肪酸[^\n]*\n?/gu,
    '',
  );
  const fatMatch = extractNumber(
    textWithoutSatFat,
    FAT_LABELS,
    ['g'],
  );
  const fatG = fatMatch?.value ?? null;

  const carbMatch = extractNumber(text, CARB_LABELS, ['g']);
  const carbG = carbMatch?.value ?? null;

  // Salt may be reported as 食塩相当量 (g) or ナトリウム (mg). We
  // prefer 食塩相当量 if both are present; if only sodium is given,
  // we leave saltG null and surface sodium so the form's salt↔sodium
  // auto-conversion handles the rest if the user wants it.
  const saltMatch = extractNumber(text, SALT_LABELS, ['g']);
  const saltG = saltMatch?.value ?? null;
  const sodiumMatch = extractNumber(text, SODIUM_LABELS, ['mg']);
  const sodiumMg = sodiumMatch?.value ?? null;

  const fiberMatch = extractNumber(text, FIBER_LABELS, ['g']);
  const fiberG = fiberMatch?.value ?? null;

  const sugarMatch = extractNumber(text, SUGAR_LABELS, ['g']);
  const sugarG = sugarMatch?.value ?? null;

  const cholMatch = extractNumber(text, CHOLESTEROL_LABELS, ['mg']);
  const cholesterolMg = cholMatch?.value ?? null;

  const calciumMatch = extractNumber(text, CALCIUM_LABELS, ['mg']);
  const calciumMg = calciumMatch?.value ?? null;

  const ironMatch = extractNumber(text, IRON_LABELS, ['mg']);
  const ironMg = ironMatch?.value ?? null;

  return {
    perBasis: basis,
    perBasisRaw,
    calories,
    proteinG,
    fatG,
    carbG,
    saltG,
    sodiumMg,
    fiberG,
    sugarG,
    saturatedFatG,
    cholesterolMg,
    calciumMg,
    ironMg,
    warnings,
  };
}
