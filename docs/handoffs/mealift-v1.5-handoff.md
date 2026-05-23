# Mealift v1.5 Handoff Document

**最終更新**: 2026-05-24 (Sprint 2.7c.4 land — Phase 2.7c 完了 milestone ✨🎯)
**目的**: 新 chat-side session の context source として、 また必要に応じて Claude Code (agent) の context にも投入し、 v1.5 ship phase の継続作業を中断なく進める。

---

## 1. プロジェクト概要

| 項目 | 内容 |
|---|---|
| アプリ名 | **Mealift** (内部名: bodyforge) |
| ターゲット | 日本市場 (iOS first、 Android は v1.6+ 検討) |
| カテゴリ | フィットネス・栄養管理 |
| 競合 | あすけん / カロミル (listing copy で直接言及しない) |
| 開発者 | **Syuto-san** (個人開発、 学生) |
| 開発期間 | v1.0 → v1.5 (現行 ship phase) |
| Bundle ID | `com.mealift.app` |
| ASC App ID | `6762738456` |
| Apple Team | `9WCKU8U5XV` |
| EAS Project | `7e9aa1d5-c252-4fa3-9c1d-9ea3091114e5` |
| Repo | `github.com/syuto715/bodyforge` (private、 ship name は Mealift) |

**Tech stack**:
- **Frontend**: Expo SDK 54 + Expo Router + React Native 0.81 + TypeScript strict
- **State**: Zustand + TanStack Query + react-native-mmkv (persistence)
- **Local DB**: expo-sqlite (migration head **v38**、 19 sprint 連続無変更 ✨)
- **Backend**: Supabase (Postgres + Edge Functions [Deno] + Auth + Storage)
- **LLM**: Google Gemini 2.5 Flash / Flash-Lite (server-only key)
- **Payments**: RevenueCat (iOS のみ、 Android key 未設定)
- **Health**: HealthKit (iOS) / Health Connect (Android) — **無料機能** (paywall 対象外)
- **Search (廃止)**: kuromoji.js + FTS5 (v37 schema、 v2 UI tree は Sprint 2.7.4 で orphan cleanup、 schema + seed は production foundation として retain)

---

## 2. 4-actor SSoT culture

Mealift 開発は 4 actor の協調で進行する。 各 actor が単一の責任 (SSoT) を持つ。

| Actor | 役割 |
|---|---|
| **Syuto-san** | 最終判断、 4-actor bridge、 spot check、 device verify、 App Store submission |
| **chat-side Claude** | 設計、 判断 elevation、 sprint kickoff prompt 設計、 progress 監視、 Drafting 確定 numbering |
| **Claude Code** (agent) | 実装メイン、 reconnaissance、 Codex MCP を内部 call して independent review、 hardening loop の主体 |
| **Codex MCP** | Independent review (Critical / Important / Nit verdict)、 hardening loop の二次 gate、 recon 確認の cross-check |

### Hardening prompt pattern (Drafting 175 — chat-side default 必須適用)

全 sprint kickoff prompt に Codex MCP review instruction を embed する。 例外: pure doc-only / reconnaissance-only で chat-side が明示 skip 判断した場合のみ。

**1 prompt で Claude Code all-in-one**:
1. Code 修正 / 削除 / doc land
2. Codex MCP 内部 call で independent review request (`mcp__codex__codex`、 `sandbox=read-only`、 `approval-policy=never`)
3. Review 観点は chat-side が 1 prompt 内に embed (review 観点別途 prompt 出さない)
4. Iterative fix → Critical=0 まで repeat (**4 round hard limit**、 超過時は escalate)
5. Final state を chat-side に report (iteration count + verdict + cleanup queue 候補必ず embed = visibility 確保)

**実証実績** (v1.5 Phase 2.7 期):
- Sprint 2.7.3 — N=**2 rounds** Critical=0 (Round 1 で `nutrition-advice` contract regression + `estimate-nutrition` audit miss を検出、 Round 2 で resolve 確認)
- Sprint 2.7.4 — N=**1 round** Critical=0 (orphan cleanup の completeness を一発で確認)
- Sprint 2.7.5 — N=**4 rounds (hard limit ぎりぎり)** Critical=0 (pricing rule + barcode mismatch + keywords dedup chain through 3 rounds)。 Drafting 175 の 4 round hard limit が literal に edge を踏んで成立、 運用 viability を強化
- Sprint 2.7.6 — N=**TBD** (本 sprint、 Phase 2.7 完了 milestone + Phase 2.7c hand-off)

### Drafting 176 — Recon-driven kickoff invalidation hard-stop

