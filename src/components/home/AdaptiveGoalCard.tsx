import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { AdaptiveGoalSuggestion } from '../../types/adaptiveGoal';
import { AdaptiveGoalDetailModal } from './AdaptiveGoalDetailModal';
import { BodyLog } from '../../types/bodyLog';

interface Props {
  suggestion: AdaptiveGoalSuggestion;
  bodyLogs: BodyLog[];
  onApprove: () => void | Promise<void>;
  onDismiss: () => void | Promise<void>;
  locked?: boolean;
  onUpgrade?: () => void;
}

export function AdaptiveGoalCard({
  suggestion,
  bodyLogs,
  onApprove,
  onDismiss,
  locked,
  onUpgrade,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const [showDetail, setShowDetail] = useState(false);
  const [busy, setBusy] = useState(false);

  if (locked) {
    return (
      <Card variant="elevated" style={{ backgroundColor: colors.primary + '0A' }}>
        <View style={styles.header}>
          <Ionicons name="trending-up" size={20} color={colors.primary} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>目標カロリーを自動最適化</Text>
        </View>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Plusプランで目標カロリーが実際の代謝に合わせて自動調整されます。
        </Text>
        {onUpgrade && (
          <Button title="Plusに登録" onPress={onUpgrade} variant="primary" size="sm" />
        )}
      </Card>
    );
  }

  const delta = suggestion.suggestedCalorieTarget - suggestion.currentCalorieTarget;
  const deltaColor = delta < 0 ? colors.warning : colors.success;

  const handleApprove = async () => {
    setBusy(true);
    try {
      await onApprove();
    } finally {
      setBusy(false);
    }
  };
  const handleDismiss = async () => {
    setBusy(true);
    try {
      await onDismiss();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card variant="elevated" style={{ backgroundColor: colors.accent + '0A', borderLeftWidth: 3, borderLeftColor: colors.accent }}>
        <View style={styles.header}>
          <Ionicons name="trending-up" size={20} color={colors.accent} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>目標カロリーを見直しませんか？</Text>
        </View>

        <View style={styles.values}>
          <View style={styles.valueCol}>
            <Text style={[styles.valueLabel, { color: colors.textSecondary }]}>現在</Text>
            <Text style={[styles.valueNumber, { color: colors.textPrimary }]}>
              {suggestion.currentCalorieTarget}
            </Text>
            <Text style={[styles.valueUnit, { color: colors.textTertiary }]}>kcal</Text>
          </View>
          <Ionicons name="arrow-forward" size={28} color={colors.textTertiary} />
          <View style={styles.valueCol}>
            <Text style={[styles.valueLabel, { color: colors.textSecondary }]}>推奨</Text>
            <Text style={[styles.valueNumber, { color: deltaColor }]}>
              {suggestion.suggestedCalorieTarget}
            </Text>
            <Text style={[styles.valueUnit, { color: colors.textTertiary }]}>
              kcal ({delta >= 0 ? '+' : ''}{delta})
            </Text>
          </View>
        </View>

        <Text style={[styles.reason, { color: colors.textSecondary }]}>{suggestion.reason}</Text>

        <View style={styles.actions}>
          <Button title="承認" onPress={handleApprove} variant="primary" size="sm" loading={busy} />
          <Button title="後で" onPress={handleDismiss} variant="ghost" size="sm" disabled={busy} />
          <TouchableOpacity onPress={() => setShowDetail(true)} style={styles.detailLink}>
            <Text style={[styles.detailText, { color: colors.primary }]}>詳細</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <AdaptiveGoalDetailModal
        visible={showDetail}
        suggestion={suggestion}
        bodyLogs={bodyLogs}
        onClose={() => setShowDetail(false)}
        onApprove={async () => {
          setShowDetail(false);
          await handleApprove();
        }}
        onDismiss={async () => {
          setShowDetail(false);
          await handleDismiss();
        }}
      />
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
  body: { ...typography.bodyMedium, marginBottom: spacing.md },
  values: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  valueCol: { alignItems: 'center', gap: spacing.xs },
  valueLabel: { ...typography.labelMedium },
  valueNumber: { ...typography.displayMedium },
  valueUnit: { ...typography.labelSmall },
  reason: { ...typography.bodySmall, marginVertical: spacing.md, lineHeight: 20 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  detailLink: { marginLeft: 'auto' },
  detailText: { ...typography.labelMedium, textDecorationLine: 'underline' },
});
