# Cloud Sync Layer + Sign in with Apple — 設計ドキュメント

**Status**: Design — implementation deferred to a separate session after review.
**Author**: 設計セッション 2026-05-05.
**Build target**: build 14 (build 13 already shipped).
**Scope**: 全ユーザーデータの双方向 sync + Apple Sign In + 機種変更フロー UX。

このドキュメントは実装前の設計レビュー用。全ファイル変更ゼロのまま、reconnaissance 結果に基づいて構築されている。リスクは隠さず正直に列挙する方針。

---

## Part 1: 現状分析

### 1-1. ローカル DB の全テーブル

v1 〜 v22 までのマイグレーションを総合した、現在のローカル SQLite スキーマ:

| # | テーブル | 由来 | 主キー | sync 候補? |
|---|---|---|---|---|
| 1 | `profiles` | v1 | TEXT id | ✅ user-private |
| 2 | `body_logs` | v1 | TEXT id | ✅ user-private |
| 3 | `exercises` | v1 | TEXT id | ⚠️ canonical seed + user custom (`is_custom=1`) |
| 4 | `workout_routines` | v1 | TEXT id | ✅ user-private |
| 5 | `workout_routine_items` | v1 | TEXT id | ✅ user-private (depends on routines) |
| 6 | `workout_sessions` | v1 | TEXT id | ✅ user-private |
| 7 | `workout_sets` | v1 | TEXT id | ✅ user-private (depends on sessions) |
| 8 | `foods` | v1 | TEXT id | ⚠️ canonical seed + user-added + OFF cache + pulled approved submissions |
| 9 | `meal_logs` | v1 | TEXT id | ✅ user-private |
| 10 | `meal_log_items` | v1 | TEXT id | ✅ user-private (depends on meal_logs) |
| 11 | `notes` | v1 | TEXT id | ✅ user-private |
| 12 | `meal_templates` | v1 | TEXT id | ✅ user-private |
| 13 | `sync_queue` | v1 | TEXT id | ❌ infra (sync の制御本体) |
| 14 | `dishes` | v3 | TEXT id | ⚠️ canonical seed + user `is_my_dish=1` |
| 15 | `dish_ingredients` | v3 | TEXT id | ⚠️ canonical + user (depends on dishes) |
| 16 | `barcode_foods` | v4 | TEXT id | ⚠️ OFF cache (再取得可能、本来は不要だが、マニュアル追加分は user-private) |
| 17 | `progress_photos` | v5 | TEXT id | ✅ user-private — **ただし file 本体は app document directory** |
| 18 | `weekly_reports` | v5 | TEXT id | ✅ user-private (キャッシュ的、再生成可) |
| 19 | `adaptive_goal_suggestions` | v7 | TEXT id | ✅ user-private |
| 20 | `personal_records` | v7/v15 | TEXT id | ✅ user-private |
| 21 | `water_logs` | v7 | TEXT id | ✅ user-private |
| 22 | `food_aliases` | v7 | TEXT id | ❌ canonical seed (再取得可) |
| 23 | `user_submitted_foods` | v16 | TEXT id | ✅ **既に sync 済み** (Sprint 4 backend / submissionSync.ts) |
| 24 | `user_consents` | v19 | INTEGER AUTOINCREMENT | ❌ 監査ログ (デバイスごと、sync 不要) |
| 25 | `sync_watermarks` | v20 | resource (TEXT) | ❌ infra (テーブルごと最終 pull 時刻) |
| 26 | `user_badges` | v22 | INTEGER AUTOINCREMENT | ❌ 派生状態 (再計算可) |

### 1-2. sync クラス分類

| クラス | テーブル | 戦略 |
|---|---|---|
| **A. user-private full sync** | profiles, body_logs, workout_routines, workout_routine_items, workout_sessions, workout_sets, meal_logs, meal_log_items, notes, meal_templates, adaptive_goal_suggestions, personal_records, water_logs, weekly_reports, progress_photos | 双方向 sync。LWW conflict resolution。soft delete。 |
| **B. mixed (canonical + user)** | exercises, foods, dishes, dish_ingredients, barcode_foods | **`is_custom=1` / `is_my_dish=1` / `is_user_added=1` / `source='user'` のみ sync。canonical 行はサーバ側に存在しないので push のみ、pull は対象外。** |
| **C. already syncing** | user_submitted_foods (→ public_foods) | 現状の submissionSync.ts を継続。本設計の対象外だが、orchestrator に組み込む。 |
| **D. local-only by design** | user_consents (audit on-device), user_badges (derived), sync_queue, sync_watermarks, food_aliases (seed) | sync しない。reinstall 時は再構築。 |

### 1-3. データ依存関係 (FK / 論理参照)

```
profiles (root)
├── body_logs            (FK profile_id)
├── workout_routines     (FK profile_id)
│   └── workout_routine_items  (FK routine_id, FK exercise_id → exercises)
├── workout_sessions     (FK profile_id, FK routine_id → workout_routines)
│   └── workout_sets     (FK session_id, FK exercise_id → exercises)
├── meal_logs            (FK profile_id)
│   └── meal_log_items   (FK meal_log_id, soft-FK food_id → foods)
├── meal_templates       (FK profile_id, items は JSON 内に food_id を含む)
├── notes                (FK profile_id)
├── progress_photos      (FK profile_id)
├── weekly_reports       (FK profile_id)
├── adaptive_goal_suggestions (FK user_id ≈ profile_id)
├── personal_records     (FK user_id, FK exercise_id, soft-FK session_id)
├── water_logs           (FK user_id ≈ profile_id)
├── dishes (`is_my_dish=1` のみ user-private)
│   └── dish_ingredients (FK dish_id, soft-FK food_id → foods)
├── foods (`is_user_added=1` のみ user-private)
└── exercises (`is_custom=1` のみ user-private)
```

**重要な制約**:
- `workout_sets` は `workout_sessions` より後に sync する必要あり (FK ON DELETE CASCADE が走るため、parent 不在で insert すると整合性壊れる)
- `meal_log_items` も同様 (`meal_logs` 後)
- `workout_routine_items` も同様 (`workout_routines` 後)
- `dish_ingredients` も同様 (`dishes` 後)
- `personal_records.session_id` は soft-FK (FK 制約なし) — session 削除と独立に存在し得る
- `meal_log_items.food_id` も soft-FK (canonical foods は pull の対象外、id は安定)

**「user_id」 の表記揺れ**: `personal_records.user_id`, `water_logs.user_id`, `adaptive_goal_suggestions.user_id` だけ "user_id" 列名を使い、他は "profile_id"。これは schema の歴史的経緯で、**実態は同じ値 (= local profile.id)**。Supabase 側に揃える際は `user_id` (= auth.users.id) に統一する方針。マッピングは後述。

