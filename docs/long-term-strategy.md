# Gymwork(짐워크)徹底調査レポート — ミーリフト実装ブループリント

## TL;DR(要約)

- **Gymworkは韓国Gymwork Inc.(주식회사 짐워크、ソウル)が開発する筋トレアプリ**。CEOは김주용(Kim Juyong)、2023年4月設立、Mashup Venturesからシード調達済み。iOS/Android両対応、英・韓・日・独・西・繁中・葡の7言語対応。
- **コア機能は「1RMベースの自動重量推奨」と「コーチプログラム・マーケットプレイス」の2本柱**。AIではなくルールベースの推奨エンジンで、各セット前に「쉬움/보통/어려움(やさしい/ふつう/むずかしい)」の3択で重量×回数を提示するUXが最大の特徴。
- **公式サイト(gymwork.pro)実数値**:エクササイズ記録1,476万件超、アプリレビュー1,000件、登録コーチ40名以上、ユーザー平均BIG3合計330kg(韓国版)/683lbs(英語版)。「20万ユーザー」「4.8★」はApp Store/Google Play側のコピーで、公式サイトの主張ではない。
- **料金**:Proのみの単一階層。**月額$9.9 / 年額$77(50%オフ)**。日本市場の競合(あすけん、カロミル、Fitbod等)より大幅に安価。プログラム単品販売はなく、Pro加入で全コーチプログラムが解放される仕組み。
- **日本市場対応の現状**:公式サイトの日本語版は存在するが、**日本人コーチ・日本独自プログラムはゼロ**。翻訳に「6,417 won per month」(韓国通貨残留)や「t_web_review_10」(未翻訳キー)のバグも露出している。**ここがミーリフトの最大の参入チャンス**。
- **ミーリフトへの示唆**:Gymworkの優れたUX(Easy/Normal/Hardピッカー、ボリュームダッシュボード、5×5/トップセット/ドロップセットのワンタップ呼び出し)はそのまま採用可能。一方で、(1)日本人インフルエンサー起用、(2)山本義徳式・岡田隆式など日本独自メソッド、(3)RP式MEV/MAV/MRVボリューム管理、(4)栄養との統合(ミーリフト固有の強み)で差別化すべき。

---

## 1. アプリの正確な特定

| 項目 | 内容 |
|---|---|
| 正式名称 | Gymwork: Workout Tracker Log(짐워크) |
| 開発元 | 株式会社짐워크(Gymwork Inc.)、韓国・ソウル江南区南部循環路351街24、4F |
| 代表者 | 김주용 (Kim Juyong、Hyperconnect出身) |
| 設立 | 2023年4月 |
| 資金調達 | Mashup Venturesシードラウンド(2024年8月)、韓国TIPSプログラム選定(2025年6月、約₩500M R&D) |
| iOS | apps.apple.com/us/app/id1563624436、最新v3.21.157、iOS 16.6+ |
| Android | `pro.godok.gymwork`、Google Play 100K+インストール |
| 公式サイト | https://www.gymwork.pro |
| 対応言語 | 韓国語/英語/日本語/ドイツ語/スペイン語/繁体字中国語/ポルトガル語 |
| 連絡先 | `admin@gymwork.pro`(ビジネス)、`support@gymwork.pro`(顧客) |

**混同に注意**:以下は別アプリです。
- GymWorks(英国Membr/Fit Cloud) — PT・ジム向けCRM
- Gym Workout Tracker(Leap Fitness Group) — 別開発元
- BurnFit(韓国) — 似た見た目だが別アプリ

---

## 2. 機能の詳細

### 2.1 オンボーディング
収集データ:目標(減量/増量/筋肥大/筋力)、週間頻度、対象部位、設備の有無。1RMは初回ロギング時に自動算出。

### 2.2 エクササイズデータベース
- 観測される種目数:500種以上
- 各種目に動画フォームガイド付き
- 設備カテゴリ:バーベル / 自重 / ケトルベル / マシン / ストレッチ / 有酸素 / ダンベル / その他(8カテゴリ、ミーリフトでも採用推奨)

### 2.3 ワークアウトプログラム

