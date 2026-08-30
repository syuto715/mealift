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
//
// S5b — stale-row sweep: source_id を安定キー (`slug:品名`) 化した
// ため、 旧 snapshot の positional id (`slug_0012`) 行が既存端末の
// search_index に残ると同一メニューが二重ヒットする。 upsert 後、
// 「この seed 実行で touch されなかった restaurant_menu 行」 =
// snapshot に存在しない行 (旧 id 形式・廃番 item) を削除する。
// updated_at は毎 boot の upsert で更新されるので、 実行開始時刻より
// 古い restaurant_menu 行 = snapshot 外と判定できる。 v36 の
// search_index_ad トリガーが FTS5 側も同期削除する。 user データは
// search_index に無い (user_submitted は search_index に挿入する
// コードが存在しない) ため削除対象は seed 由来行のみ。 food 行は
// id が安定 (八訂 food.id) なので sweep 不要。

interface SearchIndexSeedRow {
  source_type: 'food' | 'restaurant_menu';
  source_id: string;
  name_ja: string;
  name_en: string | null;
  brand: string | null;
  aliases_concat: string;
  source_label: string;
  is_common: 0 | 1;
  nutrition_json: string;
}

export async function seedSearchIndex(db: SQLite.SQLiteDatabase): Promise<void> {
  const rows = SEARCH_INDEX_JSON as SearchIndexSeedRow[];
  if (!Array.isArray(rows) || rows.length === 0) return;

  await db.execAsync('BEGIN TRANSACTION');
  try {
    const seedStart = await db.getFirstAsync<{ now: string }>(
      "SELECT datetime('now') AS now",
    );
    for (const row of rows) {
      await db.runAsync(
        `INSERT INTO search_index (source_type, source_id, name_ja, name_en, brand, aliases_concat, source_label, is_common, nutrition_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(source_type, source_id) DO UPDATE SET
           name_ja = excluded.name_ja,
           name_en = excluded.name_en,
           brand = excluded.brand,
           aliases_concat = excluded.aliases_concat,
           source_label = excluded.source_label,
           is_common = excluded.is_common,
           nutrition_json = excluded.nutrition_json,
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
          row.nutrition_json,
        ],
      );
    }
    // 上の upsert で touch されなかった restaurant_menu 行を掃除
    // (strictly `<` — 同一秒に touch された行は消さない安全側)。
    if (seedStart?.now) {
      await db.runAsync(
        `DELETE FROM search_index
         WHERE source_type = 'restaurant_menu' AND updated_at < ?`,
        [seedStart.now],
      );
    }
    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}
