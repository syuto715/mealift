# Auth Session Persistence Fix — Tier 1 ship, Tier 2 v1.4 defer

## Status

- **Phase 9.1.5** (Build 15, commits `b5a57d0` + `e6baa05`) — storage adapter
  + processLock fix. **Shipped**.
- **Tier 1** (server-side Supabase dashboard
  `refresh_token_reuse_interval` 0 → 10s) — **applied for v1.3.0**, executed
  by Syuto-san in Supabase dashboard. No code change.
- **Tier 2** (client-side recovery wrapper) — **attempted in commit `f541d75`,
  reverted in `ba5732b`**. Wrong SDK boundary; see "Architectural learning"
  below.
- **Tier 3** (move `startAutoRefresh` out of module-load) — deferred to v1.4.

## Background

`Auth Session Persistence Bug — Recon Report` (separate recon thread)
identified two root cause candidates for the "session lost on cold start"
symptom that survived Phase 9.1.5:

- **Candidate A — single-use refresh token race**: client commits token
  rotation, network blip drops the response, AsyncStorage still has the
  previous (now invalidated) token. Next cold start tries to refresh with
  the stale token, server rejects with `refresh_token_already_used`,
  supabase-js fires SIGNED_OUT internally and clears AsyncStorage.
- **Candidate B — module-load timing**: `client.ts` kicks `startAutoRefresh`
  at module evaluation, BEFORE `app/_layout.tsx` subscribes
  `onAuthStateChange`. A SIGNED_OUT event fired during that window is
  observed by nothing; only the AsyncStorage cleanup is permanent.

## Tier 1 — server-side fix (applied for v1.3.0)

Supabase dashboard → Auth → Refresh Tokens → **Reuse Interval = 10 seconds**.

Effect: when the server rotates a refresh token, the previous token stays
valid for 10s. Absorbs the network jitter window during which the client
may not have committed the response. Closes ~90% of Candidate A.

No code change. Apple reviewer flow unaffected.

## Tier 2 — attempted + reverted (v1.4 defer)

### Commit `f541d75` (reverted in `ba5732b`)

Implemented `startAutoRefreshWithRecovery` wrapper + `isTransientRefreshError`
3-layer classifier at `src/infra/supabase/client.ts`. 18 new test cases.
Initial design passed tsc, jest 3-zone, and audits.

### Why it was reverted (Codex review pass 1, Critical)

The wrapper attached `try/catch` around `supabase.auth.startAutoRefresh()`,
assuming that call returns a Promise that rejects on refresh failure.
**The SDK contract is different**:

Source: `node_modules/@supabase/auth-js/src/GoTrueClient.ts:4762-4793`
(`_startAutoRefresh`) and `:4913-4962` (`_autoRefreshTokenTick`):

1. `startAutoRefresh()` → `_startAutoRefresh()` only:
   - Stops any existing ticker
   - Creates `setInterval(..., AUTO_REFRESH_TICK_DURATION_MS)` →
     fires `_autoRefreshTokenTick` periodically
   - Creates `setTimeout(async () => await _autoRefreshTokenTick(), 0)` →
     fires the first tick async
   - **Returns** — does NOT await the refresh

2. The actual refresh happens inside `_autoRefreshTokenTick`:
   - Acquires lock
   - Conditionally calls `_callRefreshToken` if token is close to expiry
   - **Catches its own errors** at line 4946:
     `console.error('Auto refresh tick failed with error. ...', e)`
   - **Does NOT re-throw to the caller**

3. When `_callRefreshToken` fails with a real refresh-state error
   (`refresh_token_already_used` etc.), the SDK clears the session
   internally and fires SIGNED_OUT to its `onAuthStateChange` subscribers.
   The original `startAutoRefresh()` promise has already resolved — there's
   nothing for the `try/catch` wrapper to catch.

The 18 tests passed because the mock
`mockStartAutoRefresh.mockRejectedValueOnce(apiError)` made `startAutoRefresh`
itself reject. That **does not match SDK behavior** in production — refresh
errors propagate via `console.error` + SIGNED_OUT event, not via the
`startAutoRefresh` promise.

The wrapper was effectively a no-op for the symptoms it was supposed to
recover from. Reverted to avoid shipping misleading code that violates the
Pattern 18 SSoT / Pattern 25 helper-thick discipline the rest of the
codebase maintains.

### Proper Tier 2 design (v1.4)

Correct interception point is the **`onAuthStateChange` listener in
`app/_layout.tsx`**:

