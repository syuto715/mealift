import { getDatabase } from '../database/connection';
import { buildMatchExpression } from '../../utils/buildMatchExpression';
import {
  buildSearchOrderBy,
  type SearchSortKey,
} from '../../utils/buildSearchOrderBy';

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
  sort?: SearchSortKey;
  limit?: number;
  offset?: number;
}

function rowToHit(row: Record<string, unknown>): SearchIndexHit {
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
// (sourceType, sourceId) pair is unknown to the index.
export async function getDetailByRef(
  sourceType: SearchSourceType,
  sourceId: string,
): Promise<SearchIndexDetail | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT rowid, source_type, source_id, name_ja, name_en, brand,
            source_label, use_count, is_common, nutrition_json
       FROM search_index
      WHERE source_type = ? AND source_id = ?
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
  const whereTail = filters.length ? ` AND ${filters.join(' AND ')}` : '';
  const orderBy = buildSearchOrderBy(sort);
  bindings.push(limit, offset);

  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT s.rowid AS rowid, s.source_type, s.source_id, s.name_ja, s.name_en,
            s.brand, s.source_label, s.use_count, s.is_common,
            bm25(search_index_fts) AS rank
       FROM search_index_fts
       JOIN search_index s ON s.rowid = search_index_fts.rowid
      WHERE search_index_fts MATCH ?${whereTail}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
    bindings as never[],
  );
  return rows.map(rowToHit);
}
