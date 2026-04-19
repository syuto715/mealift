import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Card } from '../ui/Card';
import { ProgressBar } from '../ui/ProgressBar';
import { GoalPrediction } from '../../types/goalPrediction';
import { statusMessage } from '../../domain/goalPrediction';
import { GoalPredictionDetailModal } from './GoalPredictionDetailModal';
import { formatDate } from '../../utils/format';

interface Props {
  prediction: GoalPrediction | null;
  onPressDetail?: () => void;
  canViewDetail?: boolean;
}

function barColor(
  prediction: GoalPrediction | null,
  colors: ReturnType<typeof getColors>
) {
  if (!prediction) return colors.textTertiary;
  switch (prediction.status) {
    case 'on_track':
    case 'completed':
      return colors.success;
    case 'ahead_of_schedule':
      return colors.primary;
    case 'behind_schedule':
      return colors.warning;
    case 'stalled':
      return colors.error;
    case 'insufficient_data':
    default:
      return colors.textTertiary;
  }
}

export function GoalPredictionCard({ prediction, canViewDetail = true }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const [detailOpen, setDetailOpen] = useState(false);

  if (!prediction || prediction.status === 'insufficient_data') {
    const current = prediction?.dataPointsUsed ?? 0;
    const needed = prediction?.daysNeeded ?? 14;
    const total = 14;
    return (
      <Card>
        <View style={styles.header}>
          <Ionicons name="flag-outline" size={20} color={colors.primary} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>目標到達予測</Text>
        </View>
        <Text style={[styles.noDataTitle, { color: colors.textSecondary }]}>
          体重記録を{total}日分貯めると予測が表示されます
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <ProgressBar
            progress={Math.min(1, current / total)}
            color={colors.primary}
            label={`進捗 ${current}/${total}日`}
            valueText={`残り${Math.max(0, needed)}日`}
            height={8}
          />
        </View>
      </Card>
    );
  }

  const { status, daysRemaining, estimatedArrivalDate, currentWeight, targetWeight, weeklyChangeRate } = prediction;
  const msg = statusMessage(status);
  const diff = Number((targetWeight - currentWeight).toFixed(1));
  const color = barColor(prediction, colors);

  // Progress bar: how much of the journey from start to target is covered.
  const startWeight = prediction.trajectory.find((p) => p.type === 'actual')?.weight ?? currentWeight;
  const totalJourney = Math.abs(targetWeight - startWeight);
  const covered = totalJourney > 0
    ? Math.min(1, Math.abs(currentWeight - startWeight) / totalJourney)
    : 0;

  const toneColor =
    msg.tone === 'success'
      ? colors.success
      : msg.tone === 'warning'
        ? colors.warning
        : msg.tone === 'error'
          ? colors.error
          : colors.primary;

  return (
    <>
      <TouchableOpacity
        activeOpacity={canViewDetail ? 0.7 : 1}
        onPress={() => canViewDetail && setDetailOpen(true)}
      >
        <Card>
          <View style={styles.header}>
            <Ionicons name="flag-outline" size={20} color={colors.primary} />
            <Text style={[styles.title, { color: colors.textPrimary }]}>目標到達予測</Text>
            {canViewDetail && (
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textTertiary}
                style={{ marginLeft: 'auto' }}
              />
            )}
          </View>

          <View style={styles.mainRow}>
            {status === 'stalled' ? (
              <Text style={[styles.mainText, { color: color }]}>停滞中</Text>
            ) : status === 'completed' ? (
              <Text style={[styles.mainText, { color: colors.success }]}>達成！</Text>
            ) : daysRemaining !== null && daysRemaining < 200 ? (
              <>
                <Text style={[styles.mainText, { color: colors.primary }]}>
                  あと <Text style={styles.mainNumber}>{daysRemaining}</Text> 日
                </Text>
                {estimatedArrivalDate && (
                  <Text style={[styles.subText, { color: colors.textSecondary }]}>
                    {formatDate(estimatedArrivalDate, 'M月d日')} 到達予定
                  </Text>
                )}
              </>
            ) : (
              <Text style={[styles.mainText, { color: colors.primary }]}>
                {estimatedArrivalDate ? formatDate(estimatedArrivalDate, 'yyyy年M月d日') : '予測不可'} 到達予定
              </Text>
            )}
          </View>

          <View style={{ marginVertical: spacing.sm }}>
            <ProgressBar progress={covered} color={color} height={8} />
          </View>

          <View style={styles.statRow}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {currentWeight.toFixed(1)}kg → {targetWeight.toFixed(1)}kg
            </Text>
            <Text style={[styles.statValue, { color: colors.textPrimary }]}>
              ({diff >= 0 ? '+' : ''}{diff.toFixed(1)}kg)
            </Text>
          </View>

          <View style={[styles.statusRow, { backgroundColor: toneColor + '15' }]}>
            <Ionicons
              name={
                msg.tone === 'success'
                  ? 'checkmark-circle'
                  : msg.tone === 'warning'
                    ? 'alert-circle'
                    : msg.tone === 'error'
                      ? 'warning'
                      : 'information-circle'
              }
              size={16}
              color={toneColor}
            />
            <Text style={[styles.statusText, { color: toneColor }]}>{msg.title}</Text>
            <Text style={[styles.pace, { color: colors.textSecondary }]}>
              {weeklyChangeRate >= 0 ? '+' : ''}
              {weeklyChangeRate.toFixed(2)}kg/週
            </Text>
          </View>
        </Card>
      </TouchableOpacity>

      {canViewDetail && (
        <GoalPredictionDetailModal
          visible={detailOpen}
          prediction={prediction}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: { ...typography.titleSmall },
  noDataTitle: { ...typography.bodyMedium },
  mainRow: { gap: spacing.xs, alignItems: 'flex-start' },
  mainText: { fontSize: 24, fontWeight: '700' as const, lineHeight: 30 },
  mainNumber: { fontSize: 36, fontWeight: '700' as const },
  subText: { ...typography.bodyMedium },
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'baseline',
  },
  statLabel: { ...typography.bodyMedium },
  statValue: { ...typography.labelMedium },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 8,
    marginTop: spacing.sm,
  },
  statusText: { ...typography.labelMedium, flex: 1 },
  pace: { ...typography.labelSmall },
});
