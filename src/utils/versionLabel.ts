// S4.5-F — 設定画面フッター / アプリについての表示バージョン。
//
// 真実のソースは app.config.ts の version (実行時は Constants.expoConfig
// 経由)。ハードコードの APP_CONFIG.VERSION は expoConfig が取れない稀な
// ケース (bare/web の edge case) の fallback に格下げ。
// S4.6-F — build number 併記 (「v1.6.1 (36)」) は外部UXレビュー後の判断で
// 廃止し、両プラットフォームともバージョンのみの「v1.6.1」表記にする
// (nativeBuildNumber 引数ごと削除 — call site に残すと dead branch と
// 偽 green テストが残るため)。
export function buildVersionLabel(args: {
  expoVersion: string | null | undefined;
  fallbackVersion: string;
}): string {
  return `v${args.expoVersion || args.fallbackVersion}`;
}
