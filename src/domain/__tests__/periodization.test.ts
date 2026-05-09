// Build 16 / Phase 5.1 — domain layer tests for periodization
// presets. Three layers, mirroring Phase 4.1's deloadDetection
// approach:
//
//   1. Constants integrity — pin every literature-derived value
//      so an accidental edit shows up as a test diff (Phase 2.1
//      VOLUME_LANDMARKS precedent).
//   2. generatePeriodizedRoutine — pure logic over (template, week,
//      session?), incl. window guards + DUP/non-DUP discrimination
//      + preserve-fields invariants.
//   3. spawnAllPeriodizedRoutines — ordering + count + uniqueness.

import {
  PERIODIZATION_TEMPLATES,
  LINEAR_TEMPLATE,
  BLOCK_TEMPLATE,
  DUP_TEMPLATE,
  getPeriodizationTemplate,
  type PeriodizationTemplate,
  type PeriodizedRoutineItemInput,
} from '../../constants/periodizationTemplates';
import {
  generatePeriodizedRoutine,
  spawnAllPeriodizedRoutines,
} from '../periodization';

// Standard fixture — three exercises, one with a set pattern + config
// to exercise the preserve-fields invariant.
const BASE_ITEMS: PeriodizedRoutineItemInput[] = [
  {
    exerciseId: 'ex-bench',
    targetSets: 3,
    targetReps: '8-12',
    setPattern: null,
    patternConfig: null,
  },
  {
    exerciseId: 'ex-row',
    targetSets: 3,
    targetReps: '8-12',
    setPattern: '5x5',
    patternConfig: '{"foo":"bar"}',
  },
  {
    exerciseId: 'ex-curl',
    targetSets: 3,
    targetReps: '12',
    setPattern: 'drop_set',
    patternConfig: null,
  },
];

// ---------------------------------------------------------------------------
// 1. Constants integrity
// ---------------------------------------------------------------------------

