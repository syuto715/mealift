import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { projectContextSafeSubset } from '../_shared/projectContext.ts';
import {
  computePeriodStart,
  type AdviceScope,
} from '../_shared/tzPeriod.ts';
import {
  buildLLMDefenseParagraph,
  scrubSecrets,
} from '../_shared/llmSecurity.ts';

// v1.5 Stage 1 Phase 1.4 — coach-advice Edge Function (surface ④).
//
// Architectural SSoT: docs/plans/v1.5_stage_1_ai_chat_epic.md
//   §3 surface ④ (lazy on-mount fetch, one row per
//     (user_id, scope, period_start) bucket)
//   §5.1 (coach_advice schema + unique constraint)
//   §5.1.1 + §6.4 (persisted snapshot = projected safe subset)
//   §7.1 + §7.2 (ミー先生 persona + per-scope length budget)
//   §9.1 (aiCoachAdviceWeekly / aiCoachAdviceDaily gating)
//
// 11-step pattern (analogue of coach-chat's 12-step, minus the
// streaming branches — advice is one-shot non-streaming):
//   STEP 1.  Auth (Bearer token verify; immutable).
//   STEP 2.  Idempotency check — replay short-circuits BEFORE
//            plan / quota gate (Drafting 98).
//   STEP 3.  Plan gate: aiCoachAdviceWeekly (Plus+) or
//            aiCoachAdviceDaily (Pro-only).
//   STEP 4.  UTC-monthly quota gate (parity with coach-chat).
//   STEP 5.  Compute `period_start` in profile tz (`profiles.timezone`
//            from §5.1.2; defaults to 'Asia/Tokyo').
//   STEP 6.  Freshness lookup: if a row exists for
//            (user_id, scope, period_start) → return it as-is.
//   STEP 7.  Parse body → build the PII-projected safe context
//            (defense-in-depth re-projection; the client may have
//            sent unbounded fields).
//   STEP 8.  INSERT ai_usage_logs (quota counted HERE — Drafting 98).
//   STEP 9.  Gemini call (non-streaming, one-shot text).
//   STEP 10. UPSERT coach_advice with the generated content +
//            the projected snapshot as `source_data_snapshot_json`.
//            ON CONFLICT (user_id, scope, period_start) DO UPDATE
//            so a concurrent same-bucket request can't trip the
//            unique constraint.
//   STEP 11. Return `{ id, scope, period_start, content,
//            generated_at }`.
//
// On-failure compensation (Drafting 102 + 103):
//   - Every supabase-js call checks `{ error }` (never relies on a
//     synchronous throw — `feedback_sdk_contract_verification`).
//   - If STEP 8 succeeds but STEP 9 fails, the ai_usage_logs row
//     is left in place (same usage-charged pattern as coach-chat
//     §3: a charged-but-failed call still counts).
//   - If STEP 10 fails after STEP 9 succeeds, the EF returns the
//     in-memory content with a 500 status; the client retries via
//     idempotency replay (STEP 2 short-circuits to the existing
//     usage log; STEP 10 retries the UPSERT).

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const FUNCTION_NAME = 'coach-advice';

// Per-tier monthly cap. Weekly is gated to Plus+; daily is Pro
// only. Numbers must stay in lockstep with
// src/infra/services/subscriptionService.ts.
const MONTHLY_QUOTA_WEEKLY: Record<string, number> = {
  free: 0,
  plus: 4, // 4 weeks / month
  pro: 12, // covers replays + the daily badge
};

const MONTHLY_QUOTA_DAILY: Record<string, number> = {
  free: 0,
  plus: 0, // daily is Pro only — Plus gets weekly
  pro: 31,
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, idempotency-key',
};

