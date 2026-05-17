// v1.5 Stage 1 Phase 1.1 — GeminiFlashClient (LLMClient impl).
//
// Architectural SSoT: docs/plans/v1.5_stage_1_ai_chat_epic.md §4
// (LLM client abstraction) + §3 (4 surface data flow) + §4.3
// (streaming surface).
//
// Responsibilities:
//   - `chat()`: NDJSON-streaming POST to `coach-chat`. Returns a
//     ChatStream (AsyncIterable<string> + meta + done side-
//     channels). Reads `Response.body` as a ReadableStream,
//     decodes via TextDecoder, splits on `\n`, dispatches each
//     line through `parseNDJSONLine`.
//   - `generateStructured`: non-streaming POST to `coach-routine`.
//   - `generateAdvice`: non-streaming POST to `coach-advice`.
//
// EOF / abort contract (§3 + §4.3): the parser does not flush an
// unterminated trailing remainder. If the connection closes
// before a newline-terminated `done` / `error` line, the iterable
// rejects with `AIError('aborted'|'gemini_error', ...)` per the
// underlying cause — the local message lifecycle then carries a
// `partial` status that the server reconciles on next read.

import { APP_CONFIG } from '../../constants/config';
import { supabase } from '../supabase/client';
import {
  AIError,
  type AIErrorCode,
} from '../services/aiNutritionService';
import { NDJSONBuffer, parseNDJSONLine } from './ndjsonParser';
import type {
  AdviceOptions,
  ChatMessage,
  ChatOptions,
  ChatStream,
  ChatStreamDone,
  ChatStreamMeta,
  LLMClient,
  StructuredOptions,
  UserContext,
} from './types';

const COACH_CHAT_PATH = 'functions/v1/coach-chat';
const COACH_ROUTINE_PATH = 'functions/v1/coach-routine';
const COACH_ADVICE_PATH = 'functions/v1/coach-advice';

async function getAccessToken(): Promise<string> {
  if (!supabase) {
    throw new AIError(
      'not_configured',
      'サーバー接続が設定されていません',
      0,
    );
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new AIError('unauthorized', 'ログインが必要です', 401);
  }
  return token;
}

// =====================================================================
// Internal: NDJSON stream consumer
// =====================================================================

interface ChatStreamHandle {
  iterable: AsyncIterable<string>;
  metaPromise: Promise<ChatStreamMeta>;
  donePromise: Promise<ChatStreamDone>;
}

