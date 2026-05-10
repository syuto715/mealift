import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { getColors, radius } from '../../theme/tokens';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import {
  assertChartProps,
  computeChartData,
  computeSegmentWidths,
  formatChartAccessibilityLabel,
  formatWeightLabel,
  sanitizeChartProps,
} from '../../domain/bodyCompositionChartUtils';

// v1.3.0 / Onboarding v2 / Phase B-5 — SVG body-composition chart
// for the [10] motivation screen. Two horizontal stacked bars
// (current / target), each split into muscle (blue) + fat (yellow)
// segments. Bar widths normalize to the larger of the two weights
// so the relative composition shift is visually obvious.
//
// Patterns applied:
//   #5  fail-fast on caller misuse — assertChartProps in __DEV__
//   #11 color + non-color redundant encoding — segments carry both
//       hue and on-bar kg labels (when wide enough); legend pairs
//       color dot + Japanese label
//   #12 conditional accessibilityRole — Svg uses role="image" with
//       a rich label so VoiceOver reads the full forecast
//   #25 pure-helper extraction — all logic in bodyCompositionChartUtils
//   #28 __DEV__ assert + production sanitize hybrid
//
// SVG conventions inherit from MuscleBodyDiagram (Phase 6.2):
// react-native-svg + viewBox + theme tokens via getColors().

interface BodyCompositionChartProps {
  currentWeight: number;
  targetWeight: number;
  proteinFactor: number;
  weeklyRatePct: number;
  currentBodyFatPct?: number;
  width?: number;
  testID?: string;
}

const VIEWBOX_WIDTH = 280;
const VIEWBOX_HEIGHT = 180;

// Layout constants — derived from the 280 viewBox so changing
// width prop only affects rendered scale, not internal proportions.
const BAR_X = 12;
// Codex pass 1 / Important #2 — reserve a right gutter so the
// "199.9 kg" right-side label fits without clipping the viewBox
// edge. 56 covers the worst-case JP weight label at fontSize 12
// ("199.9 kg" ≈ 50 unit-widths) plus 6 unit breathing room.
const RIGHT_LABEL_GUTTER = 56;
const BAR_MAX_WIDTH = VIEWBOX_WIDTH - BAR_X - RIGHT_LABEL_GUTTER;
const BAR_HEIGHT = 28;
const CURRENT_BAR_Y = 30;
const TARGET_BAR_Y = 96;
// Inner segment labels only render when the segment is wide enough
// to fit text without overflow — 44px gives space for "筋 50.0".
const SEGMENT_LABEL_MIN_WIDTH = 44;

