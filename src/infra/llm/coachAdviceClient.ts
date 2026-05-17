// v1.5 Stage 1 Phase 1.4 — coachAdviceClient.
//
// Client-side wrapper over the `coach-advice` Edge Function.
// Distinct from `LLMClient.generateAdvice()` (which is the
// abstract surface returning just text) — this richer wrapper
// returns the full advice envelope so the store can cache by
// `(scope, period_start)` and the UI can render a generated_at
// timestamp.

import { APP_CONFIG } from '../../constants/config';
import { supabase } from '../supabase/client';
import {
  AIError,
  type AIErrorCode,
} from '../services/aiNutritionService';
import { buildUserContext } from './contextBuilder';
import type { CoachAdviceScope } from '../../types/coachAdvice';

const COACH_ADVICE_PATH = 'functions/v1/coach-advice';

export interface CoachAdviceResponse {
  id: string;
  scope: CoachAdviceScope;
  periodStart: string;
  content: string;
  generatedAt: string;
}

async function getAccessToken(): Promise<string> {
  if (!supabase) {
    throw new AIError('not_configured', 'サーバー接続が設定されていません', 0);
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new AIError('unauthorized', 'ログインが必要です', 401);
  }
  return token;
}

export interface FetchCoachAdviceOptions {
  profileId: string;
  scope: CoachAdviceScope;
  idempotencyKey: string;
  signal?: AbortSignal;
}

export async function fetchCoachAdvice(
  options: FetchCoachAdviceOptions,
): Promise<CoachAdviceResponse> {
  const token = await getAccessToken();
  const context = await buildUserContext(options.profileId, {
    // Weekly advice looks 14 days back for workouts (matches §6.2);
    // daily looks 7 days for meal patterns + 14 days for workouts.
    mealDays: 7,
    workoutDays: 14,
  });

  let response: Response;
  try {
    response = await fetch(
      `${APP_CONFIG.SUPABASE_URL}/${COACH_ADVICE_PATH}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': options.idempotencyKey,
        },
        body: JSON.stringify({ scope: options.scope, context }),
        signal: options.signal,
      },
    );
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new AIError('aborted', 'リクエストを中止しました', 0, {
        cause: e.message,
      });
    }
    throw new AIError('network_error', 'ネットワーク接続を確認してください', 0, {
      cause: e instanceof Error ? e.message : String(e),
    });
  }

  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const errObj =
      parsed && typeof parsed === 'object'
        ? (parsed as {
            error?: string;
            message?: string;
            details?: Record<string, unknown>;
          })
        : {};
    const code = (errObj.error as AIErrorCode) ?? 'internal_error';
    const message = errObj.message ?? 'エラーが発生しました';
    throw new AIError(code, message, response.status, errObj.details);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new AIError('gemini_error', 'AI応答の形式が不正です', 502);
  }
  const obj = parsed as Partial<CoachAdviceResponse>;
  if (
    typeof obj.id !== 'string' ||
    (obj.scope !== 'weekly' && obj.scope !== 'daily') ||
    typeof obj.periodStart !== 'string' ||
    typeof obj.content !== 'string' ||
    typeof obj.generatedAt !== 'string'
  ) {
    throw new AIError('gemini_error', 'AI応答の形式が不正です', 502);
  }
  return obj as CoachAdviceResponse;
}
