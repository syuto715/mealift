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
  // [12.5] tier-preview — Pro/Plus pitch screen. showBack=false
  // because the screen is post-completion (profile already
  // persisted by D-8 complete); back-nav to /complete would re-
  // fire the success animation. User exits via the explicit
  // Plus / Skip CTAs only.
  { name: 'tier-preview', step: 14, showBack: false },
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

// Routes that the layout should NOT render its ProgressHeader for.
// Two categories share this set:
//
//   1. Own-header screens — complete + healthkit own their
//      header UI. Rendering the layout-level ProgressHeader on
//      top would duplicate the back button + dot row.
//
//   2. Post-completion screens — tier-preview is reached AFTER
//      the user's profile is fully persisted and
//      onboardingCompleted=true. The progress bar would either
//      mislead ("14/15" on iOS where step 15 is unreachable
//      without HealthKit) or be redundant (the user is done).
//
// Phase E-1 — renamed from LEGACY_OWN_HEADER_ROUTES to better
// describe intent now that the Build 14/15 legacy bridges
// (welcome-and-goal + body-and-training) have been removed.
// The remaining members are not "legacy" — they are permanent
// exceptions to layout-level header rendering.
const LAYOUT_HEADER_SUPPRESSED_ROUTES: ReadonlySet<string> = new Set([
  'complete',
  'healthkit',
  'tier-preview',
]);

// Returns true when the layout should render the shared
// ProgressHeader for `routeName`. False when:
//   - the route isn't in ONBOARDING_ROUTES (unknown route, would
//     fall back to step=1 / 1-of-15 which is misleading)
//   - the route owns its own header / is post-completion (see
//     LAYOUT_HEADER_SUPPRESSED_ROUTES comment for rationale)
export function shouldRenderLayoutHeader(routeName: string): boolean {
  if (getRouteByName(routeName) === null) return false;
  if (LAYOUT_HEADER_SUPPRESSED_ROUTES.has(routeName)) return false;
  return true;
}
