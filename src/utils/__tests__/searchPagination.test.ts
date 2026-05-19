import { computeNextSearchPageParam } from '../searchPagination';

describe('computeNextSearchPageParam (Sprint 2.3.4)', () => {
  const pageSize = 20;

  it('returns the next page index when the last page is full', () => {
    const lastPage = new Array(pageSize).fill(0);
    const allPages = [lastPage];
    expect(computeNextSearchPageParam(lastPage, allPages, pageSize)).toBe(1);
  });

  it('returns the second-page index after two full pages', () => {
    const full = new Array(pageSize).fill(0);
    const allPages = [full, full];
    expect(computeNextSearchPageParam(full, allPages, pageSize)).toBe(2);
  });

  it('returns undefined when the last page is short (we hit the tail)', () => {
    const lastPage = new Array(pageSize - 3).fill(0);
    const allPages = [lastPage];
    expect(computeNextSearchPageParam(lastPage, allPages, pageSize)).toBeUndefined();
  });

  it('returns undefined when the last page is empty (no results past this offset)', () => {
    expect(computeNextSearchPageParam([], [[]], pageSize)).toBeUndefined();
  });

  it('respects a custom pageSize boundary', () => {
    const lastPage = new Array(50).fill(0);
    const allPages = [lastPage];
    expect(computeNextSearchPageParam(lastPage, allPages, 50)).toBe(1);
    expect(computeNextSearchPageParam(lastPage, allPages, 51)).toBeUndefined();
  });
});
