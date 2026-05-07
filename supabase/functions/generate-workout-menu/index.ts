import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ===========================================================================
// Build 15 / Session 8 / Feature 5-元 — generate-workout-menu Edge Function
// ---------------------------------------------------------------------------
// Mirrors estimate-nutrition's auth + finally-log pattern with two
// material differences appropriate for 5-元:
//   1. Plan gate is multi-tier (free 3/mo, plus 30/mo, pro 100/mo) —
//      not Pro-only — so all paying tiers can access. Free quota is
//      intentionally tight per Q7 sign-off.
//   2. Quota window is the UTC calendar month, not daily. Reset
//      happens at month rollover; client surfaces "今月: N/M 残り" via
//      a separate GET path (Phase 6).
//
// Server schema reminder: profiles.id IS auth.uid() (no separate
// user_id column on profiles), so plan lookup uses .eq('id', userId).
// User-private tables (ai_usage_logs, user_equipment) follow the
// standard user_id FK convention.
// ===========================================================================

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

const FUNCTION_NAME = 'generate-workout-menu';

// Monthly quota per plan tier. Mirrors src/infra/services/subscriptionService.ts
// FeatureFlags.aiWorkoutGenerationLimit — keep both numbers in sync.
const MONTHLY_QUOTA: Record<string, number> = {
  free: 3,
  plus: 30,
  pro: 100,
};

const ALLOWED_DURATIONS = [30, 45, 60, 90];
const ALLOWED_SPLIT_TYPES = [
  'full_body',
  'upper_lower',
  'ppl',
  'bro_split',
  'custom',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const GOAL_LABELS: Record<string, string> = {
  cut: '減量',
  bulk: '増量',
  maintain: '維持',
  recomp: '体組成改善',
};

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'バーベル',
  dumbbell: 'ダンベル',
  kettlebell: 'ケトルベル',
  machine: 'マシン',
  bodyweight: '自重',
  cardio: '有酸素マシン',
  stretching: 'ストレッチ用具',
  other: 'その他',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Inclusive UTC month-start ISO for the current instant. Used as
// the > filter floor on ai_usage_logs.created_at for monthly count.
function utcMonthStartISO(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  ).toISOString();
}

// Next month's UTC start — surfaced to the client so quota-exceeded
// dialogs can show "次回利用可能: YYYY-MM-DD".
function utcMonthEndISO(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  ).toISOString();
}

interface GenerateRequestBody {
  targetMuscles: string[];
  durationMinutes: number;
  exerciseSlugs: string[];
}

function validateRequestBody(body: unknown): GenerateRequestBody | string {
  if (!body || typeof body !== 'object') return 'invalid request body';
  const b = body as Record<string, unknown>;

  if (
    !Array.isArray(b.targetMuscles) ||
    b.targetMuscles.length === 0 ||
    b.targetMuscles.length > 10 ||
    !b.targetMuscles.every((m) => typeof m === 'string' && m.length > 0)
  ) {
    return 'targetMuscles must be a non-empty array of 1-10 strings';
  }

  if (typeof b.durationMinutes !== 'number' || !ALLOWED_DURATIONS.includes(b.durationMinutes)) {
    return `durationMinutes must be one of ${ALLOWED_DURATIONS.join(', ')}`;
  }

  if (
    !Array.isArray(b.exerciseSlugs) ||
    b.exerciseSlugs.length === 0 ||
    b.exerciseSlugs.length > 200 ||
    !b.exerciseSlugs.every((s) => typeof s === 'string' && s.length > 0)
  ) {
    return 'exerciseSlugs must be a non-empty array of 1-200 strings';
  }

  return {
    targetMuscles: b.targetMuscles as string[],
    durationMinutes: b.durationMinutes as number,
    exerciseSlugs: b.exerciseSlugs as string[],
  };
}