### 1-4. 既存 sync 実装 (submissionSync.ts) のパターン分析

参考になる既存実装。設計の base patterns はここから引き継ぐ:

**コア設計** (`src/infra/supabase/submissionSync.ts`):
- **クライアント注入**: `supabase` client は引数で渡せる。テストはフェイクを差し込む。デフォルトはモジュール scope の null-safe singleton。
- **per-row failure tolerance**: 10 件 push して 3 件目で 500 が返っても、4-10 件目は試行する。失敗行は local 状態を変更せず次回 pickup。
- **idempotent upsert**: `client.from('public_foods').upsert(payload, { onConflict: 'id' })` — local UUID == server UUID。
- **rate-limit backoff**: 429 検知時、`base * 2^attempt` で max 3 retry。それ以外のエラーは即 throw。
- **server-side status は強制**: client から `status='approved'` を送れない (RLS で拒否)。本設計の他テーブルでも同様の "user-controlled fields のみ書ける" 制約を適用する。
- **watermark pull**: `gt('updated_at', watermark).order('updated_at', { ascending: true }).limit(500)` で増分取得。応答の最終行の updated_at が次回 watermark。
- **per-row 失敗時のサーバ無視**: 観測ベースの increment、サーバ側 SLA 不要 — クライアント側で軽量化。

**展開時の追加要件 (submissionSync には無い)**:
- Soft delete の伝播 (submissionSync は削除がない)
- Conflict resolution (submissionSync は user → server 一方向 + server → user の片方向 pull で衝突しない)
- 親子テーブルの順序保証 (submissionSync は単一テーブル)
- 「初回 sync」での bulk push (submissionSync は 1 件ずつ submit する想定)

### 1-5. 既存 Supabase 側のテーブル

`supabase/migrations/` にある SQL ファイル:

| ファイル | テーブル | RLS | 用途 |
|---|---|---|---|
| `20260421000000_create_ai_usage_logs.sql` | `public.ai_usage_logs` | own row read | Edge Function クォータ用 |
| 同上 | `public.profiles` の ALTER (plan/trial 列追加) | — | **profiles テーブルは別途 dashboard で作成済みと推測。CREATE 文がリポジトリ内に無い。** |
| `20260426000000_create_public_foods.sql` | `public.public_foods` + `public.food_reports` | submitter own + approved-public | Sprint 4 backend |
| `20260430000000_add_food_category.sql` | `public_foods.food_category` 列追加 | — | Sprint 4 Part 1 |

**🚨 重要な不確定要素**: `public.profiles` テーブルの schema が migration ファイルに無い。Supabase ダッシュボード経由で手動作成された可能性が高い。本設計のドラフト前に**実際の `public.profiles` の column list を確認する必要がある** (実装時に `\d public.profiles` で確認、不足分は migration で ALTER)。

設計時の前提:
- `public.profiles` には `id (uuid PK = auth.users.id)`, `plan`, `subscription_status`, `trial_started_at`, `subscription_updated_at` が存在 (ai_usage_logs migration の ALTER から逆算)
- 他のフィールドは未確認。**本設計では "profiles を CREATE/REPLACE するつもりで列を全列挙する" 方針を取る** — 既存と一致しない場合は実装時に既存を尊重する形で migration を書き直す。

---

## Part 2: Cloud Sync アーキテクチャ設計

### 2-1. Supabase 側のテーブル設計

すべてのテーブルに共通する**同期メタデータ** (sync metadata):

```sql
-- 全 user-private テーブルに必須
user_id        uuid not null references auth.users(id) on delete cascade
updated_at     timestamptz not null default now()
deleted_at     timestamptz                              -- soft delete tombstone
client_version integer not null default 1               -- conflict resolution
```

**列名規約**: ローカルの snake_case と同名で揃える。例外的に `profile_id` / `user_id` は server 側では `user_id` に統一 (Supabase auth.users.id を直接参照)。

**id 規約**: ローカルの `TEXT` UUID をそのまま `uuid` 列として使う (submissionSync と同じパターン)。new local row の id は `expo-crypto.randomUUID()`、サーバ列も `uuid PRIMARY KEY`。`auth.users.id` とは独立。

#### テーブル別 schema 概要

| ローカル | Supabase 側テーブル名 | 主要列 (sync metadata 以外) |
|---|---|---|
| `profiles` | `public.profiles` | display_name, gender, birth_year, height_cm, current_weight_kg, target_weight_kg, target_body_fat_pct, goal_type, activity_level, training_days_per_week, target_date, equipment, target_calories, target_protein_g, target_fat_g, target_carb_g, onboarding_completed, adaptive_goal_enabled, adaptive_goal_sensitivity, adaptive_goal_last_shown_at, daily_water_target_ml, onboarding_version, plan, trial_started_at, plan_billing_cycle, plan_expires_at — **user_id (PK) = auth.users.id**。1ユーザー1行。 |
| `body_logs` | `public.user_body_logs` | date, weight_kg, body_fat_pct, muscle_mass_kg, note。`UNIQUE(user_id, date)` |
| `workout_sessions` | `public.user_workout_sessions` | routine_id (nullable), started_at, finished_at, duration_seconds, note, estimated_calories |
| `workout_sets` | `public.user_workout_sets` | session_id (FK), exercise_id, set_number, weight_kg, reps, rpe, rir, is_warmup, note, duration_minutes, distance_km, calories_burned, perceived_intensity |
| `workout_routines` | `public.user_workout_routines` | name, description, sort_order |
| `workout_routine_items` | `public.user_workout_routine_items` | routine_id (FK), exercise_id, target_sets, target_reps, sort_order |
| `meal_logs` | `public.user_meal_logs` | date, meal_type。`UNIQUE(user_id, date, meal_type)` (current schema は UNIQUE 制約なし — server 側で追加) |
| `meal_log_items` | `public.user_meal_log_items` | meal_log_id (FK), food_id (nullable text), food_name, serving_amount, serving_unit, calories, protein/fat/carb_g, fiber/sodium/...等の全栄養素 |
| `meal_templates` | `public.user_meal_templates` | name, meal_type, items (jsonb), use_count, description, last_used_at |
| `notes` | `public.user_notes` | date, category, content |
| `dishes` (is_my_dish=1) | `public.user_dishes` | name_ja, name_en, category, serving_description, total_*_g, is_my_dish (always true), last_used_at, user_note |
| `dish_ingredients` | `public.user_dish_ingredients` | dish_id (FK), food_name, amount_g, calories, P/F/C/...全栄養素, sort_order, food_id (nullable text) |
| `personal_records` | `public.user_personal_records` | exercise_id, record_type, value, weight_kg, reps, achieved_at, session_id (nullable) |
| `water_logs` | `public.user_water_logs` | amount_ml, logged_at |
| `adaptive_goal_suggestions` | `public.user_adaptive_goal_suggestions` | suggestion_json (jsonb), status |
| `weekly_reports` | `public.user_weekly_reports` | week_start, week_end, data_json (jsonb)。`UNIQUE(user_id, week_start)` |
| `progress_photos` | `public.user_progress_photos` | date, photo_path (Supabase Storage path), pose_type, note。**ローカルの `photo_uri` は Storage upload 後の Storage path に変換** |
| `exercises` (is_custom=1) | `public.user_custom_exercises` | name_ja, name_en, muscle_group, secondary_muscles, equipment, default_rest_seconds, exercise_type, met_value |
| `dishes` の canonical | (sync しない) | — |
| `foods` (is_user_added=1) | (本設計では sync 対象外) | 理由: 既存の user_submitted_foods が public_foods へ upload する別パスで担当。foods.is_user_added は OFF cache + barcode の保存等で、user_submitted の pre-sync stage 的な役割。重複 sync 回避。 |

