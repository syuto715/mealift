// Build 16 / Phase 5 (Feature G) / Phase 5.1 — periodization preset
// templates.
//
// Three hardcoded multi-week prescriptions (Linear, Block, DUP) that
// the Phase 5.2 picker UI spawns into N concrete routines via
// `generatePeriodizedRoutine` + `createRoutine` (zero-schema
// fork-and-clone — see Phase 5 recon decision α).
//
// Naming: deliberately generic ('線形ピリオダイゼーション',
// 'ブロックピリオダイゼーション', '日次変動ピリオダイゼーション')
// to avoid trademark collision with named programs (Stronglifts,
// 5/3/1, 山本義徳・VALX・バズーカ岡田 et al). The literature
// references that motivate the values live in description fields
// rather than in routine names. See:
//   - long-term-strategy.md:478 — IP / trademark caveat
//   - build-15-design.md:1593 — "generic-named to avoid trademarks"
//
// Numerical sources (recon Phase 5 §C):
//   - Linear: Stronglifts/Starting Strength系統; 70→85% over 4 weeks
//   - Block: Verkhoshansky 1985; 12 weeks across hypertrophy /
//     strength / power phases
//   - DUP: Rhea MR 2002. J Strength Cond Res — DUP outperforms linear
//     ~2× for strength; per-week Heavy/Medium/Light cycling
//
// Mealift design discipline (long-term-strategy.md:247): never persist
// kg in routines. `intensityPctOf1RM` lives in the template (not the
// generated output items) and is surfaced to the user by the picker
// UI as "目標強度 N%" copy. recommendNextSet calculates kg from e1rm
// at session time — same regimen as Build 15 Feature 5-C.

import type { SetPattern } from '../types/workout';

// === Type aliases ===

export type PeriodizationTemplateId = 'linear' | 'block' | 'dup';

// DUP cycles within a single week between three labeled sessions.
// 'Heavy'/'Medium'/'Light' are kept as English literal types so the
// picker UI can map them to localized labels via a single lookup
// rather than relying on string parsing across locales.
export type DupSessionLabel = 'Heavy' | 'Medium' | 'Light';

export interface PeriodizationSession {
  sessionLabel: DupSessionLabel;
  sets: number;
  reps: string;
  intensityPctOf1RM: number;
}

// One week's prescription. Mutually exclusive shape:
//   - Linear / Block weeks supply top-level sets/reps/intensity
//     (sessions=undefined).
//   - DUP weeks supply `sessions` (top-level fields undefined).
// `generatePeriodizedRoutine` enforces the discriminator at runtime
// against template.id; the constants below populate the right branch
// per template.
export interface PeriodizationWeek {
  weekIndex: number;
  sets?: number;
  reps?: string;
  intensityPctOf1RM?: number;
  sessions?: PeriodizationSession[];
}

export interface PeriodizationTemplate {
  id: PeriodizationTemplateId;
  nameJa: string;
  description: string;
  durationWeeks: number;
  weeks: PeriodizationWeek[];
}

// === Linear template ===
//
// 4 weeks of progressive intensification — fewer reps + higher
// %1RM each week. Ends at week 4; restart with a small base bump
// (handled by Phase 5.2 UI's "次のサイクルへ" CTA in v2 — v1 just
// generates 4 routines and lets the user re-run the picker).
export const LINEAR_TEMPLATE: PeriodizationTemplate = {
  id: 'linear',
  nameJa: '線形ピリオダイゼーション',
  description:
    '4 週かけて重量を漸進的に増やす古典的プログラム。レップを減らしながら強度を上げ、初〜中級者向け。',
  durationWeeks: 4,
  weeks: [
    { weekIndex: 1, sets: 5, reps: '8', intensityPctOf1RM: 70 },
    { weekIndex: 2, sets: 5, reps: '6', intensityPctOf1RM: 75 },
    { weekIndex: 3, sets: 5, reps: '4', intensityPctOf1RM: 80 },
    { weekIndex: 4, sets: 5, reps: '3', intensityPctOf1RM: 85 },
  ],
};

