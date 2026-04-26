/**
 * brandMatcher — tokenizer-aware substring matcher for the brand audit.
 *
 * Why split ASCII vs non-ASCII:
 *   ASCII brand tokens ("IN JELLY", "DNS", "Quest Nutrition") need word-
 *   boundary anchors so they don't fire on coincidental substrings — e.g.
 *   "Protein Jelly Drink" should NOT match "IN JELLY" just because
 *   "prote-in jelly" contains the literal characters.
 *
 *   Japanese tokens ("明治", "森永", "ザバス") have no natural word
 *   boundaries (Japanese isn't space-delimited), so we keep substring
 *   matching there — "明治ヨーグルト" must hit "明治".
 *
 *   Treating both languages identically (as the first iteration did) is
 *   the bug. Splitting on character class is principled.
 *
 * The predicate is "are all chars in the ASCII range (≤ 127)?". Tokens
 * with apostrophes/digits/spaces ("GOLD'S GYM", "7-Eleven", "Mars Wrigley")
 * still go through the regex path because \b anchors handle non-word
 * characters correctly.
 */

export function isAsciiOnly(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) return false;
  }
  return true;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildBrandMatcher(
  token: string,
): (haystack: string) => boolean {
  if (token.length === 0) return () => false;
  if (isAsciiOnly(token)) {
    const re = new RegExp(`\\b${escapeRegex(token)}\\b`, 'i');
    return (haystack) => re.test(haystack);
  }
  const needle = token.toLowerCase();
  return (haystack) => haystack.toLowerCase().includes(needle);
}
