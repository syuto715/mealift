// v1.5 Phase 2.3 Sprint 2.3.4 — sort-key → ORDER BY clause.
//
// Pure helper so jest can verify the SQL fragment per sort key
// without spinning up expo-sqlite. The caller (searchUnified) splices
// the returned string into its final query template; the v37
// `search_index.nutrition_json` column is parsed in-place via the
// SQLite JSON1 `json_extract` operator (bundled SQLite 3.50.3 ships
// JSON1 on by default — see `vendor/sqlite3/sqlite3.h`).
//
// Tiebreakers are common to every sort key:
//   - `is_common` desc: 八訂 staples float to the top within
//     equal-rank rows (already used by the v36 relevance path).
//   - `name_ja` asc: deterministic last-resort order so the list
//     paginates stably across requests.
//
// 'relevance' is the default fall-through; the bm25 score lives in
// the SELECT list, so callers must include `bm25(search_index_fts)
// AS rank` whenever this sort key is in play.

export type SearchSortKey =
  | 'relevance'
  | 'kcal_asc'
  | 'kcal_desc'
  | 'protein_desc'
  | 'use_count_desc'
  | 'favorite_first';

const NUTRITION_PATH = {
  caloriesPerServing: "json_extract(s.nutrition_json, '$.caloriesPerServing')",
  proteinG: "json_extract(s.nutrition_json, '$.proteinG')",
} as const;

const TIEBREAKERS = 's.is_common DESC, s.name_ja';

export function buildSearchOrderBy(sort: SearchSortKey): string {
  switch (sort) {
    case 'relevance':
      // bm25 lower = more relevant. Original v36 contract.
      return `rank ASC, ${TIEBREAKERS}`;
    case 'kcal_asc':
      // NULLS LAST so missing nutrition doesn't crowd the head.
      return `${NUTRITION_PATH.caloriesPerServing} ASC NULLS LAST, ${TIEBREAKERS}`;
    case 'kcal_desc':
      return `${NUTRITION_PATH.caloriesPerServing} DESC NULLS LAST, ${TIEBREAKERS}`;
    case 'protein_desc':
      return `${NUTRITION_PATH.proteinG} DESC NULLS LAST, ${TIEBREAKERS}`;
    case 'use_count_desc':
      // Phase 2.4 will increment use_count on actual meal-log selection;
      // until then the column is 0 for every row, so this sort effectively
      // collapses to the tiebreakers (is_common DESC, name_ja). That's
      // the right behaviour — 「よく使う」 with no usage history just
      // surfaces 八訂 staples in name order.
      return `s.use_count DESC, ${TIEBREAKERS}`;
    case 'favorite_first':
      // v38 path (Sprint 2.4.2) — `sf.created_at` is non-null for favorited
      // rows (LEFT JOIN search_favorites). The CASE WHEN below pushes
      // every favorite to the head regardless of bm25 / kcal / etc.;
      // within the favorites block we keep relevance ordering so the
      // user sees the most-relevant favorite first. Non-favorites
      // follow in bm25-ranked order.
      return `CASE WHEN sf.source_id IS NULL THEN 1 ELSE 0 END ASC, rank ASC, ${TIEBREAKERS}`;
  }
}
