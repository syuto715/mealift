// v1.5 Phase 2.4 Sprint 2.4.3 — increment SQL fragment.
//
// Extracted so jest can pin the contract (UPDATE ... SET ... = ... + 1
// + updated_at refresh, scoped by natural (source_type, source_id)
// key) without spinning up expo-sqlite. Mirrors the
// foodRepository / dishRepository / mealTemplateRepository
// increment pattern so a future "increment everything across
// schemas" refactor can sweep all four call sites uniformly.
//
// Drafting 162 anti-pattern (「専用 column 必要性 surface 後で」)
// の正解: 既 use_count column を再利用、 v39 migration なし。

export const INCREMENT_SEARCH_INDEX_USE_COUNT_SQL = `UPDATE search_index
        SET use_count = use_count + 1,
            updated_at = datetime('now')
      WHERE source_type = ? AND source_id = ?`;