**韓国系コーチ・インフルエンサー**
- **이경선(Kyung-sun Lee)** — Titan Method、Titan Method Easy、Titan Method 2.0(6日3分割)
- **권혁(Kwon Hyuk)** — トップ表示
- **고독한갯츠비、이토끼、Chongchong、Jocho、Keon** — 韓国YouTuber系
- **최마루(Choi Maru)** — 5大運動パワービルディング(5週、体重70kg・BIG3合計620kg)
- **이도황(Lee Do-hwang)** — 「アイキャンドホァン」、逆三角形ルーティン(5日)
- **박요한(Park Yo-han)** — 悪魔背中&怪獣上半身ルーティン(8日サイクル4週)
- **조영재** — ナチュラル怪物3分割訓練法
- **이양재(Lee Yang-jae)** — 韓国ナショナル重量挙げ選手
- **WhatSubCrew、정봉길** — App Storeメタ記載

**国際的コーチ**
- **Stephan Korte**(ドイツ) — Korte 3×3 Powerlifting(8週)
- **Alex Bromley**(米) — KONG(12週)、Bullmastiff(19週)、70's Powerlifter(18週)
- **Geoffrey Verity Schofield** — RAMPAGE(10週、3日全身肥大)
- **Mark Rosenberg** — Rip And Tear(12週、Big3高頻度)
- **Menno Henselmans** — Bikini Body(8週、女性初心者向け)
- **nSuns系** — nSuns 531 Deadlift、Ensons 531 LP(Wendler 5/3/1派生)

**日本人コーチ:現時点でゼロ。** ミーリフトの最大の参入余地。

### 2.4 重量推奨エンジン(最重要)

#### 仕組み
1. **1RM自動計算**:ユーザーがログを蓄積するたび推定1RMを更新
2. **目標レップに対する%1RM**を割り出し、基準重量を算出
3. **「やさしい/ふつう/むずかしい」3択チップ**で表示。例:`100kg×10 / 105kg×10 / 107kg×10`
4. **オプションのRPE入力**で次回推奨を微調整(自己回帰調整)

#### 推定アルゴリズム(公開情報なし、業界標準からの推測)
- 1RM式:Epley(`1RM = w × (1 + r/30)`)が主軸、6〜10レップ域でBrzycki(`w / (1.0278 − 0.0278r)`)平均
- RPE→%1RMマッピング:Helms/Zourdos標準テーブル

#### 公式コピー(韓国語原文)
> "최근 기록과 운동 목적에 따라 무게를 추천해줘요"(直近の記録と目的に応じて重量を推奨)
>
> "5x5세트, 탑세트, 드롭세트를 한 번에 불러올 수 있어요"(5×5、トップセット、ドロップセットを一括呼び出し可能)

公式サイトでは**「AI」という単語を使っていない**。「アルゴリズムによる自動計算」と表現。「AI」はストア説明文側のマーケティング用語のみ。

### 2.5 セット・休憩時間の推奨
- セット数自体は**プログラム作成者(コーチ)が固定**(Fitbodのような動的セット数調整はしない)
- 休憩時間も**プログラムテンプレートに固定値**で組み込み
- セット完了タップで自動カウントダウン開始
- Apple Watch振動アラート対応
- カスタマイズ可能(+15秒 / -15秒、スキップボタン)

### 2.6 進捗・分析機能
- 種目別1RM推移ライングラフ(例:120kg→140kg、+40%表示)
- 部位別ボリューム棒グラフ(週次)
- **グローバル上位パーセンタイル表示**(例:「あなたのデッドリフトは上位10%」)— 友人だけでなく全Gymworkユーザー比較
- フレンドランキング(競争指標は**ボリューム**であり重量ではない)

---

## 3. 料金と収益モデル(公式サイトより)

### 3.1 価格(`/membership`ページ表示)
- **1ヶ月**:$9.9/月(定価$12、23%オフ)
- **1年(推奨)**:$77/年(定価$153、**50%オフ**)
- 全コーチプログラムへの無制限アクセス
- プログラム単品販売なし

### 3.2 観測されたApp Storeの販売SKU
$14.99 / $16.99 / $29.00 / $39.00 / $47.00 / $69.00 / $90.00 / $129.99 / $138.99(プロモバンドルが多数)

### 3.3 コーチ収益モデル
- 公式コピー:「ルーティンで新しい固定収益を!販売はGymworkがすべてサポート」
- `/coach-admin/challenge`が管理画面
- レベニューシェアと推測(具体的な%は未開示)
- 友達紹介で30日Pro無料

### 3.4 日本市場との価格比較

