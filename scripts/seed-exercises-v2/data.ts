// EXERCISES_V2 — full skeleton dataset for Build 15 / Feature 5-A.
//
// Phase 2A scope: per the Session 5 sign-off plan, this file holds
// the SKELETON (slug / name_ja / name_en / primary_muscle / equipment
// 8-cat / is_compound / movement_pattern) for every strength exercise
// the app should know about post-build-15. Form cues, rep ranges, and
// video URLs land later — form_cue_ja in Phase 2B (batched commits),
// rep_range_low/high also in Phase 2B, video_url deferred to Build 16+.
//
// Coverage:
//   - Existing 43 strength rows from src/constants/exercises.ts (ex_001..063)
//     get their new v2 fields populated. v25 migration already
//     backfilled slug + 8-cat equipment for these IDs; this file
//     UPSERTs by slug to fill primary_muscle / movement_pattern /
//     is_compound on top.
//   - ~107 new strength entries (ex_064..ex_170) covering common
//     variations the existing 43 lacked: incline/decline variants,
//     cable / machine alternates, glute-focused movements, forearm
//     work, additional core patterns, olympic lift accessories.
//
// Cardio (ex_c001..c018), sports (ex_s001..s019), and other (ex_o001..o005)
// are NOT in this file — they have no slug + their existing
// EXERCISES const entry continues to seed via INSERT OR IGNORE.
//
// Naming conventions (slug):
//   - Compound with equipment differentiator: <movement>_<equipment>
//     e.g. bench_press_barbell, bench_press_dumbbell
//   - Bodyweight or unambiguous: bare <movement>
//     e.g. push_up, pull_up, plank, dips
//   - Variation prefix: <variation>_<movement>_<equipment>
//     e.g. incline_bench_press_barbell, sumo_deadlift_barbell
//
// Sort_order: existing rows keep their numbers (ex_001..063 use 1-63
// in the canonical seed). New rows use 64+ for additions, grouped
// by muscle so the picker stays organized:
//   chest:     64-79
//   back:      80-99
//   shoulders: 100-119
//   legs:      120-149
//   arms:      150-169
//   core:      170-189 (some new only — existing core uses 50-55)
//   full body: 190-199

import type { MovementPattern } from '../../src/types/workout';
import type { EquipmentKey } from '../../src/constants/equipment';
import type { MuscleGroup } from '../../src/types/common';

export interface ExerciseV2Row {
  id: string;
  slug: string;
  name_ja: string;
  name_en: string;
  // Coarse muscle group (existing column, used for picker filter chips).
  muscle_group: MuscleGroup;
  // Finer-grained primary muscle. e.g. 'chest_upper', 'back_lat'.
  primary_muscle: string;
  equipment: EquipmentKey;
  is_compound: boolean;
  movement_pattern: MovementPattern;
  sort_order: number;
  // Phase 2B fields — populated batch-by-batch (chest+back first, then
  // shoulders+arms, then legs, then core+full-body). Optional so
  // unpopulated rows compile while their batch is pending. run.ts
  // binds NULL when missing.
  form_cue_ja?: string;
  rep_range_low?: number;
  rep_range_high?: number;
  // exercise_type defaults to 'strength' for everything in this file.
  // exercise_type: 'strength' (implicit; UPSERT sets it explicitly)
}

