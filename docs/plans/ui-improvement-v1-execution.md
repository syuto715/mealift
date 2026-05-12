# ミーリフト UI改善 v1 実行計画書(v1.1 集約版・5-stage 構造)

| 項目 | 内容 |
|---|---|
| バージョン | v1.1 (recon-based update、 5-stage 構造) |
| 作成日 | 2026-05-10 |
| 更新日 | 2026-05-13 (Phase 0 拡張 recon 結果反映) |
| 想定実装期間 | 約 2-3 週間 (55-78 時間) |
| Syuto確認回数 | **5回** (元 4 stage → 5 stage に拡張) |

## 概要: 統合戦略 (v1.1 update)

元の 8 Phase (0→A→B→C→D→E→F→G) を **5 ステージ** に集約。 各ステージは独立して完結し、 ステージ間でのみ Syuto 確認を行う。 v1.0 の 4 ステージから、 拡張 scope (食品 3 タブ + Vision + OCR + bug fix + v1.4 prep) を吸収するため 1 ステージ追加。

```
ステージ1: 調査 + 基盤構築 (Phase 0 + Phase A 統合)              7〜10h │ 確認1回
                ↓ Syuto確認
ステージ2: マネタイゼーション動線 (Phase B + Phase C 統合)        7〜10h │ 確認1回
                ↓ Syuto確認
ステージ3: コア画面リデザイン + Issue 2 (Phase D + E + F 統合)   13〜17h │ 確認1回
                ↓ Syuto確認
ステージ4: 拡張機能 — 食品 3 タブ + Vision + OCR (NEW)          10〜16h │ 確認1回
                ↓ Syuto確認
ステージ5: 統合・QA + Issue 1 Routes SSoT + v1.4 prep           18〜25h │ 確認1回
                ↓ Syuto確認 (最終)
```

合計: **55〜78 時間**

## なぜこの集約が機能するか

| 元 Phase / 拡張 | 集約先 | 理由 |
|---|---|---|
| Phase 0 + A | ステージ1 | 調査結果に基づき共通基盤を作るため、 連続実行が効率的 |
| Phase B + C | ステージ2 | 両方ともマネタイゼーション動線に直結 |
| Phase D + E + F + Issue 2 | ステージ3 | 3 画面とも同じ共通コンポーネント使用、 Issue 2 (training ヘッダー overflow) は Phase E-1 で natural fix |
| 食品 3 タブ + Vision + OCR | ステージ4 (新規) | 食事画面リデザイン (Phase F) と独立、 Edge Function deploy + Vision/OCR integration が一体 |
| Phase G + Issue 1 + Routes SSoT + v1.4 prep | ステージ5 | 全体 QA + critical bug fix + 長期 prep の一括処理 |

## 重大判断の取り扱い (集約しても残す確認ポイント)

以下は **ステージ完了を待たずに即座に止まる** ポイント (集約版でも維持):

| 状況 | 対応 |
|---|---|
| 新規ライブラリ追加が必要 | 即座に確認 (Phase 0 で lucide-react-native は不採用済) |
| RevenueCat / Supabase / App Store 関連の変更 | 即座に確認 |
| ブランドカラー等のデザイントークン新規追加 | 即座に確認 (Phase A-1 で colors.pro 追加は計画書 §4.3 既承認) |
| 既存のコア機能 (食事/運動/体重記録/HealthKit/バーコード/食品検索) を破壊する変更 | 即座に確認 |
| 計画書から逸脱する判断が必要 | 即座に確認 |
| エラーで先に進めない | 即座に報告 |
| 想定工数を50%以上超過する見込み | 即座に確認 |
| Gemini Vision quota 限界到達 (ステージ4) | 即座に確認 |

つまり「**通常進行は1ステージごとに1回確認、 ただし重大事象は即時確認**」 という二段構え。

---

## ステージ1: 調査 + 基盤構築 (7〜10時間)

### 含むタスク

**Phase 0 (調査): 完了済**
- Phase 0 拡張 recon は本 commit の前に完了 (A-J 10 sections surface 報告 + Syuto sign-off)
- 重大判断 4 件 resolved: G-1 Ionicons 統一 / G-2 Plus tier entry / G-3 OCR meal-logging 転用 / stage 構造 4→5 再構成

