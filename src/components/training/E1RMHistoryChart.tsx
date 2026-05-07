import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import type { E1RMObservation } from '../../infra/repositories/oneRepMaxRepository';
import { format, parseISO } from 'date-fns';

interface E1RMHistoryChartProps {
  history: E1RMObservation[];
  // Window start (ISO timestamp). Used for the X-axis left edge label
  // and to position points proportionally even when the user has only a
  // few observations clustered at the right edge.
  windowStart: string;
  // Window end. Defaults to "now"; surfaced to the right-edge label.
  windowEnd?: string;
}

const CHART_HEIGHT = 180;
const PADDING = { top: 12, right: 12, bottom: 24, left: 36 };
const POINT_RADIUS = 3;
const STROKE_WIDTH = 2;

// Build 15 / Feature 5-B history chart. SVG line + dots with a
// 90-day window of estimated_1rm observations from oneRepMaxRepository.
// Renders an empty-state hint when no data points exist.
export function E1RMHistoryChart({
  history,
  windowStart,
  windowEnd,
}: E1RMHistoryChartProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const startMs = useMemo(() => parseISO(windowStart).getTime(), [windowStart]);
  const endMs = useMemo(
    () => (windowEnd ? parseISO(windowEnd).getTime() : Date.now()),
    [windowEnd],
  );

  const { minY, maxY, points } = useMemo(() => {
    if (history.length === 0) {
      return { minY: 0, maxY: 0, points: [] as { x: number; y: number; obs: E1RMObservation }[] };
    }
    const values = history.map((h) => h.e1rmKg);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    // 10% padding on the Y range; collapse to a tight band around the
    // value when min === max (single point or flat history).
    const range = rawMax - rawMin || rawMax * 0.1 || 1;
    const yMin = Math.max(0, rawMin - range * 0.1);
    const yMax = rawMax + range * 0.1;
    return {
      minY: yMin,
      maxY: yMax,
      points: history.map((obs) => ({
        x: parseISO(obs.observedAt).getTime(),
        y: obs.e1rmKg,
        obs,
      })),
    };
  }, [history]);

  if (history.length === 0) {
    return (
      <View style={[styles.empty, { height: CHART_HEIGHT }]}>
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
          まだ記録がありません。
        </Text>
        <Text style={[styles.emptySub, { color: colors.textTertiary }]}>
          ワーキングセットを記録すると、ここに 1RM 推移が表示されます。
        </Text>
      </View>
    );
  }

  // Layout the chart in a fluid container — final pixel layout depends
  // on the parent's measured width, computed via aspect ratio inside
  // the SVG viewBox so resizing is handled by the SVG renderer.
  const VIEW_W = 320; // viewBox virtual width — actual pixels scale to parent
  const VIEW_H = CHART_HEIGHT;
  const innerW = VIEW_W - PADDING.left - PADDING.right;
  const innerH = VIEW_H - PADDING.top - PADDING.bottom;
  const xRange = endMs - startMs || 1;
  const yRange = maxY - minY || 1;

  const projectedPoints = points.map((p) => {
    const xPct = Math.max(0, Math.min(1, (p.x - startMs) / xRange));
    const yPct = (p.y - minY) / yRange;
    return {
      cx: PADDING.left + xPct * innerW,
      cy: PADDING.top + (1 - yPct) * innerH,
      obs: p.obs,
    };
  });

  const polylinePoints = projectedPoints
    .map((p) => `${p.cx.toFixed(2)},${p.cy.toFixed(2)}`)
    .join(' ');

  // Y-axis ticks: min, mid, max with values rounded to whole kg.
  const yTicks = [minY, (minY + maxY) / 2, maxY].map((v) => Math.round(v));

  return (
    <View>
      <Svg
        width="100%"
        height={CHART_HEIGHT}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
      >
        {/* Y-axis ticks + grid lines */}
        {yTicks.map((tick, i) => {
          const tickPct = (tick - minY) / yRange;
          const y = PADDING.top + (1 - tickPct) * innerH;
          return (
            <React.Fragment key={`tick-${i}`}>
              <Line
                x1={PADDING.left}
                y1={y}
                x2={VIEW_W - PADDING.right}
                y2={y}
                stroke={colors.border}
                strokeWidth={0.5}
                strokeDasharray="2,2"
              />
              <SvgText
                x={PADDING.left - 4}
                y={y + 3}
                fill={colors.textTertiary}
                fontSize="9"
                textAnchor="end"
              >
                {tick}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Line */}
        {projectedPoints.length >= 2 && (
          <Polyline
            points={polylinePoints}
            stroke={colors.primary}
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
        )}

        {/* Dots */}
        {projectedPoints.map((p, i) => (
          <Circle
            key={`dot-${i}`}
            cx={p.cx}
            cy={p.cy}
            r={POINT_RADIUS}
            fill={colors.primary}
          />
        ))}

        {/* X-axis edge labels */}
        <SvgText
          x={PADDING.left}
          y={VIEW_H - 6}
          fill={colors.textTertiary}
          fontSize="9"
          textAnchor="start"
        >
          {format(new Date(startMs), 'M/d')}
        </SvgText>
        <SvgText
          x={VIEW_W - PADDING.right}
          y={VIEW_H - 6}
          fill={colors.textTertiary}
          fontSize="9"
          textAnchor="end"
        >
          {format(new Date(endMs), 'M/d')}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  emptyText: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
  emptySub: {
    ...typography.labelSmall,
    textAlign: 'center',
  },
});