kickoff の認識と current codebase 状態に乖離があった場合、 **reconnaissance 段階で hard-stop + escalate**。 Sprint 2.7.4 の "search.tsx retrofit" → "orphan cleanup" reframe で literal 実証 (Phase 4B の `add.tsx` refactor で production search UX が既に absorb 済だった状態を recon 段階で検出)。

### Drafting 177 — Codex review fix decision pattern

Codex review 出力に対する fix 判断を明示的に codify (Sprint 2.7.6 で
chat-side propose、 本 doc + Phase 2.7 完了 doc で literal codify)。

**Critical verdict 6 種類別 fix decision**:

| Critical 種類 | Fix decision |
|---|---|
| (a) Drafting boundary violation | Boundary 整合に revert / refactor、 該当 Drafting spec 再確認 |
| (b) Code regression | Root cause fix + regression test 追加 |
| (c) Doc inaccuracy | Literal correct content に update、 source-of-truth と cross-check |
| (d) Edge case gap | Test case 追加 + 必要なら implementation 拡張 |
| (e) Schema / contract violation | Contract 整合に revert、 type definition 整合性確認 |
| (f) Security 観点違反 | Drafting 172/173/174 spec 整合させて修正、 必要なら新 test case 追加 |

**Important verdict**: ship 前 fix 望ましいが必須でない。 v1.5.x cleanup queue 候補。 例外: 本 sprint scope と直接 overlap し、 同 turn 内 trivial fix なら同梱処理 OK。

**Nit verdict**: future improvement、 v1.5.x cleanup queue 候補。 同梱処理しない (scope creep 防止)。

**Hedged claim** ("Potential issue" / "Could be improved" / "Consider..."): Important 扱い (conservative)、 fix せず report。

**Codex 出力に factually 誤りがある場合**: agent が actual verify、 もし factually 誤り → fix せず report に counter-evidence + Codex output 全文 embed、 chat-side で信頼性判断。

**Re-review call rules**: 各 Critical fix 後 per-round commit、 Codex MCP 再 call に直前 round の review 観点を verbatim 再投入 (consistency)。 Round 番号 increment。

**Hard limit**: 4 round 到達で Critical=0 にならなければ escalate (各 round の Critical verdict + fix attempted + 何故 resolve しなかったか analysis 添付)。

---

## 3. 通信スタイル規則

- **説明文・推論・提案・推奨は全て日本語**
- 英語 OK: 技術固有名詞のみ (NDJSON / EF / Codex / Drafting / Sprint / Phase / SQL / Gemini / FTS5 / TanStack Query / 等)
- 英語の形容詞・動詞・副詞は日本語に置換:
  - 「strong recommendation」 → 「強くおすすめ」
  - 「flag する」 → 「指摘する」
  - 「sync する」 → 「整合させる」
  - 「verify する」 → 「確認する」
  - 「derive する」 → 「導出する」
  - 「invalidate する」 → 「無効化する」

例:
- ❌ "この Edge Function は idempotency_key を verify する"
- ✅ "この Edge Function は idempotency_key を確認する"

---

## 4. Phase 2.3-2.7 progress summary (v1.5 ship trajectory)

| Phase | Status | Sprint count | 主要 deliverable | Commit head |
|---|---|---|---|---|
| **1.0-1.7** Stage 1 AI Coach | ✅ 完了 | 8 phase | ミー先生 chat + 診断 + ルーティン生成 + 週次アドバイス (4 surface) | (v1.5.0 CHANGELOG.md 既 land) |
| **2.2b** Seed | ✅ 完了 | — | 36 chains / 5,406 items / official 73.8% | — |
| **2.3** 検索 UX | ✅ 完了 | 6 (2.3.1-2.3.6) | search_index FTS5 foundation + dev preview tree (Sprint 2.7.4 で UI 層 orphan cleanup) | (Phase 4B refactor で production absorb) |
| **2.4** Quick log | ✅ 完了 | 6 (2.4.1-2.4.6) | Quick log + Favorites + Timeline + Edit/Delete (dev preview、 UI 層は Sprint 2.7.4 で orphan cleanup) | `241c308` |
| **2.5** AI estimate | ✅ 完了 (single sprint) | 1 (2.5.1) | scan-dish link-in (Drafting 164 literal payoff) | `e9e567b` |
| **2.6** ミー先生 chat hardening | ✅ 完了 | 3 (2.6.1-2.6.3) | Drafting 172 7-layer security hardening (coach-chat EF) | `3b4d887` |
| **2.7** Hardening fan-out + ship | ✅ **完了 (6/6)** | 6 (2.7.1-2.7.6) | LLMClient recon + Drafting 173 fan-out (7/7 EFs) + orphan cleanup + ship docs + Phase 2.7 完了 milestone | Sprint 2.7.6 commit (本 doc update 同 commit) |
| **2.7c** Exercises master seed | ✅ **完了 (4/4)** | 4 (2.7c.1-2.7c.4) | Drafting 143 literal 達成 — 580 件 exercise master ship (V2 286 + Legacy 337 − overlap 43)、 license clean (4 trademark fixes 累計: TRX + Animal Flow + BOSU + Spin Class)、 schema touch 0 (Drafting 162 honor、 19 sprint 連続 v38 維持 ✨)。 詳細: `docs/plans/v1.5-phase-2.7c-completion.md` | (Sprint 2.7c.4 land、 本 doc を含む同一 commit) |

