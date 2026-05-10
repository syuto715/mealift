import { Platform } from 'react-native';

// v1.3.0 / Onboarding v2 / Phase A-6 — route ↔ step number mapping +
// platform-aware total steps.
//
// Single source of truth for the 13-screen flow + [12.5] tier-preview
// + [12.6] iOS-only HealthKit. Used by:
//   - app/(onboarding)/_layout.tsx — derive step from current route,
//     decide showBack flag.
//   - ProgressHeader — render "currentStep / totalSteps" + dot row.
//   - Phase B-D screens — incrementing onboardingStep on submit.
//
// Step numbering:
//   - kickoff §A-6 §1 ROUTES table is the authoritative count.
//     Non-iOS: 14 steps (welcome..tier-preview).
//     iOS w/ HealthKit: 15 steps (..healthkit appended).
//   - The kickoff "13 画面 + [12.5] tier preview = 14" framing
//     counts [12.5] as the 14th screen; ProgressHeader displays
//     it inline with the rest.

export interface OnboardingRoute {
  name: string;
  step: number;
  showBack: boolean;
  iosOnly?: boolean;
}

export const ONBOARDING_ROUTES: readonly OnboardingRoute[] = [
  { name: 'welcome', step: 1, showBack: false },
  { name: 'nickname', step: 2, showBack: true },
  { name: 'body-info', step: 3, showBack: true },
  { name: 'activity', step: 4, showBack: true },
  { name: 'goal-weight', step: 5, showBack: true },
  // [5.5] goal-summary in the kickoff numbering, sequential here.
  { name: 'goal-summary', step: 6, showBack: true },
  { name: 'meal-plan', step: 7, showBack: true },
  { name: 'meal-timing', step: 8, showBack: true },
  { name: 'protein-target', step: 9, showBack: true },
  { name: 'weekly-distrib', step: 10, showBack: true },
  { name: 'motivation', step: 11, showBack: true },
  { name: 'progress-preview', step: 12, showBack: true },
  // [12] complete — back from here means abandoning a finished
  // onboarding, which the AbandonDialog flow handles separately.
  { name: 'complete', step: 13, showBack: false },
  // [12.5] tier-preview — Pro/Plus pitch screen.
  { name: 'tier-preview', step: 14, showBack: true },
  // [12.6] iOS-only HealthKit permission. Excluded from
  // totalSteps on Android via getTotalStepsForPlatform.
  { name: 'healthkit', step: 15, showBack: true, iosOnly: true },
] as const;

export const TOTAL_STEPS_DEFAULT = 14; // welcome..tier-preview
export const TOTAL_STEPS_IOS_HEALTHKIT = 15; // + healthkit

// Returns the 1-indexed step number for `routeName`, or null if
// the route doesn't belong to the onboarding flow. Callers that
// receive null typically render with default fallbacks (step=1).
export function getStepForRoute(routeName: string): number | null {
  const route = ONBOARDING_ROUTES.find((r) => r.name === routeName);
  return route?.step ?? null;
}

// Returns the route descriptor for the given route name, or null if
// not in the onboarding flow. Used by _layout.tsx to read showBack +
// iosOnly flags without re-running getStepForRoute.
export function getRouteByName(routeName: string): OnboardingRoute | null {
  return ONBOARDING_ROUTES.find((r) => r.name === routeName) ?? null;
}

// Platform-aware total steps. iOS surfaces the HealthKit screen
// (+1 step); Android tops out at tier-preview.
//
// `platformOverride` is a test seam — production callers omit and
// the helper reads Platform.OS at call time.
export function getTotalStepsForPlatform(
  platformOverride?: 'ios' | 'android' | 'web',
): number {
  const os = platformOverride ?? Platform.OS;
  return os === 'ios' ? TOTAL_STEPS_IOS_HEALTHKIT : TOTAL_STEPS_DEFAULT;
}
