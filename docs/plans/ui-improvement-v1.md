# ミーリフト UI改善 v1 実装計画書

| 項目 | 内容 |
|---|---|
| バージョン | v1.1 (recon-based update) |
| 作成日 | 2026-05-10 |
| 更新日 | 2026-05-13 (Phase 0 recon-based update) |
| 対象プロジェクト | ミーリフト (Mealift) |
| 対象リポジトリ | `syuto715/mealift` (private) |
| 作業ディレクトリ | `~/bodyforge` (WSL) |
| 想定実装期間 | **約 55-78 時間** (recon-based、 元 30-41h + 拡張 + v1.4 prep + bug fix) |
| 想定リリース時期 | iOS App Store v1.4.0 (v1.3.0 は ship せず、 v1.4.0 で一括 ship) |
| 前提条件 | Onboarding v2 (v1.3.0) 実装完了済み、 build 20 TestFlight verified |

## 0. 改訂履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| v1.0 | 2026-05-10 | 初版作成 |
| v1.1 | 2026-05-13 | Phase 0 拡張 recon 結果反映 (5 items): §4.3 Ionicons 統一 / §5.4 ピリオダイゼーション button 追加 / §8.2 PrimaryButton + ProgressCircle + useProStatus 削除 / §9 5-stage 構造 / §13 scope-IN 食品 3 タブ + Vision + OCR + Issue fixes |

## 1. 概要(Executive Summary)

### 1.1 本計画の目的

ミーリフトの主要5画面のUI/UXを改善 + v1.4 ship に向けた拡張 scope + critical bug 修正 + v1.4 prep を一括対応:

1. 「ガチ筋トレ × 温かさ」のブランドトーンを全画面で統一
2. マネタイゼーション動線の発見性を高め、有料転換率を3% → 6%へ
3. AIメニュー機能の魅力を視覚的に伝え、Plus機能の価値を理解させる
4. 第一印象で「本格派フィットネス・栄養アプリ」と認識させる
5. **(v1.1 追加)** 食品追加 3 タブ統合 UI + フードスキャン (Gemini Vision) + 食品ラベル OCR meal-logging 転用
6. **(v1.1 追加)** Critical bug fix: Issue 1 (HealthKit 後 `/(tabs)/home` Unmatched Route) + Issue 2 (training ヘッダー overflow) — Routes SSoT crystallization
7. **(v1.1 追加)** v1.4 prep: Auth Tier 2 proper design + RNTL preset + Android RevenueCat + app.config.ts cleanup

### 1.2 何を作るか(成果物)

5つの主要画面のリデザイン:
- AIメニュー生成画面 (Plus 誘導)
- 設定画面・プラン管理セクション (Plus 価値の明示、 トライアル誘導)
- ホーム画面 (個性のある第一印象、 Plus 機能ティーザー)
- トレーニング画面 (空状態の温かさ、 CTA 強化、 ピリオダイゼーション button 含む header 整理)
- 食事画面 (食品追加の発見性向上、 AI 誘導)

加えて:
- ブランドトーン定義書(全画面に適用可能な指針)
- デザイントークン拡張(既存トークンに不足分を追加)
- 再利用可能な改善コンポーネント(各画面で共通利用)
- **(v1.1 追加)** 食品追加 3 タブ統合 UI (検索 / Vision スキャン / ラベル OCR + バーコード)
- **(v1.1 追加)** Routes SSoT (`src/constants/routes.ts`、 Pattern 18 crystallization)

### 1.3 何を作らないか(スコープ外)

- エクササイズイラスト本体の作成(Phase C で別途検討)
- ダークモード対応(v1.1 / v1.5 で別途検討、 ただし theme/tokens.ts には既に dark mode neutrals 存在)
- 新機能の追加(既存機能の UI 改善 + Vision/OCR meal-logging 転用のみ)
- アーキテクチャの変更(既存スタックを維持)
- データモデルの変更(SQLite/Supabase スキーマは触らない)
- Pro tier 専用 promotion (Plus tier entry のみ訴求、 Pro tier は別 path で v1.5+ defer)
- Routes SSoT の全 ~60 references 包括 crystallization (HOME + SETTINGS_SUBSCRIPTION + Onboarding 高頻度のみ、 残り v1.5+ defer)

