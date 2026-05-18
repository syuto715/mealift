// v1.5 Stage 2 Phase 2.2b — Zensho 共通 PDF parser.
//
// Architectural SSoT:
//   - Sprint 2A の Zensho 5 社 (sukiya / nakau / lotteria /
//     hama_sushi 一覧 / hama_sushi 持ち帰り) は共通 PDF schema
//   - すき家 PDF text を pdf-parse v2 で extract した結果から
//     reverse-engineered:
//       - サイズ行: "<size>\\s+<kcal>\\s+<P>\\s+<F>\\s+<C>\\s+<S>"
//       - column order: (kcal) (protein) (fat) (carb) (salt)
//         ※ header text "カロリー 食塩相当量 脂質 たんぱく質 炭水化物"
//           とは異なる順序 — verified against known 牛丼 並盛
//           values (488/15.8/16.1/69.8/2.8)
//       - menu name list: 各ページ末尾に並ぶが PDF stream 順は
//         data 行と一致しない → chain ごとに `MENU_NAMES` 定数
//         を hand-author で供給する必要 (Drafting 123 候補)
//
// Per-chain wrapper (sukiya 等) はこのコア parser を呼び出し、
// メニュー名リストと sourceUrl / sourceCapturedAt を notify。

import type { MenuItemRecord } from '../types';

// 認識する size labels (Zensho 牛丼 + 寿司 + サイドメニュー共通)
const SIZE_LABELS = [
  'ミニ',
  '並盛',
  '中盛',
  '大盛',
  '特盛',
  'メガ',
  '２倍盛',
  '３倍盛',
  '４倍盛',
  '５倍盛',
] as const;

// "ミニ 488 15.8 16.1 69.8 2.8" を捕捉。
// 数値は整数 (kcal) または 小数点付き (g)。
const SIZE_ROW_REGEX =
  /^(ミニ|並盛|中盛|大盛|特盛|メガ|[2-5]倍盛|[２-５]倍盛)\s+(\d+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/;

export interface ZenshoSizeRow {
  size: string;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  salt: number;
}

// Step 1: PDF text から size 行を抽出。
export function extractSizeRows(rawText: string): ZenshoSizeRow[] {
  const rows: ZenshoSizeRow[] = [];
  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim();
    const m = trimmed.match(SIZE_ROW_REGEX);
    if (!m) continue;
    rows.push({
      size: normalizeSize(m[1]),
      calories: Number(m[2]),
      protein: Number(m[3]),
      fat: Number(m[4]),
      carb: Number(m[5]),
      salt: Number(m[6]),
    });
  }
  return rows;
}

function normalizeSize(s: string): string {
  // 全角 ２倍盛 → 半角 2倍盛 は表示用にそのまま残すが、
  // index 計算用に正規化版を返す。
  return s.replace(/２/g, '2').replace(/３/g, '3').replace(/４/g, '4').replace(/５/g, '5');
}

function sizeIndex(size: string): number {
  // SIZE_LABELS は全角版、 input は normalize 済 → 比較は片寄せ。
  const normalized = normalizeSize(size);
  for (let i = 0; i < SIZE_LABELS.length; i += 1) {
    if (normalizeSize(SIZE_LABELS[i]) === normalized) return i;
  }
  return -1;
}

// Step 2: 連続 size 行を group に分割。
// size index が単調増加でない (= 次のメニュー card が始まった) ところで
// 新 group。
//
// 例: [ミニ, 並盛, 中盛, 2倍盛, 3倍盛, 4倍盛, 5倍盛] → group A (牛皿)
//     [ミニ, 並盛, 中盛, 大盛, 特盛, メガ]            → group B (牛丼)
//     [ミニ, 並盛, 中盛, 大盛, 特盛, メガ]            → group C (ねぎ玉牛丼)
//     ...
export function groupSizeRows(rows: ZenshoSizeRow[]): ZenshoSizeRow[][] {
  const groups: ZenshoSizeRow[][] = [];
  let current: ZenshoSizeRow[] = [];
  for (const row of rows) {
    if (current.length === 0) {
      current.push(row);
      continue;
    }
    const prevIdx = sizeIndex(current[current.length - 1].size);
    const curIdx = sizeIndex(row.size);
    // 新 group の判定: 現サイズが直前サイズより前方 OR 同じ
    if (curIdx <= prevIdx) {
      groups.push(current);
      current = [row];
    } else {
      current.push(row);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

// Step 3: メニュー名リストを各 group に適用。
//
// menuNames は chain 別に hand-author された配列を渡す。
// PDF text の末尾 menu name list は stream order が data 行と
// 一致しない事を Phase 2.2b で確認しているため、 自動抽出は
// 信頼性が低い。 chain wrapper (sukiya.ts 等) が hub HTML
// から取得した「視覚 layout 順」のメニュー名リストを供給する。
export function applyMenuNames(
  groups: ZenshoSizeRow[][],
  menuNames: string[],
  meta: { sourceUrl: string; sourceCapturedAt: string; restaurantCategory?: string },
): { items: MenuItemRecord[]; unmappedGroups: number } {
  const items: MenuItemRecord[] = [];
  const limit = Math.min(groups.length, menuNames.length);
  for (let i = 0; i < limit; i += 1) {
    const menuName = menuNames[i];
    for (const row of groups[i]) {
      items.push({
        name: `${menuName} ${row.size}`,
        category: meta.restaurantCategory,
        servingSizeG: 100,
        servingUnit: 'g',
        caloriesPerServing: row.calories,
        proteinG: row.protein,
        fatG: row.fat,
        carbG: row.carb,
        saltG: row.salt,
        source: 'official_disclosure',
        sourceUrl: meta.sourceUrl,
        sourceCapturedAt: meta.sourceCapturedAt,
      });
    }
  }
  return {
    items,
    unmappedGroups: Math.max(0, groups.length - menuNames.length),
  };
}

// 高レベル: text → MenuItemRecord[].
export function parseZenshoPdf(
  rawText: string,
  menuNames: string[],
  meta: { sourceUrl: string; sourceCapturedAt: string; restaurantCategory?: string },
): { items: MenuItemRecord[]; totalGroups: number; unmappedGroups: number } {
  const rows = extractSizeRows(rawText);
  const groups = groupSizeRows(rows);
  const { items, unmappedGroups } = applyMenuNames(groups, menuNames, meta);
  return {
    items,
    totalGroups: groups.length,
    unmappedGroups,
  };
}