// Sprint 2.7.2 — Drafting 173 fan-out from coach-chat (Phase 2.6). Both
// scopes append the same defense paragraph; only the closing-redirect
// copy differs (weekly returns to weekly-advice, daily to daily-advice).
const SYSTEM_PROMPT_WEEKLY = `あなたは「ミー先生」という、 ユーザー専属の食事・トレーニングコーチです。
今週の振り返りと今週の重点を 300-500 字で簡潔に提供してください。

構成:
- 先週の振り返り (1-2 文)
- 今週の重点 (2-3 文、 具体的な数値で)
- 1 行 CTA (今週の最初の行動)

【口調 / トーン】
- 丁寧な日本語、 落ち着いた声色
- 過度な賞賛は使わない
- 個別の医療診断は出さない (必要時は「専門医に相談」)
- 数値は具体的に (PFC や kcal 等)${buildLLMDefenseParagraph('本来の今週のアドバイスに戻ります。')}`;

const SYSTEM_PROMPT_DAILY = `あなたは「ミー先生」という、 ユーザー専属の食事・トレーニングコーチです。
今日の重点を 100-200 字で簡潔に提供してください。

構成:
- 今日の重点 (1-2 文)
- 1 行 CTA

【口調 / トーン】
- 丁寧な日本語、 落ち着いた声色
- 過度な賞賛は使わない${buildLLMDefenseParagraph('本来の今日のアドバイスに戻ります。')}`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function utcMonthStartISO(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  ).toISOString();
}