**インデックス標準**: 全テーブルに `(user_id, updated_at DESC)` と `(user_id, deleted_at)` を貼る。pull の watermark クエリ用。子テーブル (workout_sets 等) は追加で `(user_id, parent_id)` も貼る。

**外部キー制約**: server 側では子テーブルの `parent_id` を実際の FK にする (例: `workout_sets.session_id REFERENCES user_workout_sessions(id)`) ON DELETE CASCADE。soft delete の場合 cascade は走らないので、論理削除の伝播は client 側のロジックで保証。

**updated_at trigger**: server 側で `BEFORE UPDATE` トリガを全テーブルに貼り、`NEW.updated_at = now()` を強制。client が古い updated_at を送っても server で必ず更新される — server が timestamp の権威。

### 2-2. RLS ポリシー設計

すべての user-private テーブルに以下の 4 ポリシーを適用 (`public.user_<resource>` で `<resource>` 部分を置換):

```sql
-- 読み取り: 自分の行のみ
create policy "users_read_own_<resource>" on public.user_<resource>
  for select using (auth.uid() = user_id);

-- 挿入: 自分の user_id でのみ insert 可能
create policy "users_insert_own_<resource>" on public.user_<resource>
  for insert with check (auth.uid() = user_id);

-- 更新: 自分の行のみ、user_id を書き換え不可
create policy "users_update_own_<resource>" on public.user_<resource>
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 削除: soft delete 推奨だが、物理削除も許可 (オプション)
create policy "users_delete_own_<resource>" on public.user_<resource>
  for delete using (auth.uid() = user_id);
```

**`profiles` だけ例外**: `id = auth.uid()` (user_id ではなく id 直結) の点だけ違う。

### 2-3. Sync アルゴリズム設計

#### Push (local → Supabase)

**戦略**: 既存の `sync_queue` テーブル (v1) を**実装する**。各 repository write 時に enqueue、background worker が drain。

**キュー構造** (現状 schema):
```
sync_queue: id, table_name, record_id, operation('INSERT'|'UPDATE'|'DELETE'), payload (JSON), created_at, synced_at, retry_count
```

**Enqueue タイミング**:
- repository の `INSERT INTO`/`UPDATE`/`DELETE FROM` 直後、同一 transaction で sync_queue に追加
- localOnly モードは enqueue しない (auth_store.isLocalOnly チェック、または supabase user が無い場合)

**Drain タイミング**:
- ログイン直後 (auth state change handler)
- アプリ foreground 復帰時
- 手動「今すぐ同期」
- 重要イベント後 (workout_session 終了、meal_log 保存等) — オプショナル
- バックグラウンド: app 起動中、5 分間隔の interval (オプショナル、UX 次第)

**Drain ロジック** (per resource):
1. `sync_queue` から `synced_at IS NULL` 行を `created_at ASC` で 50 件ずつ取得
2. table_name でグルーピング
3. **dependency order** (Part 2-5) に従って resource ごとに順次処理
4. 各行を resource-specific upload 関数に渡す
5. 成功 → `synced_at = now()` 更新、失敗 → `retry_count += 1`、N 回 (=5) 超えたら別テーブル (`sync_dead_letter`) に隔離して飛ばす

**個別 push 関数** (例: `pushBodyLog`):
1. payload (JSON) を parse
2. `auth.getSession().user.id` を `user_id` に設定
3. operation が DELETE なら `update().eq('id', recordId).update({ deleted_at: now() })` (soft delete)
4. INSERT/UPDATE は `upsert(payload, { onConflict: 'id' })`
5. 429 → backoff 再試行 (max 3)、その他のエラー → throw

#### Pull (Supabase → local)

**戦略**: per-resource 増分 pull。`sync_watermarks` (v20) を拡張して resource 名を増やす。

**Pull タイミング**:
- ログイン直後 (full pull from epoch — 機種変更フローで使用)
- アプリ foreground 復帰時 (incremental pull)
- 手動「今すぐ同期」
- バックグラウンド: 任意 (現状の submissionSync 同様、明示トリガーのみで OK)

**Watermark テーブル拡張**:
現状の `sync_watermarks` は `resource (PRIMARY KEY)` で1 行/resource。本設計でそのまま再利用。新しい resource 名:

```
'user_profiles'
'user_body_logs'
'user_workout_sessions'
'user_workout_sets'
'user_workout_routines'
'user_workout_routine_items'
'user_meal_logs'
'user_meal_log_items'
'user_meal_templates'
'user_notes'
'user_dishes'
'user_dish_ingredients'
'user_personal_records'
'user_water_logs'
'user_adaptive_goal_suggestions'
'user_weekly_reports'
'user_progress_photos'
'user_custom_exercises'
'public_foods_approved'  -- 既存
```

**Pull ロジック** (per resource、submissionSync を踏襲):
1. `getWatermark(resource)` → 既存 watermark or `'1970-01-01T00:00:00Z'`
2. `client.from(table).select('*').eq('user_id', userId).gt('updated_at', watermark).order('updated_at', { ascending: true }).limit(500)`
3. 各行を local repo の upsert 関数に渡す (camelCase 変換 + soft delete 行は local DELETE)
4. batch の最終行の `updated_at` を新 watermark として `setWatermark`
5. 500 件ヒットしたら次の batch も pull (paginate until `length < 500`)

