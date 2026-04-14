import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, ProgressRing, Button } from '../../../src/components/ui';
import { canUse } from '../../../src/infra/services/subscriptionService';
import { useProfileStore } from '../../../src/stores/profileStore';
import { WeeklyReportData } from '../../../src/types/weeklyReport';
import { generateWeeklyReport } from '../../../src/domain/weeklyReport';

function ScoreRing({
  score,
  label,
  color,
  size = 64,
}: {
  score: number;
  label: string;
  color: string;
  size?: number;
}) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  return (
    <View style={ringStyles.container}>
      <ProgressRing progress={score / 100} size={size} strokeWidth={5} color={color} />
      <Text style={[ringStyles.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.xs },
  label: { ...typography.labelSmall },
});

export default function WeeklyReportScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);
  const hasDetailAccess = canUse('weeklyReport');

  const [report, setReport] = useState<WeeklyReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!profile?.id) return;
      try {
        const r = await generateWeeklyReport(profile.id);
        setReport(r);
      } catch (e) {
      } finally {
        setLoading(false);
      }
    })();
  }, [profile?.id]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!report) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>週次レポート</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            レポートデータがありません
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const overallColor =
    report.overallScore >= 70
      ? colors.success
      : report.overallScore >= 40
        ? colors.warning
        : colors.error;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>週次レポート</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.dateRange, { color: colors.textSecondary }]}>
          {report.weekStart} ~ {report.weekEnd}
        </Text>

        {/* Overall Score */}
        <Card>
          <View style={styles.overallSection}>
            <ProgressRing
              progress={report.overallScore / 100}
              size={100}
              strokeWidth={8}
              color={overallColor}
            />
            <View style={styles.overallText}>
              <Text style={[styles.overallLabel, { color: colors.textSecondary }]}>
                総合スコア
              </Text>
              <Text style={[styles.overallMessage, { color: colors.textPrimary }]}>
                {report.overallScore >= 70
                  ? '素晴らしい一週間でした！'
                  : report.overallScore >= 40
                    ? 'まずまずの一週間でした。'
                    : '来週は頑張りましょう！'}
              </Text>
            </View>
          </View>
        </Card>

        {/* Score Breakdown */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            スコア内訳
          </Text>
          <View style={styles.scoresRow}>
            <ScoreRing score={report.consistencyScore} label="記録" color={colors.primary} />
            <ScoreRing score={report.nutritionScore} label="食事" color={colors.success} />
            <ScoreRing score={report.trainingScore} label="筋トレ" color={colors.accent} />
          </View>
        </Card>

        {/* Detail sections — gated for Plus+ */}
        {hasDetailAccess ? (
          <>
            {/* Weight */}
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                体重変化
              </Text>
              {report.weightStart !== null && report.weightEnd !== null ? (
                <View style={styles.weightRow}>
                  <View style={styles.weightItem}>
                    <Text style={[styles.weightLabel, { color: colors.textTertiary }]}>開始</Text>
                    <Text style={[styles.weightValue, { color: colors.textPrimary }]}>
                      {report.weightStart} kg
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={20} color={colors.textTertiary} />
                  <View style={styles.weightItem}>
                    <Text style={[styles.weightLabel, { color: colors.textTertiary }]}>終了</Text>
                    <Text style={[styles.weightValue, { color: colors.textPrimary }]}>
                      {report.weightEnd} kg
                    </Text>
                  </View>
                  <View style={styles.weightItem}>
                    <Text style={[styles.weightLabel, { color: colors.textTertiary }]}>変化</Text>
                    <Text
                      style={[
                        styles.weightValue,
                        {
                          color:
                            report.weightChange !== null && report.weightChange < 0
                              ? colors.success
                              : report.weightChange !== null && report.weightChange > 0
                                ? colors.calorie
                                : colors.textPrimary,
                        },
                      ]}
                    >
                      {report.weightChange !== null
                        ? `${report.weightChange > 0 ? '+' : ''}${report.weightChange} kg`
                        : '-'}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={[styles.noData, { color: colors.textTertiary }]}>
                  今週の体重記録がありません
                </Text>
              )}
            </Card>

            {/* Nutrition */}
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                栄養摂取（日平均）
              </Text>
              <Text style={[styles.subInfo, { color: colors.textTertiary }]}>
                {report.mealLogDays}日 / 7日 記録
              </Text>
              <View style={styles.nutriRow}>
                <View style={styles.nutriItem}>
                  <Text style={[styles.nutriValue, { color: colors.calorie }]}>
                    {report.avgCalories}
                  </Text>
                  <Text style={[styles.nutriLabel, { color: colors.textTertiary }]}>kcal</Text>
                </View>
                <View style={styles.nutriItem}>
                  <Text style={[styles.nutriValue, { color: colors.protein }]}>
                    {report.avgProtein}g
                  </Text>
                  <Text style={[styles.nutriLabel, { color: colors.textTertiary }]}>P</Text>
                </View>
                <View style={styles.nutriItem}>
                  <Text style={[styles.nutriValue, { color: colors.fat }]}>
                    {report.avgFat}g
                  </Text>
                  <Text style={[styles.nutriLabel, { color: colors.textTertiary }]}>F</Text>
                </View>
                <View style={styles.nutriItem}>
                  <Text style={[styles.nutriValue, { color: colors.carb }]}>
                    {report.avgCarb}g
                  </Text>
                  <Text style={[styles.nutriLabel, { color: colors.textTertiary }]}>C</Text>
                </View>
              </View>
            </Card>

            {/* Training */}
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                トレーニング
              </Text>
              <View style={styles.trainingRow}>
                <View style={styles.trainingItem}>
                  <Text style={[styles.trainingValue, { color: colors.textPrimary }]}>
                    {report.workoutCount}
                  </Text>
                  <Text style={[styles.trainingLabel, { color: colors.textTertiary }]}>
                    セッション
                  </Text>
                </View>
                <View style={styles.trainingItem}>
                  <Text style={[styles.trainingValue, { color: colors.textPrimary }]}>
                    {report.totalVolume.toLocaleString()}
                  </Text>
                  <Text style={[styles.trainingLabel, { color: colors.textTertiary }]}>
                    総ボリューム(kg)
                  </Text>
                </View>
                <View style={styles.trainingItem}>
                  <Text style={[styles.trainingValue, { color: colors.calorie }]}>
                    {report.totalCaloriesBurned}
                  </Text>
                  <Text style={[styles.trainingLabel, { color: colors.textTertiary }]}>
                    消費kcal
                  </Text>
                </View>
              </View>
            </Card>
          </>
        ) : (
          <Card>
            <View style={styles.lockedSection}>
              <Ionicons name="lock-closed" size={24} color={colors.textTertiary} />
              <Text style={[styles.lockedText, { color: colors.textSecondary }]}>
                詳細データはPlus+プランで確認できます
              </Text>
              <Button
                title="プランを見る"
                onPress={() => router.push('/(tabs)/settings/subscription')}
                variant="outline"
                size="sm"
              />
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  headerBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { ...typography.titleMedium },
  scroll: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxxl,
  },
  dateRange: {
    ...typography.labelMedium,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: { ...typography.bodyMedium },
  overallSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  overallText: {
    flex: 1,
    gap: spacing.xs,
  },
  overallLabel: { ...typography.labelMedium },
  overallMessage: { ...typography.titleSmall },
  sectionTitle: {
    ...typography.titleSmall,
    marginBottom: spacing.md,
  },
  scoresRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  weightItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  weightLabel: { ...typography.labelSmall },
  weightValue: { ...typography.numberSmall },
  noData: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  subInfo: {
    ...typography.labelSmall,
    marginBottom: spacing.sm,
    marginTop: -spacing.sm,
  },
  nutriRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  nutriItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  nutriValue: { ...typography.numberSmall },
  nutriLabel: { ...typography.labelSmall },
  trainingRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  trainingItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  trainingValue: { ...typography.numberSmall },
  trainingLabel: {
    ...typography.labelSmall,
    textAlign: 'center',
  },
  lockedSection: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  lockedText: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
});
