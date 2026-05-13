import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal as RNModal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius, shadow } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Button, Toast } from '../../../src/components/ui';
import { ProInlineCTA } from '../../../src/components/shared/ProInlineCTA';
import { useProfileStore } from '../../../src/stores/profileStore';
import { useSubscription } from '../../../src/hooks/useSubscription';
import { MUSCLE_GROUPS } from '../../../src/constants/muscleGroups';
import type { MuscleGroup } from '../../../src/types/common';
import {
  generateAIWorkoutMenu,
  AIWorkoutError,
  ERROR_MESSAGE_BY_CODE,
} from '../../../src/infra/services/aiWorkoutService';
import { listExerciseSlugsByMuscles } from '../../../src/infra/repositories/workoutRepository';
import { listByProfileId as listUserEquipment } from '../../../src/infra/repositories/userEquipmentRepository';
import { getFeatureFlags } from '../../../src/infra/services/subscriptionService';
import { supabase } from '../../../src/infra/supabase/client';
import { useAIMenuStagingStore } from '../../../src/stores/aiMenuStagingStore';

// v1.4 / UI 改善 v1 ステージ 2 Phase B [S1] — AIメニュー画面リデザイン.
//
// Plan §5.1: 「機能名→人格化」 (AI メニュー生成 → AIトレーナー)、
// 部位選択を card grid 化、 時間選択に意味付きヘルパーテキスト、
// プライマリボタン強化 + Plus アップセル、 4-step ローディング演出.
//
// 既存業務ロジック維持 (Plan §10.1 既存ロジック破壊なし):
//   - quota fetch (ai_usage_logs RLS-safe SELECT)
//   - generateAIWorkoutMenu (Edge Function call + cache args)
//   - listExerciseSlugsByMuscles / listUserEquipment
//   - AbortController + stage timer cleanup
//   - aiMenuStagingStore via useAIMenuStagingStore
//   - Error handling (AIWorkoutError + ERROR_MESSAGE_BY_CODE)
//
// 変更箇所 (UI layer のみ):
//   B-1 ヘッダー: 「AIメニュー生成」 → 「AIトレーナー」 + キャッチコピー
//   B-2 部位選択: text chip → アイコン + テキスト card grid (2列)
//   B-3 時間選択: SegmentedControl → 4-option detail cards
//                 (30分・軽め N種目 等の意味付き)
//   B-4 生成ボタン: size lg + shadow.md + 残量表示 + ProInlineCTA
//   B-5 ローディング: ActivityIndicator → 4-step progress visualization
//                     (履歴分析 / ボリューム計算 / 種目選定 / セット最適化)

const AI_MENU_MUSCLES: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'core',
  'full_body',
];

// Per-muscle Ionicon mapping. MUSCLE_GROUPS の `icon` field は全
// 'body-outline' なので、 画面ローカルで Plan §5.1「胸/背中/肩/腕/
// 脚/腹、+全身」 に対応する distinct アイコンを用意.
const MUSCLE_ICONS: Record<
  MuscleGroup,
  React.ComponentProps<typeof Ionicons>['name']
> = {
  chest: 'body-outline',
  back: 'body-outline',
  shoulders: 'body-outline',
  arms: 'barbell-outline',
  legs: 'walk-outline',
  core: 'body-outline',
  full_body: 'body',
};

// Plan §5.1 B-3 duration options with 意味付きヘルパーテキスト.
const DURATION_OPTIONS: {
  value: string;
  label: string;
  helper: string;
}[] = [
  { value: '30', label: '30分', helper: '軽め (4-5種目)' },
  { value: '45', label: '45分', helper: '標準 (6-7種目)' },
  { value: '60', label: '60分', helper: 'しっかり (8-9種目)' },
  { value: '90', label: '90分', helper: 'じっくり (10種目以上)' },
];

const SLUG_LIST_MIN_COUNT = 30;

// Loading stage breakpoints (seconds since fetch started).
// 4 steps with auto-advance for visual progress feedback.
const LOADING_STAGE_2_MS = 5_000;
const LOADING_STAGE_3_MS = 15_000;
const LOADING_STAGE_4_MS = 30_000;

const LOADING_STEPS = [
  { label: '履歴を分析中', icon: 'analytics-outline' as const },
  { label: 'ボリュームを計算中', icon: 'calculator-outline' as const },
  { label: '種目を選定中', icon: 'list-outline' as const },
  { label: 'セットを最適化中', icon: 'sparkles-outline' as const },
];

