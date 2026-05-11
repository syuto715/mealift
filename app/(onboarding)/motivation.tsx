import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../src/theme/tokens';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { Button } from '../../src/components/ui';
import { BodyCompositionChart } from '../../src/components/onboarding/BodyCompositionChart';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import {
  aggregateOnboardingSummary,
  findEarliestInvalidRoute,
} from '../../src/domain/goalSummaryAggregator';
import {
  formatAchievementDateLabel,
  getMaintenanceDateLabel,
  getMotivationCopyForGoal,
  getRecompDateLabel,
} from '../../src/domain/motivationCopyResolver';

// v1.3.0 / Onboarding v2 / Phase D-6 — Motivation screen [10].
//
// Read-only screen — visualizes the user's projected body
// composition shift and surfaces goalType-differentiated
// motivation copy. Mirrors the D-1 goal-summary read-only
// pattern + adds D-4 cache-refresh-on-mount (prerequisite
// setters don't auto-trigger calculateAll, so a back-nav round-
// trip that edits an upstream input could leave stale cache).
//
// Pattern 26 transitional bridge — CTA pushes legacy
// /(onboarding)/body-and-training until Phase D-7 ships
// /progress-preview. Bridge integrity unchanged from D-5: no
// new v2 fields collected (read-only screen), complete.tsx +
// body-and-training hardening already in place.
//
// Patterns applied:
//   #5  mount-time sanity check + CTA double-tap defense
//   #11 each section: icon + bold title + body copy (color +
//       text redundancy)
//   #12 header (title) + region (sections) + button (CTA)
//   #18 SSoT — aggregateOnboardingSummary + B-5
//       BodyCompositionChart + motivationCopyResolver
//   #18 補強 — onboardingStep monotonic bump to 11 on mount
//   #22 — back-nav from later screens preserves step >= 11
//   #24 — derived bundle atomicity verified at the gate
//        (summary != null means cache is fully populated)
//   #25 — pure helpers in motivationCopyResolver.ts

const TITLE = 'あなたの未来';
const SUBTITLE = '計画の先に待っている姿を見ていきましょう';
const CTA_LABEL = '進める';

