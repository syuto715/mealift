// v1.5 Stage 2 Phase 2.2a — seed migration builder.
//
// Architectural SSoT:
//   - docs/plans/v1.5_stage_2_restaurant_menu_db_epic.md §4.1
//     step 3 (bulk import via seed migration; ON CONFLICT DO
//     UPDATE — idempotent re-run)
//   - §4.2 (output path:
//     `supabase/migrations/20260520000003_restaurant_menu_seed.sql`)
//   - §5.1 (target table column shapes — restaurants +
//     restaurant_menu_items + restaurant_chain_categories)
//   - §5.3 (restaurant_type enum + 7-value category list)
//
// Idempotency: every INSERT uses ON CONFLICT DO UPDATE so the
// migration can be re-applied after a chain refresh. The unique
// keys are:
//   - restaurant_chain_categories: name (text)
//   - restaurants: name (text)
//   - restaurant_menu_items: (restaurant_id, name) — covered by
//     the existing UNIQUE constraint from Phase 2.1 DDL
//
// Note: restaurants / categories use deterministic UUIDs derived
// from a SHA-1 hash of the slug (RFC 4122 v5 style). This means
// the seed migration generates the SAME id across applies — the
// SQLite client mirror's `restaurants_local.id` (TEXT) matches
// the server's UUID without a translation layer.

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type {
  RestaurantCategory,
  RestaurantScrapeOutput,
  RestaurantType,
} from './types';

// ---------------------------------------------------------------------------
// Deterministic UUID-from-slug. We use a v5-style UUID (SHA-1 +
// namespace) without pulling in the `uuid` package — Phase 2.2a
// keeps the script dependency-free.
//
// NAMESPACE_UUID is a randomly-generated v4 chosen at Phase 2.2a
// landing and pinned forever — changing it invalidates every
// existing chain id. Treat it as a constant.
// ---------------------------------------------------------------------------

const NAMESPACE_RESTAURANT = '8e3f4b2a-1c5d-4e7f-9a0b-2d8c3f6e1b4a';
const NAMESPACE_CATEGORY   = '4b9d7c6e-3f2a-4d8e-9c5b-7a1f0e2d3c4b';

export function v5UuidFromSlug(namespace: string, slug: string): string {
  const ns = uuidToBytes(namespace);
  const hash = createHash('sha1');
  hash.update(ns);
  hash.update(slug, 'utf8');
  const digest = hash.digest();
  // Per RFC 4122 v5: take first 16 bytes, set version + variant.
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  return bytesToUuid(bytes);
}

function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) throw new Error(`invalid uuid: ${uuid}`);
  return Buffer.from(hex, 'hex');
}

