import type * as SQLite from 'expo-sqlite';
import { getDatabase } from '../infra/database/connection';
import { startOfWeek, endOfWeek, format, addDays } from 'date-fns';

// Build 16 / Phase 2 (Feature E) / Phase 2.1 — MEV/MAV/MRV volume
// landmark domain layer.
//
// Translates the 7-coarse muscle taxonomy used elsewhere in the app
// (chest / back / shoulders / legs / arms / core / full_body) into
// the 9-fine taxonomy that the published volume-landmark literature
// (Israetel/Hoffmann RP 2017, Pelland 2024) provides explicit
// thresholds for. The 9 groups + their hardcoded thresholds come
// from `docs/long-term-strategy.md:390-401`.
//
// The 7-coarse data lives on `exercises.muscle_group`; the 9-fine
// data lives on `exercises.primary_muscle` (added in v25). This
// module's job is the exact mapping + the SQL aggregation + the
// classification function the UI uses to color-band the bars.
//
// What this layer does NOT do:
//   - Persist anything (Phase 2 sign-off F6 — transient v1; pivot
//     to a volume_metrics table only when Phase 3's autodeload
//     needs the multi-week history)
//   - Per-user customization of thresholds (sign-off F3 — Build 16+)
//   - Indirect-set weighting via secondary_muscles (legacy seed has
//     partial coverage; v2+)

// === Type aliases ===

// 9 groups for which RP/Israetel publishes landmarks. Sign-off F2.
export type VolumeGroup =
  | 'chest'
  | 'back'
  | 'shoulder_mid'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves';

// 4-zone classification surfaced to the UI as the band color.
// Sign-off F4 — recon C2 chose 4 zones rather than 5 (mavMin..mavMax
// is rendered as a single "optimal" zone in the UI; the range bound
// is shown numerically as supporting copy).
export type VolumeZone =
  | 'below_mev' // weeklySets < MEV — growth stimulus insufficient
  | 'mev_to_mav' // MEV ≤ weeklySets < mavMin — productive but light
  | 'mav_to_mrv' // mavMin ≤ weeklySets ≤ MRV — optimal-to-overreaching
  | 'above_mrv'; // weeklySets > MRV — recovery / deload risk

export interface VolumeLandmark {
  mev: number;
  mavMin: number;
  mavMax: number;
  mrv: number;
}

// === Hardcoded landmark table — sign-off F3 ===
//
// Israetel/Hoffmann RP 2017 default landmarks. The constants live
// here (not in a server table) because the values are stable
// reference points; per-user customization is Build 16+.
//
// docs/long-term-strategy.md:390-401 is the authoritative source —
// keep these numbers in lockstep with that table.
export const VOLUME_LANDMARKS: Record<VolumeGroup, VolumeLandmark> = {
  chest: { mev: 8, mavMin: 12, mavMax: 18, mrv: 22 },
  back: { mev: 10, mavMin: 14, mavMax: 22, mrv: 25 },
  shoulder_mid: { mev: 8, mavMin: 16, mavMax: 22, mrv: 26 },
  biceps: { mev: 8, mavMin: 14, mavMax: 20, mrv: 24 },
  triceps: { mev: 6, mavMin: 10, mavMax: 14, mrv: 18 },
  quads: { mev: 8, mavMin: 12, mavMax: 18, mrv: 20 },
  hamstrings: { mev: 6, mavMin: 10, mavMax: 16, mrv: 20 },
  glutes: { mev: 4, mavMin: 8, mavMax: 14, mrv: 16 },
  calves: { mev: 8, mavMin: 12, mavMax: 16, mrv: 20 },
};

// User-facing Japanese labels for the 9 groups.
export const VOLUME_GROUP_LABEL_JA: Record<VolumeGroup, string> = {
  chest: '大胸筋',
  back: '広背筋',
  shoulder_mid: '三角筋(中部)',
  biceps: '上腕二頭筋',
  triceps: '上腕三頭筋',
  quads: '大腿四頭筋',
  hamstrings: 'ハムストリングス',
  glutes: '大臀筋',
  calves: 'カーフ',
};

// Display order — used by the dashboard so the 9 bars appear in a
// stable, anatomically-grouped sequence (push → pull → arms → legs).
export const VOLUME_GROUPS_ORDER: readonly VolumeGroup[] = [
  'chest',
  'back',
  'shoulder_mid',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
];

// === primary_muscle → VolumeGroup mapping — sign-off F7 ===
//
// "Strict派" mapping: 広背筋 only includes back_lat, not back_mid /
// back_lower / back_traps. The other 9-group thresholds correspond
// to single primary_muscle values one-to-one.
//
// `null` mapping = primary_muscle is not on the volume dashboard.
// This is by design — the 9 groups are the ones with published
// MEV/MAV/MRV thresholds; the 11 unmapped primary_muscles
// (back_mid/lower/traps, shoulder_front/rear, core_*, arms_forearm,
// legs_adductor, legs_calf — wait, calves IS mapped) get hidden
// rather than guessed-at.
//
// Future expansion (Build 16+ TODO 18): add 11 more groups + lookup
// when the literature catches up. UI will render up to N rows
// based on what's mapped.
export const PRIMARY_MUSCLE_TO_GROUP: Record<string, VolumeGroup | null> = {
  // Chest — all 3 sub-areas roll up to the 大胸筋 group.
  chest_upper: 'chest',
  chest_mid: 'chest',
  chest_lower: 'chest',
  // Back — strict 広背筋 = lats only.
  back_lat: 'back',
  back_mid: null,
  back_lower: null,
  back_traps: null,
  // Shoulders — 三角筋(中部) = mid-delt only.
  shoulder_mid: 'shoulder_mid',
  shoulder_front: null,
  shoulder_rear: null,
  // Arms.
  arms_biceps: 'biceps',
  arms_triceps: 'triceps',
  arms_forearm: null,
  // Legs.
  legs_quad: 'quads',
  legs_ham: 'hamstrings',
  legs_glute: 'glutes',
  legs_calf: 'calves',
  legs_adductor: null,
  // Core — no published landmarks.
  core_abs: null,
  core_obliques: null,
};

