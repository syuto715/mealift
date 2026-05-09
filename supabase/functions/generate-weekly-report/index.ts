import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ===========================================================================
// Build 16 / Phase 1 (Feature H) — generate-weekly-report Edge Function
// ---------------------------------------------------------------------------
// Mirrors generate-workout-menu's auth → tier-lookup → quota → validate →
// Gemini → log skeleton with three Feature-H-specific differences:
//
//   1. Free tier is locked out at the gate (quota=0). Free callers get a
//      structured `plus_required` error so the client can route them to
//      the subscription screen instead of a confusing "quota exceeded".
//   2. Quota numbers reflect the weekly cadence: Plus 4/mo (one per
//      week), Pro 12/mo (~3 per week, room to regenerate).
//   3. No equipment fetch — Feature H reads weekly stats the client has
//      already aggregated locally (passed via `reportData`). Saves a DB
//      round-trip and means we don't re-derive what the client knows.
//
// Server schema reminder: profiles.id IS auth.uid() (no separate user_id
// column on profiles). User-private tables (ai_usage_logs) follow the
// standard user_id FK convention.
//
// Prompt-injection note: WeeklyReportData is structurally typed and
// contains only numeric fields + ISO date strings + an enum goalType.
// There is no user-controlled free-text path into the prompt today, so
// no sanitization layer is added here. validateRequestBody enforces the
// shape strictly so future schema additions don't accidentally introduce
// a text field that lands in the prompt unfiltered.
// ===========================================================================

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

const FUNCTION_NAME = 'generate-weekly-report';

// Phase 1 sign-off F1 quota: Free locked out (0), Plus 4/mo (~weekly),
// Pro 12/mo (~weekly with regenerate budget). Mirrors
// src/infra/services/subscriptionService.ts FeatureFlags.aiWeeklyReportLimit
// — keep both numbers in sync; the subscriptionService test pins them.
const MONTHLY_QUOTA: Record<string, number> = {
  free: 0,
  plus: 4,
  pro: 12,
};

// 7-day trial window mirrors src/constants/pricing.ts TRIAL_DURATION_DAYS.
const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// 30-second deadline on the Gemini call. Phase 1 narrative target is
// ~1500 tokens; flash-lite p99 lands ~10-15s, so 30s is comfortably
// above that without leaving requests hanging on platform-default
// timeouts (Codex review pass 1 / Critical #4).
const GEMINI_TIMEOUT_MS = 30_000;

const ALLOWED_GOAL_TYPES = ['cut', 'bulk', 'maintain', 'recomp'];

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

