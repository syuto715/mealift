# Mealift v1.5 — App Store Listing Draft

**対象**: App Store Connect → App Information / Pricing / Localization (日本語)
**Status**: **draft** — Syuto-san の最終確認後、 App Store Connect に反映
**注意**: 競合アプリ名 (あすけん / カロミル / FiNC 等) を直接記載しない、 機能誇張なし、 keywords は App Store guideline 準拠

---

## 1. App Name / Subtitle

| Field | 内容 | 文字数 |
|---|---|---|
| **App Name** | `ミーリフト` | 5 (30 文字以内) |
| **Subtitle** | `AI コーチが食事とトレーニングをサポート` | 21 (30 文字以内) |

> 旧 subtitle (v1.4): 確認要。 v1.5 で AI コーチ「ミー先生」 が主要 USP になったため subtitle に reflection。

---

## 2. Promotional Text (170 文字以内)

```
AI コーチ「ミー先生」 が新登場。 食事 / トレーニングの質問に
寄り添い、 ルーティンを設計、 週ごとの振り返りまで。 個別の
医療診断は出さず、 専門家への相談を促してくれる安心感も。
```

文字数: 約 105 文字 (170 文字以内 ✓)

---

## 3. Description (4,000 文字以内)

```
Mealift (ミーリフト) は、 食事の記録とトレーニング管理を 1 つの
アプリで完結させる日本市場向けフィットネスアプリです。

【AI コーチ「ミー先生」 が新登場 — v1.5】
あなた専属の AI コーチ「ミー先生」 が、 食事 / トレーニングを
1 人で続けるためにそっと寄り添います。

・ チャット — 食事 / トレーニングの相談に対する応答が token-by-
  token で表示。 落ち着いた日本語 / 過度な賞賛なし / サイエンス
  ベースの回答。 必要なときは「専門医にご相談ください」 と促し
  ます。
・ 診断ウィザード — 7 つの質問にお答えいただくと、 経験 / 目標 /
  機材 / 制限から最適なトレーニングルーティンを生成。
・ ルーティン自動生成 — 「自宅で肩と背中の日」 のような自然な文章
  で意図を伝えると、 ルーティンを設計しメニューにワンタップ追加。
・ 週次アドバイス — 週ごとの振り返り + 今週の重点 + 1 行 CTA が
  届きます。 タイムゾーンに合わせた週の境界で生成。

【食事管理】
・ 5,000+ の食品データベース (国産食品 + コンビニ・チェーン店メニュー)
・ 料理画像から栄養推定 (Pro プラン)
・ 栄養成分ラベル撮影 OCR で 1 タップ追加
・ お気に入り (★) で頻出食品の素早いアクセス
・ Quick log で現在のミールに 1 タップ追加
・ PFC バランス / 拡張栄養素 (食物繊維 / 飽和脂肪酸 / ナトリウム 等)
  をグラフで可視化

【トレーニング管理】
・ レップ / 重量 / RPE 記録 + ボリューム自動計算
・ 部位別 / 種目別の履歴 + プログレッシブオーバーロード可視化
・ レストタイマー + 自動次セット遷移
・ HealthKit と連携 (アクティブカロリー反映、 無料機能)

【プランと AI 利用回数】

| 機能 | Free | Plus | Pro |
|---|---|---|---|
| ミー先生チャット | 5 回/月 | 200 回/月 | 上限なし |
| ルーティン自動生成 | — | 5 回/月 | 20 回/月 |
| 週次アドバイス | — | ✓ | ✓ |
| 料理名から栄養推定 | — | — | 50 回/日 |
| 料理画像から栄養推定 | — | — | 20 回/日 |
| 栄養相談 (テキスト) | — | — | 50 回/日 |
| 食品 DB (5,000+ 件) | ✓ | ✓ | ✓ |
| OCR ラベル撮影 | ✓ | ✓ | ✓ |
| バーコードスキャン | ✓ | ✓ | ✓ |
| HealthKit 連携 | ✓ | ✓ | ✓ |

【プライバシー】
・ 食事 / トレーニング履歴はあなたの端末に保存され、 Supabase アカウント
  にも安全に同期 (オプション)
・ AI コーチの会話は分析目的でのみ使用、 他のユーザーや第三者には共有
  しません
・ 個別の医療診断は出さず、 適切な場面で専門家への相談を促します

【対応】
・ iOS 17+ (iPhone)
・ HealthKit 対応端末

ご質問・ご要望はサポートまでお寄せください。
```

文字数: 約 1,150 文字 (4,000 文字以内 ✓、 大幅な余裕あり)

---

## 4. Keywords (100 文字以内、 半角カンマ区切り、 半角換算)

