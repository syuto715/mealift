// v1.5 Stage 2 Phase 2.2b Sprint 6.6 — starbucks_jp official nutritions.json scraper.
//
// Reconnaissance (Sprint 6.6):
//   - product.starbucks.co.jp uses a Vue.js SPA for category pages, so
//     curl-fetching /beverage/<cat>/ returns only the JS bundle shell.
//   - The Vue app at /allergy/nutrient/ loads a single static JSON file
//     `https://product.starbucks.co.jp/allergy/json/nutritions.json`
//     (~968 KB) that contains the full official disclosure for every
//     menu item across all selling stores.
//   - Per-item /item/<cat>/<jan>/ pages render via Inertia.js and do not
//     embed nutrition (verified). The aggregator JSON is the canonical
//     source — Playwright is unnecessary.
//
// Schema (verified Sprint 6.6 reconnaissance):
//   nutritions.json = {
//     [SELLING_STORE: STARBUCKS|RESERVE|ROASTERY|ONLINE_STORE]: {
//       [TYPE: beverage|food]: {
//         [KBN: kbn_1..kbn_N]: {
//           selling_store_name_ja, selling_store_name_en, last_updated,
//           categories: { [cXX]: {
//             category_name_ja, category_name_en,
//             menu_groups: [ Product, ... ] } } } } } }
//   Product = {
//     url_jan_code: '4524785638129',           // canonical JAN-13
//     link: '/item/beverage/<jan>/',
//     product_name_ja, product_name_en,
//     is_menu_product: true,                   // filter on this
//     irregular_label,                         // e.g., '*5/11 発売' annotation
//     nutrition_by_milk: { [SIZE: SHORT|TALL|GRANDE|VENTI|STANDARD]:
//                          [{ _milk_type, calory, protein, lipid,
//                             carbohydrate, salt_eq, sodium, ... }] } }
//
// Emission strategy (Sprint 6.6, user choice Scope F):
//   - One MenuItemRecord per (selling_store, product, size, milk_variant)
//     where size has a row and the row's calory is numeric (not null).
//   - Name disambiguation: base name from product_name_ja + size + milk
//     label (e.g., "カフェラテ TALL アーモンドミルク").
//   - We restrict to selling_store === 'STARBUCKS' for the v1.5.0 seed
//     (RESERVE / ROASTERY / ONLINE_STORE add ~80% noise for the
//     casual-user catalog). The other stores can be backfilled in a
//     v1.5.x update.

import * as fs from 'fs';
import * as path from 'path';
import type { MenuItemRecord, RestaurantScrapeOutput } from './types';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const UA = 'Mealift Bot v1.5.0 (https://mealift.app)';
const SOURCE_URL = 'https://product.starbucks.co.jp/allergy/json/nutritions.json';
const ITEM_URL_BASE = 'https://product.starbucks.co.jp';

const MILK_LABELS_JA: Record<string, string> = {
  milk: 'ミルク',
  low_fat: '低脂肪タイプ',
  non_fat: '無脂肪乳',
  soy: '豆乳',
  almond: 'アーモンドミルク',
  oat: 'オーツミルク',
  breve: 'ブレベ',
  default: '',
  no_change: '',
};

const SIZE_LABEL_JA: Record<string, string> = {
  SHORT: 'Short',
  TALL: 'Tall',
  GRANDE: 'Grande',
  VENTI: 'Venti',
  STANDARD: 'Standard',
};

interface RawMilkRow {
  _milk_type?: string | null;
  calory?: number | null;
  protein?: number | null;
  lipid?: number | null;
  carbohydrate?: number | null;
  salt_eq?: number | null;
  sodium?: number | null;
}

interface RawProduct {
  url_jan_code: string;
  link: string;
  product_name_ja?: string;
  product_name_en?: string;
  is_menu_product?: boolean;
  irregular_label?: string;
  nutrition_by_milk?: Record<string, RawMilkRow[]>;
}

function roundOrNull(v: number | null | undefined): number | undefined {
  if (v == null) return undefined;
  if (!Number.isFinite(v)) return undefined;
  // Round to 1 decimal place to keep the SQL migration human-readable.
  return Math.round(v * 10) / 10;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&reg;/g, '®')
    .replace(/&trade;/g, '™')
    .replace(/&copy;/g, '©')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"');
}

