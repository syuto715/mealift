// v1.3.0 / Onboarding v2 / Phase C-2 — pure validation helpers for
// the [2] nickname screen.
//
// Stays in the domain layer (no React imports) so jest can exercise
// every branch without RNTL infra (Build 15+ TODO 12 still
// outstanding). The screen's TextInput uses these helpers + the
// error-message resolver to drive UI state.
//
// Scope decision: nickname is a free-form display string, NOT the
// Supabase login identity (Profile.displayName covers that). So
// the validation rules are user-facing UX rules, not security:
//   - Empty / whitespace-only → blocked (must have something to
//     greet the user with)
//   - Long strings clipped at 20 chars (kickoff §C-2 default;
//     Phase E QA can revisit)
//   - Control chars (\x00-\x1F) blocked because they corrupt
//     downstream rendering (push notifications, screen-reader)
//   - Emoji + JP characters explicitly allowed (Mealift JP audience
//     leans heavily on sticker / kaomoji culture).

export const NICKNAME_MIN_LENGTH = 1;
export const NICKNAME_MAX_LENGTH = 20;

export type NicknameValidationFailure = 'empty' | 'too_long' | 'invalid_char';

export type NicknameValidationResult =
  | { valid: true; sanitized: string }
  | { valid: false; reason: NicknameValidationFailure };

// Control-char regex — matches the C0 (\x00-\x1F) and DEL (\x7F)
// ranges. We don't reject the C1 set (\x80-\x9F) because most JP
// users won't hit those, and the few false positives among JP IME
// candidates aren't worth the false-negative risk.
const CONTROL_CHAR_RE = /[\x00-\x1F\x7F]/;

// Codex pass 1 / Important fix — count user-visible characters,
// not UTF-16 code units. JS string.length counts code units, so
// `🍱`.length === 2 and an 11-emoji nickname falsely trips
// too_long. Spread-iterator counts code points: handles surrogate
// pairs (most emoji) correctly. Doesn't fully respect grapheme
// clusters with ZWJ sequences (👨‍👩‍👧‍👦 counts as 4 code points,
// not 1 grapheme), but the failure mode is now "user can fit
// MORE than 20 graphemes" rather than "rejected at 11 emoji" —
// strictly better for the JP sticker audience.
function countCodePoints(s: string): number {
  return [...s].length;
}

export function validateNickname(input: string): NicknameValidationResult {
  if (typeof input !== 'string') {
    return { valid: false, reason: 'empty' };
  }
  const trimmed = input.trim();
  const codePoints = countCodePoints(trimmed);
  if (codePoints < NICKNAME_MIN_LENGTH) {
    return { valid: false, reason: 'empty' };
  }
  // Length check operates on user-visible code points (see
  // countCodePoints). The TextInput's maxLength prop counts UTF-16
  // code units, so it kicks in earlier than this domain check —
  // that's a known mismatch the Phase E QA pass will revisit.
  if (codePoints > NICKNAME_MAX_LENGTH) {
    return { valid: false, reason: 'too_long' };
  }
  if (CONTROL_CHAR_RE.test(trimmed)) {
    return { valid: false, reason: 'invalid_char' };
  }
  return { valid: true, sanitized: trimmed };
}

const ERROR_MESSAGES: Record<NicknameValidationFailure, string> = {
  empty: 'ニックネームを入力してください',
  too_long: `ニックネームは ${NICKNAME_MAX_LENGTH} 文字以内で入力してください`,
  invalid_char: '使えない文字が含まれています',
};

export function getValidationErrorMessage(
  reason: NicknameValidationFailure,
): string {
  return ERROR_MESSAGES[reason];
}

// === getInitialNickname ===
//
// Pre-fill resolver — the screen reads existing profile data so
// returning users see their current nickname pre-loaded rather
// than starting from scratch. Priority:
//   1. profile.nickname (v1.3.0 native field, the canonical source)
//   2. profile.displayName (legacy fallback for Build 14/15 users
//      who never went through Onboarding v2; also the Supabase-
//      derived login identity)
//   3. empty string (pre-auth boot or freshly registered user)
//
// Pulled out as a helper so jest can pin the priority without
// mounting the screen.
export function getInitialNickname(
  profile: { nickname: string | null; displayName: string } | null,
): string {
  if (!profile) return '';
  if (profile.nickname && profile.nickname.length > 0) return profile.nickname;
  return profile.displayName ?? '';
}