function consumeNDJSON(
  body: ReadableStream<Uint8Array>,
  abortPromise: Promise<never> | null,
): ChatStreamHandle {
  // Codex round 1 / C1 follow-up — the pump runs in the background
  // as a self-driving loop so the `meta` event arrives at the
  // side-channel WITHOUT the caller having to start iterating
  // first. Chunks accumulate in `queue`; next() pulls from the
  // queue and parks on `signal` (a resolved-on-progress promise)
  // when the queue is empty.

  let resolveMeta: (m: ChatStreamMeta) => void = () => {};
  let rejectMeta: (e: unknown) => void = () => {};
  const metaPromise = new Promise<ChatStreamMeta>((res, rej) => {
    resolveMeta = res;
    rejectMeta = rej;
  });
  let resolveDone: (d: ChatStreamDone) => void = () => {};
  let rejectDone: (e: unknown) => void = () => {};
  const donePromise = new Promise<ChatStreamDone>((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });

  const reader = body.getReader();
  const ndjsonBuffer = new NDJSONBuffer();
  const queue: string[] = [];
  let metaSeen = false;
  let finished = false;
  let terminalError: AIError | null = null;

  // "signal" promise: resolves whenever queue gets a new chunk
  // OR the stream finishes. Replaced after each resolve so next()
  // can re-park on the new one.
  let signal: { promise: Promise<void>; resolve: () => void } = makeSignal();
  function makeSignal(): { promise: Promise<void>; resolve: () => void } {
    let r: () => void = () => {};
    const p = new Promise<void>((res) => {
      r = res;
    });
    return { promise: p, resolve: r };
  }
  function poke(): void {
    const old = signal;
    signal = makeSignal();
    old.resolve();
  }

  const pumpInBackground = async (): Promise<void> => {
    try {
      while (!finished) {
        const readPromise = reader.read();
        const winner = await (abortPromise
          ? Promise.race([readPromise, abortPromise])
          : readPromise);
        if (!winner || winner.done) {
          // EOF without a terminating `done`/`error` event ⇒
          // transport loss; the message stays `partial` on the
          // server. Surface as AIError so callers can branch.
          finished = true;
          if (!terminalError) {
            terminalError = new AIError(
              'aborted',
              'ストリームが完了前に切断されました',
              0,
            );
          }
          break;
        }
        const lines = ndjsonBuffer.feed(winner.value);
        for (const line of lines) {
          const parsed = parseNDJSONLine(line);
          if (parsed.kind === 'malformed') {
            // Nit 2 (Codex round 1) — dev-only warning. Production
            // silently drops to avoid crashing on a server drift.
            if (typeof __DEV__ !== 'undefined' && __DEV__) {
              // eslint-disable-next-line no-console
              console.warn(
                '[GeminiFlashClient] malformed NDJSON line dropped:',
                parsed.reason,
                '|',
                parsed.raw,
              );
            }
            continue;
          }
          const event = parsed.event;
          if (event.event === 'meta') {
            metaSeen = true;
            resolveMeta({
              assistantMessageId: event.assistantMessageId,
              conversationId: event.conversationId,
              model: event.model,
            });
          } else if (event.event === 'chunk') {
            queue.push(event.delta);
            poke();
          } else if (event.event === 'done') {
            finished = true;
            resolveDone({
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              model: event.model,
              finishReason: event.finishReason,
            });
            break;
          } else if (event.event === 'error') {
            finished = true;
            terminalError = new AIError(
              event.code as AIErrorCode,
              event.message,
              500,
            );
            break;
          }
        }
        if (finished) break;
      }
    } catch (e) {
      finished = true;
      if (!terminalError) {
        terminalError =
          e instanceof AIError
            ? e
            : new AIError(
                'network_error',
                e instanceof Error ? e.message : 'stream read failed',
                0,
              );
      }
    } finally {
      if (!metaSeen) {
        rejectMeta(
          terminalError ??
            new AIError(
              'gemini_error',
              'メタイベントを受信せずに切断されました',
              502,
            ),
        );
      }
      if (terminalError) {
        rejectDone(terminalError);
      }
      poke();
    }
  };
  // Kick off the pump immediately — its rejection is swallowed
  // since the async boundary surfaces errors through the
  // promises + iterator throws.
  pumpInBackground().catch(() => {});

  const iterable: AsyncIterable<string> = {
    [Symbol.asyncIterator](): AsyncIterator<string> {
      return {
        async next(): Promise<IteratorResult<string>> {
          // Pull from the queue if available; otherwise wait
          // until poke() fires.
          while (queue.length === 0 && !finished) {
            await signal.promise;
          }
          if (queue.length > 0) {
            return { value: queue.shift() as string, done: false };
          }
          if (terminalError) {
            throw terminalError;
          }
          return { value: undefined as unknown as string, done: true };
        },
        async return(): Promise<IteratorResult<string>> {
          finished = true;
          try {
            await reader.cancel();
          } catch {
            // ReadableStream.cancel can throw if already closed.
          }
          poke();
          return { value: undefined as unknown as string, done: true };
        },
      };
    },
  };

  return { iterable, metaPromise, donePromise };
}

// =====================================================================
// GeminiFlashClient
// =====================================================================

