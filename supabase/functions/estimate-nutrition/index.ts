import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildLLMDefenseParagraph,
  detectJailbreakHints,
  scrubSecrets,
} from '../_shared/llmSecurity.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

const FUNCTION_NAME = 'estimate-nutrition';
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

// Sprint 2.7.3 — Drafting 173 fan-out wave 2 (Codex review pass 1
// Critical #2 follow-up). estimate-nutrition was missed in the original
// Sprint 2.7.1 audit table but accepts user-controlled `dishName` and
// interpolates it into the LLM prompt, so it carries the same attack
// surface as nutrition-advice. L4 retains the EF's tighter 200-char
// cap (much narrower than the shared 4000-char MAX_USER_CONTENT_CHARS
// — keeping the tighter limit is the safer policy) and adds the
// shared `detectJailbreakHints` advisory logger.
const SYSTEM_PROMPT = `あなたは「ミー先生」という Mealift の料理名→栄養推定アドバイザーです。
ユーザーから受け取った料理名を、 日本の一般的な 1 人前サイズで材料と分量に分解し、
指定された JSON 形式のみを返してください。

【方針】
- 出力は JSON のみ。 前後に説明・敬語の挨拶等は含めない
- 個別の医療診断や栄養治療判断は出さない
- 料理名が認識できない場合は dishName を空文字列にして ingredients を空配列で返す${buildLLMDefenseParagraph('本来の料理名からの栄養推定に戻ります。')}`;

function buildPrompt(dishName: string): string {
  return `以下の料理を材料と分量に分解してください。
料理名: ${dishName}

日本の一般的な1人前サイズで推定してください。
以下のJSON形式のみで回答してください。他のテキストは含めないでください:
{
  "dishName": "料理名（正式名）",
  "servingDescription": "1人前",
  "ingredients": [
    { "name": "材料名", "amountG": 数値 }
  ]
}

材料名は以下のような一般的な日本語の食品名にしてください:
白米、玄米、食パン、うどん、そば、スパゲティ、中華麺、
鶏むね肉、鶏もも肉、豚ロース、豚バラ肉、豚ひき肉、牛もも肉、合びき肉、
鮭、さば、まぐろ、海老、
卵、牛乳、バター、生クリーム、チーズ、ヨーグルト、
木綿豆腐、絹ごし豆腐、納豆、
玉ねぎ、にんじん、キャベツ、じゃがいも、ブロッコリー、ほうれん草、トマト、
もやし、ニラ、長ねぎ、ピーマン、たけのこ、チンゲン菜、大根、きゅうり、レタス、
サラダ油、ごま油、オリーブオイル、
醤油、味噌、塩、砂糖、みりん、料理酒、酢、
ケチャップ、マヨネーズ、ソース、デミグラスソース、オイスターソース、豆板醤、コチュジャン、
小麦粉、片栗粉、パン粉、天かす、
ウインナー、ベーコン、ハム、チャーシュー、カニカマ
など。できるだけ上記リストにある名称を使ってください。`;
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
          message: 'AI栄養推定はProプランでご利用いただけます',
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
    const dishName =
      body && typeof body.dishName === 'string' ? body.dishName.trim() : '';
    inputForLog = { dishName };
    if (!dishName || dishName.length < 1 || dishName.length > 200) {
      responseStatus = 400;
      errorMessage = 'invalid dishName';
      return jsonResponse(
        { error: 'invalid_request', message: '料理名を1〜200文字で入力してください' },
        400,
      );
    }
    // Sprint 2.7.3 — Drafting 173 wave 2 L4 advisory. The 200-char
    // hard cap above is tighter than MAX_USER_CONTENT_CHARS (4000)
    // and is preserved. Jailbreak hint detection is added as a
    // separate advisory log so attempts surface in telemetry without
    // any change to the client-facing error envelope.
    const jailbreakHints = detectJailbreakHints(dishName);
    if (jailbreakHints.length > 0) {
      console.warn('[estimate-nutrition] L4 jailbreak hint detected', {
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
        contents: [{ parts: [{ text: buildPrompt(dishName) }] }],
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 512,
          temperature: 0.2,
        },
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

    // Sprint 2.7.3 — Drafting 173 wave 2 L5. Scrub before JSON.parse —
    // `[redacted]` is a valid JSON string-content fragment so the
    // surrounding envelope stays intact and the downstream Recipe-
    // Decomposition validation is unaffected.
    const scrubResult = scrubSecrets(text);
    if (scrubResult.redactedCount > 0) {
      console.warn('[estimate-nutrition] L5 secret redacted', {
        userId,
        redactedCount: scrubResult.redactedCount,
        patterns: scrubResult.redactedPatterns,
        timestamp: new Date().toISOString(),
      });
    }
    const sanitizedText = scrubResult.sanitized;

    let result: unknown;
    try {
      result = JSON.parse(sanitizedText);
    } catch {
      responseStatus = 502;
      errorMessage = 'gemini returned non-JSON';
      return jsonResponse(
        { error: 'gemini_error', message: 'AI応答の解析に失敗しました' },
        502,
      );
    }

    responseStatus = 200;
    errorMessage = null;
    return jsonResponse(result, 200);
  } catch (e) {
    responseStatus = 500;
    errorMessage = e instanceof Error ? e.message : String(e);
    return jsonResponse(
      { error: 'internal_error', message: '内部エラーが発生しました' },
      500,
    );
  } finally {
    // Always log, even on failure — abuse monitoring depends on seeing
    // unauthorized / quota_exceeded attempts too.
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
