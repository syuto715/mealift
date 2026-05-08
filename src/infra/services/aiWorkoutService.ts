import {
  AIError,
  type AIErrorCode,
  callEdgeFunction,
} from './aiNutritionService';

// Build 15 / Session 8 / Feature 5-元 — client wrapper around the
// generate-workout-menu Edge Function (Phase 4).
//
// Reuses callEdgeFunction + AIError from aiNutritionService so the
// auth + structured-error parsing stays uniform across every AI EF.
// AIWorkoutError is a thin re-throw class so Phase 6 UI catches can
// `instanceof AIWorkoutError` to discriminate menu errors from
// nutrition errors.

// === §7.1 response schema (literal type) ===
// Matches the validateGeneratedProgram shape on the EF side. Stays
// in lockstep with supabase/functions/generate-workout-menu/index.ts.

export type SplitType =
  | 'full_body'
  | 'upper_lower'
  | 'ppl'
  | 'bro_split'
  | 'custom';

export interface WorkoutBlock {
  exerciseSlug: string;
  sets: number;
  repRangeMin: number;
  repRangeMax: number;
  targetRPE: number;
  restSeconds: number;
  notes: string | null;
}

export interface WorkoutDay {
  dayLabel: string;
  blocks: WorkoutBlock[];
}

export interface WorkoutWeek {
  weekIndex: number;
  deload: boolean;
  days: WorkoutDay[];
}

export interface GeneratedProgram {
  programName: string;
  durationWeeks: number;
  splitType: SplitType;
  weeks: WorkoutWeek[];
}

export interface GenerateMenuRequest {
  targetMuscles: string[];
  durationMinutes: number;
  exerciseSlugs: string[];
}

// === Error class ===

export class AIWorkoutError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AIWorkoutError';
  }
}

// Map raw AIError codes (sibling nutrition pipeline + 5-元 additions)
// to user-facing Japanese strings + a stable code surface for the
// UI's error-rendering switch.
export const ERROR_MESSAGE_BY_CODE: Record<string, string> = {
  unauthorized: 'ログインが必要です',
  invalid_token: 'セッションが切れました。再ログインしてください',
  invalid_request: 'リクエスト内容に不備があります',
  no_equipment: 'ジム器具設定で少なくとも1つの器具を有効にしてください',
  quota_exceeded: '今月の AI メニュー生成回数が上限に達しました',
  gemini_error: 'AI 生成に失敗しました。再試行してください',
  validation_failed: 'AI が想定外の形式の応答を返しました。再試行してください',
  internal_error: 'サーバーエラーが発生しました',
  network_error: 'ネットワーク接続を確認してください',
  not_configured: 'サーバー接続が設定されていません',
  aborted: 'リクエストを中止しました',
};

function rethrowAsWorkoutError(err: unknown): never {
  if (err instanceof AIError) {
    const userMessage = ERROR_MESSAGE_BY_CODE[err.code] ?? err.message;
    throw new AIWorkoutError(err.code, userMessage, err.status, err.details);
  }
  throw new AIWorkoutError(
    'internal_error',
    err instanceof Error ? err.message : 'unknown error',
    500,
  );
}

// === Top-level entry ===

// Calls the generate-workout-menu EF and returns the parsed program.
// EF-side validation already enforces §7.1 shape — we trust the
// payload here and surface any mismatch via the existing
// 502 'validation_failed' path (rethrown as AIWorkoutError).
//
// `signal` is an optional AbortSignal forwarded to fetch — Phase 6 UI
// passes one wired to a cancel button so the user can abort cold-start
// Gemini calls. Aborted requests surface as AIWorkoutError(code='aborted').
export async function generateAIWorkoutMenu(
  request: GenerateMenuRequest,
  options?: { signal?: AbortSignal },
): Promise<GeneratedProgram> {
  try {
    const response = await callEdgeFunction<
      GenerateMenuRequest,
      GeneratedProgram
    >('generate-workout-menu', request, options);

    if (!response || typeof response.programName !== 'string') {
      throw new AIWorkoutError(
        'validation_failed',
        'AI が想定外の形式の応答を返しました',
        502,
      );
    }

    return response;
  } catch (err) {
    if (err instanceof AIWorkoutError) throw err;
    rethrowAsWorkoutError(err);
  }
}

// Re-export the raw error code union so consumers (Phase 6 UI catch
// blocks, future error-render switches) can pattern-match without
// dragging in aiNutritionService directly.
export type { AIErrorCode };
