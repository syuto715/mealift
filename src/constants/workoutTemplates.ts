// v1.5.2 Sprint 2 (トレーニング画面 redesign) — スターターテンプレ。
//
// レビュー #7: 「ルーティンを作らせる」のではなく「すぐ運動を始められる」
// 画面にするため、初期状態で出す 5 つの curated テンプレ。
//
// 制約 (Syuto sign-off 済):
//   - 種目は **既存 exercise ID のみ** 参照 (src/constants/exercises.ts)。
//     ここで使う ID は全て EXERCISES に実在することを確認済。
//   - 新 migration なし。これはアプリ内 constant で、DB seed ではない。
//   - 「始める」= 保存せず ephemeral セッション開始 (createSession(profileId, null)
//     → session 画面が templateId からこの定義を読み、addExercise する)。
//     createRoutine 強制保存はしない (任意で「マイルーティンに保存」は別導線)。
//
// targetReps は string ( "10" / "30秒" / "40秒" 等。自重・有酸素は時間表現)。
// setPattern は常に null (標準セット)。有酸素種目 (ex_c***) は exerciseType
// 'cardio' なので session 側で time/duration ベースに記録され、distance は必須に
// ならない (nullable)。

export type WorkoutTemplateLevel = 'beginner' | 'intermediate' | 'all';
export type WorkoutTemplateLocation = 'home' | 'gym';

export interface WorkoutTemplateItem {
  exerciseId: string;
  targetSets: number;
  targetReps: string;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  description: string;
  level: WorkoutTemplateLevel;
  durationMin: number;
  location: WorkoutTemplateLocation;
  /** 表示用の器具ラベル。 */
  equipmentLabel: string;
  /** Ionicons 名。 // TODO: 実機で最終アイコン確認 */
  icon: string;
  exercises: WorkoutTemplateItem[];
}

export const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  {
    id: 'tpl_home_fullbody_15',
    name: '自宅で全身15分',
    description: '器具なしで全身を動かす入門メニュー',
    level: 'beginner',
    durationMin: 15,
    location: 'home',
    equipmentLabel: '器具なし',
    icon: 'home-outline',
    exercises: [
      { exerciseId: 'ex_005', targetSets: 3, targetReps: '10' }, // 腕立て伏せ
      { exerciseId: 'ex_062', targetSets: 3, targetReps: '10' }, // バーピー
      { exerciseId: 'ex_052', targetSets: 3, targetReps: '30秒' }, // プランク
      { exerciseId: 'ex_050', targetSets: 3, targetReps: '15' }, // クランチ
    ],
  },
  {
    id: 'tpl_gym_beginner_30',
    name: 'ジム初心者30分',
    description: 'マシン中心でフォームを覚える初回向け',
    level: 'beginner',
    durationMin: 30,
    location: 'gym',
    equipmentLabel: 'マシン',
    icon: 'barbell-outline',
    exercises: [
      { exerciseId: 'ex_004', targetSets: 3, targetReps: '12' }, // チェストプレス
      { exerciseId: 'ex_012', targetSets: 3, targetReps: '12' }, // ラットプルダウン
      { exerciseId: 'ex_031', targetSets: 3, targetReps: '12' }, // レッグプレス
      { exerciseId: 'ex_015', targetSets: 3, targetReps: '12' }, // シーテッドロウ
      { exerciseId: 'ex_033', targetSets: 3, targetReps: '12' }, // レッグカール
    ],
  },
  {
    id: 'tpl_upper_body',
    name: '上半身メイン',
    description: '胸・背中・肩・腕をまとめて鍛える',
    level: 'intermediate',
    durationMin: 45,
    location: 'gym',
    equipmentLabel: 'バーベル+ダンベル',
    icon: 'body-outline',
    exercises: [
      { exerciseId: 'ex_001', targetSets: 3, targetReps: '8' }, // ベンチプレス
      { exerciseId: 'ex_013', targetSets: 3, targetReps: '8' }, // バーベルロウ
      { exerciseId: 'ex_020', targetSets: 3, targetReps: '10' }, // オーバーヘッドプレス
      { exerciseId: 'ex_012', targetSets: 3, targetReps: '10' }, // ラットプルダウン
      { exerciseId: 'ex_041', targetSets: 3, targetReps: '12' }, // ダンベルカール
      { exerciseId: 'ex_043', targetSets: 3, targetReps: '12' }, // トライセプスプッシュダウン
    ],
  },
  {
    id: 'tpl_leg_day',
    name: '脚トレ',
    description: '下半身を集中的に追い込む',
    level: 'intermediate',
    durationMin: 45,
    location: 'gym',
    equipmentLabel: 'バーベル+マシン',
    icon: 'walk-outline',
    exercises: [
      { exerciseId: 'ex_030', targetSets: 3, targetReps: '8' }, // スクワット
      { exerciseId: 'ex_032', targetSets: 3, targetReps: '10' }, // ルーマニアンデッドリフト
      { exerciseId: 'ex_031', targetSets: 3, targetReps: '10' }, // レッグプレス
      { exerciseId: 'ex_033', targetSets: 3, targetReps: '12' }, // レッグカール
      { exerciseId: 'ex_035', targetSets: 3, targetReps: '15' }, // カーフレイズ
    ],
  },
  {
    id: 'tpl_cardio_fatloss',
    name: 'ダイエット向け有酸素',
    description: '器具なしの自重HIITで脂肪燃焼',
    level: 'all',
    durationMin: 20,
    location: 'home',
    equipmentLabel: '器具なし',
    icon: 'flame-outline',
    exercises: [
      { exerciseId: 'ex_c034', targetSets: 3, targetReps: '40秒' }, // ジャンピングジャック
      { exerciseId: 'ex_c037', targetSets: 3, targetReps: '30秒' }, // ハイニー
      { exerciseId: 'ex_c036', targetSets: 3, targetReps: '30秒' }, // マウンテンクライマー
      { exerciseId: 'ex_c010', targetSets: 3, targetReps: '60秒' }, // 縄跳び
    ],
  },
];

export function getWorkoutTemplateById(id: string): WorkoutTemplate | undefined {
  return WORKOUT_TEMPLATES.find((t) => t.id === id);
}
