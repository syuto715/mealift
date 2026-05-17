// v1.5 Stage 1 Phase 1.2 — chatStore reducer tests.
//
// Coverage targets (per Phase 1.2 kickoff prompt unit-test list):
//   1. sendMessage appends BOTH placeholders (assistant FIRST, user
//      SECOND) with a generated idempotencyKey carried into the
//      ChatOptions of the fake LLM client (§3 race-safe ordering).
//   2. meta event re-keys the assistant row from clientTempId to
//      the server's assistantMessageId.
//   3. chunk events append to the bound assistant row's content.
//   4. done event flips the assistant row to status='final' +
//      records token counts + bumps userMessagesThisMonth (quota
//      counter).
//   5. error event surfaces AIError + flips assistant row to
//      status='error'.
//   6. aborted event flips assistant row to 'partial' and sets
//      isOffline=true (reactive offline detection).
//   7. regenerateMessage deletes the prior assistant row + re-runs
//      sendMessage with a NEW idempotencyKey.
//   8. AbortController.abort() flows through abortStream().
//   9. New-conversation flow: sendMessage with conversationId=null
//      consumes the server's conversationId from the meta event +
//      upserts a conversation row.
//
// The fake LLM client implements the ChatStream contract (the
// async iterable + meta/done side-channels). We don't go through
// fetch — that's covered by geminiFlashClient.test.ts.

// generateId() reaches expo-crypto which ships ESM; stub with a
// deterministic counter so test assertions can pin the values
// (e.g. asserting that regenerate's idempotencyKey differs from
// the first send's).
let mockNextUuid = 0;
jest.mock('../../utils/id', () => ({
  generateId: () => `uuid-${++mockNextUuid}`,
}));

jest.mock('../../infra/database/connection', () => ({
  getDatabase: jest.fn(async () => ({
    runAsync: jest.fn(async () => {}),
    getAllAsync: jest.fn(async () => []),
    getFirstAsync: jest.fn(async () => ({ n: 0 })),
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
  })),
}));

jest.mock('../../infra/repositories/profileRepository', () => ({
  getProfile: jest.fn(async () => ({
    id: 'profile-1',
    gender: 'male',
    birthYear: 1990,
    heightCm: 175,
    currentWeightKg: 72,
    goalType: 'cut',
    activityLevel: 'moderate',
    trainingDaysPerWeek: 4,
    targetCalories: 2000,
    targetProteinG: 150,
    targetFatG: 60,
    targetCarbG: 200,
  })),
}));

jest.mock('../../infra/repositories/nutritionRepository', () => ({
  getDailyNutritionSummary: jest.fn(async () => ({
    totalCalories: 0,
    totalProteinG: 0,
    totalFatG: 0,
    totalCarbG: 0,
    meals: [],
  })),
}));

jest.mock('../../infra/repositories/workoutRepository', () => ({
  getRecentSessionCount: jest.fn(async () => 0),
}));

