// S4-1 — 週次トレーニングレポート用 read-only クエリの実 SQLite テスト。
// localDate.sqlite.test.ts と同じ node:sqlite :memory: パターンだが、こちらは
// production 関数そのもの (getWeeklyTrainingTotals / getWeeklyMaxE1RMs) を
// getDatabase mock 経由で実 DB に接続し、SQL の週境界 (半開区間)・orphan/
// tombstone ガード・GROUP BY 意味論を検証する。fixture は local Date
// コンストラクタ由来で TZ 非依存 (3-zone 契約: UTC / Asia/Tokyo /
// America/Los_Angeles のどれで実行しても通る)。

import { DatabaseSync } from 'node:sqlite';
import { getWeeklyTrainingTotals } from '../workoutRepository';
import { getWeeklyMaxE1RMs } from '../oneRepMaxRepository';
import { getDatabase } from '../../database/connection';

jest.mock('../../database/connection', () => ({ getDatabase: jest.fn() }));
jest.mock('../../../utils/id', () => ({ generateId: () => 'stub-id' }));
jest.mock('../syncRepository', () => ({ enqueueRowFromTable: jest.fn() }));

const mockGetDatabase = getDatabase as jest.Mock;

// expo-sqlite の async API を node:sqlite で受ける read-only shim
function makeShim(db: InstanceType<typeof DatabaseSync>) {
  return {
    async getAllAsync(sql: string, params: unknown[]) {
      return db.prepare(sql).all(...(params as never[]));
    },
    async getFirstAsync(sql: string, params: unknown[]) {
      return db.prepare(sql).get(...(params as never[])) ?? null;
    },
  };
}

// local 月曜 2026-07-13 の週 [startIso, endIso)
const WEEK_START = new Date(2026, 6, 13);
const WEEK_END = new Date(2026, 6, 20);
const startIso = WEEK_START.toISOString();
const endIso = WEEK_END.toISOString();

