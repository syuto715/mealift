// v1.5.2 レビュー #7 — コーチ画面 redesign の相談テーマ定義。
//
// 「名前のない会話」を脱し、「記録に基づいて次に何をすべきか相談する」
// 導線を成立させるための content 定数。Syuto sign-off 済 (6 案そのまま承認)。
//
// data/AI 層は不可触: ここはあくまで pre-fill するユーザー発話文と、
// テーマ起点会話の自動タイトル文を持つだけ。送信後の context 注入は
// 既存の buildUserContext (今日の食事 / PFC / 体重 / 目標) が担う。

import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface CoachTheme {
  /** URL search param 値 (テーマ識別)。pre-fill 文は URL に載せず id だけ渡す。 */
  id: string;
  /** カード見出し。 */
  cardTitle: string;
  /** カード 1 行説明。 */
  cardDescription: string;
  icon: IoniconName;
  /** タップ時に compose 欄へ pre-fill するユーザー発話文。 */
  prompt: string;
  /** このテーマ起点で作られた会話の自動タイトル。 */
  autoTitle: string;
}

// 相談テーマ 6 カード (Syuto 承認済の文言)。
export const COACH_THEMES: CoachTheme[] = [
  {
    id: 'meal_improve',
    cardTitle: '今日の食事を改善',
    cardDescription: '今日の記録から改善点を',
    icon: 'restaurant-outline',
    prompt:
      '今日の私の食事記録をもとに、 栄養バランスや改善できる点を教えてください。',
    autoTitle: '食事改善の相談',
  },
  {
    id: 'pfc',
    cardTitle: 'PFCバランス',
    cardDescription: '三大栄養素の偏りを診断',
    icon: 'pie-chart-outline',
    prompt:
      '私のPFC（タンパク質・脂質・炭水化物）バランスは目標に対してどうですか？ 改善のアドバイスをください。',
    autoTitle: 'PFCバランスの相談',
  },
  {
    id: 'pace',
    // v1.6.0 Sprint 3 — goal-agnostic 文言に(増量ユーザーにも合う)。prompt は
    // 既に「体重の変化ペース」で agnostic なので表示文言のみ汎用化。
    cardTitle: '体重変化のペース',
    cardDescription: '体重変化のペースは適切か',
    icon: 'trending-down-outline',
    prompt:
      '今の体重の変化ペースは適切ですか？ 無理のないペースか教えてください。',
    autoTitle: '体重変化ペースの相談',
  },
  {
    id: 'workout',
    cardTitle: '筋トレメニュー',
    cardDescription: '今の自分に合う種目',
    icon: 'barbell-outline',
    prompt: '今の私に合った筋トレメニューを提案してください。',
    autoTitle: '筋トレメニューの相談',
  },
  {
    id: 'plateau',
    cardTitle: '停滞期',
    cardDescription: '体重が止まったとき',
    icon: 'pause-circle-outline',
    prompt:
      '体重が停滞しています。 停滞期を抜け出すためにできることを教えてください。',
    autoTitle: '停滞期の相談',
  },
  {
    id: 'eating_out',
    cardTitle: '外食・コンビニ',
    cardDescription: '外食時の選び方',
    icon: 'fast-food-outline',
    prompt:
      '外食やコンビニでの食事で、 目標に合った選び方のコツを教えてください。',
    autoTitle: '外食・コンビニの相談',
  },
];

export function getCoachTheme(id: string | null | undefined): CoachTheme | undefined {
  if (!id) return undefined;
  return COACH_THEMES.find((t) => t.id === id);
}

// 「新しい会話」(+) 押下時のテーマ選択。いきなり白紙チャットにせず、
// 軽いテーマ選択を挟む。themeId=null は「自由に相談」= 白紙。
export interface NewConversationOption {
  label: string;
  /** null のとき白紙チャット (pre-fill なし・自動タイトルは初回発話から導出)。 */
  themeId: string | null;
}

export const NEW_CONVERSATION_OPTIONS: NewConversationOption[] = [
  { label: '食事', themeId: 'meal_improve' },
  { label: '体重', themeId: 'pace' },
  { label: '筋トレ', themeId: 'workout' },
  { label: '停滞期', themeId: 'plateau' },
  { label: '自由に相談', themeId: null },
];
