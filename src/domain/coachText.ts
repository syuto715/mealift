// S4.6-B — ミー先生 (AI コーチ) テキストの表示整形。
//
// EF 出力 (weekly/daily advice・ad-hoc 栄養アドバイス) は Markdown 記号
// (**強調 / # 見出し / - 箇条書き) やモデル生成の定型挨拶
// (「こんにちは、ミー先生です。」等) を含み得るが、表示は素の <Text> で
// 記号がそのまま露出していた (外部UXレビュー指摘)。挨拶はテンプレート
// 文字列ではなく応答ごとのモデル生成で、advice は DB 行
// (user/scope/period_start 単位の upsert) にキャッシュされ次の期間まで
// 残るため、是正は render 側で行う (EF 変更は不可侵)。
//
// 純関数 (RN import なし) — jest pure-logic テスト対象。方針は「除去」
// (最小レンダリングの太字化ではなく)。streaming 中の未閉じ ** は
// 完結ペアのみ除去する規約により素通しになる (チャンク単位で安全)。

/** タイトルとして扱う最大長 (近似 grapheme — 絵文字を分断しない)。 */
const MAX_TITLE_CODEPOINTS = 24;

/** 近似 grapheme 数 (S4.6-B2, Codex R1 Nit)。Hermes に Intl.Segmenter が
 *  無いため、ZWJ 連結絵文字 (🏋️‍♀️ = 4 code points 等) が code point 数えで
 *  水増しされて正当な短タイトルが落ちるのを、ZWJ と異体字セレクタを
 *  カウントから除外して緩和する (テキスト自体は変更しない)。 */
function countApproxGraphemes(text: string): number {
  // U+200D = ZWJ, U+FE0F = variation selector-16
  return Array.from(text.replace(/[‍️]/g, '')).length;
}

// 定型挨拶: 先頭一致のみ (本文中の自己言及は対象外)。挨拶と自己紹介は
// 「こんにちは、ミー先生です。」のように連なるため、各パターンを繰り返し
// 適用する。
const GREETING_HEAD_PATTERNS: RegExp[] = [
  /^(?:こんにちは|こんばんは|おはようございます|おはよう)[、。！!\s]*/,
  /^(?:私は)?ミー先生(?:です|だよ)[、。！!]*\s*/,
];

/** 先頭の定型挨拶を除去する。挨拶以外の本文には触れない。 */
export function stripLeadingGreeting(text: string): string {
  let result = text.trimStart();
  // 連結挨拶 (挨拶 + 自己紹介 + 挨拶の言い直し等) を想定して数周回す。
  // 各パターンはマッチ時に必ず 1 文字以上消費するため停止は構造的に保証
  // されるが、防御として上限を置く。
  for (let pass = 0; pass < 4; pass++) {
    let matched = false;
    for (const pattern of GREETING_HEAD_PATTERNS) {
      const next = result.replace(pattern, '');
      if (next !== result) {
        result = next.trimStart();
        matched = true;
      }
    }
    if (!matched) break;
  }
  return result;
}

/**
 * Markdown 記号を表示用に除去する。
 * - 行頭 #{1,6} 見出しマーク → 除去 (テキストは残す)
 * - 行頭 "- " / "* " 箇条書き → 「・」 (番号付きリスト "1. " は EF プロンプト
 *   が明示要求しているため保持)
 * - 完結した **強調** / __強調__ ペア → 中身のみ (未閉じは素通し —
 *   チャット streaming の途中チャンクを壊さない)
 */
export function stripCoachMarkdown(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      let l = line.replace(/^(\s*)#{1,6}\s+/, '$1');
      l = l.replace(/^(\s*)[-*]\s+/, '$1・');
      return l;
    })
    .join('\n')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/__([^_\n]+?)__/g, '$1');
}

export interface ParsedCoachText {
  /** 先頭行が見出し (#) または全体強調 (**…**) かつ短い場合のみ非 null。 */
  title: string | null;
  /** 挨拶・Markdown 除去済みの本文。 */
  body: string;
}

/**
 * カード/全文表示用のパース: 挨拶除去 → タイトル行抽出 → Markdown 除去。
 * content が挨拶だけの場合は挨拶を本文として残す (空カードにしない)。
 */
export function parseCoachText(content: string): ParsedCoachText {
  const trimmed = content.trim();
  if (trimmed === '') return { title: null, body: '' };

  let working = stripLeadingGreeting(trimmed);
  if (working === '') working = trimmed;

  const lines = working.split('\n');
  const firstIdx = lines.findIndex((l) => l.trim() !== '');
  const first = firstIdx >= 0 ? lines[firstIdx].trim() : '';
  const headingMatch = first.match(/^#{1,6}\s+(.+)$/);
  const boldMatch = first.match(/^\*\*([^*]+)\*\*$/);
  const rawTitle = headingMatch?.[1] ?? boldMatch?.[1] ?? null;

  if (rawTitle !== null) {
    const title = stripCoachMarkdown(rawTitle).trim();
    if (title !== '' && countApproxGraphemes(title) <= MAX_TITLE_CODEPOINTS) {
      const body = stripCoachMarkdown(
        lines.slice(firstIdx + 1).join('\n'),
      ).trim();
      // タイトル行しかない content はタイトルを本文扱いに落とす
      if (body === '') return { title: null, body: title };
      return { title, body };
    }
  }

  return { title: null, body: stripCoachMarkdown(working).trim() };
}

/** 全文表示用: タイトルがあれば本文の先頭行として結合した整形済み全文。 */
export function formatCoachTextFull(content: string): string {
  const { title, body } = parseCoachText(content);
  return title ? `${title}\n${body}` : body;
}
