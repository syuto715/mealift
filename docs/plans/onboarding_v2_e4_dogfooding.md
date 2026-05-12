# Phase E-4 dogfooding checklist — iOS VoiceOver

User-executed manual test pass on a physical iOS device. Syuto runs
through onboarding with VoiceOver enabled and records findings.
Triage per Phase E-4 anchor: **"Apple reviewer が onboarding 完走
できるか"** = Critical/Important (fix in E-4); **"もっと良くなる"** =
Nit (record below, push to v1.4 prep).

## Setup

1. iOS device (physical, not simulator — simulator VoiceOver
   behavior diverges from real-device behavior).
2. Settings → Accessibility → VoiceOver → ON. Suggest triple-click
   the side button as a toggle shortcut.
3. Build the dev profile (Mealift internal) and sign in with an
   account that can be reset to v1 state.

## Test paths

### Path 1 — v1 user re-onboarding (Option A)

Goal: verify the migration notice announces correctly and the
existing-data prefill experience reads well.

**Reset to v1**: run the dev-only reset (or directly UPDATE the
profile row to `onboarding_version=1, onboarding_completed=true`)
and force the app to re-cold-start. The index.tsx version gate
routes to /welcome.

Checklist:
- [ ] Welcome screen: VoiceOver reads the migration notice **before**
      the hero title. Verify the announce includes "Mealift がアップデートされました" + "データは保存されています". The
      role="alert" + live region "polite" combination should cause
      the notice to be in the natural reading order.
- [ ] Migration notice icon is **silent** (decorative, Pattern 13).
- [ ] CTA「始める」 is reachable and announced as a button.
- [ ] Nickname screen: prefilled values from prior profile NOT
      present (v2-introduced field, requires fresh entry).
- [ ] Body-info screen: gender/birthYear/height/weight all
      **prefilled** from the v1 row; VoiceOver reads them with
      current values.
- [ ] Activity screen: activityLevel + trainingDaysPerWeek
      prefilled; the radiogroup is announced as a group.
- [ ] Goal-weight screen: goalType prefilled; PaceSelector
      announces selected pace correctly.
- [ ] D-1..D-5 screens (v2-introduced inputs): require fresh
      entry; no stale prefill leakage.
- [ ] Complete screen: success indicator readable; VoiceOver
      auto-advance to tier-preview after persist.
- [ ] Tier-preview: features list readable; Plus + Skip CTAs
      distinct.
- [ ] HealthKit (iOS-only): permission copy readable; Connect +
      Skip CTAs distinct.

### Path 2 — first-time user (profile=null)

Goal: verify the migration notice is **NOT** shown.

**Reset**: delete-and-recreate profile via dev menu (or sign
out → sign in fresh; no profile row).

Checklist:
- [ ] Welcome screen: migration notice **absent** (no
      "Mealift がアップデートされました" announce).
- [ ] Standard flow proceeds welcome → nickname → ... → tier-preview
      → (iOS) healthkit → home.

### Path 2b — persisted incomplete user (profile exists, never finished)

Goal: verify the migration notice is **NOT** shown for users who
have a profile row but never completed onboarding. This is the
second false-positive boundary the `isV1MigrationUser` gate defends
against: `profile != null && onboardingCompleted === false`.

**Reset**: directly UPDATE the profile row to
`onboarding_completed = 0` (any `onboarding_version`) and cold-start.
The index.tsx version gate routes to /welcome because of
`!onboardingCompleted`.

Checklist:
- [ ] Welcome screen: migration notice **absent** (the
      "あなたのデータは保存されています" claim would be misleading —
      there's no completed flow to migrate from).
- [ ] Onboarding flow proceeds normally with any prefilled values
      from the partial row still hydrating C-3..D-5 inputs via
      `prefillFromProfile`.

### Path 3 — mid-flow back-navigation

Goal: verify the dynamic announces still work after returning
to a screen.

Checklist (sample 3 screens):
- [ ] Body-info: change height value → BMI feedback box re-announces
      via live region.
- [ ] Activity: change activity level → maintenance kcal box
      re-announces.
- [ ] Protein-target: change protein factor → PFC feedback box
      re-announces.

### Path 4 — error paths

Checklist:
- [ ] Nickname: enter invalid (empty / >20 chars) → error message
      announced via live region.
- [ ] Body-info birthYear: enter invalid (e.g. 1900) → error
      announced.
- [ ] Goal-weight: combine inconsistent goalType + weight
      direction → validation announced.

## Findings template

Record findings inline below with severity:

```
### Finding N: [short title]

**Severity**: Critical | Important | Nit
**Screen**: [path]
**Observed**: [what VoiceOver did / didn't do]
**Expected**: [what should happen]
**Apple reviewer impact**: [would this block onboarding completion?]

**Disposition**: E-4 fix | v1.4 push | won't fix
```

## Findings (Syuto fills in)

_(Empty until manual pass runs.)_

## v1.4 push list

Items recorded here flow to `docs/plans/onboarding_v2.md` /
"Open items (post-E-4)" or a fresh v1.4 prep doc.

_(Empty until E-4 triage completes.)_

## Android TalkBack — deferred

Android Plus tier is RevenueCat-blocked until v1.4 prep (API key
pending), so TalkBack dogfooding is **NOT** required for v1.3.0
ship. Run as part of v1.4 onboarding-on-Android verification
when the Plus path activates.
