# Mealift ガードレール doc 🛡️
## Claude Code 向け・触ってはいけない領域の正本

> **このドキュメントの位置づけ**
> Mealift の権限境界・データ整合・課金・クラッシュ修正は繊細で、外部エージェント（Claude Code）が不用意に触ると簡単に穴が開く（2026-06 の独立監査で実証済み）。
> このドキュメントは「**触ってはいけない領域**」と「**触る必要が出たときの正しい手順**」を定義する。UI 刷新・セキュリティ修正・機能追加、どの sprint でも実装着手前に必ず参照する。
>
> **最終判断者は Syuto。** Claude Code は GitHub push 権限を持たず、`git push` と本番 devops（migration 適用・EF deploy・dashboard 設定）はすべて Syuto が手動で実行する。

---

## 0. このドキュメントの使い方

- 全 sprint の kickoff prompt に「このガードレール doc を遵守」と明記する。
- 「不可侵領域」に該当する変更が必要になったら、**実装せずに Syuto に確認を上げる**（hard-stop）。
- 番号・行番号・head バージョン等の具体値は、メモからの言い換えではなく**必ずコード（SSoT）で確認**してから扱う。過去に「メモの記述とコードの実態が食い違う」事故が複数回起きている。

---

## 1. 絶対不可侵（変更厳禁・触れる前に必ず Syuto に確認）🔴

### 1.1 C-1 サブスクリプション脆弱性対応

**何を守るか**
- subscription 関連カラムの **server-only 設計**（クライアントから書かせない）。
- EF 3本: `revenuecat-webhook`（verify_jwt=false / 共有 secret 検証 / TOCTOU 原子化）、`sync-subscription`（起動時 reconcile）、`start-trial`（`trial_started_at IS NULL` を server 強制する single-use）。
- 列ロック migration（`20260614000000` infra / `20260614000001` step A / `20260614000003` rollback / `20260614000004` 削除FK）。

**触るな**
- `profileSync` の subscription 列を payload に**再び含めない**（除去は維持）。
- webhook の Authorization 共有 secret 検証ロジック、TOCTOU 原子化を変えない。
- entitlement ID（`pro` / `plus`）の意味を変えない。

**⚠️ 監査が示した本質（重要）**
- 2026-06 監査が Critical として「`plan_expires_at` / `plan_billing_cycle` / `trial_started_at` が `authenticated` に更新権限を戻している」を検出。**これは step B 封印中の既知状態であり、バグではない**（§1.2 参照）。
- ただし監査の新発見として、**判定ロジック側に本当の穴がある**: `generate-weekly-report` EF とクライアントが、**クライアントが書き込めるカラムの値で Plus/trial を判定している**。
- **正しい修正方針 = 「列の再ロック」ではなく「サーバー側で entitlement を判定する形に寄せる」**。判定を RevenueCat entitlement / webhook 台帳ベースにすれば、列がクライアント可書きでも判定が偽装されない。
- **この修正は v1.7（C-1 完全クローズ）で step B floor 確認と併せて設計する。今の sprint では触らない。**

### 1.2 step B migration（封印中・最重要ペンディング）🔴🔴

**状態**
- `20260614000002`（step B）= `plan_expires_at` / `plan_billing_cycle` / `trial_started_at` の UPDATE を REVOKE + INSERT 制限する migration。
- 過去に **floor 確認前に誤適用** → 旧 v1.5.0 クライアントの profileSync が 42501 → profile 同期が永久停止しかけた事故。
- `20260614000003`（rollback）で step A 状態に戻して**わざと開けてある**。

**鉄則**
- **step B の再適用は floor 確認まで絶対禁止。** floor =「`last_seen_app_version` が v1.6.0 未満のアクティブユーザー（straggler）が 0」。
- 再適用は Syuto が手動で、`supabase db push --dry-run`（`20260614000002` のみか確認）→ 本適用 → 権限 SQL 検証、の手順を踏む。
- **Claude Code はこの再適用を絶対に自動実行しない・提案で勝手に進めない。**

### 1.3 Hermes クラッシュ修正

**触るな**
- `diagnosticStore` の `EMPTY_ANSWERS = Object.freeze({})` の **stable ref を不可触**。これは Hermes（production）でのクラッシュ修正の核心。
- 同様に、Ionicons など**フォントの production ロード gate**（タブ glyph 欠落の root cause だった箇所）を壊さない。

