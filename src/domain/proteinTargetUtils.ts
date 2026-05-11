import { type ProteinFactor, PROTEIN_FACTOR_OPTIONS } from '../types/profile';

// v1.3.0 / Onboarding v2 / Phase D-4 — pure helpers for the [8]
// protein-target screen.
//
// The screen is special because reaching step >= 9 here trips
// ONBOARDING_STEP_FULL_INPUT (D-2 threshold). After that point
// calculateAll fires its first cache compute (BMR / TDEE / daily-
// target / PFC bundle), so the screen also renders a live PFC
// feedback section. Pattern 18 / 23 / 24 all activate here.
//
// Pattern 25 — pure helpers only. The screen owns the
// suggestProteinFactor async fetch + setProteinFactor + persist
// orchestration.

export { type ProteinFactor, PROTEIN_FACTOR_OPTIONS };

// === Labels + descriptions ===
//
// Sign-off § Phase D-4 §1 — JP labels show the canonical
// "{factor} g/kg" form (Mealift-tier naming convention used in
// the suggestion engine + future settings). Descriptions cover
// the activity tier the factor maps to per A-4 § 8.6 + 8.7.
const LABELS: Record<ProteinFactor, string> = {
  1.0: '1.0 g/kg',
  1.6: '1.6 g/kg',
  2.2: '2.2 g/kg',
  3.0: '3.0 g/kg',
};

const DESCRIPTIONS: Record<ProteinFactor, string> = {
  1.0: '運動なし / 健康維持',
  1.6: '週 1〜2 回の運動',
  2.2: '週 3 回以上 / 筋肥大狙い',
  3.0: 'プロアスリート / 競技志向',
};

export function getProteinFactorLabel(factor: ProteinFactor): string {
  return LABELS[factor];
}

export function getProteinFactorDescription(factor: ProteinFactor): string {
  return DESCRIPTIONS[factor];
}

// === isValidProteinFactor ===
//
// Pattern 15 + 18 補強 (canonical view) — only the 4 exact
// number-literal values pass. Catches NaN / Infinity / nearby
// floats (1.0000001 from external/network sources) before they
// slip past the store typing.
export function isValidProteinFactor(value: unknown): value is ProteinFactor {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  return (PROTEIN_FACTOR_OPTIONS as readonly number[]).includes(value);
}

// === getRecommendationLabel ===
//
// Renders the suggestion line "あなたの運動量から: {label} がおすすめです".
// Returns a fallback prompt when the suggestion is null (mount-
// time before the async fetch resolves).
export function getRecommendationLabel(
  suggested: ProteinFactor | null,
): string {
  if (suggested == null) return '選択してください';
  return `あなたの運動量から: ${getProteinFactorLabel(suggested)} がおすすめです`;
}

// === isAllInputsValidForD4 ===

export function isAllInputsValidForD4(
  proteinFactor: ProteinFactor | null,
): boolean {
  if (proteinFactor == null) return false;
  return isValidProteinFactor(proteinFactor);
}

// === formatProteinFactorAccessibilityLabel ===
//
// VoiceOver-friendly long form. The visible "1.6 g/kg" reads as
// "イチ テン ロク ジー / ケージー" in JP VoiceOver — fine but
// terse. This longer form pairs the numeric value with the
// activity-tier copy so screen-reader users get the full context
// (matches the B-4 / D-3 precedent of spelling out semantically
// meaningful content rather than relying on the visual form).
export function formatProteinFactorAccessibilityLabel(
  factor: ProteinFactor,
): string {
  return `${getProteinFactorLabel(factor)} ${getProteinFactorDescription(factor)}`;
}
