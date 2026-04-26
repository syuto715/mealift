import * as SQLite from 'expo-sqlite';
import { FOODS } from '../../../constants/foods';
import { GENERIC_FOODS } from '../../../constants/genericFoods';
import { EXERCISES } from '../../../constants/exercises';
import { getAllAliasSeeds } from '../../../constants/foodAliases';
import { generateId } from '../../../utils/id';
import MEXT_FOODS_JSON from './data/foods-mext.json';
import MEXT_ALIASES_JSON from './data/aliases-mext.json';

interface MextFoodRow {
  id: string;
  nameJa: string;
  nameEn: string | null;
  brand: string | null;
  category: string;
  servingSizeG: number;
  servingUnit: string;
  caloriesPerServing: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number | null;
  sodiumMg: number | null;
  calciumMg: number | null;
  ironMg: number | null;
  vitaminAUg: number | null;
  vitaminB1Mg: number | null;
  vitaminB2Mg: number | null;
  vitaminB6Mg: number | null;
  vitaminB12Ug: number | null;
  folateUg: number | null;
  vitaminCMg: number | null;
  vitaminDUg: number | null;
  vitaminEMg: number | null;
  potassiumMg: number | null;
  magnesiumMg: number | null;
  zincMg: number | null;
  cholesterolMg: number | null;
  saturatedFatG: number | null;
  sugarG: number | null;
  saltG: number | null;
  source: 'mext';
  isCommon: boolean;
}

interface MextAliasRow {
  foodId: string;
  aliasName: string;
  aliasType: 'kana' | 'short' | 'brand' | 'common';
}

const MEXT_FOODS = MEXT_FOODS_JSON as MextFoodRow[];
const MEXT_ALIASES = MEXT_ALIASES_JSON as MextAliasRow[];

