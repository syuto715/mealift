// v1.5 Stage 2 Phase 2.2b Sprint 6.5 — tullys (タリーズ) drink.pdf parser.
//
// drink.pdf schema (7 pages, ~31KB text) — fundamentally different from
// food.pdf:
//   - Each data row carries 18 trailing tokens (numeric or ー / －):
//       6 nutrition fields × 3 sizes (Short / Tall / Grande)
//   - Field order verified against the disclosed PDF header at
//     line 165 ("S T G ..." repeated 6×):
//       kcal(S T G) | protein(S T G) | fat(S T G) | carb(S T G)
//       | salt(S T G) | caffeine(S T G)
//   - Row prefix: optional HOT / ICED marker, then 28 allergen marks
//     (●/△/ー/－). Rows without HOT/ICED denote the "no temperature
//     marker" variant (often milk-type-specific in the original sheet).
//   - 1 logical drink may appear in 1-4 data rows in the sheet (HOT/ICED
//     × milk type variants), and Codex MCP round 1 pairs every row with
//     its visual-PDF JA name — so duplicate names by-design map to the
//     row variants and the parser disambiguates via temperature prefix
//     plus a per-(name, temp, size) sequence suffix.
//
// Per-page JA menu names live in scripts/seed/parsers/menu_names/
// tullys_drink.ts as TULLYS_DRINK_PER_PAGE_MENU_NAMES — Codex MCP
// round 1 visual-order curation (Sprint 6.5, 2026-05-19).

import * as fs from 'fs';
import * as path from 'path';
import { TULLYS_DRINK_PER_PAGE_MENU_NAMES } from './menu_names/tullys_drink';
import type { MenuItemRecord, RestaurantScrapeOutput } from '../types';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const SIZES = ['Short', 'Tall', 'Grande'] as const;
type Size = typeof SIZES[number];

// All the dash glyphs pdf-parse hands us where the PDF cell is blank or
// "not applicable for this size". Includes katakana long mark (ー), unicode
// minus (−), en/em dash (–/—), horizontal bar (―), and fullwidth hyphen (－).
const NO_DATA_TOKENS = new Set(['ー', '−', '–', '—', '―', '－']);

interface DrinkRow {
  name: string;
  tempPrefix: 'HOT' | 'ICED' | '';
  // 6 triplets × 3 sizes
  kcal: Array<number | null>;
  protein: Array<number | null>;
  fat: Array<number | null>;
  carb: Array<number | null>;
  salt: Array<number | null>;
  caffeine: Array<number | null>;
}

