// 8-category equipment taxonomy (Build 15 / Feature 5-P).
//
// Derived from Gymwork's gym-shelf categorization
// (long-term-strategy.md §2.2 / §8 #10). Used by:
//   - 5-A: seed-exercises-v2 / migration v25 normalize
//   - 5-P: training picker chip filter UI (this is the user-facing
//          gate that prevents non-enum values from being created)
//   - 5-元: per-user gym equipment registration (Build 15 Session 8)
//
// Server-side enforcement: public.user_custom_exercises has a CHECK
// constraint matching this enum (Build 15 migration
// 20260507000006). Local SQLite enforces via this UI gate only,
// because SQLite ALTER TABLE can't add CHECK constraints.

export const EQUIPMENT_CATEGORIES = [
  { key: 'barbell', ja: 'バーベル', icon: 'barbell-outline' },
  { key: 'dumbbell', ja: 'ダンベル', icon: 'fitness-outline' },
  { key: 'kettlebell', ja: 'ケトルベル', icon: 'ellipse-outline' },
  { key: 'machine', ja: 'マシン', icon: 'cog-outline' },
  { key: 'bodyweight', ja: '自重', icon: 'body-outline' },
  { key: 'cardio', ja: '有酸素', icon: 'heart-outline' },
  { key: 'stretching', ja: 'ストレッチ', icon: 'leaf-outline' },
  { key: 'other', ja: 'その他', icon: 'apps-outline' },
] as const;

export type EquipmentKey = (typeof EQUIPMENT_CATEGORIES)[number]['key'];

export const EQUIPMENT_KEY_SET: ReadonlySet<EquipmentKey> = new Set(
  EQUIPMENT_CATEGORIES.map((c) => c.key),
);

export function isValidEquipmentKey(value: unknown): value is EquipmentKey {
  return typeof value === 'string' && EQUIPMENT_KEY_SET.has(value as EquipmentKey);
}

export const EQUIPMENT_LABEL_BY_KEY: Record<EquipmentKey, string> =
  Object.fromEntries(
    EQUIPMENT_CATEGORIES.map((c) => [c.key, c.ja]),
  ) as Record<EquipmentKey, string>;
