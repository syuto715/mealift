// v1.5 Stage 1 Phase 1.5 — routineGenStore.
//
// SSoT: docs/plans/v1.5_stage_1_ai_chat_epic.md §3 surface ③ + §9
// + Drafting 106 (userId-scoped cache + logout reset).
//
// Note: the original §5.2 I2 intent had routine_generations flow
// through `sync_queue` (local-authoritative drafts surviving
// force-kill until apply), but Phase 1.5 implementation deferred
// the sync_queue resource module (no orchestrator support) and
// switched to a server-authoritative model — apply / discard
// write to Supabase directly via supabase-js; this store mirrors
// the result locally in SQLite v33 for read. See §5.2 Phase 1.5.1
// sync note in the epic doc + Drafting 107 (doc-vs-implementation
// reality note pattern) for the full rationale + v1.5+ defer plan.
//
// Cache shape: drafts indexed by `${userId}:${generationId}` so a
// same-process account switch can't surface User A's draft to User
// B (Drafting 106). The latest non-applied draft (per user) is
// surfaced via the `${userId}:current` pointer.

import { create } from 'zustand';
import * as workoutRepo from '../infra/repositories/workoutRepository';
import {
  getGenerationById,
  listDraftsByUser,
  syncGenerationsFromSupabase,
  updateGenerationStatus,
  upsertGeneration,
} from '../infra/repositories/routineGenerationRepository';
import {
  fetchRoutineGeneration,
  type RoutineGenerationResponse,
} from '../infra/llm/routineGenerationClient';
import { generateId } from '../utils/id';
import { AIError } from '../infra/services/aiNutritionService';
import type {
  LocalRoutineGeneration,
  RoutineGenerationStatus,
} from '../types/routineGeneration';

export interface RoutineGenState {
  /** Drafts cache keyed `${userId}:${generationId}` + pointer
   *  `${userId}:current` to the most recent draft (Drafting 106). */
  drafts: Record<string, LocalRoutineGeneration>;
  /** Single per-user generation guard — multiple "Generate" taps
   *  in flight at once would double-spend quota. */
  isGenerating: boolean;
  /** Apply transition is also guarded so a double-tap on the
   *  Apply button can't insert two routines. */
  isApplying: boolean;
  error: AIError | null;
  /** Bumped each time an apply succeeds. Screens that own a
   *  routine list (e.g. `training/index.tsx`) subscribe to this
   *  to know when to refresh — Codex round 1 Important #2 fix. */
  lastAppliedAt: string | null;

  runGeneration: (args: {
    userId: string;
    profileId: string;
    intentText: string;
    exerciseSlugs: string[];
  }) => Promise<RoutineGenerationResponse | null>;
  applyDraft: (args: {
    userId: string;
    profileId: string;
    generationId: string;
  }) => Promise<{ routineId: string } | null>;
  discardDraft: (args: {
    userId: string;
    generationId: string;
  }) => Promise<void>;
  loadFromCache: (userId: string) => Promise<void>;
  dismissError: () => void;
  reset: () => void;
}

export function draftKey(userId: string, generationId: string): string {
  return `${userId}:${generationId}`;
}

export function draftCurrentKey(userId: string): string {
  return `${userId}:current`;
}

