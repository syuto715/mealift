# Changelog

All notable user-facing and architectural changes to Mealift land
here. Format follows the spirit of "Keep a Changelog" but does not
try to be a 1:1 mirror — entries are grouped by what a returning
v1 user, an iOS reviewer, or a future contributor would want to
see first.

## v1.5.0 — AI コーチ「ミー先生」 デビュー

### New features

- **AI コーチ「ミー先生」 が新登場** — 食事 / トレーニングを 1 人で
  続けるための専属コーチが、 4 つの surface で寄り添います。 落ち
  着いた口調 / 過度な賞賛なし / サイエンスベース。 必要なときは
  「専門医にご相談ください」 と促してくれます。
- **チャット (① コーチタブ)** — 新しい「コーチ」 タブからミー先生
  と会話できます。 質問に対する応答が token-by-token で表示。
  Free 5 回 / 月、 Plus 200 回 / 月、 Pro 無制限。 会話履歴は
  長押しメニューからアーカイブ / 削除できます。
- **診断 (② コーチタブ)** — 7 つの質問にお答えいただくと、
  ミー先生があなたに合わせたトレーニングルーティンを生成。 経験 /
  目標 / 機材 / 制限などから、 オリジナルのメニューを作成します。
- **ルーティン生成 (③ トレーニングタブ)** — 「自宅で肩と背中の日」
  のような自然な文章で意図を伝えると、 ミー先生がルーティンを
  設計。 プレビューで内容を確認後、 ワンタップでトレーニング
  メニューに追加できます。 Plus 5 回 / 月、 Pro 20 回 / 月。
- **週次アドバイス (④ トレーニング / 食事画面)** — 週ごとに
  ミー先生から振り返り + 今週の重点 + 1 行 CTA が届きます。
  プロフィールのタイムゾーンに合わせた週の境界で生成。 Plus
  ご利用いただけます。

### Improvements

- **アクセシビリティ強化** — 全 4 コーチ surface で VoiceOver
  対応を強化。 ボタンの状態 (送信不可の理由 / 破棄前の確認 等) が
  読み上げに反映されます。
- **ペルソナ表記の統一** — 「ミー先生」 を大文字、 「AI コーチ」
  を sub-label として全 surface で一貫表示。
- **会話アーカイブ / 削除** — 会話一覧で長押し → アーカイブ
  (隠す) / 削除 (元に戻せない) を選択可能。 削除は 2 段階確認。

### Known limitations

- **オフライン検出は反応的** — チャット surface のみ「送信失敗時に
  オフラインバナーを表示」 する反応的検出。 機内モード移行時の
  proactive 検出 (NetInfo) は v1.5+ で対応予定。
- **アドバイスの残り回数 UI** — 月間上限は Edge Function 側で
  enforce されますが、 残り回数を表示する UI counter は v1.5+
  で対応予定 (チャット surface の月次残り counter は v1.5 で提供
  済)。
- **日次アドバイス (Pro)** — Stage 1 では週次のみ提供。 日次は
  v1.5+ で UI 詳細を追加予定。

### Architectural

- **LLM クライアント抽象 (`src/infra/llm/`)** — 将来の Claude /
  GPT-4o-mini 切替を見据えて、 chat / generation / advice の
  client interface を統一。 既存 5 EFs (estimate-nutrition 等)
  は v1.5+ で順次 back-port 候補。
- **idempotency replay + retention** — チャット + ルーティン生成
  で idempotency_key + partial unique index を採用、 hourly cron
  で 24h 経過した key を NULL 化して再利用可能に。
- **server-authoritative 設計** — coach-chat / coach-advice /
  coach-routine の各 EF が永続化の SSoT。 client SQLite mirror
  は read-cache で、 upsert + prune による reconciliation。
- **cross-account leak 防止** — coachAdviceStore /
  routineGenStore / diagnosticStore は userId-scoped キーで管理、
  logout で reset chain を呼び出して同端末で別ユーザー切替の
  際の漏洩を防止。

### Out-of-scope (v1.5+ candidates)

- proactive NetInfo offline detection (`@react-native-community/netinfo`
  install + Expo prebuild)
- atomic counter RPC for monthly quota TOCTOU
- sync_queue resource module for routine_generations offline apply
- v34 `diagnostic_sessions_local` SQLite mirror
- advice quota UI counter (`useAiCoachAdviceQuota` 系 hook)
- Pro daily advice UI 詳細
- 既存 5 Gemini EFs (estimate-nutrition / -vision /
  nutrition-advice / generate-workout-menu / generate-weekly-report)
  の LLMClient 抽象 back-port
- 多言語対応 (現状日本語のみ; Japan-only 配信)

---

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
- **トレーニング画面ヘッダー** — 3 つのアクション (`AIメニュー` /
  `+ ルーティン` / ピリオダイゼーション) を整理し、 iPhone SE 等の
  狭い画面でも 1 行に収まるようにピリオダイゼーションをアイコン
  ボタン化。
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
