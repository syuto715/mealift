import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    if (!prompt || prompt.length < 1 || prompt.length > 4000) {
      responseStatus = 400;
      errorMessage = 'invalid prompt';
      return jsonResponse(
        { error: 'invalid_request', message: 'プロンプトを1〜4000文字で指定してください' },
        400,
      );
    }

    // ---- 5. Call Gemini ----
    const geminiResponse = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
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

    responseStatus = 200;
    errorMessage = null;
    return jsonResponse({ advice: text }, 200);
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
