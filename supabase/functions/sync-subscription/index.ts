import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  planFromSubscriber,
  shouldApplyEvent,
  type SubscriberEntitlement,
} from '../_shared/subscription.ts';

// v1.6.0 Sprint 1b — sync-subscription EF (C-1 self-heal / reconcile).
//
// verify_jwt = true: the client calls this with its own Supabase JWT on
// purchase / restore and on cold-start / foreground (webhook取りこぼしの
// self-heal). The EF queries the RevenueCat REST API with the server-only
// secret key and writes the authoritative subscription columns via
// service_role — the client never touches those columns directly.
//
// The REST snapshot reflects RC's CURRENT truth, so it uses wall-clock now
// as its watermark and wins over any older webhook event. On a REST/network
// failure we DO NOT touch the row (never clobber a good webhook state with a
// transient error).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RC_REST_API_KEY = Deno.env.get('REVENUECAT_REST_API_KEY') ?? '';

const RC_SUBSCRIBERS_URL = 'https://api.revenuecat.com/v1/subscribers';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  // --- Auth: Bearer JWT → userId ---
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: 'invalid_token' }, 401);
  }
  const userId = userData.user.id;

  if (!RC_REST_API_KEY) {
    return jsonResponse({ error: 'not_configured' }, 500);
  }

  // --- Query RC REST for the authoritative subscriber snapshot ---
  let entitlements: Record<string, SubscriberEntitlement> | null = null;
  try {
    const rcRes = await fetch(
      `${RC_SUBSCRIBERS_URL}/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${RC_REST_API_KEY}` } },
    );
    if (rcRes.status === 404) {
      // Unknown subscriber = no purchases → free is the truth.
      entitlements = {};
    } else if (!rcRes.ok) {
      // Transient RC error — do NOT clobber the row.
      return jsonResponse({ ok: false, reason: 'rc_unavailable' }, 200);
    } else {
      const body = await rcRes.json();
      entitlements =
        (body?.subscriber?.entitlements as Record<
          string,
          SubscriberEntitlement
        >) ?? {};
    }
  } catch {
    return jsonResponse({ ok: false, reason: 'rc_unavailable' }, 200);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nowMs = Date.now();
  const { plan, plan_expires_at } = planFromSubscriber(entitlements, nowMs);

  // Ordering guard: reconcile reflects current truth (now), so it wins over
  // any older webhook watermark.
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('subscription_updated_at')
    .eq('id', userId)
    .maybeSingle();
  if (profileErr || !profile) {
    return jsonResponse({ ok: false, reason: 'no_profile' }, 200);
  }
  const watermark =
    (profile as { subscription_updated_at: string | null })
      .subscription_updated_at ?? null;
  if (!shouldApplyEvent(nowMs, watermark)) {
    return jsonResponse({ ok: true, applied: false, plan }, 200);
  }

  const { error: updateErr } = await admin
    .from('profiles')
    .update({
      plan,
      subscription_status: plan === 'free' ? 'free' : 'active',
      plan_expires_at,
      subscription_updated_at: new Date(nowMs).toISOString(),
    })
    .eq('id', userId);
  if (updateErr) {
    return jsonResponse({ ok: false, reason: 'write_failed' }, 200);
  }

  // Audit (distinct id per reconcile; not a dedup key).
  await admin.from('revenuecat_events').upsert(
    {
      event_id: `reconcile:${userId}:${nowMs}`,
      app_user_id: userId,
      user_id: userId,
      event_type: 'RECONCILE',
      event_timestamp_ms: nowMs,
      outcome: 'applied',
      raw: { entitlements },
    },
    { onConflict: 'event_id', ignoreDuplicates: true },
  );

  return jsonResponse({ ok: true, applied: true, plan }, 200);
});
