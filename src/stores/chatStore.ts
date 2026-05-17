// v1.5 Stage 1 Phase 1.2 — chatStore.
//
// SSoT: docs/plans/v1.5_stage_1_ai_chat_epic.md §3 (send / regenerate
// sequence) + §5.1 (status enum) + §5.2 (read-cache only — no
// sync_queue) + §9 (Pro gating: aiCoachChat + monthly limit).
//
// Architectural decisions reflected here:
//
// 1. **2-placeholder optimistic append (user FIRST, assistant
//    SECOND)** (§3 client-side sequence at lines 286-295). The
//    SSoT doc explicitly orders user → assistant on the client.
//    Drafting 100's "race-safe ordering" applies only to the
//    server-side STEP 5 → STEP 6 INSERT order (assistant
//    placeholder carries the partial unique index that closes the
//    duplicate-request window). The client has no equivalent race
//    so the order matches natural turn-flow display.
//
// 2. **clientTempId → server id rekey** (§3 "On meta event"). The
//    optimistic rows carry a `clientTempId` that doubles as the
//    initial primary key. The meta event ships
//    `assistantMessageId` + `conversationId`; we re-key the
//    assistant row from clientTempId → assistantMessageId so
//    subsequent regenerate / abort calls can target it by PK.
//
// 3. **Server-authoritative reconciliation** (§5.2). Local writes
//    are read-cache; if the stream is interrupted, the next online
//    `loadMessages()` pulls the server's state and overwrites.
//
// 4. **Reactive offline detection** (Phase 1.2 scope limit). The
//    repo doesn't include @react-native-community/netinfo; we mark
//    `isOffline = true` ONLY when a send fails with AIError code
//    `network_error`. User-initiated `aborted` is NOT offline —
//    Codex round 1 Important #2 fix. Phase 1.6 polish can layer
//    on a proactive NetInfo listener.

import { create } from 'zustand';
import { router } from 'expo-router';
import {
  countUserMessagesThisMonth,
  deleteMessage,
  getMessages,
  listConversations,
  rekeyMessage,
  syncConversationsFromSupabase,
  syncMessagesFromSupabase,
  upsertConversation,
  upsertMessage,
} from '../infra/repositories/chatRepository';
import { generateId } from '../utils/id';
import type { LLMClient, UserContext } from '../infra/llm/types';
import { GeminiFlashClient } from '../infra/llm/geminiFlashClient';
import { buildUserContext } from '../infra/llm/contextBuilder';
import { AIError } from '../infra/services/aiNutritionService';
import type {
  LocalChatConversation,
  LocalChatMessage,
} from '../types/chat';

interface StreamingState {
  /** Conversation that is currently streaming, or null when idle. */
  conversationId: string | null;
  /** Assistant row id (server id after meta, or clientTempId before). */
  assistantMessageId: string | null;
  abortController: AbortController | null;
}

export interface ChatStoreState {
  conversations: LocalChatConversation[];
  activeConversationId: string | null;
  messages: LocalChatMessage[];
  streamingState: StreamingState;
  error: AIError | null;
  isOffline: boolean;
  userMessagesThisMonth: number;

  // Used by the test suite + by `app/(tabs)/coach/index.tsx`'s
  // composition root to swap in a fake LLM client.
  __llmClient: LLMClient;
  setLLMClient: (client: LLMClient) => void;

  loadConversations: (userId: string) => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  setActiveConversationId: (id: string | null) => void;
  refreshQuotaCount: (userId: string) => Promise<void>;
  /** Send a chat message. When `conversationId` is null the server
   *  creates a new conversation row and the meta event supplies its
   *  id; this method resolves with that id so the caller can
   *  router.replace to /coach/<server-id>. */
  sendMessage: (args: {
    userId: string;
    conversationId: string | null;
    text: string;
  }) => Promise<{ conversationId: string }>;
  regenerateMessage: (args: {
    userId: string;
    conversationId: string;
    assistantMessageId: string;
  }) => Promise<void>;
  abortStream: () => void;
  dismissError: () => void;
  dismissOffline: () => void;
}

const sharedClient: LLMClient = new GeminiFlashClient();

