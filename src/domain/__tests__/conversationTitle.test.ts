import {
  deriveConversationTitle,
  formatFallbackTitle,
  displayConversationTitle,
} from '../conversationTitle';

describe('deriveConversationTitle', () => {
  it('returns the trimmed text when short', () => {
    expect(deriveConversationTitle('PFCについて教えて')).toBe(
      'PFCについて教えて',
    );
  });

  it('collapses internal whitespace and trims', () => {
    expect(deriveConversationTitle('  今日の   食事  ')).toBe('今日の 食事');
  });

  it('truncates long text with an ellipsis', () => {
    const long = 'あ'.repeat(40);
    const result = deriveConversationTitle(long);
    expect(result).toBe(`${'あ'.repeat(24)}…`);
    expect(result).toHaveLength(25); // 24 chars + ellipsis
  });

  it('returns null for empty / whitespace-only input', () => {
    expect(deriveConversationTitle('')).toBeNull();
    expect(deriveConversationTitle('   \n  ')).toBeNull();
  });
});

describe('formatFallbackTitle', () => {
  it('formats a valid ISO timestamp to a month/day label', () => {
    expect(formatFallbackTitle('2026-06-02T10:30:00.000Z')).toMatch(
      /^\d{1,2}月\d{1,2}日の会話$/,
    );
  });

  it('returns a safe default for an invalid timestamp', () => {
    expect(formatFallbackTitle('not-a-date')).toBe('会話');
  });
});

describe('displayConversationTitle', () => {
  it('prefers a non-empty title', () => {
    expect(
      displayConversationTitle('食事改善の相談', '2026-06-02T10:30:00.000Z'),
    ).toBe('食事改善の相談');
  });

  it('falls back to a date label when title is null or blank', () => {
    expect(
      displayConversationTitle(null, '2026-06-02T10:30:00.000Z'),
    ).toMatch(/月\d{1,2}日の会話$/);
    expect(
      displayConversationTitle('   ', '2026-06-02T10:30:00.000Z'),
    ).toMatch(/月\d{1,2}日の会話$/);
  });
});