function bytesToUuid(b: Buffer): string {
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function restaurantIdForSlug(chainSlug: string): string {
  return v5UuidFromSlug(NAMESPACE_RESTAURANT, chainSlug);
}

export function categoryIdForName(name: string): string {
  return v5UuidFromSlug(NAMESPACE_CATEGORY, name);
}

// ---------------------------------------------------------------------------
// SQL escaping.
// ---------------------------------------------------------------------------

export function sqlString(v: string | null | undefined): string {
  if (v == null) return 'null';
  return `'${v.replace(/'/g, "''")}'`;
}

export function sqlNumber(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'null';
  // Format with enough precision but no trailing zero noise.
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(2);
}

export function sqlBool(v: boolean): string {
  return v ? 'true' : 'false';
}

export function sqlTextArray(items: string[] | undefined): string {
  if (!items || items.length === 0) return `'{}'`;
  // Two-layer escape:
  //
  //   1. PostgreSQL ARRAY literal escaping: wrap each element in
  //      double-quotes so commas / spaces / Unicode survive
  //      parsing; escape internal backslashes (`\\`) and double
  //      quotes (`\"`).
  //   2. SQL string-literal escaping: the whole `{...}` payload
  //      is then wrapped in single quotes. Any embedded single
  //      quote (e.g. `McDonald's`) terminates the string literal
  //      and corrupts downstream SQL — Codex Phase 2.2a round 1
  //      Critical fix is to double single quotes after the array
  //      literal is assembled.
  const quoted = items.map(
    (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
  );
  const inner = `{${quoted.join(',')}}`;
  return `'${inner.replace(/'/g, "''")}'`;
}

export function sqlJsonb(v: unknown): string {
  if (v == null) return 'null';
  return `${sqlString(JSON.stringify(v))}::jsonb`;
}

// ---------------------------------------------------------------------------
// INSERT statement builders.
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: RestaurantCategory[] = [
  'FF', '牛丼', '寿司', 'ファミレス', 'カフェ', 'その他', 'コンビニ',
];

export function buildCategoryInserts(): string[] {
  const lines: string[] = [];
  CATEGORY_ORDER.forEach((name, idx) => {
    const id = categoryIdForName(name);
    lines.push(
      `INSERT INTO public.restaurant_chain_categories (id, name, display_order)
  VALUES (${sqlString(id)}::uuid, ${sqlString(name)}, ${idx})
  ON CONFLICT (id) DO UPDATE
    SET name = excluded.name,
        display_order = excluded.display_order;`,
    );
  });
  return lines;
}

export function buildRestaurantInsert(
  output: RestaurantScrapeOutput,
): string {
  const id = restaurantIdForSlug(output.chainSlug);
  const categoryId = categoryIdForName(output.category);
  return `INSERT INTO public.restaurants (
  id, name, aliases, restaurant_type, category_id,
  official_url, attribution, attribution_url, takedown_flag
)
VALUES (
  ${sqlString(id)}::uuid,
  ${sqlString(output.chainName)},
  ${sqlTextArray(output.aliases)},
  ${sqlString(output.restaurantType)},
  ${sqlString(categoryId)}::uuid,
  ${sqlString(output.attributionUrl)},
  ${sqlString(output.attribution)},
  ${sqlString(output.attributionUrl)},
  false
)
ON CONFLICT (id) DO UPDATE
  SET name = excluded.name,
      aliases = excluded.aliases,
      restaurant_type = excluded.restaurant_type,
      category_id = excluded.category_id,
      official_url = excluded.official_url,
      attribution = excluded.attribution,
      attribution_url = excluded.attribution_url;`;
}

export function buildMenuItemInsert(
  output: RestaurantScrapeOutput,
  itemIndex: number,
): string {
  const item = output.menuItems[itemIndex];
  const restaurantId = restaurantIdForSlug(output.chainSlug);
  const menuId = v5UuidFromSlug(
    NAMESPACE_RESTAURANT,
    `${output.chainSlug}::${itemIndex}::${item.name}`,
  );
  return `INSERT INTO public.restaurant_menu_items (
  id, restaurant_id, name, aliases, category,
  serving_size_g, serving_unit, serving_description,
  calories_per_serving, protein_g, fat_g, carb_g,
  fiber_g, sugar_g, salt_g, sodium_mg, saturated_fat_g, cholesterol_mg,
  barcode, ingredient_decomposition_json,
  source, source_url, source_captured_at,
  version, use_count, takedown_flag
)
VALUES (
  ${sqlString(menuId)}::uuid,
  ${sqlString(restaurantId)}::uuid,
  ${sqlString(item.name)},
  ${sqlTextArray(item.aliases)},
  ${sqlString(item.category ?? null)},
  ${sqlNumber(item.servingSizeG)},
  ${sqlString(item.servingUnit)},
  ${sqlString(item.servingDescription ?? null)},
  ${sqlNumber(item.caloriesPerServing)},
  ${sqlNumber(item.proteinG)},
  ${sqlNumber(item.fatG)},
  ${sqlNumber(item.carbG)},
  ${sqlNumber(item.fiberG ?? null)},
  ${sqlNumber(item.sugarG ?? null)},
  ${sqlNumber(item.saltG ?? null)},
  ${sqlNumber(item.sodiumMg ?? null)},
  ${sqlNumber(item.saturatedFatG ?? null)},
  ${sqlNumber(item.cholesterolMg ?? null)},
  ${sqlString(item.barcode ?? null)},
  ${sqlJsonb(item.ingredientDecompositionJson)},
  ${sqlString(item.source)},
  ${sqlString(item.sourceUrl)},
  ${sqlString(item.sourceCapturedAt)}::timestamptz,
  1,
  0,
  false
)
ON CONFLICT (restaurant_id, name) DO UPDATE
  SET aliases = excluded.aliases,
      category = excluded.category,
      serving_size_g = excluded.serving_size_g,
      serving_unit = excluded.serving_unit,
      serving_description = excluded.serving_description,
      calories_per_serving = excluded.calories_per_serving,
      protein_g = excluded.protein_g,
      fat_g = excluded.fat_g,
      carb_g = excluded.carb_g,
      fiber_g = excluded.fiber_g,
      sugar_g = excluded.sugar_g,
      salt_g = excluded.salt_g,
      sodium_mg = excluded.sodium_mg,
      saturated_fat_g = excluded.saturated_fat_g,
      cholesterol_mg = excluded.cholesterol_mg,
      barcode = excluded.barcode,
      ingredient_decomposition_json = excluded.ingredient_decomposition_json,
      source = excluded.source,
      source_url = excluded.source_url,
      source_captured_at = excluded.source_captured_at,
      version = public.restaurant_menu_items.version + 1;`;
}

// ---------------------------------------------------------------------------
// Top-level migration assembler.
// ---------------------------------------------------------------------------

export interface BuildOptions {
  // Migration filename — defaults to
  // `20260520000003_restaurant_menu_seed.sql` per §4.2.
  outputFilename?: string;
}

export function buildSeedMigrationSql(
  outputs: RestaurantScrapeOutput[],
  options: BuildOptions = {},
): string {
  const filename = options.outputFilename
    ?? '20260520000003_restaurant_menu_seed.sql';

  const itemCount = outputs.reduce((acc, o) => acc + o.menuItems.length, 0);
  const lines: string[] = [];
  lines.push(`-- v1.5 Stage 2 Phase 2.2 — restaurant + menu seed migration.`);
  lines.push(`-- Filename: ${filename}`);
  lines.push(`--`);
  lines.push(`-- Chain count: ${outputs.length}`);
  lines.push(`-- Menu item count: ${itemCount}`);
  lines.push(`--`);
  lines.push(`-- Architectural SSoT:`);
  lines.push(`--   - docs/plans/v1.5_stage_2_restaurant_menu_db_epic.md §4.1`);
  lines.push(`--     (data acquisition + bulk import — DEC-2)`);
  lines.push(`--   - §4.2 (this migration is the canonical landing site)`);
  lines.push(`--   - §5.1 (consumer tables: restaurant_chain_categories,`);
  lines.push(`--     restaurants, restaurant_menu_items)`);
  lines.push(`--`);
  lines.push(`-- Idempotency: every INSERT uses ON CONFLICT DO UPDATE so`);
  lines.push(`-- the migration is safe to re-apply after a chain refresh.`);
  lines.push(`-- restaurant ids + category ids are deterministic v5 UUIDs`);
  lines.push(`-- (SHA-1 + namespace) so the same slug yields the same id`);
  lines.push(`-- across builds.`);
  lines.push('');
  lines.push('BEGIN;');
  lines.push('');
  lines.push('-- =====================================================================');
  lines.push('-- Chain categories (7 fixed entries).');
  lines.push('-- =====================================================================');
  lines.push('');
  for (const stmt of buildCategoryInserts()) {
    lines.push(stmt);
    lines.push('');
  }
  // Group by chain so the SQL is readable.
  for (const output of outputs) {
    lines.push('-- =====================================================================');
    lines.push(`-- Chain: ${output.chainName} (${output.chainSlug}) — ${output.menuItems.length} items`);
    lines.push('-- =====================================================================');
    lines.push('');
    lines.push(buildRestaurantInsert(output));
    lines.push('');
    for (let i = 0; i < output.menuItems.length; i += 1) {
      lines.push(buildMenuItemInsert(output, i));
      lines.push('');
    }
  }
  lines.push('COMMIT;');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// I/O helpers — load scraped outputs from disk + write the
// resulting migration.
// ---------------------------------------------------------------------------

export function loadScrapeOutputs(dataDir: string): RestaurantScrapeOutput[] {
  const files = fs
    .readdirSync(dataDir)
    .filter((f) => f.endsWith('.json'))
    .sort(); // deterministic emit order
  const outputs: RestaurantScrapeOutput[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(dataDir, file), 'utf-8');
    outputs.push(JSON.parse(raw) as RestaurantScrapeOutput);
  }
  return outputs;
}

export function writeSeedMigration(
  sql: string,
  outDir: string,
  filename: string = '20260520000003_restaurant_menu_seed.sql',
): string {
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, filename);
  fs.writeFileSync(outPath, sql, 'utf-8');
  return outPath;
}