// === Pure helpers ===

export function mapPrimaryMuscleToVolumeGroup(
  primaryMuscle: string | null | undefined,
): VolumeGroup | null {
  if (!primaryMuscle) return null;
  // Object property access — `??` handles both 'unknown key' (returns
  // undefined) and 'mapped to null'. Both should yield null.
  const mapped = PRIMARY_MUSCLE_TO_GROUP[primaryMuscle];
  return mapped ?? null;
}

export function classifyVolume(
  weeklySets: number,
  group: VolumeGroup,
): VolumeZone {
  const lm = VOLUME_LANDMARKS[group];
  if (weeklySets < lm.mev) return 'below_mev';
  if (weeklySets < lm.mavMin) return 'mev_to_mav';
  if (weeklySets <= lm.mrv) return 'mav_to_mrv';
  return 'above_mrv';
}

// === Local-noon ISO date parsing ===
//
// Same helper Phase 1.1 derived for saveNarrativeToReport. Codex
// pass 1 there flagged the UTC-midnight bug (negative-offset users
// shifted into the prior calendar day); the same risk applies here
// since the caller passes a Date for the "reference" point of the
// week.
function parseISODateAsLocalNoon(weekStart: string): Date {
  const [y, m, d] = weekStart.split('-').map((p) => Number.parseInt(p, 10));
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

// === Aggregation ===

// Sum of hard sets per VolumeGroup over the week containing
// `weekStart` (Monday-anchored ISO week, inclusive of Sunday). Maps
// each set's exercise.primary_muscle through PRIMARY_MUSCLE_TO_GROUP,
// drops anything that maps to null. Warmup sets (`is_warmup=1`) are
// excluded — sign-off F1 hard-sets-only matches the RP/Israetel
// "weekly sets" convention.
//
// `weekStart` is a 'YYYY-MM-DD' string OR Date. When a string is
// passed, parseISODateAsLocalNoon avoids the UTC-midnight TZ bug
// the Phase 1.1 Codex pass already had us fix once.
//
// `dbOverride` is the standard test seam (Phase 1.1 / 1.3 pattern).
// In production callers don't pass it; tests inject a fake DB.
export async function aggregateWeeklySetsByMuscle(
  profileId: string,
  weekStart: string | Date,
  dbOverride?: SQLite.SQLiteDatabase,
): Promise<Record<VolumeGroup, number>> {
  const db = dbOverride ?? (await getDatabase());

  const refDate =
    typeof weekStart === 'string'
      ? parseISODateAsLocalNoon(weekStart)
      : weekStart;
  const monday = startOfWeek(refDate, { weekStartsOn: 1 });
  const sunday = endOfWeek(refDate, { weekStartsOn: 1 });
  const startStr = format(monday, 'yyyy-MM-dd');
  // Half-open right boundary — same shape as the Phase 2 hotfix
  // applied to weeklyReport's training query. started_at is an ISO
  // timestamp; comparing to a 'YYYY-MM-DD' upper bound and a closed
  // BETWEEN would miss late-evening sessions on Sunday.
  const dayAfterEnd = format(addDays(sunday, 1), 'yyyy-MM-dd');

  // Single SQL pass: join sets to their exercise, filter by the
  // session's started_at week + non-warmup + non-deleted, return
  // (primary_muscle, set_count). Aggregation by group happens in JS
  // because the 9-mapping table lives in code.
  const rows = await db.getAllAsync<{
    primary_muscle: string | null;
    set_count: number;
  }>(
    `SELECT e.primary_muscle AS primary_muscle, COUNT(*) AS set_count
       FROM workout_sets ws
       JOIN workout_sessions s ON s.id = ws.session_id
       JOIN exercises e ON e.id = ws.exercise_id
      WHERE s.profile_id = ?
        AND s.started_at >= ?
        AND s.started_at < ?
        AND s.deleted_at IS NULL
        AND ws.is_warmup = 0
        AND ws.deleted_at IS NULL
        AND e.deleted_at IS NULL
      GROUP BY e.primary_muscle`,
    [profileId, startStr, dayAfterEnd],
  );

  const result: Record<VolumeGroup, number> = {
    chest: 0,
    back: 0,
    shoulder_mid: 0,
    biceps: 0,
    triceps: 0,
    quads: 0,
    hamstrings: 0,
    glutes: 0,
    calves: 0,
  };

  for (const row of rows) {
    const group = mapPrimaryMuscleToVolumeGroup(row.primary_muscle);
    if (group === null) continue;
    result[group] += row.set_count;
  }

  return result;
}

// === Convenience: combine aggregation + classification ===

export interface VolumeGroupSummary {
  group: VolumeGroup;
  labelJa: string;
  weeklySets: number;
  zone: VolumeZone;
  landmark: VolumeLandmark;
}

export function summarizeVolumeGroups(
  weeklySets: Record<VolumeGroup, number>,
): VolumeGroupSummary[] {
  return VOLUME_GROUPS_ORDER.map((group) => {
    const sets = weeklySets[group] ?? 0;
    return {
      group,
      labelJa: VOLUME_GROUP_LABEL_JA[group],
      weeklySets: sets,
      zone: classifyVolume(sets, group),
      landmark: VOLUME_LANDMARKS[group],
    };
  });
}
