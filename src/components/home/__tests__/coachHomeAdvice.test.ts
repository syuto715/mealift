// P2-2 follow-up (Codex 遡及review round 1 Critical) — tier gate の
// 回帰テスト: アクセス権のない scope の cached advice がホーム
// カードの pick に混入しないこと。

import { pickHomeAdvice, summarizeAdviceContent } from '../coachHomeAdvice';
import type { LocalCoachAdvice } from '../../../types/coachAdvice';

const DAILY: LocalCoachAdvice = {
  id: 'a-daily',
  userId: 'u-1',
  scope: 'daily',
  periodStart: '2026-07-06',
  content: '今日のアドバイス',
  generatedAt: '2026-07-06T21:00:00Z',
};

const WEEKLY: LocalCoachAdvice = {
  id: 'a-weekly',
  userId: 'u-1',
  scope: 'weekly',
  periodStart: '2026-06-29',
  content: '今週のアドバイス',
  generatedAt: '2026-07-05T00:00:00Z',
};

describe('pickHomeAdvice', () => {
  it('Pro (both flags) → freshest of the two scopes', () => {
    expect(
      pickHomeAdvice({ daily: DAILY, weekly: WEEKLY, canDaily: true, canWeekly: true }),
    ).toBe(DAILY);
    const olderDaily = { ...DAILY, generatedAt: '2026-07-01T00:00:00Z' };
    expect(
      pickHomeAdvice({ daily: olderDaily, weekly: WEEKLY, canDaily: true, canWeekly: true }),
    ).toBe(WEEKLY);
  });

  it('generatedAt が同値なら daily を優先（>= 比較の既存挙動を固定）', () => {
    const tied = { ...DAILY, generatedAt: WEEKLY.generatedAt };
    expect(
      pickHomeAdvice({ daily: tied, weekly: WEEKLY, canDaily: true, canWeekly: true }),
    ).toBe(tied);
  });

  it('Plus (weekly のみ) → cached daily が残っていても weekly を返す（降格残存 row の遮断）', () => {
    expect(
      pickHomeAdvice({ daily: DAILY, weekly: WEEKLY, canDaily: false, canWeekly: true }),
    ).toBe(WEEKLY);
    expect(
      pickHomeAdvice({ daily: DAILY, weekly: null, canDaily: false, canWeekly: true }),
    ).toBeNull();
  });

  it('Free (両 flag なし) → cached row があっても null（I1 no-free-reads）', () => {
    expect(
      pickHomeAdvice({ daily: DAILY, weekly: WEEKLY, canDaily: false, canWeekly: false }),
    ).toBeNull();
  });

  it('アクセス権はあるが cached row がない → null / 片側のみ返す', () => {
    expect(
      pickHomeAdvice({ daily: null, weekly: null, canDaily: true, canWeekly: true }),
    ).toBeNull();
    expect(
      pickHomeAdvice({ daily: DAILY, weekly: null, canDaily: true, canWeekly: true }),
    ).toBe(DAILY);
    expect(
      pickHomeAdvice({ daily: null, weekly: WEEKLY, canDaily: true, canWeekly: true }),
    ).toBe(WEEKLY);
  });
});

// S3-3-D — 要約1文抽出のピン

describe('summarizeAdviceContent', () => {
  it('先頭文 (最初の「。」まで) を返す', () => {
    expect(
      summarizeAdviceContent('先週は3回トレーニングできました。今週は脚の日を増やしましょう。最後に水分補給も。'),
    ).toBe('先週は3回トレーニングできました。');
  });

  it('句点がない場合は 80 字で切って … を付ける', () => {
    const long = 'あ'.repeat(120);
    const out = summarizeAdviceContent(long);
    expect(out).toBe('あ'.repeat(80) + '…');
  });

  it('80 字以内で句点なしならそのまま返す', () => {
    expect(summarizeAdviceContent('短いアドバイス')).toBe('短いアドバイス');
  });

  it('空文字・空白のみは空文字を返す (空状態文言は呼び出し側)', () => {
    expect(summarizeAdviceContent('')).toBe('');
    expect(summarizeAdviceContent('   ')).toBe('');
  });

  it('先頭文自体が 80 字超なら 80 字 + …', () => {
    const longSentence = 'い'.repeat(100) + '。次の文。';
    expect(summarizeAdviceContent(longSentence)).toBe('い'.repeat(80) + '…');
  });

  it('絵文字 (サロゲートペア) を切り詰め境界で分断しない', () => {
    const emoji = '💪'.repeat(100); // 各絵文字は UTF-16 で 2 code units
    const out = summarizeAdviceContent(emoji);
    expect(out).toBe('💪'.repeat(80) + '…');
  });
});
