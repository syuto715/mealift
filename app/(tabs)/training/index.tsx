import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { radius } from '../../../src/theme/tokens';
import { Card, Button, Badge, Modal, Input, SegmentedControl } from '../../../src/components/ui';
import { VolumeChart } from '../../../src/components/training/VolumeChart';
import { useProfileStore } from '../../../src/stores/profileStore';
import { MUSCLE_GROUPS, MUSCLE_GROUP_MAP } from '../../../src/constants/muscleGroups';
import { EQUIPMENT_CATEGORIES, EquipmentKey } from '../../../src/constants/equipment';
import { DEFAULT_TARGET_SETS, DEFAULT_TARGET_REPS } from '../../../src/constants/defaults';
import { MuscleGroup } from '../../../src/types/common';
import { Exercise, ExerciseType, SetPattern, WorkoutRoutineWithItems, WorkoutSession, WorkoutSet } from '../../../src/types/workout';
import { PATTERN_PRESETS, getPatternPreset } from '../../../src/constants/setPatterns';
import { calculateSessionVolume, calculateWorkingSets } from '../../../src/domain/volume';
import * as workoutRepo from '../../../src/infra/repositories/workoutRepository';
import { filterExercisesByEquipment } from '../../../src/utils/filterExercisesByEquipment';
import { startOfWeek, endOfWeek, subWeeks, format } from 'date-fns';

interface RoutineItemDraft {
  exercise: Exercise;
  targetSets: number;
  targetReps: string;
  // Build 15 / Feature 5-O — pattern preset selection. null = standard.
  setPattern: SetPattern | null;
  patternConfig: string | null;
}

const EXERCISE_TYPE_TABS: { label: string; value: ExerciseType }[] = [
  { label: '筋トレ', value: 'strength' },
  { label: '有酸素', value: 'cardio' },
  { label: 'スポーツ', value: 'sports' },
  { label: 'その他', value: 'other' },
];

function createEmptyVolumeRecord(): Record<MuscleGroup, number> {
  return {
    chest: 0,
    back: 0,
    shoulders: 0,
    legs: 0,
    arms: 0,
    core: 0,
    full_body: 0,
  };
}