**初回 pull (機種変更)** とは: watermark が無い (= epoch) ため、**全行を pull** する。多い場合は数千行になる可能性 — 進捗 UI が必要。

#### Sync sequence (orchestrator)

`syncAll(client, db)`:

1. `auth.getSession()` を確認、未認証 or local-only なら全 sync スキップ
2. **Push**: dependency order で sync_queue を drain
   - profiles → 親テーブル群並列 (body_logs, workout_routines, meal_logs, notes, dishes, custom exercises 等) → 子テーブル群 (workout_routine_items, workout_sessions, meal_log_items, dish_ingredients) → 孫 (workout_sets — sessions の後)
   - 並列化すると競合の可能性があるので、本設計では**直列**から始める (orchestrator のシンプル化)
3. **Pull**: 同じ dependency order で各 resource を pull
4. **Submissions**: 既存の `syncSubmissions(db, client)` を最後に呼ぶ
5. 結果を `SyncResult` として返す (uploaded, pulled, failed の集計)

### 2-4. 競合解決ルール

#### 基本: Last-Write-Wins (LWW) by `updated_at`

**Push 時**:
- Server の `updated_at` trigger で server time に書き換わる
- Client は自分の updated_at を送るが、server が無視する形
- 副作用: 同じ row を 2 デバイスから同時 push した場合、後着が勝つ (server timestamp で決定)

**Pull 時**:
- Local 行の updated_at < remote 行の updated_at なら remote で上書き
- 同じ場合は何もしない
- Local 行の方が新しい場合 (local edit が server に届いていない) → 何もしない (次回 push 時に local→remote で上書き、結局 remote が勝つ)

**つまり**: server が常に権威。client がオフライン中に作った変更は次回 push 時にしか合流しない。**オフライン中の同時編集は最後に push したクライアントが勝つ**。

#### 削除: Soft delete via `deleted_at`

- DELETE 操作は server 側では `deleted_at = now()` UPDATE
- Pull 時、`deleted_at IS NOT NULL` 行は local も実 DELETE
- Tombstone は server に永続 (実 DELETE しない、reconciliation 用)

**理由**:
- Hard DELETE だと「pull の watermark」と「削除」が共存できない (削除された行は SELECT で出てこないので、別 device でその削除を観測できない)
- Soft delete + tombstone なら通常の updated_at watermark で削除も伝播

**Pull 時の local DELETE 処理**:
```sql
DELETE FROM body_logs WHERE id = ?  -- ローカルでは hard delete で OK
```
local では tombstone を持たない (sync_queue に "DELETE" 操作が enqueue されたら、それが server へ送られて server tombstone を作る)

#### 子テーブルの削除伝播

- workout_session を soft delete (server 側) → server 側で `deleted_at` 設定 + workout_sets は **server 側 trigger でも子テーブルに deleted_at を伝播**するロジックが必要
- 代替案: server 側 trigger ではなく、client の repository が DELETE 時に `workout_sets` も同時に soft-delete-enqueue する
- **本設計の選択**: client 側で子テーブル削除を一緒に enqueue する (server trigger なし)。理由: server logic を最小化し、SQL trigger デバッグの負担を避ける。

#### 例外: `personal_records.session_id` (soft FK)

- session が削除されても PR は残る (歴代 PR は失われたくない)
- DELETE cascade ON workout_sessions では personal_records は触らない
- soft FK (実 FK 制約なし)

### 2-5. データ依存の処理順

Push 時 / Pull 時の resource 順序:

```
LEVEL 0 (root):
  user_profiles

LEVEL 1 (depend on profile only):
  user_body_logs
  user_workout_routines
  user_meal_logs
  user_notes
  user_meal_templates
  user_water_logs
  user_adaptive_goal_suggestions
  user_weekly_reports
  user_personal_records
  user_progress_photos
  user_custom_exercises
  user_dishes (is_my_dish=1)

LEVEL 2 (depend on level 1):
  user_workout_routine_items   (FK → user_workout_routines)
  user_workout_sessions         (FK → user_workout_routines, optional)
  user_meal_log_items           (FK → user_meal_logs)
  user_dish_ingredients         (FK → user_dishes)

LEVEL 3 (depend on level 2):
  user_workout_sets             (FK → user_workout_sessions)

INDEPENDENT:
  user_submitted_foods → public_foods (既存 submissionSync)
```

Push: level 順に直列。Pull: 同じ順で直列。これによって FK 制約違反は起きない (子 INSERT 時、親はすでに存在)。

---

## Part 3: 実装計画

### 3-1. 新規作成ファイル

#### Supabase migration (1 ファイル)

`supabase/migrations/{timestamp}_create_user_sync_tables.sql`:

- 18 つのテーブル CREATE (user-private 17 + profiles の ALTER/CREATE)
- 各テーブルに `user_id`, `updated_at`, `deleted_at` 列
- `BEFORE UPDATE` トリガで `updated_at` 自動更新 (関数 `set_updated_at()` を 1 つ作って全テーブルに `EXECUTE FUNCTION set_updated_at()`)
- 各テーブルに RLS 4 ポリシー
- 各テーブルに必要なインデックス
- FK 制約 (workout_sets → workout_sessions 等)

**estimated**: ~600 行の SQL。

#### Sync orchestrator (1 ファイル)

`src/infra/supabase/sync/syncOrchestrator.ts`:

- `pushAllPending(db, client)`: sync_queue を drain
- `pullAll(db, client, options?)`: per-resource pull (dependency order)
- `syncAll(db, client)`: push → pull → submissionSync
- `SyncProgress` 型 (UI 用に進捗 emit)

**estimated**: ~250 行。

#### Per-resource sync modules (17 ファイル)

`src/infra/supabase/sync/{resourceName}Sync.ts`:

各ファイルに 2 つの関数:
- `pushOne(client, db, queueRow)`: 単一 row を push
- `pullBatch(client, db, watermark)`: incremental pull

**resources**:
- profileSync, bodyLogSync, workoutRoutineSync, workoutRoutineItemSync, workoutSessionSync, workoutSetSync, mealLogSync, mealLogItemSync, mealTemplateSync, noteSync, dishSync, dishIngredientSync, personalRecordSync, waterLogSync, adaptiveGoalSync, weeklyReportSync, progressPhotoSync, customExerciseSync

**estimated**: 各 ~120 行 = ~2000 行。

#### Photos: Supabase Storage upload helper

`src/infra/supabase/storage/photoStorage.ts`:

