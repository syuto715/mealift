// v1.4 ステージ 4 Phase 4A — unit categorization + canonical segments.
//
// 食品の serving_unit を分類し、 unit picker UI で **同 category の
// unit のみ表示** する filter を可能にする。 既存 foods.serving_unit
// (v1 schema) はそのまま使用、 schema migration なし (Option A).
//
// Categories:
//   - weight: グラム系単位 (g / kg / oz / lb)
//   - volume: 液体系単位 (ml / cc / l)
//   - count : 個数系単位 (個 / 本 / 枚 / パック / 杯)
//
// `getUnitCategory` は unknown unit に対して `'weight'` fallback、
// production database の "purple-unicorn" 級単位への defensive default。
//
// Patterns applied:
//   #18 SSoT — unit ↔ category mapping を 1 file に集約、 全 picker UI
//       が同じ rule を読む。 重複実装防止。
//   #25 helper-thick — pure function、 React import 無し、 jest で
//       1 zone × 12 unit + edge cases だけ pin できる。

export type UnitCategory = 'weight' | 'volume' | 'count';

// Unit string ↔ category lookup. Production-quality 多語対応:
//   - 日本語 count units 5 種 (個 / 本 / 枚 / パック / 杯)
//   - 英語 weight units 4 種 (g / kg / oz / lb)
//   - 英語 volume units 3 種 (ml / cc / l)
export const UNIT_CATEGORIES: Record<string, UnitCategory> = {
  // weight
  g: 'weight',
  kg: 'weight',
  oz: 'weight',
  lb: 'weight',
  // volume
  ml: 'volume',
  cc: 'volume',
  l: 'volume',
  // count
  個: 'count',
  本: 'count',
  枚: 'count',
  パック: 'count',
  杯: 'count',
};

// SegmentedControl 用 7-option array. 既存 add.tsx の 4-option
// (g/ml/個/杯) を superset で置換、 本 / 枚 / パック を追加。
// `as const` で literal type 保持、 caller 側で
// UNIT_SEGMENTS_FULL[N].value: 'g' | 'ml' | ... narrow.
export const UNIT_SEGMENTS_FULL = [
  { label: 'g', value: 'g' },
  { label: 'ml', value: 'ml' },
  { label: '個', value: '個' },
  { label: '本', value: '本' },
  { label: '枚', value: '枚' },
  { label: 'パック', value: 'パック' },
  { label: '杯', value: '杯' },
] as const;

// Pure helper: lookup with `'weight'` fallback for unknown units.
// Unknown だと strict default は category-undefined だが、 picker UI
// は 1 category を必ず選ぶ必要があり (none state は UX 悪)、
// fallback `'weight'` を採用 (最も一般的 + 既存 default 'g' と整合)。
export function getUnitCategory(unit: string): UnitCategory {
  return UNIT_CATEGORIES[unit] ?? 'weight';
}

// 食品 metadata.serving_unit から filter 可能な picker option を返す。
// 例: 「個」 食品 (卵 1 個 50g) → count units 5 種のみ表示、
//     「g」 食品 (鶏むね肉 100g) → weight units 4 種のみ表示。
// Phase 4F-3 (optional) で adopt、 Phase 4F-1/2 では full list 表示で
// 実装、 filter は v1.5 enhancement candidate.
export function filterUnitsByCategory(
  category: UnitCategory,
): ReadonlyArray<{ label: string; value: string }> {
  return UNIT_SEGMENTS_FULL.filter(
    (seg) => getUnitCategory(seg.value) === category,
  );
}
