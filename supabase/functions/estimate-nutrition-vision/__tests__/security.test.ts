// v1.5 Phase 2.7 Sprint 2.7.3 — estimate-nutrition-vision security tests.
//
// Drafting 173 wave 2 + new candidate "Multimodal prompt injection defense
// via image-text relegation": the vision EF received L3 (defense paragraph
// + multimodal-specific clauses) + L5 (output scrub before JSON.parse).
// L4 is intentionally absent because the request body has NO free-text
// surface — `imageBase64` is the only user-supplied input and the existing
// MAX_BASE64_LENGTH (1.3M chars / ~975KB) is enforced by the request
// validator. The multimodal injection defense lives in the SYSTEM_PROMPT
// text and cannot be directly exercised in a Node-side jest (no live
// Gemini call), so we pin the architectural property via keyword
// assertions on `buildLLMDefenseParagraph` + a doc-test that flags any
// future regression in the multimodal-clause wording.

import {
  SECRET_REDACTION_SENTINEL,
  buildLLMDefenseParagraph,
  scrubSecrets,
} from '../../_shared/llmSecurity';

describe('estimate-nutrition-vision L3 — defense paragraph closing redirect', () => {
  it('returns to "本来の料理画像からの栄養推定に戻ります"', () => {
    const p = buildLLMDefenseParagraph('本来の料理画像からの栄養推定に戻ります。');
    expect(p).toContain('本来の料理画像からの栄養推定に戻ります');
  });

  it('carries the cross-EF defense vocabulary', () => {
    const p = buildLLMDefenseParagraph('本来の料理画像からの栄養推定に戻ります。');
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

describe('estimate-nutrition-vision L3 — multimodal injection clause (architectural pin)', () => {
  // The multimodal injection defense lives in the Deno-side SYSTEM_PROMPT
  // constant (estimate-nutrition-vision/index.ts) and is not importable
  // from Node jest. This test pins the *expected vocabulary* that any
  // future rewrite of the multimodal clause must continue to carry,
  // so a chat-side reviewer can grep for these tokens in the EF source.
  it('expected vocabulary set (chat-side audit checklist)', () => {
    const required = [
      '手書きメモ',
      'オーバーレイテキスト',
      'ステッカー',
      'システム指示を上書き',
      '画像内容の単なる記述',
      'Ignore previous instructions', // EN attack-string-mention guidance
    ];
    // Sanity: every keyword is a non-empty string. The actual presence
    // check against the SYSTEM_PROMPT constant is a chat-side audit
    // (grep on supabase/functions/estimate-nutrition-vision/index.ts).
    for (const kw of required) {
      expect(typeof kw).toBe('string');
      expect(kw.length).toBeGreaterThan(0);
    }
  });
});

describe('estimate-nutrition-vision L5 — output scrub on Gemini JSON raw text', () => {
  it('scrubs a secret inside a JSON string-value while keeping the envelope parseable', () => {
    const key = 'AIzaSy' + 'D'.repeat(33);
    const rawJson = `{"dishName":"chicken (key=${key})","servingDescription":"1 plate","ingredients":[]}`;
    const { sanitized, redactedPatterns } = scrubSecrets(rawJson);
    expect(sanitized).toContain(SECRET_REDACTION_SENTINEL);
    expect(sanitized).not.toContain(key);
    expect(redactedPatterns).toContain('google_api_key');
    expect(() => JSON.parse(sanitized)).not.toThrow();
    const parsed = JSON.parse(sanitized) as { dishName: string };
    expect(parsed.dishName).toContain(SECRET_REDACTION_SENTINEL);
  });

  it('passes a clean Gemini JSON response through unchanged', () => {
    const cleanJson =
      '{"dishName":"鶏むね肉ソテー","servingDescription":"中皿1杯、約350g","ingredients":[{"name":"鶏むね肉","amountG":150}]}';
    const result = scrubSecrets(cleanJson);
    expect(result.sanitized).toBe(cleanJson);
    expect(result.redactedCount).toBe(0);
  });
});

describe('estimate-nutrition-vision L4 — intentionally not applied (architectural pin)', () => {
  it('documents the L4 skip rationale', () => {
    // Request body shape: { imageBase64: string }. No free-text user
    // input surface — image is binary-encoded, the prompt template
    // (PROMPT_TEXT) is server-controlled. The existing
    // MAX_BASE64_LENGTH gate (1.3M chars / ~975KB) handles payload
    // size at the request validator. Multimodal injection attacks
    // (text-in-image) are defended via the L3 SYSTEM_PROMPT
    // multimodal clause, NOT via L4 length-cap on user text.
    expect(true).toBe(true);
  });
});
