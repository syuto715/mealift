// v1.5 Stage 2 Phase 2.2b Sprint 6.4 — ministop nutrition aggregator crawler.
//
// Discovery (Sprint 6.4 reconnaissance):
//   - Descriptive product URLs (/syohin/<cat>/<sub>/<name>/) carry NO
//     inline nutrition — promotional content only.
//   - The official disclosure is centralised at
//     `/syohin/nutrition/results.html?search_category[]=<cat-JP>` —
//     a server-rendered HTML table aggregator covering the four
//     in-store-made categories the chain discloses:
//       ソフトクリーム / コールドスイーツ / ホットスナック / 店内加工ドリンク
//   - Packaged SKUs (onigiri / bento / sandwich / oden) are NOT covered
//     by this aggregator and remain as ai_estimate residual.
//
// Robots.txt (typo `Disallaw:`, spec-invalid but ethically respected):
//   - `/syohin/nutrition/pdf/` blocked — we don't touch the PDF tree.
//   - `/syohin/nutrition/results.html` is permitted.
//
// Strategy: fetch the four aggregator pages once each, parse table rows
// (8 columns: 商品名 / allergens / kcal / P / F / C / Na mg / 食塩 g),
// merge with the 19 packaged residual rows that survive in
// `scripts/seed/data/ministop.json` from Sprint 4.2.

import * as fs from 'fs';
import * as path from 'path';
import type { MenuItemRecord, RestaurantScrapeOutput } from './types';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const UA = 'Mealift Bot v1.5.0 (https://mealift.app)';
const BASE = 'https://www.ministop.co.jp';
const SLEEP_MS = 1200; // 1 req/sec budget + slack

const CATEGORIES: Array<{ jp: string; mealiftCategory: string }> = [
  { jp: 'ソフトクリーム', mealiftCategory: 'ソフトクリーム' },
  { jp: 'コールドスイーツ', mealiftCategory: 'コールドスイーツ' },
  { jp: 'ホットスナック', mealiftCategory: 'ホットスナック' },
  { jp: '店内加工ドリンク', mealiftCategory: 'ドリンク' },
];

// Packaged categories preserved from the prior AI-estimate seed — the
// official aggregator does not disclose these, so we keep the existing
// rows tagged `ai_estimate` rather than drop them.
const RESIDUAL_AI_CATEGORIES = new Set(['おにぎり', '弁当', 'サンド', 'おでん']);

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

function categoryUrl(jp: string): string {
  // URLSearchParams encodes [ ] for us; ministop accepts the standard
  // %5B%5D form (verified Sprint 6.4 reconnaissance).
  const qs = new URLSearchParams();
  qs.append('search_category[]', jp);
  return `${BASE}/syohin/nutrition/results.html?${qs.toString()}`;
}

interface AggregatorRow {
  name: string;
  detailHref: string | null;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  sodiumMg: number;
  salt: number;
}

// Each data row is a `<tr>` containing 8 `<td>` cells; the first cell
// embeds the product name + allergen-link image, columns 3-8 are the
// nutrition numbers. The header row uses `<th>` so we filter to `<tr>`
// blocks whose body starts with a `<td>` cell.
export function parseAggregator(html: string): AggregatorRow[] {
  const rows: AggregatorRow[] = [];
  // Greedy slice on tr to keep regex tractable.
  const trMatches = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  for (const tr of trMatches) {
    if (!/<td/i.test(tr)) continue; // skip header row
    const tdMatches = tr.match(/<td\b[^>]*>[\s\S]*?<\/td>/g);
    if (!tdMatches || tdMatches.length < 8) continue;

    const nameCell = tdMatches[0];
    const hrefMatch = nameCell.match(/href="([^"]+)"/);
    const detailHref = hrefMatch ? hrefMatch[1] : null;
    const spanMatches = nameCell.match(/<span\b[^>]*>([\s\S]*?)<\/span>/g) ?? [];
    // Name lives in the first <span> inside the product-link block; the
    // allergen-mark spans live in the second <td>, so the first span we
    // find in the first td is the product name.
    let name = '';
    for (const sp of spanMatches) {
      const inner = sp.replace(/<[^>]+>/g, '').trim();
      if (inner) { name = inner; break; }
    }
    if (!name) continue;

    const numericCells = tdMatches.slice(2, 8).map((cell) =>
      cell.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim(),
    );
    if (numericCells.length !== 6) continue;
    const nums = numericCells.map((c) => Number(c));
    if (!nums.every((n) => Number.isFinite(n))) continue;
    const [calories, protein, fat, carb, sodiumMg, salt] = nums;
    if (calories <= 0 && protein <= 0 && fat <= 0 && carb <= 0) continue;

    rows.push({ name, detailHref, calories, protein, fat, carb, sodiumMg, salt });
  }
  return rows;
}

