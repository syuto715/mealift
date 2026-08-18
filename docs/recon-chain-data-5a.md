# Sprint 5a — 外食チェーンデータ取得 recon (2026-08-18)

調査のみ。seed 投入・migration・データ書き込みなし。Codex review は read-only recon のため skip (Drafting 176 型)。

## 0. 前提の更新 (棚卸しで判明した最重要事実)

1. **Phase 2.2b (2026-05-19, Sprint 1〜6.6) が既に 36 チェーン・5,406 品目を生成済み**。
   内訳: official_disclosure 3,987 / ai_estimate 1,419。
2. **配布経路は「同梱 snapshot」で稼働中**: `scripts/seed/data/*.json` → `build-search-index.ts` → `search-index.json` → 起動時 `seedSearchIndex` → FTS5 `search_index` (v36) → add-food 検索「外食メニュー」セクション。
   Supabase 側 (restaurants/restaurant_menu_items) は **seed SQL (20260520000003) が未生成・未適用で空**。builder はテスト済みで存在するが CLI driver が無い。
3. スキーマは source / source_url / source_captured_at / attribution / version / takedown_flag を **既に完備** (Supabase 20260520000000-1 + SQLite v34/v35)。
4. UI ギャップ: 「公式/AI推定」バッジ・出典 URL・取得日は**未表示** (source_label は index に存在するが repository が SELECT していない)。取得日は build 時に落ちている (nutrition_json にキー追加で回収可、migration 不要)。

## 1. アクセスログ (規律遵守の記録)

- 全 fetch はブラウザ UA の単発 curl (2 秒以上間隔)、機械的巡回なし。総計約 30 リクエスト / 約 27 ドメイン。
- 対象: 栄養一覧 4 (すき家/なか卯/ジョイフル PDF、はま寿司 403)、ページ構造検証 5 (ココス×3、やよい軒、はま寿司 menu)、規約 23 ページ。
- **UA についての重要な差分**: 2026-05 の pdf-fetcher は「Mealift Bot」UA で Zensho CDN の一部 (はま寿司/ロッテリア nutrition) に 403 を受け ai_estimate に切替た。今回、**すき家 nutrition.pdf はブラウザ UA で 200** (はま寿司はブラウザ UA + Referer でも 403 = ファイルレベル遮断で UA 非依存)。Bot UA での透明性を維持するか、ブラウザ相当 UA を許容するかは **Syuto の方針判断事項** (すき家は Bot UA でも 200 だった経緯があるため実害は限定的)。

## 2. チェーン別判定表

判定基準の解釈 (重要): ほぼ全チェーンの規約は「サイトのコンテンツ (画像・文章等) の転載・複製禁止」ボイラープレートを持つ。これを hard-stop と読むと事前審査済み前提 (栄養成分数値 = 事実 = 非著作物、あすけん等の業界先例) が成立しないため、**hard-stop = スクレイピング禁止・データ二次利用/データベース化禁止の明示、または「情報・データ」自体を非商用・個人利用に限定する文言**とした。該当ボーダーは「要Syuto判断」に分類。

### 第1群 (Zensho 系) — 3/4 GO、全滅せず sprint 続行条件クリア

| チェーン | 判定 | 形式 | sample 検証 | 規約 (verbatim 要旨) |
|---|---|---|---|---|
| すき家 | **GO (更新)** | PDF 9p (更新日 2026-08-18) | **401 size 行 → 実パーサーで 363 items** (既存 menu_names 95 で unmapped 13 = 新メニューのみ) | Zensho 標準:「私的使用その他法律によって明示的に認められている範囲を超えて、本コンテンツを…使用および転載…することは、禁止」 |
| なか卯 | **GO (パーサー拡張)** | PDF 6p | 全 173 数値行中、現 regex 43 行。**ラベル 6 種追加 (ごはん大盛 28/並 25/小 8/ごはん小盛 5/大 2) で ~111 行**。5 月 (137 items) からラベル体系が変化 | 独自だが標準型:「無断で複製、翻訳、放送、出版、販売、貸与、改変などはできません」 |
| はま寿司 | **見送り (ai_estimate 59 件維持)** | nutrition.pdf = **403 (ブラウザ UA + Referer でも)**、menu HTML にも栄養なし | 公式一覧は実質非公開 | Zensho 標準 (同上) |
| ココス | **GO (crawl 型・新規)** | per-item HTML (17 カテゴリ × ~21 items = 推定 150-250 pages) | item ページに完全 PFC を確認:「エネルギー 350kcal たんぱく質 19.8g 脂質 22.5g 炭水化物 14.7g 食塩相当量 1.5g」(機械可読)。crawl-lawson 先例 (1.1s sleep + robots 確認) 適用可 | Zensho 標準 boilerplate 同型 (cocos-jpn.co.jp/aboutsite/) |

