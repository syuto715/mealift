// v1.3.0 / Onboarding v2 / Phase A-6 — route↔step mapping +
// platform-aware total steps. Pure helpers, no rendering.
//
// Mock react-native's Platform export so jest's CJS runtime can
// import onboardingSteps without dragging the full module
// (Build 15+ TODO 12 — missing jest-expo preset). Tests use the
// `platformOverride` test seam exclusively, so the mock value is
// only read when a caller forgets the override.
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import {
  ONBOARDING_ROUTES,
  TOTAL_STEPS_DEFAULT,
  TOTAL_STEPS_IOS_HEALTHKIT,
  getStepForRoute,
  getRouteByName,
  getTotalStepsForPlatform,
  shouldRenderLayoutHeader,
} from '../onboardingSteps';

describe('ONBOARDING_ROUTES table integrity', () => {
  it('contains 15 entries (welcome..healthkit including iOS-only)', () => {
    expect(ONBOARDING_ROUTES).toHaveLength(15);
  });

  it('step numbers are 1..15 in declaration order', () => {
    for (let i = 0; i < ONBOARDING_ROUTES.length; i++) {
      expect(ONBOARDING_ROUTES[i].step).toBe(i + 1);
    }
  });

  it('welcome / complete / tier-preview have showBack=false', () => {
    // Phase D-9 — tier-preview is post-completion promotional;
    // back-nav to /complete would re-fire the createProfile
    // FromOnboarding success animation, so the screen exits
    // only via Plus / Skip CTAs.
    const noBack = ONBOARDING_ROUTES.filter((r) => !r.showBack).map(
      (r) => r.name,
    );
    expect(noBack.sort()).toEqual(['complete', 'tier-preview', 'welcome']);
  });

  it('exactly one route is iosOnly (healthkit)', () => {
    const iosOnly = ONBOARDING_ROUTES.filter((r) => r.iosOnly);
    expect(iosOnly).toHaveLength(1);
    expect(iosOnly[0].name).toBe('healthkit');
  });

  it('TOTAL_STEPS_DEFAULT excludes the iosOnly entry, IOS_HEALTHKIT includes it', () => {
    expect(TOTAL_STEPS_DEFAULT).toBe(14);
    expect(TOTAL_STEPS_IOS_HEALTHKIT).toBe(15);
    expect(
      ONBOARDING_ROUTES.filter((r) => !r.iosOnly).length,
    ).toBe(TOTAL_STEPS_DEFAULT);
    expect(ONBOARDING_ROUTES.length).toBe(TOTAL_STEPS_IOS_HEALTHKIT);
  });
});

describe('getStepForRoute', () => {
  it.each([
    ['welcome', 1],
    ['nickname', 2],
    ['body-info', 3],
    ['goal-summary', 6],
    ['protein-target', 9],
    ['complete', 13],
    ['tier-preview', 14],
    ['healthkit', 15],
  ])('maps "%s" → %i', (route, expected) => {
    expect(getStepForRoute(route)).toBe(expected);
  });

  it('returns null for unknown routes', () => {
    expect(getStepForRoute('not-a-route')).toBeNull();
    expect(getStepForRoute('')).toBeNull();
    expect(getStepForRoute('settings')).toBeNull();
  });
});

describe('getRouteByName', () => {
  it('returns the full descriptor', () => {
    const route = getRouteByName('healthkit');
    expect(route).toEqual({
      name: 'healthkit',
      step: 15,
      showBack: true,
      iosOnly: true,
    });
  });

  it('returns null for unknown route', () => {
    expect(getRouteByName('not-a-route')).toBeNull();
  });

  it('welcome descriptor has showBack=false', () => {
    expect(getRouteByName('welcome')?.showBack).toBe(false);
  });
});

describe('shouldRenderLayoutHeader', () => {
  // Codex review pass 1 / Important — the layout gates ProgressHeader
  // on this helper to avoid duplicate UI on legacy own-header screens
  // (welcome-and-goal / body-and-training / complete / healthkit
  // CURRENTLY mounted have their own back button + progress UI).
  // Phase D-X shrinks this gate to empty.

  it('returns false for routes outside ONBOARDING_ROUTES (legacy combined screens)', () => {
    // welcome-and-goal / body-and-training are not in the table at all
    expect(shouldRenderLayoutHeader('welcome-and-goal')).toBe(false);
    expect(shouldRenderLayoutHeader('body-and-training')).toBe(false);
    expect(shouldRenderLayoutHeader('not-a-route')).toBe(false);
    expect(shouldRenderLayoutHeader('')).toBe(false);
  });

  it('returns false for legacy-own-header + post-completion routes', () => {
    // complete + healthkit are in the post-Phase-D-X table but the
    // CURRENT implementations own their own UI; layout must not
    // double up. Phase D-9 / Codex pass 1 — tier-preview joined
    // this set as a post-completion exception: the progress UI
    // would render "14/15" on iOS where step 15 (HealthKit) is
    // unreachable in Android-first builds, misleading the user.
    expect(shouldRenderLayoutHeader('complete')).toBe(false);
    expect(shouldRenderLayoutHeader('healthkit')).toBe(false);
    expect(shouldRenderLayoutHeader('tier-preview')).toBe(false);
  });

  it('returns true for non-legacy routes in the table', () => {
    // Phase D-X screens — once mounted, the layout will render the
    // shared header.
    expect(shouldRenderLayoutHeader('welcome')).toBe(true);
    expect(shouldRenderLayoutHeader('nickname')).toBe(true);
    expect(shouldRenderLayoutHeader('body-info')).toBe(true);
    expect(shouldRenderLayoutHeader('goal-summary')).toBe(true);
    expect(shouldRenderLayoutHeader('protein-target')).toBe(true);
  });
});

describe('getTotalStepsForPlatform', () => {
  // platformOverride is the test seam; production reads Platform.OS.
  it('returns 15 on iOS (HealthKit screen included)', () => {
    expect(getTotalStepsForPlatform('ios')).toBe(15);
  });

  it('returns 14 on Android (no HealthKit)', () => {
    expect(getTotalStepsForPlatform('android')).toBe(14);
  });

  it('returns 14 on web (default branch)', () => {
    expect(getTotalStepsForPlatform('web')).toBe(14);
  });
});
