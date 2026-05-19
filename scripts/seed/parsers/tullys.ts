// v1.5 Stage 2 Phase 2.2b Sprint 6.3 — tullys (タリーズ) PDF parser.
//
// タリーズ PDF schema (6 pages, ~18KB):
//   Per page:
//     - 4-language header (見方説明 in JA/EN/CN/KR)
//     - Data block: <28 allergen marks (●/△/-)> <kcal> <P> <F> <C> <salt>
//     - Footer JA/EN alternating menu name list (paired in REVERSE order
//       with data rows on most pages、 page 1 manually curated)
//
// Page boundary: `-- N of 6 --`
//
// **Drafting 151 (a) parser 拡張系 + Drafting 128 hybrid pattern**:
// JA/EN multilingual layout は per-page で state-machine 必要。
// Per-page menu names は parsers/menu_names/tullys.ts に index-aligned で
// 格納 (Codex MCP 自動抽出 + Sprint 6.3 curation 反映済)。

import * as fs from 'fs';
import * as path from 'path';
import { TULLYS_PER_PAGE_MENU_NAMES } from './menu_names/tullys';
import type { MenuItemRecord, RestaurantScrapeOutput } from '../types';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

interface TullysRow {
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  salt: number;
}

// Match a data row: any prefix tokens, then 5 trailing numeric values.
// The prefix is allergen marks (●/△/-) of variable length; we look for
// "5 numeric tokens at the end" pattern.
const NUMBER_RE = /^[\d.]+$/;

function isNumberToken(t: string): boolean {
  return NUMBER_RE.test(t) && /\d/.test(t);
}

export function extractDataRowsFromPage(pageText: string): TullysRow[] {
  const rows: TullysRow[] = [];
  for (const line of pageText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/\s+/);
    if (tokens.length < 6) continue;
    const tail = tokens.slice(-5);
    if (!tail.every(isNumberToken)) continue;
    const [kcal, p, f, c, salt] = tail.map(Number);
    if (![kcal, p, f, c, salt].every(Number.isFinite)) continue;
    if (kcal <= 0 && p <= 0 && f <= 0 && c <= 0) continue;
    rows.push({ calories: kcal, protein: p, fat: f, carb: c, salt });
  }
  return rows;
}

export function segmentByPage(text: string): string[] {
  // Split on the page boundary marker "-- N of 6 --"; first segment is
  // the prelude before page 1's content begins (we drop empty leading
  // segments).
  const parts = text.split(/--\s*\d+\s+of\s+\d+\s*--/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

export interface TullysParseOptions {
  rawTextPath: string;
  sourceUrl: string;
  sourceCapturedAt: string;
}

export function parseTullys(opts: TullysParseOptions): RestaurantScrapeOutput {
  const text = fs.readFileSync(opts.rawTextPath, 'utf-8');
  const pages = segmentByPage(text);
  const items: MenuItemRecord[] = [];
  let totalRows = 0;
  let totalPairedItems = 0;
  let pageDiagnostics: string[] = [];

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx += 1) {
    const pageText = pages[pageIdx];
    const rows = extractDataRowsFromPage(pageText);
    totalRows += rows.length;
    const names = TULLYS_PER_PAGE_MENU_NAMES[pageIdx] ?? [];
    const limit = Math.min(rows.length, names.length);
    for (let i = 0; i < limit; i += 1) {
      const row = rows[i];
      items.push({
        name: names[i],
        servingSizeG: 100,
        servingUnit: '個',
        caloriesPerServing: row.calories,
        proteinG: row.protein,
        fatG: row.fat,
        carbG: row.carb,
        saltG: row.salt,
        source: 'official_disclosure',
        sourceUrl: opts.sourceUrl,
        sourceCapturedAt: opts.sourceCapturedAt,
      });
    }
    totalPairedItems += limit;
    pageDiagnostics.push(`p${pageIdx + 1}: ${rows.length}r / ${names.length}n → ${limit}`);
  }
  console.log(
    `[tullys] ${pages.length} pages、 ${totalRows} rows、 ${totalPairedItems} items mapped (${pageDiagnostics.join(' | ')})`,
  );
  return {
    chainSlug: 'tullys',
    chainName: 'タリーズコーヒー',
    restaurantType: 'cafe_bakery',
    category: 'カフェ',
    aliases: ['タリーズ', 'タリーズコーヒー', "Tully's", 'tullys'],
    attribution: '公式 PDF (tullys.co.jp/menu/pdf/food.pdf)',
    attributionUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
    menuItems: items,
  };
}

async function main(): Promise<void> {
  const output = parseTullys({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'tullys_food.txt'),
    sourceUrl: 'https://www.tullys.co.jp/menu/pdf/food.pdf',
    sourceCapturedAt: '2026-05-18',
  });
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'tullys.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `[tullys] wrote ${output.menuItems.length} items → ${path.relative(REPO_ROOT, outPath)}`,
  );
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
