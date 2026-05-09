import {
  PERIODIZATION_TEMPLATES,
  type DupSessionLabel,
  type PeriodizationTemplate,
  type PeriodizedRoutineItemInput,
} from '../constants/periodizationTemplates';

// Build 16 / Phase 5 (Feature G) / Phase 5.1 — periodization domain
// layer.
//
// Pure logic. Two responsibilities:
//
//   1. generatePeriodizedRoutine — given a base routine (name + items)
//      + a template + a (week, sessionLabel?), produce ONE concrete
//      routine with sets/reps overwritten to the template's
//      prescription for that cell. Output shape matches the
//      createRoutine API; Phase 5.2 UI hands it directly to the
//      repository.
//
//   2. spawnAllPeriodizedRoutines — convenience iteration that calls
//      generatePeriodizedRoutine for every (week, [session]) cell of
//      the template. Linear/Block produce one output per week; DUP
//      produces three per week (Heavy/Medium/Light). UI layer maps
//      the resulting array straight to `createRoutine × N`.
//
// Mealift design discipline (long-term-strategy.md:247):
//   intensityPctOf1RM is intentionally NOT carried into the output
//   items. recommendNextSet computes kg from e1rm at session time;
//   the template's % target is informational copy that the picker UI
//   surfaces to the user but never stamps onto a routine row. v2 may
//   add an `intensity_target_pct` column to workout_routine_items;
//   v1 keeps schema untouched (zero-schema fork-and-clone — Phase 5
//   recon decision α).
//
// Phase 4.1 lineage: this module re-uses generateDeloadRoutine's
// preserve-fields-via-generic-T pattern (Codex review pass 1 /
// Important #2 lesson — return type is `Omit<T, 'targetSets' |
// 'targetReps'> & { targetSets: number; targetReps: string }` so a
// caller's refinement on those fields can't be silently broken by
// the rewrite).
//
// Set-pattern coexistence (mild inconsistency, documented for v2):
//   A baseItem with set_pattern='5x5' that flows through Linear W1
//   ends up with set_pattern='5x5' (preserved per the kickoff) but
//   targetSets=5, targetReps='8' (overwritten by the template).
//   Periodization templates effectively dominate set-pattern presets;
//   the picker UI in Phase 5.2 will warn the user when a base routine
//   with set_pattern items is selected. This is a UX choice rather
//   than a domain bug — leaving as-is for v1.

// === Types ===

export interface GeneratePeriodizedRoutineInput<T extends PeriodizedRoutineItemInput> {
  // User-supplied base routine name (e.g. 'Push Day'). The output's
  // `name` prefixes this with '[Linear W2]' / '[DUP W1 Heavy]' / etc.
  baseName: string;
  baseItems: T[];
  template: PeriodizationTemplate;
  // 1-indexed (matches the template's PeriodizationWeek.weekIndex).
  weekIndex: number;
  // Required for DUP, forbidden for Linear/Block. The runtime guard
  // throws on either misuse so the UI's "select session" affordance
  // never feeds a malformed shape into createRoutine.
  sessionLabel?: DupSessionLabel;
}

export interface GeneratePeriodizedRoutineOutput<T extends PeriodizedRoutineItemInput> {
  name: string;
  items: Array<
    Omit<T, 'targetSets' | 'targetReps'> & {
      targetSets: number;
      targetReps: string;
    }
  >;
}

// Display labels for the routine-name prefix — capitalize the
// template id once here rather than at every call site. 'DUP' is
// already an acronym so it stays uppercase.
const TEMPLATE_LABEL: Record<PeriodizationTemplate['id'], string> = {
  linear: 'Linear',
  block: 'Block',
  dup: 'DUP',
};

// === Pure: single-routine generation ===