export class GeminiFlashClient implements LLMClient {
  chat(
    messages: ChatMessage[],
    context: UserContext,
    options: ChatOptions,
  ): ChatStream {
    if (!options.idempotencyKey) {
      throw new AIError(
        'invalid_request',
        'Idempotency-Key is required for chat()',
        400,
      );
    }

    // Codex round 1 / C1 fix — the meta + done side-channels MUST
    // resolve even when the caller `await`s them before iterating.
    // Earlier revisions only triggered the fetch from `next()`,
    // which deadlocked callers that bound the assistantMessageId
    // via `await stream.meta` first (§4.3 observer-hook contract).
    // The fix: kick off the entire boot pipeline eagerly inside
    // `chat()` and have both the iterator and the side-channels
    // attach to the same in-flight pipeline.

    // Definite-assignment via no-op initializers so TypeScript
    // tracks the variables as assigned through the closures below.
    // The Promise constructor synchronously calls the executor,
    // so the assignments actually land before either promise is
    // used; the no-op initializers are just for the type checker.
    let resolveMeta: (m: ChatStreamMeta) => void = () => {};
    let rejectMeta: (e: unknown) => void = () => {};
    const metaPromise = new Promise<ChatStreamMeta>((res, rej) => {
      resolveMeta = res;
      rejectMeta = rej;
    });
    let resolveDone: (d: ChatStreamDone) => void = () => {};
    let rejectDone: (e: unknown) => void = () => {};
    const donePromise = new Promise<ChatStreamDone>((res, rej) => {
      resolveDone = res;
      rejectDone = rej;
    });

    // Wire abort signal → race promise (consumed inside the NDJSON
    // pump loop). Built here so it captures the caller-supplied
    // signal before the async fetch starts.
    const abortPromise = options.signal
      ? new Promise<never>((_res, rej) => {
          if (options.signal!.aborted) {
            rej(new AIError('aborted', 'リクエストを中止しました', 0));
          } else {
            options.signal!.addEventListener('abort', () => {
              rej(new AIError('aborted', 'リクエストを中止しました', 0));
            });
          }
        })
      : null;

    // Promise<AsyncIterator<string>> resolved eagerly by the boot
    // pipeline. Subsequent `next()` calls just await it (cheap
    // once resolved).
    const iteratorPromise: Promise<AsyncIterator<string>> = (async () => {
      const token = await getAccessToken();
      let response: Response;
      try {
        response = await fetch(
          `${APP_CONFIG.SUPABASE_URL}/${COACH_CHAT_PATH}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              'Idempotency-Key': options.idempotencyKey,
            },
            body: JSON.stringify({ messages, context }),
            signal: options.signal,
          },
        );
      } catch (e) {
        const err =
          e instanceof Error && e.name === 'AbortError'
            ? new AIError(
                'aborted',
                'リクエストを中止しました',
                0,
                { cause: e.message },
              )
            : new AIError(
                'network_error',
                'ネットワーク接続を確認してください',
                0,
                { cause: e instanceof Error ? e.message : String(e) },
              );
        rejectMeta(err);
        rejectDone(err);
        throw err;
      }

      const contentType = response.headers.get('content-type') ?? '';

      // Pre-stream error path: server replies with
      // `application/json` and a structured error body. The NDJSON
      // stream never starts in that case (§3 pre-stream errors).
      if (!response.ok || contentType.includes('application/json')) {
        let parsed: unknown = null;
        try {
          parsed = await response.json();
        } catch {
          parsed = null;
        }
        const errObj =
          parsed && typeof parsed === 'object'
            ? (parsed as {
                error?: string;
                message?: string;
                details?: Record<string, unknown>;
              })
            : {};
        const code = (errObj.error as AIErrorCode) ?? 'internal_error';
        const message = errObj.message ?? 'エラーが発生しました';
        const err = new AIError(code, message, response.status, errObj.details);
        rejectMeta(err);
        rejectDone(err);
        throw err;
      }

      if (!response.body) {
        const err = new AIError(
          'gemini_error',
          'ストリーム body が利用できません',
          502,
        );
        rejectMeta(err);
        rejectDone(err);
        throw err;
      }

      const handle = consumeNDJSON(response.body, abortPromise);
      // Forward the handle's side-channels to the outer stream.
      handle.metaPromise.then(resolveMeta, rejectMeta);
      handle.donePromise.then(resolveDone, rejectDone);
      return handle.iterable[Symbol.asyncIterator]();
    })();

    // Swallow rejections at the side-channel boundary so the
    // floating-promise lint stays clean; callers see the rejection
    // through `await stream.meta` / `await stream.done` / the
    // iterator's `.next()` throw.
    iteratorPromise.catch(() => {});

    const stream: ChatStream = {
      meta: metaPromise,
      done: donePromise,
      [Symbol.asyncIterator](): AsyncIterator<string> {
        return {
          next: async () => {
            const it = await iteratorPromise;
            return it.next();
          },
          return: async () => {
            try {
              const it = await iteratorPromise;
              if (it.return) {
                return it.return();
              }
            } catch {
              // boot already rejected; nothing to clean up.
            }
            return { value: undefined as unknown as string, done: true };
          },
        };
      },
    };
    return stream;
  }

  async generateStructured<T>(
    prompt: string,
    context: UserContext,
    options: StructuredOptions,
  ): Promise<T> {
    if (!options.idempotencyKey) {
      throw new AIError(
        'invalid_request',
        'Idempotency-Key is required for generateStructured()',
        400,
      );
    }
    const token = await getAccessToken();
    let response: Response;
    try {
      response = await fetch(
        `${APP_CONFIG.SUPABASE_URL}/${COACH_ROUTINE_PATH}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': options.idempotencyKey,
          },
          body: JSON.stringify({
            prompt,
            schema: options.schema,
            context,
          }),
          signal: options.signal,
        },
      );
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new AIError(
          'aborted',
          'リクエストを中止しました',
          0,
          { cause: e.message },
        );
      }
      throw new AIError(
        'network_error',
        'ネットワーク接続を確認してください',
        0,
        { cause: e instanceof Error ? e.message : String(e) },
      );
    }
    const raw = await response.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const errObj =
        parsed && typeof parsed === 'object'
          ? (parsed as {
              error?: string;
              message?: string;
              details?: Record<string, unknown>;
            })
          : {};
      const code = (errObj.error as AIErrorCode) ?? 'internal_error';
      const message = errObj.message ?? 'エラーが発生しました';
      throw new AIError(code, message, response.status, errObj.details);
    }
    return parsed as T;
  }

  async generateAdvice(
    context: UserContext,
    options: AdviceOptions,
  ): Promise<string> {
    const token = await getAccessToken();
    let response: Response;
    try {
      response = await fetch(
        `${APP_CONFIG.SUPABASE_URL}/${COACH_ADVICE_PATH}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ context, scope: options.scope }),
          signal: options.signal,
        },
      );
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new AIError(
          'aborted',
          'リクエストを中止しました',
          0,
          { cause: e.message },
        );
      }
      throw new AIError(
        'network_error',
        'ネットワーク接続を確認してください',
        0,
        { cause: e instanceof Error ? e.message : String(e) },
      );
    }
    const raw = await response.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const errObj =
        parsed && typeof parsed === 'object'
          ? (parsed as { error?: string; message?: string })
          : {};
      const code = (errObj.error as AIErrorCode) ?? 'internal_error';
      const message = errObj.message ?? 'エラーが発生しました';
      throw new AIError(code, message, response.status);
    }
    if (
      !parsed ||
      typeof (parsed as { advice?: unknown }).advice !== 'string'
    ) {
      throw new AIError('gemini_error', 'AIから応答がありませんでした', 502);
    }
    return (parsed as { advice: string }).advice;
  }
}