jest.mock('../../infra/repositories/bodyLogRepository', () => ({
  getBodyLogs: jest.fn(async () => []),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

// aiNutritionService (the AIError host) + GeminiFlashClient both
// pull in supabase/client → react-native-url-polyfill (ESM); stub
// the supabase client to null so the import chain stays type-safe
// without spinning up the polyfill.
jest.mock('../../infra/supabase/client', () => ({ supabase: null }));

// GeminiFlashClient itself: provide a no-op default; tests inject
// their own client via useChatStore.getState().setLLMClient().
jest.mock('../../infra/llm/geminiFlashClient', () => ({
  GeminiFlashClient: class {
    chat() {
      throw new Error('default GeminiFlashClient not used in tests');
    }
    generateStructured() {
      throw new Error('default GeminiFlashClient not used in tests');
    }
    generateAdvice() {
      throw new Error('default GeminiFlashClient not used in tests');
    }
  },
}));

import { useChatStore } from '../chatStore';
import { AIError } from '../../infra/services/aiNutritionService';
import type {
  ChatMessage,
  ChatOptions,
  ChatStream,
  ChatStreamDone,
  ChatStreamMeta,
  LLMClient,
  UserContext,
} from '../../infra/llm/types';

// ---------------------------------------------------------------------
// Fake LLMClient — exposes hooks for the test to drive the stream.
// ---------------------------------------------------------------------

interface FakeChatStreamController {
  emitMeta: (meta: ChatStreamMeta) => void;
  emitChunk: (delta: string) => void;
  finish: (done: ChatStreamDone) => void;
  fail: (err: Error) => void;
}

interface FakeChatCall {
  messages: ChatMessage[];
  context: UserContext;
  options: ChatOptions;
  controller: FakeChatStreamController;
}

function makeFakeClient(): { client: LLMClient; calls: FakeChatCall[] } {
  const calls: FakeChatCall[] = [];
  const client: LLMClient = {
    chat(
      messages: ChatMessage[],
      context: UserContext,
      options: ChatOptions,
    ): ChatStream {
      let resolveMeta!: (m: ChatStreamMeta) => void;
      let rejectMeta!: (e: unknown) => void;
      const metaPromise = new Promise<ChatStreamMeta>((res, rej) => {
        resolveMeta = res;
        rejectMeta = rej;
      });
      let resolveDone!: (d: ChatStreamDone) => void;
      let rejectDone!: (e: unknown) => void;
      const donePromise = new Promise<ChatStreamDone>((res, rej) => {
        resolveDone = res;
        rejectDone = rej;
      });

      const queue: string[] = [];
      let finished = false;
      let terminalError: Error | null = null;
      let signal: { p: Promise<void>; r: () => void } = makeSignal();
      function makeSignal() {
        let r!: () => void;
        const p = new Promise<void>((res) => {
          r = res;
        });
        return { p, r };
      }
      function poke() {
        const old = signal;
        signal = makeSignal();
        old.r();
      }

      const controller: FakeChatStreamController = {
        emitMeta: (m) => resolveMeta(m),
        emitChunk: (d) => {
          queue.push(d);
          poke();
        },
        finish: (d) => {
          finished = true;
          resolveDone(d);
          poke();
        },
        fail: (e) => {
          finished = true;
          terminalError = e;
          rejectMeta(e);
          rejectDone(e);
          poke();
        },
      };

      const stream: ChatStream = {
        meta: metaPromise,
        done: donePromise,
        [Symbol.asyncIterator]() {
          return {
            async next() {
              while (queue.length === 0 && !finished) {
                await signal.p;
              }
              if (queue.length > 0) {
                return { value: queue.shift() as string, done: false };
              }
              if (terminalError) throw terminalError;
              return { value: undefined as unknown as string, done: true };
            },
          };
        },
      };

      calls.push({ messages, context, options, controller });
      return stream;
    },
    generateStructured: jest.fn(),
    generateAdvice: jest.fn(),
  } as unknown as LLMClient;

  return { client, calls };
}

function resetStore() {
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    messages: [],
    streamingState: {
      conversationId: null,
      assistantMessageId: null,
      abortController: null,
    },
    error: null,
    isOffline: false,
    userMessagesThisMonth: 0,
  });
}

// ---------------------------------------------------------------------

describe('chatStore.sendMessage — 2-row optimistic append', () => {
  beforeEach(resetStore);

  it('appends BOTH assistant placeholder and user message rows', async () => {
    const { client, calls } = makeFakeClient();
    useChatStore.getState().setLLMClient(client);

    const sendP = useChatStore.getState().sendMessage({
      userId: 'u1',
      conversationId: null,
      text: 'こんにちは',
    });
    // Allow the chat() call to register a call entry.
    await new Promise((r) => setTimeout(r, 0));

    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(2);
    // §3 client-side sequence: user first, assistant second.
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[0].content).toBe('こんにちは');
    expect(msgs[1].content).toBe('');
    expect(msgs[0].status).toBe('sending');
    expect(msgs[1].status).toBe('sending');

    // The LLM client was invoked with an idempotencyKey + signal.
    expect(calls).toHaveLength(1);
    expect(calls[0].options.idempotencyKey).toBeTruthy();
    expect(calls[0].options.signal).toBeInstanceOf(AbortSignal);

    // Settle the stream to clean up.
    calls[0].controller.emitMeta({
      assistantMessageId: 'a-server',
      conversationId: 'c-server',
      model: 'gemini-2.5-flash',
    });
    calls[0].controller.emitChunk('はい');
    calls[0].controller.finish({
      inputTokens: 1,
      outputTokens: 1,
      model: 'gemini-2.5-flash',
      finishReason: 'stop',
    });
    await sendP;
  });
});

