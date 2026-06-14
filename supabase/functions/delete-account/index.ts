import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// v1.6.0 Sprint 6 — delete-account EF (App Store 5.1.1(v) compliance).
//
// verify_jwt = true. Deletes the CALLER'S OWN account only: the user id is
// taken from the verified JWT (auth.getUser()), NEVER from the request body,
// so a user can only delete themselves.
//
// Mechanism: service_role `auth.admin.deleteUser(userId)` hard-deletes the
// auth.users row. Every user-scoped public table FK-references auth.users(id)
// ON DELETE CASCADE, so the single delete atomically cascades to ALL related
// rows (profiles, body logs, meals, workouts, chat, coach_advice, etc.).
// public_foods.submitted_by / reviewed_by are ON DELETE SET NULL (migration
// 20260614000004) so community contributions survive anonymized and a
// reviewer account isn't blocked. revenuecat_events.user_id is SET NULL
// (audit ledger kept, anonymized).
//
// Idempotent: deleting an already-deleted user returns user-not-found, which
// we treat as success (200).
//
// RevenueCat is intentionally NOT touched: an App Store subscription cannot be
// cancelled from the app; the client UI warns the user to cancel via App Store
// settings. Deleting the RC customer here would not stop billing and RC would
// re-create it on the next receipt, so we leave it.

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

// supabase-js admin.deleteUser surfaces "not found" differently across
// versions; treat any not-found / no-such-user signal as already-deleted.
function isUserNotFound(error: { message?: string; status?: number } | null): boolean {
  if (!error) return false;
  if (error.status === 404) return true;
  return /not.?found|no.?user|does not exist/i.test(error.message ?? '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  // --- Auth: userId from the verified JWT, never from the body ---
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

  // --- Delete (service_role). Cascades across all user tables atomically. ---
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
  if (deleteErr && !isUserNotFound(deleteErr)) {
    // Real failure → auth.users row remains, so ALL data is intact and the
    // client can safely retry. Surface 500 so the client does NOT wipe local.
    return jsonResponse(
      { error: 'delete_failed', message: deleteErr.message ?? 'unknown' },
      500,
    );
  }

  return jsonResponse({ ok: true, deleted: true }, 200);
});
