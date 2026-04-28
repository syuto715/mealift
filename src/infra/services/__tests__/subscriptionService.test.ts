import {
  hasFeature,
  getFeatureFlags,
  getFeaturesForTier,
  setTier,
  derivePlanSnapshot,
} from '../subscriptionService';

// `__DEV__` is the React Native global. It is `true` by default under jest
// (babel-preset-expo defines it that way) which would mask all gating, so
// every assertion that exercises real tier logic flips it off first.
const setDevMode = (value: boolean) => {
  (global as unknown as { __DEV__: boolean }).__DEV__ = value;
};

describe('subscriptionService — production gating (__DEV__ = false)', () => {
  const originalDev = (global as unknown as { __DEV__: boolean }).__DEV__;

  beforeEach(() => {
    setDevMode(false);
    setTier('free');
  });

  afterAll(() => {
    setDevMode(originalDev);
    setTier('free');
  });

  describe('free tier', () => {
    it('blocks plus-tier features', () => {
      expect(hasFeature('barcodeScanner', 'free')).toBe(false);
      expect(hasFeature('progressPhotos', 'free')).toBe(false);
      expect(hasFeature('historyUnlimited', 'free')).toBe(false);
      expect(hasFeature('weeklyReport', 'free')).toBe(false);
    });

    it('blocks pro-only features', () => {
      expect(hasFeature('photoMealLog', 'free')).toBe(false);
      expect(hasFeature('aiReview', 'free')).toBe(false);
      expect(hasFeature('aiNutritionEstimate', 'free')).toBe(false);
    });

    it('allows free-open features (healthSync, goalPrediction)', () => {
      // Health integrations were unlocked for free in fix(subscription).
      // Guard against accidental regression.
      expect(hasFeature('healthSync', 'free')).toBe(true);
      expect(hasFeature('goalPrediction', 'free')).toBe(true);
    });

    it('returns the free flag set from getFeatureFlags', () => {
      setTier('free');
      const flags = getFeatureFlags();
      expect(flags.barcodeScanner).toBe(false);
      expect(flags.healthSync).toBe(true);
      expect(flags.maxRoutines).toBe(3);
    });
  });

  describe('trial status', () => {
    it('grants plus-level access', () => {
      expect(hasFeature('barcodeScanner', 'trial')).toBe(true);
      expect(hasFeature('progressPhotos', 'trial')).toBe(true);
      expect(hasFeature('historyUnlimited', 'trial')).toBe(true);
    });

    it('does not grant pro-only access', () => {
      expect(hasFeature('photoMealLog', 'trial')).toBe(false);
      expect(hasFeature('aiReview', 'trial')).toBe(false);
    });
  });

  describe('plus tier', () => {
    it('grants all plus features', () => {
      expect(hasFeature('barcodeScanner', 'plus')).toBe(true);
      expect(hasFeature('weeklyReport', 'plus')).toBe(true);
      expect(hasFeature('healthSync', 'plus')).toBe(true);
    });

    it('blocks pro-only features', () => {
      expect(hasFeature('photoMealLog', 'plus')).toBe(false);
      expect(hasFeature('adaptiveCalories', 'plus')).toBe(false);
    });
  });

  describe('pro tier', () => {
    it('grants every boolean feature', () => {
      const proFlags = getFeaturesForTier('pro');
      for (const [key, value] of Object.entries(proFlags)) {
        if (typeof value === 'boolean') {
          expect(hasFeature(key as Parameters<typeof hasFeature>[0], 'pro')).toBe(true);
        }
      }
    });
  });
});

describe('subscriptionService — dev mode (__DEV__ = true)', () => {
  const originalDev = (global as unknown as { __DEV__: boolean }).__DEV__;

  beforeAll(() => setDevMode(true));
  afterAll(() => setDevMode(originalDev));

  it('opens every gate regardless of tier', () => {
    expect(hasFeature('photoMealLog', 'free')).toBe(true);
    expect(hasFeature('aiReview', 'free')).toBe(true);
  });

  it('returns the pro flag set from getFeatureFlags', () => {
    setTier('free');
    expect(getFeatureFlags().photoMealLog).toBe(true);
  });
});

describe('derivePlanSnapshot', () => {
  const NOW = new Date('2026-04-28T12:00:00Z');

  it('returns free for a profile with no trial or paid plan', () => {
    const snap = derivePlanSnapshot(
      {
        trialStartedAt: null,
        planExpiresAt: null,
        planBillingCycle: null,
      } as Parameters<typeof derivePlanSnapshot>[0],
      NOW,
    );
    expect(snap.status).toBe('free');
    expect(snap.tier).toBe('free');
  });

  it('returns trial when trial_started_at is recent', () => {
    const trialStartedAt = new Date('2026-04-26T12:00:00Z').toISOString(); // 2 days ago
    const snap = derivePlanSnapshot(
      {
        trialStartedAt,
        planExpiresAt: null,
        planBillingCycle: null,
      } as Parameters<typeof derivePlanSnapshot>[0],
      NOW,
    );
    expect(snap.status).toBe('trial');
    expect(snap.tier).toBe('free');
    expect(snap.trialDaysRemaining).toBeGreaterThan(0);
  });

  it('falls back to free once the trial window has elapsed', () => {
    const trialStartedAt = new Date('2026-03-01T12:00:00Z').toISOString(); // long past
    const snap = derivePlanSnapshot(
      {
        trialStartedAt,
        planExpiresAt: null,
        planBillingCycle: null,
      } as Parameters<typeof derivePlanSnapshot>[0],
      NOW,
    );
    expect(snap.status).toBe('free');
  });

  it('returns paid status when plan_expires_at is in the future', () => {
    const planExpiresAt = new Date('2026-05-28T12:00:00Z').toISOString(); // 1 month out
    const snap = derivePlanSnapshot(
      {
        trialStartedAt: null,
        planExpiresAt,
        planBillingCycle: 'monthly',
      } as Parameters<typeof derivePlanSnapshot>[0],
      NOW,
    );
    expect(['plus', 'pro']).toContain(snap.status);
  });
});