describe('chatStore — meta event binding', () => {
  beforeEach(resetStore);

  it('rekeys the assistant placeholder to the server-supplied id', async () => {
    const { client, calls } = makeFakeClient();
    useChatStore.getState().setLLMClient(client);

    const sendP = useChatStore.getState().sendMessage({
      userId: 'u1',
      conversationId: null,
      text: 'hello',
    });
    await new Promise((r) => setTimeout(r, 0));

    const tempId = useChatStore.getState().messages[0].id;
    expect(tempId.length).toBeGreaterThan(0);

    calls[0].controller.emitMeta({
      assistantMessageId: 'server-a-1',
      conversationId: 'server-c-1',
      model: 'gemini-2.5-flash',
    });
    await new Promise((r) => setTimeout(r, 0));

    const bound = useChatStore
      .getState()
      .messages.find((m) => m.role === 'assistant');
    expect(bound?.id).toBe('server-a-1');
    expect(bound?.conversationId).toBe('server-c-1');
    expect(bound?.status).toBe('pending');

    calls[0].controller.finish({
      inputTokens: 1,
      outputTokens: 1,
      model: 'gemini-2.5-flash',
      finishReason: 'stop',
    });
    await sendP;
  });
});

describe('chatStore — chunk + done flow', () => {
  beforeEach(resetStore);

  it('accumulates chunk deltas into the assistant row content', async () => {
    const { client, calls } = makeFakeClient();
    useChatStore.getState().setLLMClient(client);
    const sendP = useChatStore.getState().sendMessage({
      userId: 'u1',
      conversationId: null,
      text: 'q',
    });
    await new Promise((r) => setTimeout(r, 0));
    calls[0].controller.emitMeta({
      assistantMessageId: 'a',
      conversationId: 'c',
      model: 'gemini-2.5-flash',
    });
    await new Promise((r) => setTimeout(r, 0));
    calls[0].controller.emitChunk('Hel');
    calls[0].controller.emitChunk('lo');
    await new Promise((r) => setTimeout(r, 5));
    calls[0].controller.finish({
      inputTokens: 1,
      outputTokens: 2,
      model: 'gemini-2.5-flash',
      finishReason: 'stop',
    });
    await sendP;

    const final = useChatStore
      .getState()
      .messages.find((m) => m.role === 'assistant')!;
    expect(final.content).toBe('Hello');
    expect(final.status).toBe('final');
    expect(final.outputTokens).toBe(2);
  });

  it('bumps userMessagesThisMonth on done', async () => {
    const { client, calls } = makeFakeClient();
    useChatStore.getState().setLLMClient(client);
    const sendP = useChatStore.getState().sendMessage({
      userId: 'u1',
      conversationId: null,
      text: 'q',
    });
    await new Promise((r) => setTimeout(r, 0));
    calls[0].controller.emitMeta({
      assistantMessageId: 'a',
      conversationId: 'c',
      model: 'gemini-2.5-flash',
    });
    calls[0].controller.emitChunk('hi');
    calls[0].controller.finish({
      inputTokens: 1,
      outputTokens: 1,
      model: 'gemini-2.5-flash',
      finishReason: 'stop',
    });
    await sendP;
    expect(useChatStore.getState().userMessagesThisMonth).toBe(1);
  });
});

