// v1.5 Stage 2 Phase 2.2b Sprint 6.5 — seven_eleven per-item walker.
//
// Drafting 153 reconnaissance result:
//   - No aggregator URL (7 candidates all 404; sej.co.jp/robots.txt also
//     404 — no published policy). 7premium.jp is behind Incapsula and
//     blocks bot UAs, defer for v1.6+.
//   - Per-item pages /products/a/item/<6-digit-ID>/ DO carry a single
//     `<tr><th>栄養成分</th><td>...</td></tr>` row with the canonical
//     official disclosure, structured as:
//       「熱量：NNNkcal、たんぱく質：N.Ng、脂質：N.Ng、
//         炭水化物：N.Ng（糖質：N.Ng、食物繊維：N.Ng）、
//         食塩相当量：N.Ng」
//   - Category listings `/products/a/<cat>/` enumerate the per-item URLs
//     with no visible pagination — one fetch per category yields the
//     full inventory at the time of capture.
//
// → Drafting 149 (per-item walk) variant: lawson pattern with a regional
// schema swap. Rate limit honors 1.1 sec/req plus the Mealift Bot UA.
//
// Note on listings: Seven-Eleven Japan rotates new-item promo windows
// independently of the nutrition disclosure cycle. We capture today's
// /products/a/<cat>/ snapshot and parse what is currently disclosed.
// Items dropped from the listing between sprints will fall out of the
// crawl naturally; the prior AI-estimate seed remains the fallback.

import * as fs from 'fs';
import * as path from 'path';
import type { MenuItemRecord, RestaurantScrapeOutput } from './types';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const UA = 'Mealift Bot v1.5.0 (https://mealift.app)';
const BASE = 'https://www.sej.co.jp';
const SLEEP_MS = 1200; // 1 req/sec budget + slack

// Categories advertised on /products/. 7premium routes through a
// different host that blocks the Mealift bot at the WAF layer; we skip
// it for now and rely on the AI-estimate residual.
const CATEGORIES: Array<{ slug: string; mealiftCategory: string }> = [
  { slug: 'onigiri',     mealiftCategory: 'おにぎり' },
  { slug: 'sushi',       mealiftCategory: '寿司' },
  { slug: 'bento',       mealiftCategory: '弁当' },
  { slug: 'sandwich',    mealiftCategory: 'サンド' },
  { slug: 'bread',       mealiftCategory: 'パン' },
  { slug: 'donut',       mealiftCategory: 'ドーナツ' },
  { slug: 'men',         mealiftCategory: '麺' },
  { slug: 'pasta',       mealiftCategory: 'パスタ' },
  { slug: 'gratin',      mealiftCategory: 'グラタン・ドリア' },
  { slug: 'dailydish',   mealiftCategory: '惣菜' },
  { slug: 'salad',       mealiftCategory: 'サラダ' },
  { slug: 'sweets',      mealiftCategory: 'スイーツ' },
  { slug: 'ice_cream',   mealiftCategory: 'アイス' },
  { slug: 'hotsnack',    mealiftCategory: 'ホットスナック' },
  { slug: 'oden',        mealiftCategory: 'おでん' },
  { slug: 'chukaman',    mealiftCategory: '中華まん' },
  { slug: 'frozen_foods', mealiftCategory: '冷凍食品' },
  { slug: 'sevencafe',   mealiftCategory: 'セブンカフェ' },
];

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

