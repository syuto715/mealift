import React, { useCallback, useState } from 'react';
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
import { MuscleBodyDiagram } from '../../../src/components/training/MuscleBodyDiagram';
import { MuscleDetailModal } from '../../../src/components/training/MuscleDetailModal';
import { useProfileStore } from '../../../src/stores/profileStore';
import { useSubscription } from '../../../src/hooks/useSubscription';
import {
  aggregateWeeklySetsByMuscle,
  summarizeVolumeGroups,
  VOLUME_LANDMARKS,
  type VolumeGroup,
  type VolumeGroupSummary,
} from '../../../src/domain/volumeLandmark';
import { fetchLastTrainedByMuscle } from '../../../src/infra/repositories/workoutRepository';
import { getActiveRecommendations } from '../../../src/infra/repositories/deloadRecommendationRepository';
import {
  summarizeRecovery,
  type RecoveryState,
} from '../../../src/domain/recovery';
import { MUSCLE_RECOVERY_HOURS } from '../../../src/constants/muscleRecoveryHours';

// Build 16 / Phase 6 (Muscle Recovery Heatmap) / Phase 6.3 — Pro-only
// body-diagram screen that pulls volume + recovery + active deload
// data and feeds MuscleBodyDiagram (Phase 6.2). One of two surfaces
// for the heatmap (the other is volume-dashboard's CTA, also Pro-
// gated).
//
// Three parallel fetches via Promise.all (Phase 2.2 pattern):
//   - aggregateWeeklySetsByMuscle (Phase 2.1) → volume zones
//   - fetchLastTrainedByMuscle (Phase 6.1) → recovery state
//   - getActiveRecommendations (Phase 4.0) → deload markers
//
// Cancellation guard mirrors Phase 2.2 volume-dashboard exactly. The
// Pro gate at the body level handles live downgrades — if `unlocked`
// flips to false mid-session the screen rerenders to the lock state
// and the detail modal closes via its own `unlocked` reactive prop
// (Phase 5.2 race-defense pattern).

interface HeatmapData {
  recoveryByGroup: Record<VolumeGroup, RecoveryState>;
  summaries: VolumeGroupSummary[];
  activeDeloadMuscles: VolumeGroup[];
  lastTrainedByMuscle: Record<VolumeGroup, Date | null>;
}

export default function MuscleHeatmapScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);
  const sub = useSubscription();
  const unlocked = sub.hasFeature('muscleHeatmap');

  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [selectedGroup, setSelectedGroup] = useState<VolumeGroup | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!profile?.id || !unlocked) {
        // Codex review pass 1 / Phase 5.2 lesson — clear stale state
        // when leaving the gated path so an account swap or
        // downgrade doesn't keep the previous user's data painted.
        setData(null);
        setSelectedGroup(null);
        setLoading(false);
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          const [setsByGroup, lastTrainedByMuscle, activeDeloads] =
            await Promise.all([
              aggregateWeeklySetsByMuscle(profile.id, new Date()),
              fetchLastTrainedByMuscle(profile.id),
              getActiveRecommendations(profile.id),
            ]);
          if (cancelled) return;

          const summaries = summarizeVolumeGroups(setsByGroup);
          const recoveryByGroup = summarizeRecovery(
            lastTrainedByMuscle,
            new Date(),
            MUSCLE_RECOVERY_HOURS,
          );
          const activeDeloadMuscles = Array.from(
            new Set(activeDeloads.flatMap((d) => d.affectedMuscles)),
          );

          setData({
            recoveryByGroup,
            summaries,
            activeDeloadMuscles,
            lastTrainedByMuscle,
          });
        } catch {
          if (!cancelled) {
            setData(null);
            setSelectedGroup(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [profile?.id, unlocked]),
  );

  const handleMusclePress = useCallback((g: VolumeGroup) => {
    setSelectedGroup(g);
  }, []);

  const handleCloseModal = useCallback(() => setSelectedGroup(null), []);

  const handleToggleSide = useCallback(() => {
    setSide((s) => (s === 'front' ? 'back' : 'front'));
  }, []);

  const selectedSummary =
    data && selectedGroup
      ? data.summaries.find((s) => s.group === selectedGroup) ?? null
      : null;
  const selectedRecovery =
    data && selectedGroup ? data.recoveryByGroup[selectedGroup] : null;
  const selectedLastTrained =
    data && selectedGroup
      ? data.lastTrainedByMuscle[selectedGroup]
      : null;

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
          部位別回復ヒートマップ
        </Text>
        <View style={styles.headerBtn} />
      </View>

      {!unlocked ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="lock-closed" size={32} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            部位別回復ヒートマップは Pro プランで利用できます
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/settings/subscription')}
            style={[styles.upgradeBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.upgradeBtnText}>プランを見る</Text>
          </TouchableOpacity>
        </View>
      ) : loading && data === null ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : data ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Card>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>
              各部位の色は最終トレーニングからの推定回復度を示します。タップで詳細表示。
            </Text>
            <MuscleBodyDiagram
              recoveryByGroup={data.recoveryByGroup}
              volumeByGroup={Object.fromEntries(
                data.summaries.map((s) => [s.group, s.zone]),
              ) as Partial<Record<VolumeGroup, VolumeGroupSummary['zone']>>}
              activeDeloadMuscles={data.activeDeloadMuscles}
              currentSide={side}
              onToggleSide={handleToggleSide}
              onMusclePress={handleMusclePress}
            />
          </Card>
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            データの取得に失敗しました
          </Text>
        </View>
      )}

      <MuscleDetailModal
        visible={selectedGroup !== null && unlocked}
        group={selectedGroup}
        recoveryState={selectedRecovery}
        setsThisWeek={selectedSummary?.weeklySets ?? 0}
        zone={selectedSummary?.zone ?? null}
        landmark={selectedGroup ? VOLUME_LANDMARKS[selectedGroup] : null}
        lastTrained={selectedLastTrained ?? null}
        onClose={handleCloseModal}
      />
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
  intro: {
    ...typography.bodySmall,
    lineHeight: 18,
    marginBottom: spacing.md,
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
});