// Tone hints baked into the prompt per goal. Steers the narrative
// without leaving the model free to drift into generic advice.
const GOAL_TONE: Record<string, string> = {
  cut: '減量効率と筋量維持の両立を強調',
  bulk: '筋肥大刺激の十分性とサープラスの管理を強調',
  maintain: '一貫性とコンディション維持を強調',
  recomp: '体組成変化と運動・栄養のバランスを強調',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Codex review pass 1 / Critical #1 — server-side trial detection.
// The client's hasFeature(feat, 'trial') returns true for Plus
// features, but the EF was reading `profiles.plan` only and so
// dropped trial users into the `free` quota → plus_required 402.
// This helper mirrors src/infra/services/subscriptionService.ts
// derivePlanSnapshot's priority order: paid plan > active trial >
// free. Trial maps to 'plus' for quota purposes (matching what
// hasFeature returns).
type ProfileRow = {
  plan?: string | null;
  trial_started_at?: string | null;
  plan_expires_at?: string | null;
  plan_billing_cycle?: string | null;
};

function deriveEffectivePlan(
  profile: ProfileRow | null,
  now: Date,
): 'free' | 'plus' | 'pro' {
  if (!profile) return 'free';

  // Paid plan in effect (expires_at in the future).
  if (
    profile.plan_expires_at &&
    Date.parse(profile.plan_expires_at) > now.getTime()
  ) {
    return profile.plan === 'pro' ? 'pro' : 'plus';
  }

  // Active trial — maps to Plus quota.
  if (profile.trial_started_at) {
    const startedMs = Date.parse(profile.trial_started_at);
    if (!Number.isNaN(startedMs)) {
      const endsMs = startedMs + TRIAL_DURATION_MS;
      if (endsMs > now.getTime()) return 'plus';
    }
  }

  return 'free';
}

// Codex review pass 1 / Critical #3 — strict date validation. Regex
// alone admits 2026-13-99 / non-Monday weekStart / weekEnd that's
// not 6 days after weekStart. The canonical contract (Monday-anchored
// weeks, Sunday end) needs to be enforced here so cache keys and
// downstream sync stay consistent.

// Parses a 'YYYY-MM-DD' string into UTC year/month/day, validates
// that the resulting date round-trips (catches Feb 30 etc), and
// returns the Date or null on failure.
function parseISODateUTCStrict(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number.parseInt(m[1], 10);
  const mo = Number.parseInt(m[2], 10);
  const d = Number.parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  // Round-trip check: Feb 30 becomes March 2, etc. — reject those.
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

// ISO weekday (1 = Monday, 7 = Sunday). Date.getUTCDay returns
// 0 = Sunday, 1 = Monday, ..., 6 = Saturday — convert to ISO style.
function isoWeekdayUTC(d: Date): number {
  const js = d.getUTCDay();
  return js === 0 ? 7 : js;
}

// Verify weekEnd is exactly 6 days after weekStart in UTC.
function isSixDaySpan(weekStart: Date, weekEnd: Date): boolean {
  const diffMs = weekEnd.getTime() - weekStart.getTime();
  return diffMs === 6 * 24 * 60 * 60 * 1000;
}

function utcMonthStartISO(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  ).toISOString();
}

function utcMonthEndISO(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  ).toISOString();
}

// === Request body validation ===

// Mirrors src/types/weeklyReport.ts WeeklyReportData (the client-side
// canonical shape) — keep both in sync. Enforced strictly so Feature H
// stats are always numeric, not strings or arrays that could leak into
// the prompt.
interface ReportDataIn {
  weekStart: string;
  weekEnd: string;
  weightStart: number | null;
  weightEnd: number | null;
  weightChange: number | null;
  avgCalories: number;
  avgProtein: number;
  avgFat: number;
  avgCarb: number;
  mealLogDays: number;
  workoutCount: number;
  totalVolume: number;
  totalCaloriesBurned: number;
  consistencyScore: number;
  nutritionScore: number;
  trainingScore: number;
  overallScore: number;
}

