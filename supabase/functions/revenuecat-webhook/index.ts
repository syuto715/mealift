import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  deriveWebhookUpdate,
  isValidAppUserId,
  shouldApplyEvent,
} from '../_shared/subscription.ts';

// v1.6.0 Sprint 1b — RevenueCat webhook EF (C-1 server-source-of-truth).
//
// verify_jwt = false (config.toml): RC has no Supabase JWT. We authenticate
// the request ourselves by constant-time-comparing the Authorization header
// against REVENUECAT_WEBHOOK_AUTH (the value configured in the RC dashboard).
//
// Flow:
//   1. Auth: Authorization === REVENUECAT_WEBHOOK_AUTH (constant time) else 401.
//   2. Parse body.event. Resolve app_user_id → must be a UUID (= auth uid set
//      via Purchases.logIn). Anonymous / non-UUID → log + 200 (no retry).
//   3. Idempotency: if event.id already in revenuecat_events → 200 (no-op).
//   4. Ordering: apply only if event_timestamp_ms > profiles.subscription_updated_at.
//   5. service_role update of plan / subscription_status / plan_expires_at /
//      subscription_updated_at (watermark = event time). Then record ledger row.
//   6. Return 200 for every authenticated request (intentional ignores AND
//      errors) so RC does not enter its 5x retry/disable cycle — the
//      sync-subscription reconcile (client startup) is the self-heal path.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_AUTH = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Length-independent constant-time compare of the content bytes. (The length
// of a shared secret is not itself sensitive.)
function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) {
    let r = 1;
    for (let i = 0; i < ab.length; i++) r |= ab[i] ^ (bb[i % (bb.length || 1)] ?? 0);
    return false;
  }
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  // --- 1. Auth (constant-time shared-secret) ---
  const provided = req.headers.get('Authorization') ?? '';
  if (!WEBHOOK_AUTH || !constantTimeEqual(provided, WEBHOOK_AUTH)) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- 2. Parse + resolve subject ---
  let event: Record<string, unknown> = {};
  try {
    const body = await req.json();
    event = (body?.event ?? {}) as Record<string, unknown>;
  } catch {
    // Malformed body is non-retryable — ack so RC stops resending.
    return jsonResponse({ received: true, outcome: 'bad_body' }, 200);
  }

  const eventId =
    typeof event.id === 'string' && event.id ? event.id : null;
  const appUserId = event.app_user_id;
  const eventType = typeof event.type === 'string' ? event.type : null;

  // Helper to record an audit/idempotency ledger row. PK = event_id, so a
  // duplicate delivery's INSERT no-ops via ON CONFLICT (ignoreDuplicates).
  async function recordEvent(
    userId: string | null,
    outcome: string,
    eventTsMs: number | null,
  ): Promise<void> {
    if (!eventId) return;
    await admin
      .from('revenuecat_events')
      .upsert(
        {
          event_id: eventId,
          app_user_id: typeof appUserId === 'string' ? appUserId : null,
          user_id: userId,
          event_type: eventType,
          event_timestamp_ms: eventTsMs,
          outcome,
          raw: event,
        },
        { onConflict: 'event_id', ignoreDuplicates: true },
      );
  }

  // Anonymous / non-UUID subject → cannot match a profile. Ack + log.
  if (!isValidAppUserId(appUserId)) {
    await recordEvent(null, 'ignored_anonymous', null);
    return jsonResponse({ received: true, outcome: 'ignored_anonymous' }, 200);
  }
  const userId = appUserId;

  // --- 3. Idempotency: already processed? ---
  if (eventId) {
    const { data: existing } = await admin
      .from('revenuecat_events')
      .select('event_id')
      .eq('event_id', eventId)
      .maybeSingle();
    if (existing) {
      return jsonResponse({ received: true, outcome: 'duplicate' }, 200);
    }
  }

  try {
    const update = deriveWebhookUpdate(event);

    // --- 4. Ordering guard against the row's current watermark ---
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('subscription_updated_at')
      .eq('id', userId)
      .maybeSingle();

    if (profileErr) {
      await recordEvent(userId, 'error', update.eventTsMs);
      return jsonResponse({ received: true, outcome: 'error' }, 200);
    }
    if (!profile) {
      await recordEvent(userId, 'no_profile', update.eventTsMs);
      return jsonResponse({ received: true, outcome: 'no_profile' }, 200);
    }

    const watermark =
      (profile as { subscription_updated_at: string | null })
        .subscription_updated_at ?? null;

    if (!shouldApplyEvent(update.eventTsMs, watermark)) {
      await recordEvent(userId, 'ignored_old', update.eventTsMs);
      return jsonResponse({ received: true, outcome: 'ignored_old' }, 200);
    }

    // --- 5. Authoritative write (service_role) ---
    const { error: updateErr } = await admin
      .from('profiles')
      .update({
        plan: update.plan,
        subscription_status: update.subscription_status,
        plan_expires_at: update.plan_expires_at,
        // Watermark = event time (ms→ISO) so out-of-order events are rejected
        // by shouldApplyEvent on the next delivery.
        subscription_updated_at: new Date(update.eventTsMs).toISOString(),
      })
      .eq('id', userId);

    if (updateErr) {
      await recordEvent(userId, 'error', update.eventTsMs);
      return jsonResponse({ received: true, outcome: 'error' }, 200);
    }

    await recordEvent(userId, 'applied', update.eventTsMs);
    return jsonResponse({ received: true, outcome: 'applied' }, 200);
  } catch (_e) {
    // Never surface a 5xx — RC would retry then disable the webhook. The
    // startup sync-subscription reconcile self-heals a dropped event.
    await recordEvent(userId, 'error', null);
    return jsonResponse({ received: true, outcome: 'error' }, 200);
  }
});
