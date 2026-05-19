import { computeEmptyState } from '../computeEmptyState';

describe('computeEmptyState (Sprint 2.3.5)', () => {
  it("returns 'error' regardless of other signals when isError is true", () => {
    expect(
      computeEmptyState({ query: 'ラーメン', isError: true, isFetching: true, itemCount: 5 }),
    ).toBe('error');
  });

  it("returns 'initial' when the query string is blank (after trim)", () => {
    expect(
      computeEmptyState({ query: '   ', isError: false, isFetching: false, itemCount: 0 }),
    ).toBe('initial');
  });

  it("returns 'loading' when fetching with no rows yet (silent refetch suppressed)", () => {
    expect(
      computeEmptyState({ query: 'ラーメン', isError: false, isFetching: true, itemCount: 0 }),
    ).toBe('loading');
  });

  it("returns 'no_results' when query is non-blank, fetch settled, and list empty", () => {
    expect(
      computeEmptyState({ query: 'ラーメン', isError: false, isFetching: false, itemCount: 0 }),
    ).toBe('no_results');
  });

  it('returns null when the result list has rows (FlatList path)', () => {
    expect(
      computeEmptyState({ query: 'ラーメン', isError: false, isFetching: false, itemCount: 12 }),
    ).toBeNull();
  });

  it('suppresses loading state mid-page silent refetch (rows already rendered)', () => {
    expect(
      computeEmptyState({ query: 'ラーメン', isError: false, isFetching: true, itemCount: 8 }),
    ).toBeNull();
  });

  it('treats whitespace-only query like blank for initial state precedence', () => {
    expect(
      computeEmptyState({ query: '　', isError: false, isFetching: true, itemCount: 0 }),
    ).toBe('initial');
  });
});
