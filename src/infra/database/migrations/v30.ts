import type * as SQLite from 'expo-sqlite';

// v30: Onboarding v2 schema (Mealift v1.3.0 / Onboarding 13-screen flow).
//
// 10 new columns on `profiles` for the multi-step onboarding the app
// introduces in v1.3.0. Existing Build 14/15 user data is preserved
// — every new column defaults to NULL and gets populated during the
// new flow. Users who never run the v2 onboarding (Build 14/15
// holdouts that never upgrade) keep working with the old defaults.
//
// CHECK constraints intentionally OMITTED on the SQLite side. This
// matches the v26 convention (set_pattern / set_type) where Postgres
// carries the CHECKs and the client relies on app-level validation
// (TypeScript unions in src/types). SQLite ALTER TABLE can't add
// CHECKs to existing columns anyway, so server-only CHECK constraints
// keep the migration paths symmetric.
//
// Date columns (onboarding_started_at, estimated_target_date) store
// TEXT (ISO 8601 UTC). Matches profiles.created_at / updated_at
// codebase convention and lets Phase 6.1's UTC-ISO regex defense
// apply uniformly. Postgres mirror migration uses TIMESTAMPTZ; the
// shape difference is the standard SQLite/Postgres asymmetry already
// encoded in v23 + v26.
//
// Idempotency: every ALTER guarded with `addColumnIfMissing`, so
// re-running the migration on a partially-applied database is safe.

interface ColumnInfo {
  name: string;
}

async function getExistingColumns(
  db: SQLite.SQLiteDatabase,
  table: string,
): Promise<Set<string>> {
  const rows = await db.getAllAsync<ColumnInfo>(
    `PRAGMA table_info(${table});`,
  );
  return new Set(rows.map((c) => c.name));
}

async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  existing: Set<string>,
  column: string,
  definition: string,
): Promise<void> {
  if (existing.has(column)) return;
  try {
    await db.execAsync(
      `ALTER TABLE profiles ADD COLUMN ${column} ${definition};`,
    );
  } catch {
    // Race / column already exists in some other path — safe to
    // ignore. The pre-check via PRAGMA table_info already covers
    // the common case; this catch handles a parallel migrator.
  }
}

export async function migrateV30(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await getExistingColumns(db, 'profiles');

  // Section 1 — identity (1 column)
  // Optional ニックネーム, 1-20 chars (validated app-side).
  // Distinct from `display_name` which is the Supabase-derived
  // login identity; nickname is the warm onboarding copy ("[X]さん"
  // throughout the app).
  await addColumnIfMissing(db, cols, 'nickname', 'TEXT');

  // Section 2 — goal pace + meal plan (3 columns)
  // weekly_rate_pct: -1.0 / -0.7 / -0.5 / -0.25 / 0 / 0.25 (kickoff §5.5)
  await addColumnIfMissing(db, cols, 'weekly_rate_pct', 'REAL');
  // meal_plan: balanced / washoku / high_protein / low_carb / fasting (kickoff §6)
  await addColumnIfMissing(db, cols, 'meal_plan', 'TEXT');
  // meal_timings: JSON array of meal slots (breakfast / lunch / dinner / snacks etc, kickoff §7)
  await addColumnIfMissing(db, cols, 'meal_timings', 'TEXT');

  // Section 3 — protein factor + weekly distribution (3 columns)
  // protein_factor: 1.0 / 1.6 / 2.2 / 3.0 g/kg (kickoff §8). Not
  // overlap with target_protein_g — that one is the absolute daily
  // grams target derived FROM protein_factor × current_weight at
  // [11] personalize step. protein_factor stays mutable so the user
  // can re-apply later as their training intensity changes.
  await addColumnIfMissing(db, cols, 'protein_factor', 'REAL');
  // weekly_distribution: even / cheat_days (kickoff §9)
  await addColumnIfMissing(db, cols, 'weekly_distribution', 'TEXT');
  // cheat_days: JSON array of day-of-week indices (0=Sun..6=Sat) (kickoff §9)
  await addColumnIfMissing(db, cols, 'cheat_days', 'TEXT');

  // Section 4 — onboarding state cache (3 columns)
  // onboarding_step: 0..13 (or 14 for iOS), drives mid-onboarding
  // resume. 0 = not started. Existing Build 14/15 users with
  // onboarding_completed=true get auto-set to durationWeeks complete
  // by app/index.tsx onboarding redirect (Phase E-1).
  await addColumnIfMissing(db, cols, 'onboarding_step', 'INTEGER DEFAULT 0');
  // onboarding_started_at: ISO 8601 UTC timestamp; null until [1] tap.
  await addColumnIfMissing(db, cols, 'onboarding_started_at', 'TEXT');
  // estimated_target_date: ISO 8601 UTC timestamp; calculated cache
  // from estimateTargetDate (kickoff §8.4). Recomputed on weight /
  // pace edits.
  await addColumnIfMissing(db, cols, 'estimated_target_date', 'TEXT');
}
