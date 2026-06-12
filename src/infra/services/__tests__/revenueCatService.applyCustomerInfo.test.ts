// v1.5.1 — applyCustomerInfoToProfile が Supabase profiles を「正しい行」
// (.eq('id', userId)) で更新することの回帰テスト。
//
// 背景: 旧コードは .eq('user_id', userId) で profiles を引いていたが
// profiles は id が auth.uid()(user_id 列なし)のため 0 行マッチで
// silent fail し、課金者の plan が server 側で free のままだった。
// 本テストは update payload と .eq の列・値を mock で検証する。
//
// 重い native/RN 依存は全て module 境界で mock し、pure JS で実行する。

const mockEq = jest.fn((_col: string, _val: unknown) =>
  Promise.resolve({ data: null, error: null }),
);
const mockUpdate = jest.fn((_payload: Record<string, unknown>) => ({
  eq: mockEq,
}));
const mockFrom = jest.fn((_table: string) => ({ update: mockUpdate }));
const mockGetUser = jest.fn();

// NOTE: lazy ラッパで包む。`from: mockFrom` のように mock を直接渡すと、
// jest.mock factory が import hoist 時(const 初期化前 = undefined)に評価され
// supabase.from が undefined になり remote 更新が try/catch に飲まれる。
jest.mock('../../supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getUser: () => mockGetUser() },
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

const mockProfile = { id: 'profile-local-1' };
jest.mock('../../../stores/profileStore', () => ({
  useProfileStore: {
    getState: () => ({
      profile: mockProfile,
      setProfile: jest.fn(),
    }),
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

describe('applyCustomerInfoToProfile — Supabase remote update', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'auth-uid-123' } } });
  });

  it("profiles を .eq('id', userId) で更新する(user_id ではない)", async () => {
    await applyCustomerInfoToProfile(customerInfoWith('pro'));

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockEq).toHaveBeenCalledTimes(1);
    expect(mockEq).toHaveBeenCalledWith('id', 'auth-uid-123');
    // 取り違えの明示ガード
    expect(mockEq).not.toHaveBeenCalledWith('user_id', expect.anything());
  });

  it('pro entitlement のとき plan=pro / subscription_status=active を書く', async () => {
    await applyCustomerInfoToProfile(customerInfoWith('pro'));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const payload = mockUpdate.mock.calls[0][0];
    expect(payload.plan).toBe('pro');
    expect(payload.subscription_status).toBe('active');
    expect(typeof payload.subscription_updated_at).toBe('string');
  });

  it('free(entitlement なし)のとき plan=free / subscription_status=free', async () => {
    await applyCustomerInfoToProfile(customerInfoWith(null));

    const payload = mockUpdate.mock.calls[0][0];
    expect(payload.plan).toBe('free');
    expect(payload.subscription_status).toBe('free');
  });

  it('未ログイン時は remote update を行わない', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await applyCustomerInfoToProfile(customerInfoWith('pro'));
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
