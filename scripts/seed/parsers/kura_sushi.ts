// v1.5 Stage 2 Phase 2.2b — kura_sushi (くら寿司) PDF parser.
//
// くら寿司 PDF schema (5 pages, ~13KB):
//   Row: <menu_name> <kcal> <allergen marks (●/▲/空白)>
//
// **Partial-source pattern**: kcal is officially disclosed (PDF
// title: "アレルゲン・カロリー情報")、 but PFC (protein/fat/carb)
// breakdown is NOT — they have to be AI-estimated. Atwater-anchored
// ratio used: P 18% / F 18% / C 64% of kcal (typical sushi rice +
// seafood balance). Source labeled `ai_estimate` at chain level
// (conservative per Drafting 130 deferred).
//
// Parser strategy: count-from-front (name = prefix, first numeric
// token = kcal, allergens = ignored). Category headers like
// "定番寿司" / "サイドメニュー" have no numeric → naturally filtered.

import * as fs from 'fs';
import * as path from 'path';
import type { MenuItemRecord, RestaurantScrapeOutput } from '../types';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// Atwater-anchored sushi ratio:
// 4 * (P_kcal/4) + 9 * (F_kcal/9) + 4 * (C_kcal/4) = total kcal,
// where P_kcal_share = 0.18, F_kcal_share = 0.18, C_kcal_share = 0.64.
// Yields: P = kcal * 0.045, F = kcal * 0.020, C = kcal * 0.16.
const P_RATIO = 0.18 / 4; // 0.045
const F_RATIO = 0.18 / 9; // 0.020
const C_RATIO = 0.64 / 4; // 0.16

interface KuraRow {
  name: string;
  calories: number;
}

const NUMBER_RE = /^[\d.]+$/;

function isNumberToken(t: string): boolean {
  return NUMBER_RE.test(t) && /\d/.test(t);
}

export function parseKuraRow(line: string): KuraRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Filter category headers, disclaimers, page anchors.
  if (
    trimmed.includes('くら寿司')
    || trimmed.includes('特定原材料')
    || trimmed.startsWith('※')
    || /^\d{4}年/.test(trimmed)
    || /^[1-9]\D/.test(trimmed)
    || trimmed === '定番寿司' || trimmed === 'サイドメニュー'
    || trimmed === 'デザート' || trimmed === 'ドリンク'
    || trimmed === 'スイーツ' || trimmed === '麺類'
    || trimmed === '巻物' || trimmed === '軍艦'
  ) return null;

  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 2) return null; // name + 1 number minimum

  // Find first numeric token.
  let firstNumIdx = -1;
  for (let i = 0; i < tokens.length; i += 1) {
    if (isNumberToken(tokens[i])) {
      firstNumIdx = i;
      break;
    }
  }
  if (firstNumIdx <= 0) return null; // need at least 1 name token

  const name = tokens.slice(0, firstNumIdx).join(' ');
  if (!name) return null;
  const kcal = Number(tokens[firstNumIdx]);
  if (!Number.isFinite(kcal) || kcal <= 0 || kcal > 3000) return null;

  // After kcal, tokens should be allergen marks (●/▲/×) or empty;
  // if there's another numeric token in quick succession, it's
  // probably a different row pattern — skip.
  const tail = tokens.slice(firstNumIdx + 1);
  if (tail.some(isNumberToken)) return null;

  return { name, calories: kcal };
}

export function extractKuraRows(text: string): KuraRow[] {
  const rows: KuraRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const row = parseKuraRow(line);
    if (row) rows.push(row);
  }
  return rows;
}

export function rowsToItems(
  rows: KuraRow[],
  opts: { sourceUrl: string; sourceCapturedAt: string },
): MenuItemRecord[] {
  return rows.map((r) => {
    // Atwater-anchored sushi PFC.
    const protein = Math.round(r.calories * P_RATIO * 10) / 10;
    const fat = Math.round(r.calories * F_RATIO * 10) / 10;
    const carb = Math.round(r.calories * C_RATIO * 10) / 10;
    return {
      name: r.name,
      servingSizeG: 30, // 1 貫 ≈ 25-30g; default for sushi
      servingUnit: '貫',
      caloriesPerServing: r.calories,
      proteinG: protein,
      fatG: fat,
      carbG: carb,
      // kcal は official disclosure 由来だが PFC は Atwater-anchored
      // ratio で AI 推定 → chain-level 保守的に ai_estimate を採用
      // (Drafting 130 deferred per Phase 2.2b)。 v1.6+ で per-field
      // sub-source labeling を導入できれば kcal 部分を official_disclosure
      // に upgrade 可能。
      source: 'ai_estimate' as const,
      sourceUrl: opts.sourceUrl,
      sourceCapturedAt: opts.sourceCapturedAt,
    };
  });
}

export interface KuraParseOptions {
  rawTextPath: string;
  sourceUrl: string;
  sourceCapturedAt: string;
}

export function parseKuraSushi(opts: KuraParseOptions): RestaurantScrapeOutput {
  const text = fs.readFileSync(opts.rawTextPath, 'utf-8');
  const rows = extractKuraRows(text);
  const items = rowsToItems(rows, {
    sourceUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
  });
  console.log(
    `[kura_sushi] parser extracted ${rows.length} rows (kcal official + PFC Atwater-anchored), emitted ${items.length} items`,
  );
  return {
    chainSlug: 'kura_sushi',
    chainName: 'くら寿司',
    restaurantType: 'dining',
    category: '寿司',
    aliases: ['くら寿司', 'くら', 'kura_sushi', 'kurasushi'],
    attribution: '公式 PDF (kurasushi.co.jp allergen + calorie disclosure) — kcal は公開値、 PFC は AI 推定',
    attributionUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
    menuItems: items,
  };
}

async function main(): Promise<void> {
  const output = parseKuraSushi({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'kura_sushi.txt'),
    sourceUrl: 'https://www.kurasushi.co.jp/common/pdf/kura_allergen.pdf',
    sourceCapturedAt: '2026-05-18',
  });
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'kura_sushi.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `[kura_sushi] wrote ${output.menuItems.length} items → ${path.relative(REPO_ROOT, outPath)}`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
