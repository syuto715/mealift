# Build 15 Design Document

**Status**: pre-implementation design (no code)
**Authored**: 2026-05-06
**Covers**: 5 features bundled into build 15
**Sibling**: `docs/cloud-sync-design.md` (cd1a6d8) — pattern reference

---

## Part 1 — Overview

Build 14 (v1.1.0) ships the cloud-sync layer + bug fixes; review in
progress at the App Store. Build 15 bundles five separate
work-streams, of mixed risk and scope:

| # | Feature | Risk | Scope |
|---|---|---|---|
| 1 | Auto-approval on `public_foods` via Postgres trigger | **Low** | Single SQL migration + 1 jest update |
| 2 | Barcode scanner free for all plans | **Trivial** | 1-line constant flip + 1 test update |
| 3 | Push notifications on submission events | **High** | New plumbing (push tokens, Edge Function, profile column, opt-in UI) |
| 4 | Submission discoverability UI | **Low** | UI-only, additive |
| 5 | Gym-equipment registration + AI menu generation | **High** | Cloud-Sync-class scope: new tables, Edge Function, AI cost, UI |

Total recon-derived effort: comparable in size to Phase 0–4 of the
cloud-sync build (i.e. 4–7 sessions, depending on how aggressive we
are with feature 5). Hard-stops should land at the same boundaries
as before — see Part 9.

### 1.1 Cross-feature dependencies

```
2 ─────────┐                        (independent — barcode unlock)
1 ─────────┤
4 ─────────┤
3 ──── 1 ──┘   (3 needs the trigger from 1 to know "approval happened")
5 ────── (independent)
```

- **Feature 3 depends on Feature 1**: the natural trigger source for
  "your submission was approved" is the trigger from Feature 1; without
  it, the only event we could fire on is a manual review (which Syuto
  isn't doing yet) or the row INSERT itself (which would notify before
  approval, defeating the point).
- Everything else is independent. 2 / 4 can land first as warmup;
  1 must precede 3; 5 can run in parallel any time.

### 1.2 Recommended implementation order

1. **Feature 2** (~30 min) — trivial, builds confidence.
2. **Feature 4** (~2 hr) — UI-only, additive, no risk.
3. **Feature 1** (~3 hr including jest + manual SQL apply) — unlocks 3.
4. **Feature 3** (~2 sessions) — biggest plumbing change of the build.
5. **Feature 5** (~3 sessions) — last because of AI cost and breadth.

Total: 7–9 sessions. See Part 10 for time estimates.

### 1.3 Source of truth assumptions

- Cloud-sync layer (Phases 0–8) is landed and operating; all 18
  user-private tables sync correctly. Build 15 builds on top of this
  rather than touching it.
- audit scripts (`scripts/check-soft-delete-filter.ts`,
  `scripts/check-enqueue-sync.ts`) PASS at the start of each commit.
  Every build-15 commit must keep them PASS.
- `__DEV__` opens every gate in `subscriptionService.getFeatureFlags`.
  Production behaviour requires the actual `currentTier` plus the
  `FEATURE_MATRIX` derivation.
- jest baseline: 660 tests passing.

---

## Part 2 — Feature 1: Auto-approval on `public_foods`

### 2.1 Current state

Approval routing is **half-implemented**:

- `src/domain/submission/approvalScore.ts` produces a 0–100 normalized
  score with explicit `AUTO_APPROVAL_SCORE_THRESHOLD = 70` and
  `MANUAL_REVIEW_THRESHOLD = 50` constants. Pure logic, fully tested.
- `src/infra/supabase/submissionSync.ts:230-289`
  (`uploadPendingSubmissions`) computes the score on upload and sends
  it as `approval_score` on the `public_foods` row.
- The row is uploaded with **`status: 'pending_review'` always**
  (line 137). The client never sets `'approved'`; the design comment
  at line 45-48 explicitly says "auto-approval routing (score → status)
  is done by an admin/trigger on the server, not here."
- The server-side trigger does not exist yet. As a result every
  submission today sits at `pending_review` indefinitely until manual
  intervention.

The Phase-0–8 cloud-sync layer does **not** sync `public_foods` — it
syncs `user_submitted_foods` (the local copy of pending/synced
submissions) but the server's `public_foods` is its own RLS-gated
table. The `pullApprovedSubmissions` function fetches `status='approved'`
rows back into the local `foods` table.

### 2.2 Design — single Postgres BEFORE INSERT trigger

**Migration**: `supabase/migrations/<timestamp>_auto_approve_public_foods.sql`

```sql
-- Auto-approval routing for user-submitted foods. Reads the
-- approval_score the client sent and rewrites status BEFORE INSERT
-- so RLS sees the final state (the "authenticated_can_submit"
-- policy only checks submitted_by, not status).
--
-- Score thresholds mirror src/domain/submission/approvalScore.ts:
--   total >= 70  → 'approved'        (auto-passed)
--   total >= 50  → 'pending_review'  (default, awaits manual review)
--   total <  50  → 'rejected'        (auto-failed; submitter sees
--                                     the row in their own list and
--                                     can re-submit a corrected version)
--
-- reviewed_by is NULL for auto-decisions; the application layer treats
-- "status != pending_review AND reviewed_by IS NULL" as "system auto".
-- reviewed_at is set to now() so the submitter UI can render
-- "approved at <date>" without a separate column.

create or replace function public.auto_route_public_food()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only run on initial INSERT. UPDATE flows go through the
  -- "own_pending_submissions_updatable" RLS policy and we don't want
  -- to re-route on every edit.
  if tg_op <> 'INSERT' then
    return new;
  end if;

  if new.approval_score >= 70 then
    new.status := 'approved';
    new.reviewed_at := now();
  elsif new.approval_score >= 50 then
    new.status := 'pending_review';
  else
    new.status := 'rejected';
    new.reviewed_at := now();
    new.rejection_reason := coalesce(
      new.rejection_reason,
      'auto-rejected: approval_score below threshold'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_auto_route_public_food on public.public_foods;
create trigger trg_auto_route_public_food
  before insert on public.public_foods
  for each row execute function public.auto_route_public_food();
```

