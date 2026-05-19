// v1.5 Stage 2 Phase 2.2b — yoshinoya PDF parser.
//
// 吉野家 PDF schema (16 pages, ~46KB text):
//   Row: <size_label> <kcal> <protein> <fat> <carb> <salt> <28 allergen ○ marks>
//   - column order: (kcal) (protein) (fat) (carb) (salt) — Zensho-pattern
//   - numbers may carry comma thousands separator: "1,006"
//   - allergen suffix is variable-length tail (filtered after match)
//
// Size families (Codex MCP discovery):
//   - Family A (main sizes): 小盛 < 並盛 < 中盛 < アタマの大盛 < 大盛 < 特盛 < 超特盛
//   - Family B (sheets): 一枚盛 < 二枚盛 < 三枚盛
//   - Family C (people-counts): 三人前 < 四人前
//   - Family D (adjustments): ご飯増量 / 肉2倍盛 / 鰻2倍盛 — treated as singletons
//   - Family E (units): 1P / 1袋 / 1個 / 1皿 / 1パック / N本 / Ng / Nml / 1杯 — always singletons
//
// Group boundary: new group when (a) family changes, (b) size index ≤
// previous in same family, or (c) row is a Family D/E singleton.
//
// Menu names supplied by `parsers/menu_names/yoshinoya.ts` (Codex MCP
// auto-extraction); array length expected to match detected group count.

import * as fs from 'fs';
import * as path from 'path';
import { YOSHINOYA_MENU_NAMES } from './menu_names/yoshinoya';
import type { MenuItemRecord, RestaurantScrapeOutput } from '../types';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

interface YoshinoyaRow {
  size: string;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  salt: number;
  implicitSingleton?: boolean;
}

// Family A: main rice-bowl sizes (sukiya / nakau overlap + yoshinoya
// specific 超特盛 etc.).
const FAMILY_A: Record<string, number> = {
  '小盛': 0,
  '並盛': 1,
  '中盛': 2,
  'アタマの大盛': 3,
  '大盛': 4,
  '特盛': 5,
  '超特盛': 6,
};

// Family B: sheets-counted (うなぎ枚盛 etc.).
const FAMILY_B: Record<string, number> = {
  '一枚盛': 0,
  '二枚盛': 1,
  '三枚盛': 2,
};

// Family C: people-counts.
const FAMILY_C: Record<string, number> = {
  '三人前': 0,
  '四人前': 1,
};

// Family E: unit-prefixed singletons. Detected by regex; each row is
// its own group regardless of value.
const FAMILY_E_RE
  = /^(?:\d+(?:P|袋|個|皿|パック|本|g|ml|杯)|ご飯増量|肉2倍盛|鰻2倍盛|ミニ)$/;

const BARE_ROW_RE = new RegExp(
  '^'
  + String.raw`([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)`
  + String.raw`(?:\s+.*)?$`,
);

const SIZE_RE = new RegExp(
  '^(' + [
    ...Object.keys(FAMILY_A),
    ...Object.keys(FAMILY_B),
    ...Object.keys(FAMILY_C),
    'ミニ',
    'ご飯増量', '肉2倍盛', '鰻2倍盛',
    String.raw`\d+P`, String.raw`\d+袋`, String.raw`\d+個`, String.raw`\d+皿`,
    String.raw`\d+パック`, String.raw`\d+本`, String.raw`\d+g`,
    String.raw`\d+ml`, String.raw`\d+杯`,
  ].join('|') + ')'
  + String.raw`\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)(?:\s+.*)?$`,
);

type Family = 'A' | 'B' | 'C' | 'E';

function familyOf(size: string): Family | null {
  if (size in FAMILY_A) return 'A';
  if (size in FAMILY_B) return 'B';
  if (size in FAMILY_C) return 'C';
  if (FAMILY_E_RE.test(size)) return 'E';
  return null;
}

function indexInFamily(size: string, family: Family): number {
  if (family === 'A') return FAMILY_A[size];
  if (family === 'B') return FAMILY_B[size];
  if (family === 'C') return FAMILY_C[size];
  return -1; // E is singleton
}

function toNumber(s: string): number {
  return Number(s.replace(/,/g, ''));
}

function normalizeYoshinoyaText(text: string): string {
  const japaneseSection = text.split('-- 7 of 16 --')[0];
  return japaneseSection
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/ｇ/g, 'g')
    .replace(/㎖/g, 'ml')
    .replace(/ｍｌ/g, 'ml')
    .replace(/　/g, ' ');
}

