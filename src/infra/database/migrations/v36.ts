import type * as SQLite from 'expo-sqlite';

// v36: v1.5 Phase 2.3 Sprint 2.3.1 — unified search_index + FTS5
// virtual table (Drafting 158 + 159 + Option B).
//
// Architectural SSoT:
//   - docs/plans/v1.5_stage_2_restaurant_menu_db_epic.md §3.1
//     surface ① (unified search across foods + restaurant menu)
//   - Drafting 158: normalize-for-search at both build and query
//     time so kana/halfwidth/case variants collapse on one axis.
//   - Drafting 159: kuromoji yomigana (and, when feasible,
//     okurigana variants) pre-computed at build time and stored
//     in `aliases_concat` for FTS5 to index alongside `name_ja`.
//
// Schema rationale:
//   - One row per searchable entity (food / restaurant_menu /
//     user_submitted / future: exercise). `source_type` +
//     `source_id` point back at the canonical table, so we never
//     denormalize nutrition columns into the index.
//   - `aliases_concat` is a space-joined string of the entry's
//     own aliases (from food_aliases / restaurant_menu_item_aliases_local)
//     plus the kuromoji-derived yomigana variant. FTS5 indexes
//     this column on its own so a hit through an alias contributes
//     to bm25 ranking the same way a hit through the canonical
//     name does.
//   - `source_label` carries the Drafting 152 provenance label so
//     the UI can render the 「公式」/「AI 推定」 badge directly off
//     the search result without re-fetching the source row.
//
// FTS5 details:
//   - contentless-mirror pattern (`content='search_index'`,
//     `content_rowid='rowid'`). The triggers below keep the FTS
//     image in lockstep with the content table; queries always go
//     through the FTS table and JOIN back on rowid for filtering
//     by source_type / source_label / use_count.
//   - tokenize = `unicode61 remove_diacritics 2` — default kana
//     word-boundary tokenization; ngram is a v37 expansion option
//     if cross-script partial-match needs grow.
//
// Backfill is intentionally NOT performed in this migration —
// the build-time `scripts/seed/build-search-index.ts` writes the
// initial JSON snapshot, and `seedSearchIndex` at boot time
// applies it via `INSERT OR REPLACE`.

export async function migrateV36(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS search_index (
      rowid INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      name_ja TEXT NOT NULL,
      name_en TEXT,
      brand TEXT,
      aliases_concat TEXT NOT NULL DEFAULT '',
      source_label TEXT NOT NULL,
      use_count INTEGER NOT NULL DEFAULT 0,
      is_common INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (source_type, source_id)
    );

    CREATE INDEX IF NOT EXISTS idx_search_index_source
      ON search_index(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_search_index_recency
      ON search_index(use_count DESC, is_common DESC);
    CREATE INDEX IF NOT EXISTS idx_search_index_label
      ON search_index(source_label);

    CREATE VIRTUAL TABLE IF NOT EXISTS search_index_fts USING fts5(
      name_ja, name_en, brand, aliases_concat,
      content='search_index',
      content_rowid='rowid',
      tokenize='unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER IF NOT EXISTS search_index_ai
    AFTER INSERT ON search_index BEGIN
      INSERT INTO search_index_fts(rowid, name_ja, name_en, brand, aliases_concat)
      VALUES (new.rowid, new.name_ja, new.name_en, new.brand, new.aliases_concat);
    END;

    CREATE TRIGGER IF NOT EXISTS search_index_ad
    AFTER DELETE ON search_index BEGIN
      INSERT INTO search_index_fts(search_index_fts, rowid, name_ja, name_en, brand, aliases_concat)
      VALUES ('delete', old.rowid, old.name_ja, old.name_en, old.brand, old.aliases_concat);
    END;

    CREATE TRIGGER IF NOT EXISTS search_index_au
    AFTER UPDATE ON search_index BEGIN
      INSERT INTO search_index_fts(search_index_fts, rowid, name_ja, name_en, brand, aliases_concat)
      VALUES ('delete', old.rowid, old.name_ja, old.name_en, old.brand, old.aliases_concat);
      INSERT INTO search_index_fts(rowid, name_ja, name_en, brand, aliases_concat)
      VALUES (new.rowid, new.name_ja, new.name_en, new.brand, new.aliases_concat);
    END;
  `);
}
