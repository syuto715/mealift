// v1.5 Phase 2.3 Sprint 2.3.1 — build-time search index pre-compute
// (Drafting 159).
//
// Reads the canonical seed data (八訂 foods + their aliases, Stage 2
// restaurant menu items + restaurants metadata) and emits a single
// JSON snapshot whose rows match the runtime `search_index` table
// shape from migration v36. The runtime seed loader (Sprint 2.3.2)
// `INSERT OR REPLACE`s these rows into search_index, which fires
// the FTS5 sync trigger.
//
// `aliases_concat` carries (a) the entry's own aliases plus (b) the
// kuromoji-derived yomigana for the canonical name, both normalized
// via `normalizeForSearch` (NFKC + lowercase + hiragana→katakana).
// FTS5 indexes this column alongside name_ja so hits via aliases
// contribute to ranking on equal footing.
//
// Okurigana variant generation (e.g., 焼鳥 ↔ 焼き鳥) is intentionally
// scoped OUT of v1.5.0 — kuromoji's IPA dict treats both surface
// forms as the same noun with the same reading, and reconstituting
// the alternate spelling requires a dictionary of okurigana pairs
// that doesn't exist in the IPA dict. The yomigana variant alone
// covers the most common search pattern (typing in kana). We will
// revisit okurigana variants in v1.5.1 with a curated pair list.
//
// Output: src/infra/database/seed/data/search-index.json
//
// Usage: npx tsx scripts/build-search-index.ts

import * as fs from 'fs';
import * as path from 'path';
import * as kuromoji from 'kuromoji';

const REPO_ROOT = path.resolve(__dirname, '..');
const SEED_DIR = path.join(REPO_ROOT, 'src/infra/database/seed/data');
const RESTAURANT_DATA_DIR = path.join(REPO_ROOT, 'scripts/seed/data');
const OUT_PATH = path.join(SEED_DIR, 'search-index.json');

// Sprint 2.7.4 orphan cleanup removed the runtime
// `src/utils/normalizeForSearch.ts` and its dedicated test (the v2 dev-
// preview tree was the only consumer). The normalization logic now
// lives ONLY here, as the build-time step that bakes katakana
// yomigana + cross-script collapse into `aliases_concat` in
// `search-index.json`. Phase 2.7c (Exercises master seed) may
// re-introduce a runtime normalizer — when that happens, share this
// function across runtime + build script and re-add a cross-script
// collapse test against the deduped helper.
function normalizeForSearch(input: string): string {
  if (!input) return '';
  const nfkc = input.normalize('NFKC');
  const lowered = nfkc.toLowerCase();
  let out = '';
  for (let i = 0; i < lowered.length; i += 1) {
    const code = lowered.charCodeAt(i);
    if (code >= 0x3041 && code <= 0x3096) {
      out += String.fromCharCode(code + 0x60);
    } else {
      out += lowered[i];
    }
  }
  return out;
}

