import { getDatabase } from '../database/connection';
import { buildMatchExpression } from '../../utils/buildMatchExpression';
import {
  buildSearchOrderBy,
  type SearchSortKey,
} from '../../utils/buildSearchOrderBy';
import { INCREMENT_SEARCH_INDEX_USE_COUNT_SQL } from '../../utils/searchIndexUseCountSql';

export type { SearchSortKey };

// v1.5 Phase 2.3 Sprint 2.3.1 — unified search query repository
// (Option B path).
//
// Queries hit `search_index_fts` (FTS5 virtual table) and JOIN
// back to `search_index` for filterable columns (source_type,
// source_label, use_count, is_common). bm25 supplies the
// relevance score; ties break on `is_common` (八訂 staples) then
// recent usage.
//
// User input is run through `normalizeForSearch` so kana / case /
// halfwidth axis variants collapse before the MATCH operator
// sees the query. Index-time `aliases_concat` is built with the
// same normalization, so a query that hits an alias contributes
// to bm25 on the same axis.

export type SearchSourceType = 'food' | 'restaurant_menu';
export type SearchSourceLabel =
  | 'official_disclosure'
  | 'ai_estimate'
  | 'package_label'
  | 'manual';

// Subset of fields the unified search list needs from each hit;
// see `SearchIndexNutrition` for the detail-view payload.
export interface SearchIndexHit {
  rowid: number;
  sourceType: SearchSourceType;
  sourceId: string;
  nameJa: string;
  nameEn: string | null;
  brand: string | null;
  sourceLabel: SearchSourceLabel;
  useCount: number;
  isCommon: boolean;
  rank: number;
  /** v38 — true when this (source_type, source_id) has a search_favorites row. */
  isFavorite: boolean;
  /** v38 — epoch milliseconds the favorite was added, when present. */
  favoritedAt: number | null;
}

// Embedded nutrition payload stored as JSON in `search_index.nutrition_json`
// (added in v37). Optional fields reflect provenance-dependent completeness:
// 八訂 rows populate the full 17-micronutrient grid, restaurant menu rows
// fill only the subset disclosed by the chain (kcal/P/F/C + occasionally
// fiber/sugar/salt/sodium/saturated_fat/cholesterol).
export interface SearchIndexNutrition {
  servingSizeG?: number;
  servingUnit?: string;
  servingDescription?: string | null;
  caloriesPerServing: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG?: number | null;
  sugarG?: number | null;
  saltG?: number | null;
  sodiumMg?: number | null;
  saturatedFatG?: number | null;
  cholesterolMg?: number | null;
  calciumMg?: number | null;
  ironMg?: number | null;
  magnesiumMg?: number | null;
  zincMg?: number | null;
  potassiumMg?: number | null;
  vitaminAUg?: number | null;
  vitaminB1Mg?: number | null;
  vitaminB2Mg?: number | null;
  vitaminB6Mg?: number | null;
  vitaminB12Ug?: number | null;
  folateUg?: number | null;
  vitaminCMg?: number | null;
  vitaminDUg?: number | null;
  vitaminEMg?: number | null;
  sourceUrl?: string | null;
}

export interface SearchIndexDetail extends SearchIndexHit {
  nutrition: SearchIndexNutrition;
}

export interface SearchOptions {
  sourceTypes?: SearchSourceType[];
  sourceLabels?: SearchSourceLabel[];
  /** v38 — when true, only rows present in search_favorites are returned. */
  favoritesOnly?: boolean;
  sort?: SearchSortKey;
  limit?: number;
  offset?: number;
}

function rowToHit(row: Record<string, unknown>): SearchIndexHit {
  const favoritedAt = row.favorited_at == null ? null : Number(row.favorited_at);
  return {
    rowid: row.rowid as number,
    sourceType: row.source_type as SearchSourceType,
    sourceId: row.source_id as string,
    nameJa: row.name_ja as string,
    nameEn: (row.name_en as string) ?? null,
    brand: (row.brand as string) ?? null,
    sourceLabel: row.source_label as SearchSourceLabel,
    useCount: (row.use_count as number) ?? 0,
    isCommon: Boolean(row.is_common),
    rank: (row.rank as number) ?? 0,
    isFavorite: favoritedAt != null,
    favoritedAt,
  };
}