describe('getWeeklyTrainingTotals (S4-1)', () => {
  let db: InstanceType<typeof DatabaseSync>;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE workout_sessions (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      duration_seconds INTEGER,
      deleted_at TEXT
    )`);
    mockGetDatabase.mockResolvedValue(makeShim(db));
  });

  afterEach(() => {
    db.close();
  });

  const insert = (
    id: string,
    startedAt: Date,
    opts: { finished?: boolean; duration?: number | null; deleted?: boolean } = {},
  ) => {
    const iso = startedAt.toISOString();
    db.prepare(
      `INSERT INTO workout_sessions (id, profile_id, started_at, finished_at, duration_seconds, deleted_at)
       VALUES (?, 'p1', ?, ?, ?, ?)`,
    ).run(
      id,
      iso,
      opts.finished === false ? null : iso,
      opts.duration === undefined ? 1800 : opts.duration,
      opts.deleted ? iso : null,
    );
  };

  it('週の半開区間: 月曜 0:30 と日曜 23:30 は入り、前週日曜 23:30 と翌月曜 0:30 は入らない', async () => {
    insert('monday-0030', new Date(2026, 6, 13, 0, 30)); // 深夜開始 — 新しい週に帰属
    insert('sunday-2330', new Date(2026, 6, 19, 23, 30));
    insert('prev-sunday', new Date(2026, 6, 12, 23, 30));
    insert('next-monday', new Date(2026, 6, 20, 0, 30));

    const totals = await getWeeklyTrainingTotals('p1', startIso, endIso);

    expect(totals.sessionCount).toBe(2);
    expect(totals.totalDurationSeconds).toBe(3600);
  });

  it('orphan (finished_at NULL) と tombstone (deleted_at) は件数にも合計時間にも入らない', async () => {
    insert('finished', new Date(2026, 6, 15, 18, 0), { duration: 2400 });
    insert('orphan', new Date(2026, 6, 15, 19, 0), { finished: false, duration: null });
    insert('discarded', new Date(2026, 6, 16, 18, 0), { deleted: true, duration: 900 });

    const totals = await getWeeklyTrainingTotals('p1', startIso, endIso);

    expect(totals.sessionCount).toBe(1);
    expect(totals.totalDurationSeconds).toBe(2400);
  });

  it('duration_seconds NULL の完了セッションは件数に入り、合計は他行の和 (COALESCE で 0 フォールバック)', async () => {
    insert('with-duration', new Date(2026, 6, 14, 7, 0), { duration: 1500 });
    insert('null-duration', new Date(2026, 6, 15, 7, 0), { duration: null });

    const totals = await getWeeklyTrainingTotals('p1', startIso, endIso);

    expect(totals.sessionCount).toBe(2);
    expect(totals.totalDurationSeconds).toBe(1500);
  });

  it('sync pull 由来の形式混在 (+00:00 / space) でも datetime() 正規化で週に入る', async () => {
    const inWeek = new Date(2026, 6, 13, 0, 30);
    const toOffset = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '+00:00');
    const toSpace = (d: Date) => d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
    db.prepare(
      `INSERT INTO workout_sessions (id, profile_id, started_at, finished_at, duration_seconds, deleted_at)
       VALUES ('offset-form', 'p1', ?, ?, 600, NULL)`,
    ).run(toOffset(inWeek), toOffset(inWeek));
    db.prepare(
      `INSERT INTO workout_sessions (id, profile_id, started_at, finished_at, duration_seconds, deleted_at)
       VALUES ('space-form', 'p1', ?, ?, 600, NULL)`,
    ).run(toSpace(new Date(2026, 6, 12, 23, 30)), toSpace(new Date(2026, 6, 12, 23, 30)));

    const totals = await getWeeklyTrainingTotals('p1', startIso, endIso);

    expect(totals.sessionCount).toBe(1); // offset-form のみ (space-form は前週)
    expect(totals.totalDurationSeconds).toBe(600);
  });

  it('データゼロ週は {0, 0}', async () => {
    const totals = await getWeeklyTrainingTotals('p1', startIso, endIso);
    expect(totals).toEqual({ sessionCount: 0, totalDurationSeconds: 0 });
  });
});

describe('getWeeklyMaxE1RMs (S4-1)', () => {
  let db: InstanceType<typeof DatabaseSync>;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE estimated_1rm (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      e1rm_kg REAL NOT NULL,
      formula TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      deleted_at TEXT
    )`);
    db.exec(`CREATE TABLE exercises (
      id TEXT PRIMARY KEY,
      name_ja TEXT NOT NULL,
      deleted_at TEXT
    )`);
    db.prepare(`INSERT INTO exercises (id, name_ja, deleted_at) VALUES ('ex-bench', 'ベンチプレス', NULL)`).run();
    db.prepare(`INSERT INTO exercises (id, name_ja, deleted_at) VALUES ('ex-squat', 'スクワット', NULL)`).run();
    mockGetDatabase.mockResolvedValue(makeShim(db));
  });

  afterEach(() => {
    db.close();
  });

  let seq = 0;
  const insert = (
    exerciseId: string,
    e1rmKg: number,
    observedAt: Date,
    opts: { formula?: string; deleted?: boolean; profileId?: string } = {},
  ) => {
    db.prepare(
      `INSERT INTO estimated_1rm (id, profile_id, exercise_id, e1rm_kg, formula, observed_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `e1rm-${++seq}`,
      opts.profileId ?? 'p1',
      exerciseId,
      e1rmKg,
      opts.formula ?? 'avg',
      observedAt.toISOString(),
      opts.deleted ? observedAt.toISOString() : null,
    );
  };

  it('種目ごとに週内 MAX を返し、降順に並ぶ (formula 混在は高い方を採用)', async () => {
    insert('ex-bench', 80, new Date(2026, 6, 14, 10, 0));
    insert('ex-bench', 82.5, new Date(2026, 6, 17, 10, 0), { formula: 'adjusted' });
    insert('ex-squat', 120, new Date(2026, 6, 15, 10, 0));

    const rows = await getWeeklyMaxE1RMs('p1', startIso, endIso);

    expect(rows).toEqual([
      { exerciseId: 'ex-squat', exerciseNameJa: 'スクワット', maxE1rmKg: 120 },
      { exerciseId: 'ex-bench', exerciseNameJa: 'ベンチプレス', maxE1rmKg: 82.5 },
    ]);
  });

  it('半開区間: 月曜 0:30 観測は今週、翌月曜ちょうど 0:00 の instant は翌週', async () => {
    insert('ex-bench', 70, new Date(2026, 6, 13, 0, 30));
    insert('ex-bench', 99, WEEK_END); // 翌月曜 local 0:00 ちょうど — 半開なので除外
    insert('ex-bench', 95, new Date(2026, 6, 12, 23, 30)); // 前週

    const rows = await getWeeklyMaxE1RMs('p1', startIso, endIso);

    expect(rows).toEqual([
      { exerciseId: 'ex-bench', exerciseNameJa: 'ベンチプレス', maxE1rmKg: 70 },
    ]);
  });

  it('破棄セッション由来の tombstone 行 (deleted_at) と他 profile の行は除外される', async () => {
    insert('ex-bench', 75, new Date(2026, 6, 14, 10, 0));
    insert('ex-bench', 100, new Date(2026, 6, 15, 10, 0), { deleted: true }); // discardSession が tombstone した行
    insert('ex-bench', 110, new Date(2026, 6, 15, 11, 0), { profileId: 'p2' });

    const rows = await getWeeklyMaxE1RMs('p1', startIso, endIso);

    expect(rows).toEqual([
      { exerciseId: 'ex-bench', exerciseNameJa: 'ベンチプレス', maxE1rmKg: 75 },
    ]);
  });

  it('exercises 側が tombstone された種目は出力から落ちる', async () => {
    db.prepare(`INSERT INTO exercises (id, name_ja, deleted_at) VALUES ('ex-gone', '削除種目', '2026-07-01T00:00:00.000Z')`).run();
    insert('ex-gone', 60, new Date(2026, 6, 14, 10, 0));
    insert('ex-bench', 80, new Date(2026, 6, 14, 10, 0));

    const rows = await getWeeklyMaxE1RMs('p1', startIso, endIso);

    expect(rows).toEqual([
      { exerciseId: 'ex-bench', exerciseNameJa: 'ベンチプレス', maxE1rmKg: 80 },
    ]);
  });

  it('データゼロ週は空配列', async () => {
    expect(await getWeeklyMaxE1RMs('p1', startIso, endIso)).toEqual([]);
  });
});
