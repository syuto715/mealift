import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import { getColors, radius } from '../../src/theme/tokens';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { Button } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import { useProfileStore } from '../../src/stores/profileStore';
import {
  PROTEIN_FACTOR_OPTIONS,
  type ProteinFactor,
  formatProteinFactorAccessibilityLabel,
  getProteinFactorDescription,
  getRecommendationLabel,
  isAllInputsValidForD4,
  isValidProteinFactor,
} from '../../src/domain/proteinTargetUtils';
import { suggestProteinFactor } from '../../src/domain/onboardingCalc';

// v1.3.0 / Onboarding v2 / Phase D-4 — Protein target screen [8].
//
// Architectural milestone — first screen where calculateAll fires.
// Reaching step >= 9 (ONBOARDING_STEP_FULL_INPUT, D-2 aligned)
// trips the cache compute (BMR → TDEE → daily target → PFC bundle
// + body composition forecast). Live feedback box renders the
// resulting target kcal + PFC grams using Pattern 24 atomic
// bundle reads.
//
// Suggestion fetch — suggestProteinFactor reads the user's past
// 30-day workout count via the existing helper chain (Pattern 18
// SSoT). The async result drives the suggestion line copy AND
// pre-fills the segment when the user hasn't picked anything yet.
// Pattern 10 cancellation guard against strict-mode dev double-
// mount + unmount race.
//
// Pattern 26 transitional bridge — CTA pushes legacy
// /(onboarding)/body-and-training until Phase D-5 ships
// /weekly-distrib. Bridge integrity verified:
//   - end (complete.tsx) — proteinFactor preservation added in
//     this commit alongside existing nickname/weeklyRatePct/
//     mealPlan/mealTimings conditionals. The PFC bundle
//     (targetCalories + targetProteinG + targetFatG +
//     targetCarbG) was already wired in complete.tsx createProfile
//     flow via macros, so no additional write needed for those.
//   - intermediate (body-and-training) — doesn't touch
//     proteinFactor; no fromNewFlow guard needed.
//
// Patterns applied:
//   #5  CTA double-tap defense + non-null + canonical-value gate
//   #10 cancellation guard on the suggestion async fetch
//   #11 segment selected: border + bg + bold (3-cue redundant)
//   #12 header / radiogroup+radio / live region (recommendation +
//       PFC feedback) / button (CTA)
//   #15 PROTEIN_FACTOR_OPTIONS as const literal-union narrow
//   #18 SSoT — 5-helper calc chain via calculateAll
//   #18 補強 — hasInteracted gate via onboardingStep >= 9 for
//       the PFC feedback box (cache populated)
//   #18 補強 — canonical-value check via isValidProteinFactor on
//       store read so a corrupted persisted value doesn't render
//       a non-existent segment
//   #22 monotonic step bump to 9
//   #23 persistToProfile + service-side recompute on submit
//   #24 PFC bundle atomicity (4 cache fields all-set-or-all-null)
//   #25 logic in domain/proteinTargetUtils.ts
//   #26 transitional bridge + complete.tsx hardening

const TITLE = 'タンパク質の目標を選びましょう';
const SUBTITLE = '体重 1kg あたりの摂取量です';
const CTA_LABEL = '次へ';