// v1.5.1 Gap 1 fix — brand aliases per chain.
//
// Phase 2.2b seeded each restaurant menu row with the chain's full
// official name as `brand` (e.g., "セブン-イレブン", "KFC 日本ケンタッキー",
// "ガスト / すかいらーくグループ"). FTS5 indexes `brand` directly, so the
// canonical-name query path already works. But customers type colloquial
// shorthand — 「マック」, 「スタバ」, 「セブンイレブン」 (no hyphen),
// 「吉牛」, 「ファミマ」, 「KFC」 — and none of those appear in `brand`,
// `name_ja`, or `aliases_concat` today, so the search returns 0 hits
// (TestFlight Build 25 dogfood, Syuto report 2026-05-26).
//
// Keys MUST match the literal `chain.chainName` value emitted into the
// `brand` column at build time. Phase 0 recon verified all 36 chains.
// When a future chain is added to scripts/seed/data/, add an entry
// here (empty array if no colloquial shorthand exists).
const BRAND_ALIASES: Record<string, string[]> = {
  // Convenience stores
  'セブン-イレブン': ['セブンイレブン', 'セブン', 'セブイレ', '7-Eleven', '7eleven'],
  'ファミリーマート': ['ファミマ'],
  'ローソン': ['LAWSON'],
  'ミニストップ': [],
  'デイリーヤマザキ': ['デイリー'],
  'セイコーマート': ['セコマ'],
  // Burger chains
  'マクドナルド': ['マック', 'マクド'],
  'モスバーガー': ['モス', 'MOS'],
  'バーガーキング': ['BK', 'バーキン'],
  'フレッシュネスバーガー': ['フレッシュネス'],
  'ロッテリア': ['LOTTERIA'],
  'KFC 日本ケンタッキー': ['KFC', 'ケンタッキー', 'ケンタ'],
  // Gyudon / set-meal chains
  '吉野家': ['吉牛', 'よしのや'],
  'すき家': ['すきや'],
  '松屋': ['松屋フーズ'],
  'なか卯': ['なかう'],
  '大戸屋': ['大戸屋ごはん処'],
  // Sushi chains
  'スシロー': ['寿司郎'],
  'くら寿司': ['くらずし'],
  'かっぱ寿司': ['かっぱ'],
  'はま寿司': ['はまずし'],
  '元気寿司': ['元気'],
  // Family restaurants
  'ガスト / すかいらーくグループ': ['ガスト'],
  'サイゼリヤ': ['サイゼ'],
  'バーミヤン': [],
  'デニーズ': ["Denny's"],
  // Coffee chains
  'スターバックスコーヒー': ['スターバックス', 'スタバ'],
  'タリーズコーヒー': ['タリーズ', 'TULLYS', "TULLY'S"],
  'ドトールコーヒー': ['ドトール', 'DOUTOR'],
  'コメダ珈琲店': ['コメダ', 'コメダ珈琲'],
  'プロント': ['PRONTO'],
  // Specialty
  'CoCo壱番屋': ['ココイチ', 'CoCo壱', 'ココ壱'],
  '餃子の王将': ['王将', '餃王'],
  '丸亀製麺': ['丸亀'],
  'リンガーハット': ['リンガー'],
  '一風堂': ['IPPUDO'],
};

function aliasesForBrand(brand: string | null): string[] {
  if (!brand) return [];
  return BRAND_ALIASES[brand] ?? [];
}

interface MextFoodRow {
  id: string;
  nameJa: string;
  nameEn: string | null;
  brand: string | null;
  isCommon: boolean;
  servingSizeG: number;
  servingUnit: string;
  caloriesPerServing: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number | null;
  sodiumMg: number | null;
  calciumMg: number | null;
  ironMg: number | null;
  vitaminAUg: number | null;
  vitaminB1Mg: number | null;
  vitaminB2Mg: number | null;
  vitaminB6Mg: number | null;
  vitaminB12Ug: number | null;
  folateUg: number | null;
  vitaminCMg: number | null;
  vitaminDUg: number | null;
  vitaminEMg: number | null;
  potassiumMg: number | null;
  magnesiumMg: number | null;
  zincMg: number | null;
  cholesterolMg: number | null;
  saturatedFatG: number | null;
  sugarG: number | null;
  saltG: number | null;
}
interface MextAliasRow {
  foodId: string;
  aliasName: string;
}

interface RestaurantMenuItemRow {
  name: string;
  aliases?: string[];
  source: string;
  category?: string | null;
  servingSizeG?: number;
  servingUnit?: string;
  servingDescription?: string | null;
  caloriesPerServing: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG?: number | null;
  sugarG?: number | null;
  saltG?: number | null;
  sodiumMg?: number | null;
  saturatedFatG?: number | null;
  cholesterolMg?: number | null;
  sourceUrl?: string | null;
}

interface RestaurantScrapeOutput {
  chainSlug: string;
  chainName: string;
  menuItems: RestaurantMenuItemRow[];
}

