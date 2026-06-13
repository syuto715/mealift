// v1.6.0 C-1 — applyCustomerInfoToProfile no longer writes the subscription
// columns to Supabase directly (that was b74a7e2, now reverted). The server
// (revenuecat-webhook / sync-subscription EFs) owns plan / subscription_status
// / plan_expires_at. The client only:
//   - sets the in-memory tier (setTier),
//   - writes LOCAL display columns (planBillingCycle / planExpiresAt) via
//     updateProfile,
//   - triggers a forced reconcile so the server re-derives from RC.
//
// This test pins that the direct remote write is GONE and the reconcile fires.
// Heavy native/RN deps are mocked at the module boundary.

const mockUpdate = jest.fn((_payload: Record<string, unknown>) => ({
  eq: jest.fn().mockResolvedValue({ data: null, error: null }),
}));
const mockFrom = jest.fn((_table: string) => ({ update: mockUpdate }));

jest.mock('../../supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'auth-uid-123' } } }) },
    from: (table: string) => mockFrom(table),
  },
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: { PURCHASES_ERROR_CODE: {} },
  LOG_LEVEL: { DEBUG: 'debug', WARN: 'warn' },
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));

const mockUpdateProfile = jest.fn().mockResolvedValue(undefined);
jest.mock('../../repositories/profileRepository', () => ({
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
}));
jest.mock('../subscriptionService', () => ({ setTier: jest.fn() }));
jest.mock('../notificationService', () => ({
  loadNotificationSettings: jest.fn().mockResolvedValue({}),
  syncNotifications: jest.fn().mockResolvedValue(undefined),
}));

const mockReconcile = jest.fn().mockResolvedValue(undefined);
const mockMarkVersion = jest.fn().mockResolvedValue(undefined);
const mockStartTrialRemote = jest.fn().mockResolvedValue(null);
jest.mock('../subscriptionSync', () => ({
  reconcileSubscription: (...args: unknown[]) => mockReconcile(...args),
  markAppVersionSeen: (...args: unknown[]) => mockMarkVersion(...args),
  startTrialRemote: (...args: unknown[]) => mockStartTrialRemote(...args),
  SUBSCRIPTION_PAYLOAD_SCHEMA: 2,
}));

const mockProfile = { id: 'profile-local-1' };
const mockSetProfile = jest.fn();
jest.mock('../../../stores/profileStore', () => ({
  useProfileStore: {
    getState: () => ({ profile: mockProfile, setProfile: mockSetProfile }),
  },
}));

import { applyCustomerInfoToProfile } from '../revenueCatService';

function customerInfoWith(entitlement: 'pro' | 'plus' | null) {
  const active: Record<string, unknown> = {};
  if (entitlement) {
    active[entitlement] = {
      expirationDate: '2099-12-31T00:00:00Z',
      productIdentifier: 'mealift_pro_monthly',
      willRenew: true,
    };
  }
  return { entitlements: { active } } as never;
}

describe('applyCustomerInfoToProfile — v1.6 server-source-of-truth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('triggers a forced reconcile instead of writing subscription columns directly', async () => {
    await applyCustomerInfoToProfile(customerInfoWith('pro'));
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect(mockReconcile).toHaveBeenCalledWith({ force: true });
  });

  it('does NOT write plan / subscription_status to profiles directly anymore', async () => {
    await applyCustomerInfoToProfile(customerInfoWith('pro'));
    // The only remote path is reconcile; no direct profiles.update of plan.
    const wrotePlan = mockUpdate.mock.calls.some(
      (c) => c[0] && Object.prototype.hasOwnProperty.call(c[0], 'plan'),
    );
    expect(wrotePlan).toBe(false);
  });

  it('still writes LOCAL display columns (planBillingCycle / planExpiresAt)', async () => {
    await applyCustomerInfoToProfile(customerInfoWith('pro'));
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    const [id, patch] = mockUpdateProfile.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(id).toBe('profile-local-1');
    expect(patch).toHaveProperty('planExpiresAt');
    expect(patch).toHaveProperty('planBillingCycle');
  });

  it('no profile in store → returns before reconcile', async () => {
    // Re-mock store to return null profile for this case.
    const store = jest.requireMock('../../../stores/profileStore') as {
      useProfileStore: { getState: () => unknown };
    };
    const orig = store.useProfileStore.getState;
    store.useProfileStore.getState = () => ({ profile: null, setProfile: mockSetProfile });
    try {
      await applyCustomerInfoToProfile(customerInfoWith('pro'));
      expect(mockReconcile).not.toHaveBeenCalled();
    } finally {
      store.useProfileStore.getState = orig;
    }
  });
});
