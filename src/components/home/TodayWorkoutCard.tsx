import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Button } from '../ui/Button';

interface SessionSummary {
  durationMinutes: number;
  totalVolume: number;
}

interface TodayWorkoutCardProps {
  hasWorkedOut: boolean;
  sessionSummary?: SessionSummary;
  onStartWorkout: () => void;
}

export function TodayWorkoutCard({
  hasWorkedOut,
  sessionSummary,
  onStartWorkout,
}: TodayWorkoutCardProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  if (hasWorkedOut && sessionSummary) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            今日のワークアウト
          </Text>
        </View>
        <View style={styles.completedRow}>
          <Ionicons name="checkmark-circle" size={24} color={colors.success} />
          <Text style={[styles.completedText, { color: colors.textSecondary }]}>
            トレーニング完了
          </Text>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.textPrimary }]}>
              {sessionSummary.durationMinutes}分
            </Text>
            <Text style={[styles.statLabel, { color: colors.textTertiary }]}>
              時間
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.textPrimary }]}>
              {sessionSummary.totalVolume.toLocaleString()}kg
            </Text>
            <Text style={[styles.statLabel, { color: colors.textTertiary }]}>
              ボリューム
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (hasWorkedOut) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            今日のワークアウト
          </Text>
        </View>
        <View style={styles.completedRow}>
          <Ionicons name="checkmark-circle" size={24} color={colors.success} />
          <Text style={[styles.completedText, { color: colors.textSecondary }]}>
            トレーニング完了
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          今日のワークアウト
        </Text>
      </View>
      <Button
        title="ワークアウト開始"
        onPress={onStartWorkout}
        variant="primary"
        fullWidth
        icon={<Ionicons name="barbell-outline" size={18} color="#FFFFFF" />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    ...typography.titleSmall,
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  completedText: {
    ...typography.bodyMedium,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  statItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: {
    ...typography.numberSmall,
  },
  statLabel: {
    ...typography.labelSmall,
  },
  statDivider: {
    width: 1,
    height: 32,
  },
});