export const useRoutineGenStore = create<RoutineGenState>((set, get) => ({
  drafts: {},
  isGenerating: false,
  isApplying: false,
  error: null,
  lastAppliedAt: null,

  runGeneration: async ({ userId, profileId, intentText, exerciseSlugs }) => {
    if (get().isGenerating) return null;
    set({ isGenerating: true, error: null });
    try {
      const idempotencyKey = generateId();
      const response = await fetchRoutineGeneration({
        profileId,
        intentText,
        exerciseSlugs,
        idempotencyKey,
      });
      const local: LocalRoutineGeneration = {
        id: response.generationId,
        userId,
        promptContext: { intentText, exerciseSlugs },
        generatedRoutine: response.generatedRoutine,
        status: response.status as RoutineGenerationStatus,
        appliedRoutineId: null,
        createdAt: new Date().toISOString(),
        appliedAt: null,
      };
      // Phase 1.5 Codex round 1 Critical fix — write to local
      // mirror only; the EF already persisted the row to Supabase
      // (server-authoritative model, mirrors chat / advice).
      await upsertGeneration(local);
      set((state) => ({
        drafts: {
          ...state.drafts,
          [draftKey(userId, local.id)]: local,
          [draftCurrentKey(userId)]: local,
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
      return null;
    } finally {
      set({ isGenerating: false });
    }
  },

  applyDraft: async ({ userId, profileId, generationId }) => {
    if (get().isApplying) return null;
    set({ isApplying: true, error: null });
    try {
      const draft = get().drafts[draftKey(userId, generationId)];
      if (!draft) {
        throw new AIError(
          'invalid_request',
          '対象のルーティン下書きが見つかりません',
          400,
        );
      }
      if (draft.status !== 'draft') {
        throw new AIError(
          'invalid_request',
          'この下書きは既に適用済 / 破棄済です',
          400,
        );
      }
      // Resolve each item's exerciseSlug → exerciseId. Slugs that
      // don't resolve are dropped silently (defense-in-depth — the
      // EF already filters against the slug list we sent, but a
      // server-side replay or DB skew could surface an unresolved
      // slug). If 0 items remain the apply is rejected.
      const resolvedItems: {
        exerciseId: string;
        targetSets: number;
        targetReps: string;
      }[] = [];
      for (const it of draft.generatedRoutine.items) {
        const exercise = await workoutRepo.findExerciseBySlug(it.exerciseSlug);
        if (!exercise) continue;
        resolvedItems.push({
          exerciseId: exercise.id,
          targetSets: it.targetSets,
          targetReps: it.targetReps,
        });
      }
      if (resolvedItems.length === 0) {
        throw new AIError(
          'invalid_request',
          'ルーティンの種目を解決できませんでした',
          400,
        );
      }
      const newRoutine = await workoutRepo.createRoutine(
        profileId,
        draft.generatedRoutine.routineName,
        resolvedItems,
      );
      const nowIso = new Date().toISOString();
      const result = await updateGenerationStatus(userId, generationId, {
        status: 'applied',
        appliedRoutineId: newRoutine.id,
        appliedAt: nowIso,
      });
      if (!result.ok) {
        // Compensation depth (Drafting 103) — the routine row
        // already landed locally + got enqueued via
        // workoutRepository's sync_queue. We surface the status
        // sync failure but keep the routine; the user keeps the
        // applied benefit. The next mount's syncGenerationsFromSupabase
        // can recover the draft → applied transition if the user
        // retries.
        throw new AIError(
          'internal_error',
          result.errorMessage ??
            'ルーティンの状態更新に失敗しました',
          0,
        );
      }
      const updated: LocalRoutineGeneration = {
        ...draft,
        status: 'applied',
        appliedRoutineId: newRoutine.id,
        appliedAt: nowIso,
      };
      set((state) => {
        const next = { ...state.drafts };
        next[draftKey(userId, generationId)] = updated;
        // Apply'd draft is no longer "current"; clear the pointer
        // if it was pointing here.
        if (next[draftCurrentKey(userId)]?.id === generationId) {
          delete next[draftCurrentKey(userId)];
        }
        return { drafts: next, lastAppliedAt: nowIso };
      });
      return { routineId: newRoutine.id };
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
      return null;
    } finally {
      set({ isApplying: false });
    }
  },

  discardDraft: async ({ userId, generationId }) => {
    try {
      const result = await updateGenerationStatus(userId, generationId, {
        status: 'discarded',
        appliedRoutineId: null,
        appliedAt: null,
      });
      if (!result.ok) {
        throw new AIError(
          'internal_error',
          result.errorMessage ?? '破棄に失敗しました',
          0,
        );
      }
      const draft = get().drafts[draftKey(userId, generationId)];
      if (draft) {
        const updated: LocalRoutineGeneration = {
          ...draft,
          status: 'discarded',
        };
        set((state) => {
          const next = { ...state.drafts };
          next[draftKey(userId, generationId)] = updated;
          if (next[draftCurrentKey(userId)]?.id === generationId) {
            delete next[draftCurrentKey(userId)];
          }
          return { drafts: next };
        });
      }
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
    }
  },

  loadFromCache: async (userId) => {
    // Codex round 1 Important #1 fix — hydrate Zustand from the
    // SQLite v33 mirror so a force-kill / app restart surfaces the
    // last draft as the "current" pointer. The card's idle state
    // never shows a stale draft from a *previous* generation
    // attempt; only the most recent draft is hydrated as current.
    await syncGenerationsFromSupabase(userId);
    const drafts = await listDraftsByUser(userId);
    if (drafts.length === 0) {
      // No drafts — wipe any stale keys for this user under the
      // current store. Same pattern as Phase 1.4 advice store.
      set((state) => {
        const prefix = `${userId}:`;
        const next: Record<string, typeof drafts[0]> = {};
        for (const [k, v] of Object.entries(state.drafts)) {
          if (!k.startsWith(prefix)) next[k] = v;
        }
        return { drafts: next };
      });
      return;
    }
    const updates: Record<string, typeof drafts[0]> = {};
    for (const d of drafts) {
      updates[draftKey(userId, d.id)] = d;
    }
    updates[draftCurrentKey(userId)] = drafts[0];
    set((state) => ({
      drafts: { ...state.drafts, ...updates },
    }));
  },

  dismissError: () => set({ error: null }),

  reset: () =>
    set({
      drafts: {},
      isGenerating: false,
      isApplying: false,
      error: null,
      lastAppliedAt: null,
    }),
}));

export function selectCurrentDraft(
  state: RoutineGenState,
  userId: string,
): LocalRoutineGeneration | null {
  return state.drafts[draftCurrentKey(userId)] ?? null;
}

/** Direct SQLite lookup for the apply path's atomicity test. */
export async function findCachedGeneration(
  generationId: string,
): Promise<LocalRoutineGeneration | null> {
  return getGenerationById(generationId);
}
