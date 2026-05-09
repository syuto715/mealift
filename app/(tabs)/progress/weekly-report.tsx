import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  Modal as RNModal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, ProgressRing, Button } from '../../../src/components/ui';
import { canUse } from '../../../src/infra/services/subscriptionService';
import { useSubscription } from '../../../src/hooks/useSubscription';
import { useProfileStore } from '../../../src/stores/profileStore';
import {
  WeeklyReportData,
  WeeklyNarrative,
} from '../../../src/types/weeklyReport';
import {
  generateWeeklyReport,
  saveNarrativeToReport,
  getNarrativeFromReport,
} from '../../../src/domain/weeklyReport';
import {
  generateAIWeeklyReport,
  AIWeeklyReportError,
  ERROR_MESSAGE_BY_CODE as AI_ERROR_MESSAGE_BY_CODE,
} from '../../../src/infra/services/aiWeeklyReportService';
import { supabase } from '../../../src/infra/supabase/client';
import { getFeaturesForTier } from '../../../src/infra/services/subscriptionService';

function ScoreRing({
  score,
  label,
  color,
  size = 64,
}: {
  score: number;
  label: string;
  color: string;
  size?: number;
}) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  return (
    <View style={ringStyles.container}>
      <ProgressRing progress={score / 100} size={size} strokeWidth={5} color={color} />
      <Text style={[ringStyles.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.xs },
  label: { ...typography.labelSmall },
});

// Loading-stage breakpoints mirror Phase 6 ai-menu screen so the
// progressive copy stays consistent across every AI generation flow
// in the app.
const LOADING_STAGE_2_MS = 5_000;
const LOADING_STAGE_3_MS = 15_000;
const LOADING_STAGE_4_MS = 30_000;

function utcMonthStartISO(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  ).toISOString();
}