**Sprint-by-sprint detail** は `docs/plans/v1.5-phase-2.X-completion.md` (5 件、 Sprint 2.7.4 で retrospective 注記済) + 本 doc の各 section 参照。

---

## 5. Drafting candidates 117-177 (61 件) architecture map

Drafting は v1.4 期に 116 件まで chat-side で numbered、 v1.5 で 117-177 (61 件、 security + workflow integrity 関連は inflation 抑制対象外で積極 propose 想定)。 Phase 2.7 期に Drafting 173 / 174 / 175 / 176 / 177 が新規 establish (上記 section 2 参照)。

**重要 cohort (v1.5 ship 直結)**:

| # | Title | 適用 phase | 役割 |
|---|---|---|---|
| **161** | Production safety + dev preview parallel | Phase 2.3 establish、 Sprint 2.7.4 で boundary semantics 明示 | Sprint 2.7.4: 「**surface 縮小 = boundary observed**」 vs 「**surface change = boundary violated**」 の区別。 zero-caller deletion は前者として acceptable |
| **162** | Incremental migration / 不要な migration avoidance | Phase 2.4-2.7 + 2.7c 全期 | **19 sprint 連続 migration head v38 維持** (literal 実証、 baseline は v1.5-phase-2.7-completion.md 「15 sprint」 at Sprint 2.7.6 land + Phase 2.7c の 4 sprint = 19)、 Phase 2.7c も schema touch 0 で literal 達成 ✊ |
| **164** | Phase forwarding stub literal payoff | Phase 2.5 single-sprint | 1-line swap で stub → 本実装 |
| **166** | Point-in-time meal log snapshot | Phase 2.4.1 | `food_id = null` の snapshot path で v38 不要、 Drafting 167 への bridge |
| **167** | Foreign-key-by-natural-pair | Phase 2.4.2 `search_favorites` PK | Phase 2.7c で `'exercise'` enum reuse 想定 |
| **168** | Best-effort metric coordination | Phase 2.4.3 | `use_count` 増分は sequential bump、 decrement は明示的に避ける |
| **169** | Parallel-fetch fan-out hook | Phase 2.4.4 `useMealLogTimeline` | (orphan cleanup で削除、 pattern 自体は再利用可能) |
| **170** | Scope reduction at API-shape boundary | Phase 2.4.5 | mealType change drop で edit-flow 簡素化 |
| **171** | Phase completion via dev preview hub | Phase 2.3-2.6 | v2-hub mechanism (Sprint 2.7.4 で 役割完了 + 削除) |
| **172** | LLM chat security defense-in-depth 7-layer | Phase 2.6 establish、 Sprint 2.7.2-3 fan-out | **7/7 EFs complete**: coach-chat / coach-advice / coach-routine / nutrition-advice / estimate-nutrition / estimate-nutrition-vision / generate-weekly-report |
| **173** | Cross-EF security policy fan-out | Sprint 2.7.2 wave 1、 2.7.3 wave 2 | 全 sibling EF へ L3/L4/L5 を template-based に展開 |
| **174** | Multimodal prompt injection defense via image-text relegation | Sprint 2.7.3 (vision EF) | 画像内 OCR-visible text を 「image content description」 として LLM に明示、 user instruction 扱いを禁止 |
| **175** | Codex MCP review-in-the-loop hardening cadence | Sprint 2.7.3-onward | 上記 section 2 参照 |
| **176** | Recon-driven kickoff invalidation hard-stop | Sprint 2.7.4 | 上記 section 2 参照 |
| **177** | Codex review fix decision pattern (Critical 6 種類別 fix decision + Important defer + Nit defer + hedged claim conservative + factual error counter-evidence) | Sprint 2.7.6 chat-side propose、 同 turn で codify | 上記 section 2 参照 |

---

## 6. 既知の前提と false assumption 回避

新 chat-side session が **誤った前提で sprint kickoff を出す** ことを防ぐため、 current codebase 状態を明示:

