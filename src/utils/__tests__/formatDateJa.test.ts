// S4.6-C — 日本語表示フォーマッタの回帰テスト。
// now を注入して「当年は年省略」を決定論的に固定する。
// TZ 正規化の期待値は localDate.test.ts (localDateOf) の規約に揃える:
// 'Z'・'+00:00'・naive space 形式はすべて同一 instant として local 表示になる。
import { formatDateJa, formatDateTimeJa } from '../format';

const NOW_2026 = new Date('2026-08-17T12:00:00');

describe('formatDateJa', () => {
  it("当年の 'yyyy-MM-dd' は年を省略して「M月d日」", () => {
    expect(formatDateJa('2026-07-14', NOW_2026)).toBe('7月14日');
  });

  it('他年は「yyyy年M月d日」', () => {
    expect(formatDateJa('2025-12-31', NOW_2026)).toBe('2025年12月31日');
  });

  it('Date 入力も受ける', () => {
    expect(formatDateJa(new Date(2026, 0, 5), NOW_2026)).toBe('1月5日');
  });

  it("date-only 文字列は local midnight として解釈される (UTC midnight 事故なし)", () => {
    // parseISO('2026-07-14') = local 2026-07-14 00:00 — どの TZ でも 7月14日
    expect(formatDateJa('2026-07-14', NOW_2026)).toBe('7月14日');
  });

  it('不正な文字列は入力をそのまま返す (画面を壊さない防御)', () => {
    expect(formatDateJa('not-a-date', NOW_2026)).toBe('not-a-date');
  });
});

describe('formatDateTimeJa', () => {
  // 3 表記が同一 instant → 同一表示になること (localDateOf と同じ正規化規約)
  const Z_FORM = '2026-06-14T06:04:01Z';
  const OFFSET_FORM = '2026-06-14T06:04:01+00:00';
  const NAIVE_FORM = '2026-06-14 06:04:01';

  it("'Z'・'+00:00'・naive space 形式が同じ local 日時に揃う (秒は落とす)", () => {
    const fromZ = formatDateTimeJa(Z_FORM, NOW_2026);
    expect(formatDateTimeJa(OFFSET_FORM, NOW_2026)).toBe(fromZ);
    expect(formatDateTimeJa(NAIVE_FORM, NOW_2026)).toBe(fromZ);
    // 秒 (":01") は表示しない・当年なので年も出ない
    expect(fromZ).toMatch(/^6月1[45]日 \d{2}:\d{2}$/);
    expect(fromZ).not.toContain(':01:');
  });

  it('他年は「yyyy年M月d日 HH:mm」', () => {
    expect(formatDateTimeJa('2025-06-14T06:04:01Z', NOW_2026)).toMatch(
      /^2025年6月1[45]日 \d{2}:\d{2}$/,
    );
  });

  it('不正形式は入力をそのまま返す', () => {
    expect(formatDateTimeJa('broken', NOW_2026)).toBe('broken');
  });
});