### 2.3 RLS interaction

The existing `authenticated_can_submit` policy (`with check (auth.uid()
= submitted_by)`) does not check `status`, so the trigger overwriting
status before the row hits storage is RLS-safe.

The existing `own_pending_submissions_updatable` policy lets a submitter
edit their own pending row. After the trigger flips a high-scoring
submission to `'approved'`, that policy stops applying — submitter
can no longer edit. This is the desired behaviour.

### 2.4 Threshold sanity check

Replaying historical scores from `submissionValidator.test.ts` /
`approvalScore.test.ts`:

| Submitter profile | Expected route |
|---|---|
| Veteran (10 approved / 0 rejected), email-verified, image, PFC tight, no barcode | total ≈ 88 → **approved** |
| New user, image, PFC tight, no barcode, no similarity | total ≈ 52 → **pending_review** |
| New user, no image, PFC loose, no other signals | total ≈ 28 → **rejected** |

The 70/50 thresholds give a healthy bias toward manual review for
ambiguous cases without flooding the moderator queue with obviously-bad
rows. Tunable in production via re-running the migration with new
constants.

### 2.5 Migration of existing rows

Currently zero approved rows exist (all stuck at `pending_review`).
Two options:

- **Option A (recommended)**: Leave existing rows alone. The trigger
  only fires on INSERT, so old rows stay `pending_review` until Syuto
  reviews them manually. New submissions get auto-routed.
- **Option B**: One-time backfill SQL `UPDATE public.public_foods
  SET status = case ... end WHERE status = 'pending_review'` after the
  trigger lands. Risky if any of the existing rows are bad data.

**Recommend A** unless Syuto explicitly wants the back-routing — the
volume of existing pending rows is low enough to handle by hand.

### 2.6 Test coverage

Per memory `project_test_infra.md`, jest pure-logic tests are the
project's current ceiling. The trigger lives in SQL, so jest can't
exercise it directly. Coverage strategy:

- Existing `approvalScore.test.ts` already pins down the score boundary
  cases. No new jest cases needed for the routing logic.
- Manual SQL test (post-apply, before code commit): insert a row with
  `approval_score = 80` and verify `status = 'approved'`; one with
  `approval_score = 60` → `pending_review`; one with `approval_score = 20`
  → `rejected`. Document the verification commands in the commit
  message.

### 2.7 Files

- `supabase/migrations/<timestamp>_auto_approve_public_foods.sql` (new)
- No client changes required.

### 2.8 Risks

- **The trigger fires on every INSERT** including those from the
  Service Role (when Syuto manually inserts via SQL). If Syuto wants
  to insert a pre-approved row, they need to bypass the trigger
  (`set session_replication_role = replica;`) or set the score high.
  Document in the migration's header comment.
- `approval_score` is supplied by the client, so a malicious user
  could in theory send `approval_score: 100` and bypass review.
  Mitigation: out-of-scope for build 15; future hardening would
  recompute the score server-side in the trigger using a SQL port
  of `approvalScore.ts`. For build 15 we accept the trust model
  (matches the current pattern of trusting client-supplied
  `pending_review`).

---

## Part 3 — Feature 2: Barcode scanner free for all plans

### 3.1 Current state

`src/infra/services/subscriptionService.ts:38-41`:
```ts
free: {
  maxRoutines: 3,
  barcodeScanner: false,    // ← gates barcode behind Plus
  ...
```

Call site that respects the gate: `app/(tabs)/nutrition/add.tsx:884`
(`{canUse('barcodeScanner') && (<TouchableOpacity ...>...`).

The `FEATURE_MATRIX` is **derived** from `PLAN_FEATURES` via
`minimumTierFor`, so flipping the constant automatically updates
the matrix.

### 3.2 Change

Three small edits:

1. **`subscriptionService.ts:41`** — `barcodeScanner: false` →
   `barcodeScanner: true`. One character.

2. **`subscriptionService.test.ts`** — any test asserting that the
   free plan does NOT have barcode access needs a flip.

3. **Pricing/upgrade screens** — search for any UI text that lists
   "barcode" as a Plus benefit and remove it. Likely candidates:
   `app/(tabs)/settings/subscription.tsx` and any constants in
   `src/constants/pricing.ts`.

### 3.3 No related-feature impact

Barcode scanner is independent from:

- **OCR** (`submission-ocr-scan.tsx`) — uses
  `@react-native-ml-kit/text-recognition` separately, has its own
  gating (none currently). Not touched.
- **AI nutrition estimate** (`aiNutritionEstimate` flag) — separate
  feature, separate Edge Function. Not touched.
- **Submission barcode scanner** (`submission-barcode-scan.tsx`) —
  different from the meal-log barcode scanner; already not gated by
  the `barcodeScanner` flag (it's part of the submission flow, free
  for all submitters).

### 3.4 User-facing messaging

User says **課金者ゼロ**, so there's no migration story to write —
nobody is being downgraded into a worse experience, only upgraded.
Messaging is optional:

