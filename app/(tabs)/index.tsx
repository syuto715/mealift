import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  Dimensions,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../src/theme/tokens';
import { typography } from '../../src/theme/typography';
import { spacing } from '../../src/theme/spacing';
import { Card, ProgressRing, ProgressBar, Button, Badge, DateNavigator, Toast } from '../../src/components/ui';
import { PredictionChart } from '../../src/components/progress/PredictionChart';
import { getGreeting, getISODate, formatDate } from '../../src/utils/format';
import { getRecordedNutritionDates } from '../../src/infra/repositories/nutritionRepository';
import { getRecordedSessionDates } from '../../src/infra/repositories/workoutRepository';
import { useProfileStore } from '../../src/stores/profileStore';
import { useNutrition } from '../../src/hooks/useNutrition';
import { useBodyLogs } from '../../src/hooks/useBodyLogs';
import { useFeedback } from '../../src/hooks/useFeedback';
import { usePrediction } from '../../src/hooks/usePrediction';
import { useGoalPrediction } from '../../src/hooks/useGoalPrediction';
import { useAdaptiveGoal } from '../../src/hooks/useAdaptiveGoal';
import { GoalPredictionCard } from '../../src/components/home/GoalPredictionCard';
import { AdaptiveGoalCard } from '../../src/components/home/AdaptiveGoalCard';
import { WaterTrackerCard } from '../../src/components/home/WaterTrackerCard';
import { useWaterTracker } from '../../src/hooks/useWaterTracker';
import { useHealthKitCalories } from '../../src/hooks/useHealthKitCalories';
import { getDailyCalories, getWeeklyCalories } from '../../src/infra/repositories/nutritionRepository';
import {
  getRecentSessionCount,
  getSessions,
  getTodayWorkoutCalories,
} from '../../src/infra/repositories/workoutRepository';
import { updateProfile as updateProfileRepo } from '../../src/infra/repositories/profileRepository';
import {
  calculateNutritionCompliance,
  calculateTrainingCompliance,
} from '../../src/domain/compliance';
import { calculateAllCalories, calculateDailyBurn } from '../../src/domain/calories';
import { WorkoutSession } from '../../src/types/workout';
import { WeeklyReportCard } from '../../src/components/home/WeeklyReportCard';
import { WeeklyReportData } from '../../src/types/weeklyReport';
import { getOrGenerateCurrentReport } from '../../src/domain/weeklyReport';
import { WorkoutSuggestionCard } from '../../src/components/home/WorkoutSuggestionCard';
import { WorkoutSuggestion } from '../../src/types/workoutSuggestion';
import { getWorkoutSuggestion } from '../../src/domain/workoutSuggestion';
import { canUse } from '../../src/infra/services/subscriptionService';
import { updateWidgetData } from '../../src/infra/services/widgetService';
import { TrialBadge } from '../../src/components/subscription/TrialBadge';
import { subDays, subWeeks, startOfWeek, endOfWeek, addDays, format, isToday, isMonday } from 'date-fns';
import { ja } from 'date-fns/locale';

const FEEDBACK_COLORS: Record<string, (colors: ReturnType<typeof getColors>) => string> = {
  success: (c) => c.success,
  warning: (c) => c.warning,
  error: (c) => c.error,
  info: (c) => c.primary,
  action: (c) => c.accent,
};

const FEEDBACK_BG: Record<string, (colors: ReturnType<typeof getColors>) => string> = {
  success: (c) => c.success + '08',
  warning: (c) => c.warning + '08',
  error: (c) => c.error + '08',
  info: (c) => c.primary + '08',
  action: (c) => c.accent + '08',
};

const PACE_LABELS: Record<string, string> = {
  too_fast: '速すぎ',
  fast: 'やや速い',
  on_track: '順調',
  slow: 'やや遅い',
  too_slow: '遅すぎ',
};

