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
import { AdviceCard } from '../../../src/components/coach/AdviceCard';
import { RoutineGenerationCard } from '../../../src/components/training/RoutineGenerationCard';
import { useRoutineGenStore } from '../../../src/stores/routineGenStore';
import { useProfileStore } from '../../../src/stores/profileStore';
import { useSubscription } from '../../../src/hooks/useSubscription';
import { MUSCLE_GROUPS, MUSCLE_GROUP_MAP } from '../../../src/constants/muscleGroups';
import { EQUIPMENT_CATEGORIES, EquipmentKey } from '../../../src/constants/equipment';
import { DEFAULT_TARGET_SETS, DEFAULT_TARGET_REPS } from '../../../src/constants/defaults';
import { MuscleGroup } from '../../../src/types/common';
import { Exercise, ExerciseType, SetPattern, WorkoutRoutineWithItems, WorkoutSession, WorkoutSet } from '../../../src/types/workout';
import { PATTERN_PRESETS, getPatternPreset } from '../../../src/constants/setPatterns';
import { calculateSessionVolume, calculateWorkingSets } from '../../../src/domain/volume';
import * as workoutRepo from '../../../src/infra/repositories/workoutRepository';
// v1.5.2 Sprint 2 — starter templates + 決定論的部位提案 (新 AI call なし)。
import { WORKOUT_TEMPLATES, getWorkoutTemplateById, WorkoutTemplate } from '../../../src/constants/workoutTemplates';
import { getWorkoutSuggestion } from '../../../src/domain/workoutSuggestion';
import { WorkoutSuggestion } from '../../../src/types/workoutSuggestion';
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

  const sub = useSubscription();
  // Build 16 / Phase 5.2 — Pro-only periodization preset CTA. Plus
  // (and trial → Plus-equivalent) users don't see the button; they
  // get the AI menu + manual creation paths only.
  const periodizationUnlocked = sub.hasFeature('periodizationPresets');

  const [routines, setRoutines] = useState<WorkoutRoutineWithItems[]>([]);
  // v1.5.2 Sprint 2 — 決定論的な「次に鍛える部位」提案 (getWorkoutSuggestion、
  // ホームと同じ、新 AI call なし)。記録あり時のみ「今日のおすすめ」に反映。
  const [suggestion, setSuggestion] = useState<WorkoutSuggestion | null>(null);
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
  // Audit C-12 — in-flight guards so a double-tap before navigation /
  // modal-close cannot create duplicate workout_sessions or a duplicate
  // routine. Refs (not state) because we only need synchronous re-entry
  // protection, not a re-render.
  const startingSessionRef = useRef(false);
  const savingRoutineRef = useRef(false);
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

  // Phase 1.5 Codex round 1 Important #2 fix — subscribe to the
  // routine-generation store's `lastAppliedAt` so a successful
  // Apply from the inline RoutineGenerationCard re-fetches the
  // routine list immediately (vs. only on next focus event).
  const lastAppliedAt = useRoutineGenStore((s) => s.lastAppliedAt);
  useEffect(() => {
    if (!lastAppliedAt || !profile) return;
    void loadRoutines();
  }, [lastAppliedAt, profile, loadRoutines]);

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

  const loadSuggestion = useCallback(async () => {
    if (!profile) return;
    try {
      setSuggestion(await getWorkoutSuggestion(profile.id));
    } catch {
      setSuggestion(null);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      loadRoutines();
      loadVolumeAnalysis();
      loadSuggestion();
    }, [loadRoutines, loadVolumeAnalysis, loadSuggestion]),
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
    if (!profile || startingSessionRef.current) return;
    startingSessionRef.current = true;
    try {
      const session = await workoutRepo.createSession(profile.id, routineId);
      router.push({
        pathname: '/(tabs)/training/session',
        params: { sessionId: session.id, routineId },
      });
    } catch {
      Alert.alert('エラー', 'セッションの開始に失敗しました');
    } finally {
      startingSessionRef.current = false;
    }
  };

  const handleFreeSession = async () => {
    if (!profile || startingSessionRef.current) return;
    startingSessionRef.current = true;
    try {
      const session = await workoutRepo.createSession(profile.id, null);
      router.push({
        pathname: '/(tabs)/training/session',
        params: { sessionId: session.id },
      });
    } catch {
      Alert.alert('エラー', 'セッションの開始に失敗しました');
    } finally {
      startingSessionRef.current = false;
    }
  };

  // v1.5.2 Sprint 2 — スターターテンプレから ephemeral にセッション開始
  // (保存せず: createSession(profile.id, null) → session が templateId を読む)。
  const handleStartTemplate = async (template: WorkoutTemplate) => {
    if (!profile || startingSessionRef.current) return;
    startingSessionRef.current = true;
    try {
      const session = await workoutRepo.createSession(profile.id, null);
      router.push({
        pathname: '/(tabs)/training/session',
        params: { sessionId: session.id, templateId: template.id },
      });
    } catch {
      Alert.alert('エラー', 'セッションの開始に失敗しました');
    } finally {
      startingSessionRef.current = false;
    }
  };

  // 「今日のおすすめ」テンプレ。提案部位 (getWorkoutSuggestion・決定論) があれば
  // それに寄せ、なければ初心者向けの自宅全身を既定に (新 AI call なし)。
  const recommendedTemplate: WorkoutTemplate = useMemo(() => {
    const groups = suggestion?.suggestedMuscleGroups ?? [];
    if (groups.includes('legs')) {
      return getWorkoutTemplateById('tpl_leg_day') ?? WORKOUT_TEMPLATES[0];
    }
    if (groups.some((g) => g === 'chest' || g === 'back' || g === 'shoulders' || g === 'arms')) {
      return getWorkoutTemplateById('tpl_upper_body') ?? WORKOUT_TEMPLATES[0];
    }
    return getWorkoutTemplateById('tpl_home_fullbody_15') ?? WORKOUT_TEMPLATES[0];
  }, [suggestion]);

  const hasTrainingHistory = (suggestion?.recoveryStatuses ?? []).some(
    (s) => s.lastTrainedDate !== null,
  );

  // 休息日: 記録があり、回復エンジンが「全身疲労 = 休息」と判定した状態
  // (suggestedMuscleGroups が空)。この日は full-body を主 CTA で押し付けず、
  // 休息メッセージ + 軽めの任意導線にする (Codex Important: 推奨と CTA の矛盾防止)。
  const isRestDay =
    hasTrainingHistory && (suggestion?.suggestedMuscleGroups.length ?? 0) === 0;

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
    if (savingRoutineRef.current) return;
    savingRoutineRef.current = true;
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
    } finally {
      savingRoutineRef.current = false;
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
        {/* Phase E-1 / Issue 2 fix — header 3-button overflow 解消.
            v1.3.0 build 20 TestFlight dogfood で training/index.tsx の
            ヘッダー右側 3 buttons (AIメニュー + ピリオダイゼーション +
            ルーティン作成) が narrow phone (iPhone SE 等) で右端
            overflow trip。

            Visual hierarchy 採用 (Recon §J Option (a)):
              プライマリ 2: AIメニュー + ルーティン作成 (text+emoji label)
              セカンダリ 1: ピリオダイゼーション (icon-only IconButton、
                            Pro tier gating 維持、 accessibilityLabel で
                            読み上げ確保)

            行を分けて折り返し (flexWrap) する代わりに、 ピリオダイ
            ゼーションを icon-only にすることで 3-button を 1 行内に
            収める + Pro tier 機能の visual distinction も保つ. */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            トレーニング
          </Text>
          <View style={styles.headerActions}>
            {periodizationUnlocked && (
              <TouchableOpacity
                style={[
                  styles.headerIconBtn,
                  { backgroundColor: colors.pro + '15' },
                ]}
                onPress={() =>
                  router.push('/(tabs)/training/periodization-presets')
                }
                accessibilityRole="button"
                accessibilityLabel="ピリオダイゼーション"
              >
                <Ionicons name="calendar" size={18} color={colors.proDark} />
              </TouchableOpacity>
            )}
            <Button
              title="✨ AIメニュー"
              onPress={() => router.push('/(tabs)/training/ai-menu')}
              variant="ghost"
              size="sm"
            />
            <Button
              title="+ ルーティン"
              onPress={() => setShowCreateModal(true)}
              variant="ghost"
              size="sm"
            />
          </View>
        </View>

        {/* v1.5.2 Sprint 2 — 今日のおすすめ (最上部・主 CTA)。記録があれば
            getWorkoutSuggestion の決定論的な部位提案を文脈表示。 */}
        <Card variant="elevated" style={{ backgroundColor: colors.primary + '0D' }}>
          <Text style={[styles.recLabel, { color: colors.primary }]}>今日のおすすめ</Text>
          {hasTrainingHistory && suggestion?.reason ? (
            <Text style={[styles.recReason, { color: colors.textSecondary }]}>
              {suggestion.reason}
            </Text>
          ) : null}
          {isRestDay ? (
            <>
              <Text style={[styles.recMeta, { color: colors.textSecondary }]}>
                無理のない範囲で。軽く動かしたいときは下のメニューからどうぞ。
              </Text>
              <Button
                title="軽めに動かす（有酸素）"
                onPress={() =>
                  handleStartTemplate(
                    getWorkoutTemplateById('tpl_cardio_fatloss') ?? recommendedTemplate,
                  )
                }
                variant="outline"
                fullWidth
                disabled={!profile}
              />
            </>
          ) : (
            <>
              <Text style={[styles.recName, { color: colors.textPrimary }]}>
                {recommendedTemplate.name}
              </Text>
              <Text style={[styles.recMeta, { color: colors.textSecondary }]}>
                {recommendedTemplate.description} ・ 約{recommendedTemplate.durationMin}分 ・ {recommendedTemplate.equipmentLabel}
              </Text>
              <Button
                title="このメニューで始める"
                onPress={() => handleStartTemplate(recommendedTemplate)}
                variant="primary"
                fullWidth
                disabled={!profile}
              />
            </>
          )}
        </Card>

        {/* まずはここから — スターターテンプレ横スクロール */}
        <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>まずはここから</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.templateScroll}
        >
          {WORKOUT_TEMPLATES.map((t) => (
            <View
              key={t.id}
              style={[styles.tplCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons
                name={t.icon as keyof typeof Ionicons.glyphMap}
                size={22}
                color={colors.primary}
              />
              <Text style={[styles.tplName, { color: colors.textPrimary }]} numberOfLines={2}>
                {t.name}
              </Text>
              <Text style={[styles.tplMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                約{t.durationMin}分 ・ {t.equipmentLabel}
              </Text>
              <Button
                title="始める"
                onPress={() => handleStartTemplate(t)}
                variant="outline"
                size="sm"
                disabled={!profile}
              />
            </View>
          ))}
        </ScrollView>

        {/* クイック開始 — フリーセッション (副) + AIに作ってもらう (選択式既存) */}
        <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>クイック開始</Text>
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={[styles.quickBtn, { borderColor: colors.border, backgroundColor: colors.surface, opacity: profile ? 1 : 0.5 }]}
            onPress={handleFreeSession}
            disabled={!profile}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="フリーセッション"
          >
            <Ionicons name="flash-outline" size={20} color={colors.primary} />
            <Text style={[styles.quickBtnText, { color: colors.primary }]}>フリーセッション</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => router.push('/(tabs)/training/ai-menu')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="AIに作ってもらう"
          >
            <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
            <Text style={[styles.quickBtnText, { color: colors.primary }]}>AIに作ってもらう</Text>
          </TouchableOpacity>
        </View>

        {/* マイルーティン */}
        <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>マイルーティン</Text>

        {/* Routines */}
        {loading ? (
          <Card>
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>読み込み中...</Text>
          </Card>
        ) : routines.length === 0 ? (
          <Card>
            <View style={styles.emptyState}>
              {/* v1.5.2 Sprint 2 — 「ルーティンがありません」を最上部に出さず、
                  calm な 1 行 + 作成導線に降格 (テンプレ/AI/自作)。 */}
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                まだ保存したルーティンがありません。テンプレや AI 作成から保存できます。
              </Text>
              <View style={styles.emptyCtaRow}>
                <Button
                  title="テンプレートから"
                  onPress={() => handleStartTemplate(recommendedTemplate)}
                  variant="outline"
                  size="sm"
                  disabled={!profile}
                />
                <Button
                  title="AIに作ってもらう"
                  onPress={() => router.push('/(tabs)/training/ai-menu')}
                  variant="outline"
                  size="sm"
                />
                <Button
                  title="自分で作る"
                  onPress={() => setShowCreateModal(true)}
                  variant="outline"
                  size="sm"
                />
              </View>
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

        {/* History link — S2-F: 週リスト (履歴) と月間カレンダーの 2 導線 */}
        <Card style={styles.historyLink}>
          <View style={styles.historyLinkRow}>
            <View style={styles.historyLinkBtn}>
              <Button
                title="トレーニング履歴"
                onPress={() => router.push('/(tabs)/training/history')}
                variant="ghost"
                fullWidth
              />
            </View>
            <View style={styles.historyLinkBtn}>
              <Button
                title="カレンダー"
                onPress={() => router.push('/(tabs)/training/calendar')}
                variant="ghost"
                fullWidth
                icon={<Ionicons name="calendar-outline" size={16} color={colors.primary} />}
              />
            </View>
          </View>
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

          {/* v1.5.2 Sprint 2 — データなし時は控えめに (突き放さない)。 */}
          {hasVolumeData ? (
            <>
              <Text style={[styles.subSectionTitle, { color: colors.textSecondary }]}>
                部位別ボリューム（今週 vs 先週）
              </Text>
              <VolumeChart
                currentWeekVolume={currentWeekVolume}
                previousWeekVolume={previousWeekVolume}
                currentWeekSets={currentWeekSets}
              />
            </>
          ) : (
            <Text style={[styles.analysisHint, { color: colors.textTertiary }]}>
              1回記録すると部位別ボリュームが表示されます
            </Text>
          )}
        </Card>

        {/* v1.5 Stage 1 Phase 1.4 — weekly coach advice card
            (ミー先生). Lazy on-mount fetch; Plus+ sees live
            content, Free sees a placeholder + ProInlineCTA. */}
        <AdviceCard scope="weekly" />

        {/* v1.5 Stage 1 Phase 1.5 — routine generation card
            (ミー先生). Plus/Pro can type a free-text intent +
            generate a single routine to apply; Free sees a
            ProInlineCTA. Sits below the weekly advice so the
            "what" (insight) precedes the "how" (action). */}
        <RoutineGenerationCard />

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
  // Phase E-1 / Issue 2 hardening (Codex pass 1 Sign-off) — iPhone SE
  // (320pt) width budget は 36pt icon + 2 ghost buttons (各 ~80pt) +
  // title (~80pt) + gaps + padding でほぼ満タン、 flexShrink/flexWrap
  // fallback なしでは narrow phone で依然 overflow risk あり。
  // header に flexWrap='wrap' + gap、 title に flexShrink=0 を追加して
  // actions row が必要時に第二段へ折り返す安全網を確立。 通常 width で
  // は 1-row 内収まり、 narrow phone のみ 2-row になる graceful
  // degradation.
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  // Phase E-1 / Issue 2 fix — ピリオダイゼーション icon-only button.
  // Pro tier gating の visual signal は colors.pro + '15' bg + proDark
  // icon (Phase A-1 contrast-tier の application).
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.titleLarge, flexShrink: 0 },
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
  historyLinkRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  historyLinkBtn: { flex: 1 },
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
  // v1.5.2 Sprint 2 redesign styles
  recLabel: { ...typography.labelMedium, fontWeight: '700' },
  recReason: { ...typography.bodySmall, marginTop: 2 },
  recName: { ...typography.titleMedium, fontWeight: '700', marginTop: spacing.xs },
  recMeta: { ...typography.bodySmall, marginTop: 2, marginBottom: spacing.md },
  sectionHeading: {
    ...typography.titleSmall,
    fontWeight: '700',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  templateScroll: { gap: spacing.sm, paddingRight: spacing.lg, paddingBottom: spacing.xs },
  tplCard: {
    width: 160,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  tplName: { ...typography.bodyMedium, fontWeight: '600', minHeight: 38 },
  tplMeta: { ...typography.labelSmall, marginBottom: spacing.xs },
  quickRow: { flexDirection: 'row', gap: spacing.sm },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  quickBtnText: { ...typography.labelMedium, fontWeight: '600' },
  emptyCtaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  analysisHint: { ...typography.bodySmall, marginTop: spacing.sm },
});
