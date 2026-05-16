# Changelog

All notable user-facing and architectural changes to Mealift land
here. Format follows the spirit of "Keep a Changelog" but does not
try to be a 1:1 mirror — entries are grouped by what a returning
v1 user, an iOS reviewer, or a future contributor would want to
see first.

## v1.4.0 — Vision food scan + auth resilience

### New features

- **AI で料理を撮影して栄養を記録** — Pro プランで、 料理の写真を
  撮影すると Gemini Vision が料理名と 1 食分のサイズを推定。 食事
  画面の「食品を追加」 と並ぶ「📷 AI で記録」 ボタンから起動。
  推定結果は手入力フォームに自動で展開され、 栄養成分のみ入力すれ
  ば食事に追加できます (1 日 20 回まで)。
- **食品ラベルを撮影してすばやく登録** — パッケージの「栄養成分
  表示」 を撮影すると OCR が読み取り、 ServingQuantityModal に
  栄養成分を自動入力。
- **3-tier の自動フォールバック** — OCR が読めなかった場合 Pro
  ユーザーは Vision の解析にフォールバック、 さらに失敗時は手入力
  画面に静かに切り替わります。
- **食品追加画面が 3 タブ構成に** — 「検索」 / 「スキャン」 /
  「OCR」 のトップタブを追加。「検索」 タブ内で既存の 6 サブタブ
  (検索 / マイ料理 / よく使う / お気に入り / 手入力 / テンプレ)
  は変更なしで使えます。
- **単位 7 種類に拡張** — 手入力 / マイ食品で g / ml / 個 / 本 /
  枚 / パック / 杯 を選択可能に。 食パン (枚) や バナナ (本)
  など個数系食品をそのまま登録できます。

### Improvements

- **ホーム画面リデザイン** — 時間帯別グリーティング、 ヘッダー
  進捗バー、 マネタイゼーション動線の整理。
- **トレーニング画面ヘッダー** — 3 ボタン (「再開」 /「履歴」 /
  「メニュー」) を整理。 iPhone SE の狭い画面では自動で wrap。
- **食事画面のカロリー進捗** — 合計カロリーの達成率を進捗バーで
  可視化。
- **マネタイゼーション動線** — Pro プランの訴求点を 7 シナリオで
  整理し、 ProCard / ProInlineCTA / ProTeaser を統一。
- **認証セッションの持続改善** — アプリを強制終了して再起動した
  際の「ログアウト状態に戻ってしまう」 症状を 2 系統で軽減 (リフ
  レッシュトークン再利用窓 + 起動直後のセッション確認)。

### Bug fixes

- **水分入力フィールド**: タップが TextInput のフォーカスと競合
  していた問題を修正。
- **バーコード 2 回目以降スキャン**: 画面を離れて戻ってきた際に
  スキャンが反応しなかった iOS の症状を修正。
- **バーコード商品の手動登録**: 食品 DB への登録は成功したが食事
  への追加が失敗した「一部成功」 ケースで、 詳しい状況と再試行
  ボタンを表示。
- **オンボーディング後の遷移**: HealthKit 許可後にまれに「ルートが
  見つかりません」 が出る問題を修正。

### Architectural

- jest ベースの自動テストを 1993 件まで拡張 (UTC / Asia/Tokyo
  / America/Los_Angeles の 3 タイムゾーンで毎回 green)。
- 認証 / 食事ロギング / バーコード 周りの分岐ロジックを純関数
  ヘルパーに切り出し、 ユニットテストで保護。
- Routes SSoT (`src/constants/routes.ts`) を導入、 高頻度ルートの
  型安全化。
- Vision Edge Function (`estimate-nutrition-vision`) を deploy、
  既存テキスト AI 栄養推定の認証 / クォータ / ロギング基盤を
  そのまま継承。

### Known limitations carried to v1.5

- Android RevenueCat の整備は次バージョン (iOS のみで先行リリー
  ス)。
- AI 料理スキャンの PFC 値は手入力ステップが残ります (Vision +
  テキスト推定の組み合わせは v1.5 で設計予定)。
- Sentry 連携と全体エラーテレメトリは v1.5 で追加予定。

---

## v1.3.0

See `docs/plans/auth_session_persistence_fix.md` for the v1.3
auth-resilience changes (Tier 1 server-side refresh-token reuse
window). Onboarding v2 (15-screen funnel) shipped in v1.3 as well.
