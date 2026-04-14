import { MuscleGroup } from '../types/common';

export interface ExerciseDefinition {
  id: string;
  nameJa: string;
  nameEn: string;
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[] | null;
  equipment: string | null;
  sortOrder: number;
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
];
