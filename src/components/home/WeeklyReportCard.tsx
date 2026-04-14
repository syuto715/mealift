import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Card, ProgressRing } from '../ui';
import { WeeklyReportData } from '../../types/weeklyReport';

interface WeeklyReportCardProps {
  report: WeeklyReportData;
  onPress: () => void;
}

export function WeeklyReportCard({ report, onPress }: WeeklyReportCardProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const scoreColor =
    report.overallScore >= 70
      ? colors.success
      : report.overallScore >= 40
        ? colors.warning
        : colors.error;

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      <Card>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="bar-chart-outline" size={20} color={colors.primary} />
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              週次レポート
            </Text>
          </View>
          <Text style={[styles.dateRange, { color: colors.textTertiary }]}>
            {report.weekStart} ~ {report.weekEnd}
          </Text>
        </View>

        <View style={styles.body}>
          <View style={styles.scoreSection}>
            <ProgressRing
              progress={report.overallScore / 100}
              size={72}
              strokeWidth={6}
              color={scoreColor}
            />
            <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>
              総合スコア
            </Text>
          </View>

          <View style={styles.statsSection}>
            <View style={styles.statRow}>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>記録</Text>
              <View style={[styles.statBar, { backgroundColor: colors.surfaceSecondary }]}>
                <View
                  style={[
                    styles.statFill,
                    {
                      backgroundColor: colors.primary,
                      width: `${report.consistencyScore}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                {report.consistencyScore}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>食事</Text>
              <View style={[styles.statBar, { backgroundColor: colors.surfaceSecondary }]}>
                <View
                  style={[
                    styles.statFill,
                    {
                      backgroundColor: colors.success,
                      width: `${report.nutritionScore}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                {report.nutritionScore}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>筋トレ</Text>
              <View style={[styles.statBar, { backgroundColor: colors.surfaceSecondary }]}>
                <View
                  style={[
                    styles.statFill,
                    {
                      backgroundColor: colors.accent,
                      width: `${report.trainingScore}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                {report.trainingScore}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[styles.footerText, { color: colors.primary }]}>
            詳細を見る
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    ...typography.titleSmall,
  },
  dateRange: {
    ...typography.labelSmall,
  },
  body: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  scoreSection: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  scoreLabel: {
    ...typography.labelSmall,
  },
  statsSection: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statLabel: {
    ...typography.labelSmall,
    width: 32,
  },
  statBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  statFill: {
    height: '100%',
    borderRadius: 3,
  },
  statValue: {
    ...typography.labelSmall,
    width: 24,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
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
