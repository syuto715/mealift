// v1.5 Stage 2 Phase 2.2b — pronto (プロント) PDF parser.
//
// プロント PDF schema (3 pages, ~10KB):
//   Row: <name_ja> [<name_en>] <kcal> <allergen marks ●>
//
// **Drafting 133 partial-source 本命適用**: kcal is officially
// disclosed but PFC is not — AI-estimated via Atwater-anchored
// ratio. Chain-level conservative source = ai_estimate per
// Drafting 130 deferred.
//
// Bilingual name layout: PDF has both JA + EN names per row,
// separated by tabs/whitespace. Parser keeps the JA name (first
// part) and discards the EN translation; the kcal token is the
// FIRST single-number token, allergen marks (●) follow.
//
// Atwater-anchored ratio for cafe/bakery menu (mixed bread +
// pastries + drinks): P 12% / F 30% / C 58% (heavier fat than
// rice-based 寿司 due to pastry content).

import * as fs from 'fs';
import * as path from 'path';
import type { MenuItemRecord, RestaurantScrapeOutput } from '../types';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const P_RATIO = 0.12 / 4; // 0.030
const F_RATIO = 0.30 / 9; // 0.033
const C_RATIO = 0.58 / 4; // 0.145

interface ProntoRow {
  name: string;
  calories: number;
}

const NUMBER_RE = /^\d+(\.\d+)?$/;

function isInteger(t: string): boolean {
  return NUMBER_RE.test(t) && /\d/.test(t);
}

export function parseProntoRow(line: string): ProntoRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Filter header / metadata / English-only rows.
  if (
    trimmed.includes('エネルギー')
    || trimmed.includes('Updated')
    || trimmed.includes('Information')
    || trimmed.includes('updated as needed')
    || trimmed.includes('For menu items')
    || trimmed.startsWith('※')
    || /^[A-Z][a-z]+\s+[A-Z]/.test(trimmed) // English label row
  ) return null;

  const tokens = trimmed.split(/[\s\t]+/);
  if (tokens.length < 2) return null;

  // Find first integer-looking token that's in the kcal range
  // (10-3000); this discriminates kcal from random numeric noise.
  let kcalIdx = -1;
  for (let i = 0; i < tokens.length; i += 1) {
    if (isInteger(tokens[i])) {
      const n = Number(tokens[i]);
      if (n >= 10 && n <= 3000) {
        kcalIdx = i;
        break;
      }
    }
  }
  if (kcalIdx <= 0) return null;

  // The JA name is the FIRST sequence of non-Latin tokens before
  // the EN translation. Take everything before kcalIdx, then strip
  // leading EN tokens by keeping JA-only content. Simpler:
  // join all prefix tokens, then trim trailing Latin words.
  let name = tokens.slice(0, kcalIdx).join(' ');
  // Remove the EN translation suffix (typically capital-letter-led
  // tokens like "Morning Set A" or "(Yogurt)"). Heuristic: cut
  // before the last consecutive Latin run.
  const latinTail = name.match(/^(.+?[ぁ-んァ-ヶー一-龯（）]+)\s+[A-Za-z\s\-()/]+$/);
  if (latinTail) name = latinTail[1].trim();
  if (!name) return null;

  const calories = Number(tokens[kcalIdx]);
  if (!Number.isFinite(calories) || calories <= 0) return null;

  return { name, calories };
}

export function extractProntoRows(text: string): ProntoRow[] {
  const rows: ProntoRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const row = parseProntoRow(line);
    if (row) rows.push(row);
  }
  return rows;
}

export function rowsToItems(
  rows: ProntoRow[],
  opts: { sourceUrl: string; sourceCapturedAt: string },
): MenuItemRecord[] {
  return rows.map((r) => ({
    name: r.name,
    servingSizeG: 100,
    servingUnit: '皿',
    caloriesPerServing: r.calories,
    proteinG: Math.round(r.calories * P_RATIO * 10) / 10,
    fatG: Math.round(r.calories * F_RATIO * 10) / 10,
    carbG: Math.round(r.calories * C_RATIO * 10) / 10,
    source: 'ai_estimate' as const, // Drafting 133 deferred — chain-level conservative
    sourceUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
  }));
}

export function parsePronto(opts: {
  rawTextPath: string;
  sourceUrl: string;
  sourceCapturedAt: string;
}): RestaurantScrapeOutput {
  const text = fs.readFileSync(opts.rawTextPath, 'utf-8');
  const rows = extractProntoRows(text);
  const items = rowsToItems(rows, opts);
  console.log(
    `[pronto] extracted ${rows.length} rows (kcal official + PFC Atwater-anchored), emitted ${items.length} items`,
  );
  return {
    chainSlug: 'pronto',
    chainName: 'プロント',
    restaurantType: 'cafe_bakery',
    category: 'カフェ',
    aliases: ['プロント', 'pronto', 'PRONTO'],
    attribution: '公式 PDF (pronto.co.jp/epronto) — kcal は公開値、 PFC は AI 推定',
    attributionUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
    menuItems: items,
  };
}

async function main(): Promise<void> {
  const output = parsePronto({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'pronto.txt'),
    sourceUrl: 'https://www.pronto.co.jp/epronto/pdf/241008_food_allergy_calorie.pdf',
    sourceCapturedAt: '2026-05-18',
  });
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'pronto.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `[pronto] wrote ${output.menuItems.length} items → ${path.relative(REPO_ROOT, outPath)}`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
