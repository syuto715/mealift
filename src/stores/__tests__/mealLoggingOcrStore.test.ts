// v1.4 ステージ 4 Phase 4D + 4E-1 — mealLoggingOcrStore tests.

import { useMealLoggingOcrStore } from '../mealLoggingOcrStore';
import type { ParsedNutritionLabel } from '../../domain/submission/nutritionLabelParser';
import type { RecipeDecomposition } from '../../infra/services/aiNutritionService';

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

function makeVisionResult(
  overrides: Partial<RecipeDecomposition> = {},
): RecipeDecomposition {
  return {
    dishName: 'カレーライス',
    servingDescription: '1人前 / 約 400g',
    ingredients: [
      { name: '白米', amountG: 200 },
      { name: '玉ねぎ', amountG: 50 },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  useMealLoggingOcrStore.getState().clearPendingResult();
  useMealLoggingOcrStore.getState().clearPendingVisionResult();
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

// Phase 4E-1 — Vision channel parallel to the OCR channel. Both
// channels share the same store so add.tsx's useFocusEffect can drain
// them in priority order, but they must be independently consumable
// and not bleed across each other.

describe('useMealLoggingOcrStore — Vision channel', () => {
  it('starts with null pendingVisionResult', () => {
    expect(
      useMealLoggingOcrStore.getState().pendingVisionResult,
    ).toBeNull();
  });

  it('setPendingVisionResult writes value', () => {
    const value = makeVisionResult();
    useMealLoggingOcrStore.getState().setPendingVisionResult(value);
    expect(useMealLoggingOcrStore.getState().pendingVisionResult).toBe(value);
  });

  it('consumePendingVisionResult returns value + clears state atomically', () => {
    const value = makeVisionResult({ dishName: '親子丼' });
    useMealLoggingOcrStore.getState().setPendingVisionResult(value);

    const consumed = useMealLoggingOcrStore
      .getState()
      .consumePendingVisionResult();
    expect(consumed).toBe(value);
    expect(useMealLoggingOcrStore.getState().pendingVisionResult).toBeNull();
  });

  it('consumePendingVisionResult is idempotent — second call returns null', () => {
    useMealLoggingOcrStore.getState().setPendingVisionResult(makeVisionResult());
    expect(
      useMealLoggingOcrStore.getState().consumePendingVisionResult(),
    ).not.toBeNull();
    expect(
      useMealLoggingOcrStore.getState().consumePendingVisionResult(),
    ).toBeNull();
  });

  it('OCR and Vision channels are isolated — consuming one leaves the other intact', () => {
    const ocr = makeResult({ calories: 250 });
    const vision = makeVisionResult({ dishName: 'ハンバーグ' });
    useMealLoggingOcrStore.getState().setPendingResult(ocr);
    useMealLoggingOcrStore.getState().setPendingVisionResult(vision);

    const consumedOcr = useMealLoggingOcrStore
      .getState()
      .consumePendingResult();
    expect(consumedOcr).toBe(ocr);
    expect(useMealLoggingOcrStore.getState().pendingVisionResult).toBe(vision);

    const consumedVision = useMealLoggingOcrStore
      .getState()
      .consumePendingVisionResult();
    expect(consumedVision).toBe(vision);
  });

  it('clearPendingVisionResult drops the value without affecting OCR', () => {
    const ocr = makeResult();
    const vision = makeVisionResult();
    useMealLoggingOcrStore.getState().setPendingResult(ocr);
    useMealLoggingOcrStore.getState().setPendingVisionResult(vision);

    useMealLoggingOcrStore.getState().clearPendingVisionResult();
    expect(useMealLoggingOcrStore.getState().pendingResult).toBe(ocr);
    expect(useMealLoggingOcrStore.getState().pendingVisionResult).toBeNull();
  });
});