### 1.5 期待される効果

| 指標 | 現状(推定) | 目標 |
|---|---|---|
| 有料転換率(14日 Plus トライアル → 課金) | 3〜4% | 6〜8% |
| AIメニュー機能の月次利用率 | 20%以下 | 40%以上 |
| ホーム画面からの離脱率 | 高 | 30%減 |
| Onboarding 完了率 (Issue 1 fix) | ~60% (推定、 build 20 の HealthKit 後 unmatched route trip 影響) | 90%+ |

## 2. 戦略的位置づけ

### 2.1 全体ロードマップ

- Phase 1: コア機能(完了済)
- Phase 2: オンボーディング (v1.3.0 完了済)
- **Phase 3: UI改善 v1 + 拡張 ← 本計画書 (v1.4.0 ship)**
- Phase 4: ダークモード対応(v1.5)
- Phase 5: ビジュアルリッチ化(v1.6)
- Phase 6: 本格3Dビジュアル(v2.0)

### 2.2 競合との位置づけ

「日本語ネイティブで科学的に正直、 ガチ勢に応えつつ温かい」 というポジションを視覚的に確立。 あすけん / カロミル / Calog / MacroFactor / Gymwork との対比。

## 3. 対象画面と優先順位

| 優先度 | ID | 画面名 | 工数 |
|---|---|---|---|
| ★★★★★ | S1 | AIメニュー生成画面 | 4〜6h |
| ★★★★★ | S2 | 設定画面 + プラン管理 | 3〜4h |
| ★★★★ | S3 | ホーム画面 | 6〜8h |
| ★★★ | S4 | トレーニング画面 (ヘッダー 3-button 整理含む) | 4〜5h |
| ★★★ | S5 | 食事画面 | 3〜4h |

## 4. ブランドトーン定義

### 4.1 トーンの3軸

| 軸 | ミーリフトの位置 |
|---|---|
| 本格派 ⇔ ライト | 本格派寄り(70%) |
| 男性的 ⇔ 中性的 | 中性的(50%) |
| クール ⇔ 温かい | やや温かい(60%) |

### 4.2 言葉づかい

推奨: 「○○さん」「あなたの」、 「いいペースです」、 「八訂データに基づき...」、 「うまくいきませんでした」
避ける: 「キミ」「お前」、 「死ぬ気で頑張れ」、 「最安値特典はまもなく終了!」、 絵文字の多用

### 4.3 視覚言語 (v1.1 update)

- カラーパレット: プライマリ (既存ブランド青 `#1A73E8`)、 Plus/プレミアム (新規追加: `colors.pro` グラデーション、 Phase A-1 で導入)、 成功 (緑)、 警告 (オレンジ)、 エラー (赤)
- タイポグラフィ階層: `displayLarge` (34/700)、 `displayMedium` (28/700)、 `titleLarge` (22/600)、 `titleMedium` (18/600)、 `titleSmall` (16/600)、 `bodyLarge` (16/400)、 `bodyMedium` (14/400)、 `bodySmall` (12/400)、 `labelLarge/Medium/Small`、 `numberLarge` (40/700, tabular-nums)、 `numberMedium` (24/700)、 `numberSmall` (18/600) — 既存 `src/theme/typography.ts` 値そのまま使用
- 余白の規則: 4の倍数のみ (`spacing.xs:4 / sm:8 / md:12 / lg:16 / xl:20 / xxl:24 / xxxl:32 / xxxxl:40`) — 既存 `src/theme/spacing.ts` 値そのまま使用
- **アイコン: 第一選択 `@expo/vector-icons` (Ionicons) — v1.1 update**:
  既存 5 画面 + Onboarding v2 全 Ionicons 統一使用済、 lucide-react-native の追加は Pattern 18 SSoT 違反 + 不要な bundle 150KB increase、 ライブラリ統一を選択。 SVG 必要なら `react-native-svg` (既 prebuilt) を直接使用 (部位アイコン等)
- 絵文字の使用 原則禁止 (例外: ニックネーム表示、 達成感演出、 ボタンラベルの先頭装飾)

