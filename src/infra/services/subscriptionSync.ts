import { supabase, isSupabaseConfigured } from '../supabase/client';

// v1.6.0 Sprint 1b — client bridge to the server-source-of-truth subscription
// EFs (C-1). The client NO LONGER writes plan / subscription_status /
// plan_expires_at / trial_started_at to Supabase directly; the EFs own those
// columns. These helpers invoke the EFs with the user's JWT.

// Marks "this client build removed the subscription columns from the
// profileSync push payload". The step-B column-lock migration is gated on
// every active profile reporting >= this value (see the step-B migration
// header SQL). Bump ONLY if the payload contract changes again.
export const SUBSCRIPTION_PAYLOAD_SCHEMA = 2;

// Foreground reconciles can fire often; throttle to avoid hammering the EF.
const RECONCILE_MIN_INTERVAL_MS = 60_000;
let lastReconcileMs = 0;

// Self-heal: ask the server to re-derive the subscription from RevenueCat's
// REST snapshot. Fire-and-forget; never throws (entitlement falls back to the
// last server state on failure). `force` bypasses the throttle (use right
// after a purchase/restore where freshness matters).
export async function reconcileSubscription(
  options: { force?: boolean } = {},
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const now = Date.now();
  if (!options.force && now - lastReconcileMs < RECONCILE_MIN_INTERVAL_MS) {
    return;
  }
  lastReconcileMs = now;
  try {
    await supabase.functions.invoke('sync-subscription', { body: {} });
  } catch {
    // Non-fatal — webhook + next reconcile recover.
  }
}

// Server-authoritative single-use trial start. Returns the resulting
// trial_started_at (the freshly-set value, or the existing one if the trial
// was already used), or null on failure.
export async function startTrialRemote(): Promise<{
  started: boolean;
  trialStartedAt: string | null;
} | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('start-trial', {
      body: {},
    });
    if (error || !data) return null;
    const d = data as { started?: boolean; trial_started_at?: string | null };
    return {
      started: Boolean(d.started),
      trialStartedAt: d.trial_started_at ?? null,
    };
  } catch {
    return null;
  }
}

// Records the client build's payload-schema marker on the server (non-
// subscription column → stays writable after the column locks). Used to
// measure the step-B floor. Fire-and-forget.
export async function markAppVersionSeen(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;
    await supabase
      .from('profiles')
      .update({ last_seen_app_version: SUBSCRIPTION_PAYLOAD_SCHEMA })
      .eq('id', userId);
  } catch {
    // Non-fatal.
  }
}
