import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { projectContextSafeSubset } from '../_shared/projectContext.ts';
import {
  projectGeneratedRoutine,
  validateGeneratedRoutine,
} from '../_shared/routineJson.ts';

// v1.5 Stage 1 Phase 1.5 — coach-routine Edge Function (surface ③).
//
// Architectural SSoT: docs/plans/v1.5_stage_1_ai_chat_epic.md
//   §3 surface ③ (one-shot JSON-structured routine generator)
//   §5.1 (routine_generations schema; status state machine)
//   §5.1.1 + §6.4 (persisted snapshot = projected safe subset)
//   §7.1 (ミー先生 persona system prompt)
//   §9.1 (aiCoachGeneration / aiCoachGenerationMonthlyLimit)
//
// 12-step pattern modeled on coach-chat (Phase 1.1) + coach-advice
// (Phase 1.4):
//   STEP 1.  Auth (Bearer token; immutable).
//   STEP 2.  Idempotency replay — looks up `ai_usage_logs` by
//            `input->>idempotencyKey`; if present, return the
//            existing routine_generations row.
//   STEP 3.  Plan gate: `aiCoachGeneration` (Plus+).
//   STEP 4.  UTC-monthly quota gate
//            (MONTHLY_QUOTA: Plus 5 / Pro 20).
//   STEP 5.  Parse body + intent text + preferences.
//   STEP 6.  Project safe context (defense-in-depth re-projection).
//   STEP 7.  INSERT routine_generations placeholder (status='draft'
//            with empty generated_routine_json `{}`). The unique
//            id is the rollback target if any later step fails.
//   STEP 8.  INSERT ai_usage_logs (quota counted HERE; Drafting 98).
//   STEP 9.  Gemini one-shot, `responseMimeType: 'application/json'`.
//   STEP 10. Server-side JSON schema validation
//            (validateGeneratedRoutine from _shared/routineJson.ts).
//   STEP 11. UPDATE routine_generations.generated_routine_json with
//            the validated + projected payload; keep status='draft'
//            (apply transition is client-driven).
//   STEP 12. Return `{ generationId, generatedRoutine }`.
//
// Compensation depth (Drafting 103):
//   - Every supabase-js call checks `{ error }`.
//   - On STEP 10 validation failure → UPDATE the placeholder row to
//     mark it discarded with a diagnostic in the snapshot json, so
//     it never surfaces as a stale draft on the next read.
//   - On STEP 11 UPDATE failure → return 500; the placeholder row
//     stays as a forensic record (matches coach-chat's "stays
//     'pending' on UPDATE failure" precedent).

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const FUNCTION_NAME = 'coach-routine';

// Per-tier monthly cap. Numbers must stay in lockstep with
// src/infra/services/subscriptionService.ts:
// `aiCoachGenerationMonthlyLimit`.
const MONTHLY_QUOTA: Record<string, number> = {
  free: 0, // free tier locked at the plan gate
  plus: 5,
  pro: 20,
};

const INTENT_TEXT_MAX = 400;
const EXERCISE_SLUGS_HINT_MAX = 200;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, idempotency-key',
};

const SYSTEM_PROMPT = `あなたは「ミー先生」という、 ユーザー専属のパーソナルトレーナーです。
ユーザーの意図 (intent text) と コンテキスト (週のトレーニング日数、 目標、
利用可能種目) に合わせて、 単一の workout routine を JSON で生成してください。

【生成ルール】
- 1 routine = 4-12 種目 (バランスよく、 メイン種目 + 補助種目 + 仕上げ種目)
- targetSets は 1-12 の整数
- targetReps は "8-12" のように range 文字列、 重量は出力しないでください
- exerciseSlug はクライアントから渡された slug list から厳密に選択
- routineName は内容を 1 文で要約 (例: 「胸 + 三頭 のプッシュ日」)

【口調】
- 中立、 過度な賞賛を避ける
- 個別の医療診断は出さない`;

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

interface CoachRoutineRequestBody {
  intentText: string;
  exerciseSlugs: string[];
}