function buildPrompt(args: {
  goalType: string | null;
  trainingDaysPerWeek: number | null;
  equipmentKeys: string[];
  targetMuscles: string[];
  durationMinutes: number;
  exerciseSlugs: string[];
}): string {
  const goalLabel = (args.goalType && GOAL_LABELS[args.goalType]) ?? '体作り';
  const equipmentLabel = args.equipmentKeys
    .map((k) => EQUIPMENT_LABELS[k] ?? k)
    .join(', ');
  const days = args.trainingDaysPerWeek ?? 3;

  return `あなたは熟練のパーソナルトレーナーです。以下の条件で workout プログラムを生成してください。

【ユーザー情報】
- 目標: ${goalLabel}
- 週のトレーニング日数: ${days}日
- 利用可能設備: ${equipmentLabel}

【セッション条件】
- 1 セッションの時間: ${args.durationMinutes}分
- ターゲット筋群: ${args.targetMuscles.join(', ')}

【出力形式】
以下の JSON schema に厳密に従って出力してください:
{
  "programName": string,
  "durationWeeks": number (4-12),
  "splitType": "full_body" | "upper_lower" | "ppl" | "bro_split" | "custom",
  "weeks": [
    {
      "weekIndex": number (1-based),
      "deload": boolean,
      "days": [
        {
          "dayLabel": string,
          "blocks": [
            {
              "exerciseSlug": string,
              "sets": number (1-10),
              "repRangeMin": number (1-30),
              "repRangeMax": number (1-30),
              "targetRPE": number (5-10),
              "restSeconds": number (30-300),
              "notes": string
            }
          ]
        }
      ]
    }
  ]
}

重要:
- 各 block の重量 (kg) は出力しないでください。reps と targetRPE のみで強度を表現してください。
- exerciseSlug は以下の slug list から厳密に選んでください。リストにない slug は出力禁止:
${args.exerciseSlugs.join(', ')}
- durationWeeks は 4 〜 12 の範囲で、deload 週を含める場合は deload: true で示してください。
- notes は日本語で短いフォームキューを記述してください (40 文字以内推奨)。`;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

// Hand-written validator — Zod is overkill for this single-shape endpoint
// and Deno's deno_std doesn't ship a JSON-schema runtime. Returns null
// when valid, error string when not.
function validateGeneratedProgram(raw: unknown): string | null {
  if (!isPlainObject(raw)) return 'response is not an object';
  if (typeof raw.programName !== 'string' || raw.programName.length === 0)
    return 'programName missing or empty';
  if (
    typeof raw.durationWeeks !== 'number' ||
    raw.durationWeeks < 4 ||
    raw.durationWeeks > 12
  )
    return 'durationWeeks out of [4, 12]';
  if (
    typeof raw.splitType !== 'string' ||
    !ALLOWED_SPLIT_TYPES.includes(raw.splitType)
  )
    return `splitType not in ${ALLOWED_SPLIT_TYPES.join(', ')}`;
  if (!Array.isArray(raw.weeks) || raw.weeks.length === 0)
    return 'weeks empty';
  if (raw.weeks.length !== raw.durationWeeks)
    return 'weeks.length !== durationWeeks';

  for (const week of raw.weeks) {
    if (!isPlainObject(week)) return 'week is not an object';
    if (typeof week.weekIndex !== 'number') return 'week.weekIndex missing';
    if (typeof week.deload !== 'boolean') return 'week.deload missing';
    if (!Array.isArray(week.days) || week.days.length === 0)
      return 'week.days empty';
    for (const day of week.days) {
      if (!isPlainObject(day)) return 'day is not an object';
      if (typeof day.dayLabel !== 'string') return 'day.dayLabel missing';
      if (!Array.isArray(day.blocks) || day.blocks.length === 0)
        return 'day.blocks empty';
      for (const block of day.blocks) {
        if (!isPlainObject(block)) return 'block is not an object';
        if (typeof block.exerciseSlug !== 'string' || block.exerciseSlug.length === 0)
          return 'block.exerciseSlug missing';
        if (typeof block.sets !== 'number' || block.sets < 1 || block.sets > 10)
          return 'block.sets out of [1, 10]';
        if (
          typeof block.repRangeMin !== 'number' ||
          block.repRangeMin < 1 ||
          block.repRangeMin > 30
        )
          return 'block.repRangeMin out of [1, 30]';
        if (
          typeof block.repRangeMax !== 'number' ||
          block.repRangeMax < 1 ||
          block.repRangeMax > 30 ||
          block.repRangeMax < block.repRangeMin
        )
          return 'block.repRangeMax out of [1, 30] or < min';
        if (
          typeof block.targetRPE !== 'number' ||
          block.targetRPE < 5 ||
          block.targetRPE > 10
        )
          return 'block.targetRPE out of [5, 10]';
        if (
          typeof block.restSeconds !== 'number' ||
          block.restSeconds < 30 ||
          block.restSeconds > 300
        )
          return 'block.restSeconds out of [30, 300]';
        if (block.notes !== null && typeof block.notes !== 'string')
          return 'block.notes must be string or null';
      }
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  let userId: string | null = null;
  let inputForLog: unknown = null;
  let responseStatus = 500;
  let errorMessage: string | null = null;

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // ---- 1. Auth ----
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : '';
    if (!token) {
      responseStatus = 401;
      errorMessage = 'missing authorization header';
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
      responseStatus = 401;
      errorMessage = userError?.message ?? 'invalid token';
      return jsonResponse(
        { error: 'invalid_token', message: 'セッションが無効です。再ログインしてください' },
        401,
      );
    }
    userId = userData.user.id;

    // ---- 2. Plan tier lookup ----
    // profiles.id IS auth.uid() (no separate user_id column on profiles).
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('plan, goal_type, training_days_per_week')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) {
      responseStatus = 500;
      errorMessage = `profile fetch failed: ${profileError.message}`;
      return jsonResponse(
        { error: 'internal_error', message: 'プラン情報の取得に失敗しました' },
        500,
      );
    }
    const plan = (profile?.plan as string) ?? 'free';
    const monthlyLimit = MONTHLY_QUOTA[plan] ?? MONTHLY_QUOTA.free;

    // ---- 3. Monthly quota check ----
    // UTC month start chosen for determinism. JST users see the reset
    // ~9 hr earlier than wall-clock midnight in their first month, but
    // every subsequent month aligns naturally.
    const now = new Date();
    const monthStart = utcMonthStartISO(now);
    const { count, error: countError } = await adminClient
      .from('ai_usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('function_name', FUNCTION_NAME)
      .eq('response_status', 200)
      .gte('created_at', monthStart);
    if (countError) {
      responseStatus = 500;
      errorMessage = `quota check failed: ${countError.message}`;
      return jsonResponse(
        { error: 'internal_error', message: 'クォータの確認に失敗しました' },
        500,
      );
    }
    if ((count ?? 0) >= monthlyLimit) {
      responseStatus = 429;
      errorMessage = `quota exceeded (${count}/${monthlyLimit}, plan=${plan})`;
      return jsonResponse(
        {
          error: 'quota_exceeded',
          message: `今月の AI メニュー生成上限（${monthlyLimit}回）に達しました`,
          details: {
            used: count,
            limit: monthlyLimit,
            plan,
            resetAt: utcMonthEndISO(now),
          },
        },
        429,
      );
    }

    // ---- 4. Validate request ----
    const rawBody = await req.json().catch(() => null);
    const validation = validateRequestBody(rawBody);
    if (typeof validation === 'string') {
      responseStatus = 400;
      errorMessage = validation;
      inputForLog = rawBody;
      return jsonResponse(
        { error: 'invalid_request', message: validation },
        400,
      );
    }
    inputForLog = {
      targetMuscles: validation.targetMuscles,
      durationMinutes: validation.durationMinutes,
      // exerciseSlugs intentionally NOT logged — list size dominates payload.
    };

    // ---- 5. Equipment fetch ----
    const { data: equipmentRows, error: equipmentError } = await adminClient
      .from('user_equipment')
      .select('equipment_key')
      .eq('user_id', userId)
      .eq('available', true)
      .is('deleted_at', null);
    if (equipmentError) {
      responseStatus = 500;
      errorMessage = `equipment fetch failed: ${equipmentError.message}`;
      return jsonResponse(
        { error: 'internal_error', message: '設備情報の取得に失敗しました' },
        500,
      );
    }
    const equipmentKeys = (equipmentRows ?? []).map(
      (e) => e.equipment_key as string,
    );
    if (equipmentKeys.length === 0) {
      responseStatus = 400;
      errorMessage = 'no equipment registered';
      return jsonResponse(
        {
          error: 'no_equipment',
          message:
            'ジム器具設定で少なくとも1つの器具を有効にしてください',
        },
        400,
      );
    }

    // ---- 6. Build prompt ----
    const prompt = buildPrompt({
      goalType: (profile?.goal_type as string | null) ?? null,
      trainingDaysPerWeek: (profile?.training_days_per_week as number | null) ?? null,
      equipmentKeys,
      targetMuscles: validation.targetMuscles,
      durationMinutes: validation.durationMinutes,
      exerciseSlugs: validation.exerciseSlugs,
    });

    // ---- 7. Call Gemini (§7.1 config) ----
    const geminiResponse = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.4,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!geminiResponse.ok) {
      responseStatus = 502;
      errorMessage = `gemini http ${geminiResponse.status}`;
      return jsonResponse(
        { error: 'gemini_error', message: 'AI 応答の取得に失敗しました' },
        502,
      );
    }

    const geminiData = await geminiResponse.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      responseStatus = 502;
      errorMessage = 'empty gemini response';
      return jsonResponse(
        { error: 'gemini_error', message: 'AI から応答がありませんでした' },
        502,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      responseStatus = 502;
      errorMessage = 'gemini returned non-JSON';
      return jsonResponse(
        { error: 'gemini_error', message: 'AI 応答の解析に失敗しました' },
        502,
      );
    }

    // ---- 8. Validate output shape ----
    const validationError = validateGeneratedProgram(parsed);
    if (validationError) {
      responseStatus = 502;
      errorMessage = `validation: ${validationError}`;
      return jsonResponse(
        {
          error: 'validation_failed',
          message: 'AI が想定外の形式の応答を返しました',
          details: { reason: validationError },
        },
        502,
      );
    }

    responseStatus = 200;
    errorMessage = null;
    return jsonResponse(parsed, 200);
  } catch (e) {
    responseStatus = 500;
    errorMessage = e instanceof Error ? e.message : String(e);
    return jsonResponse(
      { error: 'internal_error', message: '内部エラーが発生しました' },
      500,
    );
  } finally {
    // Always log — abuse monitoring depends on seeing unauthorized /
    // quota_exceeded / validation_failed attempts too. Only the
    // 200-status rows are counted toward the monthly quota.
    if (userId) {
      try {
        await adminClient.from('ai_usage_logs').insert({
          user_id: userId,
          function_name: FUNCTION_NAME,
          input: inputForLog,
          response_status: responseStatus,
          error_message: errorMessage,
        });
      } catch {
        // Swallow — logging failure should not mask the real response.
      }
    }
  }
});
