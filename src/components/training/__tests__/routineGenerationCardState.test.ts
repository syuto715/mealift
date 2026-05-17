// v1.5 Stage 1 Phase 1.5 — pure state-derivation tests.

jest.mock('../../../infra/supabase/client', () => ({ supabase: null }));

import { pickRoutineGenCardState } from '../routineGenerationCardState';
import { AIError } from '../../../infra/services/aiNutritionService';
import type { LocalRoutineGeneration } from '../../../types/routineGeneration';

const FAKE_DRAFT: LocalRoutineGeneration = {
  id: 'g-1',
  userId: 'u-1',
  promptContext: { intentText: 'x', exerciseSlugs: ['a'] },
  generatedRoutine: {
    routineName: 'プッシュ日',
    items: [
      { exerciseSlug: 'bench-press', targetSets: 3, targetReps: '8-12' },
    ],
  },
  status: 'draft',
  appliedRoutineId: null,
  createdAt: '2026-05-17T00:00:00Z',
  appliedAt: null,
};

describe('pickRoutineGenCardState', () => {
  it('free user (no access) → locked, regardless of other signals', () => {
    expect(
      pickRoutineGenCardState({
        hasAccess: false,
        isGenerating: false,
        isApplying: false,
        error: null,
        currentDraft: null,
      }),
    ).toBe('locked');
    expect(
      pickRoutineGenCardState({
        hasAccess: false,
        isGenerating: true,
        isApplying: false,
        error: new AIError('internal_error', 'x', 500),
        currentDraft: FAKE_DRAFT,
      }),
    ).toBe('locked');
  });

  it('applying takes precedence over generating', () => {
    expect(
      pickRoutineGenCardState({
        hasAccess: true,
        isGenerating: true,
        isApplying: true,
        error: null,
        currentDraft: FAKE_DRAFT,
      }),
    ).toBe('applying');
  });

  it('generating takes precedence over an existing draft (regenerating)', () => {
    expect(
      pickRoutineGenCardState({
        hasAccess: true,
        isGenerating: true,
        isApplying: false,
        error: null,
        currentDraft: FAKE_DRAFT,
      }),
    ).toBe('generating');
  });

  it('a draft in status=draft → preview', () => {
    expect(
      pickRoutineGenCardState({
        hasAccess: true,
        isGenerating: false,
        isApplying: false,
        error: null,
        currentDraft: FAKE_DRAFT,
      }),
    ).toBe('preview');
  });

  it('an applied draft is NOT preview (state machine has moved on) → idle', () => {
    expect(
      pickRoutineGenCardState({
        hasAccess: true,
        isGenerating: false,
        isApplying: false,
        error: null,
        currentDraft: { ...FAKE_DRAFT, status: 'applied' },
      }),
    ).toBe('idle');
  });

  it('error + no draft → error', () => {
    expect(
      pickRoutineGenCardState({
        hasAccess: true,
        isGenerating: false,
        isApplying: false,
        error: new AIError('gemini_error', 'fail', 502),
        currentDraft: null,
      }),
    ).toBe('error');
  });

  it('error + draft → preview (draft beats error)', () => {
    expect(
      pickRoutineGenCardState({
        hasAccess: true,
        isGenerating: false,
        isApplying: false,
        error: new AIError('gemini_error', 'fail', 502),
        currentDraft: FAKE_DRAFT,
      }),
    ).toBe('preview');
  });

  it('idle fallback', () => {
    expect(
      pickRoutineGenCardState({
        hasAccess: true,
        isGenerating: false,
        isApplying: false,
        error: null,
        currentDraft: null,
      }),
    ).toBe('idle');
  });
});
