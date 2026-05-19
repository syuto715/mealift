// v1.5 Stage 2 Phase 2.2b Sprint 6.6 — seven_eleven Playwright per-item walker.
//
// Sprint 6.5 reconnaissance established:
//   - /products/a/item/<6-digit-ID>/ pages carry a single structured
//     `<th>栄養成分</th><td>熱量：NNNkcal、たんぱく質：N.Ng、...</td>`
//     nutrition row (verified).
//   - Listing pages /products/a/<cat>/ enumerate item URLs.
//   - curl-based fetching trips Incapsula's WAF JS-challenge stub at item-
//     walk scale (~50% listing failures, ~100% item failures past the
//     warm-up window).
//
// Sprint 6.6 Playwright (chromium) variant — real browser executes the
// Incapsula JS challenge once, persists cookies in the BrowserContext,
// and subsequent per-item navigations reuse the warmed session.
//
// Hard-stop policy (Drafting 154 negative confirm trigger):
//   - 5 consecutive item-fetch failures → abort the crawl, persist
//     whatever items succeeded so far, and emit a partial result with
//     `partial: true` so downstream stages know the seed is incomplete.
//   - All categories produce zero items → escalate full negative confirm.

import * as fs from 'fs';
import * as path from 'path';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import type { MenuItemRecord, RestaurantScrapeOutput } from './types';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const UA = 'Mealift Bot v1.5.0 (https://mealift.app)';
const BASE = 'https://www.sej.co.jp';
const SLEEP_MS = 1500;

const CATEGORIES: Array<{ slug: string; mealiftCategory: string; limit: number }> = [
  // Sprint 6.6 scope: representative coverage. Limit caps the per-category
  // walk so a one-turn run completes within a 10-15 min budget. v1.5.x
  // can raise the limits or add categories.
  { slug: 'onigiri',     mealiftCategory: 'おにぎり',    limit: 25 },
  { slug: 'bento',       mealiftCategory: '弁当',        limit: 25 },
  { slug: 'sandwich',    mealiftCategory: 'サンド',      limit: 18 },
  { slug: 'bread',       mealiftCategory: 'パン',        limit: 18 },
  { slug: 'men',         mealiftCategory: '麺',          limit: 12 },
  { slug: 'pasta',       mealiftCategory: 'パスタ',      limit: 10 },
  { slug: 'dailydish',   mealiftCategory: '惣菜',        limit: 18 },
  { slug: 'salad',       mealiftCategory: 'サラダ',      limit: 12 },
  { slug: 'sweets',      mealiftCategory: 'スイーツ',    limit: 20 },
  { slug: 'ice_cream',   mealiftCategory: 'アイス',      limit: 12 },
  { slug: 'hotsnack',    mealiftCategory: 'ホットスナック', limit: 15 },
  { slug: 'oden',        mealiftCategory: 'おでん',      limit: 8 },
  { slug: 'chukaman',    mealiftCategory: '中華まん',    limit: 8 },
  { slug: 'sevencafe',   mealiftCategory: 'セブンカフェ', limit: 8 },
];

const MAX_CONSECUTIVE_FAILS = 5;

const PAT_CALORIES = /熱量[：:]\s*([\d.]+)\s*kcal/;
const PAT_PROTEIN  = /たんぱく質[：:]\s*([\d.]+)\s*g/;
const PAT_FAT      = /脂質[：:]\s*([\d.]+)\s*g/;
const PAT_CARB     = /炭水化物[：:]\s*([\d.]+)\s*g/;
const PAT_SUGAR    = /糖質[：:]\s*([\d.]+)\s*g/;
const PAT_FIBER    = /食物繊維[：:]\s*([\d.]+)\s*g/;
const PAT_SALT     = /食塩相当量[：:]\s*([\d.]+)\s*g/;

interface NutritionRow {
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  sugar?: number;
  fiber?: number;
  salt: number;
}

function parseNutritionCell(text: string): NutritionRow | null {
  const t = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const num = (re: RegExp): number | null => {
    const m = t.match(re); return m ? Number(m[1]) : null;
  };
  const calories = num(PAT_CALORIES);
  const protein  = num(PAT_PROTEIN);
  const fat      = num(PAT_FAT);
  const carb     = num(PAT_CARB);
  const salt     = num(PAT_SALT);
  if (calories == null || protein == null || fat == null
      || carb == null || salt == null) return null;
  return {
    calories, protein, fat, carb, salt,
    sugar: num(PAT_SUGAR) ?? undefined,
    fiber: num(PAT_FIBER) ?? undefined,
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, ms));
}

