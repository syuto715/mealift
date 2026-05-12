# ミーリフト UI改善 v1 実装ハンドブック (v1.1)

| 項目 | 内容 |
|---|---|
| バージョン | v1.1 (recon-based update) |
| 作成日 | 2026-05-10 |
| 更新日 | 2026-05-13 (5-stage 構造 + useSubscription supersede 反映) |
| 対象実装者 | Claude Code (オーケストレーター) + Codex (サブエージェント) |
| 承認者 | Syuto |
| 前提条件 | Onboarding v2 (v1.3.0) 実装完了済み、 build 20 TestFlight verified |

## 1. このハンドブックの位置づけ

### 1.1 役割分担

| ドキュメント | 役割 | 主な内容 |
|---|---|---|
| 計画書 (ui-improvement-v1.md) | WHY/WHAT | 戦略、 仕様、 画面別の改善内容 |
| 実行計画書 (...-execution.md) | WHEN/HOW MUCH | ステージ分割、 確認頻度、 工数 |
| ハンドブック (本書) | HOW | コーディング規約、 デザイン規約、 暗黙ルール |

### 1.2 読む順番

1. 計画書全体 (全14章) → 何を作るかの理解
2. 実行計画書全体 → どう進めるかの理解
3. 本ハンドブック §1〜§5 (必読) → 仕事の進め方
4. 本ハンドブック §6〜§17 (リファレンスとして都度参照) → 実装規約

### 1.3 Onboarding v2 との関係

本 UI 改善 v1 は、 Onboarding v2 (v1.3.0 完了済) と同じプロジェクトの後続フェーズ。 以下を継承:
- コーディング規約 (基本部分)
- デザイン規約の基本 (本ハンドブック §7 で拡張)
- Codex 委譲ルール
- Git・コミット規約

Onboarding 側で確立した規約・パターンを **最大限再利用** する。

## 2. 3つのドキュメントの優先順位

矛盾が生じた場合の優先順位:

```
[最優先]
1. 重大判断ルール (本書 §4)
2. 実行計画書のステージ分割と確認頻度
3. ハンドブック (本書) のコーディング規約・デザイン規約
4. 計画書の仕様詳細
[最後]
```

## 3. 基本姿勢: 集約版での仕事の進め方

### 3.1 集約版の根本的なルール

実行計画書で定義された **5 ステージ** を順次実行。 各ステージは複数の元 Phase を含むが、 **ステージ完了まで確認を求めない** (重大判断を除く)。

### 3.2 1 ステージ内での流れ

```
ステージ開始
  ↓
タスクを着手順に整理 (計画書 §9 工数表を参照)
  ↓
Codex に委譲できるタスクは並列委譲 (本書 §13)
  ↓
Claude Code がメインタスクを実装
  ↓
Codex の成果物を統合
  ↓
内部自己点検 (本書 §11.5)
  ↓
  ├── 重大判断発生 → 即時 Syuto 確認
  └── 問題なし → 次のタスクへ
  ↓
ステージ内の全タスク完了
  ↓
完了報告 (本書 §14.1)
  ↓
Syuto 承認待ち
  ↓
次ステージへ
```

### 3.3 ステージ間で守ること

- **ステージをまたがない**: ステージ2 のタスクをステージ1 中に手を付けない
- **コンテキストを保つ**: 同じステージ内では同じデザイントークン、 同じパターンを使い続ける
- **報告の質を上げる**: 確認頻度が下がる分、 1 回の報告内容を充実させる

### 3.4 暴走の自己診断

以下に該当したら **即座に止まる**:
- 計画書・実行計画書・ハンドブックのどれにも書かれていない判断
- 想定工数を大幅に超過しそう
- 自分の判断に確信が持てない
- 既存コードを大規模に変更しようとしている
- 「これは些細な変更だから確認不要だろう」 と思った時 (← 危険信号)

## 4. 重大判断の取り扱い (最重要)

**集約版では確認頻度を下げているため、 重大判断ルールの遵守が品質維持の生命線になる。**

### 4.1 即時 Syuto 確認が必要な状況 (例外なし)

