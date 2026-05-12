// v1.3.0 / Onboarding v2 / Phase D-9 — pure helpers for the
// [12.5] tier-preview promotional screen.
//
// Keeps the JP copy + feature list out of the screen file so
// the data is testable + the marketing copy can be tuned
// without touching render code.

import { TRIAL_DURATION_DAYS } from '../constants/pricing';

export interface PlusFeature {
  // Ionicons name used as visual cue. Picked from the existing
  // app icon palette to stay consistent with other promotional
  // surfaces.
  icon:
    | 'sparkles-outline'
    | 'nutrition-outline'
    | 'barbell-outline'
    | 'trending-up-outline';
  title: string;
  description: string;
}

// Plus feature highlight reel. Curated to reflect the user-
// facing value props of paid tiers (per src/infra/services/
// subscriptionService.ts's FEATURE_MATRIX + FREE_LIMITS) without
// listing every gated flag. Sign-off § Phase D-9 §UI — 4 items
// chosen to fit a single non-scrolling section on iPhone SE
// (320pt width).
export const PLUS_FEATURES: readonly PlusFeature[] = [
  {
    icon: 'sparkles-outline',
    title: 'AI 食事認識を無制限',
    description: '写真から栄養素を自動で算出します',
  },
  {
    icon: 'nutrition-outline',
    title: '詳細な栄養分析',
    description: 'ビタミン・ミネラルまで細かく追跡',
  },
  {
    icon: 'barbell-outline',
    title: 'ワークアウト無制限',
    description: 'お気に入りやテンプレートを上限なく作成',
  },
  {
    icon: 'trending-up-outline',
    title: '進捗予測 + 週次レポート',
    description: 'AI がデータから次のアクションを提案',
  },
];

// === getTrialCopy ===
//
// Reads the canonical TRIAL_DURATION_DAYS from constants/pricing
// (Pattern 18 SSoT — same source the trial-end-date math in
// subscriptionService.derivePlanSnapshot uses). When the
// constant changes (e.g., promotional 14-day push), copy follows
// automatically.
export function getTrialCopy(): string {
  return `${TRIAL_DURATION_DAYS} 日間無料トライアル`;
}

export function getTrialSubcopy(): string {
  return 'いつでもキャンセル可能';
}

// === Re-export trial-duration for tests + screen ===
export { TRIAL_DURATION_DAYS };
