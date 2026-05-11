import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
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
  formatCaloriesLabel,
  formatDeltaLabel,
} from '../../src/domain/goalSummaryAggregator';
import { formatGoalSummary } from '../../src/domain/goalWeightValidation';

// v1.3.0 / Onboarding v2 / Phase D-1 — Goal summary screen [5.5].
//
// Read-only aggregation of C-3 + C-4 + C-5 inputs. Three sections:
//   1. 体重目標 (current → target + schedule)
//   2. 1日のカロリー (maintenance / target / delta)
//   3. 体組成予測 (B-5 BodyCompositionChart preview using
//      proteinFactor=1.6 default until [8] collects the actual
//      factor; aggregator flags this via proteinFactorIsDefault
//      so the screen can label the preview as 目安)
//
// Edit links push back to the appropriate earlier screen:
//   - 体重目標 編集 → /goal-weight (C-5)
//   - 1日のカロリー 編集 → /activity (C-4)
//   - 体組成予測 編集 → /goal-weight (proteinFactor is owned by
//     [8] which hasn't shipped; redirect to C-5 since that's the
//     closest editable surface in the current flow)
//
// Pattern 5 mount-time sanity check — aggregator returns null when
// any prior-screen input is invalid. We redirect to /welcome in
// that case so a deep-link / dev-tools arrival can't strand the
// user on a half-empty summary.
//
// Pattern 26 transitional bridge — CTA pushes legacy
// /(onboarding)/body-and-training until Phase D-2 ships /meal-plan.
// D-1 adds no new v2 fields (read-only), so no complete.tsx
// hardening needed. body-and-training's existing C-4 fromNewFlow
// guard already preserves all C-3/C-4/C-5 v2 values.
//
// Patterns applied:
//   #5  mount-time sanity check + CTA double-tap defense
//   #11 each section: icon + label + bold value + JP unit
//   #12 header / button (edit) / button (CTA) role split
//   #18 SSoT — aggregator funnels every numeric through the
//       existing per-phase helpers (no recomputed math here)
//   #18 補強 — onboardingStep monotonic bump to 6 on mount
//   #22 — back-nav from edit screens preserves step >= 6
//   #25 — aggregation logic lives in goalSummaryAggregator.ts

const TITLE = 'あなたのプラン';
const SUBTITLE = 'ここまでの選択内容を確認しましょう';
const CTA_LABEL = '進める';

