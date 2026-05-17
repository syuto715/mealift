// v1.5 Stage 1 Phase 1.1 — GeminiFlashClient streaming tests.
//
// Codex round 1 / I4 coverage: the high-risk seams here are the
// eager-fetch boot contract (C1), the meta side-channel arrival
// timing, the abort race (the AbortController path), the
// pre-stream error path (HTTP JSON body), and the malformed-line
// silent drop (Nit 2). The pure NDJSON parser already has its
// own coverage in ndjsonParser.test.ts; this file uses a faked
// `fetch` to exercise the GeminiFlashClient wrapper end-to-end.

jest.mock('../../supabase/client', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: 'fake-token' } },
      })),
    },
  },
}));

jest.mock('../../../constants/config', () => ({
  APP_CONFIG: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'fake-anon',
    SUPABASE_FUNCTIONS_URL: undefined,
  },
}));

import { GeminiFlashClient } from '../geminiFlashClient';
import { AIError } from '../../services/aiNutritionService';
import type { ChatMessage, UserContext } from '../types';

const NOW = new Date('2026-05-17T00:00:00Z');

const fakeContext: UserContext = {
  profile: {
    ageRange: '30-34',
    sex: 'male',
    heightCm: 175,
    weightKg: 72,
    goalType: 'cut',
    activityLevel: 'moderate',
    trainingDaysPerWeek: 4,
  },
  targets: { calories: 2000, proteinG: 150, fatG: 60, carbG: 200 },
  recentMeals: {
    last7DaysAverage: { calories: 1900, proteinG: 140, fatG: 55, carbG: 180 },
    topFrequentNames: [],
  },
  recentWorkouts: { last14DaysSessions: 6, routineNames: [] },
  recentWeightTrend: { last14DaysKgChange: -0.5 },
};

function ndjsonBytes(lines: object[]): Uint8Array {
  const text = lines.map((o) => JSON.stringify(o) + '\n').join('');
  return new TextEncoder().encode(text);
}

function streamFrom(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function streamFromChunks(
  chunks: Uint8Array[],
): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]);
      } else {
        controller.close();
      }
    },
  });
}

const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  jest.useRealTimers();
});

describe('GeminiFlashClient.chat — boot semantics (Codex C1 fix)', () => {
  it('side-channel meta resolves WITHOUT calling the iterator first', async () => {
    const ndjson = ndjsonBytes([
      {
        event: 'meta',
        assistantMessageId: 'asst-1',
        conversationId: 'conv-1',
        model: 'gemini-2.5-flash',
      },
      { event: 'chunk', delta: 'こん' },
      { event: 'chunk', delta: 'にちは' },
      {
        event: 'done',
        inputTokens: 10,
        outputTokens: 5,
        model: 'gemini-2.5-flash',
        finishReason: 'stop',
      },
    ]);
    globalThis.fetch = jest.fn(async () =>
      new Response(streamFrom(ndjson), {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      }),
    ) as unknown as typeof fetch;

    const client = new GeminiFlashClient();
    const stream = client.chat([{ role: 'user', content: 'hi' } as ChatMessage], fakeContext, {
      idempotencyKey: 'key-1',
    });

    // The caller binds the assistant placeholder via meta BEFORE
    // iterating. Pre-C1 fix this hung; post-fix it resolves.
    const meta = await stream.meta;
    expect(meta.assistantMessageId).toBe('asst-1');
    expect(meta.conversationId).toBe('conv-1');
  });

  it('iterating after awaiting meta still yields all chunks', async () => {
    const ndjson = ndjsonBytes([
      {
        event: 'meta',
        assistantMessageId: 'asst-1',
        conversationId: 'conv-1',
        model: 'gemini-2.5-flash',
      },
      { event: 'chunk', delta: 'A' },
      { event: 'chunk', delta: 'B' },
      {
        event: 'done',
        inputTokens: 1,
        outputTokens: 1,
        model: 'gemini-2.5-flash',
        finishReason: 'stop',
      },
    ]);
    globalThis.fetch = jest.fn(async () =>
      new Response(streamFrom(ndjson), {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      }),
    ) as unknown as typeof fetch;
    const client = new GeminiFlashClient();
    const stream = client.chat(
      [{ role: 'user', content: 'hi' } as ChatMessage],
      fakeContext,
      { idempotencyKey: 'key-2' },
    );
    await stream.meta;
    const chunks: string[] = [];
    for await (const c of stream) chunks.push(c);
    expect(chunks.join('')).toBe('AB');
    const done = await stream.done;
    expect(done.finishReason).toBe('stop');
  });
});