**Phase A (共通基盤): 5〜7時間**
- A-1: デザイントークン拡張 (colors.pro + colors.proGold + Pro gradient)
- A-2: ProCard.tsx (4 状態対応: free / trial / plus / pro)
- A-3: ProTeaser.tsx、 ProInlineCTA.tsx
- A-4: EmptyState.tsx、 SectionHeader.tsx
- **A-5: useProStatus.ts — SKIP (既存 useSubscription 流用)**

### 実行ルール

1. Phase 0 完了 → Phase A の順で連続実行
2. Phase A の各コンポーネントは Codex に並列委譲 OK
3. 完了報告は一括で行う
4. ステージ完了時 Codex MCP review pair 起動推奨

### Codex 委譲の積極活用

ステージ1 の Phase A は **最も Codex 委譲に向いている**:
- 純粋な UI コンポーネント (ロジック少)
- 既存パターンへの依存少
- 並列実装可能

推奨パターン:
```
Claude Code が Phase A を設計
→ A-1, A-2, A-3, A-4 を Codex に並列委譲 (or Claude Code が直接実装)
→ 全部統合してテスト
→ 一括報告
```

### 完了報告内容

```markdown
## ステージ1 完了報告

### Phase A 実装内容
- 新規ファイル: [一覧]
- デザイントークン: [拡張内容]
- 共通コンポーネント: [一覧 + スクリーンショット]

### テスト結果
- ユニットテスト: [結果]
- 4 状態 (free / trial / plus / pro) の動作確認: [スクリーンショット]

### Codex MCP review pair 結果
- Critical: [件数]
- Important: [件数]
- Nit: [件数 + 採用判断]

### 次ステージへ進んでよいか
"次へ" の指示をお願いします。
```

---

## ステージ2: マネタイゼーション動線 (7〜10時間)

### 含むタスク

**Phase B (AIメニュー画面): 4〜6時間**
- B-1: 画面構造・ヘッダー
- B-2: 部位選択カードグリッド
- B-3: 時間選択 (意味付き4択)
- B-4: プライマリボタン + Plus アップセル
- B-5: 生成中ローディング演出

**Phase C (設定画面): 3〜4時間**
- C-1: Plus カード最上部配置 (4 状態切り替え)
- C-2: AI 栄養推定セクション改善
- C-3: 「プラン管理」 項目整理

### 実行ルール

1. Phase B → Phase C の順で連続実行
2. AIメニュー画面と設定画面は両方とも Plus カード/CTA を使うため、 まとめて実装すると一貫性が出やすい
3. ステージ1 で作った共通コンポーネント (ProCard, ProTeaser, ProInlineCTA) を **ここで初めて実戦投入**
4. 生成中ローディング演出は、 Onboarding のパーソナライズ進捗と同じ実装パターンを流用

### 重大判断ポイント

以下は即時確認:
- 部位選択カードのアイコンが Ionicons で見つからない / カスタム SVG 必要
- AIメニュー残量カウンタの既存ロジックが壊れる懸念
- 「プラン管理」 項目を削除するとディープリンクが切れる可能性

---

## ステージ3: コア画面リデザイン + Issue 2 fix (13〜17時間)

### 含むタスク

**Phase D (ホーム画面): 6〜8時間**
- D-1: 時間帯別グリーティングヘッダー
- D-2: カロリーカード強化
- D-3: ワークアウトカード (2状態)
- D-4: 週間達成率の視覚化
- D-5: 目標到達予測カード
- D-6: Plus 機能ティーザー

**Phase E (トレーニング画面): 4〜5時間**
- **E-1: ヘッダー整理 (Issue 2 natural fix — 3-button overflow 解消、 ピリオダイゼーション button visual hierarchy)**
- E-2: エンプティステート
- E-3: ルーティンカード
- E-4: 分析セクションのエンプティ対策
- E-5: ルーティン作成モーダル改善

**Phase F (食事画面): 3〜4時間**
- F-1: ヘッダー強化 (進捗バー追加)
- F-2: 食事セクションのエンプティ CTA
- F-3: 時間帯アイコン統一 (既存 MEAL_ICONS 流用確認)
- F-4: 「栄養バランスを見る」 強化