describe('PERIODIZATION_TEMPLATES — registry shape', () => {
  it('exposes exactly 3 templates with unique ids', () => {
    expect(PERIODIZATION_TEMPLATES).toHaveLength(3);
    const ids = PERIODIZATION_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(['linear', 'block', 'dup']);
  });

  it('every template has a non-empty Japanese name + description', () => {
    for (const t of PERIODIZATION_TEMPLATES) {
      expect(t.nameJa.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('weeks.length matches durationWeeks for every template', () => {
    for (const t of PERIODIZATION_TEMPLATES) {
      expect(t.weeks).toHaveLength(t.durationWeeks);
    }
  });

  it('weekIndex is monotonic 1..durationWeeks for every template', () => {
    for (const t of PERIODIZATION_TEMPLATES) {
      for (let i = 0; i < t.weeks.length; i++) {
        expect(t.weeks[i].weekIndex).toBe(i + 1);
      }
    }
  });

  it('getPeriodizationTemplate looks up by id', () => {
    expect(getPeriodizationTemplate('linear')).toBe(LINEAR_TEMPLATE);
    expect(getPeriodizationTemplate('block')).toBe(BLOCK_TEMPLATE);
    expect(getPeriodizationTemplate('dup')).toBe(DUP_TEMPLATE);
  });
});

describe('LINEAR_TEMPLATE — recon §C value pin', () => {
  it('matches the recon-approved Linear progression (70→85% over 4 weeks)', () => {
    const expected = [
      { weekIndex: 1, sets: 5, reps: '8', intensityPctOf1RM: 70 },
      { weekIndex: 2, sets: 5, reps: '6', intensityPctOf1RM: 75 },
      { weekIndex: 3, sets: 5, reps: '4', intensityPctOf1RM: 80 },
      { weekIndex: 4, sets: 5, reps: '3', intensityPctOf1RM: 85 },
    ];
    expect(LINEAR_TEMPLATE.weeks).toEqual(expected);
  });

  it('keeps Linear weeks in the strict (non-DUP) shape — no sessions', () => {
    for (const w of LINEAR_TEMPLATE.weeks) {
      expect(w.sessions).toBeUndefined();
      expect(w.sets).toBeDefined();
      expect(w.reps).toBeDefined();
      expect(w.intensityPctOf1RM).toBeDefined();
    }
  });
});

describe('BLOCK_TEMPLATE — recon §C value pin (12-week 3-phase)', () => {
  it('first 4 weeks are the hypertrophy phase (4 × 8-12 @ 70-76%)', () => {
    for (let i = 0; i < 4; i++) {
      const w = BLOCK_TEMPLATE.weeks[i];
      expect(w.sets).toBe(4);
      expect(w.reps).toBe('8-12');
      expect(w.intensityPctOf1RM).toBeGreaterThanOrEqual(70);
      expect(w.intensityPctOf1RM).toBeLessThanOrEqual(76);
    }
  });

  it('weeks 5-8 are the strength phase (4 × 4-6 @ 80-86%)', () => {
    for (let i = 4; i < 8; i++) {
      const w = BLOCK_TEMPLATE.weeks[i];
      expect(w.sets).toBe(4);
      expect(w.reps).toBe('4-6');
      expect(w.intensityPctOf1RM).toBeGreaterThanOrEqual(80);
      expect(w.intensityPctOf1RM).toBeLessThanOrEqual(86);
    }
  });

  it('weeks 9-12 are the power phase (3 × 2-4 @ 88-95%)', () => {
    for (let i = 8; i < 12; i++) {
      const w = BLOCK_TEMPLATE.weeks[i];
      expect(w.sets).toBe(3);
      expect(w.reps).toBe('2-4');
      expect(w.intensityPctOf1RM).toBeGreaterThanOrEqual(88);
      expect(w.intensityPctOf1RM).toBeLessThanOrEqual(95);
    }
  });

  it('intensity is monotonically non-decreasing across the 12 weeks', () => {
    for (let i = 1; i < 12; i++) {
      expect(BLOCK_TEMPLATE.weeks[i].intensityPctOf1RM).toBeGreaterThanOrEqual(
        BLOCK_TEMPLATE.weeks[i - 1].intensityPctOf1RM!,
      );
    }
  });
});

describe('DUP_TEMPLATE — recon §C value pin (per-week H/M/L)', () => {
  it('every week has all 3 sessions in Heavy / Medium / Light order', () => {
    for (const w of DUP_TEMPLATE.weeks) {
      expect(w.sessions).toBeDefined();
      expect(w.sessions).toHaveLength(3);
      expect(w.sessions!.map((s) => s.sessionLabel)).toEqual([
        'Heavy',
        'Medium',
        'Light',
      ]);
    }
  });

  it('keeps DUP weeks in the DUP shape — top-level sets/reps/intensity unset', () => {
    for (const w of DUP_TEMPLATE.weeks) {
      expect(w.sets).toBeUndefined();
      expect(w.reps).toBeUndefined();
      expect(w.intensityPctOf1RM).toBeUndefined();
    }
  });

  it('Heavy session is 5 × 3-5 @ 80-85%', () => {
    for (const w of DUP_TEMPLATE.weeks) {
      const heavy = w.sessions!.find((s) => s.sessionLabel === 'Heavy')!;
      expect(heavy.sets).toBe(5);
      expect(heavy.reps).toBe('3-5');
      expect(heavy.intensityPctOf1RM).toBeGreaterThanOrEqual(80);
      expect(heavy.intensityPctOf1RM).toBeLessThanOrEqual(85);
    }
  });

  it('Medium session is 4 × 6-8 @ 70-75%', () => {
    for (const w of DUP_TEMPLATE.weeks) {
      const med = w.sessions!.find((s) => s.sessionLabel === 'Medium')!;
      expect(med.sets).toBe(4);
      expect(med.reps).toBe('6-8');
      expect(med.intensityPctOf1RM).toBeGreaterThanOrEqual(70);
      expect(med.intensityPctOf1RM).toBeLessThanOrEqual(75);
    }
  });

  it('Light session is 3 × 10-12 @ 60-65%', () => {
    for (const w of DUP_TEMPLATE.weeks) {
      const light = w.sessions!.find((s) => s.sessionLabel === 'Light')!;
      expect(light.sets).toBe(3);
      expect(light.reps).toBe('10-12');
      expect(light.intensityPctOf1RM).toBeGreaterThanOrEqual(60);
      expect(light.intensityPctOf1RM).toBeLessThanOrEqual(65);
    }
  });

  it('week-over-week progression is monotonic non-decreasing per session label', () => {
    // DUP's intensification is intentionally small — verify each
    // session's %1RM never regresses week to week.
    const labels = ['Heavy', 'Medium', 'Light'] as const;
    for (const label of labels) {
      for (let i = 1; i < DUP_TEMPLATE.weeks.length; i++) {
        const prev = DUP_TEMPLATE.weeks[i - 1].sessions!.find(
          (s) => s.sessionLabel === label,
        )!;
        const cur = DUP_TEMPLATE.weeks[i].sessions!.find(
          (s) => s.sessionLabel === label,
        )!;
        expect(cur.intensityPctOf1RM).toBeGreaterThanOrEqual(prev.intensityPctOf1RM);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. generatePeriodizedRoutine
// ---------------------------------------------------------------------------

describe('generatePeriodizedRoutine — Linear', () => {
  it('Week 1 → sets=5, reps="8" on every base item', () => {
    const out = generatePeriodizedRoutine({
      baseName: 'Push Day',
      baseItems: BASE_ITEMS,
      template: LINEAR_TEMPLATE,
      weekIndex: 1,
    });
    for (const item of out.items) {
      expect(item.targetSets).toBe(5);
      expect(item.targetReps).toBe('8');
    }
  });

  it('Week 4 → sets=5, reps="3" (boundary)', () => {
    const out = generatePeriodizedRoutine({
      baseName: 'Push Day',
      baseItems: BASE_ITEMS,
      template: LINEAR_TEMPLATE,
      weekIndex: 4,
    });
    expect(out.items[0].targetSets).toBe(5);
    expect(out.items[0].targetReps).toBe('3');
  });

  it('formats the routine name with [Linear Wn] prefix', () => {
    const out = generatePeriodizedRoutine({
      baseName: 'Push Day',
      baseItems: BASE_ITEMS,
      template: LINEAR_TEMPLATE,
      weekIndex: 2,
    });
    expect(out.name).toBe('[Linear W2] Push Day');
  });
});

describe('generatePeriodizedRoutine — Block', () => {
  it('Week 1 (Hypertrophy) → sets=4, reps="8-12"', () => {
    const out = generatePeriodizedRoutine({
      baseName: 'Push Day',
      baseItems: BASE_ITEMS,
      template: BLOCK_TEMPLATE,
      weekIndex: 1,
    });
    expect(out.items[0].targetSets).toBe(4);
    expect(out.items[0].targetReps).toBe('8-12');
  });

  it('Week 5 (Strength phase boundary) → sets=4, reps="4-6"', () => {
    const out = generatePeriodizedRoutine({
      baseName: 'Push Day',
      baseItems: BASE_ITEMS,
      template: BLOCK_TEMPLATE,
      weekIndex: 5,
    });
    expect(out.items[0].targetSets).toBe(4);
    expect(out.items[0].targetReps).toBe('4-6');
  });

  it('Week 9 (Power phase boundary) → sets=3, reps="2-4"', () => {
    const out = generatePeriodizedRoutine({
      baseName: 'Push Day',
      baseItems: BASE_ITEMS,
      template: BLOCK_TEMPLATE,
      weekIndex: 9,
    });
    expect(out.items[0].targetSets).toBe(3);
    expect(out.items[0].targetReps).toBe('2-4');
  });

  it('formats the routine name with [Block Wn] prefix', () => {
    const out = generatePeriodizedRoutine({
      baseName: 'Push Day',
      baseItems: BASE_ITEMS,
      template: BLOCK_TEMPLATE,
      weekIndex: 5,
    });
    expect(out.name).toBe('[Block W5] Push Day');
  });
});

describe('generatePeriodizedRoutine — DUP', () => {
  it('Week 1 Heavy → sets=5, reps="3-5"', () => {
    const out = generatePeriodizedRoutine({
      baseName: 'Push Day',
      baseItems: BASE_ITEMS,
      template: DUP_TEMPLATE,
      weekIndex: 1,
      sessionLabel: 'Heavy',
    });
    expect(out.items[0].targetSets).toBe(5);
    expect(out.items[0].targetReps).toBe('3-5');
  });

  it('Week 1 Medium → sets=4, reps="6-8"', () => {
    const out = generatePeriodizedRoutine({
      baseName: 'Push Day',
      baseItems: BASE_ITEMS,
      template: DUP_TEMPLATE,
      weekIndex: 1,
      sessionLabel: 'Medium',
    });
    expect(out.items[0].targetSets).toBe(4);
    expect(out.items[0].targetReps).toBe('6-8');
  });

  it('Week 1 Light → sets=3, reps="10-12"', () => {
    const out = generatePeriodizedRoutine({
      baseName: 'Push Day',
      baseItems: BASE_ITEMS,
      template: DUP_TEMPLATE,
      weekIndex: 1,
      sessionLabel: 'Light',
    });
    expect(out.items[0].targetSets).toBe(3);
    expect(out.items[0].targetReps).toBe('10-12');
  });

  it('formats the routine name with [DUP Wn Label] prefix', () => {
    const out = generatePeriodizedRoutine({
      baseName: 'Push Day',
      baseItems: BASE_ITEMS,
      template: DUP_TEMPLATE,
      weekIndex: 1,
      sessionLabel: 'Heavy',
    });
    expect(out.name).toBe('[DUP W1 Heavy] Push Day');
  });
});

describe('generatePeriodizedRoutine — invariants & guards', () => {
  it('preserves exerciseId, setPattern, patternConfig untouched', () => {
    const out = generatePeriodizedRoutine({
      baseName: 'Push Day',
      baseItems: BASE_ITEMS,
      template: LINEAR_TEMPLATE,
      weekIndex: 1,
    });
    expect(out.items.map((i) => i.exerciseId)).toEqual([
      'ex-bench',
      'ex-row',
      'ex-curl',
    ]);
    expect(out.items[1].setPattern).toBe('5x5');
    expect(out.items[1].patternConfig).toBe('{"foo":"bar"}');
    expect(out.items[2].setPattern).toBe('drop_set');
  });

  it('preserves additional caller-defined fields (generic T extends)', () => {
    interface ExtendedItem extends PeriodizedRoutineItemInput {
      exerciseName: string;
    }
    const items: ExtendedItem[] = [
      {
        exerciseId: 'ex-1',
        targetSets: 3,
        targetReps: '8',
        exerciseName: 'Bench Press',
      },
    ];
    const out = generatePeriodizedRoutine({
      baseName: 'X',
      baseItems: items,
      template: LINEAR_TEMPLATE,
      weekIndex: 1,
    });
    expect(out.items[0].exerciseName).toBe('Bench Press');
  });

  it('does not mutate the input baseItems', () => {
    const items: PeriodizedRoutineItemInput[] = [
      { exerciseId: 'ex-1', targetSets: 3, targetReps: '8' },
    ];
    generatePeriodizedRoutine({
      baseName: 'X',
      baseItems: items,
      template: LINEAR_TEMPLATE,
      weekIndex: 1,
    });
    expect(items[0].targetSets).toBe(3);
    expect(items[0].targetReps).toBe('8');
  });

  it('returns an empty items array when baseItems is empty', () => {
    const out = generatePeriodizedRoutine({
      baseName: 'X',
      baseItems: [],
      template: LINEAR_TEMPLATE,
      weekIndex: 1,
    });
    expect(out.items).toEqual([]);
    expect(out.name).toBe('[Linear W1] X');
  });

  it('throws on weekIndex 0', () => {
    expect(() =>
      generatePeriodizedRoutine({
        baseName: 'X',
        baseItems: BASE_ITEMS,
        template: LINEAR_TEMPLATE,
        weekIndex: 0,
      }),
    ).toThrow(/out of range/);
  });

  it('throws on weekIndex above durationWeeks (e.g. 5 for Linear)', () => {
    expect(() =>
      generatePeriodizedRoutine({
        baseName: 'X',
        baseItems: BASE_ITEMS,
        template: LINEAR_TEMPLATE,
        weekIndex: 5,
      }),
    ).toThrow(/out of range/);
  });

  it('throws on non-integer weekIndex', () => {
    expect(() =>
      generatePeriodizedRoutine({
        baseName: 'X',
        baseItems: BASE_ITEMS,
        template: LINEAR_TEMPLATE,
        weekIndex: 1.5,
      }),
    ).toThrow(/out of range/);
  });

  it('throws when DUP is invoked without a sessionLabel', () => {
    expect(() =>
      generatePeriodizedRoutine({
        baseName: 'X',
        baseItems: BASE_ITEMS,
        template: DUP_TEMPLATE,
        weekIndex: 1,
      }),
    ).toThrow(/DUP template requires sessionLabel/);
  });

  it('throws when Linear is invoked WITH a sessionLabel (caller misuse)', () => {
    // sessionLabel is typed as optional at the input boundary
    // (otherwise spawnAllPeriodizedRoutines couldn't omit it for
    // Linear/Block in a uniform call shape). The runtime guard is
    // what enforces "DUP-only"; this test pins that guard.
    expect(() =>
      generatePeriodizedRoutine({
        baseName: 'X',
        baseItems: BASE_ITEMS,
        template: LINEAR_TEMPLATE,
        weekIndex: 1,
        sessionLabel: 'Heavy',
      }),
    ).toThrow(/only valid for DUP/);
  });
});

// ---------------------------------------------------------------------------
// 3. spawnAllPeriodizedRoutines
// ---------------------------------------------------------------------------

describe('spawnAllPeriodizedRoutines', () => {
  it('Linear template → 4 outputs, one per week', () => {
    const out = spawnAllPeriodizedRoutines({
      baseName: 'Push',
      baseItems: BASE_ITEMS,
      template: LINEAR_TEMPLATE,
    });
    expect(out).toHaveLength(4);
    expect(out.map((o) => o.name)).toEqual([
      '[Linear W1] Push',
      '[Linear W2] Push',
      '[Linear W3] Push',
      '[Linear W4] Push',
    ]);
  });

  it('Block template → 12 outputs, one per week, in order', () => {
    const out = spawnAllPeriodizedRoutines({
      baseName: 'Push',
      baseItems: BASE_ITEMS,
      template: BLOCK_TEMPLATE,
    });
    expect(out).toHaveLength(12);
    expect(out[0].name).toBe('[Block W1] Push');
    expect(out[11].name).toBe('[Block W12] Push');
  });

  it('DUP template → 12 outputs (4 weeks × 3 sessions, Heavy → Medium → Light per week)', () => {
    const out = spawnAllPeriodizedRoutines({
      baseName: 'Push',
      baseItems: BASE_ITEMS,
      template: DUP_TEMPLATE,
    });
    expect(out).toHaveLength(12);
    expect(out.slice(0, 3).map((o) => o.name)).toEqual([
      '[DUP W1 Heavy] Push',
      '[DUP W1 Medium] Push',
      '[DUP W1 Light] Push',
    ]);
    expect(out[11].name).toBe('[DUP W4 Light] Push');
  });

  it('every output preserves baseItems.length', () => {
    const out = spawnAllPeriodizedRoutines({
      baseName: 'Push',
      baseItems: BASE_ITEMS,
      template: BLOCK_TEMPLATE,
    });
    for (const o of out) {
      expect(o.items).toHaveLength(BASE_ITEMS.length);
    }
  });

  it('every output name is unique', () => {
    for (const template of [LINEAR_TEMPLATE, BLOCK_TEMPLATE, DUP_TEMPLATE]) {
      const out = spawnAllPeriodizedRoutines({
        baseName: 'Push',
        baseItems: BASE_ITEMS,
        template,
      });
      const names = out.map((o) => o.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('preserves exerciseId order across all outputs', () => {
    const out = spawnAllPeriodizedRoutines({
      baseName: 'Push',
      baseItems: BASE_ITEMS,
      template: LINEAR_TEMPLATE,
    });
    for (const o of out) {
      expect(o.items.map((i) => i.exerciseId)).toEqual([
        'ex-bench',
        'ex-row',
        'ex-curl',
      ]);
    }
  });

  // Codex review pass 1 / Important — spawnAllPeriodizedRoutines must
  // fail fast on a malformed DUP template (missing/empty sessions on
  // any week), not silently emit fewer outputs. Prior to the fix,
  // `week.sessions ?? []` would let a 4-week DUP template that drifted
  // to a 3-session-week produce 11 outputs instead of 12 with no
  // signal to the caller. The fixed contract throws same-shape error
  // as generatePeriodizedRoutine.
  it('throws when a DUP template week has missing sessions (constant drift)', () => {
    const malformed: PeriodizationTemplate = {
      id: 'dup',
      nameJa: 'broken',
      description: 'broken',
      durationWeeks: 1,
      weeks: [{ weekIndex: 1 }], // no sessions field
    };
    expect(() =>
      spawnAllPeriodizedRoutines({
        baseName: 'X',
        baseItems: BASE_ITEMS,
        template: malformed,
      }),
    ).toThrow(/missing sessions/);
  });

  it('throws when a DUP template week has empty sessions array', () => {
    const malformed: PeriodizationTemplate = {
      id: 'dup',
      nameJa: 'broken',
      description: 'broken',
      durationWeeks: 1,
      weeks: [{ weekIndex: 1, sessions: [] }],
    };
    expect(() =>
      spawnAllPeriodizedRoutines({
        baseName: 'X',
        baseItems: BASE_ITEMS,
        template: malformed,
      }),
    ).toThrow(/missing sessions/);
  });
});
