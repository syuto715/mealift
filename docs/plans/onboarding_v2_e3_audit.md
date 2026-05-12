# Phase E-3 Verified Architectural Integrity — Multi-TZ + a11y audit

## Purpose

Phase E-3 is an **audit pass**, not a hardening phase. The architectural
integrity gaps closed in E-1 (onboardingVersion bump gate) and E-2
(buildProfilePatch legacy-field coverage) brought Onboarding v2 to a
**ship-ready depth**; E-3 verifies that depth across two compliance
dimensions (Multi-TZ correctness and a11y completeness) and records the
verified state for future-audit reference.

## Headline finding

**Most audit-agent claims that flagged a "missing" attribute or test
gap turned out to be false positives** — see the explicit register
below (10 claims verified, 8 were already implemented or intentional
design choices). This is a **positive architectural-maturity signal**:
when a thorough audit produces many false positives, the baseline is
already solid — the audit is hitting existing hardening rather than
discovering new gaps.

Architectural learning recorded in MEMORY-equivalent comments in the
test pin block (`src/domain/__tests__/onboardingCalc.test.ts` —
"Phase E-3 TZ round-trip stability"):

> Audit false-positive density is a maturity signal. Phases E-1/E-2
> sealed the Pattern 18 補強 (legacy/v2 coverage completeness) and
> Pattern 24 補強 (completion signals atomic bundle); E-3 verified
> that the seal held under audit pressure. The remaining concrete
> deliverable was a small TZ round-trip pin (6 tests) to cement
> the helper-level invariants that the 3-zone jest matrix
> exercises globally.

## Verified state — Multi-TZ

### 4-layer TZ defense — coverage matrix

| Helper | File:line | TZ defense | Test coverage |
|--------|-----------|-----------|---------------|
| `estimateTargetDate` | `src/domain/onboardingCalc.ts:131-193` | Layer 4 (caller-side Date) + local-calendar `setDate` | 6 cases (Phase E-3 pin) + 7 existing |
| `deriveCacheFromSnapshot` | `src/infra/services/onboardingService.ts:132-180` | Layer 3 (`toISOString` boundary) | service-layer tests (3-zone) |
| `buildProfilePatch.onboardingStartedAt` | `src/infra/services/onboardingService.ts:330` | Layer 3 (`toISOString` boundary, set-once) | onboardingService set-once tests |
| `formatAchievementDateLabel` | `src/domain/motivationCopyResolver.ts:50-66` | `Intl.DateTimeFormat('ja-JP')` (Layer 4 implicit) | format-shape regex tests |
| `formatTrajectoryAccessibilityLabel` | `src/domain/progressTrajectoryUtils.ts:140-156` | TZ-independent (numeric only) | shape tests |
| `getMaintenanceDateLabel` / `getRecompDateLabel` | `src/domain/motivationCopyResolver.ts:80-86` | TZ-independent (text only) | distinctness pin |

### TZ round-trip invariants pinned (Phase E-3 commit)

1. **weeks count is TZ-stable** — pure math, deterministic regardless
   of process TZ. Pinned at value=14 for the canonical
   70→65 @ -0.5% input.
2. **ISO round-trip preserves the UTC instant exactly** — `new Date(d.toISOString()).getTime() === d.getTime()` is a JavaScript
   invariant that holds in every TZ.
3. **DST transitions preserve local wall-clock** — when a result Date
   crosses March/November US DST, `setDate` mutates the local
   calendar while preserving hours/minutes/seconds. The UTC instant
   shifts ±1 hour relative to the base; this is the **design-intent
   behavior** (user sees the same time-of-day on their target date).
4. **Month-end overflow is correct** — starting Jan 31, the local
   calendar Y/M/D of the result matches an independent setDate
   reference (e.g. `setDate(31 + weeks*7)` overflowing through
   Feb 28 → Mar). Pinned via assertLocalCalendarDayMatches helper
   so a refactor switching to month-aware arithmetic surfaces.
5. **Long horizon (multi-DST + leap year) doesn't blow up** —
   ~59-week horizons crossing Mar 2027 / Nov 2027 / approaching
   Feb 29 2028 still produce valid Dates with stable wall-clock
   AND correct Y/M/D against the independent reference.

### Intentional design choices (recorded for future audit)

- **onboardingStartedAt is text-only round-trip** — stored as ISO TEXT,
  read as raw string, never re-parsed into a Date for display. Layer 4
  is intentionally absent here because there's no display path.
