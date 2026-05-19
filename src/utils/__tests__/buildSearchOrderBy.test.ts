import { buildSearchOrderBy } from '../buildSearchOrderBy';

describe('buildSearchOrderBy (Sprint 2.3.4)', () => {
  it('returns the bm25 rank for relevance with shared tiebreakers', () => {
    const clause = buildSearchOrderBy('relevance');
    expect(clause).toContain('rank ASC');
    expect(clause).toContain('s.is_common DESC');
    expect(clause).toContain('s.name_ja');
  });

  it('asc / desc kcal sorts use json_extract on caloriesPerServing', () => {
    expect(buildSearchOrderBy('kcal_asc')).toContain(
      "json_extract(s.nutrition_json, '$.caloriesPerServing') ASC NULLS LAST",
    );
    expect(buildSearchOrderBy('kcal_desc')).toContain(
      "json_extract(s.nutrition_json, '$.caloriesPerServing') DESC NULLS LAST",
    );
  });

  it('protein_desc reads proteinG via json_extract NULLS LAST', () => {
    expect(buildSearchOrderBy('protein_desc')).toContain(
      "json_extract(s.nutrition_json, '$.proteinG') DESC NULLS LAST",
    );
  });

  it('use_count_desc orders by the dedicated column (Phase 2.4 will populate it)', () => {
    const clause = buildSearchOrderBy('use_count_desc');
    expect(clause).toContain('s.use_count DESC');
    expect(clause).toContain('s.is_common DESC');
  });

  it('every clause appends the shared (is_common, name_ja) tiebreakers', () => {
    const keys = ['relevance', 'kcal_asc', 'kcal_desc', 'protein_desc', 'use_count_desc'] as const;
    for (const key of keys) {
      const clause = buildSearchOrderBy(key);
      expect(clause).toContain('s.is_common DESC');
      expect(clause).toContain('s.name_ja');
    }
  });
});
