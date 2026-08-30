// S5b — ココス per-item HTML crawler (新規チェーン)。
//
// Workflow (crawl-lawson 先例の規律を踏襲):
//   1. /menu/ index からカテゴリ listing (~17) を発見
//   2. 各 listing から item ページ URL を抽出、 全体で dedupe
//   3. 全 fetch に 1.1s sleep (1 req/sec + 10% slack)、 単発実行、
//      リトライは指数バックオフ (2s → 8s, 最大 3 回)
//   4. item ページのメイン栄養テーブルを抽出して
//      scripts/seed/data/cocos.json (RestaurantScrapeOutput) を emit
//
// ページ構造 (2026-08-30 の hb_cocos2203.html で検証):
//   - 品名: <h2 class="menu_ttl">
//   - メイン栄養: ラベル行と値行が交互に並ぶ table
//       エネルギー / 350kcal / たんぱく質 / 19.8g / 脂質 / 22.5g /
//       炭水化物 / 14.7g / 食塩相当量 / 1.5g
//   - ソース・トッピングの付帯栄養は「エネルギー33kcal…」の 1 行
//     連結形式なので、 交互形式の regex には match しない (main のみ
//     が取れる)。 最初の 1 block だけを採用。
//
// UA はブラウザ相当 (Syuto 承認 2026-08: 単発・低頻度・間隔規律の
// 条件付き)。 robots.txt は 404 (= 制限宣言なし) を 2026-08-30 に確認。

import * as fs from 'fs';
import * as path from 'path';
import type { MenuItemRecord, RestaurantScrapeOutput } from './types';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BASE = 'https://www.cocos-jpn.co.jp';
const MENU_INDEX = `${BASE}/menu/`;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const SLEEP_MS = 1100;
const CAPTURED_AT = '2026-08-30';

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string): Promise<string> {
  const backoffs = [2000, 8000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 404) throw Object.assign(new Error(`HTTP 404 ${url}`), { permanent: true });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.text();
    } catch (e) {
      const err = e as Error & { permanent?: boolean };
      if (err.permanent || attempt >= backoffs.length) throw err;
      console.log(`  retry in ${backoffs[attempt]}ms: ${url} — ${err.message}`);
      await sleep(backoffs[attempt]);
    }
  }
}

export function extractCategoryUrls(indexHtml: string): string[] {
  const urls = new Set<string>();
  for (const m of indexHtml.matchAll(/href="(\/menu\/[a-z0-9_/]+\/)"/g)) {
    if (m[1] === '/menu/') continue;
    urls.add(BASE + m[1]);
  }
  return [...urls].sort();
}

export function extractItemUrls(categoryHtml: string): string[] {
  const urls = new Set<string>();
  for (const m of categoryHtml.matchAll(/href="(\/menu\/[a-z0-9_/]+\.html)"/g)) {
    urls.add(BASE + m[1]);
  }
  return [...urls].sort();
}

export interface CocosNutrition {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  salt: number;
}

export function parseItemPage(html: string): CocosNutrition | null {
  const nameMatch = html.match(/<h2 class="menu_ttl">([^<]+)</);
  const titleMatch = html.match(/<title>\s*([^|<]+?)\s*[|｜]/);
  const name = (nameMatch?.[1] ?? titleMatch?.[1] ?? '').trim();
  if (!name) return null;

  // tag を改行に潰してから「ラベル行 → 値行」交互のメイン table を拾う。
  // ソース等の 1 行連結形式 (エネルギー33kcal…) は改行を挟まないため
  // この regex には match しない。
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&emsp;|&nbsp;/g, ' ');
  const m = text.match(
    /エネルギー\s*\n\s*([\d,]+(?:\.\d+)?)\s*kcal\s*\n\s*たんぱく質\s*\n\s*([\d.]+)\s*g\s*\n\s*脂質\s*\n\s*([\d.]+)\s*g\s*\n\s*炭水化物\s*\n\s*([\d.]+)\s*g\s*\n\s*食塩相当量\s*\n\s*([\d.]+)\s*g/,
  );
  if (!m) return null;
  return {
    name,
    calories: Number(m[1].replace(/,/g, '')),
    protein: Number(m[2]),
    fat: Number(m[3]),
    carb: Number(m[4]),
    salt: Number(m[5]),
  };
}

function toRecord(n: CocosNutrition, sourceUrl: string): MenuItemRecord {
  return {
    name: n.name,
    servingSizeG: 100,
    servingUnit: '皿',
    caloriesPerServing: n.calories,
    proteinG: n.protein,
    fatG: n.fat,
    carbG: n.carb,
    saltG: n.salt,
    source: 'official_disclosure',
    sourceUrl,
    sourceCapturedAt: CAPTURED_AT,
  };
}