- `uploadPhotoFromUri(uri, userId): Promise<string>` — local file → Storage path
- `downloadPhotoToLocal(path, localUri): Promise<void>` — Storage path → local file (機種変更時)
- bucket: `progress-photos`, RLS-protected by `user_id` prefix

**estimated**: ~100 行。

#### Sync queue helpers (拡張)

既存 `src/infra/repositories/syncRepository.ts` を本格実装する。
- `enqueue(table, recordId, op, payload)` (既存)
- `getPending(limit)` (既存)
- `markSynced(id)` (既存)
- `markFailed(id)` — `retry_count++`
- `moveToDeadLetter(id)` — N 回失敗で隔離
- `clearDeadLetter()` — UI から手動 reset

新規 migration v23 で `sync_dead_letter` テーブル追加 (sync_queue と同じ列、reason 列追加)。

**estimated**: 既存 ~30 行を ~150 行に拡張 + 新 migration v23 (~30 行)。

#### v23 migration

`src/infra/database/migrations/v23.ts`:

1. **全 user-private ローカルテーブルに `updated_at` 列を確認** (v1 で多くは既にある)、欠けている所に追加
2. **soft delete 用の `deleted_at` 列を全 user-private テーブルに追加** — 現状ほとんどのテーブルに無い
3. `sync_dead_letter` テーブル作成

**estimated**: ~80 行。

### 3-2. 変更が必要な既存ファイル

#### Repositories (write paths)

各 repository の **INSERT / UPDATE / DELETE 実行直後**に `enqueue(table, id, op, payload)` 呼び出しを追加。

| ファイル | 関数数 | 変更箇所 |
|---|---|---|
| `profileRepository.ts` | 4 | createProfile, updateProfile (各 enqueue) |
| `bodyLogRepository.ts` | 4 | upsertBodyLog (INSERT or UPDATE 両方 enqueue), deleteBodyLog |
| `workoutRepository.ts` | 25 | sessions / sets / routines / routine_items の create/update/delete 全箇所 ~12 箇所 |
| `nutritionRepository.ts` | 10 | meal_logs / meal_log_items の create/update/delete |
| `mealTemplateRepository.ts` | 8 | createTemplate, updateTemplate, deleteTemplate, incrementUseCount |
| `noteRepository.ts` | 4 | createNote, deleteNote |
| `dishRepository.ts` | 15 | dishes / dish_ingredients の write 箇所 (is_my_dish フィルタリング) |
| `personalRecordRepository.ts` | 6 | createPR (削除なし — PR は append-only) |
| `waterRepository.ts` | 5 | log/edit/delete |
| `adaptiveGoalRepository.ts` | 4 | createSuggestion, updateStatus |
| `progressPhotoRepository.ts` | 10 | createPhoto (Storage upload も!), deletePhoto |
| `foodRepository.ts` | 16 | **`is_user_added=1` の write のみ enqueue** (canonical foods は除外) |
| `weeklyReportRepository.ts` | (要確認) | createReport |

**enqueue 呼び出しの統一パターン**:
```ts
// 例: createBodyLog
const id = generateId();
await db.runAsync('INSERT INTO body_logs (...)', [...]);
await enqueueSync('body_logs', id, 'INSERT', { /* row payload */ });
```

**localOnly モードでは enqueue 不要**: `useAuthStore.getState().isLocalOnly` をチェックして false 時のみ enqueue。**または常時 enqueue して、push worker が認証済みのときのみ drain する** (こちらが堅牢 — local→cloud 移行時に既存 queue が流れる)。本設計では後者を採用。

#### Auth integration

| ファイル | 変更内容 |
|---|---|
| `src/infra/supabase/auth.ts` | `signInWithApple(idToken, nonce, name?)` 追加。`supabase.auth.signInWithIdToken({ provider: 'apple', token: idToken, nonce })` 呼び出し。 |
| `src/stores/authStore.ts` | `loginWithApple(idToken, nonce, name?)` 追加。成功時 `setAuthenticated(userId, email)` + プロフィール rehydrate or 初回作成判定 |
| `app/(auth)/login.tsx` | Apple Sign In ボタン (既存「または」divider 上下のレイアウト調整) |
| `app/(auth)/register.tsx` | 同上 + 新規ユーザー時の name 取得 |
| `app.config.ts` | `ios.usesAppleSignIn: true` 追加。expo-apple-authentication plugin (もしくは plugin 不要、`usesAppleSignIn` で entitlement 自動付与) |
| `package.json` | `expo-apple-authentication@~8.0.x` |

#### Local data → cloud user_id remap

ログイン後、ローカルの `profile.id` (random UUID) と auth.uid() が違う点をどう扱うか:

**選択肢 A: ローカルの profile_id を auth.uid() に書き換え**
- 全 child テーブルの profile_id 列を UPDATE
- 1回限りの操作、auth.uid() 確定後すぐ
- リスク: 失敗すると整合性壊れる

**選択肢 B: profile.supabase_uid (v1 既存列) に auth.uid() を保存**
- profile_id 列は触らず、push 時に supabase_uid = auth.uid() でマッピング
- 安全だが、すべての sync 関数が「local profile_id ≠ remote user_id」を意識する必要がある

**本設計の推奨**: **選択肢 A** — `claimLocalDataForUser(authUid)` という migration-like 関数を 1 回呼ぶ。トランザクション内で全テーブルの `profile_id` / `user_id` 列を一括 UPDATE。原子性が保証される。

```sql
-- claimLocalDataForUser('xxxx-xxxx')
BEGIN;
  UPDATE profiles SET id = ? WHERE supabase_uid IS NULL OR supabase_uid = '';
  UPDATE body_logs SET profile_id = ? WHERE profile_id = (...);
  UPDATE workout_sessions SET profile_id = ? WHERE profile_id = (...);
  -- ... 全テーブル
COMMIT;
```

**ただし**: profile.id が PRIMARY KEY なので、子テーブルの参照を全部書き換える前に親を変えると FK 違反が出る。順序: child first → parent last。

これは結構重い操作。**初回 Apple Sign In 時に1回だけ走らせる** (auth.users.id とローカル profile.id を同期させる) → 次回以降は両者一致しているのでスキップ。

### 3-3. UI 実装

#### 設定画面のデータ管理セクション

**新規画面**: `app/(tabs)/settings/data-management.tsx`

表示内容:
- 認証状態 (メール / Apple ID / ローカルのみ)
- リソースごとの最終 sync 時刻 (sync_watermarks から取得 — 集計表示)
- 同期状態バッジ: idle / syncing / error
- pending sync_queue 件数