## 5. 画面別改善仕様

### 5.1 [S1] AIメニュー生成画面 (4〜6h)

改善方針:
- 画面タイトル: 「AI メニュー生成」 → 「**AIトレーナー**」 (機能名→人格化)
- キャッチコピー: 「あなた専用のメニューを、AIが作成します」
- 部位選択: テキストチップ → アイコン+テキストの大きめカード、 2列グリッド (胸/背中/肩/腕/脚/腹、 + 全身)
- 時間選択: 「30分・軽め(4-5種目)/45分・標準(6-7種目)/60分・しっかり(8-9種目)/90分・じっくり(10種目以上)」
- 生成ボタン: プライマリブランドカラー、 画面幅いっぱい、 56px、 影あり
- ボタン下: 「Plusなら無制限で生成 →」 (controlled アップセル、 G-2 resolution に基づき Plus tier entry)
- ローディング演出: 「AIトレーナーがメニューを作成中...」 + 4 step progress (最低3秒、 最大5秒)

### 5.2 [S2] 設定画面 + プラン管理 (3〜4h)

最上部に Plus プロモーションカードを新設、 4 状態切り替え (既存 `useSubscription` の 4-status `'free' | 'trial' | 'plus' | 'pro'` mapping):
- `free`: 「Mealift Plus」 訴求 + 「14日間 無料で試す」 CTA
- `trial`: 「あと N 日でトライアル終了」 + 進捗バー
- `plus`: 「Mealift Plus 利用中」 + 次回更新日
- `pro`: 「Mealift Pro 利用中」 (top tier、 Plus CTA 非表示)

「AI栄養推定」 セクション: 「Plus で使ってみる」 サブボタン追加
「プラン管理」 項目削除、 最上部の Plus カードに統合

### 5.3 [S3] ホーム画面 (6〜8h)

A. 時間帯別グリーティングヘッダー: 5〜10時「おはようございます」、 10〜17時「こんにちは」、 17〜22時「こんばんは」、 22〜5時「お疲れさまです」 + 太陽/月 アイコン 1個
B. メインカロリーカード (最も目立つ位置): 円形プログレス (既存 `ui/ProgressRing.tsx` 流用) + 残り kcal 最大、 PFC 進捗バー (既存 `ui/ProgressBar.tsx` 流用)
C. 今日のワークアウトカード (2状態): 未予定なら「AIメニューを作成する」 CTA、 予定あり なら「ワークアウト開始」
D. 週間達成率: 食事/トレ別 progress bar + 曜日別 dots (●○)
E. 目標到達予測カード: オンボーディング目標を引用、 予想達成日 + プログレスバー
F. Plus 機能ティーザー (末尾): `useSubscription().isFree` のみ表示 (trial / plus / pro は非表示)

### 5.4 [S4] トレーニング画面 (4〜5h) — v1.1 update

**Issue 2 fix scope 含む**: 既存ヘッダーは 3 buttons (「✨ AIメニュー」 + 「📅 ピリオダイゼーション」 Pro-only + 「+ ルーティン作成」) で narrow 画面 overflow trip。

A. ヘッダー整理 (3-button visual hierarchy 確立):
   - 「+ ルーティン作成」 + 「✨ AIメニュー」 並列 primary
   - 「📅 ピリオダイゼーション」 (Pro-only、 `sub.hasFeature('periodizationPresets')` gating) は secondary、 アイコンのみ button + ラベルなし or compact icon+text
   - フリーセッションはセカンダリ (元 plan 通り)
B. エンプティステート: 「ルーティンを作って始めましょう」 + 「AIにメニューを作ってもらう」 プライマリ CTA + 「自分で作成」 セカンダリ
C. ルーティンカード: 名前 + 種目数・時間 + 最終実施
D. 分析セクションのエンプティ対策: 「データを蓄積中です」
E. ルーティン作成モーダル: 名前 + 部位選択 + 種目追加、 「AIに種目を提案してもらう」 Plus 誘導

### 5.5 [S5] 食事画面 (3〜4h)

