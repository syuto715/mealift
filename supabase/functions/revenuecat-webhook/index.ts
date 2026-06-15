import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  deriveWebhookUpdate,
  isValidAppUserId,
} from '../_shared/subscription.ts';
import { constantTimeEqual } from '../_shared/timingSafe.ts';

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

// constantTimeEqual now lives in ../_shared/timingSafe.ts (shared with the
// cron EFs). Imported at the top of this file.

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

  try {
    const update = deriveWebhookUpdate(event);
    const eventIso = new Date(update.eventTsMs).toISOString();

    // --- 3+4+5. Atomic apply (ordering + dedup enforced in ONE statement) ---
    //
    // Codex round 1 Critical — the previous read-watermark-then-write was a
    // TOCTOU race: two concurrent/out-of-order deliveries could both pass a
    // JS-side check and the older one write last (rollback). We push the
    // ordering predicate INTO the UPDATE so the database arbitrates:
    //
    //   UPDATE ... SET ..., subscription_updated_at = eventIso
    //   WHERE id = uid
    //     AND (subscription_updated_at IS NULL OR subscription_updated_at < eventIso)
    //
    // - Strictly-older or equal-timestamp events match 0 rows → no-op. This
    //   also makes a re-delivered SAME event idempotent (its timestamp equals
    //   the stored watermark → not '<' → 0 rows), so the profile STATE needs
    //   no separate dedup. The revenuecat_events ledger remains for audit
    //   (PK + ignoreDuplicates), not as the state gate.
    const { data: appliedRows, error: updateErr } = await admin
      .from('profiles')
      .update({
        plan: update.plan,
        subscription_status: update.subscription_status,
        plan_expires_at: update.plan_expires_at,
        subscription_updated_at: eventIso,
      })
      .eq('id', userId)
      .or(
        `subscription_updated_at.is.null,subscription_updated_at.lt.${eventIso}`,
      )
      .select('id');

    if (updateErr) {
      await recordEvent(userId, 'error', update.eventTsMs);
      return jsonResponse({ received: true, outcome: 'error' }, 200);
    }

    const applied = Array.isArray(appliedRows) && appliedRows.length > 0;
    // 0 rows = either an older/duplicate event (watermark not advanced) or no
    // matching profile row. Either way the state is correct; label for audit.
    const outcome = applied ? 'applied' : 'ignored_old_or_absent';
    await recordEvent(userId, outcome, update.eventTsMs);
    return jsonResponse({ received: true, outcome }, 200);
  } catch (_e) {
    // Never surface a 5xx — RC would retry then disable the webhook. The
    // startup sync-subscription reconcile self-heals a dropped event.
    await recordEvent(userId, 'error', null);
    return jsonResponse({ received: true, outcome: 'error' }, 200);
  }
});