App Store の Keywords field は App Name / Subtitle / Description には
含まれていない補完語を優先する方針で draft (重複は search rank の
向上に直接寄与しないとの一般説に従い、 App Name 「ミーリフト」 /
Subtitle 「AI コーチが食事とトレーニングをサポート」 / Description
に既出の語は除外)。 競合アプリ名は審査 + 商標 risk のため含めない。

```
食事記録,栄養管理,筋トレ,カロリー計算,糖質,健康管理,
体重管理,ダイエット,たんぱく質,ジム,ワークアウト,
ボディメイク,自炊,有酸素,増量,減量
```

文字数: 約 74 文字 (100 文字以内 ✓、 余裕あり — 必要に応じて
追加語を Syuto-san が選定)

> **除外した語の根拠** (Codex pass 1-3 Critical #3 fix):
> - 「トレーニング」「AIコーチ」「サポート」 → Subtitle に既出
> - 「フィットネス」「バーコード」「ラベル撮影」「コンビニ」
>   「PFC」「PFC バランス」「PFCバランス」「食物繊維」「Quick
>   log」「お気に入り」 → Description に既出 (スペース有無も含めて
>   正規化判定)
> - 「食事管理」 → Description の section header 「【食事管理】」 に既出
> - 「食品検索」 → Description のスクリーンショット caption 表 (Screen 5) に既出
> - 「Mealift」「ミー先生」「ミーリフト」 → App Name + Description に既出
>
> 代替として 「食事記録」 (compound として食事管理とは別) + 「たんぱく質」
> (description に栄養素 / PFC は出るが純粋な「たんぱく質」 単独は不在) を採用。

---

## 5. Support URL / Marketing URL / Privacy Policy URL

| Field | 値 | 状態 |
|---|---|---|
| Support URL | (Syuto-san が用意) | 確認要 |
| Marketing URL | (Syuto-san が用意) | 確認要 |
| Privacy Policy URL | (Syuto-san が用意、 必須) | 確認要 |

---

## 6. App Privacy ("Data Used to Track You" / "Data Linked to You")

v1.4 ship 時に申告済の data type を v1.5 で確認:

- **Health & Fitness** (linked to user): HealthKit カロリー / 体重 / 身長 / 性別 / 年齢
- **User Content** (linked to user): 食事ログ / トレーニングログ / 会話履歴 (ミー先生 chat) / 診断回答
- **Identifiers** (linked to user): User ID (Supabase auth)
- **Usage Data** (linked to user): 機能の使用頻度 (analytics、 個別行動の tracking なし)
- **Diagnostics** (NOT linked to user): クラッシュレポート (Expo Application Services 経由)

v1.5 で **新たに収集する data 種別なし**。 v1.4 の申告を維持。

---

## 7. Age Rating

- 17+ 不要 (no objectionable content)
- **12+ 推奨** (medical/health 情報を含むため、 App Store guideline の "Infrequent/Mild Medical/Treatment Information" に該当する可能性)
- 既 v1.4 ship 時の rating を maintain (Syuto-san 確認)

---

## 8. Screenshot description (各サイズ 10 枚以内)

screenshot は別途デザイン制作中 (Syuto-san 担当)。 doc としては caption draft のみ:

| Screen | Caption (日本語) |
|---|---|
| 1. ホーム | あなたの 1 日が、 ひと目でわかる |
| 2. ミー先生 chat | AI コーチがそっと寄り添う、 1 人じゃないトレーニング |
| 3. 診断ウィザード | 7 つの質問で、 あなただけのルーティンに |
| 4. ルーティン生成 | 自然な文章で意図を伝えるだけ |
| 5. 食品検索 | 5,000+ の食品データベースとお気に入り |
| 6. 食事ログ | 1 タップで現在のミールに |
| 7. 栄養グラフ | PFC バランスと拡張栄養素を可視化 |
| 8. トレーニング履歴 | プログレッシブオーバーロードを可視化 |
| 9. 週次アドバイス | 週ごとの振り返りと今週の重点 |

iPhone 6.7" / 6.5" / 5.5" の 3 サイズ提供想定。 iPad は v1.5 対象外 (v1.6+ 検討)。

---

## 9. ⚠️ 申請時 checklist

- [ ] 競合アプリ名 (あすけん / カロミル 等) を **App Name / Subtitle / Promotional Text / Description / Keywords すべて** に含まない
- [ ] 「無制限」 「最強」 「No.1」 等の強い表現を含まない
- [ ] スクリーンショットの食品写真にブランドロゴ・パッケージが映り込まない (商標 risk 回避)
- [ ] 「医療診断」 「治療」 「処方」 等の医療行為を連想させる copy を含まない
- [ ] Privacy Policy URL が live (404 不可)
- [ ] 価格 (RevenueCat product) と App Store IAP product が一致
- [ ] v1.4 ship 時の data type 申告と差分なし (新規収集なし、 既申告を maintain)
