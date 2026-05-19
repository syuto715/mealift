import {
  useInfiniteQuery,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSearchStore } from '../stores/searchStore';
import { useDebouncedValue } from './useDebouncedValue';
import { computeNextSearchPageParam } from '../utils/searchPagination';
import {
  searchUnified,
  type SearchIndexHit,
} from '../infra/repositories/searchIndexRepository';

// v1.5 Phase 2.3 Sprint 2.3.2 + 2.3.3 + 2.3.4 — TanStack
// useInfiniteQuery wrapper over the unified FTS5 search path.
//
// Sprint 2.3.4 migrates from `useQuery` to `useInfiniteQuery` so
// the result list can paginate as the user scrolls. The query
// function receives a 0-based `pageParam`, and `getNextPageParam`
// reports the next page index whenever the last page came back
// full (`computeNextSearchPageParam` is the pure helper).

export const SEARCH_DEBOUNCE_MS = 300;

export interface UseSearchFoodItemsResult {
  items: SearchIndexHit[];
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  error: unknown;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  debouncedQuery: string;
  query: UseInfiniteQueryResult<InfiniteData<SearchIndexHit[]>>;
}

export function useSearchFoodItems(): UseSearchFoodItemsResult {
  const query = useSearchStore((s) => s.query);
  const pageSize = useSearchStore((s) => s.pageSize);
  const filters = useSearchStore((s) => s.filters);
  const sort = useSearchStore((s) => s.sort);
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);

  const tanstackQuery = useInfiniteQuery({
    queryKey: ['searchFoodItems', debouncedQuery, pageSize, filters, sort] as const,
    queryFn: ({ pageParam = 0 }) =>
      searchUnified(debouncedQuery, {
        limit: pageSize,
        offset: pageParam * pageSize,
        sourceTypes: filters.sourceTypes,
        sourceLabels: filters.sourceLabels,
        sort,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      computeNextSearchPageParam(lastPage, allPages, pageSize),
    enabled: debouncedQuery.trim().length > 0,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  // Flatten across pages — the FlatList consumer doesn't care about
  // page boundaries; pagination is purely a fetch concern.
  const items = useMemo<SearchIndexHit[]>(
    () => tanstackQuery.data?.pages.flat() ?? [],
    [tanstackQuery.data],
  );

  return {
    items,
    isFetching: tanstackQuery.isFetching,
    isFetchingNextPage: tanstackQuery.isFetchingNextPage,
    isError: tanstackQuery.isError,
    error: tanstackQuery.error,
    hasNextPage: Boolean(tanstackQuery.hasNextPage),
    fetchNextPage: () => { void tanstackQuery.fetchNextPage(); },
    debouncedQuery,
    query: tanstackQuery,
  };
}
