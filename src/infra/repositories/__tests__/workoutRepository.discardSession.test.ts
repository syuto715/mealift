// S3-2 — discardSession の回帰テスト。
// 受け入れ条件: 単一トランザクション (部分破棄なし) / 4テーブル soft-delete /
// tombstone enqueue / 冪等性 / 0セット分岐。
// fake DB は既存パターン (deloadRecommendationRepository.test.ts) を踏襲しつつ、
// withTransactionAsync を snapshot/restore で rollback までモデリングする。

import type { SQLiteDatabase } from 'expo-sqlite';
import { discardSession } from '../workoutRepository';
import { getDatabase } from '../../database/connection';

// jest.mock はファイル先頭へ hoist される。mockEnqueue の参照は factory 実行時
// ではなく呼び出し時に解決されるため、import 後の宣言でも TDZ にならない。
jest.mock('../../database/connection', () => ({ getDatabase: jest.fn() }));
// generateId() は expo-crypto を引き込むため境界で stub (既存テストと同じ)
jest.mock('../../../utils/id', () => ({ generateId: () => 'stub-id' }));

const mockEnqueue = jest.fn(
  async (_table: string, _id: string, _op: string): Promise<void> => undefined,
);
jest.mock('../syncRepository', () => ({
  enqueueRowFromTable: (table: string, id: string, op: string) =>
    mockEnqueue(table, id, op),
}));

interface FakeRow {
  id: string;
  deleted_at: string | null;
  updated_at: string;
  [key: string]: unknown;
}

interface FakeTables {
  workout_sessions: FakeRow[];
  workout_sets: FakeRow[];
  estimated_1rm: FakeRow[];
  personal_records: FakeRow[];
}

function makeFakeDb(tables: FakeTables, opts: { failOn?: string } = {}) {
  const inList = (sql: string, params: unknown[], skip: number) =>
    params.slice(skip) as string[];

  const fake = {
    tables,
    async withTransactionAsync(fn: () => Promise<void>) {
      // BEGIN → task → COMMIT / 失敗時 ROLLBACK を snapshot/restore で模擬
      const snapshot = JSON.parse(JSON.stringify(tables)) as FakeTables;
      try {
        await fn();
      } catch (err) {
        (Object.keys(tables) as (keyof FakeTables)[]).forEach((k) => {
          tables[k].length = 0;
          tables[k].push(...snapshot[k]);
        });
        throw err;
      }
    },
    async getAllAsync(sql: string, params: unknown[]) {
      if (sql.includes('SELECT id FROM workout_sets WHERE session_id = ?')) {
        return tables.workout_sets
          .filter((r) => r.session_id === params[0] && r.deleted_at === null)
          .map((r) => ({ id: r.id }));
      }
      if (sql.includes('FROM estimated_1rm e')) {
        // JOIN workout_sets ws ON ws.id = e.source_set_id WHERE ws.session_id = ?
        // (ws.deleted_at は見ない — 削除済みセット由来の観測も対象)
        const sessionSetIds = new Set(
          tables.workout_sets
            .filter((r) => r.session_id === params[0])
            .map((r) => r.id),
        );
        return tables.estimated_1rm
          .filter(
            (r) =>
              sessionSetIds.has(r.source_set_id as string) && r.deleted_at === null,
          )
          .map((r) => ({ id: r.id }));
      }
      if (sql.includes('SELECT id FROM personal_records WHERE session_id = ?')) {
        return tables.personal_records
          .filter((r) => r.session_id === params[0] && r.deleted_at === null)
          .map((r) => ({ id: r.id }));
      }
      throw new Error(`unexpected getAllAsync: ${sql}`);
    },
    async runAsync(sql: string, params: unknown[]) {
      if (opts.failOn && sql.includes(opts.failOn)) {
        throw new Error(`injected failure: ${opts.failOn}`);
      }
      const [deletedAt, updatedAt] = params as [string, string];
      const softDelete = (rows: FakeRow[], ids: Set<string>) => {
        for (const r of rows) {
          if (ids.has(r.id)) {
            r.deleted_at = deletedAt;
            r.updated_at = updatedAt;
          }
        }
      };
      if (sql.includes('UPDATE workout_sets SET deleted_at')) {
        softDelete(tables.workout_sets, new Set(inList(sql, params, 2)));
        return { changes: 1 };
      }
      if (sql.includes('UPDATE estimated_1rm SET deleted_at')) {
        softDelete(tables.estimated_1rm, new Set(inList(sql, params, 2)));
        return { changes: 1 };
      }
      if (sql.includes('UPDATE personal_records SET deleted_at')) {
        softDelete(tables.personal_records, new Set(inList(sql, params, 2)));
        return { changes: 1 };
      }
      if (sql.includes('UPDATE workout_sessions SET deleted_at')) {
        const target = tables.workout_sessions.find(
          (r) => r.id === params[2] && r.deleted_at === null,
        );
        if (target) {
          target.deleted_at = deletedAt;
          target.updated_at = updatedAt;
        }
        return { changes: target ? 1 : 0 };
      }
      throw new Error(`unexpected runAsync: ${sql}`);
    },
  };
  return fake as unknown as SQLiteDatabase & { tables: FakeTables };
}

