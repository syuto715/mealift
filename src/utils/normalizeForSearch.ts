// v1.5 Phase 2.3 Sprint 2.3.1 — search query normalization (Drafting 158).
//
// Goal: produce a canonical form usable both at index build time
// (alias_concat field generation) and at query time (user input
// preprocessing) so that「ラーメン」/「らーめん」/「ﾗｰﾒﾝ」/「ラーメン」(width-variant)
// all collapse to the same token before reaching FTS5.
//
// Steps:
//   1. NFKC — fold halfwidth katakana, fullwidth ascii, compatibility
//      forms, etc. into their canonical compositions.
//   2. Lowercase ASCII — chain brands often mix English-uppercase
//      ("TALL", "GRANDE") with names; index in lowercase so the user
//      doesn't need to match case.
//   3. Hiragana → katakana — yomigana is canonical in katakana, so
//      we collapse the kana axis early. Note: prolonged-sound mark
//      (ー / 長音) and small kana (ヤ/ャ etc.) are preserved.
//
// We deliberately do NOT strip whitespace or punctuation — FTS5's
// own tokenizer handles those boundaries. Stripping here would
// destroy multi-word search phrases.

const HIRAGANA_START = 0x3041; // ぁ
const HIRAGANA_END = 0x3096;   // ゖ
const HIRAGANA_TO_KATAKANA_OFFSET = 0x60; // ぁ(0x3041) → ァ(0x30A1)

function hiraganaToKatakana(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    if (code >= HIRAGANA_START && code <= HIRAGANA_END) {
      out += String.fromCharCode(code + HIRAGANA_TO_KATAKANA_OFFSET);
    } else {
      out += s[i];
    }
  }
  return out;
}

export function normalizeForSearch(input: string): string {
  if (!input) return '';
  // 1. Unicode NFKC (halfwidth/fullwidth, compatibility decomposition).
  const nfkc = input.normalize('NFKC');
  // 2. Lowercase ASCII letters.
  const lowered = nfkc.toLowerCase();
  // 3. Hiragana → katakana.
  return hiraganaToKatakana(lowered);
}