export function extractItemUrls(html: string): string[] {
  const ids = new Set<string>();
  for (const m of html.matchAll(/\/products\/a\/item\/(\d+)\//g)) ids.add(m[1]);
  return [...ids].map((id) => `${BASE}/products/a/item/${id}/`);
}

interface NutritionRow {
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  sugar?: number;
  fiber?: number;
  salt: number;
}

const PAT_CALORIES = /熱量[：:]\s*([\d.]+)\s*kcal/;
const PAT_PROTEIN  = /たんぱく質[：:]\s*([\d.]+)\s*g/;
const PAT_FAT      = /脂質[：:]\s*([\d.]+)\s*g/;
const PAT_CARB     = /炭水化物[：:]\s*([\d.]+)\s*g/;
const PAT_SUGAR    = /糖質[：:]\s*([\d.]+)\s*g/;
const PAT_FIBER    = /食物繊維[：:]\s*([\d.]+)\s*g/;
const PAT_SALT     = /食塩相当量[：:]\s*([\d.]+)\s*g/;

export function parseNutritionCell(cellText: string): NutritionRow | null {
  const text = cellText
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const num = (re: RegExp): number | null => {
    const m = text.match(re);
    return m ? Number(m[1]) : null;
  };
  const calories = num(PAT_CALORIES);
  const protein  = num(PAT_PROTEIN);
  const fat      = num(PAT_FAT);
  const carb     = num(PAT_CARB);
  const salt     = num(PAT_SALT);
  if (calories == null || protein == null || fat == null
      || carb == null || salt == null) {
    return null;
  }
  const sugar = num(PAT_SUGAR);
  const fiber = num(PAT_FIBER);
  return {
    calories,
    protein,
    fat,
    carb,
    sugar: sugar ?? undefined,
    fiber: fiber ?? undefined,
    salt,
  };
}

export function parseProductPage(html: string): { name: string | null; nutrition: NutritionRow | null } {
  // Name from <title> tag minus the chain suffix
  let name: string | null = null;
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    name = titleMatch[1]
      .replace(/[｜|]\s*セブン.*$/, '')
      .replace(/[\s　]+$/, '')
      .trim() || null;
  }
  // Nutrition cell — find the <td> immediately following <th>栄養成分</th>
  const cellMatch = html.match(/<th[^>]*>\s*栄養成分\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/);
  const nutrition = cellMatch ? parseNutritionCell(cellMatch[1]) : null;
  return { name, nutrition };
}

async function crawlCategory(slug: string, mealiftCategory: string): Promise<MenuItemRecord[]> {
  const listingUrl = `${BASE}/products/a/${slug}/`;
  console.log(`[seven_eleven] ${slug}: ${listingUrl}`);
  let listingHtml: string;
  try {
    listingHtml = await fetchHtml(listingUrl);
  } catch (e) {
    console.log(`  listing FAIL: ${(e as Error).message}`);
    return [];
  }
  const itemUrls = extractItemUrls(listingHtml);
  console.log(`  → ${itemUrls.length} item URLs`);

  const items: MenuItemRecord[] = [];
  const capturedAt = new Date().toISOString().slice(0, 10);
  let parsed = 0;
  let missing = 0;
  for (const url of itemUrls) {
    await sleep(SLEEP_MS);
    try {
      const html = await fetchHtml(url);
      const { name, nutrition } = parseProductPage(html);
      if (!name) { missing += 1; continue; }
      if (!nutrition) { missing += 1; continue; }
      items.push({
        name,
        category: mealiftCategory,
        servingSizeG: 100,
        servingUnit: '個',
        caloriesPerServing: nutrition.calories,
        proteinG: nutrition.protein,
        fatG: nutrition.fat,
        carbG: nutrition.carb,
        sugarG: nutrition.sugar,
        fiberG: nutrition.fiber,
        saltG: nutrition.salt,
        source: 'official_disclosure',
        sourceUrl: url,
        sourceCapturedAt: capturedAt,
      });
      parsed += 1;
    } catch (e) {
      missing += 1;
      console.log(`  item FAIL ${url}: ${(e as Error).message}`);
    }
  }
  console.log(`  ✓ parsed ${parsed} / missing ${missing}`);
  return items;
}

async function main(): Promise<void> {
  const allItems: MenuItemRecord[] = [];
  for (const cat of CATEGORIES) {
    const items = await crawlCategory(cat.slug, cat.mealiftCategory);
    allItems.push(...items);
  }
  console.log(`[seven_eleven] total official items: ${allItems.length}`);

  const capturedAt = new Date().toISOString().slice(0, 10);
  const output: RestaurantScrapeOutput = {
    chainSlug: 'seven_eleven',
    chainName: 'セブン-イレブン',
    restaurantType: 'convenience',
    category: 'コンビニ',
    aliases: ['セブン-イレブン', 'セブンイレブン', '7-Eleven', 'sej', 'seven_eleven'],
    attribution: '公式 商品詳細ページ 栄養成分 (sej.co.jp /products/a/item/)',
    attributionUrl: `${BASE}/products/`,
    sourceCapturedAt: capturedAt,
    menuItems: allItems,
  };

  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'seven_eleven.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`[seven_eleven] wrote ${output.menuItems.length} items → ${path.relative(REPO_ROOT, outPath)}`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
