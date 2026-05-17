import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useProfileStore } from '../../../../src/stores/profileStore';
import {
  useRoutineGenStore,
  selectCurrentDraft,
} from '../../../../src/stores/routineGenStore';
import { useDiagnosticStore } from '../../../../src/stores/diagnosticStore';
import { useSubscription } from '../../../../src/hooks/useSubscription';
import { findExerciseBySlug } from '../../../../src/infra/repositories/workoutRepository';
import { getColors } from '../../../../src/theme/tokens';
import { typography } from '../../../../src/theme/typography';
import { spacing } from '../../../../src/theme/spacing';

// v1.5 Stage 1 Phase 1.3 — diagnostic result screen.
//
// The wizard's last step already invoked
// `diagnosticStore.submitToGeneration` (which routes through
// `routineGenStore.runGeneration`), so on mount we read the
// current user's draft from routineGenStore + render the preview.
// Apply / Discard mirror the Phase 1.5 RoutineGenerationCard logic
// (single-source path), then route the user back to the training
// tab so the `lastAppliedAt` subscription refreshes the routine
// list.

export default function DiagnosticResult() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const profile = useProfileStore((s) => s.profile);
  const userId = profile?.id ?? '';
  const profileId = profile?.id ?? '';

  const sub = useSubscription();
  const hasAccess = sub.hasFeature('aiCoachGeneration');

  const draft = useRoutineGenStore((s) => selectCurrentDraft(s, userId));
  const isGenerating = useRoutineGenStore((s) => s.isGenerating);
  const isApplying = useRoutineGenStore((s) => s.isApplying);
  const error = useRoutineGenStore((s) => s.error);
  const applyDraft = useRoutineGenStore((s) => s.applyDraft);
  const discardDraft = useRoutineGenStore((s) => s.discardDraft);
  const loadFromCache = useRoutineGenStore((s) => s.loadFromCache);
  const clearWizard = useDiagnosticStore((s) => s.clearWizard);

  // Codex round 2 New finding fix — hydrate the routine
  // generation cache from SQLite v33 BEFORE the idle-redirect
  // effect runs. Without this gate, a cold start / route-restore
  // lands on this screen with an empty Zustand cache and the
  // idle redirect kicks in before the persisted draft has had a
  // chance to load. The same pattern lives in
  // `RoutineGenerationCard` (Phase 1.5 Codex round 1 Important #1).
  // Codex round 4 follow-up — track the userId we last finished
  // hydrating for via a ref so the idle-redirect can compare
  // synchronously against the CURRENT userId, not a state value
  // that lags by a render. A useState-based gate was racing
  // because `setHydrated(false)` from this effect didn't reach
  // the idle-redirect effect in the same flush; the redirect
  // could observe the stale `true` snapshot before the reset
  // render landed. Using a ref synchronously updated in the
  // hydration callback closes that window.
  const hydratedForUser = useRef<string | null>(null);
  const [hydratedTick, setHydratedTick] = useState(0);
  useEffect(() => {
    if (!hasAccess || !userId) {
      hydratedForUser.current = null;
      setHydratedTick((t) => t + 1);
      return;
    }
    let cancelled = false;
    void (async () => {
      await loadFromCache(userId);
      if (cancelled) return;
      hydratedForUser.current = userId;
      setHydratedTick((t) => t + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasAccess, userId, loadFromCache]);

  // Codex round 1 Important fix — Free user deep-link to result
  // is blocked by the plan check + a redirect back to the coach
  // tab. Mirrors the entry / step screens.
  useEffect(() => {
    if (!hasAccess) {
      router.replace('/(tabs)/coach/diagnostic');
    }
  }, [hasAccess]);

  // Codex round 1 Important fix — if mount lands on result with
  // no draft AND no error AND nothing generating, the wizard
  // never actually submitted (deep-link / cleared pointer /
  // state mismatch). Route the user back to the entry so they
  // can restart instead of spinning indefinitely.
  //
  // Codex round 4 follow-up — the gate now compares the ref's
  // `hydratedForUser.current === userId` (synchronous read of
  // the latest hydration target) instead of a state-based flag
  // that could lag by one render across an account swap. The
  // `hydratedTick` dep just ensures the effect re-runs when the
  // ref's value transitions to the new userId.
  useEffect(() => {
    if (!hasAccess || !userId) return;
    if (hydratedForUser.current !== userId) return;
    if (!draft && !isGenerating && !error) {
      router.replace('/(tabs)/coach/diagnostic');
    }
  }, [hydratedTick, hasAccess, userId, draft, isGenerating, error]);

  const [slugToName, setSlugToName] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!draft) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const item of draft.generatedRoutine.items) {
        if (next[item.exerciseSlug]) continue;
        const ex = await findExerciseBySlug(item.exerciseSlug);
        if (ex) next[item.exerciseSlug] = ex.nameJa;
      }
      if (!cancelled) setSlugToName(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [draft]);

  const handleApply = useCallback(async () => {
    if (!draft) return;
    const result = await applyDraft({
      userId,
      profileId,
      generationId: draft.id,
    });
    if (result) {
      Alert.alert(
        '適用しました',
        `「${draft.generatedRoutine.routineName}」 をルーティンに追加しました。`,
      );
      // Wizard is done — clear the answers so re-entering the
      // diagnostic starts fresh.
      if (userId) clearWizard(userId);
      // Route back to training tab so the `lastAppliedAt`
      // subscription in `training/index.tsx` re-fetches routines.
      router.replace('/(tabs)/training');
    }
  }, [draft, userId, profileId, applyDraft, clearWizard]);

  const handleDiscard = useCallback(async () => {
    if (!draft) return;
    // Codex round 1 Important fix + round 2 follow-up —
    // `discardDraft` doesn't throw on failure (it sets
    // `routineGenStore.error` instead). After awaiting, we
    // inspect the store's latest error reference: if the
    // discard FAILED, we surface the message + stay on this
    // screen so the user can retry / close manually. If it
    // SUCCEEDED, we clear the wizard + navigate.
    await discardDraft({ userId, generationId: draft.id });
    const storeError = useRoutineGenStore.getState().error;
    if (storeError) {
      Alert.alert(
        '破棄に失敗しました',
        storeError.message,
      );
      return;
    }
    if (userId) clearWizard(userId);
    router.replace('/(tabs)/coach');
  }, [draft, userId, discardDraft, clearWizard]);

  // Codex round 1 Important fix — the top-bar close button now
  // shares the discard semantics: a confirmed exit before Apply
  // counts as discarding the draft. Without this, the close path
  // would leave both the wizard answers AND the
  // routineGenStore.current pointer dangling.
  const handleClose = useCallback(async () => {
    if (draft && draft.status === 'draft') {
      Alert.alert(
        '診断を終了しますか',
        '生成されたルーティンは破棄されます。',
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '破棄して終了',
            style: 'destructive',
            onPress: () => {
              void handleDiscard();
            },
          },
        ],
      );
      return;
    }
    if (userId) clearWizard(userId);
    router.replace('/(tabs)/coach');
  }, [draft, userId, clearWizard, handleDiscard]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={[styles.headerRow, { borderColor: colors.border }]}>
        <TouchableOpacity
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="閉じる"
          style={styles.backButton}
          testID="diagnostic-result-close"
        >
          <Ionicons
            name="close"
            size={24}
            color={colors.textPrimary}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          診断結果
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {isGenerating || (!draft && !error) ? (
        <View style={styles.centerView} testID="diagnostic-result-loading">
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.centerText, { color: colors.textSecondary }]}>
            ミー先生がルーティンを設計中...
          </Text>
        </View>
      ) : error && !draft ? (
        <View style={styles.centerView} testID="diagnostic-result-error">
          <Ionicons
            name="alert-circle-outline"
            size={32}
            color={colors.error}
          />
          <Text style={[styles.centerText, { color: colors.error }]}>
            {error.message}
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)/coach/diagnostic')}
            accessibilityRole="button"
            accessibilityLabel="最初からやり直す"
            style={[styles.secondaryButton, { borderColor: colors.primary }]}
          >
            <Text style={[styles.secondaryButtonLabel, { color: colors.primary }]}>
              最初からやり直す
            </Text>
          </TouchableOpacity>
        </View>
      ) : draft ? (
        <ScrollView contentContainerStyle={styles.previewBody}>
          <Text style={[styles.previewTitle, { color: colors.textPrimary }]}>
            {draft.generatedRoutine.routineName}
          </Text>
          <Text style={[styles.previewMeta, { color: colors.textSecondary }]}>
            {draft.generatedRoutine.items.length} 種目
          </Text>
          {draft.generatedRoutine.items.map((item, idx) => (
            <View
              key={`${item.exerciseSlug}-${idx}`}
              style={[styles.previewItemRow, { borderColor: colors.border }]}
            >
              <Text
                style={[styles.previewItemSlug, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {slugToName[item.exerciseSlug] ?? item.exerciseSlug}
              </Text>
              <Text
                style={[styles.previewItemMeta, { color: colors.textSecondary }]}
              >
                {item.targetSets} セット × {item.targetReps}
              </Text>
            </View>
          ))}
          <Text style={[styles.previewFooter, { color: colors.textTertiary }]}>
            ミー先生 (AI コーチ)
          </Text>
        </ScrollView>
      ) : null}

      {draft && (
        <View style={[styles.footerRow, { borderColor: colors.border }]}>
          <TouchableOpacity
            onPress={handleDiscard}
            accessibilityRole="button"
            accessibilityLabel="破棄"
            disabled={isApplying}
            style={[styles.secondaryButton, { borderColor: colors.border }]}
            testID="diagnostic-result-discard"
          >
            <Text style={[styles.secondaryButtonLabel, { color: colors.textSecondary }]}>
              破棄
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleApply}
            accessibilityRole="button"
            accessibilityLabel="このルーティンを適用"
            disabled={isApplying}
            style={[
              styles.primaryButton,
              {
                backgroundColor: isApplying
                  ? colors.textTertiary
                  : colors.primary,
              },
            ]}
            testID="diagnostic-result-apply"
          >
            {isApplying ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                <Text style={styles.primaryButtonLabel}>このルーティンを適用</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
  },
  backButton: { paddingRight: spacing.sm },
  headerTitle: {
    ...typography.titleMedium,
    fontWeight: '600',
    flex: 1,
  },
  headerSpacer: { width: 24 },
  centerView: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  centerText: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
  previewBody: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  previewTitle: {
    ...typography.titleLarge,
    fontWeight: '700',
  },
  previewMeta: {
    ...typography.labelSmall,
  },
  previewItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
  },
  previewItemSlug: {
    ...typography.bodyMedium,
    flex: 1,
    marginRight: spacing.sm,
  },
  previewItemMeta: {
    ...typography.bodySmall,
    fontVariant: ['tabular-nums'],
  },
  previewFooter: {
    ...typography.labelSmall,
    textAlign: 'right',
    marginTop: spacing.md,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 0.5,
  },
  primaryButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: 9999,
  },
  primaryButtonLabel: {
    ...typography.labelMedium,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: 9999,
    borderWidth: 0.5,
  },
  secondaryButtonLabel: {
    ...typography.labelMedium,
    fontWeight: '600',
  },
});
