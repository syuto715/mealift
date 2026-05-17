// v1.5 Stage 1 Phase 1.3 — diagnostic answer → intent text.
//
// Pure function. Composes a natural-language intent text from the
// wizard answers so the existing Phase 1.5 coach-routine EF can be
// re-used without modification (Option B — Drafting 108 cross-EF
// audit avoidance). The output goes into the EF's `intentText`
// parameter; the EF prompts Gemini with the same template as the
// inline RoutineGenerationCard input.

import { DIAGNOSTIC_QUESTIONS } from './diagnosticQuestions';
import type {
  DiagnosticAnswers,
  DiagnosticAnswerValue,
} from '../types/diagnostic';

const EXPERIENCE_LABEL: Record<string, string> = {
  beginner: '初心者',
  intermediate: '中級者',
  advanced: '上級者',
};

const GOAL_LABEL: Record<string, string> = {
  cut: '体脂肪減',
  bulk: '増量',
  maintain: '維持',
  recomp: 'リコンプ',
};

const EQUIPMENT_LABEL: Record<string, string> = {
  bodyweight: '自重',
  dumbbell: 'ダンベル',
  barbell: 'バーベル',
  machine: 'マシン',
  cable: 'ケーブル',
  kettlebell: 'ケトルベル',
};

const FOCUS_LABEL: Record<string, string> = {
  chest: '胸',
  back: '背中',
  legs: '脚',
  shoulders: '肩',
  arms: '腕',
  core: '体幹',
};

function lookup(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}

function asString(value: DiagnosticAnswerValue | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: DiagnosticAnswerValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(
  value: DiagnosticAnswerValue | undefined,
): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : [];
}

/** Composes a single-line intent text from the answer map. The
 *  output mirrors what a user would type into the inline
 *  RoutineGenerationCard intent input — Gemini's prompt template
 *  is identical, so no EF code change is needed. */
export function buildIntentText(answers: DiagnosticAnswers): string {
  const parts: string[] = [];

  const experience = asString(answers.experience);
  if (experience) parts.push(lookup(EXPERIENCE_LABEL, experience));

  const goal = asString(answers.goal);
  if (goal) parts.push(`目的: ${lookup(GOAL_LABEL, goal)}`);

  const frequency = asNumber(answers.frequency);
  if (frequency !== null) parts.push(`週${frequency}回`);

  const duration = asString(answers.duration);
  if (duration) parts.push(`1 回 ${duration} 分`);

  const equipment = asStringArray(answers.equipment);
  if (equipment.length > 0) {
    const labels = equipment.map((v) => lookup(EQUIPMENT_LABEL, v));
    parts.push(`機材: ${labels.join(' / ')}`);
  }

  const limitations = asString(answers.limitations);
  if (limitations && limitations !== '特になし') {
    parts.push(`制限: ${limitations}`);
  }

  const focus = asStringArray(answers.focus);
  if (focus.length > 0) {
    const labels = focus.map((v) => lookup(FOCUS_LABEL, v));
    parts.push(`重点: ${labels.join(' / ')}`);
  }

  return parts.length > 0
    ? parts.join('、 ')
    : 'バランスのとれたルーティンを作ってください';
}

/** Returns the list of required-but-unanswered question ids.
 *  Currently used by `diagnosticStore.test.ts` for coverage; the
 *  step screen itself gates the CTA via a local `canAdvance`
 *  check derived from the current question's value, so this
 *  helper isn't called at runtime today. It's kept exported for
 *  a future "review answers" surface that might want to flag
 *  every required-but-missing question in one pass. */
export function listUnansweredRequired(
  answers: DiagnosticAnswers,
): string[] {
  return DIAGNOSTIC_QUESTIONS.filter((q) => q.required)
    .filter((q) => {
      const v = answers[q.id];
      if (v === undefined || v === null) return true;
      if (typeof v === 'string') return v.length === 0;
      if (Array.isArray(v)) return v.length === 0;
      return false;
    })
    .map((q) => q.id);
}
