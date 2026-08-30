# Sprint 5b — 外食チェーンデータ第1弾投入 (2026-08-30)

5a recon (docs/recon-chain-data-5a.md) の GO 判定 4 チェーンを投入。
配布は同梱 snapshot 継続、 Supabase 側への適用なし、 SQLite migration なし。

## 1. アクセスログ (規律遵守の記録)

UA 方針: Syuto 承認 (2026-08) の「ブラウザ相当 UA・単発 curl・2 秒以上間隔・
一括 DL→ローカル処理」を全取得に適用。 機械的巡回は cocos の item crawl のみで、
crawl-lawson 先例の 1.1s 間隔 + 指数バックオフ (2s→8s) を踏襲。

| 対象 | 内容 | リクエスト数 |
|---|---|---|
| すき家 nutrition.pdf | 単発 curl (Referer: sukiya.jp) | 1 |
| なか卯 nutrition.pdf | 単発 curl (Referer: nakau.co.jp) | 1 |
| ジョイフル cal.pdf | 単発 curl + disclosure ページ確認 | 2 |
| ココス robots.txt / menu index / 較正 sample | 単発 curl ×4 (2.5-3s 間隔) | 4 |
| ココス item crawl | 17 カテゴリ + 268 item ページ、 1.1s 間隔 単発実行 | ~285 |
| ココス spot-check 再取得 | sample 20 ページ、 2.2s 間隔 | 20 |
| すき家 menu hub (較正補助) | index + 7 カテゴリ、 2.5s 間隔 | 8 |

robots.txt: cocos-jpn.co.jp は 404 (制限宣言なし) を 2026-08-30 に確認。
見送り 4 チェーン (スシロー・やよい軒・大戸屋・はま寿司) へのアクセスなし。

## 2. 5a からの主要な差分・発見

1. **なか卯 PDF は 5a 取得 (8/18・6p) の翌日 8/19 版 (9p) に更新**され、
   label 体系が再変化 (単独漢字 小/並/大/特、 W 小盛〜W 大盛、 豪快盛、 2倍盛)。
   5a の「6 種追加で ~111 行」見積りは 8/19 版では「12 label で 243 行」に拡大。
2. **2026-05 の menu_names 較正に名前スワップが 6 ペア実在**
   (とろ～りチーズ⇄高菜明太マヨの丼/ライト両系列、 牛カレー⇄ソーセージカレー、
   チーズ牛カレー⇄チーズソーセージカレー、 おろしポン酢ライト⇄テイクアウト、
   ねぎ玉カルビ⇄チーズカルビ、 朝食帯のシフト、 加えて「ごはん 2倍盛」という
   ページ跨ぎ融合の phantom item)。 値ベース較正の限界が原因。
   → **全ページ PNG レンダリング (pdfjs-dist + @napi-rs/canvas、 いずれも
   pdf-parse 既存依存) による視覚照合を較正の正式手順化** (scripts/seed/render-pdf.mjs)。
   全 196 group を照合、 検証サンプル 44/44 + spot-check 80/80 一致。
3. **混在表記ブランドの検索 0 ヒットバグ (v1.5.1 以来)**: query 側の
   ひらがな→カタカナ正規化 (すき家→スキ家) が raw brand token と不一致。
   node:sqlite で v36 schema + FTS5 を忠実再現した dogfood simulation
   (tmp/s5b/dogfood-sim.mjs) が検出。 正規化 chainName の alias fold で修正。

## 3. 設計決定

- **source_id 安定キー**: `${chainSlug}:${品名}`。 search_favorites は現在
  読み書きコードが存在しない (v38 テーブルのみ) ため、 切れる既存参照ゼロの
  タイミングで移行。 同名再掲は同値 dedupe (26 件、 従来の重複ヒット解消) /
  異値 #n 連番 (23 件)。
- **廃番**: chain JSON に `discontinued: true` で温存 (provenance)、 snapshot
  非収録 = 検索から除外。 既存端末の残留行 (旧 positional id・廃番) は
  seedSearchIndex の stale-row sweep (updated_at < seed 開始時刻の
  restaurant_menu 行を削除) が掃除。
- **「推定値」注記**: per-item フラグは追加せず、 source_label (公式/AI推定) と
  restaurant 行であることから表示層で導出 (全行 true の定数フラグは冗長)。
  注記文言は各社公式一覧の注記を踏襲。
- **ココスの非開示 92 ページ**: テイクアウト弁当 55 は栄養非開示、 「選べる」系・
  トッピング系はバリエーション別 inline 表記のみ → 捏造せず droppedItems に記録。

## 4. 既知の限界 (5b スコープ外)

- スペース無し品名の menu 語 partial match (「ココス ハンバーグ」等) は
  unicode61 の token 粒度による既知限界 (v36 コメントの ngram v37 候補)。
- すき家の S/M/L/個 単位 (ドリンク・シェイク・からあげ等 24 行) と
  無サイズ単品 (トッピング・お子様メニュー等) は従来どおり未収録。
- Supabase 側 seed (restaurants/restaurant_menu_items) は未生成のまま。
  builder (build-seed-migration.ts) は旧 positional id 前提なので、 seed SQL を
  生成する際は安定キーへの追随が必要。

## 5. 引き継ぎ

- Supabase seed 適用: スコープ外継続。 適用時は上記 builder の安定キー対応から。
- やよい軒へのデータ提供打診: 未着手 (規約文言により見送り中。 241 行の
  クリーンなテーブルがあるため、 打診が通れば最有力の次期候補)。
- 大戸屋: Phase 2.2b 時点の既存 85 件が official_disclosure のまま収録されている。
  5a で規約適用範囲が「要判断」になったため、 既存分の扱い (維持 / ai_estimate
  降格 / 削除) は Syuto 判断待ち。 S5b では非接触。
- 更新 cadence: すき家 PDF は 3 か月で 2 回更新を確認。 再取得→視覚照合→
  spot-check の手順は zensho-calibrate.ts + render-pdf.mjs で再現可能。
