import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// v1.5 Stage 1 Phase 1.1 — cleanup-idempotency-keys Edge Function.
//
// Architectural SSoT: docs/plans/v1.5_stage_1_ai_chat_epic.md §5.1
// retention prose + §10 Phase 1.1 cron job spec.
//
// Operation: NULLs `chat_messages.idempotency_key` for rows older
// than 24h. The partial unique index
// `chat_messages_idempotency_key_unique WHERE idempotency_key IS
// NOT NULL` automatically removes NULLed rows from its keyspace,
// freeing the keys for reuse.
//
// Trigger: hourly cron (pg_cron). Same mechanism as
// `send-push-notifications`. The cron secret is verified against
// CRON_SECRET; this EF accepts no other authentication path.
//
// NewI2 + Drafting 96 application: the partial-index entry can
// NOT be deleted independently in PostgreSQL. Setting the column
// to NULL is the supported mechanism to drop a row from a partial
// index without dropping the row from the table.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

const FUNCTION_NAME = 'cleanup-idempotency-keys';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // Auth: CRON_SECRET via Authorization Bearer header. Same
  // pattern as `send-push-notifications`. The cron secret is a
  // hex string, not a JWT — the gateway-level JWT verification
  // is disabled for this function via supabase/config.toml
  // [functions.cleanup-idempotency-keys].
  const authHeader = req.headers.get('Authorization') ?? '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!provided || provided !== CRON_SECRET) {
    return jsonResponse(
      { error: 'unauthorized', message: 'cron secret mismatch' },
      401,
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // The partial unique index `where idempotency_key is not null`
  // means that after this UPDATE, NULLed rows drop out of the
  // index. The row itself stays in the table (the message history
  // is preserved); only the idempotency key is reclaimed.
  const { count, error } = await admin
    .from('chat_messages')
    .update({ idempotency_key: null })
    .lt('created_at', cutoffIso)
    .not('idempotency_key', 'is', null)
    .select('id', { count: 'exact', head: true });

  if (error) {
    return jsonResponse(
      {
        error: 'internal_error',
        message: `cleanup failed: ${error.message}`,
        function_name: FUNCTION_NAME,
      },
      500,
    );
  }

  return jsonResponse(
    {
      cleared: count ?? 0,
      cutoff: cutoffIso,
      function_name: FUNCTION_NAME,
    },
    200,
  );
});
