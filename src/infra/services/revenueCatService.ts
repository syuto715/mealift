import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
  LOG_LEVEL,
} from 'react-native-purchases';
import { supabase, isSupabaseConfigured } from '../supabase/client';
import { updateProfile } from '../repositories/profileRepository';
import { setTier } from './subscriptionService';
import { useProfileStore } from '../../stores/profileStore';
import type { PlanBillingCycle } from '../../types/profile';

const ERROR_CODE = Purchases.PURCHASES_ERROR_CODE;

// ---------------------------------------------------------------------------
// Entitlement identifiers — must match the RevenueCat dashboard exactly.
// ---------------------------------------------------------------------------
const ENTITLEMENT_PRO = 'pro';
const ENTITLEMENT_PLUS = 'plus';

export type SubscriptionPlan = 'free' | 'plus' | 'pro';

// RevenueCat codes come through as strings in the JS layer. We wrap them so
// UI callers can `switch (e.code)` without importing the SDK's enum.
export type RevenueCatErrorCode =
  | 'PURCHASE_CANCELLED'
  | 'PURCHASE_NOT_ALLOWED'
  | 'PAYMENT_PENDING'
  | 'STORE_PROBLEM'
  | 'INVALID_CREDENTIALS'
  | 'NETWORK_ERROR'
  | 'PRODUCT_NOT_AVAILABLE'
  | 'NOT_CONFIGURED'
  | 'UNSUPPORTED_PLATFORM'
  | 'UNKNOWN';

export class RevenueCatError extends Error {
  code: RevenueCatErrorCode;
  userCancelled: boolean;
  constructor(code: RevenueCatErrorCode, message: string, userCancelled = false) {
    super(message);
    this.name = 'RevenueCatError';
    this.code = code;
    this.userCancelled = userCancelled;
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let configured = false;

function getApiKey(): string | null {
  const extra = Constants.expoConfig?.extra as
    | { revenueCatIosApiKey?: string; revenueCatAndroidApiKey?: string }
    | undefined;
  if (Platform.OS === 'ios') return extra?.revenueCatIosApiKey || null;
  if (Platform.OS === 'android') return extra?.revenueCatAndroidApiKey || null;
  return null;
}

export function isRevenueCatAvailable(): boolean {
  return configured;
}

// Legacy alias — kept so earlier call sites continue to compile.
export const isRevenueCatConfigured = isRevenueCatAvailable;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function initialize(): void {
  // Android support is pending — skip silently so the app still boots.
  if (Platform.OS !== 'ios') return;
  if (configured) return;

  const apiKey = getApiKey();
  if (!apiKey) {
    // Not fatal — we want Dev Client builds without an RC key to still boot —
    // but it's useful to know why in-app purchase flows are disabled.
    console.warn(
      '[RevenueCat] API key missing — IAP disabled. Set EXPO_PUBLIC_REVENUECAT_IOS_API_KEY in .env.',
    );
    return;
  }

  try {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
    Purchases.configure({ apiKey });
    configured = true;
  } catch (e) {
    console.warn('[RevenueCat] configure() failed', e);
  }
}

export async function identifyUser(userId: string): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logIn(userId);
  } catch {
    // Non-fatal — entitlements will fall back to anonymous user id.
  }
}

export async function logOut(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch {
    // Non-fatal.
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch {
    return null;
  }
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!configured) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}

export function planFromCustomerInfo(
  info: CustomerInfo | null,
): SubscriptionPlan {
  if (!info) return 'free';
  const active = info.entitlements.active;
  if (active[ENTITLEMENT_PRO]) return 'pro';
  if (active[ENTITLEMENT_PLUS]) return 'plus';
  return 'free';
}

export async function getSubscriptionStatus(): Promise<SubscriptionPlan> {
  return planFromCustomerInfo(await getCustomerInfo());
}

// ---------------------------------------------------------------------------
// Purchase / restore
// ---------------------------------------------------------------------------

function mapPurchaseError(e: unknown): RevenueCatError {
  if (!e || typeof e !== 'object') {
    return new RevenueCatError('UNKNOWN', '不明なエラーが発生しました');
  }
  const err = e as {
    code?: string;
    userCancelled?: boolean;
    message?: string;
  };

  if (err.userCancelled) {
    return new RevenueCatError('PURCHASE_CANCELLED', '購入をキャンセルしました', true);
  }

  switch (err.code) {
    case ERROR_CODE.PURCHASE_CANCELLED_ERROR:
      return new RevenueCatError('PURCHASE_CANCELLED', '購入をキャンセルしました', true);
    case ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
      return new RevenueCatError('PURCHASE_NOT_ALLOWED', 'この端末では購入できません');
    case ERROR_CODE.PAYMENT_PENDING_ERROR:
      return new RevenueCatError('PAYMENT_PENDING', '決済処理中です。しばらくお待ちください');
    case ERROR_CODE.STORE_PROBLEM_ERROR:
      return new RevenueCatError('STORE_PROBLEM', 'App Store に問題が発生しました');
    case ERROR_CODE.INVALID_CREDENTIALS_ERROR:
      return new RevenueCatError('INVALID_CREDENTIALS', '認証情報が無効です');
    case ERROR_CODE.NETWORK_ERROR:
      return new RevenueCatError('NETWORK_ERROR', 'ネットワーク接続を確認してください');
    case ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR:
      return new RevenueCatError('PRODUCT_NOT_AVAILABLE', 'この商品は現在購入できません');
    case ERROR_CODE.CONFIGURATION_ERROR:
      return new RevenueCatError('NOT_CONFIGURED', 'RevenueCat が設定されていません');
    default:
      return new RevenueCatError(
        'UNKNOWN',
        err.message ?? '購入処理でエラーが発生しました',
      );
  }
}