const row = (id: string, extra: Record<string, unknown> = {}): FakeRow => ({
  id,
  deleted_at: null,
  updated_at: '2026-07-01T00:00:00.000Z',
  ...extra,
});

// s1 = 破棄対象 (セット2・e1RM2・PR2)、s2 = 無関係セッション (巻き添え検知用)
function makeTables(): FakeTables {
  return {
    workout_sessions: [row('s1'), row('s2')],
    workout_sets: [
      row('set-a', { session_id: 's1' }),
      row('set-b', { session_id: 's1' }),
      row('set-z', { session_id: 's2' }),
    ],
    estimated_1rm: [
      row('e1', { source_set_id: 'set-a' }),
      row('e2', { source_set_id: 'set-b' }),
      row('e-other', { source_set_id: 'set-z' }),
      row('e-null', { source_set_id: null }),
    ],
    personal_records: [
      row('pr1', { session_id: 's1' }),
      row('pr2', { session_id: 's1' }),
      row('pr-other', { session_id: 's2' }),
      row('pr-null', { session_id: null }),
    ],
  };
}

const mockGetDatabase = getDatabase as jest.Mock;

const deletedIds = (rows: FakeRow[]) =>
  rows.filter((r) => r.deleted_at !== null).map((r) => r.id).sort();

