import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// v1.4 ステージ 4 Phase 4C-1 — Vision (multimodal) nutrition estimate.
//
// Sister Edge Function to `estimate-nutrition` (text-only): takes a
// captured dish photo (base64) and returns the same
// `RecipeDecomposition` shape `{ dishName, servingDescription,
// ingredients[] }` so the client mapping helpers are reusable.
//
// Differences from `estimate-nutrition`:
//   - Input: `imageBase64: string` (jpeg, ≤ 1.3M chars / ~975KB raw)
//   - Model: `gemini-2.5-flash` (multimodal) vs `gemini-2.5-flash-lite`
//   - Separate quota: `DAILY_QUOTA_VISION_PRO = 20` keyed on
//     `function_name='estimate-nutrition-vision'` in ai_usage_logs,
//     so the text 50/day counter and the vision 20/day counter are
//     independent (Pro user can use both up to their separate caps).
//   - Payload validation gate (413) on the base64 string length, set
//     to 1_300_000 chars (≈ 975KB raw image at 4:3 base64 expansion)
//     — quality=0.4 captures land at 270-680KB typically, so 1.3M
//     gives headroom but rejects pathological high-res inputs before
//     they hit Gemini's 4MB multimodal cap.
//
// Pro-only: same `plan='pro'` gate as estimate-nutrition; mirrors the
// `aiNutritionEstimate` entitlement on the client.

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const FUNCTION_NAME = 'estimate-nutrition-vision';
const DAILY_QUOTA_VISION_PRO = 20;
const MAX_BASE64_LENGTH = 1_300_000;

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

const PROMPT_TEXT = `この料理画像から、料理名と1食分の説明、主な材料と各材料のグラム数を推定してください。
出力は以下の JSON 形式のみ。他の文字列は含めないでください:
{
  "dishName": "料理名（日本語）",
  "servingDescription": "1食分の説明（例: 中皿1杯、約350g）",
  "ingredients": [
    { "name": "材料名", "amountG": 数値 }
  ]
}

材料名は以下のような一般的な日本語食品名にしてください:
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
など。できるだけ上記リストにある名称を使ってください。
画像が不鮮明で料理を識別できない場合は、 dishName を空文字列にして
ingredients を空配列で返してください。`;

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
          message: 'AI料理スキャンはProプランでご利用いただけます',
          details: { currentPlan: plan },
        },
        403,
      );
    }

    // ---- 3. Daily quota (Vision-specific counter) ----
    //
    // Known TOCTOU: this count-then-insert pattern is identical to
    // the parent estimate-nutrition function and shares the same
    // race window — two parallel calls from the same user can both
    // observe `count < limit`, both proceed, and both insert a 200
    // row in the finally block. Realistic exposure: a Pro user
    // would have to script ≥ 21 parallel multimodal requests within
    // the same UTC day to overshoot. The mitigation (atomic counter
    // via a CTE-style RPC, or a unique index on a
    // user_id+day+function_name+seq composite) is pending v1.5 once
    // the ai_usage_logs migration shape is settled across all AI
    // EFs; see also the existing estimate-nutrition / estimate-
    // nutrition-vision counter pair.
    // TODO(v1.5 quota race): replace count-then-insert with an
    // atomic RPC that performs the gate + insert under the same
    // transaction.
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
    if ((count ?? 0) >= DAILY_QUOTA_VISION_PRO) {
      responseStatus = 429;
      errorMessage = `quota exceeded (${count}/${DAILY_QUOTA_VISION_PRO})`;
      return jsonResponse(
        {
          error: 'quota_exceeded',
          message: `本日の AI 料理スキャン上限（${DAILY_QUOTA_VISION_PRO}回）に達しました`,
          details: { used: count, limit: DAILY_QUOTA_VISION_PRO },
        },
        429,
      );
    }

    // ---- 4. Validate request ----
    const body = await req.json().catch(() => null);
    const imageBase64 =
      body && typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
    // Don't log the actual base64 — just its length for abuse forensics.
    inputForLog = { imageBase64Length: imageBase64.length };
    if (!imageBase64) {
      responseStatus = 400;
      errorMessage = 'invalid imageBase64';
      return jsonResponse(
        { error: 'invalid_request', message: '画像データが不正です' },
        400,
      );
    }
    if (imageBase64.length > MAX_BASE64_LENGTH) {
      responseStatus = 413;
      errorMessage = `image too large (${imageBase64.length} > ${MAX_BASE64_LENGTH})`;
      return jsonResponse(
        {
          error: 'image_too_large',
          message:
            '画像サイズが大きすぎます。撮影設定を確認するか、再撮影してください',
          details: { length: imageBase64.length, limit: MAX_BASE64_LENGTH },
        },
        413,
      );
    }

    // ---- 5. Call Gemini multimodal ----
    const geminiResponse = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: imageBase64,
                },
              },
              { text: PROMPT_TEXT },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 1024,
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

    let result: unknown;
    try {
      result = JSON.parse(text);
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
        // Swallow — log failure must not mask the real response.
      }
    }
  }
});
