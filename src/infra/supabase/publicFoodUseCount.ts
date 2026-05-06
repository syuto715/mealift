import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from './client';

// publicFoodUseCount — Build 15 / Feature 3 prerequisite client side.
//
// Bumps `public_foods.use_count` by 1 via the
// `increment_public_food_use_count(food_id uuid)` RPC (Supabase migration
// 20260507000001_use_count_rpc.sql). Caller invokes this once per
// meal-log-item INSERT that references a foodId; the RPC itself
// short-circuits to 0 if the food_id doesn't exist or isn't approved,
// so it's safe to call indiscriminately from any meal-log path.
//
// Failure model: fire-and-forget. use_count is a soft metric — a
// transient network failure produces a slightly-low count for that
// food, which has no correctness impact (the meal log itself is
// already saved locally and will sync via the cloud-sync layer
// regardless). Logging the local error is dev-only so production
// stays quiet.
//
// IMPORTANT: do NOT call this from the server-pull path
// (mealLogItemSync.applyServerRow) — bumping use_count on a row
// pulled from the server would double-count the original device's
// bump. This module is exclusively for the client-driven INSERT
// path.

export function bumpPublicFoodUseCount(
  foodId: string | null | undefined,
  client: SupabaseClient | null = defaultSupabase,
): void {
  if (!foodId || !client) return;
  // supabase-js's RPC call returns a PostgrestFilterBuilder (thenable)
  // not a Promise, so .catch isn't directly available. Wrap in an async
  // IIFE to make the fire-and-forget pattern explicit and to give the
  // try/catch a real Error boundary.
  void (async () => {
    try {
      const { error } = await client.rpc('increment_public_food_use_count', {
        food_id: foodId,
      });
      if (error && typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[use_count RPC] failed:', error);
      }
    } catch (error) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[use_count RPC] threw:', error);
      }
    }
  })();
}
