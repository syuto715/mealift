// Sprint TZ — local 日付規約ユーティリティの境界テスト。
//
// テストは TZ 非依存に書く (既存規約: suite は TZ=UTC / Asia/Tokyo /
// America/Los_Angeles のどれでも green — v1.5 ship checklist)。
// 「JST 0:30 の記録が当日に入る」ケースは、local Date コンストラクタで
// local 0:30 を作って表現する — TZ=Asia/Tokyo で実行したときが
// まさに JST ケースになる。

import { getISODate, localDateOf, localDayUtcRange, localMonthUtcRange } from '../format';

describe('localDateOf (Sprint TZ)', () => {
  it('local 深夜 0:30 の UTC ISO は当日の local 日付になる (旧 UTC slice だと前日)', () => {
    const iso = new Date(2026, 6, 13, 0, 30).toISOString(); // local 7/13 00:30
    expect(localDateOf(iso)).toBe('2026-07-13');
  });

  it('local 23:30 は翌日に漏れない', () => {
    const iso = new Date(2026, 6, 13, 23, 30).toISOString();
    expect(localDateOf(iso)).toBe('2026-07-13');
  });

  it('月末月初境界: 6/30 23:30 と 7/1 0:30', () => {
    expect(localDateOf(new Date(2026, 5, 30, 23, 30).toISOString())).toBe('2026-06-30');
    expect(localDateOf(new Date(2026, 6, 1, 0, 30).toISOString())).toBe('2026-07-01');
  });

  it('getISODate との整合: 同じ instant なら同じ日付', () => {
    const d = new Date(2026, 6, 13, 5, 0);
    expect(localDateOf(d.toISOString())).toBe(getISODate(d));
  });
});

describe('localDayUtcRange (Sprint TZ)', () => {
  it('半開区間 [local 0:00, 翌日 local 0:00) を UTC instant で返す', () => {
    const { startIso, endIso } = localDayUtcRange('2026-07-13');
    expect(startIso).toBe(new Date(2026, 6, 13, 0, 0, 0).toISOString());
    expect(endIso).toBe(new Date(2026, 6, 14, 0, 0, 0).toISOString());
  });

  it('local 0:30 / 23:30 は区間内、前日 23:30 / 翌日 0:30 は区間外 (ISO 字句比較)', () => {
    const { startIso, endIso } = localDayUtcRange('2026-07-13');
    const inEarly = new Date(2026, 6, 13, 0, 30).toISOString();
    const inLate = new Date(2026, 6, 13, 23, 30).toISOString();
    const outBefore = new Date(2026, 6, 12, 23, 30).toISOString();
    const outAfter = new Date(2026, 6, 14, 0, 30).toISOString();
    // SQL の `col >= ? AND col < ?` と同じ字句比較で検証
    expect(inEarly >= startIso && inEarly < endIso).toBe(true);
    expect(inLate >= startIso && inLate < endIso).toBe(true);
    expect(outBefore >= startIso).toBe(false);
    expect(outAfter < endIso).toBe(false);
  });

  it('月末日の区間終了は翌月1日 local 0:00', () => {
    const { endIso } = localDayUtcRange('2026-06-30');
    expect(endIso).toBe(new Date(2026, 6, 1, 0, 0, 0).toISOString());
  });
});

describe('localMonthUtcRange (Sprint TZ)', () => {
  it('[月初 local 0:00, 翌月初 local 0:00) を返す (年またぎ含む)', () => {
    const jul = localMonthUtcRange('2026-07');
    expect(jul.startIso).toBe(new Date(2026, 6, 1, 0, 0, 0).toISOString());
    expect(jul.endIso).toBe(new Date(2026, 7, 1, 0, 0, 0).toISOString());
    const dec = localMonthUtcRange('2025-12');
    expect(dec.endIso).toBe(new Date(2026, 0, 1, 0, 0, 0).toISOString());
  });

  it('月初 local 0:30 のセッションはその月に、前月末 23:30 は前月に入る', () => {
    const { startIso, endIso } = localMonthUtcRange('2026-07');
    const firstNight = new Date(2026, 6, 1, 0, 30).toISOString();
    const prevMonthLate = new Date(2026, 5, 30, 23, 30).toISOString();
    expect(firstNight >= startIso && firstNight < endIso).toBe(true);
    expect(prevMonthLate >= startIso).toBe(false);
  });
});