interface GenerateRequestBody {
  weekStart: string;
  reportData: ReportDataIn;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function isFiniteOrNull(x: unknown): x is number | null {
  return x === null || isFiniteNumber(x);
}

// Codex review pass 1 / Important #5 — closed-world validation.
// Rejecting unknown keys keeps a future schema addition (say a free-
// text "notes" field) from silently riding along into the prompt
// without explicit security review. Allowlists live next to the
// validator so they stay together when fields change.
const ALLOWED_BODY_KEYS = new Set(['weekStart', 'reportData']);
const ALLOWED_REPORT_KEYS = new Set([
  'weekStart',
  'weekEnd',
  'weightStart',
  'weightEnd',
  'weightChange',
  'avgCalories',
  'avgProtein',
  'avgFat',
  'avgCarb',
  'mealLogDays',
  'workoutCount',
  'totalVolume',
  'totalCaloriesBurned',
  'consistencyScore',
  'nutritionScore',
  'trainingScore',
  'overallScore',
]);

function findUnknownKey(
  obj: Record<string, unknown>,
  allow: Set<string>,
): string | null {
  for (const k of Object.keys(obj)) {
    if (!allow.has(k)) return k;
  }
  return null;
}

function validateRequestBody(body: unknown): GenerateRequestBody | string {
  if (!body || typeof body !== 'object') return 'invalid request body';
  const b = body as Record<string, unknown>;

  const unknownTop = findUnknownKey(b, ALLOWED_BODY_KEYS);
  if (unknownTop) return `unknown body field: ${unknownTop}`;

  if (typeof b.weekStart !== 'string' || !ISO_DATE_RE.test(b.weekStart)) {
    return 'weekStart must be a YYYY-MM-DD string';
  }
  // Codex Critical #3 — enforce calendar validity + Monday anchor.
  const weekStartDate = parseISODateUTCStrict(b.weekStart);
  if (!weekStartDate) return 'weekStart is not a valid calendar date';
  if (isoWeekdayUTC(weekStartDate) !== 1) {
    return 'weekStart must be a Monday (ISO weekday 1)';
  }

  if (!b.reportData || typeof b.reportData !== 'object') {
    return 'reportData must be an object';
  }
  const r = b.reportData as Record<string, unknown>;

  const unknownInner = findUnknownKey(r, ALLOWED_REPORT_KEYS);
  if (unknownInner) return `unknown reportData field: ${unknownInner}`;

  if (typeof r.weekStart !== 'string' || !ISO_DATE_RE.test(r.weekStart)) {
    return 'reportData.weekStart must be a YYYY-MM-DD string';
  }
  if (typeof r.weekEnd !== 'string' || !ISO_DATE_RE.test(r.weekEnd)) {
    return 'reportData.weekEnd must be a YYYY-MM-DD string';
  }
  if (r.weekStart !== b.weekStart) {
    // The two should match — caller is using weekStart as the cache key.
    return 'reportData.weekStart must match weekStart';
  }
  // Codex Critical #3 — weekEnd must be exactly 6 days after weekStart.
  const weekEndDate = parseISODateUTCStrict(r.weekEnd);
  if (!weekEndDate) return 'reportData.weekEnd is not a valid calendar date';
  if (!isSixDaySpan(weekStartDate, weekEndDate)) {
    return 'reportData.weekEnd must be exactly 6 days after weekStart';
  }

  if (!isFiniteOrNull(r.weightStart)) return 'reportData.weightStart must be number|null';
  if (!isFiniteOrNull(r.weightEnd)) return 'reportData.weightEnd must be number|null';
  if (!isFiniteOrNull(r.weightChange)) return 'reportData.weightChange must be number|null';

  const numericFields: (keyof ReportDataIn)[] = [
    'avgCalories',
    'avgProtein',
    'avgFat',
    'avgCarb',
    'mealLogDays',
    'workoutCount',
    'totalVolume',
    'totalCaloriesBurned',
    'consistencyScore',
    'nutritionScore',
    'trainingScore',
    'overallScore',
  ];
  for (const k of numericFields) {
    if (!isFiniteNumber((r as Record<string, unknown>)[k])) {
      return `reportData.${k} must be a finite number`;
    }
  }

  return {
    weekStart: b.weekStart,
    reportData: r as unknown as ReportDataIn,
  };
}

// === Prompt builder ===

function fmt(n: number, digits = 1): string {
  // Two-pass: keep one decimal but drop a trailing .0 so numbers read
  // naturally in the rendered narrative ("70" vs "70.0kg").
  const rounded = Number(n.toFixed(digits));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits);
}

function fmtNullable(n: number | null, digits = 1): string {
  return n === null ? '記録なし' : fmt(n, digits);
}