export default function GoalSummaryScreen() {
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
  const onboardingStep = useOnboardingStore((s) => s.onboardingStep);
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

  // Sanity redirect — Codex pass 1 / Critical fix — watches the
  // summary value across mount AND post-mount edits. The original
  // one-shot useEffect([]) left a hole where an edit-link back-nav
  // that nulled weeklyRatePct (per C-5 auto-coordination) would
  // strand the user on a blank fallback container without
  // redirecting. findEarliestInvalidRoute picks the precise edit
  // surface to land on (Codex pass 1 / Important #1) so the user
  // doesn't replay from /welcome.
  useEffect(() => {
    if (summary != null) return;
    if (targetWeightKg == null || weeklyRatePct == null) {
      // The aggregator inputs already missing the C-5 fields —
      // route to /goal-weight directly.
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

  // Step bump (Pattern 22 monotonic). Separate from the sanity
  // effect so the redirect path doesn't run a stray setField on
  // the way out.
  useEffect(() => {
    if (summary != null && onboardingStep < 6) {
      setField('onboardingStep', 6);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary == null]);

  const handleEditGoalWeight = useCallback(() => {
    router.push('/(onboarding)/goal-weight');
  }, []);

  const handleEditActivity = useCallback(() => {
    router.push('/(onboarding)/activity');
  }, []);

  const handleSubmit = useCallback(async () => {
    if (isAdvancing) return;
    if (summary == null) return;
    setIsAdvancing(true);
    // Phase D-2 flipped this to the new flow's [6] /meal-plan
    // screen. The D-1 stop-gap (legacy /body-and-training) is
    // no longer reachable from this CTA. meal-plan itself still
    // bridges to /body-and-training until Phase D-3 ships
    // /meal-timing (Pattern 26 chain continues).
    router.push('/(onboarding)/meal-plan');
  }, [isAdvancing, summary]);

  if (summary == null) {
    // Guard against the brief render window between mount and
    // the redirect effect — show nothing rather than half-empty
    // sections. The useEffect above will router.replace shortly.
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]} />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text
          style={[styles.title, { color: colors.textPrimary }]}
          accessibilityRole="header"
        >
          {TITLE}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {SUBTITLE}
        </Text>

        {/* Section 1: 体重目標 */}
        <SummarySection
          icon="trending-down-outline"
          title="体重目標"
          onEdit={handleEditGoalWeight}
          editLabel="体重目標を編集"
          colors={colors}
        >
          <Text style={[styles.primaryValue, { color: colors.textPrimary }]}>
            {summary.weight.current.toFixed(1)} kg →{' '}
            {summary.weight.target.toFixed(1)} kg
          </Text>
          {summary.schedule && (
            <Text
              style={[styles.secondaryValue, { color: colors.textSecondary }]}
            >
              達成予定: {formatGoalSummary({
                targetDate: summary.schedule.targetDate,
                weeksToGoal: summary.schedule.weeksToGoal,
              })}
              {'\n'}
              週 {summary.schedule.weeklyRatePct > 0 ? '+' : ''}
              {summary.schedule.weeklyRatePct}% ペース
            </Text>
          )}
          {/* Codex pass 1 / Important #2 — recomp is a distinct
              direction from maintain. The calorie section can
              show a non-zero delta for recomp users (slight
              cut/bulk allowed), so the weight-card copy needs to
              differentiate or it'll contradict the kcal section
              right below. */}
          {summary.schedule == null && summary.weight.direction === 'maintain' && (
            <Text
              style={[styles.secondaryValue, { color: colors.textSecondary }]}
            >
              現状維持を継続
            </Text>
          )}
          {summary.schedule == null && summary.weight.direction === 'recomp' && (
            <Text
              style={[styles.secondaryValue, { color: colors.textSecondary }]}
            >
              体重を維持しながら体組成を改善
            </Text>
          )}
        </SummarySection>

        {/* Section 2: 1日のカロリー */}
        <SummarySection
          icon="flame-outline"
          title="1日のカロリー"
          onEdit={handleEditActivity}
          editLabel="活動レベルを編集"
          colors={colors}
        >
          <View style={styles.kcalRow}>
            <Text style={[styles.kcalLabel, { color: colors.textTertiary }]}>
              維持
            </Text>
            <Text style={[styles.kcalValue, { color: colors.textSecondary }]}>
              {formatCaloriesLabel(summary.calories.maintenance)}
            </Text>
          </View>
          <View style={styles.kcalRow}>
            <Text style={[styles.kcalLabel, { color: colors.textTertiary }]}>
              目標
            </Text>
            <Text style={[styles.primaryValue, { color: colors.textPrimary }]}>
              {formatCaloriesLabel(summary.calories.target)}
            </Text>
          </View>
          <Text
            style={[styles.deltaValue, { color: colors.textSecondary }]}
          >
            {formatDeltaLabel(summary.calories.deltaPerDay)}
          </Text>
        </SummarySection>

        {/* Section 3: 体組成予測 (B-5 chart preview)
            Codex pass 1 / Nit #2 — soften edit label + note copy.
            The edit button currently routes back to /goal-weight
            (proteinFactor is owned by [8] which hasn't shipped),
            so "前提を編集" overstated the affordance. */}
        <SummarySection
          icon="body-outline"
          title="体組成予測 ★"
          onEdit={handleEditGoalWeight}
          editLabel="目標体重を見直す"
          colors={colors}
        >
          {summary.bodyComposition.proteinFactorIsDefault && (
            <Text
              style={[styles.previewNote, { color: colors.textTertiary }]}
            >
              タンパク質設定前の仮計算です
            </Text>
          )}
          <View style={styles.chartWrap}>
            <BodyCompositionChart
              currentWeight={summary.weight.current}
              targetWeight={summary.weight.target}
              proteinFactor={summary.bodyComposition.proteinFactorUsed}
              weeklyRatePct={weeklyRatePct ?? 0}
              width={240}
              testID="goal-summary-body-comp-chart"
            />
          </View>
        </SummarySection>
      </ScrollView>

      <View style={[styles.ctaBar, { borderTopColor: colors.border }]}>
        <Button
          title={CTA_LABEL}
          onPress={handleSubmit}
          variant="primary"
          size="lg"
          fullWidth
          disabled={isAdvancing}
          testID="goal-summary-cta"
        />
      </View>
    </View>
  );
}

interface SummarySectionProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  onEdit: () => void;
  editLabel: string;
  colors: ReturnType<typeof getColors>;
  children: React.ReactNode;
}

function SummarySection({
  icon,
  title,
  onEdit,
  editLabel,
  colors,
  children,
}: SummarySectionProps) {
  return (
    <View
      style={[
        styles.section,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name={icon} size={18} color={colors.primary} />
          <Text
            style={[styles.sectionTitle, { color: colors.textPrimary }]}
            accessibilityRole="header"
          >
            {title}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={editLabel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.editLink, { color: colors.primary }]}>
            編集
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.sectionBody}>{children}</View>
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
    justifyContent: 'space-between',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.titleMedium,
  },
  editLink: {
    ...typography.labelMedium,
  },
  sectionBody: {
    gap: spacing.xs,
  },
  primaryValue: {
    ...typography.titleMedium,
    fontVariant: ['tabular-nums'],
  },
  secondaryValue: {
    ...typography.bodySmall,
    fontVariant: ['tabular-nums'],
  },
  kcalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  kcalLabel: {
    ...typography.bodySmall,
  },
  kcalValue: {
    ...typography.bodyLarge,
    fontVariant: ['tabular-nums'],
  },
  deltaValue: {
    ...typography.bodySmall,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.xs,
  },
  previewNote: {
    ...typography.bodySmall,
  },
  chartWrap: {
    alignItems: 'center',
  },
  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