function safeParseNutrition(json: unknown): SearchIndexNutrition | null {
  if (typeof json !== 'string' || !json) return null;
  try {
    const parsed = JSON.parse(json) as SearchIndexNutrition;
    if (typeof parsed.caloriesPerServing !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

// Detail-view fetch — Sprint 2.3.3 v37 path. Returns null when the
// (sourceType, sourceId) pair is unknown to the index. v38 LEFT JOIN
// on search_favorites surfaces isFavorite + favoritedAt for the star UI.
export async function getDetailByRef(
  sourceType: SearchSourceType,
  sourceId: string,
): Promise<SearchIndexDetail | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT s.rowid, s.source_type, s.source_id, s.name_ja, s.name_en, s.brand,
            s.source_label, s.use_count, s.is_common, s.nutrition_json,
            sf.created_at AS favorited_at
       FROM search_index s
       LEFT JOIN search_favorites sf
         ON sf.source_type = s.source_type AND sf.source_id = s.source_id
      WHERE s.source_type = ? AND s.source_id = ?
      LIMIT 1`,
    [sourceType, sourceId],
  );
  if (!row) return null;
  const nutrition = safeParseNutrition(row.nutrition_json);
  if (!nutrition) return null;
  return {
    ...rowToHit(row),
    rank: 0,
    nutrition,
  };
}

// v38 — favorite toggle. Returns the new state (true = favorite ON).
export async function toggleSearchFavorite(
  sourceType: SearchSourceType,
  sourceId: string,
): Promise<boolean> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ source_id: string }>(
    'SELECT source_id FROM search_favorites WHERE source_type = ? AND source_id = ?',
    [sourceType, sourceId],
  );
  if (existing) {
    await db.runAsync(
      'DELETE FROM search_favorites WHERE source_type = ? AND source_id = ?',
      [sourceType, sourceId],
    );
    return false;
  }
  await db.runAsync(
    `INSERT INTO search_favorites (source_type, source_id, created_at)
     VALUES (?, ?, ?)`,
    [sourceType, sourceId, Date.now()],
  );
  return true;
}

export async function isSearchFavorite(
  sourceType: SearchSourceType,
  sourceId: string,
): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ source_id: string }>(
    'SELECT source_id FROM search_favorites WHERE source_type = ? AND source_id = ?',
    [sourceType, sourceId],
  );
  return Boolean(row);
}

// v1.5 Phase 2.4 Sprint 2.4.3 — use_count bumper.
//
// Drafting 162 application: the v36 schema already carries
// `search_index.use_count` (`INTEGER NOT NULL DEFAULT 0` +
// `idx_search_index_recency` on the column), and Sprint 2.3.4's
// `use_count_desc` sort already references it — Sprint 2.4.3 just
// wires the increment side of the contract without any schema
// touch. Mirrors the existing
// `foodRepository.incrementFoodUseCount` / dish / meal-template
// patterns (single `UPDATE ... SET use_count = use_count + 1`).
//
// Idempotency / safety: hitting a (source_type, source_id) pair
// that does not exist in `search_index` is a silent no-op (zero
// rows affected) — meaningful because user-submitted rows that
// haven't been indexed yet shouldn't crash the meal-log path.
//
// Drafting 161 alignment: this is a NEW exported function on the
// repository; existing production paths are not modified. The
// useAddMealLog hook calls it sequentially after `useNutrition
// .addFood` succeeds (Option iii — hook-driven, no transaction
// wrapping required, best-effort metric consistent with the
// existing `foods.use_count` bump pattern).
export async function incrementSearchIndexUseCount(
  sourceType: SearchSourceType,
  sourceId: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(INCREMENT_SEARCH_INDEX_USE_COUNT_SQL, [sourceType, sourceId]);
}

export async function searchUnified(
  query: string,
  options: SearchOptions = {},
): Promise<SearchIndexHit[]> {
  const match = buildMatchExpression(query);
  if (!match) return [];

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const sourceTypes = options.sourceTypes ?? [];
  const sourceLabels = options.sourceLabels ?? [];
  const sort: SearchSortKey = options.sort ?? 'relevance';
  const favoritesOnly = Boolean(options.favoritesOnly);

  const filters: string[] = [];
  const bindings: unknown[] = [match];
  if (sourceTypes.length > 0) {
    filters.push(`s.source_type IN (${sourceTypes.map(() => '?').join(',')})`);
    bindings.push(...sourceTypes);
  }
  if (sourceLabels.length > 0) {
    filters.push(`s.source_label IN (${sourceLabels.map(() => '?').join(',')})`);
    bindings.push(...sourceLabels);
  }
  if (favoritesOnly) {
    filters.push('sf.source_id IS NOT NULL');
  }
  const whereTail = filters.length ? ` AND ${filters.join(' AND ')}` : '';
  const orderBy = buildSearchOrderBy(sort);
  bindings.push(limit, offset);

  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT s.rowid AS rowid, s.source_type, s.source_id, s.name_ja, s.name_en,
            s.brand, s.source_label, s.use_count, s.is_common,
            sf.created_at AS favorited_at,
            bm25(search_index_fts) AS rank
       FROM search_index_fts
       JOIN search_index s ON s.rowid = search_index_fts.rowid
       LEFT JOIN search_favorites sf
         ON sf.source_type = s.source_type AND sf.source_id = s.source_id
      WHERE search_index_fts MATCH ?${whereTail}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
    bindings as never[],
  );
  return rows.map(rowToHit);
}
