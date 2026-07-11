// P2-2 follow-up (Codex 遡及review round 1 Critical) — pure helper
// extracted from CoachHomeCard so the tier-gated advice pick is
// unit-testable without RNTL (`feedback_test_infrastructure_gap`
// memory)。

import type { LocalCoachAdvice } from '../../types/coachAdvice';

export interface PickHomeAdviceInput {
  daily: LocalCoachAdvice | null;
  weekly: LocalCoachAdvice | null;
  /** `hasFeature('aiCoachAdviceDaily')` — Pro のみ true。 */
  canDaily: boolean;
  /** `hasFeature('aiCoachAdviceWeekly')` — Plus / Pro で true。 */
  canWeekly: boolean;
}

/** ホームカードに出してよい advice を現在プランで絞ってから
 *  freshest を選ぶ。アクセス権のない scope は cached row が
 *  あっても不在として扱う（I1 no-free-reads — Pro→Free 降格後に
 *  残存する daily advice をホームへ出さない。AdviceCard の
 *  locked 振り分けと同じ方針）。 */
export function pickHomeAdvice({
  daily,
  weekly,
  canDaily,
  canWeekly,
}: PickHomeAdviceInput): LocalCoachAdvice | null {
  const d = canDaily ? daily : null;
  const w = canWeekly ? weekly : null;
  if (d && w) {
    return d.generatedAt >= w.generatedAt ? d : w;
  }
  return d ?? w;
}
