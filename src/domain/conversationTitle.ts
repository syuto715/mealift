// v1.5.2 レビュー #7 — コーチ会話の自動タイトル導出 (決定論的・新 AI call なし)。
//
// 既存の chat_conversations.title カラムへ会話作成時に書き込む値を導出する
// 純関数。テーマ起点会話はテーマ名 (coachThemes.autoTitle)、自由入力会話は
// 最初のユーザー発話を短縮/整形して使う。migration なし (カラムは既存)。
//
// 既存の title==null 会話 (本機能以前に作られたもの) は「名前のない会話」を
// やめ、formatFallbackTitle で日時ベースの控えめな表記にする。

/** タイトルに使う最大文字数 (超過分は省略記号に置換)。 */
const MAX_TITLE_LENGTH = 24;

/**
 * 最初のユーザー発話からタイトルを導出する。
 * 連続空白を 1 つに畳んで trim し、長すぎる場合は省略記号を付ける。
 * 空文字なら null (呼び出し側でフォールバック)。
 */
export function deriveConversationTitle(text: string): string | null {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  if (cleaned.length <= MAX_TITLE_LENGTH) return cleaned;
  return `${cleaned.slice(0, MAX_TITLE_LENGTH)}…`;
}

/**
 * title==null の会話 (本機能以前 / 導出失敗) に出す日時ベースのフォールバック表記。
 * 「名前のない会話」を置き換える。
 */
export function formatFallbackTitle(updatedAtIso: string): string {
  const d = new Date(updatedAtIso);
  if (Number.isNaN(d.getTime())) return '会話';
  return `${d.getMonth() + 1}月${d.getDate()}日の会話`;
}

/** リスト表示用: 自動タイトルがあればそれを、なければ日時フォールバックを返す。 */
export function displayConversationTitle(
  title: string | null,
  updatedAtIso: string,
): string {
  const trimmed = title?.trim();
  if (trimmed) return trimmed;
  return formatFallbackTitle(updatedAtIso);
}
