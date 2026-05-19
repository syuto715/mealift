import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useSearchStore } from '../stores/searchStore';
import { useDebouncedValue } from './useDebouncedValue';
import {
  searchUnified,
  type SearchIndexHit,
} from '../infra/repositories/searchIndexRepository';

// v1.5 Phase 2.3 Sprint 2.3.2 — TanStack Query wrapper over the
// unified searchUnified() FTS5 query.
//
// Debounce window is 300ms (Drafting 158 kicked in at the query
// string level, so this is purely "stop slamming the DB every
// keystroke"). The query is `enabled` only when the trimmed
// debounced query is non-empty, so the first render with a blank
// input doesn't fire a no-op FTS5 MATCH.

export const SEARCH_DEBOUNCE_MS = 300;

export interface UseSearchFoodItemsResult {
  data: SearchIndexHit[] | undefined;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  debouncedQuery: string;
  query: UseQueryResult<SearchIndexHit[]>;
}

export function useSearchFoodItems(): UseSearchFoodItemsResult {
  const query = useSearchStore((s) => s.query);
  const pageSize = useSearchStore((s) => s.pageSize);
  const filters = useSearchStore((s) => s.filters);
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);

  const tanstackQuery = useQuery({
    queryKey: ['searchFoodItems', debouncedQuery, pageSize, filters] as const,
    queryFn: () =>
      searchUnified(debouncedQuery, {
        limit: pageSize,
        sourceTypes: filters.sourceTypes,
        sourceLabels: filters.sourceLabels,
      }),
    enabled: debouncedQuery.trim().length > 0,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  return {
    data: tanstackQuery.data,
    isFetching: tanstackQuery.isFetching,
    isError: tanstackQuery.isError,
    error: tanstackQuery.error,
    debouncedQuery,
    query: tanstackQuery,
  };
}
