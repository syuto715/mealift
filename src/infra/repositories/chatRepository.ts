// v1.5 Stage 1 Phase 1.2 — chatRepository.
//
// Read/write helpers over the SQLite v31 read-cache mirrors
// (`chat_conversations_local` + `chat_messages_local`). Per §5.2
// these tables are **read-cache only** — the Supabase chat tables
// are the SSoT and the EF is server-authoritative. The repository
// writes to the local mirror so the UI can:
//   1. render optimistic messages immediately on send,
//   2. survive a force-kill mid-stream (the local row stays in
//      whatever status it last had; next online read reconciles),
//   3. compute the monthly-quota count without a network round-trip.
//
// NO `sync_queue` integration (§5.2). If a stream fails after the
// local write but before the server confirmed the user message, the
// next online conversation read pulls the server's authoritative
// state and overwrites the local row.

import { getDatabase } from '../database/connection';
import { supabase } from '../supabase/client';
import type {
  LocalChatConversation,
  LocalChatMessage,
} from '../../types/chat';

interface ConversationRow {
  id: string;
  user_id: string;
  title: string | null;
  model: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  status: string;
  idempotency_key: string | null;
  created_at: string;
}

function rowToConversation(r: ConversationRow): LocalChatConversation {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    model: r.model,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToMessage(r: MessageRow): LocalChatMessage {
  return {
    id: r.id,
    clientTempId: r.id,
    conversationId: r.conversation_id,
    role: r.role as LocalChatMessage['role'],
    content: r.content,
    status: r.status as LocalChatMessage['status'],
    model: r.model,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    createdAt: r.created_at,
  };
}

export async function listConversations(
  userId: string,
): Promise<LocalChatConversation[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ConversationRow>(
    `SELECT * FROM chat_conversations_local
       WHERE user_id = ? AND archived_at IS NULL
       ORDER BY updated_at DESC`,
    [userId],
  );
  return rows.map(rowToConversation);
}

export async function getMessages(
  conversationId: string,
): Promise<LocalChatMessage[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<MessageRow>(
    `SELECT * FROM chat_messages_local
       WHERE conversation_id = ?
       ORDER BY created_at ASC`,
    [conversationId],
  );
  return rows.map(rowToMessage);
}

export async function upsertConversation(
  conv: LocalChatConversation,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO chat_conversations_local
       (id, user_id, title, model, archived_at, created_at, updated_at, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       model = excluded.model,
       archived_at = excluded.archived_at,
       updated_at = excluded.updated_at,
       cached_at = datetime('now')`,
    [
      conv.id,
      conv.userId,
      conv.title,
      conv.model,
      conv.archivedAt,
      conv.createdAt,
      conv.updatedAt,
    ],
  );
}

export async function upsertMessage(msg: LocalChatMessage): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO chat_messages_local
       (id, conversation_id, role, content, model, input_tokens, output_tokens,
        status, idempotency_key, created_at, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content,
       model = excluded.model,
       input_tokens = excluded.input_tokens,
       output_tokens = excluded.output_tokens,
       status = excluded.status,
       cached_at = datetime('now')`,
    [
      msg.id,
      msg.conversationId,
      msg.role,
      msg.content,
      msg.model,
      msg.inputTokens,
      msg.outputTokens,
      msg.status,
      null,
      msg.createdAt,
    ],
  );
}

export async function deleteMessage(messageId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM chat_messages_local WHERE id = ?`,
    [messageId],
  );
}

/** Re-key a row whose primary key changes from the optimistic temp id
 *  to the server-supplied id (meta event resolution). SQLite doesn't
 *  let us UPDATE the primary key in one statement, so we INSERT a
 *  new row + DELETE the old one transactionally. */
export async function rekeyMessage(
  oldId: string,
  newId: string,
): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO chat_messages_local
         (id, conversation_id, role, content, model, input_tokens, output_tokens,
          status, idempotency_key, created_at, cached_at)
       SELECT ?, conversation_id, role, content, model, input_tokens, output_tokens,
              status, idempotency_key, created_at, datetime('now')
         FROM chat_messages_local
         WHERE id = ?`,
      [newId, oldId],
    );
    await db.runAsync(`DELETE FROM chat_messages_local WHERE id = ?`, [oldId]);
  });
}

/** Pull the user's conversations from Supabase and reconcile the
 *  local mirror to match. §3 Offline behavior + §5.2 read-cache:
 *  the authoritative state lives on Supabase; the local mirror is
 *  a cache the UI reads. Reconciliation has two halves so the
 *  mirror reflects server-side deletes too, not just inserts:
 *
 *    1. Upsert every server row.
 *    2. DELETE any local row whose id is NOT in the server's
 *       returned set (cross-device delete propagation).
 *
 *  Tolerates an offline state by silently no-op'ing — callers
 *  fall back to whatever the mirror already holds. Codex round 1
 *  Important #1 fix + round 2 reconciliation completion. */
export async function syncConversationsFromSupabase(
  userId: string,
): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('id, user_id, title, model, archived_at, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error || !data) return;
  const serverRows = data as ConversationRow[];
  const serverIds = new Set(serverRows.map((r) => r.id));
  for (const r of serverRows) {
    await upsertConversation(rowToConversation(r));
  }
  const db = await getDatabase();
  const localRows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM chat_conversations_local WHERE user_id = ?`,
    [userId],
  );
  for (const row of localRows) {
    if (!serverIds.has(row.id)) {
      // Server-side delete or row aged out of the limit window —
      // prune from the mirror. (The FK cascade also drops the
      // mirrored messages.)
      await db.runAsync(
        `DELETE FROM chat_conversations_local WHERE id = ?`,
        [row.id],
      );
    }
  }
}

/** Pull the messages for a conversation from Supabase and reconcile
 *  the local mirror to match (upsert server rows + delete locals
 *  not present on the server). Codex round 1 Important #1 fix +
 *  round 2 reconciliation completion. */
export async function syncMessagesFromSupabase(
  conversationId: string,
): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('chat_messages')
    .select(
      'id, conversation_id, role, content, model, input_tokens, output_tokens, status, idempotency_key, created_at',
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error || !data) return;
  const serverRows = data as MessageRow[];
  const serverIds = new Set(serverRows.map((r) => r.id));
  for (const r of serverRows) {
    await upsertMessage(rowToMessage(r));
  }
  const db = await getDatabase();
  const localRows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM chat_messages_local WHERE conversation_id = ?`,
    [conversationId],
  );
  for (const row of localRows) {
    if (!serverIds.has(row.id)) {
      await db.runAsync(
        `DELETE FROM chat_messages_local WHERE id = ?`,
        [row.id],
      );
    }
  }
}

/** Count of role='user' messages this user produced in the current UTC
 *  month — mirrors the EF's UTC-monthly quota window. Status filter
 *  excludes 'sending' (transient, not yet confirmed). */
export async function countUserMessagesThisMonth(
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const monthStartUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  ).toISOString();
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) as n
       FROM chat_messages_local m
       INNER JOIN chat_conversations_local c
         ON c.id = m.conversation_id
       WHERE c.user_id = ?
         AND m.role = 'user'
         AND m.status != 'sending'
         AND m.created_at >= ?`,
    [userId, monthStartUtc],
  );
  return row?.n ?? 0;
}
