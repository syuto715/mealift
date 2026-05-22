// v1.5 Phase 2.6 Sprint 2.6.2 — coach-chat security helpers (L4 layer).
//
// Pure TypeScript so a Node-side jest test can import the validators
// without spinning up Deno (mirrors the `_shared/routineJson.ts`
// pattern already in the repo). Drafting 172 L4 is "input
// sanitization": length cap + jailbreak-hint logging (no block —
// false positives would hurt legitimate users far more than the
// extra LLM round-trip costs the platform).
//
// L3 (defensive system prompt) lives in `index.ts` as the
// `SYSTEM_PROMPT` template literal so it stays close to its only
// usage site and remains diff-friendly for chat-side review.

export const MAX_USER_CONTENT_CHARS = 4000;

export interface InputTooLong {
  code: 'input_too_long';
  limit: number;
  actual: number;
}

/** L4 length cap. Returns null if within bounds, or an error record. */
export function checkUserContentLength(
  content: string | null | undefined,
): InputTooLong | null {
  if (typeof content !== 'string') return null;
  if (content.length <= MAX_USER_CONTENT_CHARS) return null;
  return {
    code: 'input_too_long',
    limit: MAX_USER_CONTENT_CHARS,
    actual: content.length,
  };
}

// L4 jailbreak-hint patterns. Detection is *advisory only*: the
// request still goes through to Gemini (L3 SYSTEM_PROMPT carries the
// actual defense), and the EF emits a `console.warn` so Sprint 2.6.3's
// L7 red-team test can assert the pattern fired.
//
// Patterns are intentionally narrow — we want low false-positive
// rates, since blocking honest users is far costlier than letting an
// LLM gracefully refuse a known attack with the L3 prompt.

export interface JailbreakHint {
  name: string;
  pattern: RegExp;
}

// Note on regex shape:
//   - For Latin-script triggers we use `\b` word boundaries and `\s+`
//     joins so casing / spacing variants all collapse into a single
//     pattern.
//   - JS regex `\b` does NOT recognize word boundaries between CJK
//     characters, so JA patterns are matched as bare substrings (with
//     `i` flag retained — it's a no-op for kana/kanji but keeps the
//     ascii portion of mixed-script attacks case-insensitive).
//   - Quantifier stacks like "ignore all earlier prompts" need a small
//     fuzz window between the verb and the target noun, hence the
//     `(?:\w+\s+){0,3}` filler in the EN ignore-pattern.

export const JAILBREAK_HINT_PATTERNS: ReadonlyArray<JailbreakHint> = [
  {
    name: 'ignore_previous_instructions',
    pattern:
      /\bignore\s+(?:\w+\s+){0,3}(?:instructions?|prompts?|messages?|rules?)\b/i,
  },
  {
    name: 'role_override',
    pattern: /\byou\s+are\s+(?:now|actually|really)\s+(?:a\s+|an\s+)?[a-z]/i,
  },
  {
    name: 'developer_mode',
    pattern: /\b(?:developer|admin|root|dan)\s+mode\b/i,
  },
  {
    name: 'system_prompt_extraction',
    // Either the EN verb-then-noun pattern, OR the JA noun-then-verb
    // pattern. Kept as a single rule so the telemetry name stays
    // collapsed — the L7 test suite (Sprint 2.6.3) cares about *which*
    // attack family fired, not which clause inside it matched.
    pattern:
      /\b(?:show|reveal|print|display|tell\s+me|repeat)\b[^.\n]{0,40}\b(?:system\s+prompt|instructions?|prompt)\b|(?:システムプロンプト|内部設定|指示|プロンプト)[^\n]{0,15}(?:教えて|見せて|出力して|表示して|repeat|reveal|show)/i,
  },
  {
    name: 'role_play_override',
    pattern:
      /\b(?:pretend|imagine|act\s+as|roleplay|play\s+the\s+role)\b|なりきって|演じて|ロールプレイ/i,
  },
  {
    name: 'jailbreak_ja_ignore',
    pattern:
      /(?:これまで|以前|前回|過去)の(?:指示|プロンプト|ルール|設定)を(?:無視|忘れて|破棄)/,
  },
];

export interface JailbreakHintMatch {
  name: string;
}

/** L4 advisory matcher. Returns every pattern that fires (multi-pattern
 *  attacks should surface in the telemetry as a single warn with the
 *  full list, not be silently coalesced to the first). */
export function detectJailbreakHints(
  content: string | null | undefined,
): JailbreakHintMatch[] {
  if (typeof content !== 'string' || content.length === 0) return [];
  const out: JailbreakHintMatch[] = [];
  for (const { name, pattern } of JAILBREAK_HINT_PATTERNS) {
    if (pattern.test(content)) out.push({ name });
  }
  return out;
}
