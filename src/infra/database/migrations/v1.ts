import * as SQLite from 'expo-sqlite';

export async function migrateV1(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    -- ユーザープロフィール
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      supabase_uid TEXT,
      display_name TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
      birth_year INTEGER NOT NULL,
      height_cm REAL NOT NULL,
      current_weight_kg REAL NOT NULL,
      target_weight_kg REAL,
      target_body_fat_pct REAL,
      goal_type TEXT NOT NULL CHECK (goal_type IN ('cut', 'bulk', 'maintain', 'recomp')),
      activity_level TEXT NOT NULL CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
      training_days_per_week INTEGER NOT NULL DEFAULT 3,
      target_date TEXT,
      equipment TEXT NOT NULL CHECK (equipment IN ('gym', 'dumbbell', 'bodyweight')),
      target_calories INTEGER,
      target_protein_g INTEGER,
      target_fat_g INTEGER,
      target_carb_g INTEGER,
      onboarding_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 体重・体脂肪ログ
    CREATE TABLE IF NOT EXISTS body_logs (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      date TEXT NOT NULL,
      weight_kg REAL,
      body_fat_pct REAL,
      muscle_mass_kg REAL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(profile_id, date)
    );

    -- 種目マスター
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      name_ja TEXT NOT NULL,
      name_en TEXT,
      muscle_group TEXT NOT NULL,
      secondary_muscles TEXT,
      equipment TEXT,
      is_custom INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ルーティン
    CREATE TABLE IF NOT EXISTS workout_routines (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ルーティン内の種目
    CREATE TABLE IF NOT EXISTS workout_routine_items (
      id TEXT PRIMARY KEY,
      routine_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      target_sets INTEGER NOT NULL DEFAULT 3,
      target_reps TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (routine_id) REFERENCES workout_routines(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );

    -- ワークアウトセッション
    CREATE TABLE IF NOT EXISTS workout_sessions (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      routine_id TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      duration_seconds INTEGER,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- セット記録
    CREATE TABLE IF NOT EXISTS workout_sets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      weight_kg REAL,
      reps INTEGER,
      rpe REAL,
      rir INTEGER,
      is_warmup INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );

    -- 食品マスター
    CREATE TABLE IF NOT EXISTS foods (
      id TEXT PRIMARY KEY,
      name_ja TEXT NOT NULL,
      name_en TEXT,
      brand TEXT,
      barcode TEXT,
      serving_size_g REAL NOT NULL DEFAULT 100,
      serving_unit TEXT NOT NULL DEFAULT 'g',
      calories_per_serving REAL NOT NULL,
      protein_g REAL NOT NULL DEFAULT 0,
      fat_g REAL NOT NULL DEFAULT 0,
      carb_g REAL NOT NULL DEFAULT 0,
      fiber_g REAL,
      source TEXT NOT NULL DEFAULT 'manual',
      is_custom INTEGER NOT NULL DEFAULT 0,
      use_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 食事ログ
    CREATE TABLE IF NOT EXISTS meal_logs (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      date TEXT NOT NULL,
      meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 食事ログ明細
    CREATE TABLE IF NOT EXISTS meal_log_items (
      id TEXT PRIMARY KEY,
      meal_log_id TEXT NOT NULL,
      food_id TEXT,
      food_name TEXT NOT NULL,
      serving_amount REAL NOT NULL DEFAULT 1,
      serving_unit TEXT NOT NULL DEFAULT 'g',
      calories REAL NOT NULL,
      protein_g REAL NOT NULL DEFAULT 0,
      fat_g REAL NOT NULL DEFAULT 0,
      carb_g REAL NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (meal_log_id) REFERENCES meal_logs(id) ON DELETE CASCADE
    );

    -- メモ
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      date TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('training', 'nutrition', 'condition', 'general')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- テンプレ食事
    CREATE TABLE IF NOT EXISTS meal_templates (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      name TEXT NOT NULL,
      meal_type TEXT CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
      items TEXT NOT NULL,
      use_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 同期キュー
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0
    );

    -- インデックス
    CREATE INDEX IF NOT EXISTS idx_body_logs_date ON body_logs(profile_id, date);
    CREATE INDEX IF NOT EXISTS idx_workout_sessions_date ON workout_sessions(profile_id, started_at);
    CREATE INDEX IF NOT EXISTS idx_workout_sets_session ON workout_sets(session_id);
    CREATE INDEX IF NOT EXISTS idx_meal_logs_date ON meal_logs(profile_id, date);
    CREATE INDEX IF NOT EXISTS idx_meal_log_items_meal ON meal_log_items(meal_log_id);
    CREATE INDEX IF NOT EXISTS idx_foods_name ON foods(name_ja);
    CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods(barcode);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_pending ON sync_queue(synced_at) WHERE synced_at IS NULL;
  `);
}
