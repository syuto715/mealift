import { useSearchStore } from '../searchStore';

describe('useSearchStore (Sprint 2.3.2)', () => {
  beforeEach(() => {
    useSearchStore.getState().clear();
  });

  it('starts with an empty query and default pageSize=20', () => {
    const state = useSearchStore.getState();
    expect(state.query).toBe('');
    expect(state.pageSize).toBe(20);
  });

  it('setQuery updates the query string', () => {
    useSearchStore.getState().setQuery('ラーメン');
    expect(useSearchStore.getState().query).toBe('ラーメン');
  });

  it('clear resets the query to an empty string', () => {
    useSearchStore.getState().setQuery('スタバ');
    useSearchStore.getState().clear();
    expect(useSearchStore.getState().query).toBe('');
  });

  it('setQuery is idempotent on repeat with the same value', () => {
    useSearchStore.getState().setQuery('焼き鳥');
    useSearchStore.getState().setQuery('焼き鳥');
    expect(useSearchStore.getState().query).toBe('焼き鳥');
  });
});