### 実行ルール

1. D → E → F の順で連続実行
2. 3 画面とも同じ共通コンポーネント (EmptyState, SectionHeader 等) を使うため、 まとめて実装が最も効率的
3. **既存機能を壊さないこと** が最優先 (コア機能 6 項目を絶対に破壊しない)
4. Issue 2 (training ヘッダー overflow) は Phase E-1 で natural fix、 別タスク扱い不要
5. 各画面の完了時にスクリーンショットを取得しておき、 ステージ完了報告でまとめて提示

### 中間の自己点検 (報告は不要、 内部チェック)

各 Phase 終了時に内部で以下を確認:
- ホーム画面完了時: 既存機能 6 項目が動くか
- トレーニング画面完了時: 同上 + Issue 2 (ヘッダー overflow) が解消されたか
- 食事画面完了時: 同上

ここで何か壊れていれば即座に止めて Syuto に報告。

### 重大判断ポイント

以下は即時確認:
- ホーム画面のリデザインで既存のレイアウトが大幅に変わる場合
- ルーティン作成モーダルの既存ロジック (Zustand store 等) に影響が及ぶ場合
- 食事画面の AI 推定 CTA が既存のフローと競合する場合

---

## ステージ4: 拡張機能 — 食品 3 タブ + Vision + OCR (10〜16時間)

### 含むタスク (NEW)

**食品追加 3 タブ統合 UI (5〜7時間)** (§5.6)
- SegmentedControl で「検索」 / 「📷 スキャン」 / 「📊 ラベル OCR」 タブ
- 既存 nutrition/add.tsx の段階的 refactor
- バーコードスキャンは「検索」 タブ内 secondary action

**フードスキャン (Gemini Vision) (4〜6時間)** (§5.7)
- Edge Function `estimate-nutrition` を multimodal 対応 (model: flash-lite → flash)
- Client: 食品追加 3 タブの「📷 スキャン」 タブから expo-camera takePictureAsync → base64 → fetch
- Cost: per-call ~$0.0005-0.001、 既存 quota で十分

**食品ラベル OCR meal-logging 転用 (3〜5時間)** (§5.8)
- 既存 submission-ocr-scan の ML Kit + nutritionLabelParser を meal-logging で再利用
- 食品追加 3 タブの「📊 ラベル OCR」 タブから呼び出し
- 新規 dependency: 不要

### 実行ルール

1. 食品 3 タブ UI を先に基盤として組む → Vision/OCR を統合
2. Vision Edge Function deploy は Supabase 側、 環境変数 + cost monitoring を確認
3. OCR は既存実装の流用、 主に UI integration

### 重大判断ポイント

- Gemini Vision quota 不足 (5 USD/month → 15-30 USD/month estimate)
- Edge Function deploy 失敗 / 既存 quota row schema 衝突
- 既存 nutrition/add.tsx の rewrite が大規模になる場合 → 別 phase 分割検討

---

## ステージ5: 統合・QA + Issue 1 + v1.4 prep (18〜25時間)

### 含むタスク

**Phase G (統合・QA): 3〜4時間**
- G-1: 全画面通しテスト (複数ペルソナ)
- G-2: iOS 実機テスト
- G-3: アクセシビリティ調整
- G-4: パフォーマンス確認

**Critical bug fix: Issue 1 + Routes SSoT (1〜2時間)** (§5.9)
- 4 broken `/(tabs)/home` → `/(tabs)` string replacement
- `src/constants/routes.ts` SSoT crystallization (Pattern 18) — HOME + SETTINGS_SUBSCRIPTION + Onboarding 高頻度 (~10 constants)
- 既存 5+ Pro CTA entry points + HOME 6 箇所を constants 経由に置換 (~11 references)

