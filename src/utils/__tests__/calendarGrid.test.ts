import { buildMonthGrid, formatMonthLabel, shiftMonth } from '../calendarGrid';

describe('buildMonthGrid (S2-F)', () => {
  it('2026-07 — 月曜始まりで水曜開始の月を正しく埋める', () => {
    // 2026-07-01 は水曜。先頭週は 6/29(月)〜7/5(日)。
    const weeks = buildMonthGrid('2026-07');
    expect(weeks[0].map((d) => d.iso)).toEqual([
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
    ]);
    expect(weeks[0].map((d) => d.inMonth)).toEqual([false, false, true, true, true, true, true]);
    // 7/31 は金曜 → 末尾週は 7/27(月)〜8/2(日) で計 5 週。
    expect(weeks).toHaveLength(5);
    const lastWeek = weeks[weeks.length - 1];
    expect(lastWeek[0].iso).toBe('2026-07-27');
    expect(lastWeek[6].iso).toBe('2026-08-02');
    expect(lastWeek[6].inMonth).toBe(false);
  });

  it('月初が月曜の月は埋めセルなしで始まる', () => {
    // 2026-06-01 は月曜。
    const weeks = buildMonthGrid('2026-06');
    expect(weeks[0][0]).toEqual({ iso: '2026-06-01', day: 1, inMonth: true });
    expect(weeks).toHaveLength(5); // 6/30(火) を含む末尾週まで
  });

  it('全セルが 7 列で、月内日数が過不足ない', () => {
    for (const month of ['2026-01', '2026-02', '2024-02', '2026-12']) {
      const weeks = buildMonthGrid(month);
      for (const week of weeks) expect(week).toHaveLength(7);
      const inMonthDays = weeks.flat().filter((d) => d.inMonth);
      const expected = new Date(
        Number(month.slice(0, 4)),
        Number(month.slice(5, 7)),
        0,
      ).getDate();
      expect(inMonthDays).toHaveLength(expected);
      // 月内セルの day は 1..N の連番
      expect(inMonthDays.map((d) => d.day)).toEqual(
        Array.from({ length: expected }, (_, i) => i + 1),
      );
    }
  });

  it('うるう年 2 月を正しく扱う', () => {
    const days = buildMonthGrid('2024-02')
      .flat()
      .filter((d) => d.inMonth);
    expect(days).toHaveLength(29);
  });
});

describe('shiftMonth / formatMonthLabel (S2-F)', () => {
  it('年境界をまたぐ月送り', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftMonth('2026-07', 0)).toBe('2026-07');
  });

  it('ヘッダ表示用ラベル (ゼロ埋めなしの月)', () => {
    expect(formatMonthLabel('2026-07')).toBe('2026年7月');
    expect(formatMonthLabel('2026-12')).toBe('2026年12月');
  });
});
