import * as SQLite from 'expo-sqlite';
import { generateId } from '../../../utils/id';
import { BARCODE_PRODUCTS } from '../../../constants/barcodeProducts';

export async function seedBarcodeProducts(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  // Check if already seeded
  const countRow = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM barcode_foods WHERE source = 'preset'",
  );
  const existing = countRow?.count ?? 0;

  if (existing >= BARCODE_PRODUCTS.length) {
    return;
  }

  for (const p of BARCODE_PRODUCTS) {
    const id = generateId();
    await db.runAsync(
      `INSERT OR IGNORE INTO barcode_foods
       (id, barcode, name_ja, brand, serving_size_g, serving_unit, serving_description,
        calories_per_serving, protein_g, fat_g, carb_g, fiber_g, image_url, source, verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1)`,
      [
        id,
        p.barcode,
        p.nameJa,
        p.brand ?? null,
        p.servingSizeG,
        p.servingUnit ?? 'g',
        p.servingDescription ?? null,
        p.caloriesPerServing,
        p.proteinG,
        p.fatG,
        p.carbG,
        p.fiberG ?? null,
        p.source,
      ],
    );
  }

}
