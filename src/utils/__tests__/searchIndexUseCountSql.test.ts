import { INCREMENT_SEARCH_INDEX_USE_COUNT_SQL } from '../searchIndexUseCountSql';

describe('INCREMENT_SEARCH_INDEX_USE_COUNT_SQL (Sprint 2.4.3)', () => {
  it('updates the search_index table', () => {
    expect(INCREMENT_SEARCH_INDEX_USE_COUNT_SQL).toMatch(/UPDATE\s+search_index/);
  });

  it('atomically bumps the existing column by one rather than overwriting', () => {
    expect(INCREMENT_SEARCH_INDEX_USE_COUNT_SQL).toMatch(/use_count\s*=\s*use_count\s*\+\s*1/);
  });

  it("refreshes updated_at via datetime('now')", () => {
    expect(INCREMENT_SEARCH_INDEX_USE_COUNT_SQL).toMatch(/updated_at\s*=\s*datetime\('now'\)/);
  });

  it('scopes the update by the natural (source_type, source_id) tuple', () => {
    expect(INCREMENT_SEARCH_INDEX_USE_COUNT_SQL).toMatch(
      /WHERE\s+source_type\s*=\s*\?\s+AND\s+source_id\s*=\s*\?/,
    );
  });

  it('takes the parameters in (source_type, source_id) order so callers can pass them positionally', () => {
    const sourceTypeIdx = INCREMENT_SEARCH_INDEX_USE_COUNT_SQL.indexOf('source_type');
    const sourceIdIdx = INCREMENT_SEARCH_INDEX_USE_COUNT_SQL.indexOf('source_id');
    expect(sourceTypeIdx).toBeGreaterThan(-1);
    expect(sourceIdIdx).toBeGreaterThan(sourceTypeIdx);
  });
});
