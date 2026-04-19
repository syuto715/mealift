// Pricing constants for the Free / Plus / Pro subscription tiers.
//
// Single source of truth for the UI (subscription screen, upgrade prompts)
// and any future receipt validation. Prices are in JPY and match the
// App Store / Play Store SKUs defined in the store consoles.

export type PaidTier = 'plus' | 'pro';
export type BillingCycle = 'monthly' | 'biannual' | 'annual';

export const TRIAL_DURATION_DAYS = 7;

export interface TierPricing {
  monthly: number;
  biannual: number;
  annual: number;
}

export const PRICING: Record<PaidTier, TierPricing> = {
  plus: {
    monthly: 480,
    biannual: 1900,
    annual: 3600,
  },
  pro: {
    monthly: 980,
    biannual: 4800,
    annual: 8800,
  },
};

export function priceFor(tier: PaidTier, cycle: BillingCycle): number {
  return PRICING[tier][cycle];
}

// Effective monthly price, used for "per-month" callouts on non-monthly plans.
export function monthlyEquivalent(
  tier: PaidTier,
  cycle: BillingCycle,
): number {
  const total = PRICING[tier][cycle];
  const months = cycle === 'monthly' ? 1 : cycle === 'biannual' ? 6 : 12;
  return Math.round(total / months);
}
