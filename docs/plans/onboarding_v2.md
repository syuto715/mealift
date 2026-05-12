# Onboarding v2 — Implementation summary (v1.3.0)

## Scope

13-screen onboarding flow (+ optional iOS HealthKit screen) replacing the
Build 14/15 2-screen "welcome-and-goal + body-and-training" combined
flow. Ships concurrently with Build 16. Collects all legacy fields plus
14 v2 fields and persists the resulting Profile with `onboardingCompleted=true`
and `onboardingVersion=2`.

`ONBOARDING_VERSION` is the single source of truth (SSoT) for the
flow version. Promoted in Phase E-1 from a private constant in
`onboardingService.ts` to `src/constants/onboarding.ts` so both the
persistence layer (`buildProfilePatch` auto-bump) and `app/index.tsx`
(v1-user re-onboarding redirect) read the same value.

## Phase index (21 sub-phases)

| Phase | Subject | Notes |
|------|--------|-------|
| A-1  | Onboarding routes table | `ONBOARDING_ROUTES`, `getStepForRoute` |
| A-2  | Onboarding store skeleton | Zustand store with 14 v2 fields |
| A-3  | `prefillFromProfile` | Legacy → v2 field hydration (returning users) |
| A-4  | Routes integration | `(onboarding)/_layout.tsx` |
| A-5  | ProgressHeader | Step + dot row, platform-aware total |
| A-6  | Layout header gating | `shouldRenderLayoutHeader`, `LAYOUT_HEADER_SUPPRESSED_ROUTES` |
| B-1  | NumberInput | Decimal-aware numeric input |
| B-2  | WeightSlider | Inline slider + ticks |
| B-3  | PaceSelector | Weekly rate option grid |
| B-4  | MealPlanPicker | 3-meal vs 5-meal selector |
| B-5  | BodyCompositionChart | Horizontal stacked-bar SVG |
| C-1  | Welcome screen | `markStarted` mount handler |
| C-2  | Nickname | TextInput + UTF-16 code-point validation |
| C-3  | Body info | Gender / birthYear / heightCm / currentWeightKg |
| C-4  | Activity | 5-card activity level + 0-7 stepper |
| C-5  | Goal weight | goalType + WeightSlider + PaceSelector |
| D-1  | Goal summary | Aggregator + redirect-on-invalid |
| D-2  | Meal plan | Thin B-4 wire |
| D-3  | Meal timing | Checkbox multi-select with canonical sort |
| D-4  | Protein target | 4-segment + suggested factor + PFC feedback |
| D-5  | Weekly distribution | even/cheat + cheat-day picker |
| D-6  | Motivation | Read-only copy + full-width chart |
| D-7  | Progress preview | Inline trajectory SVG |
| D-8  | Complete | `createProfileFromOnboarding` service wrapper |
| D-9  | Tier preview | Post-completion Plus/Pro pitch |
| D-10 | HealthKit | iOS-only permission screen |
| E-1  | Legacy cleanup + version bump + this doc | Current phase |

## The 14 v2 fields

Collected by the new flow on top of the Build 14/15 legacy set
(gender / birthYear / heightCm / currentWeightKg / activityLevel /
trainingDaysPerWeek / goalType / equipment / targetWeightKg /
targetBodyFatPct / targetDate):

1. `nickname` — JP TextInput, UTF-16 code-point counted
2. `mealPlan` — 3 vs 5 meal/day
3. `mealTimings` — ordered multi-select (`breakfast`..`late_night`)
4. `proteinFactor` — 1.6 / 1.8 / 2.0 / 2.2 g/kg
5. `weeklyDistribution` — `even` | `cheat` literal-union
6. `cheatDays` — `DayOfWeek[]` length ≤ 3, sorted/deduped
7. `weeklyRatePct` — pace selector output (% bodyweight per week)
8. `dailyCalorieTarget` — derived (cached, recomputable)
9. `pfcTargets` — derived `{p,f,c}` (cached)
10. `estimatedTargetDate` — derived from current/target/pace
11. `onboardingStartedAt` — mount-time stamp (write-once)
12. `onboardingStep` — monotonic step counter
13. `onboardingCompleted` — `true` after D-8
14. `onboardingVersion` — set to 2

## Pattern catalog (31 patterns)

Patterns referenced throughout screen comments. See per-screen
docstrings for application. Numbered for stable git-search.