- **Option A (recommended)**: silent flip. The barcode button starts
  appearing on the meal-log "add food" screen for free users. No
  explicit "now free!" announcement needed.
- **Option B**: a one-time toast / banner on first app open of build
  15: "バーコード読み取りが全プランで使えるようになりました". Adds
  scope (state for "have we shown the toast", AsyncStorage key, copy).
  Not worth it given zero paying users.

**Recommend A**.

### 3.5 Files

- `src/infra/services/subscriptionService.ts` (1-line edit)
- `src/infra/services/__tests__/subscriptionService.test.ts` (test update)
- Possibly `app/(tabs)/settings/subscription.tsx` and `src/constants/pricing.ts` (text edits)

### 3.6 Risks

- None at this code scope. Free tier becomes more capable; paid tiers
  retain everything.
- One subtle pitfall: `FREE_LIMITS.maxFavorites = 10` etc. still
  applies. We're only flipping `barcodeScanner`, not all of free's
  restrictions. Verify the test snapshot doesn't capture more than
  intended.

---

## Part 4 — Feature 3: Push notifications on submission events

### 4.1 Current state — what exists

- `expo-notifications@~0.32.16` is installed (package.json:35) and
  used for **local scheduled notifications only**:
  `src/infra/services/notificationService.ts` schedules weight /
  meal / training / weekly-report reminders via
  `Notifications.scheduleNotificationAsync` with `weekly`/`daily`
  triggers. Pure on-device scheduling — no remote push.
- Settings UI for opting into reminders:
  `app/(tabs)/settings/notifications.tsx`.
- No code anywhere calls `getDevicePushToken()`,
  `getExpoPushToken()`, or stores a push token. Searched
  exhaustively (`grep -rn` returned zero hits).
- No `profiles.expo_push_token` column. No `push_tokens` table.
- No Edge Function calls Expo's push API.

### 4.2 Current state — what's required to send a remote push

Expo's push system needs:

1. **EAS push credentials**: APNs key (iOS) and FCM Server Key
   (Android), uploaded to Expo. Per `project_mealift_release.md`,
   the project uses EAS. APNs cert may need to be re-issued or
   confirmed.
2. **Device push token**: each device calls
   `Notifications.getExpoPushTokenAsync({ projectId })` after
   permission grant; receives an `ExpoPushToken[xxxx]` string.
3. **Server-side storage** of tokens: profile column or dedicated
   table.
4. **Server-side send**: HTTP POST to `https://exp.host/--/api/v2/push/send`
   with the token + title + body. From an Edge Function, this is a
   straight `fetch`. No SDK needed.

### 4.3 Design

#### 4.3.1 Token storage

**Recommend**: new dedicated table `public.push_tokens`. Reasons:

- A user can have multiple devices (iPhone + iPad). A single column
  on `profiles` can't hold multiple. JSON-array on `profiles` is
  awkward to maintain (no per-device timestamps, no per-device
  invalidation).
- Token rotation: Expo can rotate tokens; we want to track
  `created_at` / `last_seen_at` per device for cleanup.

```sql
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  device_id text,             -- optional, helps dedupe across reinstalls
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

create index on push_tokens (user_id);
alter table public.push_tokens enable row level security;
create policy "own_tokens_readable" on public.push_tokens for select
  using (auth.uid() = user_id);
create policy "own_tokens_writable" on public.push_tokens for insert
  with check (auth.uid() = user_id);
create policy "own_tokens_updatable" on public.push_tokens for update
  using (auth.uid() = user_id);
create policy "own_tokens_deletable" on public.push_tokens for delete
  using (auth.uid() = user_id);
```

Client-side: register on every successful login (and on permission
grant) via a new helper, e.g. `registerPushTokenForUser(userId)`.
Wire into `loginSyncBootstrap.runLoginSync` after the claim succeeds —
that's the natural seam where we know we have an authenticated user
and a hydrated DB.

#### 4.3.2 Trigger sources

Two notification types are in scope:

| Event | Trigger | Title (JP) | Body (JP) |
|---|---|---|---|
| Submission auto-approved | `public_foods` UPDATE OR the same trigger as Feature 1 sees `status='approved'` | 投稿が承認されました | 「{name_ja}」が承認され、みんなのデータベースに追加されました |
| Submission used by someone else | `public_foods.use_count` crosses thresholds (1, 10, 100) | 投稿が使われました | 「{name_ja}」が他のユーザーに使われました ({count} 回目) |

For the "used" trigger, we currently have a problem: **`public_foods.use_count`
isn't being updated server-side**. When a user logs a meal containing
a public food, only their local `foods.use_count` increments
(`incrementUseCount` in `foodRepository.ts:187`). The server's row
stays at zero forever.

This means feature 3 has a hidden prerequisite: **server-side
use_count update**. Either:

- (a) Client RPC: when a meal is logged, additionally call a Supabase
  RPC `increment_public_food_use_count(food_id)` that runs as the
  authenticated user under a SECURITY DEFINER function.
- (b) Server-side counter inferred from `meal_log_items` sync: when
  a `user_meal_log_items` row syncs up (Phase 5-C), check if its
  `food_id` matches a `public_foods.id` and increment. Pure server
  logic via trigger on `user_meal_log_items` insert.

**Recommend (a)** for build 15. Cleaner, doesn't touch the cloud-sync
plumbing, easy to throttle (one RPC per meal-log save), and the RPC
can return the new count so the client-side trigger detects threshold
crossings without a query.

