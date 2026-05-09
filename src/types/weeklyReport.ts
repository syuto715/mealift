export interface WeeklyReportData {
  weekStart: string; // ISO date, Monday
  weekEnd: string; // ISO date, Sunday

  // Weight
  weightStart: number | null;
  weightEnd: number | null;
  weightChange: number | null;

  // Nutrition averages (per day)
  avgCalories: number;
  avgProtein: number;
  avgFat: number;
  avgCarb: number;
  mealLogDays: number; // how many days had at least 1 meal logged

  // Training
  workoutCount: number;
  totalVolume: number; // kg * reps
  totalCaloriesBurned: number;

  // Scores (0-100)
  consistencyScore: number; // based on logging streak
  nutritionScore: number; // how close to target macros
  trainingScore: number; // based on workout frequency

  overallScore: number; // weighted average

  // Build 16 / Phase 1 (Feature H) — optional AI narrative attached
  // by generate-weekly-report Edge Function. Pre-existing rows
  // without narrative stay valid; generators / readers must treat
  // this as undefined-friendly. Lives on the same row as the rule-
  // based stats so a single sync push covers both.
  narrative?: WeeklyNarrative;
}

// AI narrative contents. Lives inside WeeklyReportData.data_json
// and rides the same weekly_reports / user_weekly_reports sync
// channel; no schema migration required.
//
// `sections` mirrors the 4-section structure surfaced in Phase 1
// design recon (workout / nutrition / weight + integration insight,
// the last being the unique selling point of Mealift's combined
// review). Each section is a short narrative snippet the UI renders
// as its own card; integration is the cross-domain insight that
// no single-axis competitor (Gymwork / あすけん / Fitbod) produces.
export interface WeeklyNarrative {
  // 3-5 sentence executive overview rendered above the section list.
  overall: string;
  sections: {
    // Roughly 100-150 chars each per Phase 1 sign-off; the EF
    // prompt enforces the upper bound, but consumers must not assume
    // a specific length.
    workout: string;
    nutrition: string;
    weight: string;
    // The integration insight — the moat. Calls out signal that
    // requires looking across all three domains together.
    integration: string;
  };
  // Date.now() at write time. Used by readers to decide whether the
  // narrative is "fresh" relative to the underlying stats (e.g.
  // surface a "regenerate" CTA if stats shifted after narrative was
  // written).
  generatedAt: number;
  // Mirrors Phase 7 cache-versioning pattern: bumped when the
  // section schema changes so old narratives can be invalidated by
  // readers that opt to.
  cacheVersion: number;
}

export const NARRATIVE_CACHE_VERSION = 1;
