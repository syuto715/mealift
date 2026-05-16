// App-wide route constants. Single Source of Truth for the high-
// frequency navigation targets surfaced across the Mealift app.
//
// v1.4 scope: this file crystallizes the HOME group root, the Pro
// CTA target, and the onboarding entries that the v1.4 ステージ 5.1
// pass touched. The remaining ~45 inline `/(tabs)/...` /
// `/(onboarding)/...` references across feature screens are
// intentionally NOT migrated this pass — that bulk sweep is deferred
// to v1.5 once the routing surface (Auth Tier 2/3, RNTL coverage,
// deep-link plumbing) settles.
//
// Style:
//   - Every constant carries an `as const` literal type so consumers
//     keep the value's narrow string-literal type rather than
//     widening to plain `string`. This repo does NOT enable expo-
//     router's generated typed-routes declarations, so `router.push`
//     still accepts `string | HrefObject` — the SSoT benefit here
//     is runtime-correctness (one fix-place per path) and editor
//     auto-import, not Href-level compile-time validation.
//   - Keys are SCREAMING_SNAKE_CASE. Tab roots are bare (`HOME`,
//     `TRAINING`, ...); sub-routes prefix the group (e.g.
//     `SETTINGS_SUBSCRIPTION`, `ONBOARDING_WELCOME`). Discoverable
//     via `ROUTES.` auto-import.
//   - The constants do NOT include params (mealType, date, etc.);
//     callers continue to build params at the call site.

export const ROUTES = {
  // Tab group roots.
  HOME: '/(tabs)' as const,
  TRAINING: '/(tabs)/training' as const,
  NUTRITION: '/(tabs)/nutrition' as const,
  PROGRESS: '/(tabs)/progress' as const,
  SETTINGS: '/(tabs)/settings' as const,

  // Settings sub-routes — currently only the Pro CTA target
  // qualifies as high-frequency (16+ inline references across the
  // app, 5 already crystallized this pass).
  SETTINGS_SUBSCRIPTION: '/(tabs)/settings/subscription' as const,

  // Onboarding — 15 screens total, only the high-traffic landing
  // points are crystallized this pass.
  ONBOARDING_WELCOME: '/(onboarding)/welcome' as const,
  ONBOARDING_HEALTHKIT: '/(onboarding)/healthkit' as const,
  ONBOARDING_TIER_PREVIEW: '/(onboarding)/tier-preview' as const,

  // Auth.
  AUTH_LOGIN: '/(auth)/login' as const,
  AUTH_CALLBACK: '/auth/callback' as const,
} as const;

export type RouteKey = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteKey];
