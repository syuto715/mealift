import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  StyleSheet,
  useColorScheme,
  Dimensions,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import {
  Card,
  Button,
  NumberInput,
  SegmentedControl,
  Badge,
  DateNavigator,
} from '../../../src/components/ui';
import { LineChart } from '../../../src/components/charts/LineChart';
import { PredictionChart } from '../../../src/components/progress/PredictionChart';
import { useBodyLogs } from '../../../src/hooks/useBodyLogs';
import { usePrediction } from '../../../src/hooks/usePrediction';
import { useProfileStore } from '../../../src/stores/profileStore';
import { formatWeight, formatDateRelative, formatDate } from '../../../src/utils/format';
import { subDays, parseISO, format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { getISODate } from '../../../src/utils/format';
import { NoteCategory } from '../../../src/types/common';
import * as noteRepo from '../../../src/infra/repositories/noteRepository';
import { getTodayWorkoutCalories, getRecordedSessionDates } from '../../../src/infra/repositories/workoutRepository';
import { getRecordedBodyLogDates, getBodyLogByDate } from '../../../src/infra/repositories/bodyLogRepository';
import { BodyLog } from '../../../src/types/bodyLog';
import { calculateAllCalories, calculateDailyBurn } from '../../../src/domain/calories';

const PERIOD_SEGMENTS = [
  { label: '1W', value: '1W' },
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '6M', value: '6M' },
  { label: '1Y', value: '1Y' },
];

const PERIOD_DAYS: Record<string, number> = {
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
};

const PACE_LABELS: Record<string, string> = {
  too_fast: '速すぎ',
  fast: 'やや速い',
  on_track: '順調',
  slow: 'やや遅い',
  too_slow: '遅すぎ',
};

const PACE_COLORS_MAP: Record<string, (colors: ReturnType<typeof getColors>) => { bg: string; text: string }> = {
  too_fast: (c) => ({ bg: c.error + '20', text: c.error }),
  fast: (c) => ({ bg: c.warning + '20', text: c.warning }),
  on_track: (c) => ({ bg: c.success + '20', text: c.success }),
  slow: (c) => ({ bg: c.warning + '20', text: c.warning }),
  too_slow: (c) => ({ bg: c.error + '20', text: c.error }),
};

const NOTE_CATEGORY_SEGMENTS = [
  { label: 'トレーニング', value: 'training' },
  { label: '栄養', value: 'nutrition' },
  { label: '体調', value: 'condition' },
  { label: '全般', value: 'general' },
];

const NOTE_CATEGORY_LABELS: Record<NoteCategory, string> = {
  training: 'トレーニング',
  nutrition: '栄養',
  condition: '体調',
  general: '全般',
};

const NOTE_CATEGORY_COLORS: Record<NoteCategory, (c: ReturnType<typeof getColors>) => { bg: string; text: string }> = {
  training: (c) => ({ bg: c.primary + '20', text: c.primary }),
  nutrition: (c) => ({ bg: c.success + '20', text: c.success }),
  condition: (c) => ({ bg: c.warning + '20', text: c.warning }),
  general: (c) => ({ bg: c.textTertiary + '20', text: c.textSecondary }),
};

