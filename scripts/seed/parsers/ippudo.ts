// v1.5 Stage 2 Phase 2.2b — ippudo (一風堂) PDF parser.
//
// 一風堂 PDF schema (4 pages, ~6KB):
//   Row: <menu_name> <allergen marks (●)> <kcal>kcal
//
// kcal is suffixed inline (e.g., "320kcal") — distinct from kura/
// pronto where kcal is a standalone token.
//
// **Drafting 133 partial-source path**: kcal official + PFC AI.
// **Drafting 136 ramen ratio** (new template): P 16% / F 30% /
// C 54% — calibrated against 白丸元味 (580kcal/P25/F22/C67 ≈
// 17%/34%/46%) + 赤丸新味 + 担々麺 mix. Used Atwater-anchored for
// all rows.

import * as fs from 'fs';
import * as path from 'path';
import type { MenuItemRecord, RestaurantScrapeOutput } from '../types';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const P_RATIO = 0.16 / 4; // 0.040
const F_RATIO = 0.30 / 9; // 0.033
const C_RATIO = 0.54 / 4; // 0.135

// Match suffixed kcal: "320kcal", "5kcal", "1234kcal"
const KCAL_SUFFIX_RE = /(\d+)kcal\s*$/;

interface IppudoRow {
  name: string;
  calories: number;
}

export function parseIppudoRow(line: string): IppudoRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Filter disclaimer / page anchors.
  if (
    trimmed.startsWith('◆')
    || trimmed.startsWith('卵 ')
    || trimmed.startsWith('特定原材料')
    || trimmed.startsWith('カ')
    || trimmed.includes('アレルギー情報')
    || trimmed.includes('グランドメニュー')
    || /^\d+\s*\/\s*\d+\s*ページ/.test(trimmed)
    || trimmed.startsWith('当店') || trimmed.startsWith('ごく')
    || trimmed.startsWith('一風堂')
    || trimmed.startsWith('IPPUDO')
  ) return null;

  const m = trimmed.match(KCAL_SUFFIX_RE);
  if (!m) return null;
  const calories = Number(m[1]);
  if (!Number.isFinite(calories) || calories <= 0 || calories > 3000) return null;

  // Strip the kcal suffix from the line, then strip trailing
  // allergen marks (● / ▲) to recover the menu name.
  let head = trimmed.slice(0, -m[0].length).trim();
  // Remove trailing run of allergen marks + whitespace.
  head = head.replace(/([●▲△○]+\s*)+$/u, '').trim();
  if (!head) return null;

  return { name: head, calories };
}

export function extractIppudoRows(text: string): IppudoRow[] {
  const rows: IppudoRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const row = parseIppudoRow(line);
    if (row) rows.push(row);
  }
  return rows;
}

export function rowsToItems(
  rows: IppudoRow[],
  opts: { sourceUrl: string; sourceCapturedAt: string },
): MenuItemRecord[] {
  return rows.map((r) => ({
    name: r.name,
    servingSizeG: 100,
    servingUnit: '杯',
    caloriesPerServing: r.calories,
    proteinG: Math.round(r.calories * P_RATIO * 10) / 10,
    fatG: Math.round(r.calories * F_RATIO * 10) / 10,
    carbG: Math.round(r.calories * C_RATIO * 10) / 10,
    source: 'ai_estimate' as const,
    sourceUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
  }));
}

export function parseIppudo(opts: {
  rawTextPath: string;
  sourceUrl: string;
  sourceCapturedAt: string;
}): RestaurantScrapeOutput {
  const text = fs.readFileSync(opts.rawTextPath, 'utf-8');
  const rows = extractIppudoRows(text);
  const items = rowsToItems(rows, opts);
  console.log(
    `[ippudo] extracted ${rows.length} rows (kcal official + PFC ramen-ratio AI), emitted ${items.length} items`,
  );
  return {
    chainSlug: 'ippudo',
    chainName: '一風堂',
    restaurantType: 'dining',
    category: 'その他',
    aliases: ['一風堂', 'ippudo', 'IPPUDO'],
    attribution: '公式 PDF (一風堂) — kcal は公開値、 PFC は AI 推定 (Drafting 136 ramen-ratio)',
    attributionUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
    menuItems: items,
  };
}

async function main(): Promise<void> {
  const output = parseIppudo({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'ippudo.txt'),
    sourceUrl: 'https://storage.googleapis.com/studio-design-asset-files/projects/JpOL0L4xOQ/s-1x1_da3e772d-ae83-43cb-84d8-c867ddfe2fc7.pdf',
    sourceCapturedAt: '2026-05-18',
  });
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'ippudo.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `[ippudo] wrote ${output.menuItems.length} items → ${path.relative(REPO_ROOT, outPath)}`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
