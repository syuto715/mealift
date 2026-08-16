// S4.5-C — タブバー可視判定の単一ソース化。
//
// S3-1-A の判定は「segments の末尾が 'session'」という route 派生述語だった。
// これは (a) セッション中に別 route が乗る遷移 (実在例: 推奨ストリップの
// paywall push → /(tabs)/settings/subscription) や、(b) usePreventRemove を
// 素通りする native pop (Android predictive back + new-arch) で破れ、集中モード
// 中にタブバーが再表示される regression の原因になった (外部UXレビュー実機動画)。
//
// 是正: 「ワークアウトセッションが進行中か」は workoutStore.sessionId が唯一の
// 真実 (set: session.tsx の init effect のみ / clear: 保存・破棄の終了パスの
// endSession のみ) なので、これを第一判定にする。segments 判定は次の2つの
// ためだけに残す:
//   - session 画面 push 直後の初回フレーム (store フラグは post-mount effect で
//     立つため 1 フレーム遅れる) と、params なしの未初期化 session 画面
//   - コーチ会話 ((tabs)/coach/[id]) の集中モード (チャットに store は無い)
//
// 純関数に抽出しているのは 7 経路 (シート開閉 / 破棄キャンセル / 下スワイプ /
// BG復帰 / 種目追加往復 / 保存失敗 / 連打) の回帰を jest (pure-logic) で
// 固定するため — component テスト基盤 (jest-expo/RNTL) は未導入。
export function shouldHideTabBar(
  segments: readonly string[],
  workoutSessionActive: boolean,
): boolean {
  if (workoutSessionActive) return true;
  const last = segments[segments.length - 1];
  if (last === 'session') return true;
  // useSegments は動的 segment をファイル名 '[id]' のまま返すため、直前
  // segment 'coach' との組で会話画面のみを特定できる (coach/index・相談テーマ・
  // diagnostic/* はバー表示のまま)。
  return last === '[id]' && segments[segments.length - 2] === 'coach';
}