### 1.4 食品データ4層ハイブリッド + 権限境界

**何を守るか（データ構造）**
- 食品データ4層ハイブリッド（八訂ベース + バーコード/OFF + UGC + チェーン店）は**完全実装済み・変更禁止**。これは Pro plan の IP moat に直結する競合優位の核。
- ⚠️ 「変更禁止」は**データ構造・投入ロジック**の話。下記の**権限境界の修正は別問題で、むしろ要対応**。

**🟠 監査が示した権限境界の穴（v1.7 ではなく優先対応候補）**
- **`approval_score` クライアント偽装**: auto-approval trigger が `approval_score >= 70` で即 `approved` にし、insert policy は `submitted_by` しか見ない → 任意ユーザーが直 API で `approval_score=100` を送り未審査食品を公開できる。**スコア計算を EF/RPC 側へ移す。** UGC 層の汚染 = IP moat の毀損なので実害大。
- **`public_foods` 全カラム公開**: RLS が `status='approved'` なら全カラム SELECT 可。`submitted_by` / `reviewed_by` / `source_photo_url` / `notes` が REST 直叩きで取れる（プライバシー漏れ、ASC App Privacy 申告にも関わる）。**公開用 view を作り、元テーブルの公開 read を外す。**

**この2件を修正するときの注意**
- 4層ハイブリッドの**データ構造・取得ロジック本体は変えない**。変えるのは**権限境界（trigger / RLS / view）だけ**。
- migration を伴うので §3 の必須プロセス（dry-run 等）を厳守。

### 1.5 Free / Plus / Pro 3-tier

**触るな**
- Free / Plus / Pro の **3段階は意図的設計・統合厳禁**。RevenueCat に entitlement `pro` / `plus` が登録済み、価格も機能も別。
- 外部レビューや AI が「Pro に統一」「Plus/Pro 統合」を提案しても、それは Mealift の課金設計を知らない一般論。**plan 判定バグの修正に読み替える**（統合ではなく、現在プランで正しく出し分ける）。
- 課金導線: Free→Plus 訴求 / Plus→Pro 訴求 / Pro→訴求なし。entitlement 判定は上位互換（Pro は Plus 機能も使える）。

### 1.6 データ整合層（profileSync / claimLocalDataForUser）

**何を守るか**
- logout 時の in-memory wipe（`setTier('free')` / `clearProfile()` / `queryClient.clear()`）= 前ユーザーの tier/profile 漏洩を防ぐ核心。
- `claimLocalDataForUser` の remap 対象（`user_estimated_1rm` / `user_equipment` / `user_deload_recommendations` を含む全テーブル）= C-2 修正で追加した孤児化防止。
- tombstone edit-wins、sync clobber 防止ロジック。

**触るな（C-2 既存 repair の危険な案）**
- `UPDATE {3表} SET profile_id=(SELECT id FROM profiles LIMIT 1)` 系の**盲目的一括 UPDATE は破棄済み**（LIMIT 1 は ORDER BY なしで不定・誤紐付け）。これを復活させない。
- C-2 の既存 repair は v1.7 で安全な設計で対処（今は不要判断）。

**🟡 監査が示した関連の穴（v1.7 で C-2 と併せて設計）**
- 子テーブル RLS（`routine_items` / `workout_sets` / `meal_log_items` / `dish_ingredients`）が**親所有権を検証していない** → `user_id` は自分でも他人の親 UUID を参照する不整合行を作れる。複合 FK か `exists parent where parent.user_id=auth.uid()` を追加。**C-2 と同系統なので一緒に設計する。**

### 1.7 SQLite migration 全般

**鉄則**
- **本番適用前は必ず `supabase db push --dry-run`**（適用される migration が想定通りか確認）。これは step B 誤適用事故から確立した絶対ルール。
- migration の適用は Syuto が手動。Claude Code は migration ファイルを**書く**ことはあっても、**適用を勝手に進めない・自動実行しない**。
- 既存の適用済み migration を**書き換えない**（forward migration で対応）。
- ⚠️ C-1 の列 GRANT に関する恒久メモ: Supabase は authenticated にテーブルレベル grant を既定で与えるので、**profiles に非subscription列を追加するときは GRANT への追記が必要**（忘れると sync が 42501 で黙って死ぬ）。