function parseBody(body: unknown): CoachRoutineRequestBody | string {
  if (!body || typeof body !== 'object') return 'invalid request body';
  const b = body as Record<string, unknown>;
  if (
    typeof b.intentText !== 'string' ||
    b.intentText.length === 0 ||
    b.intentText.length > INTENT_TEXT_MAX
  ) {
    return `intentText must be a 1-${INTENT_TEXT_MAX} char string`;
  }
  if (
    !Array.isArray(b.exerciseSlugs) ||
    b.exerciseSlugs.length === 0 ||
    b.exerciseSlugs.length > EXERCISE_SLUGS_HINT_MAX ||
    !b.exerciseSlugs.every((s) => typeof s === 'string' && s.length > 0)
  ) {
    return `exerciseSlugs must be a 1-${EXERCISE_SLUGS_HINT_MAX} string array`;
  }
  return {
    intentText: b.intentText,
    exerciseSlugs: b.exerciseSlugs as string[],
  };
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
  const idempotencyKey = req.headers.get('Idempotency-Key');
  if (!idempotencyKey) {
    return jsonResponse(
      { error: 'invalid_request', message: 'Idempotency-Key header required' },
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
        | { generationId?: string }
        | null;
      if (replayInput?.generationId) {
        const { data: existing, error: existingError } = await admin
          .from('routine_generations')
          .select('id, generated_routine_json, status')
          .eq('id', replayInput.generationId)
          .eq('user_id', userId)
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
            generationId: existing.id,
            generatedRoutine: existing.generated_routine_json,
            status: existing.status,
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------
  // STEP 3 — Plan gate
  // -------------------------------------------------------------------
  // Phase 1.5 Codex round 1 Critical fix — profiles.id IS auth.uid()
  // (no user_id column on profiles, see generate-workout-menu EF
  // lines 16-19 for the convention). Originally copied the wrong
  // `.eq('user_id', userId)` pattern from coach-chat / coach-advice;
  // both have been fixed in this same round.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) {
    return jsonResponse(
      { error: 'internal_error', message: 'プラン情報の取得に失敗しました' },
      500,
    );
  }
  const plan = (profile?.plan as string) ?? 'free';
  if (!(plan in MONTHLY_QUOTA)) {
    return jsonResponse(
      { error: 'invalid_request', message: 'unknown plan' },
      403,
    );
  }
  const limit = MONTHLY_QUOTA[plan];
  if (limit === 0) {
    return jsonResponse(
      {
        error: 'plan_required',
        message:
          'ミー先生のルーティン生成は Plus / Pro でご利用いただけます',
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
          message: `今月のルーティン生成上限（${limit}回）に達しました`,
          details: { used: count, limit },
        },
        429,
      );
    }
  }

  // -------------------------------------------------------------------
  // STEP 5 — Parse body
  // -------------------------------------------------------------------
  const rawBody = await req.json().catch(() => null);
  const parsed = parseBody(rawBody);
  if (typeof parsed === 'string') {
    return jsonResponse(
      { error: 'invalid_request', message: parsed },
      400,
    );
  }
  const { intentText, exerciseSlugs } = parsed;
  const context = (rawBody as { context?: unknown }).context;

  // -------------------------------------------------------------------
  // STEP 6 — Project safe context
  // -------------------------------------------------------------------
  const safeContext = projectContextSafeSubset(context);

  // -------------------------------------------------------------------
  // STEP 7 — INSERT routine_generations placeholder (carries
  //          idempotency_key for race-safe ordering, Drafting 100)
  // -------------------------------------------------------------------
  // Codex round 2 Critical #3 fix — the placeholder row carries
  // `idempotency_key` so the partial unique index
  // `routine_generations_idempotency_key_unique` (migration
  // 20260519000000) fires HERE on a same-key concurrent retry.
  // Race-loser gets a unique-violation; we treat it as replay and
  // look up the existing row + return it WITHOUT spending quota
  // or calling Gemini. Mirrors coach-chat's STEP 5 pattern.
  const placeholderRoutine: Record<string, unknown> = {
    routineName: '',
    items: [],
  };
  const { data: placeholder, error: placeholderError } = await admin
    .from('routine_generations')
    .insert({
      user_id: userId,
      prompt_context_json: { intentText, exerciseSlugs, safeContext },
      generated_routine_json: placeholderRoutine,
      status: 'draft',
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single();
  if (placeholderError || !placeholder) {
    // Unique-key conflict → another concurrent request with the
    // SAME idempotency key has already passed STEP 7. Look up the
    // winner's row and return it; no quota burn, no Gemini call.
    const conflictCode =
      (placeholderError as { code?: string } | null)?.code ?? '';
    if (conflictCode === '23505') {
      const { data: replayWinner, error: lookupError } = await admin
        .from('routine_generations')
        .select('id, generated_routine_json, status')
        .eq('idempotency_key', idempotencyKey)
        .eq('user_id', userId)
        .maybeSingle();
      if (lookupError || !replayWinner) {
        return jsonResponse(
          {
            error: 'internal_error',
            message: 'リプレイ確認に失敗しました',
          },
          500,
        );
      }
      return jsonResponse({
        generationId: replayWinner.id,
        generatedRoutine: replayWinner.generated_routine_json,
        status: replayWinner.status,
      });
    }
    return jsonResponse(
      {
        error: 'internal_error',
        message: 'ルーティン生成の準備に失敗しました',
      },
      500,
    );
  }
  const generationId = placeholder.id as string;

  // -------------------------------------------------------------------
  // STEP 8 — INSERT ai_usage_logs (quota counted HERE)
  // -------------------------------------------------------------------
  {
    const { error: usageInsertError } = await admin.from('ai_usage_logs').insert({
      user_id: userId,
      function_name: FUNCTION_NAME,
      input: { idempotencyKey, generationId },
      response_status: 200,
    });
    if (usageInsertError) {
      // Rollback the placeholder draft so a failed usage-log insert
      // doesn't leave an orphaned empty draft in the user's list.
      await markGenerationDiscardedBestEffort(
        admin,
        generationId,
        'usage-log-failed',
      );
      return jsonResponse(
        { error: 'internal_error', message: 'クォータ記録に失敗しました' },
        500,
      );
    }
  }

  // -------------------------------------------------------------------
  // STEP 9 — Gemini call (one-shot, JSON-structured)
  // -------------------------------------------------------------------
  const userPrompt = `【ユーザーの意図】\n${intentText}\n\n【利用可能な exerciseSlug】\n${exerciseSlugs.join(
    ', ',
  )}\n\n【出力形式】\n{\n  "routineName": string,\n  "items": [\n    { "exerciseSlug": string, "targetSets": number(1-12), "targetReps": "8-12" 等の range string, "notes": string? }\n  ]\n}\n\n重要: exerciseSlug は上記 list から厳密に選んでください。`;
  const geminiBody = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    systemInstruction: {
      parts: [
        { text: SYSTEM_PROMPT },
        { text: '\n\n【ユーザーコンテキスト】\n' + JSON.stringify(safeContext) },
      ],
    },
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: 1024,
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
    await markGenerationDiscardedBestEffort(
      admin,
      generationId,
      'gemini-fetch-threw',
    );
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
    await markGenerationDiscardedBestEffort(
      admin,
      generationId,
      'gemini-fetch-non-ok',
    );
    return jsonResponse(
      { error: 'gemini_error', message: 'AI応答の取得に失敗しました' },
      502,
    );
  }
  let geminiJson: unknown = null;
  try {
    geminiJson = await geminiResponse.json();
  } catch {
    await markGenerationDiscardedBestEffort(
      admin,
      generationId,
      'gemini-json-parse-failed',
    );
    return jsonResponse(
      { error: 'gemini_error', message: 'AI応答のパースに失敗しました' },
      502,
    );
  }
  const partsArr =
    ((geminiJson as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      ?.candidates?.[0]?.content?.parts ?? []);
  const rawText = partsArr
    .map((p) => (typeof p?.text === 'string' ? p.text : ''))
    .join('')
    .trim();
  if (!rawText) {
    await markGenerationDiscardedBestEffort(
      admin,
      generationId,
      'gemini-empty-response',
    );
    return jsonResponse(
      { error: 'gemini_error', message: 'AI応答が空でした' },
      502,
    );
  }
  let parsedRoutine: unknown;
  try {
    parsedRoutine = JSON.parse(rawText);
  } catch (e) {
    await markGenerationDiscardedBestEffort(
      admin,
      generationId,
      'gemini-non-json',
    );
    return jsonResponse(
      {
        error: 'gemini_error',
        message: 'AI応答が JSON ではありませんでした',
        details: { cause: e instanceof Error ? e.message : String(e) },
      },
      502,
    );
  }

  // -------------------------------------------------------------------
  // STEP 10 — Server-side schema validation
  // -------------------------------------------------------------------
  const validationError = validateGeneratedRoutine(parsedRoutine);
  if (validationError) {
    await markGenerationDiscardedBestEffort(
      admin,
      generationId,
      `schema-validation-failed: ${validationError}`,
    );
    return jsonResponse(
      {
        error: 'gemini_error',
        message: 'AI応答の形式が不正でした',
        details: { reason: validationError },
      },
      502,
    );
  }
  const generated = projectGeneratedRoutine(parsedRoutine);

  // Slug guard — the EF promised Gemini "choose strictly from this
  // slug list", but defense-in-depth checks the output. Any slug
  // not in the input list is dropped silently. If 0 valid items
  // remain, mark the generation discarded.
  const allowed = new Set(exerciseSlugs);
  const filteredItems = generated.items.filter((it) =>
    allowed.has(it.exerciseSlug),
  );
  if (filteredItems.length === 0) {
    await markGenerationDiscardedBestEffort(
      admin,
      generationId,
      'slug-mismatch-all-items-dropped',
    );
    return jsonResponse(
      {
        error: 'gemini_error',
        message: 'AI応答に利用可能な種目が含まれていませんでした',
      },
      502,
    );
  }
  const finalRoutine = {
    routineName: generated.routineName,
    items: filteredItems,
  };

  // -------------------------------------------------------------------
  // STEP 11 — UPDATE routine_generations with the validated routine
  // -------------------------------------------------------------------
  {
    const { error: updateError } = await admin
      .from('routine_generations')
      .update({ generated_routine_json: finalRoutine })
      .eq('id', generationId)
      .eq('user_id', userId);
    if (updateError) {
      // Don't roll the row back — it stays as a forensic record
      // of what happened. We return a 500 to the client; the next
      // retry (with a fresh Idempotency-Key) re-runs the full
      // generation. Codex round 1 Nit fix: the prior comment
      // said "client sees the in-memory payload" which contradicts
      // the actual 500 return; corrected here.
      return jsonResponse(
        {
          error: 'internal_error',
          message: 'ルーティンの保存に失敗しました',
          details: { code: updateError.code, message: updateError.message },
        },
        500,
      );
    }
  }

  // -------------------------------------------------------------------
  // STEP 12 — Return
  // -------------------------------------------------------------------
  return jsonResponse({
    generationId,
    generatedRoutine: finalRoutine,
    status: 'draft',
  });
});

// =====================================================================
// Compensation-write helper (Drafting 103)
// =====================================================================

// deno-lint-ignore no-explicit-any
type Admin = any;

async function markGenerationDiscardedBestEffort(
  admin: Admin,
  generationId: string,
  reason: string,
): Promise<void> {
  try {
    const { error } = await admin
      .from('routine_generations')
      .update({
        status: 'discarded',
        // Audit trail: stuff the reason into the payload so the
        // forensic record carries why this draft died.
        generated_routine_json: {
          routineName: '',
          items: [],
          discardReason: reason,
        },
      })
      .eq('id', generationId);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `[coach-routine] draft discard cleanup failed (${reason}):`,
        error.message,
      );
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      `[coach-routine] draft discard cleanup threw (${reason}):`,
      e,
    );
  }
}
