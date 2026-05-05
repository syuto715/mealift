import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

// Shared utilities for the per-resource sync modules. All modules
// import from here; centralizing the retry/backoff and auth lookup
// keeps the per-resource files focused on column mapping and SQL.
//
// Pattern matches submissionSync.ts (Sprint 4) — the same shape
// is replicated here so the cloud-sync layer's behavior is uniform
// across every user-private resource.

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// Auth — getCurrentUserId
// ---------------------------------------------------------------------------

// Returns auth.uid() for the current Supabase session. Throws when
// no session exists; callers must short-circuit BEFORE calling this
// (the orchestrator already does so via a session check).
export async function getCurrentUserId(
  client: SupabaseClient,
): Promise<string> {
  const session = (await client.auth.getSession()).data.session;
  if (!session) {
    throw new Error('not authenticated');
  }
  return session.user.id;
}

// ---------------------------------------------------------------------------
// Rate-limit aware upsert
// ---------------------------------------------------------------------------

interface RemoteError {
  status?: number;
  message?: string;
}

function isRateLimited(err: RemoteError | null | undefined): boolean {
  if (!err) return false;
  if (err.status === 429) return true;
  return /\b(429|rate.?limit|too.?many)\b/i.test(err.message ?? '');
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Per-row upsert with exponential backoff on 429. Throws on terminal
// failure; the orchestrator catches and routes through markFailed
// (which counts retries and dead-letters the row after MAX_RETRIES).
//
// onConflict defaults to 'id' since every server-side user-private
// table has uuid PRIMARY KEY = client-generated row id.
export async function upsertWithBackoff(
  client: SupabaseClient,
  tableName: string,
  payload: Record<string, unknown>,
  onConflict: string = 'id',
): Promise<void> {
  for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
    const { error } = await client.from(tableName).upsert(payload, {
      onConflict,
    });
    if (!error) return;
    if (!isRateLimited(error)) {
      throw new Error(
        `${tableName} upsert failed: ${error.message ?? 'unknown error'}`,
      );
    }
    if (attempt + 1 < RETRY_MAX_ATTEMPTS) {
      await delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
    }
  }
  throw new Error(
    `${tableName} upsert: rate-limited after ${RETRY_MAX_ATTEMPTS} retries`,
  );
}

// ---------------------------------------------------------------------------
// Local-side deletion when a server tombstone arrives
// ---------------------------------------------------------------------------

// When pullBatch receives a row with deleted_at != null, the local
// row should be hard-deleted (per design Part 2-4 sign-off Option α).
// Per-resource modules call this from inside their pullBatch loop.
//
// Caveat: cascading children are NOT auto-deleted here. The parent's
// pull tombstone is independent of children's pull tombstones — the
// server side propagates each one through its own table's stream, so
// the orchestrator picks them up in dependency order without needing
// a recursive delete here.
export async function applyServerDeletion(
  db: SQLiteDatabase,
  localTableName: string,
  recordId: string,
): Promise<void> {
  await db.runAsync(`DELETE FROM ${localTableName} WHERE id = ?`, [
    recordId,
  ]);
}

// ---------------------------------------------------------------------------
// Watermark batch fetch — generic shape for resources keyed on user_id
// ---------------------------------------------------------------------------

// Fetches up to `limit` rows from `serverTableName` where user_id matches
// and updated_at > watermark. Caller filters / maps the results.
export async function fetchWatermarkBatch<T>(
  client: SupabaseClient,
  serverTableName: string,
  userId: string,
  watermark: string,
  limit: number,
  selectClause: string = '*',
): Promise<T[]> {
  const { data, error } = await client
    .from(serverTableName)
    .select(selectClause)
    .eq('user_id', userId)
    .gt('updated_at', watermark)
    .order('updated_at', { ascending: true })
    .limit(limit);
  if (error) {
    throw new Error(
      `${serverTableName} pull failed: ${error.message ?? 'unknown error'}`,
    );
  }
  return (data ?? []) as T[];
}

// ---------------------------------------------------------------------------
// Helpers for column type conversion
// ---------------------------------------------------------------------------

// SQLite stores booleans as INTEGER 0/1; Postgres uses real boolean.
export function intToBool(v: unknown): boolean {
  return v === 1 || v === '1' || v === true;
}

export function boolToInt(v: unknown): number {
  return v === true || v === 1 ? 1 : 0;
}

// SQLite ISO datetime strings ('YYYY-MM-DD HH:MM:SS' or 'YYYY-MM-DDTHH:MM:SSZ')
// → Postgres timestamptz accepts both forms; pass through as-is.
// SQLite ISO date strings ('YYYY-MM-DD') → Postgres date column accepts
// the same form; pass through as-is.
//
// These two are listed as utilities for the per-resource modules to
// reach for if and only if they need explicit conversion. Most
// columns can be passed through unchanged.