export default function WeeklyReportScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);
  const hasDetailAccess = canUse('weeklyReport');
  // Phase 1.4 — separate gate for the AI narrative. Trial users get
  // Plus access via hasFeature (Phase 9.1 lesson) so canUse won't
  // do here; useSubscription is the right call.
  const sub = useSubscription();
  const aiNarrativeUnlocked = sub.hasFeature('aiWeeklyReport');

  // autoGenerate=1 from the weekly-report push notification deep
  // link triggers a one-shot generate on mount. Consumed flag-style
  // so navigating away + back doesn't re-trigger.
  const params = useLocalSearchParams<{ autoGenerate?: string }>();
  const autoGenerateRequested = params.autoGenerate === '1';
  const autoGenerateConsumedRef = useRef(false);

  const [report, setReport] = useState<WeeklyReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(true);

  const [narrative, setNarrative] = useState<WeeklyNarrative | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loadingStage, setLoadingStage] = useState<1 | 2 | 3 | 4>(1);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [quotaUsed, setQuotaUsed] = useState<number | null>(null);

  // Codex review pass 1 / Critical #1 — autoGenerate must wait until
  // both narrative-from-DB and quota-from-server have settled,
  // otherwise it can fire on a stale `null` narrative + null quota
  // and double-spend a Plus quota slot for a week the user already
  // has a saved summary for.
  const [narrativeChecked, setNarrativeChecked] = useState(false);
  const [quotaChecked, setQuotaChecked] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const stageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Phase 1.2 quota number is the Plus or Pro tier's limit. Pull it
  // from getFeaturesForTier(sub.tier) so the badge tracks the active
  // plan (Plus → 4, Pro → 12, Free has no limit display).
  const monthlyLimit = useMemo(() => {
    return getFeaturesForTier(sub.tier).aiWeeklyReportLimit;
  }, [sub.tier]);
  const quotaRemaining =
    quotaUsed != null && monthlyLimit > 0
      ? Math.max(0, monthlyLimit - quotaUsed)
      : null;

  const loadingMessage =
    loadingStage === 1
      ? 'AI が今週のデータを分析しています...'
      : loadingStage === 2
        ? 'もうしばらくかかります...'
        : loadingStage === 3
          ? '処理に時間がかかっています。ネットワーク状況を確認してください'
          : 'タイムアウト目前です。中止して再試行できます';

  const fetchQuota = useCallback(async () => {
    if (!profile?.id || !supabase || !aiNarrativeUnlocked) {
      setQuotaUsed(null);
      // Codex pass 1 / Critical #1 — mark quota as resolved (with
      // null = unknown) so autoGenerate doesn't block forever when
      // the user is on Free or supabase is unconfigured.
      setQuotaChecked(true);
      return;
    }
    const monthStart = utcMonthStartISO(new Date());
    const { count, error } = await supabase
      .from('ai_usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('function_name', 'generate-weekly-report')
      .eq('response_status', 200)
      .gte('created_at', monthStart);
    if (error) {
      setQuotaUsed(null);
      setQuotaChecked(true);
      return;
    }
    setQuotaUsed(count ?? 0);
    setQuotaChecked(true);
  }, [profile?.id, aiNarrativeUnlocked]);

  useFocusEffect(
    useCallback(() => {
      void fetchQuota();
    }, [fetchQuota]),
  );

  // Load the rule-based report + any persisted narrative once the
  // profile id is known. The narrative is loaded as a separate read
  // because the screen renders the rule-based half even when the
  // user is on Free.
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await generateWeeklyReport(profile.id);
        if (cancelled) return;
        setReport(r);
        const persisted = await getNarrativeFromReport(profile.id, r.weekStart);
        if (cancelled) return;
        if (persisted) setNarrative(persisted);
      } catch {
        // silent — empty-state UI handles report===null
      } finally {
        if (!cancelled) {
          setReportLoading(false);
          // Codex pass 1 / Critical #1 — set narrativeChecked=true
          // exactly once the persistence read has either resolved or
          // failed. autoGenerate's effect waits on this signal so
          // the "no narrative cached" branch can't fire while the
          // DB is still being read.
          setNarrativeChecked(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  // Cleanup in-flight generation + stage timers on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      for (const t of stageTimersRef.current) clearTimeout(t);
      stageTimersRef.current = [];
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!profile?.id || !report) return;
    if (generating) return;
    if (quotaRemaining != null && quotaRemaining <= 0) {
      setGenerateError(AI_ERROR_MESSAGE_BY_CODE.quota_exceeded);
      return;
    }

    setGenerateError(null);
    setGenerating(true);
    setLoadingStage(1);

    for (const t of stageTimersRef.current) clearTimeout(t);
    stageTimersRef.current = [
      setTimeout(() => setLoadingStage(2), LOADING_STAGE_2_MS),
      setTimeout(() => setLoadingStage(3), LOADING_STAGE_3_MS),
      setTimeout(() => setLoadingStage(4), LOADING_STAGE_4_MS),
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    // Codex pass 1 / Important #2 — when a narrative is already on
    // screen the user pressing the button is asking for a fresh one,
    // so bypass the cache (cache: undefined) so the EF actually
    // runs. First-time generation can still cache-hit (e.g. another
    // tab generated for this week earlier in the same install).
    const isRegenerate = narrative !== null;
    const cacheArgs = isRegenerate
      ? undefined
      : { profileId: profile.id, goalType: profile.goalType ?? null };

    try {
      const result = await generateAIWeeklyReport(
        { weekStart: report.weekStart, reportData: report },
        {
          planStatus: sub.status,
          signal: controller.signal,
          cache: cacheArgs,
        },
      );
      setNarrative(result.narrative);
      // Persist locally so a cold start with the same week still
      // shows the narrative without re-spending quota.
      try {
        await saveNarrativeToReport(
          profile.id,
          report.weekStart,
          result.narrative,
        );
      } catch {
        // Persistence failure is non-fatal — the in-memory state
        // already shows the narrative for this session.
      }
      // Codex pass 1 / Important #2 — only optimistically advance
      // the quota badge when the EF actually ran. A cache hit means
      // no ai_usage_logs row was created server-side.
      if (!result.fromCache) {
        setQuotaUsed((prev) => (prev == null ? prev : prev + 1));
      }
    } catch (err) {
      const code = err instanceof AIWeeklyReportError ? err.code : 'internal_error';
      const message =
        err instanceof AIWeeklyReportError
          ? err.message
          : AI_ERROR_MESSAGE_BY_CODE.internal_error;
      // 'aborted' is user-initiated — don't surface as an error toast
      // since the user already knows they cancelled.
      if (code !== 'aborted') {
        setGenerateError(message);
      }
    } finally {
      for (const t of stageTimersRef.current) clearTimeout(t);
      stageTimersRef.current = [];
      abortRef.current = null;
      setGenerating(false);
    }
  }, [
    profile?.id,
    profile?.goalType,
    report,
    narrative,
    generating,
    quotaRemaining,
    sub.status,
  ]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // autoGenerate one-shot trigger. Skips when:
  //   - already consumed (back-navigation / re-mount)
  //   - the rule-based report hasn't loaded yet (no payload to send)
  //   - either the persisted-narrative read OR the quota fetch is
  //     still in flight (Codex pass 1 / Critical #1: firing in the
  //     intermediate "narrative=null, quota=null" render would
  //     double-spend a Plus quota slot for a week that already has
  //     a saved narrative)
  //   - the user already has a narrative for this week (cache hit
  //     from the persisted layer; saving the round-trip)
  //   - the user can't actually generate (Free tier — let the upgrade
  //     banner do its job instead of bouncing them off a quota
  //     error)
  useEffect(() => {
    if (!autoGenerateRequested) return;
    if (autoGenerateConsumedRef.current) return;
    if (!report || !aiNarrativeUnlocked) return;
    if (!narrativeChecked || !quotaChecked) return;
    if (narrative) {
      autoGenerateConsumedRef.current = true;
      return;
    }
    if (quotaRemaining != null && quotaRemaining <= 0) {
      autoGenerateConsumedRef.current = true;
      return;
    }
    autoGenerateConsumedRef.current = true;
    void handleGenerate();
  }, [
    autoGenerateRequested,
    report,
    aiNarrativeUnlocked,
    narrative,
    narrativeChecked,
    quotaChecked,
    quotaRemaining,
    handleGenerate,
  ]);

  if (reportLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!report) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>週次レポート</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            レポートデータがありません
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const overallColor =
    report.overallScore >= 70
      ? colors.success
      : report.overallScore >= 40
        ? colors.warning
        : colors.error;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>週次レポート</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.dateRange, { color: colors.textSecondary }]}>
          {report.weekStart} ~ {report.weekEnd}
        </Text>

        {/* Overall Score */}
        <Card>
          <View style={styles.overallSection}>
            <ProgressRing
              progress={report.overallScore / 100}
              size={100}
              strokeWidth={8}
              color={overallColor}
            />
            <View style={styles.overallText}>
              <Text style={[styles.overallLabel, { color: colors.textSecondary }]}>
                総合スコア
              </Text>
              <Text style={[styles.overallMessage, { color: colors.textPrimary }]}>
                {report.overallScore >= 70
                  ? '素晴らしい一週間でした！'
                  : report.overallScore >= 40
                    ? 'まずまずの一週間でした。'
                    : '来週は頑張りましょう！'}
              </Text>
            </View>
          </View>
        </Card>

        {/* Score Breakdown */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            スコア内訳
          </Text>
          <View style={styles.scoresRow}>
            <ScoreRing score={report.consistencyScore} label="記録" color={colors.primary} />
            <ScoreRing score={report.nutritionScore} label="食事" color={colors.success} />
            <ScoreRing score={report.trainingScore} label="筋トレ" color={colors.accent} />
          </View>
        </Card>

        {/* Phase 1.4 — AI narrative section. Plus-tier-and-up; Free
            sees an upgrade promo Card that mirrors Phase 9.1's
            session.tsx pattern. */}
        {aiNarrativeUnlocked ? (
          <AINarrativeCard
            narrative={narrative}
            generating={generating}
            generateError={generateError}
            quotaRemaining={quotaRemaining}
            quotaLimit={monthlyLimit}
            onGenerate={handleGenerate}
            colors={colors}
          />
        ) : (
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/settings/subscription')}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Card>
              <View style={styles.upgradeRow}>
                <View
                  style={[
                    styles.upgradeIcon,
                    {
                      backgroundColor: colors.primary + '15',
                      borderRadius: radius.full,
                    },
                  ]}
                >
                  <Ionicons name="sparkles" size={20} color={colors.primary} />
                </View>
                <View style={styles.upgradeBody}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>
                    Plus で AI 週次要約
                  </Text>
                  <Text style={[styles.subInfo, { color: colors.textTertiary, marginTop: 4 }]}>
                    運動・栄養・体重を統合した個別 insight を AI が生成します。
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </View>
            </Card>
          </TouchableOpacity>
        )}

        {/* Detail sections — gated for Plus+ */}
        {hasDetailAccess ? (
          <>
            {/* Weight */}
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                体重変化
              </Text>
              {report.weightStart !== null && report.weightEnd !== null ? (
                <View style={styles.weightRow}>
                  <View style={styles.weightItem}>
                    <Text style={[styles.weightLabel, { color: colors.textTertiary }]}>開始</Text>
                    <Text style={[styles.weightValue, { color: colors.textPrimary }]}>
                      {report.weightStart} kg
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={20} color={colors.textTertiary} />
                  <View style={styles.weightItem}>
                    <Text style={[styles.weightLabel, { color: colors.textTertiary }]}>終了</Text>
                    <Text style={[styles.weightValue, { color: colors.textPrimary }]}>
                      {report.weightEnd} kg
                    </Text>
                  </View>
                  <View style={styles.weightItem}>
                    <Text style={[styles.weightLabel, { color: colors.textTertiary }]}>変化</Text>
                    <Text
                      style={[
                        styles.weightValue,
                        {
                          color:
                            report.weightChange !== null && report.weightChange < 0
                              ? colors.success
                              : report.weightChange !== null && report.weightChange > 0
                                ? colors.calorie
                                : colors.textPrimary,
                        },
                      ]}
                    >
                      {report.weightChange !== null
                        ? `${report.weightChange > 0 ? '+' : ''}${report.weightChange} kg`
                        : '-'}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={[styles.noData, { color: colors.textTertiary }]}>
                  今週の体重記録がありません
                </Text>
              )}
            </Card>

            {/* Nutrition */}
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                栄養摂取（日平均）
              </Text>
              <Text style={[styles.subInfo, { color: colors.textTertiary }]}>
                {report.mealLogDays}日 / 7日 記録
              </Text>
              <View style={styles.nutriRow}>
                <View style={styles.nutriItem}>
                  <Text style={[styles.nutriValue, { color: colors.calorie }]}>
                    {report.avgCalories}
                  </Text>
                  <Text style={[styles.nutriLabel, { color: colors.textTertiary }]}>kcal</Text>
                </View>
                <View style={styles.nutriItem}>
                  <Text style={[styles.nutriValue, { color: colors.protein }]}>
                    {report.avgProtein}g
                  </Text>
                  <Text style={[styles.nutriLabel, { color: colors.textTertiary }]}>P</Text>
                </View>
                <View style={styles.nutriItem}>
                  <Text style={[styles.nutriValue, { color: colors.fat }]}>
                    {report.avgFat}g
                  </Text>
                  <Text style={[styles.nutriLabel, { color: colors.textTertiary }]}>F</Text>
                </View>
                <View style={styles.nutriItem}>
                  <Text style={[styles.nutriValue, { color: colors.carb }]}>
                    {report.avgCarb}g
                  </Text>
                  <Text style={[styles.nutriLabel, { color: colors.textTertiary }]}>C</Text>
                </View>
              </View>
            </Card>

            {/* Training */}
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                トレーニング
              </Text>
              <View style={styles.trainingRow}>
                <View style={styles.trainingItem}>
                  <Text style={[styles.trainingValue, { color: colors.textPrimary }]}>
                    {report.workoutCount}
                  </Text>
                  <Text style={[styles.trainingLabel, { color: colors.textTertiary }]}>
                    セッション
                  </Text>
                </View>
                <View style={styles.trainingItem}>
                  <Text style={[styles.trainingValue, { color: colors.textPrimary }]}>
                    {report.totalVolume.toLocaleString()}
                  </Text>
                  <Text style={[styles.trainingLabel, { color: colors.textTertiary }]}>
                    総ボリューム(kg)
                  </Text>
                </View>
                <View style={styles.trainingItem}>
                  <Text style={[styles.trainingValue, { color: colors.calorie }]}>
                    {report.totalCaloriesBurned}
                  </Text>
                  <Text style={[styles.trainingLabel, { color: colors.textTertiary }]}>
                    消費kcal
                  </Text>
                </View>
              </View>
            </Card>
          </>
        ) : (
          <Card>
            <View style={styles.lockedSection}>
              <Ionicons name="lock-closed" size={24} color={colors.textTertiary} />
              <Text style={[styles.lockedText, { color: colors.textSecondary }]}>
                詳細データはPlus+プランで確認できます
              </Text>
              <Button
                title="プランを見る"
                onPress={() => router.push('/(tabs)/settings/subscription')}
                variant="outline"
                size="sm"
              />
            </View>
          </Card>
        )}
      </ScrollView>

      {/* Loading overlay — shown while the EF call is in flight.
          Mirrors the Phase 6 ai-menu pattern. */}
      <RNModal visible={generating} transparent animationType="fade">
        <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View
            style={[
              styles.overlayCard,
              { backgroundColor: colors.surface, borderRadius: radius.lg },
            ]}
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.overlayText, { color: colors.textPrimary }]}>
              {loadingMessage}
            </Text>
            <Button title="中止" onPress={handleCancel} variant="ghost" size="sm" />
          </View>
        </View>
      </RNModal>
    </SafeAreaView>
  );
}