function parseTriplet(tokens: string[]): Array<number | null> {
  return tokens.map((t) => {
    if (NO_DATA_TOKENS.has(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  });
}

export function segmentByPage(text: string): string[] {
  const parts = text.split(/--\s*\d+\s+of\s+\d+\s*--/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

const NUM_OR_DASH_RE = /^([\d.]+|ー|−|–|—|―|－)$/;

// Count how many of the row's trailing tokens are numeric/dash. We accept
// rows whose trailing run is either 18 (5 nutrition triplets + caffeine
// triplet) or 15 (5 nutrition triplets only — espresso rows lack caffeine).
export function trailingNumericRun(tokens: string[]): number {
  let n = 0;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (NUM_OR_DASH_RE.test(tokens[i])) n += 1;
    else break;
  }
  return n;
}

export function extractDrinkRowsFromPage(
  pageText: string,
  codexNames: string[],
): DrinkRow[] {
  const rows: DrinkRow[] = [];
  const lines = pageText.split(/\r?\n/);
  let nameIdx = 0;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/\s+/);
    const run = trailingNumericRun(tokens);
    if (run < 15) continue;

    // Schema variance handling (Sprint 6.5 reconnaissance):
    //   - Page 2 espresso rows: 15-cell (no caffeine column).
    //   - Page 1 seasonal rows: 17-cell (caffeine present but Grande
    //     value dropped by pdf-parse — pad right with one ー).
    //   - Other pages: 18-cell (full).
    //   - When run > 18, the leading dashes are allergen marks that
    //     bled into the trailing run; we prefer the smaller tailLen
    //     if the wider one yields an all-null kcal triplet.
    const tryParse = (len: number, padRight = 0): Array<Array<number | null>> | null => {
      const slice = padRight > 0
        ? [...tokens.slice(-(len - padRight)), ...Array(padRight).fill('ー')]
        : tokens.slice(-len);
      if (slice.length !== len) return null;
      const cells: Array<Array<number | null>> = [];
      for (let i = 0; i < 6; i += 1) {
        if (i * 3 + 3 <= len) cells.push(parseTriplet(slice.slice(i * 3, i * 3 + 3)));
        else cells.push([null, null, null]);
      }
      if (cells[0].every((v) => v == null)) return null;
      return cells;
    };

    let triplets: Array<Array<number | null>> | null = null;
    if (run === 17) triplets = tryParse(18, 1);
    if (triplets == null && run >= 18) triplets = tryParse(18);
    if (triplets == null && run >= 15) triplets = tryParse(15);
    if (triplets == null) continue;
    const tailLen = triplets[5].every((v) => v == null) ? 15 : 18;

    // Temperature prefix is the FIRST token when it's HOT or ICED. Some rows
    // have no temperature marker — that's a legitimate "neutral" variant.
    const head = tokens.length > tailLen ? tokens[0] : '';
    const tempPrefix: 'HOT' | 'ICED' | '' =
      head === 'HOT' ? 'HOT' : head === 'ICED' ? 'ICED' : '';

    const name = codexNames[nameIdx];
    nameIdx += 1;
    if (!name) continue; // ran past curated names — skip silently

    rows.push({
      name,
      tempPrefix,
      kcal: triplets[0],
      protein: triplets[1],
      fat: triplets[2],
      carb: triplets[3],
      salt: triplets[4],
      caffeine: triplets[5],
    });
  }
  return rows;
}

export interface TullysDrinkParseOptions {
  rawTextPath: string;
  sourceUrl: string;
  sourceCapturedAt: string;
}

export function rowsToItems(
  rows: DrinkRow[],
  opts: { sourceUrl: string; sourceCapturedAt: string },
): MenuItemRecord[] {
  const out: MenuItemRecord[] = [];
  const seenCounts = new Map<string, number>();
  for (const row of rows) {
    for (let s = 0; s < SIZES.length; s += 1) {
      const size: Size = SIZES[s];
      const kcal = row.kcal[s];
      if (kcal == null) continue;
      const protein = row.protein[s];
      const fat = row.fat[s];
      const carb = row.carb[s];
      const salt = row.salt[s];
      const caffeine = row.caffeine[s];
      if (protein == null || fat == null || carb == null || salt == null) continue;

      const tempPart = row.tempPrefix ? `${row.tempPrefix} ` : '';
      const baseName = `${row.name} ${tempPart}${size}`.trim().replace(/\s+/g, ' ');

      const seen = seenCounts.get(baseName) ?? 0;
      seenCounts.set(baseName, seen + 1);
      const finalName = seen === 0 ? baseName : `${baseName} (${seen + 1})`;

      out.push({
        name: finalName,
        category: 'ドリンク',
        servingSizeG: 100,
        servingUnit: '杯',
        servingDescription: size,
        caloriesPerServing: kcal,
        proteinG: protein,
        fatG: fat,
        carbG: carb,
        saltG: salt,
        source: 'official_disclosure',
        sourceUrl: opts.sourceUrl,
        sourceCapturedAt: opts.sourceCapturedAt,
      });
      // caffeine is currently dropped — MenuItemRecord has no caffeineMg
      // field. Captured here for v1.6+ schema expansion if desired.
      void caffeine;
    }
  }
  return out;
}

export function parseTullysDrink(opts: TullysDrinkParseOptions): MenuItemRecord[] {
  const text = fs.readFileSync(opts.rawTextPath, 'utf-8');
  const pages = segmentByPage(text);
  const allItems: MenuItemRecord[] = [];
  const diagnostics: string[] = [];
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx += 1) {
    const names = TULLYS_DRINK_PER_PAGE_MENU_NAMES[pageIdx] ?? [];
    const rows = extractDrinkRowsFromPage(pages[pageIdx], names);
    const items = rowsToItems(rows, opts);
    allItems.push(...items);
    diagnostics.push(`p${pageIdx + 1}: ${rows.length}r → ${items.length}items`);
  }
  console.log(
    `[tullys_drink] ${pages.length} pages、 ${allItems.length} items (${diagnostics.join(' | ')})`,
  );
  return allItems;
}

async function main(): Promise<void> {
  const drinkItems = parseTullysDrink({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'tullys_drink.txt'),
    sourceUrl: 'https://www.tullys.co.jp/menu/pdf/drink.pdf',
    sourceCapturedAt: '2026-05-19',
  });

  // Merge with the existing food.pdf items (already official_disclosure).
  const existingPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'tullys.json');
  const existing = JSON.parse(fs.readFileSync(existingPath, 'utf-8')) as RestaurantScrapeOutput;
  const merged: RestaurantScrapeOutput = {
    ...existing,
    attribution: '公式 PDF (tullys.co.jp /menu/pdf/food.pdf + /menu/pdf/drink.pdf)',
    sourceCapturedAt: '2026-05-19',
    menuItems: [...existing.menuItems, ...drinkItems],
  };
  fs.writeFileSync(existingPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  console.log(
    `[tullys_drink] wrote ${merged.menuItems.length} items (food ${existing.menuItems.length} + drink ${drinkItems.length}) → ${path.relative(REPO_ROOT, existingPath)}`,
  );
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
