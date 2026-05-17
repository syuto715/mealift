import type * as SQLite from 'expo-sqlite';

// v31: v1.5 Stage 1 Phase 1.1 — chat-tab read-cache mirrors +
// profiles.timezone column.
//
// Architectural SSoT:
//   - docs/plans/v1.5_stage_1_ai_chat_epic.md §5.1 (chat_messages
//     status enum incl. 'pending' + idempotency_key partial unique
//     index)
//   - §5.1.2 (profiles.timezone ALTER, S1 resolution)
//   - §5.2 (read-cache only, NO sync_queue integration)
//
// Read-cache-only model (NewI2 + §5.2):
//   - chat_conversations_local + chat_messages_local mirror the
//     server's authoritative state for offline-read of recent
//     conversations.
//   - The send path requires online (the EF is server-authoritative
//     for chat; cross-device history is reconciled on next read).
//   - NO sync_queue integration. The `sync_queue` pattern is for
//     write-out backlog; chat is online-required, so no backlog
//     is needed.
//
// CHECK constraints intentionally OMITTED on the SQLite side
// (matches the v26 / v30 convention): Postgres carries the
// status / role / source_type CHECKs; the client trusts the
// server-side guarantees and uses TypeScript unions for app-level
// type safety. SQLite ALTER TABLE ADD COLUMN with NOT NULL DEFAULT
// is supported and is used for profiles.timezone.
//
// Idempotency: every CREATE / ALTER guarded with IF NOT EXISTS or
// the addColumnIfMissing pattern, so re-running on a partially-
// applied DB is safe.

interface ColumnInfo {
  name: string;
}

async function getExistingColumns(
  db: SQLite.SQLiteDatabase,
  table: string,
): Promise<Set<string>> {
  const rows = await db.getAllAsync<ColumnInfo>(
    `PRAGMA table_info(${table});`,
  );
  return new Set(rows.map((c) => c.name));
}

async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  table: string,
  existing: Set<string>,
  column: string,
  definition: string,
): Promise<void> {
  if (existing.has(column)) return;
  try {
    await db.execAsync(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`,
    );
  } catch (err) {
    // Same swallow convention as v30 — only "duplicate column"
    // races are safe to ignore. Every other failure must propagate
    // so PRAGMA user_version doesn't advance on a partial migration.
    const msg = String((err as { message?: unknown })?.message ?? err);
    if (/duplicate column/i.test(msg)) return;
    throw err;
  }
}

export async function migrateV31(db: SQLite.SQLiteDatabase): Promise<void> {
  // -------------------------------------------------------------------
  // Section 1 — profiles.timezone (S1 resolution, §5.1.2)
  // -------------------------------------------------------------------
  // The server-side migration adds `profiles.timezone text not null
  // default 'Asia/Tokyo'`; the local mirror keeps the same shape so
  // sync-down doesn't fail with a column mismatch. Default
  // 'Asia/Tokyo' matches the v1.4 user base; future settings UI
  // (Phase 1.6 polish) lets the user change it.
  const profileCols = await getExistingColumns(db, 'profiles');
  await addColumnIfMissing(
    db,
    'profiles',
    profileCols,
    'timezone',
    "TEXT NOT NULL DEFAULT 'Asia/Tokyo'",
  );

  // -------------------------------------------------------------------
  // Section 2 — chat_conversations_local (read-cache mirror, §5.2)
  // -------------------------------------------------------------------
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS chat_conversations_local (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT,
      model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      cached_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chat_conversations_local_user
      ON chat_conversations_local(user_id, updated_at DESC);
  `);

  // -------------------------------------------------------------------
  // Section 3 — chat_messages_local (read-cache mirror, §5.1 enum)
  // -------------------------------------------------------------------
  // status enum: pending / final / partial / error (matches server).
  // idempotency_key column kept on the local mirror so the cleanup-
  // job's NULL transition is visible to the client cache as well —
  // an idempotency replay observed by the cache stays consistent.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS chat_messages_local (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      model TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      idempotency_key TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      cached_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id)
        REFERENCES chat_conversations_local(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_local_conversation
      ON chat_messages_local(conversation_id, created_at);
  `);
}