export async function seedFoods(db: SQLite.SQLiteDatabase): Promise<void> {
  const existingCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM foods WHERE is_custom = 0'
  );
  const existing = existingCount?.count ?? 0;
  void existing;


  // Always run INSERT OR IGNORE to add any missing foods (e.g. newly added items)
  let inserted = 0;
  let updated = 0;
  for (const food of FOODS) {
    try {
      const result = await db.runAsync(
        `INSERT OR IGNORE INTO foods (id, name_ja, name_en, brand, serving_size_g, serving_unit, calories_per_serving, protein_g, fat_g, carb_g, fiber_g, sodium_mg, calcium_mg, iron_mg, vitamin_a_ug, vitamin_b1_mg, vitamin_b2_mg, vitamin_b6_mg, vitamin_b12_ug, folate_ug, vitamin_c_mg, vitamin_d_ug, vitamin_e_mg, potassium_mg, magnesium_mg, zinc_mg, cholesterol_mg, saturated_fat_g, sugar_g, salt_g, source, is_custom, is_common)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'mext', 0, 1)`,
        [
          food.id,
          food.nameJa,
          food.nameEn,
          food.brand,
          food.servingSizeG,
          food.servingUnit,
          food.caloriesPerServing,
          food.proteinG,
          food.fatG,
          food.carbG,
          food.fiberG ?? null,
          food.sodiumMg ?? null,
          food.calciumMg ?? null,
          food.ironMg ?? null,
          food.vitaminAUg ?? null,
          food.vitaminB1Mg ?? null,
          food.vitaminB2Mg ?? null,
          food.vitaminB6Mg ?? null,
          food.vitaminB12Ug ?? null,
          food.folateUg ?? null,
          food.vitaminCMg ?? null,
          food.vitaminDUg ?? null,
          food.vitaminEMg ?? null,
          food.potassiumMg ?? null,
          food.magnesiumMg ?? null,
          food.zincMg ?? null,
          food.cholesterolMg ?? null,
          food.saturatedFatG ?? null,
          food.sugarG ?? null,
          food.saltG ?? null,
        ]
      );
      if (result.changes > 0) {
        inserted++;
      } else {
        // Update nutrition data for existing rows (in case they changed)
        const upd = await db.runAsync(
          `UPDATE foods SET serving_unit = ?, serving_size_g = ?, calories_per_serving = ?, protein_g = ?, fat_g = ?, carb_g = ?,
           fiber_g = ?, sodium_mg = ?, calcium_mg = ?, iron_mg = ?, vitamin_a_ug = ?, vitamin_b1_mg = ?, vitamin_b2_mg = ?,
           vitamin_b6_mg = ?, vitamin_b12_ug = ?, folate_ug = ?,
           vitamin_c_mg = ?, vitamin_d_ug = ?, vitamin_e_mg = ?, potassium_mg = ?, magnesium_mg = ?, zinc_mg = ?,
           cholesterol_mg = ?, saturated_fat_g = ?, sugar_g = ?, salt_g = ?, is_common = 1
           WHERE id = ? AND is_custom = 0`,
          [
            food.servingUnit, food.servingSizeG, food.caloriesPerServing, food.proteinG, food.fatG, food.carbG,
            food.fiberG ?? null, food.sodiumMg ?? null, food.calciumMg ?? null, food.ironMg ?? null,
            food.vitaminAUg ?? null, food.vitaminB1Mg ?? null, food.vitaminB2Mg ?? null,
            food.vitaminB6Mg ?? null, food.vitaminB12Ug ?? null, food.folateUg ?? null,
            food.vitaminCMg ?? null,
            food.vitaminDUg ?? null, food.vitaminEMg ?? null, food.potassiumMg ?? null, food.magnesiumMg ?? null,
            food.zincMg ?? null, food.cholesterolMg ?? null, food.saturatedFatG ?? null, food.sugarG ?? null,
            food.saltG ?? null, food.id,
          ]
        );
        if (upd.changes > 0) updated++;
      }
    } catch (error) {
      void error;
    }
  }
  void inserted;
  void updated;

  // Seed food aliases (idempotent; skips rows where alias already exists)
  try {
    const aliases = getAllAliasSeeds();
    for (const a of aliases) {
      const existingAlias = await db.getFirstAsync<{ c: number }>(
        'SELECT COUNT(*) AS c FROM food_aliases WHERE food_id = ? AND alias_name = ?',
        [a.foodId, a.aliasName]
      );
      if (existingAlias && existingAlias.c === 0) {
        await db.runAsync(
          `INSERT INTO food_aliases (id, food_id, alias_name, alias_type) VALUES (?, ?, ?, ?)`,
          [generateId(), a.foodId, a.aliasName, a.aliasType]
        );
      }
    }
  } catch {
    // food_aliases table may not exist if v7 migration hasn't run yet; ignore.
  }

  // Seed MEXT-imported foods (from scripts/import-mext-foods/run.ts output).
  // Safe no-op when the JSON is empty (initial state before running the importer).
  await seedMextFoods(db);
  await seedMextAliases(db);

  // Seed brand-agnostic generic foods (protein bars, ready-meal portions,
  // supplement scoops). Inserted with source='manual_seed' so they can be
  // distinguished from MEXT entries in queries / future migrations.
  await seedGenericFoods(db);
}

async function seedGenericFoods(db: SQLite.SQLiteDatabase): Promise<void> {
  for (const food of GENERIC_FOODS) {
    try {
      await db.runAsync(
        `INSERT OR IGNORE INTO foods (
           id, name_ja, name_en, brand, serving_size_g, serving_unit,
           calories_per_serving, protein_g, fat_g, carb_g, fiber_g,
           sodium_mg, calcium_mg, iron_mg, vitamin_a_ug, vitamin_b1_mg,
           vitamin_b2_mg, vitamin_b6_mg, vitamin_b12_ug, folate_ug,
           vitamin_c_mg, vitamin_d_ug, vitamin_e_mg,
           potassium_mg, magnesium_mg, zinc_mg, cholesterol_mg,
           saturated_fat_g, sugar_g, salt_g, source, is_custom, is_common
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual_seed', 0, 0)`,
        [
          food.id,
          food.nameJa,
          food.nameEn,
          food.brand,
          food.servingSizeG,
          food.servingUnit,
          food.caloriesPerServing,
          food.proteinG,
          food.fatG,
          food.carbG,
          food.fiberG ?? null,
          food.sodiumMg ?? null,
          food.calciumMg ?? null,
          food.ironMg ?? null,
          food.vitaminAUg ?? null,
          food.vitaminB1Mg ?? null,
          food.vitaminB2Mg ?? null,
          food.vitaminB6Mg ?? null,
          food.vitaminB12Ug ?? null,
          food.folateUg ?? null,
          food.vitaminCMg ?? null,
          food.vitaminDUg ?? null,
          food.vitaminEMg ?? null,
          food.potassiumMg ?? null,
          food.magnesiumMg ?? null,
          food.zincMg ?? null,
          food.cholesterolMg ?? null,
          food.saturatedFatG ?? null,
          food.sugarG ?? null,
          food.saltG ?? null,
        ],
      );
    } catch {
      // Ignore individual row failures — a bad row shouldn't fail the boot.
    }
  }
}