async function fetchListing(ctx: BrowserContext, url: string): Promise<string[]> {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const html = await page.content();
    const ids = new Set<string>();
    for (const m of html.matchAll(/\/products\/a\/item\/(\d+)\//g)) ids.add(m[1]);
    return [...ids].map((id) => `${BASE}/products/a/item/${id}/`);
  } finally {
    await page.close();
  }
}

async function fetchItem(ctx: BrowserContext, url: string): Promise<{ name: string; nutrition: NutritionRow } | null> {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait briefly for the table to be in the DOM (Incapsula may inject
    // a JS challenge first and re-render).
    try {
      await page.waitForSelector('th:has-text("栄養成分")', { timeout: 8000 });
    } catch {
      // selector wait failed — fall through and try a direct HTML scrape;
      // some pages return the structured row without the helper waiting
      // for it to be visible.
    }
    const html = await page.content();
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    let name: string | null = null;
    if (titleMatch) {
      name = titleMatch[1]
        .replace(/[｜|]\s*セブン.*$/, '')
        .replace(/[\s　]+$/, '')
        .trim() || null;
    }
    const cellMatch = html.match(/<th[^>]*>\s*栄養成分\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/);
    const nutrition = cellMatch ? parseNutritionCell(cellMatch[1]) : null;
    if (!name || !nutrition) return null;
    return { name, nutrition };
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  console.log('[seven_eleven_pw] launching chromium...');
  const browser: Browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: UA });

  // Warm-up: navigate the products root once so Incapsula installs its
  // challenge cookies into the context.
  console.log('[seven_eleven_pw] warm-up navigation...');
  const warm = await ctx.newPage();
  await warm.goto(`${BASE}/products/`, { waitUntil: 'networkidle', timeout: 30000 });
  await warm.close();
  await sleep(1500);

  const allItems: MenuItemRecord[] = [];
  const capturedAt = new Date().toISOString().slice(0, 10);
  let consecutiveFails = 0;
  let earlyAbort = false;
  const perCatSummary: string[] = [];

  for (const { slug, mealiftCategory, limit } of CATEGORIES) {
    if (earlyAbort) break;
    const listingUrl = `${BASE}/products/a/${slug}/`;
    console.log(`[seven_eleven_pw] ${slug}: ${listingUrl}`);
    let urls: string[];
    try {
      urls = (await fetchListing(ctx, listingUrl)).slice(0, limit);
    } catch (e) {
      console.log(`  listing FAIL: ${(e as Error).message}`);
      perCatSummary.push(`${slug}:0/0 listing-fail`);
      continue;
    }
    if (urls.length === 0) {
      console.log('  listing returned 0 items (WAF stub likely)');
      perCatSummary.push(`${slug}:0/0`);
      continue;
    }
    console.log(`  → ${urls.length} item URLs (capped at ${limit})`);
    let parsed = 0;
    let missed = 0;
    for (const url of urls) {
      await sleep(SLEEP_MS);
      try {
        const result = await fetchItem(ctx, url);
        if (!result) {
          missed += 1;
          consecutiveFails += 1;
          console.log(`  MISS (${consecutiveFails} consecutive): ${url}`);
        } else {
          parsed += 1;
          consecutiveFails = 0;
          allItems.push({
            name: result.name,
            category: mealiftCategory,
            servingSizeG: 100,
            servingUnit: '個',
            caloriesPerServing: result.nutrition.calories,
            proteinG: result.nutrition.protein,
            fatG: result.nutrition.fat,
            carbG: result.nutrition.carb,
            sugarG: result.nutrition.sugar,
            fiberG: result.nutrition.fiber,
            saltG: result.nutrition.salt,
            source: 'official_disclosure',
            sourceUrl: url,
            sourceCapturedAt: capturedAt,
          });
          console.log(`  ✓ [${allItems.length}] ${result.name.slice(0, 30)} ${result.nutrition.calories}kcal`);
        }
      } catch (e) {
        missed += 1;
        consecutiveFails += 1;
        console.log(`  ERR (${consecutiveFails} consecutive): ${(e as Error).message.slice(0, 80)}`);
      }
      if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
        console.log(`[seven_eleven_pw] ${MAX_CONSECUTIVE_FAILS} consecutive failures — aborting (Drafting 154 trigger)`);
        earlyAbort = true;
        break;
      }
    }
    perCatSummary.push(`${slug}:${parsed}/${urls.length}`);
  }

  await ctx.close();
  await browser.close();

  console.log(`\n[seven_eleven_pw] summary: ${allItems.length} items / ${perCatSummary.join(' ')}`);

  const output: RestaurantScrapeOutput = {
    chainSlug: 'seven_eleven',
    chainName: 'セブン-イレブン',
    restaurantType: 'convenience',
    category: 'コンビニ',
    aliases: ['セブン-イレブン', 'セブンイレブン', '7-Eleven', 'sej', 'seven_eleven'],
    attribution: '公式 商品詳細ページ 栄養成分 (sej.co.jp /products/a/item/) via Playwright chromium',
    attributionUrl: `${BASE}/products/`,
    sourceCapturedAt: capturedAt,
    menuItems: allItems,
    ...(earlyAbort ? { partial: true } : {}),
  };
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'seven_eleven.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`[seven_eleven_pw] wrote ${allItems.length} items → ${path.relative(REPO_ROOT, outPath)}`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
