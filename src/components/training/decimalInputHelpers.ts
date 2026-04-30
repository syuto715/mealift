// Pure helpers for DecimalInput. Extracted so the bug-fix logic is
// testable without React Native runtime / RNTL setup.
//
// Background: TextInputs whose `value` round-trips through a number
// (state stores number, render `String(num)`) cannot represent
// mid-keystroke partial decimals like "72." — the dot disappears as
// soon as parseFloat collapses it back to 72. DecimalInput holds a
// local string draft and uses these helpers to arbitrate when to
// commit to the parent and when to resync from external value
// changes.

export type ParseDecimalResult =
  | { kind: 'empty' }
  | { kind: 'parsed'; value: number }
  | { kind: 'invalid' };

// Accepts: empty, integer ("100"), full decimal ("72.5"), trailing-dot
// partial ("72."), and leading-dot partial (".5" — parses to 0.5).
// Rejects: ".", scientific ("1e5"), multi-dot ("1.2.3"), letters,
// whitespace, signs.
const VALID_DECIMAL_PATTERN = /^\d*\.?\d*$/;

export function parseDecimalInput(text: string): ParseDecimalResult {
  if (text === '') return { kind: 'empty' };
  if (!VALID_DECIMAL_PATTERN.test(text)) return { kind: 'invalid' };
  const parsed = parseFloat(text);
  if (!Number.isFinite(parsed)) return { kind: 'invalid' };
  return { kind: 'parsed', value: parsed };
}

// Returns true when the external value differs from the last value
// the component committed itself. That distinguishes external state
// changes (copy-previous-set, reset) from echoes of our own commits,
// which would otherwise clobber the user's mid-keystroke draft.
export function shouldResyncDraft(
  externalValue: number | null,
  lastCommitted: number | null,
): boolean {
  return externalValue !== lastCommitted;
}