ボタン:
- 「今すぐ同期」 → `syncAll(db, client)`
- 「データを復元」 → 確認後、watermarks を全 reset → 全 resource を epoch から pull
- 「ローカルのみモードからアップグレード」 → Apple Sign In へ

**追加**: `src/stores/syncStatusStore.ts` (Zustand) に `lastSyncAt`, `state ('idle'|'syncing'|'error')`, `pendingCount`, `currentResource`, `progressPercent`。

#### 機種変更フロー UX

**新規画面**: `app/(auth)/sync-progress.tsx`

ログイン成功後、「データなし」検出時に遷移:
- 進捗バー (resource ごとの完了状況)
- 「○件取得しました」テキスト更新
- 完了 → ホーム画面へ

**「データなし」検出**: `hasLocalUserData(db)` 関数 — `body_logs`, `meal_logs`, `workout_sessions` の COUNT > 0 の OR をチェック。

**Login screen での案内**: 「以前ご利用のメールアドレス (または Apple ID) でログインすると、データが復元されます」

#### Apple Sign In ボタン

`app/(auth)/login.tsx` 既存「または」divider 上に AppleAuthenticationButton を配置。`AppleAuthentication.isAvailableAsync()` で iOS 13+ 検知。

`app/(auth)/register.tsx` も同じパターン。

### 3-4. テストコード

**新規テストファイル** (RNTL は使えないので pure logic only):
- `src/infra/supabase/sync/__tests__/syncOrchestrator.test.ts` — モック client で push → pull → submissionSync の order 確認
- `src/infra/supabase/sync/__tests__/profileSync.test.ts` (各 resource ごとに同様)
- `src/infra/repositories/__tests__/syncRepository.test.ts` — enqueue / mark / dead letter
- `src/infra/database/migrations/__tests__/v23.test.ts` — schema 変更の確認

**modify**: 既存の repository test に sync_queue 確認の assertion を追加 (write 後 `synced_at IS NULL` の queue 行が存在することを確認)。

---

## Part 4: リスク分析

### 4-1. データ損失リスク

| リスク | 重大度 | mitigation |
|---|---|---|
| **Same-row 同時編集**: 2 デバイスで同じ profile を offline 編集 → 後着が前着を上書き | 中 | LWW で許容。プロフィール編集は頻度低、許容できる。レビュー UI は不要。 |
| **claimLocalDataForUser の途中失敗**: profile_id remap が部分的に走ってしまうと FK 整合性壊れる | 高 | SQLite トランザクション (`BEGIN ... COMMIT`) で囲む。失敗時は自動 ROLLBACK。retry 安全 (idempotent: 既に新 user_id のものは UPDATE で no-op)。 |
| **Push 失敗で local → server 不一致**: sync_queue の retry で吸収できないエラー (server 側 schema 不整合等) | 中 | dead_letter テーブルに退避 + UI で警告。手動で再 sync または skip 選択可能。 |
| **photos の Storage upload 失敗**: file は local にあるが server にない | 中 | metadata 行は sync 済み、Storage path は推測値で記録。後続 retry で再 upload。失敗継続なら photo は機種変更で失われる旨 UI で警告。 |
| **soft delete の race**: 2 デバイスで同じ row を delete 同時 + edit 同時 → server で誤って "edit" が deleted_at を上書きクリアしてしまう | 低 | `deleted_at IS NOT NULL` 行は server 側で update を拒否する RLS 追加。または「削除済み row は復元 API でしか戻せない」設計に。本設計では前者。 |
| **localOnly モードでの未 sync データ消失**: ユーザーが local-only で長期使用 → ログイン後の data claim 中にアプリ削除 | 中 | claim をログイン直後に走らせ完了通知まで block。ただしバックアップは取らない (リスク許容)。 |

### 4-2. 整合性リスク

| リスク | mitigation |
|---|---|
| **親 push 前に子 push** (e.g. workout_sets → workout_sessions の順序逆転) | dependency order 厳守。orchestrator が level 順に直列 drain。 |
| **soft delete された親の子レコード残留** | client が DELETE enqueue 時に子も同時 enqueue。server 側 ON DELETE CASCADE は実 DELETE で発火 — soft delete では発火しない。client logic でカバー。 |
| **schema drift**: 新 migration を local だけ走らせ server side 未対応 | 必ず両方 migration 揃えて push。CI で integration test を追加 (将来) |

### 4-3. capacity / cost リスク

**Supabase Free plan 制限**:
- DB: 500MB
- Storage: 1GB
- MAU: 50K
- Egress: 5GB/month

**典型的ユーザーの推定**:

| データ種別 | 1ヶ月の量 | 1行のサイズ | 月当たり |
|---|---|---|---|
| body_logs | 30 行 | ~150 byte | 4.5 KB |
| meal_logs | 90 行 (3食×30日) | ~80 byte | 7 KB |
| meal_log_items | 270 行 (3 items/meal × 30) | ~400 byte (extended nutrients) | 108 KB |
| workout_sessions | 12 行 (週3回想定) | ~200 byte | 2.4 KB |
| workout_sets | 240 行 (20 sets × 12 sessions) | ~150 byte | 36 KB |
| water_logs | 240 行 | ~80 byte | 19 KB |
| notes / templates / etc. | 適当 | ~200 byte | ~5 KB |
| progress_photos (DB) | 8 行 (週2回) | ~150 byte | 1.2 KB |
| progress_photos (Storage) | 8 ファイル | ~500 KB/ファイル | **4 MB** |

**月当たり**: テキスト系 ~180 KB, 写真 ~4 MB.
**1年**: テキスト ~2.2 MB, 写真 ~48 MB.

**500MB DB**: テキストのみなら ~227 ユーザー × 1年分。写真除外なら 1000 ユーザー超 OK。**現実的な天井は写真**.

**1GB Storage**: 1年 48MB × 約 21 ユーザーで使い切る。 **Free plan で 100 ユーザー以上抱えるなら photos は問題になる**。

**mitigation 候補**:
1. 写真は本設計から除外 (DB metadata のみ sync、file は local 保持) → 機種変更で写真は失われる
2. Pro plan ユーザーのみ写真 sync — 自然な monetization 角度
3. Free でも N 枚 limit + 古いものから削除
4. 移行時に Supabase Pro ($25/mo) へ — 8GB DB / 100GB Storage

**本設計の推奨**: **photos は metadata だけ sync、file 本体は local 保持 (機種変更で失われる旨を文書化)**。Pro plan で「写真もクラウド保存」を訴求。Phase 2 として後付けで実装可能。

### 4-4. 実装難易度のリスク

