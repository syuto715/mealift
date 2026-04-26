/**
 * check-seed-brands.ts — brand-name audit for FITNESS_DISHES + GENERIC_FOODS.
 *
 * The product constraint: every entry in these constants must be 一般名
 * (generic) — e.g. "鶏むね肉のソテー", not "サラダチキン". Brand-name
 * leakage indicates either a copy-paste mistake or a category-boundary
 * breach we want to catch *before* the seed lands in version history
 * (renaming the gen_ / fitness_ ID prefixes after the fact is churn).
 *
 * Severity:
 *   error  — exact substring hit against a confirmed brand token
 *            (jp-brand-blocklist.json categories or brand-i18n.json
 *            English keys, which are USDA brandOwner values).
 *   warn   — generic suspicious markers (®, ™, 商標, 公式, 限定) that
 *            don't prove brand-naming but warrant a human look.
 *   info   — match against a JA katakana brand transliteration
 *            (brand-i18n.json values). Lower confidence because some
 *            katakana strings collide with generic ingredients
 *            (e.g. "アニマル" or "バルク").
 *
 * Output: scripts/food-import/data/brand-issues.csv
 *   columns: id, name_field, name, severity, matched_token, source_list
 *
 * Exit code is always 0 — this is a review tool, not a CI blocker.
 * (If we want gating later, wrap with a wrapper script that exits 1
 * on error-severity hits.)
 *
 * Run: npx tsx scripts/food-import/check-seed-brands.ts
 */

import * as fs from 'fs';
import * as path from 'path';

import { FITNESS_DISHES } from '../../src/constants/fitnessDishes';
import { GENERIC_FOODS } from '../../src/constants/genericFoods';
import { buildBrandMatcher } from './lib/brandMatcher';

// ---- Types ---------------------------------------------------------------

type Severity = 'error' | 'warn' | 'info';

interface BrandToken {
  token: string;
  source: string;
  severity: Severity;
  match: (haystack: string) => boolean;
}

interface Hit {
  id: string;
  nameField: 'nameJa' | 'nameEn';
  name: string;
  severity: Severity;
  matchedToken: string;
  sourceList: string;
}

// ---- Load deny-lists -----------------------------------------------------

const SCRIPT_DIR = __dirname;
const DATA_DIR = path.join(SCRIPT_DIR, 'data');

interface JpBlocklistFile {
  _meta?: unknown;
  tokens: Record<string, string[]>;
}

const jpBlock = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'jp-brand-blocklist.json'), 'utf-8'),
) as JpBlocklistFile;

const usdaBrandMap = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'brand-i18n.json'), 'utf-8'),
) as Record<string, string>;

const tokens: BrandToken[] = [];

function pushToken(token: string, source: string, severity: Severity): void {
  tokens.push({ token, source, severity, match: buildBrandMatcher(token) });
}

for (const [category, list] of Object.entries(jpBlock.tokens)) {
  for (const t of list) {
    pushToken(t, `jp-brand:${category}`, 'error');
  }
}

// USDA EN brand names → error (these are confirmed US supplement brands).
for (const en of Object.keys(usdaBrandMap)) {
  if (en.startsWith('_')) continue;
  pushToken(en, 'brand-i18n-en', 'error');
}

// USDA JA transliterations → info (lower confidence; can collide with
// generic katakana words).
const seenJa = new Set<string>();
for (const ja of Object.values(usdaBrandMap)) {
  if (typeof ja !== 'string') continue;
  if (seenJa.has(ja)) continue;
  seenJa.add(ja);
  pushToken(ja, 'brand-i18n-ja', 'info');
}

// Warn-tier markers — not brand names per se, but red flags.
const WARN_MARKERS = ['®', '™', '©', '商標', '公式', '限定', 'オリジナル'];
for (const m of WARN_MARKERS) {
  pushToken(m, 'warn-marker', 'warn');
}

// ---- Scan ----------------------------------------------------------------

function scan(
  id: string,
  name: string | null | undefined,
  field: 'nameJa' | 'nameEn',
): Hit[] {
  if (!name) return [];
  const hits: Hit[] = [];
  for (const t of tokens) {
    if (t.match(name)) {
      hits.push({
        id,
        nameField: field,
        name,
        severity: t.severity,
        matchedToken: t.token,
        sourceList: t.source,
      });
    }
  }
  return hits;
}

const hits: Hit[] = [];
for (const d of FITNESS_DISHES) {
  hits.push(...scan(d.id, d.nameJa, 'nameJa'));
  hits.push(...scan(d.id, d.nameEn, 'nameEn'));
}
for (const g of GENERIC_FOODS) {
  hits.push(...scan(g.id, g.nameJa, 'nameJa'));
  hits.push(...scan(g.id, g.nameEn, 'nameEn'));
}

// ---- Write CSV -----------------------------------------------------------

function csv(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const lines: string[] = [
  ['id', 'name_field', 'name', 'severity', 'matched_token', 'source_list'].join(','),
];
for (const h of hits) {
  lines.push(
    [
      csv(h.id),
      csv(h.nameField),
      csv(h.name),
      csv(h.severity),
      csv(h.matchedToken),
      csv(h.sourceList),
    ].join(','),
  );
}

const out = path.join(DATA_DIR, 'brand-issues.csv');
fs.writeFileSync(out, lines.join('\n') + '\n');

// ---- Summary -------------------------------------------------------------

const totalEntries = FITNESS_DISHES.length + GENERIC_FOODS.length;
const totalStrings = totalEntries * 2;

const distinctIds = new Set<string>();
const distinctIdsBySev: Record<Severity, Set<string>> = {
  error: new Set(),
  warn: new Set(),
  info: new Set(),
};
const hitsBySev: Record<Severity, number> = { error: 0, warn: 0, info: 0 };

for (const h of hits) {
  distinctIds.add(h.id);
  distinctIdsBySev[h.severity].add(h.id);
  hitsBySev[h.severity] += 1;
}

const tokenCount = new Map<string, number>();
for (const h of hits) {
  tokenCount.set(h.matchedToken, (tokenCount.get(h.matchedToken) ?? 0) + 1);
}
const topPatterns = Array.from(tokenCount.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);

console.log(
  `Scanned ${totalStrings} strings (${totalEntries} entries × 2 fields)`,
);
console.log(`Distinct entries flagged: ${distinctIds.size}/${totalEntries}`);
console.log(`Total hits: ${hits.length}`);
console.log(
  `  error: ${distinctIdsBySev.error.size} distinct (${hitsBySev.error} hits)`,
);
console.log(
  `  warn:  ${distinctIdsBySev.warn.size} distinct (${hitsBySev.warn} hits)`,
);
console.log(
  `  info:  ${distinctIdsBySev.info.size} distinct (${hitsBySev.info} hits)`,
);

if (topPatterns.length > 0) {
  console.log(`Top patterns:`);
  for (const [t, c] of topPatterns) {
    console.log(`  ${c}× ${t}`);
  }
}

console.log(
  `\nWrote brand-issues.csv → ${path.relative(process.cwd(), out)}`,
);

if (distinctIdsBySev.error.size > 0) {
  console.log(
    `\n⚠ ${distinctIdsBySev.error.size} entries have error-severity brand-name hits — review before commit.`,
  );
}