// Shape stored in `search_index.nutrition_json`. Optional fields
// reflect provenance-dependent completeness: 八訂 rows fill the
// full grid, restaurant menu rows fill only the disclosed subset.
// Missing fields render as "—" in the detail view.
export interface SearchIndexNutritionJson {
  servingSizeG?: number;
  servingUnit?: string;
  servingDescription?: string | null;
  caloriesPerServing: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG?: number | null;
  sugarG?: number | null;
  saltG?: number | null;
  sodiumMg?: number | null;
  saturatedFatG?: number | null;
  cholesterolMg?: number | null;
  calciumMg?: number | null;
  ironMg?: number | null;
  magnesiumMg?: number | null;
  zincMg?: number | null;
  potassiumMg?: number | null;
  vitaminAUg?: number | null;
  vitaminB1Mg?: number | null;
  vitaminB2Mg?: number | null;
  vitaminB6Mg?: number | null;
  vitaminB12Ug?: number | null;
  folateUg?: number | null;
  vitaminCMg?: number | null;
  vitaminDUg?: number | null;
  vitaminEMg?: number | null;
  sourceUrl?: string | null;
}

interface SearchIndexRow {
  source_type: 'food' | 'restaurant_menu';
  source_id: string;
  name_ja: string;
  name_en: string | null;
  brand: string | null;
  aliases_concat: string;
  source_label: string;
  is_common: 0 | 1;
  nutrition_json: string;
}

function foodToNutrition(food: MextFoodRow): SearchIndexNutritionJson {
  return {
    servingSizeG: food.servingSizeG,
    servingUnit: food.servingUnit,
    caloriesPerServing: food.caloriesPerServing,
    proteinG: food.proteinG,
    fatG: food.fatG,
    carbG: food.carbG,
    fiberG: food.fiberG,
    sugarG: food.sugarG,
    saltG: food.saltG,
    sodiumMg: food.sodiumMg,
    saturatedFatG: food.saturatedFatG,
    cholesterolMg: food.cholesterolMg,
    calciumMg: food.calciumMg,
    ironMg: food.ironMg,
    magnesiumMg: food.magnesiumMg,
    zincMg: food.zincMg,
    potassiumMg: food.potassiumMg,
    vitaminAUg: food.vitaminAUg,
    vitaminB1Mg: food.vitaminB1Mg,
    vitaminB2Mg: food.vitaminB2Mg,
    vitaminB6Mg: food.vitaminB6Mg,
    vitaminB12Ug: food.vitaminB12Ug,
    folateUg: food.folateUg,
    vitaminCMg: food.vitaminCMg,
    vitaminDUg: food.vitaminDUg,
    vitaminEMg: food.vitaminEMg,
  };
}

function menuItemToNutrition(item: RestaurantMenuItemRow): SearchIndexNutritionJson {
  return {
    servingSizeG: item.servingSizeG,
    servingUnit: item.servingUnit,
    servingDescription: item.servingDescription,
    caloriesPerServing: item.caloriesPerServing,
    proteinG: item.proteinG,
    fatG: item.fatG,
    carbG: item.carbG,
    fiberG: item.fiberG,
    sugarG: item.sugarG,
    saltG: item.saltG,
    sodiumMg: item.sodiumMg,
    saturatedFatG: item.saturatedFatG,
    cholesterolMg: item.cholesterolMg,
    sourceUrl: item.sourceUrl,
  };
}

async function loadKuromoji(): Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> {
  const dictPath = path.join(REPO_ROOT, 'node_modules/kuromoji/dict/');
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: dictPath }).build((err, tokenizer) => {
      if (err) reject(err);
      else resolve(tokenizer);
    });
  });
}

function yomigana(
  tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures>,
  text: string,
): string {
  const tokens = tokenizer.tokenize(text);
  const reading = tokens
    .map((t) => t.reading)
    .filter((r): r is string => Boolean(r) && r !== '*')
    .join('');
  return reading;
}

function buildAliasesConcat(
  canonicalReading: string,
  aliases: string[],
): string {
  const parts = new Set<string>();
  for (const a of aliases) {
    const norm = normalizeForSearch(a);
    if (norm) parts.add(norm);
  }
  const readingNorm = normalizeForSearch(canonicalReading);
  if (readingNorm) parts.add(readingNorm);
  return Array.from(parts).join(' ');
}

