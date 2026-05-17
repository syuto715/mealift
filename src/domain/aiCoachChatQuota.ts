// v1.5 Stage 1 Phase 1.2 — pure quota derivation.
//
// Lives in `src/domain/` so the unit test can exercise it without
// dragging the React rendering layer (the hook wrapper lives in
// `src/hooks/useAiCoachChatQuota.ts`).

export interface AiCoachChatQuota {
  limit: number;
  used: number;
  remaining: number;
  isUnlimited: boolean;
  isExhausted: boolean;
}

export function computeAiCoachChatQuota(
  limit: number,
  used: number,
): AiCoachChatQuota {
  const isUnlimited = limit === -1;
  const remaining = isUnlimited
    ? Number.POSITIVE_INFINITY
    : Math.max(0, limit - used);
  return {
    limit,
    used,
    remaining,
    isUnlimited,
    isExhausted: !isUnlimited && remaining <= 0,
  };
}
