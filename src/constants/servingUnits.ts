/** Standardized serving unit codes stored in the DB */
export type ServingUnitCode =
  | 'g'
  | 'piece'
  | 'cup'
  | 'bowl'
  | 'slice'
  | 'pack'
  | 'serving'
  | 'scoop';

export interface ServingUnitInfo {
  /** Japanese counter word (個, 杯, 枚, etc.) */
  counterJa: string;
  /** Description template for 1 unit — `{g}` is replaced with serving_size_g */
  descriptionTemplate: string;
}

const UNIT_MAP: Record<ServingUnitCode, ServingUnitInfo> = {
  g: { counterJa: 'g', descriptionTemplate: '{g}g' },
  piece: { counterJa: '個', descriptionTemplate: '1個 ({g}g)' },
  cup: { counterJa: '杯', descriptionTemplate: '1杯 ({g}g)' },
  bowl: { counterJa: '杯', descriptionTemplate: '1杯 ({g}g)' },
  slice: { counterJa: '枚', descriptionTemplate: '1枚 ({g}g)' },
  pack: { counterJa: 'パック', descriptionTemplate: '1パック ({g}g)' },
  serving: { counterJa: '人前', descriptionTemplate: '1人前 ({g}g)' },
  scoop: { counterJa: 'スクープ', descriptionTemplate: '1スクープ ({g}g)' },
};

/**
 * Check if a serving unit is a standardized English code.
 * Foods may still have legacy Japanese serving units like '1個', '茶碗1杯'.
 */
export function isStandardUnit(unit: string): unit is ServingUnitCode {
  return unit in UNIT_MAP;
}

/** Get Japanese counter word for a serving unit */
export function getCounterJa(unit: string): string {
  if (isStandardUnit(unit)) return UNIT_MAP[unit].counterJa;
  // Legacy Japanese units — strip leading number/fraction if present
  return unit.replace(/^[\d./]+/, '');
}

/**
 * Format the quantity + unit for display.
 * e.g. (2, 'piece') → "2 個"
 * e.g. (1.5, 'serving') → "1.5 人前"
 * e.g. (150, 'g') → "150 g"
 */
export function formatQuantityUnit(qty: number, unit: string): string {
  if (unit === 'g') return `${qty}g`;
  const counter = getCounterJa(unit);
  return `${qty} ${counter}`;
}

/**
 * Format the serving description for the hint card.
 * e.g. ('piece', 55, 83) → "1個 (55g) / 83kcal"
 * e.g. ('g', 100, 168) → "100g / 168kcal"
 */
export function formatServingHint(
  unit: string,
  servingSizeG: number,
  caloriesPerServing: number,
): string {
  if (unit === 'g') {
    return `${servingSizeG}g / ${caloriesPerServing}kcal`;
  }
  if (isStandardUnit(unit)) {
    const desc = UNIT_MAP[unit].descriptionTemplate.replace(
      '{g}',
      String(servingSizeG),
    );
    return `${desc} / ${caloriesPerServing}kcal`;
  }
  // Legacy Japanese unit — show as-is with calories
  return `${unit} (${servingSizeG}g) / ${caloriesPerServing}kcal`;
}

/** Whether this food supports serving-based (non-gram) input */
export function hasServingUnit(unit: string): boolean {
  return unit !== 'g';
}
