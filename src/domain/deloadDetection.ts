import type * as SQLite from 'expo-sqlite';
import { startOfWeek, addDays, format } from 'date-fns';
import type { SetPattern } from '../types/workout';
import {
  aggregateWeeklySetsByMuscle,
  classifyVolume,
  VOLUME_GROUPS_ORDER,
  type VolumeGroup,
} from './volumeLandmark';

// Build 16 / Phase 4 (Feature F) / Phase 4.1 — auto-deload detection
// domain layer.
//
// Pure logic + one thin DB aggregator. No persistence, no UI. Three
// responsibilities:
//
//   1. detectDeloadRecommendation — given 4 consecutive weekly volume
//      matrices, decide whether at least one muscle group has been
//      above MRV every week. If so, produce a DeloadRecommendation
//      payload (the source weeks + affected muscles + detection
//      timestamp). Phase 4.2 persists this via the repository.
//
//   2. generateDeloadRoutine — pure transform that halves a routine's
//      target_sets per item (floor, min 1) while preserving target_reps
//      and any setPattern/patternConfig. Phase 4.2 calls this with the
//      user's most-recent routine items, then writes a new routine via
//      createRoutine() in workoutRepository.
//
//   3. fetchWeeklyVolumeMatricesForDeload — issues 4 parallel calls to
//      aggregateWeeklySetsByMuscle (one per completed week) and returns
//      the matrices oldest-first so the caller can hand them straight
//      to detectDeloadRecommendation.
//
// Detection window — sign-off F1 / F2:
//   We look at the 4 most recent COMPLETED weeks (i.e., weeks ENDING
//   at last Sunday). The current in-progress week is excluded so a
//   half-trained Tuesday doesn't suppress detection (false negative)
//   and a Monday's first session doesn't fabricate a 4-week trend
//   (false positive). Detection becomes deterministic relative to
//   "user opens the app" — same input on every Monday morning.
//
// "Above MRV" semantics:
//   classifyVolume returns 'above_mrv' when weeklySets > MRV. Using
//   classifyVolume here (rather than a direct `> mrv` check) means
//   thresholds always stay in lockstep with the rest of the dashboard
//   — if Phase 2's landmark table grows per-user customization
//   later, this module picks it up for free.

// === Constants — sign-off F1 / F2 / F3 ===

// 4 consecutive weeks of overreaching to trigger a deload. Sign-off
// F1 fixes this at 4 — the published RP/Israetel guidance treats
// 3 weeks of MRV breach as the deload threshold but 4 here gives
// false-positive headroom while still firing within a normal mesocycle.
export const DELOAD_CONSECUTIVE_WEEKS = 4;

// Volume reduction applied to the generated deload routine. 0.5 =
// halve every working set count, floored to integer with a minimum
// of 1 (per-exercise zero-out makes no sense for a deload — the user
// still needs a stimulus, just a reduced one). Sign-off F3.
export const DELOAD_VOLUME_REDUCTION = 0.5;

// One-week deload duration (sign-off F4). Phase 4.2 surfaces this in
// the banner copy; the detection layer only needs the constant for
// output payload construction.
export const DELOAD_DURATION_WEEKS = 1;

// === Types ===

export interface WeeklyVolumeMatrix {
  // 'YYYY-MM-DD' Monday-anchored weekStart in the runtime's local TZ.
  // Phase 2.1 derives the same shape via parseISODateAsLocalNoon to
  // avoid the negative-offset week-boundary shift.
  weekStart: string;
  setsByGroup: Record<VolumeGroup, number>;
}

export interface DeloadRecommendation {
  // ISO instant the detector fired. Caller passes this through to
  // createDeloadRecommendation; the repository's unique index on
  // (profile_id, detected_at) collapses concurrent screen mounts at
  // the same minute.
  detectedAt: string;
  // The 4 weekStart strings that triggered detection, oldest-first.
  // Exactly DELOAD_CONSECUTIVE_WEEKS entries.
  sourceWeekStarts: string[];
  // VolumeGroup keys whose sets exceeded MRV every week in the window.
  // Order matches VOLUME_GROUPS_ORDER for stable UI rendering.
  affectedMuscles: VolumeGroup[];
}

