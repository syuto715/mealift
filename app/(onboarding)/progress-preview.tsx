import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import Svg, {
  Circle,
  Line,
  Polyline,
  Text as SvgText,
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../src/theme/tokens';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { Button } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import {
  aggregateOnboardingSummary,
  findEarliestInvalidRoute,
} from '../../src/domain/goalSummaryAggregator';
import {
  type TrajectoryPoint,
  computeTrajectoryBounds,
  computeTrajectoryPoints,
  formatTrajectoryAccessibilityLabel,
  getProgressCopyForDirection,
  isTrajectoryTruncated,
} from '../../src/domain/progressTrajectoryUtils';

// v1.3.0 / Onboarding v2 / Phase D-7 — Progress preview screen [11].
//
// Read-only screen — visualizes the user's projected weight
// trajectory across the planned weeks + direction-aware copy.
// Last transitional phase: CTA pushes directly to /complete
// (legacy + accumulated C-2..D-5 hardening serves as the end
// destination). D-8 will rewrite /complete under the same
// route name so no CTA flip is needed.
//
// Patterns applied:
//   #5  mount sanity check + CTA double-tap defense
//   #11 chart polyline color + endpoint dots + numerical
//       tick labels (3-cue redundant)
//   #12 header / region (sections) / image (chart) / button
//   #15 補強 cross-consumer — 4-tier direction copy
//       (D-6 maintain/recomp distinction preserved)
//   #18 SSoT — aggregator + progressTrajectoryUtils
//   #22 monotonic step bump to 12
//   #25 all logic in domain/progressTrajectoryUtils.ts; the
//       inline SVG is render-only (geometry comes from the
//       compute helpers)

const TITLE = 'あなたの進捗予測';
const SUBTITLE = '計画通り進んだ場合の体重の推移です';
const CTA_LABEL = '進める';

// SVG layout — matches the B-5 BodyCompositionChart conventions
// (280×180 viewBox at width 280, scales linearly via the SVG
// width prop). Padding values picked to leave room for the
// y-axis weight labels + x-axis week labels.
const VIEWBOX_WIDTH = 280;
const VIEWBOX_HEIGHT = 180;
const CHART_PADDING = {
  top: 16,
  right: 20,
  bottom: 32,
  left: 44,
};
const CHART_INNER_WIDTH =
  VIEWBOX_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
const CHART_INNER_HEIGHT =
  VIEWBOX_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

export default function ProgressPreviewScreen() {
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

  // D-1 / D-6 precedent — watch-summary redirect for any
  // mount-or-edit-induced null transition.
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

  // D-4 precedent — mount-time cache refresh + step bump.
  useEffect(() => {
    if (summary == null) return;
    const liveState = useOnboardingStore.getState();
    if (liveState.onboardingStep >= 9) {
      liveState.calculateAll();
    }
    if (liveState.onboardingStep < 12) {
      setField('onboardingStep', 12);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary == null]);

  const handleSubmit = useCallback(() => {
    if (isAdvancing) return;
    if (summary == null) return;
    setIsAdvancing(true);
    // D-7 is the last transitional phase — CTA pushes directly
    // to /(onboarding)/complete, which has accumulated v2-field
    // hardening from C-2 / C-5 / D-2 / D-3 / D-4 / D-5
    // conditionals. Phase D-8 will rewrite /complete under the
    // same route name; no CTA flip needed here in that phase.
    router.push('/(onboarding)/complete');
  }, [isAdvancing, summary]);

  if (summary == null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]} />
    );
  }

  const trajectoryPoints = computeTrajectoryPoints(summary);
  const truncated = isTrajectoryTruncated(summary);
  const copy = getProgressCopyForDirection(
    summary.weight.direction,
    summary.schedule?.weeksToGoal ?? null,
  );

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

        {/* Trajectory chart — inline SVG, helper-thick geometry */}
        <View
          style={[
            styles.section,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Ionicons
              name={
                summary.weight.direction === 'bulk'
                  ? 'trending-up-outline'
                  : summary.weight.direction === 'cut'
                    ? 'trending-down-outline'
                    : 'analytics-outline'
              }
              size={20}
              color={colors.primary}
            />
            <Text
              style={[styles.sectionTitle, { color: colors.textPrimary }]}
            >
              体重の推移
            </Text>
          </View>
          {trajectoryPoints.length >= 2 ? (
            <>
              <TrajectoryChart points={trajectoryPoints} colors={colors} />
              {truncated && (
                <Text
                  style={[
                    styles.truncationNote,
                    { color: colors.textTertiary },
                  ]}
                >
                  ※ グラフは最初の 52 週まで表示しています
                </Text>
              )}
            </>
          ) : (
            <Text
              style={[styles.emptyChart, { color: colors.textSecondary }]}
            >
              {summary.weight.direction === 'recomp'
                ? '体重維持のため推移グラフはありません'
                : summary.weight.direction === 'maintain'
                  ? '現状維持のため推移グラフはありません'
                  : '予測なし'}
            </Text>
          )}
        </View>

        {/* Direction-aware copy — 4-tier branch */}
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
              name="bulb-outline"
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
          testID="progress-preview-cta"
        />
      </View>
    </View>
  );
}

