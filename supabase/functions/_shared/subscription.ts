// v1.6.0 Sprint 1b — C-1 server-source-of-truth subscription logic.
//
// Pure TS (no Deno remote imports) so it is unit-testable under Node jest
// AND importable by the Deno EFs (revenuecat-webhook / sync-subscription /
// start-trial) via a `.ts` relative import.
//
// Responsibility: turn an external entitlement signal (RC webhook event OR
// RC REST subscriber response) into the authoritative `profiles` column
// values, with an ordering guard so out-of-order / duplicate webhook
// deliveries never roll the row backwards.
//
// The RAW `plan` column is what the 6 plan-reading EFs (coach-chat etc.)
// trust directly — so it MUST already reflect *effective* access (expired
// subscriptions resolve to 'free' here, not at read time).

export type Plan = 'free' | 'plus' | 'pro';

// Entitlement identifiers — must match the RevenueCat dashboard exactly and
// the client's revenueCatService.ts (ENTITLEMENT_PRO/PLUS).
export const ENTITLEMENT_PRO = 'pro';
export const ENTITLEMENT_PLUS = 'plus';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// RC `app_user_id` is the Supabase auth uid ONLY after Purchases.logIn(uid).
// Pre-login purchases carry an anonymous `$RCAnonymousID:...`; those have no
// matching profiles row and must be ignored safely (the aliased / TRANSFER
// event later carries the real uid). Gate strictly on UUID shape.
export function isValidAppUserId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

// 'pro' wins over 'plus' (matches client planFromCustomerInfo precedence).
export function planFromEntitlements(entitlementIds: unknown): Plan {
  if (!Array.isArray(entitlementIds)) return 'free';
  if (entitlementIds.includes(ENTITLEMENT_PRO)) return 'pro';
  if (entitlementIds.includes(ENTITLEMENT_PLUS)) return 'plus';
  return 'free';
}

export interface SubscriptionColumns {
  plan: Plan;
  plan_expires_at: string | null;
  subscription_status: 'free' | 'active';
  // Watermark for ordering — the event time in ms (NOT wall-clock).
  eventTsMs: number;
}

export interface WebhookEventLike {
  type?: unknown;
  entitlement_ids?: unknown;
  expiration_at_ms?: unknown;
  event_timestamp_ms?: unknown;
}

// Event types that mean access has ended regardless of the entitlement
// array still echoing the (now-dead) entitlement id.
const TERMINAL_EVENT_TYPES = new Set(['EXPIRATION']);

function toFiniteMs(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// Derive the authoritative columns from a RevenueCat webhook event.
//
// Effective-access rule (so the RAW `plan` column the gate-EFs read is
// already correct):
//   plan := entitlement-derived plan, BUT downgraded to 'free' when
//     - the event is terminal (EXPIRATION), OR
//     - expiration_at_ms is in the past relative to the event timestamp.
//   plan_expires_at := the expiration ISO when active & bounded, else null
//     (a lifetime / non-renewing entitlement may have null expiration).
export function deriveWebhookUpdate(event: WebhookEventLike): SubscriptionColumns {
  const eventTsMs = toFiniteMs(event.event_timestamp_ms) ?? 0;
  const entitlementPlan = planFromEntitlements(event.entitlement_ids);
  const expMs = toFiniteMs(event.expiration_at_ms);
  const isTerminal =
    typeof event.type === 'string' && TERMINAL_EVENT_TYPES.has(event.type);

  // Expired if we have a bounded expiration that is not after the event time.
  const isExpired = expMs !== null && expMs <= eventTsMs;

  const active = entitlementPlan !== 'free' && !isTerminal && !isExpired;

  return {
    plan: active ? entitlementPlan : 'free',
    plan_expires_at:
      active && expMs !== null ? new Date(expMs).toISOString() : null,
    subscription_status: active ? 'active' : 'free',
    eventTsMs,
  };
}

// RC REST `GET /subscribers/{id}` shape (subset): entitlements is a map of
// entitlement id → { expires_date: ISO string | null }. null expires_date
// means a non-expiring (lifetime / sandbox) entitlement → treat as active.
export interface SubscriberEntitlement {
  expires_date?: string | null;
}
export function planFromSubscriber(
  entitlements: Record<string, SubscriberEntitlement> | null | undefined,
  nowMs: number,
): { plan: Plan; plan_expires_at: string | null } {
  if (!entitlements || typeof entitlements !== 'object') {
    return { plan: 'free', plan_expires_at: null };
  }
  const activeIds: string[] = [];
  let latestExpiry: number | null = null;
  for (const [id, ent] of Object.entries(entitlements)) {
    const exp = ent?.expires_date ? Date.parse(ent.expires_date) : null;
    const active = exp === null || (Number.isFinite(exp) && exp > nowMs);
    if (active) {
      activeIds.push(id);
      if (exp !== null && (latestExpiry === null || exp > latestExpiry)) {
        latestExpiry = exp;
      }
    }
  }
  const plan = planFromEntitlements(activeIds);
  return {
    plan,
    plan_expires_at:
      plan !== 'free' && latestExpiry !== null
        ? new Date(latestExpiry).toISOString()
        : null,
  };
}

// Ordering / out-of-order guard. Apply the incoming event only if it is
// strictly newer than the watermark currently stored on the row
// (`profiles.subscription_updated_at`). A null/invalid watermark means the
// row has never been written by the server → apply.
export function shouldApplyEvent(
  eventTsMs: number,
  currentWatermarkISO: string | null | undefined,
): boolean {
  if (!Number.isFinite(eventTsMs)) return false;
  if (!currentWatermarkISO) return true;
  const cur = Date.parse(currentWatermarkISO);
  if (Number.isNaN(cur)) return true;
  return eventTsMs > cur;
}
