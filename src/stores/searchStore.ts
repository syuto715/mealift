import { create } from 'zustand';
import type {
  SearchSortKey,
  SearchSourceLabel,
  SearchSourceType,
} from '../infra/repositories/searchIndexRepository';

export type { SearchSortKey };

// v1.5 Phase 2.3 Sprint 2.3.2 + 2.3.3 — unified search store.
//
// Sprint 2.3.2 introduced `query` + `pageSize`. Sprint 2.3.3
// extends with `filters` so the chip row can drive the FTS5
// query without prop-drilling.
//
// `filters.sourceTypes` / `filters.sourceLabels` are empty by
// default; an empty array means "no filter on this axis" so the
// search query sees the full corpus until the user opts in.

export interface SearchFilters {
  sourceTypes: SearchSourceType[];
  sourceLabels: SearchSourceLabel[];
  /** v38 — Sprint 2.4.2: limit results to rows present in search_favorites. */
  favoritesOnly: boolean;
}

interface SearchState {
  query: string;
  pageSize: number;
  filters: SearchFilters;
  sort: SearchSortKey;
  setQuery: (q: string) => void;
  setFilters: (f: SearchFilters) => void;
  toggleSourceType: (t: SearchSourceType) => void;
  toggleSourceLabel: (l: SearchSourceLabel) => void;
  toggleFavoritesOnly: () => void;
  setSort: (s: SearchSortKey) => void;
  clear: () => void;
}

const EMPTY_FILTERS: SearchFilters = { sourceTypes: [], sourceLabels: [], favoritesOnly: false };
const DEFAULT_SORT: SearchSortKey = 'relevance';

function toggleIn<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  pageSize: 20,
  filters: EMPTY_FILTERS,
  sort: DEFAULT_SORT,
  setQuery: (q: string) => set({ query: q }),
  setFilters: (f: SearchFilters) => set({ filters: f }),
  toggleSourceType: (t: SearchSourceType) =>
    set((state) => ({
      filters: { ...state.filters, sourceTypes: toggleIn(state.filters.sourceTypes, t) },
    })),
  toggleSourceLabel: (l: SearchSourceLabel) =>
    set((state) => ({
      filters: { ...state.filters, sourceLabels: toggleIn(state.filters.sourceLabels, l) },
    })),
  toggleFavoritesOnly: () =>
    set((state) => ({
      filters: { ...state.filters, favoritesOnly: !state.filters.favoritesOnly },
    })),
  setSort: (s: SearchSortKey) => set({ sort: s }),
  clear: () => set({ query: '', filters: EMPTY_FILTERS, sort: DEFAULT_SORT }),
}));
