import { normalizeForSearch } from './normalizeForSearch';

// v1.5 Phase 2.3 Sprint 2.3.1 — FTS5 MATCH expression builder.
//
// Splits the user's free-form query on whitespace, runs each token
// through `normalizeForSearch` (Drafting 158), strips FTS5 syntax
// characters, and appends `*` so partial entries like "ラーメ"
// surface "ラーメン" rows.
//
// Returns `""` when the user has typed nothing matchable; callers
// should short-circuit to an empty result list instead of running
// a MATCH ''" against the FTS5 table (which would error).

export function buildMatchExpression(query: string): string {
  const normalized = normalizeForSearch(query);
  const tokens = normalized
    .split(/[\s　]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => t.replace(/["()*]/g, ''));
  if (tokens.length === 0) return '';
  return tokens.map((t) => `"${t}"*`).join(' ');
}