| 領域 | 難易度 | 理由 |
|---|---|---|
| Supabase migration (1 ファイル ~600 行) | 中 | 18 テーブル分の DDL 量はあるが、定型。一部 RLS の edge case (auth.uid() = id vs user_id) のみ注意。 |
| Sync orchestrator | 中 | dependency order, error handling, retry の組み合わせ。テストでカバーできる。 |
| Per-resource sync (~17 ファイル × ~120 行) | 中 | 量が多い。各 column マッピングを間違えると bug。slate 1 file をまず完成させて pattern 確立。 |
| Repository write hook 統合 (~50 箇所) | 中 | 漏れリスクが最大。`grep INSERT INTO`/`UPDATE`/`DELETE FROM` で機械的に網羅できるが、見落としは避けにくい。 |
| **claimLocalDataForUser** | **高** | profile_id の rewrite + child propagation + transaction handling。bug ったら data 損失。**最初に書く**、徹底テスト。 |
| **soft delete の repository 全箇所改修** | **高** | 現状 hard DELETE → soft delete に変える必要あり。多くのテーブルに deleted_at 列追加 + 全 SELECT に `WHERE deleted_at IS NULL` 追加。漏れがあると "削除したのに見える" バグ。 |
| Apple Sign In | 低 | expo-apple-authentication + supabase.auth.signInWithIdToken の標準パターン。1 ファイル新規 + 2 ファイル修正。 |
| Photo Storage upload | 中 | Supabase Storage API + RLS bucket policy + retry。実装はそこそこ重い。 |

### 4-5. ロールバック戦略

**問題が出た場合の段階的撤退**:

1. **Apple Sign In だけ動かす**: data sync を切って、Apple Sign In のログインだけ機能させる。データは local-only と同じ挙動。
2. **Sync を読み取り専用に**: pull だけ動かして push を停止 — local 変更は server に流れない、機種変更は不可だが既存データは壊れない。
3. **Migration ロールバック**: v23 ROLLBACK は実装しない (migration はforward-only)。テスト環境でだけ DB delete → 再 migrate を許容。
4. **Server-side rollback**: Supabase migration は revert SQL ファイルを書く。`drop table if exists user_*` で全削除可。

### 4-6. テスト戦略

**ユニットテスト**:
- 各 sync 関数 (push, pull) を Supabase fake で覆う
- conflict resolution の LWW 動作確認
- soft delete の伝播
- claimLocalDataForUser のトランザクション原子性

**Integration テスト** (将来、現状は RNTL なし):
- ログイン → claim → push → 別端末ログイン → pull → データ一致

**Manual verification** (実機):
- 2 デバイス同時編集での挙動
- オフライン → オンライン復帰時の queue drain
- 機種変更フローの全体確認
- Free plan capacity を意図的に超えた場合のエラーハンドリング

---

## Part 5: 実装順序の推奨

「全部一気にやる」前提でも、コード書く順番が重要。**順序を間違えると後段で詰む**。

### Step 1: Supabase migration 完成 (DB 構造を最初に固める)

理由: server 側 schema が固まらないと client 側 sync が書けない。RLS / FK / trigger をまず作る。

**作業**:
- `supabase/migrations/{timestamp}_create_user_sync_tables.sql` を完成させる
- 既存 `public.profiles` の現状確認 (ALTER で追加列を補う)
- ローカル開発の Supabase で migration 適用 → schema 確認

**完了基準**: migration ファイルが Supabase に問題なく apply できる。`\d public.user_*` で全テーブルが見える。RLS が有効。

### Step 2: v23 ローカル migration

理由: ローカル側に `deleted_at` 列を入れないと soft delete が書けない。`updated_at` の triggerless 補完も必要。

**作業**:
- `src/infra/database/migrations/v23.ts` で全 user-private テーブルに `deleted_at` 列追加
- `connection.ts` に v23 hook
- `sync_dead_letter` テーブル

**完了基準**: 既存 jest が通る (schema 変更で破損していないこと)。

### Step 3: Sync infra (orchestrator + sync_queue 強化)

理由: per-resource sync を書く前に、共通 plumbing を確立する。

**作業**:
- `syncRepository.ts` 強化 (enqueue, mark synced/failed, dead letter)
- `syncOrchestrator.ts` の skeleton (push/pull 関数のシグネチャだけ)
- `syncStatusStore.ts` (Zustand)
- `sync_watermarks` 拡張 (new resource keys)

**完了基準**: orchestrator のテスト (モック sync 関数) が通る。

### Step 4: claimLocalDataForUser

理由: ローカル profile_id を auth.uid() に統一する。**ログイン後の最初の操作になる、ここで失敗すると後段全部詰まる**。

**作業**:
- `src/infra/database/dataReconciliation.ts` (新規)
- transaction 内で全 user-private テーブルの profile_id / user_id を新 uid に書き換え
- 詳細テスト (空 DB, partial data, repeated call の idempotency)

**完了基準**: テストで「同じ uid で 2 回呼んでも no-op」「途中失敗で ROLLBACK」「全テーブルが 1 トランザクションで更新」を確認。

### Step 5: Per-resource sync — profile から始める

理由: 最小 dependency。profile が動けば pattern 確立、他は同じパターンの繰り返し。

**作業**:
- `profileSync.ts` (push + pull)
- 親なし、column マッピング簡単
- テストで 1 行 push → server に存在 → pull で local 復元 を確認

**完了基準**: profile が end-to-end で sync できる。pattern を後段の resource に展開する template になる。

### Step 6: Per-resource sync — leaf ノードから順次

理由: dependency order の逆 (子から親) ではなく、**dependency 少ない順** に書く。

順序:
1. profile (Step 5 完了)
2. body_logs, notes, water_logs, weekly_reports, adaptive_goal_suggestions, personal_records, custom_exercises (level 1)
3. meal_templates, dishes (level 1、独立した親)
4. workout_routines, meal_logs (level 1)
5. workout_routine_items, workout_sessions, meal_log_items, dish_ingredients (level 2)
6. workout_sets (level 3)
7. progress_photos (Storage 必要、別物)

**完了基準**: 各 resource ごとに push/pull テストが通る。

### Step 7: Repository write hooks 統合

理由: sync 関数が揃ってから repo に hook を入れる。逆だと hook ありの repo が壊れた sync を呼ぶ。

**作業**:
- 全 repo の write 箇所に `enqueueSync(table, id, op, payload)` 追加
- localOnly モード以外 (or 常時) で enqueue する design 確認
- 既存テストが通ることを確認

**完了基準**: write 操作後 `sync_queue` 行が存在する。jest 全パス。

