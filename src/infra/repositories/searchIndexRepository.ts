import { getDatabase } from '../database/connection';
import { buildMatchExpression } from '../../utils/buildMatchExpression';

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

export interface SearchOptions {
  sourceTypes?: SearchSourceType[];
  sourceLabels?: SearchSourceLabel[];
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
  bindings.push(limit, offset);

  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT s.rowid AS rowid, s.source_type, s.source_id, s.name_ja, s.name_en,
            s.brand, s.source_label, s.use_count, s.is_common,
            bm25(search_index_fts) AS rank
       FROM search_index_fts
       JOIN search_index s ON s.rowid = search_index_fts.rowid
      WHERE search_index_fts MATCH ?${whereTail}
      ORDER BY rank ASC, s.is_common DESC, s.use_count DESC, s.name_ja
      LIMIT ? OFFSET ?`,
    bindings as never[],
  );
  return rows.map(rowToHit);
}
