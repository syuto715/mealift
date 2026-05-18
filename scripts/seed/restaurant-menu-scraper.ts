// v1.5 Stage 2 Phase 2.2a — restaurant menu scraper (generic adapter).
//
// Architectural SSoT:
//   - docs/plans/v1.5_stage_2_restaurant_menu_db_epic.md §4.1
//     (data acquisition pipeline)
//   - §4.2 (`scripts/seed-restaurant-menu/data/${chain_slug}.json`
//     output shape — this file emits to `scripts/seed/data/` per
//     the kickoff prompt; same convention)
//   - §5.3 (restaurant_type enum drives parser dispatch)
//
// Design: separate FETCH from PARSE so jest can exercise the
// parser without hitting the network. Phase 2.2b iteration may
// either (a) let the script fetch via Node fetch when the page
// is plain HTML/JSON, or (b) have Claude Code's web_fetch tool
// pre-fetch the page, write the raw bytes to disk, and pass the
// content to `parseScrapedContent` directly.

import * as fs from 'fs';
import * as path from 'path';
import type {
  MenuItemRecord,
  MenuItemSource,
  RestaurantScrapeInput,
  RestaurantScrapeOutput,
  RestaurantType,
  ScrapeFailure,
  ScrapeResult,
} from './types';

// ---------------------------------------------------------------------------
// PFC sanity bands — matches the CHECK constraints on
// restaurant_menu_items (epic §5.1). A scrape value outside these
// bands is flagged as a parse error (likely a unit confusion —
// mg → g typo or per-100g pasted into per-serving).
// ---------------------------------------------------------------------------

const MAX_CALORIES = 3000;
const MAX_PROTEIN_G = 200;
const MAX_FAT_G = 300;
const MAX_CARB_G = 500;

// Atwater PFC↔calories deviation tolerance — matches food-import
// validator. Real labels routinely drift 5-10% from Atwater; we
// flag at > 15%.
const PFC_TOLERANCE = 0.15;

// ---------------------------------------------------------------------------
// Content-type detection. Trade-off vs. checking the Content-Type
// header: the script may be called with `content` already loaded
// from disk (no header), so we sniff the leading bytes instead.
// ---------------------------------------------------------------------------

export type ContentKind = 'html' | 'json' | 'pdf' | 'unknown';

export function detectContentKind(content: string): ContentKind {
  const head = content.slice(0, 256).trim();
  if (head.startsWith('<!DOCTYPE') || head.startsWith('<html') || head.startsWith('<HTML')
      || head.startsWith('<?xml')) {
    return 'html';
  }
  if (head.startsWith('%PDF')) return 'pdf';
  if (head.startsWith('{') || head.startsWith('[')) {
    try {
      JSON.parse(content);
      return 'json';
    } catch {
      return 'unknown';
    }
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Parsers. Each parser is a "best-effort" extractor — given the
// raw page bytes and the chain meta, return the menu items it
// could parse. Out-of-band failures (parse_no_rows /
// parse_partial) are signalled via `failedNames`.
// ---------------------------------------------------------------------------

export interface ParseStepResult {
  items: MenuItemRecord[];
  failedNames: string[];
  warnings: string[];
}

// JSON parser — assumes the page (or a pre-extracted file) is
// a JSON array of menu rows. Most chain disclosure pages aren't
// JSON natively, but Phase 2.2b iteration may have Claude Code
// extract the relevant rows into a JSON file before invoking
// the build step.
//
// Accepted shapes:
//   - top-level array of { menuName/name, calories/kcal, ... }
//   - top-level object with an `items` array of the same shape
//
// Numeric fields accept both `caloriesPerServing` (canonical
// camelCase) and source-style `calories` / `kcal`.
export function parseJsonContent(
  content: string,
  input: RestaurantScrapeInput,
  capturedAt: string,
): ParseStepResult {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    return {
      items: [],
      failedNames: [],
      warnings: [`JSON parse failed: ${(e as Error).message}`],
    };
  }
  const rows: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { items?: unknown[] })?.items)
      ? (raw as { items: unknown[] }).items
      : [];
  const items: MenuItemRecord[] = [];
  const failedNames: string[] = [];
  const warnings: string[] = [];

  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const obj = r as Record<string, unknown>;
    const name = (obj.menuName as string) ?? (obj.name as string) ?? '';
    if (!name.trim()) {
      failedNames.push('(unnamed row)');
      continue;
    }
    const item = toMenuItemRecord(obj, name, input, capturedAt);
    if (item) {
      items.push(item);
    } else {
      failedNames.push(name);
    }
  }
  return { items, failedNames, warnings };
}

