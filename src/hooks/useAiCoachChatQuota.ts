// v1.5 Stage 1 Phase 1.2 — useAiCoachChatQuota.
//
// Reactive surface for the "今月の残り N / M" badge on the chat
// screen + the quota-exhausted ProInlineCTA gate. The limit comes
// from `useSubscription().aiCoachChatMonthlyLimit` (tier-derived,
// pure function of the Profile row). The used count comes from
// `chatStore.userMessagesThisMonth`, which mirrors the SQLite v31
// read-cache's role='user' rows in the current UTC month — the
// same window the server's `coach-chat` EF accounts against in
// `ai_usage_logs`.
//
// The actual quota derivation lives in `src/domain/aiCoachChatQuota`
// so the unit test (under `src/domain/__tests__/`) can run without
// the React rendering layer (RNTL isn't wired in this repo yet —
// see `feedback_test_infrastructure_gap` memory).

import { useSubscription } from './useSubscription';
import { useChatStore } from '../stores/chatStore';
import {
  computeAiCoachChatQuota,
  type AiCoachChatQuota,
} from '../domain/aiCoachChatQuota';

export type { AiCoachChatQuota };
export { computeAiCoachChatQuota };

export function useAiCoachChatQuota(): AiCoachChatQuota {
  const limit = useSubscription().aiCoachChatMonthlyLimit;
  const used = useChatStore((s) => s.userMessagesThisMonth);
  return computeAiCoachChatQuota(limit, used);
}
