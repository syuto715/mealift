// v1.3.0 / Onboarding v2 / Phase C-2 — pure-helper tests for the
// nickname [2] screen. No DB / SQLite chain to mock; the validation
// helpers have zero infra dependencies, so these tests run flat.

import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  getInitialNickname,
  getValidationErrorMessage,
  validateNickname,
} from '../nicknameValidation';

// ---------------------------------------------------------------------------
// validateNickname — happy paths
// ---------------------------------------------------------------------------

describe('validateNickname — happy paths', () => {
  it('1-char ASCII passes', () => {
    expect(validateNickname('a')).toEqual({ valid: true, sanitized: 'a' });
  });

  it('JP single character passes', () => {
    expect(validateNickname('む')).toEqual({ valid: true, sanitized: 'む' });
  });

  it('exact max-length passes', () => {
    const max = 'あ'.repeat(NICKNAME_MAX_LENGTH);
    expect(validateNickname(max)).toEqual({ valid: true, sanitized: max });
  });

  it('emoji + JP characters pass (Mealift sticker culture)', () => {
    expect(validateNickname('テスト🍱')).toEqual({
      valid: true,
      sanitized: 'テスト🍱',
    });
  });

  // Codex pass 1 / Important regression — JS string.length counts
  // UTF-16 code units, so `🍱`.repeat(11) has length 22 and would
  // falsely trip too_long. countCodePoints uses spread-iterator
  // counting which respects surrogate pairs.
  it('11 emoji passes despite UTF-16 length=22 (code-point counting)', () => {
    const elevenEmoji = '🍱'.repeat(11);
    expect(elevenEmoji.length).toBe(22); // pin the FP gotcha
    expect(validateNickname(elevenEmoji)).toEqual({
      valid: true,
      sanitized: elevenEmoji,
    });
  });

  it('20 emoji passes (exact code-point boundary)', () => {
    const twentyEmoji = '🍱'.repeat(20);
    expect(validateNickname(twentyEmoji)).toEqual({
      valid: true,
      sanitized: twentyEmoji,
    });
  });

  it('21 emoji rejected as too_long (boundary + 1)', () => {
    const twentyOneEmoji = '🍱'.repeat(21);
    expect(validateNickname(twentyOneEmoji)).toEqual({
      valid: false,
      reason: 'too_long',
    });
  });

  it('leading + trailing whitespace gets trimmed (sanitized != raw)', () => {
    expect(validateNickname('  しゅうと  ')).toEqual({
      valid: true,
      sanitized: 'しゅうと',
    });
  });
});

// ---------------------------------------------------------------------------
// validateNickname — failure modes
// ---------------------------------------------------------------------------

describe('validateNickname — failure modes', () => {
  it('empty string → empty', () => {
    expect(validateNickname('')).toEqual({ valid: false, reason: 'empty' });
  });

  it('whitespace-only → empty (after trim)', () => {
    expect(validateNickname('   ')).toEqual({
      valid: false,
      reason: 'empty',
    });
    expect(validateNickname('\t\n')).toEqual({
      valid: false,
      reason: 'empty',
    });
  });

  it('over max-length → too_long', () => {
    const over = 'a'.repeat(NICKNAME_MAX_LENGTH + 1);
    expect(validateNickname(over)).toEqual({
      valid: false,
      reason: 'too_long',
    });
  });

  it('control char (\\x00 NUL) → invalid_char', () => {
    expect(validateNickname('test\x00')).toEqual({
      valid: false,
      reason: 'invalid_char',
    });
  });

  it('control char (\\x07 BEL) → invalid_char', () => {
    expect(validateNickname('a\x07b')).toEqual({
      valid: false,
      reason: 'invalid_char',
    });
  });

  it('DEL char (\\x7F) → invalid_char', () => {
    expect(validateNickname('test\x7f')).toEqual({
      valid: false,
      reason: 'invalid_char',
    });
  });

  it('non-string input (defensive) → empty', () => {
    // The TextInput onChangeText always emits string, but JS callers
    // could pass null / undefined / number through a type cast. Guard
    // collapses to empty rather than throwing.
    // @ts-expect-error — exercising the runtime cast escape path.
    expect(validateNickname(null).valid).toBe(false);
    // @ts-expect-error — exercising the runtime cast escape path.
    expect(validateNickname(undefined).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateNickname — boundary literals
// ---------------------------------------------------------------------------

describe('NICKNAME length constants', () => {
  it('NICKNAME_MIN_LENGTH = 1 (must have at least one char)', () => {
    expect(NICKNAME_MIN_LENGTH).toBe(1);
  });

  it('NICKNAME_MAX_LENGTH = 20 (Phase E QA can revisit)', () => {
    expect(NICKNAME_MAX_LENGTH).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// getValidationErrorMessage
// ---------------------------------------------------------------------------

describe('getValidationErrorMessage', () => {
  it('returns a non-empty Japanese string for every failure reason', () => {
    expect(getValidationErrorMessage('empty')).toMatch(/ニックネーム/);
    expect(getValidationErrorMessage('too_long')).toMatch(/ニックネーム/);
    expect(getValidationErrorMessage('too_long')).toMatch(
      String(NICKNAME_MAX_LENGTH),
    );
    expect(getValidationErrorMessage('invalid_char')).toMatch(/文字/);
  });

  it('messages are distinct across reasons', () => {
    const empty = getValidationErrorMessage('empty');
    const tooLong = getValidationErrorMessage('too_long');
    const invalid = getValidationErrorMessage('invalid_char');
    expect(new Set([empty, tooLong, invalid]).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// getInitialNickname
// ---------------------------------------------------------------------------

describe('getInitialNickname', () => {
  it('null profile (pre-auth boot) → empty string', () => {
    expect(getInitialNickname(null)).toBe('');
  });

  it('profile with only displayName → displayName fallback', () => {
    expect(
      getInitialNickname({
        nickname: null,
        displayName: 'Syuto',
      }),
    ).toBe('Syuto');
  });

  it('profile with both → nickname takes priority', () => {
    expect(
      getInitialNickname({
        nickname: 'しゅうと',
        displayName: 'Syuto',
      }),
    ).toBe('しゅうと');
  });

  it('profile with empty-string nickname → falls through to displayName', () => {
    // Codex pass 1 / Nit fix — empty-string nickname is "no usable
    // nickname present" (validation forbids submitting empty), so
    // the helper treats it the same as null and falls through.
    // Not "user wants empty" semantics — the screen rejects empty
    // submissions, so a DB row with nickname=='' is corrupt /
    // legacy-import data, not user intent.
    expect(
      getInitialNickname({
        nickname: '',
        displayName: 'Syuto',
      }),
    ).toBe('Syuto');
  });

  it('profile with neither → empty string', () => {
    expect(
      getInitialNickname({
        nickname: null,
        displayName: '',
      }),
    ).toBe('');
  });
});
