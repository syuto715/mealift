import React from 'react';
import {
  Modal as RNModal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius, shadow } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Button } from '../ui/Button';
import { AdaptiveGoalSuggestion } from '../../types/adaptiveGoal';
import { BodyLog } from '../../types/bodyLog';

interface Props {
  visible: boolean;
  suggestion: AdaptiveGoalSuggestion;
  bodyLogs: BodyLog[];
  onClose: () => void;
  onApprove: () => void | Promise<void>;
  onDismiss: () => void | Promise<void>;
}

const CONFIDENCE_LABELS: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

export function AdaptiveGoalDetailModal({
  visible,
  suggestion,
  onClose,
  onApprove,
  onDismiss,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }, shadow.lg]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>詳細分析</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            {/* Summary numbers */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>週あたり体重変化</Text>
              <View style={styles.kv}>
                <Text style={[styles.kvLabel, { color: colors.textSecondary }]}>想定</Text>
                <Text style={[styles.kvValue, { color: colors.textPrimary }]}>
                  {suggestion.expectedWeeklyChange >= 0 ? '+' : ''}
                  {suggestion.expectedWeeklyChange.toFixed(2)} kg/週
                </Text>
              </View>
              <View style={styles.kv}>
                <Text style={[styles.kvLabel, { color: colors.textSecondary }]}>実績</Text>
                <Text style={[styles.kvValue, { color: colors.textPrimary }]}>
                  {suggestion.actualWeeklyChange >= 0 ? '+' : ''}
                  {suggestion.actualWeeklyChange.toFixed(2)} kg/週
                </Text>
              </View>
              <View style={styles.kv}>
                <Text style={[styles.kvLabel, { color: colors.textSecondary }]}>差分</Text>
                <Text style={[styles.kvValue, { color: colors.accent }]}>
                  {suggestion.deviation >= 0 ? '+' : ''}
                  {suggestion.deviation.toFixed(2)} kg/週
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>推定TDEE</Text>
              <View style={styles.kv}>
                <Text style={[styles.kvLabel, { color: colors.textSecondary }]}>計算上</Text>
                <Text style={[styles.kvValue, { color: colors.textPrimary }]}>
                  {suggestion.currentTdee} kcal
                </Text>
              </View>
              <View style={styles.kv}>
                <Text style={[styles.kvLabel, { color: colors.textSecondary }]}>推定実TDEE</Text>
                <Text style={[styles.kvValue, { color: colors.primary }]}>
                  {suggestion.estimatedActualTdee} kcal
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>目標カロリー</Text>
              <View style={styles.kv}>
                <Text style={[styles.kvLabel, { color: colors.textSecondary }]}>現在</Text>
                <Text style={[styles.kvValue, { color: colors.textPrimary }]}>
                  {suggestion.currentCalorieTarget} kcal
                </Text>
              </View>
              <View style={styles.kv}>
                <Text style={[styles.kvLabel, { color: colors.textSecondary }]}>推奨</Text>
                <Text style={[styles.kvValue, { color: colors.accent }]}>
                  {suggestion.suggestedCalorieTarget} kcal
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>根拠</Text>
              <Text style={[styles.reason, { color: colors.textPrimary }]}>{suggestion.reason}</Text>
              <Text style={[styles.meta, { color: colors.textTertiary }]}>
                データ点数: {suggestion.dataPointsUsed}日 / 信頼度:{' '}
                {CONFIDENCE_LABELS[suggestion.confidence] ?? '—'}
              </Text>
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Button title="却下" onPress={onDismiss} variant="ghost" />
            <Button title="承認" onPress={onApprove} variant="primary" />
          </View>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '90%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  title: { ...typography.titleMedium },
  scroll: { maxHeight: 500 },
  content: { padding: spacing.lg, gap: spacing.lg },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.labelMedium },
  kv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kvLabel: { ...typography.bodyMedium },
  kvValue: { ...typography.numberSmall },
  divider: { height: StyleSheet.hairlineWidth },
  reason: { ...typography.bodyMedium, lineHeight: 22 },
  meta: { ...typography.bodySmall, marginTop: spacing.sm },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