| カテゴリ | 状況 |
|---|---|
| 依存追加 | 新規ライブラリの追加が必要 |
| 認証・課金 | RevenueCat / Supabase 認証ロジックの変更 |
| App Store | App Store 提出に影響する変更 |
| デザイン | ブランドカラー等のデザイントークン新規追加 (Phase A-1 の colors.pro は計画書 §4.3 既承認) |
| コア機能 | 食事/運動/体重記録/HealthKit連携/バーコード/食品検索 のいずれかを破壊する変更 |
| 仕様逸脱 | 計画書・実行計画書から大きく逸脱する判断 |
| エラー | 30 分以上自力解決できないエラー |
| 工数 | 想定工数を 50% 以上超過する見込み |
| DB スキーマ | SQLite / Supabase のスキーマ変更が必要 |
| 既存破壊 | 既存のパブリックインターフェース (他画面から参照される関数等) の変更 |

### 4.2 重大判断発生時の流れ

```
重大判断発生
  ↓
作業を即座に止める (部分実装でもコミットして安全な状態に)
  ↓
本書 §14.3 のフォーマットで Syuto に確認
  ↓
Syuto の指示を待つ
  ↓
指示に基づいて再開
```

## 5. ステージ別の実装方針

### 5.1 ステージ1: 調査 + 基盤構築

#### Phase 0 調査タスク (完了済)

Phase 0 拡張 recon は本ハンドブック commit の前に完了 (A-J 10 sections + Syuto sign-off + 重大判断 4 件 resolved)。

#### Phase A 実装方針

調査結果を踏まえて即座に基盤実装に移る。

実装順序:
1. A-1: デザイントークン拡張 (他全てが依存するため最優先)
2. A-2〜A-4: 共通コンポーネント群 (Codex 並列委譲推奨)
3. A-5 useProStatus: **SKIP** (既存 `useSubscription` 流用)

### 5.2 ステージ2: マネタイゼーション動線

Phase B 実装方針: ステージ1 で作った ProCard / ProTeaser / ProInlineCTA を **実戦投入** するフェーズ。

実装順序:
1. B-1: 画面構造・ヘッダー
2. B-2: 部位選択カードグリッド
3. B-3: 時間選択 UI
4. B-4: プライマリボタン + Plus 誘導
5. B-5: 生成中ローディング演出

Phase C 実装方針: 設定画面の Plus カードと AI 栄養推定セクション、 「プラン管理」 項目削除。

### 5.3 ステージ3: コア画面リデザイン + Issue 2

Phase D (ホーム): 6 サブカードを順次実装、 既存機能 6 項目を絶対に破壊しない
Phase E (トレーニング): ヘッダー整理が Issue 2 (3-button overflow + ピリオダイゼーション visual hierarchy) の natural fix を兼ねる、 エンプティステート優先、 既存ルーティン作成モーダルへの影響最小化
Phase F (食事): AI 推定 CTA をプライマリに、 既存食品検索フローを維持

### 5.4 ステージ4: 拡張機能 — 食品 3 タブ + Vision + OCR (NEW)

実装順序:
1. 食品追加 3 タブ統合 UI (SegmentedControl + 既存 add.tsx refactor)
2. Vision Edge Function 拡張 (model upgrade + image input)
3. Vision Client integration (食品追加 3 タブの「📷 スキャン」 タブ)
4. OCR meal-logging 転用 (既存 submission-ocr 流用、 食品追加 3 タブの「📊 ラベル OCR」 タブ)

### 5.5 ステージ5: 統合・QA + Issue 1 + v1.4 prep

Phase G + Issue 1 + v1.4 prep の一括処理。 詳細は実行計画書 ステージ5 参照。

## 6. コーディング規約

### 6.1 TypeScript

