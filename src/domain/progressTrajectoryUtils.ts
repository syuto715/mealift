import type { OnboardingSummary } from './goalSummaryAggregator';

// v1.3.0 / Onboarding v2 / Phase D-7 — pure helpers for the [11]
// progress-preview screen.
//
// Two things this file owns:
//   1. Trajectory point computation (week 0..N → projected weight)
//      — the screen feeds this into an inline SVG polyline.
//   2. Direction-aware progress copy (4-tier branch per D-6
//      learning — cut / maintain / bulk / recomp must each have
//      distinct copy; maintain/recomp collapse is the regression
//      D-6 hardening fixed).

// === MAX_TRAJECTORY_WEEKS ===
//
// Sign-off § Phase D-7 §1 — display cap. estimateTargetDate
// already caps weeks at 520 (10 years) for unreachable goals.
// The trajectory chart caps at 52 (1 year) to keep the visual
// density readable; beyond 52 weeks the user's plan is so slow
// that a chart with 100+ x-axis ticks would be noise.
export const MAX_TRAJECTORY_WEEKS = 52;

export interface TrajectoryPoint {
  week: number;
  weightKg: number;
}

// === computeTrajectoryPoints ===
//
// Linear interpolation between current and target weight across
// the scheduled weeks. The actual weekly projection from
// estimateTargetDate uses compounding (currentWeight × rate%),
// but for display purposes a straight line is more readable and
// the difference is < 0.5kg over typical onboarding ranges.
//
// Returns `[]` when no schedule (maintain / recomp / null summary)
// so the screen can render a "no projection" state. Otherwise
// includes both endpoints + intermediate weekly tick points up to
// MAX_TRAJECTORY_WEEKS.
export function computeTrajectoryPoints(
  summary: OnboardingSummary | null,
  maxWeeks: number = MAX_TRAJECTORY_WEEKS,
): readonly TrajectoryPoint[] {
  if (summary == null) return [];
  if (summary.schedule == null) return [];
  const { weeksToGoal } = summary.schedule;
  if (!Number.isFinite(weeksToGoal) || weeksToGoal <= 0) return [];

  const cap = Math.min(weeksToGoal, maxWeeks);
  const start = summary.weight.current;
  const end = summary.weight.target;
  const points: TrajectoryPoint[] = [];
  for (let w = 0; w <= cap; w++) {
    const ratio = w / weeksToGoal;
    const weight = start + (end - start) * ratio;
    points.push({
      week: w,
      // Round to 1 decimal for display stability (slider-level
      // precision matches B-2's onboarding inputs).
      weightKg: Math.round(weight * 10) / 10,
    });
  }
  return points;
}

// === getProgressCopyForDirection ===
//
// 4-tier branch (D-6 学び — maintain/recomp collapse regression
// must NOT recur). Each direction gets distinct title + body.
//
// weeksToGoal is included as a context input so cut/bulk copy
// can reference the convergence timeline ("約 N 週で目標到達");
// maintain/recomp have weeksToGoal=null and use copy that doesn't
// reference a deadline.
export interface ProgressCopy {
  title: string;
  body: string;
}

const COPY_BY_DIRECTION: Record<
  'cut' | 'maintain' | 'bulk' | 'recomp',
  (weeksToGoal: number | null) => ProgressCopy
> = {
  cut: (weeks) => ({
    title: '目標達成までの道のり',
    body:
      weeks != null && weeks > 0
        ? `約 ${weeks} 週で目標に到達できる計画です。毎日の小さな積み重ねが、大きな変化を生みます。`
        : '計画的にカロリーを抑えれば、目標に近づけます。',
  }),
  bulk: (weeks) => ({
    title: '増量に向けた取り組み',
    body:
      weeks != null && weeks > 0
        ? `約 ${weeks} 週で目標に到達できる計画です。栄養とトレーニングを両立させ、着実に増やしていきましょう。`
        : 'タンパク質と総カロリーを意識して、筋肉を着実に増やしていきましょう。',
  }),
  maintain: () => ({
    title: '現状を継続する',
    body:
      '今のバランスを保ちながら、食事と運動の質を整えていきます。健康はその先にあります。',
  }),
  recomp: () => ({
    title: '体組成改善のプロセス',
    body:
      '体重を維持しながら、筋肉を増やし脂肪を減らす — 最もじっくり取り組む目標です。焦らず継続していきましょう。',
  }),
};

export function getProgressCopyForDirection(
  direction: 'cut' | 'maintain' | 'bulk' | 'recomp',
  weeksToGoal: number | null,
): ProgressCopy {
  return COPY_BY_DIRECTION[direction](weeksToGoal);
}

// === formatTrajectoryAccessibilityLabel ===
//
// VoiceOver-friendly readout for the chart. Picks 3 anchor
// points (start, midpoint, end) so the announcement stays
// concise even for long projections. Empty array → fallback
// copy explicitly states "予測なし" so screen-reader users get
// the "no projection" state context (Pattern 18 補強
// cross-consumer — maintain/recomp must surface distinctly).
export function formatTrajectoryAccessibilityLabel(
  points: readonly TrajectoryPoint[],
): string {
  if (points.length === 0) return '予測なし';
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length === 1) {
    return `0 週で ${first.weightKg} kg`;
  }
  const midIndex = Math.floor(points.length / 2);
  const mid = points[midIndex];
  return (
    `${first.week} 週で ${first.weightKg} kg、` +
    `${mid.week} 週で ${mid.weightKg} kg、` +
    `${last.week} 週で ${last.weightKg} kg`
  );
}

// === computeTrajectoryBounds ===
//
// Helper for the SVG renderer — given the trajectory points,
// returns the y-axis range to plot with a 5% headroom on top
// and bottom so the polyline doesn't kiss the chart edges.
// Returns null when no points (screen skips chart render).
export interface TrajectoryBounds {
  minWeight: number;
  maxWeight: number;
  weekCap: number;
}

export function computeTrajectoryBounds(
  points: readonly TrajectoryPoint[],
): TrajectoryBounds | null {
  if (points.length === 0) return null;
  let minW = Number.POSITIVE_INFINITY;
  let maxW = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.weightKg < minW) minW = p.weightKg;
    if (p.weightKg > maxW) maxW = p.weightKg;
  }
  // Equal min/max (single point case) — pad ±1kg so the chart
  // doesn't degenerate to a zero-height plot area.
  if (minW === maxW) {
    minW -= 1;
    maxW += 1;
  } else {
    const span = maxW - minW;
    const pad = span * 0.05;
    minW -= pad;
    maxW += pad;
  }
  return {
    minWeight: minW,
    maxWeight: maxW,
    weekCap: points[points.length - 1].week,
  };
}
