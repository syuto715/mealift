// v1.5 Stage 1 Phase 1.3 — diagnosticIntentBuilder tests.

import {
  buildIntentText,
  listUnansweredRequired,
} from '../diagnosticIntentBuilder';
import type { DiagnosticAnswers } from '../../types/diagnostic';

describe('buildIntentText', () => {
  it('composes a single-line natural-language intent from a full answer set', () => {
    const answers: DiagnosticAnswers = {
      experience: 'intermediate',
      goal: 'cut',
      frequency: 4,
      duration: '45',
      equipment: ['dumbbell', 'bodyweight'],
      limitations: '腰を痛めたことがある',
      focus: ['legs', 'core'],
    };
    const intent = buildIntentText(answers);
    expect(intent).toContain('中級者');
    expect(intent).toContain('目的: 体脂肪減');
    expect(intent).toContain('週4回');
    expect(intent).toContain('1 回 45 分');
    expect(intent).toContain('機材: ダンベル / 自重');
    expect(intent).toContain('制限: 腰を痛めたことがある');
    expect(intent).toContain('重点: 脚 / 体幹');
  });

  it('omits the "制限" segment when the user enters 「特になし」', () => {
    const answers: DiagnosticAnswers = {
      experience: 'beginner',
      goal: 'maintain',
      frequency: 2,
      duration: '30',
      equipment: ['bodyweight'],
      limitations: '特になし',
    };
    const intent = buildIntentText(answers);
    expect(intent).not.toContain('制限:');
    expect(intent).toContain('初心者');
    expect(intent).toContain('週2回');
  });

  it('falls back to a generic placeholder when no answers exist', () => {
    expect(buildIntentText({})).toBe(
      'バランスのとれたルーティンを作ってください',
    );
  });

  it('treats unknown enum values pass-through (defense-in-depth — Gemini still sees what was selected)', () => {
    const answers: DiagnosticAnswers = {
      experience: 'unrecognized',
      goal: 'cut',
      frequency: 3,
      duration: '45',
      equipment: ['dumbbell'],
      limitations: '特になし',
    };
    const intent = buildIntentText(answers);
    expect(intent).toContain('unrecognized');
    expect(intent).toContain('目的: 体脂肪減');
  });
});

describe('listUnansweredRequired', () => {
  it('returns every required question id when nothing is answered', () => {
    const missing = listUnansweredRequired({});
    expect(missing).toContain('experience');
    expect(missing).toContain('goal');
    expect(missing).toContain('frequency');
    expect(missing).toContain('duration');
    expect(missing).toContain('equipment');
    expect(missing).toContain('limitations');
    // focus is optional → must NOT appear in the missing list.
    expect(missing).not.toContain('focus');
  });

  it('returns an empty list when every required question is answered', () => {
    const answers: DiagnosticAnswers = {
      experience: 'beginner',
      goal: 'bulk',
      frequency: 3,
      duration: '45',
      equipment: ['dumbbell'],
      limitations: '特になし',
    };
    expect(listUnansweredRequired(answers)).toEqual([]);
  });

  it('treats empty strings + empty arrays as unanswered', () => {
    const answers: DiagnosticAnswers = {
      experience: '',
      goal: 'cut',
      frequency: 3,
      duration: '45',
      equipment: [],
      limitations: '特になし',
    };
    const missing = listUnansweredRequired(answers);
    expect(missing).toContain('experience');
    expect(missing).toContain('equipment');
    expect(missing).not.toContain('goal');
  });
});