// === Block template ===
//
// 12 weeks split into three 4-week phases:
//   weeks 1-4   Hypertrophy   4 × 8-12 @ 70-76%
//   weeks 5-8   Strength      4 × 4-6  @ 80-86%
//   weeks 9-12  Power         3 × 2-4  @ 88-95%
// The phase boundaries are intentional 4-week blocks (Verkhoshansky
// classic) — kept rigid in the template so the user sees clear
// transitions in the routine list rather than gradual drift.
export const BLOCK_TEMPLATE: PeriodizationTemplate = {
  id: 'block',
  nameJa: 'ブロックピリオダイゼーション',
  description:
    '12 週で筋肥大→筋力→爆発力の 3 フェーズを巡る上級者向けプログラム。各 4 週ブロックで明確な刺激変化を作る。',
  durationWeeks: 12,
  weeks: [
    // Hypertrophy phase
    { weekIndex: 1, sets: 4, reps: '8-12', intensityPctOf1RM: 70 },
    { weekIndex: 2, sets: 4, reps: '8-12', intensityPctOf1RM: 72 },
    { weekIndex: 3, sets: 4, reps: '8-12', intensityPctOf1RM: 74 },
    { weekIndex: 4, sets: 4, reps: '8-12', intensityPctOf1RM: 76 },
    // Strength phase
    { weekIndex: 5, sets: 4, reps: '4-6', intensityPctOf1RM: 80 },
    { weekIndex: 6, sets: 4, reps: '4-6', intensityPctOf1RM: 82 },
    { weekIndex: 7, sets: 4, reps: '4-6', intensityPctOf1RM: 84 },
    { weekIndex: 8, sets: 4, reps: '4-6', intensityPctOf1RM: 86 },
    // Power phase
    { weekIndex: 9, sets: 3, reps: '2-4', intensityPctOf1RM: 88 },
    { weekIndex: 10, sets: 3, reps: '2-4', intensityPctOf1RM: 90 },
    { weekIndex: 11, sets: 3, reps: '2-4', intensityPctOf1RM: 92 },
    { weekIndex: 12, sets: 3, reps: '2-4', intensityPctOf1RM: 95 },
  ],
};

// === DUP template ===
//
// Daily Undulating Periodization (Rhea 2002): same week, three
// distinct sessions cycling through Heavy / Medium / Light. The
// progression across weeks is intentionally small (+1%/week per
// session) — DUP's effect comes from intra-week stimulus variety,
// not week-over-week intensification. Session label ranges:
//   Heavy   80-85%   5 × 3-5
//   Medium  70-75%   4 × 6-8
//   Light   60-65%   3 × 10-12
export const DUP_TEMPLATE: PeriodizationTemplate = {
  id: 'dup',
  nameJa: '日次変動ピリオダイゼーション',
  description:
    '1 週内で Heavy / Medium / Light の異なる強度を変動させる手法。Rhea 2002 で線形より約 2 倍の筋力増効果が報告されている。',
  durationWeeks: 4,
  weeks: [
    {
      weekIndex: 1,
      sessions: [
        { sessionLabel: 'Heavy', sets: 5, reps: '3-5', intensityPctOf1RM: 82 },
        { sessionLabel: 'Medium', sets: 4, reps: '6-8', intensityPctOf1RM: 72 },
        { sessionLabel: 'Light', sets: 3, reps: '10-12', intensityPctOf1RM: 62 },
      ],
    },
    {
      weekIndex: 2,
      sessions: [
        { sessionLabel: 'Heavy', sets: 5, reps: '3-5', intensityPctOf1RM: 83 },
        { sessionLabel: 'Medium', sets: 4, reps: '6-8', intensityPctOf1RM: 73 },
        { sessionLabel: 'Light', sets: 3, reps: '10-12', intensityPctOf1RM: 63 },
      ],
    },
    {
      weekIndex: 3,
      sessions: [
        { sessionLabel: 'Heavy', sets: 5, reps: '3-5', intensityPctOf1RM: 84 },
        { sessionLabel: 'Medium', sets: 4, reps: '6-8', intensityPctOf1RM: 74 },
        { sessionLabel: 'Light', sets: 3, reps: '10-12', intensityPctOf1RM: 64 },
      ],
    },
    {
      weekIndex: 4,
      sessions: [
        { sessionLabel: 'Heavy', sets: 5, reps: '3-5', intensityPctOf1RM: 85 },
        { sessionLabel: 'Medium', sets: 4, reps: '6-8', intensityPctOf1RM: 75 },
        { sessionLabel: 'Light', sets: 3, reps: '10-12', intensityPctOf1RM: 65 },
      ],
    },
  ],
};

// === Public registry ===

export const PERIODIZATION_TEMPLATES: readonly PeriodizationTemplate[] = [
  LINEAR_TEMPLATE,
  BLOCK_TEMPLATE,
  DUP_TEMPLATE,
] as const;

// Lookup by id. Returns undefined for unknown ids — callers in the
// Phase 5.2 UI use this with a non-null assertion against constants
// they control, so a graceful undefined is preferable to throwing
// from a constant-loading helper.
export function getPeriodizationTemplate(
  id: PeriodizationTemplateId,
): PeriodizationTemplate | undefined {
  return PERIODIZATION_TEMPLATES.find((t) => t.id === id);
}

// === Item input shape (re-export so callers don't pull from the
// domain module just for the type) ===

// Mirror of `DeloadRoutineItemInput` from Phase 4.1's
// generateDeloadRoutine. Same contract because both functions consume
// items shaped for `createRoutine`. Kept independent of the deload
// module to avoid coupling Phase 4 and Phase 5 domains.
export interface PeriodizedRoutineItemInput {
  exerciseId: string;
  targetSets: number;
  targetReps: string;
  setPattern?: SetPattern | null;
  patternConfig?: string | null;
}
