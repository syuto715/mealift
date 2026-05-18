// v1.5 Stage 2 Phase 2.2b — sukiya chain wrapper for Zensho parser.
//
// すき家 PDF を Zensho 共通 parser + Codex 抽出 menu names で
// MenuItemRecord[] に正規化する driver。 PFC column order は
// (kcal, protein, fat, carb, salt) — Zensho 共通 (zensho.ts header
// comment 参照)。

import * as fs from 'fs';
import * as path from 'path';
import { parseZenshoPdf } from './zensho';
import { SUKIYA_MENU_NAMES } from './menu_names/sukiya';
import type { RestaurantScrapeOutput } from '../types';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

export interface SukiyaParseOptions {
  rawTextPath: string;
  sourceUrl: string;
  sourceCapturedAt: string;
}

export function parseSukiya(opts: SukiyaParseOptions): RestaurantScrapeOutput {
  const text = fs.readFileSync(opts.rawTextPath, 'utf-8');
  const { items, totalGroups, unmappedGroups } = parseZenshoPdf(
    text,
    SUKIYA_MENU_NAMES,
    {
      sourceUrl: opts.sourceUrl,
      sourceCapturedAt: opts.sourceCapturedAt,
      restaurantCategory: '牛丼',
    },
  );
  console.log(
    `[sukiya] parser detected ${totalGroups} groups, applied ${items.length / Math.max(items.length / SUKIYA_MENU_NAMES.length, 1)} menu names (unmapped: ${unmappedGroups})`,
  );
  return {
    chainSlug: 'sukiya',
    chainName: 'すき家',
    restaurantType: 'dining',
    category: '牛丼',
    aliases: ['すき家', 'sukiya'],
    attribution: '公式 PDF より (Zensho HD nutrition disclosure)',
    attributionUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
    menuItems: items,
  };
}

async function main(): Promise<void> {
  const output = parseSukiya({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'sukiya.txt'),
    sourceUrl: 'https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf',
    sourceCapturedAt: '2026-05-18',
  });
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'sukiya.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `[sukiya] wrote ${output.menuItems.length} items → ${path.relative(REPO_ROOT, outPath)}`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