function toMenuItemRecord(
  obj: Record<string, unknown>,
  name: string,
  input: RestaurantScrapeInput,
  capturedAt: string,
): MenuItemRecord | null {
  const calories = num(obj.caloriesPerServing ?? obj.calories ?? obj.kcal);
  const protein = num(obj.proteinG ?? obj.protein);
  const fat = num(obj.fatG ?? obj.fat);
  const carb = num(obj.carbG ?? obj.carbs ?? obj.carb ?? obj.carbohydrate);
  if (calories == null || protein == null || fat == null || carb == null) return null;

  const servingG = num(obj.servingSizeG ?? obj.servingG ?? obj.serving_g) ?? 100;
  const servingUnit =
    (obj.servingUnit as string) ?? (obj.serving_unit as string) ?? 'g';
  const servingDescription =
    (obj.servingDescription as string) ?? (obj.serving_description as string);

  const source: MenuItemSource =
    input.restaurantType === 'convenience'
      && (obj.barcode != null || obj.jan != null)
      ? 'package_label'
      : 'official_disclosure';

  const barcode = (obj.barcode as string) ?? (obj.jan as string) ?? undefined;

  return {
    name: name.trim(),
    aliases: Array.isArray(obj.aliases) ? (obj.aliases as string[]) : undefined,
    category: (obj.category as string) ?? undefined,
    servingSizeG: servingG,
    servingUnit,
    servingDescription: servingDescription ?? undefined,
    caloriesPerServing: calories,
    proteinG: protein,
    fatG: fat,
    carbG: carb,
    fiberG: num(obj.fiberG ?? obj.fiber) ?? undefined,
    sugarG: num(obj.sugarG ?? obj.sugar) ?? undefined,
    saltG: num(obj.saltG ?? obj.salt) ?? undefined,
    sodiumMg: num(obj.sodiumMg ?? obj.sodium) ?? undefined,
    saturatedFatG: num(obj.saturatedFatG ?? obj.saturated_fat) ?? undefined,
    cholesterolMg: num(obj.cholesterolMg ?? obj.cholesterol) ?? undefined,
    barcode: barcode?.trim() || undefined,
    ingredientDecompositionJson: obj.ingredientDecompositionJson,
    source,
    sourceUrl: input.url,
    sourceCapturedAt: capturedAt,
  };
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// HTML parser — extracts simple table rows. Real chain pages
// vary wildly in structure; the parser handles the common case
// (a <table> with a header row + per-menu body rows). Anything
// more exotic returns 'parse_partial' and Syuto handles the
// remainder manually.
//
// The parser is intentionally conservative: it expects column
// headers to contain Japanese substrings ('メニュー' / 'カロリー'
// / 'たんぱく' etc.), maps them to MenuItemRecord fields, and
// emits what it can. Unknown headers are dropped silently
// (recorded in warnings).
export function parseHtmlContent(
  content: string,
  input: RestaurantScrapeInput,
  capturedAt: string,
): ParseStepResult {
  const items: MenuItemRecord[] = [];
  const failedNames: string[] = [];
  const warnings: string[] = [];

  // Naive table extraction — find <table>...</table> blocks and
  // read <tr>/<td> contents. The implementation deliberately
  // avoids a full DOM parser (cheerio etc.) to keep the script
  // dependency-free.
  const tableMatches = content.match(/<table\b[\s\S]*?<\/table>/gi) ?? [];
  if (tableMatches.length === 0) {
    warnings.push('no <table> found in content');
    return { items, failedNames, warnings };
  }

  for (const table of tableMatches) {
    const rows = table.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
    if (rows.length < 2) continue; // need at least header + 1 body
    const header = extractCells(rows[0]);
    const columnMap = mapHeaderColumns(header);
    if (columnMap.name == null) continue; // no menu name column

    for (const tr of rows.slice(1)) {
      const cells = extractCells(tr);
      if (cells.length === 0) continue;
      const rawName = cells[columnMap.name] ?? '';
      const name = rawName.trim();
      if (!name) {
        failedNames.push('(unnamed row)');
        continue;
      }
      const calories = numFromCell(cells, columnMap.calories);
      const protein = numFromCell(cells, columnMap.protein);
      const fat = numFromCell(cells, columnMap.fat);
      const carb = numFromCell(cells, columnMap.carb);
      if (calories == null || protein == null || fat == null || carb == null) {
        failedNames.push(name);
        continue;
      }
      items.push({
        name,
        servingSizeG: numFromCell(cells, columnMap.serving) ?? 100,
        servingUnit: 'g',
        caloriesPerServing: calories,
        proteinG: protein,
        fatG: fat,
        carbG: carb,
        fiberG: numFromCell(cells, columnMap.fiber) ?? undefined,
        sodiumMg: numFromCell(cells, columnMap.sodium) ?? undefined,
        saltG: numFromCell(cells, columnMap.salt) ?? undefined,
        source: 'official_disclosure',
        sourceUrl: input.url,
        sourceCapturedAt: capturedAt,
      });
    }
  }
  return { items, failedNames, warnings };
}

function extractCells(rowHtml: string): string[] {
  const cells = rowHtml.match(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi) ?? [];
  return cells.map((c) =>
    c
      .replace(/<(?:td|th)\b[^>]*>/i, '')
      .replace(/<\/(?:td|th)>/i, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .trim(),
  );
}

interface HeaderColumnMap {
  name: number | null;
  serving: number | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carb: number | null;
  fiber: number | null;
  sodium: number | null;
  salt: number | null;
}

function mapHeaderColumns(header: string[]): HeaderColumnMap {
  const map: HeaderColumnMap = {
    name: null, serving: null, calories: null, protein: null, fat: null,
    carb: null, fiber: null, sodium: null, salt: null,
  };
  header.forEach((cell, idx) => {
    const c = cell.replace(/\s+/g, '');
    if (/メニュー|商品名|name/i.test(c) && map.name == null) map.name = idx;
    else if (/サイズ|内容量|serving|分量/i.test(c) && map.serving == null) map.serving = idx;
    else if (/エネルギー|カロリー|kcal/i.test(c) && map.calories == null) map.calories = idx;
    else if (/たんぱく|タンパク|蛋白|protein/i.test(c) && map.protein == null) map.protein = idx;
    else if (/脂質|fat/i.test(c) && map.fat == null) map.fat = idx;
    else if (/炭水化物|糖質|carb/i.test(c) && map.carb == null) map.carb = idx;
    else if (/食物繊維|fiber/i.test(c) && map.fiber == null) map.fiber = idx;
    else if (/ナトリウム|sodium/i.test(c) && map.sodium == null) map.sodium = idx;
    else if (/食塩|塩分|salt/i.test(c) && map.salt == null) map.salt = idx;
  });
  return map;
}

function numFromCell(cells: string[], idx: number | null): number | null {
  if (idx == null) return null;
  return num(cells[idx]);
}

// ---------------------------------------------------------------------------
// Validation — applied AFTER parsing. Rows that fail validation
// are stripped from the items list and pushed to suspectItems on
// the failure record. PFC band + Atwater consistency are the two
// checks.
// ---------------------------------------------------------------------------

export interface ValidatedItem {
  item: MenuItemRecord;
  issues: string[];
}

export function validateMenuItem(item: MenuItemRecord): string[] {
  const issues: string[] = [];
  if (item.caloriesPerServing < 0 || item.caloriesPerServing >= MAX_CALORIES) {
    issues.push(
      `calories=${item.caloriesPerServing} out of band [0,${MAX_CALORIES})`,
    );
  }
  if (item.proteinG < 0 || item.proteinG >= MAX_PROTEIN_G) {
    issues.push(`protein=${item.proteinG} out of band [0,${MAX_PROTEIN_G})`);
  }
  if (item.fatG < 0 || item.fatG >= MAX_FAT_G) {
    issues.push(`fat=${item.fatG} out of band [0,${MAX_FAT_G})`);
  }
  if (item.carbG < 0 || item.carbG >= MAX_CARB_G) {
    issues.push(`carb=${item.carbG} out of band [0,${MAX_CARB_G})`);
  }
  // Atwater PFC consistency — skip when calories is zero (water,
  // tea — won't hit calories=0 in restaurant menus generally,
  // but parry div-by-zero).
  if (item.caloriesPerServing > 0) {
    const computed = item.proteinG * 4 + item.carbG * 4 + item.fatG * 9;
    const deviation =
      Math.abs(item.caloriesPerServing - computed) / item.caloriesPerServing;
    if (deviation > PFC_TOLERANCE) {
      issues.push(
        `PFC inconsistent: calories=${item.caloriesPerServing} vs Atwater=${computed.toFixed(1)} (deviation ${(deviation * 100).toFixed(1)}%)`,
      );
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Top-level orchestrator. The fetcher is pluggable so tests can
// inject pre-loaded content; production Phase 2.2b passes the
// node-fetch implementation OR pre-loads content via Claude Code's
// web_fetch tool.
// ---------------------------------------------------------------------------

export type Fetcher = (url: string) => Promise<{ content: string; statusCode: number }>;

export interface ScraperOptions {
  fetcher: Fetcher;
  // YYYY-MM-DD, stamped on every menu item + the failure record.
  // Tests pass a fixed value; production reads from `new Date()`.
  capturedAt: string;
}

export async function scrapeRestaurantMenu(
  input: RestaurantScrapeInput,
  opts: ScraperOptions,
): Promise<ScrapeResult> {
  let content: string;
  try {
    const { content: c, statusCode } = await opts.fetcher(input.url);
    if (statusCode >= 400) {
      return failure(input, 'fetch_failed', `HTTP ${statusCode}`, opts.capturedAt);
    }
    content = c;
  } catch (e) {
    return failure(input, 'fetch_failed', (e as Error).message, opts.capturedAt);
  }

  const kind = detectContentKind(content);
  if (kind === 'pdf' || kind === 'unknown') {
    return failure(
      input,
      kind === 'pdf' ? 'content_type_unknown' : 'content_type_unknown',
      `content kind is ${kind} (PDF / unknown — manual entry path)`,
      opts.capturedAt,
      true,
    );
  }
  const parsed = kind === 'json'
    ? parseJsonContent(content, input, opts.capturedAt)
    : parseHtmlContent(content, input, opts.capturedAt);

  // Validate every parsed item; drop ones that fail.
  const validatedItems: MenuItemRecord[] = [];
  const validationFailedNames: string[] = [...parsed.failedNames];
  for (const item of parsed.items) {
    const issues = validateMenuItem(item);
    if (issues.length === 0) {
      validatedItems.push(item);
    } else {
      validationFailedNames.push(`${item.name} [${issues.join(' / ')}]`);
    }
  }

  if (validatedItems.length === 0) {
    return failure(
      input,
      'parse_no_rows',
      `parser extracted 0 valid rows (${validationFailedNames.length} failed)`,
      opts.capturedAt,
      true,
      [],
      validationFailedNames,
    );
  }
  // Partial success — Codex round 1 Important fix (Drafting 103
  // observability leak): when some rows fail parse / validate but
  // others land, the output must surface the dropped names so the
  // Phase 2.2b iteration can write them into the spot-check
  // markdown. Earlier draft returned plain `kind: 'success'` with
  // no signal that drops happened.
  if (validationFailedNames.length > 0) {
    const output = buildOutput(input, validatedItems, opts.capturedAt, {
      partial: true,
      droppedItems: validationFailedNames,
    });
    return { kind: 'success', output };
  }
  return {
    kind: 'success',
    output: buildOutput(input, validatedItems, opts.capturedAt),
  };
}

function buildOutput(
  input: RestaurantScrapeInput,
  items: MenuItemRecord[],
  capturedAt: string,
  partialInfo?: { partial: true; droppedItems: string[] },
): RestaurantScrapeOutput {
  return {
    chainSlug: input.chainSlug,
    chainName: input.chainName,
    restaurantType: input.restaurantType,
    category: input.category,
    aliases: input.aliases ?? [],
    attribution: input.attribution ?? '公式サイトより',
    attributionUrl: input.url,
    sourceCapturedAt: capturedAt,
    menuItems: items,
    ...(partialInfo ?? {}),
  };
}

function failure(
  input: RestaurantScrapeInput,
  errorKind: ScrapeFailure['errorKind'],
  message: string,
  capturedAt: string,
  manualEntryRequired: boolean = false,
  partialItems?: MenuItemRecord[],
  suspectItems?: string[],
): ScrapeResult {
  return {
    kind: 'failure',
    failure: {
      chainSlug: input.chainSlug,
      chainName: input.chainName,
      url: input.url,
      errorKind,
      message,
      manualEntryRequired,
      partialItems,
      suspectItems,
      capturedAt,
    },
  };
}

// ---------------------------------------------------------------------------
// I/O helpers — write success / failure to the appropriate
// directories. Phase 2.2b iteration calls these after each
// scrape.
// ---------------------------------------------------------------------------

export function writeScrapeOutput(
  output: RestaurantScrapeOutput,
  outDir: string,
): string {
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${output.chainSlug}.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  return outPath;
}

export function writeScrapeFailure(
  failureRecord: ScrapeFailure,
  outDir: string,
): string {
  const failedDir = path.join(outDir, '_failed');
  fs.mkdirSync(failedDir, { recursive: true });
  const outPath = path.join(failedDir, `${failureRecord.chainSlug}.md`);
  const lines: string[] = [];
  lines.push(`# Scrape failure: ${failureRecord.chainName} (${failureRecord.chainSlug})`);
  lines.push('');
  lines.push(`- URL: ${failureRecord.url}`);
  lines.push(`- Error kind: \`${failureRecord.errorKind}\``);
  lines.push(`- Message: ${failureRecord.message}`);
  lines.push(`- Manual entry required: ${failureRecord.manualEntryRequired ? 'YES' : 'no'}`);
  lines.push(`- Captured at: ${failureRecord.capturedAt}`);
  if (failureRecord.suspectItems && failureRecord.suspectItems.length > 0) {
    lines.push('');
    lines.push('## Suspect items');
    for (const s of failureRecord.suspectItems) lines.push(`- ${s}`);
  }
  if (failureRecord.partialItems && failureRecord.partialItems.length > 0) {
    lines.push('');
    lines.push(`## Partial parse — ${failureRecord.partialItems.length} items extracted`);
    lines.push('');
    lines.push('| name | kcal | P | F | C |');
    lines.push('|---|---|---|---|---|');
    for (const m of failureRecord.partialItems) {
      lines.push(
        `| ${m.name} | ${m.caloriesPerServing} | ${m.proteinG} | ${m.fatG} | ${m.carbG} |`,
      );
    }
  }
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf-8');
  return outPath;
}

// Default fetcher uses global fetch (Node 18+). Phase 2.2b
// production runs Node 20+, so this is safe; the test path
// injects an in-memory fetcher.
export const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url);
  const content = await res.text();
  return { content, statusCode: res.status };
};

// Restaurant type guard used by the build step.
export function isRestaurantType(v: string): v is RestaurantType {
  return (
    v === 'dining'
    || v === 'convenience'
    || v === 'cafe_bakery'
    || v === 'combo_meal'
  );
}