export interface PurchaseResult {
  customerInfo: CustomerInfo | null;
  userCancelled: boolean;
}

export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<PurchaseResult> {
  if (!configured) {
    throw new RevenueCatError(
      Platform.OS === 'ios' ? 'NOT_CONFIGURED' : 'UNSUPPORTED_PLATFORM',
      Platform.OS === 'ios'
        ? 'RevenueCat が設定されていません'
        : 'この機能は iOS でのみ利用可能です',
    );
  }
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { customerInfo, userCancelled: false };
  } catch (e) {
    const mapped = mapPurchaseError(e);
    if (mapped.userCancelled) {
      return { customerInfo: null, userCancelled: true };
    }
    throw mapped;
  }
}

export async function restorePurchases(): Promise<CustomerInfo> {
  if (!configured) {
    throw new RevenueCatError(
      Platform.OS === 'ios' ? 'NOT_CONFIGURED' : 'UNSUPPORTED_PLATFORM',
      Platform.OS === 'ios'
        ? 'RevenueCat が設定されていません'
        : 'この機能は iOS でのみ利用可能です',
    );
  }
  try {
    return await Purchases.restorePurchases();
  } catch (e) {
    throw mapPurchaseError(e);
  }
}

// ---------------------------------------------------------------------------
// Listeners
// ---------------------------------------------------------------------------

export function addCustomerInfoListener(
  cb: (info: CustomerInfo) => void,
): () => void {
  if (!configured) return () => {};
  Purchases.addCustomerInfoUpdateListener(cb);
  // RN-Purchases exposes removeCustomerInfoUpdateListener(cb) on 7.x+.
  return () => {
    try {
      Purchases.removeCustomerInfoUpdateListener(cb);
    } catch {
      // Older SDK versions may not export removal — safe to ignore.
    }
  };
}

// ---------------------------------------------------------------------------
// Package helpers (UI-friendly)
// ---------------------------------------------------------------------------

// Package identifier convention from the RevenueCat dashboard:
//   plus_monthly / plus_halfyear / plus_annual
//   pro_monthly  / pro_halfyear  / pro_annual
export type BillingCycleKey = 'monthly' | 'biannual' | 'annual';
export type PackageKey =
  | 'plus_monthly'
  | 'plus_halfyear'
  | 'plus_annual'
  | 'pro_monthly'
  | 'pro_halfyear'
  | 'pro_annual';

export function packageKey(
  tier: 'plus' | 'pro',
  cycle: BillingCycleKey,
): PackageKey {
  const cycleSlug = cycle === 'biannual' ? 'halfyear' : cycle;
  return `${tier}_${cycleSlug}` as PackageKey;
}

export function findPackage(
  offering: PurchasesOffering | null,
  tier: 'plus' | 'pro',
  cycle: BillingCycleKey,
): PurchasesPackage | null {
  if (!offering) return null;
  const id = packageKey(tier, cycle);
  return offering.availablePackages.find((p) => p.identifier === id) ?? null;
}

// ---------------------------------------------------------------------------
// Sync CustomerInfo → local profile + module tier + Supabase
// ---------------------------------------------------------------------------

// Maps RevenueCat package identifier suffix to our internal billing cycle.
function cycleFromProductId(productId: string | undefined): PlanBillingCycle | null {
  if (!productId) return null;
  const id = productId.toLowerCase();
  if (id.includes('monthly')) return 'monthly';
  if (id.includes('halfyear') || id.includes('biannual')) return 'biannual';
  if (id.includes('annual') || id.includes('yearly')) return 'annual';
  return null;
}

// Applies the active entitlement state from CustomerInfo to every local store
// of plan state we have: module tier, local SQLite profile, Zustand profile
// snapshot, and (when signed in) the remote Supabase profile row. v1 runs this
// from the client on purchase / customer-info updates. In v2 the same
// columns should be reconciled via a RevenueCat webhook writing to Supabase.
export async function applyCustomerInfoToProfile(
  info: CustomerInfo | null,
): Promise<void> {
  const plan = planFromCustomerInfo(info);

  // 1. Module tier — drives derivePlanSnapshot's pro-vs-plus disambiguation.
  setTier(plan);

  // 2. Local profile mutation
  const profile = useProfileStore.getState().profile;
  if (!profile) return;

  const activeEntitlement =
    info?.entitlements.active.pro ?? info?.entitlements.active.plus ?? null;
  const planExpiresAt = activeEntitlement?.expirationDate ?? null;
  const productId = activeEntitlement?.productIdentifier;
  const billingCycle = cycleFromProductId(productId);

  try {
    await updateProfile(profile.id, {
      planBillingCycle: billingCycle,
      planExpiresAt: planExpiresAt,
    });
    useProfileStore.getState().setProfile({
      ...profile,
      planBillingCycle: billingCycle,
      planExpiresAt: planExpiresAt,
    });
  } catch {
    // Local write failure — UI will re-derive on next customer-info update.
  }

  // 3. Supabase remote profile — used by edge functions for Pro gating.
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    const subscriptionStatus =
      plan === 'free' ? 'free' : activeEntitlement?.willRenew ? 'active' : 'expired';
    await supabase
      .from('profiles')
      .update({
        plan,
        subscription_status: subscriptionStatus,
        subscription_updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  } catch {
    // Non-fatal — client retains the local plan state.
  }
}
