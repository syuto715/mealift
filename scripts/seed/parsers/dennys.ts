// v1.5 Stage 2 Phase 2.2b Sprint 5.0 — dennys (デニーズ) PDF parser.
//
// デニーズ PDF schema (9 pages, ~17KB):
//   Row: <menu_name> <kcal> <salt_g> <protein_g> <fat_g> <carb_g>
//        <fiber_g> <sugar_g>
//
// Column order (verified against おこさまランチ 741 kcal sample):
//   (kcal) (salt) (P) (F) (C) (fiber) (sugar)
//
// Note: salt is column 2 (Zensho/ringer pattern); P/F/C after salt;
// fiber + sugar at tail. 7 numeric columns total.
//
// Inline-name schema (Drafting 126): each row carries its own name.
// Parser strategy: find-first-numeric-token (last 7 tokens = data,
// rest = name).

import * as fs from 'fs';
import * as path from 'path';
import type { MenuItemRecord, RestaurantScrapeOutput } from '../types';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

interface DennysRow {
  name: string;
  calories: number;
  salt: number;
  protein: number;
  fat: number;
  carb: number;
  fiber: number;
  sugar: number;
}

const NUMBER_RE = /^[\d.]+$/;

function isNumberToken(t: string): boolean {
  return NUMBER_RE.test(t) && /\d/.test(t);
}

export function parseDennysRow(line: string): DennysRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Filter header / disclaimer / page anchors.
  if (
    trimmed.startsWith('・') || trimmed.startsWith('＊')
    || trimmed.startsWith('【')
    || trimmed.includes('栄養成分')
    || trimmed.includes('お客様へ')
    || trimmed.includes('店舗により')
    || trimmed.includes('地域・店舗')
    || trimmed.includes('お取り扱い')
    || trimmed.includes('宅配')
    || /^\d{4}年/.test(trimmed)
    || trimmed.startsWith('エネルギー')
    || trimmed.startsWith('（')
  ) return null;

  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 8) return null; // name + 7 numbers minimum

  // Last 7 tokens must be numeric.
  const tail = tokens.slice(-7);
  if (!tail.every(isNumberToken)) return null;

  const name = tokens.slice(0, -7).join(' ');
  if (!name) return null;

  const [kcal, salt, p, f, c, fiber, sugar] = tail.map(Number);
  if (![kcal, salt, p, f, c, fiber, sugar].every(Number.isFinite)) return null;
  if (kcal <= 0 && p <= 0 && f <= 0 && c <= 0) return null;

  return { name, calories: kcal, salt, protein: p, fat: f, carb: c, fiber, sugar };
}

export function extractDennysRows(text: string): DennysRow[] {
  const rows: DennysRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const row = parseDennysRow(line);
    if (row) rows.push(row);
  }
  return rows;
}

export function rowsToItems(
  rows: DennysRow[],
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
    fiberG: r.fiber,
    sugarG: r.sugar,
    saltG: r.salt,
    source: 'official_disclosure',
    sourceUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
  }));
}

export function parseDennys(opts: {
  rawTextPath: string;
  sourceUrl: string;
  sourceCapturedAt: string;
}): RestaurantScrapeOutput {
  const text = fs.readFileSync(opts.rawTextPath, 'utf-8');
  const rows = extractDennysRows(text);
  const items = rowsToItems(rows, opts);
  console.log(
    `[dennys] extracted ${rows.length} rows, emitted ${items.length} items`,
  );
  return {
    chainSlug: 'dennys',
    chainName: 'デニーズ',
    restaurantType: 'dining',
    category: 'ファミレス',
    aliases: ['デニーズ', 'Denny\'s', 'dennys'],
    attribution: '公式 PDF (dennys.jp safety nutritional disclosure)',
    attributionUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
    menuItems: items,
  };
}

async function main(): Promise<void> {
  const output = parseDennys({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'dennys.txt'),
    sourceUrl: 'https://www.dennys.jp/safety/pdf/nutritive_value.pdf',
    sourceCapturedAt: '2026-05-18',
  });
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'dennys.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `[dennys] wrote ${output.menuItems.length} items → ${path.relative(REPO_ROOT, outPath)}`,
  );
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
