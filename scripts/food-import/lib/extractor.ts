// Gemini-backed structured extraction. Used to turn a free-form input
// (PDF text, label OCR, table dump, etc.) into a typed JSON value.
//
// IMPORTANT: this module is the ONLY place an LLM is allowed to touch
// nutrition data, and even here it MUST NOT estimate or fill values.
// The system prompt below makes that constraint explicit; validator.ts
// is expected to catch any drift before a row reaches a CSV.
//
// API key: process.env.GEMINI_API_KEY (read at call time).
// Model:   process.env.GEMINI_MODEL or DEFAULT_MODEL.
//
// Build-time only — this key MUST NOT be referenced by the runtime app.
// Runtime calls go through the Supabase Edge Function proxy instead.

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';

const SYSTEM_GUARDRAILS = [
  'You are extracting nutrition data from a source document into JSON.',
  'You MUST follow these rules:',
  '1. Extract ONLY values literally present in the input. Do NOT estimate, infer, or fill missing values.',
  '2. If a field is absent, return null. Never guess.',
  '3. Normalize units to grams (g) for macros, milligrams (mg) for sodium, and kcal for calories. Convert only when the conversion is unambiguous.',
  '4. Preserve the original Japanese product name verbatim — do not translate, expand abbreviations, or add brand suffixes.',
  '5. Return strictly valid JSON matching the schema. No prose. No markdown fences.',
].join('\n');

export interface ExtractRequest {
  // The raw text / HTML / markdown to extract from.
  input: string;
  // The JSON schema description for the model to follow, in plain
  // English (e.g. "an array of objects with fields: name_ja: string,
  // calories_kcal: number | null, ..."). Keep stable across runs so
  // outputs are reproducible.
  schemaDescription: string;
  // Optional extra instructions specific to this source.
  sourceNotes?: string;
  // Override the default Gemini model.
  model?: string;
}

export interface ExtractResponse<T> {
  data: T;
  rawText: string;
  modelUsed: string;
}

export async function extractStructured<T>(req: ExtractRequest): Promise<ExtractResponse<T>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not set. Add it to .env.local at the repo root — see scripts/food-import/README.md.',
    );
  }
  const model = req.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

  const prompt = [
    SYSTEM_GUARDRAILS,
    '',
    'Schema:',
    req.schemaDescription,
    '',
    req.sourceNotes ? `Source-specific notes:\n${req.sourceNotes}\n` : '',
    'Input:',
    req.input,
  ].join('\n');

  const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        // temperature=0 is non-negotiable: any sampling here means the
        // model could vary between runs on the same input, which would
        // make extraction non-reproducible.
        temperature: 0,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${model} ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(
      'Gemini returned no text. Full response: ' + JSON.stringify(json).slice(0, 500),
    );
  }
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Gemini returned non-JSON output. First 500 chars: ${text.slice(0, 500)}`,
    );
  }
  return { data, rawText: text, modelUsed: model };
}