### Step 8: Pull on login + claim flow

理由: server 側に行が無くても push は安全。pull は server 側 data の存在前提なので Step 7 完了 (push が動く) 後に。

**作業**:
- auth state change handler でログイン後 `claimLocalDataForUser(authUid)` → `pullAll(...)` を呼ぶ
- 「データなし」検出時に sync-progress.tsx に navigation
- 進捗 UI は Step 9 で完成

**完了基準**: 別端末で push したデータが新端末でログイン後に pull で復元できる。

### Step 9: UI

- データ管理画面
- 機種変更進捗画面
- syncStatusStore の wiring

### Step 10: Apple Sign In

**理由**: 独立した機能。Step 1-9 と並行作業可能だが、最後にすると他の流れが先に固まる。データ sync が動かないまま Apple Sign In だけ動いても無意味なので、優先度は最後でいい。

ただし**実装規模が小さいので前倒しも可**。Step 5 (profile sync) と同時に着手して、Apple ボタンが押せるようになる + profile が sync できる、というマイルストーンを作ってもよい。

### Step 11: 統合テスト + 実機検証

- 5/15+ build (build 14) で実機検証
- 2 デバイステスト
- 機種変更シミュレーション
- Free plan の容量天井に意図的にぶつける (写真除く)

---

## Part 6: 実装の見積もり

### ファイル数

| 種別 | 新規 | 変更 | 合計 |
|---|---|---|---|
| Supabase migration | 1 | 0 | 1 |
| Local migration | 1 (v23) | 0 | 1 |
| Sync core | 2 (orchestrator, syncRepository 強化、storage helper) | 0 | 2-3 |
| Per-resource sync | 17 | 0 | 17 |
| Repositories (hook 追加) | 0 | 12-14 | 12-14 |
| Auth | 1 (sync/claimLocalData) | 4 (auth.ts, authStore, login, register) | 5 |
| Stores | 1 (syncStatusStore) | 1 (authStore) | 2 |
| UI | 2 (data-management, sync-progress) | 1 (settings/index) | 3 |
| Tests | 8-12 | 5-8 | 13-20 |
| **合計** | **~31-35** | **~22-26** | **~55-60** |

### 行数

| 種別 | 推定行数 |
|---|---|
| Supabase migration | 600 |
| Local v23 + dead_letter | 120 |
| Sync orchestrator + storage | 350 |
| Per-resource sync (17 × 120) | 2,040 |
| syncRepository 強化 | 150 |
| Repository hooks (50箇所 × ~3 行) | 150 |
| Auth integration | 200 |
| claimLocalDataForUser | 200 |
| Sync stores | 80 |
| UI screens | 700 |
| Tests | 1,500 |
| **合計** | **~6,000 行** |

### テストケース

| 領域 | ケース数 |
|---|---|
| Sync orchestrator | 15 (push order, pull order, error handling, partial failure) |
| Per-resource sync (17 × 4) | 68 (push success, pull success, conflict, soft delete) |
| syncRepository | 12 (enqueue, drain, retry, dead letter) |
| claimLocalDataForUser | 10 (atomicity, idempotency, edge cases) |
| Photo Storage | 8 (upload, download, missing file, retry) |
| Auth (Apple Sign In) | 6 |
| **合計** | **~120 ケース** |

### 実装時間 (ソロ作業前提)

| シナリオ | 時間 |
|---|---|
| **楽観的** (順調、デバッグ少ない) | 40 時間 |
| **現実的** (Step 4 の data reconciliation で 1 日詰まる、何度か Supabase 設定で迷う) | 70 時間 |
| **悲観的** (LWW conflict で 2 device テストが繰り返し失敗、Storage の RLS で詰まる、photos を含めて完全実装) | 110 時間 |

**現実的な分割**:
- 1 セッションで Step 1-3 (sync infra) — 6-10 時間
- 1 セッションで Step 4-5 (claim + profile) — 6-10 時間
- 2-3 セッションで Step 6 (全 resource sync) — 各 6-10 時間 = 18-30 時間
- 1 セッションで Step 7 (repo hooks) — 4-8 時間
- 1 セッションで Step 8-9 (pull on login + UI) — 8-12 時間
- 1 セッションで Step 10 (Apple Sign In) — 4-6 時間
- 検証 + バグ修正 — 10-20 時間

合計セッション数: **7-9 セッション**。

---

## まとめ — 設計上の判断と妥協点

### 妥協していない領域

- 全 user-private テーブル (17 個) を一気に sync 対応
- Soft delete を全テーブルに導入
- LWW conflict resolution + tombstone 伝播
- 親子テーブルの dependency order 保証
- Apple Sign In 完全対応

### 妥協を提案する領域 (Phase 2 以降に分割推奨)

- **Photos の Storage upload**: Free plan で容量問題、Pro plan の monetization 角度に活用するなら本 build から除外。本設計では「DB metadata のみ sync、file は local」を strawman として記述。
- **2 デバイス同時編集の合理的 UX**: LWW で許容、merge UI は作らない。プロフィール / ルーティンの編集頻度が低いことに依存した割り切り。
- **server-side trigger による cascade soft delete**: client 側で子も enqueue する形で代用。server logic を最小化する選択。

### 「これは無理」と感じる領域 (現状なし)

設計の範囲では「実装不可」と判断する箇所はない。すべての要件は時間 (実装工数) を投資すれば達成可能。

### 最大のリスクの再強調

1. **claimLocalDataForUser** の正しさが全体を支える。最初に書いて徹底テスト。
2. **Soft delete 移行** は repository 全体改修になる。漏れがあると "削除したのに復活" のような微妙なバグ。
3. **Free plan capacity** は photos を含めると 100 ユーザー前後で天井。Pro plan 移行 or photos 除外の意思決定が必要。

### 不確定要素 (実装前に確認必要)

- **`public.profiles` の現状 schema** — Supabase ダッシュボードで `\d public.profiles` を実行、列構造を確認。本設計の前提と合わない場合は migration 書き直し。
- **expo-apple-authentication の正確な version** — Expo SDK 54 互換は `~8.0.x` 想定だが、実際の peerDependency 確認。
- **Apple "Hide my email" のリレーアドレス処理** — Supabase Auth が同一 user として扱う動作の確認 (前提情報通りなら追加実装不要)。

---

## 次のアクション

1. このドキュメントをレビュー
2. 不確定要素 (`public.profiles` schema 等) を確認
3. 妥協ポイント (photos 等) の意思決定
4. 実装の許可が下りたら Step 1 (Supabase migration) から着手

実装は別セッションで、本ドキュメントを基準にする。