async function seedMextFoods(db: SQLite.SQLiteDatabase): Promise<void> {
  if (!MEXT_FOODS.length) return;
  for (const f of MEXT_FOODS) {
    try {
      await db.runAsync(
        `INSERT OR IGNORE INTO foods (
           id, name_ja, name_en, brand, serving_size_g, serving_unit,
           calories_per_serving, protein_g, fat_g, carb_g, fiber_g,
           sodium_mg, calcium_mg, iron_mg, vitamin_a_ug, vitamin_b1_mg,
           vitamin_b2_mg, vitamin_b6_mg, vitamin_b12_ug, folate_ug,
           vitamin_c_mg, vitamin_d_ug, vitamin_e_mg,
           potassium_mg, magnesium_mg, zinc_mg, cholesterol_mg,
           saturated_fat_g, sugar_g, salt_g, source, is_custom, is_common
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          f.id,
          f.nameJa,
          f.nameEn,
          f.brand,
          f.servingSizeG,
          f.servingUnit,
          f.caloriesPerServing,
          f.proteinG,
          f.fatG,
          f.carbG,
          f.fiberG,
          f.sodiumMg,
          f.calciumMg,
          f.ironMg,
          f.vitaminAUg,
          f.vitaminB1Mg,
          f.vitaminB2Mg,
          f.vitaminB6Mg,
          f.vitaminB12Ug,
          f.folateUg,
          f.vitaminCMg,
          f.vitaminDUg,
          f.vitaminEMg,
          f.potassiumMg,
          f.magnesiumMg,
          f.zincMg,
          f.cholesterolMg,
          f.saturatedFatG,
          f.sugarG,
          f.saltG,
          f.source,
          f.isCommon ? 1 : 0,
        ]
      );
      // Existing rows (e.g. users who had v8 already) won't be touched by
      // INSERT OR IGNORE. Backfill the three new columns if they're still NULL
      // so the app starts showing B6/B12/folate without requiring a full reset.
      await db.runAsync(
        `UPDATE foods
           SET vitamin_b6_mg = COALESCE(vitamin_b6_mg, ?),
               vitamin_b12_ug = COALESCE(vitamin_b12_ug, ?),
               folate_ug = COALESCE(folate_ug, ?)
         WHERE id = ? AND is_custom = 0`,
        [f.vitaminB6Mg, f.vitaminB12Ug, f.folateUg, f.id]
      );
    } catch (error) {
      void error;
    }
  }
}

async function seedMextAliases(db: SQLite.SQLiteDatabase): Promise<void> {
  if (!MEXT_ALIASES.length) return;
  try {
    for (const a of MEXT_ALIASES) {
      const existing = await db.getFirstAsync<{ c: number }>(
        'SELECT COUNT(*) AS c FROM food_aliases WHERE food_id = ? AND alias_name = ?',
        [a.foodId, a.aliasName]
      );
      if (existing && existing.c === 0) {
        await db.runAsync(
          `INSERT INTO food_aliases (id, food_id, alias_name, alias_type) VALUES (?, ?, ?, ?)`,
          [generateId(), a.foodId, a.aliasName, a.aliasType]
        );
      }
    }
  } catch {
    // food_aliases table may not exist yet; ignore.
  }
}

export async function seedExercises(db: SQLite.SQLiteDatabase): Promise<void> {
  // INSERT OR IGNORE makes this safe to run on every boot: existing rows are
  // skipped, new cardio / sports / other seeds are inserted on installs that
  // shipped before they existed. Re-seeding on every boot is cheap.
  for (const exercise of EXERCISES) {
    await db.runAsync(
      `INSERT OR IGNORE INTO exercises
         (id, name_ja, name_en, muscle_group, secondary_muscles, equipment,
          is_custom, sort_order, exercise_type, met_value)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        exercise.id,
        exercise.nameJa,
        exercise.nameEn,
        exercise.muscleGroup,
        exercise.secondaryMuscles ? JSON.stringify(exercise.secondaryMuscles) : null,
        exercise.equipment,
        exercise.sortOrder,
        exercise.exerciseType ?? 'strength',
        exercise.metValue ?? null,
      ]
    );
  }
}
