// v1.5 Phase 2.3 Sprint 2.3.5 — empty-state classifier.
//
// Maps the live search hook's mutable signals to one of four
// terminal UI states. Returns `null` when the result list has
// rows to render — the FlatList path handles that case.
//
// Priority order (first match wins) is deliberate:
//   1. error — surfaces fetch failures even mid-typing so the user
//      doesn't see a phantom "loading" while the query is retrying.
//   2. loading — pre-result spinner; we only show it when we have
//      no rows yet (mid-page silent refetch is suppressed).
//   3. initial — query has not been typed (after trim).
//   4. no_results — query typed, fetch finished, list empty.

export type SearchEmptyState = 'initial' | 'loading' | 'no_results' | 'error';

export interface ComputeEmptyStateInput {
  query: string;
  isError: boolean;
  isFetching: boolean;
  itemCount: number;
}

export function computeEmptyState(input: ComputeEmptyStateInput): SearchEmptyState | null {
  if (input.isError) return 'error';
  if (input.isFetching && input.itemCount === 0 && input.query.trim().length > 0) {
    return 'loading';
  }
  if (input.query.trim().length === 0) return 'initial';
  if (input.itemCount === 0) return 'no_results';
  return null;
}
