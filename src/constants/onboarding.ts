// v1.3.0 / Onboarding v2 / Phase E-1 — onboarding version SSoT.
//
// Promoted from onboardingService.ts (was a private constant) so
// both the persistence layer (buildProfilePatch's auto-bump path)
// AND app/index.tsx (v1-user force-re-onboarding redirect) read
// the same value. Pattern 18 SSoT.
//
// Version semantics:
//   1 = Build 14/15 flow — welcome-and-goal + body-and-training
//       2-screen combined onboarding. Collected legacy fields
//       only (gender / birthYear / height / weight / activity /
//       trainingDays / goalType / equipment / target weight /
//       targetBodyFatPct / targetDate). No nickname, meal plan,
//       protein factor, cheat days, etc.
//   2 = v1.3.0 onboarding v2 — 13-screen flow + 14 v2 fields.
//       Phase A-1..D-10 deliverable. createProfileFromOnboarding
//       (D-8) is the canonical persistence path.
//
// Migration path (Phase E-1 Option A): users on version 1 with
// onboardingCompleted=true are routed through /welcome again on
// next app boot so the v2 fields get collected. Their existing
// legacy fields prefill via onboardingStore.prefillFromProfile,
// so the flow is tap-through for unchanged values + collect-
// only-what's-missing for v2 fields.

export const ONBOARDING_VERSION = 2;
