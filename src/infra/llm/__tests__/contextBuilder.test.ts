// v1.5 Stage 1 Phase 1.1 — contextBuilder tests.
//
// The full `buildUserContext` exercises four repositories; the
// repositories themselves are exercised by their own test files.
// Here we focus on the pure sub-builders, which are exported for
// exactly this purpose:
//   - buildProfileSnapshot (ageRange bucket + PII projection)
//   - buildTargetsSnapshot (null-safe defaults)
//
// The contextBuilder module transitively imports profileRepository
// → connection.ts → expo-sqlite, which the jest runtime can't
// resolve. Stub the database boundary so the pure-function tests
// here don't drag the native module chain.

jest.mock('../../database/connection', () => ({
  getDatabase: jest.fn(),
}));
jest.mock('../../repositories/profileRepository', () => ({
  getProfile: jest.fn(),
}));
jest.mock('../../repositories/nutritionRepository', () => ({
  getDailyNutritionSummary: jest.fn(),
}));
jest.mock('../../repositories/workoutRepository', () => ({
  getRecentSessionCount: jest.fn(),
}));
jest.mock('../../repositories/bodyLogRepository', () => ({
  getBodyLogs: jest.fn(),
}));

import {
  buildProfileSnapshot,
  buildTargetsSnapshot,
} from '../contextBuilder';

const NOW = new Date('2026-05-17T00:00:00Z');

describe('buildProfileSnapshot', () => {
  const baseProfile = {
    gender: 'male' as const,
    birthYear: 1996,
    heightCm: 175,
    currentWeightKg: 72,
    goalType: 'cut' as const,
    activityLevel: 'moderate' as const,
    trainingDaysPerWeek: 4,
  };

  it('projects birthYear into a 5-year AgeRange bucket', () => {
    const s = buildProfileSnapshot(baseProfile, NOW);
    expect(s.ageRange).toBe('30-34');
  });

  it('forwards sex / heightCm / weightKg verbatim', () => {
    const s = buildProfileSnapshot(baseProfile, NOW);
    expect(s.sex).toBe('male');
    expect(s.heightCm).toBe(175);
    expect(s.weightKg).toBe(72);
  });

  it('forwards goal / activity / trainingDays', () => {
    const s = buildProfileSnapshot(baseProfile, NOW);
    expect(s.goalType).toBe('cut');
    expect(s.activityLevel).toBe('moderate');
    expect(s.trainingDaysPerWeek).toBe(4);
  });

  it('NEVER exposes birthYear directly in the snapshot shape', () => {
    const s = buildProfileSnapshot(baseProfile, NOW);
    // The TypeScript ProfileSnapshot doesn't have a birthYear
    // field; this is the runtime defense.
    expect((s as unknown as Record<string, unknown>).birthYear).toBeUndefined();
  });
});

describe('buildTargetsSnapshot', () => {
  it('forwards provided targets', () => {
    const t = buildTargetsSnapshot({
      targetCalories: 2200,
      targetProteinG: 160,
      targetFatG: 61,
      targetCarbG: 248,
    });
    expect(t).toEqual({
      calories: 2200,
      proteinG: 160,
      fatG: 61,
      carbG: 248,
    });
  });

  it('defaults missing targets to 0', () => {
    const t = buildTargetsSnapshot({});
    expect(t).toEqual({ calories: 0, proteinG: 0, fatG: 0, carbG: 0 });
  });

  it('treats null as missing (0 default)', () => {
    const t = buildTargetsSnapshot({
      targetCalories: null,
      targetProteinG: 120,
      targetFatG: null,
      targetCarbG: 200,
    });
    expect(t.calories).toBe(0);
    expect(t.proteinG).toBe(120);
    expect(t.fatG).toBe(0);
    expect(t.carbG).toBe(200);
  });
});
