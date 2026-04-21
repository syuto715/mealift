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
];
