import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import Svg, { Rect, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import {
  type VolumeGroupSummary,
  type VolumeZone,
} from '../../domain/volumeLandmark';

// Build 16 / Phase 2 (Feature E) / Phase 2.2 — MEV/MAV/MRV bar
// chart for the volume dashboard.
//
// Each row visualizes one VolumeGroup. The horizontal bar's
// background is split into 5 colored segments matching the
// landmark structure:
//
//   0      MEV    mavMin    mavMax    MRV     barMax
//   ├──────┼─────────┼──────────┼───────┼──────────┤
//   gray   green-     green-    yellow  red
//          light      strong
//
// The user's current weekly sets are drawn on top as a vertical
// marker line. The bar's right edge stretches a little past MRV so
// an over-MRV user still sees the overshoot rendered (otherwise the
// red zone would always be invisible).
//
// Kickoff §1 + Phase 2.1 sign-off F4 — the underlying classification
// is 4 zones (`VolumeZone`), but the visualization uses 5 segments
// to show the MAV range explicitly. The classification result
// (passed via `summary.zone`) drives the row's value-text color so
// the active band stands out.

interface VolumeLandmarkChartProps {
  summaries: VolumeGroupSummary[];
  // Optional cap — preview cards on the progress tab pass 3 to show
  // only the top muscles; the full-screen dashboard omits it for
  // all 9. When set, summaries are sorted by current sets desc and
  // truncated.
  topN?: number;
  // When true, render a more compact row with smaller fonts +
  // tighter padding for the in-tab preview card.
  compact?: boolean;
}

// Bar geometry constants. Heights expressed as the inner bar height;
// outer SVG height adds a small margin so the marker label fits.
const BAR_HEIGHT_FULL = 22;
const BAR_HEIGHT_COMPACT = 16;
const BAR_RADIUS = 4;
// Bar's right edge sits at this multiple of MRV. 1.3 leaves a
// visible "above MRV" red zone for users sitting at or just past
// the recovery cap.
const BAR_MAX_MULT = 1.3;

const ZONE_LABEL_JA: Record<VolumeZone, string> = {
  below_mev: '不足',
  mev_to_mav: '増加余地',
  mav_to_mrv: '適正',
  above_mrv: '過剰',
};

export function VolumeLandmarkChart({
  summaries,
  topN,
  compact = false,
}: VolumeLandmarkChartProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  // Display ordering: when topN is set, sort by current sets desc
  // and slice. Without topN, preserve VOLUME_GROUPS_ORDER (already
  // baked into the input array by summarizeVolumeGroups).
  const display = React.useMemo(() => {
    if (topN == null) return summaries;
    const sorted = [...summaries].sort((a, b) => b.weeklySets - a.weeklySets);
    return sorted.slice(0, topN);
  }, [summaries, topN]);

  // Color palette for the 5 background segments + the marker line +
  // the zone label dot. Using transparent zone fills (-15 alpha) so
  // the bar reads as a soft background; the marker on top is fully
  // opaque.
  const ZONE_COLORS = {
    belowMev: colors.textTertiary + '30',
    mevToMavMin: colors.success + '25',
    mavRange: colors.success + '60',
    mavMaxToMrv: colors.warning + '50',
    aboveMrv: colors.error + '60',
  };
  const MARKER_COLOR = colors.textPrimary;

  const ZONE_TEXT_COLOR: Record<VolumeZone, string> = {
    below_mev: colors.textTertiary,
    mev_to_mav: colors.success,
    mav_to_mrv: colors.success,
    above_mrv: colors.error,
  };

  if (display.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
          今週のトレーニングデータがありません
        </Text>
      </View>
    );
  }

  const barHeight = compact ? BAR_HEIGHT_COMPACT : BAR_HEIGHT_FULL;

  return (
    <View style={styles.container}>
      {display.map((s) => {
        const lm = s.landmark;
        const barMax = Math.max(lm.mrv * BAR_MAX_MULT, s.weeklySets * 1.05, 1);
        // Convert each landmark to a percent of the bar width.
        const pct = (n: number) => Math.min(100, (n / barMax) * 100);
        const mevPct = pct(lm.mev);
        const mavMinPct = pct(lm.mavMin);
        const mavMaxPct = pct(lm.mavMax);
        const mrvPct = pct(lm.mrv);
        const setsPct = pct(s.weeklySets);

        const zoneLabel = ZONE_LABEL_JA[s.zone];
        const zoneColor = ZONE_TEXT_COLOR[s.zone];

        return (
          <View
            key={s.group}
            style={[
              styles.row,
              compact && styles.rowCompact,
            ]}
          >
            <View style={styles.labelContainer}>
              <Text
                style={[
                  styles.label,
                  compact && styles.labelCompact,
                  { color: colors.textPrimary },
                ]}
                numberOfLines={1}
              >
                {s.labelJa}
              </Text>
            </View>
            <View
              style={[
                styles.barOuter,
                {
                  height: barHeight,
                  backgroundColor: colors.surfaceSecondary,
                  borderRadius: BAR_RADIUS,
                },
              ]}
            >
              <Svg
                width="100%"
                height={barHeight}
                viewBox={`0 0 100 ${barHeight}`}
                preserveAspectRatio="none"
              >
                {/* Segment 1 — 0 to MEV (below_mev band) */}
                <Rect
                  x={0}
                  y={0}
                  width={mevPct}
                  height={barHeight}
                  fill={ZONE_COLORS.belowMev}
                />
                {/* Segment 2 — MEV to mavMin (mev_to_mav, productive but light) */}
                <Rect
                  x={mevPct}
                  y={0}
                  width={Math.max(0, mavMinPct - mevPct)}
                  height={barHeight}
                  fill={ZONE_COLORS.mevToMavMin}
                />
                {/* Segment 3 — mavMin to mavMax (target zone, strong green) */}
                <Rect
                  x={mavMinPct}
                  y={0}
                  width={Math.max(0, mavMaxPct - mavMinPct)}
                  height={barHeight}
                  fill={ZONE_COLORS.mavRange}
                />
                {/* Segment 4 — mavMax to MRV (yellow caution band) */}
                <Rect
                  x={mavMaxPct}
                  y={0}
                  width={Math.max(0, mrvPct - mavMaxPct)}
                  height={barHeight}
                  fill={ZONE_COLORS.mavMaxToMrv}
                />
                {/* Segment 5 — MRV to barMax (above_mrv, red overflow) */}
                <Rect
                  x={mrvPct}
                  y={0}
                  width={Math.max(0, 100 - mrvPct)}
                  height={barHeight}
                  fill={ZONE_COLORS.aboveMrv}
                />
                {/* Current sets marker — vertical line on top */}
                <SvgLine
                  x1={setsPct}
                  y1={1}
                  x2={setsPct}
                  y2={barHeight - 1}
                  stroke={MARKER_COLOR}
                  strokeWidth={2}
                />
                {/* Numeric overlay near the marker. Anchored end/start
                    based on which side of the bar has more room so the
                    label doesn't get clipped at edges. */}
                {!compact && (
                  <SvgText
                    x={setsPct > 90 ? 98 : setsPct + 2}
                    y={barHeight - 6}
                    fontSize="9"
                    fontWeight="600"
                    textAnchor={setsPct > 90 ? 'end' : 'start'}
                    fill={MARKER_COLOR}
                  >
                    {s.weeklySets}
                  </SvgText>
                )}
              </Svg>
            </View>
            <View style={styles.valueContainer}>
              <Text
                style={[
                  styles.zoneLabel,
                  compact && styles.zoneLabelCompact,
                  { color: zoneColor },
                ]}
              >
                {zoneLabel}
              </Text>
              <Text
                style={[
                  styles.rangeLabel,
                  { color: colors.textTertiary },
                ]}
              >
                {/* Phase 2 sign-off F8 — single MAV value with the
                    full range as supporting copy. */}
                MAV {Math.round((lm.mavMin + lm.mavMax) / 2)}
                {!compact &&
                  ` (${lm.mavMin}-${lm.mavMax})`}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  emptyContainer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowCompact: {
    gap: spacing.xs,
  },
  labelContainer: {
    width: 86,
  },
  label: {
    ...typography.labelMedium,
  },
  labelCompact: {
    ...typography.labelSmall,
  },
  barOuter: {
    flex: 1,
    overflow: 'hidden',
  },
  valueContainer: {
    width: 86,
    alignItems: 'flex-end',
  },
  zoneLabel: {
    ...typography.labelSmall,
    fontWeight: '600',
  },
  zoneLabelCompact: {
    fontSize: 10,
  },
  rangeLabel: {
    ...typography.labelSmall,
    fontSize: 9,
    marginTop: 1,
  },
});
