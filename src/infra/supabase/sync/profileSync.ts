import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { SyncQueueRow } from '../../repositories/syncRepository';
import type { ResourceSyncModule } from './syncOrchestrator';
import {
  applyServerDeletion,
  boolToInt,
  fetchWatermarkBatch,
  getCurrentUserId,
  intToBool,
  upsertWithBackoff,
} from './syncHelpers';

// profileSync — proof-of-pattern resource sync (Phase 5-A).
//
// profile is special among the synced resources:
//   - 1:1 with the auth user (PRIMARY KEY = auth.uid()), no separate
//     user_id column. The id IS the user identity.
//   - claimLocalDataForUser (Phase 4) has already remapped the local
//     profile.id to auth.uid() before this module ever runs. So push
//     can rely on local.id === userId.
//   - The local schema has supabase_uid column (from v1, used for
//     "is this profile claimed?" detection) that doesn't exist on the
//     server side. Push skips it; pull populates it from the server's id.
//
// Push direction:
//   - Read the queued row's payload (= the local profile snapshot at
//     enqueue time).
//   - Convert SQLite-shaped fields (INTEGER booleans, TEXT timestamps)
//     to Postgres types.
//   - Upsert against public.profiles by `id`.
//
// Pull direction:
//   - SELECT WHERE id = auth.uid() AND updated_at > watermark.
//   - Server may include columns the local schema doesn't have (plan,
//     subscription_status, etc) — they're ignored on the local upsert.
//   - Tombstone (deleted_at != null) → hard delete the local profile
//     row (rare edge case — typically the user's account is gone).

const SERVER_TABLE = 'profiles';
const LOCAL_TABLE = 'profiles';

// Local shape of the profile row, after the queued payload is parsed.
// Mirrors ProfileRow in profileRepository.ts (the snake_case form).
interface LocalProfilePayload {
  id?: string;
  display_name?: string;
  gender?: string;
  birth_year?: number;
  height_cm?: number;
  current_weight_kg?: number;
  target_weight_kg?: number | null;
  target_body_fat_pct?: number | null;
  goal_type?: string;
  activity_level?: string;
  training_days_per_week?: number;
  target_date?: string | null;
  equipment?: string;
  target_calories?: number | null;
  target_protein_g?: number | null;
  target_fat_g?: number | null;
  target_carb_g?: number | null;
  onboarding_completed?: number | boolean;
  adaptive_goal_enabled?: number | boolean;
  adaptive_goal_sensitivity?: string;
  adaptive_goal_last_shown_at?: string | null;
  daily_water_target_ml?: number;
  onboarding_version?: number;
  trial_started_at?: string | null;
  plan_billing_cycle?: string | null;
  plan_expires_at?: string | null;
  // Build 15 / Feature 3 — submission push notifications opt-out.
  // SQLite stores 0/1, server stores boolean.
  notifications_submission_enabled?: number | boolean;
}

// Server row shape — Postgres types as JSON-serialized over the wire.
interface ServerProfileRow {
  id: string;
  display_name: string | null;
  gender: string | null;
  birth_year: number | null;
  height_cm: number | null;
  current_weight_kg: number | null;
  target_weight_kg: number | null;
  target_body_fat_pct: number | null;
  goal_type: string | null;
  activity_level: string | null;
  training_days_per_week: number | null;
  target_date: string | null;
  equipment: string | null;
  target_calories: number | null;
  target_protein_g: number | null;
  target_fat_g: number | null;
  target_carb_g: number | null;
  onboarding_completed: boolean;
  adaptive_goal_enabled: boolean;
  adaptive_goal_sensitivity: string;
  adaptive_goal_last_shown_at: string | null;
  daily_water_target_ml: number;
  onboarding_version: number;
  trial_started_at: string | null;
  plan_billing_cycle: string | null;
  plan_expires_at: string | null;
  notifications_submission_enabled: boolean;
  updated_at: string;
  deleted_at: string | null;
}

function toServerPayload(
  local: LocalProfilePayload,
  userId: string,
): Record<string, unknown> {
  return {
    id: userId,
    display_name: local.display_name ?? '',
    gender: local.gender ?? null,
    birth_year: local.birth_year ?? null,
    height_cm: local.height_cm ?? null,
    current_weight_kg: local.current_weight_kg ?? null,
    target_weight_kg: local.target_weight_kg ?? null,
    target_body_fat_pct: local.target_body_fat_pct ?? null,
    goal_type: local.goal_type ?? null,
    activity_level: local.activity_level ?? null,
    training_days_per_week: local.training_days_per_week ?? 3,
    target_date: local.target_date ?? null,
    equipment: local.equipment ?? null,
    target_calories: local.target_calories ?? null,
    target_protein_g: local.target_protein_g ?? null,
    target_fat_g: local.target_fat_g ?? null,
    target_carb_g: local.target_carb_g ?? null,
    onboarding_completed: intToBool(local.onboarding_completed),
    adaptive_goal_enabled: intToBool(local.adaptive_goal_enabled),
    adaptive_goal_sensitivity: local.adaptive_goal_sensitivity ?? 'standard',
    adaptive_goal_last_shown_at: local.adaptive_goal_last_shown_at ?? null,
    daily_water_target_ml: local.daily_water_target_ml ?? 2500,
    onboarding_version: local.onboarding_version ?? 1,
    trial_started_at: local.trial_started_at ?? null,
    plan_billing_cycle: local.plan_billing_cycle ?? null,
    plan_expires_at: local.plan_expires_at ?? null,
    notifications_submission_enabled:
      local.notifications_submission_enabled === undefined
        ? true
        : intToBool(local.notifications_submission_enabled),
  };
}

