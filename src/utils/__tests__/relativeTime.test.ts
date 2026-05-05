import { formatRelativeTime } from '../relativeTime';

const NOW = new Date('2026-05-06T12:00:00Z').getTime();

describe('formatRelativeTime', () => {
  it('returns 未同期 when timestamp is null', () => {
    expect(formatRelativeTime(null, NOW)).toBe('未同期');
  });

  it('returns たった今 for the same instant', () => {
    expect(formatRelativeTime(NOW, NOW)).toBe('たった今');
  });

  it('returns たった今 for sub-minute differences', () => {
    expect(formatRelativeTime(NOW - 30_000, NOW)).toBe('たった今');
    expect(formatRelativeTime(NOW - 59_000, NOW)).toBe('たった今');
  });

  it('returns minute-precision strings under an hour', () => {
    expect(formatRelativeTime(NOW - 60_000, NOW)).toBe('1 分前');
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe('5 分前');
    expect(formatRelativeTime(NOW - 59 * 60_000, NOW)).toBe('59 分前');
  });

  it('returns hour-precision strings under a day', () => {
    expect(formatRelativeTime(NOW - 60 * 60_000, NOW)).toBe('1 時間前');
    expect(formatRelativeTime(NOW - 23 * 60 * 60_000, NOW)).toBe('23 時間前');
  });

  it('returns day-precision strings under 30 days', () => {
    expect(formatRelativeTime(NOW - 24 * 60 * 60_000, NOW)).toBe('1 日前');
    expect(formatRelativeTime(NOW - 7 * 24 * 60 * 60_000, NOW)).toBe('7 日前');
    expect(formatRelativeTime(NOW - 29 * 24 * 60 * 60_000, NOW)).toBe('29 日前');
  });

  it('caps at 30日以上前 for very old timestamps', () => {
    // Cap is intentional — counting up to 365日前 etc. would imply sync
    // was working at some point recently, which is misleading.
    expect(formatRelativeTime(NOW - 30 * 24 * 60 * 60_000, NOW)).toBe(
      '30日以上前',
    );
    expect(formatRelativeTime(NOW - 365 * 24 * 60 * 60_000, NOW)).toBe(
      '30日以上前',
    );
  });

  it('handles future timestamps gracefully', () => {
    // Clock skew between device and server can produce future-dated
    // lastSyncAt; treat it as "just now" rather than crashing or
    // showing "-5 分前".
    expect(formatRelativeTime(NOW + 60_000, NOW)).toBe('たった今');
  });
});