// === TrajectoryChart ===
//
// Inline SVG renderer. Geometry computation lives in
// progressTrajectoryUtils (helper-thick); this component only
// maps points to viewBox coordinates + draws polyline + endpoint
// dots + axis tick labels.
interface TrajectoryChartProps {
  points: readonly TrajectoryPoint[];
  colors: ReturnType<typeof getColors>;
}

function TrajectoryChart({ points, colors }: TrajectoryChartProps) {
  const bounds = computeTrajectoryBounds(points);
  if (bounds == null) return null;

  const { minWeight, maxWeight, weekCap } = bounds;
  const weightSpan = maxWeight - minWeight;
  const weekSpan = weekCap > 0 ? weekCap : 1;

  // Map (week, weightKg) → (x, y) in viewBox coordinates.
  // Higher weight = higher y on screen would be inverted (SVG y
  // grows downward), so flip via subtraction from inner height.
  const toX = (week: number): number =>
    CHART_PADDING.left + (week / weekSpan) * CHART_INNER_WIDTH;
  const toY = (weightKg: number): number =>
    CHART_PADDING.top +
    CHART_INNER_HEIGHT -
    ((weightKg - minWeight) / weightSpan) * CHART_INNER_HEIGHT;

  const polylineCoords = points
    .map((p) => `${toX(p.week).toFixed(2)},${toY(p.weightKg).toFixed(2)}`)
    .join(' ');

  const startPoint = points[0];
  const endPoint = points[points.length - 1];
  // Codex pass 1 / Important fix — dedupe x-axis ticks. For
  // weekCap === 1 the original `[0, midWeek=0, weekCap=1]`
  // produced duplicate React keys + overlapping "0週" labels.
  // Set-based dedup + sorted output handles weekCap=0/1/N
  // uniformly.
  const midWeek = Math.floor(weekCap / 2);
  const xAxisTicks = Array.from(new Set([0, midWeek, weekCap])).sort(
    (a, b) => a - b,
  );

  const a11yLabel = formatTrajectoryAccessibilityLabel(points);

  return (
    <Svg
      width={VIEWBOX_WIDTH}
      height={VIEWBOX_HEIGHT}
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      accessibilityRole="image"
      accessibilityLabel={a11yLabel}
    >
      {/* Baseline axes — light gray for visual separation */}
      <Line
        x1={CHART_PADDING.left}
        y1={CHART_PADDING.top + CHART_INNER_HEIGHT}
        x2={CHART_PADDING.left + CHART_INNER_WIDTH}
        y2={CHART_PADDING.top + CHART_INNER_HEIGHT}
        stroke={colors.border}
        strokeWidth={1}
      />
      <Line
        x1={CHART_PADDING.left}
        y1={CHART_PADDING.top}
        x2={CHART_PADDING.left}
        y2={CHART_PADDING.top + CHART_INNER_HEIGHT}
        stroke={colors.border}
        strokeWidth={1}
      />

      {/* Y-axis labels (max + min) */}
      <SvgText
        x={CHART_PADDING.left - 6}
        y={CHART_PADDING.top + 4}
        fontSize={10}
        fill={colors.textTertiary}
        textAnchor="end"
      >
        {maxWeight.toFixed(0)}
      </SvgText>
      <SvgText
        x={CHART_PADDING.left - 6}
        y={CHART_PADDING.top + CHART_INNER_HEIGHT}
        fontSize={10}
        fill={colors.textTertiary}
        textAnchor="end"
      >
        {minWeight.toFixed(0)}
      </SvgText>

      {/* X-axis tick labels (0, midpoint, end) */}
      {xAxisTicks.map((w) => (
        <SvgText
          key={w}
          x={toX(w)}
          y={CHART_PADDING.top + CHART_INNER_HEIGHT + 16}
          fontSize={10}
          fill={colors.textTertiary}
          textAnchor="middle"
        >
          {w}週
        </SvgText>
      ))}

      {/* Trajectory polyline */}
      <Polyline
        points={polylineCoords}
        fill="none"
        stroke={colors.primary}
        strokeWidth={2}
      />

      {/* Endpoint dots + value labels */}
      <Circle
        cx={toX(startPoint.week)}
        cy={toY(startPoint.weightKg)}
        r={4}
        fill={colors.primary}
      />
      <SvgText
        x={toX(startPoint.week) + 8}
        y={toY(startPoint.weightKg) - 6}
        fontSize={10}
        fontWeight="700"
        fill={colors.textPrimary}
      >
        {startPoint.weightKg.toFixed(1)} kg
      </SvgText>
      <Circle
        cx={toX(endPoint.week)}
        cy={toY(endPoint.weightKg)}
        r={4}
        fill={colors.primary}
      />
      <SvgText
        x={toX(endPoint.week) - 8}
        y={toY(endPoint.weightKg) - 6}
        fontSize={10}
        fontWeight="700"
        fill={colors.textPrimary}
        textAnchor="end"
      >
        {endPoint.weightKg.toFixed(1)} kg
      </SvgText>
    </Svg>
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
    alignItems: 'stretch',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.titleMedium,
  },
  emptyChart: {
    ...typography.bodyMedium,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  truncationNote: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginTop: spacing.xs,
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
