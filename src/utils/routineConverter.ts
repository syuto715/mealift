import type { Exercise, SetPattern } from '../types/workout';
import type {
  GeneratedProgram,
  WorkoutBlock,
} from '../infra/services/aiWorkoutService';
import type { SlugResolution } from '../infra/services/slugResolver';

// Build 15 / Session 8 / Feature 5-元 — pure conversion of a
// Gemini-generated program (one selected day) into the existing
// RoutineItemDraft[] shape that workoutRepository.createRoutine
// already consumes.
//
// Phase 6 UI passes (program, weekIndex, dayIndex, resolutions) so
// the user can preview a specific day before saving. v1 saves a
// single day per routine — multi-week persistence (whole program as
// one routine collection) is deferred per design §6.8.5 ("AI生成
// menu = 1 workout_routine"). Multi-day per program is exposed
// through the picker UI.

export interface DraftItem {
  exercise: Exercise;
  targetSets: number;
  targetReps: string;
  setPattern: SetPattern | null;
  patternConfig: string | null;
}

export interface DraftRoutine {
  name: string;
  items: DraftItem[];
}

export interface ConvertedRoutine {
  draft: DraftRoutine;
  // Slugs that fell to needs_custom — Phase 6 UI surfaces these in a
  // warn dialog before letting the user save (auto-creation banned
  // per Session 8 ambiguity sign-off).
  unresolvedSlugs: string[];
}

// Format the routine name per design §6.8.5:
//   "AI生成: <programName> (<dayLabel>)"
// Example: "AI生成: 上半身プッシュ (月曜日)"
function buildRoutineName(programName: string, dayLabel: string): string {
  return `AI生成: ${programName} (${dayLabel})`;
}

// Convert a (program, weekIndex, dayIndex) selection into a
// RoutineItemDraft list. Blocks whose slugs didn't resolve are
// dropped from the draft and listed in unresolvedSlugs so the
// caller can decide what to do.
export function convertToRoutineDraft(
  program: GeneratedProgram,
  weekIndex: number,
  dayIndex: number,
  resolutions: Map<string, SlugResolution>,
): ConvertedRoutine | null {
  const week = program.weeks[weekIndex];
  if (!week) return null;
  const day = week.days[dayIndex];
  if (!day) return null;

  const items: DraftItem[] = [];
  const unresolvedSlugs: string[] = [];

  for (const block of day.blocks) {
    const resolution = resolutions.get(block.exerciseSlug);
    if (!resolution || resolution.kind === 'needs_custom') {
      unresolvedSlugs.push(block.exerciseSlug);
      continue;
    }
    items.push(buildDraftItem(block, resolution.exercise));
  }

  return {
    draft: {
      name: buildRoutineName(program.programName, day.dayLabel),
      items,
    },
    unresolvedSlugs,
  };
}

function buildDraftItem(block: WorkoutBlock, exercise: Exercise): DraftItem {
  // target_reps stored as the raw "min-max" string so existing
  // parseTargetReps (Phase 2 of Session 7) computes its median for
  // the recommendation engine. Equal-bound ranges (min == max)
  // collapse cleanly via parseTargetReps.
  const reps =
    block.repRangeMin === block.repRangeMax
      ? String(block.repRangeMin)
      : `${block.repRangeMin}-${block.repRangeMax}`;
  return {
    exercise,
    targetSets: block.sets,
    targetReps: reps,
    // Phase 5 v1: AI never auto-selects 5x5 / top_set / drop_set
    // (Session 8 ambiguity sign-off #4). User can switch via the
    // routine modal pattern chip after save if desired.
    setPattern: null,
    patternConfig: null,
  };
}
