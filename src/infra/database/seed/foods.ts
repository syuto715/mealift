import * as SQLite from 'expo-sqlite';
import { FOODS } from '../../../constants/foods';
import { EXERCISES } from '../../../constants/exercises';

export async function seedFoods(db: SQLite.SQLiteDatabase): Promise<void> {
  const existingCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM foods WHERE is_custom = 0'
  );
  const existing = existingCount?.count ?? 0;


  // Always run INSERT OR IGNORE to add any missing foods (e.g. newly added items)
  let inserted = 0;
  let updated = 0;
  for (const food of FOODS) {
    try {
      const result = await db.runAsync(
        `INSERT OR IGNORE INTO foods (id, name_ja, name_en, brand, serving_size_g, serving_unit, calories_per_serving, protein_g, fat_g, carb_g, fiber_g, sodium_mg, calcium_mg, iron_mg, vitamin_a_ug, vitamin_b1_mg, vitamin_b2_mg, vitamin_c_mg, vitamin_d_ug, vitamin_e_mg, potassium_mg, magnesium_mg, zinc_mg, cholesterol_mg, saturated_fat_g, sugar_g, salt_g, source, is_custom)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'mext', 0)`,
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
           vitamin_c_mg = ?, vitamin_d_ug = ?, vitamin_e_mg = ?, potassium_mg = ?, magnesium_mg = ?, zinc_mg = ?,
           cholesterol_mg = ?, saturated_fat_g = ?, sugar_g = ?, salt_g = ?
           WHERE id = ? AND is_custom = 0`,
          [
            food.servingUnit, food.servingSizeG, food.caloriesPerServing, food.proteinG, food.fatG, food.carbG,
            food.fiberG ?? null, food.sodiumMg ?? null, food.calciumMg ?? null, food.ironMg ?? null,
            food.vitaminAUg ?? null, food.vitaminB1Mg ?? null, food.vitaminB2Mg ?? null, food.vitaminCMg ?? null,
            food.vitaminDUg ?? null, food.vitaminEMg ?? null, food.potassiumMg ?? null, food.magnesiumMg ?? null,
            food.zincMg ?? null, food.cholesterolMg ?? null, food.saturatedFatG ?? null, food.sugarG ?? null,
            food.saltG ?? null, food.id,
          ]
        );
        if (upd.changes > 0) updated++;
      }
    } catch (error) {
    }
  }
  if (inserted > 0) {
  }
  if (updated > 0) {
  }
}

export async function seedExercises(db: SQLite.SQLiteDatabase): Promise<void> {
  const existingCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM exercises WHERE is_custom = 0'
  );

  if (existingCount && existingCount.count > 0) return;

  for (const exercise of EXERCISES) {
    await db.runAsync(
      `INSERT OR IGNORE INTO exercises (id, name_ja, name_en, muscle_group, secondary_muscles, equipment, is_custom, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        exercise.id,
        exercise.nameJa,
        exercise.nameEn,
        exercise.muscleGroup,
        exercise.secondaryMuscles ? JSON.stringify(exercise.secondaryMuscles) : null,
        exercise.equipment,
        exercise.sortOrder,
      ]
    );
  }
}
