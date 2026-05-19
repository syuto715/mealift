// v1.5 Stage 2 Phase 2.2b — burger_king (バーガーキング) PDF parser.
//
// バーガーキング PDF schema (3 pages, ~15KB):
//   Row: <menu_name> <weight_g> <kcal> <P_g> <F_g> <C_g> <salt_g> <Na_mg>
//        <28 allergen marks (●/△/×)>
//
// Column order: (weight) (kcal) (protein) (fat) (carb) (salt) (Na)
// — 7 nutrition columns. Numbers may carry comma thousands separator
// for Na (e.g., "1,356").
//
// Inline-name schema (Drafting 126): each row carries its own menu
// name at the head. Codex MCP unnecessary. Parser strategy:
// find the first numeric token in the tokenized line; menu name =
// everything before, then 7 numeric values (with comma support).

import * as fs from 'fs';
import * as path from 'path';
import type { MenuItemRecord, RestaurantScrapeOutput } from '../types';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

interface BkRow {
  name: string;
  weightG: number;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  salt: number;
  sodiumMg: number;
}

// Number token: pure-digit, decimal, or comma-thousands like "1,356"
// or "1,219". Excludes allergen single chars (●/△/×).
const NUMBER_RE = /^[\d,.]+$/;

function isNumberToken(t: string): boolean {
  return NUMBER_RE.test(t) && /\d/.test(t);
}

function toNumber(s: string): number {
  return Number(s.replace(/,/g, ''));
}

export function parseBkRow(line: string): BkRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Filter category headers and disclaimer prose.
  if (
    trimmed.startsWith('-')
    || trimmed.startsWith('【')
    || /^[ABCDEFGHIJ]/.test(trimmed) // English header rows
    || trimmed.includes('栄養成分')
    || trimmed.includes('アレルゲン')
    || trimmed.includes('商品名')
  ) {
    return null;
  }

  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 8) return null; // 1 name + 7 numbers minimum

  // Find the first numeric token position.
  let firstNumIdx = -1;
  for (let i = 0; i < tokens.length; i += 1) {
    if (isNumberToken(tokens[i])) {
      firstNumIdx = i;
      break;
    }
  }
  if (firstNumIdx <= 0) return null; // need at least 1 name token

  // Verify the 7 tokens starting at firstNumIdx are all numeric.
  const numTokens = tokens.slice(firstNumIdx, firstNumIdx + 7);
  if (numTokens.length !== 7 || !numTokens.every(isNumberToken)) return null;

  const name = tokens.slice(0, firstNumIdx).join(' ');
  if (!name) return null;

  const [w, kcal, p, f, c, salt, na] = numTokens.map(toNumber);
  if (![w, kcal, p, f, c, salt, na].every(Number.isFinite)) return null;
  if (kcal <= 0 && p <= 0 && f <= 0 && c <= 0) return null;

  return {
    name,
    weightG: w,
    calories: kcal,
    protein: p,
    fat: f,
    carb: c,
    salt,
    sodiumMg: na,
  };
}

export function extractBkRows(text: string): BkRow[] {
  const rows: BkRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const row = parseBkRow(line);
    if (row) rows.push(row);
  }
  return rows;
}

export function rowsToItems(
  rows: BkRow[],
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
    saltG: r.salt,
    sodiumMg: r.sodiumMg,
    source: 'official_disclosure',
    sourceUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
  }));
}

export interface BkParseOptions {
  rawTextPath: string;
  sourceUrl: string;
  sourceCapturedAt: string;
}

export function parseBurgerKing(opts: BkParseOptions): RestaurantScrapeOutput {
  const text = fs.readFileSync(opts.rawTextPath, 'utf-8');
  const rows = extractBkRows(text);
  const items = rowsToItems(rows, {
    sourceUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
  });
  console.log(
    `[burger_king] parser extracted ${rows.length} rows, emitted ${items.length} items`,
  );
  return {
    chainSlug: 'burger_king',
    chainName: 'バーガーキング',
    restaurantType: 'dining',
    category: 'FF',
    aliases: ['バーガーキング', 'BK', 'burger_king'],
    attribution: '公式 PDF より (burgerking.co.jp nutrition disclosure)',
    attributionUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
    menuItems: items,
  };
}

async function main(): Promise<void> {
  const output = parseBurgerKing({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'burger_king.txt'),
    sourceUrl: 'https://www.burgerking.co.jp/images/org/pdf/2025/05/29/d5b23dc0-980f-4cc5-88ee-cd9511d26468.pdf',
    sourceCapturedAt: '2026-05-18',
  });
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'burger_king.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `[burger_king] wrote ${output.menuItems.length} items → ${path.relative(REPO_ROOT, outPath)}`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
