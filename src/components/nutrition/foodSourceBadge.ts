// S5b — 外食チェーン行の出典バッジ / 出典表示テキスト (Drafting 152)。
//
// search_index.source_label を UI 語彙へ写像する唯一の場所。
// 「色のみ依存禁止」 (a11y): バッジは必ずラベル文字列を持ち、 色は
// 補助 (semantic token は呼び出し側が kind から解決する)。
// ai_estimate の文言は不安を煽らない中立トーン (Sprint 5b 指示)。

import type { Food } from '../../types/food';

export type SourceBadgeKind = 'official' | 'ai_estimate';

export interface SourceBadge {
  kind: SourceBadgeKind;
  label: string;
}

export function getSourceBadge(food: Pick<Food, 'sourceLabel'>): SourceBadge | null {
  switch (food.sourceLabel) {
    case 'official_disclosure':
    case 'package_label':
      return { kind: 'official', label: '公式' };
    case 'ai_estimate':
      return { kind: 'ai_estimate', label: 'AI推定' };
    // 'manual' は spot-check 復旧用の手入力 — 公式一覧由来なので
    // 公式扱いにはせず、 バッジ無しの中立表示に留める。
    default:
      return null;
  }
}

/** 詳細画面の出典行: 「出典: すき家 公式（2026-08-30時点）」 */
export function formatSourceLine(
  food: Pick<Food, 'sourceLabel' | 'sourceCapturedAt' | 'brand'>,
): string | null {
  const badge = getSourceBadge(food);
  if (!badge) return null;
  const who = food.brand ?? '提供元';
  const date = food.sourceCapturedAt ? `（${food.sourceCapturedAt}時点）` : '';
  if (badge.kind === 'official') {
    return `出典: ${who} 公式${date}`;
  }
  return `${who} のメニューを元にした AI 推定値${date}`;
}

/** 詳細画面の注記 (各社の公式注記の踏襲 / AI 推定の中立な説明)。 */
export function sourceDisclaimer(
  food: Pick<Food, 'sourceLabel'>,
): string | null {
  const badge = getSourceBadge(food);
  if (!badge) return null;
  if (badge.kind === 'official') {
    return '※栄養成分は推定値であり、実際の商品と異なる場合があります。';
  }
  return '※公式の栄養成分が公開されていないため、AIによる推定値を参考として表示しています。';
}
