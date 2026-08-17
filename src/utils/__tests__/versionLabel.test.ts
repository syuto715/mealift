// S4.5-F → S4.6-F — バージョン表記 (build number 併記は S4.6-F で廃止)。
import { buildVersionLabel } from '../versionLabel';

describe('buildVersionLabel', () => {
  it('expoConfig の version から「v1.6.1」形式 (build number は出さない)', () => {
    expect(
      buildVersionLabel({ expoVersion: '1.6.1', fallbackVersion: '1.0.0' }),
    ).toBe('v1.6.1');
  });

  it('expoConfig が null の稀ケースは fallback にフォールバック', () => {
    expect(
      buildVersionLabel({ expoVersion: undefined, fallbackVersion: '1.6.1' }),
    ).toBe('v1.6.1');
    // 空文字も欠損として扱う
    expect(
      buildVersionLabel({ expoVersion: '', fallbackVersion: '1.6.1' }),
    ).toBe('v1.6.1');
  });
});