// AI narrative card: composes the quota badge, the generate / regenerate
// CTA, the persisted narrative blocks, and any error banner. Pulled
// out so the main render's branching stays readable.
function AINarrativeCard({
  narrative,
  generating,
  generateError,
  quotaRemaining,
  quotaLimit,
  onGenerate,
  colors,
}: {
  narrative: WeeklyNarrative | null;
  generating: boolean;
  generateError: string | null;
  quotaRemaining: number | null;
  quotaLimit: number;
  onGenerate: () => void;
  colors: ReturnType<typeof getColors>;
}) {
  const noQuotaLeft = quotaRemaining != null && quotaRemaining <= 0;
  return (
    <Card>
      <View style={styles.aiHeader}>
        <Ionicons name="sparkles" size={18} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>
          AI 週次要約
        </Text>
        {quotaRemaining != null && quotaLimit > 0 && (
          <Text style={[styles.quotaBadge, { color: colors.textTertiary }]}>
            今月: 残り {quotaRemaining}/{quotaLimit}
          </Text>
        )}
      </View>

      {narrative ? (
        <View style={styles.narrativeBody}>
          <NarrativeBlock label="総括" body={narrative.overall} colors={colors} emphasis />
          <NarrativeBlock label="トレーニング" body={narrative.sections.workout} colors={colors} />
          <NarrativeBlock label="栄養" body={narrative.sections.nutrition} colors={colors} />
          <NarrativeBlock label="体重" body={narrative.sections.weight} colors={colors} />
          <NarrativeBlock
            label="統合 insight"
            body={narrative.sections.integration}
            colors={colors}
            emphasis
          />
        </View>
      ) : (
        <Text style={[styles.subInfo, { color: colors.textTertiary, marginTop: 0 }]}>
          今週のデータをもとに、運動・栄養・体重を統合した個別 insight を AI が生成します。
        </Text>
      )}

      {generateError && (
        <View
          style={[
            styles.errorBanner,
            { backgroundColor: colors.error + '15', borderRadius: radius.md },
          ]}
        >
          <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{generateError}</Text>
        </View>
      )}

      <Button
        title={
          generating
            ? '生成中...'
            : narrative
              ? '✨ 再生成'
              : '✨ AI 要約を生成'
        }
        onPress={onGenerate}
        variant="primary"
        fullWidth
        disabled={generating || noQuotaLeft}
      />
      {noQuotaLeft && (
        <Text style={[styles.subInfo, { color: colors.textTertiary, textAlign: 'center', marginTop: 6 }]}>
          今月の生成上限に達しました
        </Text>
      )}
    </Card>
  );
}