export const useChatStore = create<ChatStoreState>((set, get) => ({
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

  __llmClient: sharedClient,
  setLLMClient: (client) => set({ __llmClient: client }),

  loadConversations: async (userId) => {
    // §3 Offline behavior + §5.2: pull from Supabase (authoritative)
    // and upsert into the local mirror, then read the mirror. The
    // sync helper silently no-ops when offline so the read still
    // returns the last cached state. Codex round 1 Important #1 fix.
    await syncConversationsFromSupabase(userId);
    const rows = await listConversations(userId);
    set({ conversations: rows });
  },

  loadMessages: async (conversationId) => {
    // Same authoritative-pull-then-mirror pattern as loadConversations.
    // Codex round 1 Important #1 fix.
    await syncMessagesFromSupabase(conversationId);
    const rows = await getMessages(conversationId);
    set({ messages: rows, activeConversationId: conversationId });
  },

  setActiveConversationId: (id) => set({ activeConversationId: id }),

  refreshQuotaCount: async (userId) => {
    const n = await countUserMessagesThisMonth(userId);
    set({ userMessagesThisMonth: n });
  },

  sendMessage: async ({ userId, conversationId, text }) => {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new AIError('invalid_request', 'メッセージを入力してください', 400);
    }

    const nowIso = new Date().toISOString();
    const assistantTempId = generateId();
    const userTempId = generateId();
    const idempotencyKey = generateId();

    // Optimistic local rows. Per §3 client-side sequence the USER
    // row goes first (display order; assistant follows). The
    // server's Drafting-100 race-safe ordering (assistant
    // placeholder first to gate the partial unique index) lives in
    // the EF, not here. Conversation id is the server-facing value
    // once known; when conversationId === null we tag the local
    // rows with a `pending:` sentinel that gets rewritten by the
    // meta handler.
    const localConvKey = conversationId ?? `pending:${assistantTempId}`;
    const assistantRow: LocalChatMessage = {
      id: assistantTempId,
      clientTempId: assistantTempId,
      conversationId: localConvKey,
      role: 'assistant',
      content: '',
      status: 'sending',
      model: 'gemini-2.5-flash',
      inputTokens: null,
      outputTokens: null,
      createdAt: nowIso,
    };
    const userRow: LocalChatMessage = {
      id: userTempId,
      clientTempId: userTempId,
      conversationId: localConvKey,
      role: 'user',
      content: trimmed,
      status: 'sending',
      model: null,
      inputTokens: null,
      outputTokens: null,
      createdAt: nowIso,
    };

    set((state) => ({
      // §3 client-side sequence: user first, assistant second.
      // (Server-side STEP 5/6 inverts this to satisfy the partial
      // unique-index race-safety contract — Drafting 100.)
      messages: [...state.messages, userRow, assistantRow],
      error: null,
      isOffline: false,
    }));

    const abortController = new AbortController();
    set((state) => ({
      streamingState: {
        conversationId: state.streamingState.conversationId,
        assistantMessageId: assistantTempId,
        abortController,
      },
    }));

    // Build the message history for the EF — turns in THIS
    // conversation, excluding the just-appended assistant
    // placeholder (it's still empty and shouldn't be replayed
    // back). The optimistic user row IS included so the server
    // sees the latest user turn.
    const priorMessages = get()
      .messages.filter(
        (m) =>
          m.id !== assistantTempId &&
          m.conversationId === localConvKey,
      )
      .map((m) => ({ role: m.role, content: m.content }));

    let context: UserContext;
    try {
      context = await buildUserContext(userId);
    } catch (err) {
      // Treat context failures as a non-fatal error: surface to UI
      // but keep the optimistic rows visible so the user can retry.
      const aiErr =
        err instanceof AIError
          ? err
          : new AIError(
              'internal_error',
              'コンテキストの取得に失敗しました',
              0,
            );
      set({
        error: aiErr,
        streamingState: {
          conversationId: null,
          assistantMessageId: null,
          abortController: null,
        },
        messages: get().messages.map((m) =>
          m.id === assistantTempId || m.id === userTempId
            ? { ...m, status: 'error' as const }
            : m,
        ),
      });
      throw aiErr;
    }

    const stream = get().__llmClient.chat(
      priorMessages
        .filter((m) => m.role !== 'system')
        // Only forward the latest user turn (server prepends its
        // own system prompt + history reconciliation).
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      context,
      { idempotencyKey, signal: abortController.signal },
    );
    // Side-channel done promise: the iterator already throws on
    // failure (and the explicit await stream.done below catches
    // its own rejection), so observe it here too to silence the
    // floating-promise lint when the meta-await catch path early-
    // exits before the for-await loop runs (Phase 1.1 lesson —
    // see geminiFlashClient.ts `iteratorPromise.catch(() => {})`).
    stream.done.catch(() => {});

    // Side-channel: meta event resolves first. We rekey the
    // assistant row from clientTempId → server id and rewrite the
    // local conversation key from `pending:` to the server's
    // conversationId.
    let resolvedConvId: string = conversationId ?? '';
    try {
      const meta = await stream.meta;
      resolvedConvId = meta.conversationId;
      const assistantServerId = meta.assistantMessageId;

      // Persist the conversation row before the message rows so
      // the FK relationship is satisfied locally.
      if (!conversationId) {
        const convRow: LocalChatConversation = {
          id: resolvedConvId,
          userId,
          title: null,
          model: meta.model,
          archivedAt: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        await upsertConversation(convRow);
        set((state) => ({
          conversations: [convRow, ...state.conversations],
          activeConversationId: resolvedConvId,
        }));
      }

      set((state) => ({
        // Touch ONLY the two optimistic rows we just appended.
        // Other messages in this conversation (loaded from the
        // local mirror by loadMessages) keep their existing
        // status — flipping every row to 'final' here would
        // overwrite a prior 'partial' / 'error' from a previous
        // turn the user was about to regenerate.
        messages: state.messages.map((m) => {
          if (m.id === assistantTempId) {
            return {
              ...m,
              id: assistantServerId,
              conversationId: resolvedConvId,
              status: 'pending' as const,
            };
          }
          if (m.id === userTempId) {
            return {
              ...m,
              conversationId: resolvedConvId,
              status: 'final' as const,
            };
          }
          return m;
        }),
        streamingState: {
          conversationId: resolvedConvId,
          assistantMessageId: assistantServerId,
          abortController,
        },
      }));

      // Persist the user row at its temp id (server reads its own
      // chat_messages row; the local mirror just needs SOME id).
      const finalUserRow: LocalChatMessage = {
        ...userRow,
        conversationId: resolvedConvId,
        status: 'final',
      };
      await upsertMessage(finalUserRow);

      // The assistant row's local id was the temp; rekey to the
      // server's value.
      if (assistantServerId !== assistantTempId) {
        // We never persisted the temp-id row to SQLite (we wait for
        // meta before the first write), so we insert directly under
        // the server id.
      }
      const initialAssistantRow: LocalChatMessage = {
        ...assistantRow,
        id: assistantServerId,
        clientTempId: assistantTempId,
        conversationId: resolvedConvId,
        status: 'pending',
        model: meta.model,
      };
      await upsertMessage(initialAssistantRow);
    } catch (err) {
      const aiErr = toAIError(err);
      set({
        error: aiErr,
        // Codex round 1 Important #2 fix — only true network drops
        // mark the surface as offline. `aborted` is a deliberate
        // user-initiated stop, not a connectivity failure; tagging
        // it as offline hard-disabled the next send button until the
        // user manually dismissed the banner.
        isOffline: aiErr.code === 'network_error',
        streamingState: {
          conversationId: null,
          assistantMessageId: null,
          abortController: null,
        },
        messages: get().messages.map((m) =>
          m.id === assistantTempId || m.id === userTempId
            ? {
                ...m,
                status:
                  aiErr.code === 'aborted'
                    ? 'partial'
                    : 'error',
              }
            : m,
        ),
      });
      throw aiErr;
    }

    // Consume the streaming chunks. Each delta is appended to the
    // assistant row's content. We yield to the event loop on each
    // append so React batches re-renders rather than blocking the
    // JS thread on a fast Gemini stream.
    try {
      for await (const delta of stream) {
        if (abortController.signal.aborted) break;
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === get().streamingState.assistantMessageId
              ? { ...m, content: m.content + delta }
              : m,
          ),
        }));
      }
      const done = await stream.done;
      // Final UPDATE of the assistant row: status=final, tokens
      // populated, content frozen.
      const sid = get().streamingState.assistantMessageId!;
      const finalContent =
        get().messages.find((m) => m.id === sid)?.content ?? '';
      const finalRow: LocalChatMessage = {
        ...assistantRow,
        id: sid,
        clientTempId: assistantTempId,
        conversationId: resolvedConvId,
        content: finalContent,
        status: 'final',
        model: done.model,
        inputTokens: done.inputTokens,
        outputTokens: done.outputTokens,
      };
      await upsertMessage(finalRow);
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === sid ? finalRow : m,
        ),
        streamingState: {
          conversationId: null,
          assistantMessageId: null,
          abortController: null,
        },
        userMessagesThisMonth: state.userMessagesThisMonth + 1,
      }));
    } catch (err) {
      const aiErr = toAIError(err);
      const sid = get().streamingState.assistantMessageId;
      set((state) => ({
        error: aiErr.code === 'aborted' ? null : aiErr,
        // Codex round 1 Important #2 fix — only true network drops
        // mark the surface as offline. `aborted` is a deliberate
        // user-initiated stop and must not block the next send.
        isOffline: aiErr.code === 'network_error',
        streamingState: {
          conversationId: null,
          assistantMessageId: null,
          abortController: null,
        },
        messages: state.messages.map((m) =>
          m.id === sid
            ? {
                ...m,
                status: aiErr.code === 'aborted' ? 'partial' : 'error',
              }
            : m,
        ),
        // Codex round 1 Important #3 fix — a partial or errored
        // stream still consumes the EF's monthly quota (the
        // ai_usage_logs INSERT happens at STEP 7, before the
        // Gemini call — see §3 server sequence). The mirror count
        // must mirror that accounting, otherwise the badge under-
        // reports until the next refreshQuotaCount runs.
        userMessagesThisMonth: state.userMessagesThisMonth + 1,
      }));
      // Persist the partial content so a force-kill / relaunch
      // shows what the user already saw on screen.
      if (sid) {
        const partialContent =
          get().messages.find((m) => m.id === sid)?.content ?? '';
        await upsertMessage({
          ...assistantRow,
          id: sid,
          clientTempId: assistantTempId,
          conversationId: resolvedConvId,
          content: partialContent,
          status: aiErr.code === 'aborted' ? 'partial' : 'error',
        });
      }
      throw aiErr;
    }

    return { conversationId: resolvedConvId };
  },

  regenerateMessage: async ({ userId, conversationId, assistantMessageId }) => {
    // §3 regenerate sequence: server-side DELETE of the prior
    // assistant row, then re-run the chat-send sequence with a
    // fresh Idempotency-Key. The client mirrors that by deleting
    // the local row first, then issuing sendMessage with the prior
    // user turn's content.
    const all = get().messages;
    const target = all.find((m) => m.id === assistantMessageId);
    if (!target || target.role !== 'assistant') {
      return;
    }
    // Find the user message immediately preceding (chronologically).
    const idx = all.findIndex((m) => m.id === assistantMessageId);
    const priorUser = all
      .slice(0, idx)
      .reverse()
      .find((m) => m.role === 'user');
    if (!priorUser) {
      return;
    }

    await deleteMessage(assistantMessageId);
    set({
      messages: all.filter((m) => m.id !== assistantMessageId),
    });

    await get().sendMessage({
      userId,
      conversationId,
      text: priorUser.content,
    });
  },

  abortStream: () => {
    const ctrl = get().streamingState.abortController;
    if (ctrl) ctrl.abort();
  },

  dismissError: () => set({ error: null }),
  dismissOffline: () => set({ isOffline: false }),
}));

function toAIError(err: unknown): AIError {
  if (err instanceof AIError) return err;
  if (err instanceof Error) {
    if (err.name === 'AbortError') {
      return new AIError('aborted', 'リクエストを中止しました', 0);
    }
    return new AIError('internal_error', err.message, 0);
  }
  return new AIError('internal_error', '不明なエラー', 0);
}

/** Navigation helper exposed for the screens. Lives here so the
 *  send → meta → router.replace flow can be tested as one unit
 *  in `__tests__/chatStore.test.ts` (router is jest.mock'd). */
export async function sendMessageAndRoute(args: {
  userId: string;
  conversationId: string | null;
  text: string;
}): Promise<void> {
  const wasNew = args.conversationId === null;
  const result = await useChatStore.getState().sendMessage(args);
  if (wasNew && result.conversationId) {
    router.replace({
      pathname: '/(tabs)/coach/[id]',
      params: { id: result.conversationId },
    });
  }
}
