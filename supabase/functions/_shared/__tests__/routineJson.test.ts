// v1.5 Stage 1 Phase 1.5 — routineJson validator tests.
//
// The validator lives Deno-side; this Node-side test re-imports it
// (the file is pure TS with no Deno-only globals so jest can run
// it directly).

import {
  projectGeneratedRoutine,
  validateGeneratedRoutine,
} from '../routineJson';

function validRoutine(overrides: Record<string, unknown> = {}) {
  return {
    routineName: '胸 + 三頭 のプッシュ日',
    items: [
      { exerciseSlug: 'bench-press', targetSets: 3, targetReps: '8-12' },
      { exerciseSlug: 'overhead-press', targetSets: 3, targetReps: '6-10' },
    ],
    ...overrides,
  };
}

describe('validateGeneratedRoutine', () => {
  it('accepts a well-formed routine', () => {
    expect(validateGeneratedRoutine(validRoutine())).toBeNull();
  });

  it('rejects non-objects + missing routineName', () => {
    expect(validateGeneratedRoutine(null)).toMatch(/not an object/);
    expect(validateGeneratedRoutine('string')).toMatch(/not an object/);
    expect(validateGeneratedRoutine(validRoutine({ routineName: '' }))).toMatch(
      /routineName/,
    );
  });

  it('rejects empty / oversized items array', () => {
    expect(validateGeneratedRoutine(validRoutine({ items: [] }))).toMatch(
      /items/,
    );
    const tooMany = Array.from({ length: 40 }, () => ({
      exerciseSlug: 'x',
      targetSets: 3,
      targetReps: '8-12',
    }));
    expect(validateGeneratedRoutine(validRoutine({ items: tooMany }))).toMatch(
      /items/,
    );
  });

  it('rejects targetSets out of range', () => {
    expect(
      validateGeneratedRoutine(
        validRoutine({
          items: [
            { exerciseSlug: 'a', targetSets: 0, targetReps: '8-12' },
          ],
        }),
      ),
    ).toMatch(/targetSets/);
    expect(
      validateGeneratedRoutine(
        validRoutine({
          items: [
            { exerciseSlug: 'a', targetSets: 99, targetReps: '8-12' },
          ],
        }),
      ),
    ).toMatch(/targetSets/);
  });

  it('rejects non-string targetReps + non-string exerciseSlug', () => {
    expect(
      validateGeneratedRoutine(
        validRoutine({
          items: [{ exerciseSlug: 'a', targetSets: 3, targetReps: 10 }],
        }),
      ),
    ).toMatch(/targetReps/);
    expect(
      validateGeneratedRoutine(
        validRoutine({
          items: [{ exerciseSlug: '', targetSets: 3, targetReps: '8' }],
        }),
      ),
    ).toMatch(/exerciseSlug/);
  });

  it('accepts optional notes when present + within bounds', () => {
    expect(
      validateGeneratedRoutine(
        validRoutine({
          items: [
            {
              exerciseSlug: 'a',
              targetSets: 3,
              targetReps: '8-12',
              notes: 'コアを締めて',
            },
          ],
        }),
      ),
    ).toBeNull();
  });
});

describe('projectGeneratedRoutine', () => {
  it('strips extra fields outside the allowed shape', () => {
    const raw = {
      routineName: 'プッシュ日',
      items: [
        {
          exerciseSlug: 'bench-press',
          targetSets: 3,
          targetReps: '8-12',
          notes: 'なし',
          // Smuggled extra fields should not flow through.
          maliciousField: 'payload',
          weightKg: 999,
        },
      ],
      smuggledTopLevel: 'value',
    };
    const projected = projectGeneratedRoutine(raw);
    expect(projected.routineName).toBe('プッシュ日');
    expect(projected.items).toHaveLength(1);
    const item = projected.items[0];
    expect(item.exerciseSlug).toBe('bench-press');
    expect(item.targetSets).toBe(3);
    expect(item.targetReps).toBe('8-12');
    expect(item.notes).toBe('なし');
    expect(item).not.toHaveProperty('maliciousField');
    expect(item).not.toHaveProperty('weightKg');
    expect(projected).not.toHaveProperty('smuggledTopLevel');
  });

  it('omits notes when empty / missing', () => {
    const projected = projectGeneratedRoutine({
      routineName: 'x',
      items: [
        { exerciseSlug: 'a', targetSets: 3, targetReps: '8-12' },
        { exerciseSlug: 'b', targetSets: 3, targetReps: '8-12', notes: '' },
      ],
    });
    expect(projected.items[0].notes).toBeUndefined();
    expect(projected.items[1].notes).toBeUndefined();
  });
});