| アプリ | 月額 | 年額 |
|---|---|---|
| Gymwork | ¥1,500相当 | **¥12,000相当** |
| あすけんプレミアム | ¥480 | — |
| カロミルプレミアム | ¥480 | — |
| マクロファクター | ¥1,200相当 | — |
| Fitbod | ¥1,800相当 | ¥10,000相当 |

Gymworkの年額¥12,000は**日本のフィットネス系アプリ平均より30〜50%安価**。

---

## 4. 日本市場分析

### 4.1 マクロ環境
- chocoZAP会員1,700,000人以上(月額¥3,278)
- ANYTIME FITNESS会員780,000人以上
- JOY FIT24、FIT365(115店)、FastGym24、LifeFit(35→91店、2023→2024)
- 24時間ジム会員総計300万人超 — 日本のフィットネス市場で最も成長中の層

### 4.2 競合アプリ

**栄養記録系(ミーリフトのコア領域)**
- あすけん(890万ユーザー、¥480/月、AI画像認識)
- カロミル(199万、ChatGPT食事相談)
- マクロファクター(JP翻訳、ガチ勢人気)
- MyFitnessPal、OWN.

**筋トレ記録系**
- 筋トレMemo(株式会社筋トレMEMO、VALXコラボ、1RM自動計算+インターバルタイマー)
- BurnFit(韓国系、日本浸透)
- ジムバディ GymBuddy(AICONIC、岡田遼+Miyako2トレーナー、1,000+種目、AI献立)
- フリーク(Fleek)、SmartGym、Strong/Hevy(現地化弱い)

**ホーム・習慣系**
- Nike Training Club、adidas Training、自宅ワークアウト
- 30日間フィットネスチャレンジ
- 継続する技術(無料、広告なし、習慣アプリNo.1)

### 4.3 日本のジム文化と利用者特性
- 詳細な記録好き(「メモ帳から乗り換え」がレビュー頻出ワード)
- 強引なソーシャル機能を嫌う(BurnFitレビューで「コミュニティ強制がないから良い」が多数)
- フォーム重視(「ケガ予防」が頻出)— 動画ガイド必須
- 30日チャレンジ・スタンプカードのゲーミフィケーションが効く

### 4.4 重要な日本語語彙(必須採用)

**部位名**:大胸筋(上部・中部・下部)/ 三角筋(前部・中部・後部)/ 広背筋 / 僧帽筋 / 脊柱起立筋 / 上腕二頭筋 / 上腕三頭筋 / 前腕筋群 / 腹直筋 / 腹斜筋 / 大腿四頭筋 / ハムストリングス / 大臀筋 / 中臀筋 / カーフ / 内転筋群

**種目名**:ベンチプレス / インクラインベンチプレス / ダンベルプレス / スクワット / デッドリフト / ルーマニアンデッドリフト / ラットプルダウン / ベントオーバーロー / ショルダープレス / サイドレイズ / リアレイズ / アームカール / トライセプスエクステンション / レッグプレス / レッグエクステンション / レッグカール / プッシュアップ / 懸垂(チンニング) / 腹筋(クランチ)

**強度語彙**:BIG3 / 三大種目 / 1RM / 推定1RM / セット数 / レップ / インターバル / オールアウト / 限界突破 / RIR / RPE

### 4.5 推奨される日本人インフルエンサー

| 名前 | 専門領域 | メソッド |
|---|---|---|
| 山本義徳 | 筋肉博士、業績集シリーズ | 101メソッド / 山本式3-7法 / マンデルブロ・トレーニング(ブロックピリオダイゼーション) |
| 岡田隆(バズーカ岡田) | 日体大教授、柔道日本代表強化コーチ | 筋肥大の科学 |
| 石井直方 | 東大教授、筋肉学 | スロートレーニング |
| Sho Fitness、JIN、なーすけ、Kanekin Fitness、ぷろたん、コアラ小嵐 | YouTube系 | — |

**注意**:山本義徳氏のメソッド名(101メソッド、3-7法)を**ライセンスなくアプリ内プリセット名に直接使うのはリスク**。「ブロックピリオダイゼーション(筋形質→収縮タンパク→ハイレップ)」のように一般化した名称で実装し、マーケティングで参照する形が安全。