export function extractYoshinoyaRows(text: string): YoshinoyaRow[] {
  const rows: YoshinoyaRow[] = [];
  const normalizedText = normalizeYoshinoyaText(text);
  for (const line of normalizedText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const explicit = trimmed.match(SIZE_RE);
    const bare = explicit ? null : trimmed.match(BARE_ROW_RE);
    if (!explicit && !bare) continue;

    const size = explicit?.[1] ?? '';
    const numericFields = explicit ? explicit.slice(2, 7) : bare!.slice(1, 6);
    const [calories, protein, fat, carb, salt] = numericFields.map(toNumber);
    if (![calories, protein, fat, carb, salt].every(Number.isFinite)) continue;
    rows.push({
      size,
      calories,
      protein,
      fat,
      carb,
      salt,
      implicitSingleton: !explicit,
    });
  }
  return rows;
}

export function groupYoshinoyaRows(rows: YoshinoyaRow[]): YoshinoyaRow[][] {
  const groups: YoshinoyaRow[][] = [];
  let current: YoshinoyaRow[] = [];
  let prevFamily: Family | null = null;
  let prevIdx = -1;
  for (const row of rows) {
    if (row.implicitSingleton) {
      if (current.length > 0) groups.push(current);
      groups.push([row]);
      current = [];
      prevFamily = null;
      prevIdx = -1;
      continue;
    }

    const fam = familyOf(row.size);
    if (!fam) continue;
    const idx = indexInFamily(row.size, fam);
    let isNewGroup = false;
    if (current.length === 0) {
      isNewGroup = false; // first row — start group
    } else if (fam === 'E' || prevFamily === 'E') {
      isNewGroup = true; // singleton boundary
    } else if (fam !== prevFamily) {
      isNewGroup = true; // family change
    } else if (idx <= prevIdx) {
      isNewGroup = true; // monotonic reset
    }
    if (isNewGroup) {
      groups.push(current);
      current = [];
    }
    current.push(row);
    prevFamily = fam;
    prevIdx = idx;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

export interface YoshinoyaParseOptions {
  rawTextPath: string;
  sourceUrl: string;
  sourceCapturedAt: string;
}

export function parseYoshinoya(opts: YoshinoyaParseOptions): RestaurantScrapeOutput {
  const text = fs.readFileSync(opts.rawTextPath, 'utf-8');
  const rows = extractYoshinoyaRows(text);
  const groups = groupYoshinoyaRows(rows);
  const items: MenuItemRecord[] = [];
  const limit = Math.min(groups.length, YOSHINOYA_MENU_NAMES.length);
  for (let i = 0; i < limit; i += 1) {
    const menuName = YOSHINOYA_MENU_NAMES[i];
    for (const row of groups[i]) {
      items.push({
        name: row.size ? `${menuName} ${row.size}` : menuName,
        servingSizeG: 100,
        servingUnit: 'g',
        caloriesPerServing: row.calories,
        proteinG: row.protein,
        fatG: row.fat,
        carbG: row.carb,
        saltG: row.salt,
        source: 'official_disclosure',
        sourceUrl: opts.sourceUrl,
        sourceCapturedAt: opts.sourceCapturedAt,
      });
    }
  }
  const unmapped = Math.max(0, groups.length - YOSHINOYA_MENU_NAMES.length);
  console.log(
    `[yoshinoya] ${rows.length} rows → ${groups.length} groups, mapped ${limit}, unmapped ${unmapped}, emitted ${items.length} items`,
  );
  return {
    chainSlug: 'yoshinoya',
    chainName: '吉野家',
    restaurantType: 'dining',
    category: '牛丼',
    aliases: ['吉野家', 'よしのや', 'yoshinoya'],
    attribution: '公式 PDF より (yoshinoya.com nutrition disclosure)',
    attributionUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
    menuItems: items,
  };
}

async function main(): Promise<void> {
  const output = parseYoshinoya({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'yoshinoya.txt'),
    sourceUrl: 'https://www.yoshinoya.com/pdf/allergy/',
    sourceCapturedAt: '2026-05-18',
  });
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'yoshinoya.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `[yoshinoya] wrote ${output.menuItems.length} items → ${path.relative(REPO_ROOT, outPath)}`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