function productToRecords(
  product: RawProduct,
  category_ja: string,
  capturedAt: string,
): MenuItemRecord[] {
  if (!product.is_menu_product) return [];
  if (!product.nutrition_by_milk) return [];
  const baseName = decodeEntities(product.product_name_ja ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s*※.*$/, '')
    .trim();
  if (!baseName) return [];

  const out: MenuItemRecord[] = [];
  for (const [sizeKey, rows] of Object.entries(product.nutrition_by_milk)) {
    const sizeLabel = SIZE_LABEL_JA[sizeKey] ?? sizeKey;
    for (const row of rows) {
      const kcal = roundOrNull(row.calory);
      const protein = roundOrNull(row.protein);
      const fat = roundOrNull(row.lipid);
      const carb = roundOrNull(row.carbohydrate);
      const salt = roundOrNull(row.salt_eq);
      const sodium = roundOrNull(row.sodium);
      if (kcal == null || protein == null || fat == null || carb == null) continue;

      const milkKey = row._milk_type ?? '';
      const milkLabel = MILK_LABELS_JA[milkKey] ?? '';
      const parts = [baseName];
      if (sizeKey !== 'STANDARD') parts.push(sizeLabel);
      if (milkLabel) parts.push(milkLabel);
      const finalName = parts.join(' ').replace(/\s+/g, ' ').trim();

      out.push({
        name: finalName,
        category: category_ja,
        servingSizeG: 100,
        servingUnit: '杯',
        servingDescription: SIZE_LABEL_JA[sizeKey] ?? sizeKey,
        caloriesPerServing: kcal,
        proteinG: protein,
        fatG: fat,
        carbG: carb,
        saltG: salt,
        sodiumMg: sodium,
        source: 'official_disclosure',
        sourceUrl: `${ITEM_URL_BASE}${product.link}`,
        sourceCapturedAt: capturedAt,
      });
    }
  }
  return out;
}

export function emitItems(
  json: unknown,
  capturedAt: string,
  storeFilter: string = 'STARBUCKS',
): MenuItemRecord[] {
  const out: MenuItemRecord[] = [];
  const seenKeys = new Set<string>();
  const root = json as Record<string, Record<string, Record<string, Record<string, unknown>>>>;
  const store = root[storeFilter];
  if (!store) return out;
  for (const [_type, kbns] of Object.entries(store)) {
    for (const [_kbn, kbnNode] of Object.entries(kbns)) {
      const categories = (kbnNode as { categories?: Record<string, unknown> }).categories;
      if (!categories) continue;
      for (const [_cXX, catNode] of Object.entries(categories)) {
        const cat = catNode as { category_name_ja?: string; menu_groups?: RawProduct[] };
        const catJa = decodeEntities(cat.category_name_ja ?? '');
        for (const product of cat.menu_groups ?? []) {
          for (const record of productToRecords(product, catJa, capturedAt)) {
            // Dedupe across kbn variants of the same product+size+milk
            const key = `${record.name}|${record.sourceUrl}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            out.push(record);
          }
        }
      }
    }
  }
  return out;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function main(): Promise<void> {
  console.log(`[starbucks_jp] fetching ${SOURCE_URL}`);
  const json = await fetchJson(SOURCE_URL);
  const rawDir = path.join(REPO_ROOT, 'scripts', 'seed', '_raw');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(
    path.join(rawDir, 'starbucks_jp_nutritions.json'),
    JSON.stringify(json, null, 2) + '\n',
    'utf-8',
  );

  const capturedAt = new Date().toISOString().slice(0, 10);
  const items = emitItems(json, capturedAt, 'STARBUCKS');
  console.log(`[starbucks_jp] emitted ${items.length} records (STARBUCKS selling-store only)`);

  const output: RestaurantScrapeOutput = {
    chainSlug: 'starbucks_jp',
    chainName: 'スターバックスコーヒー',
    restaurantType: 'cafe_bakery',
    category: 'カフェ',
    aliases: ['スタバ', 'スターバックス', 'Starbucks', 'starbucks_jp'],
    attribution: '公式 nutritions.json (product.starbucks.co.jp /allergy/json/)',
    attributionUrl: SOURCE_URL,
    sourceCapturedAt: capturedAt,
    menuItems: items,
  };
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'starbucks_jp.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`[starbucks_jp] wrote ${items.length} items → ${path.relative(REPO_ROOT, outPath)}`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
