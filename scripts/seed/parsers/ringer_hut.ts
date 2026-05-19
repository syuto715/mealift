// v1.5 Stage 2 Phase 2.2b — ringer_hut (リンガーハット) PDF parser.
//
// リンガーハット PDF schema (5 pages, ~18KB):
//   Row: <prefix>(<28 allergen marks ● or △> | menu name | empty)
//        <kcal> <salt_g> <protein_g> <fat_g> <carb_g>
//
// **Column order**: (kcal) (salt) (protein) (fat) (carb) — note that
// salt comes BEFORE protein, different from Zensho/sukiya/nakau.
// Verified against 長崎ちゃんぽん row: 623 kcal / 7.9 salt / 25.3 P /
// 21.6 F / 89.8 C.
//
// Parser strategy (count-from-end, robust to prefix variation):
//   - Tokenize line by whitespace
//   - Verify the last 5 tokens are numeric
//   - Treat the last 5 as (kcal, salt, P, F, C)
//   - Prefix (allergen marks / partial menu name / empty) is ignored
//     for numeric extraction; menu name is supplied externally from
//     `parsers/menu_names/ringer_hut.ts` (Codex MCP extraction).
//
// Menu name array length must match parser-detected row count for
// 1:1 mapping. Length mismatch logged as warning.

import * as fs from 'fs';
import * as path from 'path';
import { RINGER_HUT_MENU_NAMES } from './menu_names/ringer_hut';
import type { MenuItemRecord, RestaurantScrapeOutput } from '../types';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

interface RingerHutRow {
  calories: number;
  salt: number;
  protein: number;
  fat: number;
  carb: number;
}

const NUMBER_RE = /^[\d.,]+$/;

function isNumberToken(t: string): boolean {
  return NUMBER_RE.test(t) && /\d/.test(t);
}

function toNumber(s: string): number {
  // ringer_hut text may have OCR artifacts like "16,2" instead of
  // "16.2"; normalize comma → dot ONLY when the result is a valid
  // decimal (heuristic: single comma, no thousands separator pattern).
  let normalized = s;
  if (/^\d+,\d+$/.test(s)) normalized = s.replace(',', '.');
  // Thousands separator (1,006) handled by stripping ALL commas
  // when the result has 4+ digits before the comma.
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) normalized = s.replace(/,/g, '');
  return Number(normalized);
}

export function extractRingerHutRows(text: string): RingerHutRow[] {
  const rows: RingerHutRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/\s+/);
    if (tokens.length < 5) continue;
    // Verify last 5 tokens are all numeric.
    const tail = tokens.slice(-5);
    if (!tail.every(isNumberToken)) continue;
    const [kcal, salt, p, f, c] = tail.map(toNumber);
    if (![kcal, salt, p, f, c].every(Number.isFinite)) continue;
    // Sanity: kcal should be > 0 (reject pure-zero header rows or
    // separator lines that may match the regex by coincidence).
    if (kcal <= 0 && p <= 0 && f <= 0 && c <= 0) continue;
    // Sanity: drop rows where the kcal is absurdly small with
    // non-zero macros (likely OCR-artifact misalignment).
    if (kcal < 10 && (p > 5 || f > 5 || c > 10)) continue;
    rows.push({ calories: kcal, salt, protein: p, fat: f, carb: c });
  }
  return rows;
}

export function rowsToItems(
  rows: RingerHutRow[],
  menuNames: string[],
  opts: { sourceUrl: string; sourceCapturedAt: string },
): { items: MenuItemRecord[]; unmapped: number } {
  const limit = Math.min(rows.length, menuNames.length);
  const items: MenuItemRecord[] = [];
  for (let i = 0; i < limit; i += 1) {
    const r = rows[i];
    items.push({
      name: menuNames[i],
      servingSizeG: 100,
      servingUnit: '皿',
      caloriesPerServing: r.calories,
      proteinG: r.protein,
      fatG: r.fat,
      carbG: r.carb,
      saltG: r.salt,
      source: 'official_disclosure',
      sourceUrl: opts.sourceUrl,
      sourceCapturedAt: opts.sourceCapturedAt,
    });
  }
  return {
    items,
    unmapped: Math.max(0, rows.length - menuNames.length),
  };
}

export interface RingerHutParseOptions {
  rawTextPath: string;
  sourceUrl: string;
  sourceCapturedAt: string;
}

export function parseRingerHut(opts: RingerHutParseOptions): RestaurantScrapeOutput {
  const text = fs.readFileSync(opts.rawTextPath, 'utf-8');
  const rows = extractRingerHutRows(text);
  const { items, unmapped } = rowsToItems(rows, RINGER_HUT_MENU_NAMES, {
    sourceUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
  });
  const namesUnused = Math.max(0, RINGER_HUT_MENU_NAMES.length - rows.length);
  console.log(
    `[ringer_hut] ${rows.length} rows extracted, ${items.length} items mapped, unmapped rows: ${unmapped}, unused names: ${namesUnused}`,
  );
  return {
    chainSlug: 'ringer_hut',
    chainName: 'リンガーハット',
    restaurantType: 'dining',
    category: 'その他',
    aliases: ['リンガーハット', 'リンガー', 'ringer_hut', 'ringerhut'],
    attribution: '公式 PDF より (ringerhut.jp nutrition disclosure)',
    attributionUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
    menuItems: items,
  };
}

async function main(): Promise<void> {
  const output = parseRingerHut({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'ringer_hut.txt'),
    sourceUrl: 'https://www.ringerhut.jp/quality/allergy-nutrition_value/pdf/allergy-nutrition_value_1.pdf',
    sourceCapturedAt: '2026-05-18',
  });
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'ringer_hut.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `[ringer_hut] wrote ${output.menuItems.length} items → ${path.relative(REPO_ROOT, outPath)}`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