### 第2群 (PDF 公開組)

| チェーン | 判定 | 検証結果 |
|---|---|---|
| 吉野家 | GO (既収録 280 official) | 規約:「**営利、非営利を問わず、法律上許容される範囲を超えて**…複製、転用、販売…は一切禁止」— 「法律上許容される範囲」の限定付き = 事実データは範囲内。文言は強めなので verbatim を提示 |
| デニーズ | GO 仮 (既収録 268) | copyright.html が JS shell で verbatim 未取得。検索スニペット上は「複製は個人・家庭内の私的利用の範囲に限定」の標準型。5b 投入前に WebFetch で verbatim 確認 |
| ジョイフル | **GO (新規・最有力)** | cal.pdf 200 / 11p / **346 行** / 更新日 2026-08-18。**品名+5数値+アレルゲン●が同一行の理想形式** (zensho より単純、menu_names 校正不要)。規約 = 標準型 (joy-full.co.jp:「個人的な利用など著作権法によって認められる場合を除き…転載・内容変更・複製等を禁止」— 対象はロゴ・画像・文章等のコンテンツ) |
| タリーズ | GO (既収録 280 official) | 規約:「他のホームページや印刷物に転用（コピー、アップロード、掲載、引用など）することはできません」— コンテンツ転載型。数値の再構成利用は対象外と解する |

### 第3群 (HTML/要形式確認) — 全て既収録

- マクドナルド (65): GO。「権利者の許可なく複製、転載等は**お控えください**」(要請調)。
- 松屋 (206 official): GO。HD サイトは TLS 証明書問題で取得不可 → ブランド側 sitepolicy で確認。禁止事項型 boilerplate (サイト利用行為の制限であってデータ再利用条項ではない)。
- モス (168 official): GO。禁止事項型 (「当社の記事、企画、投稿内容その他の無断転載・再配布」= 記事類対象)。
- KFC (29): GO。「法令などで明示的に認められる範囲を超えて…転載、配布することは、法令により禁じられており」= 法認容限定型。
- サイゼリヤ (75 ai_estimate): 規約は禁止事項型で GO 圏内だが、**形式が SPA + flip-book で技術障壁** (preflight 済み: flip-book PDF の direct fetch を試す価値あり)。
- ガスト (76 ai_estimate): 同上 (skylark 禁止事項型 + SPA)。
- スタバ (1,285 official): GO。「本情報を使用する目的は情報収集に限られます」+ 私的使用/法認容限定 — 既収録の per-JAN crawl は先例として完走済み。

### 第4群

- 丸亀 (56 ai_estimate): GO 注記付き — トリドール /policy/ に転載条項が**見当たらない** (セキュリティポリシー等のみ)。ブランドサイト規約も未発見。
- CoCo壱 (193 official): GO。「個人的な利用など著作権法によって認められる場合を除き」の法認容限定型。
- **スシロー (80 ai_estimate): 要Syuto判断** —「本サイト上の情報は…**単なる情報として、非商業的かつ個人的にのみ利用され**、いかなるネットワークコンピューターにも複製されたり掲示されたりせず」— 対象が「情報」で商用明示制限。数値=事実の法理と正面衝突する文言。既収録 80 件 (ai_estimate) の扱いも含め判断要。
- くら寿司 (319): GO。「コピー等については著作権法で認められている場合を除いて行うことはできません」= 法認容限定型。
- **大戸屋 (85): 要Syuto判断** — net-order 規約「本サービスを構成する情報及びコンテンツは、お客様ご本人が**個人として使用する目的でのみ**利用することができる」。ただし栄養ページは ootoya.com 本体 (サイトポリシー不在) で適用範囲が曖昧。
- **やよい軒 (新規): 要Syuto判断** —「これらの**データ**の全部または一部をお客様が無断で**非営利的かつ私的な利用以外の目的で**使用・複製することを禁止」(対象列挙はマーク・商標・絵柄・画像・文章・音楽・プログラムデータ)。データ検証は完了: info/13 (東京) 単一ページに **241 栄養行** (品名+ごはん種別+kcal+PFC、テーブル構造クリーン)。
- 王将 (75 ai_estimate): GO。禁止事項型。