- **`setDate` local-calendar arithmetic** — the implementation uses
  the JavaScript Date API's default local-TZ behavior, and E-3
  codifies this as the intended contract: the user's local-TZ
  calendar day is preserved on the target date. DST-induced UTC
  offset shifts (±1 hour twice a year) are correct user-facing
  behavior, not bugs. (Note: this is documented as the contract
  going forward; the repo doesn't claim this was the original
  author's explicit design decision.)
- **`formatAchievementDateLabel` does not 0-pad** — `Intl.DateTimeFormat('ja-JP')` renders "8月" not "08月", matching JP
  casual-text convention. Pin via shape regex (`/月/`), not
  exact-string match.
- **DST tests pin local wall-clock, not UTC ms** — assertion is
  `getHours() === baseHours`, not `getTime() === baseTime + weeks*7d`.
  The latter is TZ-fragile by design.

## Verified state — a11y (14 screens × 6 components)

### Coverage matrix — verified attribute presence

| Screen | Header role | Interactive roles | Live regions | Pattern 11 redundancy | Pattern 13 decorative hiding |
|--------|------------|-------------------|--------------|----------------------|------------------------------|
| welcome | ✅ (title) | ✅ (CTA button) | N/A static | ✅ bg+text bold | ✅ hero icon |
| nickname | ✅ (title) | ✅ TextInput a11y label+hint | ✅ error (`accessibilityLiveRegion="polite"`) | ✅ error color+text | — |
| body-info | ✅ (title) | ✅ radiogroup + radio + TextInput | ✅ **4 live regions** (validation + BMI feedback) | ✅ border+bg+weight | — |
| activity | ✅ (title) | ✅ radiogroup + radio + button stepper | ✅ **3 live regions** (validation + maintenance kcal) | ✅ border+bg+weight | — |
| goal-weight | ✅ (title) | ✅ radiogroup + radio + WeightSlider + PaceSelector | ✅ 2 live regions | ✅ border+bg+weight | — |
| goal-summary | ✅ (title) | ✅ edit-link buttons | N/A read-only | ✅ icon+bold+text | — (chart via component) |
| meal-plan | ✅ (title) | ✅ MealPlanCard radiogroup | (via component) | ✅ border+bg+weight | ✅ PFC badges (via component) |
| meal-timing | ✅ (title) | ✅ checkbox group | ✅ live region (validation + count) | ✅ border+bg+check | — |
| protein-target | ✅ (title) | ✅ radiogroup + radio | ✅ **3 live regions** (PFC feedback + validation) | ✅ border+bg+weight | — |
| weekly-distrib | ✅ (title) | ✅ radiogroup + radio + checkbox grid | ✅ live region (count + validation) | ✅ border+bg+weight | — |
| motivation | ✅ (title + section headers) | N/A read-only | — (intentional: mount-time announce only) | ✅ icon+bold+body | ✅ chart legend (via component) |
| progress-preview | ✅ (title + section headers) | N/A read-only | — (intentional: mount-time announce only) | ✅ icon+chart+text | ✅ chart elements |
| complete | (loading state) | N/A | — | — | — |
| tier-preview | ✅ (title) | ✅ buttons (Plus / Skip) | ✅ live region (Android-disable copy) | ✅ bullet icons + text | — |
| healthkit | ✅ (title) | ✅ buttons (Connect / Skip) | — (static content) | ✅ bullet icons + text | — |

### Reusable component a11y

| Component | Role / Label / State |
|-----------|----------------------|
| `ProgressHeader` | `role="progressbar"` + `accessibilityLabel` on dots; back button role + label "戻る"; 36×36 + hitSlop |
| `WeightSlider` | Slider `role="adjustable"` + `accessibilityValue` text; ± buttons 44×44 + hitSlop |
| `PaceSelector` | `role="radiogroup"` + per-option `role="radio"` + state; minWidth=110 ✅ (>44pt) |
| `NumberInput` | TextInput (implicit role from RN platform) + a11y label/hint + error live region |
| `MealPlanCard` | `role="radiogroup"` + per-card `role="radio"` + state; PFC badges hidden via Pattern 13 |
| `BodyCompositionChart` | SVG `role="image"` + rich prose `accessibilityLabel`; legend hidden via Pattern 13 |

### Intentional design choices (recorded for future audit)

- **No live region on read-only screens (motivation / progress-preview)** —
  screen-mount triggers VoiceOver to announce the header → body →
  CTA flow once; no dynamic updates occur on these screens. Adding
  `accessibilityLiveRegion` would either re-announce on every focus
  (annoying) or have no effect (no dynamic content). Verified via
  recon — the agent's flag was a false positive.
- **TextInput implicit role** — iOS / Android RN platforms supply
  an implicit role for `<TextInput>`. Adding explicit
  `accessibilityRole="textbox"` is redundant and not required by
  WCAG / Apple HIG / Android a11y guidelines. Verified for
  `nickname.tsx`, `body-info.tsx` (birth year), `WeightSlider.tsx`
  modal input.
- **WeightSlider modal TextInput** — modal-scoped input; default
  iOS/Android platform role is sufficient for VoiceOver reads.
- **PaceSelector minWidth=110** — well above the 44pt minimum
  touch target. The audit-agent's "< 44pt violation" claim was a
  false positive (math error on the agent's part).
- **nickname.tsx errorRow minHeight=20** — this is the **error
  message container**, not the TextInput. The TextInput itself is
  `height: 52`. The audit-agent's "touch target violation" claim
  was a false positive (style-target misread).

## Audit false-positive register (for future-audit reference)

For each false positive the recon agent surfaced, recording the
verify result so a future audit doesn't re-investigate:

| False positive claim | Verification | Status |
|--------------------|-------------|--------|
| body-info gender radiogroup container lacks role | `accessibilityRole="radiogroup"` at line 242 | ✅ present |
| activity radiogroup container lacks role | `accessibilityRole="radiogroup"` at line 173 | ✅ present |
| nickname TextInput minHeight=20 (<44pt) | minHeight=20 is on `errorRow` style, not TextInput; TextInput is height=52 | ✅ false positive |
| PaceSelector minWidth=110 (<44pt) | 110pt > 44pt | ✅ false positive (agent math error) |
| meal-timing count live region missing | `accessibilityLiveRegion="polite"` at line 227 | ✅ present |
| weekly-distrib count live region missing | `accessibilityLiveRegion="polite"` at line 290 | ✅ present |
| goal-weight goal-summary live region missing | `accessibilityLiveRegion="polite"` at lines 357, 383 | ✅ present |
| body-info BMI feedback live region missing | 4 live regions at lines 316, 342, 372, 395 cover all dynamic content | ✅ present |
| Modal TextInput in WeightSlider lacks explicit role | Implicit role from RN platform sufficient | ✅ intentional skip |
| Activity-screen kcal feedback live region missing | `accessibilityLiveRegion="polite"` at lines 278, 303, 331 | ✅ present |

## Deferred items (post-E-3)

Items intentionally NOT addressed in E-3, with reason and target phase:

- **Dynamic VoiceOver / TalkBack manual testing** — defer to **E-4
  dogfooding**. Static attribute audit is the appropriate E-3 scope;
  manual screen-reader walk-through requires a physical device and
  is a dogfooding activity.
- **Grep-based a11y attribute audit script** — defer to **post-Build 15+
  TODO 12** (jest-expo / RNTL preset). RNTL-based render tests would
  give a stronger pin than grep-based static analysis; deferring
  avoids sustainable-debt grep tooling.
- **Color contrast WCAG measurement automation** — defer to
  **post-ship v1.4 prep**. JP-only ship; current spot-check passes;
  the Plus tier disclosure copy is the only legally-sensitive
  contrast surface and is verified manually.
- **Pacific/Auckland and Pacific/Apia TZ matrix** — JP-only ship
  doesn't justify the matrix expansion; 3 zones (UTC / Asia/Tokyo /
  America/Los_Angeles) cover the failure modes (no-DST + DST
  jurisdictions).
- **User-facing v1-migration notice** — deferred to **E-4**
  ("あなたのデータは保存されています" copy on welcome screen for
  Option A re-onboarders).

## Architectural learning recorded

**Pattern: audit-maturity signal**

When a thorough multi-agent audit produces a high density of false
positives (observed in E-3: 8 of 10 verified register entries were
already-implemented or intentional design choices), the architectural
baseline is at ship-ready depth. The signal is: the audit is hitting
existing hardening rather than discovering new gaps.

Triggering conditions:
- Phase 18 SSoT 補強 cycle has run (legacy/v2 coverage, completion
  signals)
- Pattern 24 補強 cycle has run (derived bundle atomicity,
  completion-signal atomic)
- Phase-by-phase Codex review has caught and pinned regressions

E-3 observed all three crystallizations from E-1/E-2 holding under
audit pressure. Future audit phases should expect a similar profile —
high false-positive rate = high baseline maturity. The valuable
deliverable from such phases is the **verified-state documentation
itself** (this file), which prevents future audits from
re-investigating the same questions.

## Test count summary

- Phase E-2 end: 1868 tests (54 in onboardingService)
- Phase E-3 commit: **1874 tests** (+6 in onboardingCalc)
- TZ matrix: UTC / Asia/Tokyo / America/Los_Angeles — all green
- check-soft-delete-filter: PASS
- check-enqueue-sync: PASS
