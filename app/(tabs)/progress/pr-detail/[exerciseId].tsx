import React, { useCallback, useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../../../src/theme/tokens';
import { typography } from '../../../../src/theme/typography';
import { spacing } from '../../../../src/theme/spacing';
import { Card } from '../../../../src/components/ui';
import { getPRHistoryForExercise } from '../../../../src/infra/repositories/personalRecordRepository';
import { getExerciseById } from '../../../../src/infra/repositories/workoutRepository';
import {
  getCurrentE1RM,
  getE1RMHistory,
  type E1RMObservation,
} from '../../../../src/infra/repositories/oneRepMaxRepository';
import { useProfileStore } from '../../../../src/stores/profileStore';
import { PersonalRecord } from '../../../../src/types/personalRecord';
import { formatDate } from '../../../../src/utils/format';
import { E1RMHistoryChart } from '../../../../src/components/training/E1RMHistoryChart';
import { differenceInCalendarDays, parseISO, subDays } from 'date-fns';

export default function PRDetailScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();

  const profile = useProfileStore((s) => s.profile);
  const [exerciseName, setExerciseName] = useState('');
  const [history, setHistory] = useState<PersonalRecord[]>([]);
  const [e1rmHistory, setE1RMHistory] = useState<E1RMObservation[]>([]);
  const [currentE1RM, setCurrentE1RM] = useState<E1RMObservation | null>(null);
  const [loading, setLoading] = useState(true);

  // Build 15 / Feature 5-B — 90-day window for the e1rm history chart.
  // sinceISO is computed once at mount; the chart axis labels stay
  // stable while the user scrolls.
  const sinceISO = useMemo(() => subDays(new Date(), 90).toISOString(), []);

  // Build 15 / Phase 3 fix — refetch on screen focus so newly-recorded
  // sets surface in the chart without requiring a full screen remount.
  // Fires both on initial mount and on every navigation back to this
  // screen.
  useFocusEffect(
    useCallback(() => {
      if (!exerciseId) return;
      let cancelled = false;
      (async () => {
        try {
          const ex = await getExerciseById(exerciseId);
          if (cancelled) return;
          setExerciseName(ex?.nameJa ?? '—');
          const h = await getPRHistoryForExercise(exerciseId, 'estimated_1rm');
          if (cancelled) return;
          setHistory(h);
          if (profile) {
            const [obs, current] = await Promise.all([
              getE1RMHistory(profile.id, exerciseId, sinceISO),
              getCurrentE1RM(profile.id, exerciseId),
            ]);
            if (cancelled) return;
            setE1RMHistory(obs);
            setCurrentE1RM(current);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [exerciseId, profile, sinceISO]),
  );

  const growthPerMonth = (() => {
    if (history.length < 2) return null;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);
    const recent = history.filter((h) => parseISO(h.achievedAt) >= cutoff);
    if (recent.length < 2) return null;
    const first = recent[0];
    const last = recent[recent.length - 1];
    const days = differenceInCalendarDays(parseISO(last.achievedAt), parseISO(first.achievedAt));
    if (days === 0) return null;
    const diff = last.value - first.value;
    return Number(((diff / days) * 30).toFixed(2));
  })();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {exerciseName}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator />
        ) : (
          <>
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>1RM推移</Text>
              {currentE1RM && (
                <Text style={[styles.currentE1RM, { color: colors.textPrimary }]}>
                  現在推定 1RM: {currentE1RM.e1rmKg.toFixed(1)} kg
                </Text>
              )}
              <E1RMHistoryChart history={e1rmHistory} windowStart={sinceISO} />
              {growthPerMonth !== null && (
                <Text style={[styles.growth, { color: colors.primary }]}>
                  {growthPerMonth >= 0 ? '+' : ''}
                  {growthPerMonth.toFixed(1)}kg/月（過去3ヶ月）
                </Text>
              )}
              {history.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textSecondary }]}>
                  まだ記録がありません。
                </Text>
              ) : (
                history.map((h) => (
                  <View key={h.id} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.historyDate, { color: colors.textSecondary }]}>
                      {formatDate(h.achievedAt, 'M/d')}
                    </Text>
                    <Text style={[styles.historyValue, { color: colors.textPrimary }]}>
                      {h.value.toFixed(1)}kg
                    </Text>
                    <Text style={[styles.historySet, { color: colors.textTertiary }]}>
                      {h.weightKg}kg × {h.reps}
                    </Text>
                  </View>
                ))
              )}
            </Card>
          </>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { ...typography.titleMedium, flex: 1, textAlign: 'center' },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxxl },
  sectionTitle: { ...typography.labelMedium, marginBottom: spacing.md },
  currentE1RM: { ...typography.titleSmall, marginBottom: spacing.sm },
  growth: { ...typography.titleSmall, marginBottom: spacing.md, marginTop: spacing.sm },
  empty: { ...typography.bodyMedium, textAlign: 'center', paddingVertical: spacing.md },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyDate: { ...typography.labelMedium, width: 60 },
  historyValue: { ...typography.numberSmall, flex: 1, textAlign: 'center' },
  historySet: { ...typography.bodySmall, width: 80, textAlign: 'right' },
});
