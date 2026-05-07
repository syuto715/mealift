import * as SQLite from 'expo-sqlite';
import { APP_CONFIG } from '../../constants/config';
import { migrateV1 } from './migrations/v1';
import { migrateV2 } from './migrations/v2';
import { migrateV3 } from './migrations/v3';
import { migrateV4 } from './migrations/v4';
import { migrateV5 } from './migrations/v5';
import { migrateV6 } from './migrations/v6';
import { migrateV7 } from './migrations/v7';
import { migrateV8 } from './migrations/v8';
import { migrateV9 } from './migrations/v9';
import { migrateV10 } from './migrations/v10';
import { migrateV11 } from './migrations/v11';
import { migrateV12 } from './migrations/v12';
import { migrateV13 } from './migrations/v13';
import { migrateV14 } from './migrations/v14';
import { migrateV15 } from './migrations/v15';
import { migrateV16 } from './migrations/v16';
import { migrateV17 } from './migrations/v17';
import { migrateV18 } from './migrations/v18';
import { migrateV19 } from './migrations/v19';
import { migrateV20 } from './migrations/v20';
import { migrateV21 } from './migrations/v21';
import { migrateV22 } from './migrations/v22';
import { migrateV23 } from './migrations/v23';
import { migrateV24 } from './migrations/v24';
import { migrateV25 } from './migrations/v25';
import { migrateV26 } from './migrations/v26';
import { migrateV27 } from './migrations/v27';
import { migrateV28 } from './migrations/v28';
import { seedExercisesV2 } from '../../../scripts/seed-exercises-v2/run';
import { seedFoods, seedExercises } from './seed/foods';
import { seedDishes } from './seed/dishes';
import { seedFitnessDishes } from './seed/fitnessDishes';
import { seedBarcodeProducts } from './seed/barcodeProducts';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;

  let db: SQLite.SQLiteDatabase;
  try {
    db = await SQLite.openDatabaseAsync(APP_CONFIG.DATABASE_NAME);
  } catch (error) {
    throw error;
  }

  try {
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await db.execAsync('PRAGMA foreign_keys = ON;');
  } catch (error) {
    // Continue — WAL / FK are optimizations, not required for basic operation
  }

  // Run migrations
  try {
    const result = await db.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version;',
    );
    const currentVersion = result?.user_version ?? 0;

    // NOTE: Seeds are intentionally NOT called inside per-version gates here.
    // Seeds reference columns that later migrations add (e.g. seedExercises
    // uses exercise_type / met_value which v12 introduces), so running them
    // before the full migration chain completes breaks fresh installs.
    // Seeds run unconditionally below, after every migration has applied.
    if (currentVersion < 1) {
      await migrateV1(db);
      await db.execAsync('PRAGMA user_version = 1;');
    }
    if (currentVersion < 2) {
      await migrateV2(db);
      await db.execAsync('PRAGMA user_version = 2;');
    }
    if (currentVersion < 3) {
      await migrateV3(db);
      await db.execAsync('PRAGMA user_version = 3;');
    }
    if (currentVersion < 4) {
      await migrateV4(db);
      await db.execAsync('PRAGMA user_version = 4;');
    }
    if (currentVersion < 5) {
      await migrateV5(db);
      await db.execAsync('PRAGMA user_version = 5;');
    }
    if (currentVersion < 6) {
      await migrateV6(db);
      await db.execAsync('PRAGMA user_version = 6;');
    }
    if (currentVersion < 7) {
      await migrateV7(db);
      await db.execAsync('PRAGMA user_version = 7;');
    }
    if (currentVersion < 8) {
      await migrateV8(db);
      await db.execAsync('PRAGMA user_version = 8;');
    }
    if (currentVersion < 9) {
      await migrateV9(db);
      await db.execAsync('PRAGMA user_version = 9;');
    }
    if (currentVersion < 10) {
      await migrateV10(db);
      await db.execAsync('PRAGMA user_version = 10;');
    }
    if (currentVersion < 11) {
      await migrateV11(db);
      await db.execAsync('PRAGMA user_version = 11;');
    }
    if (currentVersion < 12) {
      await migrateV12(db);
      await db.execAsync('PRAGMA user_version = 12;');
    }
    if (currentVersion < 13) {
      await migrateV13(db);
      await db.execAsync('PRAGMA user_version = 13;');
    }
    if (currentVersion < 14) {
      await migrateV14(db);
      await db.execAsync('PRAGMA user_version = 14;');
    }
    if (currentVersion < 15) {
      await migrateV15(db);
      await db.execAsync('PRAGMA user_version = 15;');
    }
    if (currentVersion < 16) {
      await migrateV16(db);
      await db.execAsync('PRAGMA user_version = 16;');
    }
    if (currentVersion < 17) {
      await migrateV17(db);
      await db.execAsync('PRAGMA user_version = 17;');
    }
    if (currentVersion < 18) {
      await migrateV18(db);
      await db.execAsync('PRAGMA user_version = 18;');
    }
    if (currentVersion < 19) {
      await migrateV19(db);
      await db.execAsync('PRAGMA user_version = 19;');
    }
    if (currentVersion < 20) {
      await migrateV20(db);
      await db.execAsync('PRAGMA user_version = 20;');
    }
    if (currentVersion < 21) {
      await migrateV21(db);
      await db.execAsync('PRAGMA user_version = 21;');
    }
    if (currentVersion < 22) {
      await migrateV22(db);
      await db.execAsync('PRAGMA user_version = 22;');
    }
    if (currentVersion < 23) {
      await migrateV23(db);
      await db.execAsync('PRAGMA user_version = 23;');
    }
    if (currentVersion < 24) {
      await migrateV24(db);
      await db.execAsync('PRAGMA user_version = 24;');
    }
    if (currentVersion < 25) {
      await migrateV25(db);
      await db.execAsync('PRAGMA user_version = 25;');
    }
    if (currentVersion < 26) {
      await migrateV26(db);
      await db.execAsync('PRAGMA user_version = 26;');
    }
    if (currentVersion < 27) {
      await migrateV27(db);
      await db.execAsync('PRAGMA user_version = 27;');
    }
    if (currentVersion < 28) {
      await migrateV28(db);
      await db.execAsync('PRAGMA user_version = 28;');
    }

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }

  // Always run seedFoods to pick up newly added items (uses INSERT OR IGNORE)
  try {
    await seedFoods(db);
  } catch (error) {
  }

  // Re-seed exercises on every boot so new cardio / sports entries appear on
  // existing installs. INSERT OR IGNORE skips rows already present, so this is
  // cheap after the first run.
  try {
    await seedExercises(db);
  } catch (error) {
  }

  // Build 15 / Feature 5-A: refresh v2 metadata on existing strength rows
  // and insert new strength variations via UPSERT(slug). Runs after
  // seedExercises so the existing 85 base rows are guaranteed present
  // before the v2 UPSERT touches them. Idempotent; ~50ms per boot.
  try {
    await seedExercisesV2(db);
  } catch (error) {
  }

  // Safety net: re-seed if dishes table is empty
  try {
    const dishCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM dishes',
    );
    if (!dishCount || dishCount.count === 0) {
      await seedDishes(db);
    }
  } catch (error) {
  }

  // Seed fitness dishes (recipe-calculator-grounded). Internally gated on
  // `id LIKE 'fitness_%'` count > 0, so first run inserts and subsequent
  // boots are no-ops. Runs after seedFoods so the foodId resolutions hit.
  try {
    await seedFitnessDishes(db);
  } catch (error) {
  }

  // Safety net: re-seed barcode products if empty
  try {
    const barcodeCount = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM barcode_foods WHERE source = 'preset'",
    );
    if (!barcodeCount || barcodeCount.count === 0) {
      await seedBarcodeProducts(db);
    }
  } catch (error) {
  }

  dbInstance = db;
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    try {
      await dbInstance.closeAsync();
    } catch (error) {
    }
    dbInstance = null;
  }
}

export async function resetAllData(): Promise<void> {
  const db = await getDatabase();
  const USER_TABLES = [
    'meal_log_items',
    'meal_templates',
    'workout_sets',
    'workout_sessions',
    'workout_routine_items',
    'workout_routines',
    'body_logs',
    'notes',
    'progress_photos',
    'profiles',
  ];
  for (const table of USER_TABLES) {
    await db.runAsync(`DELETE FROM ${table}`);
  }
}
