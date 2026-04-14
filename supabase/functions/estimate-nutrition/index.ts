import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  try {
    const { dishName } = await req.json();

    if (!dishName || typeof dishName !== 'string') {
      return new Response(JSON.stringify({ error: 'dishName is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const geminiResponse = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `以下の料理を材料と分量に分解してください。
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
など。できるだけ上記リストにある名称を使ってください。`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 512,
          temperature: 0.2,
        },
      }),
    });

    if (!geminiResponse.ok) {
      return new Response(JSON.stringify({ error: 'Gemini API error' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const geminiData = await geminiResponse.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return new Response(
        JSON.stringify({ error: 'Empty response from Gemini' }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const result = JSON.parse(text);

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
