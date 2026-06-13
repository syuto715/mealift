// v1.6.0 Sprint 1b — pure subscription logic tests (Node jest).
// The module is Deno-side but has no Deno globals, so jest imports it directly.

import {
  isValidAppUserId,
  planFromEntitlements,
  deriveWebhookUpdate,
  planFromSubscriber,
  shouldApplyEvent,
} from '../subscription';

const UID = '11111111-2222-4333-8444-555555555555';

describe('isValidAppUserId', () => {
  it('accepts a UUID', () => {
    expect(isValidAppUserId(UID)).toBe(true);
  });
  it('rejects anonymous RC ids and non-strings', () => {
    expect(isValidAppUserId('$RCAnonymousID:abc123')).toBe(false);
    expect(isValidAppUserId(null)).toBe(false);
    expect(isValidAppUserId(123)).toBe(false);
    expect(isValidAppUserId('')).toBe(false);
  });
});

describe('planFromEntitlements', () => {
  it('pro wins over plus', () => {
    expect(planFromEntitlements(['plus', 'pro'])).toBe('pro');
  });
  it('plus when only plus', () => {
    expect(planFromEntitlements(['plus'])).toBe('plus');
  });
  it('free for empty / non-array / unknown', () => {
    expect(planFromEntitlements([])).toBe('free');
    expect(planFromEntitlements(null)).toBe('free');
    expect(planFromEntitlements(['gold'])).toBe('free');
  });
});

describe('deriveWebhookUpdate', () => {
  const future = 2_000_000_000_000; // 2033
  const past = 1_000_000_000_000; // 2001
  const evtNow = 1_700_000_000_000; // 2023

  it('active purchase → plan from entitlement + expiry ISO + active', () => {
    const r = deriveWebhookUpdate({
      type: 'INITIAL_PURCHASE',
      entitlement_ids: ['pro'],
      expiration_at_ms: future,
      event_timestamp_ms: evtNow,
    });
    expect(r.plan).toBe('pro');
    expect(r.plan_expires_at).toBe(new Date(future).toISOString());
    expect(r.subscription_status).toBe('active');
    expect(r.eventTsMs).toBe(evtNow);
  });

  it('EXPIRATION → free even if entitlement_ids still echoes the id', () => {
    const r = deriveWebhookUpdate({
      type: 'EXPIRATION',
      entitlement_ids: ['pro'],
      expiration_at_ms: future,
      event_timestamp_ms: evtNow,
    });
    expect(r.plan).toBe('free');
    expect(r.plan_expires_at).toBeNull();
    expect(r.subscription_status).toBe('free');
  });

  it('expiration in the past relative to event → free (raw plan must be correct)', () => {
    const r = deriveWebhookUpdate({
      type: 'RENEWAL',
      entitlement_ids: ['plus'],
      expiration_at_ms: past,
      event_timestamp_ms: evtNow,
    });
    expect(r.plan).toBe('free');
    expect(r.plan_expires_at).toBeNull();
  });

  it('CANCELLATION (auto-renew off, still in term) keeps access until expiry', () => {
    const r = deriveWebhookUpdate({
      type: 'CANCELLATION',
      entitlement_ids: ['pro'],
      expiration_at_ms: future,
      event_timestamp_ms: evtNow,
    });
    expect(r.plan).toBe('pro');
    expect(r.plan_expires_at).toBe(new Date(future).toISOString());
  });

  it('BILLING_ISSUE within grace (future expiry) stays active', () => {
    const r = deriveWebhookUpdate({
      type: 'BILLING_ISSUE',
      entitlement_ids: ['plus'],
      expiration_at_ms: future,
      event_timestamp_ms: evtNow,
    });
    expect(r.plan).toBe('plus');
    expect(r.subscription_status).toBe('active');
  });

  it('lifetime / non-expiring entitlement (null expiry) → active, expires null', () => {
    const r = deriveWebhookUpdate({
      type: 'NON_RENEWING_PURCHASE',
      entitlement_ids: ['pro'],
      expiration_at_ms: null,
      event_timestamp_ms: evtNow,
    });
    expect(r.plan).toBe('pro');
    expect(r.plan_expires_at).toBeNull();
    expect(r.subscription_status).toBe('active');
  });
});

describe('planFromSubscriber (RC REST)', () => {
  const now = 1_700_000_000_000;
  it('active pro entitlement', () => {
    const r = planFromSubscriber(
      { pro: { expires_date: new Date(now + 86_400_000).toISOString() } },
      now,
    );
    expect(r.plan).toBe('pro');
    expect(r.plan_expires_at).not.toBeNull();
  });
  it('expired entitlement ignored → free', () => {
    const r = planFromSubscriber(
      { pro: { expires_date: new Date(now - 86_400_000).toISOString() } },
      now,
    );
    expect(r.plan).toBe('free');
    expect(r.plan_expires_at).toBeNull();
  });
  it('pro wins over plus among active', () => {
    const r = planFromSubscriber(
      {
        plus: { expires_date: new Date(now + 1000).toISOString() },
        pro: { expires_date: new Date(now + 2000).toISOString() },
      },
      now,
    );
    expect(r.plan).toBe('pro');
  });
  it('null/empty → free', () => {
    expect(planFromSubscriber(null, now).plan).toBe('free');
    expect(planFromSubscriber({}, now).plan).toBe('free');
  });
});

describe('shouldApplyEvent (ordering guard)', () => {
  it('applies when no watermark', () => {
    expect(shouldApplyEvent(1000, null)).toBe(true);
    expect(shouldApplyEvent(1000, undefined)).toBe(true);
  });
  it('applies when event strictly newer than watermark', () => {
    const wm = new Date(1_000).toISOString();
    expect(shouldApplyEvent(2_000, wm)).toBe(true);
  });
  it('rejects when event older than or equal to watermark', () => {
    const wm = new Date(2_000).toISOString();
    expect(shouldApplyEvent(1_000, wm)).toBe(false);
    expect(shouldApplyEvent(2_000, wm)).toBe(false);
  });
  it('rejects non-finite event ts', () => {
    expect(shouldApplyEvent(NaN, null)).toBe(false);
  });
  it('applies when watermark is unparseable', () => {
    expect(shouldApplyEvent(1_000, 'not-a-date')).toBe(true);
  });
});
