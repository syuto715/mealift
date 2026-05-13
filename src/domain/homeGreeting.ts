// v1.4 / UI 改善 v1 Phase D-1 — time-of-day greeting + icon helper.
//
// Plan §5.3 A 4-tier breakdown:
//   05:00 - 09:59 → 「おはようございます」 + sunny-outline (朝の太陽)
//   10:00 - 16:59 → 「こんにちは」 + sunny (太陽中天)
//   17:00 - 21:59 → 「こんばんは」 + moon-outline (夕暮れ → 月)
//   22:00 - 04:59 → 「お疲れさまです」 + moon (深夜の月)
//
// Existing `getGreeting()` in src/utils/format.ts is a 3-tier variant
// (-5 / -11 / -17 / +) without icon support and predates Plan §5.3.
// This helper supersedes it for HomeScreen; format.ts retained for
// any other caller (no migration risk).
//
// TZ safety (Onboarding v2 Phase E-3 学び):
// - Uses device-local hour via `new Date().getHours()` (caller can
//   override via `now` test seam).
// - boundary checks are pure integer comparisons on the local hour;
//   no DST math, no ISO parsing. The helper is TZ-safe by
//   construction — different timezones see the same greeting at
//   their respective local 6am.
// - The `now` parameter is a Date used solely for getHours(). Pass
//   any Date instance; only the local-hour component is read.
//
// Patterns applied:
//   #18 SSoT — single decision function for greeting + icon
//   #25 helper-thick — pure logic, screen consumes via simple call

import type * as React from 'react';
import type { Ionicons } from '@expo/vector-icons';

export type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface HomeGreeting {
  // 4-tier JP greeting label
  label: string;
  // Companion Ionicon name. One icon per tier, kept minimal per Plan
  // §5.3 A 「太陽/月 アイコン 1個」 constraint.
  icon: IoniconName;
}

// Pure function: caller-supplied `now` overrides for test determinism.
// Production callers omit; the default `new Date()` reads device time.
export function getHomeGreeting(now: Date = new Date()): HomeGreeting {
  const hour = now.getHours();

  // 22:00 - 04:59 → 深夜 / 早朝 (お疲れさまです)
  if (hour >= 22 || hour < 5) {
    return { label: 'お疲れさまです', icon: 'moon' };
  }
  // 05:00 - 09:59 → 朝 (おはようございます)
  if (hour < 10) {
    return { label: 'おはようございます', icon: 'sunny-outline' };
  }
  // 10:00 - 16:59 → 昼 (こんにちは)
  if (hour < 17) {
    return { label: 'こんにちは', icon: 'sunny' };
  }
  // 17:00 - 21:59 → 夕 (こんばんは)
  return { label: 'こんばんは', icon: 'moon-outline' };
}

