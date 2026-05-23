import { MuscleGroup } from '../types/common';
import type { ExerciseType } from '../types/workout';

export interface ExerciseDefinition {
  id: string;
  nameJa: string;
  nameEn: string;
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[] | null;
  equipment: string | null;
  sortOrder: number;
  // Defaults to 'strength' at the DB column level when omitted (see migration
  // v12). Explicit in seeds for non-strength rows so the seeder writes the
  // right value on existing installs.
  exerciseType?: ExerciseType;
  // Metabolic Equivalent of Task. Used only for cardio / sports / other to
  // compute kcal = MET × weight_kg × hours. Null for strength.
  metValue?: number | null;
}

export const EXERCISES: ExerciseDefinition[] = [
  // === 胸 (Chest) ===
  { id: 'ex_001', nameJa: 'ベンチプレス', nameEn: 'Bench Press', muscleGroup: 'chest', secondaryMuscles: ['shoulders', 'arms'], equipment: 'barbell', sortOrder: 1 },
  { id: 'ex_002', nameJa: 'インクラインベンチプレス', nameEn: 'Incline Bench Press', muscleGroup: 'chest', secondaryMuscles: ['shoulders', 'arms'], equipment: 'barbell', sortOrder: 2 },
  { id: 'ex_003', nameJa: 'ダンベルフライ', nameEn: 'Dumbbell Fly', muscleGroup: 'chest', secondaryMuscles: null, equipment: 'dumbbell', sortOrder: 3 },
  { id: 'ex_004', nameJa: 'チェストプレス', nameEn: 'Chest Press', muscleGroup: 'chest', secondaryMuscles: ['shoulders', 'arms'], equipment: 'machine', sortOrder: 4 },
  { id: 'ex_005', nameJa: '腕立て伏せ', nameEn: 'Push Up', muscleGroup: 'chest', secondaryMuscles: ['shoulders', 'arms', 'core'], equipment: null, sortOrder: 5 },
  { id: 'ex_006', nameJa: 'ダンベルベンチプレス', nameEn: 'Dumbbell Bench Press', muscleGroup: 'chest', secondaryMuscles: ['shoulders', 'arms'], equipment: 'dumbbell', sortOrder: 6 },

  // === 背中 (Back) ===
  { id: 'ex_010', nameJa: 'デッドリフト', nameEn: 'Deadlift', muscleGroup: 'back', secondaryMuscles: ['legs', 'core'], equipment: 'barbell', sortOrder: 10 },
  { id: 'ex_011', nameJa: '懸垂', nameEn: 'Pull Up', muscleGroup: 'back', secondaryMuscles: ['arms'], equipment: null, sortOrder: 11 },
  { id: 'ex_012', nameJa: 'ラットプルダウン', nameEn: 'Lat Pulldown', muscleGroup: 'back', secondaryMuscles: ['arms'], equipment: 'machine', sortOrder: 12 },
  { id: 'ex_013', nameJa: 'バーベルロウ', nameEn: 'Barbell Row', muscleGroup: 'back', secondaryMuscles: ['arms', 'core'], equipment: 'barbell', sortOrder: 13 },
  { id: 'ex_014', nameJa: 'ダンベルロウ', nameEn: 'Dumbbell Row', muscleGroup: 'back', secondaryMuscles: ['arms'], equipment: 'dumbbell', sortOrder: 14 },
  { id: 'ex_015', nameJa: 'シーテッドロウ', nameEn: 'Seated Row', muscleGroup: 'back', secondaryMuscles: ['arms'], equipment: 'machine', sortOrder: 15 },

  // === 肩 (Shoulders) ===
  { id: 'ex_020', nameJa: 'オーバーヘッドプレス', nameEn: 'Overhead Press', muscleGroup: 'shoulders', secondaryMuscles: ['arms', 'core'], equipment: 'barbell', sortOrder: 20 },
  { id: 'ex_021', nameJa: 'サイドレイズ', nameEn: 'Side Raise', muscleGroup: 'shoulders', secondaryMuscles: null, equipment: 'dumbbell', sortOrder: 21 },
  { id: 'ex_022', nameJa: 'フロントレイズ', nameEn: 'Front Raise', muscleGroup: 'shoulders', secondaryMuscles: null, equipment: 'dumbbell', sortOrder: 22 },
  { id: 'ex_023', nameJa: 'リアデルトフライ', nameEn: 'Rear Delt Fly', muscleGroup: 'shoulders', secondaryMuscles: ['back'], equipment: 'dumbbell', sortOrder: 23 },
  { id: 'ex_024', nameJa: 'アップライトロウ', nameEn: 'Upright Row', muscleGroup: 'shoulders', secondaryMuscles: ['arms'], equipment: 'barbell', sortOrder: 24 },
  { id: 'ex_025', nameJa: 'ダンベルショルダープレス', nameEn: 'Dumbbell Shoulder Press', muscleGroup: 'shoulders', secondaryMuscles: ['arms'], equipment: 'dumbbell', sortOrder: 25 },

  // === 脚 (Legs) ===
  { id: 'ex_030', nameJa: 'スクワット', nameEn: 'Squat', muscleGroup: 'legs', secondaryMuscles: ['core'], equipment: 'barbell', sortOrder: 30 },
  { id: 'ex_031', nameJa: 'レッグプレス', nameEn: 'Leg Press', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'machine', sortOrder: 31 },
  { id: 'ex_032', nameJa: 'ルーマニアンデッドリフト', nameEn: 'Romanian Deadlift', muscleGroup: 'legs', secondaryMuscles: ['back'], equipment: 'barbell', sortOrder: 32 },
  { id: 'ex_033', nameJa: 'レッグカール', nameEn: 'Leg Curl', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'machine', sortOrder: 33 },
  { id: 'ex_034', nameJa: 'レッグエクステンション', nameEn: 'Leg Extension', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'machine', sortOrder: 34 },
  { id: 'ex_035', nameJa: 'カーフレイズ', nameEn: 'Calf Raise', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'machine', sortOrder: 35 },
  { id: 'ex_036', nameJa: 'ブルガリアンスクワット', nameEn: 'Bulgarian Split Squat', muscleGroup: 'legs', secondaryMuscles: ['core'], equipment: 'dumbbell', sortOrder: 36 },
  { id: 'ex_037', nameJa: 'ゴブレットスクワット', nameEn: 'Goblet Squat', muscleGroup: 'legs', secondaryMuscles: ['core'], equipment: 'dumbbell', sortOrder: 37 },

  // === 腕 (Arms) ===
  { id: 'ex_040', nameJa: 'バーベルカール', nameEn: 'Barbell Curl', muscleGroup: 'arms', secondaryMuscles: null, equipment: 'barbell', sortOrder: 40 },
  { id: 'ex_041', nameJa: 'ダンベルカール', nameEn: 'Dumbbell Curl', muscleGroup: 'arms', secondaryMuscles: null, equipment: 'dumbbell', sortOrder: 41 },
  { id: 'ex_042', nameJa: 'ハンマーカール', nameEn: 'Hammer Curl', muscleGroup: 'arms', secondaryMuscles: null, equipment: 'dumbbell', sortOrder: 42 },
  { id: 'ex_043', nameJa: 'トライセプスプッシュダウン', nameEn: 'Triceps Pushdown', muscleGroup: 'arms', secondaryMuscles: null, equipment: 'cable', sortOrder: 43 },
  { id: 'ex_044', nameJa: 'スカルクラッシャー', nameEn: 'Skull Crusher', muscleGroup: 'arms', secondaryMuscles: null, equipment: 'barbell', sortOrder: 44 },
  { id: 'ex_045', nameJa: 'ディップス', nameEn: 'Dips', muscleGroup: 'arms', secondaryMuscles: ['chest', 'shoulders'], equipment: null, sortOrder: 45 },
  { id: 'ex_046', nameJa: 'コンセントレーションカール', nameEn: 'Concentration Curl', muscleGroup: 'arms', secondaryMuscles: null, equipment: 'dumbbell', sortOrder: 46 },

  // === 腹 (Core) ===
  { id: 'ex_050', nameJa: 'クランチ', nameEn: 'Crunch', muscleGroup: 'core', secondaryMuscles: null, equipment: null, sortOrder: 50 },
  { id: 'ex_051', nameJa: 'レッグレイズ', nameEn: 'Leg Raise', muscleGroup: 'core', secondaryMuscles: null, equipment: null, sortOrder: 51 },
  { id: 'ex_052', nameJa: 'プランク', nameEn: 'Plank', muscleGroup: 'core', secondaryMuscles: ['shoulders'], equipment: null, sortOrder: 52 },
  { id: 'ex_053', nameJa: 'アブローラー', nameEn: 'Ab Roller', muscleGroup: 'core', secondaryMuscles: ['shoulders'], equipment: 'ab_roller', sortOrder: 53 },
  { id: 'ex_054', nameJa: 'ハンギングレッグレイズ', nameEn: 'Hanging Leg Raise', muscleGroup: 'core', secondaryMuscles: ['arms'], equipment: null, sortOrder: 54 },
  { id: 'ex_055', nameJa: 'ケーブルクランチ', nameEn: 'Cable Crunch', muscleGroup: 'core', secondaryMuscles: null, equipment: 'cable', sortOrder: 55 },

  // === 全身 (Full Body) ===
  { id: 'ex_060', nameJa: 'クリーン', nameEn: 'Clean', muscleGroup: 'full_body', secondaryMuscles: ['legs', 'back', 'shoulders'], equipment: 'barbell', sortOrder: 60 },
  { id: 'ex_061', nameJa: 'スナッチ', nameEn: 'Snatch', muscleGroup: 'full_body', secondaryMuscles: ['legs', 'back', 'shoulders'], equipment: 'barbell', sortOrder: 61 },
  { id: 'ex_062', nameJa: 'バーピー', nameEn: 'Burpee', muscleGroup: 'full_body', secondaryMuscles: ['chest', 'legs', 'core'], equipment: null, sortOrder: 62 },
  { id: 'ex_063', nameJa: 'ケトルベルスイング', nameEn: 'Kettlebell Swing', muscleGroup: 'full_body', secondaryMuscles: ['legs', 'back', 'core'], equipment: 'kettlebell', sortOrder: 63 },

  // === 有酸素 (Cardio) ===
  // muscleGroup is set to 'full_body' as a pragmatic default — the UI filters
  // by exerciseType instead of muscleGroup for cardio/sports. MET values from
  // the 2011 Compendium of Physical Activities.
  { id: 'ex_c001', nameJa: 'ランニング（遅め 8km/h）', nameEn: 'Running (slow, 8 km/h)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 100, exerciseType: 'cardio', metValue: 8.0 },
  { id: 'ex_c002', nameJa: 'ランニング（速め 12km/h）', nameEn: 'Running (fast, 12 km/h)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 101, exerciseType: 'cardio', metValue: 11.5 },
  { id: 'ex_c003', nameJa: 'ジョギング', nameEn: 'Jogging', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 102, exerciseType: 'cardio', metValue: 7.0 },
  { id: 'ex_c004', nameJa: 'ウォーキング（普通 5km/h）', nameEn: 'Walking (5 km/h)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 103, exerciseType: 'cardio', metValue: 3.5 },
  { id: 'ex_c005', nameJa: 'ウォーキング（速歩 6.5km/h）', nameEn: 'Brisk Walking (6.5 km/h)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 104, exerciseType: 'cardio', metValue: 5.0 },
  { id: 'ex_c006', nameJa: 'サイクリング（普通）', nameEn: 'Cycling (moderate)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 105, exerciseType: 'cardio', metValue: 6.0 },
  { id: 'ex_c007', nameJa: 'サイクリング（速め）', nameEn: 'Cycling (vigorous)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 106, exerciseType: 'cardio', metValue: 10.0 },
  { id: 'ex_c008', nameJa: '水泳（クロール 中）', nameEn: 'Swimming (freestyle, moderate)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 107, exerciseType: 'cardio', metValue: 8.0 },
  { id: 'ex_c009', nameJa: '水泳（平泳ぎ）', nameEn: 'Swimming (breaststroke)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 108, exerciseType: 'cardio', metValue: 5.3 },
  { id: 'ex_c010', nameJa: '縄跳び', nameEn: 'Jump Rope', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 109, exerciseType: 'cardio', metValue: 11.0 },
  { id: 'ex_c011', nameJa: 'エアロビクス', nameEn: 'Aerobics', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 110, exerciseType: 'cardio', metValue: 6.5 },
  { id: 'ex_c012', nameJa: 'ヨガ（ハタ）', nameEn: 'Yoga (Hatha)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 111, exerciseType: 'cardio', metValue: 2.5 },
  { id: 'ex_c013', nameJa: 'ヨガ（パワー）', nameEn: 'Yoga (Power)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 112, exerciseType: 'cardio', metValue: 4.0 },
  { id: 'ex_c014', nameJa: 'ピラティス', nameEn: 'Pilates', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 113, exerciseType: 'cardio', metValue: 3.0 },
  { id: 'ex_c015', nameJa: '階段昇降', nameEn: 'Stair Climbing', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 114, exerciseType: 'cardio', metValue: 8.0 },
  { id: 'ex_c016', nameJa: 'エリプティカル（中）', nameEn: 'Elliptical (moderate)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'machine', sortOrder: 115, exerciseType: 'cardio', metValue: 5.0 },
  { id: 'ex_c017', nameJa: 'ローイング（中）', nameEn: 'Rowing (moderate)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'machine', sortOrder: 116, exerciseType: 'cardio', metValue: 7.0 },
  { id: 'ex_c018', nameJa: 'トレッドミル（傾斜あり）', nameEn: 'Treadmill (incline)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'machine', sortOrder: 117, exerciseType: 'cardio', metValue: 6.0 },

  // === スポーツ (Sports) ===
  { id: 'ex_s001', nameJa: 'バスケットボール（試合）', nameEn: 'Basketball (game)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 200, exerciseType: 'sports', metValue: 8.0 },
  { id: 'ex_s002', nameJa: 'バスケットボール（シュート練習）', nameEn: 'Basketball (shooting)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 201, exerciseType: 'sports', metValue: 4.5 },
  { id: 'ex_s003', nameJa: 'サッカー（試合）', nameEn: 'Soccer (game)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 202, exerciseType: 'sports', metValue: 10.0 },
  { id: 'ex_s004', nameJa: 'サッカー（練習）', nameEn: 'Soccer (practice)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 203, exerciseType: 'sports', metValue: 7.0 },
  { id: 'ex_s005', nameJa: 'テニス（シングルス）', nameEn: 'Tennis (singles)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 204, exerciseType: 'sports', metValue: 7.3 },
  { id: 'ex_s006', nameJa: 'テニス（ダブルス）', nameEn: 'Tennis (doubles)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 205, exerciseType: 'sports', metValue: 6.0 },
  { id: 'ex_s007', nameJa: 'バドミントン（試合）', nameEn: 'Badminton (game)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 206, exerciseType: 'sports', metValue: 7.0 },
  { id: 'ex_s008', nameJa: '卓球', nameEn: 'Table Tennis', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 207, exerciseType: 'sports', metValue: 4.0 },
  { id: 'ex_s009', nameJa: '野球', nameEn: 'Baseball', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 208, exerciseType: 'sports', metValue: 5.0 },
  { id: 'ex_s010', nameJa: 'バレーボール（一般）', nameEn: 'Volleyball (casual)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 209, exerciseType: 'sports', metValue: 4.0 },
  { id: 'ex_s011', nameJa: 'バレーボール（競技）', nameEn: 'Volleyball (competitive)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 210, exerciseType: 'sports', metValue: 8.0 },
  { id: 'ex_s012', nameJa: 'ゴルフ（歩き）', nameEn: 'Golf (walking)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 211, exerciseType: 'sports', metValue: 4.8 },
  { id: 'ex_s013', nameJa: 'スキー（中程度）', nameEn: 'Skiing (moderate)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 212, exerciseType: 'sports', metValue: 5.3 },
  { id: 'ex_s014', nameJa: 'スノーボード', nameEn: 'Snowboarding', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 213, exerciseType: 'sports', metValue: 5.3 },
  { id: 'ex_s015', nameJa: 'ボクシング（練習）', nameEn: 'Boxing (training)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 214, exerciseType: 'sports', metValue: 7.8 },
  { id: 'ex_s016', nameJa: '空手・武道', nameEn: 'Martial Arts', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 215, exerciseType: 'sports', metValue: 10.0 },
  { id: 'ex_s017', nameJa: 'ダンス（一般）', nameEn: 'Dance (general)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 216, exerciseType: 'sports', metValue: 4.8 },
  { id: 'ex_s018', nameJa: 'ダンス（激しい）', nameEn: 'Dance (vigorous)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 217, exerciseType: 'sports', metValue: 7.8 },
  { id: 'ex_s019', nameJa: 'クライミング', nameEn: 'Rock Climbing', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 218, exerciseType: 'sports', metValue: 8.0 },

  // === その他 (Other) ===
  { id: 'ex_o001', nameJa: 'ストレッチ', nameEn: 'Stretching', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 300, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_o002', nameJa: '家事（掃除機）', nameEn: 'Vacuuming', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 301, exerciseType: 'other', metValue: 3.3 },
  { id: 'ex_o003', nameJa: '家事（床拭き）', nameEn: 'Mopping', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 302, exerciseType: 'other', metValue: 3.5 },
  { id: 'ex_o004', nameJa: 'ガーデニング', nameEn: 'Gardening', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 303, exerciseType: 'other', metValue: 3.8 },
  { id: 'ex_o005', nameJa: '通勤・買い物（歩き）', nameEn: 'Walking (commute / errands)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 304, exerciseType: 'other', metValue: 3.5 },

  // ============================================================
  // Phase 2.7c Sprint 2.7c.2 — Non-strength batch (109 件 post-fix)
  // Cardio (ex_c019..ex_c048, 29 — ex_c033 removed in Codex pass 1 fix
  //   due to duplicate name_ja with strength V2 ex_130 box jump) /
  // Sports (ex_s020..ex_s044, 25) /
  // Mobility (ex_m001..ex_m035, 35) / Other (ex_o006..ex_o025, 20)
  // License clean: Anthropic training data + 既 175 件 seed
  // MET values from 2011 Compendium of Physical Activities
  // ============================================================

  // === 有酸素 (Cardio) additions ex_c019..ex_c048 ===
  { id: 'ex_c019', nameJa: 'ランニング（中、10km/h）', nameEn: 'Running (moderate, 10 km/h)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 118, exerciseType: 'cardio', metValue: 10.0 },
  { id: 'ex_c020', nameJa: 'トレイルランニング', nameEn: 'Trail Running', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 119, exerciseType: 'cardio', metValue: 9.0 },
  { id: 'ex_c021', nameJa: 'インターバル走', nameEn: 'Interval Running', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 120, exerciseType: 'cardio', metValue: 12.0 },
  { id: 'ex_c022', nameJa: 'スプリント（短距離）', nameEn: 'Sprinting', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 121, exerciseType: 'cardio', metValue: 14.0 },
  { id: 'ex_c023', nameJa: 'ヒルランニング', nameEn: 'Hill Running', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 122, exerciseType: 'cardio', metValue: 11.0 },
  { id: 'ex_c024', nameJa: 'サイクリング（遅め）', nameEn: 'Cycling (leisurely)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 123, exerciseType: 'cardio', metValue: 4.0 },
  { id: 'ex_c025', nameJa: 'マウンテンバイク', nameEn: 'Mountain Biking', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 124, exerciseType: 'cardio', metValue: 8.5 },
  { id: 'ex_c026', nameJa: 'スピンクラス', nameEn: 'Spin Class', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'machine', sortOrder: 125, exerciseType: 'cardio', metValue: 8.5 },
  { id: 'ex_c027', nameJa: 'エアロバイク（中）', nameEn: 'Stationary Bike (moderate)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'machine', sortOrder: 126, exerciseType: 'cardio', metValue: 6.8 },
  { id: 'ex_c028', nameJa: 'エアロバイク（激しい）', nameEn: 'Stationary Bike (vigorous)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'machine', sortOrder: 127, exerciseType: 'cardio', metValue: 10.5 },
  { id: 'ex_c029', nameJa: '水泳（バタフライ）', nameEn: 'Swimming (butterfly)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 128, exerciseType: 'cardio', metValue: 13.8 },
  { id: 'ex_c030', nameJa: '水泳（背泳ぎ）', nameEn: 'Swimming (backstroke)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 129, exerciseType: 'cardio', metValue: 7.0 },
  { id: 'ex_c031', nameJa: '水中ウォーキング', nameEn: 'Water Walking', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 130, exerciseType: 'cardio', metValue: 4.5 },
  { id: 'ex_c032', nameJa: 'アクアビクス', nameEn: 'Water Aerobics', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 131, exerciseType: 'cardio', metValue: 5.3 },
  // ex_c033 'ボックスジャンプ' was removed in Sprint 2.7c.2 Codex pass 1 fix
  // — it duplicated the strength variant ex_130 at scripts/seed-exercises-v2/data.ts
  // (same nameJa, same Japanese box-jump movement). The strength row is the
  // canonical entry; cardio users still pick it up via the strength tab.
  { id: 'ex_c034', nameJa: 'ジャンピングジャック', nameEn: 'Jumping Jacks', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 133, exerciseType: 'cardio', metValue: 8.0 },
  { id: 'ex_c035', nameJa: 'バーピージャンプ', nameEn: 'Burpee Jumps', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 134, exerciseType: 'cardio', metValue: 10.0 },
  { id: 'ex_c036', nameJa: 'マウンテンクライマー（カーディオ）', nameEn: 'Mountain Climbers (cardio)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 135, exerciseType: 'cardio', metValue: 8.0 },
  { id: 'ex_c037', nameJa: 'ハイニー', nameEn: 'High Knees', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 136, exerciseType: 'cardio', metValue: 8.0 },
  { id: 'ex_c038', nameJa: 'バットキッカー', nameEn: 'Butt Kicks', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 137, exerciseType: 'cardio', metValue: 7.0 },
  { id: 'ex_c039', nameJa: 'ジャンプロープ（ダブルアンダー）', nameEn: 'Jump Rope (double under)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 138, exerciseType: 'cardio', metValue: 12.3 },
  { id: 'ex_c040', nameJa: 'ジャンプロープ（クロス）', nameEn: 'Jump Rope (cross)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 139, exerciseType: 'cardio', metValue: 11.5 },
  { id: 'ex_c041', nameJa: 'ステアクライマー', nameEn: 'Stair Climber Machine', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'machine', sortOrder: 140, exerciseType: 'cardio', metValue: 9.0 },
  { id: 'ex_c042', nameJa: 'バトルロープ', nameEn: 'Battle Ropes', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 141, exerciseType: 'cardio', metValue: 10.0 },
  { id: 'ex_c043', nameJa: 'HIIT セッション', nameEn: 'HIIT Session', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 142, exerciseType: 'cardio', metValue: 12.0 },
  { id: 'ex_c044', nameJa: 'タバタ式', nameEn: 'Tabata Protocol', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 143, exerciseType: 'cardio', metValue: 13.0 },
  { id: 'ex_c045', nameJa: 'ローイング（激しい）', nameEn: 'Rowing (vigorous)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'machine', sortOrder: 144, exerciseType: 'cardio', metValue: 8.5 },
  { id: 'ex_c046', nameJa: 'スキーエルゴ', nameEn: 'Ski Erg', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'machine', sortOrder: 145, exerciseType: 'cardio', metValue: 9.0 },
  { id: 'ex_c047', nameJa: 'アサルトバイク', nameEn: 'Assault Bike', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'machine', sortOrder: 146, exerciseType: 'cardio', metValue: 11.0 },
  { id: 'ex_c048', nameJa: 'ハイキング', nameEn: 'Hiking', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 147, exerciseType: 'cardio', metValue: 6.0 },

  // === スポーツ (Sports) additions ex_s020..ex_s044 ===
  { id: 'ex_s020', nameJa: 'バスケットボール（ドリブル練習）', nameEn: 'Basketball (drills)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 219, exerciseType: 'sports', metValue: 6.5 },
  { id: 'ex_s021', nameJa: 'バレーボール（ビーチ）', nameEn: 'Beach Volleyball', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 220, exerciseType: 'sports', metValue: 8.0 },
  { id: 'ex_s022', nameJa: 'ハンドボール', nameEn: 'Handball', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 221, exerciseType: 'sports', metValue: 8.0 },
  { id: 'ex_s023', nameJa: 'ラグビー（試合）', nameEn: 'Rugby (game)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 222, exerciseType: 'sports', metValue: 8.3 },
  { id: 'ex_s024', nameJa: 'アメリカンフットボール', nameEn: 'American Football', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 223, exerciseType: 'sports', metValue: 8.0 },
  { id: 'ex_s025', nameJa: 'ホッケー（フィールド）', nameEn: 'Field Hockey', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 224, exerciseType: 'sports', metValue: 7.8 },
  { id: 'ex_s026', nameJa: 'アイススケート（一般）', nameEn: 'Ice Skating', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 225, exerciseType: 'sports', metValue: 7.0 },
  { id: 'ex_s027', nameJa: 'ローラースケート', nameEn: 'Roller Skating', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 226, exerciseType: 'sports', metValue: 7.0 },
  { id: 'ex_s028', nameJa: 'スケートボード', nameEn: 'Skateboarding', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 227, exerciseType: 'sports', metValue: 5.0 },
  { id: 'ex_s029', nameJa: 'サーフィン', nameEn: 'Surfing', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 228, exerciseType: 'sports', metValue: 5.0 },
  { id: 'ex_s030', nameJa: 'スタンドアップパドル', nameEn: 'Stand-Up Paddleboarding', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 229, exerciseType: 'sports', metValue: 6.0 },
  { id: 'ex_s031', nameJa: 'カヤック', nameEn: 'Kayaking', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 230, exerciseType: 'sports', metValue: 5.0 },
  { id: 'ex_s032', nameJa: 'カヌー', nameEn: 'Canoeing', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 231, exerciseType: 'sports', metValue: 4.5 },
  { id: 'ex_s033', nameJa: 'ボルダリング', nameEn: 'Bouldering', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 232, exerciseType: 'sports', metValue: 7.0 },
  { id: 'ex_s034', nameJa: 'ファンクショナルトレーニング', nameEn: 'Functional Fitness', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 233, exerciseType: 'sports', metValue: 9.0 },
  { id: 'ex_s035', nameJa: 'キックボクシング', nameEn: 'Kickboxing', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 234, exerciseType: 'sports', metValue: 10.0 },
  { id: 'ex_s036', nameJa: 'ムエタイ', nameEn: 'Muay Thai', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 235, exerciseType: 'sports', metValue: 10.0 },
  { id: 'ex_s037', nameJa: '柔道', nameEn: 'Judo', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 236, exerciseType: 'sports', metValue: 10.3 },
  { id: 'ex_s038', nameJa: '剣道', nameEn: 'Kendo', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 237, exerciseType: 'sports', metValue: 8.0 },
  { id: 'ex_s039', nameJa: '相撲（稽古）', nameEn: 'Sumo (training)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 238, exerciseType: 'sports', metValue: 9.5 },
  { id: 'ex_s040', nameJa: 'フェンシング', nameEn: 'Fencing', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 239, exerciseType: 'sports', metValue: 6.0 },
  { id: 'ex_s041', nameJa: 'アーチェリー', nameEn: 'Archery', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 240, exerciseType: 'sports', metValue: 4.3 },
  { id: 'ex_s042', nameJa: '弓道', nameEn: 'Kyudo (Japanese Archery)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 241, exerciseType: 'sports', metValue: 4.0 },
  { id: 'ex_s043', nameJa: 'ボウリング', nameEn: 'Bowling', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 242, exerciseType: 'sports', metValue: 3.8 },
  { id: 'ex_s044', nameJa: 'スカッシュ', nameEn: 'Squash', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 243, exerciseType: 'sports', metValue: 7.3 },

  // === モビリティ / ストレッチ (Mobility / Stretching) ex_m001..ex_m035 ===
  // exerciseType: 'other' + equipment: 'stretching' で分類
  { id: 'ex_m001', nameJa: '胸郭ストレッチ', nameEn: 'Thoracic Spine Stretch', muscleGroup: 'core', secondaryMuscles: ['back'], equipment: 'stretching', sortOrder: 400, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m002', nameJa: 'キャットカウ', nameEn: 'Cat Cow', muscleGroup: 'core', secondaryMuscles: ['back'], equipment: 'stretching', sortOrder: 401, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_m003', nameJa: 'チャイルドポーズ', nameEn: "Child's Pose", muscleGroup: 'back', secondaryMuscles: ['shoulders'], equipment: 'stretching', sortOrder: 402, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m004', nameJa: 'ダウンドッグ', nameEn: 'Downward Dog', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 403, exerciseType: 'other', metValue: 3.0 },
  { id: 'ex_m005', nameJa: 'ピジョンポーズ', nameEn: 'Pigeon Pose', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'stretching', sortOrder: 404, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_m006', nameJa: '股関節フレクサーストレッチ', nameEn: 'Hip Flexor Stretch', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'stretching', sortOrder: 405, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m007', nameJa: 'ハムストリングストレッチ', nameEn: 'Hamstring Stretch', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'stretching', sortOrder: 406, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m008', nameJa: 'カーフストレッチ', nameEn: 'Calf Stretch', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'stretching', sortOrder: 407, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m009', nameJa: 'クアッドストレッチ', nameEn: 'Quad Stretch', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'stretching', sortOrder: 408, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m010', nameJa: '臀筋ストレッチ', nameEn: 'Glute Stretch', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'stretching', sortOrder: 409, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m011', nameJa: '内転筋ストレッチ', nameEn: 'Adductor Stretch', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'stretching', sortOrder: 410, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m012', nameJa: '90/90 ストレッチ', nameEn: '90/90 Stretch', muscleGroup: 'legs', secondaryMuscles: ['core'], equipment: 'stretching', sortOrder: 411, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_m013', nameJa: 'コブラポーズ', nameEn: 'Cobra Pose', muscleGroup: 'back', secondaryMuscles: ['core'], equipment: 'stretching', sortOrder: 412, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m014', nameJa: '猫ストレッチ', nameEn: 'Cat Stretch', muscleGroup: 'back', secondaryMuscles: ['core'], equipment: 'stretching', sortOrder: 413, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m015', nameJa: 'バックブリッジ', nameEn: 'Back Bridge', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 414, exerciseType: 'other', metValue: 3.0 },
  { id: 'ex_m016', nameJa: '広背筋ストレッチ', nameEn: 'Lat Stretch', muscleGroup: 'back', secondaryMuscles: null, equipment: 'stretching', sortOrder: 415, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m017', nameJa: '肩回旋ストレッチ', nameEn: 'Shoulder Rotation Stretch', muscleGroup: 'shoulders', secondaryMuscles: null, equipment: 'stretching', sortOrder: 416, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m018', nameJa: 'クロスボディショルダーストレッチ', nameEn: 'Cross Body Shoulder Stretch', muscleGroup: 'shoulders', secondaryMuscles: null, equipment: 'stretching', sortOrder: 417, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m019', nameJa: '三頭筋ストレッチ', nameEn: 'Triceps Stretch', muscleGroup: 'arms', secondaryMuscles: ['shoulders'], equipment: 'stretching', sortOrder: 418, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m020', nameJa: '前腕ストレッチ', nameEn: 'Forearm Stretch', muscleGroup: 'arms', secondaryMuscles: null, equipment: 'stretching', sortOrder: 419, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m021', nameJa: '頚部ストレッチ', nameEn: 'Neck Stretch', muscleGroup: 'shoulders', secondaryMuscles: null, equipment: 'stretching', sortOrder: 420, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m022', nameJa: '胸ストレッチ（壁）', nameEn: 'Chest Stretch (Wall)', muscleGroup: 'chest', secondaryMuscles: ['shoulders'], equipment: 'stretching', sortOrder: 421, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m023', nameJa: 'ドアフレーム胸ストレッチ', nameEn: 'Doorway Chest Stretch', muscleGroup: 'chest', secondaryMuscles: ['shoulders'], equipment: 'stretching', sortOrder: 422, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m024', nameJa: 'IT バンドストレッチ', nameEn: 'IT Band Stretch', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'stretching', sortOrder: 423, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m025', nameJa: 'スピナルツイスト', nameEn: 'Spinal Twist', muscleGroup: 'core', secondaryMuscles: ['back'], equipment: 'stretching', sortOrder: 424, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m026', nameJa: 'スクワットマトリックス', nameEn: 'Squat Mobility', muscleGroup: 'legs', secondaryMuscles: ['core'], equipment: 'stretching', sortOrder: 425, exerciseType: 'other', metValue: 3.0 },
  { id: 'ex_m027', nameJa: 'ワールドグレイテストストレッチ', nameEn: "World's Greatest Stretch", muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 426, exerciseType: 'other', metValue: 3.0 },
  { id: 'ex_m028', nameJa: 'スコーピオンストレッチ', nameEn: 'Scorpion Stretch', muscleGroup: 'core', secondaryMuscles: ['legs'], equipment: 'stretching', sortOrder: 427, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_m029', nameJa: 'インチワーム', nameEn: 'Inchworm', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 428, exerciseType: 'other', metValue: 3.5 },
  { id: 'ex_m030', nameJa: 'レッグスイング', nameEn: 'Leg Swings', muscleGroup: 'legs', secondaryMuscles: ['core'], equipment: 'stretching', sortOrder: 429, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_m031', nameJa: 'アームサークル', nameEn: 'Arm Circles', muscleGroup: 'shoulders', secondaryMuscles: null, equipment: 'stretching', sortOrder: 430, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m032', nameJa: 'バンドプルアパート', nameEn: 'Band Pull Apart', muscleGroup: 'back', secondaryMuscles: ['shoulders'], equipment: 'stretching', sortOrder: 431, exerciseType: 'other', metValue: 3.0 },
  { id: 'ex_m033', nameJa: 'フォームローラー（背中）', nameEn: 'Foam Rolling (back)', muscleGroup: 'back', secondaryMuscles: null, equipment: 'stretching', sortOrder: 432, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m034', nameJa: 'フォームローラー（IT バンド）', nameEn: 'Foam Rolling (IT band)', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'stretching', sortOrder: 433, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m035', nameJa: 'ラクロスボール（肩甲骨）', nameEn: 'Lacrosse Ball Release (shoulder)', muscleGroup: 'shoulders', secondaryMuscles: ['back'], equipment: 'stretching', sortOrder: 434, exerciseType: 'other', metValue: 2.3 },

  // === その他 (Other functional / lifestyle) additions ex_o006..ex_o025 ===
  { id: 'ex_o006', nameJa: '太極拳', nameEn: 'Tai Chi', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 305, exerciseType: 'other', metValue: 3.0 },
  { id: 'ex_o007', nameJa: '気功', nameEn: 'Qigong', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 306, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_o008', nameJa: '瞑想（座位）', nameEn: 'Meditation (sitting)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 307, exerciseType: 'other', metValue: 1.3 },
  { id: 'ex_o009', nameJa: '呼吸エクササイズ', nameEn: 'Breathing Exercise', muscleGroup: 'core', secondaryMuscles: null, equipment: null, sortOrder: 308, exerciseType: 'other', metValue: 1.5 },
  { id: 'ex_o010', nameJa: '家事（料理）', nameEn: 'Cooking', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 309, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_o011', nameJa: '家事（洗濯）', nameEn: 'Laundry', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 310, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_o012', nameJa: '家事（皿洗い）', nameEn: 'Dish Washing', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 311, exerciseType: 'other', metValue: 2.0 },
  { id: 'ex_o013', nameJa: '子供と遊ぶ（中強度）', nameEn: 'Playing with Children (moderate)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 312, exerciseType: 'other', metValue: 4.0 },
  { id: 'ex_o014', nameJa: '犬の散歩', nameEn: 'Walking the Dog', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 313, exerciseType: 'other', metValue: 3.0 },
  { id: 'ex_o015', nameJa: '芝刈り', nameEn: 'Mowing the Lawn', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 314, exerciseType: 'other', metValue: 5.5 },
  { id: 'ex_o016', nameJa: '雪かき', nameEn: 'Shoveling Snow', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 315, exerciseType: 'other', metValue: 6.0 },
  { id: 'ex_o017', nameJa: '荷物運び', nameEn: 'Carrying Groceries', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 316, exerciseType: 'other', metValue: 4.5 },
  { id: 'ex_o018', nameJa: '引越し作業', nameEn: 'Moving (general)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 317, exerciseType: 'other', metValue: 5.8 },
  { id: 'ex_o019', nameJa: '自転車通勤', nameEn: 'Bike Commute', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 318, exerciseType: 'other', metValue: 5.0 },
  { id: 'ex_o020', nameJa: '階段昇降（日常）', nameEn: 'Taking Stairs (daily)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 319, exerciseType: 'other', metValue: 4.0 },
  { id: 'ex_o021', nameJa: 'スタンディングデスク', nameEn: 'Standing Desk Work', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 320, exerciseType: 'other', metValue: 1.8 },
  { id: 'ex_o022', nameJa: '釣り（立位）', nameEn: 'Fishing (standing)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 321, exerciseType: 'other', metValue: 3.5 },
  { id: 'ex_o023', nameJa: 'DIY（軽作業）', nameEn: 'DIY (light)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 322, exerciseType: 'other', metValue: 3.0 },
  { id: 'ex_o024', nameJa: 'DIY（重作業）', nameEn: 'DIY (heavy)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 323, exerciseType: 'other', metValue: 5.5 },
  { id: 'ex_o025', nameJa: '車の洗車', nameEn: 'Washing Car', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 324, exerciseType: 'other', metValue: 3.5 },

  // ============================================================
  // Phase 2.7c Sprint 2.7c.3 — Final non-strength batch (144 件)
  // Cardio (ex_c049..ex_c098, 50) / Sports (ex_s045..ex_s074, 30) /
  // Mobility (ex_m036..ex_m059, 24) / Other (ex_o026..ex_o065, 40)
  // License clean (Drafting 179): Anthropic training data + 既 336 件 seed
  // ============================================================

  // === 有酸素 (Cardio) additions ex_c049..ex_c098 (50 件) ===
  { id: 'ex_c049', nameJa: 'ランニング（速、14km/h）', nameEn: 'Running (fast, 14 km/h)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 148, exerciseType: 'cardio', metValue: 13.0 },
  { id: 'ex_c050', nameJa: 'ランニング（マラソンペース）', nameEn: 'Marathon Pace Running', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 149, exerciseType: 'cardio', metValue: 9.8 },
  { id: 'ex_c051', nameJa: 'クロスカントリー走', nameEn: 'Cross Country Running', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 150, exerciseType: 'cardio', metValue: 9.0 },
  { id: 'ex_c052', nameJa: '坂道インターバル走', nameEn: 'Hill Sprint Intervals', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 151, exerciseType: 'cardio', metValue: 13.5 },
  { id: 'ex_c053', nameJa: 'トラックインターバル（400m）', nameEn: 'Track Intervals (400m)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 152, exerciseType: 'cardio', metValue: 12.5 },
  { id: 'ex_c054', nameJa: 'サイクリング（ロード）', nameEn: 'Road Cycling', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 153, exerciseType: 'cardio', metValue: 8.0 },
  { id: 'ex_c055', nameJa: 'サイクリング（レース）', nameEn: 'Cycling (race pace)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 154, exerciseType: 'cardio', metValue: 16.0 },
  { id: 'ex_c056', nameJa: '三輪車（子供同乗）', nameEn: 'Cycling (with child)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 155, exerciseType: 'cardio', metValue: 6.5 },
  { id: 'ex_c057', nameJa: '水泳（クロール 速め）', nameEn: 'Swimming (freestyle, fast)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 156, exerciseType: 'cardio', metValue: 9.8 },
  { id: 'ex_c058', nameJa: '水泳（個人メドレー）', nameEn: 'Swimming (medley)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 157, exerciseType: 'cardio', metValue: 10.0 },
  { id: 'ex_c059', nameJa: 'プールラン', nameEn: 'Pool Running', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 158, exerciseType: 'cardio', metValue: 9.5 },
  { id: 'ex_c060', nameJa: '飛び込み', nameEn: 'Diving', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 159, exerciseType: 'cardio', metValue: 3.0 },
  // ex_c061 'ローイング（中）' was removed in Sprint 2.7c.3 Codex pass 1 fix
  // — duplicated existing ex_c017 'ローイング（中）'. The original is kept.
  { id: 'ex_c062', nameJa: 'ローイング（インターバル）', nameEn: 'Rowing Intervals', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'machine', sortOrder: 161, exerciseType: 'cardio', metValue: 11.0 },
  { id: 'ex_c063', nameJa: 'スカル（ボート）', nameEn: 'Sculling', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 162, exerciseType: 'cardio', metValue: 7.0 },
  { id: 'ex_c064', nameJa: 'インドアサイクリング', nameEn: 'Indoor Cycling', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'machine', sortOrder: 163, exerciseType: 'cardio', metValue: 7.8 },
  { id: 'ex_c065', nameJa: 'リカンベントバイク', nameEn: 'Recumbent Bike', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'machine', sortOrder: 164, exerciseType: 'cardio', metValue: 5.5 },
  { id: 'ex_c066', nameJa: 'タック ジャンプ', nameEn: 'Tuck Jumps', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 165, exerciseType: 'cardio', metValue: 9.0 },
  { id: 'ex_c067', nameJa: 'ブロードジャンプ', nameEn: 'Broad Jumps', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 166, exerciseType: 'cardio', metValue: 8.0 },
  { id: 'ex_c068', nameJa: 'スプリットスクワットジャンプ', nameEn: 'Split Squat Jumps', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 167, exerciseType: 'cardio', metValue: 9.5 },
  { id: 'ex_c069', nameJa: 'スケータージャンプ', nameEn: 'Skater Jumps', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 168, exerciseType: 'cardio', metValue: 8.0 },
  { id: 'ex_c070', nameJa: 'シャドーボクシング', nameEn: 'Shadow Boxing', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 169, exerciseType: 'cardio', metValue: 7.8 },
  { id: 'ex_c071', nameJa: 'パンチングバッグ', nameEn: 'Heavy Bag Work', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 170, exerciseType: 'cardio', metValue: 8.3 },
  { id: 'ex_c072', nameJa: 'スピードバッグ', nameEn: 'Speed Bag', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 171, exerciseType: 'cardio', metValue: 5.5 },
  { id: 'ex_c073', nameJa: 'ラダードリル', nameEn: 'Agility Ladder Drills', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 172, exerciseType: 'cardio', metValue: 7.5 },
  { id: 'ex_c074', nameJa: 'コーンドリル', nameEn: 'Cone Drills', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 173, exerciseType: 'cardio', metValue: 7.0 },
  { id: 'ex_c075', nameJa: 'シャトルラン', nameEn: 'Shuttle Run', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 174, exerciseType: 'cardio', metValue: 9.5 },
  { id: 'ex_c076', nameJa: 'バックワードラン', nameEn: 'Backward Running', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 175, exerciseType: 'cardio', metValue: 7.5 },
  { id: 'ex_c077', nameJa: 'カリオカ', nameEn: 'Carioca', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 176, exerciseType: 'cardio', metValue: 7.0 },
  { id: 'ex_c078', nameJa: 'スピードスケート', nameEn: 'Speed Skating', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 177, exerciseType: 'cardio', metValue: 9.0 },
  { id: 'ex_c079', nameJa: 'クロスカントリースキー', nameEn: 'Cross Country Skiing', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 178, exerciseType: 'cardio', metValue: 9.0 },
  { id: 'ex_c080', nameJa: 'スノーシュー歩行', nameEn: 'Snowshoeing', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 179, exerciseType: 'cardio', metValue: 7.0 },
  { id: 'ex_c081', nameJa: 'ボルダリング（カーディオ）', nameEn: 'Cardio Climbing', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 180, exerciseType: 'cardio', metValue: 8.0 },
  { id: 'ex_c082', nameJa: 'ジャンプスクワット連続', nameEn: 'Continuous Jump Squats', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 181, exerciseType: 'cardio', metValue: 10.0 },
  { id: 'ex_c083', nameJa: 'ダッシュ&リカバリー', nameEn: 'Dash & Recovery', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 182, exerciseType: 'cardio', metValue: 11.0 },
  { id: 'ex_c084', nameJa: 'ステアラン', nameEn: 'Stair Running', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 183, exerciseType: 'cardio', metValue: 10.0 },
  { id: 'ex_c085', nameJa: 'AMRAP セッション', nameEn: 'AMRAP Session', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 184, exerciseType: 'cardio', metValue: 10.5 },
  { id: 'ex_c086', nameJa: 'EMOM セッション', nameEn: 'EMOM Session', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 185, exerciseType: 'cardio', metValue: 10.0 },
  { id: 'ex_c087', nameJa: 'デスバイ', nameEn: 'Death By Workout', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 186, exerciseType: 'cardio', metValue: 12.0 },
  { id: 'ex_c088', nameJa: 'ベアクロウル', nameEn: 'Bear Crawl', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 187, exerciseType: 'cardio', metValue: 7.5 },
  { id: 'ex_c089', nameJa: 'クラブウォーク', nameEn: 'Crab Walk', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 188, exerciseType: 'cardio', metValue: 6.0 },
  { id: 'ex_c090', nameJa: 'ダックウォーク', nameEn: 'Duck Walk', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 189, exerciseType: 'cardio', metValue: 7.5 },
  { id: 'ex_c091', nameJa: 'リバーススレッドプル', nameEn: 'Reverse Sled Pull', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'machine', sortOrder: 190, exerciseType: 'cardio', metValue: 9.5 },
  { id: 'ex_c092', nameJa: 'プラウラープッシュ', nameEn: 'Prowler Push', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'machine', sortOrder: 191, exerciseType: 'cardio', metValue: 10.0 },
  { id: 'ex_c093', nameJa: 'スキップ', nameEn: 'Skipping', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 192, exerciseType: 'cardio', metValue: 6.5 },
  { id: 'ex_c094', nameJa: 'ストレッチランニング', nameEn: 'Tempo Run', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 193, exerciseType: 'cardio', metValue: 10.5 },
  { id: 'ex_c095', nameJa: 'ファルトレク', nameEn: 'Fartlek Training', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 194, exerciseType: 'cardio', metValue: 10.0 },
  { id: 'ex_c096', nameJa: 'メタコン', nameEn: 'Metabolic Conditioning', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 195, exerciseType: 'cardio', metValue: 11.5 },
  { id: 'ex_c097', nameJa: 'チェイサーラン', nameEn: 'Chaser Run', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 196, exerciseType: 'cardio', metValue: 11.0 },
  { id: 'ex_c098', nameJa: 'パイロメトリックサーキット', nameEn: 'Plyometric Circuit', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 197, exerciseType: 'cardio', metValue: 10.0 },

  // === スポーツ (Sports) additions ex_s045..ex_s074 (30 件) ===
  { id: 'ex_s045', nameJa: '合気道', nameEn: 'Aikido', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 244, exerciseType: 'sports', metValue: 6.0 },
  { id: 'ex_s046', nameJa: '居合道', nameEn: 'Iaido', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 245, exerciseType: 'sports', metValue: 4.5 },
  { id: 'ex_s047', nameJa: '少林寺拳法', nameEn: 'Shorinji Kempo', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 246, exerciseType: 'sports', metValue: 9.0 },
  { id: 'ex_s048', nameJa: 'カポエラ', nameEn: 'Capoeira', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 247, exerciseType: 'sports', metValue: 8.0 },
  { id: 'ex_s049', nameJa: 'ブラジリアン柔術', nameEn: 'Brazilian Jiu-Jitsu', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 248, exerciseType: 'sports', metValue: 7.5 },
  { id: 'ex_s050', nameJa: 'レスリング', nameEn: 'Wrestling', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 249, exerciseType: 'sports', metValue: 7.5 },
  { id: 'ex_s051', nameJa: 'バスケットボール（ストリート）', nameEn: 'Streetball', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 250, exerciseType: 'sports', metValue: 6.5 },
  { id: 'ex_s052', nameJa: 'スリーオンスリー', nameEn: '3-on-3 Basketball', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 251, exerciseType: 'sports', metValue: 7.5 },
  { id: 'ex_s053', nameJa: 'フットサル', nameEn: 'Futsal', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 252, exerciseType: 'sports', metValue: 8.5 },
  { id: 'ex_s054', nameJa: 'フリスビー（アルティメット）', nameEn: 'Ultimate Frisbee', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 253, exerciseType: 'sports', metValue: 8.0 },
  { id: 'ex_s055', nameJa: 'バドミントン（練習）', nameEn: 'Badminton (practice)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 254, exerciseType: 'sports', metValue: 5.5 },
  { id: 'ex_s056', nameJa: '卓球（試合）', nameEn: 'Table Tennis (competitive)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 255, exerciseType: 'sports', metValue: 5.0 },
  { id: 'ex_s057', nameJa: 'ピックルボール', nameEn: 'Pickleball', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 256, exerciseType: 'sports', metValue: 5.0 },
  { id: 'ex_s058', nameJa: 'ラケットボール', nameEn: 'Racquetball', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 257, exerciseType: 'sports', metValue: 7.0 },
  { id: 'ex_s059', nameJa: 'ソフトボール', nameEn: 'Softball', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 258, exerciseType: 'sports', metValue: 5.0 },
  { id: 'ex_s060', nameJa: 'クリケット', nameEn: 'Cricket', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 259, exerciseType: 'sports', metValue: 4.8 },
  { id: 'ex_s061', nameJa: 'ラクロス', nameEn: 'Lacrosse', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 260, exerciseType: 'sports', metValue: 8.0 },
  { id: 'ex_s062', nameJa: 'ホッケー（アイス）', nameEn: 'Ice Hockey', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 261, exerciseType: 'sports', metValue: 8.0 },
  { id: 'ex_s063', nameJa: 'ローラーホッケー', nameEn: 'Roller Hockey', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 262, exerciseType: 'sports', metValue: 7.0 },
  { id: 'ex_s064', nameJa: 'フィギュアスケート', nameEn: 'Figure Skating', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 263, exerciseType: 'sports', metValue: 7.5 },
  { id: 'ex_s065', nameJa: 'ローラーブレード', nameEn: 'Rollerblading', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 264, exerciseType: 'sports', metValue: 7.5 },
  { id: 'ex_s066', nameJa: 'スキージャンプ', nameEn: 'Ski Jumping', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 265, exerciseType: 'sports', metValue: 7.0 },
  { id: 'ex_s067', nameJa: 'モーグル', nameEn: 'Moguls Skiing', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 266, exerciseType: 'sports', metValue: 8.0 },
  { id: 'ex_s068', nameJa: 'ウォーターポロ', nameEn: 'Water Polo', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 267, exerciseType: 'sports', metValue: 10.0 },
  { id: 'ex_s069', nameJa: 'ヨット', nameEn: 'Sailing', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 268, exerciseType: 'sports', metValue: 3.0 },
  { id: 'ex_s070', nameJa: 'ウィンドサーフィン', nameEn: 'Windsurfing', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 269, exerciseType: 'sports', metValue: 5.5 },
  { id: 'ex_s071', nameJa: 'ジェットスキー', nameEn: 'Jet Skiing', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 270, exerciseType: 'sports', metValue: 7.0 },
  { id: 'ex_s072', nameJa: 'スキューバダイビング', nameEn: 'Scuba Diving', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 271, exerciseType: 'sports', metValue: 7.0 },
  { id: 'ex_s073', nameJa: '乗馬', nameEn: 'Horseback Riding', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 272, exerciseType: 'sports', metValue: 5.5 },
  { id: 'ex_s074', nameJa: 'パルクール', nameEn: 'Parkour', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 273, exerciseType: 'sports', metValue: 9.0 },

  // === モビリティ / ストレッチ (Mobility / Stretching) additions ex_m036..ex_m059 (24 件) ===
  { id: 'ex_m036', nameJa: 'PNF ストレッチ（ハム）', nameEn: 'PNF Stretch (Hamstring)', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'stretching', sortOrder: 435, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_m037', nameJa: 'PNF ストレッチ（肩）', nameEn: 'PNF Stretch (Shoulder)', muscleGroup: 'shoulders', secondaryMuscles: null, equipment: 'stretching', sortOrder: 436, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_m038', nameJa: 'ロックバック', nameEn: 'Rock Back', muscleGroup: 'back', secondaryMuscles: ['legs'], equipment: 'stretching', sortOrder: 437, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_m039', nameJa: 'スレッダーストレッチ', nameEn: 'Threader Stretch', muscleGroup: 'shoulders', secondaryMuscles: ['back'], equipment: 'stretching', sortOrder: 438, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m040', nameJa: '股関節サークル', nameEn: 'Hip Circles', muscleGroup: 'legs', secondaryMuscles: ['core'], equipment: 'stretching', sortOrder: 439, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_m041', nameJa: 'スパイダーマンストレッチ', nameEn: 'Spiderman Stretch', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 440, exerciseType: 'other', metValue: 3.0 },
  { id: 'ex_m042', nameJa: 'ヒッププレイス', nameEn: 'Hip Prying', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'stretching', sortOrder: 441, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_m043', nameJa: 'スクワットフロー', nameEn: 'Squat Flow', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 442, exerciseType: 'other', metValue: 3.5 },
  { id: 'ex_m044', nameJa: 'カウチストレッチ', nameEn: 'Couch Stretch', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'stretching', sortOrder: 443, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m045', nameJa: 'ジャーマンハングストレッチ', nameEn: 'German Hang Stretch', muscleGroup: 'shoulders', secondaryMuscles: ['core'], equipment: 'stretching', sortOrder: 444, exerciseType: 'other', metValue: 3.0 },
  { id: 'ex_m046', nameJa: 'デッドハング', nameEn: 'Dead Hang', muscleGroup: 'shoulders', secondaryMuscles: ['arms'], equipment: 'stretching', sortOrder: 445, exerciseType: 'other', metValue: 3.0 },
  { id: 'ex_m047', nameJa: 'バタフライストレッチ', nameEn: 'Butterfly Stretch', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'stretching', sortOrder: 446, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m048', nameJa: 'リクライニングツイスト', nameEn: 'Reclining Twist', muscleGroup: 'core', secondaryMuscles: ['back'], equipment: 'stretching', sortOrder: 447, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m049', nameJa: 'ねこのびのびポーズ', nameEn: 'Puppy Pose', muscleGroup: 'back', secondaryMuscles: ['shoulders'], equipment: 'stretching', sortOrder: 448, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m050', nameJa: 'スフィンクスポーズ', nameEn: 'Sphinx Pose', muscleGroup: 'back', secondaryMuscles: null, equipment: 'stretching', sortOrder: 449, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m051', nameJa: 'ハッピーベイビーポーズ', nameEn: 'Happy Baby Pose', muscleGroup: 'legs', secondaryMuscles: ['back'], equipment: 'stretching', sortOrder: 450, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m052', nameJa: 'シーテッドフォワードフォールド', nameEn: 'Seated Forward Fold', muscleGroup: 'legs', secondaryMuscles: ['back'], equipment: 'stretching', sortOrder: 451, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_m053', nameJa: 'スタンディングフォワードフォールド', nameEn: 'Standing Forward Fold', muscleGroup: 'legs', secondaryMuscles: ['back'], equipment: 'stretching', sortOrder: 452, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_m054', nameJa: 'ハーフピジョンポーズ', nameEn: 'Half Pigeon Pose', muscleGroup: 'legs', secondaryMuscles: null, equipment: 'stretching', sortOrder: 453, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_m055', nameJa: 'マウンテンポーズ', nameEn: 'Mountain Pose', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 454, exerciseType: 'other', metValue: 2.0 },
  { id: 'ex_m056', nameJa: 'ウォリアー I', nameEn: 'Warrior I', muscleGroup: 'legs', secondaryMuscles: ['core'], equipment: 'stretching', sortOrder: 455, exerciseType: 'other', metValue: 3.0 },
  { id: 'ex_m057', nameJa: 'ウォリアー II', nameEn: 'Warrior II', muscleGroup: 'legs', secondaryMuscles: ['core'], equipment: 'stretching', sortOrder: 456, exerciseType: 'other', metValue: 3.0 },
  { id: 'ex_m058', nameJa: 'トライアングルポーズ', nameEn: 'Triangle Pose', muscleGroup: 'core', secondaryMuscles: ['legs'], equipment: 'stretching', sortOrder: 457, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_m059', nameJa: 'ブリッジポーズ（ヨガ）', nameEn: 'Bridge Pose (Yoga)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 458, exerciseType: 'other', metValue: 3.0 },

  // === その他 (Other functional / lifestyle / yoga / pilates) additions ex_o026..ex_o065 (40 件) ===
  { id: 'ex_o026', nameJa: 'ヨガフロー', nameEn: 'Yoga Flow', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 325, exerciseType: 'other', metValue: 3.5 },
  { id: 'ex_o027', nameJa: 'ホットヨガ', nameEn: 'Hot Yoga', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 326, exerciseType: 'other', metValue: 5.0 },
  { id: 'ex_o028', nameJa: 'インヨガ', nameEn: 'Yin Yoga', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 327, exerciseType: 'other', metValue: 2.0 },
  { id: 'ex_o029', nameJa: 'ヴィンヤサヨガ', nameEn: 'Vinyasa Yoga', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 328, exerciseType: 'other', metValue: 4.0 },
  { id: 'ex_o030', nameJa: 'アシュタンガヨガ', nameEn: 'Ashtanga Yoga', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 329, exerciseType: 'other', metValue: 4.5 },
  { id: 'ex_o031', nameJa: 'リストラティブヨガ', nameEn: 'Restorative Yoga', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 330, exerciseType: 'other', metValue: 1.8 },
  { id: 'ex_o032', nameJa: 'ピラティスマット', nameEn: 'Pilates (Mat)', muscleGroup: 'core', secondaryMuscles: ['full_body'], equipment: 'stretching', sortOrder: 331, exerciseType: 'other', metValue: 3.0 },
  { id: 'ex_o033', nameJa: 'ピラティスリフォーマー', nameEn: 'Pilates (Reformer)', muscleGroup: 'core', secondaryMuscles: ['full_body'], equipment: 'machine', sortOrder: 332, exerciseType: 'other', metValue: 4.0 },
  { id: 'ex_o034', nameJa: 'ピラティス（バレル）', nameEn: 'Pilates (Barrel)', muscleGroup: 'core', secondaryMuscles: ['back'], equipment: 'machine', sortOrder: 333, exerciseType: 'other', metValue: 3.5 },
  { id: 'ex_o035', nameJa: 'バー (Barre)', nameEn: 'Barre Workout', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 334, exerciseType: 'other', metValue: 4.0 },
  { id: 'ex_o036', nameJa: 'カリステニクス', nameEn: 'Calisthenics', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'bodyweight', sortOrder: 335, exerciseType: 'other', metValue: 5.5 },
  { id: 'ex_o037', nameJa: 'アニマルフロー', nameEn: 'Animal Flow', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'bodyweight', sortOrder: 336, exerciseType: 'other', metValue: 5.0 },
  { id: 'ex_o038', nameJa: 'モビリティセッション', nameEn: 'Mobility Session', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 337, exerciseType: 'other', metValue: 3.5 },
  { id: 'ex_o039', nameJa: 'クールダウン', nameEn: 'Cool Down', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 338, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_o040', nameJa: 'ウォームアップセッション', nameEn: 'Warm Up Session', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 339, exerciseType: 'other', metValue: 4.0 },
  { id: 'ex_o041', nameJa: '動的ストレッチセッション', nameEn: 'Dynamic Stretching Session', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 340, exerciseType: 'other', metValue: 3.5 },
  { id: 'ex_o042', nameJa: '静的ストレッチセッション', nameEn: 'Static Stretching Session', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 341, exerciseType: 'other', metValue: 2.3 },
  { id: 'ex_o043', nameJa: 'リカバリーセッション', nameEn: 'Recovery Session', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 342, exerciseType: 'other', metValue: 2.0 },
  { id: 'ex_o044', nameJa: 'フォームローラーセッション', nameEn: 'Foam Rolling Session', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 343, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_o045', nameJa: 'マッサージガン', nameEn: 'Massage Gun Recovery', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'other', sortOrder: 344, exerciseType: 'other', metValue: 2.0 },
  { id: 'ex_o046', nameJa: 'バランスボードトレーニング', nameEn: 'Balance Board Training', muscleGroup: 'full_body', secondaryMuscles: ['core'], equipment: 'other', sortOrder: 345, exerciseType: 'other', metValue: 3.5 },
  { id: 'ex_o047', nameJa: 'BOSU ボールトレーニング', nameEn: 'BOSU Ball Training', muscleGroup: 'full_body', secondaryMuscles: ['core'], equipment: 'other', sortOrder: 346, exerciseType: 'other', metValue: 4.0 },
  { id: 'ex_o048', nameJa: 'スイスボールトレーニング', nameEn: 'Swiss Ball Training', muscleGroup: 'core', secondaryMuscles: ['full_body'], equipment: 'other', sortOrder: 347, exerciseType: 'other', metValue: 3.5 },
  { id: 'ex_o049', nameJa: 'サスペンショントレーナー', nameEn: 'Suspension Trainer', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'other', sortOrder: 348, exerciseType: 'other', metValue: 5.0 },
  { id: 'ex_o050', nameJa: 'バンドサーキット', nameEn: 'Band Circuit', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'other', sortOrder: 349, exerciseType: 'other', metValue: 4.5 },
  { id: 'ex_o051', nameJa: 'メディシンボールサーキット', nameEn: 'Medicine Ball Circuit', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'other', sortOrder: 350, exerciseType: 'other', metValue: 6.0 },
  { id: 'ex_o052', nameJa: 'バランスパッドトレーニング', nameEn: 'Balance Pad Training', muscleGroup: 'full_body', secondaryMuscles: ['core'], equipment: 'other', sortOrder: 351, exerciseType: 'other', metValue: 3.0 },
  { id: 'ex_o053', nameJa: 'プロモビリティ', nameEn: 'Pro Mobility Routine', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 352, exerciseType: 'other', metValue: 3.5 },
  { id: 'ex_o054', nameJa: '呼吸法（深呼吸）', nameEn: 'Deep Breathing', muscleGroup: 'core', secondaryMuscles: null, equipment: null, sortOrder: 353, exerciseType: 'other', metValue: 1.3 },
  { id: 'ex_o055', nameJa: '呼吸法（ウィム・ホフ）', nameEn: 'Wim Hof Breathing', muscleGroup: 'core', secondaryMuscles: null, equipment: null, sortOrder: 354, exerciseType: 'other', metValue: 1.5 },
  { id: 'ex_o056', nameJa: 'ジムでの軽い歩行', nameEn: 'Gym Walking (between sets)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 355, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_o057', nameJa: 'ストレッチクラス', nameEn: 'Stretch Class', muscleGroup: 'full_body', secondaryMuscles: null, equipment: 'stretching', sortOrder: 356, exerciseType: 'other', metValue: 2.5 },
  { id: 'ex_o058', nameJa: 'バックパッキング', nameEn: 'Backpacking', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 357, exerciseType: 'other', metValue: 7.0 },
  { id: 'ex_o059', nameJa: 'マウンテンハイキング', nameEn: 'Mountain Hiking', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 358, exerciseType: 'other', metValue: 7.3 },
  { id: 'ex_o060', nameJa: '介護（中強度）', nameEn: 'Caregiving (moderate)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 359, exerciseType: 'other', metValue: 3.0 },
  { id: 'ex_o061', nameJa: '子供を抱っこ', nameEn: 'Carrying Child', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 360, exerciseType: 'other', metValue: 3.0 },
  { id: 'ex_o062', nameJa: '保育園送迎（自転車）', nameEn: 'Childcare Drop-off (bike)', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 361, exerciseType: 'other', metValue: 5.0 },
  { id: 'ex_o063', nameJa: 'ペット遊び（活発）', nameEn: 'Active Pet Play', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 362, exerciseType: 'other', metValue: 4.0 },
  { id: 'ex_o064', nameJa: '農作業', nameEn: 'Farm Work', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 363, exerciseType: 'other', metValue: 5.5 },
  { id: 'ex_o065', nameJa: '建設作業', nameEn: 'Construction Work', muscleGroup: 'full_body', secondaryMuscles: null, equipment: null, sortOrder: 364, exerciseType: 'other', metValue: 6.0 },
];
