// v1.5 Stage 1 Phase 1.3 — diagnosticStore.
//
// SSoT: docs/plans/v1.5_stage_1_ai_chat_epic.md §3 surface ② + §10
// Phase 1.3 + Drafting 106 (userId-scoped cache + logout reset).
//
// State shape: `wizards` keyed by `${userId}` so a same-process
// account switch can't surface User A's answers to User B. The
// store does NOT persist to SQLite (matches the kickoff prompt's
// "diagnostic は ephemeral wizard state" intent — the only
// persisted artifact is the routine_generations row that
// Phase 1.5's runGeneration creates).

import { create } from 'zustand';
import { useRoutineGenStore } from './routineGenStore';
import { buildIntentText } from '../domain/diagnosticIntentBuilder';
import { DIAGNOSTIC_QUESTIONS } from '../domain/diagnosticQuestions';
import { listAllExerciseSlugs } from '../infra/repositories/workoutRepository';
import type {
  DiagnosticAnswers,
  DiagnosticAnswerValue,
} from '../types/diagnostic';

interface UserWizardState {
  answers: DiagnosticAnswers;
}

export interface DiagnosticStoreState {
  wizards: Record<string, UserWizardState>;

  getAnswers: (userId: string) => DiagnosticAnswers;
  setAnswer: (
    userId: string,
    questionId: string,
    value: DiagnosticAnswerValue,
  ) => void;
  clearWizard: (userId: string) => void;
  /** Compose the natural-language intent text for the current
   *  user's wizard answers. Pure read — does NOT clear state.
   *  Phase 1.5 coach-routine EF accepts this as `intentText`. */
  composeIntentText: (userId: string) => string;
  /** End-to-end submit: compose intent + call Phase 1.5
   *  routineGenStore.runGeneration. Returns the result of the
   *  store call (which is the EF envelope or null on error).
   *  Does NOT clear the wizard — the result screen owns the
   *  apply / discard transition. */
  submitToGeneration: (args: {
    userId: string;
    profileId: string;
  }) => Promise<{ generationId: string } | null>;
  /** Drafting 106 — wipe ALL users' wizard state on logout. */
  reset: () => void;
}

function wizardKey(userId: string): string {
  return userId;
}

export const useDiagnosticStore = create<DiagnosticStoreState>(
  (set, get) => ({
    wizards: {},

    getAnswers: (userId) => get().wizards[wizardKey(userId)]?.answers ?? {},

    setAnswer: (userId, questionId, value) => {
      set((state) => {
        const key = wizardKey(userId);
        const current = state.wizards[key]?.answers ?? {};
        return {
          wizards: {
            ...state.wizards,
            [key]: { answers: { ...current, [questionId]: value } },
          },
        };
      });
    },

    clearWizard: (userId) => {
      set((state) => {
        const next = { ...state.wizards };
        delete next[wizardKey(userId)];
        return { wizards: next };
      });
    },

    composeIntentText: (userId) => {
      const answers = get().wizards[wizardKey(userId)]?.answers ?? {};
      return buildIntentText(answers);
    },

    submitToGeneration: async ({ userId, profileId }) => {
      const answers = get().wizards[wizardKey(userId)]?.answers ?? {};
      const intentText = buildIntentText(answers);
      const exerciseSlugs = await listAllExerciseSlugs();
      if (exerciseSlugs.length === 0) {
        return null;
      }
      const response = await useRoutineGenStore.getState().runGeneration({
        userId,
        profileId,
        intentText,
        // Same cardinality bound as the inline card — the EF
        // accepts up to 200.
        exerciseSlugs: exerciseSlugs.slice(0, 200),
      });
      return response ? { generationId: response.generationId } : null;
    },

    reset: () => set({ wizards: {} }),
  }),
);

export const DIAGNOSTIC_STEP_COUNT = DIAGNOSTIC_QUESTIONS.length;
