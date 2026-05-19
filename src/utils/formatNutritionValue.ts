// v1.5 Phase 2.3 Sprint 2.3.3 — shared nutrition-value formatter.
//
// Renders a numeric micronutrient cell as `"<n> <unit>"` or `"—"`
// when the field is missing. Centralised here so the detail screen
// and (future) export paths share the same rounding rules.

export function formatNutritionValue(
  raw: number | null | undefined,
  decimals: number = 0,
): string {
  if (raw == null || !Number.isFinite(raw)) return '—';
  const factor = 10 ** decimals;
  return (Math.round(raw * factor) / factor).toString();
}
