import type { GoalType } from '../types/common';

// v1.3.0 / Onboarding v2 / Phase D-6 — pure helpers for the [10]
// motivation screen.
//
// Pattern 25 — all copy + date formatting lives here so the screen
// stays render-only and the boundaries are jest-testable without
// RNTL infra.

export interface MotivationCopy {
  title: string;
  body: string;
}

// Sign-off § Phase D-6 §1 — copy per goalType. Warm onboarding
// tone (not clinical), JP audience. Each block follows the same
// shape: 1 short title + 1-2 sentence body that paints the
// outcome rather than the process. The body deliberately avoids
// mentioning specific weeks / dates — those come from the
// achievement-date card sibling.
const COPY: Record<GoalType, MotivationCopy> = {
  cut: {
    title: '減量への道のり',
    body: '余分な体脂肪を落とせば、体が軽くなり日々のパフォーマンスが上がります。さあ、はじめましょう。',
  },
  maintain: {
    title: '理想を維持する',
    body: '今の体型をキープしながら、食事と運動の質を整えていきましょう。健康はその先にあります。',
  },
  bulk: {
    title: '増量への挑戦',
    body: '計画的に栄養を増やせば、筋肉と自信が同時に育ちます。一歩ずつ、確実に進んでいきましょう。',
  },
  recomp: {
    title: '体組成改善の旅',
    body: '体重を維持しながら筋肉を増やし脂肪を減らす — 最も奥が深い目標です。じっくり取り組みましょう。',
  },
};

export function getMotivationCopyForGoal(goalType: GoalType): MotivationCopy {
  return COPY[goalType];
}

// === formatAchievementDateLabel ===
//
// JP locale date + week count. Layer 4 TZ defense: input Date is
// constructed by estimateTargetDate (A-4) using setDate in local
// time, so toLocaleDateString reads the same instant. The
// resulting string is "2026年8月15日（約 14 週）" form.
export function formatAchievementDateLabel(
  date: Date,
  weeks: number,
): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '達成日 未確定';
  }
  const dateLabel = date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  if (!Number.isFinite(weeks) || weeks <= 0) {
    return dateLabel;
  }
  return `${dateLabel}（約 ${weeks} 週）`;
}

// === No-schedule fallback labels ===
//
// calculateGoalSummary returns null whenever the direction is
// maintain (covers BOTH goalType='maintain' AND goalType='recomp'
// per the C-5 consistency rules — recomp has target ≈ current,
// so direction='maintain' even though the kcal/PFC plan is
// non-zero). The motivation screen needs distinct fallback copy
// for the two cases:
//   - maintain: "現状維持を継続中" — user wants to hold steady
//   - recomp:   "体組成を改善中" — user holds weight but shifts
//                composition; D-1 goal-summary.tsx already makes
//                this distinction in its weight-card copy.
export function getMaintenanceDateLabel(): string {
  return '現状維持を継続中';
}

export function getRecompDateLabel(): string {
  return '体組成を改善中';
}