### 4.6 ミーリフトの参入余地(ホワイトスペース)
1. 日本ネイティブのRPE/RIR自己回帰調整トラッカーは存在しない
2. 1RM対応の本格筋トレ + 八訂栄養データの統合は前例なし
3. RP式MEV/MAV/MRVボリューム管理を実装した日本語アプリはない
4. 韓国系アプリ(Gymwork、BurnFit)は機械翻訳止まりで文化適応されていない

---

## 5. 競合詳細比較

| アプリ | プログラミング | 重量推奨 | 強み | ミーリフトへの示唆 |
|---|---|---|---|---|
| Strong | 純トラッカー | 手動+前回値 | 高速ロギングUX | フリー版3ルーティン制限 |
| Hevy | トラッカー+コミュニティ | 手動 | フリー寛大、ライブアクティビティ | AIなし |
| Fitbod | フルAI生成 | mStrength + 1RM(20億セット学習) | 業界最高峰の進行アルゴリズム | $13/月、栄養なし、JP未対応 |
| JEFIT | テンプレ+トラッカー | 履歴自動 | 1,400+種目DB | UI古い、広告 |
| Boostcamp | パブリックプログラムライブラリ | プログラム+1RM | nSuns、5/3/1、GZCLP、Reddit PPL等130+プログラム無料 | JP未対応 |
| Caliber | 人間コーチ+科学的テンプレ | コーチ指定 | 1on1人間アカウンタビリティ | $200/月 |
| **Dr. Muscle** | アルゴリズムDUP+デロード | RIR/RPE駆動 | **最も科学的根拠が明確**、Carl Juneau博士監修 | $49/月、英語のみ |
| Fitness AI | AI(590万ワークアウト学習) | 完全自動 | シンプル | 透明性低い |
| Gymverse | AIプラン | スマート重量 | デロード自動、ピリオダイゼーション搭載 | — |
| SmartGym | Apple Foundation Models | mStrength系 | Apple Watch App of the Year 2023 | Apple限定 |

**結論**:GymworkはHevyとFitbodの中間。HevyよりGymworkの方が進行推奨が賢く、FitbodよりGymworkの方がアルゴリズム性が低い。**ミーリフトの強みは「栄養統合」+「日本ネイティブ」で、これらどの競合も持っていない**。

---

## 6. 科学的根拠(実装時のデフォルト値の根拠)

| 原則 | 出典 | ミーリフトでの実装値 |
|---|---|---|
| ボリューム-筋肥大 | Schoenfeld 2017 J Sports Sci | 部位あたり週10セット最低、20+セットまで増分効果 |
| 部位ボリューム細分 | Pelland 2024 sportRxiv | プライマリ1.0、セカンダリ0.5の比例計算 |
| 休憩時間 | Schoenfeld 2016 JSCR | コンパウンド150〜180秒、アイソレーション60〜90秒、5レップ未満強度時180〜300秒 |
| RPE/RIR自己回帰調整 | Helms 2016、Zourdos 2016 | RPE 6 = 4 RIRスケール |
| ボリュームランドマーク | Israetel/Hoffmann RP 2017 | MV/MEV/MAV/MRV、部位別表は後述 |
| ピリオダイゼーション | Rhea 2002 | DUPは線形より2倍の筋力増、Pro機能化推奨 |
| 1RM式 | Epley 1985、Brzycki 1993 | 1〜6レップはBrzycki、6〜10レップはEpley |
| 日本系 | 山本義徳『業績集8』、岡田隆『筋肥大の科学』、石井直方『筋肉学』、J-STAGE論文 | App Store JPマーケティングコピーで参照 |

---

## 7. ミーリフト実装ブループリント

ミーリフトの既存スタック(Expo SDK 52 + Zustand + TanStack Query + expo-sqlite + Supabase + MMKV + RevenueCat + Gemini 2.5 Flash-Lite)を変更せず拡張する前提で設計。

### 7.1 二段階AIアーキテクチャ(栄養パイプラインと同じ思想)

```
ユーザー入力(目標、頻度、設備、対象部位、週数)
       │
       ▼ JSONスキーマ付きプロンプト(responseSchema)
  Gemini 2.5 Flash-Lite → JSON: { 週: [{ 日: [{ 種目: [{slug, セット数, レップ範囲, 休憩秒, 注記}] }] }] }
       │
       ▼ exercise.slug を SQLite の exercises テーブルと結合
  ローカルエンジン → 1RM × %1RM算出、MEV/MAV/MRVチェック、RPE調整、プレート組合せ計算
       │
       ▼
  ローカル優先で workout_template / workout_session に保存、Supabase同期
```

