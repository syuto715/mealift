import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ProgressRing } from '../ui/ProgressRing';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { ThemeColors } from '../../theme/tokens';
import { GoalType } from '../../types/common';

interface DailySummaryCardProps {
  consumedCalories: number;
  targetCalories: number;
  burnedCalories?: number;
  goalType?: GoalType;
  colors: ThemeColors;
}

export function DailySummaryCard({
  consumedCalories,
  targetCalories,
  burnedCalories,
  goalType,
  colors,
}: DailySummaryCardProps) {
  const remaining = Math.max(0, targetCalories - consumedCalories);
  const progress = targetCalories > 0 ? consumedCalories / targetCalories : 0;
  const showBurn = burnedCalories !== undefined && burnedCalories > 0;
  const balance = showBurn ? consumedCalories - burnedCalories : null;

  const balanceColor = (() => {
    if (balance === null) return colors.textPrimary;
    if (goalType === 'cut') return balance <= 0 ? colors.success : colors.warning;
    if (goalType === 'bulk') return balance >= 0 ? colors.success : colors.warning;
    return Math.abs(balance) <= 200 ? colors.success : colors.warning;
  })();

  return (
    <View style={styles.container}>
      <ProgressRing
        progress={progress}
        size={140}
        strokeWidth={12}
        color={colors.calorie}
      >
        <Text style={[styles.remainingNumber, { color: colors.textPrimary }]}>
          {remaining}
        </Text>
        <Text style={[styles.remainingLabel, { color: colors.textSecondary }]}>
          残り kcal
        </Text>
      </ProgressRing>
      <View style={styles.details}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>目標</Text>
          <Text style={[styles.value, { color: colors.textPrimary }]}>
            {targetCalories}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>摂取</Text>
          <Text style={[styles.value, { color: colors.calorie }]}>
            {consumedCalories}
          </Text>
        </View>
        {showBurn && (
          <>
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>消費</Text>
              <Text style={[styles.value, { color: colors.primary }]}>
                {burnedCalories}
              </Text>
            </View>
            <View style={[styles.row, styles.balanceRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>差引</Text>
              <Text style={[styles.value, { color: balanceColor }]}>
                {balance! >= 0 ? '+' : ''}{balance}
              </Text>
            </View>
          </>
        )}
        {!showBurn && (
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>残り</Text>
            <Text style={[styles.value, { color: colors.success }]}>
              {remaining}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
  },
  remainingNumber: {
    ...typography.numberLarge,
    fontSize: 32,
  },
  remainingLabel: {
    ...typography.labelSmall,
  },
  details: {
    flex: 1,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  balanceRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.xs,
    marginTop: spacing.xs,
  },
  label: {
    ...typography.bodyMedium,
  },
  value: {
    ...typography.numberSmall,
    fontSize: 16,
  },
});
