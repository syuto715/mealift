// v1.5 Phase 2.7 Sprint 2.7.3 — generate-weekly-report security tests.
//
// Drafting 173 wave 2: weekly-report received L3 (defense paragraph as
// systemInstruction) + L5 (output scrub before JSON.parse). L4 is
// genuinely absent — the EF's existing header comment + closed-world
// allowlist (ALLOWED_BODY_KEYS / ALLOWED_REPORT_KEYS) enforce a
// no-free-text architectural property: reportData is purely numeric +
// ISO-date + enum, validated to strict shapes. Adding L4 would be
// dead code today. The L3 + L5 layers are defense-in-depth: a future
// schema addition that accidentally introduces a string field would
// still face them.

import {
  SECRET_REDACTION_SENTINEL,
  buildLLMDefenseParagraph,
  scrubSecrets,
} from '../../_shared/llmSecurity';

describe('generate-weekly-report L3 — defense paragraph closing redirect', () => {
  it('returns to "本来の週次レポート生成に戻ります"', () => {
    const p = buildLLMDefenseParagraph('本来の週次レポート生成に戻ります。');
    expect(p).toContain('本来の週次レポート生成に戻ります');
  });

  it('carries the cross-EF defense vocabulary', () => {
    const p = buildLLMDefenseParagraph('本来の週次レポート生成に戻ります。');
    for (const kw of [
      'システムプロンプト',
      'API キー',
      '指示を無視',
      '他のユーザー',
      'verbatim',
      '私は Mealift のアドバイザーです',
    ]) {
      expect(p).toContain(kw);
    }
  });
});

describe('generate-weekly-report L5 — output scrub on the narrative JSON', () => {
  it('scrubs a secret inside the narrative JSON envelope', () => {
    const key = 'AIza' + 'E'.repeat(35);
    const rawJson = `{"overall":"今週は ${key} の安定運用を意識して…","sections":{"workout":"x","nutrition":"y","weight":"z","integration":"w"}}`;
    const { sanitized, redactedPatterns } = scrubSecrets(rawJson);
    expect(sanitized).toContain(SECRET_REDACTION_SENTINEL);
    expect(sanitized).not.toContain(key);
    expect(redactedPatterns).toContain('google_api_key');
    expect(() => JSON.parse(sanitized)).not.toThrow();
  });

  it('passes a clean weekly-report JSON through unchanged', () => {
    const cleanJson =
      '{"overall":"今週は十分なたんぱく質が摂れていました。","sections":{"workout":"a","nutrition":"b","weight":"c","integration":"d"}}';
    const result = scrubSecrets(cleanJson);
    expect(result.sanitized).toBe(cleanJson);
    expect(result.redactedCount).toBe(0);
  });

  it('handles a JWT-shaped substring (defense-in-depth)', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0NTAifQ.dummysignaturepartXYZ_abc';
    const rawJson = `{"overall":"For ${jwt} — keep it safe","sections":{"workout":"a","nutrition":"b","weight":"c","integration":"d"}}`;
    const { sanitized, redactedPatterns } = scrubSecrets(rawJson);
    expect(sanitized).toContain(SECRET_REDACTION_SENTINEL);
    expect(sanitized).not.toContain(jwt);
    expect(redactedPatterns).toContain('jwt');
  });
});

describe('generate-weekly-report L4 — intentionally not applied (architectural pin)', () => {
  it('documents the L4 skip rationale', () => {
    // WeeklyReportData is structurally typed: all fields are numeric,
    // null, ISO date string, or enum (goalType). The closed-world
    // allowlist (ALLOWED_BODY_KEYS / ALLOWED_REPORT_KEYS in index.ts)
    // rejects unknown fields, so a future schema addition that adds a
    // text field would either go through explicit review or break the
    // request validator. No free-text path reaches the prompt today,
    // so checkUserContentLength / detectJailbreakHints are not wired
    // in this EF. L3 + L5 are wired as defense-in-depth.
    expect(true).toBe(true);
  });
});
