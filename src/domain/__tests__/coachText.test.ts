// S4.6-B — ミー先生テキスト整形の回帰テスト
// (記号除去 / 挨拶除去 / タイトル抽出 / 絵文字混在 / 不正入力)。
import {
  stripLeadingGreeting,
  stripCoachMarkdown,
  parseCoachText,
  formatCoachTextFull,
} from '../coachText';

describe('stripLeadingGreeting', () => {
  it('「こんにちは、ミー先生です。」の連結挨拶を先頭から除去する', () => {
    expect(stripLeadingGreeting('こんにちは、ミー先生です。今週は順調です。')).toBe(
      '今週は順調です。',
    );
  });

  it('挨拶バリエーション (こんばんは/おはようございます/だよ調) を除去する', () => {
    expect(stripLeadingGreeting('こんばんは！今日の振り返りです。')).toBe(
      '今日の振り返りです。',
    );
    expect(stripLeadingGreeting('おはようございます。ミー先生だよ。水分补給を。')).toBe(
      '水分补給を。',
    );
    expect(stripLeadingGreeting('私はミー先生です。タンパク質を増やしましょう。')).toBe(
      'タンパク質を増やしましょう。',
    );
  });

  it('本文中の「ミー先生です」には触れない (先頭一致のみ)', () => {
    const s = '担当はミー先生です。継続しましょう。';
    expect(stripLeadingGreeting(s)).toBe(s);
  });

  it('挨拶だけの入力は空文字になる (呼び出し側で fallback する契約)', () => {
    expect(stripLeadingGreeting('こんにちは、ミー先生です。')).toBe('');
  });
});

describe('stripCoachMarkdown', () => {
  it('完結した **強調** / __強調__ ペアの記号を除去する', () => {
    expect(stripCoachMarkdown('**先週の振り返り**は順調。__今週__も継続を。')).toBe(
      '先週の振り返りは順調。今週も継続を。',
    );
  });

  it('未閉じの ** は素通し (streaming チャンク安全)', () => {
    expect(stripCoachMarkdown('**先週の振り返り')).toBe('**先週の振り返り');
  });

  it('行頭 # 見出しマークを除去し、- / * 箇条書きを「・」にする', () => {
    expect(stripCoachMarkdown('## 今週の重点\n- タンパク質\n* 水分')).toBe(
      '今週の重点\n・タンパク質\n・水分',
    );
  });

  it('番号付きリストと本文中のハイフンは保持する', () => {
    expect(stripCoachMarkdown('1. 朝食を固定\n2. 間食を減らす')).toBe(
      '1. 朝食を固定\n2. 間食を減らす',
    );
    expect(stripCoachMarkdown('目標は 60-70kg です')).toBe('目標は 60-70kg です');
  });

  it('空文字・記号なしテキストは不変', () => {
    expect(stripCoachMarkdown('')).toBe('');
    expect(stripCoachMarkdown('そのままのテキスト')).toBe('そのままのテキスト');
  });
});

describe('parseCoachText', () => {
  it('見出し行をタイトルとして抽出し、本文から Markdown を除去する', () => {
    const parsed = parseCoachText(
      'こんにちは、ミー先生です。\n## 今週の重点\n**タンパク質**を意識しましょう。\n- 朝食に卵',
    );
    expect(parsed.title).toBe('今週の重点');
    expect(parsed.body).toBe('タンパク質を意識しましょう。\n・朝食に卵');
  });

  it('全体強調の先頭行 (**…**) もタイトルになる', () => {
    const parsed = parseCoachText('**先週の振り返り**\n順調に記録できています。');
    expect(parsed.title).toBe('先週の振り返り');
    expect(parsed.body).toBe('順調に記録できています。');
  });

  it('長すぎる先頭行 (>24 code points) はタイトルにしない', () => {
    const longLine = '# ' + 'あ'.repeat(30);
    const parsed = parseCoachText(`${longLine}\n本文です。`);
    expect(parsed.title).toBeNull();
    expect(parsed.body).toContain('あ'.repeat(30));
  });

  it('タイトルの長さ判定は code point 基準 (絵文字を分断しない)', () => {
    // 💪 はサロゲートペア (code unit 2) — code unit 数えだと 24 を超える
    const title = '💪'.repeat(20) + 'あああ'; // 23 code points
    const parsed = parseCoachText(`## ${title}\n本文。`);
    expect(parsed.title).toBe(title);
  });

  it('ZWJ 連結絵文字クラスタは水増しカウントしない (S4.6-B2)', () => {
    // 🏋️‍♀️ = 4 code points (🏋 + VS16 + ZWJ + ♀ + VS16) だが見た目 1 文字。
    // code point 数えだと 5 個で 24 超になりタイトル落ちしていた。
    const title = '🏋️‍♀️'.repeat(5) + 'トレ計画';
    const parsed = parseCoachText(`## ${title}\n本文。`);
    expect(parsed.title).toBe(title);
  });

  it('挨拶だけの content は挨拶を本文として残す (空カードにしない)', () => {
    const parsed = parseCoachText('こんにちは、ミー先生です。');
    expect(parsed.title).toBeNull();
    expect(parsed.body).toBe('こんにちは、ミー先生です。');
  });

  it('タイトル行しかない content はタイトルを本文に落とす', () => {
    const parsed = parseCoachText('## 今週の重点');
    expect(parsed.title).toBeNull();
    expect(parsed.body).toBe('今週の重点');
  });

  it('空・空白のみは空 body を返す', () => {
    expect(parseCoachText('')).toEqual({ title: null, body: '' });
    expect(parseCoachText('  \n ')).toEqual({ title: null, body: '' });
  });

  it('絵文字混在の本文をそのまま保持する', () => {
    const parsed = parseCoachText('**継続は力💪** 今週も頑張りましょう🔥');
    expect(parsed.body).toContain('💪');
    expect(parsed.body).toContain('🔥');
    expect(parsed.body).not.toContain('**');
  });
});

describe('formatCoachTextFull', () => {
  it('タイトルがあれば先頭行として結合する', () => {
    expect(
      formatCoachTextFull('## 今週の重点\nタンパク質を意識しましょう。'),
    ).toBe('今週の重点\nタンパク質を意識しましょう。');
  });

  it('タイトルなしは整形済み本文のみ', () => {
    expect(formatCoachTextFull('こんにちは！**順調**です。')).toBe('順調です。');
  });
});
