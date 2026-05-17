// v1.5 Stage 1 Phase 1.4 — coach advice types.
//
// SSoT: docs/plans/v1.5_stage_1_ai_chat_epic.md §5.1 (coach_advice
// Supabase table) + §3 surface ④ row.
//
// `LocalCoachAdvice` mirrors the Supabase `coach_advice` row that
// the local SQLite v32 mirror caches. Unlike chat messages there
// is no `clientTempId` — the advice EF is one-shot non-streaming;
// the row id is server-supplied by the time the client persists.

export type CoachAdviceScope = 'weekly' | 'daily';

export interface LocalCoachAdvice {
  id: string;
  userId: string;
  scope: CoachAdviceScope;
  /** YYYY-MM-DD in profile tz. Server-computed via
   *  `supabase/functions/_shared/tzPeriod.ts::computePeriodStart`. */
  periodStart: string;
  content: string;
  generatedAt: string;
}
