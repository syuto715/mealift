import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useRoutineGenStore,
  selectCurrentDraft,
} from '../../stores/routineGenStore';
import { useSubscription } from '../../hooks/useSubscription';
import { useProfileStore } from '../../stores/profileStore';
import {
  findExerciseBySlug,
  listAllExerciseSlugs,
} from '../../infra/repositories/workoutRepository';
import { ProInlineCTA } from '../shared/ProInlineCTA';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import {
  pickRoutineGenCardState,
  type RoutineGenCardState,
} from './routineGenerationCardState';

// v1.5 Stage 1 Phase 1.5 — embedded coach-routine generator card.
//
// Three-mode flow:
//   - idle:        intent text input + Generate button
//   - generating:  spinner
//   - preview:     routine details + Apply / Discard buttons
//   - error:       message + retry
//   - locked:      ProInlineCTA (Free user)
//
// Quota counter and persona header (「ミー先生」 + 「AI コーチ」)
// keep Decision 7 propagation consistent with the chat / advice
// surfaces.

interface Props {
  testID?: string;
}

const INTENT_MAX = 400;

export function RoutineGenerationCard({
  testID,
}: Props): React.ReactElement | null {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const profile = useProfileStore((s) => s.profile);
  const userId = profile?.id ?? '';
  const profileId = profile?.id ?? '';

  const sub = useSubscription();
  const hasAccess = sub.hasFeature('aiCoachGeneration');
  const generationLimit = sub.isPro ? 20 : sub.isPlus || sub.isTrial ? 5 : 0;

  const draft = useRoutineGenStore((s) => selectCurrentDraft(s, userId));
  const isGenerating = useRoutineGenStore((s) => s.isGenerating);
  const isApplying = useRoutineGenStore((s) => s.isApplying);
  const error = useRoutineGenStore((s) => s.error);
  const runGeneration = useRoutineGenStore((s) => s.runGeneration);
  const applyDraft = useRoutineGenStore((s) => s.applyDraft);
  const discardDraft = useRoutineGenStore((s) => s.discardDraft);
  const dismissError = useRoutineGenStore((s) => s.dismissError);

  const [intentText, setIntentText] = useState('');
  // Codex round 1 Important #3 fix — preview renders the user-
  // facing `nameJa` instead of the raw `exerciseSlug` (which is an
  // implementation detail like `bench-press`). Slug → nameJa is
  // resolved lazily on draft change.
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

  // Codex round 1 Important #1 fix — hydrate the local draft from
  // SQLite v33 on mount so a force-kill / app restart surfaces the
  // last draft as the "current" pointer (§5.2 I2 was the design
  // intent; this useEffect plus the loadFromCache override + the
  // store's listDraftsByUser hydration close the loop).
  const loadFromCache = useRoutineGenStore((s) => s.loadFromCache);
  useEffect(() => {
    if (!userId) return;
    void loadFromCache(userId);
  }, [userId, loadFromCache]);

  const state: RoutineGenCardState = pickRoutineGenCardState({
    hasAccess,
    isGenerating,
    isApplying,
    error,
    currentDraft: draft,
  });

  const handleGenerate = useCallback(async () => {
    if (!profile || !userId) return;
    const text = intentText.trim();
    if (!text) return;
    // Slug hint — pass the entire seed exercise slug list so Gemini
    // picks from it. The server-side EF re-validates the choice.
    const exerciseSlugs = await listAllExerciseSlugs();
    if (exerciseSlugs.length === 0) {
      Alert.alert('エラー', '種目データが読み込まれていません');
      return;
    }
    await runGeneration({
      userId,
      profileId,
      intentText: text,
      exerciseSlugs: exerciseSlugs.slice(0, 200),
    });
  }, [intentText, profile, userId, profileId, runGeneration]);

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
      setIntentText('');
    }
  }, [draft, userId, profileId, applyDraft]);

  const handleDiscard = useCallback(() => {
    if (!draft) return;
    // Phase 1.6 Codex round 1 Important fix — destructive action
    // gets a confirm dialog before clearing. The manual dogfood
    // checklist's "Discard prompts before clearing" item is now
    // accurate.
    Alert.alert(
      '下書きを破棄しますか',
      `「${draft.generatedRoutine.routineName}」 を破棄します。 元に戻せません。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '破棄する',
          style: 'destructive',
          onPress: () => {
            void discardDraft({ userId, generationId: draft.id });
            setIntentText('');
          },
        },
      ],
    );
  }, [draft, userId, discardDraft]);

  const handleRetry = useCallback(() => {
    dismissError();
    void handleGenerate();
  }, [dismissError, handleGenerate]);

  if (state === 'locked') {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceSecondary,
            borderColor: colors.border,
          },
        ]}
        testID={testID ?? 'routine-gen-card-locked'}
      >
        <View style={styles.headerRow}>
          <Ionicons name="sparkles-outline" size={18} color={colors.textSecondary} />
          <Text style={[styles.headerText, { color: colors.textPrimary }]}>
            ミー先生にルーティンを作ってもらう
          </Text>
        </View>
        <Text style={[styles.lockedBody, { color: colors.textSecondary }]}>
          ミー先生があなたの目標と好みに合わせて、 オリジナルのルーティンを生成します。
        </Text>
        <ProInlineCTA
          label="ミー先生にルーティンを作ってもらうには Plus へ →"
          variant="card"
        />
        <Text style={[styles.footer, { color: colors.textTertiary }]}>
          ミー先生 (AI コーチ)
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      testID={testID ?? 'routine-gen-card'}
    >
      <View style={styles.headerRow}>
        <Ionicons name="sparkles" size={18} color={colors.primary} />
        <Text style={[styles.headerText, { color: colors.textPrimary }]}>
          ミー先生にルーティンを作ってもらう
        </Text>
        <Text style={[styles.quotaBadge, { color: colors.textTertiary }]}>
          月{generationLimit}回
        </Text>
      </View>

      {state === 'idle' && (
        <View style={styles.body}>
          <TextInput
            value={intentText}
            onChangeText={setIntentText}
            placeholder="例: 自宅でできる肩と背中の日"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={INTENT_MAX}
            style={[
              styles.input,
              {
                color: colors.textPrimary,
                borderColor: colors.border,
                backgroundColor: colors.surfaceSecondary,
              },
            ]}
            accessibilityLabel="作りたいルーティンの意図"
            testID="routine-gen-intent-input"
          />
          <TouchableOpacity
            onPress={handleGenerate}
            accessibilityRole="button"
            accessibilityLabel="ルーティンを生成"
            accessibilityHint="入力した意図に合わせて、 ミー先生がルーティンを設計します"
            accessibilityState={{ disabled: !intentText.trim() }}
            disabled={!intentText.trim()}
            style={[
              styles.primaryButton,
              {
                backgroundColor: intentText.trim()
                  ? colors.primary
                  : colors.textTertiary,
              },
            ]}
            testID="routine-gen-generate-button"
          >
            <Ionicons name="sparkles" size={16} color="#FFFFFF" />
            <Text style={styles.primaryButtonLabel}>生成する</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === 'generating' && (
        <View style={styles.body} testID="routine-gen-card-generating">
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            ミー先生がルーティンを設計中...
          </Text>
        </View>
      )}

      {state === 'applying' && (
        <View style={styles.body} testID="routine-gen-card-applying">
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            ルーティンを適用中...
          </Text>
        </View>
      )}

      {state === 'preview' && draft && (
        <View style={styles.body} testID="routine-gen-card-preview">
          <Text style={[styles.previewTitle, { color: colors.textPrimary }]}>
            {draft.generatedRoutine.routineName}
          </Text>
          <Text style={[styles.previewMeta, { color: colors.textSecondary }]}>
            {draft.generatedRoutine.items.length} 種目
          </Text>
          {draft.generatedRoutine.items.slice(0, 8).map((item, idx) => (
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
          {draft.generatedRoutine.items.length > 8 && (
            <Text style={[styles.previewMore, { color: colors.textTertiary }]}>
              他 {draft.generatedRoutine.items.length - 8} 種目
            </Text>
          )}
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={handleDiscard}
              accessibilityRole="button"
              accessibilityLabel="破棄"
              accessibilityHint="破棄確認を表示します"
              style={[
                styles.secondaryButton,
                { borderColor: colors.border },
              ]}
              testID="routine-gen-discard-button"
            >
              <Text
                style={[styles.secondaryButtonLabel, { color: colors.textSecondary }]}
              >
                破棄
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleApply}
              accessibilityRole="button"
              accessibilityLabel="このルーティンを適用"
              accessibilityHint="生成されたルーティンをトレーニングメニューに追加します"
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
              testID="routine-gen-apply-button"
            >
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              <Text style={styles.primaryButtonLabel}>このルーティンを適用</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {state === 'error' && error && (
        <View style={styles.body} testID="routine-gen-card-error">
          <Text style={[styles.errorText, { color: colors.error }]}>
            {error.message}
          </Text>
          <TouchableOpacity
            onPress={handleRetry}
            accessibilityRole="button"
            accessibilityLabel="再試行"
            accessibilityHint="ルーティン生成をもう一度試します"
            style={[styles.secondaryButton, { borderColor: colors.primary }]}
            testID="routine-gen-retry-button"
          >
            <Ionicons name="refresh" size={14} color={colors.primary} />
            <Text style={[styles.secondaryButtonLabel, { color: colors.primary }]}>
              再試行
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={[styles.footer, { color: colors.textTertiary }]}>
        ミー先生 (AI コーチ)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 0.5,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerText: {
    ...typography.titleSmall,
    flex: 1,
  },
  quotaBadge: {
    ...typography.labelSmall,
  },
  body: {
    gap: spacing.sm,
  },
  lockedBody: {
    ...typography.bodyMedium,
  },
  input: {
    ...typography.bodyMedium,
    minHeight: 64,
    maxHeight: 120,
    borderRadius: 8,
    borderWidth: 0.5,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    textAlignVertical: 'top',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 9999,
  },
  primaryButtonLabel: {
    ...typography.labelMedium,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 9999,
    borderWidth: 0.5,
  },
  secondaryButtonLabel: {
    ...typography.labelMedium,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.bodySmall,
  },
  previewTitle: {
    ...typography.titleMedium,
    fontWeight: '700',
  },
  previewMeta: {
    ...typography.labelSmall,
  },
  previewItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
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
  previewMore: {
    ...typography.labelSmall,
    textAlign: 'right',
  },
  errorText: {
    ...typography.bodyMedium,
  },
  footer: {
    ...typography.labelSmall,
    textAlign: 'right',
  },
});
