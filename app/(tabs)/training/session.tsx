import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  FlatList,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, Button, Badge, ProgressBar, BottomSheet, Modal, Input } from '../../../src/components/ui';
import { useWorkoutStore, ExerciseInSession, SetInSession } from '../../../src/stores/workoutStore';
import { useProfileStore } from '../../../src/stores/profileStore';
import { useRestTimer } from '../../../src/hooks/useRestTimer';
import { MUSCLE_GROUPS, MUSCLE_GROUP_MAP } from '../../../src/constants/muscleGroups';
import { EQUIPMENT_CATEGORIES, EquipmentKey } from '../../../src/constants/equipment';
import { MuscleGroup } from '../../../src/types/common';
import { Exercise, ExerciseType, SetPattern, SetType, WorkoutSet } from '../../../src/types/workout';
import { filterExercisesByEquipment } from '../../../src/utils/filterExercisesByEquipment';
import {
  parseDropSetConfig,
  parseTopSetConfig,
  SET_TYPE_COLORS,
  SET_TYPE_LABELS_JA,
} from '../../../src/constants/setPatterns';
import { recommendNextSet } from '../../../src/domain/workoutRecommendation';
import { parseTargetReps } from '../../../src/utils/parseTargetReps';
import { getCurrentE1RM } from '../../../src/infra/repositories/oneRepMaxRepository';
import { generateId } from '../../../src/utils/id';
import { getISODate } from '../../../src/utils/format';
import * as workoutRepo from '../../../src/infra/repositories/workoutRepository';
import { createNote } from '../../../src/infra/repositories/noteRepository';
import { calculateWorkoutCalories } from '../../../src/domain/calories';
import { calculateCaloriesBurned } from '../../../src/domain/cardioCalories';
import { estimateOneRepMax } from '../../../src/domain/oneRepMax';
import { checkAndRecordCardioPRs, checkAndRecordPRs, checkSessionVolumePR } from '../../../src/domain/personalRecord';
import { restTimerService, loadRestTimerSettings } from '../../../src/infra/services/restTimerService';
import { RestTimerOverlay } from '../../../src/components/training/RestTimerOverlay';
import { PRCelebrationToast } from '../../../src/components/training/PRCelebrationToast';
import { PlateCalculatorModal } from '../../../src/components/training/PlateCalculatorModal';
import { DecimalInput } from '../../../src/components/training/DecimalInput';
import { PRInfo } from '../../../src/types/personalRecord';
import { RestTimerSettings, DEFAULT_REST_TIMER_SETTINGS } from '../../../src/types/restTimer';
import { canUse } from '../../../src/infra/services/subscriptionService';

const EXERCISE_TYPE_TABS: { label: string; value: ExerciseType }[] = [
  { label: '筋トレ', value: 'strength' },
  { label: '有酸素', value: 'cardio' },
  { label: 'スポーツ', value: 'sports' },
  { label: 'その他', value: 'other' },
];

const SET_TYPE_OVERRIDE_OPTIONS: SetType[] = [
  'warmup',
  'working',
  'top',
  'drop',
  'failure',
];

// Build 15 / Feature 5-O — translate a routine_item's pattern + config
// into a fully-formed initial set list. Pre-v26 routines (setPattern =
// null) get the legacy flat list. Pattern presets pre-fill the per-set
// setType so the session UI renders the right shape immediately.
//
// Pre-fill weights are best-effort: we copy from previousSets when a
// matching slot exists (mirrors the legacy behavior). Pattern-driven
// weight cascades (top → backoff, working → drop) are applied
// reactively via applyPatternCascade when the user commits the
// driving slot's weight.
function buildInitialSets(args: {
  pattern: SetPattern | null;
  patternConfig: string | null;
  targetSets: number;
  previousSets: WorkoutSet[];
}): SetInSession[] {
  const { pattern, patternConfig, targetSets, previousSets } = args;
  const baseSlot = (i: number, setType: SetType): SetInSession => ({
    id: generateId(),
    setNumber: i + 1,
    weightKg: previousSets[i]?.weightKg ?? null,
    reps: previousSets[i]?.reps ?? null,
    rpe: null,
    durationMinutes: previousSets[i]?.durationMinutes ?? null,
    distanceKm: previousSets[i]?.distanceKm ?? null,
    caloriesBurned: null,
    perceivedIntensity: previousSets[i]?.perceivedIntensity ?? null,
    completed: false,
    setType,
  });

  if (pattern === '5x5') {
    return Array.from({ length: 5 }, (_, i) => baseSlot(i, 'working'));
  }

  if (pattern === 'top_set') {
    const cfg = parseTopSetConfig(patternConfig);
    const backoffCount = cfg?.backoff_sets ?? 3;
    const slots: SetInSession[] = [];
    slots.push(baseSlot(0, 'top'));
    for (let i = 0; i < backoffCount; i++) {
      slots.push(baseSlot(i + 1, 'working'));
    }
    return slots;
  }

  if (pattern === 'drop_set') {
    const cfg = parseDropSetConfig(patternConfig);
    const dropCount = cfg?.drops ?? 3;
    const slots: SetInSession[] = [];
    slots.push(baseSlot(0, 'working'));
    for (let i = 0; i < dropCount; i++) {
      slots.push(baseSlot(i + 1, 'drop'));
    }
    return slots;
  }

  // Standard / null pattern → flat 'working' list of length targetSets.
  return Array.from({ length: targetSets }, (_, i) => baseSlot(i, 'working'));
}

// Build 15 / Feature 5-O — derive cascaded weights for pattern-driven
// rows when the user commits the driving slot's weight.
//
// top_set: the first 'top' slot drives subsequent 'working' (backoff)
//   slots at top × backoff_pct.
// drop_set: the first 'working' slot drives subsequent 'drop' slots at
//   working × percents[i] (in order).
// other patterns: returns null (no cascade).
//
// The caller applies the returned updates by calling updateSet for
// each entry. Slots already manually edited stay as-is; cascade only
// fills slots that are downstream of the source.
function computePatternCascade(
  exercise: ExerciseInSession,
  sourceSet: SetInSession,
  sourceWeight: number,
): { setId: string; weightKg: number }[] | null {
  const { setPattern, patternConfig, sets } = exercise;
  if (sourceWeight <= 0) return null;
  const sourceIndex = sets.findIndex((s) => s.id === sourceSet.id);
  if (sourceIndex < 0) return null;

  if (setPattern === 'top_set' && sourceSet.setType === 'top') {
    const cfg = parseTopSetConfig(patternConfig);
    const pct = cfg?.backoff_pct ?? 0.8;
    const target = Math.round(sourceWeight * pct * 10) / 10;
    return sets
      .slice(sourceIndex + 1)
      .filter((s) => s.setType === 'working')
      .map((s) => ({ setId: s.id, weightKg: target }));
  }

  if (setPattern === 'drop_set' && sourceSet.setType === 'working') {
    const cfg = parseDropSetConfig(patternConfig);
    const percents = cfg?.percents ?? [0.8, 0.6, 0.4];
    const dropSlots = sets
      .slice(sourceIndex + 1)
      .filter((s) => s.setType === 'drop');
    return dropSlots.slice(0, percents.length).map((s, idx) => ({
      setId: s.id,
      weightKg: Math.round(sourceWeight * percents[idx] * 10) / 10,
    }));
  }

  return null;
}

