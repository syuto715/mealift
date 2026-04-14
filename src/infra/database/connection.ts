import * as SQLite from 'expo-sqlite';
import { APP_CONFIG } from '../../constants/config';
import { migrateV1 } from './migrations/v1';
import { migrateV2 } from './migrations/v2';
import { migrateV3 } from './migrations/v3';
import { migrateV4 } from './migrations/v4';
import { migrateV5 } from './migrations/v5';
import { migrateV6 } from './migrations/v6';
import { seedFoods, seedExercises } from './seed/foods';
import { seedDishes } from './seed/dishes';
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

    if (currentVersion < 1) {
      await migrateV1(db);
      await seedFoods(db);
      await seedExercises(db);
      await db.execAsync('PRAGMA user_version = 1;');
    }
    if (currentVersion < 2) {
      await migrateV2(db);
      await db.execAsync('PRAGMA user_version = 2;');
    }
    if (currentVersion < 3) {
      await migrateV3(db);
      await seedDishes(db);
      await db.execAsync('PRAGMA user_version = 3;');
    }
    if (currentVersion < 4) {
      await migrateV4(db);
      await seedBarcodeProducts(db);
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
  } catch (error) {
    throw error;
  }

  // Always run seedFoods to pick up newly added items (uses INSERT OR IGNORE)
  try {
    await seedFoods(db);
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
