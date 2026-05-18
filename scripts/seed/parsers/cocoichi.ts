// v1.5 Stage 2 Phase 2.2b — cocoichi (CoCo壱番屋) PDF parser.
//
// CoCo壱番屋 PDF schema (4 pages, ~8.5KB):
//   Pattern A (multi-line): menu name 行 + 次行に「*ライス量...」 +
//     5 numeric columns (kcal, protein, fat, carb, salt)。
//   Pattern B (inline): `<name_with_no_annotation> <5 numbers>` を
//     1 行で表現。 トッピング系。
//
// Comma-separated numbers: "1,210" → 1210。
// Column order: (kcal) (protein) (fat) (carb) (salt) — verified
// against `THE牛カレー 918 18.0 38.6 130.7 3.6` reference values.

import * as fs from 'fs';
import * as path from 'path';
import type { MenuItemRecord, RestaurantScrapeOutput } from '../types';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// 5-trailing-numbers data row (with optional annotation prefix).
// Captures: optional annotation/name + 5 numbers (comma-separated allowed).
const DATA_ROW_RE
  = /^(?:[*＊]\s*ライス量[^\d]*?)?(.*?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s*$/;

function toNumber(s: string): number {
  return Number(s.replace(/,/g, ''));
}

interface CocoichiItem {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  salt: number;
  servingNote?: string;
}

export function extractCocoichiItems(text: string): CocoichiItem[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const items: CocoichiItem[] = [];
  let pendingName: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const m = line.match(DATA_ROW_RE);
    if (!m) {
      // Probable menu name line — remember if non-trivial.
      if (line.length >= 2 && !line.includes('栄養成分') && !line.startsWith('●')) {
        pendingName = line;
      }
      continue;
    }
    const inlineNameOrAnnotation = m[1].trim();
    const calories = toNumber(m[2]);
    const protein = toNumber(m[3]);
    const fat = toNumber(m[4]);
    const carb = toNumber(m[5]);
    const salt = toNumber(m[6]);
    if (![calories, protein, fat, carb, salt].every(Number.isFinite)) continue;

    // Disambiguate name:
    //   - line starts with `*ライス量...` → use pendingName from prior line
    //   - else if inlineNameOrAnnotation is non-empty → it's the name
    //   - else use pendingName
    let name: string;
    let servingNote: string | undefined;
    if (line.startsWith('*') || line.startsWith('＊')) {
      name = pendingName ?? inlineNameOrAnnotation;
      // Capture the rice-quantity annotation as serving description.
      const ann = line.match(/[*＊]\s*(ライス量[「『][^」』]+[」』][^\d]*)/);
      if (ann) servingNote = ann[1].trim();
    } else if (inlineNameOrAnnotation) {
      name = inlineNameOrAnnotation;
    } else {
      name = pendingName ?? '(unknown)';
    }

    items.push({
      name: name.trim(),
      calories,
      protein,
      fat,
      carb,
      salt,
      servingNote,
    });
    pendingName = null;
  }
  return items;
}

export function rowsToItems(
  rows: CocoichiItem[],
  opts: { sourceUrl: string; sourceCapturedAt: string },
): MenuItemRecord[] {
  return rows.map((r) => ({
    name: r.name,
    servingDescription: r.servingNote,
    servingSizeG: 300, // CoCo壱 standard rice 普通 300g; documented in PDF
    servingUnit: '皿',
    caloriesPerServing: r.calories,
    proteinG: r.protein,
    fatG: r.fat,
    carbG: r.carb,
    saltG: r.salt,
    source: 'official_disclosure',
    sourceUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
  }));
}

export interface CocoichiParseOptions {
  rawTextPath: string;
  sourceUrl: string;
  sourceCapturedAt: string;
}

export function parseCocoichi(opts: CocoichiParseOptions): RestaurantScrapeOutput {
  const text = fs.readFileSync(opts.rawTextPath, 'utf-8');
  const rows = extractCocoichiItems(text);
  const items = rowsToItems(rows, {
    sourceUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
  });
  console.log(
    `[cocoichi] parser extracted ${rows.length} rows, emitted ${items.length} items`,
  );
  return {
    chainSlug: 'cocoichi',
    chainName: 'CoCo壱番屋',
    restaurantType: 'dining',
    category: 'その他',
    aliases: ['CoCo壱番屋', 'ココイチ', 'cocoichi', 'ichibanya'],
    attribution: '公式 PDF より (ichibanya.co.jp nutrition disclosure)',
    attributionUrl: opts.sourceUrl,
    sourceCapturedAt: opts.sourceCapturedAt,
    menuItems: items,
  };
}

async function main(): Promise<void> {
  const output = parseCocoichi({
    rawTextPath: path.join(REPO_ROOT, 'scripts', 'seed', '_raw', 'cocoichi.txt'),
    sourceUrl: 'https://www.ichibanya.co.jp/menu/pdf/nutrition.pdf',
    sourceCapturedAt: '2026-05-18',
  });
  const outPath = path.join(REPO_ROOT, 'scripts', 'seed', 'data', 'cocoichi.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `[cocoichi] wrote ${output.menuItems.length} items → ${path.relative(REPO_ROOT, outPath)}`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
