// v1.5 Phase 2.3 Sprint 2.3.4 — pagination cursor helper.
//
// Pure helper hoisted out of `useSearchFoodItems` so the
// pagination contract is testable without spinning up TanStack
// Query. `lastPage.length < pageSize` is the universal "we've
// reached the tail" signal across every sort/filter combination
// (FTS5 + LIMIT/OFFSET).

export function computeNextSearchPageParam<T>(
  lastPage: T[],
  allPages: T[][],
  pageSize: number,
): number | undefined {
  if (lastPage.length < pageSize) return undefined;
  return allPages.length;
}
