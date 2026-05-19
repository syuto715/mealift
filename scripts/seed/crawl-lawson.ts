// v1.5 Stage 2 Phase 2.2b Sprint 4.1 — lawson per-item walker.
//
// Workflow:
//   1. Fetch category listing pages to discover product URLs
//   2. Per-item fetch with 1 req/sec rate limit + Mealift Bot UA
//   3. Parse HTML for inline nutrition (kcal, P, F, C, fiber, sugar, salt)
//   4. Emit JSON list of MenuItemRecord shape (source = official_disclosure)
//
// HTML pattern (verified Phase 2.2b Sprint 4.1):
//   <title>...製品名...</title>
//   ...NNNkcal...たんぱく質...X.Xg...脂質...X.Xg...炭水化物...X.Xg...
//     糖質...X.Xg...食物繊維...X.Xg...食塩相当量...X.Xg...
//
// Robots.txt verified clean for /recommend/ (Phase 2.2b Sprint 4.1).
// Rate limit 1 req/sec to respect chain infrastructure.

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const UA = 'Mealift Bot v1.5.0 (https://mealift.app)';
const BASE = 'https://www.lawson.co.jp';

const SLEEP_MS = 1100; // 1 req/sec rate limit + 10% slack

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

function extractProductUrls(html: string): string[] {
  const urls = new Set<string>();
  for (const m of html.matchAll(/\/recommend\/original\/detail\/\d+_\d+\.html/g)) {
    urls.add(BASE + m[0]);
  }
  return [...urls];
}

interface LawsonItem {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  sugar?: number;
  salt: number;
  sourceUrl: string;
}

function parseProductPage(html: string, url: string): LawsonItem | null {
  // Name from <title> tag, strip site suffix
  let name = '';
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    name = titleMatch[1]
      .replace(/\s*[\|｜].*$/, '')        // strip "| ローソン"
      .replace(/\s*\([^)]*ローソン[^)]*\)$/, '')
      .replace(/^　+|　+$/g, '')
      .trim();
  }
  if (!name) return null;

  // Nutrition extraction — strip HTML tags, then match patterns
  const stripped = html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ');
  const num = (pat: RegExp): number | null => {
    const m = stripped.match(pat);
    return m ? Number(m[1]) : null;
  };
  const calories = num(/([\d.]+)kcal/);
  const protein = num(/たんぱく質\|?\s*\|?\s*([\d.]+)\s*g/);
  const fat = num(/脂質\|?\s*\|?\s*([\d.]+)\s*g/);
  const carbs = num(/炭水化物\|?\s*\|?\s*([\d.]+)\s*g/);
  const sugar = num(/糖質\|?\s*\|?\s*([\d.]+)\s*g/);
  const fiber = num(/食物繊維\|?\s*\|?\s*([\d.]+)\s*g/);
  const salt = num(/食塩相当量\|?\s*\|?\s*([\d.]+)\s*g/);

  if (
    calories == null || protein == null || fat == null
    || carbs == null || salt == null
  ) return null;

  return {
    name,
    calories,
    protein,
    fat,
    carbs,
    fiber: fiber ?? undefined,
    sugar: sugar ?? undefined,
    salt,
    sourceUrl: url,
  };
}

async function crawlCategory(categoryPath: string, limit: number): Promise<LawsonItem[]> {
  const listingUrl = `${BASE}${categoryPath}`;
  console.log(`[lawson] listing: ${listingUrl}`);
  const listingHtml = await fetchHtml(listingUrl);
  const urls = extractProductUrls(listingHtml).slice(0, limit);
  console.log(`[lawson] ${urls.length} product URLs in ${categoryPath}`);

  const items: LawsonItem[] = [];
  for (const url of urls) {
    await sleep(SLEEP_MS);
    try {
      const html = await fetchHtml(url);
      const item = parseProductPage(html, url);
      if (item) {
        items.push(item);
        console.log(`  [${items.length}] ${item.name.slice(0, 40)} ${item.calories}kcal`);
      } else {
        console.log(`  SKIP (no nutrition): ${url}`);
      }
    } catch (e) {
      console.log(`  FAIL: ${url} — ${(e as Error).message}`);
    }
  }
  return items;
}

async function main(): Promise<void> {
  // Sprint 4.1: representative subset across categories.
  // Per-category limit keeps total under per-turn context budget while
  // proving the path. Sprint 4.2+ can expand limits or add categories.
  const targets: Array<[string, number]> = [
    ['/recommend/original/rice/', 15],       // onigiri
    ['/recommend/original/bento/', 12],
    ['/recommend/original/sandwich/', 10],
    ['/recommend/original/bakery/', 8],
    ['/recommend/original/dessert/', 8],
    ['/recommend/original/noodle/', 5],
    ['/recommend/original/salad/', 5],
  ];

  const allItems: LawsonItem[] = [];
  for (const [cat, limit] of targets) {
    const items = await crawlCategory(cat, limit);
    allItems.push(...items);
  }
  console.log(`[lawson] TOTAL: ${allItems.length} items extracted`);

  const outDir = path.join(REPO_ROOT, 'scripts', 'seed', '_raw');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'lawson.json');
  // Match the existing _raw shape (array of {name, calories, ...})
  fs.writeFileSync(outPath, JSON.stringify(allItems, null, 2) + '\n', 'utf-8');
  console.log(`[lawson] wrote ${path.relative(REPO_ROOT, outPath)}`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
