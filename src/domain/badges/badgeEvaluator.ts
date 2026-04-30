import { BADGE_DEFINITIONS, type BadgeDefinition } from '../../constants/badges';
import type {
  UserSubmittedFood,
  FoodCategory,
} from '../../types/userSubmittedFood';

// Pure evaluation of badge eligibility from current state. The IO
// layer (badgeService) loads submissions + use_count totals and
// passes them in; this module decides which badges are earned.
//
// All counters consider only submissions that have left the local
// 'local' status — i.e. ones the user has actually shared
// (pending_review / approved / rejected). Local-only drafts don't
// count toward volume badges.
//
// Why "rejected" still counts: the user did the submission work
// regardless of moderator outcome. Treating rejection as
// non-existent would punish good-faith contributors.

export interface BadgeEvalContext {
  submissions: UserSubmittedFood[];
  // Sum of use_count across the user's approved submissions on
  // public_foods. Caller fetches via Supabase; null if unavailable.
  totalUseCount: number | null;
}

export interface EarnedBadge {
  definition: BadgeDefinition;
  relatedCount: number;
}

export function evaluateBadges(
  ctx: BadgeEvalContext,
): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  const sharedSubmissions = ctx.submissions.filter(
    (s) => s.submissionStatus !== 'local',
  );

  for (const def of BADGE_DEFINITIONS) {
    switch (def.requirement.kind) {
      case 'submission_count': {
        if (sharedSubmissions.length >= def.requirement.threshold) {
          earned.push({
            definition: def,
            relatedCount: sharedSubmissions.length,
          });
        }
        break;
      }
      case 'category_count': {
        const req = def.requirement;
        const inCategory = sharedSubmissions.filter(
          (s) => s.foodCategory === req.category,
        ).length;
        if (inCategory >= req.threshold) {
          earned.push({ definition: def, relatedCount: inCategory });
        }
        break;
      }
      case 'consecutive_days': {
        const streak = computeMaxConsecutiveDays(sharedSubmissions);
        if (streak >= def.requirement.days) {
          earned.push({ definition: def, relatedCount: streak });
        }
        break;
      }
      case 'used_by_others': {
        if (
          ctx.totalUseCount != null &&
          ctx.totalUseCount >= def.requirement.threshold
        ) {
          earned.push({
            definition: def,
            relatedCount: ctx.totalUseCount,
          });
        }
        break;
      }
    }
  }
  return earned;
}

// Largest run of consecutive distinct days on which the user made
// at least one submission. Days are bucketed by the local
// year-month-day string from createdAt.
//
// Algorithm: collect the unique YYYY-MM-DD set, sort lexically,
// scan for the longest run of day-after-day pairs. O(n log n).
export function computeMaxConsecutiveDays(
  submissions: UserSubmittedFood[],
): number {
  if (submissions.length === 0) return 0;
  const days = new Set<string>();
  for (const s of submissions) {
    const d = new Date(s.createdAt);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.add(key);
  }
  if (days.size === 0) return 0;
  const sorted = Array.from(days).sort();

  let maxStreak = 1;
  let currentStreak = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (isNextDay(sorted[i - 1], sorted[i])) {
      currentStreak += 1;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 1;
    }
  }
  return maxStreak;
}

function isNextDay(prev: string, next: string): boolean {
  const p = new Date(prev + 'T00:00:00Z');
  const n = new Date(next + 'T00:00:00Z');
  return n.getTime() - p.getTime() === 24 * 60 * 60 * 1000;
}

export function countByCategory(
  submissions: UserSubmittedFood[],
  category: FoodCategory,
): number {
  return submissions.filter((s) => s.foodCategory === category).length;
}
