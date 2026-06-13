import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// v1.6.0 Sprint 1b — start-trial EF (C-1).
//
// verify_jwt = true. The 7-day Plus trial is an app-side, RC-independent
// feature: there is no purchase and RC never learns about it, so neither the
// webhook nor sync-subscription can source `trial_started_at`. This EF makes
// the single-use trial server-authoritative:
//   service_role UPDATE ... SET trial_started_at = now()
//   WHERE id = <uid> AND trial_started_at IS NULL
// The IS NULL predicate enforces single-use on the server — a second call (or
// a client that tampered with its local copy) is a no-op and returns the
// existing trial_started_at. After step-B locks trial_started_at against the
// `authenticated` role, this service_role write still succeeds.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nowIso = new Date().toISOString();

  // Single-use enforced by the IS NULL predicate. `.select()` returns the
  // updated row(s): non-empty ⇒ we just started the trial; empty ⇒ a trial
  // was already started (no-op).
  const { data: updated, error: updateErr } = await admin
    .from('profiles')
    .update({ trial_started_at: nowIso })
    .eq('id', userId)
    .is('trial_started_at', null)
    .select('trial_started_at');

  if (updateErr) {
    return jsonResponse({ error: 'internal_error' }, 500);
  }

  if (updated && updated.length > 0) {
    return jsonResponse(
      { ok: true, started: true, trial_started_at: nowIso },
      200,
    );
  }

  // Already used — return the existing value so the client can reflect it.
  const { data: existing } = await admin
    .from('profiles')
    .select('trial_started_at')
    .eq('id', userId)
    .maybeSingle();

  return jsonResponse(
    {
      ok: true,
      started: false,
      trial_started_at:
        (existing as { trial_started_at: string | null } | null)
          ?.trial_started_at ?? null,
    },
    200,
  );
});