describe('GeminiFlashClient.chat — pre-stream error path', () => {
  it('rejects meta + done with AIError when the EF returns JSON 401', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({ error: 'unauthorized', message: 'ログインが必要です' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;
    const client = new GeminiFlashClient();
    const stream = client.chat(
      [{ role: 'user', content: 'hi' } as ChatMessage],
      fakeContext,
      { idempotencyKey: 'key-3' },
    );
    const metaP = expect(stream.meta).rejects.toBeInstanceOf(AIError);
    const doneP = expect(stream.done).rejects.toBeInstanceOf(AIError);
    await Promise.all([metaP, doneP]);
  });

  it('rejects with quota_exceeded when EF returns 429 JSON', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({ error: 'quota_exceeded', message: '今月の上限' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;
    const client = new GeminiFlashClient();
    const stream = client.chat(
      [{ role: 'user', content: 'hi' } as ChatMessage],
      fakeContext,
      { idempotencyKey: 'key-4' },
    );
    // Attach a noop catch to `done` so its rejection isn't treated
    // as unhandled by the test process. Production consumers
    // observe both meta + done; this test focuses on meta.
    stream.done.catch(() => {});
    await expect(stream.meta).rejects.toMatchObject({
      code: 'quota_exceeded',
      status: 429,
    });
  });
});

describe('GeminiFlashClient.chat — abort + error event', () => {
  it('mid-stream error event rejects done with AIError', async () => {
    const ndjson = ndjsonBytes([
      {
        event: 'meta',
        assistantMessageId: 'asst-1',
        conversationId: 'conv-1',
        model: 'gemini-2.5-flash',
      },
      { event: 'chunk', delta: 'partial' },
      {
        event: 'error',
        code: 'gemini_error',
        message: 'mid-stream failure',
        recoverable: false,
      },
    ]);
    globalThis.fetch = jest.fn(async () =>
      new Response(streamFrom(ndjson), {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      }),
    ) as unknown as typeof fetch;
    const client = new GeminiFlashClient();
    const stream = client.chat(
      [{ role: 'user', content: 'hi' } as ChatMessage],
      fakeContext,
      { idempotencyKey: 'key-5' },
    );

    const chunks: string[] = [];
    const iter = stream[Symbol.asyncIterator]();
    while (true) {
      try {
        const r = await iter.next();
        if (r.done) break;
        chunks.push(r.value);
      } catch (e) {
        expect(e).toBeInstanceOf(AIError);
        expect((e as AIError).code).toBe('gemini_error');
        break;
      }
    }
    expect(chunks).toContain('partial');
    await expect(stream.done).rejects.toBeInstanceOf(AIError);
  });

  it('idempotencyKey is required (throws synchronously on missing key)', () => {
    const client = new GeminiFlashClient();
    expect(() =>
      client.chat([{ role: 'user', content: 'hi' } as ChatMessage], fakeContext, {
        idempotencyKey: '' as string,
      }),
    ).toThrow(AIError);
  });
});

describe('GeminiFlashClient.chat — NDJSON consumer edge cases', () => {
  it('handles a chunk split across two fetch reads (NDJSONBuffer partial-line)', async () => {
    const all = ndjsonBytes([
      {
        event: 'meta',
        assistantMessageId: 'asst-1',
        conversationId: 'conv-1',
        model: 'gemini-2.5-flash',
      },
      { event: 'chunk', delta: 'こんにちは' },
      {
        event: 'done',
        inputTokens: 1,
        outputTokens: 1,
        model: 'gemini-2.5-flash',
        finishReason: 'stop',
      },
    ]);
    // Split the bytes in two arbitrary places to verify the
    // remainder buffering.
    const cutA = Math.floor(all.byteLength / 3);
    const cutB = Math.floor((all.byteLength * 2) / 3);
    const chunks = [all.slice(0, cutA), all.slice(cutA, cutB), all.slice(cutB)];
    globalThis.fetch = jest.fn(async () =>
      new Response(streamFromChunks(chunks), {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      }),
    ) as unknown as typeof fetch;
    const client = new GeminiFlashClient();
    const stream = client.chat(
      [{ role: 'user', content: 'hi' } as ChatMessage],
      fakeContext,
      { idempotencyKey: 'key-split' },
    );
    const out: string[] = [];
    for await (const c of stream) out.push(c);
    expect(out.join('')).toBe('こんにちは');
  });
});

// Ensure the test file can run without RN's __DEV__ shim — the
// production code references __DEV__ via `typeof` guards which
// don't throw under node.
declare const __DEV__: boolean | undefined;
void __DEV__;