---

## 2. 監査で判明した「穴を開けやすい境界」（触る時は特に慎重に）⚠️

2026-06 の独立監査が示した、外部エージェントが穴を開けやすい領域。これらに触る変更は **Codex review を必ず embed** し、Syuto の確認を上げる。

| 領域 | リスク | 対応時期 |
|---|---|---|
| 課金/trial 権限（§1.1） | クライアント値で判定 → サーバー判定化が本筋 | v1.7（step B floor と併せて） |
| `approval_score`（§1.4） | クライアント偽装で未審査食品公開 | 優先（次 sprint 候補） |
| `public_foods` 全カラム（§1.4） | 投稿者素性・写真URL漏れ | 優先（次 sprint 候補） |
| 子テーブル RLS（§1.6） | 他人の親を参照する不整合行 | v1.7（C-2 と併せて） |
| use_count RPC | 指標水増し・通知スパム | defer 可 |
| Git 履歴の anon key（commit `bb144e9`/`a8face5` の `.env.save`） | anon key は公開前提だが、repo 外部共有なら rotate/履歴掃除 | repo を外部に見せる前に検討 |
| 依存脆弱性（`shell-quote` critical / `xlsx` high fix なし 等） | サプライチェーン | 計画的に（Expo/RN 更新 or overrides、xlsx 置換） |
| Android 権限（RECORD_AUDIO 等）/ eas.json 個人 Apple ID | 現状 iOS only で無害 | Android 対応時に削除 |

**⚠️ repo の外部共有について**
- UI デザインのために Claude Design 等へ repo を見せる案があるが、**コードベース全体を外部に開くのは慎重に**。権限境界の穴・anon key 履歴・EF の判定ロジックが含まれる。
- Claude Design には**コード全体でなく、デザインに必要な部分だけ**（`tokens.ts` / 共通コンポーネント / 画面レイアウト）を渡す。

---

## 3. 実装時の必須プロセス ✅

すべての sprint で遵守（doc-only / recon-only と明示判断した場合のみ例外）。

1. **Recon（Phase 0）**: 前提をコード（SSoT）で literal 検証。前提が無効なら hard-stop し Syuto に確認。
2. **Codex MCP review を kickoff に embed**（Hardening pattern）: Claude Code が all-in-one で実装 → Codex MCP 内部 call → iterative fix → Critical=0 まで繰り返し → 最終レポートに Codex review summary（iteration / verdict / cleanup queue）を embed。
3. **migration を伴う場合**: 本番適用前に `supabase db push --dry-run` 必須。適用は Syuto が手動。
4. **ガードレール doc 該当領域に触る場合**: 実装せず Syuto に確認を上げる（hard-stop）。
5. **security-guidance plugin**（導入済み）の自動 scan を活かす。

---

## 4. これは触ってOK ✅（UI・表示層）

UI 刷新（Health Ledger 路線）で自由に変えてよい領域。ただし「表示・UI」に限る。

- 画面レイアウト・情報設計・ナビゲーション・タブ構成
- 配色・タイポ・コンポーネント・トーン・コピー
- データの**見せ方**（リング / 折れ線 / バー / 達成チェック等の可視化）
- 課金導線の**見せ方**（Free→Plus / Plus→Pro の出し分けUI。ただし判定ロジック §1.5 は不可侵）

**境界線**: 「画面に何をどう表示するか」は自由。「データをどう保存・判定・同期・公開するか」は §1 の不可侵領域。表示層から下（永続化・権限・課金判定・同期）には踏み込まない。

---

## 5. 判断に迷ったら

- 「これは表示の話か、それともデータ/権限/課金/同期の話か」を自問する。後者なら §1 を確認。
- §1 該当 or 判断がつかない → **実装せず Syuto に確認**（hard-stop）。
- 番号・行番号・head バージョンは**コードで確認**してから扱う（メモを信用しない）。

---

*最終更新の前提: v1.6.1 リリース済み / step B 封印中 / 2026-06 独立監査の findings を反映。具体的な migration 番号・行番号・head バージョンは実装時にコード（SSoT）で確認すること。*