function NarrativeBlock({
  label,
  body,
  colors,
  emphasis = false,
}: {
  label: string;
  body: string;
  colors: ReturnType<typeof getColors>;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.narrativeBlock}>
      <Text
        style={[
          styles.narrativeLabel,
          { color: emphasis ? colors.primary : colors.textSecondary },
        ]}
      >
        {label}
      </Text>
      <Text style={[styles.narrativeText, { color: colors.textPrimary }]}>{body}</Text>
    </View>
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
  dateRange: {
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
  },
  emptyText: { ...typography.bodyMedium },
  overallSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  overallText: {
    flex: 1,
    gap: spacing.xs,
  },
  overallLabel: { ...typography.labelMedium },
  overallMessage: { ...typography.titleSmall },
  sectionTitle: {
    ...typography.titleSmall,
    marginBottom: spacing.md,
  },
  scoresRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  weightItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  weightLabel: { ...typography.labelSmall },
  weightValue: { ...typography.numberSmall },
  noData: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  subInfo: {
    ...typography.labelSmall,
    marginBottom: spacing.sm,
    marginTop: -spacing.sm,
  },
  nutriRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  nutriItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  nutriValue: { ...typography.numberSmall },
  nutriLabel: { ...typography.labelSmall },
  trainingRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  trainingItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  trainingValue: { ...typography.numberSmall },
  trainingLabel: {
    ...typography.labelSmall,
    textAlign: 'center',
  },
  lockedSection: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  lockedText: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  // AI narrative card styles
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  quotaBadge: {
    ...typography.labelSmall,
    marginLeft: 'auto',
  },
  narrativeBody: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  narrativeBlock: { gap: spacing.xs },
  narrativeLabel: {
    ...typography.labelSmall,
    fontWeight: '600',
  },
  narrativeText: {
    ...typography.bodyMedium,
    lineHeight: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorText: {
    ...typography.bodySmall,
    flex: 1,
  },
  // Upgrade banner (Free) styles, mirroring Phase 9.1 plate-step gate
  upgradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  upgradeIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeBody: { flex: 1 },
  // Loading overlay
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  overlayCard: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    minWidth: 240,
  },
  overlayText: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
});