async function main(): Promise<void> {
  console.log(`[cocos] index: ${MENU_INDEX}`);
  const indexHtml = await fetchHtml(MENU_INDEX);
  const categories = extractCategoryUrls(indexHtml);
  console.log(`[cocos] ${categories.length} category pages`);

  if (categories.length === 0) {
    // Codex R1 Important — index ページの構造変化で category が 0 に
    // なった場合、 空 JSON を「正常」として出荷してはいけない。
    throw new Error('[cocos] no category pages discovered — index 構造変化の疑い、fail-fast');
  }

  const items: MenuItemRecord[] = [];
  const byName = new Map<string, MenuItemRecord>();
  const dropped: string[] = [];

  const itemUrls = new Set<string>();
  for (const cat of categories) {
    await sleep(SLEEP_MS);
    try {
      const html = await fetchHtml(cat);
      const urls = extractItemUrls(html);
      if (urls.length === 0) {
        // Codex R2 Important — fetch は成功したが item URL が 1 件も
        // 取れないカテゴリは構造変化の兆候。 他カテゴリが正常でも
        // 欠落として観測可能にする。
        dropped.push(`category-empty: ${cat}`);
      }
      for (const u of urls) itemUrls.add(u);
      console.log(`  ${cat} → ${urls.length} item URLs`);
    } catch (e) {
      // Codex R1 Important — カテゴリ丸ごとの欠落を droppedItems に
      // 記録して partial: true に反映する (観測可能性の確保)。
      dropped.push(`category-failed: ${cat} — ${(e as Error).message}`);
      console.log(`  FAIL category ${cat} — ${(e as Error).message}`);
    }
  }
  console.log(`[cocos] ${itemUrls.size} unique item URLs`);
  if (itemUrls.size === 0) {
    throw new Error('[cocos] no item URLs discovered — category 構造変化の疑い、fail-fast');
  }
  let done = 0;
  for (const url of [...itemUrls].sort()) {
    await sleep(SLEEP_MS);
    done += 1;
    try {
      const html = await fetchHtml(url);
      const parsed = parseItemPage(html);
      if (!parsed) {
        dropped.push(`no-nutrition: ${url}`);
        console.log(`  [${done}/${itemUrls.size}] SKIP (no nutrition) ${url}`);
        continue;
      }
      let name = parsed.name;
      const existing = byName.get(name);
      if (existing) {
        const same =
          existing.caloriesPerServing === parsed.calories
          && existing.proteinG === parsed.protein
          && existing.fatG === parsed.fat
          && existing.carbG === parsed.carb
          && existing.saltG === parsed.salt;
        if (same) {
          console.log(`  [${done}/${itemUrls.size}] DUP (same values) ${name}`);
          continue;
        }
        // 同名異値 — テイクアウト mirror が典型。 URL から判別できる
        // 場合は suffix、 それ以外はカテゴリ segment で区別する。
        const suffix = url.includes('/takeout/')
          ? '（テイクアウト）'
          : `（${url.split('/menu/')[1]?.split('/')[0] ?? 'alt'}）`;
        name = `${name}${suffix}`;
        if (byName.has(name)) {
          dropped.push(`name-collision: ${name} ${url}`);
          continue;
        }
      }
      const record = toRecord({ ...parsed, name }, url);
      byName.set(name, record);
      items.push(record);
      console.log(`  [${done}/${itemUrls.size}] ${name} ${parsed.calories}kcal`);
    } catch (e) {
      dropped.push(`fetch-failed: ${url} — ${(e as Error).message}`);
      console.log(`  [${done}/${itemUrls.size}] FAIL ${url} — ${(e as Error).message}`);
    }
  }

  if (items.length === 0) {
    throw new Error('[cocos] 0 items extracted — item ページ構造変化の疑い、fail-fast');
  }

  const output: RestaurantScrapeOutput = {
    chainSlug: 'cocos',
    chainName: 'ココス',
    restaurantType: 'dining',
    category: 'ファミレス',
    aliases: ['ココス', "COCO'S", 'cocos'],
    attribution: '公式メニューページより (ココス)',
    attributionUrl: MENU_INDEX,
    sourceCapturedAt: CAPTURED_AT,
    menuItems: items,
    ...(dropped.length > 0 ? { partial: true, droppedItems: dropped } : {}),
  };
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'cocos.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`[cocos] wrote ${items.length} items (dropped ${dropped.length}) → ${path.relative(REPO_ROOT, outPath)}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