**v1.4 prep (15〜20時間)**
- Auth Tier 2 proper design (4-6h、 onAuthStateChange listener boundary、 SIGNED_OUT 観測 + recoverable session probe)
- Auth Tier 3 placement reorder (1-2h、 startAutoRefresh を _layout.tsx initialize() AFTER onAuthStateChange subscribe)
- RNTL preset 整備 (5-8h、 jest-expo + jest.config + jest.setup + Babel 連携)
- Android RevenueCat 整備 (5-8h、 v1.5 へ defer 可)
- app.config.ts:39 buildNumber: '1' line 削除 (5 min)
- Onboarding v1-migration 文言 fine-tune (30 min、 「更新させてください」 → 「更新してください」 / 「約 3 分」 → 「約 5 分」、 採用判断 Syuto に確認)

### 実行ルール

1. 計画書 §12.4 のテストシナリオ 8 種を全て実施
2. iPhone SE / iPhone 15 Pro で確認
3. アクセシビリティ: VoiceOver で主要要素が読み上げられるか確認
4. Issue 1 fix の regression: TestFlight build 21+ で manual verify
5. 完了時 Codex MCP review pair 起動推奨

---

## Codex委譲の集約戦略

| ステージ | Codex に委譲する作業 |
|---|---|
| ステージ1 | 共通コンポーネント 4 個を並列委譲 (A-1〜A-4) |
| ステージ2 | 部位選択カード、 時間選択 UI 等純粋 UI コンポーネント |
| ステージ3 | 各画面のサブコンポーネント (カード単位で並列化) |
| ステージ4 | Vision Edge Function ドラフト、 OCR integration UI |
| ステージ5 | テストケースの大量生成、 Routes SSoT 拡張 |

**重要:** Codex 委譲の有無は Syuto への報告対象外 (内部最適化)。

## 完了までの最短スケジュール例

専業ベース・8 時間/日:

| 日 | 作業 | 工数 | 確認 |
|---|---|---|---|
| 1日目 | ステージ1 Phase A (基盤、 Codex委譲含む) | 7-10h | 1日目終了時 |
| 2日目 | ステージ2 (マネタイゼーション動線) | 8h | 2日目終了時 |
| 3日目 | ステージ3 前半 (Phase D ホーム + Phase E トレーニング) | 8h | - |
| 4日目 | ステージ3 後半 + ステージ4 前半 | 8h | 4日目終了時 |
| 5日目 | ステージ4 後半 + ステージ5 前半 (Phase G + Issue 1) | 8h | 5日目終了時 |
| 6日目 | ステージ5 後半 (v1.4 prep) | 8h | 6日目終了時 |
| 7日目 | バッファ + 最終 QA | 4-8h | 最終 |

Syuto確認: **5 回** (元 v1.0 では 4 回)

## 実行中の柔軟性

このスケジュールは目安。 以下の状況なら **ステージをさらに細分化**:
- 想定工数を 50% 以上超過しそう
- 重大判断が頻発する
- 既存コードベースとの整合性が複雑

逆に **より一気に進める**:
- 順調に進んでいて重大判断ゼロ
- Codex 委譲が想定以上に機能している
- Android RevenueCat を v1.5 へ defer する判断なら ステージ5 5-8h 短縮

## このアプローチの長所と短所

### 長所
- Syuto の認知負荷削減 (確認 5 回で済む)
- Claude Code の連続性向上 (同じコンテキストで作業継続)
- Codex 委譲の効率化 (ステージ単位でまとめ)
- 完了までの体感速度向上
- 拡張 scope (食品 3 タブ + Vision + OCR) + critical bug fix + v1.4 prep を一括対応

### 短所と対策
- 1 ステージで大量の変更 → スクリーンショット・動画多めに添付
- ロールバック範囲広 → Git コミット細かく分割
- 中間方向修正しにくい → 重大判断は即時確認ルール維持
- 中間成果物見えない → 進捗報告 §13.3 任意実施

## 実行時の優先順位

```
1. 重大判断ルール (ハンドブック §4)
2. 本書の実行手順 (ステージ1〜5)
3. ハンドブックのコーディング規約
4. 計画書の仕様
```

矛盾した場合は上から優先。

## 実行開始の合図

```
1. ハンドブック §2 の Phase 0 調査タスクを実行 (完了済)
2. 重大判断が発生しない限り、 Phase A に連続突入
3. ステージ1 完了時にまとめて報告
```

最初の確認待ち = ステージ1 完了時 (or 重大判断 trigger 時)
