import type * as SQLite from 'expo-sqlite';

// v38: v1.5 Phase 2.4 Sprint 2.4.2 — search_favorites table.
//
// Drafting 162 (incremental migration、 surface 後 OK) application:
// search_index (v36) は normalized + bm25 ranking、 detail view 用に
// nutrition_json embed (v37) を retrofit。 Sprint 2.4.2 reconnaissance
// で「favorites の source_type/source_id mapping をどこに置くか」 が
// surface し、 既 foods.is_favorite (v4) は foods.id 経由前提 で
// restaurant 系 (source_id がランタイム UUID と不一致) を扱えない。
//
// Path (A) chat-side 確定 — search_favorites を independent table
// として新設し、 search_index と (source_type, source_id) natural-key
// JOIN する。 foods table の semantics は完全 untouched (Drafting 161
// production safety 整合)、 既 foodRepository.toggleFoodFavorite() は
// custom food 用 の legacy 動作を維持。
//
// CHECK 制約 enum:
//   - 'food' / 'restaurant_menu' / 'user_submitted' — search_index v36 と同列挙
//   - 'exercise' — Phase 2.7c (Drafting 143 Exercises master) future-proof
//
// 故に同 enum 値で search_index v36 と完全整合、 query 時の (source_type,
// source_id) natural join が anomaly なく機能する。

export async function migrateV38(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS search_favorites (
      source_type TEXT NOT NULL CHECK (source_type IN (
        'food',
        'restaurant_menu',
        'user_submitted',
        'exercise'
      )),
      source_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000),
      PRIMARY KEY (source_type, source_id)
    );

    CREATE INDEX IF NOT EXISTS idx_search_favorites_created_at
      ON search_favorites(created_at DESC);
  `);
}
