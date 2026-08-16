import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Card, Button } from '../ui';
import { WorkoutSuggestion, MuscleRecoveryStatus } from '../../types/workoutSuggestion';

const MUSCLE_LABELS: Record<string, string> = {
  chest: '胸',
  back: '背中',
  shoulders: '肩',
  legs: '脚',
  arms: '腕',
  core: '体幹',
  full_body: '全身',
};

const STATUS_COLORS = {
  recovered: (c: ReturnType<typeof getColors>) => c.success,
  recovering: (c: ReturnType<typeof getColors>) => c.warning,
  fatigued: (c: ReturnType<typeof getColors>) => c.error,
};

interface WorkoutSuggestionCardProps {
  suggestion: WorkoutSuggestion;
  onPress: () => void;
}

export function WorkoutSuggestionCard({ suggestion, onPress }: WorkoutSuggestionCardProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const isRestDay = suggestion.suggestedMuscleGroups.length === 0;

  // S4.5-D — 記録ゼロの判別キーは lastTrainedDate === null。系統A
  // (getRecoveryStatuses) は未トレ部位を recoveryPercent 100 / status
  // 'recovered' で返す契約 (ソート・reason 生成が依存) なので、計算には
  // 触れず表示層でのみ出し分ける。
  const hasAnyRecord = suggestion.recoveryStatuses.some(
    (s) => s.lastTrainedDate !== null,
  );

  // 全部位が記録ゼロ — 100% グリーンバー6本 + 「十分に回復しています」は
  // 新規ユーザーに誤情報なので、カード全体を空状態 + CTA に置き換える。
  // onPress はカード本体と同じ既存導線 (筋トレタブ) を使う。
  if (!hasAnyRecord) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        <Card>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="barbell-outline" size={20} color={colors.primary} />
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                おすすめワークアウト
              </Text>
            </View>
          </View>
          <View style={styles.emptyBody}>
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
              まだトレーニング記録がありません
            </Text>
            <Text style={[styles.emptyDescription, { color: colors.textTertiary }]}>
              記録すると部位ごとの回復状態がここに表示されます
            </Text>
          </View>
          <Button
            title="ワークアウトを開始"
            onPress={onPress}
            variant="primary"
            size="md"
            fullWidth
          />
        </Card>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      <Card>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons
              name={isRestDay ? 'bed-outline' : 'barbell-outline'}
              size={20}
              color={isRestDay ? colors.warning : colors.primary}
            />
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {isRestDay ? '休息日' : 'おすすめワークアウト'}
            </Text>
          </View>
        </View>

        <Text style={[styles.reason, { color: colors.textSecondary }]}>
          {suggestion.reason}
        </Text>

        {/* Recovery bars */}
        <View style={styles.recoverySection}>
          {suggestion.recoveryStatuses.map((status) => (
            <RecoveryBar key={status.muscleGroup} status={status} colors={colors} />
          ))}
        </View>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[styles.footerText, { color: colors.primary }]}>
            {isRestDay ? 'ストレッチを確認' : 'トレーニングを始める'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function RecoveryBar({
  status,
  colors,
}: {
  status: MuscleRecoveryStatus;
  colors: ReturnType<typeof getColors>;
}) {
  const barColor = STATUS_COLORS[status.status](colors);

  // S4.5-D — 記録ゼロ部位は 100% (系統A の未トレ契約値) を出さず、
  // データ不足である事実を表示する。
  if (status.lastTrainedDate === null) {
    return (
      <View style={styles.barRow}>
        <Text style={[styles.barLabel, { color: colors.textTertiary }]}>
          {MUSCLE_LABELS[status.muscleGroup] ?? status.muscleGroup}
        </Text>
        <Text style={[styles.barNoData, { color: colors.textTertiary }]}>
          記録が不足しています
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.barRow}>
      <Text style={[styles.barLabel, { color: colors.textTertiary }]}>
        {MUSCLE_LABELS[status.muscleGroup] ?? status.muscleGroup}
      </Text>
      <View style={[styles.barTrack, { backgroundColor: colors.border + '40' }]}>
        <View
          style={[
            styles.barFill,
            { backgroundColor: barColor, width: `${status.recoveryPercent}%` },
          ]}
        />
      </View>
      <Text style={[styles.barPercent, { color: barColor }]}>
        {status.recoveryPercent}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    ...typography.titleSmall,
  },
  reason: {
    ...typography.bodySmall,
    marginBottom: spacing.md,
  },
  recoverySection: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  barLabel: {
    ...typography.labelSmall,
    width: 28,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  barPercent: {
    ...typography.labelSmall,
    width: 32,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  // S4.5-D — 記録ゼロ部位の不足表示 (バー + % の領域を1テキストで置換)
  barNoData: {
    ...typography.labelSmall,
    flex: 1,
    textAlign: 'right',
  },
  // S4.5-D — 全部位記録ゼロ時のカード内空状態
  emptyBody: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.titleSmall,
    textAlign: 'center',
  },
  emptyDescription: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: {
    ...typography.labelMedium,
  },
});