// Build 15 / Feature 5-C — Easy/Normal/Hard chip strip rendered below
// each uncompleted working set row. Computes the recommendation lazily
// (useMemo) and skips render entirely when there's no e1rm yet or no
// parseable target_reps. The hint copy steers first-time users toward
// logging a working set so the engine has data to work with.
//
// Phase 9.1 — when `gated` is true (Free tier without trial), the
// chip strip + first-time hint are both replaced by an inline
// upgrade prompt. Tapping it routes to /(tabs)/settings/subscription
// (existing RevenueCat-backed paywall surface). The strip still only
// renders on uncompleted working sets when a routine target exists,
// so free-form sessions stay banner-free.
const RecommendationStrip = React.memo(function RecommendationStrip(props: {
  e1rm: number | null;
  targetRepsRaw: string | null;
  plateStep: number;
  onApply: (weightKg: number, reps: number) => void;
  colors: ReturnType<typeof getColors>;
  gated: boolean;
}) {
  const { e1rm, targetRepsRaw, plateStep, onApply, colors, gated } = props;
  const parsedTarget = useMemo(() => parseTargetReps(targetRepsRaw), [targetRepsRaw]);
  const recommendation = useMemo(
    () => recommendNextSet(e1rm, parsedTarget, 2, plateStep),
    [e1rm, parsedTarget, plateStep],
  );

  if (gated) {
    // Skip the upgrade banner on free-form sessions (no routine
    // target → no recommendation context anyway, so nothing to gate).
    if (parsedTarget == null) return null;
    return (
      <TouchableOpacity
        style={[
          styles.recommendUpgradeWrap,
          { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md },
        ]}
        onPress={() => router.push('/(tabs)/settings/subscription')}
        activeOpacity={0.6}
        accessibilityRole="button"
      >
        <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
        <Text style={[styles.recommendUpgradeText, { color: colors.textSecondary }]}>
          Plus にアップグレードで重量推奨が使えます
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
      </TouchableOpacity>
    );
  }

  // Hint when there's literally no observation yet. Shown only when a
  // routine target exists — free-form sessions (target null) get no
  // strip and no hint, matching the legacy zero-state.
  if (recommendation === null) {
    if (e1rm == null && parsedTarget != null) {
      return (
        <View style={styles.recommendStripHintWrap}>
          <Text style={[styles.recommendHintText, { color: colors.textTertiary }]}>
            1セット記録すると次回から重量が推奨されます
          </Text>
        </View>
      );
    }
    return null;
  }

  const chips: { kind: 'easy' | 'normal' | 'hard'; label: string }[] = [
    { kind: 'easy', label: 'Easy' },
    { kind: 'normal', label: 'Normal' },
    { kind: 'hard', label: 'Hard' },
  ];

  return (
    <View style={styles.recommendStripRow}>
      {chips.map(({ kind, label }) => {
        const r = recommendation[kind];
        return (
          <TouchableOpacity
            key={kind}
            style={[
              styles.recommendChip,
              {
                backgroundColor: colors.surfaceSecondary,
                borderColor: colors.border,
                borderRadius: radius.full,
              },
            ]}
            onPress={() => onApply(r.weight, r.reps)}
            activeOpacity={0.6}
          >
            <Text style={[styles.recommendChipLabel, { color: colors.textTertiary }]}>
              {label}
            </Text>
            <Text style={[styles.recommendChipWeight, { color: colors.textPrimary }]}>
              {r.weight}kg × {r.reps}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

export default function SessionScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const params = useLocalSearchParams<{ sessionId: string; routineId?: string }>();
  const profile = useProfileStore((s) => s.profile);

  const {
    sessionId,
    exercises,
    startSession,
    endSession,
    addExercise,
    removeExercise,
    addSetToExercise,
    updateSet,
    completeSet,
    copyPreviousSets,
  } = useWorkoutStore();

  const restTimer = useRestTimer();
  const prevTimerRunning = useRef(restTimer.isRunning);

  // Phase 9.1 — gate the chip strip to Plus/Pro. Computed once per
  // render so the per-set RecommendationStrip doesn't re-evaluate
  // canUse() in a hot loop. canUse already returns true unconditionally
  // in __DEV__, so dev builds keep showing chips for visual debugging.
  const recommendationGated = !canUse('oneRepMaxRecommendation');

  // Rest timer overlay state (Feature D)
  const [restTimerSettings, setRestTimerSettings] = useState<RestTimerSettings>(DEFAULT_REST_TIMER_SETTINGS);
  const [restOverlayVisible, setRestOverlayVisible] = useState(false);

  useEffect(() => {
    loadRestTimerSettings().then(setRestTimerSettings).catch(() => {});
  }, []);

  // PR celebration state (Feature E)
  const [prToasts, setPrToasts] = useState<PRInfo[]>([]);

  // Plate calculator state (Feature G)
  const [plateCalcFor, setPlateCalcFor] = useState<{ exerciseId: string; setId: string; initial: number } | null>(null);
  // Build 15 / Feature 5-O — per-set role override sheet target.
  // Setting this opens the bottom sheet; null = closed.
  const [overrideTarget, setOverrideTarget] = useState<{
    exerciseId: string;
    setId: string;
    current: SetType;
  } | null>(null);

  // Build 15 / Feature 5-C — current e1rm per exercise. Refetched on
  // screen focus and after any successful set save (handleCompleteSet
  // success path) so the chip strip reflects the just-inserted
  // observation. Stored as a flat record keyed by exerciseId; null
  // means "no e1rm yet" → chip strip hides, hint shows.
  const [e1rmByExercise, setE1rmByExercise] = useState<Record<string, number | null>>({});

  const refetchE1rmMap = useCallback(async () => {
    if (!profile) return;
    const ids = useWorkoutStore.getState().exercises.map((e) => e.exerciseId);
    if (ids.length === 0) {
      setE1rmByExercise({});
      return;
    }
    const map: Record<string, number | null> = {};
    for (const id of ids) {
      try {
        const obs = await getCurrentE1RM(profile.id, id);
        map[id] = obs?.e1rmKg ?? null;
      } catch {
        map[id] = null;
      }
    }
    setE1rmByExercise(map);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void refetchE1rmMap();
    }, [refetchE1rmMap]),
  );

  // Elapsed time
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Add exercise sheet
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [exerciseFilter, setExerciseFilter] = useState<string>('all');
  const [exerciseTypeFilter, setExerciseTypeFilter] = useState<ExerciseType>('strength');
  const [rawExercises, setRawExercises] = useState<Exercise[]>([]);
  // Equipment chip filter (Build 15 / Feature 5-P). Multi-select OR within
  // the chip row; empty selection = no filter. Lives in useMemo (NOT in
  // loadExercises deps) so chip toggle is instant in-memory and never
  // triggers a SQL refetch.
  const [selectedEquipments, setSelectedEquipments] = useState<EquipmentKey[]>([]);

  // Expandable detail rows: key = `${exerciseId}_${setId}`
  const [expandedSets, setExpandedSets] = useState<Record<string, boolean>>({});

  // Custom exercise creation modal
  const [showCustomExerciseModal, setShowCustomExerciseModal] = useState(false);
  const [customExerciseName, setCustomExerciseName] = useState('');
  const [customExerciseMuscle, setCustomExerciseMuscle] = useState<MuscleGroup>('chest');
  const [customExerciseEquipment, setCustomExerciseEquipment] = useState('');

  // Finish confirmation
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [sessionNote, setSessionNote] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);

  // Summary
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<{
    duration: number;
    totalVolume: number;
    exerciseCount: number;
    setCount: number;
    estimatedCalories: number;
  } | null>(null);

  // Summary memo
  const [summaryMemo, setSummaryMemo] = useState('');

  // Initialize session
  useEffect(() => {
    if (!params.sessionId || sessionId === params.sessionId) return;

    const init = async () => {
      startSession(params.sessionId, params.routineId ?? null);

      // If from a routine, load routine exercises and previous sets
      if (params.routineId && profile) {
        try {
          const routines = await workoutRepo.getRoutines(profile.id);
          const routine = routines.find((r) => r.id === params.routineId);
          if (routine) {
            for (const item of routine.items) {
              const previousSets = await workoutRepo.getPreviousSets(
                profile.id,
                item.exerciseId,
              );

              const initialSets = buildInitialSets({
                pattern: item.setPattern,
                patternConfig: item.patternConfig,
                targetSets: item.targetSets,
                previousSets,
              });
              // Pattern slots renumber sequentially regardless of count
              // so the user-visible "1, 2, 3..." stays in step with the
              // visible slot order.
              initialSets.forEach((s, idx) => {
                s.setNumber = idx + 1;
              });

              const exerciseInSession: ExerciseInSession = {
                exerciseId: item.exerciseId,
                exerciseName: item.exercise.nameJa,
                muscleGroup: item.exercise.muscleGroup,
                exerciseType: item.exercise.exerciseType,
                metValue: item.exercise.metValue,
                sets: initialSets,
                previousSets,
                setPattern: item.setPattern,
                patternConfig: item.patternConfig,
                targetReps: item.targetReps,
              };

              useWorkoutStore.getState().addExercise(exerciseInSession);
            }
          }
        } catch {
          // silently fail
        }
      }
    };

    init();
  }, [params.sessionId]);

  // Elapsed timer
  useEffect(() => {
    elapsedInterval.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      if (elapsedInterval.current) {
        clearInterval(elapsedInterval.current);
      }
    };
  }, []);

  // Haptic feedback when rest timer finishes
  useEffect(() => {
    if (prevTimerRunning.current && !restTimer.isRunning && restTimer.remainingSeconds === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    prevTimerRunning.current = restTimer.isRunning;
  }, [restTimer.isRunning, restTimer.remainingSeconds]);

  // Load exercises for picker
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
    if (showAddExercise) {
      loadExercises();
    }
  }, [showAddExercise, loadExercises]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleCompleteSet = async (exerciseId: string, set: SetInSession) => {
    if (set.completed || !params.sessionId) return;

    const ex = exercises.find((e) => e.exerciseId === exerciseId);
    const isStrength = !ex || ex.exerciseType === 'strength';

    // For cardio/sports/other: auto-compute kcal from MET when user hasn't
    // overridden it. Falls back to null when MET or weight is unknown.
    const kcalToSave =
      !isStrength
        ? set.caloriesBurned ??
          calculateCaloriesBurned(
            ex?.metValue ?? null,
            profile?.currentWeightKg ?? null,
            set.durationMinutes,
          )
        : null;

    // Save to DB
    try {
      await workoutRepo.addSet(params.sessionId, {
        exerciseId,
        setNumber: set.setNumber,
        weightKg: set.weightKg,
        reps: set.reps,
        rpe: set.rpe,
        durationMinutes: set.durationMinutes,
        distanceKm: set.distanceKm,
        caloriesBurned: kcalToSave,
        perceivedIntensity: set.perceivedIntensity,
        // Build 15 / Feature 5-O — pass the per-set role through to
        // workout_sets.set_type. Defaults to 'working' for sets created
        // before pattern UI is wired in Phase 5.
        setType: set.setType,
        // Keep isWarmup in sync for the legacy boolean column. addSet
        // derives set_type from isWarmup if setType is omitted; passing
        // both keeps the columns aligned for any reader that still
        // checks is_warmup directly (e.g. cardio totals filter).
        isWarmup: set.setType === 'warmup',
      });
    } catch {
      Alert.alert('エラー', 'セットの保存に失敗しました');
      return;
    }

    completeSet(exerciseId, set.id);

    // Haptic feedback on set completion
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Build 15 / Feature 5-C — addSet's hook may have appended a fresh
    // estimated_1rm observation (Phase 3 raw + adjusted rows). Refetch
    // the e1rm map so the chip strip on subsequent uncompleted sets
    // reflects the latest current e1rm without waiting for a screen
    // focus event.
    void refetchE1rmMap();

    // Check for PRs (Feature E). Strength tracks 1RM/weight/reps-at-weight;
    // cardio/sports/other tracks duration/distance/kcal.
    if (
      isStrength &&
      profile &&
      set.weightKg != null &&
      set.reps != null &&
      set.weightKg > 0 &&
      set.reps > 0
    ) {
      try {
        const prs = await checkAndRecordPRs(
          profile.id,
          exerciseId,
          set.weightKg,
          set.reps,
          params.sessionId
        );
        const filtered = canUse('prAllTypes')
          ? prs
          : prs.filter((p) => p.recordType === 'estimated_1rm');
        if (filtered.length > 0) {
          setPrToasts(filtered);
        }
      } catch {
        // PR tracking failure should not block the set save
      }
    } else if (!isStrength && profile) {
      try {
        const prs = await checkAndRecordCardioPRs(
          profile.id,
          exerciseId,
          set.durationMinutes,
          set.distanceKm,
          kcalToSave,
          params.sessionId,
        );
        const filtered = canUse('prAllTypes')
          ? prs
          : prs.filter((p) => p.recordType === 'max_calories');
        if (filtered.length > 0) setPrToasts(filtered);
      } catch {
        // non-fatal
      }
    }

    // Rest timer (Feature D)
    if (restTimerSettings.enabled && restTimerSettings.autoStart) {
      let secs = restTimerSettings.defaultSeconds;
      if (restTimerSettings.perExerciseOverride && canUse('restTimerPerExercise')) {
        const overrideSecs = await workoutRepo.getExerciseDefaultRestSeconds(exerciseId);
        if (overrideSecs != null && overrideSecs > 0) {
          secs = overrideSecs;
        }
      }
      const ex = exercises.find((e) => e.exerciseId === exerciseId);
      await restTimerService.start(secs, ex?.exerciseName);
      setRestOverlayVisible(true);
    }

    // Legacy timer store
    restTimer.start();
  };

  const handleAddExerciseToSession = async (exercise: Exercise) => {
    if (!profile) return;

    const alreadyInSession = exercises.some((e) => e.exerciseId === exercise.id);
    if (alreadyInSession) return;

    const previousSets = await workoutRepo.getPreviousSets(profile.id, exercise.id);

    const isCardio = exercise.exerciseType !== 'strength';
    const setCount = isCardio ? 1 : 3;
    const initialSets: SetInSession[] = [];
    for (let i = 0; i < setCount; i++) {
      initialSets.push({
        id: generateId(),
        setNumber: i + 1,
        weightKg: previousSets[i]?.weightKg ?? null,
        reps: previousSets[i]?.reps ?? null,
        rpe: null,
        durationMinutes: previousSets[i]?.durationMinutes ?? null,
        distanceKm: previousSets[i]?.distanceKm ?? null,
        caloriesBurned: null,
        perceivedIntensity: previousSets[i]?.perceivedIntensity ?? null,
        completed: false,
        setType: 'working',
      });
    }

    addExercise({
      exerciseId: exercise.id,
      exerciseName: exercise.nameJa,
      muscleGroup: exercise.muscleGroup,
      exerciseType: exercise.exerciseType,
      metValue: exercise.metValue,
      sets: initialSets,
      previousSets,
      // Mid-session adds carry no routine pattern; user can still
      // override per-set via long-press if they want a one-off drop.
      setPattern: null,
      patternConfig: null,
      // No routine_item context → no target_reps → recommendation chip
      // strip stays hidden for this exercise.
      targetReps: null,
    });

    setShowAddExercise(false);
  };

  const handleCopyPrevious = (exerciseId: string) => {
    copyPreviousSets(exerciseId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleCopySinglePreviousSet = (
    exerciseId: string,
    setId: string,
    prevSet: WorkoutSet,
  ) => {
    updateSet(exerciseId, setId, {
      weightKg: prevSet.weightKg,
      reps: prevSet.reps,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleSetDetail = (exerciseId: string, setId: string) => {
    const key = `${exerciseId}_${setId}`;
    setExpandedSets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCreateCustomExercise = async () => {
    const name = customExerciseName.trim();
    if (!name) return;
    try {
      const exercise = await workoutRepo.createCustomExercise(
        name,
        customExerciseMuscle,
        customExerciseEquipment.trim() || null,
      );
      setShowCustomExerciseModal(false);
      setCustomExerciseName('');
      setCustomExerciseMuscle('chest');
      setCustomExerciseEquipment('');
      // Add to session immediately
      await handleAddExerciseToSession(exercise);
    } catch {
      Alert.alert('エラー', 'カスタム種目の作成に失敗しました');
    }
  };

  const handleFinishSession = useCallback(async () => {
    if (isFinishing) return;
    if (!params.sessionId) return;
    setIsFinishing(true);
    Keyboard.dismiss();
    try {
      // Calculate estimated calories burned. For strength we use the
      // session-level estimate; for cardio/sports/other we sum the per-set
      // kcal (either user-entered or MET-derived).
      const bodyWeight = profile?.currentWeightKg ?? 70;
      const durationMin = Math.round(elapsedSeconds / 60);
      const strengthMinutes = exercises
        .filter((ex) => ex.exerciseType === 'strength')
        .length > 0
          ? durationMin
          : 0;
      const strengthCal = strengthMinutes > 0
        ? calculateWorkoutCalories(bodyWeight, strengthMinutes, 'moderate')
        : 0;
      const cardioCal = exercises
        .filter((ex) => ex.exerciseType !== 'strength')
        .reduce((sum, ex) => {
          return (
            sum +
            ex.sets.reduce((sSum, s) => {
              if (!s.completed) return sSum;
              if (s.caloriesBurned != null) return sSum + s.caloriesBurned;
              const k = calculateCaloriesBurned(ex.metValue, bodyWeight, s.durationMinutes);
              return sSum + (k ?? 0);
            }, 0)
          );
        }, 0);
      const estimatedCal = Math.round(strengthCal + cardioCal);

      // Compute summary synchronously from in-memory state (no DB hit).
      const totalVolume = exercises.reduce((total, ex) => {
        return (
          total +
          ex.sets
            .filter((s) => s.completed)
            .reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0)
        );
      }, 0);
      const completedSetCount = exercises.reduce(
        (total, ex) => total + ex.sets.filter((s) => s.completed).length,
        0,
      );

      // Critical write: mark session finished so the DB is consistent before
      // we transition screens. The volume PR scan runs in the background.
      await workoutRepo.finishSession(
        params.sessionId,
        sessionNote || undefined,
        estimatedCal,
      );

      setSummaryData({
        duration: elapsedSeconds,
        totalVolume,
        exerciseCount: exercises.length,
        setCount: completedSetCount,
        estimatedCalories: estimatedCal,
      });
      setSummaryMemo(sessionNote);
      setShowFinishModal(false);
      setShowSummary(true);

      // Fire-and-forget: volume PR scan is O(exercises × 2 DB calls) which
      // previously blocked screen transition. Toasts appear when ready.
      if (profile) {
        const sid = params.sessionId;
        void (async () => {
          try {
            const volumePRs = await checkSessionVolumePR(profile.id, sid);
            const filtered = canUse('prAllTypes') ? volumePRs : [];
            if (filtered.length > 0) setPrToasts(filtered);
          } catch {
            // non-fatal
          }
        })();
      }
    } catch {
      Alert.alert('エラー', 'セッションの終了に失敗しました');
    } finally {
      setIsFinishing(false);
    }
  }, [isFinishing, params.sessionId, profile, sessionNote, elapsedSeconds, exercises]);

  const handleDismissSummary = async () => {
    // Save summary memo as a training note if provided
    if (summaryMemo.trim() && profile) {
      try {
        await createNote(
          profile.id,
          getISODate(),
          'training',
          summaryMemo.trim(),
        );
      } catch {
        // silently fail - session already saved
      }
    }

    setShowSummary(false);
    endSession();
    restTimer.stop();
    router.back();
  };

  const handleCancelSession = () => {
    Alert.alert('セッション中止', '現在のセッションを中止しますか？記録済みのセットは保持されます。', [
      { text: 'いいえ', style: 'cancel' },
      {
        text: 'はい',
        style: 'destructive',
        onPress: async () => {
          if (params.sessionId) {
            try {
              await workoutRepo.finishSession(params.sessionId);
            } catch {
              // silently fail
            }
          }
          endSession();
          restTimer.stop();
          router.back();
        },
      },
    ]);
  };

  const formatPreviousSet = (prevSet: WorkoutSet): string => {
    return `${prevSet.weightKg ?? 0}kg × ${prevSet.reps ?? 0}回`;
  };

  const muscleFilterSegments = [
    { label: '全て', value: 'all' },
    ...MUSCLE_GROUPS.map((mg) => ({ label: mg.nameJa, value: mg.id })),
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Rest Timer Overlay */}
      {restTimer.isRunning && (
        <View style={[styles.restTimerBar, { backgroundColor: colors.primary }]}>
          <View style={styles.restTimerContent}>
            <View style={styles.restTimerLeft}>
              <Ionicons name="timer-outline" size={18} color="#FFFFFF" />
              <Text style={styles.restTimerText}>
                休憩 {formatTime(restTimer.remainingSeconds)}
              </Text>
            </View>
            <TouchableOpacity onPress={() => restTimer.stop()}>
              <Text style={styles.restTimerSkip}>スキップ</Text>
            </TouchableOpacity>
          </View>
          <ProgressBar
            progress={restTimer.progress}
            color="rgba(255,255,255,0.5)"
            backgroundColor="rgba(255,255,255,0.15)"
            height={3}
          />
        </View>
      )}

      {/* Top Bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <Button title="キャンセル" onPress={handleCancelSession} variant="ghost" size="sm" />
        <View style={styles.timerContainer}>
          <Ionicons name="time-outline" size={16} color={colors.primary} />
          <Text style={[styles.timer, { color: colors.primary }]}>
            {formatTime(elapsedSeconds)}
          </Text>
        </View>
        <Button
          title="完了"
          onPress={() => setShowFinishModal(true)}
          variant="primary"
          size="sm"
        />
      </View>

      {/* Main Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {exercises.length === 0 && (
          <Card>
            <View style={styles.emptyState}>
              <Ionicons name="barbell-outline" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
                種目がありません
              </Text>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                下のボタンから種目を追加してください
              </Text>
            </View>
          </Card>
        )}

        {exercises.map((exercise) => (
          <Card key={exercise.exerciseId}>
            {/* Exercise header */}
            <View style={styles.exerciseHeader}>
              <View style={styles.exerciseHeaderLeft}>
                <Text style={[styles.exerciseName, { color: colors.textPrimary }]}>
                  {exercise.exerciseName}
                </Text>
                <Badge
                  label={
                    exercise.exerciseType === 'strength'
                      ? MUSCLE_GROUP_MAP[exercise.muscleGroup]?.nameJa ?? exercise.muscleGroup
                      : exercise.metValue != null
                        ? `MET ${exercise.metValue}`
                        : EXERCISE_TYPE_TABS.find((t) => t.value === exercise.exerciseType)
                            ?.label ?? ''
                  }
                  size="sm"
                />
              </View>
              <TouchableOpacity onPress={() => removeExercise(exercise.exerciseId)}>
                <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            {/* Copy all previous button */}
            {exercise.previousSets.length > 0 && (
              <TouchableOpacity
                style={[styles.copyButton, { borderColor: colors.border }]}
                onPress={() => handleCopyPrevious(exercise.exerciseId)}
                activeOpacity={0.7}
              >
                <Ionicons name="copy-outline" size={14} color={colors.primary} />
                <Text style={[styles.copyButtonText, { color: colors.primary }]}>
                  前回を全てコピー
                </Text>
              </TouchableOpacity>
            )}

            {/* Set table */}
            {exercise.exerciseType !== 'strength' ? (
              <View style={styles.setTable}>
                {exercise.sets.map((set) => {
                  const canComplete = (set.durationMinutes ?? 0) > 0;
                  const autoKcal = calculateCaloriesBurned(
                    exercise.metValue,
                    profile?.currentWeightKg ?? null,
                    set.durationMinutes,
                  );
                  const displayKcal = set.caloriesBurned ?? autoKcal;
                  return (
                    <View
                      key={set.id}
                      style={[
                        styles.cardioSetRow,
                        { borderBottomColor: colors.border },
                        set.completed && { backgroundColor: colors.success + '10' },
                      ]}
                    >
                      <View style={styles.cardioRowHeader}>
                        <Text style={[styles.setNum, { color: colors.textSecondary }]}>
                          セット{set.setNumber}
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleCompleteSet(exercise.exerciseId, set)}
                          disabled={set.completed || !canComplete}
                        >
                          <View
                            style={[
                              styles.checkCircle,
                              {
                                borderColor: set.completed
                                  ? colors.success
                                  : canComplete
                                    ? colors.primary
                                    : colors.border,
                                backgroundColor: set.completed
                                  ? colors.success
                                  : 'transparent',
                              },
                            ]}
                          >
                            {set.completed && (
                              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                            )}
                          </View>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.cardioInputGrid}>
                        <View style={styles.cardioInputGroup}>
                          <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>
                            時間 (分) *
                          </Text>
                          <DecimalInput
                            style={[
                              styles.setTextInput,
                              {
                                color: colors.textPrimary,
                                backgroundColor: colors.surfaceSecondary,
                                borderColor: colors.border,
                                borderRadius: radius.sm,
                              },
                            ]}
                            value={set.durationMinutes ?? null}
                            onCommit={(v) =>
                              updateSet(exercise.exerciseId, set.id, {
                                durationMinutes: v,
                              })
                            }
                            placeholder="0"
                            placeholderTextColor={colors.textTertiary}
                            selectTextOnFocus
                            editable={!set.completed}
                          />
                        </View>

                        <View style={styles.cardioInputGroup}>
                          <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>
                            距離 (km)
                          </Text>
                          <DecimalInput
                            style={[
                              styles.setTextInput,
                              {
                                color: colors.textPrimary,
                                backgroundColor: colors.surfaceSecondary,
                                borderColor: colors.border,
                                borderRadius: radius.sm,
                              },
                            ]}
                            value={set.distanceKm ?? null}
                            onCommit={(v) =>
                              updateSet(exercise.exerciseId, set.id, {
                                distanceKm: v,
                              })
                            }
                            placeholder="-"
                            placeholderTextColor={colors.textTertiary}
                            selectTextOnFocus
                            editable={!set.completed}
                          />
                        </View>

                        <View style={styles.cardioInputGroup}>
                          <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>
                            強度 (1-10)
                          </Text>
                          <TextInput
                            style={[
                              styles.setTextInput,
                              {
                                color: colors.textPrimary,
                                backgroundColor: colors.surfaceSecondary,
                                borderColor: colors.border,
                                borderRadius: radius.sm,
                              },
                            ]}
                            value={
                              set.perceivedIntensity != null
                                ? String(set.perceivedIntensity)
                                : ''
                            }
                            onChangeText={(text) => {
                              const parsed = parseInt(text, 10);
                              updateSet(exercise.exerciseId, set.id, {
                                perceivedIntensity:
                                  text === ''
                                    ? null
                                    : isNaN(parsed)
                                      ? set.perceivedIntensity
                                      : Math.max(1, Math.min(10, parsed)),
                              });
                            }}
                            keyboardType="number-pad"
                            placeholder="-"
                            placeholderTextColor={colors.textTertiary}
                            selectTextOnFocus
                            editable={!set.completed}
                          />
                        </View>

                        <View style={styles.cardioInputGroup}>
                          <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>
                            kcal
                          </Text>
                          <DecimalInput
                            style={[
                              styles.setTextInput,
                              {
                                color: colors.textPrimary,
                                backgroundColor: colors.surfaceSecondary,
                                borderColor: colors.border,
                                borderRadius: radius.sm,
                              },
                            ]}
                            value={
                              set.caloriesBurned ??
                              (autoKcal != null ? Math.round(autoKcal) : null)
                            }
                            onCommit={(v) =>
                              updateSet(exercise.exerciseId, set.id, {
                                caloriesBurned: v,
                              })
                            }
                            placeholder={autoKcal != null ? String(Math.round(autoKcal)) : '-'}
                            placeholderTextColor={colors.textTertiary}
                            selectTextOnFocus
                            editable={!set.completed}
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
            <View style={styles.setTable}>
              <View style={[styles.setHeader, { backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm }]}>
                <Text style={[styles.setHeaderText, styles.setNumCol, { color: colors.textTertiary }]}>
                  #
                </Text>
                <Text style={[styles.setHeaderText, styles.setWeightCol, { color: colors.textTertiary }]}>
                  kg
                </Text>
                <Text style={[styles.setHeaderText, styles.setRepsCol, { color: colors.textTertiary }]}>
                  回数
                </Text>
                <Text style={[styles.setHeaderText, styles.set1rmCol, { color: colors.textTertiary }]}>
                  推定1RM
                </Text>
                <View style={styles.setCheckCol} />
              </View>

              {exercise.sets.map((set, setIndex) => {
                const prevSet = exercise.previousSets[setIndex];
                const e1rm =
                  set.weightKg && set.reps
                    ? estimateOneRepMax(set.weightKg, set.reps).value
                    : null;
                const detailKey = `${exercise.exerciseId}_${set.id}`;
                const isExpanded = expandedSets[detailKey] ?? false;
                const canComplete = (set.weightKg ?? 0) > 0 && (set.reps ?? 0) > 0;

                return (
                  <View key={set.id}>
                    {/* Per-set previous record (tappable to copy) */}
                    {prevSet && !set.completed && (
                      <TouchableOpacity
                        style={styles.prevSetRow}
                        onPress={() =>
                          handleCopySinglePreviousSet(
                            exercise.exerciseId,
                            set.id,
                            prevSet,
                          )
                        }
                        activeOpacity={0.6}
                      >
                        <Text style={[styles.prevSetText, { color: colors.textTertiary }]}>
                          前回: {formatPreviousSet(prevSet)} ← タップでコピー
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* Main set row */}
                    <TouchableOpacity
                      activeOpacity={1}
                      onLongPress={() =>
                        setOverrideTarget({
                          exerciseId: exercise.exerciseId,
                          setId: set.id,
                          current: set.setType,
                        })
                      }
                      style={[
                        styles.setRow,
                        { borderBottomColor: colors.border },
                        set.completed && { backgroundColor: colors.success + '10' },
                      ]}
                    >
                      {/* Build 15 / Feature 5-O — set_type stripe.
                          Left-edge color tag mirrors the SET_TYPE_COLORS
                          map. Tapping-and-holding the row anywhere
                          opens the per-set override sheet. */}
                      <View
                        style={[
                          styles.setTypeStripe,
                          { backgroundColor: SET_TYPE_COLORS[set.setType] },
                        ]}
                      />
                      <Text
                        style={[styles.setNum, styles.setNumCol, { color: colors.textSecondary }]}
                      >
                        {set.setNumber}
                      </Text>
                      <View style={styles.setWeightCol}>
                        <DecimalInput
                          style={[
                            styles.setTextInput,
                            {
                              color: colors.textPrimary,
                              backgroundColor: colors.surfaceSecondary,
                              borderColor: colors.border,
                              borderRadius: radius.sm,
                            },
                          ]}
                          value={set.weightKg ?? null}
                          onCommit={(v) => {
                            updateSet(exercise.exerciseId, set.id, {
                              weightKg: v,
                            });
                            // Build 15 / Feature 5-O — pattern cascade.
                            // When the user commits a weight on a top
                            // (top_set) or working (drop_set) driver
                            // slot, fill the dependent slots so the
                            // user sees the pre-filled chain without
                            // doing math. Manual edits to dependents
                            // afterwards are preserved.
                            if (v != null && v > 0) {
                              const cascade = computePatternCascade(
                                exercise,
                                set,
                                v,
                              );
                              cascade?.forEach(({ setId, weightKg }) => {
                                updateSet(exercise.exerciseId, setId, {
                                  weightKg,
                                });
                              });
                            }
                          }}
                          returnKeyType="next"
                          placeholder="0"
                          placeholderTextColor={colors.textTertiary}
                          selectTextOnFocus
                          editable={!set.completed}
                        />
                      </View>
                      <View style={styles.setRepsCol}>
                        <TextInput
                          style={[
                            styles.setTextInput,
                            {
                              color: colors.textPrimary,
                              backgroundColor: colors.surfaceSecondary,
                              borderColor: colors.border,
                              borderRadius: radius.sm,
                            },
                          ]}
                          value={set.reps != null ? String(set.reps) : ''}
                          onChangeText={(text) => {
                            const parsed = parseInt(text, 10);
                            updateSet(exercise.exerciseId, set.id, {
                              reps: text === '' ? null : isNaN(parsed) ? set.reps : parsed,
                            });
                          }}
                          keyboardType="number-pad"
                          returnKeyType="done"
                          placeholder="0"
                          placeholderTextColor={colors.textTertiary}
                          selectTextOnFocus
                          editable={!set.completed}
                        />
                      </View>
                      <Text
                        style={[
                          styles.set1rmText,
                          styles.set1rmCol,
                          { color: e1rm ? colors.textSecondary : colors.textTertiary },
                        ]}
                      >
                        {e1rm ? `${e1rm}` : '-'}
                      </Text>
                      <View style={styles.setCheckCol}>
                        <TouchableOpacity
                          onPress={() => handleCompleteSet(exercise.exerciseId, set)}
                          disabled={set.completed || !canComplete}
                        >
                          <View
                            style={[
                              styles.checkCircle,
                              {
                                borderColor: set.completed
                                  ? colors.success
                                  : canComplete
                                    ? colors.primary
                                    : colors.border,
                                backgroundColor: set.completed ? colors.success : 'transparent',
                              },
                            ]}
                          >
                            {set.completed && (
                              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                            )}
                          </View>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>

                    {/* Build 15 / Feature 5-C — Easy/Normal/Hard chip strip.
                        Renders only on uncompleted 'working' sets when an
                        e1rm and a parseable target_reps both exist for
                        the exercise. Warmup / top / drop / failure rows
                        skip the strip (top/drop are user-judgment +
                        cascade-driven; warmup needs a separate base ×
                        0.4-0.6 logic deferred to v2). */}
                    {!set.completed && set.setType === 'working' && (
                      <RecommendationStrip
                        e1rm={e1rmByExercise[exercise.exerciseId] ?? null}
                        targetRepsRaw={exercise.targetReps}
                        plateStep={profile?.plateStepKg ?? 2.5}
                        onApply={(weightKg, reps) =>
                          updateSet(exercise.exerciseId, set.id, {
                            weightKg,
                            reps,
                          })
                        }
                        colors={colors}
                        gated={recommendationGated}
                      />
                    )}

                    {/* Expandable detail toggle */}
                    {!set.completed && (
                      <TouchableOpacity
                        style={styles.detailToggle}
                        onPress={() => toggleSetDetail(exercise.exerciseId, set.id)}
                        activeOpacity={0.6}
                      >
                        <Text style={[styles.detailToggleText, { color: colors.textTertiary }]}>
                          {isExpanded ? '詳細を閉じる' : '詳細'}
                        </Text>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={14}
                          color={colors.textTertiary}
                        />
                      </TouchableOpacity>
                    )}

                    {/* Expanded detail row: RPE, RIR, memo */}
                    {isExpanded && !set.completed && (
                      <View
                        style={[
                          styles.detailRow,
                          { backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm },
                        ]}
                      >
                        <View style={styles.detailInputRow}>
                          <View style={styles.detailInputGroup}>
                            <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>
                              RPE
                            </Text>
                            <DecimalInput
                              style={[
                                styles.detailInput,
                                {
                                  color: colors.textPrimary,
                                  borderColor: colors.border,
                                  borderRadius: radius.sm,
                                },
                              ]}
                              value={set.rpe ?? null}
                              onCommit={(v) =>
                                updateSet(exercise.exerciseId, set.id, {
                                  rpe: v,
                                })
                              }
                              placeholder="6-10"
                              placeholderTextColor={colors.textTertiary}
                              selectTextOnFocus
                            />
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            )}

            <Button
              title="+ セット追加"
              onPress={() => addSetToExercise(exercise.exerciseId)}
              variant="ghost"
              size="sm"
            />
          </Card>
        ))}

        {/* Add exercise button */}
        <TouchableOpacity
          style={[styles.addExerciseButton, { borderColor: colors.border, borderRadius: radius.lg }]}
          onPress={() => setShowAddExercise(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
          <Text style={[styles.addExerciseText, { color: colors.primary }]}>+ 種目を追加</Text>
        </TouchableOpacity>

        {/* Spacer for bottom button */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom fixed button */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <Button
          title="セッション終了"
          onPress={() => setShowFinishModal(true)}
          variant="primary"
          size="lg"
          fullWidth
        />
      </View>

      {/* Build 15 / Feature 5-O — per-set role override sheet.
          Opens on long-press of any set row. */}
      <BottomSheet
        visible={overrideTarget !== null}
        onClose={() => setOverrideTarget(null)}
        title="セット種別を変更"
      >
        <View style={styles.setTypeOverrideList}>
          {SET_TYPE_OVERRIDE_OPTIONS.map((option) => {
            const isCurrent = overrideTarget?.current === option;
            return (
              <TouchableOpacity
                key={option}
                style={[
                  styles.setTypeOverrideRow,
                  { borderBottomColor: colors.border },
                ]}
                onPress={() => {
                  if (overrideTarget) {
                    updateSet(overrideTarget.exerciseId, overrideTarget.setId, {
                      setType: option,
                    });
                  }
                  setOverrideTarget(null);
                }}
              >
                <View
                  style={[
                    styles.setTypeOverrideStripe,
                    { backgroundColor: SET_TYPE_COLORS[option] },
                  ]}
                />
                <Text
                  style={[styles.setTypeOverrideLabel, { color: colors.textPrimary }]}
                >
                  {SET_TYPE_LABELS_JA[option]}
                </Text>
                {isCurrent && (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheet>

      {/* Add Exercise BottomSheet */}
      <BottomSheet
        visible={showAddExercise}
        onClose={() => setShowAddExercise(false)}
        title="種目を追加"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.exercisePickerContent}
        >
          {/* Custom exercise creation button */}
          <TouchableOpacity
            style={[
              styles.customExerciseButton,
              { borderColor: colors.primary, borderRadius: radius.md },
            ]}
            onPress={() => {
              setShowAddExercise(false);
              setShowCustomExerciseModal(true);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle" size={20} color={colors.primary} />
            <Text style={[styles.customExerciseButtonText, { color: colors.primary }]}>
              ＋ カスタム種目を追加
            </Text>
          </TouchableOpacity>

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
                  setExerciseFilter('all');
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
              const alreadyInSession = exercises.some((e) => e.exerciseId === item.id);
              const badgeLabel =
                item.exerciseType === 'strength'
                  ? MUSCLE_GROUP_MAP[item.muscleGroup]?.nameJa ?? item.muscleGroup
                  : item.metValue != null
                    ? `MET ${item.metValue}`
                    : EXERCISE_TYPE_TABS.find((t) => t.value === item.exerciseType)?.label ?? '';
              return (
                <TouchableOpacity
                  style={[styles.exerciseListItem, { borderBottomColor: colors.border }]}
                  onPress={() => !alreadyInSession && handleAddExerciseToSession(item)}
                  disabled={alreadyInSession}
                  activeOpacity={0.7}
                >
                  <View style={styles.exerciseListItemInfo}>
                    <Text
                      style={[
                        styles.exerciseListItemName,
                        { color: alreadyInSession ? colors.textTertiary : colors.textPrimary },
                      ]}
                    >
                      {item.nameJa}
                    </Text>
                    {badgeLabel !== '' && <Badge label={badgeLabel} size="sm" />}
                    {item.isCustom && (
                      <Badge label="カスタム" size="sm" />
                    )}
                  </View>
                  {alreadyInSession && (
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
        </KeyboardAvoidingView>
      </BottomSheet>

      {/* Custom Exercise Creation Modal */}
      <Modal
        visible={showCustomExerciseModal}
        onClose={() => setShowCustomExerciseModal(false)}
        title="カスタム種目を追加"
      >
        <View style={styles.customExerciseContent}>
          <Input
            label="種目名（必須）"
            placeholder="例: ケーブルフライ"
            value={customExerciseName}
            onChangeText={setCustomExerciseName}
          />
          <Text style={[styles.customExerciseLabel, { color: colors.textSecondary }]}>
            部位
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.muscleChipRow}>
              {MUSCLE_GROUPS.map((mg) => (
                <TouchableOpacity
                  key={mg.id}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor:
                        customExerciseMuscle === mg.id ? colors.primary : colors.surfaceSecondary,
                      borderRadius: radius.full,
                    },
                  ]}
                  onPress={() => setCustomExerciseMuscle(mg.id)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      {
                        color: customExerciseMuscle === mg.id ? '#FFFFFF' : colors.textSecondary,
                      },
                    ]}
                  >
                    {mg.nameJa}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <Input
            label="器具メモ（任意）"
            placeholder="例: ケーブルマシン"
            value={customExerciseEquipment}
            onChangeText={setCustomExerciseEquipment}
          />
          <View style={styles.customExerciseActions}>
            <Button
              title="キャンセル"
              onPress={() => setShowCustomExerciseModal(false)}
              variant="ghost"
              size="md"
            />
            <Button
              title="追加"
              onPress={handleCreateCustomExercise}
              variant="primary"
              size="md"
              disabled={!customExerciseName.trim()}
            />
          </View>
        </View>
      </Modal>

      {/* Finish Confirmation Modal */}
      <Modal
        visible={showFinishModal}
        onClose={() => setShowFinishModal(false)}
        title="セッション終了"
      >
        <View style={styles.finishModalContent}>
          <Text style={[styles.finishConfirmText, { color: colors.textSecondary }]}>
            トレーニングセッションを終了しますか？
          </Text>
          <Input
            label="メモ（任意）"
            placeholder="セッションのメモを入力..."
            value={sessionNote}
            onChangeText={setSessionNote}
            multiline
            numberOfLines={3}
            blurOnSubmit
            returnKeyType="done"
          />
          <View style={styles.finishModalActions}>
            <Button
              title="キャンセル"
              onPress={() => setShowFinishModal(false)}
              variant="ghost"
              size="lg"
              disabled={isFinishing}
            />
            <Button
              title="終了する"
              onPress={handleFinishSession}
              variant="primary"
              size="lg"
              loading={isFinishing}
              disabled={isFinishing}
            />
          </View>
        </View>
      </Modal>

      {/* Summary Modal */}
      <Modal
        visible={showSummary}
        onClose={handleDismissSummary}
        title="トレーニング完了"
      >
        {summaryData && (
          <View style={styles.summaryContent}>
            <Ionicons
              name="checkmark-circle"
              size={56}
              color={colors.success}
              style={styles.summaryIcon}
            />

            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                  {formatTime(summaryData.duration)}
                </Text>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                  経過時間
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                  {summaryData.totalVolume.toLocaleString()}
                </Text>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                  総ボリューム (kg)
                </Text>
              </View>
            </View>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                  {summaryData.exerciseCount}
                </Text>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                  種目数
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                  {summaryData.setCount}
                </Text>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                  完了セット
                </Text>
              </View>
            </View>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: colors.calorie }]}>
                  {summaryData.estimatedCalories}
                </Text>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                  推定消費 (kcal)
                </Text>
              </View>
            </View>

            {/* Session memo input */}
            <View style={styles.summaryMemoContainer}>
              <Text style={[styles.summaryMemoLabel, { color: colors.textSecondary }]}>
                セッションメモ (任意)
              </Text>
              <TextInput
                style={[
                  styles.summaryMemoInput,
                  {
                    color: colors.textPrimary,
                    backgroundColor: colors.surfaceSecondary,
                    borderRadius: radius.md,
                  },
                ]}
                value={summaryMemo}
                onChangeText={setSummaryMemo}
                placeholder="今日のトレーニングの感想..."
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                maxLength={500}
              />
            </View>

            <Button
              title="閉じる"
              onPress={handleDismissSummary}
              variant="primary"
              size="lg"
              fullWidth
            />
          </View>
        )}
      </Modal>

      {/* Rest Timer Overlay (Feature D) */}
      <RestTimerOverlay
        visible={restOverlayVisible}
        onClose={() => setRestOverlayVisible(false)}
        settings={{
          soundEnabled: restTimerSettings.soundEnabled,
          vibrationEnabled: restTimerSettings.vibrationEnabled,
        }}
      />

      {/* PR Celebration Toast (Feature E) */}
      {prToasts.length > 0 && (
        <PRCelebrationToast prs={prToasts} onHide={() => setPrToasts([])} />
      )}

      {/* Plate Calculator Modal (Feature G) */}
      {plateCalcFor && (
        <PlateCalculatorModal
          visible={plateCalcFor !== null}
          initialWeight={plateCalcFor.initial}
          onClose={() => setPlateCalcFor(null)}
          onApply={(weight) => {
            updateSet(plateCalcFor.exerciseId, plateCalcFor.setId, { weightKg: weight });
            setPlateCalcFor(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  // Rest timer
  restTimerBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  restTimerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  restTimerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  restTimerText: {
    ...typography.labelLarge,
    color: '#FFFFFF',
  },
  restTimerSkip: {
    ...typography.labelMedium,
    color: 'rgba(255,255,255,0.8)',
  },
  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timer: { ...typography.displayMedium },
  // Scroll
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyTitle: { ...typography.titleSmall },
  emptyText: { ...typography.bodySmall, textAlign: 'center' },
  // Exercise card
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  exerciseName: { ...typography.titleMedium },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
  },
  copyButtonText: { ...typography.labelSmall },
  // Set table
  setTable: { marginTop: spacing.md },
  setHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  setHeaderText: {
    ...typography.labelSmall,
    textAlign: 'center',
  },
  setNumCol: { width: 28 },
  setWeightCol: { flex: 1.2 },
  setRepsCol: { flex: 1 },
  set1rmCol: { flex: 1, alignItems: 'center' as const },
  setCheckCol: { width: 32, alignItems: 'center' as const },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 0.5,
  },
  // Build 15 / Feature 5-O — left-edge stripe, color-coded by setType.
  // 6px wide, full row height. Sits before setNum so existing column
  // widths (setNumCol etc.) stay measurement-stable.
  setTypeStripe: {
    width: 6,
    alignSelf: 'stretch',
    marginRight: spacing.xs,
    borderRadius: 2,
  },
  setTypeOverrideList: { paddingVertical: spacing.sm },
  setTypeOverrideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 0.5,
    gap: spacing.md,
  },
  setTypeOverrideStripe: {
    width: 6,
    height: 24,
    borderRadius: 2,
  },
  setTypeOverrideLabel: {
    ...typography.bodyMedium,
    flex: 1,
  },
  // Build 15 / Feature 5-C recommendation chip strip (below each
  // uncompleted working set row). Three pill-shaped chips lined up
  // horizontally; tap fills weight + reps into the row above.
  recommendStripRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs / 2,
  },
  recommendChip: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: spacing.xs,
    borderWidth: 0.5,
    alignItems: 'center',
  },
  recommendChipLabel: {
    ...typography.labelSmall,
    fontSize: 10,
  },
  recommendChipWeight: {
    ...typography.labelMedium,
    fontSize: 12,
    marginTop: 1,
  },
  recommendStripHintWrap: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  recommendHintText: {
    ...typography.labelSmall,
    fontSize: 11,
    textAlign: 'center',
  },
  recommendUpgradeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    marginHorizontal: spacing.xs,
    marginTop: spacing.xs,
  },
  recommendUpgradeText: {
    ...typography.labelSmall,
    fontSize: 11,
    flex: 1,
  },
  setNum: {
    ...typography.labelMedium,
    textAlign: 'center',
  },
  setTextInput: {
    ...typography.bodyMedium,
    height: 36,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
  },
  set1rmText: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  prevSetRow: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginLeft: 28,
  },
  prevSetText: {
    ...typography.bodySmall,
    fontSize: 11,
  },
  detailToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  detailToggleText: {
    ...typography.labelSmall,
    fontSize: 11,
  },
  detailRow: {
    padding: spacing.md,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xs,
  },
  detailInputRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  detailInputGroup: {
    flex: 1,
    gap: 4,
  },
  detailLabel: {
    ...typography.labelSmall,
  },
  detailInput: {
    ...typography.bodyMedium,
    height: 36,
    textAlign: 'center',
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardioSetRow: {
    borderBottomWidth: 1,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  cardioRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardioInputGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardioInputGroup: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: 4,
  },
  // Add exercise
  addExerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  addExerciseText: { ...typography.labelLarge },
  bottomSpacer: { height: 80 },
  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    borderTopWidth: 0.5,
  },
  // Exercise picker
  exercisePickerContent: { gap: spacing.md },
  filterScroll: { flexGrow: 0 },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginRight: spacing.sm,
  },
  filterChipText: { ...typography.labelSmall },
  exerciseList: { maxHeight: 300 },
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
  customExerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  customExerciseButtonText: { ...typography.labelMedium },
  customExerciseContent: { gap: spacing.md },
  customExerciseLabel: { ...typography.labelMedium },
  muscleChipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  customExerciseActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  // Finish modal
  finishModalContent: { gap: spacing.lg },
  finishConfirmText: { ...typography.bodyMedium },
  finishModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  // Summary modal
  summaryContent: {
    alignItems: 'center',
    gap: spacing.xl,
  },
  summaryIcon: { marginBottom: spacing.sm },
  summaryRow: {
    flexDirection: 'row',
    width: '100%',
    gap: spacing.lg,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryValue: { ...typography.numberMedium },
  summaryLabel: { ...typography.bodySmall },
  // Summary memo
  summaryMemoContainer: {
    width: '100%',
    gap: spacing.sm,
  },
  summaryMemoLabel: {
    ...typography.labelMedium,
  },
  summaryMemoInput: {
    ...typography.bodyMedium,
    minHeight: 80,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