1. Pure-domain split (no React in `src/domain/**`)
2. Test seam via parameter (override Platform.OS in helpers)
3. Read-modify-write store actions
4. Selector-based store subscription (avoid full-store reads)
5. Fail-fast on caller misuse + double-tap defense via `isAdvancing`
6. Prefill on mount only (`[]` deps + eslint-disable)
7. Conditional persist (skip when nothing changed)
8. Step monotonic (never decrement on back-nav)
9. Layout vs screen header ownership
10. Cancellation guard for async on unmount
11. Color + non-color redundant encoding (a11y)
12. Conditional `accessibilityRole` ("header" on titles, icons hidden)
13. `accessibilityElementsHidden` + `importantForAccessibility` pair
14. Numeric-input canonical-state precedence
15. Literal-union narrow + `as const` for switch exhaustiveness
16. Repo-vs-store split: SQLite write goes through repository
17. Aggregator helper (read-only fan-in for summary screens)
18. SSoT (single source of truth) + 補強 (canonical view / derived feedback / cross-consumer)
19. Sort-then-dedupe canonicalization at boundary
20. FP pre-compute outside render
21. Optional → required field promotion on milestone
22. Monotonic step (only advance)
23. Service-side persist (screen calls service, not repo)
24. Derived bundle atomicity (calc-all writes p+f+c+kcal together)
25. Pure-helper extraction (Build-15-TODO-12 workaround for RNTL gap)
26. Transitional bridge (Pattern 26): end / intermediate / computed priority
27. Min-relative grid (chart Y-axis pinned to min)
28. Dev assert + prod sanitize hybrid
29. Step-derived precision (decimal count from slider step)
30. Integer percent-points pre-scaling (FP defense for percentages)
31. Production-only import boundary verification

## Key milestones

- **Pattern 18 SSoT promotion**: `ONBOARDING_VERSION` extracted to
  `src/constants/onboarding.ts` (Phase E-1)
- **`calculateAll` trust boundary** (Phase D-4): v2 cache priority
  over legacy recompute; mount-time refresh on back-nav
- **Service-side persist** (Phase D-8): `createProfileFromOnboarding`
  wrapper handles createProfile + updateProfile + retry-safety
  (pre-existing-profile check) + `markCompleted` option for
  `onboardingCompleted=true` + terminal step=13
- **`prefillFromProfile`** (Phase A-3): legacy field hydration —
  returning v1 users tap through pre-filled values rather than
  retyping
- **v1 user migration** (Phase E-1, Option A): `onboardingVersion < 2`
  redirects to `/welcome` on app boot; v2-introduced fields require
  fresh entry; v1 fields prefill via A-3
- **Multi-TZ verification**: every domain test runs in UTC / Asia/Tokyo /
  America/Los_Angeles (1853 tests as of E-1)

## Persistence trust boundary

`buildProfilePatch` in `onboardingService.ts` enforces composite
invariants the screen layer cannot:

- `weeklyDistribution === 'even'` → `cheatDays = null`
- `cheatDays.length > 3` → truncated to first 3
- `mealTimings` sorted + deduped to canonical order
- `onboardingVersion` auto-bumped on completion path
- Set-once fields (`onboardingStartedAt`) never overwritten

Screen-layer validation exists for UX (immediate feedback) but is
not load-bearing; the boundary is the service.

## v1 → v2 migration

Option A — force re-onboarding for users on `onboardingVersion=1`:

1. `app/index.tsx` checks `onboardingVersion < ONBOARDING_VERSION`
   alongside `!onboardingCompleted`
2. Match → redirect to `/(onboarding)/welcome`
3. `welcome.tsx` mount: `prefillFromProfile(existingProfile)` hydrates
   legacy fields into the store
4. User taps through pre-filled C-3..D-5 screens; v2-introduced
   fields (nickname, mealPlan, proteinFactor, etc.) require entry
5. D-8 `createProfileFromOnboarding` calls update (not create) when
   profile exists, sets `onboardingVersion=2`

User-facing "あなたのデータは保存されています" notice deferred to E-4.

## Files

Domain (pure):
- `src/domain/onboardingCalc.ts`
- `src/domain/onboardingSteps.ts`
- `src/domain/nicknameValidation.ts`
- `src/domain/bodyInfoValidation.ts`
- `src/domain/activityValidation.ts`
- `src/domain/goalWeightValidation.ts`
- `src/domain/goalSummaryAggregator.ts`
- `src/domain/mealTimingUtils.ts`
- `src/domain/proteinTargetUtils.ts`
- `src/domain/weeklyDistribUtils.ts`
- `src/domain/motivationCopyResolver.ts`
- `src/domain/progressTrajectoryUtils.ts`
- `src/domain/tierPreviewUtils.ts`
- `src/domain/bodyCompositionChartUtils.ts`

Store / service:
- `src/stores/onboardingStore.ts`
- `src/infra/services/onboardingService.ts`
- `src/constants/onboarding.ts` (SSoT, Phase E-1)

UI:
- `src/components/onboarding/BodyCompositionChart.tsx`
- `src/components/onboarding/MealPlanPicker.tsx`
- `src/components/onboarding/PaceSelector.tsx`
- `src/components/onboarding/WeightSlider.tsx`
- `src/components/onboarding/ProgressHeader.tsx`
- `src/components/onboarding/NumberInput.tsx`
- `app/(onboarding)/*.tsx` — 14 screens (15 with iOS healthkit)

Removed in E-1:
- `app/(onboarding)/welcome-and-goal.tsx` (legacy combined screen)
- `app/(onboarding)/body-and-training.tsx` (legacy combined screen)
- `setGoal` / `setBody` / `setTraining` bulk-setter actions

## Open items (post-E-1)

- E-2 — buildProfilePatch service hardening (final invariant pass)
- E-3 — Multi-TZ + a11y audit pass
- E-4 — User-facing v1-migration notice ("データは保存されています")
- Build 15+ TODO 12 — jest-expo / RNTL preset for component rendering
- Handbook / contributor guide for the Pattern catalog (post-ship)