export const EXERCISES_V2: readonly ExerciseV2Row[] = [
  // ============================================================
  // CHEST (existing 6 + 12 new = 18)
  // ============================================================
  // existing
  { id: 'ex_001', slug: 'bench_press_barbell', name_ja: 'ベンチプレス', name_en: 'Bench Press (Barbell)', muscle_group: 'chest', primary_muscle: 'chest_mid', equipment: 'barbell', is_compound: true, movement_pattern: 'horizontal_push', sort_order: 1, form_cue_ja: '肩甲骨を寄せて胸を張り、バーを乳頭の少し下に下ろす。肘は脇から 75 度を保つ。', rep_range_low: 5, rep_range_high: 8 },
  { id: 'ex_002', slug: 'incline_bench_press_barbell', name_ja: 'インクラインベンチプレス', name_en: 'Incline Bench Press (Barbell)', muscle_group: 'chest', primary_muscle: 'chest_upper', equipment: 'barbell', is_compound: true, movement_pattern: 'horizontal_push', sort_order: 2, form_cue_ja: 'ベンチを 30-45 度に設定。バーを鎖骨の上に下ろし、肘を脇から 60 度くらいで保つ。', rep_range_low: 6, rep_range_high: 10 },
  { id: 'ex_003', slug: 'dumbbell_fly', name_ja: 'ダンベルフライ', name_en: 'Dumbbell Fly', muscle_group: 'chest', primary_muscle: 'chest_mid', equipment: 'dumbbell', is_compound: false, movement_pattern: 'isolation_fly', sort_order: 3, form_cue_ja: '肘を軽く曲げたまま固定し、ダンベルを弧を描いて開く。胸が伸びる感覚で止める。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_004', slug: 'chest_press_machine', name_ja: 'チェストプレス', name_en: 'Chest Press (Machine)', muscle_group: 'chest', primary_muscle: 'chest_mid', equipment: 'machine', is_compound: true, movement_pattern: 'horizontal_push', sort_order: 4, form_cue_ja: 'シートはハンドルが乳頭と水平になる高さに調整。背中をパッドにつけて押し出す。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_005', slug: 'push_up', name_ja: '腕立て伏せ', name_en: 'Push Up', muscle_group: 'chest', primary_muscle: 'chest_mid', equipment: 'bodyweight', is_compound: true, movement_pattern: 'horizontal_push', sort_order: 5, form_cue_ja: '体を一直線に保ち、肘を 45 度開いて胸を地面に近づける。腹圧を入れて腰の沈みを防ぐ。', rep_range_low: 10, rep_range_high: 20 },
  { id: 'ex_006', slug: 'bench_press_dumbbell', name_ja: 'ダンベルベンチプレス', name_en: 'Bench Press (Dumbbell)', muscle_group: 'chest', primary_muscle: 'chest_mid', equipment: 'dumbbell', is_compound: true, movement_pattern: 'horizontal_push', sort_order: 6, form_cue_ja: 'ダンベルを乳頭の真上から下ろし、肘を脇から 60 度に保つ。手首は前腕の真上で固定。', rep_range_low: 6, rep_range_high: 10 },
  // new
  { id: 'ex_064', slug: 'incline_bench_press_dumbbell', name_ja: 'インクラインダンベルプレス', name_en: 'Incline Bench Press (Dumbbell)', muscle_group: 'chest', primary_muscle: 'chest_upper', equipment: 'dumbbell', is_compound: true, movement_pattern: 'horizontal_push', sort_order: 64, form_cue_ja: '30-45 度ベンチで、ダンベルを鎖骨の上に下ろす。可動域は肩で痛みを感じない範囲まで。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_065', slug: 'decline_bench_press_barbell', name_ja: 'デクラインベンチプレス', name_en: 'Decline Bench Press (Barbell)', muscle_group: 'chest', primary_muscle: 'chest_lower', equipment: 'barbell', is_compound: true, movement_pattern: 'horizontal_push', sort_order: 65, form_cue_ja: '足を固定して上半身を 15-30 度傾ける。バーを胸の下部に下ろす。重量管理を慎重に。', rep_range_low: 6, rep_range_high: 10 },
  { id: 'ex_066', slug: 'decline_bench_press_dumbbell', name_ja: 'デクラインダンベルプレス', name_en: 'Decline Bench Press (Dumbbell)', muscle_group: 'chest', primary_muscle: 'chest_lower', equipment: 'dumbbell', is_compound: true, movement_pattern: 'horizontal_push', sort_order: 66, form_cue_ja: 'デクラインで肘を 60 度開いて胸の下部に下ろす。腕の可動範囲は無理せず。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_067', slug: 'incline_dumbbell_fly', name_ja: 'インクラインダンベルフライ', name_en: 'Incline Dumbbell Fly', muscle_group: 'chest', primary_muscle: 'chest_upper', equipment: 'dumbbell', is_compound: false, movement_pattern: 'isolation_fly', sort_order: 67, form_cue_ja: 'インクラインで肘を軽く曲げて固定。ダンベルを弧を描いて開き、胸の上部のストレッチを感じる。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_068', slug: 'cable_crossover_high', name_ja: 'ケーブルクロスオーバー（ハイ）', name_en: 'Cable Crossover (High to Low)', muscle_group: 'chest', primary_muscle: 'chest_lower', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_fly', sort_order: 68, form_cue_ja: '上から下に弧を描いて引き寄せ、胸の中央で軽く交差。肘の角度を一定に保つ。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_069', slug: 'cable_crossover_low', name_ja: 'ケーブルクロスオーバー（ロー）', name_en: 'Cable Crossover (Low to High)', muscle_group: 'chest', primary_muscle: 'chest_upper', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_fly', sort_order: 69, form_cue_ja: '下から上に持ち上げて胸の前で合わせる。胸の上部を強調する動き。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_070', slug: 'pec_deck_machine', name_ja: 'ペックデック', name_en: 'Pec Deck (Machine)', muscle_group: 'chest', primary_muscle: 'chest_mid', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_fly', sort_order: 70, form_cue_ja: 'シートを胸の高さに合わせ、肘でパッドを押す。胸の中央で 1 秒止めて収縮を意識。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_071', slug: 'dumbbell_pullover', name_ja: 'ダンベルプルオーバー', name_en: 'Dumbbell Pullover', muscle_group: 'chest', primary_muscle: 'chest_upper', equipment: 'dumbbell', is_compound: false, movement_pattern: 'isolation_fly', sort_order: 71, form_cue_ja: 'ベンチに仰向けで寝て、両手でダンベルを持ち、頭の後ろまでストレッチ。胸とラットを伸ばす。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_072', slug: 'bench_press_smith', name_ja: 'スミスマシンベンチプレス', name_en: 'Smith Machine Bench Press', muscle_group: 'chest', primary_muscle: 'chest_mid', equipment: 'machine', is_compound: true, movement_pattern: 'horizontal_push', sort_order: 72, form_cue_ja: '軌道が固定されているので、足の踏ん張りと肩甲骨の固定に集中。フリーウェイトより重量を扱える。', rep_range_low: 6, rep_range_high: 10 },
  { id: 'ex_073', slug: 'incline_push_up', name_ja: 'インクラインプッシュアップ', name_en: 'Incline Push Up', muscle_group: 'chest', primary_muscle: 'chest_lower', equipment: 'bodyweight', is_compound: true, movement_pattern: 'horizontal_push', sort_order: 73, form_cue_ja: '手を高い位置に置き、胸の下部を狙う。フォームが崩れにくいので初心者向け。', rep_range_low: 10, rep_range_high: 20 },
  { id: 'ex_074', slug: 'decline_push_up', name_ja: 'デクラインプッシュアップ', name_en: 'Decline Push Up', muscle_group: 'chest', primary_muscle: 'chest_upper', equipment: 'bodyweight', is_compound: true, movement_pattern: 'horizontal_push', sort_order: 74, form_cue_ja: '足を高い位置に置き、胸の上部を狙う。バランスを保つために腹圧を強く入れる。', rep_range_low: 8, rep_range_high: 15 },
  { id: 'ex_075', slug: 'diamond_push_up', name_ja: 'ダイヤモンドプッシュアップ', name_en: 'Diamond Push Up', muscle_group: 'chest', primary_muscle: 'chest_mid', equipment: 'bodyweight', is_compound: true, movement_pattern: 'horizontal_push', sort_order: 75, form_cue_ja: '両手の親指と人差し指でダイヤ形を作り、胸の下に置く。三頭筋と胸の中央を狙う。', rep_range_low: 8, rep_range_high: 15 },

  // ============================================================
  // BACK (existing 6 + 16 new = 22)
  // ============================================================
  // existing
  { id: 'ex_010', slug: 'deadlift_barbell', name_ja: 'デッドリフト', name_en: 'Deadlift (Barbell)', muscle_group: 'back', primary_muscle: 'back_lower', equipment: 'barbell', is_compound: true, movement_pattern: 'hinge', sort_order: 10, form_cue_ja: 'バーを足の真上、すねに近づけて構える。胸を張り、腰ではなく股関節から上げる。', rep_range_low: 5, rep_range_high: 8 },
  { id: 'ex_011', slug: 'pull_up', name_ja: '懸垂', name_en: 'Pull Up', muscle_group: 'back', primary_muscle: 'back_lat', equipment: 'bodyweight', is_compound: true, movement_pattern: 'vertical_pull', sort_order: 11, form_cue_ja: '肩甲骨を下制してから引き、顎をバー上まで上げる。降ろす時も肩がすくまないよう肩甲下を意識。', rep_range_low: 5, rep_range_high: 10 },
  { id: 'ex_012', slug: 'lat_pulldown_machine', name_ja: 'ラットプルダウン', name_en: 'Lat Pulldown', muscle_group: 'back', primary_muscle: 'back_lat', equipment: 'machine', is_compound: true, movement_pattern: 'vertical_pull', sort_order: 12, form_cue_ja: '肩を下げてからバーを鎖骨に引き寄せる。背中を反らせず、肘を体の横に向ける。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_013', slug: 'barbell_row', name_ja: 'バーベルロウ', name_en: 'Barbell Row', muscle_group: 'back', primary_muscle: 'back_mid', equipment: 'barbell', is_compound: true, movement_pattern: 'horizontal_pull', sort_order: 13, form_cue_ja: '股関節から 45 度前傾し、バーをへそに引き寄せる。腰は丸めず、肘を後方に引く意識。', rep_range_low: 6, rep_range_high: 10 },
  { id: 'ex_014', slug: 'dumbbell_row', name_ja: 'ダンベルロウ', name_en: 'Dumbbell Row', muscle_group: 'back', primary_muscle: 'back_mid', equipment: 'dumbbell', is_compound: true, movement_pattern: 'horizontal_pull', sort_order: 14, form_cue_ja: 'ベンチに片手をつき、ダンベルを腰に向けて引き上げる。肩甲骨を寄せて完全に収縮。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_015', slug: 'seated_row_machine', name_ja: 'シーテッドロウ', name_en: 'Seated Row (Machine)', muscle_group: 'back', primary_muscle: 'back_mid', equipment: 'machine', is_compound: true, movement_pattern: 'horizontal_pull', sort_order: 15, form_cue_ja: '胸をパッドにつけ、肘を後方に引く。肩甲骨を寄せきって 1 秒止める。', rep_range_low: 8, rep_range_high: 12 },
  // new
  { id: 'ex_080', slug: 'sumo_deadlift_barbell', name_ja: 'スモウデッドリフト', name_en: 'Sumo Deadlift', muscle_group: 'back', primary_muscle: 'back_lower', equipment: 'barbell', is_compound: true, movement_pattern: 'hinge', sort_order: 80, form_cue_ja: '足幅広く、つま先を 30-45 度外に向ける。バーを足の中心、胸を張って引く。', rep_range_low: 5, rep_range_high: 8 },
  { id: 'ex_081', slug: 'trap_bar_deadlift', name_ja: 'トラップバーデッドリフト', name_en: 'Trap Bar Deadlift', muscle_group: 'back', primary_muscle: 'back_lower', equipment: 'barbell', is_compound: true, movement_pattern: 'hinge', sort_order: 81, form_cue_ja: 'トラップバーの中央に立ち、ハンドルを握る。背中をニュートラルに保ち、股関節と膝で同時に押し上げる。', rep_range_low: 5, rep_range_high: 8 },
  { id: 'ex_082', slug: 'rack_pull', name_ja: 'ラックプル', name_en: 'Rack Pull', muscle_group: 'back', primary_muscle: 'back_lower', equipment: 'barbell', is_compound: true, movement_pattern: 'hinge', sort_order: 82, form_cue_ja: 'ピンをバーが膝の高さに来るよう設定。引き上げて上背部とトラップを強調。', rep_range_low: 5, rep_range_high: 8 },
  { id: 'ex_083', slug: 'chin_up', name_ja: 'チンニング（逆手懸垂）', name_en: 'Chin Up', muscle_group: 'back', primary_muscle: 'back_lat', equipment: 'bodyweight', is_compound: true, movement_pattern: 'vertical_pull', sort_order: 83, form_cue_ja: '逆手 (掌を顔向き) で握り、顎をバー上まで引き上げる。二頭筋関与が増える。', rep_range_low: 5, rep_range_high: 10 },
  { id: 'ex_084', slug: 'neutral_grip_pull_up', name_ja: 'ニュートラルグリップ懸垂', name_en: 'Neutral Grip Pull Up', muscle_group: 'back', primary_muscle: 'back_lat', equipment: 'bodyweight', is_compound: true, movement_pattern: 'vertical_pull', sort_order: 84, form_cue_ja: '掌を向かい合わせ、肘を体に近づけて引く。肩への負担が pull-up より軽い。', rep_range_low: 5, rep_range_high: 10 },
  { id: 'ex_085', slug: 't_bar_row', name_ja: 'Tバーロウ', name_en: 'T-Bar Row', muscle_group: 'back', primary_muscle: 'back_mid', equipment: 'machine', is_compound: true, movement_pattern: 'horizontal_pull', sort_order: 85, form_cue_ja: 'バー先端を胸の下に引き寄せる。背中を平らに保ち、肘を体に近く保つ。', rep_range_low: 6, rep_range_high: 10 },
  { id: 'ex_086', slug: 'single_arm_dumbbell_row', name_ja: 'ワンハンドダンベルロウ', name_en: 'Single-Arm Dumbbell Row', muscle_group: 'back', primary_muscle: 'back_mid', equipment: 'dumbbell', is_compound: true, movement_pattern: 'horizontal_pull', sort_order: 86, form_cue_ja: 'ベンチに片膝と片手を置き、もう片手でダンベルを腰に引く。捻りを入れず安定して引く。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_087', slug: 'inverted_row', name_ja: 'インバーテッドロウ', name_en: 'Inverted Row', muscle_group: 'back', primary_muscle: 'back_mid', equipment: 'bodyweight', is_compound: true, movement_pattern: 'horizontal_pull', sort_order: 87, form_cue_ja: 'バーの下に仰向けで体を直線に保つ。胸をバーに引き寄せ、肩甲骨を寄せる。初心者向け pull-up 代替。', rep_range_low: 8, rep_range_high: 15 },
  { id: 'ex_088', slug: 'cable_row_seated', name_ja: 'ケーブルロウ', name_en: 'Cable Row', muscle_group: 'back', primary_muscle: 'back_mid', equipment: 'machine', is_compound: true, movement_pattern: 'horizontal_pull', sort_order: 88, form_cue_ja: '胸を張り、肘を後方に引く。腰を丸めず、肩を下制したまま動かす。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_089', slug: 'face_pull', name_ja: 'フェイスプル', name_en: 'Face Pull', muscle_group: 'back', primary_muscle: 'back_traps', equipment: 'machine', is_compound: false, movement_pattern: 'horizontal_pull', sort_order: 89, form_cue_ja: 'ロープを顔の高さで引き、肘を高く保つ。リアデルトと僧帽筋中部を狙う。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_090', slug: 'shrug_barbell', name_ja: 'バーベルシュラッグ', name_en: 'Barbell Shrug', muscle_group: 'back', primary_muscle: 'back_traps', equipment: 'barbell', is_compound: false, movement_pattern: 'isolation_raise', sort_order: 90, form_cue_ja: '肩を耳に引き上げ、頂点で 1 秒止める。回さず、垂直方向のみ。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_091', slug: 'shrug_dumbbell', name_ja: 'ダンベルシュラッグ', name_en: 'Dumbbell Shrug', muscle_group: 'back', primary_muscle: 'back_traps', equipment: 'dumbbell', is_compound: false, movement_pattern: 'isolation_raise', sort_order: 91, form_cue_ja: 'ダンベルを体の横に持ち、肩を耳に向けて引き上げる。降ろす時も制御。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_092', slug: 'reverse_grip_lat_pulldown', name_ja: 'リバースグリップラットプルダウン', name_en: 'Reverse Grip Lat Pulldown', muscle_group: 'back', primary_muscle: 'back_lat', equipment: 'machine', is_compound: true, movement_pattern: 'vertical_pull', sort_order: 92, form_cue_ja: '逆手で握り、肘を体に引き寄せる。広背筋下部と二頭筋を狙う。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_093', slug: 'straight_arm_pulldown_cable', name_ja: 'ストレートアームプルダウン', name_en: 'Straight Arm Pulldown', muscle_group: 'back', primary_muscle: 'back_lat', equipment: 'machine', is_compound: false, movement_pattern: 'vertical_pull', sort_order: 93, form_cue_ja: '肘を伸ばしたまま、ロープを腿まで弧を描いて引き下げる。広背筋を孤立収縮。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_094', slug: 'good_morning_barbell', name_ja: 'グッドモーニング', name_en: 'Good Morning', muscle_group: 'back', primary_muscle: 'back_lower', equipment: 'barbell', is_compound: true, movement_pattern: 'hinge', sort_order: 94, form_cue_ja: 'バーを僧帽筋上に乗せ、股関節から上半身を前傾。膝を軽く曲げて背中をニュートラル。', rep_range_low: 6, rep_range_high: 10 },
  { id: 'ex_095', slug: 'hyperextension', name_ja: 'バックエクステンション', name_en: 'Hyperextension', muscle_group: 'back', primary_muscle: 'back_lower', equipment: 'bodyweight', is_compound: false, movement_pattern: 'hinge', sort_order: 95, form_cue_ja: '腰ではなく股関節から上体を起こす。背中を過伸展せず、ニュートラルで止める。', rep_range_low: 10, rep_range_high: 15 },

  // ============================================================
  // SHOULDERS (existing 6 + 12 new = 18)
  // ============================================================
  // existing
  { id: 'ex_020', slug: 'overhead_press_barbell', name_ja: 'オーバーヘッドプレス', name_en: 'Overhead Press (Barbell)', muscle_group: 'shoulders', primary_muscle: 'shoulder_front', equipment: 'barbell', is_compound: true, movement_pattern: 'vertical_push', sort_order: 20, form_cue_ja: 'バーを鎖骨の高さで構え、頭上に押し上げる。腰を反らさず、頭を前に出して通過させる。', rep_range_low: 5, rep_range_high: 8 },
  { id: 'ex_021', slug: 'side_raise_dumbbell', name_ja: 'サイドレイズ', name_en: 'Side Raise (Dumbbell)', muscle_group: 'shoulders', primary_muscle: 'shoulder_mid', equipment: 'dumbbell', is_compound: false, movement_pattern: 'isolation_raise', sort_order: 21, form_cue_ja: 'ダンベルを体の横に下げ、肘を軽く曲げて肩の高さまで上げる。手首は中立、上げすぎない。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_022', slug: 'front_raise_dumbbell', name_ja: 'フロントレイズ', name_en: 'Front Raise (Dumbbell)', muscle_group: 'shoulders', primary_muscle: 'shoulder_front', equipment: 'dumbbell', is_compound: false, movement_pattern: 'isolation_raise', sort_order: 22, form_cue_ja: 'ダンベルを腿の前で構え、肘を軽く曲げて肩の高さまで前方に上げる。反動を使わない。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_023', slug: 'rear_delt_fly_dumbbell', name_ja: 'リアデルトフライ', name_en: 'Rear Delt Fly (Dumbbell)', muscle_group: 'shoulders', primary_muscle: 'shoulder_rear', equipment: 'dumbbell', is_compound: false, movement_pattern: 'isolation_fly', sort_order: 23, form_cue_ja: '前傾姿勢でダンベルを下に下げ、肘を軽く曲げて両側に開く。肩甲骨を寄せず、リアデルトで挙上。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_024', slug: 'upright_row_barbell', name_ja: 'アップライトロウ', name_en: 'Upright Row (Barbell)', muscle_group: 'shoulders', primary_muscle: 'shoulder_mid', equipment: 'barbell', is_compound: true, movement_pattern: 'isolation_raise', sort_order: 24, form_cue_ja: 'バーを肩幅で握り、肘を肩の高さまで引き上げる。肩より上には上げず、肩を内旋させすぎない。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_025', slug: 'shoulder_press_dumbbell', name_ja: 'ダンベルショルダープレス', name_en: 'Shoulder Press (Dumbbell)', muscle_group: 'shoulders', primary_muscle: 'shoulder_front', equipment: 'dumbbell', is_compound: true, movement_pattern: 'vertical_push', sort_order: 25, form_cue_ja: 'ダンベルを肩の横で構え、頭上に押し上げる。肘を脇から 60-70 度に保ち、腰を反らさない。', rep_range_low: 6, rep_range_high: 10 },
  // new
  { id: 'ex_100', slug: 'arnold_press_dumbbell', name_ja: 'アーノルドプレス', name_en: 'Arnold Press', muscle_group: 'shoulders', primary_muscle: 'shoulder_front', equipment: 'dumbbell', is_compound: true, movement_pattern: 'vertical_push', sort_order: 100, form_cue_ja: 'ダンベルを掌が顔向きで構え、上げながら外旋して掌が前に向く。フル可動域で全三角筋を刺激。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_101', slug: 'shoulder_press_machine', name_ja: 'マシンショルダープレス', name_en: 'Shoulder Press (Machine)', muscle_group: 'shoulders', primary_muscle: 'shoulder_front', equipment: 'machine', is_compound: true, movement_pattern: 'vertical_push', sort_order: 101, form_cue_ja: 'ハンドルが肩の高さに来るよう調整。背中をパッドにつけ、頭上に押し上げる。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_102', slug: 'seated_shoulder_press_dumbbell', name_ja: 'シーテッドダンベルプレス', name_en: 'Seated Dumbbell Press', muscle_group: 'shoulders', primary_muscle: 'shoulder_front', equipment: 'dumbbell', is_compound: true, movement_pattern: 'vertical_push', sort_order: 102, form_cue_ja: '背もたれ付きベンチに座り、ダンベルを肩の横で構える。頭上に押し上げ、降ろす時は耳の高さまで。', rep_range_low: 6, rep_range_high: 10 },
  { id: 'ex_103', slug: 'cable_lateral_raise', name_ja: 'ケーブルサイドレイズ', name_en: 'Cable Lateral Raise', muscle_group: 'shoulders', primary_muscle: 'shoulder_mid', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_raise', sort_order: 103, form_cue_ja: '体の横にロワーケーブルを設置、肘を軽く曲げて肩の高さまで上げる。下端でもテンション維持。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_104', slug: 'cable_rear_delt_fly', name_ja: 'ケーブルリアデルトフライ', name_en: 'Cable Rear Delt Fly', muscle_group: 'shoulders', primary_muscle: 'shoulder_rear', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_fly', sort_order: 104, form_cue_ja: 'ハンドルを胸の高さで握りクロス、後方に開く。肩甲骨を寄せず、肩で動かす。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_105', slug: 'cable_front_raise', name_ja: 'ケーブルフロントレイズ', name_en: 'Cable Front Raise', muscle_group: 'shoulders', primary_muscle: 'shoulder_front', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_raise', sort_order: 105, form_cue_ja: '体の後ろからロワーケーブルを取り、肩の高さまで前方に上げる。反動を使わない。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_106', slug: 'reverse_pec_deck', name_ja: 'リバースペックデック', name_en: 'Reverse Pec Deck', muscle_group: 'shoulders', primary_muscle: 'shoulder_rear', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_fly', sort_order: 106, form_cue_ja: 'マシンに胸を向けて座り、ハンドルを後方に開く。肩甲骨を寄せず、リアデルトに集中。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_107', slug: 'machine_lateral_raise', name_ja: 'マシンサイドレイズ', name_en: 'Machine Lateral Raise', muscle_group: 'shoulders', primary_muscle: 'shoulder_mid', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_raise', sort_order: 107, form_cue_ja: 'パッドを肘の下に当て、肩の高さまで上げる。手首は中立、肩をすくめない。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_108', slug: 'push_press_barbell', name_ja: 'プッシュプレス', name_en: 'Push Press', muscle_group: 'shoulders', primary_muscle: 'shoulder_front', equipment: 'barbell', is_compound: true, movement_pattern: 'vertical_push', sort_order: 108, form_cue_ja: 'バーを鎖骨で構え、軽く膝を曲げてからの脚の反動を使い頭上に押し上げる。フル可動域で仕上げる。', rep_range_low: 5, rep_range_high: 8 },
  { id: 'ex_109', slug: 'pike_push_up', name_ja: 'パイクプッシュアップ', name_en: 'Pike Push Up', muscle_group: 'shoulders', primary_muscle: 'shoulder_front', equipment: 'bodyweight', is_compound: true, movement_pattern: 'vertical_push', sort_order: 109, form_cue_ja: '腰を高く折り、頭を床に近づけるように下ろす。手は肩幅、肘は 45 度を保つ。', rep_range_low: 8, rep_range_high: 15 },
  { id: 'ex_110', slug: 'handstand_push_up', name_ja: 'ハンドスタンドプッシュアップ', name_en: 'Handstand Push Up', muscle_group: 'shoulders', primary_muscle: 'shoulder_front', equipment: 'bodyweight', is_compound: true, movement_pattern: 'vertical_push', sort_order: 110, form_cue_ja: '壁に向かって逆立ち姿勢から、頭が床に触れる手前まで降ろし押し上げる。バランスは壁で取り、首を反らさず制御して降ろす。', rep_range_low: 5, rep_range_high: 10 },
  { id: 'ex_111', slug: 'lying_rear_delt_raise', name_ja: 'ライイングリアレイズ', name_en: 'Lying Rear Delt Raise', muscle_group: 'shoulders', primary_muscle: 'shoulder_rear', equipment: 'dumbbell', is_compound: false, movement_pattern: 'isolation_raise', sort_order: 111, form_cue_ja: 'ベンチに腹ばいになり、ダンベルを下げて両側に開く。肘を軽く曲げ、リアデルトで挙上。', rep_range_low: 10, rep_range_high: 15 },

  // ============================================================
  // LEGS (existing 8 + 23 new = 31)
  // ============================================================
  // existing
  { id: 'ex_030', slug: 'squat_barbell', name_ja: 'スクワット', name_en: 'Squat (Barbell)', muscle_group: 'legs', primary_muscle: 'legs_quad', equipment: 'barbell', is_compound: true, movement_pattern: 'squat', sort_order: 30, form_cue_ja: 'バーを僧帽筋に乗せ、足幅は肩幅。胸を張り、太腿が床と平行になるまで下げる。膝はつま先方向、腰を丸めない。', rep_range_low: 5, rep_range_high: 8 },
  { id: 'ex_031', slug: 'leg_press_machine', name_ja: 'レッグプレス', name_en: 'Leg Press', muscle_group: 'legs', primary_muscle: 'legs_quad', equipment: 'machine', is_compound: true, movement_pattern: 'squat', sort_order: 31, form_cue_ja: '足幅を肩幅に、足はパッドの中央。膝が 90 度になるまで下げ、押し戻す。腰をシートから離さない。', rep_range_low: 6, rep_range_high: 10 },
  { id: 'ex_032', slug: 'romanian_deadlift_barbell', name_ja: 'ルーマニアンデッドリフト', name_en: 'Romanian Deadlift', muscle_group: 'legs', primary_muscle: 'legs_ham', equipment: 'barbell', is_compound: true, movement_pattern: 'hinge', sort_order: 32, form_cue_ja: 'バーを腿の前で構え、膝を軽く曲げて股関節から前傾。バーを膝下までで止め、ハムストリングを伸ばす。', rep_range_low: 5, rep_range_high: 8 },
  { id: 'ex_033', slug: 'leg_curl_machine', name_ja: 'レッグカール', name_en: 'Leg Curl', muscle_group: 'legs', primary_muscle: 'legs_ham', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_curl', sort_order: 33, form_cue_ja: 'パッドを足首に当て、膝関節を曲げてかかとを臀部に近づける。下端で完全に伸ばさない。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_034', slug: 'leg_extension_machine', name_ja: 'レッグエクステンション', name_en: 'Leg Extension', muscle_group: 'legs', primary_muscle: 'legs_quad', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_extension', sort_order: 34, form_cue_ja: 'パッドをすねに当て、膝を伸ばして大腿四頭筋を収縮。頂点で 1 秒止める。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_035', slug: 'calf_raise_machine', name_ja: 'カーフレイズ', name_en: 'Calf Raise (Machine)', muscle_group: 'legs', primary_muscle: 'legs_calf', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_extension', sort_order: 35, form_cue_ja: 'パッドを肩に当て、つま先で立ち上がりかかとを最大限上げる。下端でかかとを下げてストレッチ。', rep_range_low: 12, rep_range_high: 20 },
  { id: 'ex_036', slug: 'bulgarian_split_squat_dumbbell', name_ja: 'ブルガリアンスクワット', name_en: 'Bulgarian Split Squat', muscle_group: 'legs', primary_muscle: 'legs_quad', equipment: 'dumbbell', is_compound: true, movement_pattern: 'lunge', sort_order: 36, form_cue_ja: '後ろ足をベンチに乗せ、前足で深く沈み込む。前足の膝はつま先方向、上体は直立。', rep_range_low: 6, rep_range_high: 10 },
  { id: 'ex_037', slug: 'goblet_squat_dumbbell', name_ja: 'ゴブレットスクワット', name_en: 'Goblet Squat', muscle_group: 'legs', primary_muscle: 'legs_quad', equipment: 'dumbbell', is_compound: true, movement_pattern: 'squat', sort_order: 37, form_cue_ja: 'ダンベルを胸の前で両手で持ち、足幅は肩幅。胸を張ったまま太腿が床と平行になるまで下げる。', rep_range_low: 6, rep_range_high: 10 },
  // new
  { id: 'ex_120', slug: 'front_squat_barbell', name_ja: 'フロントスクワット', name_en: 'Front Squat', muscle_group: 'legs', primary_muscle: 'legs_quad', equipment: 'barbell', is_compound: true, movement_pattern: 'squat', sort_order: 120, form_cue_ja: 'バーを鎖骨と前肩に乗せ、肘を高く保つ。胸を立てたまま太腿が床と平行になるまで下げる。', rep_range_low: 5, rep_range_high: 8 },
  { id: 'ex_121', slug: 'hack_squat_machine', name_ja: 'ハックスクワット', name_en: 'Hack Squat', muscle_group: 'legs', primary_muscle: 'legs_quad', equipment: 'machine', is_compound: true, movement_pattern: 'squat', sort_order: 121, form_cue_ja: '背中をパッドにつけ、足幅を肩幅。膝が 90 度になるまで下げ、押し戻す。腰を反らさない。', rep_range_low: 6, rep_range_high: 10 },
  { id: 'ex_122', slug: 'walking_lunge_dumbbell', name_ja: 'ウォーキングランジ', name_en: 'Walking Lunge', muscle_group: 'legs', primary_muscle: 'legs_quad', equipment: 'dumbbell', is_compound: true, movement_pattern: 'lunge', sort_order: 122, form_cue_ja: 'ダンベルを両手に持ち、前に大きく踏み出す。前足の膝が 90 度になるまで下げ、押し出して進む。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_123', slug: 'reverse_lunge_dumbbell', name_ja: 'リバースランジ', name_en: 'Reverse Lunge', muscle_group: 'legs', primary_muscle: 'legs_quad', equipment: 'dumbbell', is_compound: true, movement_pattern: 'lunge', sort_order: 123, form_cue_ja: 'ダンベルを両手に持ち、片足を後ろに大きく引く。前足で深く沈み込み、押し戻して立つ。膝への負担が前進ランジより軽い。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_124', slug: 'step_up_dumbbell', name_ja: 'ステップアップ', name_en: 'Step Up', muscle_group: 'legs', primary_muscle: 'legs_quad', equipment: 'dumbbell', is_compound: true, movement_pattern: 'lunge', sort_order: 124, form_cue_ja: 'ベンチや台にダンベルを持って片足を乗せ、その足だけで体を持ち上げる。後ろ足で押さない。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_125', slug: 'hip_thrust_barbell', name_ja: 'ヒップスラスト', name_en: 'Hip Thrust', muscle_group: 'legs', primary_muscle: 'legs_glute', equipment: 'barbell', is_compound: true, movement_pattern: 'hinge', sort_order: 125, form_cue_ja: '上背部をベンチ縁に乗せ、バーを骨盤の上に当てる。臀部を持ち上げ、肋骨を下げたまま頂点で 1 秒締める。腰を反らさない。', rep_range_low: 8, rep_range_high: 15 },
  { id: 'ex_126', slug: 'glute_bridge', name_ja: 'グルートブリッジ', name_en: 'Glute Bridge', muscle_group: 'legs', primary_muscle: 'legs_glute', equipment: 'bodyweight', is_compound: false, movement_pattern: 'hinge', sort_order: 126, form_cue_ja: '仰向けで膝を立て、足は腰幅。腰を反らさず臀部を持ち上げ、頂点で 1 秒締める。', rep_range_low: 8, rep_range_high: 15 },
  { id: 'ex_127', slug: 'single_leg_hip_thrust', name_ja: 'シングルレッグヒップスラスト', name_en: 'Single-Leg Hip Thrust', muscle_group: 'legs', primary_muscle: 'legs_glute', equipment: 'bodyweight', is_compound: false, movement_pattern: 'hinge', sort_order: 127, form_cue_ja: '上背部をベンチに乗せ、片足だけで臀部を持ち上げる。骨盤を水平に保ち、頂点で締める。', rep_range_low: 8, rep_range_high: 15 },
  { id: 'ex_128', slug: 'cable_glute_kickback', name_ja: 'ケーブルキックバック', name_en: 'Cable Glute Kickback', muscle_group: 'legs', primary_muscle: 'legs_glute', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_extension', sort_order: 128, form_cue_ja: '足首にケーブルを取り、上半身を前傾させて足を後方に押し出す。腰を反らさず、臀部で動かす。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_129', slug: 'sumo_squat_dumbbell', name_ja: 'スモウスクワット', name_en: 'Sumo Squat', muscle_group: 'legs', primary_muscle: 'legs_glute', equipment: 'dumbbell', is_compound: true, movement_pattern: 'squat', sort_order: 129, form_cue_ja: '足幅を広く、つま先を 30-45 度外向き。ダンベルを両足の間に持ち、太腿が床と平行になるまで下げる。', rep_range_low: 6, rep_range_high: 10 },
  { id: 'ex_130', slug: 'box_jump', name_ja: 'ボックスジャンプ', name_en: 'Box Jump', muscle_group: 'legs', primary_muscle: 'legs_quad', equipment: 'bodyweight', is_compound: true, movement_pattern: 'squat', sort_order: 130, form_cue_ja: '軽くしゃがんでから腕を振り上げ、ボックスにジャンプ。着地はソフトに、膝を軽く曲げて衝撃を吸収。降りる時は歩いて降り、ジャンプして降りない。', rep_range_low: 5, rep_range_high: 10 },
  { id: 'ex_131', slug: 'jump_squat', name_ja: 'ジャンプスクワット', name_en: 'Jump Squat', muscle_group: 'legs', primary_muscle: 'legs_quad', equipment: 'bodyweight', is_compound: true, movement_pattern: 'squat', sort_order: 131, form_cue_ja: 'スクワット姿勢から爆発的にジャンプし、空中で全身を伸ばす。着地時に膝を曲げて衝撃を吸収。', rep_range_low: 5, rep_range_high: 10 },
  { id: 'ex_132', slug: 'pistol_squat', name_ja: 'ピストルスクワット', name_en: 'Pistol Squat', muscle_group: 'legs', primary_muscle: 'legs_quad', equipment: 'bodyweight', is_compound: true, movement_pattern: 'squat', sort_order: 132, form_cue_ja: '片足を前に伸ばし、もう片足だけで深くしゃがむ。バランスを取り、立ち上がる時も同じ足で。難しければ TRX や手すりに掴まって補助。', rep_range_low: 5, rep_range_high: 10 },
  { id: 'ex_133', slug: 'standing_calf_raise', name_ja: 'スタンディングカーフレイズ', name_en: 'Standing Calf Raise', muscle_group: 'legs', primary_muscle: 'legs_calf', equipment: 'bodyweight', is_compound: false, movement_pattern: 'isolation_extension', sort_order: 133, form_cue_ja: '段差につま先を乗せ、かかとを下げてストレッチ、上げて最大限収縮。安定のため壁や手すりに掴まる。', rep_range_low: 12, rep_range_high: 20 },
  { id: 'ex_134', slug: 'seated_calf_raise', name_ja: 'シーテッドカーフレイズ', name_en: 'Seated Calf Raise', muscle_group: 'legs', primary_muscle: 'legs_calf', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_extension', sort_order: 134, form_cue_ja: 'パッドを膝に当て、つま先で押し上げかかとを下ろす。膝を曲げた姿勢でヒラメ筋を狙う。', rep_range_low: 12, rep_range_high: 20 },
  { id: 'ex_135', slug: 'donkey_calf_raise', name_ja: 'ドンキーカーフレイズ', name_en: 'Donkey Calf Raise', muscle_group: 'legs', primary_muscle: 'legs_calf', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_extension', sort_order: 135, form_cue_ja: '上半身を前傾、腰にパッドを乗せて、つま先で押し上げる。腓腹筋のストレッチ位置で刺激。', rep_range_low: 12, rep_range_high: 20 },
  { id: 'ex_136', slug: 'nordic_curl', name_ja: 'ノルディックカール', name_en: 'Nordic Hamstring Curl', muscle_group: 'legs', primary_muscle: 'legs_ham', equipment: 'bodyweight', is_compound: false, movement_pattern: 'isolation_curl', sort_order: 136, form_cue_ja: '膝立ちで足首を固定し、体を直立に保つ。ハムストリングでブレーキをかけながらゆっくり前傾、限界で手で受け止める。降下に 3-5 秒かける。', rep_range_low: 5, rep_range_high: 10 },
  { id: 'ex_137', slug: 'glute_ham_raise', name_ja: 'グルートハムレイズ', name_en: 'Glute Ham Raise', muscle_group: 'legs', primary_muscle: 'legs_ham', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_curl', sort_order: 137, form_cue_ja: 'グルートハムレイザーで膝と足首を固定。体を直立から前傾し、ハムで引き戻して立てる。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_138', slug: 'sissy_squat', name_ja: 'シシースクワット', name_en: 'Sissy Squat', muscle_group: 'legs', primary_muscle: 'legs_quad', equipment: 'bodyweight', is_compound: false, movement_pattern: 'squat', sort_order: 138, form_cue_ja: '踵を上げ、膝を前に出しながら後ろに反るようにしゃがむ。大腿四頭筋を孤立、ゆっくり制御し膝に注意。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_139', slug: 'wide_stance_squat_barbell', name_ja: 'ワイドスタンススクワット', name_en: 'Wide Stance Squat', muscle_group: 'legs', primary_muscle: 'legs_glute', equipment: 'barbell', is_compound: true, movement_pattern: 'squat', sort_order: 139, form_cue_ja: '足幅を肩幅より広く、つま先を 30 度外向き。臀部と内転筋を強調、太腿が床と平行になるまで下げる。', rep_range_low: 5, rep_range_high: 8 },
  { id: 'ex_140', slug: 'curtsy_lunge', name_ja: 'カーテシーランジ', name_en: 'Curtsy Lunge', muscle_group: 'legs', primary_muscle: 'legs_glute', equipment: 'bodyweight', is_compound: true, movement_pattern: 'lunge', sort_order: 140, form_cue_ja: '片足を斜め後ろに引き、もう片足の後ろを通すように下げる。前足の膝はつま先方向、臀部中部を狙う。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_141', slug: 'hip_abduction_machine', name_ja: 'アブダクション', name_en: 'Hip Abduction (Machine)', muscle_group: 'legs', primary_muscle: 'legs_glute', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_raise', sort_order: 141, form_cue_ja: 'マシンに座りパッドを外腿に当て、足を外側に開く。中臀部を孤立収縮、頂点で 1 秒止める。', rep_range_low: 12, rep_range_high: 20 },
  { id: 'ex_142', slug: 'hip_adduction_machine', name_ja: 'アダクション', name_en: 'Hip Adduction (Machine)', muscle_group: 'legs', primary_muscle: 'legs_adductor', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_raise', sort_order: 142, form_cue_ja: 'マシンに座りパッドを内腿に当て、足を内側に閉じる。内転筋を孤立収縮、頂点で 1 秒止める。', rep_range_low: 12, rep_range_high: 20 },

  // ============================================================
  // ARMS (existing 7 + 14 new = 21)
  // ============================================================
  // existing
  { id: 'ex_040', slug: 'barbell_curl', name_ja: 'バーベルカール', name_en: 'Barbell Curl', muscle_group: 'arms', primary_muscle: 'arms_biceps', equipment: 'barbell', is_compound: false, movement_pattern: 'isolation_curl', sort_order: 40, form_cue_ja: 'バーを肩幅で握り、肘を体側に固定して上げる。反動を使わず、降ろす時も制御。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_041', slug: 'dumbbell_curl', name_ja: 'ダンベルカール', name_en: 'Dumbbell Curl', muscle_group: 'arms', primary_muscle: 'arms_biceps', equipment: 'dumbbell', is_compound: false, movement_pattern: 'isolation_curl', sort_order: 41, form_cue_ja: '掌を上向きでダンベルを下げ、肘を体側に固定して上げる。頂点で二頭筋を完全収縮。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_042', slug: 'hammer_curl_dumbbell', name_ja: 'ハンマーカール', name_en: 'Hammer Curl', muscle_group: 'arms', primary_muscle: 'arms_biceps', equipment: 'dumbbell', is_compound: false, movement_pattern: 'isolation_curl', sort_order: 42, form_cue_ja: 'ダンベルを縦持ち（掌が向かい合う）で上げる。前腕の腕橈骨筋と上腕筋を狙う。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_043', slug: 'triceps_pushdown_cable', name_ja: 'トライセプスプッシュダウン', name_en: 'Triceps Pushdown', muscle_group: 'arms', primary_muscle: 'arms_triceps', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_extension', sort_order: 43, form_cue_ja: 'ケーブルを胸の高さで握り、肘を体側に固定して下まで押し下げる。肩を動かさない。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_044', slug: 'skull_crusher_barbell', name_ja: 'スカルクラッシャー', name_en: 'Skull Crusher (Barbell)', muscle_group: 'arms', primary_muscle: 'arms_triceps', equipment: 'barbell', is_compound: false, movement_pattern: 'isolation_extension', sort_order: 44, form_cue_ja: 'ベンチに仰向けでバーを胸の上で構え、肘を固定して額の上方に降ろす。肩を動かさない。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_045', slug: 'dips', name_ja: 'ディップス', name_en: 'Dips', muscle_group: 'arms', primary_muscle: 'arms_triceps', equipment: 'bodyweight', is_compound: true, movement_pattern: 'vertical_push', sort_order: 45, form_cue_ja: '平行棒で体を支え、肘を曲げて体を下げる。前傾を浅く保ち、肘を 90 度まで曲げて押し戻す。', rep_range_low: 6, rep_range_high: 12 },
  { id: 'ex_046', slug: 'concentration_curl_dumbbell', name_ja: 'コンセントレーションカール', name_en: 'Concentration Curl', muscle_group: 'arms', primary_muscle: 'arms_biceps', equipment: 'dumbbell', is_compound: false, movement_pattern: 'isolation_curl', sort_order: 46, form_cue_ja: '椅子に座り肘を内腿に固定。ダンベルを反動なしで上げ、二頭筋を完全収縮。', rep_range_low: 10, rep_range_high: 15 },
  // new
  { id: 'ex_150', slug: 'preacher_curl_barbell', name_ja: 'プリーチャーカール', name_en: 'Preacher Curl', muscle_group: 'arms', primary_muscle: 'arms_biceps', equipment: 'barbell', is_compound: false, movement_pattern: 'isolation_curl', sort_order: 150, form_cue_ja: 'パッドに上腕を乗せ、肘を固定したまま上げる。下端で完全に伸ばすが、肘を急激にロックしない。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_151', slug: 'ez_bar_curl', name_ja: 'EZバーカール', name_en: 'EZ Bar Curl', muscle_group: 'arms', primary_muscle: 'arms_biceps', equipment: 'barbell', is_compound: false, movement_pattern: 'isolation_curl', sort_order: 151, form_cue_ja: 'EZバーの内側のグリップで握り、肘を体側に固定して上げる。手首への負担が直線バーより軽い。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_152', slug: 'cable_curl', name_ja: 'ケーブルカール', name_en: 'Cable Curl', muscle_group: 'arms', primary_muscle: 'arms_biceps', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_curl', sort_order: 152, form_cue_ja: 'ロワーケーブルでバーを握り、肘を体側に固定して上げる。下端でもテンションが抜けない。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_153', slug: 'incline_dumbbell_curl', name_ja: 'インクラインダンベルカール', name_en: 'Incline Dumbbell Curl', muscle_group: 'arms', primary_muscle: 'arms_biceps', equipment: 'dumbbell', is_compound: false, movement_pattern: 'isolation_curl', sort_order: 153, form_cue_ja: '45 度のインクラインベンチで肩を後方に保ち、ダンベルを上げる。二頭筋長頭をストレッチ。', rep_range_low: 8, rep_range_high: 12 },
  { id: 'ex_154', slug: 'spider_curl', name_ja: 'スパイダーカール', name_en: 'Spider Curl', muscle_group: 'arms', primary_muscle: 'arms_biceps', equipment: 'dumbbell', is_compound: false, movement_pattern: 'isolation_curl', sort_order: 154, form_cue_ja: 'インクラインベンチに前向きで腹ばい、腕を真下に垂らしダンベルを上げる。肘を固定して二頭筋孤立。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_155', slug: 'reverse_curl', name_ja: 'リバースカール', name_en: 'Reverse Curl', muscle_group: 'arms', primary_muscle: 'arms_forearm', equipment: 'barbell', is_compound: false, movement_pattern: 'isolation_curl', sort_order: 155, form_cue_ja: '順手（掌が下）でバーを握り、肘を体側に固定して上げる。前腕伸筋群と腕橈骨筋を狙う。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_156', slug: 'close_grip_bench_press', name_ja: 'ナローベンチプレス', name_en: 'Close-Grip Bench Press', muscle_group: 'arms', primary_muscle: 'arms_triceps', equipment: 'barbell', is_compound: true, movement_pattern: 'horizontal_push', sort_order: 156, form_cue_ja: '肩幅程度の握り、肘を体側に寄せて下ろす。バーをみぞおち付近に着地、三頭筋の関与が増える。', rep_range_low: 6, rep_range_high: 10 },
  { id: 'ex_157', slug: 'overhead_triceps_extension_dumbbell', name_ja: 'オーバーヘッドトライセプスエクステンション', name_en: 'Overhead Triceps Extension (Dumbbell)', muscle_group: 'arms', primary_muscle: 'arms_triceps', equipment: 'dumbbell', is_compound: false, movement_pattern: 'isolation_extension', sort_order: 157, form_cue_ja: 'ダンベルを両手で頭上に保持し、肘を固定して頭の後ろに降ろす。肘を狭く保ち、肩を動かさない。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_158', slug: 'rope_pushdown_cable', name_ja: 'ロープトライセプスプッシュダウン', name_en: 'Rope Triceps Pushdown', muscle_group: 'arms', primary_muscle: 'arms_triceps', equipment: 'machine', is_compound: false, movement_pattern: 'isolation_extension', sort_order: 158, form_cue_ja: 'ロープを胸の高さで握り、下端で外側に開きながら押し下げる。三頭筋を強く収縮させる。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_159', slug: 'kickback_dumbbell', name_ja: 'キックバック', name_en: 'Triceps Kickback (Dumbbell)', muscle_group: 'arms', primary_muscle: 'arms_triceps', equipment: 'dumbbell', is_compound: false, movement_pattern: 'isolation_extension', sort_order: 159, form_cue_ja: '上半身を前傾させ、肘を 90 度に固定。前腕を後方に伸ばし、頂点で 1 秒止める。', rep_range_low: 10, rep_range_high: 15 },
  { id: 'ex_160', slug: 'bench_dip', name_ja: 'ベンチディップス', name_en: 'Bench Dip', muscle_group: 'arms', primary_muscle: 'arms_triceps', equipment: 'bodyweight', is_compound: true, movement_pattern: 'vertical_push', sort_order: 160, form_cue_ja: 'ベンチの縁に手を置き、足を前に伸ばす。肘を後方に曲げて下げ、押し戻す。肩より下に下ろさず、内旋させすぎない。', rep_range_low: 10, rep_range_high: 20 },
  { id: 'ex_161', slug: 'wrist_curl_barbell', name_ja: 'リストカール', name_en: 'Wrist Curl', muscle_group: 'arms', primary_muscle: 'arms_forearm', equipment: 'barbell', is_compound: false, movement_pattern: 'isolation_curl', sort_order: 161, form_cue_ja: '前腕をベンチに置き、手首だけでバーを巻き上げる。フル可動域で前腕屈筋を狙う。', rep_range_low: 12, rep_range_high: 20 },
  { id: 'ex_162', slug: 'reverse_wrist_curl', name_ja: 'リバースリストカール', name_en: 'Reverse Wrist Curl', muscle_group: 'arms', primary_muscle: 'arms_forearm', equipment: 'barbell', is_compound: false, movement_pattern: 'isolation_curl', sort_order: 162, form_cue_ja: '順手（掌が下向き）で前腕をベンチに置き、手首だけでバーを上げる。前腕伸筋を狙う。', rep_range_low: 12, rep_range_high: 20 },
  { id: 'ex_163', slug: 'farmer_carry', name_ja: 'ファーマーズキャリー', name_en: "Farmer's Carry", muscle_group: 'arms', primary_muscle: 'arms_forearm', equipment: 'dumbbell', is_compound: true, movement_pattern: 'carry', sort_order: 163, form_cue_ja: '重いダンベルを両手に持ち、姿勢を直立させて 20-40m 歩く。肩をすくめず、グリップを強く保つ。' },

  // ============================================================
  // CORE (existing 6 + 9 new = 15)
  // ============================================================
  // existing
  { id: 'ex_050', slug: 'crunch', name_ja: 'クランチ', name_en: 'Crunch', muscle_group: 'core', primary_muscle: 'core_abs', equipment: 'bodyweight', is_compound: false, movement_pattern: 'core_flexion', sort_order: 50 },
  { id: 'ex_051', slug: 'leg_raise', name_ja: 'レッグレイズ', name_en: 'Leg Raise', muscle_group: 'core', primary_muscle: 'core_abs', equipment: 'bodyweight', is_compound: false, movement_pattern: 'core_flexion', sort_order: 51 },
  { id: 'ex_052', slug: 'plank', name_ja: 'プランク', name_en: 'Plank', muscle_group: 'core', primary_muscle: 'core_abs', equipment: 'bodyweight', is_compound: false, movement_pattern: 'core_anti_extension', sort_order: 52 },
  { id: 'ex_053', slug: 'ab_roller', name_ja: 'アブローラー', name_en: 'Ab Roller', muscle_group: 'core', primary_muscle: 'core_abs', equipment: 'other', is_compound: false, movement_pattern: 'core_anti_extension', sort_order: 53 },
  { id: 'ex_054', slug: 'hanging_leg_raise', name_ja: 'ハンギングレッグレイズ', name_en: 'Hanging Leg Raise', muscle_group: 'core', primary_muscle: 'core_abs', equipment: 'bodyweight', is_compound: false, movement_pattern: 'core_flexion', sort_order: 54 },
  { id: 'ex_055', slug: 'cable_crunch', name_ja: 'ケーブルクランチ', name_en: 'Cable Crunch', muscle_group: 'core', primary_muscle: 'core_abs', equipment: 'machine', is_compound: false, movement_pattern: 'core_flexion', sort_order: 55 },
  // new
  { id: 'ex_170', slug: 'side_plank', name_ja: 'サイドプランク', name_en: 'Side Plank', muscle_group: 'core', primary_muscle: 'core_obliques', equipment: 'bodyweight', is_compound: false, movement_pattern: 'core_anti_rotation', sort_order: 170 },
  { id: 'ex_171', slug: 'russian_twist', name_ja: 'ロシアンツイスト', name_en: 'Russian Twist', muscle_group: 'core', primary_muscle: 'core_obliques', equipment: 'bodyweight', is_compound: false, movement_pattern: 'rotation', sort_order: 171 },
  { id: 'ex_172', slug: 'bicycle_crunch', name_ja: 'バイシクルクランチ', name_en: 'Bicycle Crunch', muscle_group: 'core', primary_muscle: 'core_obliques', equipment: 'bodyweight', is_compound: false, movement_pattern: 'rotation', sort_order: 172 },
  { id: 'ex_173', slug: 'dead_bug', name_ja: 'デッドバグ', name_en: 'Dead Bug', muscle_group: 'core', primary_muscle: 'core_abs', equipment: 'bodyweight', is_compound: false, movement_pattern: 'core_anti_extension', sort_order: 173 },
  { id: 'ex_174', slug: 'hollow_body_hold', name_ja: 'ホロウボディホールド', name_en: 'Hollow Body Hold', muscle_group: 'core', primary_muscle: 'core_abs', equipment: 'bodyweight', is_compound: false, movement_pattern: 'core_anti_extension', sort_order: 174 },
  { id: 'ex_175', slug: 'v_up', name_ja: 'Vアップ', name_en: 'V-Up', muscle_group: 'core', primary_muscle: 'core_abs', equipment: 'bodyweight', is_compound: false, movement_pattern: 'core_flexion', sort_order: 175 },
  { id: 'ex_176', slug: 'pallof_press_cable', name_ja: 'パロフプレス', name_en: 'Pallof Press', muscle_group: 'core', primary_muscle: 'core_obliques', equipment: 'machine', is_compound: false, movement_pattern: 'core_anti_rotation', sort_order: 176 },
  { id: 'ex_177', slug: 'cable_woodchopper', name_ja: 'ケーブルウッドチョッパー', name_en: 'Cable Woodchopper', muscle_group: 'core', primary_muscle: 'core_obliques', equipment: 'machine', is_compound: false, movement_pattern: 'rotation', sort_order: 177 },
  { id: 'ex_178', slug: 'mountain_climber', name_ja: 'マウンテンクライマー', name_en: 'Mountain Climber', muscle_group: 'core', primary_muscle: 'core_abs', equipment: 'bodyweight', is_compound: true, movement_pattern: 'core_flexion', sort_order: 178 },

  // ============================================================
  // FULL BODY (existing 4 + 4 new = 8)
  // ============================================================
  // existing
  { id: 'ex_060', slug: 'clean_barbell', name_ja: 'クリーン', name_en: 'Clean (Barbell)', muscle_group: 'full_body', primary_muscle: 'back_lower', equipment: 'barbell', is_compound: true, movement_pattern: 'olympic', sort_order: 60 },
  { id: 'ex_061', slug: 'snatch_barbell', name_ja: 'スナッチ', name_en: 'Snatch (Barbell)', muscle_group: 'full_body', primary_muscle: 'back_lower', equipment: 'barbell', is_compound: true, movement_pattern: 'olympic', sort_order: 61 },
  { id: 'ex_062', slug: 'burpee', name_ja: 'バーピー', name_en: 'Burpee', muscle_group: 'full_body', primary_muscle: 'legs_quad', equipment: 'bodyweight', is_compound: true, movement_pattern: 'squat', sort_order: 62 },
  { id: 'ex_063', slug: 'kettlebell_swing', name_ja: 'ケトルベルスイング', name_en: 'Kettlebell Swing', muscle_group: 'full_body', primary_muscle: 'legs_glute', equipment: 'kettlebell', is_compound: true, movement_pattern: 'hinge', sort_order: 63 },
  // new
  { id: 'ex_190', slug: 'clean_and_jerk_barbell', name_ja: 'クリーン&ジャーク', name_en: 'Clean and Jerk', muscle_group: 'full_body', primary_muscle: 'shoulder_front', equipment: 'barbell', is_compound: true, movement_pattern: 'olympic', sort_order: 190 },
  { id: 'ex_191', slug: 'thruster_barbell', name_ja: 'スラスター', name_en: 'Thruster', muscle_group: 'full_body', primary_muscle: 'legs_quad', equipment: 'barbell', is_compound: true, movement_pattern: 'squat', sort_order: 191 },
  { id: 'ex_192', slug: 'turkish_get_up', name_ja: 'ターキッシュゲットアップ', name_en: 'Turkish Get-Up', muscle_group: 'full_body', primary_muscle: 'shoulder_front', equipment: 'kettlebell', is_compound: true, movement_pattern: 'other', sort_order: 192 },
  { id: 'ex_193', slug: 'man_maker', name_ja: 'マンメーカー', name_en: 'Man Maker', muscle_group: 'full_body', primary_muscle: 'shoulder_front', equipment: 'dumbbell', is_compound: true, movement_pattern: 'other', sort_order: 193 },
];
