// v1.5 Stage 2 Phase 2.2b — nakau chain wrapper for Zensho parser.
//
// なか卯 PDF (Zensho CDN 版 `images.zensho.co.jp/materials/nakau/`)
// は sukiya と同じ Zensho 共通スキーマ + column order
// (kcal, protein, fat, carb, salt)。 サイズ系は 小盛 / 並盛 / 大盛
// が中心、 一部 4-size group (小盛 / 並盛 / 大盛 / 特盛)。
//
// 既知 limitation: 麺類セクション (うどん / 中華そば) で
// 単独漢字 size label (`小` / `並` / `大` / `特`) が混在する
// pages があり、 現在の regex (`小盛` 等の "盛" 必須) では
// captureできない。 Sprint 2A.x で正規化拡張予定。

import * as fs from 'fs';
import * as path from 'path';
import { parseZenshoPdf } from './zensho';
import { NAKAU_MENU_NAMES } from './menu_names/nakau';
import type { RestaurantScrapeOutput } from '../types';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

export interface NakauParseOptions {
  rawTextPath: string;
  sourceUrl: string;
  sourceCapturedAt: string;
}

export function parseNakau(opts: NakauParseOptions): RestaurantScrapeOutput {
  const text = fs.readFileSync(opts.rawTextPath, 'utf-8');
  const { items, totalGroups, unmappedGroups } = parseZenshoPdf(
    text,
    NAKAU_MENU_NAMES,
    {
      sourceUrl: opts.sourceUrl,
      sourceCapturedAt: opts.sourceCapturedAt,
      restaurantCategory: '牛丼',
    },
  );
  console.log(
    `[nakau] parser detected ${totalGroups} groups, ${items.length} items emitted (unmapped: ${unmappedGroups})`,
  );
  return {
    chainSlug: 'nakau',
    chainName: 'なか卯',
    restaurantType: 'dining',
    category: '牛丼',
    aliases: ['なか卯', 'nakau'],
    attribution: '公式 PDF より (Zensho HD nutrition disclosure)',
    attributionUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
    menuItems: items,
  };
}

async function main(): Promise<void> {
  const output = parseNakau({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'nakau.txt'),
    sourceUrl: 'https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf',
    sourceCapturedAt: '2026-05-18',
  });
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'nakau.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `[nakau] wrote ${output.menuItems.length} items → ${path.relative(REPO_ROOT, outPath)}`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