A. ヘッダー: 進捗バー追加
B. 食事セクション(温かいエンプティ): 「✨ AIで記録(料理名から)」 プライマリ CTA、 「+ 食品を追加」 「📷 写真から」 セカンダリ
C. 時間帯ごとのアイコン: 朝食 (sunny-outline)、 昼食 (partly-sunny-outline)、 夕食 (moon-outline)、 間食 (cafe-outline) — **既存 `app/(tabs)/nutrition/index.tsx:48-52` の MEAL_ICONS と一致確認済**
D. 「栄養バランスを見る →」 矢印付き

### 5.6 [拡張] 食品追加 3 タブ統合 UI (v1.1 新規 5-7h)

既存 `app/(tabs)/nutrition/add.tsx` の entry point を SegmentedControl で 3 タブ統合:
- タブ 1: 「検索」 — 既存 `searchFoods()` + `searchDishes()` + `getFrequentFoods()` を再利用
- タブ 2: 「📷 スキャン」 — 新規 Vision food scan (Gemini 2.5 Flash multimodal、 §5.7 参照)
- タブ 3: 「📊 ラベル OCR」 — 既存 `submission-ocr-scan.tsx` の ML Kit + parser を meal-logging 用に転用
- バーコードスキャンは「検索」 タブ内 secondary action として配置

実装: 既存 `ui/SegmentedControl.tsx` 流用、 lazy-render content。 既存 add.tsx の段階的 refactor。

### 5.7 [拡張] フードスキャン (Gemini Vision) (v1.1 新規 4-6h)

- Edge Function 拡張: `supabase/functions/estimate-nutrition/` を multimodal 対応 (model: `gemini-2.5-flash-lite` → `gemini-2.5-flash`)
- Input: image base64 (mime: image/jpeg) + 既存 prompt schema
- Output: 既存 Foods array structured JSON (variant: 「写真から推定」 marker 付与)
- Client: 食品追加 3 タブの「📷 スキャン」 タブから `expo-camera takePictureAsync` → base64 → fetch → 結果表示
- Cost: per-call ~$0.0005-0.001 USD、 既存 DAILY_QUOTA_PRO=50 quota で十分
- 新規 SDK / dependency: 不要 (全 server-side + 既存 expo-camera + fetch)

### 5.8 [拡張] 食品ラベル OCR meal-logging 転用 (v1.1 新規 3-5h)

- 既存 `submission-ocr-scan.tsx` ML Kit + `nutritionLabelParser.ts` を meal-logging 用に転用
- 食品追加 3 タブの「📊 ラベル OCR」 タブから呼び出し
- Output: 栄養成分表 structured fields → mealLog 保存 + Foods DB に optional 追加 (custom food)
- 新規 dependency: 不要 (全既存実装の流用)

### 5.9 [Critical fix] Issue 1 — HealthKit 後 Routing Crash (v1.1 新規 1h)

- 4 broken `router.replace('/(tabs)/home')` → `/(tabs)` string replacement
- ファイル: `app/(onboarding)/healthkit.tsx` (×2) + `app/(onboarding)/tier-preview.tsx` (×2)
- 並行 architectural fix: `src/constants/routes.ts` SSoT crystallization (Pattern 18) — HOME + SETTINGS_SUBSCRIPTION + Onboarding 高頻度 route constants の最小集合 (10 constants)

## 6. マネタイゼーション動線設計 (v1.1 update — Plus tier entry)

### 6.1 動線設計の原則

- 発見性 > 押し売り
- 機能の価値を見せてから誘導(Apple純正アプリ風)
- 14日 Plus トライアル前提 (v1.3.0 tier-preview と整合)
- 複数のタッチポイント (5〜6箇所)

### 6.2 タッチポイント一覧 (v1.1 update)

1. 設定画面・最上部 Plus カード (★★★)
2. AIメニュー画面・「Plus なら無制限」 (★★★)
3. 食事画面・「AI で記録」 ボタン (★★)
4. ホーム画面・末尾 Plus ティーザー (★★)
5. AI 栄養推定設定セクション・「Plus で使ってみる」 (★★)
6. AIメニュー残量0時の自然訴求 (★)
7. ホーム画面右上の Plus 加入状態バッジ (★)

