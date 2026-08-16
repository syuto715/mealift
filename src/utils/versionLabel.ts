// S4.5-F — 設定画面フッター / アプリについての表示バージョン。
//
// 真実のソースは app.config.ts の version (実行時は Constants.expoConfig
// 経由)。ハードコードの APP_CONFIG.VERSION は expoConfig が取れない稀な
// ケース (bare/web の edge case) の fallback に格下げ。
// iOS は native binary の CFBundleVersion (= EAS remote autoIncrement が
// 割り当てた build number、Constants.platform.ios.buildNumber) を併記して
// 「v1.6.1 (36)」形式にする。Android は expo-constants の platform manifest
// が空で、expo-application は直接依存に無い (新規依存禁止) ため build
// number なしの「v1.6.1」に劣化する。
export function buildVersionLabel(args: {
  expoVersion: string | null | undefined;
  fallbackVersion: string;
  nativeBuildNumber: string | null | undefined;
}): string {
  const version = args.expoVersion || args.fallbackVersion;
  return args.nativeBuildNumber
    ? `v${version} (${args.nativeBuildNumber})`
    : `v${version}`;
}
