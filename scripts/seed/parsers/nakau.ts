// v1.5 Stage 2 Phase 2.2b — nakau chain wrapper for Zensho parser.
//
// なか卯 PDF (Zensho CDN 版 `images.zensho.co.jp/materials/nakau/`)
// は sukiya と同じ Zensho 共通スキーマ + column order
// (kcal, protein, fat, carb, salt)。 サイズ系は 小盛 / 並盛 / 大盛
// が中心、 一部 4-size group (小盛 / 並盛 / 大盛 / 特盛)。
//
// S5b: 2026-08-19 版 PDF (9p) で label 体系が拡張された —
//   - 麺類セクションの単独漢字 size (`小` / `並` / `大` / `特`)
//   - 肉 2 倍系の `W 小盛` / `W 並盛` / `W 大盛`
//   - 単発の `豪快盛`
// これらを NAKAU_SIZE_LABELS として zensho core に渡す
// (Sprint 2A.x 予定だった正規化拡張の実装)。 配列順 = サイズ昇順。
// 単独漢字 label の誤爆は「行 = label + 数値 5 列ちょうど」の
// regex 全体 anchor で抑止 (5a recon の設計判断)。

import * as fs from 'fs';
import * as path from 'path';
import { parseZenshoPdf } from './zensho';
import { NAKAU_MENU_NAMES } from './menu_names/nakau';
import { carryDiscontinued } from '../discontinued';
import type { RestaurantScrapeOutput } from '../types';

export const NAKAU_SIZE_LABELS: readonly string[] = [
  '小',
  '小盛',
  '並',
  '並盛',
  '大',
  '大盛',
  '特',
  '特盛',
  '２倍盛',
  '豪快盛',
  'W 小盛',
  'W 並盛',
  'W 大盛',
];

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
    NAKAU_SIZE_LABELS,
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
  const parsed = parseNakau({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'nakau.txt'),
    sourceUrl: 'https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf',
    sourceCapturedAt: '2026-08-30',
  });
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'nakau.json');
  // S5b 廃番 carry-over。 注: 2026-08-19 版 PDF は size label 体系が
  // 変わった (うどん系が 並盛→並 等) ため、 同一メニューでも
  // 「〜 並盛」(旧) と 「〜 並」(新) は別 item 扱いになり、 旧側は
  // discontinued (検索から除外) として温存される — 検索に出るのは
  // 新 label の現役 item のみ。
  const prev = fs.existsSync(outPath)
    ? (JSON.parse(fs.readFileSync(outPath, 'utf-8')) as RestaurantScrapeOutput)
    : null;
  const { output, discontinuedNames } = carryDiscontinued(prev, parsed);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `[nakau] wrote ${output.menuItems.length} items (discontinued ${discontinuedNames.length}) → ${path.relative(REPO_ROOT, outPath)}`,
  );
  if (discontinuedNames.length > 0) {
    console.log(`[nakau] discontinued: ${discontinuedNames.join(' / ')}`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