type ScreenState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

// UTC month-start ISO — matches EF's quota window.
function utcMonthStartISO(now: Date): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return new Date(Date.UTC(year, month, 1)).toISOString();
}

export default function AIMenuScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);
  const sub = useSubscription();

  const [selectedMuscles, setSelectedMuscles] = useState<Set<MuscleGroup>>(
    new Set(),
  );
  const [durationStr, setDurationStr] = useState<string>('60');
  const [screenState, setScreenState] = useState<ScreenState>({ kind: 'idle' });
  const [quotaUsed, setQuotaUsed] = useState<number | null>(null);
  const [loadingStage, setLoadingStage] = useState<1 | 2 | 3 | 4>(1);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
    visible: boolean;
  }>({ message: '', type: 'info', visible: false });

  const abortRef = useRef<AbortController | null>(null);
  const stageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const setStaging = useAIMenuStagingStore((s) => s.setStaging);

  const planFlags = getFeatureFlags();
  const monthlyLimit = planFlags.aiWorkoutGenerationLimit;
  const quotaRemaining =
    quotaUsed != null ? Math.max(0, monthlyLimit - quotaUsed) : null;

  const fetchQuota = useCallback(async () => {
    if (!profile?.id || !supabase) {
      setQuotaUsed(null);
      return;
    }
    const monthStart = utcMonthStartISO(new Date());
    const { count, error } = await supabase
      .from('ai_usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('function_name', 'generate-workout-menu')
      .eq('response_status', 200)
      .gte('created_at', monthStart);
    if (error) {
      setQuotaUsed(null);
      return;
    }
    setQuotaUsed(count ?? 0);
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchQuota();
    }, [fetchQuota]),
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      for (const t of stageTimersRef.current) clearTimeout(t);
      stageTimersRef.current = [];
    };
  }, []);

  const toggleMuscle = useCallback((m: MuscleGroup) => {
    setSelectedMuscles((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    if (screenState.kind === 'loading') return;
    if (selectedMuscles.size === 0) {
      setToast({
        message: '鍛えたい部位を 1 つ以上選択してください',
        type: 'info',
        visible: true,
      });
      return;
    }
    if (quotaRemaining != null && quotaRemaining <= 0) {
      setToast({
        message: ERROR_MESSAGE_BY_CODE.quota_exceeded,
        type: 'error',
        visible: true,
      });
      return;
    }

    const muscles = Array.from(selectedMuscles);
    const durationMinutes = Number.parseInt(durationStr, 10);

    setScreenState({ kind: 'loading' });
    setLoadingStage(1);

    for (const t of stageTimersRef.current) clearTimeout(t);
    stageTimersRef.current = [
      setTimeout(() => setLoadingStage(2), LOADING_STAGE_2_MS),
      setTimeout(() => setLoadingStage(3), LOADING_STAGE_3_MS),
      setTimeout(() => setLoadingStage(4), LOADING_STAGE_4_MS),
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const exerciseSlugs = await listExerciseSlugsByMuscles(muscles, {
        minCount: SLUG_LIST_MIN_COUNT,
      });
      if (exerciseSlugs.length === 0) {
        throw new AIWorkoutError(
          'invalid_request',
          '種目データが読み込まれていません。アプリを再起動してください',
          400,
        );
      }
      const equipmentRows = profile?.id
        ? await listUserEquipment(profile.id)
        : [];
      const equipmentKeys = equipmentRows
        .filter((r) => r.available)
        .map((r) => r.equipmentKey);

      const cacheArgs = profile?.id
        ? {
            profileId: profile.id,
            goalType: profile.goalType ?? null,
            equipmentKeys,
            trainingDaysPerWeek: profile.trainingDaysPerWeek ?? null,
          }
        : undefined;

      const program = await generateAIWorkoutMenu(
        { targetMuscles: muscles, durationMinutes, exerciseSlugs },
        { signal: controller.signal, cache: cacheArgs },
      );
      setStaging(program, muscles);
      setScreenState({ kind: 'idle' });
      void fetchQuota();
      router.push('/(tabs)/training/ai-menu-preview');
    } catch (err) {
      const code = err instanceof AIWorkoutError ? err.code : 'internal_error';
      const message =
        err instanceof AIWorkoutError
          ? err.message
          : ERROR_MESSAGE_BY_CODE.internal_error;
      setScreenState({ kind: 'error', message });
      setToast({
        message,
        type: code === 'aborted' ? 'info' : 'error',
        visible: true,
      });
    } finally {
      for (const t of stageTimersRef.current) clearTimeout(t);
      stageTimersRef.current = [];
      abortRef.current = null;
    }
  }, [
    screenState.kind,
    selectedMuscles,
    durationStr,
    quotaRemaining,
    fetchQuota,
    profile?.id,
    profile?.goalType,
    profile?.trainingDaysPerWeek,
    setStaging,
  ]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const isLoading = screenState.kind === 'loading';
  const generateDisabled =
    isLoading ||
    selectedMuscles.size === 0 ||
    (quotaRemaining != null && quotaRemaining <= 0);

  // B-4 — residual count + Plus アップセル 表示判定.
  // Free / Trial: 残量カウンタ表示 + ProInlineCTA (Plus でもっと使う).
  // Plus / Pro: 残量だけ表示 (CTA 非表示、 Handbook §15.4).
  const showResidualCount = quotaRemaining != null;
  const showPlusUpsell = sub.isFree;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      {/* B-1 ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="戻る"
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* B-1 タイトル + キャッチコピー (機能名 → 人格化) */}
        <View style={styles.hero}>
          <Text
            style={[styles.title, { color: colors.textPrimary }]}
            accessibilityRole="header"
          >
            AIトレーナー
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            あなた専用のメニューを、 AI が作成します
          </Text>
        </View>

        {/* Quota badge — 既存ロジック維持、 visual を pill 化 */}
        <View
          style={[
            styles.quotaBadge,
            { backgroundColor: colors.surfaceSecondary },
          ]}
        >
          <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
          <Text style={[styles.quotaText, { color: colors.textSecondary }]}>
            {showResidualCount
              ? `今月 残り ${quotaRemaining} / ${monthlyLimit}`
              : `今月 -- / ${monthlyLimit}`}
          </Text>
        </View>

        {/* B-2 部位選択 — 2列 card grid */}
        <View style={styles.section}>
          <Text
            style={[styles.sectionLabel, { color: colors.textPrimary }]}
            accessibilityRole="header"
          >
            鍛えたい部位
          </Text>
          <Text
            style={[styles.sectionHelper, { color: colors.textTertiary }]}
          >
            複数選択できます
          </Text>
          {/* Codex pass 1 Important — multi-select だが container を
              radiogroup にすると VoiceOver / TalkBack が single-select
              を期待する。 子は checkbox role を維持、 container は
              accessibilityLabel のみ (RN は 'group' role 未サポート、
              role 省略が cleanest). */}
          <View
            style={styles.muscleGrid}
            accessibilityLabel="鍛えたい部位を選択 (複数選択可)"
          >
            {AI_MENU_MUSCLES.map((m) => {
              const info = MUSCLE_GROUPS.find((g) => g.id === m);
              if (!info) return null;
              const selected = selectedMuscles.has(m);
              const isFullBody = m === 'full_body';
              return (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.muscleCard,
                    isFullBody && styles.muscleCardWide,
                    {
                      backgroundColor: selected
                        ? colors.primary + '15'
                        : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => toggleMuscle(m)}
                  disabled={isLoading}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={info.nameJa}
                >
                  <Ionicons
                    name={MUSCLE_ICONS[m]}
                    size={28}
                    color={selected ? colors.primary : colors.textSecondary}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  />
                  <Text
                    style={[
                      styles.muscleLabel,
                      {
                        color: selected
                          ? colors.primary
                          : colors.textPrimary,
                      },
                    ]}
                  >
                    {info.nameJa}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* B-3 時間選択 — 4 option detail cards */}
        <View style={styles.section}>
          <Text
            style={[styles.sectionLabel, { color: colors.textPrimary }]}
            accessibilityRole="header"
          >
            1 セッションの時間
          </Text>
          <View
            style={styles.durationList}
            accessibilityRole="radiogroup"
            accessibilityLabel="1セッションの時間を選択"
          >
            {DURATION_OPTIONS.map((opt) => {
              const selected = durationStr === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.durationCard,
                    {
                      backgroundColor: selected
                        ? colors.primary + '15'
                        : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setDurationStr(opt.value)}
                  disabled={isLoading}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${opt.label} ${opt.helper}`}
                >
                  <View style={styles.durationCardText}>
                    <Text
                      style={[
                        styles.durationLabel,
                        {
                          color: selected
                            ? colors.primary
                            : colors.textPrimary,
                        },
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text
                      style={[
                        styles.durationHelper,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {opt.helper}
                    </Text>
                  </View>
                  {selected && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={colors.primary}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* v1 限定の helper */}
        <Text style={[styles.helperText, { color: colors.textTertiary }]}>
          ※ v1 では筋トレメニューのみ生成できます。 有酸素・スポーツは対象外です。
        </Text>

        {/* B-4 生成ボタン + 残量 + Plus upsell */}
        <View style={[styles.ctaSection, shadow.md]}>
          <Button
            title={isLoading ? '生成中…' : 'AIメニューを作成する'}
            onPress={handleGenerate}
            variant="primary"
            size="lg"
            fullWidth
            disabled={generateDisabled}
            testID="ai-menu-generate-cta"
          />
        </View>
        {showResidualCount && (
          <Text style={[styles.residualText, { color: colors.textTertiary }]}>
            あと {quotaRemaining} 回 / 月 {monthlyLimit} 回
          </Text>
        )}
        {showPlusUpsell && (
          <ProInlineCTA
            label={`Plus でもっと使う → 月 ${30} 回`}
            variant="link"
          />
        )}
      </ScrollView>

      {/* B-5 ローディングオーバーレイ — 4-step progress */}
      <RNModal visible={isLoading} transparent animationType="fade">
        <View
          style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
        >
          <View
            style={[
              styles.overlayCard,
              {
                backgroundColor: colors.surface,
                borderRadius: radius.lg,
              },
            ]}
          >
            <Text
              style={[styles.overlayTitle, { color: colors.textPrimary }]}
              accessibilityRole="header"
            >
              AIトレーナーが作成中…
            </Text>
            <View style={styles.stepsList}>
              {LOADING_STEPS.map((step, idx) => {
                const stepNum = (idx + 1) as 1 | 2 | 3 | 4;
                const isActive = loadingStage === stepNum;
                const isDone = loadingStage > stepNum;
                const iconColor = isDone
                  ? colors.success
                  : isActive
                    ? colors.primary
                    : colors.textTertiary;
                const labelColor = isDone
                  ? colors.textSecondary
                  : isActive
                    ? colors.textPrimary
                    : colors.textTertiary;
                return (
                  <View key={step.label} style={styles.stepRow}>
                    {isDone ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={iconColor}
                      />
                    ) : isActive ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons
                        name={step.icon}
                        size={22}
                        color={iconColor}
                      />
                    )}
                    <Text
                      style={[
                        styles.stepLabel,
                        { color: labelColor },
                        isActive && styles.stepLabelActive,
                      ]}
                    >
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Button
              title="中止"
              onPress={handleCancel}
              variant="ghost"
              size="sm"
            />
          </View>
        </View>
      </RNModal>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
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
    paddingVertical: spacing.sm,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerSpacer: { width: 40, height: 40 },
  scroll: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxxl,
  },
  hero: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.displayMedium,
  },
  subtitle: {
    ...typography.bodyMedium,
  },
  quotaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  quotaText: { ...typography.labelSmall },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.titleSmall,
  },
  sectionHelper: {
    ...typography.bodySmall,
    marginTop: -spacing.xs,
    marginBottom: spacing.xs,
  },
  muscleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  // 2 列計算: (画面幅 - 左右 padding 16*2 - gap 8) / 2 ≈ (360 - 40) / 2 = 160
  // しかしレイアウト固定値を flex で扱う方が安全 — flex-basis で 48%。
  muscleCard: {
    flexBasis: '48%',
    flexGrow: 0,
    flexShrink: 0,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 80,
  },
  muscleCardWide: {
    flexBasis: '100%',
  },
  muscleLabel: {
    ...typography.titleSmall,
  },
  durationList: {
    gap: spacing.sm,
  },
  durationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    minHeight: 56,
  },
  durationCardText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.md,
  },
  durationLabel: {
    ...typography.titleMedium,
  },
  durationHelper: {
    ...typography.bodySmall,
  },
  helperText: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  ctaSection: {
    borderRadius: radius.md,
  },
  residualText: {
    ...typography.labelMedium,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  overlayCard: {
    alignItems: 'stretch',
    gap: spacing.lg,
    padding: spacing.xl,
    minWidth: 280,
    maxWidth: 320,
  },
  overlayTitle: {
    ...typography.titleMedium,
    textAlign: 'center',
  },
  stepsList: {
    gap: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 26,
  },
  stepLabel: {
    ...typography.bodyMedium,
    flex: 1,
  },
  stepLabelActive: {
    fontWeight: '600',
  },
});
