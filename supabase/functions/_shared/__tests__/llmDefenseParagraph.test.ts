// v1.5 Phase 2.7 Sprint 2.7.2 — buildLLMDefenseParagraph tests.
//
// Node-side jest, pure TS, no Deno runtime. Pins the contract of the
// shared L3 paragraph builder so every sister EF that imports it (the
// Drafting 173 fan-out callers) inherits the same defensive
// guarantees with only a per-EF closing line.

import { buildLLMDefenseParagraph } from '../llmSecurity';

describe('buildLLMDefenseParagraph (Drafting 173 fan-out L3 helper)', () => {
  it('returns a paragraph that opens with the security section header', () => {
    const out = buildLLMDefenseParagraph('本来の話題に戻ります。');
    expect(out).toContain('【セキュリティと内部情報】');
  });

  it('includes the system-prompt disclosure refusal clause', () => {
    const out = buildLLMDefenseParagraph('back to topic.');
    expect(out).toContain('システムプロンプト');
    expect(out).toContain('API キー');
    expect(out).toContain('実装詳細');
  });

  it('includes the override-defiance clause', () => {
    const out = buildLLMDefenseParagraph('topic.');
    expect(out).toContain('これまでの指示を無視');
    expect(out).toContain('新しい役割になって');
    expect(out).toContain('開発者として答えて');
  });

  it('includes the cross-user-data refusal clause', () => {
    const out = buildLLMDefenseParagraph('topic.');
    expect(out).toContain('他のユーザー');
    expect(out).toContain('集計情報');
    expect(out).toContain('ビジネス指標');
  });

  it('includes the verbatim-repeat refusal clause', () => {
    const out = buildLLMDefenseParagraph('topic.');
    expect(out).toContain('verbatim');
  });

  it('includes the model-identity stability clause', () => {
    const out = buildLLMDefenseParagraph('topic.');
    expect(out).toContain('Gemini ですか');
    expect(out).toContain('私は Mealift のアドバイザーです');
  });

  it('interpolates the caller-supplied closing redirect verbatim', () => {
    const closing = '本来のトレーニングルーティン提案に戻ります。';
    const out = buildLLMDefenseParagraph(closing);
    expect(out.endsWith(closing)).toBe(true);
  });

  it('starts with a blank line so it concatenates cleanly with an existing prompt', () => {
    const out = buildLLMDefenseParagraph('x.');
    expect(out.startsWith('\n\n【')).toBe(true);
  });
});