describe('chatStore — error pathways', () => {
  beforeEach(resetStore);

  it('surfaces AIError when the stream fails mid-flight', async () => {
    const { client, calls } = makeFakeClient();
    useChatStore.getState().setLLMClient(client);
    const sendP = useChatStore.getState().sendMessage({
      userId: 'u1',
      conversationId: null,
      text: 'q',
    });
    await new Promise((r) => setTimeout(r, 0));
    calls[0].controller.emitMeta({
      assistantMessageId: 'a',
      conversationId: 'c',
      model: 'gemini-2.5-flash',
    });
    calls[0].controller.emitChunk('partial');
    await new Promise((r) => setTimeout(r, 5));
    calls[0].controller.fail(
      new AIError('gemini_error', 'モデルが応答しませんでした', 502),
    );
    await expect(sendP).rejects.toBeInstanceOf(AIError);

    const errRow = useChatStore
      .getState()
      .messages.find((m) => m.role === 'assistant')!;
    expect(errRow.status).toBe('error');
    expect(errRow.content).toBe('partial');
    const err = useChatStore.getState().error;
    expect(err?.code).toBe('gemini_error');
  });

  it('flips row to partial + keeps isOffline=false when the stream is aborted (Codex round 1 Important #2 fix)', async () => {
    const { client, calls } = makeFakeClient();
    useChatStore.getState().setLLMClient(client);
    const sendP = useChatStore.getState().sendMessage({
      userId: 'u1',
      conversationId: null,
      text: 'q',
    });
    await new Promise((r) => setTimeout(r, 0));
    calls[0].controller.emitMeta({
      assistantMessageId: 'a',
      conversationId: 'c',
      model: 'gemini-2.5-flash',
    });
    calls[0].controller.emitChunk('halfway');
    await new Promise((r) => setTimeout(r, 5));
    calls[0].controller.fail(
      new AIError('aborted', 'リクエストを中止しました', 0),
    );
    await expect(sendP).rejects.toBeInstanceOf(AIError);

    const row = useChatStore
      .getState()
      .messages.find((m) => m.role === 'assistant')!;
    expect(row.status).toBe('partial');
    expect(row.content).toBe('halfway');
    // User-initiated abort must NOT mark the surface as offline —
    // the send button would otherwise stay disabled for the next
    // turn until the user manually dismissed the banner.
    expect(useChatStore.getState().isOffline).toBe(false);
    // The aborted turn still consumed quota on the server (the
    // EF's ai_usage_logs INSERT happens at STEP 7, before Gemini).
    expect(useChatStore.getState().userMessagesThisMonth).toBe(1);
  });

  it('flips assistant row to error when network_error AIError lands', async () => {
    const { client, calls } = makeFakeClient();
    useChatStore.getState().setLLMClient(client);
    const sendP = useChatStore.getState().sendMessage({
      userId: 'u1',
      conversationId: null,
      text: 'q',
    });
    await new Promise((r) => setTimeout(r, 0));
    calls[0].controller.fail(
      new AIError('network_error', 'ネットワーク接続を確認してください', 0),
    );
    await expect(sendP).rejects.toBeInstanceOf(AIError);
    expect(useChatStore.getState().isOffline).toBe(true);
  });
});