async function applyServerProfile(
  db: SQLiteDatabase,
  server: ServerProfileRow,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO profiles (
       id, supabase_uid, display_name, gender, birth_year,
       height_cm, current_weight_kg, target_weight_kg, target_body_fat_pct,
       goal_type, activity_level, training_days_per_week, target_date,
       equipment, target_calories, target_protein_g, target_fat_g, target_carb_g,
       onboarding_completed, adaptive_goal_enabled, adaptive_goal_sensitivity,
       adaptive_goal_last_shown_at, daily_water_target_ml, onboarding_version,
       trial_started_at, plan_billing_cycle, plan_expires_at,
       notifications_submission_enabled,
       updated_at, synced_at
     ) VALUES (
       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
     )
     ON CONFLICT(id) DO UPDATE SET
       supabase_uid = excluded.supabase_uid,
       display_name = excluded.display_name,
       gender = excluded.gender,
       birth_year = excluded.birth_year,
       height_cm = excluded.height_cm,
       current_weight_kg = excluded.current_weight_kg,
       target_weight_kg = excluded.target_weight_kg,
       target_body_fat_pct = excluded.target_body_fat_pct,
       goal_type = excluded.goal_type,
       activity_level = excluded.activity_level,
       training_days_per_week = excluded.training_days_per_week,
       target_date = excluded.target_date,
       equipment = excluded.equipment,
       target_calories = excluded.target_calories,
       target_protein_g = excluded.target_protein_g,
       target_fat_g = excluded.target_fat_g,
       target_carb_g = excluded.target_carb_g,
       onboarding_completed = excluded.onboarding_completed,
       adaptive_goal_enabled = excluded.adaptive_goal_enabled,
       adaptive_goal_sensitivity = excluded.adaptive_goal_sensitivity,
       adaptive_goal_last_shown_at = excluded.adaptive_goal_last_shown_at,
       daily_water_target_ml = excluded.daily_water_target_ml,
       onboarding_version = excluded.onboarding_version,
       trial_started_at = excluded.trial_started_at,
       plan_billing_cycle = excluded.plan_billing_cycle,
       plan_expires_at = excluded.plan_expires_at,
       notifications_submission_enabled = excluded.notifications_submission_enabled,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      server.id,
      server.id, // supabase_uid mirrors id (= auth.uid())
      server.display_name ?? '',
      server.gender ?? null,
      server.birth_year ?? null,
      server.height_cm ?? null,
      server.current_weight_kg ?? null,
      server.target_weight_kg ?? null,
      server.target_body_fat_pct ?? null,
      server.goal_type ?? null,
      server.activity_level ?? null,
      server.training_days_per_week ?? 3,
      server.target_date ?? null,
      server.equipment ?? null,
      server.target_calories ?? null,
      server.target_protein_g ?? null,
      server.target_fat_g ?? null,
      server.target_carb_g ?? null,
      boolToInt(server.onboarding_completed),
      boolToInt(server.adaptive_goal_enabled),
      server.adaptive_goal_sensitivity ?? 'standard',
      server.adaptive_goal_last_shown_at ?? null,
      server.daily_water_target_ml ?? 2500,
      server.onboarding_version ?? 1,
      server.trial_started_at ?? null,
      server.plan_billing_cycle ?? null,
      server.plan_expires_at ?? null,
      // Default to true if missing on server (backfill safety for
      // pre-build-15 rows that may exist without the column populated).
      boolToInt(server.notifications_submission_enabled ?? true),
      server.updated_at,
    ],
  );
}

export const profileSync: ResourceSyncModule = {
  localTableName: LOCAL_TABLE,
  serverTableName: SERVER_TABLE,

  async pushOne(
    client: SupabaseClient,
    _db: SQLiteDatabase,
    queueRow: SyncQueueRow,
  ): Promise<void> {
    const userId = await getCurrentUserId(client);
    const local = JSON.parse(queueRow.payload) as LocalProfilePayload;

    if (queueRow.operation === 'DELETE') {
      // Profile delete is rare (account deletion). Soft-delete server-side.
      await upsertWithBackoff(client, SERVER_TABLE, {
        id: userId,
        deleted_at: new Date().toISOString(),
      });
      return;
    }

    const payload = toServerPayload(local, userId);
    await upsertWithBackoff(client, SERVER_TABLE, payload);
  },

  async pullBatch(
    client: SupabaseClient,
    db: SQLiteDatabase,
    watermark: string,
  ): Promise<{ pulled: number; newWatermark: string | null }> {
    const userId = await getCurrentUserId(client);

    // profile is 1:1 with the user; no need for a list query. Get the
    // single row by id and check its updated_at against the watermark.
    const { data, error } = await client
      .from(SERVER_TABLE)
      .select('*')
      .eq('id', userId)
      .gt('updated_at', watermark)
      .limit(1);

    if (error) {
      throw new Error(`profile pull failed: ${error.message}`);
    }
    if (!data || data.length === 0) {
      return { pulled: 0, newWatermark: null };
    }

    const row = data[0] as ServerProfileRow;
    if (row.deleted_at !== null) {
      await applyServerDeletion(db, LOCAL_TABLE, row.id);
    } else {
      await applyServerProfile(db, row);
    }

    return { pulled: 1, newWatermark: row.updated_at };
  },
};

// Exports for shared-helper usage above. Both kept for fetchWatermarkBatch
// future use even though profileSync uses a 1-row variant directly.
export { fetchWatermarkBatch, getCurrentUserId };
