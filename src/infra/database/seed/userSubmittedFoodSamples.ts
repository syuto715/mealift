import type * as SQLite from 'expo-sqlite';
import type { UserSubmittedFoodInput } from '../../../types/userSubmittedFood';

// Hand-loadable fixtures for QA / dev verification. NOT auto-seeded —
// nothing in connection.ts calls insertSampleUserSubmittedFoods. To use:
//
//   import { insertSampleUserSubmittedFoods } from '@/infra/database/seed/userSubmittedFoodSamples';
//   await insertSampleUserSubmittedFoods(await getDatabase());
//
// Three rows that together exercise the v16 schema's interesting paths:
//   1. A package-label submission with a barcode and a photo URI.
//   2. A menu-board submission with no barcode and notes only.
//   3. An estimation-mode submission for a home-cooked recipe.
//
// All three start as `submission_status = 'local'` (the default) — the
// review pipeline (Commit 4) is what flips them to pending_review.

export const SAMPLE_USER_SUBMITTED_FOODS: UserSubmittedFoodInput[] = [
  {
    nameJa: 'プロテインバー チョコ味',
    brand: 'サンプルブランド',
    barcode: '4901234567890',
    servingSizeG: 45,
    servingDescription: '1本 (45g)',
    caloriesPerServing: 180,
    proteinG: 15.0,
    fatG: 6.5,
    carbG: 16.0,
    fiberG: 2.0,
    sugarG: 8.0,
    saltG: 0.4,
    sourceType: 'package_label',
    sourcePhotoUri: 'file:///tmp/sample-protein-bar.jpg',
    notes: 'パッケージ裏面より転記',
  },
  {
    nameJa: 'チキン南蛮定食',
    brand: '某ファミレス',
    servingSizeG: 600,
    servingDescription: '1食',
    caloriesPerServing: 980,
    proteinG: 38,
    fatG: 42,
    carbG: 95,
    sourceType: 'menu_board',
    notes: 'メニュー POP の栄養成分表示より',
  },
  {
    nameJa: '自家製グラノーラ',
    servingSizeG: 50,
    servingDescription: '1食 (50g)',
    caloriesPerServing: 230,
    proteinG: 6.0,
    fatG: 9.0,
    carbG: 32.0,
    fiberG: 4.0,
    sourceType: 'estimation',
    notes: '材料を MEXT 八訂で逆引きして算出',
  },
];

export async function insertSampleUserSubmittedFoods(
  db: SQLite.SQLiteDatabase,
): Promise<number> {
  const { generateId } = await import('../../../utils/id');
  let inserted = 0;
  for (const f of SAMPLE_USER_SUBMITTED_FOODS) {
    await db.runAsync(
      `INSERT OR IGNORE INTO user_submitted_foods (
        id, name_ja, brand, barcode,
        serving_size_g, serving_unit, serving_description,
        calories_per_serving, protein_g, fat_g, carb_g,
        fiber_g, sugar_g, salt_g,
        source_type, source_photo_uri, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        generateId(),
        f.nameJa,
        f.brand ?? null,
        f.barcode ?? null,
        f.servingSizeG,
        f.servingUnit ?? 'g',
        f.servingDescription ?? null,
        f.caloriesPerServing,
        f.proteinG,
        f.fatG,
        f.carbG,
        f.fiberG ?? null,
        f.sugarG ?? null,
        f.saltG ?? null,
        f.sourceType,
        f.sourcePhotoUri ?? null,
        f.notes ?? null,
      ],
    );
    inserted++;
  }
  return inserted;
}
