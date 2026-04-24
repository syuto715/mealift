import { supabase, isSupabaseConfigured } from '../supabase/client';
import type { SubscriptionPlan } from './revenueCatService';

// Writes the authenticated user's plan to the Supabase `profiles` row.
// Called after a successful RevenueCat purchase / restore so server-side
// gating (edge functions, AI quotas) sees the updated tier. No-op when the
// user is in local-only mode — applyCustomerInfoToProfile handles the local
// SQLite + Zustand updates separately.
export async function updateUserPlan(plan: SubscriptionPlan): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return;
  await supabase
    .from('profiles')
    .update({
      plan,
      subscription_updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}