async function buildFoodRows(
  tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures>,
): Promise<SearchIndexRow[]> {
  const foodsPath = path.join(SEED_DIR, 'foods-mext.json');
  const aliasesPath = path.join(SEED_DIR, 'aliases-mext.json');
  const foods = JSON.parse(fs.readFileSync(foodsPath, 'utf-8')) as MextFoodRow[];
  const aliasRows = JSON.parse(fs.readFileSync(aliasesPath, 'utf-8')) as MextAliasRow[];

  const aliasMap = new Map<string, string[]>();
  for (const r of aliasRows) {
    const arr = aliasMap.get(r.foodId) ?? [];
    arr.push(r.aliasName);
    aliasMap.set(r.foodId, arr);
  }

  const out: SearchIndexRow[] = [];
  for (const food of foods) {
    const reading = yomigana(tokenizer, food.nameJa);
    const aliases = aliasMap.get(food.id) ?? [];
    out.push({
      source_type: 'food',
      source_id: food.id,
      name_ja: food.nameJa,
      name_en: food.nameEn,
      brand: food.brand,
      aliases_concat: buildAliasesConcat(reading, aliases),
      // 八訂 entries are the official Japanese MEXT food composition
      // tables — they qualify as `official_disclosure` for the
      // search-result badge (Drafting 152).
      source_label: 'official_disclosure',
      is_common: food.isCommon ? 1 : 0,
      nutrition_json: JSON.stringify(foodToNutrition(food)),
    });
  }
  return out;
}

async function buildRestaurantRows(
  tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures>,
): Promise<SearchIndexRow[]> {
  const files = fs
    .readdirSync(RESTAURANT_DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const out: SearchIndexRow[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(RESTAURANT_DATA_DIR, file), 'utf-8');
    const chain = JSON.parse(raw) as RestaurantScrapeOutput;
    for (let i = 0; i < chain.menuItems.length; i += 1) {
      const item = chain.menuItems[i];
      const reading = yomigana(tokenizer, item.name);
      // Per-record source label (Drafting 152) — falls back to
      // 'official_disclosure' when the seed omits the field.
      const sourceLabel = item.source || 'official_disclosure';
      // Deterministic id derived from chain slug + offset; the
      // server-side migration uses the same pattern (epic §4.2),
      // and the search-index seed loader matches on this id when
      // an upsert is needed.
      const sourceId = `${chain.chainSlug}_${i.toString().padStart(4, '0')}`;
      // v1.5.1 — fold the chain's colloquial-shorthand aliases into every
      // menu row so 「マック ポテト」「スタバ ラテ」「吉牛 並盛」 hit via
      // brand-shorthand + menu-term token-wise FTS5 AND.
      const brandAliases = aliasesForBrand(chain.chainName);
      out.push({
        source_type: 'restaurant_menu',
        source_id: sourceId,
        name_ja: item.name,
        name_en: null,
        brand: chain.chainName,
        aliases_concat: buildAliasesConcat(reading, [
          ...(item.aliases ?? []),
          ...brandAliases,
        ]),
        source_label: sourceLabel,
        is_common: 0,
        nutrition_json: JSON.stringify(menuItemToNutrition(item)),
      });
    }
  }
  return out;
}

async function main(): Promise<void> {
  console.log('[search-index] loading kuromoji dictionary...');
  const tokenizer = await loadKuromoji();
  console.log('[search-index] kuromoji ready');

  console.log('[search-index] building food rows...');
  const foodRows = await buildFoodRows(tokenizer);
  console.log(`[search-index] foods: ${foodRows.length} rows`);

  console.log('[search-index] building restaurant menu rows...');
  const restaurantRows = await buildRestaurantRows(tokenizer);
  console.log(`[search-index] restaurant_menu: ${restaurantRows.length} rows`);

  const rows = [...foodRows, ...restaurantRows];
  console.log(`[search-index] total: ${rows.length} rows`);

  fs.writeFileSync(OUT_PATH, JSON.stringify(rows, null, 2) + '\n', 'utf-8');
  const sizeMb = (fs.statSync(OUT_PATH).size / (1024 * 1024)).toFixed(2);
  console.log(`[search-index] wrote ${path.relative(REPO_ROOT, OUT_PATH)} (${sizeMb} MB)`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
