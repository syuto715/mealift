import { searchFavoriteQueryKey } from '../../utils/searchFavoriteQueryKey';

describe('searchFavoriteQueryKey (Sprint 2.4.2)', () => {
  it('builds a deterministic key for the (sourceType, sourceId) tuple', () => {
    const key = searchFavoriteQueryKey({ sourceType: 'food', sourceId: 'mext_01001' });
    expect(key).toEqual(['searchFavorite', 'food', 'mext_01001']);
  });

  it('distinguishes restaurant_menu vs food rows with the same source_id', () => {
    const a = searchFavoriteQueryKey({ sourceType: 'food', sourceId: 'x' });
    const b = searchFavoriteQueryKey({ sourceType: 'restaurant_menu', sourceId: 'x' });
    expect(a).not.toEqual(b);
  });

  it('returns an array suitable for TanStack Query queryKey shape', () => {
    const key = searchFavoriteQueryKey({ sourceType: 'food', sourceId: 'mext_99999' });
    expect(Array.isArray(key)).toBe(true);
    expect(key.length).toBe(3);
    expect(key[0]).toBe('searchFavorite');
  });
});
