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

// 認識する size labels (Zensho 牛丼 + 寿司 + サイドメニュー共通)。
// `小盛` は nakau の最小サイズ (Phase 2.2b Sprint 2A.2 で追加);
// `ごはん少なめ` は sukiya のうな丼系の追加サイズ (Sprint 6.1
// Codex round 2 で発見、 +18 dropped rows 復活)。
// nakau は ミニ を持たず、 (小盛, 並盛, 大盛) の 3-size chain が
// 主流。 sukiya は ミニ / 中盛 / メガ / N倍盛 / ごはん少なめ 併用。
//
// S5b: chain ごとに label 体系が分岐した (なか卯 2026-08-19 版 PDF が
// 麺類の単独漢字 size と `W 〜` size を導入) ため、 label list は
// パラメータ化した。 既存 chain (sukiya 等) は DEFAULT_SIZE_LABELS の
// まま呼び出すので抽出結果は完全不変。 配列順 = サイズ昇順 が契約
// (groupSizeRows の単調増加判定が依存)。
export const DEFAULT_SIZE_LABELS: readonly string[] = [
  'ごはん少なめ',
  '小盛',
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
];

// "ミニ 488 15.8 16.1 69.8 2.8" を捕捉。
// 数値は整数 (kcal) または 小数点付き (g)。
// 全角 [２-５]倍盛 は normalizeSize と対で半角にも matchさせる。
function buildSizeRowRegex(labels: readonly string[]): RegExp {
  // 長い label を先に置かないと alternation が prefix で短絡する
  // (例: `小` が `小盛` を食う)。全角数字 label は半角版も許容。
  const alternation = [...labels]
    .sort((a, b) => b.length - a.length)
    .flatMap((l) => {
      const escaped = l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const halfWidth = escaped.replace(/[２３４５]/g, (c) =>
        String.fromCharCode(c.charCodeAt(0) - 0xfee0),
      );
      return halfWidth === escaped ? [escaped] : [escaped, halfWidth];
    })
    .join('|');
  return new RegExp(
    `^(${alternation})\\s+(\\d+)\\s+(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)$`,
  );
}

export interface ZenshoSizeRow {
  size: string;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  salt: number;
}

// Step 1: PDF text から size 行を抽出。
export function extractSizeRows(
  rawText: string,
  labels: readonly string[] = DEFAULT_SIZE_LABELS,
): ZenshoSizeRow[] {
  const regex = buildSizeRowRegex(labels);
  const rows: ZenshoSizeRow[] = [];
  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim();
    const m = trimmed.match(regex);
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

function sizeIndex(size: string, labels: readonly string[]): number {
  // label list は全角版を含みうる、 input は normalize 済 → 比較は片寄せ。
  const normalized = normalizeSize(size);
  for (let i = 0; i < labels.length; i += 1) {
    if (normalizeSize(labels[i]) === normalized) return i;
  }
  return -1;
}

// size label の「family」— なか卯 2026-08-19 版 PDF は 1 メニュー card
// 内で同一 family の label しか使わない (丼 = 〜盛 / 麺 = 単独漢字 /
// 肉 2 倍系 = `W 〜`)。 family が切り替わったら index の大小に関係なく
// 新しい card。 これが無いと「大盛 → W 小盛 → … → W 大盛 → 小盛」の
// 並びで W card と次の base card が index 単調増加のまま融合する。
// 既存 chain (sukiya 等) の label は全て 'std' family なので、 この
// 判定は従来の index-reset 判定と完全に同値 = 無回帰。
function sizeFamily(size: string): string {
  if (size.startsWith('W ')) return 'W';
  if (size === '小' || size === '並' || size === '大' || size === '特') return 'plain';
  return 'std';
}

// Step 2: 連続 size 行を group に分割。
// size index が単調増加でない (= 次のメニュー card が始まった) ところで
// 新 group。
//
// 例: [ミニ, 並盛, 中盛, 2倍盛, 3倍盛, 4倍盛, 5倍盛] → group A (牛皿)
//     [ミニ, 並盛, 中盛, 大盛, 特盛, メガ]            → group B (牛丼)
//     [ミニ, 並盛, 中盛, 大盛, 特盛, メガ]            → group C (ねぎ玉牛丼)
//     ...
export function groupSizeRows(
  rows: ZenshoSizeRow[],
  labels: readonly string[] = DEFAULT_SIZE_LABELS,
): ZenshoSizeRow[][] {
  const groups: ZenshoSizeRow[][] = [];
  let current: ZenshoSizeRow[] = [];
  for (const row of rows) {
    if (current.length === 0) {
      current.push(row);
      continue;
    }
    const prev = current[current.length - 1];
    const prevIdx = sizeIndex(prev.size, labels);
    const curIdx = sizeIndex(row.size, labels);
    // 新 group の判定: 現サイズが直前サイズより前方 OR 同じ、
    // または size family の切り替わり (sizeFamily コメント参照)。
    if (curIdx <= prevIdx || sizeFamily(row.size) !== sizeFamily(prev.size)) {
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
  labels: readonly string[] = DEFAULT_SIZE_LABELS,
): { items: MenuItemRecord[]; totalGroups: number; unmappedGroups: number } {
  const rows = extractSizeRows(rawText, labels);
  const groups = groupSizeRows(rows, labels);
  const { items, unmappedGroups } = applyMenuNames(groups, menuNames, meta);
  return {
    items,
    totalGroups: groups.length,
    unmappedGroups,
  };
}
