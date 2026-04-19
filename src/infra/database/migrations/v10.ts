import type * as SQLite from 'expo-sqlite';

// v10: retro-fill extended nutrients on existing meal_log_items rows.
//
// Context: prior to v10 the UI in search.tsx / add.tsx dropped every optional
// MealLogItemInput field when calling addFood, so rows written before the
// corresponding fix landed store 0 (not NULL — addMealLogItem uses `?? 0`) in
// all 20 extended-nutrient columns. As a result, the daily summary in
// balance.tsx shows fiber / vitamins / minerals as flat zero even though the
// foods table has the reference values.
//
// This migration joins each meal_log_items row back to its source food (when
// food_id is present) and rewrites the extended columns using the same ratio
// the UI would apply at add time:
//
//   serving_unit = 'g'                  → ratio = serving_amount / serving_size_g
//   serving_unit matches foods.serving_unit → ratio = serving_amount  (count)
//   otherwise                           → skip (dish '人前', AI estimates, etc.)
//
// Only rows where the target column is NULL or 0 are updated, so user-entered
// overrides (rare — handleManualAdd writes fiber/salt/Ca/Fe/C directly) are
// preserved.

const COLUMN_MAP: ReadonlyArray<{ mli: string; food: string }> = [
  { mli: 'fiber_g', food: 'fiber_g' },
  { mli: 'sodium_mg', food: 'sodium_mg' },
  { mli: 'calcium_mg', food: 'calcium_mg' },
  { mli: 'iron_mg', food: 'iron_mg' },
  { mli: 'vitamin_a_ug', food: 'vitamin_a_ug' },
  { mli: 'vitamin_b1_mg', food: 'vitamin_b1_mg' },
  { mli: 'vitamin_b2_mg', food: 'vitamin_b2_mg' },
  { mli: 'vitamin_b6_mg', food: 'vitamin_b6_mg' },
  { mli: 'vitamin_b12_ug', food: 'vitamin_b12_ug' },
  { mli: 'folate_ug', food: 'folate_ug' },
  { mli: 'vitamin_c_mg', food: 'vitamin_c_mg' },
  { mli: 'vitamin_d_ug', food: 'vitamin_d_ug' },
  { mli: 'vitamin_e_mg', food: 'vitamin_e_mg' },
  { mli: 'potassium_mg', food: 'potassium_mg' },
  { mli: 'magnesium_mg', food: 'magnesium_mg' },
  { mli: 'zinc_mg', food: 'zinc_mg' },
  { mli: 'cholesterol_mg', food: 'cholesterol_mg' },
  { mli: 'saturated_fat_g', food: 'saturated_fat_g' },
  { mli: 'sugar_g', food: 'sugar_g' },
  { mli: 'salt_g', food: 'salt_g' },
];

export async function migrateV10(db: SQLite.SQLiteDatabase): Promise<void> {
  for (const { mli, food } of COLUMN_MAP) {
    // Correlated subquery. If the food row is missing, the food column is
    // NULL, or the serving_unit doesn't line up, the CASE yields NULL → the
    // multiplication yields NULL → COALESCE keeps the existing value.
    const sql = `
      UPDATE meal_log_items
      SET ${mli} = COALESCE(
        (
          SELECT f.${food} * CASE
            WHEN meal_log_items.serving_unit = 'g' AND f.serving_size_g > 0
              THEN meal_log_items.serving_amount * 1.0 / f.serving_size_g
            WHEN meal_log_items.serving_unit = f.serving_unit
              THEN meal_log_items.serving_amount * 1.0
            ELSE NULL
          END
          FROM foods f
          WHERE f.id = meal_log_items.food_id
        ),
        ${mli}
      )
      WHERE food_id IS NOT NULL
        AND (${mli} IS NULL OR ${mli} = 0);
    `;
    try {
      await db.execAsync(sql);
    } catch {
      // Table/column might not exist in legacy installs that jumped straight
      // to v10 from a pre-v6 state; swallow and move on.
    }
  }
}
