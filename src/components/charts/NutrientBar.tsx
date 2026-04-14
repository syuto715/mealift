import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import type { ThemeColors } from '../../theme/tokens';
import type { BalanceStatus } from '../../domain/nutrientBalance';

interface NutrientBarProps {
  label: string;
  intake: number;
  target: number;
  unit: string;
  status: BalanceStatus;
  isUpperLimit: boolean;
  colors: ThemeColors;
  maxRatio?: number;
}

const STATUS_LABELS: Record<BalanceStatus, string> = {
  adequate: '適正',
  excess: '過剰',
  deficient: '不足',
};

function getStatusColors(status: BalanceStatus, colors: ThemeColors) {
  switch (status) {
    case 'adequate':
      return { bg: colors.success, text: '#FFFFFF' };
    case 'excess':
      return { bg: colors.warning, text: '#FFFFFF' };
    case 'deficient':
      return { bg: colors.primary, text: '#FFFFFF' };
  }
}

const BAR_HEIGHT = 14;

export function NutrientBar({
  label,
  intake,
  target,
  unit,
  status,
  isUpperLimit,
  colors,
  maxRatio = 2.0,
}: NutrientBarProps) {
  const ratio = target > 0 ? intake / target : 0;
  const clampedRatio = Math.min(ratio, maxRatio);
  const barPercent = (clampedRatio / maxRatio) * 100;

  // Target line position as % of the bar width
  const targetPercent = (1.0 / maxRatio) * 100;
  // Adequate zone: 80%-120% of target
  const zoneStart = isUpperLimit ? 0 : (0.8 / maxRatio) * 100;
  const zoneEnd = isUpperLimit ? targetPercent : (1.2 / maxRatio) * 100;
  const zoneWidth = zoneEnd - zoneStart;

  // Bar split: green up to 120%, orange beyond
  const greenLimit = isUpperLimit ? targetPercent : (1.2 / maxRatio) * 100;
  const greenWidth = Math.min(barPercent, greenLimit);
  const orangeWidth = Math.max(0, barPercent - greenLimit);

  const statusColors = getStatusColors(status, colors);
  const showBadge = target > 0;

  const formatValue = (v: number) => {
    if (unit === 'kcal' || unit === 'mg' || unit === 'μg') return Math.round(v);
    return Math.round(v * 10) / 10;
  };

  return (
    <View style={styles.row}>
      {/* Left: label + badge */}
      <View style={styles.labelCol}>
        <Text style={[styles.label, { color: colors.textPrimary }]} numberOfLines={1}>
          {label}
        </Text>
        {showBadge && (
          <View style={[styles.badge, { backgroundColor: statusColors.bg }]}>
            <Text style={[styles.badgeText, { color: statusColors.text }]}>
              {STATUS_LABELS[status]}
            </Text>
          </View>
        )}
      </View>

      {/* Center: bar */}
      <View style={[styles.barContainer, { backgroundColor: colors.surfaceSecondary }]}>
        {/* Adequate zone */}
        <View
          style={[
            styles.zoneOverlay,
            {
              left: `${zoneStart}%`,
              width: `${zoneWidth}%`,
              backgroundColor: colors.success + '26',
            },
          ]}
        />
        {/* Green bar */}
        {greenWidth > 0 && (
          <View
            style={[
              styles.barFill,
              {
                width: `${greenWidth}%`,
                backgroundColor: colors.success,
                borderTopLeftRadius: radius.sm,
                borderBottomLeftRadius: radius.sm,
                borderTopRightRadius: orangeWidth > 0 ? 0 : radius.sm,
                borderBottomRightRadius: orangeWidth > 0 ? 0 : radius.sm,
              },
            ]}
          />
        )}
        {/* Orange overflow bar */}
        {orangeWidth > 0 && (
          <View
            style={[
              styles.barFill,
              {
                width: `${orangeWidth}%`,
                left: `${greenLimit}%`,
                backgroundColor: colors.warning,
                borderTopRightRadius: radius.sm,
                borderBottomRightRadius: radius.sm,
              },
            ]}
          />
        )}
        {/* Target line */}
        {target > 0 && (
          <View
            style={[
              styles.targetLine,
              {
                left: `${targetPercent}%`,
                backgroundColor: colors.border,
              },
            ]}
          />
        )}
      </View>

      {/* Right: value */}
      <Text style={[styles.value, { color: colors.textSecondary }]} numberOfLines={1}>
        {formatValue(intake)}{unit}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    gap: spacing.sm,
  },
  labelCol: {
    width: 90,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  label: {
    ...typography.bodySmall,
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 14,
  },
  barContainer: {
    flex: 1,
    height: BAR_HEIGHT,
    borderRadius: radius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  zoneOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  barFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  targetLine: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 1,
    marginLeft: -0.5,
  },
  value: {
    ...typography.labelMedium,
    width: 70,
    textAlign: 'right',
    flexShrink: 0,
  },
});
