import type { Exercise } from '../../types/workout';

// FindBySlug is injected by the caller (Phase 6 UI passes
// workoutRepo.findExerciseBySlug). Module-level import of
// workoutRepository would drag the SQLite + expo-crypto chain into
// any consumer's test runtime, so the dependency stays explicit.
export type FindBySlugFn = (slug: string) => Promise<Exercise | null>;

// Build 15 / Session 8 / Feature 5-元 — slug → Exercise resolution
// for AI menu generation results.
//
// Two-tier matching (design §6.8.4 with Phase 5 simplification):
//   Tier 1 — exact slug match against exercises table
//   Tier 2 — needs_custom: surface to UI so the user can decide
//            whether to create a custom exercise or skip
//
// Design §6.8.4 also describes a Tier 1.5 ("name_ja LIKE fallback")
// but in practice Gemini sticks to the slug allowlist provided in
// the prompt and Tier 2 covers the rare drift case explicitly via
// user confirmation. Tier 1.5 is deferred to Build 16+ if metrics
// show meaningful slug-typo rates.
//
// Auto-creation of custom_exercises rows is intentionally NOT done
// here (Session 8 sign-off ambiguity #2) — the UI must show a warn
// dialog before any new row gets created, to prevent Gemini
// hallucinations from polluting the user's exercise DB silently.

export type SlugResolution =
  | { kind: 'matched'; exercise: Exercise }
  | { kind: 'needs_custom'; slug: string };

// Caller-supplied Tier 1 fetcher. Phase 6 UI passes
// workoutRepo.findExerciseBySlug; tests pass a mock.
export async function resolveSlugToExercise(
  slug: string,
  findBySlug: FindBySlugFn,
): Promise<SlugResolution> {
  const trimmed = slug?.trim() ?? '';
  if (trimmed === '') {
    return { kind: 'needs_custom', slug: trimmed };
  }
  const exact = await findBySlug(trimmed);
  if (exact) return { kind: 'matched', exercise: exact };
  return { kind: 'needs_custom', slug: trimmed };
}

// Bulk variant — resolve every slug in a generated program with a
// single deduplicated pass. Returns a Map keyed by slug for O(1)
// lookup during routine conversion.
export async function resolveSlugsBulk(
  slugs: string[],
  findBySlug: FindBySlugFn,
): Promise<Map<string, SlugResolution>> {
  const unique = Array.from(new Set(slugs.filter((s) => typeof s === 'string')));
  const out = new Map<string, SlugResolution>();
  for (const slug of unique) {
    const resolution = await resolveSlugToExercise(slug, findBySlug);
    out.set(slug, resolution);
  }
  return out;
}