### 6.4 トライアル管理 (v1.1 update — 既存 useSubscription 4-status)

| `useSubscription().status` | 表示変化 |
|---|---|
| `free` | 「14日間 無料で試す」 |
| `trial` (1〜10日目) | 「無料トライアル中(あと N 日)」 |
| `trial` (11〜13日目) | 「あと N 日でトライアル終了。継続するには登録を」 |
| `trial` (14日目) | 「明日からPlusが終了します」 |
| `plus` | 「Mealift Plus 利用中」 + 次回更新日 |
| `pro` | 「Mealift Pro 利用中」 (top tier) |

注: 「trial_ending」 / 「expired」 は実装 PlanStatus にない、 derived value は `useSubscription` の trial 残日数 + plan from RevenueCat info で算出。

## 7. ビジュアル要素の調達戦略

### 7.1 アイコン (v1.1 update)

- 一般 UI: `@expo/vector-icons` (Ionicons) — 既存統一
- 部位選択: `react-native-svg` で custom SVG または Ionicons (例: `body-outline` + 部位 indicator)
- 機能アイコン: Ionicons

### 7.2 イラスト

- エンプティステート: 簡素な線画イラスト
- エクササイズ動作: 本計画ではスコープ外 (v1.6 で別途検討)

### 7.4 写真

本計画書では写真は使わない(ブランド統一のため、 すべてイラスト・アイコン・タイポグラフィ)。

## 8. 技術アーキテクチャ

### 8.1 既存スタックとの整合

Onboarding v2 と同じスタック: React Native + Expo SDK 54、 Expo Router、 Zustand、 TanStack Query、 expo-sqlite、 Supabase、 react-native-mmkv、 RevenueCat (Plus/Pro tier)、 @react-native-ml-kit/text-recognition (OCR)、 @kingstinct/react-native-healthkit (iOS)、 expo-apple-authentication

### 8.2 新規ファイル (v1.1 update — 既存 supersede 反映)

```
src/
├── components/
│   └── shared/                    # ★新規・共通コンポーネント
│       ├── ProCard.tsx            # ProCard (Plus tier entry、 4-status)
│       ├── ProTeaser.tsx
│       ├── ProInlineCTA.tsx
│       ├── EmptyState.tsx
│       └── SectionHeader.tsx
│   # SUPERSEDE: PrimaryButton.tsx は既存 ui/Button.tsx 流用 (variant="primary" size="lg" fullWidth)
│   # SUPERSEDE: ProgressCircle.tsx は既存 ui/ProgressRing.tsx 流用 or 拡張
├── components/
│   ├── home/
│   │   ├── GreetingHeader.tsx
│   │   ├── CalorieCard.tsx
│   │   ├── WorkoutCard.tsx
│   │   ├── WeeklyAchievement.tsx
│   │   └── GoalProgressCard.tsx
│   ├── workout/
│   │   ├── AIMenuButton.tsx
│   │   ├── BodyPartSelector.tsx
│   │   ├── DurationSelector.tsx
│   │   └── RoutineCard.tsx
│   └── meals/
│       ├── MealSection.tsx
│       └── MealEmptyState.tsx
├── constants/
│   └── routes.ts                  # ★新規 Routes SSoT (Pattern 18 crystallization)
└── theme/
    └── tokens.ts                  # 拡張 (colors.pro 追加)
# SUPERSEDE: hooks/useProStatus.ts は既存 hooks/useSubscription.ts 流用
```

### 8.3 状態管理 (v1.1 update — 既存 useSubscription 採用)

`src/hooks/useSubscription.ts` (既存) を全画面で使用:

```typescript
interface UseSubscriptionResult extends PlanSnapshot {
  plan: PlanTier;            // 'free' | 'plus' | 'pro'
  isFree: boolean;
  isTrial: boolean;
  isPlus: boolean;
  isPro: boolean;
  isPaid: boolean;           // plus || pro
  isLoading: boolean;
  hasFeature: (feature: BooleanFeatureKey) => boolean;
  subscribe: (packageId: string) => Promise<boolean>;
  restore: () => Promise<void>;
}
```

