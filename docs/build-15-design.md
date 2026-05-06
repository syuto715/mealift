# Build 15 Design Document

**Status**: pre-implementation design (no code)
**Authored**: 2026-05-06; Feature 5 expanded 2026-05-06 (post-Gymwork research)
**Covers**: 5 features bundled into build 15 (Feature 5 has 6 sub-features after expansion)
**Sibling**: `docs/cloud-sync-design.md` (cd1a6d8) — pattern reference
**Sibling**: `docs/long-term-strategy.md` — Gymwork market research, Build 16+ roadmap context

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
| 5 | Strength training core (Gymwork-class): 6 sub-features | **Very high** | Larger than original Cloud Sync. Six sub-features (A/B/C/O/P + 元) compounding into a workout-tracking suite |

Total recon-derived effort: **larger than Cloud Sync**
(60–80 hr) at ~76–96 hr realistic. Build 15 is the largest single
build cycle to date. See Part 10. Hard-stops are denser than
cloud-sync's because Feature 5's six sub-features each have their
own integration risk — see Part 9.

### 1.1 Cross-feature dependencies

```
2 ─────────┐                        (independent — barcode unlock)
1 ─────────┤
4 ─────────┤
3 ──── 1 ──┘   (3 needs the trigger from 1 to know "approval happened")
5 ────── (independent of 1-4)
   └─ Internal dependency graph (six sub-features):
      A (exercise DB) ──┬──→ P (8-category equipment) ──┐
                        │                               ├──→ 元 (per-user equipment + AI menu)
                        ├──→ B (1RM e1rm table) ──→ C (Easy/Normal/Hard recommendation)
                        └──→ O (set-pattern templates: 5×5 / top set / drop set)
```

- **Feature 3 depends on Feature 1**: the natural trigger source for
  "your submission was approved" is the trigger from Feature 1; without
  it, the only event we could fire on is a manual review (which Syuto
  isn't doing yet) or the row INSERT itself (which would notify before
  approval, defeating the point).
- **Feature 5 internal deps**: A is the foundation (every other
  sub-feature joins to `exercises`). P normalizes equipment to the
  8-category Gymwork enum, which 元 (per-user equipment registration)
  consumes. B (1RM table + history) is required by C (Easy/Normal/Hard
  uses the e1rm value). O is independent of B (just sets up the
  pattern UI). 元 needs A + P; doesn't strictly need B/C/O.
- Otherwise: 2 / 4 can land first as warmup; 1 must precede 3; 5 can
  run in parallel any time, but its internal sub-feature ordering is
  fixed by the dep graph above.

### 1.2 Recommended implementation order

1. **Feature 2** (~30 min) — trivial, builds confidence.
2. **Feature 4** (~2 hr) — UI-only, additive, no risk.
3. **Feature 1** (~2 hr including jest + manual SQL apply) — unlocks 3.
4. **Feature 3 prereq** (~2 hr) — server-side `use_count` RPC
   (hidden prereq surfaced in §4.3.2).
5. **Feature 3** (~2 sessions) — biggest non-Feature-5 plumbing change.
6. **Feature 5** (~4 sessions, ordered A+P → B+O → C → 元) —
   biggest sub-system of the build.
7. **Polish session** — bug-fix + regression discovery as required.

Total: **9 sessions** (was 7–9 before Feature 5 expansion). See
Part 10 for time estimates and per-session split.

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

## Part 6 — Feature 5: Strength training core (Gymwork-class)

### 6.1 Scope expansion

The original Part 6 (per-user equipment + AI menu generation, ~20 hr)
has expanded after the Gymwork research (`docs/long-term-strategy.md`)
into a **six-sub-feature suite** delivering a Gymwork-class workout
tracker. Total Feature 5 effort: 60–80 hr realistic.

**Sub-features in scope**:

| Code | Sub-feature | Source in long-term-strategy.md |
|---|---|---|
| **A** | Exercise DB expansion (100–200 entries with form cues, primary muscle, equipment, video URL) | §7.2 schema + §2.2 Gymwork DB observation |
| **B** | 1RM auto-calc + history line graph (Epley/Brzycki, `estimated_1rm` table) | §7.3 + §2.4 Gymwork progress UI |
| **C** | Easy / Normal / Hard 3-chip weight recommendation | §7.3 + §2.4 Gymwork's flagship UX |
| **O** | Set patterns (5×5 / top set / drop set) one-tap insertion | §2.4 Gymwork quote, §8 #9 |
| **P** | Equipment chip 8-category filter (バーベル/自重/ケトルベル/マシン/ストレッチ/有酸素/ダンベル/その他) | §2.2 + §8 #10 |
| **元** | Per-user gym equipment registration + Gemini AI menu generation (the original Part 6) | §7.1 (two-stage AI) + §7.4 (rest timer) |

**Sub-features explicitly OUT of build 15** (deferred to Build 16+;
see Part 11 roadmap):

