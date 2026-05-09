import {
  decideNotificationRoute,
  ALLOWED_NOTIFICATION_ROUTES,
} from '../notificationRouting';

describe('decideNotificationRoute', () => {
  it('returns null for a missing payload', () => {
    expect(decideNotificationRoute(null)).toBeNull();
    expect(decideNotificationRoute(undefined)).toBeNull();
  });

  it('returns null for a non-object payload', () => {
    expect(decideNotificationRoute('string-payload')).toBeNull();
    expect(decideNotificationRoute(42)).toBeNull();
  });

  it('returns null when route is missing or not a string', () => {
    expect(decideNotificationRoute({})).toBeNull();
    expect(decideNotificationRoute({ route: 123 })).toBeNull();
    expect(decideNotificationRoute({ route: null })).toBeNull();
  });

  it('rejects routes that are not in the allowlist', () => {
    // Phase 1.4 only ships the weekly-report path; other plausible
    // strings — even valid expo-router paths — must be refused.
    expect(
      decideNotificationRoute({ route: '/(tabs)/settings/subscription' }),
    ).toBeNull();
    expect(
      decideNotificationRoute({ route: '/auth/callback' }),
    ).toBeNull();
    expect(
      decideNotificationRoute({ route: 'arbitrary-string' }),
    ).toBeNull();
  });

  it('accepts the weekly-report route with no params', () => {
    const result = decideNotificationRoute({
      route: '/(tabs)/progress/weekly-report',
    });
    expect(result).toEqual({
      route: '/(tabs)/progress/weekly-report',
      params: {},
    });
  });

  it('accepts the weekly-report route with string params', () => {
    const result = decideNotificationRoute({
      route: '/(tabs)/progress/weekly-report',
      params: { autoGenerate: '1' },
    });
    expect(result).toEqual({
      route: '/(tabs)/progress/weekly-report',
      params: { autoGenerate: '1' },
    });
  });

  it('drops non-string param entries (numbers, booleans, nested objects)', () => {
    const result = decideNotificationRoute({
      route: '/(tabs)/progress/weekly-report',
      params: {
        autoGenerate: '1',
        skip: 42,
        flag: true,
        nested: { foo: 'bar' },
      },
    });
    expect(result).toEqual({
      route: '/(tabs)/progress/weekly-report',
      params: { autoGenerate: '1' },
    });
  });

  it('treats malformed params (non-object) as empty params', () => {
    const result = decideNotificationRoute({
      route: '/(tabs)/progress/weekly-report',
      params: 'not-an-object',
    });
    expect(result).toEqual({
      route: '/(tabs)/progress/weekly-report',
      params: {},
    });
  });

  it('exposes the allowlist as readonly for callers that want to inspect it', () => {
    expect(ALLOWED_NOTIFICATION_ROUTES.has('/(tabs)/progress/weekly-report')).toBe(
      true,
    );
    expect(ALLOWED_NOTIFICATION_ROUTES.has('/random')).toBe(false);
  });
});
