// v1.5 Stage 1 Phase 1.2 — computeAiCoachChatQuota tests.

import { computeAiCoachChatQuota } from '../aiCoachChatQuota';

describe('computeAiCoachChatQuota', () => {
  it('free tier (limit=5) — counts down as messages accumulate', () => {
    expect(computeAiCoachChatQuota(5, 0)).toEqual({
      limit: 5,
      used: 0,
      remaining: 5,
      isUnlimited: false,
      isExhausted: false,
    });
    expect(computeAiCoachChatQuota(5, 3)).toMatchObject({
      remaining: 2,
      isExhausted: false,
    });
    expect(computeAiCoachChatQuota(5, 5)).toMatchObject({
      remaining: 0,
      isExhausted: true,
    });
  });

  it('plus tier (limit=200) — same logic at a higher cap', () => {
    expect(computeAiCoachChatQuota(200, 199)).toMatchObject({
      remaining: 1,
      isExhausted: false,
    });
    expect(computeAiCoachChatQuota(200, 200)).toMatchObject({
      remaining: 0,
      isExhausted: true,
    });
  });

  it('pro tier (limit=-1) — unlimited; remaining is Infinity', () => {
    const q = computeAiCoachChatQuota(-1, 9999);
    expect(q.isUnlimited).toBe(true);
    expect(q.remaining).toBe(Number.POSITIVE_INFINITY);
    expect(q.isExhausted).toBe(false);
  });

  it('used > limit (server-authoritative drift) — clamps remaining to 0', () => {
    // Edge case: the local mirror count beats the tier cap due to
    // a server-side replay / clock skew / etc. Make sure the
    // `remaining` calculation never goes negative.
    const q = computeAiCoachChatQuota(5, 10);
    expect(q.remaining).toBe(0);
    expect(q.isExhausted).toBe(true);
  });
});
