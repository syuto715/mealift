// v1.5 Stage 1 Phase 1.4 — adviceCardState tests.
//
// Pure state-derivation extracted from AdviceCard so the
// precedence logic is testable without RNTL (RNTL not wired —
// `feedback_test_infrastructure_gap` memory).

// AIError pulls in supabase/client → react-native-url-polyfill (ESM)
// when this test runs in Node; stub the supabase client to keep
// the import chain pure-JS.
jest.mock('../../../infra/supabase/client', () => ({ supabase: null }));

import { pickAdviceCardState, isTierDenialError } from '../adviceCardState';
import { AIError } from '../../../infra/services/aiNutritionService';
import type { LocalCoachAdvice } from '../../../types/coachAdvice';

const FAKE_ADVICE: LocalCoachAdvice = {
  id: 'a-1',
  userId: 'u-1',
  scope: 'weekly',
  periodStart: '2026-05-11',
  content: '今週のアドバイス内容',
  generatedAt: '2026-05-17T00:00:00Z',
};

describe('pickAdviceCardState', () => {
  it('free user (no access) → locked, regardless of other signals', () => {
    expect(
      pickAdviceCardState({
        hasAccess: false,
        isLoading: false,
        error: null,
        advice: null,
      }),
    ).toBe('locked');
    expect(
      pickAdviceCardState({
        hasAccess: false,
        isLoading: true,
        error: new AIError('internal_error', 'x', 500),
        advice: FAKE_ADVICE,
      }),
    ).toBe('locked');
  });

  it('cached advice takes precedence over loading (background refresh)', () => {
    expect(
      pickAdviceCardState({
        hasAccess: true,
        isLoading: true,
        error: null,
        advice: FAKE_ADVICE,
      }),
    ).toBe('content');
  });

  it('cached advice takes precedence over error (Drafting 103: keep showing the last-good)', () => {
    expect(
      pickAdviceCardState({
        hasAccess: true,
        isLoading: false,
        error: new AIError('network_error', 'offline', 0),
        advice: FAKE_ADVICE,
      }),
    ).toBe('content');
  });

  it('no cached advice + error → error', () => {
    expect(
      pickAdviceCardState({
        hasAccess: true,
        isLoading: false,
        error: new AIError('gemini_error', 'AI応答失敗', 502),
        advice: null,
      }),
    ).toBe('error');
  });

  it('no cached advice + loading → loading', () => {
    expect(
      pickAdviceCardState({
        hasAccess: true,
        isLoading: true,
        error: null,
        advice: null,
      }),
    ).toBe('loading');
  });

  // v1.5.1 Fix 4 — サーバ側 tier 拒否は通信エラーではなく未課金として
  // locked カードへ (赤+再試行のエラー表示に混線していたバグの回帰防止)。
  it('server tier denial (plan_required 403) → locked, not error', () => {
    expect(
      pickAdviceCardState({
        hasAccess: true,
        isLoading: false,
        error: new AIError(
          'plan_required',
          'ミー先生の週次アドバイスは Plus / Pro でご利用いただけます',
          403,
        ),
        advice: null,
      }),
    ).toBe('locked');
  });

  it('server tier denial beats cached advice (I1 no-free-reads)', () => {
    expect(
      pickAdviceCardState({
        hasAccess: true,
        isLoading: false,
        error: new AIError('plan_required', 'plan', 403),
        advice: FAKE_ADVICE,
      }),
    ).toBe('locked');
  });

  it('plus_required / pro_required も tier 拒否として locked', () => {
    for (const code of ['plus_required', 'pro_required'] as const) {
      expect(
        pickAdviceCardState({
          hasAccess: true,
          isLoading: false,
          error: new AIError(code, 'x', 403),
          advice: null,
        }),
      ).toBe('locked');
    }
  });

  it('quota_exceeded は tier 拒否ではなく error のまま (再試行 CTA 維持)', () => {
    expect(
      pickAdviceCardState({
        hasAccess: true,
        isLoading: false,
        error: new AIError('quota_exceeded', '今月の上限', 429),
        advice: null,
      }),
    ).toBe('error');
  });

  it('isTierDenialError: null → false / network_error → false', () => {
    expect(isTierDenialError(null)).toBe(false);
    expect(isTierDenialError(new AIError('network_error', 'offline', 0))).toBe(
      false,
    );
  });

  it('no cached advice + idle (no loading / no error) → loading (initial mount)', () => {
    // The screen has just mounted; the useEffect that calls
    // fetchAdvice hasn't fired yet. Show a spinner rather than an
    // empty card so the user understands something is happening.
    expect(
      pickAdviceCardState({
        hasAccess: true,
        isLoading: false,
        error: null,
        advice: null,
      }),
    ).toBe('loading');
  });
});
