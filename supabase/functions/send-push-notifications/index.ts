import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// send-push-notifications — outbox drainer Edge Function.
//
// Triggered every minute by a pg_cron job (Session 4 commit 4) that
// POSTs to this URL with Authorization: Bearer <CRON_SECRET>. The
// function:
//
//   1. Validates the cron secret in the Authorization header
//   2. Selects up to BATCH_LIMIT pending rows from notification_outbox
//      (sent_at IS NULL AND attempt_count < MAX_ATTEMPTS)
//   3. For each row:
//        a. Reads profiles.notifications_submission_enabled — opt-out
//           consumes the row (sent_at = now()) without sending
//        b. Reads push_tokens for the recipient — no tokens consumes
//           the row similarly
//        c. POSTs each token to Expo Push API
//           (https://exp.host/--/api/v2/push/send)
//        d. On any per-token success → marks row sent_at = now()
//        e. On all failures → increments attempt_count
//        f. On 'DeviceNotRegistered' → deletes that push_tokens row
//
// Failure modes:
//   - attempt_count >= MAX_ATTEMPTS → row stays NULL sent_at, ignored
//     forever. Future Build 16+ may add a dead-letter table; for v1
//     manual cleanup is acceptable (low expected volume).
//   - Cron job fails to call us → no notifications fire, but the rows
//     persist. Next successful cron run drains them.
//   - Vault secret rotation: update CRON_SECRET in Supabase Functions
//     env AND `vault.update_secret(...)` in the same maintenance
//     window. Both must match.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_LIMIT = 50;
const MAX_ATTEMPTS = 5;

const CORS_HEADERS = {
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

interface OutboxRow {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  attempt_count: number;
}

interface PushToken {
  expo_push_token: string;
  platform: string;
}

interface ExpoPushTicket {
  status?: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushResponse {
  data?: ExpoPushTicket | ExpoPushTicket[];
  errors?: { message: string }[];
}

async function sendOneToken(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown> | null,
): Promise<ExpoPushTicket> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify({
      to: token,
      title,
      body,
      data: data ?? {},
      sound: 'default',
    }),
  });
  const json = (await res.json()) as ExpoPushResponse;
  // Expo wraps single sends in a single ticket object (or sometimes
  // an array of one). Normalize to a single ticket.
  const ticket = Array.isArray(json.data) ? json.data[0] : json.data;
  return ticket ?? { status: 'error', message: 'no ticket returned' };
}

async function processRow(
  admin: ReturnType<typeof createClient>,
  row: OutboxRow,
): Promise<{ sent: boolean }> {
  // 3a. Opt-in check
  const { data: profile } = await admin
    .from('profiles')
    .select('notifications_submission_enabled')
    .eq('id', row.user_id)
    .maybeSingle();

  if (!profile || profile.notifications_submission_enabled === false) {
    // Opt-out (or missing profile) → consume so cron stops re-checking.
    await admin
      .from('notification_outbox')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', row.id);
    return { sent: false };
  }

  // 3b. Token fetch
  const { data: tokens } = await admin
    .from('push_tokens')
    .select('expo_push_token, platform')
    .eq('user_id', row.user_id);

  if (!tokens || tokens.length === 0) {
    // No devices registered → consume; user can't be notified.
    await admin
      .from('notification_outbox')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', row.id);
    return { sent: false };
  }

  // 3c-d. Per-token send.
  let anySuccess = false;
  for (const t of tokens as PushToken[]) {
    let ticket: ExpoPushTicket;
    try {
      ticket = await sendOneToken(t.expo_push_token, row.title, row.body, row.payload);
    } catch {
      // Network error — count as not-success for this token; outer
      // attempt_count++ will retry on next cron run.
      continue;
    }
    if (ticket.status === 'ok') {
      anySuccess = true;
    } else if (ticket.details?.error === 'DeviceNotRegistered') {
      // 3f. Token is dead — purge so we don't retry it forever.
      await admin
        .from('push_tokens')
        .delete()
        .eq('expo_push_token', t.expo_push_token);
    }
    // Other errors fall through; the outer attempt_count++ covers them.
  }

  if (anySuccess) {
    await admin
      .from('notification_outbox')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', row.id);
    return { sent: true };
  }

  // All tokens failed → bump attempt_count for retry on next cron tick.
  await admin
    .from('notification_outbox')
    .update({ attempt_count: row.attempt_count + 1 })
    .eq('id', row.id);
  return { sent: false };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // 1. Cron-secret auth. Bearer header — pg_cron sets this from
  //    vault.decrypted_secrets at job-fire time.
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 2. Fetch pending batch (oldest first; gives FIFO behavior).
  const { data: pending, error } = await admin
    .from('notification_outbox')
    .select('id, user_id, kind, title, body, payload, attempt_count')
    .is('sent_at', null)
    .lt('attempt_count', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    return jsonResponse(
      { error: 'select failed', message: error.message },
      500,
    );
  }

  let sent = 0;
  let consumed = 0;
  const rows = (pending ?? []) as OutboxRow[];
  for (const row of rows) {
    const result = await processRow(admin, row);
    if (result.sent) sent += 1;
    consumed += 1;
  }

  return jsonResponse({
    processed: consumed,
    sent,
    batch_limit: BATCH_LIMIT,
  });
});
