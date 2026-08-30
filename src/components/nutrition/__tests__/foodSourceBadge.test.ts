// S5b — 出典バッジ / 出典行 / 注記の写像テスト。

import { getSourceBadge, formatSourceLine, sourceDisclaimer } from '../foodSourceBadge';

describe('foodSourceBadge', () => {
  it('maps official_disclosure / package_label to 公式', () => {
    expect(getSourceBadge({ sourceLabel: 'official_disclosure' })).toEqual({
      kind: 'official',
      label: '公式',
    });
    expect(getSourceBadge({ sourceLabel: 'package_label' })?.label).toBe('公式');
  });

  it('maps ai_estimate to AI推定', () => {
    expect(getSourceBadge({ sourceLabel: 'ai_estimate' })).toEqual({
      kind: 'ai_estimate',
      label: 'AI推定',
    });
  });

  it('returns null for foods-table rows (undefined) and manual', () => {
    expect(getSourceBadge({})).toBeNull();
    expect(getSourceBadge({ sourceLabel: null })).toBeNull();
    expect(getSourceBadge({ sourceLabel: 'manual' })).toBeNull();
  });

  it('formats the 出典 line with brand and 取得日', () => {
    expect(
      formatSourceLine({
        sourceLabel: 'official_disclosure',
        sourceCapturedAt: '2026-08-30',
        brand: 'すき家',
      }),
    ).toBe('出典: すき家 公式（2026-08-30時点）');
    // 取得日なし (旧データ) は日付括弧ごと省略
    expect(
      formatSourceLine({ sourceLabel: 'official_disclosure', sourceCapturedAt: null, brand: 'すき家' }),
    ).toBe('出典: すき家 公式');
  });

  it('uses a neutral tone for ai_estimate line + disclaimer', () => {
    const line = formatSourceLine({
      sourceLabel: 'ai_estimate',
      sourceCapturedAt: null,
      brand: 'スシロー',
    });
    expect(line).toContain('AI 推定値');
    expect(line).not.toContain('注意'); // 煽り文言を使わない
    expect(sourceDisclaimer({ sourceLabel: 'ai_estimate' })).toContain('参考として');
  });

  it('official disclaimer follows the chains\' own wording', () => {
    expect(sourceDisclaimer({ sourceLabel: 'official_disclosure' })).toBe(
      '※栄養成分は推定値であり、実際の商品と異なる場合があります。',
    );
    expect(sourceDisclaimer({})).toBeNull();
  });
});
