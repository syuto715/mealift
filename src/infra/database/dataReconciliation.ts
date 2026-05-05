import type { SQLiteDatabase } from 'expo-sqlite';

// claimLocalDataForUser — first-time hand-off between an unclaimed local
// profile (random UUID generated at onboarding) and a Supabase auth user
// (auth.uid()). Called once after Apple Sign In or any other authenticated
// login; subsequent calls are idempotent no-ops.
//
// What gets remapped, in a single transaction with deferred FK checks:
//   - profiles.id          → authUid
//   - profiles.supabase_uid → authUid (also marks the profile as claimed)
//   - 8 child tables' profile_id column (body_logs, workout_routines,
//     workout_sessions, meal_logs, notes, meal_templates, weekly_reports,
//     progress_photos)
//   - 3 child tables' user_id column (personal_records, water_logs,
//     adaptive_goal_suggestions)
//
// Tables that have NO profile_id / user_id column are NOT touched. They
// either link by parent id (workout_routine_items, workout_sets,
// meal_log_items, dish_ingredients) so the parent's id is what changes
// and the child's FK column stays consistent automatically, or they're
// canonical/global tables (foods, exercises, dishes) where rows aren't
// per-user even when filtered by is_custom / is_my_dish.
//
// FK consideration: progress_photos and weekly_reports have FOREIGN KEY
// references to profiles(id) ON DELETE CASCADE. Without
// `defer_foreign_keys`, updating profiles.id would trigger the FK check
// before the child rows have been remapped. PRAGMA defer_foreign_keys = ON
// at transaction start defers the check to COMMIT, by which time all
// references have been updated to the same authUid.

export type ClaimResult =
  | { kind: 'no_profile' }
  | { kind: 'already_claimed_same_uid' }
  | { kind: 'conflict_different_uid'; existingUid: string }
  | { kind: 'remapped'; oldId: string; rowsAffected: number };

interface ProfileRow {
  id: string;
  supabase_uid: string | null;
}

const TABLES_WITH_PROFILE_ID: readonly string[] = [
  'body_logs',
  'workout_routines',
  'workout_sessions',
  'meal_logs',
  'notes',
  'meal_templates',
  'weekly_reports',
  'progress_photos',
];

const TABLES_WITH_USER_ID: readonly string[] = [
  'personal_records',
  'water_logs',
  'adaptive_goal_suggestions',
];

export async function claimLocalDataForUser(
  db: SQLiteDatabase,
  authUid: string,
): Promise<ClaimResult> {
  // Read existing profile. No deleted_at filter here on purpose: even a
  // soft-deleted profile needs to be remapped (the user might restore it),
  // and supabase_uid is the only signal we trust to detect prior claims.
  const profile = await db.getFirstAsync<ProfileRow>(
    'SELECT id, supabase_uid FROM profiles LIMIT 1',
  );

  if (!profile) {
    return { kind: 'no_profile' };
  }

  // Already claimed to this auth user → idempotent no-op. Apple Sign In
  // can fire this code path repeatedly (every fresh login on the same
  // device); we must short-circuit cleanly without writing.
  if (profile.supabase_uid === authUid) {
    return { kind: 'already_claimed_same_uid' };
  }

  // Already claimed to a DIFFERENT auth identity → cross-account conflict.
  // Refusing to remap protects the previous user's data from being
  // attributed to the new auth user. Caller (authStore.loginWithApple)
  // signs out of Supabase and surfaces a UI message.
  if (
    profile.supabase_uid !== null &&
    profile.supabase_uid !== authUid
  ) {
    return {
      kind: 'conflict_different_uid',
      existingUid: profile.supabase_uid,
    };
  }

  // supabase_uid IS NULL: first claim. Run the remap.
  const oldId = profile.id;
  let rowsAffected = 0;

  await db.execAsync('BEGIN TRANSACTION');
  try {
    // Defer FK checks to COMMIT — needed for the FK from progress_photos
    // and weekly_reports to profiles(id).
    await db.execAsync('PRAGMA defer_foreign_keys = ON');

    const profileResult = await db.runAsync(
      "UPDATE profiles SET id = ?, supabase_uid = ?, updated_at = datetime('now') WHERE id = ?",
      [authUid, authUid, oldId],
    );
    rowsAffected += profileResult.changes;

    for (const table of TABLES_WITH_PROFILE_ID) {
      const result = await db.runAsync(
        `UPDATE ${table} SET profile_id = ?, updated_at = datetime('now') WHERE profile_id = ?`,
        [authUid, oldId],
      );
      rowsAffected += result.changes;
    }

    for (const table of TABLES_WITH_USER_ID) {
      const result = await db.runAsync(
        `UPDATE ${table} SET user_id = ?, updated_at = datetime('now') WHERE user_id = ?`,
        [authUid, oldId],
      );
      rowsAffected += result.changes;
    }

    await db.execAsync('COMMIT');
    return { kind: 'remapped', oldId, rowsAffected };
  } catch (e) {
    // Best-effort rollback. If the transaction is already aborted by
    // SQLite (e.g. constraint violation deferred to commit), ROLLBACK
    // may itself error — swallow that to surface the original cause.
    try {
      await db.execAsync('ROLLBACK');
    } catch {
      // Original error wins.
    }
    throw e;
  }
}
