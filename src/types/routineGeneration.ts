// v1.5 Stage 1 Phase 1.5 — routine generation types.
//
// SSoT: docs/plans/v1.5_stage_1_ai_chat_epic.md §3 surface ③ +
// §5.1 (`routine_generations` Supabase row).
//
// `LocalRoutineGeneration` mirrors the Supabase row that the SQLite
// v33 read-cache mirror holds. The `generated_routine_json` payload
// is parsed into the strict `GeneratedRoutine` shape declared in
// `supabase/functions/_shared/routineJson.ts` — mirrored here so
// the Node side carries the same type contract.

export type RoutineGenerationStatus = 'draft' | 'applied' | 'discarded';

export interface GeneratedRoutineItem {
  exerciseSlug: string;
  targetSets: number;
  targetReps: string;
  notes?: string;
}

export interface GeneratedRoutine {
  routineName: string;
  items: GeneratedRoutineItem[];
}

export interface LocalRoutineGeneration {
  id: string;
  userId: string;
  promptContext: Record<string, unknown>;
  generatedRoutine: GeneratedRoutine;
  status: RoutineGenerationStatus;
  /** Local SQLite routine row id once `applied`. NULL while draft /
   *  discarded. Soft FK — Supabase doesn't see the local table. */
  appliedRoutineId: string | null;
  createdAt: string;
  appliedAt: string | null;
}
