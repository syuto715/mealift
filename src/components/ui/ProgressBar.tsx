import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface ProgressBarProps {
  progress: number; // 0-1
  color?: string;
  backgroundColor?: string;
  height?: number;
  label?: string;
  valueText?: string;
  showPercentage?: boolean;
}

export function ProgressBar({
  progress,
  color,
  backgroundColor,
  height = 8,
  label,
  valueText,
  showPercentage = false,
}: ProgressBarProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const barColor = color ?? colors.primary;
  const bgColor = backgroundColor ?? colors.surfaceSecondary;
  const clampedProgress = Math.max(0, Math.min(1, progress));

  return (
    <View style={styles.container}>
      {(label || valueText || showPercentage) && (
        <View style={styles.header}>
          {label && (
            <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
          )}
          <Text style={[styles.value, { color: colors.textPrimary }]}>
            {valueText ?? (showPercentage ? `${Math.round(clampedProgress * 100)}%` : '')}
          </Text>
        </View>
      )}
      <View style={[styles.track, { height, backgroundColor: bgColor, borderRadius: height / 2 }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${clampedProgress * 100}%`,
              backgroundColor: barColor,
              borderRadius: height / 2,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    ...typography.labelMedium,
  },
  value: {
    ...typography.labelMedium,
  },
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
