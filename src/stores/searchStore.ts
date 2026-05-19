import { create } from 'zustand';

// v1.5 Phase 2.3 Sprint 2.3.2 — unified search store.
//
// Holds the user-typed query and a small set of pagination knobs.
// Filters (source_type / source_label) and sort mode land in
// Sprint 2.3.3+; this store is intentionally minimal so we can
// add those fields without restructuring callers.

interface SearchState {
  query: string;
  pageSize: number;
  setQuery: (q: string) => void;
  clear: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  pageSize: 20,
  setQuery: (q: string) => set({ query: q }),
  clear: () => set({ query: '' }),
}));
