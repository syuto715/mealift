import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, Button } from '../../../src/components/ui';
import { useProfileStore } from '../../../src/stores/profileStore';
import { useSubscription } from '../../../src/hooks/useSubscription';
import {
  historyWindowDaysFor,
  FREE_HISTORY_WINDOW_DAYS,
} from '../../../src/domain/subscription/gates';
import { UpgradePromptModal } from '../../../src/components/subscription/UpgradePromptModal';
import * as workoutRepo from '../../../src/infra/repositories/workoutRepository';
import { MUSCLE_GROUPS } from '../../../src/constants/muscleGroups';
import { MuscleGroup } from '../../../src/types/common';
import { getISODate } from '../../../src/utils/format';
import {
  buildMonthGrid,
  formatMonthLabel,
  shiftMonth,
} from '../../../src/utils/calendarGrid';

// S2-F — 筋トレ月間カレンダー (自作グリッド、外部カレンダー依存なし)。
// - トレーニング実施日 (完了セッション) にドット。定義は history の週ストリップと
//   同じ getRecordedSessionDates (= date(started_at) / finished のみ)。
// - 部位フィルタ: exercises.muscle_group (7-key マスタ) ベース。選択時は該当部位を
//   その日に鍛えた日だけマーク (getSessionMuscleDaysForMonth)。
// - 日付タップ → 既存のトレーニング履歴画面 (その日を含む週) へ。新規詳細画面は
//   作らない。
// - free tier は history と同じ historyWindowDaysFor で表示範囲を clamp
//   (entitlement 判定自体には触れない — 既存 gate の適用のみ)。

type CalendarFilter = 'all' | MuscleGroup;

const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