export default function HomeScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const profileId = profile?.id ?? '';

  const screenWidth = Dimensions.get('window').width;
  const miniChartWidth = screenWidth - spacing.lg * 2 - spacing.xl * 2;

  // Date navigation
  const [selectedDate, setSelectedDate] = useState(getISODate());
  const [recordedDates, setRecordedDates] = useState<string[]>([]);
  const isViewingToday = selectedDate === getISODate();

  // Nutrition data from store
  const { totalCalories, totalProteinG, totalFatG, totalCarbG } = useNutrition(selectedDate);

  // Body logs
  const { avg7d, weightChange14d, logs: bodyLogs } = useBodyLogs();

  // Feedback
  const { feedback } = useFeedback(selectedDate);

  // Prediction (real data via hook)
  const { prediction, hasEnoughData: hasEnoughPredictionData, daysNeeded: predictionDaysNeeded } = usePrediction();

  // New goal arrival prediction (Feature B)
  const { prediction: goalPrediction } = useGoalPrediction();

  // Adaptive goal (Feature A)
  const adaptive = useAdaptiveGoal();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Water tracker (Feature I)
  const water = useWaterTracker(selectedDate);

  // Local state for async loaded data
  const [todayCalories, setTodayCalories] = useState(0);
  const [weeklyCaloriesData, setWeeklyCaloriesData] = useState<{ date: string; calories: number }[]>([]);
  const [recentSessionCount, setRecentSessionCount] = useState(0);
  const [todaySessions, setTodaySessions] = useState<WorkoutSession[]>([]);
  const [todayWorkoutCalories, setTodayWorkoutCalories] = useState(0);
  const [isLoadingHome, setIsLoadingHome] = useState(true);

  // Weekly report & workout suggestion
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportData | null>(null);
  const [workoutSuggestion, setWorkoutSuggestion] = useState<WorkoutSuggestion | null>(null);

  // Weekly review state
  const [lastWeekAvgCalories, setLastWeekAvgCalories] = useState<number | null>(null);
  const [lastWeekWeightChange, setLastWeekWeightChange] = useState<number | null>(null);
  const [recommendedCalories, setRecommendedCalories] = useState<number | null>(null);
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [applyingRecommendation, setApplyingRecommendation] = useState(false);

  // Check if today is Monday
  const isMondayToday = isMonday(new Date());

  // Load recorded dates for DateNavigator
  useEffect(() => {
    if (!profileId) return;
    const monthPrefix = selectedDate.substring(0, 7);
    Promise.all([
      getRecordedNutritionDates(profileId, monthPrefix),
      getRecordedSessionDates(profileId, monthPrefix),
    ]).then(([nutritionDates, sessionDates]) => {
      const merged = [...new Set([...nutritionDates, ...sessionDates])];
      setRecordedDates(merged);
    }).catch(() => {});
  }, [profileId, selectedDate]);

  // Load async data
  useEffect(() => {
    if (!profileId) {
      setIsLoadingHome(false);
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      try {
        const [calories, weeklyCals, sessionCount, sessions, workoutCals] = await Promise.all([
          getDailyCalories(profileId, selectedDate),
          getWeeklyCalories(profileId),
          getRecentSessionCount(profileId, 7),
          getSessions(profileId, 10),
          getTodayWorkoutCalories(profileId, selectedDate),
        ]);

        // Update widget data (non-blocking, only for today)
        if (isViewingToday) {
          updateWidgetData(profileId).catch(() => {});
        }

        // Load weekly report & workout suggestion (non-blocking)
        getOrGenerateCurrentReport(profileId)
          .then((report) => { if (!cancelled) setWeeklyReport(report); })
          .catch(() => {});
        getWorkoutSuggestion(profileId)
          .then((suggestion) => { if (!cancelled) setWorkoutSuggestion(suggestion); })
          .catch(() => {});

        if (!cancelled) {
          setTodayCalories(calories);
          setWeeklyCaloriesData(weeklyCals);
          setRecentSessionCount(sessionCount);
          setTodaySessions(sessions);
          setTodayWorkoutCalories(workoutCals);
          setIsLoadingHome(false);
        }
      } catch (error) {
        if (!cancelled) setIsLoadingHome(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [profileId, selectedDate]);

  // Load weekly review data on Mondays
  useEffect(() => {
    if (!profileId || !profile || !isMondayToday) return;

    let cancelled = false;

    const loadReviewData = async () => {
      try {
        // Last week's date range
        const now = new Date();
        const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

        // We can approximate last week's avg from weekly calories data
        // Calculate from body logs for weight change
        const logsWithWeight = bodyLogs
          .filter((l) => l.weightKg !== null)
          .sort((a, b) => a.date.localeCompare(b.date));

        // Get weight change from the last 7 days of the previous week
        const lastWeekEndStr = format(endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const lastWeekStartStr = format(lastWeekStart, 'yyyy-MM-dd');

        // Find weights from last week
        const lastWeekLogs = logsWithWeight.filter(
          (l) => l.date >= lastWeekStartStr && l.date <= lastWeekEndStr
        );

        if (lastWeekLogs.length >= 2) {
          const firstWeight = lastWeekLogs[0].weightKg ?? 0;
          const lastWeight = lastWeekLogs[lastWeekLogs.length - 1].weightKg ?? 0;
          if (!cancelled) {
            setLastWeekWeightChange(Number((lastWeight - firstWeight).toFixed(2)));
          }
        }

        // Estimate average calories from weekly data
        const lastWeekCalData = weeklyCaloriesData.filter(
          (d) => d.date >= lastWeekStartStr && d.date <= lastWeekEndStr
        );

        if (lastWeekCalData.length > 0) {
          const avgCals = lastWeekCalData.reduce((sum, d) => sum + d.calories, 0) / lastWeekCalData.length;
          if (!cancelled) {
            setLastWeekAvgCalories(Math.round(avgCals));
          }

          // Calculate recommended adjustment
          const targetCalories = profile.targetCalories ?? 0;
          if (targetCalories > 0 && lastWeekLogs.length >= 2) {
            const lastWeight = lastWeekLogs[lastWeekLogs.length - 1].weightKg ?? 0;
            const firstWeight = lastWeekLogs[0].weightKg ?? 0;
            const weeklyChange = lastWeight - firstWeight;

            let adjustment = 0;
            if (profile.goalType === 'cut') {
              // Ideal: lose 0.5-1% body weight per week
              const idealLoss = lastWeight * 0.007;
              if (weeklyChange > 0) {
                // Gained weight on a cut -- reduce
                adjustment = -200;
              } else if (Math.abs(weeklyChange) < idealLoss * 0.5) {
                // Losing too slowly
                adjustment = -100;
              } else if (Math.abs(weeklyChange) > idealLoss * 1.5) {
                // Losing too fast
                adjustment = 100;
              }
            } else if (profile.goalType === 'bulk') {
              const idealGain = lastWeight * 0.004;
              if (weeklyChange < 0) {
                // Lost weight on a bulk -- increase
                adjustment = 200;
              } else if (weeklyChange < idealGain * 0.5) {
                adjustment = 100;
              } else if (weeklyChange > idealGain * 2) {
                adjustment = -100;
              }
            }

            if (adjustment !== 0) {
              const newTarget = Math.round((targetCalories + adjustment) / 50) * 50;
              if (!cancelled) {
                setRecommendedCalories(newTarget);
              }
            }
          }
        }
      } catch {
        // silently fail
      }
    };

    loadReviewData();

    return () => {
      cancelled = true;
    };
  }, [profileId, profile, isMondayToday, bodyLogs, weeklyCaloriesData]);

  // Use store data if available, otherwise async loaded
  const consumedCalories = totalCalories > 0 ? totalCalories : todayCalories;
  const targetCalories = profile?.targetCalories ?? 0;
  const remaining = Math.max(0, targetCalories - consumedCalories);
  const progress = targetCalories > 0 ? consumedCalories / targetCalories : 0;

  // HealthKit activeEnergyBurned for the selected date (0 when opted out).
  const { calories: healthKitCalories, isActive: healthKitActive } =
    useHealthKitCalories(selectedDate);

  // Calculate daily burn (TDEE + workout, or HealthKit + manual workout
  // when HealthKit is active — calculateDailyBurn handles the branching).
  const dailyBurn = useMemo(() => {
    if (!profile) return 0;
    const { tdee } = calculateAllCalories(
      profile.currentWeightKg,
      profile.heightCm,
      profile.birthYear,
      profile.gender,
      profile.activityLevel,
      profile.goalType,
    );
    return calculateDailyBurn(
      tdee,
      todayWorkoutCalories,
      healthKitActive ? healthKitCalories : undefined,
    );
  }, [profile, todayWorkoutCalories, healthKitActive, healthKitCalories]);

  const calorieBalance = consumedCalories - dailyBurn;

  // Goal-aware coloring for balance
  const balanceColor = useMemo(() => {
    if (!profile) return colors.textPrimary;
    const goalType = profile.goalType;
    if (goalType === 'cut') {
      // Deficit is good for cutting
      return calorieBalance <= 0 ? colors.success : colors.warning;
    } else if (goalType === 'bulk') {
      // Surplus is good for bulking
      return calorieBalance >= 0 ? colors.success : colors.warning;
    }
    // maintain / recomp: close to zero is good
    return Math.abs(calorieBalance) <= 200 ? colors.success : colors.warning;
  }, [profile, calorieBalance, colors]);

  const targetProteinG = profile?.targetProteinG ?? 0;
  const targetFatG = profile?.targetFatG ?? 0;
  const targetCarbG = profile?.targetCarbG ?? 0;

  // Selected date workout check
  const selectedDateWorkout = todaySessions.some((session) => {
    const sessionDate = session.startedAt.substring(0, 10);
    return sessionDate === selectedDate;
  });

  const selectedDateFinishedSession = todaySessions.find((session) => {
    const sessionDate = session.startedAt.substring(0, 10);
    return sessionDate === selectedDate && session.finishedAt !== null;
  });

  // Weekly compliance data
  const nutritionCompliance = useMemo(() => {
    const weekCals = weeklyCaloriesData.map((d) => d.calories);
    return calculateNutritionCompliance(weekCals, targetCalories);
  }, [weeklyCaloriesData, targetCalories]);

  const trainingCompliance = useMemo(() => {
    return calculateTrainingCompliance(
      recentSessionCount,
      profile?.trainingDaysPerWeek ?? 3
    );
  }, [recentSessionCount, profile]);

  // Weekly progress dots (Mon to Sun)
  const weekDots = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const days = ['月', '火', '水', '木', '金', '土', '日'];

    // Build a map of date -> calories for the week
    const calMap = new Map<string, number>();
    weeklyCaloriesData.forEach((d) => {
      calMap.set(d.date, d.calories);
    });

    return days.map((label, i) => {
      const dayDate = addDays(weekStart, i);
      const dateStr = format(dayDate, 'yyyy-MM-dd');
      const cal = calMap.get(dateStr) ?? 0;
      const isFuture = dayDate > now && !isToday(dayDate);

      let dotColor: string;
      if (isFuture) {
        dotColor = colors.surfaceSecondary;
      } else if (cal === 0) {
        dotColor = colors.surfaceSecondary;
      } else if (targetCalories > 0) {
        const ratio = cal / targetCalories;
        if (ratio >= 0.8 && ratio <= 1.2) {
          dotColor = colors.success;
        } else if (ratio >= 0.5) {
          dotColor = colors.warning;
        } else {
          dotColor = colors.error;
        }
      } else {
        dotColor = cal > 0 ? colors.success : colors.surfaceSecondary;
      }

      return { label, dotColor, isToday: isToday(dayDate) };
    });
  }, [weeklyCaloriesData, targetCalories, colors]);

  // Recent weights for mini prediction chart
  const recentWeightsForPrediction = useMemo(() => {
    const cutoff = getISODate(subDays(new Date(), 30));
    return bodyLogs
      .filter((log) => log.date >= cutoff && log.weightKg !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((log) => ({ date: log.date, value: log.weightKg! }));
  }, [bodyLogs]);

  // Feedback colors
  const feedbackIconColor = FEEDBACK_COLORS[feedback.type]?.(colors) ?? colors.primary;
  const feedbackBg = FEEDBACK_BG[feedback.type]?.(colors) ?? colors.primary + '08';

  // Apply recommended calories
  const handleApplyRecommendation = useCallback(async () => {
    if (!profile || !recommendedCalories) return;
    setApplyingRecommendation(true);
    try {
      await updateProfileRepo(profile.id, { targetCalories: recommendedCalories });
      updateProfile({ targetCalories: recommendedCalories });
      setReviewDismissed(true);
      Alert.alert('更新完了', `目標カロリーを${recommendedCalories}kcalに更新しました`);
    } catch {
      Alert.alert('エラー', '更新に失敗しました');
    } finally {
      setApplyingRecommendation(false);
    }
  }, [profile, recommendedCalories, updateProfile]);

  if (isLoadingHome) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const showWeeklyReview =
    isMondayToday &&
    !reviewDismissed &&
    (lastWeekAvgCalories !== null || lastWeekWeightChange !== null);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>
              {getGreeting()}
            </Text>
          </View>
          <TrialBadge />
        </View>

        {/* Date Navigator */}
        <View style={{ marginBottom: spacing.sm }}>
          <DateNavigator
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            recordedDates={recordedDates}
          />
        </View>

        {/* Back to today button */}
        {!isViewingToday && (
          <TouchableOpacity
            style={[styles.backToToday, { backgroundColor: colors.primary + '15' }]}
            onPress={() => setSelectedDate(getISODate())}
          >
            <Ionicons name="today-outline" size={16} color={colors.primary} />
            <Text style={[styles.backToTodayText, { color: colors.primary }]}>
              今日に戻る
            </Text>
          </TouchableOpacity>
        )}

        {/* Weekly Review Card (Monday only) */}
        {showWeeklyReview && (
          <Card variant="elevated" style={{ backgroundColor: colors.primary + '08' }}>
            <View style={styles.reviewHeader}>
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              <Text style={[styles.reviewTitle, { color: colors.textPrimary }]}>
                先週のレビュー
              </Text>
            </View>
            <View style={styles.reviewContent}>
              {lastWeekAvgCalories !== null && (
                <View style={styles.reviewRow}>
                  <Text style={[styles.reviewLabel, { color: colors.textSecondary }]}>
                    平均摂取カロリー
                  </Text>
                  <Text style={[styles.reviewValue, { color: colors.textPrimary }]}>
                    {lastWeekAvgCalories} kcal
                  </Text>
                </View>
              )}
              {lastWeekWeightChange !== null && (
                <View style={styles.reviewRow}>
                  <Text style={[styles.reviewLabel, { color: colors.textSecondary }]}>
                    体重変化
                  </Text>
                  <Text
                    style={[
                      styles.reviewValue,
                      {
                        color:
                          lastWeekWeightChange === 0
                            ? colors.textPrimary
                            : profile?.goalType === 'cut'
                              ? lastWeekWeightChange < 0
                                ? colors.success
                                : colors.error
                              : profile?.goalType === 'bulk'
                                ? lastWeekWeightChange > 0
                                  ? colors.success
                                  : colors.error
                                : colors.textPrimary,
                      },
                    ]}
                  >
                    {lastWeekWeightChange >= 0 ? '+' : ''}
                    {lastWeekWeightChange.toFixed(2)} kg
                  </Text>
                </View>
              )}
              {recommendedCalories !== null && (
                <>
                  <View style={[styles.reviewDivider, { borderTopColor: colors.border }]} />
                  <Text style={[styles.recommendationText, { color: colors.textSecondary }]}>
                    来週は{recommendedCalories}kcalに調整しましょう
                  </Text>
                  <View style={styles.reviewActions}>
                    <Button
                      title="適用"
                      onPress={handleApplyRecommendation}
                      variant="primary"
                      size="sm"
                      loading={applyingRecommendation}
                    />
                    <Button
                      title="スキップ"
                      onPress={() => setReviewDismissed(true)}
                      variant="ghost"
                      size="sm"
                    />
                  </View>
                </>
              )}
              {recommendedCalories === null && (
                <View style={styles.reviewActions}>
                  <Button
                    title="閉じる"
                    onPress={() => setReviewDismissed(true)}
                    variant="ghost"
                    size="sm"
                  />
                </View>
              )}
            </View>
          </Card>
        )}

        {/* Calorie Summary Card */}
        <Card variant="elevated" style={styles.calorieCard}>
          <View style={styles.calorieContent}>
            <ProgressRing
              progress={progress}
              size={Math.round(screenWidth * 0.4)}
              strokeWidth={12}
              color={colors.calorie}
            >
              <Text style={[styles.remainingNumber, { color: colors.textPrimary }]}>
                {remaining}
              </Text>
              <Text style={[styles.remainingLabel, { color: colors.textSecondary }]}>
                残り kcal
              </Text>
            </ProgressRing>
            <View style={styles.calorieDetails}>
              <View style={styles.calorieRow}>
                <Text style={[styles.calorieLabel, { color: colors.textSecondary }]}>目標</Text>
                <Text style={[styles.calorieValue, { color: colors.textPrimary }]}>
                  {targetCalories}
                </Text>
              </View>
              <View style={styles.calorieRow}>
                <Text style={[styles.calorieLabel, { color: colors.textSecondary }]}>摂取</Text>
                <Text style={[styles.calorieValue, { color: colors.calorie }]}>
                  {consumedCalories}
                </Text>
              </View>
              <View style={styles.calorieRow}>
                <Text style={[styles.calorieLabel, { color: colors.textSecondary }]}>消費</Text>
                <Text style={[styles.calorieValue, { color: colors.primary }]}>
                  {dailyBurn}
                </Text>
              </View>
              {healthKitActive && healthKitCalories > 0 && (
                <View style={styles.calorieAttributionRow}>
                  <Ionicons
                    name="heart"
                    size={11}
                    color={colors.textTertiary}
                  />
                  <Text
                    style={[
                      styles.calorieAttributionText,
                      { color: colors.textTertiary },
                    ]}
                  >
                    Appleヘルスケアから取得
                  </Text>
                </View>
              )}
              <View style={[styles.calorieRow, styles.balanceRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.calorieLabel, { color: colors.textSecondary }]}>差引</Text>
                <Text style={[styles.calorieValue, { color: balanceColor }]}>
                  {calorieBalance >= 0 ? '+' : ''}{calorieBalance}
                </Text>
              </View>
            </View>
          </View>
        </Card>

        {/* PFC Bars */}
        <Card>
          <View style={styles.pfcContainer}>
            <ProgressBar
              progress={targetProteinG > 0 ? totalProteinG / targetProteinG : 0}
              color={colors.protein}
              label="タンパク質"
              valueText={`${Math.round(totalProteinG)} / ${targetProteinG} g`}
              height={8}
            />
            <ProgressBar
              progress={targetFatG > 0 ? totalFatG / targetFatG : 0}
              color={colors.fat}
              label="脂質"
              valueText={`${Math.round(totalFatG)} / ${targetFatG} g`}
              height={8}
            />
            <ProgressBar
              progress={targetCarbG > 0 ? totalCarbG / targetCarbG : 0}
              color={colors.carb}
              label="炭水化物"
              valueText={`${Math.round(totalCarbG)} / ${targetCarbG} g`}
              height={8}
            />
          </View>
          <TouchableOpacity
            style={styles.balanceLink}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/nutrition/balance',
                params: { mealType: 'daily', date: selectedDate },
              })
            }
            activeOpacity={0.7}
          >
            <Ionicons name="stats-chart" size={14} color={colors.primary} />
            <Text style={[styles.balanceLinkText, { color: colors.primary }]}>
              栄養バランスを見る
            </Text>
            <Ionicons name="chevron-forward" size={12} color={colors.primary} />
          </TouchableOpacity>
        </Card>

        {/* Workout Card */}
        <Card>
          <View style={styles.workoutCard}>
            <View style={styles.workoutHeader}>
              <View style={styles.workoutInfo}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  {isViewingToday ? '今日のワークアウト' : 'ワークアウト'}
                </Text>
                {selectedDateFinishedSession && (
                  <Badge
                    label="完了"
                    color={colors.success + '15'}
                    textColor={colors.success}
                  />
                )}
              </View>
            </View>
            {selectedDateFinishedSession ? (
              <View style={styles.workoutDone}>
                <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                <Text style={[styles.workoutDoneText, { color: colors.textSecondary }]}>
                  {selectedDateFinishedSession.durationSeconds
                    ? `${Math.round(selectedDateFinishedSession.durationSeconds / 60)}分 完了`
                    : 'トレーニング完了'}
                </Text>
              </View>
            ) : isViewingToday ? (
              <Button
                title="ワークアウト開始"
                onPress={() => router.push('/(tabs)/training/session')}
                variant="primary"
                fullWidth
              />
            ) : (
              <Text style={[styles.workoutDoneText, { color: colors.textSecondary }]}>
                記録なし
              </Text>
            )}
          </View>
        </Card>

        {/* Weekly Progress */}
        <Card>
          <View style={styles.weeklyHeader}>
            <Text
              style={[
                styles.sectionTitle,
                { color: colors.textPrimary },
              ]}
            >
              週間達成率
            </Text>
            <View style={styles.complianceBadges}>
              <Badge
                label={`食事 ${Math.round(nutritionCompliance * 100)}%`}
                color={nutritionCompliance >= 0.7 ? colors.success + '20' : colors.warning + '20'}
                textColor={nutritionCompliance >= 0.7 ? colors.success : colors.warning}
                size="sm"
              />
              <Badge
                label={`トレ ${Math.round(trainingCompliance * 100)}%`}
                color={trainingCompliance >= 0.7 ? colors.success + '20' : colors.warning + '20'}
                textColor={trainingCompliance >= 0.7 ? colors.success : colors.warning}
                size="sm"
              />
            </View>
          </View>
          <View style={styles.weekDots}>
            {weekDots.map((dot, i) => (
              <View key={i} style={styles.dayColumn}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: dot.dotColor },
                    dot.isToday && {
                      borderWidth: 2,
                      borderColor: colors.primary,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.dayLabel,
                    {
                      color: dot.isToday ? colors.primary : colors.textTertiary,
                    },
                  ]}
                >
                  {dot.label}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Goal Prediction Card (Feature B) */}
        <GoalPredictionCard prediction={goalPrediction} />

        {/* Adaptive Goal Card (Feature A) */}
        {adaptive.suggestion && (
          <AdaptiveGoalCard
            suggestion={adaptive.suggestion}
            bodyLogs={bodyLogs}
            onApprove={async () => {
              await adaptive.approve();
              updateProfile({ targetCalories: adaptive.suggestion?.suggestedCalorieTarget });
              setToast({ message: '目標を更新しました', type: 'success' });
            }}
            onDismiss={async () => {
              await adaptive.dismiss();
              setToast({ message: '次回も提案を表示します', type: 'info' });
            }}
          />
        )}

        {/* Weekly Report */}
        {weeklyReport && canUse('weeklyReport') && (
          <WeeklyReportCard
            report={weeklyReport}
            onPress={() => router.push('/(tabs)/progress/weekly-report')}
          />
        )}

        {/* Workout Suggestion */}
        {workoutSuggestion && canUse('workoutSuggestion') && (
          <WorkoutSuggestionCard
            suggestion={workoutSuggestion}
            onPress={() => router.push('/(tabs)/training')}
          />
        )}

        {/* Daily Feedback */}
        <Card style={{ backgroundColor: feedbackBg, borderLeftWidth: 3, borderLeftColor: feedbackIconColor }}>
          <View style={styles.feedbackRow}>
            <Ionicons
              name={feedback.icon as keyof typeof Ionicons.glyphMap}
              size={24}
              color={feedbackIconColor}
            />
            <Text style={[styles.feedbackText, { color: colors.textPrimary }]}>
              {feedback.message}
            </Text>
          </View>
        </Card>

        {/* Water tracker (Feature I) */}
        <WaterTrackerCard
          totalMl={water.totalMl}
          targetMl={water.targetMl}
          onAdd={water.addWater}
          onPress={() => router.push('/(tabs)/progress')}
        />

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <Toast
        message={toast?.message ?? ''}
        type={toast?.type ?? 'info'}
        visible={toast !== null}
        onHide={() => setToast(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxxl },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: { ...typography.bodyMedium },
  date: { ...typography.titleLarge },
  calorieCard: { overflow: 'hidden' },
  calorieContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
  },
  remainingNumber: { ...typography.numberLarge },
  remainingLabel: { ...typography.labelSmall },
  calorieDetails: { flex: 1, gap: spacing.md },
  calorieRow: { flexDirection: 'row', justifyContent: 'space-between' },
  balanceRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.xs, marginTop: spacing.xs },
  calorieLabel: { ...typography.bodyMedium },
  calorieValue: { ...typography.numberMedium },
  calorieAttributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: -4,
  },
  calorieAttributionText: {
    ...typography.labelSmall,
    fontSize: 10,
  },
  pfcContainer: { gap: spacing.lg },
  balanceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  balanceLinkText: {
    ...typography.labelMedium,
  },
  workoutCard: { gap: spacing.lg },
  workoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  workoutInfo: { gap: spacing.sm },
  workoutDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  workoutDoneText: { ...typography.bodyMedium },
  sectionTitle: { ...typography.titleSmall },
  weeklyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  complianceBadges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  weekDots: { flexDirection: 'row', justifyContent: 'space-around' },
  dayColumn: { alignItems: 'center', gap: spacing.xs },
  dot: { width: 32, height: 32, borderRadius: 16 },
  dayLabel: { ...typography.labelSmall },
  predictionContent: { marginVertical: spacing.md },
  predictionDays: { ...typography.displayMedium },
  predictionSub: { ...typography.bodySmall, marginTop: spacing.xs },
  miniChartContainer: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  feedbackText: { ...typography.bodyMedium, flex: 1 },
  // Weekly review
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  reviewTitle: { ...typography.titleSmall },
  reviewContent: { gap: spacing.sm },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewLabel: { ...typography.bodyMedium },
  reviewValue: { ...typography.numberSmall },
  reviewDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginVertical: spacing.xs,
  },
  recommendationText: {
    ...typography.bodyMedium,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  reviewActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  backToToday: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  backToTodayText: {
    ...typography.labelMedium,
    fontWeight: '600',
  },
  bottomSpacer: { height: spacing.xxxl },
});