export function BodyCompositionChart({
  currentWeight,
  targetWeight,
  proteinFactor,
  weeklyRatePct,
  currentBodyFatPct,
  width = VIEWBOX_WIDTH,
  testID,
}: BodyCompositionChartProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  if (__DEV__) {
    assertChartProps({
      currentWeight,
      targetWeight,
      proteinFactor,
      weeklyRatePct,
      currentBodyFatPct,
    });
  }
  const safe = sanitizeChartProps({
    currentWeight,
    targetWeight,
    proteinFactor,
    weeklyRatePct,
    currentBodyFatPct,
  });

  const data = computeChartData(safe);
  const a11yLabel = formatChartAccessibilityLabel(data, safe.weeklyRatePct);

  // Normalize bar widths against the larger of the two weights so
  // the relative size shift between current and target is visually
  // honest (a 70→65 case shows two near-equal bars; a 60→90 case
  // shows the target bar markedly longer).
  const maxWeight = Math.max(data.current.weightKg, data.target.weightKg, 1);
  const currentBarWidth = (data.current.weightKg / maxWeight) * BAR_MAX_WIDTH;
  const targetBarWidth = (data.target.weightKg / maxWeight) * BAR_MAX_WIDTH;

  // Per-bar segment widths — Codex pass 1 / Critical fix —
  // re-normalize against the clamped-mass sum so extreme inputs
  // that drive a kg projection negative can't produce a Rect
  // with negative width (undefined SVG behavior). See
  // computeSegmentWidths for the rationale.
  const currentSegments = computeSegmentWidths(
    data.current.muscleKg,
    data.current.fatKg,
    currentBarWidth,
  );
  const targetSegments = computeSegmentWidths(
    data.target.muscleKg,
    data.target.fatKg,
    targetBarWidth,
  );

  const muscleColor = colors.protein;
  const fatColor = colors.fat;
  const heightForWidth = (width / VIEWBOX_WIDTH) * VIEWBOX_HEIGHT;

  return (
    <View style={styles.container} testID={testID}>
      <Svg
        width={width}
        height={heightForWidth}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        accessibilityRole="image"
        accessibilityLabel={a11yLabel}
      >
        {/* Current bar */}
        <SvgText
          x={BAR_X}
          y={CURRENT_BAR_Y - 8}
          fontSize={11}
          fontWeight="600"
          fill={colors.textSecondary}
        >
          現在
        </SvgText>
        <SvgText
          x={BAR_X + currentBarWidth + 6}
          y={CURRENT_BAR_Y + BAR_HEIGHT / 2 + 4}
          fontSize={12}
          fontWeight="700"
          fill={colors.textPrimary}
        >
          {formatWeightLabel(data.current.weightKg)}
        </SvgText>
        <BarGroup
          x={BAR_X}
          y={CURRENT_BAR_Y}
          muscleWidth={currentSegments.muscleWidth}
          fatWidth={currentSegments.fatWidth}
          muscleKg={data.current.muscleKg}
          fatKg={data.current.fatKg}
          muscleColor={muscleColor}
          fatColor={fatColor}
          textColor={colors.surface}
        />

        {/* Target bar */}
        <SvgText
          x={BAR_X}
          y={TARGET_BAR_Y - 8}
          fontSize={11}
          fontWeight="600"
          fill={colors.textSecondary}
        >
          目標
        </SvgText>
        <SvgText
          x={BAR_X + targetBarWidth + 6}
          y={TARGET_BAR_Y + BAR_HEIGHT / 2 + 4}
          fontSize={12}
          fontWeight="700"
          fill={colors.textPrimary}
        >
          {formatWeightLabel(data.target.weightKg)}
        </SvgText>
        <BarGroup
          x={BAR_X}
          y={TARGET_BAR_Y}
          muscleWidth={targetSegments.muscleWidth}
          fatWidth={targetSegments.fatWidth}
          muscleKg={data.target.muscleKg}
          fatKg={data.target.fatKg}
          muscleColor={muscleColor}
          fatColor={fatColor}
          textColor={colors.surface}
        />
      </Svg>

      {/* Legend — Pattern 11 redundant encoding (color + label) */}
      <View
        style={styles.legendRow}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        <LegendDot color={muscleColor} label="筋肉" colors={colors} />
        <LegendDot color={fatColor} label="脂肪" colors={colors} />
      </View>
    </View>
  );
}

interface BarGroupProps {
  x: number;
  y: number;
  muscleWidth: number;
  fatWidth: number;
  muscleKg: number;
  fatKg: number;
  muscleColor: string;
  fatColor: string;
  textColor: string;
}

function BarGroup({
  x,
  y,
  muscleWidth,
  fatWidth,
  muscleKg,
  fatKg,
  muscleColor,
  fatColor,
  textColor,
}: BarGroupProps) {
  return (
    <G>
      <Rect
        x={x}
        y={y}
        width={muscleWidth}
        height={BAR_HEIGHT}
        rx={4}
        fill={muscleColor}
      />
      <Rect
        x={x + muscleWidth}
        y={y}
        width={fatWidth}
        height={BAR_HEIGHT}
        rx={4}
        fill={fatColor}
      />
      {muscleWidth >= SEGMENT_LABEL_MIN_WIDTH && (
        <SvgText
          x={x + muscleWidth / 2}
          y={y + BAR_HEIGHT / 2 + 4}
          fontSize={10}
          fontWeight="700"
          fill={textColor}
          textAnchor="middle"
        >
          {`筋 ${muscleKg.toFixed(1)}`}
        </SvgText>
      )}
      {fatWidth >= SEGMENT_LABEL_MIN_WIDTH && (
        <SvgText
          x={x + muscleWidth + fatWidth / 2}
          y={y + BAR_HEIGHT / 2 + 4}
          fontSize={10}
          fontWeight="700"
          fill={textColor}
          textAnchor="middle"
        >
          {`脂 ${fatKg.toFixed(1)}`}
        </SvgText>
      )}
    </G>
  );
}

interface LegendDotProps {
  color: string;
  label: string;
  colors: ReturnType<typeof getColors>;
}

function LegendDot({ color, label, colors }: LegendDotProps) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  legendRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: radius.sm / 2,
  },
  legendLabel: {
    ...typography.bodySmall,
  },
});

export default BodyCompositionChart;
