import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Badge } from '../ui/Badge';
import { PredictionResult } from '../../types/prediction';

const PACE_LABELS: Record<string, string> = {
  too_fast: '速すぎ',
  fast: 'やや速い',
  on_track: '順調',
  slow: 'やや遅い',
  too_slow: '遅すぎ',
};

interface GoalPredictionCardProps {
  prediction: PredictionResult | null;
  hasEnoughData: boolean;
  daysNeeded: number;
}

export function GoalPredictionCard({
  prediction,
  hasEnoughData,
  daysNeeded,
}: GoalPredictionCardProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  if (!prediction) {
    return (
      <View style={styles.noDataContainer}>
        <Ionicons name="hourglass-outline" size={32} color={colors.textTertiary} />
        {!hasEnoughData ? (
          <Text style={[styles.noDataText, { color: colors.textSecondary }]}>
            データを収集中です{'\n'}あと{daysNeeded}日分の記録が必要です
          </Text>
        ) : (
          <Text style={[styles.noDataText, { color: colors.textSecondary }]}>
            目標体重を設定してください
          </Text>
        )}
      </View>
    );
  }

  const getPaceBadgeColors = () => {
    const label = prediction.paceLabel;
    if (label === 'on_track') {
      return { bg: colors.success + '20', text: colors.success };
    }
    if (label === 'slow' || label === 'fast') {
      return { bg: colors.warning + '20', text: colors.warning };
    }
    return { bg: colors.error + '20', text: colors.error };
  };

  const paceColors = getPaceBadgeColors();

  return (
    <View style={styles.container}>
      <View style={styles.mainRow}>
        <Text style={[styles.daysNumber, { color: colors.primary }]}>
          あと {prediction.standard.days} 日
        </Text>
        <Badge
          label={PACE_LABELS[prediction.paceLabel] ?? '標準'}
          color={paceColors.bg}
          textColor={paceColors.text}
          size="md"
        />
      </View>
      <View style={styles.rangeRow}>
        <View style={styles.rangeItem}>
          <Text style={[styles.rangeLabel, { color: colors.success }]}>楽観</Text>
          <Text style={[styles.rangeValue, { color: colors.textSecondary }]}>
            {prediction.optimistic.days}日
          </Text>
        </View>
        <View style={[styles.rangeDivider, { backgroundColor: colors.border }]} />
        <View style={styles.rangeItem}>
          <Text style={[styles.rangeLabel, { color: colors.warning }]}>慎重</Text>
          <Text style={[styles.rangeValue, { color: colors.textSecondary }]}>
            {prediction.conservative.days}日
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  mainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  daysNumber: {
    ...typography.displayMedium,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  rangeItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  rangeLabel: {
    ...typography.labelMedium,
  },
  rangeValue: {
    ...typography.numberSmall,
    fontSize: 14,
  },
  rangeDivider: {
    width: 1,
    height: 32,
  },
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  noDataText: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
});