計画書 v1.0 の `useProStatus` 想定 5-status (`'free' | 'trial' | 'pro' | 'trial_ending' | 'expired'`) は実装 PlanStatus 4-status (`'free' | 'trial' | 'plus' | 'pro'`) + derived value (`isTrial && trialDaysRemaining < 3 → trial_ending`) で表現。

### 8.4 DB スキーマ

本計画書では DB スキーマは変更しない。 RevenueCat の状態は MMKV にキャッシュ、 Supabase には保存しない (既存 architecture と整合)。

## 9. 実装フェーズ計画 (v1.1 update — 5-stage 構造)

実行計画書 `ui-improvement-v1-execution.md` の 5-stage 構造に再構成 (元 4-stage):

### ステージ 1: 調査 + 基盤構築 (7〜10h)
- Phase 0 (調査、 完了済 — 本 commit 前): 既存画面構造 / 共通 components / トークン / RevenueCat / アイコン / 食品追加 / Vision / OCR / v1.4 prep
- Phase A: 共通基盤 (A-1 tokens.ts 拡張 / A-2 ProCard / A-3 ProTeaser+ProInlineCTA / A-4 EmptyState+SectionHeader)
- A-5 useProStatus は **削除** (useSubscription 流用)

### ステージ 2: マネタイゼーション動線 (7〜10h)
- Phase B (AIメニュー画面): B-1..B-5
- Phase C (設定画面): C-1..C-3

### ステージ 3: コア画面リデザイン + Issue 2 fix (13〜17h)
- Phase D (ホーム): D-1..D-6
- Phase E (トレーニング): E-1..E-5、 **E-1 で Issue 2 (ピリオダイゼーション button overflow) natural fix**
- Phase F (食事): F-1..F-4

### ステージ 4: 拡張機能 — 食品 3 タブ + Vision + OCR (10〜16h)
- 食品追加 3 タブ統合 UI (5-7h、 §5.6)
- フードスキャン Gemini Vision (4-6h、 §5.7)
- 食品ラベル OCR meal-logging 転用 (3-5h、 §5.8)

### ステージ 5: 統合・QA + Critical bug fix + v1.4 prep (18〜25h)
- Phase G 統合・QA (3-4h)
- Issue 1 Routes SSoT + 4 string fix (1-2h、 §5.9)
- Auth Tier 2 proper design (4-6h、 onAuthStateChange listener boundary)
- Auth Tier 3 placement reorder (1-2h、 v1.4 defer 可)
- RNTL preset 整備 (5-8h、 Build 15+ TODO 12)
- Android RevenueCat 整備 (5-8h、 別 phase へ defer 可)
- app.config.ts:39 buildNumber cleanup (5 min)
- Onboarding v1-migration 文言 fine-tune (30 min、 Codex Nit defer 採用判断)

合計: **55〜78 時間** / 約 2-3 週間 (専業ベース)

## 10. Codex連携運用ルール

- B モード (サブエージェント) 主軸 + A モード (独立レビュー)
- Codex 委譲: Phase A 共通コンポーネント、 単純な構造化、 型定義、 ユニットテスト
- Codex 非委譲: useSubscription 経由の RevenueCat 連携部分、 ルーティン作成モーダル、 Phase G QA
- A モード起動: 各ステージ完了時 (5 回)

## 11. リスクと軽減策

### 11.1 技術リスク
- RevenueCat Plus/Pro 判定複雑 → useSubscription 流用で一元化
- ホーム画面パフォーマンス → React.memo、 FlatList
- 既存コンポーネント混在 → Phase A でトークン拡張
- Gemini Vision quota 不足 → 既存 DAILY_QUOTA_PRO=50 で十分、 ただし運用監視

### 11.2 UX リスク
- Plus 訴求が押し売り見え → コピー慎重、 複数案、 Syuto 承認
- 既存ユーザーへの違和感 → 段階的リリース
- 「Pro」 brand name vs 「Plus」 tier 実装の confusion → 統一: マネタイゼーション CTA は 「Plus」、 Pro tier は別 path

### 11.3 スケジュールリスク
- Phase D 複雑 → サブタスク細分化
- Vision Edge Function deploy → ステージ 4 で Supabase deploy + テスト
- ステージ 5 が長い (18-25h) → optional な Auth Tier 3 + Android RevenueCat を別 phase 検討

