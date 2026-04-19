import React, { useEffect, useState } from 'react';
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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card } from '../../../src/components/ui';
import { useProfileStore } from '../../../src/stores/profileStore';
import { listUserExercisePRSummary } from '../../../src/infra/repositories/personalRecordRepository';
import { getExerciseById } from '../../../src/infra/repositories/workoutRepository';
import { Exercise } from '../../../src/types/workout';

interface Row {
  exerciseId: string;
  exerciseName: string;
  best1rm: number | null;
  bestWeight: number | null;
  bestVolume: number | null;
}

export default function PRHistoryScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const summary = await listUserExercisePRSummary(profile.id);
        const enriched: Row[] = [];
        for (const r of summary) {
          const ex: Exercise | null = await getExerciseById(r.exerciseId);
          enriched.push({
            exerciseId: r.exerciseId,
            exerciseName: ex?.nameJa ?? '—',
            best1rm: r.best1rm,
            bestWeight: r.bestWeight,
            bestVolume: r.bestVolume,
          });
        }
        setRows(enriched);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [profile?.id]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>自己ベスト</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator />
        ) : rows.length === 0 ? (
          <Card>
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              まだ記録がありません。セットを記録すると自己ベストが自動で蓄積されます。
            </Text>
          </Card>
        ) : (
          rows.map((r) => (
            <TouchableOpacity
              key={r.exerciseId}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/progress/pr-detail/[exerciseId]',
                  params: { exerciseId: r.exerciseId },
                })
              }
              activeOpacity={0.7}
            >
              <Card>
                <View style={styles.rowHeader}>
                  <Text style={[styles.name, { color: colors.textPrimary }]}>{r.exerciseName}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </View>
                <View style={styles.prRow}>
                  <View style={styles.prCell}>
                    <Text style={[styles.prLabel, { color: colors.textSecondary }]}>推定1RM</Text>
                    <Text style={[styles.prValue, { color: colors.primary }]}>
                      {r.best1rm ? `${r.best1rm.toFixed(1)}kg` : '—'}
                    </Text>
                  </View>
                  <View style={styles.prCell}>
                    <Text style={[styles.prLabel, { color: colors.textSecondary }]}>最大重量</Text>
                    <Text style={[styles.prValue, { color: colors.textPrimary }]}>
                      {r.bestWeight ? `${r.bestWeight.toFixed(1)}kg` : '—'}
                    </Text>
                  </View>
                  <View style={styles.prCell}>
                    <Text style={[styles.prLabel, { color: colors.textSecondary }]}>最大ボリューム</Text>
                    <Text style={[styles.prValue, { color: colors.textPrimary }]}>
                      {r.bestVolume ? `${Math.round(r.bestVolume).toLocaleString()}kg` : '—'}
                    </Text>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          ))
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
  title: { ...typography.titleMedium },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxxl },
  empty: { ...typography.bodyMedium, textAlign: 'center' },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  name: { ...typography.titleSmall },
  prRow: { flexDirection: 'row', justifyContent: 'space-between' },
  prCell: { flex: 1, alignItems: 'flex-start', gap: spacing.xs },
  prLabel: { ...typography.labelSmall },
  prValue: { ...typography.numberSmall, fontSize: 14 },
});