export default function MotivationScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const gender = useOnboardingStore((s) => s.gender);
  const birthYear = useOnboardingStore((s) => s.birthYear);
  const heightCm = useOnboardingStore((s) => s.heightCm);
  const currentWeightKg = useOnboardingStore((s) => s.currentWeightKg);
  const activityLevel = useOnboardingStore((s) => s.activityLevel);
  const trainingDaysPerWeek = useOnboardingStore(
    (s) => s.trainingDaysPerWeek,
  );
  const targetWeightKg = useOnboardingStore((s) => s.targetWeightKg);
  const goalType = useOnboardingStore((s) => s.goalType);
  const weeklyRatePct = useOnboardingStore((s) => s.weeklyRatePct);
  const proteinFactor = useOnboardingStore((s) => s.proteinFactor);
  const setField = useOnboardingStore((s) => s.setField);

  const [isAdvancing, setIsAdvancing] = useState(false);

  const summary = useMemo(() => {
    if (targetWeightKg == null || weeklyRatePct == null) return null;
    return aggregateOnboardingSummary({
      gender,
      birthYear,
      heightCm,
      currentWeightKg,
      activityLevel,
      trainingDaysPerWeek,
      targetWeightKg,
      goalType,
      weeklyRatePct,
      proteinFactor,
    });
  }, [
    activityLevel,
    birthYear,
    currentWeightKg,
    gender,
    goalType,
    heightCm,
    proteinFactor,
    targetWeightKg,
    trainingDaysPerWeek,
    weeklyRatePct,
  ]);

  // D-1 learning — watch summary across mount + post-mount edits
  // so an upstream back-nav that breaks consistency redirects
  // cleanly rather than rendering a half-empty screen. The
  // findEarliestInvalidRoute helper lands the user on the
  // precise edit surface (preserving earlier-phase progress).
  useEffect(() => {
    if (summary != null) return;
    if (targetWeightKg == null || weeklyRatePct == null) {
      router.replace('/(onboarding)/goal-weight');
      return;
    }
    const dest = findEarliestInvalidRoute({
      gender,
      birthYear,
      heightCm,
      currentWeightKg,
      activityLevel,
      trainingDaysPerWeek,
      targetWeightKg,
      goalType,
      weeklyRatePct,
      proteinFactor,
    });
    router.replace(dest ?? '/(onboarding)/welcome');
  }, [
    activityLevel,
    birthYear,
    currentWeightKg,
    gender,
    goalType,
    heightCm,
    proteinFactor,
    summary,
    targetWeightKg,
    trainingDaysPerWeek,
    weeklyRatePct,
  ]);

  // D-4 learning — mount-time calculateAll refresh. Prerequisite
  // setters (setMealPlan / setWeeklyRatePct / setActivityLevel
  // etc.) intentionally don't chain calculateAll, so a back-nav
  // edit on an upstream screen could leave the cache stale when
  // the user returns to /motivation. Idempotent on unchanged
  // inputs, so re-firing every mount is cheap.
  //
  // Step bump to 11 happens here too rather than via a dedicated
  // setter (read-only screen — no value to write atomically with
  // step).
  useEffect(() => {
    if (summary == null) return;
    const liveState = useOnboardingStore.getState();
    if (liveState.onboardingStep >= 9) {
      liveState.calculateAll();
    }
    if (liveState.onboardingStep < 11) {
      setField('onboardingStep', 11);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary == null]);

  const handleSubmit = useCallback(() => {
    if (isAdvancing) return;
    if (summary == null) return;
    setIsAdvancing(true);
    // Phase D-7 flipped this to the new flow's [11]
    // /progress-preview screen. The D-6 stop-gap (legacy
    // /body-and-training) is no longer reachable from this CTA.
    // progress-preview is the LAST transitional phase — its CTA
    // pushes directly to /(onboarding)/complete (legacy + the
    // accumulated C-2..D-5 hardening serves as the end
    // destination until Phase D-8 rewrites under the same
    // route).
    router.push('/(onboarding)/progress-preview');
  }, [isAdvancing, summary]);

  if (summary == null) {
    // Brief render window between mount and redirect effect —
    // show empty container rather than half-rendered content.
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]} />
    );
  }

  const copy = getMotivationCopyForGoal(goalType);
  // Codex pass 1 / Important fix — null-schedule fallback now
  // branches by direction. Both maintain and recomp produce
  // null schedule (target ≈ current → direction='maintain' per
  // C-5 consistency), but recomp's display should describe the
  // composition shift, not the static maintain copy. Mirrors
  // the D-1 goal-summary distinction.
  const dateLabel =
    summary.schedule != null
      ? formatAchievementDateLabel(
          summary.schedule.targetDate,
          summary.schedule.weeksToGoal,
        )
      : summary.weight.direction === 'recomp'
        ? getRecompDateLabel()
        : getMaintenanceDateLabel();

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

        {/* Achievement-date card */}
        <View
          style={[
            styles.section,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Ionicons
              name="flag-outline"
              size={20}
              color={colors.primary}
            />
            <Text
              style={[styles.sectionTitle, { color: colors.textPrimary }]}
            >
              達成日
            </Text>
          </View>
          <Text
            style={[styles.dateValue, { color: colors.textPrimary }]}
          >
            {dateLabel}
          </Text>
        </View>

        {/* Body composition forecast — B-5 full-width wire */}
        <View
          style={[
            styles.section,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Ionicons
              name="body-outline"
              size={20}
              color={colors.primary}
            />
            <Text
              style={[styles.sectionTitle, { color: colors.textPrimary }]}
            >
              体組成予測 ★
            </Text>
          </View>
          <View style={styles.chartWrap}>
            <BodyCompositionChart
              currentWeight={summary.weight.current}
              targetWeight={summary.weight.target}
              proteinFactor={summary.bodyComposition.proteinFactorUsed}
              weeklyRatePct={weeklyRatePct ?? 0}
              width={280}
              testID="motivation-body-comp-chart"
            />
          </View>
        </View>

        {/* Motivation copy — goalType-differentiated */}
        <View
          style={[
            styles.section,
            {
              backgroundColor: colors.primary + '10',
              borderColor: colors.primary + '30',
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Ionicons
              name="sparkles-outline"
              size={20}
              color={colors.primary}
            />
            <Text
              style={[styles.sectionTitle, { color: colors.primary }]}
              accessibilityRole="header"
            >
              {copy.title}
            </Text>
          </View>
          <Text
            style={[styles.bodyCopy, { color: colors.textPrimary }]}
          >
            {copy.body}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.ctaBar, { borderTopColor: colors.border }]}>
        <Button
          title={CTA_LABEL}
          onPress={handleSubmit}
          variant="primary"
          size="lg"
          fullWidth
          disabled={isAdvancing}
          testID="motivation-cta"
        />
      </View>
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
  section: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.titleMedium,
  },
  dateValue: {
    ...typography.titleMedium,
    fontVariant: ['tabular-nums'],
  },
  chartWrap: {
    alignItems: 'center',
  },
  bodyCopy: {
    ...typography.bodyMedium,
    lineHeight: 22,
  },
  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