function buildPrompt(args: {
  goalType: string | null;
  reportData: ReportDataIn;
}): string {
  const goalKey = args.goalType ?? 'maintain';
  const goalLabel = GOAL_LABELS[goalKey] ?? '維持';
  const toneHint = GOAL_TONE[goalKey] ?? GOAL_TONE.maintain;
  const r = args.reportData;

  return `あなたは経験豊富なフィットネスコーチです。以下のユーザーの過去 7 日間のデータを統合的に分析し、モチベーションを高めつつ実行可能な insight を提供してください。

【目標】 ${goalLabel}
【トーン指針】 ${toneHint}

【週次データ】
- 期間: ${r.weekStart} 〜 ${r.weekEnd}
- 体重: 開始 ${fmtNullable(r.weightStart)}kg、終了 ${fmtNullable(r.weightEnd)}kg、変化 ${fmtNullable(r.weightChange)}kg
- 栄養 (1日平均): カロリー ${fmt(r.avgCalories, 0)}kcal、P ${fmt(r.avgProtein)}g / F ${fmt(r.avgFat)}g / C ${fmt(r.avgCarb)}g、食事ログ日数 ${r.mealLogDays} / 7
- トレーニング: ${r.workoutCount}回実施、総ボリューム ${fmt(r.totalVolume, 0)}kg×reps、消費カロリー ${fmt(r.totalCaloriesBurned, 0)}kcal
- スコア (0-100): 一貫性 ${r.consistencyScore}、栄養 ${r.nutritionScore}、トレーニング ${r.trainingScore}、総合 ${r.overallScore}

【出力形式 (厳密に JSON)】
{
  "overall": "3-5 文の総括 narrative (50-300 字)",
  "sections": {
    "workout": "運動セクション (~100-150 字、達成 + 改善点)",
    "nutrition": "栄養セクション (~100-150 字、PFC バランス + コンプライアンス所感)",
    "weight": "体重セクション (~80-120 字、推移と goal 整合性)",
    "integration": "統合 insight (~150-200 字、運動+栄養+体重の相互関係を示すこのアプリ独自の視点 ← 最重要)"
  }
}

重要事項:
- 全 section 日本語、敬体 (ですます調) 統一
- 数値根拠を具体的に引用 (例: 「タンパク質 1.6 g/kg を維持」)
- ${toneHint}
- integration section は他 3 section の内容を相互参照して書く
- データが空 (workoutCount=0 等) の section は「来週へのアドバイス」として書く
- 出力は JSON のみ、前後にテキストや markdown を含めない`;
}

// === Output validation ===

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function checkStringRange(
  value: unknown,
  field: string,
  min: number,
  max: number,
): string | null {
  if (typeof value !== 'string') return `${field} must be a string`;
  if (value.length < min) return `${field} too short (${value.length} < ${min})`;
  if (value.length > max) return `${field} too long (${value.length} > ${max})`;
  return null;
}

function validateGeneratedNarrative(raw: unknown): string | null {
  if (!isPlainObject(raw)) return 'response is not an object';

  const overallErr = checkStringRange(raw.overall, 'overall', 50, 300);
  if (overallErr) return overallErr;

  if (!isPlainObject(raw.sections)) return 'sections missing or not object';
  const s = raw.sections;

  const workoutErr = checkStringRange(s.workout, 'sections.workout', 50, 200);
  if (workoutErr) return workoutErr;
  const nutritionErr = checkStringRange(
    s.nutrition,
    'sections.nutrition',
    50,
    200,
  );
  if (nutritionErr) return nutritionErr;
  const weightErr = checkStringRange(s.weight, 'sections.weight', 30, 150);
  if (weightErr) return weightErr;
  const integrationErr = checkStringRange(
    s.integration,
    'sections.integration',
    80,
    300,
  );
  if (integrationErr) return integrationErr;

  return null;
}

