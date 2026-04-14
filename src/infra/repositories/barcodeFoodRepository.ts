import { getDatabase } from '../database/connection';
import { generateId } from '../../utils/id';
import { BarcodeFood, BarcodeFoodInput } from '../../types/barcodeFood';

function rowToBarcodeFood(row: Record<string, unknown>): BarcodeFood {
  return {
    id: row.id as string,
    barcode: row.barcode as string,
    nameJa: row.name_ja as string,
    brand: (row.brand as string) ?? null,
    servingSizeG: row.serving_size_g as number,
    servingUnit: row.serving_unit as string,
    servingDescription: (row.serving_description as string) ?? null,
    caloriesPerServing: row.calories_per_serving as number,
    proteinG: row.protein_g as number,
    fatG: row.fat_g as number,
    carbG: row.carb_g as number,
    fiberG: (row.fiber_g as number) ?? null,
    sodiumMg: (row.sodium_mg as number) ?? null,
    calciumMg: (row.calcium_mg as number) ?? null,
    ironMg: (row.iron_mg as number) ?? null,
    vitaminAUg: (row.vitamin_a_ug as number) ?? null,
    vitaminB1Mg: (row.vitamin_b1_mg as number) ?? null,
    vitaminB2Mg: (row.vitamin_b2_mg as number) ?? null,
    vitaminCMg: (row.vitamin_c_mg as number) ?? null,
    vitaminDUg: (row.vitamin_d_ug as number) ?? null,
    vitaminEMg: (row.vitamin_e_mg as number) ?? null,
    potassiumMg: (row.potassium_mg as number) ?? null,
    magnesiumMg: (row.magnesium_mg as number) ?? null,
    zincMg: (row.zinc_mg as number) ?? null,
    cholesterolMg: (row.cholesterol_mg as number) ?? null,
    saturatedFatG: (row.saturated_fat_g as number) ?? null,
    sugarG: (row.sugar_g as number) ?? null,
    saltG: (row.salt_g as number) ?? null,
    imageUrl: (row.image_url as string) ?? null,
    source: row.source as BarcodeFood['source'],
    verified: (row.verified as number) === 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function findByBarcode(
  barcode: string,
): Promise<BarcodeFood | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM barcode_foods WHERE barcode = ?',
      [barcode],
    );
    if (!row) return null;
    return rowToBarcodeFood(row);
  } catch (error) {
    return null;
  }
}

export async function saveBarcodeFood(
  input: BarcodeFoodInput,
): Promise<BarcodeFood> {
  const db = await getDatabase();
  const id = generateId();

  await db.runAsync(
    `INSERT OR REPLACE INTO barcode_foods
     (id, barcode, name_ja, brand, serving_size_g, serving_unit, serving_description,
      calories_per_serving, protein_g, fat_g, carb_g, fiber_g,
      sodium_mg, calcium_mg, iron_mg, vitamin_a_ug, vitamin_b1_mg, vitamin_b2_mg,
      vitamin_c_mg, vitamin_d_ug, vitamin_e_mg, potassium_mg, magnesium_mg,
      zinc_mg, cholesterol_mg, saturated_fat_g, sugar_g, salt_g,
      image_url, source, verified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      input.barcode,
      input.nameJa,
      input.brand ?? null,
      input.servingSizeG,
      input.servingUnit ?? 'g',
      input.servingDescription ?? null,
      input.caloriesPerServing,
      input.proteinG,
      input.fatG,
      input.carbG,
      input.fiberG ?? null,
      input.sodiumMg ?? null,
      input.calciumMg ?? null,
      input.ironMg ?? null,
      input.vitaminAUg ?? null,
      input.vitaminB1Mg ?? null,
      input.vitaminB2Mg ?? null,
      input.vitaminCMg ?? null,
      input.vitaminDUg ?? null,
      input.vitaminEMg ?? null,
      input.potassiumMg ?? null,
      input.magnesiumMg ?? null,
      input.zincMg ?? null,
      input.cholesterolMg ?? null,
      input.saturatedFatG ?? null,
      input.sugarG ?? null,
      input.saltG ?? null,
      input.imageUrl ?? null,
      input.source,
    ],
  );

  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM barcode_foods WHERE id = ?',
    [id],
  );
  return rowToBarcodeFood(row!);
}

export async function searchBarcodeFoods(
  query: string,
  limit: number = 20,
): Promise<BarcodeFood[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM barcode_foods WHERE name_ja LIKE ? OR brand LIKE ? ORDER BY name_ja LIMIT ?',
      [`%${query}%`, `%${query}%`, limit],
    );
    return rows.map(rowToBarcodeFood);
  } catch (error) {
    return [];
  }
}
