import type * as SQLite from 'expo-sqlite';
import { generateId } from '../../../utils/id';

// v28: user_equipment table + backfill from legacy profiles.equipment
// (Build 15 / Session 8 / Feature 5-元 client side).
//
// Mirrors the server-side migration which adds the same table with RLS
// + CHECK constraint pinning equipment_key to the 8 categories defined
// in src/constants/equipment.ts (Build 15 5-P).
//
// Backfill strategy (Syuto sign-off):
//   profiles.equipment = 'gym'        → all 8 categories
//   profiles.equipment = 'dumbbell'   → dumbbell + bodyweight
//   profiles.equipment = 'bodyweight' → bodyweight only
//
// Without backfill, every existing user would open settings/equipment
// and see an empty grid — and the 5-元 AI generator would refuse to
// produce a routine because no equipment is registered. The backfill
// gives them a sensible starting state inferred from their onboarding
// answer; the user can then add/remove individual chips.
//
// Idempotency:
//   - CREATE TABLE / INDEX guarded with IF NOT EXISTS.
//   - Backfill INSERT uses INSERT OR IGNORE against the
//     UNIQUE(profile_id, equipment_key) constraint, so re-running the
//     migration after partial state (or after the user customized via
//     UI in Phase 3) won't reintroduce previously-removed rows. Note:
//     SQLite's UNIQUE does NOT exclude soft-deleted rows, so a deleted
//     row still conflicts and the backfill is a no-op for it (= we
//     don't undelete user removals on re-run).
//
// Same pattern reasoning as v25 (slug backfill + equipment normalize):
// JS-side loop because the per-profile fanout count varies.

interface ProfileRow {
  id: string;
  equipment: string | null;
}

const EQUIPMENT_BACKFILL_MAP: Record<string, readonly string[]> = {
  gym: [
    'barbell',
    'dumbbell',
    'kettlebell',
    'machine',
    'bodyweight',
    'cardio',
    'stretching',
    'other',
  ],
  dumbbell: ['dumbbell', 'bodyweight'],
  bodyweight: ['bodyweight'],
};

export async function migrateV28(db: SQLite.SQLiteDatabase): Promise<void> {
  // 1. user_equipment table
  await db.execAsync(
    `CREATE TABLE IF NOT EXISTS user_equipment (
       id TEXT PRIMARY KEY,
       profile_id TEXT NOT NULL,
       equipment_key TEXT NOT NULL,
       available INTEGER NOT NULL DEFAULT 1,
       notes TEXT,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       deleted_at TEXT,
       synced_at TEXT,
       UNIQUE(profile_id, equipment_key)
     );`,
  );
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_user_equipment_profile
       ON user_equipment(profile_id);`,
  );

  // 2. Backfill from legacy profiles.equipment.
  const profiles = await db.getAllAsync<ProfileRow>(
    `SELECT id, equipment FROM profiles WHERE deleted_at IS NULL`,
  );
  for (const p of profiles) {
    const keys = EQUIPMENT_BACKFILL_MAP[p.equipment ?? ''] ?? [];
    for (const key of keys) {
      try {
        await db.runAsync(
          `INSERT OR IGNORE INTO user_equipment
             (id, profile_id, equipment_key, available, created_at, updated_at)
           VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))`,
          [generateId(), p.id, key],
        );
      } catch {
        // UNIQUE conflict on re-run — safe to ignore.
      }
    }
  }
}
