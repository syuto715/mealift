import { create } from 'zustand';
import type { GeneratedProgram } from '../infra/services/aiWorkoutService';

// Build 15 / Session 8 / Phase 6 / Commit 25 — transient handoff store
// for the AI menu generation flow.
//
// The generation screen (ai-menu.tsx) drops the Gemini-generated program
// here on success, then router.push'es to the preview screen
// (ai-menu-preview.tsx) which reads the same program. Doing this through
// router params would JSON-stringify a multi-week program object onto the
// URL — the payload regularly exceeds 4 KB and Expo Router complains
// about long deep-link params at runtime. An in-memory store sidesteps
// the serialization round-trip entirely and stays scoped to the running
// app session (no MMKV persistence — a fresh launch must always
// re-generate).
//
// The store is intentionally NOT a route param substitute for state that
// outlives a screen pair. Both setters are called from the matching
// halves of one user-flow: set in ai-menu.tsx, read+clear in
// ai-menu-preview.tsx (or its onUnmount).

interface AIMenuStagingState {
  program: GeneratedProgram | null;
  // The muscle filter the user picked at generation time. Carried so
  // the preview screen can pick a sensible muscle_group for any
  // unresolved slugs the user opts to materialize as custom_exercises.
  targetMuscles: string[] | null;
  setStaging: (
    program: GeneratedProgram,
    targetMuscles: string[],
  ) => void;
  clear: () => void;
}

export const useAIMenuStagingStore = create<AIMenuStagingState>((set) => ({
  program: null,
  targetMuscles: null,
  setStaging: (program, targetMuscles) => set({ program, targetMuscles }),
  clear: () => set({ program: null, targetMuscles: null }),
}));