export function generatePeriodizedRoutine<T extends PeriodizedRoutineItemInput>(
  input: GeneratePeriodizedRoutineInput<T>,
): GeneratePeriodizedRoutineOutput<T> {
  const { baseName, baseItems, template, weekIndex, sessionLabel } = input;

  // Window guard — throw rather than clamp. Caller misuse here means
  // a UI bug; silent clamp would hide it and produce surprising
  // routine names like '[Linear W4]' when the user clicked Week 5.
  if (
    weekIndex < 1 ||
    weekIndex > template.durationWeeks ||
    !Number.isInteger(weekIndex)
  ) {
    throw new Error(
      `generatePeriodizedRoutine: weekIndex ${weekIndex} out of range [1, ${template.durationWeeks}] for template '${template.id}'`,
    );
  }

  const week = template.weeks.find((w) => w.weekIndex === weekIndex);
  if (!week) {
    // Template constants drift from durationWeeks — defensive but
    // shouldn't fire under healthy data. The constants test suite
    // pins this contract.
    throw new Error(
      `generatePeriodizedRoutine: template '${template.id}' missing weekIndex ${weekIndex}`,
    );
  }

  // Resolve the prescription for this (template, week, sessionLabel)
  // cell. DUP requires a sessionLabel; Linear/Block forbid one.
  let sets: number;
  let reps: string;
  let prefixSession = '';

  if (template.id === 'dup') {
    if (!sessionLabel) {
      throw new Error(
        `generatePeriodizedRoutine: DUP template requires sessionLabel (Heavy / Medium / Light)`,
      );
    }
    if (!week.sessions || week.sessions.length === 0) {
      throw new Error(
        `generatePeriodizedRoutine: DUP template '${template.id}' weekIndex ${weekIndex} missing sessions`,
      );
    }
    const session = week.sessions.find((s) => s.sessionLabel === sessionLabel);
    if (!session) {
      throw new Error(
        `generatePeriodizedRoutine: DUP sessionLabel '${sessionLabel}' not found in weekIndex ${weekIndex}`,
      );
    }
    sets = session.sets;
    reps = session.reps;
    prefixSession = ` ${sessionLabel}`;
  } else {
    if (sessionLabel) {
      throw new Error(
        `generatePeriodizedRoutine: sessionLabel is only valid for DUP templates, got '${template.id}'`,
      );
    }
    if (week.sets === undefined || week.reps === undefined) {
      throw new Error(
        `generatePeriodizedRoutine: template '${template.id}' weekIndex ${weekIndex} missing sets/reps`,
      );
    }
    sets = week.sets;
    reps = week.reps;
  }

  const name = `[${TEMPLATE_LABEL[template.id]} W${weekIndex}${prefixSession}] ${baseName}`;

  const items = baseItems.map((item) => ({
    ...item,
    targetSets: sets,
    targetReps: reps,
  }));

  return { name, items };
}

// === Pure: spawn-all helper ===

export interface SpawnAllPeriodizedRoutinesInput<T extends PeriodizedRoutineItemInput> {
  baseName: string;
  baseItems: T[];
  template: PeriodizationTemplate;
}

// Iterates every (week, [session]) cell of the template and produces
// one output per cell, in template order. Linear/Block: 1 per week.
// DUP: 3 per week (Heavy → Medium → Light). The UI in Phase 5.2 maps
// this array directly to `createRoutine × N` and saves all routines
// in one pass; the user then picks the routine matching their
// current week/session before each session.
export function spawnAllPeriodizedRoutines<T extends PeriodizedRoutineItemInput>(
  input: SpawnAllPeriodizedRoutinesInput<T>,
): GeneratePeriodizedRoutineOutput<T>[] {
  const { template, baseName, baseItems } = input;
  const out: GeneratePeriodizedRoutineOutput<T>[] = [];

  for (const week of template.weeks) {
    if (template.id === 'dup') {
      const sessions = week.sessions ?? [];
      for (const session of sessions) {
        out.push(
          generatePeriodizedRoutine({
            baseName,
            baseItems,
            template,
            weekIndex: week.weekIndex,
            sessionLabel: session.sessionLabel,
          }),
        );
      }
    } else {
      out.push(
        generatePeriodizedRoutine({
          baseName,
          baseItems,
          template,
          weekIndex: week.weekIndex,
        }),
      );
    }
  }

  return out;
}

// === Re-exports for downstream convenience ===

export { PERIODIZATION_TEMPLATES };
export type {
  PeriodizationTemplate,
  PeriodizedRoutineItemInput,
  DupSessionLabel,
};
