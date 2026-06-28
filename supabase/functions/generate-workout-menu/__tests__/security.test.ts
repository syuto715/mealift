import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SECRET_REDACTION_SENTINEL,
  buildLLMDefenseParagraph,
  scrubSecrets,
} from '../../_shared/llmSecurity';

const source = readFileSync(
  join(__dirname, '..', 'index.ts'),
  'utf8',
);

describe('generate-workout-menu L3/L5 security wiring', () => {
  it('keeps the defensive system instruction redirect for workout generation', () => {
    const p = buildLLMDefenseParagraph('本来のトレーニングメニュー生成に戻ります。');
    expect(p).toContain('本来のトレーニングメニュー生成に戻ります');
    expect(source).toContain('buildLLMDefenseParagraph');
  });

  it('scrubs a secret-shaped substring before JSON.parse stays parseable', () => {
    const key = 'AIza' + 'W'.repeat(35);
    const rawJson = `{"programName":"Push day ${key}","days":[]}`;
    const { sanitized, redactedPatterns } = scrubSecrets(rawJson);
    expect(sanitized).toContain(SECRET_REDACTION_SENTINEL);
    expect(sanitized).not.toContain(key);
    expect(redactedPatterns).toContain('google_api_key');
    expect(() => JSON.parse(sanitized)).not.toThrow();
  });

  it('wires scrubSecrets into the Gemini text boundary before JSON.parse', () => {
    expect(source).toContain('scrubSecrets');
    expect(source).toContain('const scrubResult = scrubSecrets(text)');
    expect(source).toContain('const sanitizedText = scrubResult.sanitized');
    expect(source).toContain('JSON.parse(sanitizedText)');
  });

  it('does not persist invalid raw request bodies into ai_usage_logs input', () => {
    expect(source).not.toContain('inputForLog = rawBody');
    expect(source).toContain('invalid: true');
    expect(source).not.toContain('keys:');
    expect(source).toContain('keyCount:');
  });
});