### 6.1 Nutrition UX
- **Production search UX は `app/(tabs)/nutrition/add.tsx`** (3-tab top-level「検索 / スキャン / OCR」 + nested 6 sub-tab 「検索 / マイ料理 / よく使う / お気に入り / 手入力 / テンプレ」)
- **旧 `nutrition/search.tsx` (530 行)** は Phase 4B refactor (`4f487ee`) で orphan 化、 **Sprint 2.7.4 で削除済**
- **v2 dev preview tree** (`search-v2`, `food-detail-v2`, `quick-log-v2`, `meal-log-v2`, `v2-hub`) は **Sprint 2.7.4 で全削除**
- 削除対象 file 一覧は `docs/plans/v1.5-phase-2.4-completion.md` の Sprint 2.7.4 retrospective note 参照

### 6.2 Schema + seed retain
- `src/infra/database/migrations/v37.ts` (search_index FTS5) **保持**
- `src/infra/database/migrations/v38.ts` (search_favorites with `'exercise'` enum) **保持** — Phase 2.7c で reuse
- `src/infra/database/seed/searchIndex.ts` (36 chains / 5,406 items snapshot loader) **保持** — connection.ts:43 から起動毎に呼ばれる
- Migration head **v38、 19 sprint 連続無変更** (Drafting 162)

### 6.3 LLM EFs hardening 状態
- 全 7 EF に Drafting 172 7-layer 適用済 (Phase 2.6 + Sprint 2.7.2-3 で完成)
- 共有 helper: `supabase/functions/_shared/llmSecurity.ts` (`buildLLMDefenseParagraph`, `checkUserContentLength`, `detectJailbreakHints`, `scrubSecrets`)
- 全 EF の `__tests__/security.test.ts` (Node-side jest、 Deno runtime 不要) で coverage

### 6.4 HealthKit / Health Connect は無料機能
- Paywall 対象外。 設定画面の health integration toggle は free / plus / pro 全 tier で動作
- 「Pro 限定」 系の copy / lock icon は表示しない

### 6.5 RevenueCat
- iOS のみ設定済 (EXPO_PUBLIC_REVENUECAT_IOS_API_KEY)
- **Android key 未設定** → v1.5 は iOS 専用 ship、 Android dev build は別 phase

### 6.6 Test infra
- jest はピュア logic / Node-side validator に有効
- **jest-expo / RNTL setup なし** — Component-level test infra は別 commit で追加要 (v1.5.x cleanup queue)

---

## 7. v1.5.x cleanup queue (post-ship phase)

Sprint 2.7.5 land 時点の最新 list。 v1.5 ship 後 / v1.6+ 開発期に着手予定:

### Codex review surface
- **Test rigor debt** (Sprint 2.7.3 Round 2 Important): `estimate-nutrition-vision`, `generate-weekly-report`, `coach-advice`, `estimate-nutrition` の各 `security.test.ts` 内 architectural-pin tests を、 placeholder `expect(true)` から executable behavioral assertion へ昇格 (EF source を import/export する形に refactor)
- **weekly-report closing copy** (Sprint 2.7.3 Round 2 Nit): design 注記 "probably no closing" との整合判断、 keep / drop どちらか chat-side で確定
- **Existing carryover**:
  - L4 length cap の 3999/4000/4001 boundary 試験追加
  - Multi-pattern jailbreak overlap 試験
  - Unicode / URL encoding attacks 試験
  - L5 secret pattern overlap 試験 (JWT 内 base64 が AIza pattern と partial match する false positive)

### Phase 2.4 完了 doc 由来
- MealType change (移動): build alongside any move-related polish
- Swipe-to-delete on timeline: UX demand surfacing 待ち
- Custom-food round-trip from search ★ (search_favorites と foods.is_favorite 統合)
- ngram tokenizer for partial kanji match (v1.5.1 候補)

### Phase 2.6 完了 doc 由来
- 追加 secret patterns (ghp_*, sk_live_*, Supabase 特定 prefix 等)
- Jailbreak-hint block-mode (telemetry 蓄積後、 一部 pattern を soft-block 化)
- 追加 red-team test family (Anthropic / Google / OpenAI 公開 jailbreak research)
- Live integration tests (staging EF 経由)

---

## 8. v1.6+ roadmap hand-off

v1.5 ship 直後に着手検討の strand (Phase 2.7c は v1.5.0 同梱 path
で本 doc 上ではここから除外、 `v1.5-phase-2.7c-design.md` の (A)
判断参照):

