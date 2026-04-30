import type * as SQLite from 'expo-sqlite';

// v21: food_category on user_submitted_foods.
//
// Adds a coarse classification dimension orthogonal to source_type.
// source_type captures *where the user got the data* (package label,
// menu board, official site, estimation, other). food_category
// captures *what kind of food it is* (home cooking, restaurant,
// convenience store, packaged food, beverage, supplement, other) and
// drives Part 2's category-driven UX (which fields are required,
// which are hidden) plus future search filters.
//
// Default 'other' is set so the column can be NOT NULL on existing
// rows — every pre-v21 submission becomes 'other' and the form's
// pre-Part-2 default also lands on 'other', so behavior is unchanged
// until category-driven UX ships.
//
// CHECK constraint keeps the enum honest at the DB level. The mirror
// constraint exists on Supabase public_foods in the
// 20260430000000_add_food_category.sql migration.
export async function migrateV21(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE user_submitted_foods
      ADD COLUMN food_category TEXT NOT NULL DEFAULT 'other'
      CHECK (food_category IN (
        'home_cooking',
        'restaurant',
        'convenience_store',
        'packaged_food',
        'beverage',
        'supplement',
        'other'
      ));
  `);
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_user_submitted_foods_category
      ON user_submitted_foods(food_category);
  `);
}