**重要**:Geminiに**絶対重量(kg)を出力させない**。レップ範囲とRPE目標のみ出力させ、kgはSQLite側でユーザーの直近1RMから計算。これは献立のkcalをLLMに決めさせないのと同じ規律。

#### Geminiレスポンススキーマ例

```typescript
{
  programName: string,
  durationWeeks: number,        // 4-12
  splitType: enum["full_body","upper_lower","ppl","bro_split","custom"],
  weeks: Array<{
    weekIndex: number,
    deload: boolean,
    days: Array<{
      dayLabel: string,         // "胸・三頭" など
      blocks: Array<{
        exerciseSlug: string,   // ローカルexercises.slugと結合
        sets: number,           // 2..6
        repRangeMin: number,    // 3..30
        repRangeMax: number,
        targetRPE: number,      // 5.0..10.0
        restSeconds: number,    // 30..300
        notes: string           // "胸を張って..." 日本語フォームキュー
      }>
    }>
  }>
}
```

設定:`temperature: 0.4`、`topK: 40`、`topP: 0.95`、`responseMimeType: "application/json"`。
プロンプトを `(目標, 頻度, splitType, equipmentSet)` でハッシュ化しMMKVキャッシュ → **Geminiコスト約70%削減**。

### 7.2 SQLiteスキーマ拡張

```sql
-- マスタテーブル(アプリにバンドル、日本語化済み)
CREATE TABLE exercises (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE,                       -- bench_press_barbell
  name_ja TEXT,                           -- バーベルベンチプレス
  name_en TEXT,
  primary_muscle TEXT,                    -- chest
  secondary_muscles TEXT,                 -- JSON配列
  equipment TEXT,                         -- barbell|dumbbell|machine|cable|bodyweight|...
  movement_pattern TEXT,                  -- horizontal_push|vertical_pull|...
  is_compound INTEGER,
  default_rest_seconds INTEGER,
  rep_range_low INTEGER,
  rep_range_high INTEGER,
  video_url TEXT,
  form_cue_ja TEXT
);

CREATE TABLE muscle_groups (
  slug TEXT PRIMARY KEY,                  -- chest, back_lat, ...
  name_ja TEXT,                           -- 大胸筋
  mev_sets INTEGER,                       -- RPボリュームランドマーク
  mav_low INTEGER, mav_high INTEGER,
  mrv_sets INTEGER
);

-- ユーザーテーブル(Supabase同期)
CREATE TABLE workout_programs (
  id TEXT PRIMARY KEY, user_id TEXT,
  source TEXT,                            -- ai_generated|preset|user_custom|coach
  name TEXT, config JSON,                 -- Gemini生レスポンス
  created_at INTEGER, updated_at INTEGER
);

CREATE TABLE workout_sessions (
  id TEXT PRIMARY KEY, user_id TEXT, program_id TEXT,
  date INTEGER, started_at INTEGER, ended_at INTEGER, notes TEXT
);

CREATE TABLE workout_sets (
  id TEXT PRIMARY KEY, session_id TEXT, exercise_id INTEGER,
  set_index INTEGER,
  set_type TEXT,                          -- warmup|working|drop|failure|amrap
  weight_kg REAL, reps INTEGER,
  rpe REAL, rir INTEGER,
  rest_taken_seconds INTEGER, is_pr INTEGER
);

CREATE TABLE estimated_1rm (
  user_id TEXT, exercise_id INTEGER,
  e1rm_kg REAL, formula TEXT,             -- epley|brzycki|avg
  updated_at INTEGER,
  PRIMARY KEY (user_id, exercise_id)
);

CREATE TABLE weekly_volume (              -- 高速チャート用マテリアライズ
  user_id TEXT, week_start INTEGER, muscle_slug TEXT, hard_sets INTEGER,
  PRIMARY KEY (user_id, week_start, muscle_slug)
);
```

### 7.3 重量推奨エンジン(GymworkのEasy/Normal/Hard)

ローカル実行(LLM呼び出し不要):

