// v1.5 Stage 1 Phase 1.2 — local chat types.
//
// SSoT: docs/plans/v1.5_stage_1_ai_chat_epic.md §3 + §5.1 + §5.2.
//
// `LocalChatMessage` mirrors the server's `chat_messages` row
// (excluding server-side bookkeeping columns) plus a `clientTempId`
// field so the optimistic UI can bind a row before the server emits
// the meta event with its real id (§3 send sequence "On meta event").

export type ChatMessageRole = 'user' | 'assistant' | 'system';

// Status enum mirrors the Postgres CHECK constraint at
// supabase/migrations/20260518000000_create_chat_tables.sql.
// Note: 'sending' is a CLIENT-ONLY transient state for an optimistic
// row that has not yet received its meta event. It NEVER leaves the
// device; the server only knows pending / final / partial / error.
export type ChatMessageStatus =
  | 'sending'
  | 'pending'
  | 'final'
  | 'partial'
  | 'error';

export interface LocalChatMessage {
  /** Server id once known; falls back to clientTempId while
   *  optimistic. The UI uses `clientTempId` as the React key so a
   *  swap from temp → server id doesn't unmount the row. */
  id: string;
  clientTempId: string;
  conversationId: string;
  role: ChatMessageRole;
  content: string;
  status: ChatMessageStatus;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** ISO timestamp at write time. Used for the monthly-quota count. */
  createdAt: string;
}

export interface LocalChatConversation {
  id: string;
  userId: string;
  title: string | null;
  model: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