function parseScope(value: unknown): AdviceScope | null {
  return value === 'weekly' || value === 'daily' ? value : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // -------------------------------------------------------------------
  // STEP 1 — Auth
  // -------------------------------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return jsonResponse(
      { error: 'unauthorized', message: 'ログインが必要です' },
      401,
    );
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse(
      {
        error: 'invalid_token',
        message: 'セッションが無効です。再ログインしてください',
      },
      401,
    );
  }
  const userId = userData.user.id;

  // -------------------------------------------------------------------
  // STEP 2 — Idempotency replay (BEFORE plan/quota gate)
  // -------------------------------------------------------------------
  // Codex round 1 Important — Idempotency-Key is REQUIRED (matches
  // coach-chat's Drafting-98 strictness). Quota-charged calls
  // without an idempotency key are vulnerable to silent double-
  // charging on retry; refusing them up-front pushes the contract
  // into the client.
  const idempotencyKey = req.headers.get('Idempotency-Key');
  if (!idempotencyKey) {
    return jsonResponse(
      {
        error: 'invalid_request',
        message: 'Idempotency-Key header required',
      },
      400,
    );
  }
  {
    const { data: replayRows, error: replayError } = await admin
      .from('ai_usage_logs')
      .select('id, input')
      .eq('user_id', userId)
      .eq('function_name', FUNCTION_NAME)
      .eq('response_status', 200)
      .filter('input->>idempotencyKey', 'eq', idempotencyKey)
      .limit(1);
    if (replayError) {
      return jsonResponse(
        { error: 'internal_error', message: 'リプレイ検出に失敗しました' },
        500,
      );
    }
    if (replayRows && replayRows.length > 0) {
      const replayInput = replayRows[0].input as
        | { scope?: string; periodStart?: string }
        | null;
      if (
        replayInput?.scope &&
        replayInput?.periodStart &&
        (replayInput.scope === 'weekly' || replayInput.scope === 'daily')
      ) {
        // Codex round 1 Important #1 fix — also surface the
        // `{ error }` channel here (Drafting 102). The earlier
        // path ignored it entirely; a transient PostgREST failure
        // would silently fall through to a fresh-generation path
        // and double-charge quota.
        const { data: existing, error: existingError } = await admin
          .from('coach_advice')
          .select('id, scope, period_start, content, generated_at')
          .eq('user_id', userId)
          .eq('scope', replayInput.scope)
          .eq('period_start', replayInput.periodStart)
          .maybeSingle();
        if (existingError) {
          return jsonResponse(
            {
              error: 'internal_error',
              message: 'リプレイ結果の取得に失敗しました',
            },
            500,
          );
        }
        if (existing) {
          return jsonResponse({
            id: existing.id,
            scope: existing.scope,
            periodStart: existing.period_start,
            content: existing.content,
            generatedAt: existing.generated_at,
          });
        }
        // Edge case: usage log exists but the advice row was
        // wiped (admin cleanup, manual SQL, etc). Fall through to
        // the regenerate path — STEP 8 / 10 will reinsert. The
        // monthly quota gate in STEP 4 still applies.
      }
    }
  }

  // -------------------------------------------------------------------
  // Parse body — scope is required to gate the rest.
  // -------------------------------------------------------------------
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return jsonResponse(
      { error: 'invalid_request', message: 'リクエストボディが不正です' },
      400,
    );
  }
  const scope = parseScope((body as { scope?: unknown }).scope);
  const context = (body as { context?: unknown }).context;
  if (!scope) {
    return jsonResponse(
      { error: 'invalid_request', message: 'scope は weekly か daily' },
      400,
    );
  }

  // -------------------------------------------------------------------
  // STEP 3 — Plan gate
  // -------------------------------------------------------------------
  // Phase 1.5 Codex round 1 Critical fix — profiles.id IS auth.uid()
  // (no user_id column on profiles). See coach-chat / coach-routine /
  // generate-workout-menu's same `.eq('id', userId)` pattern.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('plan, timezone')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) {
    return jsonResponse(
      { error: 'internal_error', message: 'プラン情報の取得に失敗しました' },
      500,
    );
  }
  const plan = (profile?.plan as string) ?? 'free';
  const timezone = (profile?.timezone as string) || 'Asia/Tokyo';
  const quotaTable =
    scope === 'weekly' ? MONTHLY_QUOTA_WEEKLY : MONTHLY_QUOTA_DAILY;
  if (!(plan in quotaTable)) {
    return jsonResponse(
      { error: 'invalid_request', message: 'unknown plan' },
      403,
    );
  }
  const limit = quotaTable[plan];
  if (limit === 0) {
    return jsonResponse(
      {
        error: 'plan_required',
        message:
          scope === 'weekly'
            ? 'ミー先生の週次アドバイスは Plus / Pro でご利用いただけます'
            : 'ミー先生の日次アドバイスは Pro でご利用いただけます',
      },
      403,
    );
  }

  // -------------------------------------------------------------------
  // STEP 4 — UTC-monthly quota gate
  // -------------------------------------------------------------------
  {
    const monthStart = utcMonthStartISO(new Date());
    const { count, error: countError } = await admin
      .from('ai_usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('function_name', FUNCTION_NAME)
      .eq('response_status', 200)
      .filter('input->>scope', 'eq', scope)
      .gte('created_at', monthStart);
    if (countError) {
      return jsonResponse(
        { error: 'internal_error', message: 'クォータの確認に失敗しました' },
        500,
      );
    }
    if ((count ?? 0) >= limit) {
      return jsonResponse(
        {
          error: 'quota_exceeded',
          message: `今月の${scope === 'weekly' ? '週次' : '日次'}アドバイス上限に達しました`,
          details: { used: count, limit, scope },
        },
        429,
      );
    }
  }

  // -------------------------------------------------------------------
  // STEP 5 — Compute period_start in profile tz
  // -------------------------------------------------------------------
  const periodStart = computePeriodStart(scope, new Date(), timezone);

  // -------------------------------------------------------------------
  // STEP 6 — Freshness lookup
  // -------------------------------------------------------------------
  const { data: existing, error: existingError } = await admin
    .from('coach_advice')
    .select('id, scope, period_start, content, generated_at')
    .eq('user_id', userId)
    .eq('scope', scope)
    .eq('period_start', periodStart)
    .maybeSingle();
  if (existingError) {
    return jsonResponse(
      { error: 'internal_error', message: 'アドバイスの確認に失敗しました' },
      500,
    );
  }
  if (existing) {
    return jsonResponse({
      id: existing.id,
      scope: existing.scope,
      periodStart: existing.period_start,
      content: existing.content,
      generatedAt: existing.generated_at,
    });
  }

  // -------------------------------------------------------------------
  // STEP 7 — Project safe context
  // -------------------------------------------------------------------
  const safeContext = projectContextSafeSubset(context);

  // -------------------------------------------------------------------
  // STEP 8 — INSERT ai_usage_logs (quota counted HERE)
  // -------------------------------------------------------------------
  const usageInput = {
    idempotencyKey: idempotencyKey ?? null,
    scope,
    periodStart,
  };
  {
    const { error: usageInsertError } = await admin
      .from('ai_usage_logs')
      .insert({
        user_id: userId,
        function_name: FUNCTION_NAME,
        input: usageInput,
        response_status: 200,
      });
    if (usageInsertError) {
      return jsonResponse(
        { error: 'internal_error', message: 'クォータ記録に失敗しました' },
        500,
      );
    }
  }

  // -------------------------------------------------------------------
  // STEP 9 — Gemini call (non-streaming, one-shot text)
  // -------------------------------------------------------------------
  const systemPrompt =
    scope === 'weekly' ? SYSTEM_PROMPT_WEEKLY : SYSTEM_PROMPT_DAILY;
  const geminiBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: 'コーチング内容を生成してください。' }],
      },
    ],
    systemInstruction: {
      parts: [
        { text: systemPrompt },
        {
          text:
            '\n\n【ユーザーコンテキスト】\n' + JSON.stringify(safeContext),
        },
      ],
    },
    generationConfig: {
      maxOutputTokens: scope === 'weekly' ? 800 : 400,
      temperature: 0.4,
    },
  };

  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });
  } catch (e) {
    return jsonResponse(
      {
        error: 'gemini_error',
        message: 'AI応答の取得に失敗しました',
        details: { cause: e instanceof Error ? e.message : String(e) },
      },
      502,
    );
  }
  if (!geminiResponse.ok) {
    return jsonResponse(
      { error: 'gemini_error', message: 'AI応答の取得に失敗しました' },
      502,
    );
  }
  let geminiJson: unknown = null;
  try {
    geminiJson = await geminiResponse.json();
  } catch {
    return jsonResponse(
      { error: 'gemini_error', message: 'AI応答のパースに失敗しました' },
      502,
    );
  }
  // Extract text from Gemini's candidates response shape.
  const partsArr =
    ((geminiJson as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      ?.candidates?.[0]?.content?.parts ?? []);
  const rawContent = partsArr
    .map((p) => (typeof p?.text === 'string' ? p.text : ''))
    .join('')
    .trim();
  if (!rawContent) {
    return jsonResponse(
      { error: 'gemini_error', message: 'AI応答が空でした' },
      502,
    );
  }
  // Sprint 2.7.2 — Drafting 172 L5 scrub before persistence.
  // Non-streaming EF: a single pass at the response boundary is
  // sufficient, since the content is already fully materialised.
  const scrubResult = scrubSecrets(rawContent);
  if (scrubResult.redactedCount > 0) {
    console.warn('[coach-advice] L5 secret redacted', {
      userId,
      scope,
      redactedCount: scrubResult.redactedCount,
      patterns: scrubResult.redactedPatterns,
      timestamp: new Date().toISOString(),
    });
  }
  const content = scrubResult.sanitized;

  // -------------------------------------------------------------------
  // STEP 10 — UPSERT coach_advice (race-safe via unique constraint)
  // -------------------------------------------------------------------
  // The unique (user_id, scope, period_start) constraint at the DB
  // level closes the concurrent-request race window — if two
  // simultaneous calls computed the same bucket, the second's
  // UPSERT updates the first's row instead of trying to INSERT a
  // duplicate. Drafting 100 race-safe ordering for the advice path:
  // the unique-key check fires HERE, at the persistence step.
  const { data: upserted, error: upsertError } = await admin
    .from('coach_advice')
    .upsert(
      {
        user_id: userId,
        scope,
        period_start: periodStart,
        content,
        source_data_snapshot_json: safeContext,
      },
      { onConflict: 'user_id,scope,period_start' },
    )
    .select('id, scope, period_start, content, generated_at')
    .single();
  if (upsertError || !upserted) {
    return jsonResponse(
      {
        error: 'internal_error',
        message: 'アドバイスの保存に失敗しました',
        details: upsertError
          ? { code: upsertError.code, message: upsertError.message }
          : undefined,
      },
      500,
    );
  }

  // -------------------------------------------------------------------
  // STEP 11 — Return success payload
  // -------------------------------------------------------------------
  return jsonResponse({
    id: upserted.id,
    scope: upserted.scope,
    periodStart: upserted.period_start,
    content: upserted.content,
    generatedAt: upserted.generated_at,
  });
});
