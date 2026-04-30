import type { FoodCategory } from '../types/userSubmittedFood';

// Badge catalog for the submission-promotion UX (Sprint 5 phase
// 5-4). Definitions are referenced by id from the local user_badges
// table — once earned, the row records the badge_id only and we
// look up display data here.
//
// Three families:
//   - Submission counts (volume): first / 10 / 50 / 100
//   - Category mastery: 20 conveni, 10 supplement, 15 restaurant
//   - Streaks: 7 / 30 consecutive days submitting
//   - Social proof (use_count from public_foods): 10 / 100
//
// IMPORTANT: don't reorder ids — they're persisted. New badges
// append; deprecating an existing badge means leaving the entry in
// place (still rendered for users who earned it) and tagging it as
// deprecated in the future.

export type BadgeRequirement =
  | { kind: 'submission_count'; threshold: number }
  | { kind: 'category_count'; category: FoodCategory; threshold: number }
  | { kind: 'consecutive_days'; days: number }
  | { kind: 'used_by_others'; threshold: number };

export interface BadgeDefinition {
  id: string;
  nameJa: string;
  description: string;
  icon: string;
  requirement: BadgeRequirement;
}

export const BADGE_DEFINITIONS: readonly BadgeDefinition[] = [
  // --- Volume badges ---
  {
    id: 'first_submission',
    nameJa: '最初の一歩',
    description: '初めて食品を投稿',
    icon: 'star-outline',
    requirement: { kind: 'submission_count', threshold: 1 },
  },
  {
    id: 'submissions_10',
    nameJa: '常連投稿者',
    description: '食品を10件投稿',
    icon: 'medal-outline',
    requirement: { kind: 'submission_count', threshold: 10 },
  },
  {
    id: 'submissions_50',
    nameJa: 'データベース貢献者',
    description: '食品を50件投稿',
    icon: 'trophy-outline',
    requirement: { kind: 'submission_count', threshold: 50 },
  },
  {
    id: 'submissions_100',
    nameJa: 'マスター投稿者',
    description: '食品を100件投稿',
    icon: 'ribbon-outline',
    requirement: { kind: 'submission_count', threshold: 100 },
  },
  // --- Category mastery ---
  {
    id: 'category_conveni_20',
    nameJa: 'コンビニ通',
    description: 'コンビニ商品を20件投稿',
    icon: 'storefront-outline',
    requirement: {
      kind: 'category_count',
      category: 'convenience_store',
      threshold: 20,
    },
  },
  {
    id: 'category_supplement_10',
    nameJa: 'プロテインマスター',
    description: 'サプリメントを10件投稿',
    icon: 'fitness-outline',
    requirement: {
      kind: 'category_count',
      category: 'supplement',
      threshold: 10,
    },
  },
  {
    id: 'category_restaurant_15',
    nameJa: '外食レポーター',
    description: '外食メニューを15件投稿',
    icon: 'restaurant-outline',
    requirement: {
      kind: 'category_count',
      category: 'restaurant',
      threshold: 15,
    },
  },
  // --- Streak badges ---
  {
    id: 'streak_7',
    nameJa: '一週間継続',
    description: '7日連続で投稿',
    icon: 'flame-outline',
    requirement: { kind: 'consecutive_days', days: 7 },
  },
  {
    id: 'streak_30',
    nameJa: '一ヶ月継続',
    description: '30日連続で投稿',
    icon: 'flame',
    requirement: { kind: 'consecutive_days', days: 30 },
  },
  // --- Social proof ---
  {
    id: 'used_by_10',
    nameJa: 'みんなのお役立ち',
    description: '投稿が10人に利用された',
    icon: 'people-outline',
    requirement: { kind: 'used_by_others', threshold: 10 },
  },
  {
    id: 'used_by_100',
    nameJa: 'コミュニティの星',
    description: '投稿が100人に利用された',
    icon: 'people',
    requirement: { kind: 'used_by_others', threshold: 100 },
  },
] as const;

export function findBadgeDefinition(id: string): BadgeDefinition | null {
  return BADGE_DEFINITIONS.find((b) => b.id === id) ?? null;
}