- 全ファイル `strict: true` 前提
- `any` の使用禁止 (どうしても必要な場合は理由を comment で記載)
- export 関数には JSDoc を必ず付ける
- import の順序: react/react-native → 外部ライブラリ → src/* → ./

### 6.2 React Native コンポーネント

- 関数コンポーネント (`function ComponentName(...)` または `const ComponentName = (...) =>`)
- props は明示的に type で定義 (interface ではなく type)
- `React.memo` を適切に使用 (再レンダリングが懸念される場合)
- `useMemo` / `useCallback` を不必要に乱用しない

### 6.3 ファイル命名

- コンポーネント: PascalCase (例: `ProCard.tsx`)
- フック: camelCase で `use` プレフィックス (既存 `useSubscription` 流用)
- ユーティリティ: camelCase
- 1 ファイル 1 コンポーネント、 named export 推奨

### 6.4 import 順序

```typescript
// 1. React / React Native
import React, { useState } from 'react';
import { View, Text } from 'react-native';

// 2. 外部ライブラリ
import { useQuery } from '@tanstack/react-query';

// 3. src/* 内のモジュール (アルファベット順)
import { getColors } from '../../theme/tokens';
import { useSubscription } from '../../hooks/useSubscription';

// 4. 相対パス
import { LocalHelper } from './localHelper';
```

## 7. デザイン規約

### 7.1 デザイントークン

ハードコードを禁止。 必ず `src/theme/*` から import:

```typescript
// ❌ NG
<View style={{ backgroundColor: '#1A73E8', padding: 16 }} />

// ✅ OK
<View style={{ backgroundColor: colors.primary, padding: spacing.lg }} />
```

### 7.2 カラー (既存トークン + Phase A-1 拡張)

| 役割 | トークン名 | 状態 |
|---|---|---|
| プライマリ | `colors.primary` (`#1A73E8`) | 既存 |
| プライマリ濃 | `colors.primaryDark` / `primaryLight` | 既存 |
| Plus (Pro/プレミアム) | `colors.pro` (新規 A-1) | **追加** |
| Plus gradient | `colors.proGradient` (新規 A-1) | **追加** |
| 成功 | `colors.success` | 既存 |
| 警告 | `colors.warning` | 既存 |
| エラー | `colors.error` | 既存 |
| アクセント (オレンジ) | `colors.accent` | 既存 |
| 背景 | `colors.background` | 既存 |
| カード背景 | `colors.surface` / `surfaceSecondary` | 既存 |
| テキスト主 | `colors.textPrimary` | 既存 |
| テキスト副 | `colors.textSecondary` / `textTertiary` | 既存 |
| マクロ | `colors.protein / fat / carb / calorie` | 既存 |

### 7.3 タイポグラフィ

既存 `src/theme/typography.ts` の値そのまま使用 (Phase 0 recon で確認済):

```typescript
displayLarge: 34/700/41    displayMedium: 28/700/34
titleLarge: 22/600/28      titleMedium: 18/600/24      titleSmall: 16/600/22
bodyLarge: 16/400/24       bodyMedium: 14/400/20       bodySmall: 12/400/16
labelLarge: 14/600/20      labelMedium: 12/500/16      labelSmall: 10/500/14
numberLarge: 40/700/48 (tabular-nums)   numberMedium: 24/700/30   numberSmall: 18/600/24
```

### 7.4 スペーシング

既存 `src/theme/spacing.ts`:

```typescript
xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, xxxxl: 40
```

### 7.5 アイコン (v1.1 update)

**第一選択は `@expo/vector-icons` (Ionicons)** — Pattern 18 SSoT icon library:

```typescript
import { Ionicons } from '@expo/vector-icons';

<Ionicons name="barbell" size={24} color={colors.primary} />
```

`lucide-react-native` の追加は不採用 (G-1 resolution、 既存統一性 + bundle size)。 SVG が必要な場合は `react-native-svg` (既 prebuilt) を直接使用。

絵文字の使用は原則禁止 (例外: ニックネーム表示、 達成感演出、 ボタンラベルの先頭装飾 — 「✨」 「📅」 「📷」 「📊」 等 既存パターン)。

### 7.6 ボタンサイズ (v1.1 update — 既存 ui/Button 使用)

`src/components/ui/Button.tsx` の variant / size を使用。 `PrimaryButton` は **新規作成不要**:

```typescript
// プライマリ大
<Button variant="primary" size="lg" fullWidth title="始める" onPress={...} />

// セカンダリ
<Button variant="secondary" size="md" title="スキップ" onPress={...} />

// ghost (テキストのみ)
<Button variant="ghost" size="sm" title="あとで" onPress={...} />
```

## 8. Plus 判定ロジックの規約 (v1.1 update)

### 8.1 useSubscription フックの使用

全画面で **既存 `useSubscription`** を経由して Plus/Pro 状態を取得 (計画書 §8.3 の `useProStatus` は **新規作成不要**、 既存で代替):

```typescript
import { useSubscription } from '@/hooks/useSubscription';

function MyScreen() {
  const sub = useSubscription();
  
  if (sub.isFree) {
    return <ProTeaser />;
  }
  if (sub.isTrial) {
    return <TrialBadge daysRemaining={sub.trialDaysRemaining} />;
  }
  // ...
}
```

`sub.status` は: `'free' | 'trial' | 'plus' | 'pro'` (4-status、 計画書 v1.0 想定 5-status とは差異あり)

### 8.2 直接 RevenueCat を呼ばない

```typescript
// ❌ NG
import Purchases from 'react-native-purchases';
const customerInfo = await Purchases.getCustomerInfo();

// ✅ OK
import { useSubscription } from '@/hooks/useSubscription';
const { isPlus, hasFeature } = useSubscription();
```

### 8.3 機能 gating

```typescript
// hasFeature() で feature flag-based gating
const sub = useSubscription();

if (sub.hasFeature('periodizationPresets')) {
  // Pro tier feature
}

if (sub.hasFeature('aiMenu')) {
  // Plus or Pro tier feature
}
```

### 8.4 サーバー側検証

クライアント側の Plus/Pro 状態を信用しすぎない。 重要な action (AIメニュー生成、 Vision food scan 等) はサーバー側でも tier 状態を再 verify。

## 9. マネタイゼーション UI 実装規約

### 9.1 ProCard の使い分け

| Component | 場所 | 用途 |
|---|---|---|
| ProCard | 設定画面 最上部 | 4 状態の主要訴求 (free / trial / plus / pro) |
| ProTeaser | ホーム画面 末尾 | 認知獲得、 Plus 機能の魅力訴求 (free のみ表示) |
| ProInlineCTA | ボタン直下 | 「Plus なら無制限で生成 →」 等の文中訴求 |

### 9.2 Plus 加入済ユーザーへの配慮

- Plus CTA を一切表示しない (free 以外は非表示)
- 「Plus 利用中」 の状態表示は OK (主張しすぎない)
- 次回更新日を控えめに表示
- Pro 加入済には Plus CTA 完全非表示 (top tier 認識)

### 9.3 押し売り回避

NG コピー:
- 「今だけ!」
- 「絶対!」
- 「お見逃しなく!」
- 「最後のチャンス」

推奨コピー:
- 「Mealift Plus でさらに使いやすく」
- 「14日間 無料で試す」
- 「いつでもキャンセル可能」

### 9.5 マネタイゼーション動線確認シナリオ (Phase G)

| # | シナリオ | 期待結果 |
|---|---|---|
| 1 | Free で設定画面を開く | 最上部 Plus カード「14日間 無料で試す」 |
| 2 | Free で AI メニューを開く | 残量表示 + 「Plus なら無制限」 |
| 3 | Trial で設定画面を開く | 「あと N 日」 + 進捗バー |
| 4 | Plus で ホーム画面 | 末尾 Plus ティーザー非表示 |
| 5 | Trial 終了直前 | 軽い注意喚起 |
| 6 | Plus で AI メニュー | 残量表示なし、 「Plus 利用中」 バッジ |

## 10. 既存画面の改修規約

### 10.1 既存ロジックを壊さない

リデザイン対象画面でも、 既存の業務ロジック (食事記録の DB 書き込み、 ワークアウトの記録 等) は **絶対に壊さない**。

### 10.2 状態管理への影響最小化

既存の Zustand store / TanStack Query / expo-sqlite に touch する場合は重大判断:
- store の structure 変更 → 重大判断 (§4.1)
- store の hook 名変更 → 重大判断
- 既存 query key 変更 → 重大判断

UI 層の rerender 最適化は OK (`React.memo`、 `useMemo`)。

### 10.3 ナビゲーション (v1.1 update)

Expo Router の既存 route 構成は変更しない。 ステージ5 で `src/constants/routes.ts` SSoT crystallization 導入 — 既存 route literal は段階的に constants 経由に置換、 ただし v1.4 は HOME + SETTINGS_SUBSCRIPTION + Onboarding 高頻度の最小集合のみ (~10 constants)。

### 10.4 既存テストの維持

既存ユニットテストが落ちる修正は 重大判断。 リデザインで component の interface (props 等) が変わる場合、 既存テストを update する形で対応。

## 11. テスト規約

### 11.1 ユニットテスト

新規 component には test file 推奨。 ただし純 UI コンポーネントの場合、 既存パターンに合わせて省略 OK。

Plus 判定ロジック関連は **必ず** test:
- `useSubscription`: 4 状態 (free / trial / plus / pro) 全カバー、 既存テスト確認
- 各画面の Plus 状態に応じた表示分岐: snapshot test or visual test
- RNTL preset 整備後 (ステージ5) は render test 追加可

### 11.5 内部自己点検チェックリスト (各 Phase 終了時)

Phase A 完了時:
- [ ] tokens.ts の expand 内容が既存と整合
- [ ] 共通 component が 4 状態切替で正しく render
- [ ] useSubscription が モックで 4 状態切替できる

Phase B 完了時:
- [ ] AIメニュー画面 4 状態 (free / trial / plus / pro) で動作
- [ ] 月3回残量カウンタ が正しく decrement
- [ ] Plus 誘導 CTA が plus / pro 加入で非表示

Phase C 完了時:
- [ ] 設定画面 最上部 ProCard 4 状態切替
- [ ] 「プラン管理」 項目削除のディープリンク影響なし

Phase D 完了時:
- [ ] ホーム画面 6 cards 全表示
- [ ] 時間帯別グリーティング 4 段階 動作
- [ ] 既存機能 6 項目 影響なし

Phase E 完了時:
- [ ] トレーニング画面 ヘッダー 3-button 整理 (Issue 2 fix)
- [ ] エンプティ + データあり 両 state 表示
- [ ] ルーティン作成モーダル 既存ロジック影響なし

Phase F 完了時:
- [ ] 食事画面 AI 推定 CTA プライマリ表示
- [ ] 進捗バー 動作
- [ ] 時間帯アイコン統一 (MEAL_ICONS 既存と一致)

ステージ4 (食品 3 タブ + Vision + OCR) 完了時:
- [ ] 3 タブ切替 (検索 / Vision / OCR) 動作
- [ ] Vision Edge Function deploy success + cost 監視 OK
- [ ] OCR meal-logging 転用が submission flow と独立動作

ステージ5 完了時:
- [ ] Issue 1 (HealthKit 後 routing) fix verified、 4 paths 全 OK
- [ ] Routes SSoT 10 constants 導入 verified
- [ ] Auth Tier 2 proper design verified (onAuthStateChange listener)
- [ ] RNTL preset 動作 verified
- [ ] 計画書 §12.4 テストシナリオ 8 種 全 pass
- [ ] 本書 §9.5 マネタイゼーション動線シナリオ 6 種 全 pass

## 12. Git・コミット規約

### 12.1 ブランチ戦略

main から `feature/ui-improvement-v1` を切る (or 既存 branching convention に合わせる)。

各 ステージ完了時に Syuto sign-off → main へ squash merge (optional、 Syuto 判断)。

### 12.2 コミット粒度

- 各 Phase の 1 タスク = 1 commit を目安
- 例外: A-2 ProCard のような大きい component は 2-3 commit に分割可
- commit message は `feat(area): summary` 形式 (既存 convention 流用)

例:
```
feat(theme): Phase A-1 デザイントークン拡張 (colors.pro 追加)
feat(components/shared): Phase A-2 ProCard 4 状態対応
feat(ai-menu): Phase B-2 部位選択カードグリッド (2列 4段)
fix(onboarding): Phase E-?? Issue 1 — /(tabs)/home → /(tabs) (Routes SSoT 導入)
```

### 12.3 PR

Phase 単位で PR 推奨 (大規模 PR よりレビューしやすい)。 ただし個人開発で Syuto 一人なら main 直接 push でも OK (Mealift convention に合わせる)。

## 13. Codex委譲ルール

### 13.1 委譲 OK タスク

| タスク | 理由 |
|---|---|
| 純 UI コンポーネント (button、 card 等) | ロジック少、 既存パターン適用可 |
| 既存 component の style 変更 | 機械的、 検証容易 |
| TypeScript 型定義 | 構造的 |
| ユニットテストケース | 大量生成可 |
| デザイントークンの追加 | 値の machine 入力 |

### 13.2 委譲 NG タスク

| タスク | 理由 |
|---|---|
| useSubscription 等 RevenueCat 連携 | 認証・課金 関連 = 重大判断 |
| ルーティン作成モーダル等 既存ロジック改修 | 既存状態管理に影響 |
| Phase 0 調査 | 完了済 |
| ステージ5 統合・QA | 全体観点必要 |
| 重大判断 trigger 時の対応 | Syuto 確認必須 |
| Vision Edge Function (Supabase deploy) | 認証・課金 + Cost implication |

### 13.3 委譲時の prompt 構造

```
【タスク】
[具体的なタスク内容]

【入力】
- 関連ファイル: [path 一覧]
- 既存パターンの参考: [既存 component の path]
- デザインスペック: [計画書 §X.Y 参照]

【期待される出力】
- 新規ファイル: [一覧]
- 既存ファイル更新: [一覧]
- テストケース: [list or "skip"]

【Props】
- [interface 定義]

【動作】
- [4 状態 等の挙動仕様]

【スタイル】
- src/theme/tokens.ts の colors.X を使用
- 角丸 radius.lg、 パディング spacing.lg

【既存パターン】
- 他の Card 系コンポーネントの構造に倣う
- TypeScript strict mode で型を厳密に
- JSDoc を export 関数に付ける

【除外】
- 新規ライブラリの追加禁止
- console.log の残置禁止
- lucide-react-native の使用禁止 (Ionicons 統一)
```

### 13.4 Codex 統合時のチェックポイント

Codex 出力を取り込む前に以下を確認:
- [ ] デザイントークン経由か (ハードコード値ないか)
- [ ] TypeScript strict pass
- [ ] ESLint pass
- [ ] 既存パターンと整合
- [ ] テストが追加されているか (該当タスクなら)
- [ ] Ionicons 使用 (lucide 不使用)

ダメなら 1-2 回まで Codex に修正依頼。 それでもダメなら Claude Code が自分で書き直す。

### 13.5 並列委譲 例

ステージ1 Phase A:
- Codex A: ProCard.tsx ドラフト (4 状態対応)
- Codex B: ProTeaser.tsx + ProInlineCTA.tsx
- Codex C: EmptyState.tsx + SectionHeader.tsx
- Codex D: tokens.ts 拡張 (colors.pro)

Claude Code は全体統合 + 既存 useSubscription との連携確認 + 内部点検。

## 14. 報告フォーマット

### 14.1 ステージ完了報告

```markdown
## ステージ[N]完了報告

### 概要
[このステージで何を達成したか、 1〜2文]

### 実装内容
- 新規ファイル: [一覧]
- 変更ファイル: [一覧]
- 追加ライブラリ: [あれば]

### 動作確認
- [テスト結果]
- [スクリーンショット または 動画リンク、 状態別に複数]

### 受け入れ基準達成状況
- [✅] 基準1
- [✅] 基準2
- [⚠️] 基準3 (部分達成、 理由)

### 既存機能の影響確認 (ステージ2 以降)
- ✅ 食事記録の追加・削除・編集
- ✅ 運動記録の追加・削除・編集
- ✅ 体重記録
- ✅ HealthKit 連携
- ✅ バーコードスキャン
- ✅ 食品検索

### 内部点検結果
- [本書 §11.5 の該当ステージのチェックリスト結果]

### 既知の課題
- [課題があれば]

### Codex 委譲の状況 (任意)
- 委譲したタスク: [一覧]
- 統合後の品質: [問題なし / 一部修正 等]

### Codex MCP review pair 結果 (推奨)
- Critical: [件数]
- Important: [件数]
- Nit: [件数 + 採用判断]

### 次ステージへ進んでよいか
進める場合は "次へ" の指示をお願いします。
変更が必要な場合は指摘してください。
```

### 14.2 エラー発生時の報告 / 14.3 重大判断時の確認依頼

(v1.0 通り、 ハンドブック part 1 paste 参照)

## 15. 禁止事項

### 15.1 アーキテクチャ関連

- ❌ 既存の Expo SDK / Zustand / SQLite / Supabase スタックを変更
- ❌ React Navigation 等、 Expo Router 以外のナビゲーターを導入
- ❌ Redux / MobX 等、 別の状態管理ライブラリを導入
- ❌ ダークモード対応コードを書く (スコープ外)
- ❌ DB スキーマを変更
- ❌ **lucide-react-native の追加** (v1.1 G-1 resolution、 Ionicons 統一)

### 15.2 コード品質関連

- ❌ TypeScript の `any` を多用
- ❌ ESLint エラーを無視
- ❌ console.log を残したままコミット
- ❌ コメントアウトされた古いコードを残す
- ❌ 色や余白の値をハードコード (必ずトークン経由)

### 15.3 セキュリティ関連

- ❌ API キーをコードにハードコード
- ❌ Supabase service_role キーをクライアントに含める
- ❌ RLS を無効化
- ❌ ユーザーパスワード等の機微情報をログ出力
- ❌ Plus/Pro 判定をクライアント側で勝手に書き換える

### 15.4 ユーザー体験関連

- ❌ Plus 加入済ユーザーに CTA を表示
- ❌ Pro 加入済ユーザーに Plus CTA を表示 (top tier 認識)
- ❌ ペイウォールから抜けにくい画面設計
- ❌ 押し売り型コピー (「今だけ!」「絶対!」)
- ❌ 既存ユーザーが慣れている動線を破壊
- ❌ アクセシビリティを無視 (色だけで情報を伝える等)

### 15.5 プロセス関連

- ❌ 重大判断ルール (本書 §4) を無視して進める
- ❌ Syuto への確認なしに計画書から逸脱
- ❌ ステージをまたいでタスクを進める
- ❌ Codex に委譲してはいけないタスクを丸投げ
- ❌ 既存の主要機能を破壊
- ❌ 「確認回数を減らしたいから」 を理由に重大判断を黙って進める

### 15.6 集約版特有の注意

- ❌ ステージの境界を無視して、 複数ステージのコードを混在
- ❌ ステージ完了報告を簡素化しすぎる
- ❌ 内部自己点検 (§11.5) をスキップ

## 16. 想定される質問と回答

Q1: Phase 0 の調査で計画書と矛盾する既存実装を発見 → Phase 0 完了済、 4 件 resolved (G-1..G-4)
Q2: 既存に Plus カード類似コンポーネントがある → `subscription/UpgradePromptModal` あり、 visual reference として参考、 ProCard 別作成
Q3: ブランドカラーが既存コードに散らばっていてバラバラ → Phase 0 で確認済、 既存 tokens 統一
Q4: ホーム画面の改修で既存機能が壊れた → 即時ロールバック、 §14.3 で Syuto 相談
Q5: RevenueCat 状態取得失敗 → §14.3 で Syuto 相談、 重大判断
Q6: ペイウォール画面が未実装 → 既存 `subscription/UpgradePromptModal` + tier-preview を使用、 v1.5 で別画面検討
Q7: 計画書コピー文がブランドガイドラインと合わない → 計画書優先、 違和感あれば Syuto 確認
Q8: RoutineCreateModal のコードが汚い、 リファクタしたい → 本計画書はリファクタリング目的でない、 必要最小限の変更のみ
Q9: 部位選択カードのカスタム SVG が用意できない → Ionicons 流用 (例: `body-outline` + 部位 indicator)、 将来差し替え可能な構造
Q10: Codex 出力品質が低い → 1-2 回まで Codex 修正依頼、 ダメなら Claude Code が書き直す
Q11: ステージ2 途中だが、 ステージ3 D-1 も一緒にやった方が効率良さそう → やらない、 ステージ境界守る
Q12: ステージ1 完了報告で重大判断もまとめて伝えたい → NG、 重大判断は発生時点で即時確認
Q13: ステージ完了報告のスクリーンショットが多すぎて伝えにくい → 動画 1 本にまとめる、 or 状態別最重要スクリーンショットのみ提示

## 17. 想定される実装の罠

罠1: ホーム画面の再レンダリングコスト → React.memo、 useMemo、 Zustand セレクタ
罠2: useSubscription の状態遷移漏れ → 4 段階全テスト
罠3: 食事画面 AI 推定 CTA が Plus 未加入時動作不能 → useSubscription 分岐、 ペイウォール
罠4: トレーニング 「AI にメニュー」 CTA も同様 → 残量チェックロジック共通化
罠5: ホーム画面グリーティングがニックネーム参照 → 段階的フォールバック (「あなた」「○○さん」)
罠6: トライアル期間中表示が画面ごとにバラつく → useSubscription の helper 関数共通化
罠7: 設定画面 「プラン管理」 削除でリンク切れ → Phase 0 で全検索、 リダイレクト
罠8: Plus 加入済表示が加入直後反映されない → useSubscription 強制更新仕組み
罠9: ホーム画面 「目標到達予測」 が未設定ユーザーで崩れる → 段階的表示
罠10: 時間帯グリーティングがタイムゾーン未考慮 → デバイスのローカル時刻 (Onboarding v2 Phase E-3 TZ stability 学習を参考)
罠11: ステージ集約による既存機能影響の見落とし → 内部自己点検 (§11.5) 絶対にスキップしない
罠12: Codex 委譲で 「とりあえず動く」 コード混入 → §13.4 チェックポイント全項目確認
罠13: Vision Edge Function quota 超過 → cost monitoring、 50/day Pro tier quota の運用確認
罠14: OCR meal-logging 転用で submission flow 影響 → 既存 submission-ocr-scan は touch しない、 service-layer 共有のみ
罠15: Routes SSoT 部分導入で残り literal と混在 → ハンドブック §10.3 に従い段階的、 v1.4 は 10 constants 集合のみ
罠16: Issue 1 fix 後の TestFlight build 21 と過去 build 20 の OTA channel mismatch → runtimeVersion=appVersion=1.4.0 で 1.3.x build 20 とは分離

## 付録 A: 完了の定義 (Definition of Done)

UI 改善 v1 が「完成した」 と言える条件:

- [ ] 5 ステージ全完了、 Syuto 承認取得
- [ ] 計画書 §12 受け入れ基準 全達成
- [ ] §12.4 テストシナリオ 8 種 全 pass
- [ ] 本書 §9.5 マネタイゼーション動線確認シナリオ 6 種 全 pass
- [ ] 計算ロジックのユニットテスト 全 pass
- [ ] iOS 動作確認済み (Android は v1.5+ defer 可)
- [ ] 既存機能 6 項目 (食事/運動/体重/HealthKit/バーコード/食品検索) 影響なし
- [ ] Issue 1 (HealthKit 後 routing) fix verified、 build 21+ で動作確認
- [ ] Issue 2 (training ヘッダー overflow) natural fix verified
- [ ] Routes SSoT 10 constants 導入
- [ ] ESLint / Prettier エラーなし
- [ ] TypeScript エラーなし
- [ ] EAS build v1.4.0 build 21 完成、 TestFlight + App Store review 提出可能な品質

## 付録 B: 集約版の運用フロー早見表 (v1.1)

```
実装開始
  ↓ 3 doc 読了
ステージ1: 調査 + 基盤 (7-10h)
  ・Phase 0 完了済 (本 commit 前)
  ・Phase A 基盤実装 (Codex 並列委譲 OK)
  ・内部点検 + Codex MCP review pair
  ・重大判断なければ完了報告
  ↓ Syuto確認1回目
ステージ2: マネタイゼーション動線 (7-10h)
  ・AIメニュー画面 + 設定画面
  ・Plus 4 状態の動作確認
  ・内部点検 + 完了報告
  ↓ Syuto確認2回目
ステージ3: コア画面リデザイン + Issue 2 (13-17h)
  ・ホーム + トレーニング + 食事 の 3 画面
  ・Issue 2 (training ヘッダー overflow) Phase E-1 で natural fix
  ・既存機能 6 項目の保全 (最重要)
  ・内部点検 + 完了報告
  ↓ Syuto確認3回目
ステージ4: 拡張機能 — 食品 3 タブ + Vision + OCR (10-16h)
  ・食品追加 3 タブ統合 UI
  ・Vision Edge Function 拡張
  ・OCR meal-logging 転用
  ・内部点検 + 完了報告
  ↓ Syuto確認4回目
ステージ5: 統合・QA + Issue 1 + v1.4 prep (18-25h)
  ・Phase G 全画面 QA
  ・Issue 1 Routes SSoT crystallization
  ・Auth Tier 2 proper design + Tier 3 reorder
  ・RNTL preset + app.config cleanup + Onboarding 文言 fine-tune
  ・最終完了報告
  ↓ Syuto確認5回目 (最終)
完了 → EAS build v1.4.0 → TestFlight → App Store review
```

※ 重大判断は発生時点で即時確認 (回数制限なし)

## 付録 C: 改訂履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| v1.0 | 2026-05-10 | 初版作成 (集約版 4-stage) |
| v1.1 | 2026-05-13 | Phase 0 拡張 recon 結果反映: 5-stage 構造 / useSubscription supersede / Ionicons 統一 / 拡張 scope (食品 3 タブ + Vision + OCR) / Critical bug fix (Issue 1 + 2) / v1.4 prep |

実装開始の合図: 計画書・実行計画書・本ハンドブックを読了 → ステージ1 の Phase A 基盤実装から開始 (Phase 0 完了済)。 最初の確認待ちはステージ1 完了時 (重大判断発生時を除く)。