```typescript
function recommendNextSet(exerciseId, repTarget, rir = 2) {
  const e1rm = await getE1RM(exerciseId);             // Epleyデフォルト
  const pct = rirToPctOf1RM[repTarget][rir];          // Helms/RTS テーブル
  const baseKg = e1rm * pct;
  const rounded = roundToPlate(baseKg);               // デフォルト2.5kg刻み
  return {
    easy:   { weight: roundToPlate(baseKg * 0.95), reps: repTarget },
    normal: { weight: rounded,                    reps: repTarget },
    hard:   { weight: roundToPlate(baseKg * 1.025), reps: repTarget },
  };
}
```

ユーザーが実レップ+RPEを記録したら推定1RMを更新:
- RPE ≤ 7 かつ レップ ≥ 目標 → e1RM +1.0%
- RPE 8〜9 かつ レップ = 目標 → e1RM +0.5%(純粋な進行)
- RPE 9.5〜10 かつ レップ < 目標 → e1RM −1%

**プレート丸め**:デフォルト2.5kg、切替可能で1.25kg / 0.5kg(分数プレート用)/ 1kg・2kg(日本のダンベルラック標準)。

### 7.4 休憩タイマー
- `exercises.default_rest_seconds`をSchoenfeld 2016ベースで初期値設定
  - コンパウンド: 150〜180秒
  - アイソレーション: 60〜90秒
  - 5レップ以下の筋力ワーク: 180〜300秒
- セット完了タップで自動開始
- `expo-notifications` + iOS Live Activity(Hevyと同様)でバックグラウンド継続
- Apple Watch対応はExpoでは非自明 — Phase 1は見送り、Zustandでタイマー状態を集約しておけば将来Watchアプリから購読可能な設計に

### 7.5 ボリューム管理(RP式 — Gymworkに対する差別化点)

日次ジョブ(またはアプリ起動時):

```typescript
for muscle in muscle_groups:
  weeklySets = sum(workout_sets を exercises と結合、対象部位、過去7日、按分加重)
  if weeklySets < muscle.mev_sets:        flag "MEV未達 — もう1セット追加おすすめ"
  if weeklySets > muscle.mrv_sets:        flag "MRV超過 — デロード推奨"
  if 4週連続 above MAV:                   schedule デロード週(自動的に重量50%、セット50%)
```

#### デフォルトボリュームランドマーク(Israetel/Hoffmann RP)

| 部位 | MEV | MAV | MRV |
|---|---|---|---|
| 大胸筋 | 8 | 12〜18 | 22 |
| 広背筋 | 10 | 14〜22 | 25 |
| 三角筋(中部) | 8 | 16〜22 | 26 |
| 上腕二頭筋 | 8 | 14〜20 | 24 |
| 上腕三頭筋 | 6 | 10〜14 | 18 |
| 大腿四頭筋 | 8 | 12〜18 | 20 |
| ハムストリングス | 6 | 10〜16 | 20 |
| 大臀筋 | 4 | 8〜14 | 16 |
| カーフ | 8 | 12〜16 | 20 |

「今週のボリューム」ダッシュボードで緑/黄/赤の色分け。**どの日本のアプリもこれを実装していない。**

### 7.6 階層別機能ゲーティング

| 機能 | Free | Plus | Pro |
|---|---|---|---|
| 手動ワークアウトログ + カスタムルーティン | ✓ | ✓ | ✓ |
| エクササイズDB + フォーム動画 | 200種目部分 | 500+種目 | 全部 + 将来追加 |
| 自動開始休憩タイマー | ✓ | ✓ | ✓ |
| 1RM自動計算 + 履歴グラフ | 基本 | フル | フル |
| Easy/Normal/Hardセット推奨 | 直近3セッション | 無制限 | 無制限 |
| RPE/RIR自己回帰調整 | — | ✓ | ✓ |
| AIプログラム生成(Gemini) | 1プログラム | 月3 | 無制限 |
| プリセットプログラム(PPL、5/3/1、nSuns、GZCLP、ブロックピリオダイゼーション、3-7法等) | 2無料 | 全部 | 全部 |
| MEV/MAV/MRVボリュームダッシュボード | — | ✓ | ✓ |
| 自動デロードスケジューリング | — | — | ✓ |
| 週次AIレポート(運動+栄養統合) | — | 基本 | 詳細 |
| Apple Watch / Live Activity | — | ✓ | ✓ |
| 部位別ヒートマップ + 回復タイマー | — | — | ✓ |
| コーチ・PT向けPDFエクスポート | — | — | ✓ |
| クラウドバックアップ(Supabase) | 直近30日 | 無制限 | 無制限 |