- **D**: RPE/RIR self-regression adjustment (§7.3 update logic)
- **E**: MEV/MAV/MRV volume dashboard (§7.5)
- **F**: Auto-deload scheduling (§7.5)
- **G**: Periodization presets (DUP, block, 3-7 method) (§7.6)
- **H**: Weekly AI report combining workout + nutrition (§7.6 Pro)
- **I**: Apple Watch / iOS Live Activity (§7.4)
- **J–N**: friend leaderboard / global percentile / `/onerm` SEO /
  PDF export / coach marketplace (§3.3, §8 #6, §8 #7, §7.6)

### 6.2 Sub-feature dependency

Implementation must follow the dep graph (§1.1):

```
A (exercise DB) ──┬──→ P (8-category equipment normalization) ──┐
                  │                                              ├──→ 元 (gym registration + AI menu)
                  ├──→ B (1RM table + history) ──→ C (Easy/Normal/Hard 3-chip)
                  └──→ O (set-pattern templates)
```

- A is foundation: `exercises.slug`, `form_cue_ja`, `primary_muscle`,
  `movement_pattern` are joined by every other sub-feature.
- P normalizes equipment values to the 8-category enum that 元 needs.
- B's `estimated_1rm` table feeds C's recommendation function.
- O is mechanically independent of B (lives at routine_item /
  workout_set level), but its value is increased by C's UI patterns.
- 元 needs A (exercise lookup for AI output matching) + P (chip
  enum for the equipment editor + AI prompt input).

Implementation order chosen to minimize re-work: **A → P → (B || O) →
C → 元**.

### 6.3 Sub-feature: A — Exercise DB expansion

#### 6.3.1 Current state
- `exercises` table from v1 has: `id, name_ja, name_en, muscle_group,
  secondary_muscles, equipment, is_custom, sort_order, created_at`.
- v7 added `default_rest_seconds`. v12 added `exercise_type`,
  `met_value`. Phase 2-A added `deleted_at`, `updated_at`.
- Seed exercise count today: ~50 (estimate from `MUSCLE_GROUPS`
  bundle + observed UI).

#### 6.3.2 Schema additions (local migration v24)

Add columns to existing `exercises`:
```sql
ALTER TABLE exercises ADD COLUMN slug TEXT;             -- e.g. 'bench_press_barbell'
ALTER TABLE exercises ADD COLUMN primary_muscle TEXT;   -- 'chest_mid', 'back_lat', ...
ALTER TABLE exercises ADD COLUMN movement_pattern TEXT; -- 'horizontal_push', 'vertical_pull', ...
ALTER TABLE exercises ADD COLUMN is_compound INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exercises ADD COLUMN rep_range_low INTEGER;
ALTER TABLE exercises ADD COLUMN rep_range_high INTEGER;
ALTER TABLE exercises ADD COLUMN form_cue_ja TEXT;
ALTER TABLE exercises ADD COLUMN video_url TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_slug ON exercises(slug) WHERE slug IS NOT NULL;
```

#### 6.3.3 Seed data
Hand-author 100–200 entries via a seed script
`scripts/seed-exercises-v2.ts` that generates a single
SQL `INSERT INTO exercises ...; INSERT ... ON CONFLICT DO UPDATE`
file. The hand-authored data lives in
`scripts/seed-exercises-v2/data.ts` as a typed array for
review-friendly diffs.

Coverage target (informed by §4.4 of the Gymwork report —
"重要な日本語語彙 必須採用"):
- 筋トレ系 BIG3 + 補助種目 (~40)
- 上半身 押す/引く (~30)
- 下半身 (~25)
- 体幹・小筋群 (~20)
- 自重・ストレッチ (~15)
- 有酸素・コンディショニング (~10)

Seed run is **idempotent** via `ON CONFLICT(id) DO UPDATE` so
multiple applies don't double-row. Use SHA-derived stable UUIDs
from slug so re-running the seed doesn't generate new IDs.

#### 6.3.4 Cloud sync impact
Local `exercises` table is **canonical** (not user-private). It
already has `is_custom` flag separating user-owned rows. The
column additions don't affect the existing `customExerciseSync`
sync module (which only filters by `is_custom = 1`). Verify
the sync module ignores the new columns gracefully (default
NULL on server side).

#### 6.3.5 Files
- `src/infra/database/migrations/v24.ts` — new (covers all of
  Feature 5's local schema additions, not just A)
- `scripts/seed-exercises-v2/data.ts` — new (hand-authored data)
- `scripts/seed-exercises-v2/run.ts` — new (idempotent seed runner)
- `src/types/workout.ts` — edit (add new fields to `Exercise` type)
- `src/infra/repositories/workoutRepository.ts` — edit (rowToExercise
  reads new columns)

#### 6.3.6 Risks
- **Hand-authoring 100-200 rows is the bottleneck**. Mitigation:
  produce in batches of 30-50; review each batch with Syuto before
  the next. Treat as data work, not engineering.
- Form cues need to be **technically correct AND legally safe**.
  Reference §4.5 of the long-term-strategy.md: avoid trademarked
  method names (101メソッド, 3-7法 etc.) — use generic descriptions.
- Video URLs left empty for v1 (future YouTube embeds). Don't gate
  any feature on video presence.

### 6.4 Sub-feature: P — Equipment chip 8-category filter

#### 6.4.1 Current state
- `exercises.equipment` is free-form text. Existing values vary
  ('barbell', 'dumbbell', 'machine', 'cable', null, etc.).
- No closed enum. UI doesn't filter by equipment.

#### 6.4.2 Design
Per `long-term-strategy.md` §2.2 / §8 #10, use an 8-category enum:

```ts
// src/constants/equipment.ts
export const EQUIPMENT_CATEGORIES = [
  { key: 'barbell',     ja: 'バーベル',   icon: '...' },
  { key: 'dumbbell',    ja: 'ダンベル',   icon: '...' },
  { key: 'machine',     ja: 'マシン',     icon: '...' },
  { key: 'kettlebell',  ja: 'ケトルベル', icon: '...' },
  { key: 'bodyweight',  ja: '自重',       icon: '...' },
  { key: 'cardio',      ja: '有酸素',     icon: '...' },
  { key: 'stretching',  ja: 'ストレッチ', icon: '...' },
  { key: 'other',       ja: 'その他',     icon: '...' },
] as const;
export type EquipmentKey = typeof EQUIPMENT_CATEGORIES[number]['key'];
```

#### 6.4.3 Migration of existing values
Map current `exercises.equipment` strings to the new keys via
a one-time SQL inside v24:

```sql
UPDATE exercises SET equipment = 'barbell'    WHERE equipment IN ('barbell', 'バーベル');
UPDATE exercises SET equipment = 'dumbbell'   WHERE equipment IN ('dumbbell', 'dumbbells', 'ダンベル');
UPDATE exercises SET equipment = 'machine'    WHERE equipment IN ('machine', 'cable', 'マシン', 'ケーブル');
UPDATE exercises SET equipment = 'bodyweight' WHERE equipment IN ('bodyweight', 'body weight', '自重') OR equipment IS NULL;
UPDATE exercises SET equipment = 'kettlebell' WHERE equipment IN ('kettlebell', 'kettlebells', 'ケトルベル');
UPDATE exercises SET equipment = 'cardio'     WHERE equipment IN ('cardio', 'treadmill', 'bike', '有酸素');
UPDATE exercises SET equipment = 'stretching' WHERE equipment IN ('stretching', 'mobility', 'ストレッチ');
-- Anything unmatched falls into 'other':
UPDATE exercises SET equipment = 'other'
  WHERE equipment NOT IN ('barbell','dumbbell','machine','kettlebell','bodyweight','cardio','stretching');
```

#### 6.4.4 UI integration
- Exercise picker (`training/index.tsx` Modal) gets a horizontal
  chip row above the search input, single-select, filters the
  exercise list.
- Equipment editor (元 sub-feature) reuses the same enum.
- AI menu prompt (元 sub-feature) sends the user's equipment list
  using these keys.

#### 6.4.5 Files
- `src/constants/equipment.ts` — new
- `src/types/equipment.ts` — new (EquipmentKey export)
- v24 migration includes the UPDATE statements
- `app/(tabs)/training/index.tsx` — edit (add chip filter row)

#### 6.4.6 Risks
- **Coverage of existing `equipment` values**: if a value isn't in
  the explicit IN list, it falls through to 'other'. Acceptable
  (user can re-categorize via the custom-exercise editor later),
  but verify by listing `SELECT DISTINCT equipment FROM exercises`
  pre-migration.

### 6.5 Sub-feature: B — 1RM auto-calc + history line graph

#### 6.5.1 Current state
- No 1RM table.
- `personal_records` table tracks user-set PRs but doesn't
  estimate 1RM from arbitrary working sets.
- `workout_sets` has `weight_kg`, `reps`, `rpe`, `is_warmup` —
  enough input for Epley/Brzycki estimation.

#### 6.5.2 Schema (v24)

```sql
-- estimated_1rm: per-(profile, exercise) latest e1rm and source.
CREATE TABLE IF NOT EXISTS estimated_1rm (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  e1rm_kg REAL NOT NULL,
  formula TEXT NOT NULL,                  -- 'epley' | 'brzycki' | 'avg'
  source_set_id TEXT,                     -- workout_sets.id that produced this estimate
  observed_at TEXT NOT NULL,              -- when the source set happened
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  synced_at TEXT,
  UNIQUE(profile_id, exercise_id)
);
```

#### 6.5.3 Calculation
Pure helper at `src/domain/oneRepMax.ts`:

```ts
// Epley (best for 1-10 reps): 1RM = w × (1 + r/30)
// Brzycki (best for 1-6 reps): 1RM = w / (1.0278 - 0.0278r)
// Strategy: 1-6 reps Brzycki; 7-10 reps avg(Epley, Brzycki); >10 reps Epley capped.

export function estimateOneRepMax(weightKg: number, reps: number): {
  e1rm: number;
  formula: 'brzycki' | 'epley' | 'avg';
} { ... }
```

`personalRecord.ts` already has `estimateOneRepMax` referenced —
**confirm if it exists; refactor or extend rather than duplicate**.
(Recon noted personalRecord.test.ts exists.)

#### 6.5.4 Update flow
- Wire into `workoutRepository.addSet`: after INSERT + enqueue,
  recompute e1rm for that exercise. If new e1rm > current
  `estimated_1rm.e1rm_kg`, update the row + enqueue.
- Warmup sets (`is_warmup = 1`) excluded from estimation.
- RPE-aware: if RPE ≥ 9.5 and reps < target → small downward
  bias (described in long-term-strategy.md §7.3 update rules).

#### 6.5.5 Cloud sync registration
`estimated_1rm` joins the resource registry as a level 1 resource
(no FK to other user-private tables that aren't already synced;
references `exercises.id` which is canonical).

#### 6.5.6 History UI
- `app/(tabs)/progress/pr-detail/[exerciseId].tsx` already exists
  for the PR detail view. Extend with a 1RM history line chart
  from `estimated_1rm` points over time using
  `react-native-svg` (already installed for VolumeChart).
- Chart shows e1rm over the last 90 days, sample points = each
  significant working-set entry that produced an e1rm.

#### 6.5.7 Files
- `src/domain/oneRepMax.ts` — new (or refactor existing helper)
- `src/domain/__tests__/oneRepMax.test.ts` — new
- `src/infra/repositories/oneRepMaxRepository.ts` — new
- `src/infra/supabase/sync/estimatedOneRMSync.ts` — new
- `supabase/migrations/<ts>_estimated_1rm.sql` — new (server table + RLS)
- v24 includes the local table
- `src/infra/repositories/workoutRepository.ts` — edit (addSet hook)
- `src/infra/supabase/sync/syncOrchestrator.ts` — edit (register module)
- `app/(tabs)/progress/pr-detail/[exerciseId].tsx` — edit (chart)
- audit scripts — edit (add `estimated_1rm` to USER_PRIVATE_TABLES)

#### 6.5.8 Risks
- Existing `personalRecord.ts` may already implement parts of
  this. **Recon required at implementation time** to avoid duplication.
- e1rm jumps are user-visible. Must validate that warmup sets
  truly excluded.

### 6.6 Sub-feature: C — Easy / Normal / Hard 3-chip recommendation

#### 6.6.1 Current state
- No weight recommendation. User enters target weights manually.

#### 6.6.2 Design
Pure logic helper, no DB writes, no LLM call:

```ts
// src/domain/workoutRecommendation.ts
import type { WorkoutSet } from '../types/workout';

// RIR (Reps In Reserve) → fraction of 1RM, indexed by [reps][rir].
// Source: Helms / Reactive Training Systems Tier-1 chart.
const rirToPctOf1RM: Record<number /*reps*/, Record<number /*rir*/, number>> = {
  1:  { 0: 1.000, 1: 0.955, 2: 0.922, 3: 0.892, 4: 0.864 },
  3:  { 0: 0.940, 1: 0.910, 2: 0.881, 3: 0.853, 4: 0.826 },
  5:  { 0: 0.870, 1: 0.840, 2: 0.811, 3: 0.785, 4: 0.760 },
  8:  { 0: 0.795, 1: 0.770, 2: 0.745, 3: 0.722, 4: 0.700 },
  10: { 0: 0.745, 1: 0.722, 2: 0.700, 3: 0.679, 4: 0.659 },
  12: { 0: 0.707, 1: 0.685, 2: 0.665, 3: 0.645, 4: 0.626 },
  // ... more rep counts
};

export function roundToPlate(kg: number, plate: number = 2.5): number {
  return Math.round(kg / plate) * plate;
}

export interface SetRecommendation {
  weight: number;  // kg, plate-rounded
  reps: number;
}

export function recommendNextSet(
  e1rmKg: number | null,
  repTarget: number,
  rir: number = 2,
  plateStep: number = 2.5,
): { easy: SetRecommendation; normal: SetRecommendation; hard: SetRecommendation } | null {
  if (e1rmKg === null || e1rmKg <= 0) return null;
  const pct = rirToPctOf1RM[repTarget]?.[rir] ?? rirToPctOf1RM[8][2];
  const baseKg = e1rmKg * pct;
  return {
    easy:   { weight: roundToPlate(baseKg * 0.95,  plateStep), reps: repTarget },
    normal: { weight: roundToPlate(baseKg,         plateStep), reps: repTarget },
    hard:   { weight: roundToPlate(baseKg * 1.025, plateStep), reps: repTarget },
  };
}
```

#### 6.6.3 UI integration
- Inside the existing session screen (`training/session.tsx`), each
  upcoming set row gains a 3-chip recommendation strip. User taps
  Easy / Normal / Hard to pre-fill `weight_kg` + `reps` for that
  set.
- Recommendation only shows if `estimated_1rm` exists for the
  exercise. First-time exercise → user enters manually, that
  populates e1rm, future sessions get recommendations.
- Plate step picker in settings (1.25 / 2.5 / 5 kg). Default 2.5.

#### 6.6.4 Plate-rounding subtlety
Long-term-strategy.md §7.3 lists JP-relevant plate steps:
- 2.5 kg (gym standard)
- 1.25 kg (fractional plates)
- 0.5 kg (Olympic micro)
- 1 kg, 2 kg (Japanese dumbbell rack standard)

Settings exposes 4 options: `2.5kg / 1.25kg / 1kg / 0.5kg`.

#### 6.6.5 Files
- `src/domain/workoutRecommendation.ts` — new
- `src/domain/__tests__/workoutRecommendation.test.ts` — new (~12 cases)
- `app/(tabs)/training/session.tsx` — edit (3-chip strip per set)
- `app/(tabs)/settings/profile.tsx` or new `settings/training-prefs.tsx`
  — edit (plate step picker)
- `src/types/profile.ts` — edit (`plateStepKg` field)
- v24 — add `profiles.plate_step_kg` column (default 2.5)

#### 6.6.6 Risks
- **rirToPctOf1RM table accuracy**: Helms/RTS values are widely
  cited but not universally agreed. Pin down once during
  implementation; future tuning is possible without UI changes.
- **First-session experience**: no e1rm = no recommendation.
  Surface a small hint "1セット記録すると次回から重量が推奨されます"
  to set expectations.

### 6.7 Sub-feature: O — Set patterns (5×5 / top set / drop set)

#### 6.7.1 Current state
- `workout_sets` doesn't have a `set_type` column. Only `is_warmup`
  flag exists.
- `workout_routine_items` has `target_sets` (number) and
  `target_reps` (string like "8-12" or "5"). No notion of
  "this routine_item is a 5×5 block".

#### 6.7.2 Design

**Schema additions (v24)**:

```sql
ALTER TABLE workout_sets
  ADD COLUMN set_type TEXT NOT NULL DEFAULT 'working';
  -- enum-like: 'warmup' | 'working' | 'top' | 'drop' | 'amrap' | 'failure'

ALTER TABLE workout_routine_items
  ADD COLUMN set_pattern TEXT;
  -- enum-like: NULL (standard) | '5x5' | 'top_set' | 'drop_set'

ALTER TABLE workout_routine_items
  ADD COLUMN pattern_config TEXT;
  -- optional JSON for pattern parameters (e.g. drop set count)
```

**Pattern definitions** at `src/constants/setPatterns.ts`:

```ts
export const SET_PATTERNS = {
  '5x5':       { ja: '5×5',         sets: 5, reps: '5',     restSec: 180 },
  'top_set':   { ja: 'トップセット',  sets: 1, reps: '1-3',   restSec: 240 },
  'drop_set':  { ja: 'ドロップセット', sets: 1, reps: 'AMRAP', restSec: 60, drops: 3 },
};
```

#### 6.7.3 UI integration
- In the routine-creation Modal (post Phase-9 stage-swap fix), the
  "+ 種目を追加" picker gets a small "セット形式" row below each
  selected exercise: chip row [標準 | 5×5 | トップ | ドロップ].
- Tapping a non-standard pattern auto-fills the routine_item's
  `target_sets`, `target_reps`, sets `set_pattern`.
- During session, set rows render the right number of slots based
  on `set_pattern` (e.g. 'drop_set' shows the working set + 3 drop
  slots).

#### 6.7.4 Files
- `src/constants/setPatterns.ts` — new
- `src/types/workout.ts` — edit (`SetPattern`, `SetType` types)
- v24 — add columns
- `app/(tabs)/training/index.tsx` — edit (pattern chip in picker)
- `app/(tabs)/training/session.tsx` — edit (render based on pattern)
- `src/infra/repositories/workoutRepository.ts` — edit (rowToSet
  reads set_type, createRoutine reads set_pattern + pattern_config)

#### 6.7.5 Risks
- **Backward compat with existing routines**: NULL `set_pattern` =
  standard. Existing rows render as today.
- **Drop-set UX is subtle**: when user finishes drop slot 1, the
  app needs to prompt for slot 2 weight. Prototype on real device
  before locking the UX.

### 6.8 Sub-feature: 元 — Per-user gym equipment + AI menu generation

This is the **original Part 6** scope from the pre-expansion design.
The design doesn't change; it's now bracketed by A (exercise DB),
P (equipment enum), and benefits from B/C/O when available but
doesn't strictly require them.

#### 6.8.1 Data model

**Local SQLite (v24)**:

```sql
CREATE TABLE IF NOT EXISTS user_equipment (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  equipment_key TEXT NOT NULL,           -- one of EQUIPMENT_CATEGORIES (P)
  available INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  synced_at TEXT,
  UNIQUE(profile_id, equipment_key)
);
```

Server-side mirror with RLS, sync via the existing pattern.

#### 6.8.2 Edge Function — `generate-workout-menu`

`supabase/functions/generate-workout-menu/index.ts` mirrors
`estimate-nutrition`'s pattern:

- Auth check (Bearer token)
- Quota check via `ai_usage_logs`
- Build prompt: target muscles + equipment list (8-cat keys) +
  duration + goal + (optional) recent training history
- Call Gemini 2.5 Flash-Lite with `responseMimeType:
  'application/json'` and the schema from §7.1 of long-term-strategy
- Validate response shape strictly (zod or hand-checks)
- Log to `ai_usage_logs`

Per long-term-strategy.md §7.1, **prompt is hashed and cached**
via MMKV — same `(goal, frequency, splitType, equipmentSet)` →
return cached result for **~70% Gemini cost reduction** on
repeated identical inputs.

**Critical contract**: Gemini outputs `repRangeMin/Max` and
`targetRPE` only. **Absolute kg is computed client-side** by C's
`recommendNextSet` from the user's `estimated_1rm`. This matches
the existing nutrition pipeline's discipline (LLM never decides
kcal).

#### 6.8.3 Client-side flow

1. **Settings → "ジム器具" 画面**
   (`app/(tabs)/settings/equipment.tsx`) — chip grid of the
   8 P-categories. Save creates/updates `user_equipment` rows.
2. **Training tab → "AI メニュー生成" ボタン** —
   modal with multi-select muscle groups, duration slider
   (30/45/60/90 min), goal type derived from profile.
3. **Quota indicator** — small badge "今月: 2/3 残り"
   (Free tier shown).

#### 6.8.4 Exercise matching

After AI returns `exerciseSlug` per block, lookup in `exercises`
by exact slug (works because A added `slug` column with stable
keys). If no match → fall back to `name_ja` LIKE match (one
result). If still no match → create a `custom_exercises` row
tagged `ai_generated:true` and use that id.

#### 6.8.5 Persistence
Generated menu saved as a `workout_routine` + N
`workout_routine_items` rows. Routine name auto-set:
`AI生成: 胸・三頭 (2026-05-06)`.

If C (recommendation) is shipped in the same build, set rows
created from the routine are auto-populated with Easy/Normal/Hard
chips when started.

#### 6.8.6 AI cost estimation (provisional Q7 quotas)

**Surfaced as required at implementation time** (per Q7 sign-off):
during 元 implementation reconnaissance, compute:

- Avg input tokens per request × Gemini 2.5 Flash-Lite input price
- Avg output tokens per request × output price
- Confirm provisional quotas (Free 3/mo, Plus 30/mo, Pro 100/mo)
  produce monthly cost the business can absorb at expected user
  count.

#### 6.8.7 Files
(All previously listed in original Part 6 except now augmented
with A's exercise schema as prereq.)

| Path | Status | Notes |
|---|---|---|
| `supabase/migrations/<ts>_user_equipment.sql` | new | server table + RLS |
| `supabase/functions/generate-workout-menu/index.ts` | new | Edge Function with cache + quota |
| `src/infra/repositories/userEquipmentRepository.ts` | new | CRUD |
| `src/infra/supabase/sync/userEquipmentSync.ts` | new | resource module |
| `src/infra/services/aiWorkoutService.ts` | new | client wrapper |
| `app/(tabs)/settings/equipment.tsx` | new | equipment editor |
| `app/(tabs)/settings/index.tsx` | edit | row "ジム器具" |
| `app/(tabs)/training/index.tsx` | edit | AI menu button + modal |

### 6.9 Feature 5 totals

| Sub-feature | Files (approx.) | LOC (approx.) | Effort (hr) |
|---|---|---|---|
| A — exercise DB | 5 + ~150-row data file | 600 + data | 10–19 |
| P — 8-cat equipment | 4 | 200 | (folded into A session) |
| B — 1RM table + history | 9 | 700 | 6–10 |
| O — set patterns | 5 | 300 | 6–8 |
| C — Easy/Normal/Hard | 6 | 400 | 10–15 |
| 元 — equipment + AI | 8 | 1200 | 20 |
| **Total Feature 5** | **~30 + seed data** | **~3,400** | **~60–80 hr** |

### 6.10 Out of scope (Feature 5 v1, deferred to Build 16+)

See Part 11 roadmap for placement. Briefly:
- D: RPE/RIR self-regression weight adjustment
- E: MEV/MAV/MRV volume dashboard
- F: Auto-deload scheduling
- G: Periodization presets (DUP, block, 3-7)
- H: Weekly AI report (workout + nutrition combined)
- I: Apple Watch / Live Activity
- J–N: leaderboards, percentile, /onerm SEO, PDF export, coach
  marketplace

---

## Part 7 — Cross-feature implementation plan

### 7.1 New Supabase migrations (6)

In recommended apply order:

1. `<ts>_auto_approve_public_foods.sql` — Feature 1 trigger
2. `<ts>_increment_public_food_use_count.sql` — Feature 3 prereq RPC
3. `<ts>_push_tokens.sql` — Feature 3 token table
4. `<ts>_notification_outbox.sql` — Feature 3 outbox + trigger
5. `<ts>_estimated_1rm.sql` — Feature 5-B server table
6. `<ts>_user_equipment.sql` — Feature 5-元 server table

### 7.2 New local SQLite migrations

- `v24.ts` — bundles all of Feature 5's local schema work:
  - ALTER `exercises` (slug / primary_muscle / movement_pattern /
    is_compound / rep_range_low+high / form_cue_ja / video_url) — A
  - UPDATE `exercises.equipment` to 8-cat enum — P
  - CREATE `estimated_1rm` table — B
  - ALTER `workout_sets` ADD COLUMN set_type — O
  - ALTER `workout_routine_items` ADD COLUMN set_pattern,
    pattern_config — O
  - ALTER `profiles` ADD COLUMN plate_step_kg — C
  - CREATE `user_equipment` table — 元

### 7.3 New Edge Functions (2)

1. `send-push-notifications` — Feature 3 cron sender
2. `generate-workout-menu` — Feature 5-元 AI generator

### 7.4 New client modules

**Cross-feature**:
- `src/infra/services/pushTokenService.ts` — Feature 3
- `src/hooks/usePendingSubmissionCount.ts` — Feature 4

**Feature 5 (multiple sub-features)**:
- `src/types/equipment.ts` — P
- `src/constants/equipment.ts` — P (8-cat enum)
- `src/types/workout.ts` augmented — A/O
- `src/domain/oneRepMax.ts` (or extend existing) — B
- `src/domain/workoutRecommendation.ts` (rirToPctOf1RM, recommendNextSet) — C
- `src/constants/setPatterns.ts` — O
- `src/infra/repositories/oneRepMaxRepository.ts` — B
- `src/infra/repositories/userEquipmentRepository.ts` — 元
- `src/infra/supabase/sync/estimatedOneRMSync.ts` — B
- `src/infra/supabase/sync/userEquipmentSync.ts` — 元
- `src/infra/services/aiWorkoutService.ts` — 元

**Seed data (Feature 5-A)**:
- `scripts/seed-exercises-v2/data.ts` — hand-authored 100–200 entries
- `scripts/seed-exercises-v2/run.ts` — idempotent runner

**Tests**:
- `src/domain/__tests__/oneRepMax.test.ts` — B
- `src/domain/__tests__/workoutRecommendation.test.ts` — C
- Sync module tests via standardSyncTests pattern — B / 元

### 7.5 Edited client modules (rough list)

- `src/infra/services/subscriptionService.ts` — Feature 2
- `src/infra/services/notificationService.ts` — Feature 3 opt-in
- `src/infra/sync/loginSyncBootstrap.ts` — Feature 3 register call
- `src/infra/supabase/sync/syncOrchestrator.ts` — Feature 5 modules (×2)
- `src/infra/repositories/nutritionRepository.ts` — Feature 3 RPC
- `src/infra/repositories/workoutRepository.ts` — Feature 5 (rowToExercise / addSet hook)
- `app/(tabs)/nutrition/index.tsx` — Feature 4
- `app/(tabs)/nutrition/add.tsx` — Feature 4
- `app/(tabs)/settings/index.tsx` — Feature 5 row
- `app/(tabs)/settings/notifications.tsx` — Feature 3 toggle
- `app/(tabs)/settings/subscription.tsx` — Feature 2 copy
- `app/(tabs)/settings/profile.tsx` — Feature 5-C plate-step picker
- `app/(tabs)/settings/equipment.tsx` (new) — Feature 5-元
- `app/(tabs)/training/index.tsx` — Feature 5 (chip filter / AI menu / pattern picker)
- `app/(tabs)/training/session.tsx` — Feature 5-C (3-chip strip)
- `app/(tabs)/progress/pr-detail/[exerciseId].tsx` — Feature 5-B (history chart)
- `app.config.ts` — Feature 3 plugin

### 7.6 New dependencies

- **None required**. expo-notifications, react-native-svg, MMKV
  (for AI prompt cache via existing Zustand persist) — all already
  installed.

### 7.7 Audit scripts

- Add `estimated_1rm` and `user_equipment` to `USER_PRIVATE_TABLES`
  in `scripts/check-soft-delete-filter.ts` and
  `scripts/check-enqueue-sync.ts`.
- Verify the audit PASS after each new sync module lands.

---

## Part 8 — Risk analysis

### 8.1 Per-feature risk summary

| Feature | Highest risk | Mitigation |
|---|---|---|
| 1 | Trigger fires on Service Role inserts (could mis-route Syuto's manual rows) | Document escape hatch in migration header |
| 1 | Client-supplied score is trusted | Accept for v1; future server-side scoring |
| 2 | None at code scope | — |
| 3 | APNs cert / EAS push setup | **Resolved** — confirmed bound to mealift |
| 3 | `use_count` update was missing — hidden prereq | Surfaced in 4.3.2; included in scope |
| 3 | Notification fatigue | Q5 sign-off: first use only in v1 |
| 4 | `add.tsx` complexity (1300+ lines) | Recon-first inside session |
| 5-A | Hand-authoring 100–200 exercise rows | Batched authoring, each batch reviewed before next |
| 5-A | Form cues legally safe (no trademarked method names) | Generic descriptions; long-term-strategy.md §4.5 |
| 5-P | Existing equipment values must map cleanly | Pre-list `SELECT DISTINCT`; fall through to 'other' |
| 5-B | `estimateOneRepMax` may already exist in `personalRecord.ts` | Recon at implementation; refactor not duplicate |
| 5-C | rirToPctOf1RM table accuracy debated | Helms/RTS values; tunable post-launch |
| 5-O | Drop-set UX subtle on real device | Prototype on device early; not just simulator |
| 5-元 | AI cost / abuse | Edge Function quotas + MMKV prompt cache (~70% reduction per long-term-strategy §7.1) |
| 5-元 | AI output quality (rep ranges off-base) | Strict response schema validation; user-editable |
| 5-元 | Exercise matching collisions | Slug-based exact match (added in A) > name LIKE > custom_exercise fallback |
| 5 (overall) | Sync registry change × 2 | Update audit scripts before commit |

### 8.2 Build-15-scope-level risks (new with Feature 5 expansion)

#### Risk: Build size now exceeds Cloud Sync (60–80 hr)

Build 15 realistic estimate **76–96 hr** vs. Cloud Sync's actual 25 hr
(though Cloud Sync's pessimistic estimate was 110 hr, so the hour-count
isn't unprecedented). Implication:

- **Implementation period long**: 9 sessions, multiple weeks calendar time.
- **Higher risk of context loss between sessions**:
  `project_build_15_progress.md` is critical — must be kept current.
- **Higher risk of sub-feature interactions**: A's slug column changes
  affect every other Feature 5 sub-feature; touching A late in the build
  would cascade.

**Mitigation**: front-load A in Feature 5's session order (S5 starts
with A). Hard-stop after A lands so Syuto can verify exercise DB shape
before B/C/O/元 are built on top.

#### Risk: Feature 5 internal sub-feature interactions

Six sub-features × multiple cross-references = combinatorial test
surface:

- A's `slug` column → P's UPDATE → 元's exercise lookup
- A's `primary_muscle` → AI menu prompt input
- B's `estimated_1rm` → C's recommendation → 元's session usage
- O's `set_pattern` → routine_item shape → session render

**Mitigation**:
- Strict per-sub-feature commit boundary; each commit independently
  tsc + jest + audit clean.
- A is foundation — extra test coverage here pays back across all
  others.
- Hard stop after each sub-feature commit; verify on real device
  before stacking the next.

#### Risk: Hand-authoring 100–200 exercise entries

This is **data work, not engineering**. Realistic split:

- 30 min per batch of 10–15 entries (lookup form cue, equipment
  category, primary muscle, etc.)
- 7–14 batches → 4–7 hr just for data authoring
- Risk: bad data slips in and gets seeded with stable IDs, hard to
  fix later.

**Mitigation**:
- Author in batches. Run jest validator (separate test file
  validating each entry's `equipment ∈ EQUIPMENT_CATEGORIES`,
  `primary_muscle ∈ enum`, etc.) on every batch.
- `ON CONFLICT DO UPDATE` lets us re-seed corrected rows after
  the build ships, but this is best avoided.
- Consider machine-assisting via existing `exercises` row data
  (already has muscle_group, equipment) — augment manually rather
  than author from scratch.

#### Risk: AI cost increase (now 2 AI features)

Pre-build-15: 2 Edge Functions (estimate-nutrition, nutrition-advice).
Post-build-15: 3 (+ generate-workout-menu). AI cost roughly doubles
at parity usage.

**Mitigation**:
- MMKV prompt cache for menu generation (long-term-strategy §7.1
  estimates 70% reduction).
- Strict per-tier quotas in the Edge Function (Q7 provisional:
  Free 3/Plus 30/Pro 100 per month — confirm during 元
  implementation reconnaissance).
- Surface estimated monthly cost during 元 hard stop so Syuto can
  approve the spend before it ships.

### 8.3 Existing-feature impact

- **Cloud sync layer**: Feature 5 adds **two new resource modules**
  (`estimated_1rm`, `user_equipment`). The pattern is well-established.
  Add to audit scripts before commits 8 / 11.
- **Auth flow**: Feature 3 adds a registration step inside
  `loginSyncBootstrap`; failure is non-fatal.
- **Subscription gates**: Feature 2 unlocks barcode for free; no
  other gate changes.
- **Existing reminders**: Feature 3's notification work doesn't
  touch the existing local-scheduled reminders.
- **Existing personal record logic**: Feature 5-B may overlap with
  current `personalRecord.ts` / `oneRepMax.ts`. Recon to avoid
  duplication.
- **Existing routine creation modal (post Phase-9)**: Feature 5-O
  adds a pattern chip; structure is the same stage-swap modal from
  Phase 9.

### 8.4 Things that look risky but aren't

- **Push token rotation**: Expo handles this; we re-register on
  every login, which catches rotation naturally.
- **Multiple devices**: handled by the `push_tokens` table design
  (one row per device).
- **Negative `approval_score`**: scorer guarantees [0, 100]; trigger
  treats anything below 50 as rejection. Defensive `coalesce(score, 0)`
  in the trigger if Syuto wants to be paranoid.
- **Slug stability**: stable UUIDs derived from SHA(slug) means
  re-running the seed produces the same IDs even if the data file
  is reordered. Safe.

---

## Part 9 — Recommended commit strategy

Follow the Phase 6-A through 6-E pattern from cloud-sync: many small
commits, each independently green (tsc + jest + audits), each with a
hard-stop boundary.

### 9.1 Suggested commit chunks

| # | Commit | Hard stop after? |
|---|---|---|
| 1 | `feat(subscription): unlock barcode scanner for free tier` | No |
| 2 | `feat(nutrition): My Submissions discoverability + add-screen entry` | No |
| 3 | `feat(submissions): auto-approval trigger on public_foods` | **Yes** — verify SQL applied |
| 4 | `feat(submissions): server-side use_count increment RPC` | No |
| 5 | `feat(notifications): push token storage + client registration` | No (EAS push pre-confirmed) |
| 6 | `feat(notifications): outbox + send Edge Function + cron` | **Yes** — first push received |
| 7 | `feat(notifications): in-app opt-in toggle` | No |
| 8 | `feat(workout): exercises schema v24 + 100–200 entry seed (A)` | **Yes** — exercise DB shape verified |
| 9 | `feat(workout): equipment 8-cat enum + chip filter (P)` | No |
| 10 | `feat(workout): estimated_1rm table + history chart (B)` | No |
| 11 | `feat(workout): set patterns 5×5 / top set / drop set (O)` | No |
| 12 | `feat(workout): Easy/Normal/Hard 3-chip recommendation (C)` | No |
| 13 | `feat(equipment): user_equipment table + repo + sync module + settings UI` | No |
| 14 | `feat(workout): AI menu generation Edge Function + client wrapper` | **Yes** — first AI call works |
| 15 | `feat(workout): AI menu UI + routine persistence` | **Yes** — full feature |

15 commits total. Hard stops at **3 / 6 / 8 / 14 / 15** for: SQL apply
verification, first push received, exercise DB shape verification,
first AI call success, full Feature-5 ship-ready.

### 9.2 Per-commit checklist

For every commit:
- `npx tsc --noEmit` clean
- `npx jest --silent` all green
- `npx tsx scripts/check-soft-delete-filter.ts` PASS
- `npx tsx scripts/check-enqueue-sync.ts` PASS
- `git push origin main` attempt

Audit scripts must include the new tables before commits 10 (B —
adds `estimated_1rm`) and 13 (元 — adds `user_equipment`).

### 9.3 Rollback safety

- Features 1, 2, 4 are fully reversible at the commit level.
- Feature 3 reverting requires:
  - Drop the cron schedule
  - Drop `notification_outbox` and `push_tokens` tables
  - Revert the client (which becomes silently no-op without the tables)
- Feature 5 reverting is **the most expensive**:
  - Revert v24 migration (drops new columns + tables)
  - Drop `estimated_1rm`, `user_equipment` server tables
  - Drop the Edge Function
  - Revert the client (~3,400 LOC across ~30 files)
  - Re-seed exercises table to pre-build-15 shape

All migrations should be additive (CREATE TABLE IF NOT EXISTS,
ALTER TABLE ADD COLUMN IF NOT EXISTS) so a re-apply is safe; this
also means rollback requires explicit reverse migrations, not just
"don't apply". Recommend documenting rollback SQL inside each
migration's header comment.

---

## Part 10 — Effort estimate

Time budget per feature, with Feature 5 broken down by sub-feature
following the §1.1 dependency order:

| Feature | Optimistic | Realistic | Pessimistic |
|---|---|---|---|
| 1 — Auto-approval trigger | 30 min | 2 hr | 4 hr (if threshold tuning needed) |
| 2 — Barcode free | 15 min | 30 min | 1 hr |
| 3 — Push notifications | 6 hr | 12 hr | 18 hr (APNs already pre-confirmed → less pessimistic than original estimate) |
| 4 — Discoverability UI | 1 hr | 2 hr | 4 hr (add.tsx complexity) |
| **5 (total)** | **40 hr** | **60–80 hr** | **100 hr** |
| ↳ A — exercise DB + 100-200 row seed | 6 hr | 10–14 hr | 19 hr |
| ↳ P — equipment 8-cat enum + chip filter | 1 hr | 2–3 hr | 5 hr |
| ↳ B — 1RM table + history chart | 4 hr | 6–10 hr | 12 hr |
| ↳ O — set patterns | 4 hr | 6–8 hr | 10 hr |
| ↳ C — Easy/Normal/Hard recommendation | 6 hr | 10–15 hr | 18 hr |
| ↳ 元 — equipment registration + AI menu | 12 hr | 20 hr | 30 hr |
| **Total build 15** | **~50 hr** | **~76–96 hr** | **~127 hr** |

Comparison to prior builds:
- Cloud Sync (build 14): 40 hr opt / 70 hr realistic / 110 hr pess.
  **Actual ~25 hr** (well under estimate due to clean recon-first
  process).
- Build 15: **realistic estimate larger than Cloud Sync's** because
  Feature 5 alone matches Cloud Sync in scope. Apply same
  recon-first discipline; actual may run shorter, but plan for the
  full estimate.

### 10.1 Session count and split

At 4-5 hr / session, realistic = **9 sessions**. Order:

| Session | Sub-features | Effort (realistic) |
|---|---|---|
| 1 | Feature 2 (barcode free) + Feature 4 (UI discoverability) | 4 hr |
| 2 | Feature 1 (auto-approval trigger) + Feature 3 prereq RPC | 5 hr |
| 3 | Feature 3 — push token storage + client registration | 6 hr |
| 4 | Feature 3 — outbox + Edge Function sender + cron + opt-in toggle | 6 hr |
| 5 | Feature 5-A (exercise DB + seed) + Feature 5-P (equipment 8-cat) | 12–17 hr ⚠ may overflow into S5b |
| 6 | Feature 5-B (1RM table + history) + Feature 5-O (set patterns) | 12–18 hr ⚠ may overflow |
| 7 | Feature 5-C (Easy/Normal/Hard recommendation) | 10–15 hr |
| 8 | Feature 5-元 (equipment registration + AI menu generation) | 20 hr |
| 9 | Polish, regression-fix, full E2E real-device verification | 4-8 hr |

Sessions 5/6/8 have the highest overflow risk — large sub-features.
Acceptable to split S5/S6/S8 into half-sessions during implementation
if tiredness or scope creep show up.

### 10.2 Hard-stop discipline

Per `feedback_hard_stop_at_risk_boundaries.md`, halt and surface
sign-off prompt at:

- **Before applying SQL to Supabase** (Features 1, 3 ×3, 5 ×3)
- **After first push notification successfully arrives on device**
  (Feature 3)
- **After Feature 5-A exercise DB seed lands** — Syuto verifies
  100–200 row data is correct shape before B/C/O/元 stack on top.
  Single most leverage-able hard stop in Feature 5.
- **After first AI menu generates successfully end-to-end**
  (Feature 5-元)
- **Before Feature 5's sync registry change commits** —
  audit scripts must already include the new tables.

Total: 5 mandatory hard stops (was 5 pre-expansion, but the boundaries
shifted with Feature 5's expansion).

---

## Part 11 — Roadmap beyond Build 15

The Gymwork research (`docs/long-term-strategy.md`) surfaces a much
larger feature space than build 15 can absorb. To keep build 15
focused, the following sub-features are explicitly **out of scope**
for build 15 and tagged for future builds. This list is the
roadmap's "what we know we want eventually" — sequencing and
scoping each will require its own design pass.

| Code | Sub-feature | Source (long-term-strategy.md) | Tentative build |
|---|---|---|---|
| **D** | RPE/RIR self-regression weight adjustment (auto-bump e1rm by ±0.5–1.0% based on logged RPE vs. target) | §7.3 update logic | **Build 16** |
| **E** | MEV/MAV/MRV volume dashboard (per-muscle weekly hard-set count vs. RP landmarks, color-coded green/yellow/red) | §7.5 + table | **Build 16–17** |
| **F** | Auto-deload scheduling (4-week MAV breach → schedule next week as deload at 50% volume / 50% intensity) | §7.5 deload rule | **Build 17+** |
| **G** | Periodization presets (DUP, block periodization, 3-7-style high-rep block — generic-named to avoid trademarks) | §7.6 preset list | **Build 18+** |
| **H** | Weekly AI report combining workout + nutrition (cross-domain insights: "今週の三角筋ボリュームが MEV 未達、タンパク質摂取は十分") | §7.6 Pro tier, §7.8 integration | **Build 18+** |
| **I** | Apple Watch / iOS Live Activity (rest timer continues on watch face, set logging via wrist) | §7.4 + §10 caveats | **Build 19+** (needs Swift companion) |
| **J** | Friend leaderboard by **volume** (not absolute weight — protects light lifters) | §8 #6 | **Build 20+** |
| **K** | Global percentile display per exercise + sex × bodyweight cohort | §2.6 + §8 #8 | **Build 20+** |
| **L** | `/onerm` SEO calculator on public website (Japanese keyword targeting) | §8 #7 | **Build 20+** (web, not app) |
| **M** | Coach / PT PDF export (export a workout history as a printable summary) | §7.6 Pro feature | **Build 20+** |
| **N** | Coach marketplace + revenue share (Gymwork's collateral: $9.9/mo Pro bundle of all coach programs) | §3.3 | **Build 21+** (high-effort, low-margin per §10 caveat) |

### 11.1 Suggested build cadence

| Build | Theme | Key sub-features |
|---|---|---|
| 16 | Self-regression + volume awareness | D + E (MEV/MAV/MRV dashboard read-only) |
| 17 | Deload + recovery | F (auto-deload) + extension of E (deload visual on volume chart) |
| 18 | Programming sophistication | G (periodization presets) + H (cross-domain weekly AI report) |
| 19 | Native platform integration | I (Apple Watch / Live Activity) — biggest engineering jump |
| 20 | Social + acquisition | J (volume leaderboard) + K (global percentile) + L (SEO `/onerm`) + M (PDF export) |
| 21+ | Coach economy | N (coach marketplace) — only after the above features prove user retention |

### 11.2 What stays out of the foreseeable roadmap

- **Apple Watch native app** beyond Live Activity (full standalone
  watchOS app) — requires Swift companion target, breaks Expo
  managed workflow assumption. Reconsider only if iPhone-side data
  shows the watch is a major retention driver.
- **AI-driven form correction from camera** (rep counting, ROM
  validation) — significant ML effort, niche use case.
- **Pre-curated coach programs** by Japanese influencers (Yamamoto
  / Okada / Ishii etc.) — long-term-strategy.md §4.5 + §10 flag
  this as IP-risky without explicit licensing. Build only after
  legal sign-off.

### 11.3 How this roadmap evolves

The list above is a **snapshot of intent**, not a commitment.
Re-evaluate after each build ships:

- Production metrics from build 15's Feature 5 will inform whether
  D / E rank above other priorities.
- User-feedback survey post-launch may surface unforeseen requests
  that displace items.
- AI cost economics may force revisiting H's tier placement
  (e.g. Pro-only weekly report → all-tier monthly report).

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
4. **`exercises.equipment` is free-form text**. Build 15-P normalizes
   to an 8-category enum via in-place UPDATE in v24. Existing rows
   not covered by the explicit IN list fall through to 'other'.
5. **No `expo-notifications` plugin config in `app.config.ts`**. Phase
   3-A added Apple Sign In but didn't touch notifications. Will need
   adding for Feature 3.
6. **Phase 8's `loginSyncBootstrap.runLoginSync` is the natural seam
   for push-token registration** — already the place where
   per-login post-auth work happens.
7. **`personalRecord.ts` may already implement `estimateOneRepMax`**
   (referenced from training/session.tsx imports). Recon at Feature
   5-B implementation; refactor or extend rather than duplicate.
8. **Edge Function pattern is well-established**:
   `supabase/functions/{estimate-nutrition,nutrition-advice}` use
   Gemini 2.5 Flash-Lite, ai_usage_logs quota tracking, JSON-schema
   responses. Feature 5-元's `generate-workout-menu` should mirror
   this exactly, including the `ai_usage_logs` row per call.
9. **`react-native-svg` already installed**: VolumeChart uses it.
   Feature 5-B's e1rm history chart can use the same library — no
   new dependency.
10. **Gymwork research caveats** (`docs/long-term-strategy.md` §10):
    Gymwork's exact algorithms are non-public; the rirToPctOf1RM
    table values come from Helms/RTS not Gymwork. Implementation
    must not claim to "match Gymwork" — claim "informed by industry
    standards" instead. Avoid trademarked method names (101メソッド,
    3-7法) per §4.5.

## Appendix B — Open questions for Syuto

**Status (post Feature 5 expansion, 2026-05-06)**: Q1–Q10 from the
original design were signed off in the design session prior to this
expansion. The expansion of Feature 5 from `~20 hr` to `60–80 hr`
introduces new questions worth surfacing before implementation begins.

### B.1 Pre-expansion questions (signed off — see project memory)

Original Q1–Q10 covered: threshold tuning, pending row backfill,
barcode messaging, APNs cert, use_count thresholds, equipment data
model α vs β, AI cost gating, menu refinement UX, implementation
order, hard-stop list. **All signed off in the design session prior
to this expansion.** Captured in `project_build_15_progress.md`.

### B.2 New questions raised by Feature 5 expansion

11. **Exercise DB seed authoring approach** — author from scratch
    (4–7 hr) or augment existing `exercises` rows by adding the new
    columns (faster, but data quality depends on existing rows)?
    Recommend augment-existing as starting point, then top up to
    100–200 entries.
12. **rirToPctOf1RM table values** — start with Helms/RTS standard
    table (recommended), or use a published variant (Zourdos)? They
    differ slightly. Pick once, tunable later.
13. **Plate-step settings default** — JP gym standard 2.5 kg, but
    home users / Olympic-equipped lifters may prefer 1.25 / 0.5.
    Default 2.5 with picker exposed in settings?
14. **Form cue authoring source** — public-domain references
    (NSCA Essentials, ACSM) vs paraphrasing licensed material
    (Yamamoto / Okada works)? Recommend public-domain only to
    avoid IP risk.
15. **Sub-feature commit granularity** — 15-commit plan in §9.1
    matches Cloud Sync's granularity. Acceptable, or want to
    bundle (e.g. "Feature 5-A + P in one commit")?
16. **Build 16+ priority** — Part 11 puts D + E together as
    Build 16. Confirm or reorder? (RPE adjustment vs volume
    dashboard — which is more user-visible value?)
17. **AI-cost surfacing** — for Feature 5-元's generate-workout-menu,
    surface per-call cost estimate before committing the quota
    constants (Q7 said "confirm during recon"). Acceptable to
    halt for sign-off when those numbers are in, or pre-approve
    "any sub-1¢ per call → ship"?