Once the count is being maintained, the notification trigger for
"used" can be a Postgres AFTER UPDATE trigger that watches for
`use_count` crossing 1, 10, 100, etc. and inserts into a
`notification_outbox` table:

```sql
create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('submission_approved', 'submission_used')),
  title text not null,
  body text not null,
  payload jsonb,
  sent_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index on notification_outbox (sent_at) where sent_at is null;
```

#### 4.3.3 Sender — Edge Function `send-push-notifications`

A new Edge Function at `supabase/functions/send-push-notifications/`:

- Reads `notification_outbox WHERE sent_at IS NULL` (limit ~50)
- For each row, looks up active tokens via `push_tokens`
- POSTs to Expo's send endpoint
- Marks rows as sent or increments attempt_count
- Cleans up unrecoverable tokens (DeviceNotRegistered) by deleting them

Trigger options:

- **Cron** via Supabase scheduled invocation (`pg_cron` extension or
  Supabase's own cron, every 1 minute).
- **Direct invocation** from a Postgres trigger via the
  `pg_net` / `net.http_post` extension. Lower latency but adds a
  dependency.

**Recommend cron at 1-minute intervals**. 1-minute notification
latency is acceptable for "your submission was approved" (the user
isn't watching the row in real time). Reduces complexity vs. inline
HTTP from a trigger.

#### 4.3.4 Client-side: registration + opt-in UI

- New helper `src/infra/services/pushTokenService.ts` with
  `registerExpoPushToken(userId, supabase)` that:
  - Calls `Notifications.requestPermissionsAsync()` (idempotent)
  - On grant: `Notifications.getExpoPushTokenAsync({ projectId })`
  - Upserts into `push_tokens` via the authenticated client
  - Stores last-attempted timestamp in AsyncStorage so we don't spam
    the API
- Wire into `loginSyncBootstrap.runLoginSync` after a successful claim,
  before `syncAll`. Failure is non-fatal — the user can still sync;
  they just won't get push notifications.
- Settings screen `notifications.tsx`: add a new section "投稿関連"
  with a toggle "投稿が承認・使用されたときに通知" that controls a new
  field in `NotificationSettings`. Respect this client-side by
  deleting the row from `push_tokens` (instead of just hiding the
  notification on receive) so the server stops trying.

#### 4.3.5 EAS / native config

- `app.config.ts` already has `usesAppleSignIn: true` (Phase 3-A).
  May need to add `expo-notifications` plugin config:
  ```js
  plugins: [
    ...,
    ['expo-notifications', { icon: './assets/notification-icon.png', color: '#...' }],
  ]
  ```
- APNs key: Syuto must confirm one is uploaded to Expo. EAS handles
  the rest.
- iOS Info.plist needs `UIBackgroundModes: ['remote-notification']`
  for silent background pushes — but for our use case (visible
  notifications only) this is not strictly required.

### 4.4 Files

| Path | Status | Notes |
|---|---|---|
| `supabase/migrations/<ts>_push_tokens.sql` | new | tables + RLS |
| `supabase/migrations/<ts>_notification_outbox.sql` | new | outbox + AFTER UPDATE trigger |
| `supabase/migrations/<ts>_increment_public_food_use_count.sql` | new | RPC for use_count update |
| `supabase/functions/send-push-notifications/index.ts` | new | cron-driven sender |
| `src/infra/services/pushTokenService.ts` | new | client-side registration |
| `src/infra/sync/loginSyncBootstrap.ts` | edit | call register after claim |
| `src/infra/services/notificationService.ts` | edit | new opt-in field + handler |
| `app/(tabs)/settings/notifications.tsx` | edit | new toggle |
| `app.config.ts` | edit | plugin config |
| `src/infra/repositories/nutritionRepository.ts` | edit | call increment RPC on meal-log insert |
| `eas.json` | edit (maybe) | push credentials hook |

Estimated 11 files touched, ~600–800 lines.

### 4.5 Risks

- **APNs cert**: if not already uploaded to Expo / in EAS, blocks the
  feature. Verify before starting.
- **`pg_cron` availability**: requires Supabase plan that includes
  scheduled functions. If unavailable, fall back to client-driven
  drain (less reliable).
- **Notification fatigue**: "submission used" thresholds should be
  conservative (1, 10, 100, 1000). Don't notify on every single use.
- **Out-of-order events**: if approval and use both fire before the
  cron runs, the user gets two notifications back-to-back. Acceptable.
- **Privacy**: notification body says "あなたの投稿『カレー』が使
  われました" — that's fine because the submitter is the recipient.
  Do NOT include any other user's identity.
- **Quota**: Expo's free push tier is generous (millions/month) but
  not unlimited. Document the cap in the Edge Function.

### 4.6 Out of scope for build 15

- In-app notification center (showing past notifications with mark-as-
  read)
- Rich notifications with images
- Action buttons on the notification
- Localization (non-Japanese)

---

## Part 5 — Feature 4: Submission discoverability UI

### 5.1 Current state

- **Search-then-submit CTA already exists**:
  `app/(tabs)/nutrition/search.tsx:248-293` shows a prominent CTA
  card "最初の投稿者になりませんか?" with `prefillName` deeplink to
  `food-submit-public` when search returns zero results.
- **Barcode-then-submit CTA already exists**:
  `app/(tabs)/nutrition/barcode.tsx:587` similar pattern.
- **My Submissions screen exists** at
  `app/(tabs)/nutrition/my-submissions.tsx`, fully implemented with
  status filtering, use_count display, etc.
- **Discoverability gap**: My Submissions is reachable **only from
  Settings tab** (`app/(tabs)/settings/index.tsx:332`, label "投稿し
  た食品"). Users in the nutrition flow can submit via the empty-search
  CTA, but to see the history they have to navigate Settings → 投稿し
  た食品. That's a UX dead-end.

### 5.2 Design

Two additive surfaces, no removals:

#### 5.2.1 Nutrition home — "My Submissions" entry

`app/(tabs)/nutrition/index.tsx` is the daily-meal screen. Add a row
or small chip to the existing nav area (top header or "クイック動作"
section) labelled "投稿一覧" or "私の投稿" with router push to
`/(tabs)/nutrition/my-submissions`.

Two placement options:

- **Option A (recommended)**: A button in the header right slot of
  nutrition/index, alongside the date navigator. Icon-based
  (`cloud-upload-outline`) with a small badge if there are
  pending_review entries. Compact, always visible.
- **Option B**: A footer card "私が投稿した食品 ({count}件)" below
  the meal sections, only when count > 0. More noticeable, but more
  vertical space.

Recommend A. Lower friction, works for users with zero submissions
(button is always there), badge gives a hint when there's something
to look at.

#### 5.2.2 Submission entry from "+ 食品を追加"

`app/(tabs)/nutrition/add.tsx` (the meal-log "add food" screen with
search + barcode + AI-estimate). The add screen has a button row at
the top and `food-submit` (private/local) is reachable from there
(line 946). Public submission (`food-submit-public`) is reachable
only via the empty-search CTA.

Improvement: add a third row to the add screen's "なかった場合"
helper (which currently just shows the existing food-submit private
button). The new row:
- "みんなのデータベースに追加 (公開)" → `food-submit-public`
- subtitle copy explaining "他のユーザーも使えるようになります。承
  認されると公開されます。"

Both private (`food-submit`) and public (`food-submit-public`) entry
remain. Distinction is made obvious in the UI.

#### 5.2.3 settings/index "投稿した食品" stays

No change to settings/index. The Settings entry remains as a
deep-into-account fallback. Two surfaces (Nutrition tab + Settings
tab) is a feature, not noise.

### 5.3 Files

- `app/(tabs)/nutrition/index.tsx` (header button + badge)
- `app/(tabs)/nutrition/add.tsx` (third entry row)
- New helper: maybe `src/hooks/usePendingSubmissionCount.ts` for the
  badge count (queries `listSubmissionsByStatus(db, 'pending_review')`)

Estimated 3 files, ~80 lines.

### 5.4 Risks

- **Add screen layout**: `add.tsx` is already 1300+ lines and has
  several conditional sections. Adding a row needs care to not break
  existing flows. Recommend recon-first inside the implementation
  session.
- **Badge accuracy**: badge counts must update when user submits
  from the search-empty CTA. Easy via React Query invalidation or
  store subscription, but worth verifying.

### 5.5 Out of scope

- Reorganizing the nutrition tab structure (e.g. moving My Dish vs.
  My Submissions vs. user-foods into a "Library" sub-tab). Bigger
  redesign, future work.

---

## Part 6 — Feature 5: Gym-equipment registration + AI menu generation

### 6.1 Current state

- `exercises` table has `equipment text` column (free-form string).
  No closed enum; values come from seed data with strings like
  `'barbell'`, `'dumbbell'`, `'machine'`, etc.
- `workout_routines` + `workout_routine_items` are user-private
  tables already syncing via cloud-sync (Phase 5-B / 5-C).
- AI integration already exists for nutrition: `aiNutritionService.ts`
  calls the `estimate-nutrition` Edge Function (Gemini 2.5 Flash Lite).
  Same pattern is reusable.
- `ai_usage_logs` table tracks per-user daily quota usage (50/day for
  Pro tier on `estimate-nutrition`).
- No existing concept of "the gym I go to" or per-user equipment
  preference.

### 6.2 Design — scope clarifying questions

This is the biggest feature in build 15 and the one with the most
ambiguity. Before implementation, Syuto sign-off needed on:

**Q5-A: Equipment data model**
- α (recommended) — Per-user equipment list. No public stores DB.
  Each user enters "I go to a gym with: barbell rack, dumbbells up
  to 40kg, smith machine". Stored as a JSON list on a new local
  table `user_equipment`.
- β — Public stores DB (chain gym info, e.g. "ANYTIME FITNESS 渋谷店"
  preset list of equipment). Massive content-curation burden.
  Out of scope for v1.

**Q5-B: Equipment master**
- Closed enum of ~15 equipment categories (barbell, dumbbell, smith
  machine, cable, plate-loaded machine, selector machine, body weight,
  bench, pull-up bar, dip bar, kettlebell, EZ bar, resistance band,
  trap bar, sled).
- Mapped from existing `exercises.equipment` strings. Some
  normalization needed.

**Q5-C: AI menu output format**
- Inputs: target muscle groups (1+), workout duration (e.g. 60 min),
  goal type (cut/bulk/maintain), available equipment list, user's
  recent training history (optional, for variety).
- Output: ordered list of exercises with target sets/reps/rest.
  Each exercise mapped to an `exercises.id` (or fallback to free-text
  custom exercise if no match).

**Q5-D: Persistence**
- Generated menu is saved as a `workout_routine` (so it integrates
  with the existing session-start flow). Routine name auto-set to
  e.g. "AI生成: 胸・三頭 (2026-05-06)".
- User can edit / delete the routine just like a hand-built one.

**Q5-E: AI cost gating**
- Free tier: limited (e.g. 3 generations / month) or unavailable?
- Plus / Pro: more generous, daily quota?
- Decision affects subscriptionService and pricing-tier copy.

**Q5-F: Menu refinement**
- After generation, user can swap exercises (UI to pick alternates).
- Or: user just regenerates with different inputs (simpler, less UI).

### 6.3 Recommended design (assumes α, daily quota model)

#### 6.3.1 Data model

**Local SQLite tables** (require new migration v24):

```sql
-- The user's known equipment loadout. One row per (profile, equipment_kind).
CREATE TABLE IF NOT EXISTS user_equipment (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  equipment_key TEXT NOT NULL,         -- 'barbell', 'dumbbell', etc.
  available INTEGER NOT NULL DEFAULT 1, -- 0/1, future-proof for "have it but broken"
  notes TEXT,                          -- e.g. "max 40kg dumbbells"
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  synced_at TEXT,
  UNIQUE(profile_id, equipment_key)
);
```

For cloud sync: add `user_equipment` to the resource module registry
(Phase 5-B style). Server side: matching `user_equipment` table on
Supabase, RLS-scoped to user_id, sync via the existing pattern.

**`user_workout_preferences`** for goal / duration defaults: already
exists implicitly via `profiles.goal_type` and `profiles.activity_level`.
No new table needed.

#### 6.3.2 Edge Function — `generate-workout-menu`

New `supabase/functions/generate-workout-menu/index.ts`. Mirrors the
shape of `estimate-nutrition`:

- Auth check (Bearer token)
- Quota check via `ai_usage_logs` (daily limit per tier)
- Build prompt: input target muscles + equipment + duration + goal
- Call Gemini 2.5 Flash Lite
- Parse JSON output (validated schema)
- Log to `ai_usage_logs`

Prompt sketch:
```
日本のトレーニーに向けて、{muscles} を鍛える {duration}分のトレーニ
ングメニューを作成してください。
利用可能な器具: {equipment_list}
目標: {goal_jp}
JSON で返す。スキーマ: { "exercises": [{ "name_ja": "...",
  "target_sets": 3, "target_reps": "8-12", "rest_seconds": 90,
  "notes": "..." }] }
```

#### 6.3.3 Client-side flow

1. **Settings → "ジム器具" 画面** — checkbox grid of 15 equipment
   types. Save creates/updates `user_equipment` rows. Sync via cloud.
2. **Training tab → "AI メニュー生成" ボタン** — opens a modal:
   - Multi-select muscle groups
   - Duration slider (30/45/60/90 min)
   - "生成する" button
   - On success: shows generated routine preview, "ルーティンとして
     保存" button creates a `workout_routine` + `workout_routine_items`.
3. **Quota indicator** — small badge "今月: 2/5 残り" near the button.
   Reads from `ai_usage_logs` for this user.

#### 6.3.4 Exercise matching

After AI returns a list of exercise names, match against local
`exercises` table:
- Exact `name_ja` match → use that exercise.id
- Fuzzy LIKE match → use the first hit
- No match → create a `custom_exercises` row tagged `ai_generated:true`,
  use that id

This keeps AI-generated routines composable with existing
`workout_routine_items` rows + session flow + sync layer.

### 6.4 Files (assuming Option A / α)

| Path | Status | Notes |
|---|---|---|
| `supabase/migrations/<ts>_user_equipment.sql` | new | server table + RLS |
| `src/infra/database/migrations/v24.ts` | new | local table |
| `src/infra/repositories/userEquipmentRepository.ts` | new | CRUD |
| `src/infra/supabase/sync/userEquipmentSync.ts` | new | resource module |
| `src/infra/supabase/sync/syncOrchestrator.ts` | edit | register module |
| `supabase/functions/generate-workout-menu/index.ts` | new | AI Edge Function |
| `src/infra/services/aiWorkoutService.ts` | new | client wrapper |
| `app/(tabs)/settings/equipment.tsx` | new | equipment editor |
| `app/(tabs)/settings/index.tsx` | edit | row "ジム器具" |
| `app/(tabs)/training/index.tsx` | edit | AI menu button + modal |
| `src/types/equipment.ts` | new | types |
| `src/constants/equipment.ts` | new | enum + JP labels + icons |
| Tests | new | aiWorkoutService, userEquipmentRepository, AI prompt builder |

Estimated 13 files, ~1500 lines (similar to a Phase 5 sub-resource).

### 6.5 Risks

- **AI cost**: each generation is paid. Without quotas, malicious
  users could rack up bills. **Strict daily/monthly quotas required**.
  Mitigation: implement quotas in the Edge Function (mirrors
  `estimate-nutrition`).
- **Output quality**: Gemini's recommendations may be off-base
  (wrong rep ranges, wrong rest times for the selected goal).
  Mitigation: validate the response shape strictly; treat
  generation as a starting point, not a verdict (user can edit).
- **Exercise matching collisions**: name_ja may not match existing
  exercises uniformly. Mitigation: build a small whitelist of
  ~50 common exercise canonicalisations in `src/constants/equipment.ts`.
- **Cloud-sync interaction**: adding `user_equipment` to the
  resource registry adds a new sync entry. Must update audit scripts
  and `USER_PRIVATE_TABLES` in both audit scripts.
- **Schema bloat**: a 15-row equipment table per user is small. No
  storage concern.

### 6.6 Out of scope

- Public-store equipment presets ("ANYTIME FITNESS 渋谷店 → load
  these defaults")
- Coach-curated routine templates competing with AI generation
- Progressive overload tracking ("last week you did 80kg×8, AI
  suggests 82.5kg×8 today")
- Integration with health metrics (recovery score, sleep, HRV)

---

## Part 7 — Cross-feature implementation plan

### 7.1 New Supabase migrations (7)

In recommended apply order:

1. `<ts>_auto_approve_public_foods.sql` — Feature 1 trigger
2. `<ts>_increment_public_food_use_count.sql` — Feature 3 prereq RPC
3. `<ts>_push_tokens.sql` — Feature 3 token table
4. `<ts>_notification_outbox.sql` — Feature 3 outbox + trigger
5. `<ts>_user_equipment.sql` — Feature 5 server table

### 7.2 New local SQLite migrations

- `v24.ts` — adds `user_equipment` table

### 7.3 New Edge Functions (2)

1. `send-push-notifications` — Feature 3 cron sender
2. `generate-workout-menu` — Feature 5 AI generator

### 7.4 New client modules

- `src/infra/services/pushTokenService.ts`
- `src/infra/services/aiWorkoutService.ts`
- `src/infra/repositories/userEquipmentRepository.ts`
- `src/infra/supabase/sync/userEquipmentSync.ts`
- `src/types/equipment.ts`
- `src/constants/equipment.ts`
- `src/hooks/usePendingSubmissionCount.ts` (Feature 4)

### 7.5 Edited client modules (rough list)

- `src/infra/services/subscriptionService.ts` — Feature 2
- `src/infra/services/notificationService.ts` — Feature 3 opt-in
- `src/infra/sync/loginSyncBootstrap.ts` — Feature 3 register call
- `src/infra/supabase/sync/syncOrchestrator.ts` — Feature 5 module
- `src/infra/repositories/nutritionRepository.ts` — Feature 3 RPC
- `app/(tabs)/nutrition/index.tsx` — Feature 4
- `app/(tabs)/nutrition/add.tsx` — Feature 4
- `app/(tabs)/settings/index.tsx` — Feature 5 row
- `app/(tabs)/settings/notifications.tsx` — Feature 3 toggle
- `app/(tabs)/settings/subscription.tsx` — Feature 2 copy
- `app/(tabs)/training/index.tsx` — Feature 5 button + modal
- `app/(tabs)/settings/equipment.tsx` (new) — Feature 5
- `app.config.ts` — Feature 3 plugin

### 7.6 New dependencies

- **None required**. expo-notifications is already installed; Expo's
  push API is plain `fetch`; Gemini access is via existing Edge
  Function pattern; AI integration uses the existing client wrapper
  shape.

### 7.7 Audit scripts

- Add `user_equipment` to `USER_PRIVATE_TABLES` in
  `scripts/check-soft-delete-filter.ts` and `scripts/check-enqueue-sync.ts`
  if Feature 5 lands. Otherwise no audit changes needed.

---

## Part 8 — Risk analysis (summary)

| Feature | Highest risk | Mitigation |
|---|---|---|
| 1 | Trigger fires on Service Role inserts (could mis-route Syuto's manual rows) | Document escape hatch in migration header |
| 1 | Client-supplied score is trusted | Accept for v1; future server-side scoring |
| 2 | None at code scope | — |
| 3 | APNs cert / EAS push setup not confirmed | Verify before starting; surface to Syuto |
| 3 | use_count update was missing — feature has hidden prereq | Surfaced in 4.3.2; included in scope |
| 3 | Notification fatigue | Conservative thresholds (1, 10, 100, 1000) |
| 4 | add.tsx complexity (1300+ lines) | Recon-first inside session |
| 5 | AI cost / abuse | Strict quotas in Edge Function |
| 5 | AI output quality | User-editable result; treat as draft |
| 5 | Sync registry change | Update audit scripts |

### 8.1 Existing-feature impact

- **Cloud sync layer**: Feature 5 adds one new resource module; the
  pattern is well-established. Other features don't touch sync.
- **Auth flow**: Feature 3 adds a registration step inside
  `loginSyncBootstrap`; failure is non-fatal.
- **Subscription gates**: Feature 2 unlocks barcode for free; no
  other gate changes.
- **Existing reminders**: Feature 3's notification work doesn't
  touch the existing local-scheduled reminders.

### 8.2 Things that look risky but aren't

- **Push token rotation**: Expo handles this; we re-register on
  every login, which catches rotation naturally.
- **Multiple devices**: handled by the `push_tokens` table design
  (one row per device).
- **Negative `approval_score`**: scorer guarantees [0, 100]; trigger
  treats anything below 50 as rejection. Defensive `coalesce(score, 0)`
  in the trigger if Syuto wants to be paranoid.

---

## Part 9 — Recommended commit strategy

Follow the Phase 6-A through 6-E pattern from cloud-sync: many small
commits, each independently green (tsc + jest + audits), each with a
hard-stop boundary.

### 9.1 Suggested commit chunks

| # | Commit | Hard stop after? |
|---|---|---|
| 1 | `feat(subscription): unlock barcode scanner for free tier` | No |
| 2 | `feat(submissions): auto-approval trigger on public_foods` | **Yes** — verify SQL applied |
| 3 | `feat(submissions): server-side use_count increment RPC` | No |
| 4 | `feat(nutrition): My Submissions discoverability + add-screen entry` | No |
| 5 | `feat(notifications): push token storage + client registration` | **Yes** — verify EAS + APNs |
| 6 | `feat(notifications): outbox + send Edge Function + cron` | **Yes** — first push received |
| 7 | `feat(notifications): in-app opt-in toggle` | No |
| 8 | `feat(equipment): user_equipment table + repo + sync module` | No |
| 9 | `feat(equipment): settings UI for equipment loadout` | No |
| 10 | `feat(workout): AI menu generation Edge Function + client wrapper` | **Yes** — first AI call works |
| 11 | `feat(workout): AI menu UI + routine persistence` | **Yes** — full feature |

11 commits total. Hard stops at 2 / 5 / 6 / 10 / 11 to gate progress
on out-of-band verification (manual SQL apply, EAS push setup,
first-call success).

### 9.2 Rollback safety

- Features 1, 2, 4 are fully reversible at the commit level.
- Feature 3 reverting requires:
  - Drop the cron schedule
  - Drop the outbox table
  - Drop the push_tokens table
  - Revert the client (which becomes silently no-op without the table)
- Feature 5 reverting requires:
  - Revert the v24 migration
  - Drop the user_equipment table on Supabase
  - Drop the Edge Function
  - Revert the client

All migrations should be additive (CREATE TABLE IF NOT EXISTS) so a
re-apply is safe.

---

## Part 10 — Effort estimate

Time budget per feature (per recon-derived complexity, similar to
the cloud-sync design's optimistic/realistic/pessimistic split):

| Feature | Optimistic | Realistic | Pessimistic |
|---|---|---|---|
| 1 — Auto-approval trigger | 30 min | 2 hr | 4 hr (if threshold tuning needed) |
| 2 — Barcode free | 15 min | 30 min | 1 hr |
| 3 — Push notifications | 6 hr | 12 hr | 24 hr (APNs setup pain) |
| 4 — Discoverability UI | 1 hr | 2 hr | 4 hr (add.tsx complexity) |
| 5 — Equipment + AI | 12 hr | 20 hr | 40 hr (AI quality iteration) |
| **Total** | **~20 hr** | **~37 hr** | **~73 hr** |

Cloud-sync design's estimate was 40h optimistic / 70h realistic /
110h pessimistic; actual was ~25h. Build 15's "Realistic" 37 hr is
≈ half of cloud-sync's, which feels right — features are mostly
independent and several are small.

### 10.1 Session count

At 4-5 hr / session (typical pace), realistic = 7-9 sessions, matching
the cloud-sync session count. Recommend:

- Session 1: Features 2 + 4 (warmup + UI confidence)
- Session 2: Feature 1 + Feature 3 prereq RPC
- Session 3-4: Feature 3 plumbing + verify first push
- Session 5-7: Feature 5 (equipment + AI)
- Session 8-9: polish, testing, bug-fix as discovered

### 10.2 Hard-stop discipline

Per `feedback_hard_stop_at_risk_boundaries.md`, halt and surface
sign-off prompt at:

- Before applying SQL to Supabase (Features 1, 3, 5)
- Before any commit that touches subscription / pricing UI (Feature 2)
- After first push notification successfully arrives (Feature 3)
- After first AI menu generates successfully (Feature 5)
- Before merging Feature 5's sync registry change

---

## Appendix A — Recon notes

Findings worth recording even though they didn't change the design:

1. **`food-submit.tsx` vs `food-submit-public.tsx` are two different
   screens**. The first is for local-only foods (per-user food
   library). The second is for the public submission flow. Don't
   confuse them when wiring Feature 4.
2. **`WaterHistoryModal.tsx` is dead code** (noted in build 14 recon).
   Build 15 doesn't address this; tracking as separate cleanup task.
3. **`incrementUseCount` is local-only**: surfaced in §4.3.2 as the
   hidden prerequisite for "submission used" notifications. Without
   the new RPC, the count never increments server-side.
4. **`exercises.equipment` is free-form text**. Build 15 doesn't
   normalize the existing rows (would be a separate migration); the
   new equipment master is additive and matches by string equality
   where possible.
5. **No `expo-notifications` plugin config in `app.config.ts`**. Phase
   3-A added Apple Sign In but didn't touch notifications. Will need
   adding for Feature 3.
6. **Phase 8's `loginSyncBootstrap.runLoginSync` is the natural seam
   for push-token registration** — already the place where
   per-login post-auth work happens.

## Appendix B — Open questions for Syuto

Before implementation begins:

1. **Threshold tuning** — happy with auto-approval at score ≥ 70 and
   auto-rejection at score < 50? Or want a more conservative split
   (e.g., ≥ 80 / < 30, with the bulk going to manual review)?
2. **Existing pending rows** — leave them (Option A) or backfill via
   a one-time UPDATE (Option B)?
3. **Barcode messaging** — silent flip (Option A) or one-time
   announcement banner (Option B)?
4. **Push notifications — APNs cert status**: confirmed in Expo /
   EAS? If not, that's the first blocker for Feature 3.
5. **Push notification thresholds** — notify on use_count = 1, 10,
   100, 1000? Or different milestones?
6. **Feature 5 equipment data model** — Option α (per-user) or β
   (public stores DB)? Recommend α.
7. **Feature 5 AI cost gating** — free (3/month) / Plus (20/month) /
   Pro (unlimited)? Or different split? Recall: 課金者ゼロ today,
   so this mostly affects future paying users.
8. **Feature 5 menu refinement** — auto-regenerate-only, or
   in-place exercise swap UI? Recommend regenerate-only for v1.
9. **Implementation order** — match the Part 1.2 recommendation
   (2 → 4 → 1 → 3 → 5)? Or a different priority?
10. **Hard-stop list** — Part 9.1 lists 5 mandatory hard stops.
    Add or remove any?