function rowsToOfficialItems(
  rows: AggregatorRow[],
  mealiftCategory: string,
  capturedAt: string,
): MenuItemRecord[] {
  return rows.map((r) => ({
    name: r.name,
    category: mealiftCategory,
    servingSizeG: 100,
    servingUnit: '個',
    caloriesPerServing: r.calories,
    proteinG: r.protein,
    fatG: r.fat,
    carbG: r.carb,
    saltG: r.salt,
    sodiumMg: r.sodiumMg,
    source: 'official_disclosure' as const,
    sourceUrl: r.detailHref
      ? `${BASE}${r.detailHref}`
      : `${BASE}/syohin/nutrition/`,
    sourceCapturedAt: capturedAt,
  }));
}

function loadResidualAiItems(existingPath: string): MenuItemRecord[] {
  if (!fs.existsSync(existingPath)) return [];
  const raw = JSON.parse(fs.readFileSync(existingPath, 'utf-8')) as RestaurantScrapeOutput;
  return raw.menuItems.filter((it) => RESIDUAL_AI_CATEGORIES.has(it.category ?? ''));
}

async function main(): Promise<void> {
  const capturedAt = new Date().toISOString().slice(0, 10);
  const rawDir = path.join(REPO_ROOT, 'scripts', 'seed', '_raw');
  fs.mkdirSync(rawDir, { recursive: true });

  const officialItems: MenuItemRecord[] = [];
  for (const { jp, mealiftCategory } of CATEGORIES) {
    const url = categoryUrl(jp);
    console.log(`[ministop] fetching ${jp}: ${url}`);
    const html = await fetchHtml(url);
    fs.writeFileSync(
      path.join(rawDir, `ministop_${mealiftCategory}.html`),
      html,
      'utf-8',
    );
    const rows = parseAggregator(html);
    console.log(`  → ${rows.length} rows extracted`);
    officialItems.push(...rowsToOfficialItems(rows, mealiftCategory, capturedAt));
    await sleep(SLEEP_MS);
  }

  const existingPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'ministop.json');
  const residual = loadResidualAiItems(existingPath);
  console.log(
    `[ministop] official: ${officialItems.length}, residual ai_estimate: ${residual.length}, total: ${officialItems.length + residual.length}`,
  );

  const output: RestaurantScrapeOutput = {
    chainSlug: 'ministop',
    chainName: 'ミニストップ',
    restaurantType: 'convenience',
    category: 'コンビニ',
    aliases: ['ミニストップ', 'ministop'],
    attribution: '公式 アレルゲン・栄養成分 (ministop.co.jp /syohin/nutrition/) + 一部 AI 推定',
    attributionUrl: `${BASE}/syohin/nutrition/`,
    sourceCapturedAt: capturedAt,
    menuItems: [...officialItems, ...residual],
  };

  fs.writeFileSync(existingPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`[ministop] wrote ${output.menuItems.length} items → ${path.relative(REPO_ROOT, existingPath)}`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