describe('discardSession (S3-2)', () => {
  beforeEach(() => {
    mockEnqueue.mockClear();
    mockEnqueue.mockImplementation(async () => undefined);
  });

  it('4テーブルを soft-delete し、対象行だけを tombstone enqueue する', async () => {
    const db = makeFakeDb(makeTables());
    mockGetDatabase.mockResolvedValue(db);

    await discardSession('s1');

    expect(deletedIds(db.tables.workout_sessions)).toEqual(['s1']);
    expect(deletedIds(db.tables.workout_sets)).toEqual(['set-a', 'set-b']);
    expect(deletedIds(db.tables.estimated_1rm)).toEqual(['e1', 'e2']);
    expect(deletedIds(db.tables.personal_records)).toEqual(['pr1', 'pr2']);

    // 全行で同一タイムスタンプ (updated_at bump = edit-wins tombstone 成立)
    const s1 = db.tables.workout_sessions.find((r) => r.id === 's1')!;
    expect(s1.updated_at).toBe(s1.deleted_at);

    expect(mockEnqueue.mock.calls).toEqual([
      ['workout_sets', 'set-a', 'UPDATE'],
      ['workout_sets', 'set-b', 'UPDATE'],
      ['estimated_1rm', 'e1', 'UPDATE'],
      ['estimated_1rm', 'e2', 'UPDATE'],
      ['personal_records', 'pr1', 'UPDATE'],
      ['personal_records', 'pr2', 'UPDATE'],
      ['workout_sessions', 's1', 'UPDATE'],
    ]);
  });

  it('途中失敗で全ロールバック — 部分破棄状態を作らない', async () => {
    const db = makeFakeDb(makeTables(), {
      failOn: 'UPDATE personal_records SET deleted_at',
    });
    mockGetDatabase.mockResolvedValue(db);

    await expect(discardSession('s1')).rejects.toThrow('injected failure');

    // sets / e1rm は失敗前に UPDATE 済みだったが、rollback で全て復元される
    expect(deletedIds(db.tables.workout_sets)).toEqual([]);
    expect(deletedIds(db.tables.estimated_1rm)).toEqual([]);
    expect(deletedIds(db.tables.personal_records)).toEqual([]);
    expect(deletedIds(db.tables.workout_sessions)).toEqual([]);
    // enqueue はトランザクション末尾なので未実行
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('enqueue 失敗でも soft-delete ごとロールバックされる (同一トランザクション)', async () => {
    const db = makeFakeDb(makeTables());
    mockGetDatabase.mockResolvedValue(db);
    mockEnqueue.mockRejectedValueOnce(new Error('queue full'));

    await expect(discardSession('s1')).rejects.toThrow('queue full');

    expect(deletedIds(db.tables.workout_sets)).toEqual([]);
    expect(deletedIds(db.tables.workout_sessions)).toEqual([]);
  });

  it('冪等: 二重呼び出しは安全で、2回目は追加の対象を積まない', async () => {
    const db = makeFakeDb(makeTables());
    mockGetDatabase.mockResolvedValue(db);

    await discardSession('s1');
    const callsAfterFirst = mockEnqueue.mock.calls.length; // 7
    await expect(discardSession('s1')).resolves.toBeUndefined();

    // 2回目: 収集対象ゼロ → set/e1rm/pr の enqueue は増えない
    // (session 行の enqueue のみ再送され得る — server は id-keyed upsert で無害)
    const secondCalls = mockEnqueue.mock.calls.slice(callsAfterFirst);
    expect(secondCalls).toEqual([['workout_sessions', 's1', 'UPDATE']]);
    // 行状態は不変 (deleted_at が上書きされない)
    expect(deletedIds(db.tables.workout_sets)).toEqual(['set-a', 'set-b']);
  });

  it('0セットのセッション: session 行のみ tombstone', async () => {
    const tables = makeTables();
    tables.workout_sets = tables.workout_sets.filter((r) => r.session_id !== 's1');
    tables.personal_records = tables.personal_records.filter(
      (r) => r.session_id !== 's1',
    );
    const db = makeFakeDb(tables);
    mockGetDatabase.mockResolvedValue(db);

    await discardSession('s1');

    expect(deletedIds(db.tables.workout_sessions)).toEqual(['s1']);
    expect(deletedIds(db.tables.estimated_1rm)).toEqual([]);
    expect(mockEnqueue.mock.calls).toEqual([['workout_sessions', 's1', 'UPDATE']]);
  });

  it('removeSet 等で先に削除済みのセット由来 e1RM も tombstone する (Codex R1 Important #2)', async () => {
    const tables = makeTables();
    // set-c: 過去に removeSet で soft-delete 済み。その観測 e3 は active のまま
    tables.workout_sets.push(
      row('set-c', { session_id: 's1', deleted_at: '2026-06-01T00:00:00.000Z' }),
    );
    tables.estimated_1rm.push(row('e3', { source_set_id: 'set-c' }));
    const db = makeFakeDb(tables);
    mockGetDatabase.mockResolvedValue(db);

    await discardSession('s1');

    expect(deletedIds(db.tables.estimated_1rm)).toEqual(['e1', 'e2', 'e3']);
    // set-c 自体は既に tombstone 済みなので touched されない (timestamps 不変)
    const setC = db.tables.workout_sets.find((r) => r.id === 'set-c')!;
    expect(setC.deleted_at).toBe('2026-06-01T00:00:00.000Z');
    // enqueue は今回触った行のみ (set-c は含まない、e3 は含む)
    const enqueuedIds = mockEnqueue.mock.calls.map((c) => c[1]);
    expect(enqueuedIds).toContain('e3');
    expect(enqueuedIds).not.toContain('set-c');
  });

  it('501 セットでも chunk 分割で全件 tombstone される (SQLite パラメータ上限対策)', async () => {
    const tables = makeTables();
    tables.workout_sets = Array.from({ length: 501 }, (_, i) =>
      row(`bulk-${i}`, { session_id: 's1' }),
    );
    tables.estimated_1rm = [];
    tables.personal_records = [];
    const db = makeFakeDb(tables);
    mockGetDatabase.mockResolvedValue(db);

    await discardSession('s1');

    expect(deletedIds(db.tables.workout_sets)).toHaveLength(501);
    // enqueue も全セット + session
    expect(mockEnqueue.mock.calls).toHaveLength(502);
  });

  it('無関係セッションの行 (sets/e1rm/PR) には触れない', async () => {
    const db = makeFakeDb(makeTables());
    mockGetDatabase.mockResolvedValue(db);

    await discardSession('s1');

    const untouched = ['set-z', 'e-other', 'e-null', 'pr-other', 'pr-null', 's2'];
    const all = [
      ...db.tables.workout_sessions,
      ...db.tables.workout_sets,
      ...db.tables.estimated_1rm,
      ...db.tables.personal_records,
    ];
    for (const id of untouched) {
      expect(all.find((r) => r.id === id)?.deleted_at).toBeNull();
    }
  });
});
