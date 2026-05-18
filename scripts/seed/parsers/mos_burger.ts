// v1.5 Stage 2 Phase 2.2b — mos_burger PDF parser.
//
// モスバーガー PDF schema:
//   <menu_name> <重量g> <kcal> <P> <F> <C> <Na> <K> <Ca> <P> <Fe>
//     <VA> <VB1> <VB2> <niacin> <VC> <VD> <VE> <cholesterol> <fiber> <salt>
//
// 20 numeric columns after the menu name. Category headers like
// 【とびきりバーガー】 / 【ハンバーガー】 are emitted on separate
// lines and won't match the 20-number tail regex, so they're
// naturally filtered. Notes / disclaimers similarly fail the match.
//
// Strategy (count-from-end): tokenize by whitespace, check that
// the last 20 tokens are numeric; if so, everything before is
// the menu name. This handles names with embedded whitespace
// (e.g., "ダブルとびきりチーズ ～北海道チーズ～") robustly.

import * as fs from 'fs';
import * as path from 'path';
import type { MenuItemRecord, RestaurantScrapeOutput } from '../types';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

interface MosRow {
  name: string;
  weightG: number;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  sodiumMg: number;
  fiberG: number;
  saltG: number;
}

const NUMBER_RE = /^[\d.]+$/;
const FULL_WIDTH_NUMBER_RE = /^[０-９.]+$/;

function isNumberToken(t: string): boolean {
  return NUMBER_RE.test(t) || FULL_WIDTH_NUMBER_RE.test(t);
}

function toNumber(t: string): number {
  // Normalize full-width digits to half-width.
  const normalized = t.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
  return Number(normalized);
}

export function parseMosRow(line: string): MosRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Strip category-header decorations like 【とびきりバーガー】
  if (trimmed.startsWith('【') || trimmed.includes('栄養成分')) return null;

  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 21) return null; // 1 name + 20 numbers minimum

  // Verify the last 20 tokens are all numeric.
  const tail = tokens.slice(-20);
  if (!tail.every(isNumberToken)) return null;

  const name = tokens.slice(0, -20).join(' ');
  if (!name) return null;

  return {
    name,
    weightG: toNumber(tail[0]),
    calories: toNumber(tail[1]),
    protein: toNumber(tail[2]),
    fat: toNumber(tail[3]),
    carb: toNumber(tail[4]),
    sodiumMg: toNumber(tail[5]),
    // tail[6-17] are K, Ca, P, Fe, VA, VB1, VB2, niacin, VC, VD, VE,
    // cholesterol — currently not surfaced into MenuItemRecord schema
    // (foods table extended micros land here in Phase 2.4 if needed).
    fiberG: toNumber(tail[18]),
    saltG: toNumber(tail[19]),
  };
}

export function extractMosRows(rawText: string): MosRow[] {
  const rows: MosRow[] = [];
  for (const line of rawText.split(/\r?\n/)) {
    const row = parseMosRow(line);
    if (row) rows.push(row);
  }
  return rows;
}

export function rowsToItems(
  rows: MosRow[],
  opts: { sourceUrl: string; sourceCapturedAt: string },
): MenuItemRecord[] {
  return rows.map((r) => ({
    name: r.name,
    servingSizeG: r.weightG,
    servingUnit: 'g',
    caloriesPerServing: r.calories,
    proteinG: r.protein,
    fatG: r.fat,
    carbG: r.carb,
    fiberG: r.fiberG,
    saltG: r.saltG,
    sodiumMg: r.sodiumMg,
    source: 'official_disclosure',
    sourceUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
  }));
}

export interface MosParseOptions {
  rawTextPath: string;
  sourceUrl: string;
  sourceCapturedAt: string;
}

export function parseMosBurger(opts: MosParseOptions): RestaurantScrapeOutput {
  const text = fs.readFileSync(opts.rawTextPath, 'utf-8');
  const rows = extractMosRows(text);
  const items = rowsToItems(rows, {
    sourceUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
  });
  console.log(
    `[mos_burger] parser extracted ${rows.length} rows, emitted ${items.length} items`,
  );
  return {
    chainSlug: 'mos_burger',
    chainName: 'モスバーガー',
    restaurantType: 'dining',
    category: 'FF',
    aliases: ['モスバーガー', 'モス', 'mos', 'モスバ'],
    attribution: '公式 PDF より (mos.jp nutrition disclosure)',
    attributionUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
    menuItems: items,
  };
}

async function main(): Promise<void> {
  const output = parseMosBurger({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'mos_burger.txt'),
    sourceUrl: 'https://www.mos.jp/menu/pdf/nutrition.pdf',
    sourceCapturedAt: '2026-05-18',
  });
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'mos_burger.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `[mos_burger] wrote ${output.menuItems.length} items → ${path.relative(REPO_ROOT, outPath)}`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