export default function TrainingScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);

  // highlightRoutineId is set when the AI menu preview screen saves a
  // new routine and replace()'s back here — drives a brief Animated
  // flash on the matching card so the user sees what just landed.
  const params = useLocalSearchParams<{ highlightRoutineId?: string }>();
  const highlightRoutineId = params.highlightRoutineId ?? null;
  const flashAnim = useRef(new Animated.Value(0)).current;

  const [routines, setRoutines] = useState<WorkoutRoutineWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  // Create routine modal state. The "form" and "picker" stages share a
  // single RNModal — RN's native modal can only present one at a time
  // on iOS, so the previous nested-Modal approach silently failed when
  // the user tapped "+ 種目を追加" from inside the form. Stage swap keeps
  // the wizard inside a single presented modal.
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [modalStage, setModalStage] = useState<'form' | 'picker'>('form');
  const [routineName, setRoutineName] = useState('');
  const [draftItems, setDraftItems] = useState<RoutineItemDraft[]>([]);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [exerciseFilter, setExerciseFilter] = useState<string>('all');
  const [exerciseTypeFilter, setExerciseTypeFilter] = useState<ExerciseType>('strength');
  const [rawExercises, setRawExercises] = useState<Exercise[]>([]);
  // Equipment chip filter (Build 15 / Feature 5-P). Multi-select OR within
  // the chip row; empty selection = no filter. Lives in useMemo (NOT in
  // loadExercises deps) so chip toggle is instant in-memory and never
  // triggers a SQL refetch.
  const [selectedEquipments, setSelectedEquipments] = useState<EquipmentKey[]>([]);

  // Volume analysis state
  const [currentWeekVolume, setCurrentWeekVolume] = useState<Record<MuscleGroup, number>>(createEmptyVolumeRecord());
  const [previousWeekVolume, setPreviousWeekVolume] = useState<Record<MuscleGroup, number>>(createEmptyVolumeRecord());
  const [currentWeekSets, setCurrentWeekSets] = useState<Record<MuscleGroup, number>>(createEmptyVolumeRecord());
  const [weeklyTotalVolume, setWeeklyTotalVolume] = useState(0);
  const [weeklyTotalSets, setWeeklyTotalSets] = useState(0);

  // Exercise lookup cache
  const [exerciseMap, setExerciseMap] = useState<Record<string, Exercise>>({});

  const loadRoutines = useCallback(async () => {
    if (!profile) return;
    try {
      const data = await workoutRepo.getRoutines(profile.id);
      setRoutines(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [profile]);

  const loadVolumeAnalysis = useCallback(async () => {
    if (!profile) return;
    try {
      const now = new Date();
      const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
      const currentWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
      const previousWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      const previousWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

      // Load all exercises for muscle group lookup
      const allExercises = await workoutRepo.getExercises();
      const exMap: Record<string, Exercise> = {};
      for (const ex of allExercises) {
        exMap[ex.id] = ex;
      }
      setExerciseMap(exMap);

      // Load recent sessions (last 2 weeks worth)
      const sessions = await workoutRepo.getSessions(profile.id, 50);

      const curVolume = createEmptyVolumeRecord();
      const prevVolume = createEmptyVolumeRecord();
      const curSets = createEmptyVolumeRecord();
      let totalVol = 0;
      let totalSets = 0;

      for (const session of sessions) {
        if (!session.finishedAt) continue;
        const sessionDate = new Date(session.startedAt);
        const sessionDateStr = format(sessionDate, 'yyyy-MM-dd');
        const currentWeekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
        const currentWeekEndStr = format(currentWeekEnd, 'yyyy-MM-dd');
        const previousWeekStartStr = format(previousWeekStart, 'yyyy-MM-dd');
        const previousWeekEndStr = format(previousWeekEnd, 'yyyy-MM-dd');

        const isCurrentWeek = sessionDateStr >= currentWeekStartStr && sessionDateStr <= currentWeekEndStr;
        const isPreviousWeek = sessionDateStr >= previousWeekStartStr && sessionDateStr <= previousWeekEndStr;

        if (!isCurrentWeek && !isPreviousWeek) continue;

        const sets = await workoutRepo.getSetsForSession(session.id);

        // Group sets by exercise, then by muscle group
        for (const s of sets) {
          if (s.isWarmup || !s.weightKg || !s.reps) continue;
          const exercise = exMap[s.exerciseId];
          if (!exercise) continue;
          const mg = exercise.muscleGroup;
          const vol = (s.weightKg ?? 0) * (s.reps ?? 0);

          if (isCurrentWeek) {
            curVolume[mg] += vol;
            curSets[mg] += 1;
            totalVol += vol;
            totalSets += 1;
          } else if (isPreviousWeek) {
            prevVolume[mg] += vol;
          }
        }
      }

      setCurrentWeekVolume(curVolume);
      setPreviousWeekVolume(prevVolume);
      setCurrentWeekSets(curSets);
      setWeeklyTotalVolume(totalVol);
      setWeeklyTotalSets(totalSets);
    } catch {
      // silently fail
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      loadRoutines();
      loadVolumeAnalysis();
    }, [loadRoutines, loadVolumeAnalysis]),
  );

  // Trigger the flash sequence when a highlightRoutineId arrives and the
  // matching routine has loaded into state. Two-pulse pattern lasting
  // ~1.6 sec — visible enough to draw the eye without being jarring.
  useEffect(() => {
    if (!highlightRoutineId) return;
    if (!routines.some((r) => r.id === highlightRoutineId)) return;
    flashAnim.setValue(0);
    Animated.sequence([
      Animated.timing(flashAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: false,
      }),
      Animated.timing(flashAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: false,
      }),
      Animated.timing(flashAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: false,
      }),
      Animated.timing(flashAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: false,
      }),
    ]).start();
  }, [highlightRoutineId, routines, flashAnim]);

  const flashBgColor = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,0,0,0)', 'rgba(46,176,206,0.18)'],
  });

  const loadExercises = useCallback(async () => {
    try {
      let data: Exercise[];
      if (exerciseSearch.trim()) {
        data = await workoutRepo.searchExercises(exerciseSearch.trim());
      } else if (exerciseTypeFilter === 'strength' && exerciseFilter !== 'all') {
        data = await workoutRepo.getExercises(exerciseFilter as MuscleGroup);
      } else {
        data = await workoutRepo.getExercises();
      }
      // muscleGroup filter only applies to strength; cardio/sports/other are
      // all tagged as full_body, so we filter by exerciseType at the JS layer.
      data = data.filter((ex) => ex.exerciseType === exerciseTypeFilter);
      setRawExercises(data);
    } catch {
      // silently fail
    }
  }, [exerciseSearch, exerciseFilter, exerciseTypeFilter]);

  const displayExercises = useMemo(
    () => filterExercisesByEquipment(rawExercises, selectedEquipments),
    [rawExercises, selectedEquipments],
  );

  const toggleEquipment = useCallback((key: EquipmentKey) => {
    setSelectedEquipments((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }, []);

  const clearEquipments = useCallback(() => setSelectedEquipments([]), []);

  useEffect(() => {
    if (modalStage === 'picker') {
      loadExercises();
    }
  }, [modalStage, loadExercises]);

  const handleStartRoutine = async (routineId: string) => {
    if (!profile) return;
    try {
      const session = await workoutRepo.createSession(profile.id, routineId);
      router.push({
        pathname: '/(tabs)/training/session',
        params: { sessionId: session.id, routineId },
      });
    } catch {
      Alert.alert('エラー', 'セッションの開始に失敗しました');
    }
  };

  const handleFreeSession = async () => {
    if (!profile) return;
    try {
      const session = await workoutRepo.createSession(profile.id, null);
      router.push({
        pathname: '/(tabs)/training/session',
        params: { sessionId: session.id },
      });
    } catch {
      Alert.alert('エラー', 'セッションの開始に失敗しました');
    }
  };

  const handleAddExerciseToDraft = (exercise: Exercise) => {
    if (draftItems.some((d) => d.exercise.id === exercise.id)) return;
    setDraftItems((prev) => [
      ...prev,
      {
        exercise,
        targetSets: DEFAULT_TARGET_SETS,
        targetReps: DEFAULT_TARGET_REPS,
        setPattern: null,
        patternConfig: null,
      },
    ]);
    setModalStage('form');
  };

  // Build 15 / Feature 5-O — apply a preset to a draft item. The
  // preset overwrites target_sets / target_reps / pattern_config to the
  // preset defaults; manual edits to those fields after preset
  // selection are preserved (next preset selection will overwrite
  // again).
  const handleSelectPattern = (
    exerciseId: string,
    pattern: SetPattern | null,
  ) => {
    const preset = getPatternPreset(pattern);
    setDraftItems((prev) =>
      prev.map((d) =>
        d.exercise.id !== exerciseId
          ? d
          : {
              ...d,
              setPattern: preset.setPattern,
              patternConfig: preset.patternConfigJson,
              targetSets: preset.defaultTargetSets,
              targetReps: preset.defaultTargetReps,
            },
      ),
    );
  };

  const handleRemoveDraftItem = (exerciseId: string) => {
    setDraftItems((prev) => prev.filter((d) => d.exercise.id !== exerciseId));
  };

  const handleSaveRoutine = async () => {
    if (!profile || !routineName.trim() || draftItems.length === 0) return;
    try {
      await workoutRepo.createRoutine(
        profile.id,
        routineName.trim(),
        draftItems.map((d) => ({
          exerciseId: d.exercise.id,
          targetSets: d.targetSets,
          targetReps: d.targetReps,
          setPattern: d.setPattern,
          patternConfig: d.patternConfig,
        })),
      );
      setShowCreateModal(false);
      setRoutineName('');
      setDraftItems([]);
      loadRoutines();
    } catch {
      Alert.alert('エラー', 'ルーティンの保存に失敗しました');
    }
  };

  const handleDeleteRoutine = (routineId: string, name: string) => {
    Alert.alert('削除確認', `「${name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            await workoutRepo.deleteRoutine(routineId);
            loadRoutines();
          } catch {
            Alert.alert('エラー', '削除に失敗しました');
          }
        },
      },
    ]);
  };

  const muscleFilterSegments = [
    { label: '全て', value: 'all' },
    ...MUSCLE_GROUPS.map((mg) => ({ label: mg.nameJa, value: mg.id })),
  ];

  const hasVolumeData = Object.values(currentWeekVolume).some((v) => v > 0) ||
    Object.values(previousWeekVolume).some((v) => v > 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>トレーニング</Text>
          <View style={styles.headerActions}>
            <Button
              title="✨ AIメニュー"
              onPress={() => router.push('/(tabs)/training/ai-menu')}
              variant="ghost"
              size="sm"
            />
            <Button
              title="+ ルーティン作成"
              onPress={() => setShowCreateModal(true)}
              variant="ghost"
              size="sm"
            />
          </View>
        </View>

        {/* Free session button — disabled until profile hydrates so a
            cold-start tap before the store loads doesn't silently no-op
            (handleFreeSession early-returns on null profile). */}
        <TouchableOpacity
          style={[
            styles.freeSessionButton,
            { backgroundColor: colors.primary, opacity: profile ? 1 : 0.5 },
          ]}
          onPress={handleFreeSession}
          disabled={!profile}
          activeOpacity={0.7}
        >
          <Ionicons name="flash-outline" size={20} color="#FFFFFF" />
          <Text style={styles.freeSessionText}>
            {profile ? 'フリーセッション' : '読込中...'}
          </Text>
        </TouchableOpacity>

        {/* Routines */}
        {loading ? (
          <Card>
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>読み込み中...</Text>
          </Card>
        ) : routines.length === 0 ? (
          <Card>
            <View style={styles.emptyState}>
              <Ionicons name="barbell-outline" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
                ルーティンがありません
              </Text>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                「+ ルーティン作成」からトレーニングメニューを作成しましょう
              </Text>
            </View>
          </Card>
        ) : (
          routines.map((routine) => {
            const isHighlighted = routine.id === highlightRoutineId;
            return (
            <Animated.View
              key={routine.id}
              style={
                isHighlighted
                  ? { backgroundColor: flashBgColor, borderRadius: radius.md }
                  : undefined
              }
            >
            <Card>
              <View style={styles.routineRow}>
                <TouchableOpacity
                  style={styles.routineInfo}
                  onLongPress={() => handleDeleteRoutine(routine.id, routine.name)}
                >
                  <Text style={[styles.routineName, { color: colors.textPrimary }]}>
                    {routine.name}
                  </Text>
                  <Text style={[styles.routineMeta, { color: colors.textSecondary }]}>
                    {routine.items.length}種目
                  </Text>
                  <View style={styles.muscleGroupRow}>
                    {Array.from(new Set(routine.items.map((it) => it.exercise.muscleGroup))).map(
                      (mg) => (
                        <Badge
                          key={mg}
                          label={MUSCLE_GROUP_MAP[mg]?.nameJa ?? mg}
                          size="sm"
                        />
                      ),
                    )}
                  </View>
                </TouchableOpacity>
                <View style={styles.routineActions}>
                  <Button
                    title="開始"
                    onPress={() => handleStartRoutine(routine.id)}
                    variant="primary"
                    size="sm"
                  />
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </View>
              </View>
            </Card>
            </Animated.View>
            );
          })
        )}

        {/* History link */}
        <Card style={styles.historyLink}>
          <Button
            title="トレーニング履歴"
            onPress={() => router.push('/(tabs)/training/history')}
            variant="ghost"
            fullWidth
          />
        </Card>

        {/* Volume Analysis Section */}
        <Card>
          <View style={styles.analysisHeader}>
            <Ionicons name="analytics-outline" size={20} color={colors.primary} />
            <Text style={[styles.analysisTitleText, { color: colors.textPrimary }]}>
              分析
            </Text>
          </View>

          {hasVolumeData && (
            <View style={[styles.weeklyTotals, { borderBottomColor: colors.border }]}>
              <View style={styles.weeklyTotalItem}>
                <Text style={[styles.weeklyTotalLabel, { color: colors.textSecondary }]}>
                  今週の総ボリューム
                </Text>
                <Text style={[styles.weeklyTotalValue, { color: colors.textPrimary }]}>
                  {weeklyTotalVolume > 0 ? `${(weeklyTotalVolume / 1000).toFixed(1)}t` : '-'}
                </Text>
              </View>
              <View style={styles.weeklyTotalItem}>
                <Text style={[styles.weeklyTotalLabel, { color: colors.textSecondary }]}>
                  ワーキングセット数
                </Text>
                <Text style={[styles.weeklyTotalValue, { color: colors.textPrimary }]}>
                  {weeklyTotalSets > 0 ? `${weeklyTotalSets}セット` : '-'}
                </Text>
              </View>
            </View>
          )}

          <Text style={[styles.subSectionTitle, { color: colors.textSecondary }]}>
            部位別ボリューム（今週 vs 先週）
          </Text>

          <VolumeChart
            currentWeekVolume={currentWeekVolume}
            previousWeekVolume={previousWeekVolume}
            currentWeekSets={currentWeekSets}
          />
        </Card>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Create Routine Modal — single RNModal that swaps between
          the routine-form stage and the exercise-picker stage.
          Nested RNModals don't work on iOS (only one native modal can
          be presented at a time), so this stage swap is the fix for
          the "+ 種目を追加" button having no effect. */}
      <Modal
        visible={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setModalStage('form');
          setRoutineName('');
          setDraftItems([]);
        }}
        title={modalStage === 'form' ? 'ルーティン作成' : '種目を選択'}
      >
        {modalStage === 'form' ? (
        <View style={styles.modalContent}>
          <Input
            label="ルーティン名"
            value={routineName}
            onChangeText={setRoutineName}
            placeholder="例: 胸・三頭の日"
          />

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            種目一覧 ({draftItems.length}種目)
          </Text>

          {draftItems.map((item) => (
            <View
              key={item.exercise.id}
              style={[styles.draftItem, { borderBottomColor: colors.border }]}
            >
              <View style={styles.draftItemRow}>
                <View style={styles.draftItemInfo}>
                  <Text style={[styles.draftItemName, { color: colors.textPrimary }]}>
                    {item.exercise.nameJa}
                  </Text>
                  <Text style={[styles.draftItemMeta, { color: colors.textTertiary }]}>
                    {item.targetSets}セット / {item.targetReps}回
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveDraftItem(item.exercise.id)}>
                  <Ionicons name="close-circle" size={22} color={colors.error} />
                </TouchableOpacity>
              </View>
              {/* Build 15 / Feature 5-O — set pattern preset chips. Single
                  select; tapping a chip applies the preset's defaults
                  for target_sets / target_reps / pattern_config. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.patternChipScroll}
                contentContainerStyle={styles.patternChipContent}
              >
                {PATTERN_PRESETS.map((preset) => {
                  const selected = item.setPattern === preset.setPattern;
                  return (
                    <TouchableOpacity
                      key={preset.ja}
                      style={[
                        styles.patternChip,
                        {
                          backgroundColor: selected
                            ? colors.primary
                            : colors.surfaceSecondary,
                          borderRadius: radius.full,
                        },
                      ]}
                      onPress={() =>
                        handleSelectPattern(item.exercise.id, preset.setPattern)
                      }
                    >
                      <Text
                        style={[
                          styles.patternChipText,
                          {
                            color: selected ? '#FFFFFF' : colors.textSecondary,
                          },
                        ]}
                      >
                        {preset.ja}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ))}

          <Button
            title="+ 種目を追加"
            onPress={() => setModalStage('picker')}
            variant="outline"
            size="sm"
            fullWidth
          />

          <View style={styles.modalActions}>
            <Button
              title="キャンセル"
              onPress={() => {
                setShowCreateModal(false);
                setModalStage('form');
                setRoutineName('');
                setDraftItems([]);
              }}
              variant="ghost"
              size="md"
            />
            <Button
              title="保存"
              onPress={handleSaveRoutine}
              variant="primary"
              size="md"
              disabled={!routineName.trim() || draftItems.length === 0}
            />
          </View>
        </View>
        ) : (
        <KeyboardAvoidingView
          style={styles.exercisePickerContent}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
        >
          {/* Exercise type selector (strength / cardio / sports / other) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            keyboardShouldPersistTaps="handled"
          >
            {EXERCISE_TYPE_TABS.map((tab) => (
              <TouchableOpacity
                key={tab.value}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor:
                      exerciseTypeFilter === tab.value ? colors.primary : colors.surfaceSecondary,
                    borderRadius: radius.full,
                  },
                ]}
                onPress={() => {
                  setExerciseTypeFilter(tab.value);
                  // Reset muscle-group filter when switching to a non-strength
                  // type — it only applies to strength.
                  if (tab.value !== 'strength') setExerciseFilter('all');
                }}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: exerciseTypeFilter === tab.value ? '#FFFFFF' : colors.textSecondary,
                    },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Input
            placeholder="種目を検索..."
            value={exerciseSearch}
            onChangeText={setExerciseSearch}
          />

          {exerciseTypeFilter === 'strength' && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              keyboardShouldPersistTaps="handled"
            >
              {muscleFilterSegments.map((seg) => (
                <TouchableOpacity
                  key={seg.value}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor:
                        exerciseFilter === seg.value ? colors.primary : colors.surfaceSecondary,
                      borderRadius: radius.full,
                    },
                  ]}
                  onPress={() => setExerciseFilter(seg.value)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      {
                        color: exerciseFilter === seg.value ? '#FFFFFF' : colors.textSecondary,
                      },
                    ]}
                  >
                    {seg.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {exerciseTypeFilter === 'strength' && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              keyboardShouldPersistTaps="handled"
            >
              {EQUIPMENT_CATEGORIES.map((cat) => {
                const selected = selectedEquipments.includes(cat.key);
                return (
                  <TouchableOpacity
                    key={cat.key}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: selected ? colors.primary : colors.surfaceSecondary,
                        borderRadius: radius.full,
                      },
                    ]}
                    onPress={() => toggleEquipment(cat.key)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: selected ? '#FFFFFF' : colors.textSecondary },
                      ]}
                    >
                      {cat.ja}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {selectedEquipments.length > 0 && (
                <TouchableOpacity
                  style={[styles.filterChip, { borderRadius: radius.full }]}
                  onPress={clearEquipments}
                >
                  <Text style={[styles.filterChipText, { color: colors.textSecondary }]}>
                    クリア
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}

          <FlatList
            data={displayExercises}
            keyExtractor={(item) => item.id}
            style={styles.exerciseList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const alreadyAdded = draftItems.some((d) => d.exercise.id === item.id);
              const showMuscleBadge = item.exerciseType === 'strength';
              return (
                <TouchableOpacity
                  style={[styles.exerciseListItem, { borderBottomColor: colors.border }]}
                  onPress={() => !alreadyAdded && handleAddExerciseToDraft(item)}
                  disabled={alreadyAdded}
                  activeOpacity={0.7}
                >
                  <View style={styles.exerciseListItemInfo}>
                    <Text
                      style={[
                        styles.exerciseListItemName,
                        { color: alreadyAdded ? colors.textTertiary : colors.textPrimary },
                      ]}
                    >
                      {item.nameJa}
                    </Text>
                    {showMuscleBadge ? (
                      <Badge
                        label={MUSCLE_GROUP_MAP[item.muscleGroup]?.nameJa ?? item.muscleGroup}
                        size="sm"
                      />
                    ) : item.metValue != null ? (
                      <Badge label={`${item.metValue} MET`} size="sm" />
                    ) : null}
                  </View>
                  {alreadyAdded && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                種目が見つかりません
              </Text>
            }
          />
          <Button
            title="フォームに戻る"
            onPress={() => setModalStage('form')}
            variant="ghost"
            size="md"
            fullWidth
          />
        </KeyboardAvoidingView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxxl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { ...typography.titleLarge },
  freeSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  freeSessionText: {
    ...typography.labelLarge,
    color: '#FFFFFF',
  },
  routineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  routineInfo: { flex: 1, marginRight: spacing.md },
  routineActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  routineName: { ...typography.titleMedium },
  routineMeta: { ...typography.bodySmall, marginTop: spacing.xs },
  muscleGroupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  historyLink: { alignItems: 'center' },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyTitle: { ...typography.titleSmall },
  emptyText: { ...typography.bodySmall, textAlign: 'center' },
  // Analysis section
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  analysisTitleText: { ...typography.titleSmall },
  weeklyTotals: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: undefined,
  },
  weeklyTotalItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  weeklyTotalLabel: { ...typography.labelSmall },
  weeklyTotalValue: { ...typography.numberSmall },
  subSectionTitle: {
    ...typography.labelMedium,
    marginBottom: spacing.md,
  },
  bottomSpacer: { height: spacing.xxxl },
  // Modal styles
  modalContent: { gap: spacing.lg },
  sectionLabel: { ...typography.labelMedium, marginTop: spacing.sm },
  draftItem: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    gap: spacing.xs,
  },
  draftItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  draftItemInfo: { flex: 1 },
  draftItemName: { ...typography.bodyMedium },
  draftItemMeta: { ...typography.bodySmall },
  patternChipScroll: { flexGrow: 0 },
  patternChipContent: { gap: spacing.xs },
  patternChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  patternChipText: { ...typography.labelSmall, fontSize: 11 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  // Exercise picker styles
  exercisePickerContent: { gap: spacing.md, maxHeight: 400 },
  filterScroll: { flexGrow: 0 },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginRight: spacing.sm,
  },
  filterChipText: { ...typography.labelSmall },
  exerciseList: { maxHeight: 250 },
  exerciseListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
  },
  exerciseListItemInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  exerciseListItemName: { ...typography.bodyMedium },
});
