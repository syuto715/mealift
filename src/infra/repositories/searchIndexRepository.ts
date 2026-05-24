import { getDatabase } from '../database/connection';
import { Food } from '../../types/food';

// v1.5 hotfix Issue 2 — チェーン店食品検索 0 件 fix (Path A).
//
// Bridges the v36 search_index + search_index_fts pair (Sprint 2.3.1)
// into the production picker. Phase 2.3 originally planned this wiring
// but it never landed; add.tsx still only queried foods + dishes, so
// 「マクドナルド」「スターバックス」「牛丼」「吉野家」 等の chain queries
// returned 0 hits despite 5406 restaurant_menu rows being present in
// the seed snapshot.
//
// Why only source_type='restaurant_menu' here:
//   - search_index also carries source_type='food' rows (2538 of them),
//     but those mirror foods table content that foodRepository.searchFoods
//     already returns. Surfacing both paths would duplicate every food
//     hit. The missing-from-UI piece is strictly restaurant_menu, so the
//     repository scope is bounded to that — Drafting 161 production
//     safety (minimal surface change to fix one symptom).
//   - dishes table is independent (its own dishRepository.searchDishes).
//     search_index doesn't carry dish rows; no overlap concern.
//
// FTS5 query safety:
//   - User input may contain FTS5 syntactic operators (`*`, `+`, `-`,
//     `^`, `"`, parens, AND/OR/NOT/NEAR keywords). Treating it raw
//     would cause syntax errors or unintended operator semantics.
//   - Strategy: split user input on whitespace, double-quote-escape
//     each token's internal `"`, wrap each token in `"..."` so FTS5
//     parses it as a phrase literal, then join tokens with a space.
//     FTS5's default is implicit AND across phrase literals, so
//     「吉野家 牛丼」 → `"吉野家" "牛丼"` finds rows where 「吉野家」
//     appears in one indexed column (brand) AND 「牛丼」 appears in
//     another (name_ja / aliases_concat). Single-term queries still
//     work — `"マクドナルド"` matches the brand column directly.
//     With unicode61 tokenizer on CJK text, each character is its
//     own token, so a phrase 「マクドナルド」 matches the
//     consecutive-character sequence across all indexed columns.
//
// Ranking:
//   - bm25(search_index_fts) ASC for relevance (lower = better match).
//   - is_common DESC as a tiebreaker so canonical menu names beat
//     obscure regional variants when bm25 ties.
//
// Adapter (SearchIndexRow → Food):
//   - source_id like "mcdonalds_0001" is NOT a foods.id UUID. Setting
//     Food.id = '' marks the row as a candidate (handleServingConfirm
//     in add.tsx already branches on `!food.id` to skip the foodId FK
//     and log foodName + nutrition directly). This is the same code
//     path OCR / Vision candidates use, so no schema change required.
//   - nutrition_json carries the disclosed fields (kcal/P/F/C + the
//     chain-specific subset of fiber/sugar/salt/sodium/sat_fat/
//     cholesterol). Missing fields → null on the Food, which the
//     detail modal renders as 「—」 per Drafting 152.

interface SearchIndexRow {
  source_id: string;
  name_ja: string;
  name_en: string | null;
  brand: string | null;
  is_common: number;
  nutrition_json: string;
}

interface NutritionJson {
  servingSizeG?: number;
  servingUnit?: string;
  caloriesPerServing?: number;
  proteinG?: number;
  fatG?: number;
  carbG?: number;
  fiberG?: number;
  sugarG?: number;
  saltG?: number;
  sodiumMg?: number;
  saturatedFatG?: number;
  cholesterolMg?: number;
}

function escapeFts5Phrase(raw: string): string {
  // Doubling embedded `"` is the FTS5 quote-escape rule. Wrapping the
  // result in `"..."` makes the input a phrase literal — every other
  // operator (`*`, `+`, `-`, NEAR, AND/OR/NOT) is then treated as
  // ordinary content rather than syntax.
  return `"${raw.replace(/"/g, '""')}"`;
}

function buildFts5Query(raw: string): string {
  // Whitespace-split so a query like 「吉野家 牛丼」 becomes two
  // independent phrase literals joined by FTS5's implicit AND. This
  // lets brand (in one indexed column) and menu term (in another)
  // both contribute to a match. Empty tokens are filtered so a
  // trailing space doesn't produce `... ""` which FTS5 rejects.
  return raw
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map(escapeFts5Phrase)
    .join(' ');
}

function rowToFood(row: SearchIndexRow): Food {
  let parsed: NutritionJson = {};
  try {
    parsed = JSON.parse(row.nutrition_json) as NutritionJson;
  } catch {
    // Malformed payload — fall back to zeros so the UI still renders
    // a name + brand badge instead of crashing the FlatList.
  }
  return {
    id: '',
    nameJa: row.name_ja,
    nameEn: row.name_en,
    brand: row.brand,
    barcode: null,
    servingSizeG: parsed.servingSizeG ?? 100,
    servingUnit: parsed.servingUnit ?? 'g',
    caloriesPerServing: parsed.caloriesPerServing ?? 0,
    proteinG: parsed.proteinG ?? 0,
    fatG: parsed.fatG ?? 0,
    carbG: parsed.carbG ?? 0,
    fiberG: parsed.fiberG ?? null,
    sodiumMg: parsed.sodiumMg ?? null,
    calciumMg: null,
    ironMg: null,
    vitaminAUg: null,
    vitaminB1Mg: null,
    vitaminB2Mg: null,
    vitaminB6Mg: null,
    vitaminB12Ug: null,
    folateUg: null,
    vitaminCMg: null,
    vitaminDUg: null,
    vitaminEMg: null,
    potassiumMg: null,
    magnesiumMg: null,
    zincMg: null,
    cholesterolMg: parsed.cholesterolMg ?? null,
    saturatedFatG: parsed.saturatedFatG ?? null,
    sugarG: parsed.sugarG ?? null,
    saltG: parsed.saltG ?? null,
    source: 'manual_seed',
    externalId: row.source_id,
    isCustom: false,
    isFavorite: false,
    isUserAdded: false,
    verified: true,
    addedAt: null,
    useCount: 0,
    createdAt: '',
    updatedAt: '',
  };
}

export async function searchSearchIndex(
  query: string,
  limit: number = 30,
): Promise<Food[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  try {
    const db = await getDatabase();
    const ftsQuery = buildFts5Query(trimmed);
    if (!ftsQuery) return [];
    const rows = await db.getAllAsync<SearchIndexRow>(
      `SELECT si.source_id, si.name_ja, si.name_en, si.brand,
              si.is_common, si.nutrition_json
       FROM search_index_fts fts
       JOIN search_index si ON si.rowid = fts.rowid
       WHERE search_index_fts MATCH ?
         AND si.source_type = 'restaurant_menu'
       ORDER BY bm25(search_index_fts) ASC, si.is_common DESC
       LIMIT ?`,
      [ftsQuery, limit],
    );
    return rows.map(rowToFood);
  } catch {
    // search_index_fts may not exist yet on a fresh install whose
    // migration chain hasn't reached v36 (extremely rare — connection.ts
    // runs v1→v38 unconditionally before this repo is ever called).
    // Swallowing keeps the picker functional with foods + dishes only.
    return [];
  }
}
