import React, { useCallback, useEffect, useState } from 'react';
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
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card } from '../../../src/components/ui';
import { VolumeLandmarkChart } from '../../../src/components/training/VolumeLandmarkChart';
import { useProfileStore } from '../../../src/stores/profileStore';
import { useSubscription } from '../../../src/hooks/useSubscription';
import {
  aggregateWeeklySetsByMuscle,
  summarizeVolumeGroups,
  type VolumeGroup,
  type VolumeGroupSummary,
} from '../../../src/domain/volumeLandmark';
import { startOfWeek, endOfWeek, format } from 'date-fns';

// Build 16 / Phase 2 (Feature E) / Phase 2.2 — full-screen MEV/MAV/MRV
// volume dashboard for Plus+ tiers.
//
// The screen intentionally stays thin: aggregation + classification
// live in the volumeLandmark domain (Phase 2.1) and the visualization
// lives in VolumeLandmarkChart. This file orchestrates the data
// fetch + Plus gate + week label.
//
// Free users shouldn't actually reach this route — the progress-tab
// preview card (Phase 2.2) is hidden for them — but the gate here
// is defense-in-depth in case a deep-link or back-navigation lands
// them on the URL anyway.

export default function VolumeDashboardScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);
  const sub = useSubscription();
  const unlocked = sub.hasFeature('volumeDashboard');

  const [summaries, setSummaries] = useState<VolumeGroupSummary[] | null>(null);
  // Codex review pass 1 / Important #4 — `loading` only flips true
  // on the very first load. Subsequent useFocusEffect refetches
  // keep the existing `summaries` painted while the new query is
  // in flight, then atomically swap on success. Eliminates the
  // full-screen spinner flash + SVG remount on every tab return.
  const [loading, setLoading] = useState(true);

  // Codex review pass 1 / Critical #1 — useFocusEffect-driven
  // refetch needs a cancellation guard so a slow query that
  // resolves after the user has already left the screen / signed
  // out can't overwrite fresh state on the next mount. Mirrors the
  // pattern progress/index.tsx already uses for its preview.
  useFocusEffect(
    useCallback(() => {
      if (!profile?.id || !unlocked) {
        setLoading(false);
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          const setsByGroup = await aggregateWeeklySetsByMuscle(
            profile.id,
            new Date(),
          );
          if (cancelled) return;
          setSummaries(summarizeVolumeGroups(setsByGroup));
        } catch {
          if (!cancelled) setSummaries(null);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [profile?.id, unlocked]),
  );

  // Week label — same Mon-Sun ISO convention everything else uses.
  // Computed from local time so the displayed range matches the user's
  // calendar (Phase 1.1 / 2.1 lesson on TZ).
  const weekLabel = (() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const sunday = endOfWeek(new Date(), { weekStartsOn: 1 });
    return `${format(monday, 'M/d')} 〜 ${format(sunday, 'M/d')}`;
  })();

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          ボリュームダッシュボード
        </Text>
        <View style={styles.headerBtn} />
      </View>

      {!unlocked ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="lock-closed" size={32} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            ボリュームダッシュボードは Plus プランで利用できます
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/settings/subscription')}
            style={[styles.upgradeBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.upgradeBtnText}>プランを見る</Text>
          </TouchableOpacity>
        </View>
      ) : summaries === null && loading ? (
        // Codex pass 1 / Important #4 — full-screen spinner only on
        // the very first load. Subsequent refetches keep the prior
        // chart painted (stale-while-revalidate UX) so the user
        // doesn't see a blank flash on every tab return.
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.weekLabel, { color: colors.textSecondary }]}>
            今週: {weekLabel}
          </Text>

          <Card>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              部位別週間セット数
            </Text>
            <Text style={[styles.helpText, { color: colors.textTertiary }]}>
              バー上の縦線が今週のセット数。緑の濃い帯が MAV (推奨ボリューム)、黄色は MRV 手前の注意域、赤は MRV 超過です。
            </Text>
            {summaries && summaries.length > 0 ? (
              <VolumeLandmarkChart summaries={summaries} />
            ) : (
              <Text style={[styles.emptyDataText, { color: colors.textTertiary }]}>
                今週のトレーニングデータがありません
              </Text>
            )}
          </Card>

          <Card>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              ランドマークについて
            </Text>
            <View style={styles.legendList}>
              <LegendRow label="MEV (最低有効)" desc="この値未満は成長刺激が不十分" colors={colors} dotColor={colors.textTertiary} />
              <LegendRow label="MAV (適応量域)" desc="筋肥大に最も効率的なゾーン" colors={colors} dotColor={colors.success} emphasis />
              <LegendRow label="MRV (回復可能上限)" desc="超えると回復が追いつかずデロード推奨" colors={colors} dotColor={colors.error} />
            </View>
            <Text style={[styles.legendNote, { color: colors.textTertiary }]}>
              基準値は Israetel/Hoffmann RP 2017 に基づく一般的なリファレンスです。個人差があるため、自分の回復能力に応じて微調整してください。
            </Text>
          </Card>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function LegendRow({
  label,
  desc,
  dotColor,
  emphasis = false,
  colors,
}: {
  label: string;
  desc: string;
  dotColor: string;
  emphasis?: boolean;
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: dotColor }]} />
      <View style={styles.legendBody}>
        <Text
          style={[
            styles.legendLabel,
            { color: emphasis ? colors.textPrimary : colors.textSecondary },
          ]}
        >
          {label}
        </Text>
        <Text style={[styles.legendDesc, { color: colors.textTertiary }]}>
          {desc}
        </Text>
      </View>
    </View>
  );
}

// Re-export for tests / external imports if needed.
export type { VolumeGroup };

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
  weekLabel: {
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
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
  upgradeBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: 999,
  },
  upgradeBtnText: {
    ...typography.labelLarge,
    color: '#FFFFFF',
  },
  sectionTitle: {
    ...typography.titleSmall,
    marginBottom: spacing.sm,
  },
  helpText: {
    ...typography.bodySmall,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  emptyDataText: {
    ...typography.bodySmall,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  legendList: {
    gap: spacing.md,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  legendBody: { flex: 1, gap: 2 },
  legendLabel: {
    ...typography.labelMedium,
    fontWeight: '600',
  },
  legendDesc: { ...typography.bodySmall },
  legendNote: {
    ...typography.bodySmall,
    marginTop: spacing.md,
    fontSize: 11,
    lineHeight: 16,
  },
});
