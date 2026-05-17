// v1.5 Stage 1 Phase 1.4 — coachAdviceStore.
//
// SSoT: docs/plans/v1.5_stage_1_ai_chat_epic.md §3 surface ④
// (lazy on-mount fetch) + §5.2 (read-cache mirror, no
// sync_queue) + §9 (tier gating).
//
// State shape: a Map keyed by `${userId}:${scope}:${periodStart}`
// so the routine + nutrition screens can lazy-fetch in parallel
// without stomping on each other AND so a same-process account
// switch (User A → User B) never lets A's cached row render on
// B's screen (Codex round 1 Critical — cross-account leak fix).
// Each cache write also lays down a `${userId}:${scope}:latest`
// pointer for fast "render the freshest row" reads.
//
// Authority: the server response is the source of truth. The local
// SQLite mirror is updated AFTER the EF returns; the in-memory
// Zustand cache mirrors the mirror.

import { create } from 'zustand';
import {
  getAdviceByBucket,
  listAdviceByScope,
  syncAdviceFromSupabase,
  upsertAdvice,
} from '../infra/repositories/coachAdviceRepository';
import {
  fetchCoachAdvice,
  type CoachAdviceResponse,
} from '../infra/llm/coachAdviceClient';
import { generateId } from '../utils/id';
import { AIError } from '../infra/services/aiNutritionService';
import type {
  CoachAdviceScope,
  LocalCoachAdvice,
} from '../types/coachAdvice';

export interface AdviceState {
  /** Reactive cache. Key = `${userId}:${scope}:${periodStart}` for
   *  rows + `${userId}:${scope}:latest` for the freshest of that
   *  scope. The userId prefix guards against cross-account leaks
   *  on same-process account switches (Codex round 1 Critical
   *  fix). */
  advices: Record<string, LocalCoachAdvice>;
  loadingScopes: Set<CoachAdviceScope>;
  error: AIError | null;

  loadFromCache: (userId: string, scope: CoachAdviceScope) => Promise<void>;
  fetchAdvice: (args: {
    userId: string;
    profileId: string;
    scope: CoachAdviceScope;
  }) => Promise<CoachAdviceResponse | null>;
  dismissError: () => void;
  /** Belt-and-suspenders teardown for account switches — clears
   *  every cached advice + in-flight loading flag. Call from
   *  `authStore.signOut` or equivalent. */
  reset: () => void;
}

export function adviceBucketKey(
  userId: string,
  scope: CoachAdviceScope,
  periodStart: string,
): string {
  return `${userId}:${scope}:${periodStart}`;
}

export function adviceLatestKey(
  userId: string,
  scope: CoachAdviceScope,
): string {
  return `${userId}:${scope}:latest`;
}

export const useCoachAdviceStore = create<AdviceState>((set, get) => ({
  advices: {},
  loadingScopes: new Set(),
  error: null,

  loadFromCache: async (userId, scope) => {
    // Authoritative-pull-then-mirror, mirroring Phase 1.2
    // chatRepository's pattern (Codex round 1 Important #1 fix).
    await syncAdviceFromSupabase(userId, scope);
    const rows = await listAdviceByScope(userId, scope);
    if (rows.length === 0) {
      // No rows for THIS user — wipe any keys that share the user
      // prefix so a previous "no rows" state doesn't linger as a
      // false negative (the cache is the working set, not a fact
      // table; an empty pull means "nothing to render right now").
      set((state) => {
        const prefix = `${userId}:${scope}:`;
        const next: Record<string, LocalCoachAdvice> = {};
        for (const [k, v] of Object.entries(state.advices)) {
          if (!k.startsWith(prefix)) next[k] = v;
        }
        return { advices: next };
      });
      return;
    }
    const updates: Record<string, LocalCoachAdvice> = {};
    for (const r of rows) {
      updates[adviceBucketKey(userId, scope, r.periodStart)] = r;
    }
    updates[adviceLatestKey(userId, scope)] = rows[0];
    set((state) => ({
      advices: { ...state.advices, ...updates },
    }));
  },

  fetchAdvice: async ({ userId, profileId, scope }) => {
    // Loading guard — multiple screens may mount in parallel
    // (training + nutrition) and ask for the same scope. The lock
    // is per-scope to avoid double-spending quota on
    // simultaneously-mounted screens.
    if (get().loadingScopes.has(scope)) return null;
    set((state) => {
      const next = new Set(state.loadingScopes);
      next.add(scope);
      return { loadingScopes: next, error: null };
    });

    // No client-side freshness short-circuit (Codex round 1
    // Important #2 fix — earlier compared `latest.periodStart`
    // against the UTC date, which mismatches the profile-tz bucket
    // the EF computes). The EF's STEP 6 freshness lookup returns
    // the cached row WITHOUT burning quota, so the extra round-trip
    // is cheap and the periodStart truth stays server-side.
    try {
      const idempotencyKey = generateId();
      const response = await fetchCoachAdvice({
        profileId,
        scope,
        idempotencyKey,
      });

      const localRow: LocalCoachAdvice = {
        id: response.id,
        userId,
        scope: response.scope,
        periodStart: response.periodStart,
        content: response.content,
        generatedAt: response.generatedAt,
      };
      await upsertAdvice(localRow);
      set((state) => ({
        advices: {
          ...state.advices,
          [adviceBucketKey(userId, scope, response.periodStart)]: localRow,
          [adviceLatestKey(userId, scope)]: localRow,
        },
      }));
      return response;
    } catch (err) {
      const aiErr =
        err instanceof AIError
          ? err
          : new AIError(
              'internal_error',
              err instanceof Error ? err.message : '不明なエラー',
              0,
            );
      set({ error: aiErr });
      // Compensation depth (Drafting 103): if a previously cached
      // row exists for this scope, leave it alone — surface the
      // error via state.error but don't wipe the working cache.
      // The retry button in AdviceCard re-issues fetchAdvice.
      return null;
    } finally {
      set((state) => {
        const next = new Set(state.loadingScopes);
        next.delete(scope);
        return { loadingScopes: next };
      });
    }
  },

  dismissError: () => set({ error: null }),

  reset: () =>
    set({
      advices: {},
      loadingScopes: new Set(),
      error: null,
    }),
}));

/** Returns the freshest cached row for the given user / scope, or
 *  null. Doesn't trigger a network call — use fetchAdvice() for
 *  that. */
export function selectLatestAdvice(
  state: AdviceState,
  userId: string,
  scope: CoachAdviceScope,
): LocalCoachAdvice | null {
  return state.advices[adviceLatestKey(userId, scope)] ?? null;
}

/** Read the cache by an explicit bucket key. */
export function selectAdviceByBucket(
  state: AdviceState,
  userId: string,
  scope: CoachAdviceScope,
  periodStart: string,
): LocalCoachAdvice | null {
  return state.advices[adviceBucketKey(userId, scope, periodStart)] ?? null;
}

/** Direct SQLite lookup (bypasses Zustand). For tests + the
 *  AdviceCard's initial render before the store has hydrated. */
export async function findCachedAdvice(
  userId: string,
  scope: CoachAdviceScope,
  periodStart: string,
): Promise<LocalCoachAdvice | null> {
  return getAdviceByBucket(userId, scope, periodStart);
}
