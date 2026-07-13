// Sprint TZ — 半開区間 (ISO-to-ISO) の実 SQLite 挙動テスト。
// clobberGuard.test.ts と同じ node:sqlite :memory: パターンで、production の
// SQL 形状 (`started_at >= ? AND started_at < ?`) が UTC ISO 文字列の字句比較で
// local 日付境界を正しく切ることを検証する。TZ 非依存 (local Date コンストラクタ
// 由来の fixture — TZ=Asia/Tokyo 実行時が JST 境界ケースそのもの)。

import { DatabaseSync } from 'node:sqlite';
import { localDayUtcRange, localMonthUtcRange, localDateOf } from '../format';

describe('local day/month UTC range × real SQLite (Sprint TZ)', () => {
  let db: InstanceType<typeof DatabaseSync>;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE workout_sessions (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      deleted_at TEXT
    )`);
  });

  afterEach(() => {
    db.close();
  });

  const insert = (id: string, startedAt: string) => {
    db.prepare(
      `INSERT INTO workout_sessions (id, profile_id, started_at, finished_at) VALUES (?, 'p1', ?, ?)`,
    ).run(id, startedAt, startedAt);
  };

  it('local 0:30 と 23:30 のセッションが「その日」の範囲クエリに入り、前日/翌日は入らない', () => {
    insert('early', new Date(2026, 6, 13, 0, 30).toISOString()); // local 7/13 00:30 (JST なら旧 date() で前日扱いだったケース)
    insert('late', new Date(2026, 6, 13, 23, 30).toISOString());
    insert('prev', new Date(2026, 6, 12, 23, 30).toISOString());
    insert('next', new Date(2026, 6, 14, 0, 30).toISOString());

    const { startIso, endIso } = localDayUtcRange('2026-07-13');
    const rows = db
      .prepare(
        `SELECT id FROM workout_sessions
          WHERE profile_id = 'p1' AND datetime(started_at) >= datetime(?) AND datetime(started_at) < datetime(?)
            AND finished_at IS NOT NULL AND deleted_at IS NULL
          ORDER BY id`,
      )
      .all(startIso, endIso) as { id: string }[];

    expect(rows.map((r) => r.id)).toEqual(['early', 'late']);
  });

  it('sync pull 由来の形式混在 (+00:00 オフセット / space 形式) でも datetime() 正規化で正しく分類される', () => {
    // canonical toISOString の instant を各形式に変換した「同じ瞬間」の行
    const earlyLocal = new Date(2026, 6, 13, 0, 30);
    const toOffset = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '+00:00');
    const toSpace = (d: Date) => d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
    insert('offset-form', toOffset(earlyLocal)); // 2026-07-12T15:30:00+00:00 (JST例)
    insert('space-form', toSpace(new Date(2026, 6, 13, 23, 30)));
    insert('prev-offset', toOffset(new Date(2026, 6, 12, 23, 30)));

    const { startIso, endIso } = localDayUtcRange('2026-07-13');
    const rows = db
      .prepare(
        `SELECT id FROM workout_sessions
          WHERE profile_id = 'p1' AND datetime(started_at) >= datetime(?) AND datetime(started_at) < datetime(?)
            AND finished_at IS NOT NULL AND deleted_at IS NULL
          ORDER BY id`,
      )
      .all(startIso, endIso) as { id: string }[];

    expect(rows.map((r) => r.id).sort()).toEqual(['offset-form', 'space-form']);

    // 取得後の JS 日付化も形式混在で正しい (Codex R2 #1)
    const stored = db
      .prepare(`SELECT started_at FROM workout_sessions WHERE id IN ('offset-form', 'space-form')`)
      .all() as { started_at: string }[];
    for (const r of stored) {
      expect(localDateOf(r.started_at)).toBe('2026-07-13');
    }
  });

  it('月範囲クエリ + JS localDateOf の組で月末月初境界が正しい', () => {
    insert('jun-last', new Date(2026, 5, 30, 23, 30).toISOString()); // local 6/30
    insert('jul-first', new Date(2026, 6, 1, 0, 30).toISOString()); // local 7/1
    insert('jul-mid', new Date(2026, 6, 15, 12, 0).toISOString());
    insert('aug-first', new Date(2026, 7, 1, 0, 30).toISOString());

    const { startIso, endIso } = localMonthUtcRange('2026-07');
    const rows = db
      .prepare(
        `SELECT started_at FROM workout_sessions
          WHERE profile_id = 'p1' AND datetime(started_at) >= datetime(?) AND datetime(started_at) < datetime(?)
          ORDER BY started_at`,
      )
      .all(startIso, endIso) as { started_at: string }[];

    const localDates = rows.map((r) => localDateOf(r.started_at));
    expect(localDates).toEqual(['2026-07-01', '2026-07-15']);
    // 6/30 深夜が7月に混入せず、8/1 深夜も漏れ込まない
    expect(localDates).not.toContain('2026-06-30');
    expect(localDates).not.toContain('2026-08-01');
  });
});
