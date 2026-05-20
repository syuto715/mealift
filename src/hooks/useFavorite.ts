import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '../stores/uiStore';
import {
  isSearchFavorite,
  toggleSearchFavorite,
} from '../infra/repositories/searchIndexRepository';
import {
  searchFavoriteQueryKey,
  type FavoriteRef,
} from '../utils/searchFavoriteQueryKey';

export type { FavoriteRef };
export { searchFavoriteQueryKey };

// v1.5 Phase 2.4 Sprint 2.4.2 — search favorites toggle hook.
//
// `useFavorite` reads the current favorite state for a given
// (sourceType, sourceId) and returns a `toggle()` callback that
// inserts / deletes the matching `search_favorites` row.
//
// Drafting 161 (production safety): the existing
// `foodRepository.toggleFoodFavorite()` (v4 path, operates on
// custom foods) is left untouched. This hook is the new
// search-result favorite axis, decoupled from the foods table.
//
// Drafting 166 alignment: favorites are canonical references
// (latest master nutrition reflects), distinct from meal_log
// snapshots (point-in-time). Both coexist cleanly because they
// live in separate tables.

export function useFavorite(ref: FavoriteRef) {
  const queryClient = useQueryClient();
  const showToast = useUIStore((s) => s.showToast);

  const query = useQuery({
    queryKey: searchFavoriteQueryKey(ref),
    queryFn: () => isSearchFavorite(ref.sourceType, ref.sourceId),
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: () => toggleSearchFavorite(ref.sourceType, ref.sourceId),
    onSuccess: (newState) => {
      queryClient.setQueryData(searchFavoriteQueryKey(ref), newState);
      // Search result lists (FoodSearchResult) re-render their isFavorite
      // column through searchUnified's LEFT JOIN; invalidate the unified
      // list so the next fetch reflects the toggle without remounting.
      void queryClient.invalidateQueries({ queryKey: ['searchFoodItems'] });
      showToast(
        newState ? 'お気に入りに追加しました' : 'お気に入りから削除しました',
        'info',
      );
    },
    onError: () => {
      showToast('お気に入りの更新に失敗しました', 'error');
    },
  });

  const toggle = useCallback(() => {
    if (mutation.isPending) return;
    mutation.mutate();
  }, [mutation]);

  return {
    isFavorite: Boolean(query.data),
    isLoading: query.isLoading,
    isPending: mutation.isPending,
    toggle,
  };
}
