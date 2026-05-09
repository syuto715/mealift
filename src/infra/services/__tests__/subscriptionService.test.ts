import {
  hasFeature,
  getFeatureFlags,
  getFeaturesForTier,
  setTier,
  derivePlanSnapshot,
  FEATURE_MATRIX,
  type PlanTier,
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
      // Note: barcodeScanner flipped to free in Build 15 — see the
      // free-open-features test below for the positive assertion.
      expect(hasFeature('progressPhotos', 'free')).toBe(false);
      expect(hasFeature('historyUnlimited', 'free')).toBe(false);
      expect(hasFeature('weeklyReport', 'free')).toBe(false);
    });

    it('blocks pro-only features', () => {
      expect(hasFeature('photoMealLog', 'free')).toBe(false);
      expect(hasFeature('aiReview', 'free')).toBe(false);
      expect(hasFeature('aiNutritionEstimate', 'free')).toBe(false);
    });

    it('allows free-open features (healthSync, goalPrediction, barcodeScanner)', () => {
      // Health integrations were unlocked for free in fix(subscription).
      // Barcode scanner unlocked in Build 15 (feeds public_foods submissions).
      // Guard against accidental regression on either.
      expect(hasFeature('healthSync', 'free')).toBe(true);
      expect(hasFeature('goalPrediction', 'free')).toBe(true);
      expect(hasFeature('barcodeScanner', 'free')).toBe(true);
    });

    it('returns the free flag set from getFeatureFlags', () => {
      setTier('free');
      const flags = getFeatureFlags();
      expect(flags.barcodeScanner).toBe(true);
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

  describe('aiWorkoutGenerationLimit (Build 15 / Feature 5-元)', () => {
    // Numbers must stay in lockstep with
    // supabase/functions/generate-workout-menu/index.ts MONTHLY_QUOTA
    // — the EF is the authoritative gate; this flag is for client UI
    // display ("今月: N/M 残り" badge, Phase 6).
    it('matches the per-tier monthly quota the Edge Function enforces', () => {
      expect(getFeaturesForTier('free').aiWorkoutGenerationLimit).toBe(3);
      expect(getFeaturesForTier('plus').aiWorkoutGenerationLimit).toBe(30);
      expect(getFeaturesForTier('pro').aiWorkoutGenerationLimit).toBe(100);
    });
  });

  describe('aiWeeklyReport / aiWeeklyReportLimit (Build 16 / Feature H, Phase 1.2)', () => {
    // Numbers must stay in lockstep with
    // supabase/functions/generate-weekly-report/index.ts MONTHLY_QUOTA
    // — the EF is the authoritative gate; this flag drives the client
    // UI badge and the boolean is the canonical Plus-tier check.
    it('matches the per-tier monthly quota the Edge Function enforces', () => {
      expect(getFeaturesForTier('free').aiWeeklyReportLimit).toBe(0);
      expect(getFeaturesForTier('plus').aiWeeklyReportLimit).toBe(4);
      expect(getFeaturesForTier('pro').aiWeeklyReportLimit).toBe(12);
    });

    it('locks the AI narrative behind Plus, but the rule-based report flag stays open at Plus+', () => {
      expect(getFeaturesForTier('free').aiWeeklyReport).toBe(false);
      expect(getFeaturesForTier('plus').aiWeeklyReport).toBe(true);
      expect(getFeaturesForTier('pro').aiWeeklyReport).toBe(true);
    });

    it('FEATURE_MATRIX (auto-derived) treats Plus as the minimum tier and admits trial users', () => {
      expect(hasFeature('aiWeeklyReport', 'free')).toBe(false);
      expect(hasFeature('aiWeeklyReport', 'trial')).toBe(true);
      expect(hasFeature('aiWeeklyReport', 'plus')).toBe(true);
      expect(hasFeature('aiWeeklyReport', 'pro')).toBe(true);
    });

    it('keeps the boolean flag and quota number consistent (drift guard)', () => {
      // Boolean true ↔ limit > 0; Boolean false ↔ limit 0. Catches the
      // most common out-of-sync mode (someone bumps the limit but
      // forgets the boolean, or vice versa).
      const tiers: PlanTier[] = ['free', 'plus', 'pro'];
      for (const t of tiers) {
        const f = getFeaturesForTier(t);
        expect(f.aiWeeklyReport).toBe(f.aiWeeklyReportLimit > 0);
      }
    });
  });

  describe('volumeDashboard (Build 16 / Feature E, Phase 2)', () => {
    // Phase 2 sign-off — gate the MEV/MAV/MRV per-muscle dashboard
    // behind Plus. Rule-based weekly volume sums elsewhere in the
    // app stay free; only the landmark chart is paywalled.
    it('locks the dashboard behind Plus', () => {
      expect(getFeaturesForTier('free').volumeDashboard).toBe(false);
      expect(getFeaturesForTier('plus').volumeDashboard).toBe(true);
      expect(getFeaturesForTier('pro').volumeDashboard).toBe(true);
    });

    it('FEATURE_MATRIX (auto-derived) treats Plus as the minimum tier and admits trial users', () => {
      expect(hasFeature('volumeDashboard', 'free')).toBe(false);
      expect(hasFeature('volumeDashboard', 'trial')).toBe(true);
      expect(hasFeature('volumeDashboard', 'plus')).toBe(true);
      expect(hasFeature('volumeDashboard', 'pro')).toBe(true);
    });
  });

  describe('autoDeload (Build 16 / Feature F, Phase 4)', () => {
    // Phase 4 sign-off — first Pro-only differentiator. Free + Plus
    // both blocked. Volume dashboard stays Plus; only the deload
    // detection trigger + recommendation banner + Pro Monday push
    // schedule are gated behind autoDeload.
    it('locks auto-deload behind Pro (Plus is NOT enough)', () => {
      expect(getFeaturesForTier('free').autoDeload).toBe(false);
      expect(getFeaturesForTier('plus').autoDeload).toBe(false);
      expect(getFeaturesForTier('pro').autoDeload).toBe(true);
    });

    it('FEATURE_MATRIX (auto-derived) treats Pro as the minimum tier', () => {
      // The matrix derivation visits free → plus → pro and picks the
      // first tier where the flag flips true. autoDeload only flips
      // at pro, so the minimum-required-tier output must be 'pro'.
      expect(FEATURE_MATRIX.autoDeload).toBe('pro');
    });

    it('hasFeature blocks free / plus / trial; admits pro', () => {
      // Trial users get Plus-level access (statusToEffectiveTier),
      // not Pro. So a trial user must NOT see auto-deload — they
      // would have to upgrade past their trial to unlock it.
      expect(hasFeature('autoDeload', 'free')).toBe(false);
      expect(hasFeature('autoDeload', 'trial')).toBe(false);
      expect(hasFeature('autoDeload', 'plus')).toBe(false);
      expect(hasFeature('autoDeload', 'pro')).toBe(true);
    });
  });

  describe('oneRepMaxRecommendation (Build 15 / Feature 5-C, Phase 9.1)', () => {
    // Gate covers: Easy/Normal/Hard chip strip in session.tsx and the
    // plate_step_kg picker in settings/training-prefs.tsx. The §7.3
    // RPE adjustment in workoutRepository.maybeRecordE1RMObservation
    // is intentionally NOT gated — it's a backend accuracy
    // improvement applied for every tier.
    it('locks the chip strip and plate-step picker behind Plus', () => {
      expect(getFeaturesForTier('free').oneRepMaxRecommendation).toBe(false);
      expect(getFeaturesForTier('plus').oneRepMaxRecommendation).toBe(true);
      expect(getFeaturesForTier('pro').oneRepMaxRecommendation).toBe(true);
    });

    it('FEATURE_MATRIX (auto-derived) treats Plus as the minimum tier', () => {
      expect(hasFeature('oneRepMaxRecommendation', 'free')).toBe(false);
      expect(hasFeature('oneRepMaxRecommendation', 'trial')).toBe(true);
      expect(hasFeature('oneRepMaxRecommendation', 'plus')).toBe(true);
      expect(hasFeature('oneRepMaxRecommendation', 'pro')).toBe(true);
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

// Phase 9.1 / Codex review #3 — pin the trial→Plus access path the
// session.tsx and training-prefs.tsx gates actually run. The screens
// take useSubscription().hasFeature, which threads PlanStatus through
// hasFeature(feature, status). Going through derivePlanSnapshot here
// matches that exact code path, so a regression to canUse() — which
// reads PlanTier and silently locks trial users out — would fail
// here even without RNTL.
describe('oneRepMaxRecommendation — trial access via the screen path', () => {
  const NOW = new Date('2026-04-28T12:00:00Z');

  beforeAll(() => setDevMode(false));

  it('grants access when an active trial profile is fed through derivePlanSnapshot → hasFeature', () => {
    const trialStartedAt = new Date('2026-04-26T12:00:00Z').toISOString();
    const snap = derivePlanSnapshot(
      {
        trialStartedAt,
        planExpiresAt: null,
        planBillingCycle: null,
      } as Parameters<typeof derivePlanSnapshot>[0],
      NOW,
    );
    expect(snap.status).toBe('trial');
    // This is the same composition the screen runs:
    //   useSubscription().hasFeature(feat) === hasFeature(feat, derived.status).
    expect(hasFeature('oneRepMaxRecommendation', snap.status)).toBe(true);
  });

  it('blocks a profile whose trial has lapsed', () => {
    const trialStartedAt = new Date('2026-03-01T12:00:00Z').toISOString();
    const snap = derivePlanSnapshot(
      {
        trialStartedAt,
        planExpiresAt: null,
        planBillingCycle: null,
      } as Parameters<typeof derivePlanSnapshot>[0],
      NOW,
    );
    expect(snap.status).toBe('free');
    expect(hasFeature('oneRepMaxRecommendation', snap.status)).toBe(false);
  });
});