## 12. 受け入れ基準

### 12.1 機能要件
- [ ] [S1〜S5] 各画面が改善仕様通り
- [ ] 全画面でブランドトーン (§4) 遵守
- [ ] Plus tier 判定ロジック全画面で正常動作 (useSubscription 経由)
- [ ] 食品追加 3 タブ統合 UI (検索 / Vision / OCR)
- [ ] Issue 1 (HealthKit 後 routing) fix verified、 Issue 2 (training ヘッダー overflow) natural fix verified

### 12.2 非機能要件
- [ ] 60fps、 iOS 16.6+、 Android 9+、 iPhone SE (小画面)
- [ ] 既存機能 (食事/運動/体重) 影響なし
- [ ] VoiceOver で主要要素読み上げ

### 12.3 マネタイゼーション動線
- [ ] Plus 未加入が 4 画面のいずれかから 14日トライアルに到達
- [ ] トライアル中が 3 画面以上で残り日数確認
- [ ] Plus 加入済に押し売り CTA 非表示
- [ ] Pro 加入済に Plus CTA 非表示 (top tier 認識)
- [ ] トライアル終了 3 日前から軽い注意喚起

### 12.4 テストシナリオ (8種)

| # | シナリオ | 期待結果 |
|---|---|---|
| ① | Plus 未加入で設定画面 | 最上部 Plus カード「14日間 無料で試す」 |
| ② | Plus 未加入で AIメニュー画面 | 月3回残量 + 「Plus なら無制限」 |
| ③ | トライアル7日目で設定画面 | 「あと7日」 + 進捗バー |
| ④ | Plus 加入済でホーム画面 | 末尾 Plus ティーザー非表示 |
| ⑤ | トライアル12日目でホーム | 軽い注意喚起 |
| ⑥ | 早朝6時にホーム | 「おはようございます」 |
| ⑦ | ワークアウト未記録でトレ画面 | 温かいエンプティ+AIメニュー CTA |
| ⑧ | 朝食未記録で食事画面 | AI 記録 CTA + 食品検索 CTA |

## 13. スコープ外項目 (v1.1 update)

- ダークモード対応(v1.5)
- エクササイズイラスト導入 (v1.6)
- 部位ハイライト人体図 SVG (v1.6)
- ペイウォール画面 (v1.5 別計画書)
- Pro tier promotion path (v1.5+ defer、 v1.4 は Plus entry のみ)
- A/B テスト実装
- 多言語対応 (JP 限定戦略)
- Apple Watch UI (v2.0)
- マイクロインタラクション (v1.5 以降)
- カードカスタマイズ機能 (v2.0)
- ゲーミフィケーション (v1.5 別計画書)
- **Routes SSoT 包括 crystallization** (v1.4 は HOME + SETTINGS_SUBSCRIPTION + Onboarding 高頻度のみ、 残り ~45 references は v1.5+ defer)

### v1.1 で **scope-IN** (元スコープ外、 recon-based 反映):
- 食品追加 3 タブ統合 UI
- フードスキャン (Gemini Vision)
- 食品ラベル OCR meal-logging 転用
- Critical bug fix: Issue 1 (HealthKit routing) + Issue 2 (training ヘッダー)
- v1.4 prep: Auth Tier 2 + RNTL preset + Android RevenueCat + app.config.ts cleanup

## 14. 付録

### 14.1 ブランドコピー集

朝の挨拶「おはようございます、 ○○さん」、 昼「こんにちは、 ○○さん」、 夜「こんばんは / お疲れさまです、 ○○さん」、 Plus 訴求「Mealift Plus でさらに使いやすく」「14日間 無料で試す」、 エラー「うまくいきませんでした。 もう一度お試しください」

### 14.2 競合参考画面

Gymwork (エクササイズリスト、 AIメニュー)、 Apple Health (サブスク表示)、 MacroFactor (目標サマリー)、 Apple Fitness (リング)

承認: Syuto / 実装責任: Claude Code (オーケストレーター) + Codex (サブエージェント) / レビュー: Codex 最終監査
