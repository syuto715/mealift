import { getDatabase } from '../database/connection';
import { generateId } from '../../utils/id';
import { enqueueRowFromTable } from './syncRepository';
import type { OneRepMaxFormula } from '../../domain/oneRepMax';

// Persisted shape of a single estimated_1rm row. Mirrors the v26
// SQLite columns; the sync layer translates this to the
// public.user_estimated_1rm Postgres row.
export interface E1RMObservation {
  id: string;
  profileId: string;
  exerciseId: string;
  e1rmKg: number;
  formula: OneRepMaxFormula;
  sourceSetId: string | null;
  observedAt: string;
  createdAt: string;
}

interface InsertInput {
  profileId: string;
  exerciseId: string;
  e1rmKg: number;
  formula: OneRepMaxFormula;
  sourceSetId?: string | null;
  // observedAt = workout_sets.created_at of the source set. Falls back
  // to "now" when the caller didn't capture a source-set timestamp.
  observedAt?: string;
}

function rowToObservation(row: Record<string, unknown>): E1RMObservation {
  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    exerciseId: row.exercise_id as string,
    e1rmKg: row.e1rm_kg as number,
    formula: row.formula as OneRepMaxFormula,
    sourceSetId: (row.source_set_id as string) ?? null,
    observedAt: row.observed_at as string,
    createdAt: row.created_at as string,
  };
}

// Insert a single 1RM observation row. Idempotent on (profile, exercise,
// source_set_id) is the caller's responsibility — we don't reject
// duplicates here. The granular log lets the chart paint the full curve;
// dedup is unnecessary as long as the addSet hook only fires once per
// completed set.
export async function insertE1RMObservation(
  input: InsertInput,
): Promise<E1RMObservation> {
  const db = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  const observedAt = input.observedAt ?? now;

  await db.runAsync(
    `INSERT INTO estimated_1rm
       (id, profile_id, exercise_id, e1rm_kg, formula, source_set_id,
        observed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.profileId,
      input.exerciseId,
      input.e1rmKg,
      input.formula,
      input.sourceSetId ?? null,
      observedAt,
      now,
      now,
    ],
  );
  await enqueueRowFromTable('estimated_1rm', id, 'INSERT');

  return {
    id,
    profileId: input.profileId,
    exerciseId: input.exerciseId,
    e1rmKg: input.e1rmKg,
    formula: input.formula,
    sourceSetId: input.sourceSetId ?? null,
    observedAt,
    createdAt: now,
  };
}

// Latest observation per (profile, exercise) — used to surface the
// "current" e1rm in widgets and to compare against incoming sets.
export async function getCurrentE1RM(
  profileId: string,
  exerciseId: string,
): Promise<E1RMObservation | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM estimated_1rm
      WHERE profile_id = ? AND exercise_id = ? AND deleted_at IS NULL
      ORDER BY observed_at DESC
      LIMIT 1`,
    [profileId, exerciseId],
  );
  return row ? rowToObservation(row) : null;
}

// History points within a time window — drives the pr-detail line
// chart. Default window = 90 days per design §6.5.6.
export async function getE1RMHistory(
  profileId: string,
  exerciseId: string,
  sinceISODate: string,
): Promise<E1RMObservation[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM estimated_1rm
      WHERE profile_id = ? AND exercise_id = ?
        AND observed_at >= ?
        AND deleted_at IS NULL
      ORDER BY observed_at ASC`,
    [profileId, exerciseId, sinceISODate],
  );
  return rows.map(rowToObservation);
}

// S4-1 — 週次トレーニングレポートの種目別週間ベスト e1RM (read-only)。
// getE1RMHistory は下限のみ + 種目単位なので週切り出し・全種目横断には使えない
// (上限なしで今週分が前週側に混入する)。
//
// - 区間は [startIso, endIso) の半開。observed_at は addSet 経由の
//   toISOString canonical 形式だが、sync pull 由来の形式混在に備えて
//   datetime() 正規化で比較する (Sprint TZ 規約)。
// - MAX は formula を問わず全行が対象 ('avg' と RPE 補正の 'adjusted' の
//   両方)。「その週に観測された最良の推定値」という週間ベスト意味論で、
//   今週/前週とも同一ルールなので比較の基準は揃う。
// - 破棄セッション由来の行は discardSession が estimated_1rm も tombstone
//   するため deleted_at IS NULL で除外される。exercises 側の tombstone も
//   JOIN 条件でガード。
export interface WeeklyMaxE1RM {
  exerciseId: string;
  exerciseNameJa: string;
  maxE1rmKg: number;
}

export async function getWeeklyMaxE1RMs(
  profileId: string,
  startIso: string,
  endIso: string,
): Promise<WeeklyMaxE1RM[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    exercise_id: string;
    exercise_name_ja: string;
    max_e1rm_kg: number;
  }>(
    `SELECT e1.exercise_id AS exercise_id,
            ex.name_ja AS exercise_name_ja,
            MAX(e1.e1rm_kg) AS max_e1rm_kg
       FROM estimated_1rm e1
       JOIN exercises ex ON ex.id = e1.exercise_id AND ex.deleted_at IS NULL
      WHERE e1.profile_id = ?
        AND datetime(e1.observed_at) >= datetime(?)
        AND datetime(e1.observed_at) < datetime(?)
        AND e1.deleted_at IS NULL
      GROUP BY e1.exercise_id
      ORDER BY max_e1rm_kg DESC`,
    [profileId, startIso, endIso],
  );
  return rows.map((row) => ({
    exerciseId: row.exercise_id,
    exerciseNameJa: row.exercise_name_ja,
    maxE1rmKg: row.max_e1rm_kg,
  }));
}