- **LLMClient provider switching** (Claude / OpenAI 切替): `src/infra/llm/types.ts` の `LLMClient` interface が既 abstraction。 Phase 2.7 で no-op refactor verify 済 (`docs/plans/v1.5-phase-2.7-design.md` §LLMClient back-port reconnaissance)
- **Android dev build**: RevenueCat Android API key 取得 + EAS build profile 追加
- **追加 EF / 追加 secret pattern** (Drafting 172 + 173 reapplication)
- **Nutrition UI modernize** (現 `add.tsx` 1000+ 行を search_index 利用形に rebuild、 schema 既 retain なので非破壊的)

**v1.5.0 同梱 path 内 strand (Phase 2.7c は ✅ 完了)**:
- **Phase 2.7c — Exercises master 580 件** ✅ **完了** (Sprint 2.7c.4
  land、 Drafting 143 literal 達成 ✨🎯)。 4 sprints / agent-led batch
  generation / Codex N=1+0+2+2+本 turn 累計、 schema touch 0
  (Drafting 162 honor、 19 sprint 連続 v38 維持)、 license clean
  (TRX + Animal Flow + BOSU + Spin Class brand-rename done、 全 580 件
  trademark scan clean)。 詳細: `docs/plans/v1.5-phase-2.7c-completion.md`。
  v1.5.0 ship date target: **2026 年 11-12 月** (残: Phase B device
  verify / Phase C Supabase state / Phase D Promotion sequence)

---

## 9. 新セッション起動時のフロー

1. **本 doc を chat-side に paste** (必ず最初に)
2. 必要に応じて agent (Claude Code) の context にも投入 (sprint kickoff prompt 内で同等の文脈圧縮を embed する場合は省略可)
3. **通信スタイル規則 (日本語化) を chat-side が必ず follow**
4. **Hardening pattern (Codex MCP review embed) を全 sprint kickoff prompt で default 適用** (例外: doc-only / recon-only で chat-side が明示 skip 判断したとき)
5. **Drafting 144** (新規 candidate は agent `[unnumbered new]` で report、 chat-side 確定 assign) を維持
6. **Drafting 176** (recon-driven kickoff invalidation) を尊重 — recon で前提崩壊が見つかった場合は escalate、 ignore して進めない

---

## 10. 主要 doc cross-reference

| Doc | 内容 |
|---|---|
| `docs/plans/v1.5-phase-2.4-completion.md` | Phase 2.4 完了 milestone + Sprint 2.7.4 retrospective 注記 |
| `docs/plans/v1.5-phase-2.5-completion.md` | Phase 2.5 完了 milestone (single sprint) |
| `docs/plans/v1.5-phase-2.6-completion.md` | Phase 2.6 完了 milestone (Drafting 172 7-layer 完成) |
| `docs/plans/v1.5-phase-2.6-design.md` | Phase 2.6 design (3-sprint hardening plan) |
| `docs/plans/v1.5-phase-2.7-design.md` | Phase 2.7 design (LLMClient recon + Drafting 173 fan-out) |
| `docs/plans/v1.5-phase-2.7-completion.md` | Phase 2.7 完了 milestone (6 sprint summary + Drafting 161/162/171-177 integrity matrix + Codex review iteration 履歴 + v1.5.x cleanup queue 集約) |
| `docs/plans/v1.5-phase-2.7c-design.md` | Phase 2.7c (Drafting 143 Exercises master 580 件 seed) design + sprint breakdown + v1.5 ship 統合判断 (A 採用) |
| `docs/plans/v1.5-phase-2.7c-completion.md` | Phase 2.7c 完了 milestone — 4 sprint summary + Drafting 143 達成 + 161/162/175/177/178/179 integrity matrix + Codex iteration history |
| `docs/plans/v1.5-phase-2.7c-style-guide.md` | Phase 2.7c style guide — naming convention / enum / Drafting 179 license clean state policy / Sprint 2.7c.1-4 actual delivery table |
| `docs/plans/v1.5_ship_checklist.md` | Stage 1 AI Coach ship checklist (Phase 2.X 補強は本 sprint で land) |
| `docs/release-notes/v1.5.md` | User-facing 日本語 release notes (本 sprint で land) |
| `docs/app-store-listing-v1.5.md` | App Store listing copy draft (本 sprint で land) |
| `CHANGELOG.md` | 技術 changelog (v1.5.0 entry に Stage 1 既 land、 本 sprint で Stage 2-3 追記) |
| `supabase/functions/_shared/llmSecurity.ts` | Drafting 172 + 173 共有 helper (全 7 EF が import) |

---

**END OF HANDOFF DOCUMENT** — 新セッション開始時、 本 doc を paste して chat-side のコンテキストを起動してください。
