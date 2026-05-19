// v1.5 Stage 2 Phase 2.2b — kfc (KFC 日本) PDF parser.
//
// KFC PDF schema (2 pages, ~3.4KB):
//   Row: <name> <weight> <kcal> <P> <F> <C> <salt> <Na> ... (20 cols)
//
// Column order: weight / kcal / P / F / C / 食塩相当量 / Na / K /
// Ca / P / Fe / レチノール / β-カロテン / レチノール活性 / B1 / B2 /
// ナイアシン / C / (2 more)
//
// Inline-name + full PFC + salt + Na = **official_disclosure**
// 完全網羅 (Drafting 126)。 Codex MCP / partial-source 不要。
//
// Strategy: count-from-end (last 20 numeric tokens = data, rest = name).

import * as fs from 'fs';
import * as path from 'path';
import type { MenuItemRecord, RestaurantScrapeOutput } from '../types';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

interface KfcRow {
  name: string;
  weightG: number;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  salt: number;
  sodiumMg: number;
}

const NUMBER_RE = /^[\d.]+$/;
const DASH_RE = /^[-－―ー]$/;

function isNumberToken(t: string): boolean {
  return NUMBER_RE.test(t) && /\d/.test(t);
}

function isPlaceholder(t: string): boolean {
  return DASH_RE.test(t);
}

function tokenValue(t: string): number {
  if (isPlaceholder(t)) return 0;
  return Number(t);
}

export function parseKfcRow(line: string): KfcRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Filter header / disclaimer.
  if (
    trimmed.includes('栄養成分表')
    || trimmed.includes('ケンタッキー')
    || trimmed.startsWith('※')
    || trimmed.startsWith('（') || trimmed.startsWith('(')
    || /^\d{4}\//.test(trimmed)
    || trimmed.startsWith('ナトリ') || trimmed.startsWith('カリウ')
    || trimmed.startsWith('カルシ') || trimmed.startsWith('リン')
    || trimmed.startsWith('鉄') || trimmed.startsWith('レチ')
    || trimmed.startsWith('β-') || trimmed.startsWith('ﾚﾁ')
    || trimmed.startsWith('Ｂ') || trimmed.startsWith('ナイア')
    || trimmed.startsWith('Ｃ')
  ) return null;

  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 21) return null; // 1 name + 20 numerics minimum

  // Last 20 tokens should be numeric (or "-" placeholder).
  const tail = tokens.slice(-20);
  if (!tail.every((t) => isNumberToken(t) || isPlaceholder(t))) return null;
  // Must have at least the first few core values numeric (not dashes).
  if (!isNumberToken(tail[0]) || !isNumberToken(tail[1])) return null;

  const name = tokens.slice(0, -20).join(' ');
  if (!name) return null;
  // Strip surrounding parens for topping rows: "(ケチャップ)" → "ケチャップ"
  const cleanName = name.replace(/^[（(]/, '').replace(/[）)]$/, '').trim();
  if (!cleanName) return null;

  const w = tokenValue(tail[0]);
  const kcal = tokenValue(tail[1]);
  const p = tokenValue(tail[2]);
  const f = tokenValue(tail[3]);
  const c = tokenValue(tail[4]);
  const salt = tokenValue(tail[5]);
  const na = tokenValue(tail[6]);
  if (kcal <= 0) return null;

  return {
    name: cleanName,
    weightG: w,
    calories: kcal,
    protein: p,
    fat: f,
    carb: c,
    salt,
    sodiumMg: na,
  };
}

export function extractKfcRows(text: string): KfcRow[] {
  const rows: KfcRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const row = parseKfcRow(line);
    if (row) rows.push(row);
  }
  return rows;
}

export function rowsToItems(
  rows: KfcRow[],
  opts: { sourceUrl: string; sourceCapturedAt: string },
): MenuItemRecord[] {
  return rows.map((r) => ({
    name: r.name,
    servingSizeG: r.weightG || 100,
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

export function parseKfc(opts: {
  rawTextPath: string;
  sourceUrl: string;
  sourceCapturedAt: string;
}): RestaurantScrapeOutput {
  const text = fs.readFileSync(opts.rawTextPath, 'utf-8');
  const rows = extractKfcRows(text);
  const items = rowsToItems(rows, opts);
  console.log(
    `[kfc] parser extracted ${rows.length} rows, emitted ${items.length} items`,
  );
  return {
    chainSlug: 'kfc',
    chainName: 'KFC 日本ケンタッキー',
    restaurantType: 'dining',
    category: 'FF',
    aliases: ['KFC', 'ケンタッキー', 'kfc'],
    attribution: '公式 PDF (Contentful CDN, ケンタッキーフライドチキン nutrition disclosure)',
    attributionUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
    menuItems: items,
  };
}

async function main(): Promise<void> {
  const output = parseKfc({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'kfc.txt'),
    sourceUrl: 'https://assets.ctfassets.net/jax7ylg56usf/3zgh9vHAvLBwmyuhXQaJOO/c1380188d778ace74fdf63d23d7a06bd/240403KFC________________.pdf',
    sourceCapturedAt: '2026-05-18',
  });
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'kfc.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `[kfc] wrote ${output.menuItems.length} items → ${path.relative(REPO_ROOT, outPath)}`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