// Shape generateDeloadRoutine accepts/produces. Matches the createRoutine
// item input shape in workoutRepository so Phase 4.2 can pipe directly.
// Generic-typed so additional fields on the caller's row (e.g. a
// debugging name) round-trip untouched.
export interface DeloadRoutineItemInput {
  exerciseId: string;
  targetSets: number;
  targetReps: string;
  setPattern?: SetPattern | null;
  patternConfig?: string | null;
}

// === Pure: detection ===

// Walks the 4 supplied matrices and returns a DeloadRecommendation iff
// at least one muscle group classifies as 'above_mrv' in every week.
// Returns null if the input window is the wrong length OR no muscle
// qualifies.
//
// `detectedAt` is overridable for tests / Phase 4.2 (which derives a
// canonical instant before calling so the repository's unique index
// collapses race-y screen mounts to one row).
export function detectDeloadRecommendation(
  matrices: WeeklyVolumeMatrix[],
  detectedAt: string = new Date().toISOString(),
): DeloadRecommendation | null {
  if (matrices.length !== DELOAD_CONSECUTIVE_WEEKS) {
    return null;
  }
  const affectedMuscles: VolumeGroup[] = [];
  for (const group of VOLUME_GROUPS_ORDER) {
    const allAboveMrv = matrices.every(
      (m) => classifyVolume(m.setsByGroup[group] ?? 0, group) === 'above_mrv',
    );
    if (allAboveMrv) {
      affectedMuscles.push(group);
    }
  }
  if (affectedMuscles.length === 0) {
    return null;
  }
  return {
    detectedAt,
    sourceWeekStarts: matrices.map((m) => m.weekStart),
    affectedMuscles,
  };
}

// === Pure: routine generation ===

// Halves every item's targetSets via Math.floor with a floor of 1.
// Generic so additional caller fields (e.g. exerciseName for UI) ride
// through unchanged — Phase 4.2 will layer the modal's preview on top
// of this output.
//
// Why Math.floor over Math.ceil/round:
//   - Floor keeps the deload's reduction "honest". 5 sets → 2 (not 3),
//     3 sets → 1, 1 set → 1 (clamp).
//   - The literature treats deload weeks as ~50% volume; rounding up
//     would creep above 50% on odd counts.
export function generateDeloadRoutine<T extends DeloadRoutineItemInput>(
  items: T[],
): T[] {
  return items.map((item) => ({
    ...item,
    targetSets: Math.max(
      1,
      Math.floor(item.targetSets * DELOAD_VOLUME_REDUCTION),
    ),
  }));
}

// === Aggregator ===

// Format a Date as the user's local 'YYYY-MM-DD'. We don't use
// toISOString().slice(0, 10) because that emits the UTC date — for
// JST users, Monday 00:00 local is Sunday 15:00 UTC, so the slice
// would yield the prior day. date-fns's `format` reads the runtime's
// local TZ.
function formatLocalDate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

// Pulls the 4 most recent COMPLETED weeks of volume in parallel and
// returns them oldest-first so the caller can pass straight to
// detectDeloadRecommendation. The current week is intentionally
// excluded — see header comment.
//
// `now` is a test seam (default `new Date()`). dbOverride threads
// through to each aggregateWeeklySetsByMuscle call so a fake DB can
// satisfy all 4 queries with a single mock.
export async function fetchWeeklyVolumeMatricesForDeload(
  profileId: string,
  weeksToCheck: number = DELOAD_CONSECUTIVE_WEEKS,
  dbOverride?: SQLite.SQLiteDatabase,
  now: Date = new Date(),
): Promise<WeeklyVolumeMatrix[]> {
  const currentMonday = startOfWeek(now, { weekStartsOn: 1 });
  // Build oldest-first: weeksToCheck=4 → mon-28, mon-21, mon-14, mon-7.
  // The current week (currentMonday → currentMonday+7) is excluded.
  const weekStarts: Date[] = [];
  for (let i = weeksToCheck; i >= 1; i--) {
    weekStarts.push(addDays(currentMonday, -7 * i));
  }

  // Promise.all so a 4-week fetch is one round-trip latency, not 4×.
  // aggregateWeeklySetsByMuscle is internally a single SQL per call so
  // the parallel issue is bound by the SQLite driver's concurrency.
  const matrices = await Promise.all(
    weekStarts.map(async (ws) => {
      const setsByGroup = await aggregateWeeklySetsByMuscle(
        profileId,
        ws,
        dbOverride,
      );
      return {
        weekStart: formatLocalDate(ws),
        setsByGroup,
      };
    }),
  );

  return matrices;
}
