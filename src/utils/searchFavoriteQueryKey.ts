import type { SearchSourceType } from '../infra/repositories/searchIndexRepository';

// v1.5 Phase 2.4 Sprint 2.4.2 — TanStack Query key builder for the
// per-row favorite query. Extracted to a pure util so jest can pin
// the shape without dragging in expo-sqlite via the searchIndex
// repository.

export interface FavoriteRef {
  sourceType: SearchSourceType;
  sourceId: string;
}

export function searchFavoriteQueryKey(ref: FavoriteRef): readonly unknown[] {
  return ['searchFavorite', ref.sourceType, ref.sourceId];
}
