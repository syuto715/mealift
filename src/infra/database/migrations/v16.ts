import type * as SQLite from 'expo-sqlite';

// v16: user-submitted foods (Commit 1 of the user-submission feature).
//
// Adds a single new table, `user_submitted_foods`, that holds every food
// row a user has authored. The same row services two purposes at once:
//
//   1. `submission_status = 'local'` rows are the user's private library —
//      they show up in their own search even before any review.
//   2. `submission_status = 'pending_review' | 'approved' | 'rejected'`
//      rows mirror the lifecycle of a copy held in Supabase
//      `public_foods`. `remote_id` links the local row to the canonical
//      Supabase UUID; `synced_at` records the last successful sync.
//
// The nutrient column set mirrors `barcode_foods` (v4) so that approved
// rows can be promoted into the search pool without column gymnastics.
// Naming follows the existing `foods` / `barcode_foods` convention
// (`calories_per_serving`, `serving_size_g`) — the spec used
// `calories_kcal` / `serving_g`, but aligning with the legacy tables
// keeps the eventual sync code trivial.
//
// What this migration deliberately does NOT do:
//   - It does not ALTER `foods` to add `source`. That column has existed
//     since v1 (`source TEXT NOT NULL DEFAULT 'manual'`), so the spec's
//     proposed v16 ALTER is a no-op and we skip it.
//   - It does not seed any rows. User submissions populate via the UI.
//     `seed/data/userSubmittedFoodSamples.ts` provides hand-loadable
//     fixtures for QA.
export async function migrateV16(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS user_submitted_foods (
      id TEXT PRIMARY KEY,
      name_ja TEXT NOT NULL,
      name_en TEXT,
      brand TEXT,
      barcode TEXT,
      serving_size_g REAL NOT NULL DEFAULT 100,
      serving_unit TEXT NOT NULL DEFAULT 'g',
      serving_description TEXT,

      -- Macros (per serving)
      calories_per_serving REAL NOT NULL,
      protein_g REAL NOT NULL DEFAULT 0,
      fat_g REAL NOT NULL DEFAULT 0,
      carb_g REAL NOT NULL DEFAULT 0,

      -- Extended nutrients — mirrors barcode_foods (v4) so approved rows
      -- can be promoted without column reshape.
      fiber_g REAL,
      sugar_g REAL,
      salt_g REAL,
      sodium_mg REAL,
      saturated_fat_g REAL,
      cholesterol_mg REAL,
      calcium_mg REAL,
      iron_mg REAL,
      vitamin_a_ug REAL,
      vitamin_b1_mg REAL,
      vitamin_b2_mg REAL,
      vitamin_c_mg REAL,
      vitamin_d_ug REAL,
      vitamin_e_mg REAL,
      potassium_mg REAL,
      magnesium_mg REAL,
      zinc_mg REAL,

      -- Submission metadata
      source_type TEXT NOT NULL CHECK (source_type IN (
        'package_label', 'menu_board', 'official_site', 'estimation', 'other'
      )),
      source_photo_uri TEXT,
      notes TEXT,

      -- Lifecycle
      submission_status TEXT NOT NULL DEFAULT 'local' CHECK (submission_status IN (
        'local', 'pending_review', 'approved', 'rejected'
      )),
      rejection_reason TEXT,
      remote_id TEXT,
      synced_at TEXT,

      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_user_submitted_foods_status
      ON user_submitted_foods(submission_status);
    CREATE INDEX IF NOT EXISTS idx_user_submitted_foods_barcode
      ON user_submitted_foods(barcode)
      WHERE barcode IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_user_submitted_foods_name
      ON user_submitted_foods(name_ja);
    CREATE INDEX IF NOT EXISTS idx_user_submitted_foods_remote
      ON user_submitted_foods(remote_id)
      WHERE remote_id IS NOT NULL;
  `);
}