export default function TrainingCalendarScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);

  const today = getISODate();
  const currentMonth = today.substring(0, 7);

  const [monthPrefix, setMonthPrefix] = useState(currentMonth);
  const [filter, setFilter] = useState<CalendarFilter>('all');
  const [allDates, setAllDates] = useState<string[]>([]);
  const [muscleDays, setMuscleDays] = useState<workoutRepo.SessionMuscleDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  const { status: planStatus } = useSubscription();
  const historyWindowDays = historyWindowDaysFor(planStatus);
  const isHistoryClamped = historyWindowDays !== null;

  const loadMonth = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [dates, days] = await Promise.all([
        workoutRepo.getRecordedSessionDates(profile.id, monthPrefix, historyWindowDays),
        workoutRepo.getSessionMuscleDaysForMonth(profile.id, monthPrefix, historyWindowDays),
      ]);
      setAllDates(dates);
      setMuscleDays(days);
    } catch {
      // silently fail (history と同じ方針)
    } finally {
      setLoading(false);
    }
  }, [profile, monthPrefix, historyWindowDays]);

  useFocusEffect(
    useCallback(() => {
      loadMonth();
    }, [loadMonth]),
  );

  const weeks = useMemo(() => buildMonthGrid(monthPrefix), [monthPrefix]);

  // マーク対象日: ALL = 完了セッションのある日 / 部位選択時 = その部位を鍛えた日
  const markedSet = useMemo(() => {
    if (filter === 'all') return new Set(allDates);
    return new Set(
      muscleDays.filter((d) => d.muscleGroups.includes(filter)).map((d) => d.date),
    );
  }, [filter, allDates, muscleDays]);

  const canGoNext = monthPrefix < currentMonth;
  const markedCount = markedSet.size;

  const filterLabel =
    filter === 'all'
      ? 'すべて'
      : (MUSCLE_GROUPS.find((g) => g.id === filter)?.nameJa ?? filter);

  const handleDayPress = useCallback((iso: string) => {
    // 既存の履歴画面 (週表示 + インライン展開) へ。date param でその週へ合わせる。
    router.push({ pathname: '/(tabs)/training/history', params: { date: iso } });
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Button
          title="戻る"
          onPress={() => router.back()}
          variant="ghost"
          size="sm"
          icon={<Ionicons name="chevron-back" size={18} color={colors.primary} />}
        />
        <Text style={[styles.title, { color: colors.textPrimary }]}>カレンダー</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 部位フィルタチップ (ALL + 7-key マスタ) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {(
            [
              { id: 'all' as const, nameJa: 'すべて' },
              ...MUSCLE_GROUPS.map((g) => ({ id: g.id, nameJa: g.nameJa })),
            ]
          ).map((g) => {
            const selected = filter === g.id;
            return (
              <TouchableOpacity
                key={g.id}
                onPress={() => setFilter(g.id)}
                style={[
                  styles.chip,
                  selected
                    ? { backgroundColor: colors.primary + '15', borderColor: colors.primary }
                    : { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`部位フィルタ ${g.nameJa}`}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: selected ? colors.primary : colors.textSecondary },
                  ]}
                >
                  {g.nameJa}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Card padding="md">
          {/* 月ヘッダ (前月 / ラベル / 翌月 — 未来月へは進めない) */}
          <View style={styles.monthHeader}>
            <TouchableOpacity
              onPress={() => setMonthPrefix((m) => shiftMonth(m, -1))}
              hitSlop={8}
              style={styles.monthArrow}
              accessibilityRole="button"
              accessibilityLabel="前の月"
            >
              <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>
              {formatMonthLabel(monthPrefix)}
            </Text>
            <TouchableOpacity
              onPress={() => canGoNext && setMonthPrefix((m) => shiftMonth(m, 1))}
              hitSlop={8}
              style={styles.monthArrow}
              disabled={!canGoNext}
              accessibilityRole="button"
              accessibilityLabel="次の月"
              accessibilityState={{ disabled: !canGoNext }}
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={canGoNext ? colors.textSecondary : colors.border}
              />
            </TouchableOpacity>
          </View>

          {/* 曜日ヘッダ */}
          <View style={styles.weekRow}>
            {WEEKDAY_LABELS.map((w) => (
              <Text key={w} style={[styles.weekdayLabel, { color: colors.textTertiary }]}>
                {w}
              </Text>
            ))}
          </View>

          {/* 月間グリッド */}
          {weeks.map((week) => (
            <View key={week[0].iso} style={styles.weekRow}>
              {week.map((cell) => {
                const isToday = cell.iso === today;
                const marked = markedSet.has(cell.iso);
                const isFutureDay = cell.iso > today;
                const disabled = !cell.inMonth || isFutureDay;
                return (
                  <TouchableOpacity
                    key={cell.iso}
                    style={styles.dayCell}
                    onPress={() => handleDayPress(cell.iso)}
                    disabled={disabled}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatMonthLabel(cell.iso.substring(0, 7))}${cell.day}日${
                      marked ? ` ${filterLabel}の記録あり` : ' 記録なし'
                    }`}
                    accessibilityHint="この日を含む週の履歴を開きます"
                    accessibilityState={{ disabled }}
                  >
                    <View
                      style={[
                        styles.dayBadge,
                        isToday && { backgroundColor: colors.primary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNum,
                          {
                            color: isToday
                              ? colors.onPrimary
                              : !cell.inMonth || isFutureDay
                                ? colors.textTertiary
                                : colors.textPrimary,
                          },
                          !cell.inMonth && styles.dayNumOutside,
                        ]}
                      >
                        {cell.day}
                      </Text>
                    </View>
                    <View style={styles.dotSpace}>
                      {marked && cell.inMonth && (
                        <View style={[styles.dot, { backgroundColor: colors.success }]} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          {/* 凡例 / 空状態 */}
          {!loading && markedCount === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {filter === 'all'
                ? 'この月の記録はありません。トレーニングを完了するとここに表示されます。'
                : `この月に「${filterLabel}」を鍛えた記録はありません。`}
            </Text>
          ) : (
            <View style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: colors.success }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>
                {filter === 'all' ? 'トレーニング実施日' : `「${filterLabel}」を鍛えた日`}
                ・タップで履歴へ
              </Text>
            </View>
          )}
        </Card>

        {/* free tier の履歴表示窓 (history と同じ clamp を適用済み) の説明 */}
        {isHistoryClamped && !loading && (
          <TouchableOpacity activeOpacity={0.8} onPress={() => setUpgradeVisible(true)}>
            <Card padding="md">
              <View style={styles.upgradeRow}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.upgradeText, { color: colors.textSecondary }]}>
                  Free プランでは直近 {FREE_HISTORY_WINDOW_DAYS} 日の記録が表示されます
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </View>
            </Card>
          </TouchableOpacity>
        )}
      </ScrollView>

      <UpgradePromptModal
        visible={upgradeVisible}
        onClose={() => setUpgradeVisible(false)}
        featureName="全履歴の表示"
        featureDescription={`Free プランでは直近 ${FREE_HISTORY_WINDOW_DAYS} 日までの履歴に制限されています。Plus で全期間を振り返りましょう。`}
        requiredPlan="plus"
        benefits={['全期間のトレーニング履歴', '全期間の栄養記録', '全期間の体組成ログ']}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
  },
  title: { ...typography.titleMedium },
  headerSpacer: { width: 60 },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  chipRow: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipText: { ...typography.labelMedium, fontWeight: '600' },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  monthArrow: { padding: spacing.xs },
  monthLabel: { ...typography.titleSmall, fontWeight: '700' },
  weekRow: { flexDirection: 'row' },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    ...typography.labelSmall,
    marginBottom: spacing.xs,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 3,
  },
  dayBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: { ...typography.bodyMedium, fontWeight: '600' },
  dayNumOutside: { opacity: 0.4 },
  dotSpace: { height: 8, justifyContent: 'center', alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  emptyText: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  legendText: { ...typography.labelSmall },
  upgradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  upgradeText: { ...typography.bodySmall, flex: 1 },
});