// === Handler ===

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
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
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
        {
          error: 'invalid_token',
          message: 'セッションが無効です。再ログインしてください',
        },
        401,
      );
    }
    userId = userData.user.id;

    // ---- 2. Plan tier lookup ----
    // Trial / paid columns must be fetched here so deriveEffectivePlan
    // sees the same priority order the client's derivePlanSnapshot
    // uses (Codex review pass 1 / Critical #1).
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('plan, goal_type, trial_started_at, plan_expires_at, plan_billing_cycle')
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
    const nowForPlan = new Date();
    const effectivePlan = deriveEffectivePlan(
      profile as ProfileRow | null,
      nowForPlan,
    );
    const monthlyLimit = MONTHLY_QUOTA[effectivePlan] ?? MONTHLY_QUOTA.free;

    // ---- 2b. Plus gate ----
    // Feature H is Plus-tier-and-up. Free users get a structured
    // plus_required error before the quota count runs so the client
    // can route to the subscription screen instead of showing a
    // confusing "quota exceeded".
    if (monthlyLimit <= 0) {
      responseStatus = 402;
      errorMessage = `plus_required (plan=${effectivePlan})`;
      return jsonResponse(
        {
          error: 'plus_required',
          message:
            'AI週次レポートはPlusプラン以上でご利用いただけます',
        },
        402,
      );
    }

    // ---- 3. Monthly quota check ----
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
      errorMessage = `quota exceeded (${count}/${monthlyLimit}, plan=${effectivePlan})`;
      return jsonResponse(
        {
          error: 'quota_exceeded',
          message: `今月のAI週次レポート生成上限（${monthlyLimit}回）に達しました`,
          details: {
            used: count,
            limit: monthlyLimit,
            plan: effectivePlan,
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
      // Don't log the full body — could be large; log shape-only signal.
      inputForLog = { weekStart: (rawBody as { weekStart?: unknown })?.weekStart };
      return jsonResponse(
        { error: 'invalid_request', message: validation },
        400,
      );
    }
    inputForLog = {
      weekStart: validation.weekStart,
      // Stats are numeric only — fine to log for abuse audit.
      goalType: profile?.goal_type ?? null,
      workoutCount: validation.reportData.workoutCount,
      mealLogDays: validation.reportData.mealLogDays,
    };

    const goalType = (profile?.goal_type as string | null) ?? null;
    const goalKey =
      goalType && ALLOWED_GOAL_TYPES.includes(goalType) ? goalType : null;

    // ---- 5. Build prompt ----
    const prompt = buildPrompt({
      goalType: goalKey,
      reportData: validation.reportData,
    });

    // ---- 6. Call Gemini (§7.1 config) ----
    // Codex review pass 1 / Critical #4 — explicit AbortController
    // timeout. fetch alone has no deadline, so a hung Gemini would
    // pin the EF until the platform default kicks in. AbortError is
    // caught below and mapped to gemini_error 502.
    const abortCtl = new AbortController();
    const abortTimer = setTimeout(
      () => abortCtl.abort(),
      GEMINI_TIMEOUT_MS,
    );
    let geminiResponse: Response;
    try {
      geminiResponse = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            // Slightly higher than generate-workout-menu (0.4) —
            // narrative benefits from a touch more variety;
            // structured JSON enforces the shape so creative drift
            // can't escape the schema.
            temperature: 0.5,
            topK: 40,
            topP: 0.95,
            // Narrative is short by spec (~700 chars total). 2048
            // is a generous cap that still avoids long-form
            // rambling.
            maxOutputTokens: 2048,
          },
        }),
        signal: abortCtl.signal,
      });
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      responseStatus = 502;
      errorMessage = aborted
        ? `gemini timeout after ${GEMINI_TIMEOUT_MS}ms`
        : `gemini fetch failed: ${e instanceof Error ? e.message : String(e)}`;
      return jsonResponse(
        {
          error: 'gemini_error',
          message: aborted
            ? 'AI 応答がタイムアウトしました。再試行してください'
            : 'AI 応答の取得に失敗しました',
        },
        502,
      );
    } finally {
      clearTimeout(abortTimer);
    }

    if (!geminiResponse.ok) {
      responseStatus = 502;
      errorMessage = `gemini http ${geminiResponse.status}`;
      return jsonResponse(
        { error: 'gemini_error', message: 'AI 応答の取得に失敗しました' },
        502,
      );
    }

    // Codex review pass 1 / Critical #4 — protect .json(). A 200
    // with malformed body would otherwise propagate to the outer
    // catch and surface as 500 internal_error, hiding what's
    // actually a Gemini-side issue.
    let geminiData: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    try {
      geminiData = await geminiResponse.json();
    } catch {
      responseStatus = 502;
      errorMessage = 'gemini response body is not JSON';
      return jsonResponse(
        { error: 'gemini_error', message: 'AI 応答の解析に失敗しました' },
        502,
      );
    }
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

    // ---- 7. Validate output shape ----
    const validationError = validateGeneratedNarrative(parsed);
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
        // Logging failure must not mask the real response.
      }
    }
  }
});
