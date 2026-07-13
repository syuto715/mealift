// Sprint TZ — local 日付規約ユーティリティの境界テスト。
//
// テストは TZ 非依存に書く (既存規約: suite は TZ=UTC / Asia/Tokyo /
// America/Los_Angeles のどれでも green — v1.5 ship checklist)。
// 「JST 0:30 の記録が当日に入る」ケースは、local Date コンストラクタで
// local 0:30 を作って表現する — TZ=Asia/Tokyo で実行したときが
// まさに JST ケースになる。

import { getISODate, localDateOf, localDaysAgoStartIso, localDayUtcRange, localMonthUtcRange } from '../format';

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

describe('localDateOf — 形式耐性 (Sprint TZ R2/R3)', () => {
  it("sync pull 由来の '+00:00' オフセット形式も解釈する", () => {
    const d = new Date(2026, 6, 13, 0, 30);
    const offsetForm = d.toISOString().replace(/\.\d{3}Z$/, '+00:00');
    expect(localDateOf(offsetForm)).toBe(getISODate(d));
  });

  it("naive space 形式 (datetime('now') 由来) は UTC として解釈する — parseISO の local 誤解釈を防ぐ", () => {
    // local 0:30 の instant を space 形式にすると、parseISO 直呼びでは
    // local 15:30 前日等に誤解釈され日付がズレる (Codex R2 #1)
    const d = new Date(2026, 6, 13, 0, 30);
    const spaceForm = d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
    expect(localDateOf(spaceForm)).toBe(getISODate(d));
  });

  it('不正形式は date 部への fallback (throw しない)', () => {
    expect(localDateOf('9999-99-99T99:99:99Z')).toBe('9999-99-99');
  });
});

describe('DST 日の半開区間 (America/Los_Angeles 実行時に 23h/25h 日を検証)', () => {
  it('2026-03-08 (US spring forward): 境界は local midnight 同士で、0:30/23:30 は区間内', () => {
    const { startIso, endIso } = localDayUtcRange('2026-03-08');
    expect(startIso).toBe(new Date(2026, 2, 8, 0, 0, 0).toISOString());
    expect(endIso).toBe(new Date(2026, 2, 9, 0, 0, 0).toISOString());
    const early = new Date(2026, 2, 8, 0, 30).toISOString();
    const late = new Date(2026, 2, 8, 23, 30).toISOString();
    expect(early >= startIso && early < endIso).toBe(true);
    expect(late >= startIso && late < endIso).toBe(true);
  });

  it('2026-11-01 (US fall back): 同上 (25h 日)', () => {
    const { startIso, endIso } = localDayUtcRange('2026-11-01');
    expect(startIso).toBe(new Date(2026, 10, 1, 0, 0, 0).toISOString());
    expect(endIso).toBe(new Date(2026, 10, 2, 0, 0, 0).toISOString());
  });
});

describe('localDaysAgoStartIso (Sprint TZ R2)', () => {
  it('「直近 N 日」= cutoff 日の local 0:00 起点 (境界日を丸ごと含むカレンダー日意味論)', () => {
    const now = new Date(2026, 6, 31, 12, 0); // local 7/31 正午
    const start = localDaysAgoStartIso(30, now);
    // 30日前 = 7/1。その local 0:00 が窓開始 → 7/1 早朝の記録も「直近30日」に入る
    expect(start).toBe(new Date(2026, 6, 1, 0, 0, 0).toISOString());
    const earlyOnCutoffDay = new Date(2026, 6, 1, 8, 0).toISOString();
    expect(earlyOnCutoffDay >= start).toBe(true);
  });
});