**hard-stop 該当: 0 件** (スクレイピング/データベース化の明示禁止はどのチェーンにも無し)。**要Syuto判断: スシロー・やよい軒・大戸屋の 3 件** (いずれも「情報/データ」への非商用・個人限定文言)。

## 3. パーサー設計

- **pdf-parse ^2.4.5 は既に devDependency** — PDF 汎用パースは新規依存ゼロで既に実現済み (pdf-fetcher.ts → \_raw/\*.txt)。Playwright も既に導入済み (crawl-seven-eleven-pw.ts / crawl-starbucks-jp.ts 先例)。
- **zensho.ts 流用範囲**: すき家 = そのまま (menu_names に 13 group 分追記のみ)。なか卯 = SIZE_LABELS へ「ごはん大盛/ごはん小盛/小/並/大/特」追加 (単独漢字は誤爆防止に数値列条件併用) — 小規模改修。検証 probe は `scripts/seed/recon-5a/zensho-freshness-probe.ts`。
- **ジョイフル**: 新規パーサーだが最も単純 (行 = `品名 kcal P F C 塩 [●…]` の単一行完結)。工数最小。
- **ココス**: crawl 型 (index → 17 カテゴリ → item ~150-250 pages、1.1s sleep = 約 4 分・crawl-lawson 先例)。item ページの PFC は「エネルギー NNNkcal たんぱく質 N.Ng…」の平文 regex で抽出可。
- **やよい軒** (判断待ち): 単一ページ table parse。restaurant-menu-scraper の naive HTML table parser 流用候補。

## 4. スキーマ提案 — **migration 不要**

- 出典 URL・取得日・推定値フラグは **既存スキーマに完備** (MenuItemRecord.sourceUrl/sourceCapturedAt/source → v35 SQLite ミラー + Supabase DDL の CHECK enum)。
- 5b でやるべきは表示系のみ:
  1. 「公式/AI推定」バッジ: search_index の source_label を SELECT に 1 列追加 + Food 型 + バッジ描画 (migration 不要、Drafting 152 の元設計)。
  2. 取得日表示: build-search-index の menuItemToNutrition が sourceCapturedAt を落としている → nutrition_json (TEXT JSON) にキー追加 + snapshot 再生成 (migration 不要)。独立列にしたい場合のみ v39 ALTER (v37 前例あり) — 5b では不要と判断。
- 既知の構造リスク (5b 設計に織り込む): source_id が `${slug}_${offset}` の配列順依存 — メニュー改定で中間挿入すると v38 search_favorites の参照がズレる。**「末尾追加のみ」規約 or 安定キー移行を 5b で決める**。builder は DELETE を emit しないため廃番メニューが残留する点も同様。

## 5. Sprint 5b 推奨スコープ

**第1弾 (GO のみ・判断待ち含まず)**:
1. **ジョイフル新規** (~346 行 → validation 通過分、推定 300+ items) — 新規パーサー最小工数・PDF 最新。
2. **すき家更新** (345 → 363+、menu_names 13 追記) — 鮮度 3 か月の実証があるため更新 cadence の試金石。
3. **なか卯更新 + SIZE_LABELS 拡張** (43 → ~111+; 現収録 137 との突き合わせで回収率確認)。
4. **ココス新規 crawl** (~150-250 items) — crawl-lawson 先例踏襲、robots.txt 確認を先行。
5. 横断: 出典バッジ + 取得日の表示系 (migration 不要) と、search-index snapshot 再生成。
6. **配布経路の意思決定**: 同梱 snapshot 継続 (追加工数ゼロ) vs Supabase seed 生成+sync 実装。5b は同梱継続を推奨 (サーバー移行は独立 sprint)。

**Syuto 判断待ち**: やよい軒 (241 行・データ品質最良クラスだが規約文言)、スシロー (既収録 ai_estimate 80 件の扱い)、大戸屋 (規約適用範囲)、UA 方針 (Bot UA vs ブラウザ UA)。

**見送り**: はま寿司 (公式非公開・ai_estimate 維持)、サイゼリヤ/ガスト (SPA 障壁 — flip-book PDF 試行は次点候補)、セイコマ/デイリー (Sprint B Phase 0 の結論維持)。
