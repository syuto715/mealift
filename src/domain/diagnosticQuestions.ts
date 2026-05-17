// v1.5 Stage 1 Phase 1.3 — diagnostic question schema.
//
// 5-8 question wizard (epic doc §10 Phase 1.3). The schema is
// hand-defined; intent-builder consumes the answers to produce a
// natural-language intent text for the coach-routine EF.

import type { DiagnosticQuestion } from '../types/diagnostic';

export const DIAGNOSTIC_QUESTIONS: DiagnosticQuestion[] = [
  {
    id: 'experience',
    type: 'single',
    label: 'トレーニング経験を教えてください',
    hint: 'ミー先生があなたのレベルに合った種目とボリュームを選びます',
    required: true,
    options: [
      { value: 'beginner', label: '初心者 (6ヶ月未満)' },
      { value: 'intermediate', label: '中級 (6ヶ月 〜 2年)' },
      { value: 'advanced', label: '上級 (2年以上)' },
    ],
  },
  {
    id: 'goal',
    type: 'single',
    label: '今の目標は何ですか',
    required: true,
    options: [
      { value: 'cut', label: '体脂肪を減らしたい' },
      { value: 'bulk', label: '筋肉を増やしたい' },
      { value: 'maintain', label: '今の体型を維持したい' },
      { value: 'recomp', label: '体組成を改善したい (リコンプ)' },
    ],
  },
  {
    id: 'frequency',
    type: 'number',
    label: '週に何回トレーニングできますか',
    hint: '1〜7 の整数で入力してください',
    required: true,
    defaultNumber: 3,
    min: 1,
    max: 7,
  },
  {
    id: 'duration',
    type: 'single',
    label: '1 回あたり何分くらい使えますか',
    required: true,
    options: [
      { value: '30', label: '30 分以内' },
      { value: '45', label: '45 分前後' },
      { value: '60', label: '60 分前後' },
      { value: '90', label: '90 分以上' },
    ],
  },
  {
    id: 'equipment',
    type: 'multi',
    label: 'どの機材が使えますか',
    hint: '複数選択できます',
    required: true,
    options: [
      { value: 'bodyweight', label: '自重のみ' },
      { value: 'dumbbell', label: 'ダンベル' },
      { value: 'barbell', label: 'バーベル' },
      { value: 'machine', label: 'マシン (ジム)' },
      { value: 'cable', label: 'ケーブル / プーリー' },
      { value: 'kettlebell', label: 'ケトルベル' },
    ],
  },
  {
    id: 'limitations',
    type: 'text',
    label: '怪我や避けたい種目はありますか',
    hint: '無ければ「特になし」 と入力してください (最大 200 文字)',
    required: true,
    maxLength: 200,
  },
  {
    id: 'focus',
    type: 'multi',
    label: '特に伸ばしたい部位はありますか',
    hint: '優先したい筋群を選んでください (任意)',
    required: false,
    options: [
      { value: 'chest', label: '胸' },
      { value: 'back', label: '背中' },
      { value: 'legs', label: '脚' },
      { value: 'shoulders', label: '肩' },
      { value: 'arms', label: '腕' },
      { value: 'core', label: '体幹' },
    ],
  },
];

/** Returns the question by index, or null when out of bounds. */
export function getQuestionByIndex(
  index: number,
): DiagnosticQuestion | null {
  if (index < 0 || index >= DIAGNOSTIC_QUESTIONS.length) return null;
  return DIAGNOSTIC_QUESTIONS[index];
}