export default function ProgressScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = screenWidth - spacing.lg * 2 - spacing.xl * 2;

  const { logs, todayLog, avg7d, weightChange14d, isLoading, recordWeight } = useBodyLogs();
  const { prediction, hasEnoughData, daysNeeded } = usePrediction();

  // Date navigation
  const [selectedDate, setSelectedDate] = useState(getISODate());
  const [recordedDates, setRecordedDates] = useState<string[]>([]);
  const [selectedDateLog, setSelectedDateLog] = useState<BodyLog | null>(null);
  const isViewingToday = selectedDate === getISODate();

  const [period, setPeriod] = useState('1M');
  const [weight, setWeight] = useState<number | null>(
    todayLog?.weightKg ?? profile?.currentWeightKg ?? null
  );
  const [bodyFat, setBodyFat] = useState<number | null>(todayLog?.bodyFatPct ?? null);
  const [memo, setMemo] = useState(todayLog?.note ?? '');
  const [isSaving, setIsSaving] = useState(false);

  // Calorie burn state
  const [todayWorkoutCal, setTodayWorkoutCal] = useState(0);

  // Load recorded dates for DateNavigator
  useEffect(() => {
    if (!profile?.id) return;
    const monthPrefix = selectedDate.substring(0, 7);
    Promise.all([
      getRecordedBodyLogDates(profile.id, monthPrefix),
      getRecordedSessionDates(profile.id, monthPrefix),
    ]).then(([bodyDates, sessionDates]) => {
      setRecordedDates([...new Set([...bodyDates, ...sessionDates])]);
    }).catch(() => {});
  }, [profile?.id, selectedDate]);

  // Load selected date's body log + workout calories
  useEffect(() => {
    if (!profile?.id) return;
    getBodyLogByDate(profile.id, selectedDate).then((log) => {
      setSelectedDateLog(log);
      if (log) {
        if (log.weightKg !== null) setWeight(log.weightKg);
        if (log.bodyFatPct !== null) setBodyFat(log.bodyFatPct);
        setMemo(log.note ?? '');
      } else {
        setWeight(profile?.currentWeightKg ?? null);
        setBodyFat(null);
        setMemo('');
      }
    }).catch(() => {});
    getTodayWorkoutCalories(profile.id, selectedDate).then(setTodayWorkoutCal).catch(() => {});
  }, [profile?.id, selectedDate]);

  const calorieBreakdown = useMemo(() => {
    if (!profile) return null;
    const { bmr, tdee } = calculateAllCalories(
      profile.currentWeightKg,
      profile.heightCm,
      profile.birthYear,
      profile.gender,
      profile.activityLevel,
      profile.goalType,
    );
    const totalBurn = calculateDailyBurn(tdee, todayWorkoutCal);
    return { bmr, tdee, workoutCal: todayWorkoutCal, totalBurn };
  }, [profile, todayWorkoutCal]);

  // Notes state
  const [noteCategory, setNoteCategory] = useState<string>('training');
  const [newNoteText, setNewNoteText] = useState('');
  const [notes, setNotes] = useState<noteRepo.Note[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);

  // Update defaults when todayLog changes (only when viewing today)
  useEffect(() => {
    if (todayLog && isViewingToday) {
      if (todayLog.weightKg !== null) setWeight(todayLog.weightKg);
      if (todayLog.bodyFatPct !== null) setBodyFat(todayLog.bodyFatPct);
      if (todayLog.note) setMemo(todayLog.note);
    }
  }, [todayLog, isViewingToday]);

  // Load notes
  const loadNotes = useCallback(async () => {
    if (!profile) return;
    setIsLoadingNotes(true);
    try {
      const category = noteCategory as NoteCategory;
      const result = await noteRepo.getNotesByCategory(profile.id, category);
      setNotes(result);
    } catch {
      // silently fail
    } finally {
      setIsLoadingNotes(false);
    }
  }, [profile, noteCategory]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Filter logs by selected period
  const filteredLogs = useMemo(() => {
    const days = PERIOD_DAYS[period] ?? 30;
    const cutoff = getISODate(subDays(new Date(), days));
    return logs
      .filter((log) => log.date >= cutoff && log.weightKg !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [logs, period]);

  // Chart data points
  const chartData = useMemo(() => {
    return filteredLogs.map((log) => ({
      date: log.date,
      value: log.weightKg!,
    }));
  }, [filteredLogs]);

  // Calculate 7-day moving average for chart
  const movingAverageData = useMemo(() => {
    const allSorted = logs
      .filter((log) => log.weightKg !== null)
      .sort((a, b) => a.date.localeCompare(b.date));

    const days = PERIOD_DAYS[period] ?? 30;
    const cutoff = getISODate(subDays(new Date(), days));

    const result: { date: string; value: number }[] = [];

    for (let i = 0; i < allSorted.length; i++) {
      const current = allSorted[i];
      if (current.date < cutoff) continue;

      // Look back up to 7 entries
      const windowStart = Math.max(0, i - 6);
      const window = allSorted.slice(windowStart, i + 1);
      const avg =
        window.reduce((sum, log) => sum + (log.weightKg ?? 0), 0) / window.length;
      result.push({ date: current.date, value: Number(avg.toFixed(1)) });
    }

    return result;
  }, [logs, period]);

  // Recent weights for prediction chart (last 30 days)
  const recentWeightsForPrediction = useMemo(() => {
    const cutoff = getISODate(subDays(new Date(), 30));
    return logs
      .filter((log) => log.date >= cutoff && log.weightKg !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((log) => ({ date: log.date, value: log.weightKg! }));
  }, [logs]);

  const handleRecord = useCallback(async () => {
    if (weight === null) {
      Alert.alert('入力エラー', '体重を入力してください');
      return;
    }
    setIsSaving(true);
    try {
      await recordWeight(weight, bodyFat, memo || null, selectedDate);

      // Refresh selected date log
      if (profile?.id) {
        getBodyLogByDate(profile.id, selectedDate).then(setSelectedDateLog).catch(() => {});
      }

      // If there's a memo, also create a condition note
      if (memo.trim() && profile) {
        try {
          await noteRepo.createNote(
            profile.id,
            selectedDate,
            'condition',
            memo.trim(),
          );
          // Refresh notes if currently viewing condition category
          if (noteCategory === 'condition') {
            loadNotes();
          }
        } catch {
          // silently fail - body log already saved
        }
      }
    } finally {
      setIsSaving(false);
    }
  }, [weight, bodyFat, memo, recordWeight, profile, noteCategory, loadNotes, selectedDate]);

  const handleAddNote = useCallback(async () => {
    if (!newNoteText.trim() || !profile) return;
    setIsAddingNote(true);
    try {
      await noteRepo.createNote(
        profile.id,
        getISODate(),
        noteCategory as NoteCategory,
        newNoteText.trim(),
      );
      setNewNoteText('');
      await loadNotes();
    } catch {
      Alert.alert('エラー', 'メモの追加に失敗しました');
    } finally {
      setIsAddingNote(false);
    }
  }, [newNoteText, profile, noteCategory, loadNotes]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    Alert.alert('メモを削除', 'このメモを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            await noteRepo.deleteNote(noteId);
            await loadNotes();
          } catch {
            Alert.alert('エラー', 'メモの削除に失敗しました');
          }
        },
      },
    ]);
  }, [loadNotes]);

  // Recent records (last 10)
  const recentRecords = useMemo(() => {
    return logs
      .filter((log) => log.weightKg !== null)
      .slice(0, 10);
  }, [logs]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>記録</Text>

        {/* Date Navigator */}
        <DateNavigator
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          recordedDates={recordedDates}
        />

        {/* Back to today */}
        {!isViewingToday && (
          <TouchableOpacity
            style={[styles.backToToday, { backgroundColor: colors.primary + '15' }]}
            onPress={() => setSelectedDate(getISODate())}
          >
            <Ionicons name="today-outline" size={16} color={colors.primary} />
            <Text style={[styles.backToTodayText, { color: colors.primary }]}>今日に戻る</Text>
          </TouchableOpacity>
        )}

        {/* Weight input */}
        <Card variant="elevated">
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            {isViewingToday ? '今日の体重' : `${format(parseISO(selectedDate), 'M/d')}の体重`}
          </Text>
          {selectedDateLog?.weightKg != null ? (
            <Text style={[styles.currentWeight, { color: colors.primary }]}>
              {formatWeight(selectedDateLog.weightKg)}
            </Text>
          ) : (
            <View>
              <Text style={[styles.currentWeight, { color: colors.textTertiary }]}>未記録</Text>
              <Text style={[styles.unrecordedHint, { color: colors.textSecondary }]}>
                体重を記録して変化を追いましょう
              </Text>
            </View>
          )}
          <View style={styles.inputSection}>
            <View style={styles.weightRow}>
              <View style={styles.inputFlex}>
                <NumberInput
                  value={weight}
                  onValueChange={setWeight}
                  step={0.1}
                  decimals={1}
                  suffix="kg"
                  min={20}
                  max={300}
                />
              </View>
              <Button
                title="記録"
                onPress={handleRecord}
                variant="primary"
                size="md"
                loading={isSaving}
                disabled={weight === null}
              />
            </View>
            <NumberInput
              value={bodyFat}
              onValueChange={setBodyFat}
              step={0.1}
              decimals={1}
              suffix="%"
              label="体脂肪率（任意）"
              min={1}
              max={60}
            />
            <View style={styles.memoContainer}>
              <Text style={[styles.memoLabel, { color: colors.textSecondary }]}>メモ（任意）</Text>
              <TextInput
                style={[
                  styles.memoInput,
                  {
                    color: colors.textPrimary,
                    backgroundColor: colors.surfaceSecondary,
                    borderRadius: radius.md,
                  },
                ]}
                value={memo}
                onChangeText={setMemo}
                placeholder="体調やコンディションなど"
                placeholderTextColor={colors.textTertiary}
                maxLength={100}
              />
            </View>
          </View>
        </Card>

        {/* Weight chart */}
        <Card>
          <View style={styles.chartHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>体重推移</Text>
            {avg7d !== null && (
              <Badge label={`7日平均: ${avg7d.toFixed(1)} kg`} />
            )}
          </View>
          <SegmentedControl
            segments={PERIOD_SEGMENTS}
            selectedValue={period}
            onValueChange={setPeriod}
          />
          <View style={styles.chartContainer}>
            {chartData.length > 0 ? (
              <LineChart
                data={chartData}
                movingAverage={movingAverageData}
                targetValue={profile?.targetWeightKg ?? undefined}
                width={chartWidth}
                height={200}
                color={colors.primary}
                averageColor={colors.warning}
                targetColor={colors.success}
                backgroundColor="transparent"
                labelColor={colors.textTertiary}
                gridColor={colors.border}
              />
            ) : (
              <View
                style={[
                  styles.chartPlaceholder,
                  { backgroundColor: colors.surfaceSecondary },
                ]}
              >
                <Text style={[styles.chartText, { color: colors.textTertiary }]}>
                  データがありません
                </Text>
              </View>
            )}
          </View>
        </Card>

        {/* Prediction Chart */}
        {prediction !== null && avg7d !== null && profile?.targetWeightKg != null && recentWeightsForPrediction.length > 0 && (
          <Card>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              目標到達予測チャート
            </Text>
            <View style={styles.chartContainer}>
              <PredictionChart
                currentWeight={avg7d}
                targetWeight={profile.targetWeightKg}
                prediction={prediction}
                recentWeights={recentWeightsForPrediction}
                width={chartWidth}
                height={220}
              />
            </View>
          </Card>
        )}

        {/* Prediction */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>目標到達予測</Text>
          {prediction !== null ? (
            <>
              <View style={styles.predictionRow}>
                <View>
                  <Text style={[styles.predictionDays, { color: colors.primary }]}>
                    あと {prediction.standard.days} 日
                  </Text>
                  <Text style={[styles.predictionSub, { color: colors.textSecondary }]}>
                    {format(parseISO(prediction.standard.date), 'yyyy年M月d日', { locale: ja })}到達見込み
                  </Text>
                </View>
                {(() => {
                  const paceStyle = PACE_COLORS_MAP[prediction.paceLabel]?.(colors) ?? {
                    bg: colors.success + '20',
                    text: colors.success,
                  };
                  return (
                    <Badge
                      label={PACE_LABELS[prediction.paceLabel] ?? '標準'}
                      color={paceStyle.bg}
                      textColor={paceStyle.text}
                      size="md"
                    />
                  );
                })()}
              </View>
              <View style={styles.predictionRange}>
                <View style={styles.predictionRangeItem}>
                  <Text style={[styles.rangeLabel, { color: colors.success }]}>楽観</Text>
                  <Text style={[styles.rangeText, { color: colors.textSecondary }]}>
                    {prediction.optimistic.days}日
                  </Text>
                  <Text style={[styles.rangeDateText, { color: colors.textTertiary }]}>
                    {format(parseISO(prediction.optimistic.date), 'M/d', { locale: ja })}
                  </Text>
                </View>
                <View style={styles.predictionRangeItem}>
                  <Text style={[styles.rangeLabel, { color: colors.warning }]}>慎重</Text>
                  <Text style={[styles.rangeText, { color: colors.textSecondary }]}>
                    {prediction.conservative.days}日
                  </Text>
                  <Text style={[styles.rangeDateText, { color: colors.textTertiary }]}>
                    {format(parseISO(prediction.conservative.date), 'M/d', { locale: ja })}
                  </Text>
                </View>
              </View>
              {weightChange14d !== null && (
                <Text style={[styles.weeklyRate, { color: colors.textSecondary }]}>
                  週間変化: {prediction.weeklyRate >= 0 ? '+' : ''}
                  {prediction.weeklyRate.toFixed(2)} kg/週
                </Text>
              )}
            </>
          ) : (
            <View style={styles.noDataContainer}>
              {!hasEnoughData ? (
                <Text style={[styles.noDataText, { color: colors.textSecondary }]}>
                  あと{daysNeeded}日分の体重データが必要です
                </Text>
              ) : profile?.targetWeightKg == null ? (
                <Text style={[styles.noDataText, { color: colors.textSecondary }]}>
                  目標体重を設定してください
                </Text>
              ) : (
                <Text style={[styles.noDataText, { color: colors.textSecondary }]}>
                  予測を計算できません
                </Text>
              )}
            </View>
          )}
        </Card>

        {/* Calorie burn breakdown */}
        {calorieBreakdown && (
          <Card>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {isViewingToday ? '今日の消費カロリー' : `${format(parseISO(selectedDate), 'M/d')}の消費カロリー`}
            </Text>
            <View style={styles.burnGrid}>
              <View style={styles.burnItem}>
                <Text style={[styles.burnValue, { color: colors.textPrimary }]}>
                  {calorieBreakdown.bmr}
                </Text>
                <Text style={[styles.burnLabel, { color: colors.textSecondary }]}>BMR</Text>
              </View>
              <View style={styles.burnItem}>
                <Text style={[styles.burnValue, { color: colors.textPrimary }]}>
                  {calorieBreakdown.tdee}
                </Text>
                <Text style={[styles.burnLabel, { color: colors.textSecondary }]}>TDEE</Text>
              </View>
              <View style={styles.burnItem}>
                <Text style={[styles.burnValue, { color: colors.calorie }]}>
                  {calorieBreakdown.workoutCal}
                </Text>
                <Text style={[styles.burnLabel, { color: colors.textSecondary }]}>ワークアウト</Text>
              </View>
              <View style={styles.burnItem}>
                <Text style={[styles.burnValue, { color: colors.primary }]}>
                  {calorieBreakdown.totalBurn}
                </Text>
                <Text style={[styles.burnLabel, { color: colors.textSecondary }]}>合計消費</Text>
              </View>
            </View>
            <View style={[styles.healthKitStatus, { backgroundColor: colors.surfaceSecondary }]}>
              <Ionicons name="heart-outline" size={16} color={colors.textTertiary} />
              <Text style={[styles.healthKitText, { color: colors.textTertiary }]}>
                ヘルスケア連携: 未接続（設定から有効化）
              </Text>
            </View>
          </Card>
        )}

        {/* Recent records */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>最近の記録</Text>
          {recentRecords.length > 0 ? (
            <View style={styles.recordsList}>
              {recentRecords.map((log) => (
                <View
                  key={log.id}
                  style={[styles.recordRow, { borderBottomColor: colors.border }]}
                >
                  <View style={styles.recordLeft}>
                    <Text style={[styles.recordDate, { color: colors.textPrimary }]}>
                      {formatDateRelative(log.date)}
                    </Text>
                    {log.note && (
                      <Text
                        style={[styles.recordNote, { color: colors.textTertiary }]}
                        numberOfLines={1}
                      >
                        {log.note}
                      </Text>
                    )}
                  </View>
                  <View style={styles.recordRight}>
                    <Text style={[styles.recordWeight, { color: colors.textPrimary }]}>
                      {log.weightKg !== null ? `${log.weightKg.toFixed(1)} kg` : '-'}
                    </Text>
                    {log.bodyFatPct !== null && (
                      <Text style={[styles.recordBodyFat, { color: colors.textSecondary }]}>
                        {log.bodyFatPct.toFixed(1)}%
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.noDataText, { color: colors.textTertiary }]}>
              まだ記録がありません
            </Text>
          )}
        </Card>

        {/* Notes section */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>メモ</Text>

          {/* Category filter */}
          <SegmentedControl
            segments={NOTE_CATEGORY_SEGMENTS}
            selectedValue={noteCategory}
            onValueChange={setNoteCategory}
          />

          {/* New note input */}
          <View style={styles.noteInputContainer}>
            <TextInput
              style={[
                styles.noteInput,
                {
                  color: colors.textPrimary,
                  backgroundColor: colors.surfaceSecondary,
                  borderRadius: radius.md,
                },
              ]}
              value={newNoteText}
              onChangeText={setNewNoteText}
              placeholder="メモを追加..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              maxLength={500}
            />
            <Button
              title="追加"
              onPress={handleAddNote}
              variant="primary"
              size="md"
              disabled={!newNoteText.trim()}
              loading={isAddingNote}
            />
          </View>

          {/* Notes list */}
          {isLoadingNotes ? (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={styles.notesLoading}
            />
          ) : notes.length > 0 ? (
            <View style={styles.notesList}>
              {notes.map((note) => {
                const catColors = NOTE_CATEGORY_COLORS[note.category]?.(colors) ?? {
                  bg: colors.textTertiary + '20',
                  text: colors.textSecondary,
                };
                return (
                  <View
                    key={note.id}
                    style={[styles.noteItem, { borderBottomColor: colors.border }]}
                  >
                    <View style={styles.noteItemHeader}>
                      <View style={styles.noteItemMeta}>
                        <Text style={[styles.noteDate, { color: colors.textTertiary }]}>
                          {formatDateRelative(note.date)}
                        </Text>
                        <Badge
                          label={NOTE_CATEGORY_LABELS[note.category]}
                          color={catColors.bg}
                          textColor={catColors.text}
                          size="sm"
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => handleDeleteNote(note.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.textTertiary} />
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.noteContent, { color: colors.textPrimary }]}>
                      {note.content}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.noNotesText, { color: colors.textTertiary }]}>
              メモがありません
            </Text>
          )}
        </Card>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxxl },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.titleLarge },
  sectionTitle: { ...typography.titleSmall, marginBottom: spacing.md },
  currentWeight: { ...typography.numberLarge, marginBottom: spacing.md },
  inputSection: { gap: spacing.md },
  weightRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  inputFlex: { flex: 1 },
  memoContainer: { gap: spacing.xs },
  memoLabel: { ...typography.labelMedium },
  memoInput: {
    ...typography.bodyMedium,
    height: 44,
    paddingHorizontal: spacing.lg,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  chartContainer: { marginTop: spacing.md, alignItems: 'center' },
  chartPlaceholder: {
    height: 200,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  chartText: { ...typography.bodyMedium },
  unrecordedHint: { ...typography.bodySmall, textAlign: 'center', marginTop: -spacing.sm },
  predictionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  predictionDays: { ...typography.displayMedium },
  predictionSub: { ...typography.bodySmall, marginTop: spacing.xs },
  predictionRange: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  predictionRangeItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  rangeLabel: { ...typography.labelMedium },
  rangeText: { ...typography.numberSmall },
  rangeDateText: { ...typography.bodySmall },
  weeklyRate: { ...typography.bodySmall, marginTop: spacing.sm },
  noDataContainer: { paddingVertical: spacing.lg, alignItems: 'center' },
  noDataText: { ...typography.bodyMedium, textAlign: 'center' },
  recordsList: { gap: 0 },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recordLeft: { flex: 1, gap: spacing.xs },
  recordRight: { alignItems: 'flex-end', gap: spacing.xs },
  recordDate: { ...typography.bodyMedium },
  recordNote: { ...typography.bodySmall },
  recordWeight: { ...typography.numberSmall },
  recordBodyFat: { ...typography.bodySmall },
  // Notes section
  noteInputContainer: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  noteInput: {
    ...typography.bodyMedium,
    minHeight: 80,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  notesLoading: {
    paddingVertical: spacing.xl,
  },
  notesList: {
    marginTop: spacing.md,
  },
  noteItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  noteItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noteItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  noteDate: {
    ...typography.labelSmall,
  },
  noteContent: {
    ...typography.bodyMedium,
  },
  noNotesText: {
    ...typography.bodySmall,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  // Calorie burn section
  burnGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  burnItem: {
    width: '46%',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  burnValue: {
    ...typography.numberLarge,
    fontSize: 24,
  },
  burnLabel: {
    ...typography.labelSmall,
    marginTop: spacing.xs,
  },
  healthKitStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.md,
  },
  healthKitText: {
    ...typography.bodySmall,
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
