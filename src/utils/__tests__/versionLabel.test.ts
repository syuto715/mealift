// S4.5-F — バージョン表記の動的化。
import { buildVersionLabel } from '../versionLabel';

describe('buildVersionLabel', () => {
  it('expoConfig の version + iOS build number で「v1.6.1 (36)」形式', () => {
    expect(
      buildVersionLabel({
        expoVersion: '1.6.1',
        fallbackVersion: '1.0.0',
        nativeBuildNumber: '36',
      }),
    ).toBe('v1.6.1 (36)');
  });

  it('build number が無ければ (Android / Expo Go) バージョンのみ', () => {
    expect(
      buildVersionLabel({
        expoVersion: '1.6.1',
        fallbackVersion: '1.0.0',
        nativeBuildNumber: null,
      }),
    ).toBe('v1.6.1');
    expect(
      buildVersionLabel({
        expoVersion: '1.6.1',
        fallbackVersion: '1.0.0',
        nativeBuildNumber: undefined,
      }),
    ).toBe('v1.6.1');
  });

  it('expoConfig が null の稀ケースは fallback にフォールバック', () => {
    expect(
      buildVersionLabel({
        expoVersion: undefined,
        fallbackVersion: '1.6.1',
        nativeBuildNumber: null,
      }),
    ).toBe('v1.6.1');
    // 空文字も欠損として扱う
    expect(
      buildVersionLabel({
        expoVersion: '',
        fallbackVersion: '1.6.1',
        nativeBuildNumber: '36',
      }),
    ).toBe('v1.6.1 (36)');
  });
});
