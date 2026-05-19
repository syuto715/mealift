import * as SQLite from 'expo-sqlite';
import SEARCH_INDEX_JSON from './data/search-index.json';

// v1.5 Phase 2.3 Sprint 2.3.1 — search_index seed loader.
//
// The build-time script `scripts/build-search-index.ts` writes a
// pre-computed snapshot (~8K rows, including kuromoji-derived
// yomigana in `aliases_concat`) to `data/search-index.json`. This
// seed function applies the snapshot via INSERT OR REPLACE, which
// fires the v36 UPDATE/DELETE+INSERT triggers and keeps the FTS5
// mirror coherent.
//
// Re-running this on every boot is cheap (~8K upserts) and keeps
// the index aligned with newly published snapshots without a
// dedicated migration bump.

interface SearchIndexSeedRow {
  source_type: 'food' | 'restaurant_menu';
  source_id: string;
  name_ja: string;
  name_en: string | null;
  brand: string | null;
  aliases_concat: string;
  source_label: string;
  is_common: 0 | 1;
}

export async function seedSearchIndex(db: SQLite.SQLiteDatabase): Promise<void> {
  const rows = SEARCH_INDEX_JSON as SearchIndexSeedRow[];
  if (!Array.isArray(rows) || rows.length === 0) return;

  await db.execAsync('BEGIN TRANSACTION');
  try {
    for (const row of rows) {
      await db.runAsync(
        `INSERT INTO search_index (source_type, source_id, name_ja, name_en, brand, aliases_concat, source_label, is_common, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(source_type, source_id) DO UPDATE SET
           name_ja = excluded.name_ja,
           name_en = excluded.name_en,
           brand = excluded.brand,
           aliases_concat = excluded.aliases_concat,
           source_label = excluded.source_label,
           is_common = excluded.is_common,
           updated_at = datetime('now')`,
        [
          row.source_type,
          row.source_id,
          row.name_ja,
          row.name_en,
          row.brand,
          row.aliases_concat,
          row.source_label,
          row.is_common,
        ],
      );
    }
    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}