#### 推奨価格(JP税込み)

| 階層 | 月額 | 年額 |
|---|---|---|
| Plus | ¥780〜980 | ¥6,800 |
| Pro | ¥1,580 | ¥12,800 |

**根拠**:あすけんプレミアム¥480(食事のみ)、カロミルプレミアム¥480、Fitbod ¥1,800相当、マクロファクター ~¥1,200。**ミーリフトProが¥1,580で正当化できる理由は「運動+栄養の双方をカバー」**するため。

### 7.7 プライバシー・コンプライアンス
- 体組成データは改正個人情報保護法の「要配慮個人情報」近似 — 体測値・写真は機微情報扱い。SQLCipherでexpo-sqliteを暗号化、またはSupabaseで列単位暗号化
- Apple Privacyラベル:Gymworkは「Identifiers + Usage Data」をサードパーティ広告用にトラッキング自己申告。**ミーリフトは広告なし → 「No Tracking」ラベルを差別化要素**として打ち出せる
- 「トレーニングデータの利用に関する同意」画面でローカル限定モード vs Supabaseクラウド同期を分離。Gymworkはこの分離をしていない → 信頼獲得のチャンス

### 7.8 既存ミーリフト機能との統合
- **体重 + BMR/TDEE**:ユーザー体重を1RM相対計算に流す(懸垂など自重種目はvolume計算でweight_kgに体重加算)
- **週次レポート**:既存の食事レポートに「今週のトレーニングボリューム」「1RM伸び率」「部位別推定回復度」を追加 — これは日本のどのアプリも提供しない**領域横断インサイト**
- **AI献立分解パイプライン再利用**:既存`aiClient.ts`(推測)に新プロンプトテンプレ追加:`generateProgram`、`suggestExerciseSwap`、`analyseWorkoutWeek`。トークン上限を厳格管理(プログラム生成≤4kIN/8kOUT、種目スワップ≤1kIN/1kOUT)
- **Gemini 2.5 Flash-Lite**で十分。Pro階層のAI機能では Flash(非Lite)で詳細な週次分析

---

## 8. ミーリフトに即活かせる10個の知見(Gymwork公式調査から)

1. **「やさしい/ふつう/むずかしい」3チップピッカー** — Gymworkの最大のUX発明。±3〜7%デルタの実装は容易、影響大
2. **コーチプログラムをPro一括バンドル**(単品販売しない) — Gymworkが$9.9/月で証明済み。日本ではPlus¥980/Pro¥1,580を推奨
3. **日本固有の文化的マイルストーンを前面に出す** — Gymworkの英訳は「3대 500」を「Amazing routines」に薄めている。「BIG3合計400kg突破」「ベンチ100kg」「懸垂10回」を打ち出せば日本人に刺さる
4. **日本人コーチを最低5名ローンチ時に確保** — Gymworkの公式サイトに日本人コーチはゼロ。これが**最大の参入チャンス**
5. **翻訳QA徹底** — Gymworkの英語サイトに「6,417 won per month」「t_web_review_10/11」が漏出している。CIでi18nキー検証必須
6. **重量比較ではなくボリューム比較のフレンドリーダーボード** — Gymworkが採用。軽い lifter を冷遇しない健全なソーシャル設計
7. **公式サイトに `/onerm` 計算機を設置** — GymworkはこれをSEO・ファネル資産にしている。`/1rm計算機`と`/種目ガイド`を日本語SEO用に
8. **グローバル上位パーセンタイル表示** — 規模が小さくても性別・体重別にコホート分割すれば成立
9. **5×5 / トップセット / ドロップセットのワンタップ呼び出し** — Gymwork公式サイトでも明記。低コスト・高価値の差別化
10. **設備チップ8カテゴリ採用**:バーベル / 自重 / ケトルベル / マシン / ストレッチ / 有酸素 / ダンベル / その他 — Gymworkのアイコンセットと整合、ルーティンと種目ライブラリの両方をフィルター可能に

---

## 9. ロードマップ(3マイルストーン)

