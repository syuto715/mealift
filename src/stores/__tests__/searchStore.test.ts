import { useSearchStore } from '../searchStore';

describe('useSearchStore (Sprint 2.3.2 + 2.3.3)', () => {
  beforeEach(() => {
    useSearchStore.getState().clear();
  });

  it('starts with an empty query, default pageSize=20, and empty filters', () => {
    const state = useSearchStore.getState();
    expect(state.query).toBe('');
    expect(state.pageSize).toBe(20);
    expect(state.filters.sourceTypes).toEqual([]);
    expect(state.filters.sourceLabels).toEqual([]);
  });

  it('setQuery updates the query string', () => {
    useSearchStore.getState().setQuery('ラーメン');
    expect(useSearchStore.getState().query).toBe('ラーメン');
  });

  it('clear resets both query and filters', () => {
    useSearchStore.getState().setQuery('スタバ');
    useSearchStore.getState().toggleSourceType('food');
    useSearchStore.getState().toggleSourceLabel('ai_estimate');
    useSearchStore.getState().clear();
    const state = useSearchStore.getState();
    expect(state.query).toBe('');
    expect(state.filters.sourceTypes).toEqual([]);
    expect(state.filters.sourceLabels).toEqual([]);
  });

  it('toggleSourceType adds an axis value when absent', () => {
    useSearchStore.getState().toggleSourceType('food');
    expect(useSearchStore.getState().filters.sourceTypes).toEqual(['food']);
  });

  it('toggleSourceType removes the value when already selected', () => {
    useSearchStore.getState().toggleSourceType('restaurant_menu');
    useSearchStore.getState().toggleSourceType('restaurant_menu');
    expect(useSearchStore.getState().filters.sourceTypes).toEqual([]);
  });

  it('toggleSourceLabel maintains both filter axes independently', () => {
    useSearchStore.getState().toggleSourceLabel('official_disclosure');
    useSearchStore.getState().toggleSourceType('food');
    const state = useSearchStore.getState();
    expect(state.filters.sourceLabels).toEqual(['official_disclosure']);
    expect(state.filters.sourceTypes).toEqual(['food']);
  });

  it('setFilters replaces the whole filters object', () => {
    useSearchStore.getState().setFilters({
      sourceTypes: ['food', 'restaurant_menu'],
      sourceLabels: ['ai_estimate'],
    });
    const state = useSearchStore.getState();
    expect(state.filters.sourceTypes).toEqual(['food', 'restaurant_menu']);
    expect(state.filters.sourceLabels).toEqual(['ai_estimate']);
  });

  it("default sort is 'relevance' and setSort switches the axis (Sprint 2.3.4)", () => {
    expect(useSearchStore.getState().sort).toBe('relevance');
    useSearchStore.getState().setSort('kcal_desc');
    expect(useSearchStore.getState().sort).toBe('kcal_desc');
  });

  it('clear resets sort back to the relevance default along with query+filters', () => {
    useSearchStore.getState().setSort('protein_desc');
    useSearchStore.getState().setQuery('スタバ');
    useSearchStore.getState().toggleSourceType('food');
    useSearchStore.getState().clear();
    const state = useSearchStore.getState();
    expect(state.sort).toBe('relevance');
    expect(state.query).toBe('');
    expect(state.filters.sourceTypes).toEqual([]);
  });
});
