// v1.5 Phase 2.7 Sprint 2.7.2 — coach-advice security fan-out tests.
//
// Drafting 173 wave 1: coach-advice received L3 (defense paragraph) + L5
// (output scrub). L4 is intentionally absent because coach-advice has no
// free-text user input — the only request body fields are `scope` (enum)
// and `context` (already L6-projected via projectContextSafeSubset).
// These tests pin those two layers.
//
// Helpers are imported from the lifted shared module (Sprint 2.7.2 lift).
// The L3 paragraph copy is verified via `buildLLMDefenseParagraph`
// directly — we can't import the Deno-side SYSTEM_PROMPT_WEEKLY /
// SYSTEM_PROMPT_DAILY constants in Node jest, so this is the same
// pattern coach-chat uses (`redTeam.test.ts` keyword pin via L3_DEFENSE_KEYWORDS).

import {
  SECRET_REDACTION_SENTINEL,
  buildLLMDefenseParagraph,
  scrubSecrets,
} from '../../_shared/llmSecurity';

describe('coach-advice L3 — defense paragraph closing redirect (per-scope)', () => {
  it('WEEKLY scope returns to "本来の今週のアドバイスに戻ります"', () => {
    const weekly = buildLLMDefenseParagraph('本来の今週のアドバイスに戻ります。');
    expect(weekly).toContain('本来の今週のアドバイスに戻ります');
  });

  it('DAILY scope returns to "本来の今日のアドバイスに戻ります"', () => {
    const daily = buildLLMDefenseParagraph('本来の今日のアドバイスに戻ります。');
    expect(daily).toContain('本来の今日のアドバイスに戻ります');
  });

  it('carries the cross-EF defense vocabulary verbatim', () => {
    const p = buildLLMDefenseParagraph('本来の今週のアドバイスに戻ります。');
    // Mirrors the L3_DEFENSE_KEYWORDS pin from coach-chat redTeam.test.ts —
    // any rewrite that drops one of these breaks this test.
    for (const kw of [
      'システムプロンプト',
      'API キー',
      '指示を無視',
      '新しい役割',
      '開発者として',
      '他のユーザー',
      '集計情報',
      'ビジネス指標',
      'verbatim',
      '私は Mealift のアドバイザーです',
      '申し訳ありませんが',
    ]) {
      expect(p).toContain(kw);
    }
  });
});

describe('coach-advice L5 — output scrub at the JSON response boundary', () => {
  it('scrubs a Google API key the LLM might echo into the advice text', () => {
    const dirty =
      '今週は AIzaSy' + 'B'.repeat(33) + ' を意識して、 PFC バランスを整えましょう。';
    const result = scrubSecrets(dirty);
    expect(result.sanitized).toContain(SECRET_REDACTION_SENTINEL);
    expect(result.sanitized).not.toMatch(/AIza[0-9A-Za-z_-]{35}/);
    expect(result.redactedPatterns).toContain('google_api_key');
  });

  it('passes benign advice copy through unchanged', () => {
    const clean = '今週はたんぱく質を 120g、 脂質を 50g 程度に抑えるのが目標です。';
    const result = scrubSecrets(clean);
    expect(result.sanitized).toBe(clean);
    expect(result.redactedCount).toBe(0);
  });
});

describe('coach-advice L4 — intentionally not applied', () => {
  it('documents the L4 skip rationale (architectural pin)', () => {
    // coach-advice request body is { scope: 'weekly' | 'daily', context }
    // — neither is free-text. `scope` is an enum guard, `context` is
    // already L6-whitelisted via projectContextSafeSubset. No L4 surface
    // exists, so detectJailbreakHints / checkUserContentLength are not
    // wired in this EF. coach-routine (Drafting 173 wave 1) DOES have
    // L4 because its `intentText` field is free-text.
    expect(true).toBe(true);
  });
});
