import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { startOfWeek, endOfWeek, addDays, format } from 'date-fns';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, Button, Badge, DateNavigator } from '../../../src/components/ui';
import { useProfileStore } from '../../../src/stores/profileStore';
import { MUSCLE_GROUP_MAP } from '../../../src/constants/muscleGroups';
import { WorkoutSession, WorkoutSet } from '../../../src/types/workout';
import { estimateOneRepMax } from '../../../src/domain/oneRepMax';
import * as workoutRepo from '../../../src/infra/repositories/workoutRepository';
import { getISODate } from '../../../src/utils/format';
import { useSubscription } from '../../../src/hooks/useSubscription';
import {
  historyWindowDaysFor,
  FREE_HISTORY_WINDOW_DAYS,
} from '../../../src/domain/subscription/gates';
import { UpgradePromptModal } from '../../../src/components/subscription/UpgradePromptModal';

interface SessionDisplay {
  session: WorkoutSession & { routineName: string | null };
  sets: WorkoutSet[];
  totalVolume: number;
}

// Track self-best 1RM per exercise across all sessions
interface ExerciseBest {
  oneRepMax: number;
  date: string;
}

export default function HistoryScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);

  const [sessions, setSessions] = useState<SessionDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Date navigation
  const [selectedDate, setSelectedDate] = useState(getISODate());
  const [recordedDates, setRecordedDates] = useState<string[]>([]);

  // Self-best 1RM map: exerciseId -> { oneRepMax, date }
  const [exerciseBests, setExerciseBests] = useState<Record<string, ExerciseBest>>({});

  const { status: planStatus } = useSubscription();
  const historyWindowDays = historyWindowDaysFor(planStatus);
  const isHistoryClamped = historyWindowDays !== null;
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!profile) return;
    try {
      const rawSessions = await workoutRepo.getSessionWithRoutineName(profile.id, 50, historyWindowDays);

      const displayed: SessionDisplay[] = [];
      const bestsMap: Record<string, ExerciseBest> = {};

      for (const session of rawSessions) {
        if (!session.finishedAt) continue;
        const sets = await workoutRepo.getSetsForSession(session.id);
        const totalVolume = sets
          .filter((s) => !s.isWarmup)
          .reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
        displayed.push({ session, sets, totalVolume });

        // Calculate best 1RM per exercise from this session
        for (const s of sets) {
          if (s.isWarmup || !s.weightKg || !s.reps || s.reps <= 0) continue;
          const orm = estimateOneRepMax(s.weightKg, s.reps).value;
          if (orm > 0) {
            const existing = bestsMap[s.exerciseId];
            if (!existing || orm > existing.oneRepMax) {
              bestsMap[s.exerciseId] = {
                oneRepMax: orm,
                date: session.startedAt.substring(0, 10),
              };
            }
          }
        }
      }

      setSessions(displayed);
      setExerciseBests(bestsMap);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [profile, historyWindowDays]);

  // Load recorded dates for DateNavigator
  useEffect(() => {
    if (!profile?.id) return;
    const monthPrefix = selectedDate.substring(0, 7);
    workoutRepo.getRecordedSessionDates(profile.id, monthPrefix, historyWindowDays)
      .then(setRecordedDates)
      .catch(() => {});
  }, [profile?.id, selectedDate, historyWindowDays]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory]),
  );

  // Filter sessions to the week containing selectedDate
  const weekStart = useMemo(
    () => format(startOfWeek(new Date(selectedDate + 'T00:00:00'), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    [selectedDate],
  );
  const weekEnd = useMemo(
    () => format(endOfWeek(new Date(selectedDate + 'T00:00:00'), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    [selectedDate],
  );

  const filteredSessions = useMemo(() => {
    return sessions.filter((item) => {
      const sessionDate = item.session.startedAt.substring(0, 10);
      return sessionDate >= weekStart && sessionDate <= weekEnd;
    });
  }, [sessions, weekStart, weekEnd]);

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '--';
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m}分`;
    const h = Math.floor(m / 60);
    const remainM = m % 60;
    return `${h}時間${remainM}分`;
  };

  const formatDate = (isoString: string): string => {
    const d = new Date(isoString);
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekday = weekdays[d.getDay()];
    return `${month}/${day}（${weekday}）`;
  };

  const formatShortDate = (dateStr: string): string => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const groupSetsByExercise = (
    sets: WorkoutSet[],
  ): { exerciseId: string; sets: WorkoutSet[] }[] => {
    const map = new Map<string, WorkoutSet[]>();
    for (const s of sets) {
      const existing = map.get(s.exerciseId) ?? [];
      existing.push(s);
      map.set(s.exerciseId, existing);
    }
    return Array.from(map.entries()).map(([exerciseId, eSets]) => ({
      exerciseId,
      sets: eSets.sort((a, b) => a.setNumber - b.setNumber),
    }));
  };

  // Calculate best estimated 1RM from a set of working sets for a single session
  const getBestOneRM = (sets: WorkoutSet[]): number | null => {
    let best: number | null = null;
    for (const s of sets) {
      if (s.isWarmup || !s.weightKg || !s.reps || s.reps <= 0) continue;
      const orm = estimateOneRepMax(s.weightKg, s.reps).value;
      if (orm > 0 && (best === null || orm > best)) {
        best = orm;
      }
    }
    return best;
  };

  const [exerciseNames, setExerciseNames] = useState<Record<string, string>>({});
  const [exerciseTypes, setExerciseTypes] = useState<Record<string, string>>({});

  // Load exercise names for expanded sessions
  const loadExerciseNames = useCallback(
    async (sets: WorkoutSet[]) => {
      const unknownIds = new Set<string>();
      for (const s of sets) {
        if (!exerciseNames[s.exerciseId]) {
          unknownIds.add(s.exerciseId);
        }
      }
      if (unknownIds.size === 0) return;

      try {
        const allExercises = await workoutRepo.getExercises();
        const nameMap: Record<string, string> = { ...exerciseNames };
        const typeMap: Record<string, string> = { ...exerciseTypes };
        for (const ex of allExercises) {
          if (unknownIds.has(ex.id)) {
            nameMap[ex.id] = ex.nameJa;
            typeMap[ex.id] = ex.exerciseType;
          }
        }
        setExerciseNames(nameMap);
        setExerciseTypes(typeMap);
      } catch {
        // silently fail
      }
    },
    [exerciseNames, exerciseTypes],
  );

  const handleToggleExpand = (sessionDisplay: SessionDisplay) => {
    const newId =
      expandedId === sessionDisplay.session.id ? null : sessionDisplay.session.id;
    setExpandedId(newId);
    if (newId) {
      loadExerciseNames(sessionDisplay.sets);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Button title="戻る" onPress={() => router.back()} variant="ghost" size="sm" icon={<Ionicons name="chevron-back" size={18} color={colors.primary} />} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>トレーニング履歴</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Date Navigator */}
        <DateNavigator
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          recordedDates={recordedDates}
        />

        {loading ? (
          <Card>
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>読み込み中...</Text>
          </Card>
        ) : filteredSessions.length === 0 ? (
          <Card>
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
                この週の履歴はありません
              </Text>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                他の週に切り替えるか、トレーニングを完了してください
              </Text>
            </View>
          </Card>
        ) : (
          filteredSessions.map((item) => (
            <Card key={item.session.id}>
              <TouchableOpacity
                onPress={() => handleToggleExpand(item)}
                activeOpacity={0.7}
              >
                <View style={styles.sessionRow}>
                  <View style={styles.sessionInfo}>
                    <Text style={[styles.sessionName, { color: colors.textPrimary }]}>
                      {item.session.routineName ?? 'フリーセッション'}
                    </Text>
                    <Text style={[styles.sessionMeta, { color: colors.textSecondary }]}>
                      {formatDate(item.session.startedAt)}
                      {'  '}
                      {formatDuration(item.session.durationSeconds)}
                      {'  '}
                      {item.totalVolume.toLocaleString()} kg
                    </Text>
                  </View>
                  <Ionicons
                    name={expandedId === item.session.id ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.textTertiary}
                  />
                </View>
              </TouchableOpacity>

              {expandedId === item.session.id && (
                <View style={[styles.expandedContent, { borderTopColor: colors.border }]}>
                  {item.session.note && (
                    <Text style={[styles.sessionNote, { color: colors.textSecondary }]}>
                      {item.session.note}
                    </Text>
                  )}

                  {groupSetsByExercise(item.sets).map((group) => {
                    const sessionBest1RM = getBestOneRM(group.sets);
                    const selfBest = exerciseBests[group.exerciseId];
                    const exType = exerciseTypes[group.exerciseId] ?? 'strength';
                    const isStrength = exType === 'strength';

                    return (
                      <View key={group.exerciseId} style={styles.exerciseGroup}>
                        <View style={styles.exerciseHeader}>
                          <Text style={[styles.exerciseGroupName, { color: colors.textPrimary }]}>
                            {exerciseNames[group.exerciseId] ?? '...'}
                          </Text>
                          {isStrength && sessionBest1RM !== null && (
                            <Text style={[styles.oneRMText, { color: colors.primary }]}>
                              推定1RM: {sessionBest1RM.toFixed(1)} kg
                            </Text>
                          )}
                        </View>
                        {isStrength && selfBest && (
                          <Text style={[styles.selfBestText, { color: colors.success }]}>
                            自己ベスト: {selfBest.oneRepMax.toFixed(1)} kg ({formatShortDate(selfBest.date)})
                          </Text>
                        )}
                        {group.sets.map((s) => (
                          <View key={s.id} style={styles.historySetRow}>
                            <Text
                              style={[styles.historySetNum, { color: colors.textTertiary }]}
                            >
                              {s.setNumber}
                            </Text>
                            <Text style={[styles.historySetDetail, { color: colors.textSecondary }]}>
                              {isStrength
                                ? `${s.weightKg ?? 0}kg x ${s.reps ?? 0}回${
                                    s.rpe != null ? ` @ RPE${s.rpe}` : ''
                                  }${s.isWarmup ? ' (W)' : ''}`
                                : [
                                    s.durationMinutes != null
                                      ? `${s.durationMinutes}分`
                                      : null,
                                    s.distanceKm != null ? `${s.distanceKm}km` : null,
                                    s.caloriesBurned != null
                                      ? `${Math.round(s.caloriesBurned)}kcal`
                                      : null,
                                    s.perceivedIntensity != null
                                      ? `強度${s.perceivedIntensity}`
                                      : null,
                                  ]
                                    .filter((x) => x !== null)
                                    .join(' / ')}
                            </Text>
                          </View>
                        ))}
                      </View>
                    );
                  })}

                  <View style={styles.volumeSummary}>
                    <View style={styles.volumeItem}>
                      <Text style={[styles.volumeLabel, { color: colors.textTertiary }]}>
                        種目数
                      </Text>
                      <Text style={[styles.volumeValue, { color: colors.textPrimary }]}>
                        {groupSetsByExercise(item.sets).length}
                      </Text>
                    </View>
                    <View style={styles.volumeItem}>
                      <Text style={[styles.volumeLabel, { color: colors.textTertiary }]}>
                        セット数
                      </Text>
                      <Text style={[styles.volumeValue, { color: colors.textPrimary }]}>
                        {item.sets.length}
                      </Text>
                    </View>
                    <View style={styles.volumeItem}>
                      <Text style={[styles.volumeLabel, { color: colors.textTertiary }]}>
                        総ボリューム
                      </Text>
                      <Text style={[styles.volumeValue, { color: colors.textPrimary }]}>
                        {item.totalVolume.toLocaleString()} kg
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </Card>
          ))
        )}

        {isHistoryClamped && !loading && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setUpgradeVisible(true)}
          >
            <Card>
              <View style={styles.upgradeRow}>
                <View
                  style={[
                    styles.upgradeIcon,
                    { backgroundColor: colors.primary + '15' },
                  ]}
                >
                  <Ionicons
                    name="sparkles"
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.upgradeTextWrap}>
                  <Text
                    style={[
                      styles.upgradeTitle,
                      { color: colors.textPrimary },
                    ]}
                  >
                    Plus で全履歴を表示
                  </Text>
                  <Text
                    style={[
                      styles.upgradeSubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Free プランは直近 {FREE_HISTORY_WINDOW_DAYS} 日まで表示されます
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textTertiary}
                />
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
  // Empty
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyTitle: { ...typography.titleSmall },
  emptyText: { ...typography.bodySmall, textAlign: 'center' },
  // Session row
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionInfo: { flex: 1, marginRight: spacing.md },
  sessionName: { ...typography.titleSmall },
  sessionMeta: { ...typography.bodySmall, marginTop: spacing.xs },
  // Expanded content
  expandedContent: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 0.5,
    gap: spacing.md,
  },
  sessionNote: {
    ...typography.bodySmall,
    fontStyle: 'italic',
  },
  exerciseGroup: {
    gap: spacing.xs,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  exerciseGroupName: {
    ...typography.labelLarge,
    flex: 1,
  },
  oneRMText: {
    ...typography.labelSmall,
  },
  selfBestText: {
    ...typography.labelSmall,
    marginBottom: spacing.xs,
    paddingLeft: spacing.md,
  },
  historySetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
  },
  historySetNum: {
    ...typography.labelSmall,
    width: 20,
    textAlign: 'center',
  },
  historySetDetail: {
    ...typography.bodySmall,
  },
  // Volume summary
  volumeSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  volumeItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  volumeLabel: { ...typography.labelSmall },
  volumeValue: { ...typography.numberSmall },
  // Upgrade CTA
  upgradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  upgradeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeTextWrap: {
    flex: 1,
    gap: 2,
  },
  upgradeTitle: {
    ...typography.labelLarge,
  },
  upgradeSubtitle: {
    ...typography.bodySmall,
  },
});