1. Observe SIGNED_OUT events
2. Before propagating `setUnauthenticated`, probe storage/network for a
   recoverable session (e.g., re-call `getSession()` once with a small
   delay to see if AsyncStorage has been re-populated by a concurrent
   refresh on a different path; or capture telemetry on the SIGNED_OUT
   reason)
3. If recoverable → re-emit SIGNED_IN; otherwise propagate normally

Or alternative: hook a Tier 2 retry into the SDK's `onAuthStateChange`
event metadata (some SDK versions provide refresh-failure detail on the
event object) to distinguish transient SIGNED_OUT from explicit logout.

Test infrastructure prerequisites:
- **RNTL preset** (Build 15+ TODO 12) so the listener boundary can be
  exercised with `<RootLayout />` rendered under test instead of
  module-load wiring only
- **Cold-start hydration test pin** (deferred Codex Important #2 from
  `e6baa05`) — the actual regression scenario (saved session →
  cold start → home / expired refresh → graceful re-login prompt) must
  be pinned at the bootstrap level, not just at the wiring layer

### Optional Tier 3 bundle for v1.4

Move `startAutoRefresh` out of `client.ts` module-load into
`app/_layout.tsx` initialize() **after** `onAuthStateChange` is subscribed.
SIGNED_OUT events from the first refresh tick become observable from the
start, eliminating Candidate B entirely. ~20 LOC change, but ripples
into the existing wiring tests; better bundled with the proper Tier 2
design + RNTL preset rather than shipped piecemeal.

## v1.3.0 ship verification

Tier 1 alone is the v1.3.0 mitigation. Verification gate:

1. Manual dogfood (Syuto, iOS device):
   - Force-quit + relaunch × 10 → logged-in state should persist on all 10
   - Background → foreground × 5 → state should persist
   - Airplane mode toggle → graceful behavior (recover when online, or
     graceful SIGNED_OUT with re-login prompt; no infinite spinner)
2. If symptom drops substantially (e.g., 0/10 instead of "almost every time"),
   Tier 1 is doing the work. Ship v1.3.0.
3. If symptom persists, escalate to Tier 2 proper design before EAS build.

## Architectural learning

### Pattern: SDK contract verification before client-side wrapper design

The Tier 2 attempt was a documented **drafting failure mode** where:

1. **Recon-first culture caught a surface improvement**: agent recon
   discovered the SDK exports structured `isAuthApiError` /
   `isAuthRetryableFetchError` predicates + `ErrorCode` union, which is
   superior to substring matching for classification (Pattern 18 SSoT).
2. **But did NOT verify the underlying assumption** that
   `startAutoRefresh()` rejects on refresh failure. The wrapper was built
   around a `try/catch` that the SDK never reaches.
3. **Codex pass 1 caught it** by tracing the SDK source to
   `_autoRefreshTokenTick`'s internal `try/catch` that swallows the
   error.

The pattern: **even when recon-first finds an architectural improvement,
verify the underlying assumption about WHERE the error actually flows in
the SDK before designing the interception layer.** A wrapper at the wrong
boundary fails silently in production while passing internally-consistent
tests.

For future client-side wrappers around third-party SDKs:
- Trace at least one full failure path through the SDK source before
  committing to a wrapper boundary
- Verify the error-propagation model: synchronous throw, async promise
  rejection, event-bus dispatch, or internal log-and-swallow
- Match the wrapper's `try/catch` (or listener) boundary to the actual
  propagation model

### Pattern: agent + Codex pair as architectural integrity guardrails

This is the second observed case (after Phase E-3 audit's 70% false-
positive rate) of the agent recon + Codex pair catching an issue before
ship:

- **E-3**: agent recon flagged false-positive a11y / TZ gaps; manual
  verification confirmed baseline solid. False positives ARE a positive
  maturity signal (audit hits existing hardening).
- **Tier 2 attempt**: agent recon caught a surface improvement
  (structured API vs substring); Codex pass 1 caught the deeper SDK-
  contract mismatch. Recon catches the first-order issue; Codex catches
  the second-order assumption.

Sign-off discipline: when Codex pass 1 returns Critical, **halt + surface
to user**, do not implement a fix-on-top. The user's instruction
"hard-stop at risk boundaries" applied here: I surfaced the Critical
finding + 3 options, awaited GO, and revert was the user's choice.

## Open items (carried to v1.4)

- Tier 2 proper design at `onAuthStateChange` listener boundary
- Tier 3 startAutoRefresh placement reorder (module-load → _layout.tsx)
- RNTL preset (Build 15+ TODO 12)
- Cold-start hydration test pin (Codex Important #2 from `e6baa05`)
- Auth telemetry hook (capture SIGNED_OUT reason for production debugging)
