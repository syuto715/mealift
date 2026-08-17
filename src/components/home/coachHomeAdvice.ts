// P2-2 follow-up (Codex 遡及review round 1 Critical) — pure helper
// extracted from CoachHomeCard so the tier-gated advice pick is
// unit-testable without RNTL (`feedback_test_infrastructure_gap`
// memory)。

import type { LocalCoachAdvice } from '../../types/coachAdvice';
import { parseCoachText } from '../../domain/coachText';

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

// S3-3-D — ホームカード用の要約1文。weekly advice は 300-500 字 (EF プロンプト
// 仕様) で numberOfLines では文の途中で切れていた。LocalCoachAdvice に title/
// 要約フィールドは無いため、先頭文 (最初の「。」まで) をクライアントで抽出する。
// S4.6-B — 抽出前に挨拶・Markdown を除去 (parseCoachText)。永続化済みの
// advice 行が「こんにちは、ミー先生です。」で始まると、その挨拶文がそのまま
// 要約になっていた (先頭文抽出が挨拶の「。」で止まる)。タイトル行 (見出し/
// 全体強調、≤24 code points) が抽出できた場合はそれが最良の1行要約。
const SUMMARY_MAX_CHARS = 80;

export function summarizeAdviceContent(content: string): string {
  const { title, body } = parseCoachText(content);
  if (title !== null) return title;
  const trimmed = body.trim();
  if (trimmed === '') return trimmed;
  const firstStop = trimmed.indexOf('。');
  const firstSentence =
    firstStop >= 0 ? trimmed.slice(0, firstStop + 1) : trimmed;
  // 句点なしの長文や異常に長い1文は文字数で安全側に切る (numberOfLines の
  // 中途切れと違い、明示の … を付ける)。code unit ではなく code point で
  // 数え、絵文字 (サロゲートペア) を境界で分断しない。
  const points = Array.from(firstSentence);
  if (points.length > SUMMARY_MAX_CHARS) {
    return `${points.slice(0, SUMMARY_MAX_CHARS).join('')}…`;
  }
  return firstSentence;
}
