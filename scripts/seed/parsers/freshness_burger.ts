// v1.5 Stage 2 Phase 2.2b — freshness_burger PDF parser.
//
// フレッシュネスバーガー PDF schema (8 pages, ~13KB):
//   Row: <menu_name> <kcal> <P_g> <F_g> <C_g> <糖質_g> <食物繊維_g> <食塩_g>
//
// Column order: (kcal) (P) (F) (C) (sugar) (fiber) (salt) — 7 numeric
// columns, NO weight column (1食あたり / serving-equivalent).
// 炭水化物 = 糖質 + 食物繊維 (PDF table's accounting); we surface the
// 炭水化物 total into `carbG` and the 食物繊維 into `fiberG`.
//
// Inline-name schema (Drafting 126): each row carries its own menu
// name + 7 trailing numbers, NO allergen columns on this PDF. Parser
// strategy: count-from-end (last 7 numeric tokens) — simpler than
// burger_king (which had Na + 28 allergen marks tail).

import * as fs from 'fs';
import * as path from 'path';
import type { MenuItemRecord, RestaurantScrapeOutput } from '../types';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

interface FbRow {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  sugar: number;
  fiber: number;
  salt: number;
}

const NUMBER_RE = /^[\d.]+$/;

function isNumberToken(t: string): boolean {
  return NUMBER_RE.test(t) && /\d/.test(t);
}

export function parseFbRow(line: string): FbRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Filter category headers + disclaimer prose.
  if (
    trimmed.startsWith('【')
    || trimmed.startsWith('・')
    || trimmed.includes('栄養成分')
    || trimmed.includes('更新日')
    || trimmed.includes('商品名')
    || /^kcal\b/.test(trimmed) // column-units row
  ) return null;

  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 8) return null; // 1 name + 7 numbers minimum

  // Last 7 tokens must be numeric.
  const tail = tokens.slice(-7);
  if (!tail.every(isNumberToken)) return null;

  const name = tokens.slice(0, -7).join(' ');
  if (!name) return null;
  // Star-prefixed topping rows: keep but strip the ★.
  const cleanName = name.replace(/^★\s*/, '');
  if (!cleanName) return null;

  const [kcal, p, f, c, sugar, fiber, salt] = tail.map(Number);
  if (![kcal, p, f, c, sugar, fiber, salt].every(Number.isFinite)) return null;
  if (kcal <= 0 && p <= 0 && f <= 0 && c <= 0) return null;

  return {
    name: cleanName,
    calories: kcal,
    protein: p,
    fat: f,
    carb: c,
    sugar,
    fiber,
    salt,
  };
}

export function extractFbRows(text: string): FbRow[] {
  const rows: FbRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const row = parseFbRow(line);
    if (row) rows.push(row);
  }
  return rows;
}

export function rowsToItems(
  rows: FbRow[],
  opts: { sourceUrl: string; sourceCapturedAt: string },
): MenuItemRecord[] {
  return rows.map((r) => ({
    name: r.name,
    servingSizeG: 100, // フレッシュネス PDF doesn't disclose weight;
    // fallback default — meal_log_items consumers should not rely on
    // serving_size_g for portion math (PDF's 1食あたり is intrinsic).
    servingUnit: '個',
    caloriesPerServing: r.calories,
    proteinG: r.protein,
    fatG: r.fat,
    carbG: r.carb,
    sugarG: r.sugar,
    fiberG: r.fiber,
    saltG: r.salt,
    source: 'official_disclosure',
    sourceUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
  }));
}

export interface FbParseOptions {
  rawTextPath: string;
  sourceUrl: string;
  sourceCapturedAt: string;
}

export function parseFreshnessBurger(opts: FbParseOptions): RestaurantScrapeOutput {
  const text = fs.readFileSync(opts.rawTextPath, 'utf-8');
  const rows = extractFbRows(text);
  const items = rowsToItems(rows, {
    sourceUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
  });
  console.log(
    `[freshness_burger] parser extracted ${rows.length} rows, emitted ${items.length} items`,
  );
  return {
    chainSlug: 'freshness_burger',
    chainName: 'フレッシュネスバーガー',
    restaurantType: 'dining',
    category: 'FF',
    aliases: ['フレッシュネスバーガー', 'フレッシュネス', 'freshness'],
    attribution: '公式 PDF より (freshnessburger.co.jp nutrition disclosure)',
    attributionUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
    menuItems: items,
  };
}

async function main(): Promise<void> {
  const output = parseFreshnessBurger({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'freshness_burger.txt'),
    sourceUrl: 'https://www.freshnessburger.co.jp/pdf/seibun.pdf',
    sourceCapturedAt: '2026-05-18',
  });
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'freshness_burger.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `[freshness_burger] wrote ${output.menuItems.length} items → ${path.relative(REPO_ROOT, outPath)}`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
