import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildLLMDefenseParagraph,
  checkUserContentLength,
  detectJailbreakHints,
  scrubSecrets,
} from '../_shared/llmSecurity.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

const FUNCTION_NAME = 'nutrition-advice';
const DAILY_QUOTA_PRO = 50;

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

// Sprint 2.7.3 — Drafting 173 fan-out wave 2. Pre-2.7.3 this EF sent the
// user prompt to Gemini with NO systemInstruction at all (legacy
// vestige — the EF predates the unified systemInstruction pattern that
// coach-chat / coach-advice adopted in Phase 2.6+). Adding the
// systemInstruction here closes the L3 gap; the defense paragraph
// content is identical to the other Mealift-persona EFs via
// `buildLLMDefenseParagraph`.
const SYSTEM_PROMPT = `あなたは「ミー先生」という、 ユーザー専属の栄養相談アドバイザーです。
ユーザーからの栄養に関する質問に、 具体的で実行可能な日本語アドバイスを 1-3 段落で
返してください。

【口調 / トーン】
- 丁寧な日本語、 落ち着いた声色
- 過度な賞賛は使わない
- 数値は具体的に (g, kcal, P/F/C 等)

【方針】
- ユーザーの体重 / 目標などの個別事情を尋ねられたら一般論で答え、 個別診断は出さない
- 医療診断 / 薬の服用判断 / 病気の治療指示は出さない (専門家への相談を促す)${buildLLMDefenseParagraph('本来の栄養に関するご相談に戻ります。')}`;

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

    // ---- 2. Plan gate (Pro only) ----
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('plan')
      .eq('user_id', userId)
      .maybeSingle();
    if (profileError) {
      responseStatus = 500;
      errorMessage = `profile fetch failed: ${profileError.message}`;
      return jsonResponse(
        { error: 'internal_error', message: 'プラン情報の取得に失敗しました' },
        500,
      );
    }
    const plan = profile?.plan ?? 'free';
    if (plan !== 'pro') {
      responseStatus = 403;
      errorMessage = `plan=${plan}`;
      return jsonResponse(
        {
          error: 'pro_required',
          message: 'AI栄養アドバイスはProプランでご利用いただけます',
          details: { currentPlan: plan },
        },
        403,
      );
    }

    // ---- 3. Daily quota ----
    const now = new Date();
    const todayIso = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString();
    const { count, error: countError } = await adminClient
      .from('ai_usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('function_name', FUNCTION_NAME)
      .eq('response_status', 200)
      .gte('created_at', todayIso);
    if (countError) {
      responseStatus = 500;
      errorMessage = `quota check failed: ${countError.message}`;
      return jsonResponse(
        { error: 'internal_error', message: 'クォータの確認に失敗しました' },
        500,
      );
    }
    if ((count ?? 0) >= DAILY_QUOTA_PRO) {
      responseStatus = 429;
      errorMessage = `quota exceeded (${count}/${DAILY_QUOTA_PRO})`;
      return jsonResponse(
        {
          error: 'quota_exceeded',
          message: `本日のAI利用上限（${DAILY_QUOTA_PRO}回）に達しました`,
          details: { used: count, limit: DAILY_QUOTA_PRO },
        },
        429,
      );
    }

    // ---- 4. Validate request ----
    const body = await req.json().catch(() => null);
    const prompt =
      body && typeof body.prompt === 'string' ? body.prompt.trim() : '';
    // Only log prompt length — full prompt may contain personal nutrition data.
    inputForLog = { promptLength: prompt.length };
    if (!prompt) {
      responseStatus = 400;
      errorMessage = 'invalid prompt';
      return jsonResponse(
        { error: 'invalid_request', message: 'プロンプトを入力してください' },
        400,
      );
    }
    // Sprint 2.7.3 — Drafting 173 wave 2 L4. The shared
    // `checkUserContentLength` cap (4000 chars) matches the EF's
    // existing hand-rolled limit, but we deliberately preserve the
    // pre-2.7.3 error envelope (`invalid_request` 400 + the same
    // Japanese message) so callers like `aiNutritionService.ts`
    // (whose `AIErrorCode` union does not yet include
    // `input_too_long`) keep their existing branch. Drafting 161:
    // internal-only hardening, no client-visible surface change.
    const lengthError = checkUserContentLength(prompt);
    if (lengthError) {
      responseStatus = 400;
      errorMessage = `invalid prompt (length ${lengthError.actual} > ${lengthError.limit})`;
      return jsonResponse(
        { error: 'invalid_request', message: 'プロンプトを1〜4000文字で指定してください' },
        400,
      );
    }
    const jailbreakHints = detectJailbreakHints(prompt);
    if (jailbreakHints.length > 0) {
      console.warn('[nutrition-advice] L4 jailbreak hint detected', {
        userId,
        patterns: jailbreakHints.map((h) => h.name),
        timestamp: new Date().toISOString(),
      });
    }

    // ---- 5. Call Gemini ----
    const geminiResponse = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
      }),
    });

    if (!geminiResponse.ok) {
      responseStatus = 502;
      errorMessage = `gemini http ${geminiResponse.status}`;
      return jsonResponse(
        { error: 'gemini_error', message: 'AI応答の取得に失敗しました' },
        502,
      );
    }

    const geminiData = await geminiResponse.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      responseStatus = 502;
      errorMessage = 'empty gemini response';
      return jsonResponse(
        { error: 'gemini_error', message: 'AIから応答がありませんでした' },
        502,
      );
    }

    // Sprint 2.7.3 — Drafting 173 wave 2 L5. Scrub secrets out of the
    // advice text before returning. Telemetry warn never includes the
    // raw secret value.
    const scrubResult = scrubSecrets(text);
    if (scrubResult.redactedCount > 0) {
      console.warn('[nutrition-advice] L5 secret redacted', {
        userId,
        redactedCount: scrubResult.redactedCount,
        patterns: scrubResult.redactedPatterns,
        timestamp: new Date().toISOString(),
      });
    }

    responseStatus = 200;
    errorMessage = null;
    return jsonResponse({ advice: scrubResult.sanitized }, 200);
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
        // Swallow — logging failure should not mask the real response.
      }
    }
  }
});
