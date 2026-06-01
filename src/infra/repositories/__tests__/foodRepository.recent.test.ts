// v1.5.2 食品追加 redesign — getRecentlyLoggedFoods (「最近」chip source).
//
// The repo test infra uses a mocked getDatabase (no real sqlite), so the
// SQL-level dedupe / null-exclusion can't be executed here; instead we assert
// (a) the contract (row-mapping, empty, error → []) and (b) that the emitted
// SQL carries the dedupe (GROUP BY food_id) + null/soft-delete exclusion
// clauses, which is the part this query depends on for correctness.

let mockNextUuid = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `uuid-${++mockNextUuid}`,
}));

const mockGetAllAsync = jest.fn();
jest.mock('../../database/connection', () => ({
  getDatabase: jest.fn(async () => ({ getAllAsync: mockGetAllAsync })),
}));

import { getRecentlyLoggedFoods } from '../foodRepository';

function foodRow(id: string, nameJa: string) {
  return {
    id,
    name_ja: nameJa,
    serving_size_g: 100,
    serving_unit: 'g',
    calories_per_serving: 200,
    protein_g: 10,
    fat_g: 5,
    carb_g: 20,
    is_user_added: 0,
  };
}

beforeEach(() => {
  mockGetAllAsync.mockReset();
});

describe('getRecentlyLoggedFoods', () => {
  it('maps rows to Food[] (most-recent-first order preserved from SQL)', async () => {
    mockGetAllAsync.mockResolvedValueOnce([
      foodRow('f-1', '鶏むね肉'),
      foodRow('f-2', '白米'),
    ]);
    const result = await getRecentlyLoggedFoods(20);
    expect(result).toHaveLength(2);
    expect(result[0].nameJa).toBe('鶏むね肉');
    expect(result[1].nameJa).toBe('白米');
  });

  it('emits SQL that dedupes by food_id and excludes null food_id + soft-deleted rows', async () => {
    mockGetAllAsync.mockResolvedValueOnce([]);
    await getRecentlyLoggedFoods(15);
    const [sql, params] = mockGetAllAsync.mock.calls[0];
    expect(sql).toMatch(/food_id IS NOT NULL/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(sql).toMatch(/GROUP BY food_id/);
    expect(sql).toMatch(/ORDER BY recent\.last_logged DESC/);
    // created_at は 2 形式混在 (space / ISO 'T') のため datetime() で正規化して
    // から MAX/ORDER すること (lexicographic 比較の recency バグ防止)。
    expect(sql).toMatch(/MAX\(datetime\(created_at\)\)/);
    expect(params).toEqual([15]);
  });

  it('returns [] when there are no recent logs', async () => {
    mockGetAllAsync.mockResolvedValueOnce([]);
    expect(await getRecentlyLoggedFoods()).toEqual([]);
  });

  it('returns [] (never throws) when the query fails', async () => {
    mockGetAllAsync.mockRejectedValueOnce(new Error('db error'));
    expect(await getRecentlyLoggedFoods()).toEqual([]);
  });

  it('defaults the limit to 20', async () => {
    mockGetAllAsync.mockResolvedValueOnce([]);
    await getRecentlyLoggedFoods();
    expect(mockGetAllAsync.mock.calls[0][1]).toEqual([20]);
  });
});
