// v1.5 Stage 2 Phase 2.2b — matsuya (松屋フーズ) PDF parser.
//
// 松屋フーズ PDF schema (7 pages, ~23KB):
//   Row: <menu_name> <kcal> <P_g> <F_g> <C_g> <salt_g> <28 allergen marks>
//   Allergen marks: ○ / △ / －
//   Numbers may carry comma thousands separator: "1,237"
//
// Column order: (kcal) (P) (F) (C) (salt) — Zensho-pattern (same as
// sukiya / nakau / yoshinoya).
//
// Inline-name schema (Drafting 126): each row carries its own menu
// name. Parser strategy: find-first-numeric-token; name = prefix
// tokens, then 5 numerics, allergen marks ignored.
//
// PDF URL pattern: `{YYMMDD}_nutritional_matsuya[_location].pdf`.
// Phase 2.2b seeds the main location version
// (`260519_nutritional_matsuya.pdf`); PA/SA + Makinohara variants
// defer to v1.6 (kickoff "店舗別差異 v1.5.0 は主力店舗 1 つを
// representative").

import * as fs from 'fs';
import * as path from 'path';
import type { MenuItemRecord, RestaurantScrapeOutput } from '../types';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

interface MatsuyaRow {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  salt: number;
}

const NUMBER_RE = /^[\d,.]+$/;

function isNumberToken(t: string): boolean {
  return NUMBER_RE.test(t) && /\d/.test(t);
}

function toNumber(s: string): number {
  return Number(s.replace(/,/g, ''));
}

export function parseMatsuyaRow(line: string): MatsuyaRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Filter header / disclaimer / section labels.
  if (
    trimmed.includes('栄養成分')
    || trimmed.includes('アレルゲン')
    || trimmed.includes('お客様相談室')
    || trimmed.startsWith('●')
    || trimmed.startsWith('※')
    || /^\d{4}年/.test(trimmed)
    || /^一覧表/.test(trimmed)
    || /^[1-9]\D/.test(trimmed) // numbered disclaimer lines like "1.検査機関..."
  ) return null;

  // Split on whitespace + tabs.
  const tokens = trimmed.split(/[\s\t]+/);
  if (tokens.length < 6) return null; // 1 name + 5 numbers minimum

  // Find first numeric token.
  let firstNumIdx = -1;
  for (let i = 0; i < tokens.length; i += 1) {
    if (isNumberToken(tokens[i])) {
      firstNumIdx = i;
      break;
    }
  }
  if (firstNumIdx <= 0) return null;

  // Verify 5 tokens starting at firstNumIdx are all numeric.
  const numTokens = tokens.slice(firstNumIdx, firstNumIdx + 5);
  if (numTokens.length !== 5 || !numTokens.every(isNumberToken)) return null;

  const name = tokens.slice(0, firstNumIdx).join(' ');
  if (!name) return null;

  const [kcal, p, f, c, salt] = numTokens.map(toNumber);
  if (![kcal, p, f, c, salt].every(Number.isFinite)) return null;
  if (kcal <= 0 && p <= 0 && f <= 0 && c <= 0) return null;

  return {
    name,
    calories: kcal,
    protein: p,
    fat: f,
    carb: c,
    salt,
  };
}

export function extractMatsuyaRows(text: string): MatsuyaRow[] {
  const rows: MatsuyaRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const row = parseMatsuyaRow(line);
    if (row) rows.push(row);
  }
  return rows;
}

export function rowsToItems(
  rows: MatsuyaRow[],
  opts: { sourceUrl: string; sourceCapturedAt: string },
): MenuItemRecord[] {
  return rows.map((r) => ({
    name: r.name,
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
  }));
}

export interface MatsuyaParseOptions {
  rawTextPath: string;
  sourceUrl: string;
  sourceCapturedAt: string;
}

export function parseMatsuya(opts: MatsuyaParseOptions): RestaurantScrapeOutput {
  const text = fs.readFileSync(opts.rawTextPath, 'utf-8');
  const rows = extractMatsuyaRows(text);
  const items = rowsToItems(rows, {
    sourceUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
  });
  console.log(
    `[matsuya] parser extracted ${rows.length} rows, emitted ${items.length} items`,
  );
  return {
    chainSlug: 'matsuya',
    chainName: '松屋',
    restaurantType: 'dining',
    category: '牛丼',
    aliases: ['松屋', 'matsuya', 'matsuyafoods'],
    attribution: '公式 PDF より (matsuyafoods.co.jp nutrition disclosure)',
    attributionUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
    menuItems: items,
  };
}

async function main(): Promise<void> {
  const output = parseMatsuya({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'matsuya.txt'),
    sourceUrl: 'https://www.matsuyafoods.co.jp/matsuya/pdf/260519_nutritional_matsuya.pdf',
    sourceCapturedAt: '2026-05-18',
  });
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'matsuya.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `[matsuya] wrote ${output.menuItems.length} items → ${path.relative(REPO_ROOT, outPath)}`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
