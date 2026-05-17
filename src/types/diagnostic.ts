// v1.5 Stage 1 Phase 1.3 — diagnostic types.
//
// SSoT: docs/plans/v1.5_stage_1_ai_chat_epic.md §3 surface ② +
// §10 Phase 1.3.
//
// The diagnostic is a wizard that collects 5-8 structured answers
// then routes the user to Phase 1.5's coach-routine EF via the
// intent-text composing path (Option B in the kickoff prompt). The
// EF stays untouched (Drafting 108 — avoid cross-EF audit risk).

export type DiagnosticAnswerValue = string | string[] | number;

export type DiagnosticQuestionType =
  | 'single' /* radio — one option from a list */
  | 'multi' /* checkbox — zero+ options from a list */
  | 'number' /* numeric stepper */
  | 'text'; /* free-text input */

export interface DiagnosticOption {
  value: string;
  label: string;
}

export interface DiagnosticQuestion {
  id: string;
  type: DiagnosticQuestionType;
  /** Wizard step prompt rendered above the input. */
  label: string;
  /** Optional clarifying hint rendered below the label. */
  hint?: string;
  /** For 'single' / 'multi'. */
  options?: DiagnosticOption[];
  /** Default for 'number' (e.g. trainingDaysPerWeek = 3). */
  defaultNumber?: number;
  /** Min / max for 'number'. */
  min?: number;
  max?: number;
  /** Max characters for 'text'. */
  maxLength?: number;
  /** If true, the user must answer before advancing. */
  required: boolean;
}

export type DiagnosticAnswers = Record<string, DiagnosticAnswerValue>;
