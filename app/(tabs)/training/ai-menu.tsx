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
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Button, Card, SegmentedControl, Toast } from '../../../src/components/ui';
import { useProfileStore } from '../../../src/stores/profileStore';
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

// Build 15 / Session 8 / Phase 6 / Commit 24 — AI menu generation
// entry screen.
//
// Flow:
//   1. User picks 1+ muscle chips (strength + 全身 only — cardio
//      excluded in v1, see Phase 6 Q1.b sign-off).
//   2. Picks duration (30 / 45 / 60 / 90 min).
//   3. Tap 「メニュー生成」 → builds Pattern C slug list via
//      listExerciseSlugsByMuscles({ minCount: 30 }) → calls EF.
//   4. Loading overlay with stage-shifting message at 5s/15s/30s.
//      Cancel button aborts via AbortController.
//   5. On success: program stored in screen state and a placeholder
//      success toast is shown — Commit 25 replaces this with the
//      preview screen + week/day picker + save flow.
//   6. On error: toast with localized message from ERROR_MESSAGE_BY_CODE
//      (mapped via AIWorkoutError.code).
//
// Quota badge: live-fetched from ai_usage_logs (RLS-safe direct read,
// scoped by auth.uid()). Refetches on screen focus and after each
// generation completes.

// Allowed muscle filters in v1: strength groups + 全身. cardio/sports
// is excluded — the v25 seed has no slug for those rows so an
// EF call with cardio-only filter would 400 with no_equipment-style
// emptiness. Build 16+ may add cardio menu generation as a separate
// product surface.
const AI_MENU_MUSCLES: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'core',
  'full_body',
];

const DURATION_SEGMENTS = [
  { label: '30分', value: '30' },
  { label: '45分', value: '45' },
  { label: '60分', value: '60' },
  { label: '90分', value: '90' },
];

// Pattern C minimum: ensures the AI prompt always sees ≥ 30 slugs even
// when the user picks a single narrow group (full_body alone has 8 in
// the seed). Gives Gemini enough variety to avoid degenerate outputs.
const SLUG_LIST_MIN_COUNT = 30;

// Loading stage breakpoints (seconds since fetch started).
const LOADING_STAGE_2_MS = 5_000;
const LOADING_STAGE_3_MS = 15_000;
const LOADING_STAGE_4_MS = 30_000;

type ScreenState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

// UTC month-start ISO — matches the EF's quota window (utcMonthStartISO
// in supabase/functions/generate-workout-menu/index.ts) so the client
// counter stays in lockstep with what the server enforces.
function utcMonthStartISO(now: Date): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return new Date(Date.UTC(year, month, 1)).toISOString();
}

export default function AIMenuScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);

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
  const quotaRemaining = quotaUsed != null
    ? Math.max(0, monthlyLimit - quotaUsed)
    : null;

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
      // Silent fail — badge just hides until a successful refetch.
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

  // Cleanup any in-flight controller / stage timers on unmount.
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

    // Schedule stage transitions. Cleared in cleanup paths below.
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
        // Defensive: empty seed (cold-install before seedExercisesV2
        // ran) — should never happen on a fully-booted app.
        throw new AIWorkoutError(
          'invalid_request',
          '種目データが読み込まれていません。アプリを再起動してください',
          400,
        );
      }
      // Phase 7 cache key inputs. Equipment is fetched fresh from
      // local DB at generate time so a recently-toggled chip is
      // reflected — listUserEquipment runs against SQLite (sub-ms)
      // and the result also mirrors what the EF reads server-side
      // via user_equipment, keeping the cache in lockstep with the
      // EF's view.
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
          }
        : undefined;

      const program = await generateAIWorkoutMenu(
        { targetMuscles: muscles, durationMinutes, exerciseSlugs },
        { signal: controller.signal, cache: cacheArgs },
      );
      // Hand off to preview via the staging store. router params would
      // need to JSON-stringify a multi-week program (>4 KB typical),
      // which Expo Router doesn't love — see aiMenuStagingStore.ts.
      setStaging(program, muscles);
      setScreenState({ kind: 'idle' });
      // Refresh quota count to advance the badge before navigation so
      // the user-facing remaining count is fresh on return.
      void fetchQuota();
      router.push('/(tabs)/training/ai-menu-preview');
    } catch (err) {
      const code = err instanceof AIWorkoutError ? err.code : 'internal_error';
      const message =
        err instanceof AIWorkoutError
          ? err.message
          : ERROR_MESSAGE_BY_CODE.internal_error;
      setScreenState({ kind: 'error', message });
      // 'aborted' is user-initiated — show as info, not error.
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
  ]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const isLoading = screenState.kind === 'loading';
  const generateDisabled =
    isLoading ||
    selectedMuscles.size === 0 ||
    (quotaRemaining != null && quotaRemaining <= 0);

  const loadingMessage =
    loadingStage === 1
      ? 'AI が最適なメニューを考えています...'
      : loadingStage === 2
      ? 'もうしばらくかかります...'
      : loadingStage === 3
      ? '処理に時間がかかっています。ネットワーク状況を確認してください'
      : 'タイムアウト目前です。中止して再試行できます';

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          AI メニュー生成
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Quota badge */}
        <View
          style={[
            styles.quotaBadge,
            { backgroundColor: colors.surfaceSecondary },
          ]}
        >
          <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
          <Text style={[styles.quotaText, { color: colors.textSecondary }]}>
            {quotaRemaining != null
              ? `今月: 残り ${quotaRemaining} / ${monthlyLimit}`
              : `今月: -- / ${monthlyLimit}`}
          </Text>
        </View>

        {/* Muscle chips */}
        <Card>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            鍛えたい部位（複数選択可）
          </Text>
          <View style={styles.chipGrid}>
            {AI_MENU_MUSCLES.map((m) => {
              const info = MUSCLE_GROUPS.find((g) => g.id === m);
              if (!info) return null;
              const selected = selectedMuscles.has(m);
              return (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surfaceSecondary,
                      borderRadius: radius.full,
                    },
                  ]}
                  onPress={() => toggleMuscle(m)}
                  disabled={isLoading}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? '#FFFFFF' : colors.textSecondary },
                    ]}
                  >
                    {info.nameJa}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {/* Duration */}
        <Card>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            1 セッションの時間
          </Text>
          <SegmentedControl
            segments={DURATION_SEGMENTS}
            selectedValue={durationStr}
            onValueChange={setDurationStr}
          />
        </Card>

        {/* Note about exclusions */}
        <Text style={[styles.helperText, { color: colors.textTertiary }]}>
          ※ v1 では筋トレメニューのみ生成できます。有酸素・スポーツは対象外です。
        </Text>

        {/* Generate button */}
        <Button
          title={isLoading ? '生成中...' : '✨ メニュー生成'}
          onPress={handleGenerate}
          variant="primary"
          fullWidth
          disabled={generateDisabled}
        />

      </ScrollView>

      {/* Loading overlay */}
      <RNModal visible={isLoading} transparent animationType="fade">
        <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View
            style={[
              styles.overlayCard,
              { backgroundColor: colors.surface, borderRadius: radius.lg },
            ]}
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text
              style={[styles.overlayText, { color: colors.textPrimary }]}
            >
              {loadingMessage}
            </Text>
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
  title: { ...typography.titleMedium, flex: 1, textAlign: 'center' },
  scroll: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxxl,
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
  sectionLabel: { ...typography.labelMedium, marginBottom: spacing.sm },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  chipText: { ...typography.labelMedium },
  helperText: { ...typography.bodySmall, textAlign: 'center' },
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