export default function ProteinTargetScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const proteinFactor = useOnboardingStore((s) => s.proteinFactor);
  const dailyCalorieTarget = useOnboardingStore((s) => s.dailyCalorieTarget);
  const pfcTargets = useOnboardingStore((s) => s.pfcTargets);
  const onboardingStep = useOnboardingStore((s) => s.onboardingStep);
  const setProteinFactor = useOnboardingStore((s) => s.setProteinFactor);
  const calculateAll = useOnboardingStore((s) => s.calculateAll);
  const persistToProfile = useOnboardingStore((s) => s.persistToProfile);
  const profileId = useProfileStore((s) => s.profile?.id ?? null);

  const [suggestion, setSuggestion] = useState<ProteinFactor | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);

  // Pattern 18 補強 (canonical view) — narrow the store value to
  // the literal-union via isValidProteinFactor on read. A
  // corrupted persisted value (e.g., sync poison surfacing
  // 1.5 from a different schema) renders the screen with no
  // segment highlighted rather than a non-existent one.
  const canonicalFactor: ProteinFactor | null =
    proteinFactor != null && isValidProteinFactor(proteinFactor)
      ? proteinFactor
      : null;

  // Pattern 10 cancellation guard — strict-mode dev double-mount
  // + unmount-while-awaiting both surface here. The async
  // suggestProteinFactor returns FALLBACK on error (never throws),
  // so this is purely about race protection for setState.
  //
  // Codex pass 1 / Sign-off violation fix — restored kickoff §3
  // auto-prefill: when the async result resolves AND the store
  // still has proteinFactor=null (no user tap during the fetch
  // window), pre-fill with the suggested value. Reads
  // useOnboardingStore.getState() at resolve time rather than
  // closure-capturing the initial state, so a user tap between
  // mount and resolve correctly wins over the suggestion.
  useEffect(() => {
    if (profileId == null) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const result = await suggestProteinFactor(profileId);
        if (cancelled) return;
        setSuggestion(result.suggested);
        const liveState = useOnboardingStore.getState();
        if (liveState.proteinFactor == null) {
          liveState.setProteinFactor(result.suggested);
          liveState.calculateAll();
        }
      } catch (err) {
        console.warn(
          '[onboarding/protein-target] suggestProteinFactor failed',
          err,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  // Codex pass 1 / Important fix — refresh the calculateAll cache
  // on mount so a back-nav from a downstream screen (where a
  // prerequisite like mealPlan / weeklyRatePct / activityLevel
  // was edited) doesn't leave stale dailyCalorieTarget / pfcTargets
  // showing in the feedback box. Prerequisite setters intentionally
  // do NOT chain calculateAll (they're written by their own
  // screens), so this screen owns the "refresh on focus" semantic
  // since it's the first place where the cache is rendered.
  useEffect(() => {
    const liveState = useOnboardingStore.getState();
    if (liveState.onboardingStep >= 9) {
      liveState.calculateAll();
    }
    // Run only on mount — calculateAll is idempotent for
    // unchanged inputs, so the redundant fire on initial render
    // is cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectFactor = useCallback(
    (factor: ProteinFactor) => {
      setProteinFactor(factor);
      // Re-fire calculateAll so the live PFC feedback box reflects
      // the new factor in the same render cycle. The store
      // method short-circuits when step < ONBOARDING_STEP_FULL_INPUT
      // (still 0 inputs from earlier phases? — unreachable from
      // this screen, but the guard is defense-in-depth).
      calculateAll();
    },
    [calculateAll, setProteinFactor],
  );

  const allValid = isAllInputsValidForD4(canonicalFactor);
  // PFC feedback box gate: full-input step reached AND cache
  // populated (Pattern 24 — read all 4 atomic fields).
  const showFeedback =
    onboardingStep >= 9 &&
    dailyCalorieTarget !== null &&
    pfcTargets !== null;

  const handleSubmit = useCallback(async () => {
    if (isAdvancing) return;
    if (!allValid) return;
    setIsAdvancing(true);
    try {
      await persistToProfile();
    } catch (err) {
      console.warn(
        '[onboarding/protein-target] persistToProfile failed',
        err,
      );
    }
    // Phase D-5 transitional bridge — flip to '/weekly-distrib'
    // when D-5 ships. body-and-training is the precedent target;
    // legacy screen doesn't touch proteinFactor + complete.tsx
    // now preserves it via the conditional patch added in this
    // commit.
    router.push('/(onboarding)/body-and-training');
  }, [allValid, isAdvancing, persistToProfile]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={[styles.title, { color: colors.textPrimary }]}
          accessibilityRole="header"
        >
          {TITLE}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {SUBTITLE}
        </Text>

        {/* Recommendation line */}
        <Text
          style={[styles.recommendation, { color: colors.textSecondary }]}
          accessibilityLiveRegion="polite"
        >
          {getRecommendationLabel(suggestion)}
        </Text>

        {/* 4-segment radiogroup */}
        <View
          style={styles.segmentRow}
          accessibilityRole="radiogroup"
          accessibilityLabel="タンパク質係数"
        >
          {PROTEIN_FACTOR_OPTIONS.map((factor) => {
            const selected = canonicalFactor === factor;
            return (
              <TouchableOpacity
                key={factor}
                onPress={() => handleSelectFactor(factor)}
                style={[
                  styles.segmentBtn,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected
                      ? colors.primary + '15'
                      : colors.surface,
                  },
                  selected && styles.segmentBtnSelected,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={formatProteinFactorAccessibilityLabel(factor)}
                testID={`protein-target-factor-${factor}`}
              >
                <Text
                  style={[
                    styles.segmentValue,
                    {
                      color: selected ? colors.primary : colors.textPrimary,
                      fontWeight: selected ? '700' : '600',
                    },
                  ]}
                >
                  {factor.toFixed(1)}
                </Text>
                <Text
                  style={[
                    styles.segmentUnit,
                    { color: colors.textTertiary },
                  ]}
                >
                  g/kg
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selected description */}
        {canonicalFactor != null && (
          <Text
            style={[styles.description, { color: colors.textSecondary }]}
            accessibilityLiveRegion="polite"
          >
            {getProteinFactorDescription(canonicalFactor)}
          </Text>
        )}

        {/* PFC feedback box (Pattern 18 + 24) — gates on
            ONBOARDING_STEP_FULL_INPUT reached AND atomic bundle
            present (all 4 cache fields populated by calculateAll).
            The screen renders nothing during the brief render
            window between setProteinFactor and calculateAll
            committing — Pattern 24 prevents a half-rendered
            "target kcal but no PFC" frame. */}
        {showFeedback && dailyCalorieTarget !== null && pfcTargets !== null && (
          <FeedbackBox
            dailyCalorieTarget={dailyCalorieTarget}
            pfcTargets={pfcTargets}
            colors={colors}
          />
        )}
      </ScrollView>

      <View style={[styles.ctaBar, { borderTopColor: colors.border }]}>
        <Button
          title={CTA_LABEL}
          onPress={handleSubmit}
          variant="primary"
          size="lg"
          fullWidth
          disabled={!allValid || isAdvancing}
          testID="protein-target-cta"
        />
      </View>
    </View>
  );
}

// === FeedbackBox ===
//
// Extracted sub-component so the parent can do a single
// non-null check at the gate (showFeedback && dailyCalorieTarget
// !== null && pfcTargets !== null) and pass non-null params,
// avoiding ! assertions in the JSX body. Codex pass 1 Nit fix.

interface FeedbackBoxProps {
  dailyCalorieTarget: number;
  pfcTargets: { protein: number; fat: number; carbs: number };
  colors: ReturnType<typeof getColors>;
}

function FeedbackBox({
  dailyCalorieTarget,
  pfcTargets,
  colors,
}: FeedbackBoxProps) {
  return (
    <View
      style={[
        styles.feedbackBox,
        {
          backgroundColor: colors.surfaceSecondary,
          borderColor: colors.border,
        },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={
        `目標 ${dailyCalorieTarget} キロカロリー、` +
        `タンパク質 ${pfcTargets.protein} グラム、` +
        `脂質 ${pfcTargets.fat} グラム、` +
        `糖質 ${pfcTargets.carbs} グラム`
      }
    >
      <Text style={[styles.feedbackKcal, { color: colors.textPrimary }]}>
        目標 {dailyCalorieTarget.toLocaleString('ja-JP')} kcal/日
      </Text>
      <Text style={[styles.feedbackPfc, { color: colors.textSecondary }]}>
        P {pfcTargets.protein}g / F {pfcTargets.fat}g / C {pfcTargets.carbs}g
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  title: {
    ...typography.titleLarge,
  },
  subtitle: {
    ...typography.bodyMedium,
  },
  recommendation: {
    ...typography.bodyMedium,
    marginTop: spacing.sm,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  segmentBtnSelected: {
    borderWidth: 2,
  },
  segmentValue: {
    ...typography.titleMedium,
    fontVariant: ['tabular-nums'],
  },
  segmentUnit: {
    ...typography.bodySmall,
  },
  description: {
    ...typography.bodyMedium,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  feedbackBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  feedbackKcal: {
    ...typography.titleMedium,
    fontVariant: ['tabular-nums'],
  },
  feedbackPfc: {
    ...typography.bodyMedium,
    fontVariant: ['tabular-nums'],
  },
  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
