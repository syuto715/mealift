// S5b — 廃番 (discontinued) carry-over.
//
// 再パースした chain JSON は「現行公式一覧に載っている item」だけを
// 含む。 前回 JSON との突き合わせで消えた item を末尾に
// `discontinued: true` 付きで温存する:
//   - 検索からは除外 (build-search-index が snapshot に emit しない、
//     seedSearchIndex の sweep が既存端末からも削除)
//   - chain JSON 内には残る = いつ何が消えたかの provenance 履歴
//     (sourceCapturedAt は「最後に公式一覧で確認できた日」のまま)
//   - 一度消えた item が公式一覧に再登場したら、 新パース結果が
//     フラグ無しの現役 record を出すので自然に復活する
//
// 突き合わせキーは item.name — source_id 安定キー化 (S5b) と同じ
// 一意性契約 (build-search-index が build 時に重複を fail-fast で
// 検査する) に乗る。

import type { MenuItemRecord, RestaurantScrapeOutput } from './types';

export interface CarryDiscontinuedResult {
  output: RestaurantScrapeOutput;
  discontinuedNames: string[];
}

export function carryDiscontinued(
  prev: RestaurantScrapeOutput | null,
  next: RestaurantScrapeOutput,
): CarryDiscontinuedResult {
  if (!prev) {
    return { output: next, discontinuedNames: [] };
  }
  const liveNames = new Set(next.menuItems.map((m) => m.name));
  const carried: MenuItemRecord[] = [];
  for (const item of prev.menuItems) {
    if (liveNames.has(item.name)) continue;
    carried.push({ ...item, discontinued: true });
    liveNames.add(item.name); // 前回 JSON 内の重複名も 1 回だけ carry
  }
  return {
    output: {
      ...next,
      menuItems: [...next.menuItems, ...carried],
    },
    discontinuedNames: carried.map((m) => m.name),
  };
}
