// v1.4 ステージ 4 Phase 4D — mealLoggingOcrStore tests.

import { useMealLoggingOcrStore } from '../mealLoggingOcrStore';
import type { ParsedNutritionLabel } from '../../domain/submission/nutritionLabelParser';

function makeResult(
  overrides: Partial<ParsedNutritionLabel> = {},
): ParsedNutritionLabel {
  return {
    perBasis: 'per_100g',
    perBasisRaw: '100g当たり',
    calories: 200,
    proteinG: 10,
    fatG: 5,
    carbG: 30,
    saltG: null,
    sodiumMg: null,
    fiberG: null,
    sugarG: null,
    saturatedFatG: null,
    ...overrides,
  } as ParsedNutritionLabel;
}

beforeEach(() => {
  useMealLoggingOcrStore.getState().clearPendingResult();
});

describe('useMealLoggingOcrStore', () => {
  it('starts with null pendingResult', () => {
    expect(useMealLoggingOcrStore.getState().pendingResult).toBeNull();
  });

  it('setPendingResult writes value', () => {
    const value = makeResult();
    useMealLoggingOcrStore.getState().setPendingResult(value);
    expect(useMealLoggingOcrStore.getState().pendingResult).toBe(value);
  });

  it('consumePendingResult returns value + clears state atomically', () => {
    const value = makeResult({ calories: 350 });
    useMealLoggingOcrStore.getState().setPendingResult(value);

    const consumed = useMealLoggingOcrStore.getState().consumePendingResult();
    expect(consumed).toBe(value);
    expect(useMealLoggingOcrStore.getState().pendingResult).toBeNull();
  });

  it('consumePendingResult returns null when nothing is pending', () => {
    expect(
      useMealLoggingOcrStore.getState().consumePendingResult(),
    ).toBeNull();
  });

  it('consumePendingResult called twice in a row only returns value once (StrictMode/fast-refresh defense)', () => {
    const value = makeResult();
    useMealLoggingOcrStore.getState().setPendingResult(value);

    expect(useMealLoggingOcrStore.getState().consumePendingResult()).toBe(value);
    expect(
      useMealLoggingOcrStore.getState().consumePendingResult(),
    ).toBeNull();
  });

  it('clearPendingResult drops a pending value without returning it', () => {
    useMealLoggingOcrStore.getState().setPendingResult(makeResult());
    useMealLoggingOcrStore.getState().clearPendingResult();
    expect(useMealLoggingOcrStore.getState().pendingResult).toBeNull();
  });

  it('multiple setPendingResult calls overwrite prior value', () => {
    const first = makeResult({ calories: 100 });
    const second = makeResult({ calories: 999 });

    useMealLoggingOcrStore.getState().setPendingResult(first);
    useMealLoggingOcrStore.getState().setPendingResult(second);

    expect(useMealLoggingOcrStore.getState().pendingResult).toBe(second);
  });
});