describe('chatStore.abortStream + regenerateMessage', () => {
  beforeEach(resetStore);

  it('abortStream() triggers AbortController.abort()', async () => {
    const { client, calls } = makeFakeClient();
    useChatStore.getState().setLLMClient(client);
    const sendP = useChatStore.getState().sendMessage({
      userId: 'u1',
      conversationId: null,
      text: 'q',
    });
    await new Promise((r) => setTimeout(r, 0));
    const signal = calls[0].options.signal!;
    expect(signal.aborted).toBe(false);
    useChatStore.getState().abortStream();
    expect(signal.aborted).toBe(true);

    // Finish the stream so the awaited promise resolves rather
    // than dangling (the abort signal itself doesn't unblock the
    // fake stream).
    calls[0].controller.fail(
      new AIError('aborted', 'リクエストを中止しました', 0),
    );
    await expect(sendP).rejects.toBeInstanceOf(AIError);
  });

  it('regenerateMessage deletes the prior assistant row + re-runs send with a fresh key', async () => {
    const { client, calls } = makeFakeClient();
    useChatStore.getState().setLLMClient(client);

    // First send + error so the assistant row lands in 'error'.
    const sendP = useChatStore.getState().sendMessage({
      userId: 'u1',
      conversationId: null,
      text: 'q',
    });
    await new Promise((r) => setTimeout(r, 0));
    calls[0].controller.emitMeta({
      assistantMessageId: 'a-1',
      conversationId: 'c-1',
      model: 'gemini-2.5-flash',
    });
    calls[0].controller.fail(
      new AIError('gemini_error', 'failure', 502),
    );
    await expect(sendP).rejects.toBeInstanceOf(AIError);

    const firstKey = calls[0].options.idempotencyKey;

    // Now regenerate.
    const regenP = useChatStore.getState().regenerateMessage({
      userId: 'u1',
      conversationId: 'c-1',
      assistantMessageId: 'a-1',
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(calls).toHaveLength(2);
    const secondKey = calls[1].options.idempotencyKey;
    expect(secondKey).toBeTruthy();
    expect(secondKey).not.toBe(firstKey);

    // The old 'a-1' row was deleted.
    expect(
      useChatStore.getState().messages.find((m) => m.id === 'a-1'),
    ).toBeUndefined();

    calls[1].controller.emitMeta({
      assistantMessageId: 'a-2',
      conversationId: 'c-1',
      model: 'gemini-2.5-flash',
    });
    calls[1].controller.emitChunk('redo');
    calls[1].controller.finish({
      inputTokens: 1,
      outputTokens: 1,
      model: 'gemini-2.5-flash',
      finishReason: 'stop',
    });
    await regenP;

    const redo = useChatStore
      .getState()
      .messages.find((m) => m.id === 'a-2')!;
    expect(redo.status).toBe('final');
    expect(redo.content).toBe('redo');
  });
});

describe('chatStore — new-conversation flow', () => {
  beforeEach(resetStore);

  it('records the server-supplied conversationId + adds it to conversations', async () => {
    const { client, calls } = makeFakeClient();
    useChatStore.getState().setLLMClient(client);

    const sendP = useChatStore.getState().sendMessage({
      userId: 'u1',
      conversationId: null,
      text: 'q',
    });
    await new Promise((r) => setTimeout(r, 0));
    calls[0].controller.emitMeta({
      assistantMessageId: 'a-1',
      conversationId: 'new-server-c-1',
      model: 'gemini-2.5-flash',
    });
    calls[0].controller.emitChunk('ok');
    calls[0].controller.finish({
      inputTokens: 1,
      outputTokens: 1,
      model: 'gemini-2.5-flash',
      finishReason: 'stop',
    });
    const result = await sendP;

    expect(result.conversationId).toBe('new-server-c-1');
    const convs = useChatStore.getState().conversations;
    expect(convs).toHaveLength(1);
    expect(convs[0].id).toBe('new-server-c-1');
    expect(useChatStore.getState().activeConversationId).toBe(
      'new-server-c-1',
    );
  });
});

describe('chatStore — Codex round 1 Important #1 fix (server-authoritative reload)', () => {
  beforeEach(resetStore);

  it('loadConversations pulls from the chatRepository (Supabase sync + local mirror)', async () => {
    const repo = require('../../infra/repositories/chatRepository');
    const syncSpy = jest.spyOn(repo, 'syncConversationsFromSupabase');
    const listSpy = jest.spyOn(repo, 'listConversations').mockResolvedValue([
      {
        id: 'c-srv',
        userId: 'u1',
        title: 'remote',
        model: 'gemini-2.5-flash',
        archivedAt: null,
        createdAt: '2026-05-17T00:00:00Z',
        updatedAt: '2026-05-17T00:00:00Z',
      },
    ]);
    await useChatStore.getState().loadConversations('u1');
    expect(syncSpy).toHaveBeenCalledWith('u1');
    expect(listSpy).toHaveBeenCalled();
    expect(useChatStore.getState().conversations[0]?.id).toBe('c-srv');
    syncSpy.mockRestore();
    listSpy.mockRestore();
  });

  it('loadMessages pulls from the chatRepository (Supabase sync + local mirror)', async () => {
    const repo = require('../../infra/repositories/chatRepository');
    const syncSpy = jest.spyOn(repo, 'syncMessagesFromSupabase');
    const getSpy = jest.spyOn(repo, 'getMessages').mockResolvedValue([
      {
        id: 'm-srv',
        clientTempId: 'm-srv',
        conversationId: 'c-srv',
        role: 'user',
        content: 'remote-q',
        status: 'final',
        model: null,
        inputTokens: null,
        outputTokens: null,
        createdAt: '2026-05-17T00:00:00Z',
      },
    ]);
    await useChatStore.getState().loadMessages('c-srv');
    expect(syncSpy).toHaveBeenCalledWith('c-srv');
    expect(getSpy).toHaveBeenCalledWith('c-srv');
    expect(useChatStore.getState().messages[0]?.id).toBe('m-srv');
    expect(useChatStore.getState().activeConversationId).toBe('c-srv');
    syncSpy.mockRestore();
    getSpy.mockRestore();
  });
});

describe('chatStore — Codex round 1 Important #3 fix (partial/error still consume quota)', () => {
  beforeEach(resetStore);

  it('bumps userMessagesThisMonth when the stream errors mid-flight', async () => {
    const { client, calls } = makeFakeClient();
    useChatStore.getState().setLLMClient(client);
    const sendP = useChatStore.getState().sendMessage({
      userId: 'u1',
      conversationId: null,
      text: 'q',
    });
    await new Promise((r) => setTimeout(r, 0));
    calls[0].controller.emitMeta({
      assistantMessageId: 'a',
      conversationId: 'c',
      model: 'gemini-2.5-flash',
    });
    calls[0].controller.emitChunk('halfway');
    await new Promise((r) => setTimeout(r, 5));
    calls[0].controller.fail(
      new AIError('gemini_error', 'mid-stream failure', 502),
    );
    await expect(sendP).rejects.toBeInstanceOf(AIError);
    // Server's STEP 7 ai_usage_logs INSERT already ran (meta was
    // emitted), so the local quota count must mirror that.
    expect(useChatStore.getState().userMessagesThisMonth).toBe(1);
  });

  it('does NOT bump userMessagesThisMonth on a pre-meta network failure', async () => {
    const { client, calls } = makeFakeClient();
    useChatStore.getState().setLLMClient(client);
    const sendP = useChatStore.getState().sendMessage({
      userId: 'u1',
      conversationId: null,
      text: 'q',
    });
    await new Promise((r) => setTimeout(r, 0));
    // Fail before meta — the server never reached STEP 7, so the
    // EF's ai_usage_logs row was not written.
    calls[0].controller.fail(
      new AIError('network_error', 'no signal', 0),
    );
    await expect(sendP).rejects.toBeInstanceOf(AIError);
    expect(useChatStore.getState().userMessagesThisMonth).toBe(0);
  });
});

describe('chatStore.dismiss* helpers', () => {
  it('dismissError clears error state', () => {
    resetStore();
    useChatStore.setState({
      error: new AIError('internal_error', 'x', 500),
    });
    useChatStore.getState().dismissError();
    expect(useChatStore.getState().error).toBeNull();
  });

  it('dismissOffline clears isOffline state', () => {
    resetStore();
    useChatStore.setState({ isOffline: true });
    useChatStore.getState().dismissOffline();
    expect(useChatStore.getState().isOffline).toBe(false);
  });
});
