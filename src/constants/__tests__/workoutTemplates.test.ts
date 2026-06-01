// v1.5.2 Sprint 2 — guard: every starter-template exercise must reference a
// REAL exercise ID from EXERCISES (the "既存 slug のみ" constraint). A typo'd
// ID would otherwise ship a template whose item silently fails to resolve at
// session-build time.

import { WORKOUT_TEMPLATES, getWorkoutTemplateById } from '../workoutTemplates';
import { EXERCISES } from '../exercises';

const EXERCISE_IDS = new Set(EXERCISES.map((e) => e.id));

describe('WORKOUT_TEMPLATES', () => {
  it('defines the 5 approved starter templates', () => {
    expect(WORKOUT_TEMPLATES).toHaveLength(5);
    expect(WORKOUT_TEMPLATES.map((t) => t.id)).toEqual([
      'tpl_home_fullbody_15',
      'tpl_gym_beginner_30',
      'tpl_upper_body',
      'tpl_leg_day',
      'tpl_cardio_fatloss',
    ]);
  });

  it('every template has a non-empty exercise list', () => {
    for (const t of WORKOUT_TEMPLATES) {
      expect(t.exercises.length).toBeGreaterThan(0);
    }
  });

  it('every exercise ID resolves to a real EXERCISES entry (no fabricated slugs)', () => {
    for (const t of WORKOUT_TEMPLATES) {
      for (const item of t.exercises) {
        expect(EXERCISE_IDS.has(item.exerciseId)).toBe(true);
      }
    }
  });

  it('targetSets is positive and targetReps is a non-empty string', () => {
    for (const t of WORKOUT_TEMPLATES) {
      for (const item of t.exercises) {
        expect(item.targetSets).toBeGreaterThan(0);
        expect(item.targetReps.length).toBeGreaterThan(0);
      }
    }
  });

  it('getWorkoutTemplateById resolves known + unknown ids', () => {
    expect(getWorkoutTemplateById('tpl_leg_day')?.name).toBe('脚トレ');
    expect(getWorkoutTemplateById('nope')).toBeUndefined();
  });
});