| Phase | 期間 | 内容 |
|---|---|---|
| **MVP** | 4〜6週 | エクササイズDBシード(約300種目、JP)、ワークアウトログ+休憩タイマー、1RM自動計算、基本グラフ、手動プログラム。Free階層を出荷可能に |
| **AI v1** | 4週 | Geminiプログラム生成 + Easy/Normal/Hardセット推奨 + RPE入力。Plus階層ローンチ |
| **差別化 v2** | 6週 | MEV/MAV/MRVダッシュボード、自動デロード、DUPおよびブロックピリオダイゼーション・3-7法プリセット、週次の運動+栄養統合AIレポート。Pro階層ローンチ + 値上げ正当化 |

---

## 10. 注意事項・前提

- **数値の信頼性**:Gymworkの「20万ユーザー」「BIG3合計683lbs」は自己申告マーケティング数値。App Store米国の評価サンプル(103件)は信頼区間が広い。韓国Google Playの100K+インストールが最も信頼できる規模指標。
- **Gymworkの正確なアルゴリズムは非公開**。本レポートの1RM式・RPE→負荷マッピング・重量推奨ロジックは、App Storeコピー「直近の記録 + RPE入力で賢くなる」、スクリーンショット「Easy/Normal/Hard」、韓国レビューの「1RM 자동 계산」、業界標準(Helms/Zourdosテーブル)からの**情報に基づいた推測**。完全クローン目的のリバースエンジニアリングは本レポートの範囲外。
- **Gymworkの価格は変動が激しい**。App Storeに10種類のSKU($14.99〜$138.99)。日本市場の価格設計はあすけん・カロミル・マクロファクターを基準にすべきで、Gymworkを単純コピーしない。
- **Apple Watch / Wear OSはExpo SDK 52では非自明**。Hevy式iOS Live Activity は `expo-live-activity` で実現可能。Watch本体のアプリ機能はSwiftコンパニオンターゲット必要。
- **コーチマーケットプレイス(Gymworkの収益分配モデル)は日本初期段階では高労力・低マージン**。最初の打ち手にすべきではない。日本の最も近い前例はRIZAP/FiNCのコーチキュレートプログラムだが、これらは社内ライセンスのみ。後回しが妥当。
- **山本義徳・VALX・バズーカ岡田**等は実在の知財保有者。プリセットを「101メソッド」「3-7法」と命名するのは**ライセンスなしではリスク**。アプリ内では一般的な名称(「ブロックピリオダイゼーション」)で実装し、メソッド由来はマーケティングで参照する形が安全。
- **Fitness AI / Future / Caliberの「AI」マーケティング**は実証済み研究を伴わない。ピアレビュー可能な内部モデルを持つフィットネスアプリは現時点でFitbod(Marzagão arXiv 2026プレプリント)のみ。Gymworkを含む「AIパーソナルトレーナー」主張すべて、相応の懐疑をもって扱うべき。
- **日本市場はローカリゼーション必須(オプションではない)**。韓国Gymworkの日本語は機械翻訳で不自然(JP App Storeレビューで一般的に指摘)。**ミーリフトのJPネイティブUXは競争上の堀** — これを保持・強化することが鍵。

---

## 主要参考文献

| 領域 | 出典 |
|---|---|
| 筋肥大ボリューム | Schoenfeld BJ, Ogborn D, Krieger JW. *J Sports Sci* 2017; 35(11):1073-82. PMID 27433992 |
| ボリューム-用量応答 | Pelland 2024 sportRxiv プレプリント、67研究、2,058名 |
| 休憩時間 | Schoenfeld BJ. *J Strength Cond Res* 2016; 30(7):1805-12 |
| RPE/RIR | Helms ER 2016、Zourdos MC 2016 *J Strength Cond Res* |
| 自己回帰調整 | Pelland 2022 PMC8762534 |
| ボリュームランドマーク | Israetel M, Hoffmann J 2017 (Renaissance Periodization) |
| ピリオダイゼーション | Rhea MR 2002 |
| 1RM式 | Epley B 1985、Brzycki M 1993、Lombardi VP 1989、Marzagão T 2026 arXiv 2603.17495 |
| 業界標準 | NSCA *Essentials of Strength Training and Conditioning* 4th ed.、ACSM 2009 Position Stand |
| 日本語 | 山本義徳『業績集8 — 筋肥大・筋力向上のプログラミング』、岡田隆『筋肥大の科学』、石井直方『筋肉学』、J-STAGE「筋力トレーニング ピリオダイゼーション」 |
