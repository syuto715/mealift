import type * as SQLite from 'expo-sqlite';

// Phase 8 migration: adaptive goal, goal prediction, PRs, water tracking,
// food aliases, rest-timer defaults, onboarding versioning.
export async function migrateV7(db: SQLite.SQLiteDatabase): Promise<void> {
  const addCol = async (table: string, col: string, type: string, defaultVal?: string) => {
    const def = defaultVal != null ? ` DEFAULT ${defaultVal}` : '';
    try {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}${def};`);
    } catch {
      // already exists
    }
  };

  // --- profiles: adaptive goal + water + onboarding version ---
  await addCol('profiles', 'adaptive_goal_enabled', 'INTEGER', '1');
  await addCol('profiles', 'adaptive_goal_sensitivity', 'TEXT', "'standard'");
  await addCol('profiles', 'adaptive_goal_last_shown_at', 'TEXT');
  await addCol('profiles', 'daily_water_target_ml', 'INTEGER', '2500');
  await addCol('profiles', 'onboarding_version', 'INTEGER', '1');

  // --- exercises: default rest seconds ---
  await addCol('exercises', 'default_rest_seconds', 'INTEGER', '90');

  // --- adaptive_goal_suggestions ---
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS adaptive_goal_suggestions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      suggestion_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_adaptive_goal_user_created
      ON adaptive_goal_suggestions(user_id, created_at DESC);
  `);

  // --- personal_records ---
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS personal_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      record_type TEXT NOT NULL CHECK (record_type IN ('estimated_1rm', 'max_weight', 'max_volume_session', 'max_reps_at_weight')),
      value REAL NOT NULL,
      weight_kg REAL NOT NULL,
      reps INTEGER NOT NULL,
      achieved_at TEXT NOT NULL,
      session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_prs_exercise_type_value
      ON personal_records(exercise_id, record_type, value DESC);
    CREATE INDEX IF NOT EXISTS idx_prs_user_achieved
      ON personal_records(user_id, achieved_at DESC);
  `);

  // --- water_logs ---
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS water_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount_ml INTEGER NOT NULL,
      logged_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_water_logs_user_date
      ON water_logs(user_id, logged_at);
  `);

  // --- food_aliases ---
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS food_aliases (
      id TEXT PRIMARY KEY,
      food_id TEXT NOT NULL,
      alias_name TEXT NOT NULL,
      alias_type TEXT NOT NULL DEFAULT 'common' CHECK (alias_type IN ('kana', 'short', 'brand', 'common')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_food_aliases_name ON food_aliases(alias_name);
    CREATE INDEX IF NOT EXISTS idx_food_aliases_food ON food_aliases(food_id);
  `);

  // --- meal_templates: add missing columns if not present ---
  await addCol('meal_templates', 'description', 'TEXT');
  await addCol('meal_templates', 'last_used_at', 'TEXT');

  // Seed default_rest_seconds based on exercise categories
  // Big 3
  await db.runAsync(
    `UPDATE exercises SET default_rest_seconds = 180
     WHERE (name_ja LIKE '%スクワット%' OR name_ja LIKE '%ベンチプレス%' OR name_ja LIKE '%デッドリフト%')
       AND default_rest_seconds = 90`
  );
  // Main compound lifts
  await db.runAsync(
    `UPDATE exercises SET default_rest_seconds = 120
     WHERE (name_ja LIKE '%ローイング%' OR name_ja LIKE '%プレス%' OR name_ja LIKE '%懸垂%' OR name_ja LIKE '%プルアップ%' OR name_ja LIKE '%ラットプル%')
       AND default_rest_seconds = 90`
  );
  // Isolation lifts
  await db.runAsync(
    `UPDATE exercises SET default_rest_seconds = 60
     WHERE (name_ja LIKE '%カール%' OR name_ja LIKE '%エクステンション%' OR name_ja LIKE '%レイズ%' OR name_ja LIKE '%フライ%')
       AND default_rest_seconds = 90`
  );
}
