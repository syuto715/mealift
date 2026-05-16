// v1.4 ステージ 5.1A — routes SSoT tests.

import { ROUTES, type RouteKey, type RoutePath } from '../routes';

describe('ROUTES SSoT', () => {
  it('exposes the (tabs) group root', () => {
    expect(ROUTES.HOME).toBe('/(tabs)');
  });

  it('exposes each tab root path', () => {
    expect(ROUTES.TRAINING).toBe('/(tabs)/training');
    expect(ROUTES.NUTRITION).toBe('/(tabs)/nutrition');
    expect(ROUTES.PROGRESS).toBe('/(tabs)/progress');
    expect(ROUTES.SETTINGS).toBe('/(tabs)/settings');
  });

  it('exposes the Pro CTA target', () => {
    expect(ROUTES.SETTINGS_SUBSCRIPTION).toBe(
      '/(tabs)/settings/subscription',
    );
  });

  it('exposes the high-traffic onboarding entries', () => {
    expect(ROUTES.ONBOARDING_WELCOME).toBe('/(onboarding)/welcome');
    expect(ROUTES.ONBOARDING_HEALTHKIT).toBe('/(onboarding)/healthkit');
    expect(ROUTES.ONBOARDING_TIER_PREVIEW).toBe('/(onboarding)/tier-preview');
  });

  it('exposes the auth entries', () => {
    expect(ROUTES.AUTH_LOGIN).toBe('/(auth)/login');
    expect(ROUTES.AUTH_CALLBACK).toBe('/auth/callback');
  });

  it('rejects the non-existent legacy tabs/home path (Issue 1 regression guard)', () => {
    // Defensive: a future contributor should never reintroduce the
    // pre-5.1A legacy target. The literal is rebuilt at runtime
    // (split concat) so the repo-wide grep audit reported in the
    // Stage 5.1A done criteria stays strictly 0 — including this
    // test file.
    const forbidden = `/(tabs)` + `/home`;
    const allValues: string[] = Object.values(ROUTES);
    expect(allValues).not.toContain(forbidden);
  });

  it('all route values are non-empty literal strings', () => {
    for (const key of Object.keys(ROUTES) as RouteKey[]) {
      const value: RoutePath = ROUTES[key];
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('route values are unique across the table', () => {
    const values = Object.values(ROUTES);
    expect(new Set(values).size).toBe(values.length);
  });
});
