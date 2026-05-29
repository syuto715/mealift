import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useProfileStore } from '../../../../src/stores/profileStore';
import { useSubscription } from '../../../../src/hooks/useSubscription';
import { useDiagnosticStore } from '../../../../src/stores/diagnosticStore';
import {
  DIAGNOSTIC_QUESTIONS,
  getQuestionByIndex,
} from '../../../../src/domain/diagnosticQuestions';
import { ProInlineCTA } from '../../../../src/components/shared/ProInlineCTA';
import { getColors } from '../../../../src/theme/tokens';
import { typography } from '../../../../src/theme/typography';
import { spacing } from '../../../../src/theme/spacing';
import type {
  DiagnosticAnswerValue,
  DiagnosticQuestion,
} from '../../../../src/types/diagnostic';

// v1.5 Stage 1 Phase 1.3 — diagnostic wizard step (dynamic route).
//
// Renders the question at index `step`. On the final step, the
// "送信" CTA invokes `submitToGeneration` and navigates to
// `/(tabs)/coach/diagnostic/result`. Free user deep-link access
// is blocked here by `hasFeature('aiCoachGeneration')`.

// v1.5.2-instr — module-level guard so the render-body Alert.alert
// breadcrumbs fire only on the first mount of this component in the
// app session. Codex Round 1 Critical #1 fix: writing answers via
// `setAnswer` triggers a re-render, and unguarded body-level alerts
// would re-fire on every subsequent render and make the screen
// unusable. The flag is flipped at Step 10 once the full hook chain
// has been observed; a mid-render Hermes crash never reaches the
// assignment, so a next mount attempt (if the app survives) would
// re-instrument. The entire instrumentation block is reverted in the
// next sprint (cleanup queue item).
let diagnosticStepInstrumented = false;

export default function DiagnosticStep() {
  // Snapshot the guard once per render so a re-entrant Alert callback
  // doesn't observe a flipped flag mid-chain. The 8 body breadcrumbs
  // below either ALL fire (first render) or NONE fire (subsequent).
  //
  // Codex Round 1 Critical #2 acknowledgment: these alerts share the
  // same JS turn, so iOS surfaces them via the modal stack — Syuto
  // dismisses them in FIFO order, and the LAST alert visible before
  // the crash bounds the failing hook. True "blocking" semantics are
  // unavailable mid-render (hooks can't be paused on a Promise), so
  // the handler-side chain in diagnostic/index.tsx is the part with
  // tight ordering; the body-level chain here is a queue snapshot of
  // "everything that ran before the crash."
  const instrument = !diagnosticStepInstrumented;

  if (instrument) Alert.alert('🔍 Step 3', 'component body entered');

  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  if (instrument) Alert.alert('🔍 Step 4', 'useColorScheme + getColors OK');

  const { step } = useLocalSearchParams<{ step: string }>();
  const stepIndex = Math.max(0, Number.parseInt(step ?? '0', 10) || 0);
  const question = getQuestionByIndex(stepIndex);
  if (instrument) Alert.alert('🔍 Step 5', 'useLocalSearchParams + getQuestionByIndex OK');

  const profile = useProfileStore((s) => s.profile);
  const userId = profile?.id ?? '';
  const profileId = profile?.id ?? '';
  if (instrument) Alert.alert('🔍 Step 6', 'useProfileStore OK');

  const sub = useSubscription();
  // H6-γ candidate gate — if Step 6 fires but Step 7 doesn't, the
  // crash is inside useSubscription's setup chain (RevenueCat init
  // race or useState/useMemo binding inside the hook).
  if (instrument) Alert.alert('🔍 Step 7', 'useSubscription OK');

  const hasAccess = sub.hasFeature('aiCoachGeneration');
  // H6-γ / H6-ε candidate gate — functionPrototypeBind is the crash
  // frame; if Step 7 fires but Step 8 doesn't, the .bind() target
  // is somewhere in hasFeature's call chain (subscriptionService.ts,
  // which has `if (__DEV__) return true;` early-returns that are
  // skipped in preview/production builds — H6-ε).
  if (instrument) Alert.alert('🔍 Step 8', 'sub.hasFeature OK');

  const answers = useDiagnosticStore((s) => s.getAnswers(userId));
  const setAnswer = useDiagnosticStore((s) => s.setAnswer);
  const submitToGeneration = useDiagnosticStore((s) => s.submitToGeneration);
  // H6-α / H6-δ candidate gate — getAnswers returns a fresh `{}` on
  // each call when wizards is empty (diagnosticStore.ts:62), so
  // selector-instability-driven re-renders combined with .bind()
  // somewhere downstream would surface between Step 8 and Step 9.
  if (instrument) Alert.alert('🔍 Step 9', 'useDiagnosticStore × 3 selectors OK');

  const [submitting, setSubmitting] = useState(false);

  const isLastStep = stepIndex === DIAGNOSTIC_QUESTIONS.length - 1;
  const currentValue = question ? answers[question.id] : undefined;
  // Step 10 — if Step 9 fires but Step 10 doesn't, the crash is
  // between the zustand selectors and useState (vanishingly unlikely
  // — useState is among the simplest hooks). The guard flip lives
  // here so subsequent renders (e.g. after `setAnswer` mutates the
  // answers store) skip the entire alert chain.
  if (instrument) {
    diagnosticStepInstrumented = true;
    Alert.alert('🔍 Step 10', 'useState + derived values OK — render starts next');
  }

  const canAdvance = useMemo(() => {
    if (!question) return false;
    if (!question.required) return true;
    if (currentValue === undefined || currentValue === null) return false;
    if (typeof currentValue === 'string') return currentValue.length > 0;
    if (Array.isArray(currentValue)) return currentValue.length > 0;
    return true;
  }, [question, currentValue]);

  const handleSetAnswer = useCallback(
    (value: DiagnosticAnswerValue) => {
      if (!question || !userId) return;
      setAnswer(userId, question.id, value);
    },
    [question, userId, setAnswer],
  );

  const handleAdvance = useCallback(async () => {
    if (!canAdvance) return;
    if (isLastStep) {
      // Final step — submit to generation then navigate to result.
      setSubmitting(true);
      try {
        const result = await submitToGeneration({ userId, profileId });
        if (result) {
          router.replace('/(tabs)/coach/diagnostic/result');
        } else {
          // Codex round 1 Important fix — surface the silent
          // failure path (empty slug seed OR downstream
          // runGeneration failure) so the user knows why the
          // submit didn't advance. `routineGenStore.error` is
          // surfaced on the result screen for downstream
          // failures; this Alert handles the no-slug-seed path
          // (no result, no error in routineGenStore).
          Alert.alert(
            'ルーティンを生成できませんでした',
            'もう一度お試しください。 種目データの読み込みに失敗した可能性があります。',
          );
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }
    router.push(`/(tabs)/coach/diagnostic/${stepIndex + 1}`);
  }, [
    canAdvance,
    isLastStep,
    stepIndex,
    submitToGeneration,
    userId,
    profileId,
  ]);

  // v1.5.2-A Fix 2 (H6-γ — defensive). RevenueCat init can briefly leave the
  // subscription snapshot mid-resolution; gate the `hasFeature`-driven branch
  // behind the hook's loading flag so the gating decision is never taken
  // against a half-initialised plan state. `useSubscription().isLoading` is
  // false at mount (it only flips during an in-flight subscribe/restore, which
  // this screen never triggers), so this gate is a low-probability safety net,
  // NOT the primary crash fix — that is Fix 1's selector-stability change in
  // diagnosticStore. It cannot loop: nothing on this screen sets isLoading, so
  // the gate resolves on the first render.
  if (sub.isLoading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <View style={styles.lockedView} testID="diagnostic-step-loading">
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!hasAccess) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <View style={styles.lockedView} testID="diagnostic-step-locked">
          <Ionicons
            name="lock-closed-outline"
            size={32}
            color={colors.textSecondary}
          />
          <Text style={[styles.lockedBody, { color: colors.textSecondary }]}>
            診断機能は Plus / Pro でご利用いただけます。
          </Text>
          <ProInlineCTA
            label="Plus / Pro へ →"
            variant="card"
          />
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="戻る"
            accessibilityHint="コーチタブに戻ります"
            style={[styles.secondaryButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.secondaryButtonLabel, { color: colors.textSecondary }]}>
              戻る
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!question) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <View style={styles.lockedView}>
          <Text style={[styles.lockedBody, { color: colors.textSecondary }]}>
            この質問は見つかりませんでした。
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)/coach/diagnostic')}
            accessibilityRole="button"
            accessibilityLabel="最初に戻る"
            accessibilityHint="診断の最初の質問に戻ります"
            style={[styles.secondaryButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.secondaryButtonLabel, { color: colors.textSecondary }]}>
              最初に戻る
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={[styles.headerRow, { borderColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="戻る"
          accessibilityHint="前の質問に戻ります"
          style={styles.backButton}
          testID="diagnostic-back-button"
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={colors.textPrimary}
          />
        </TouchableOpacity>
        <Text style={[styles.progress, { color: colors.textSecondary }]}>
          {stepIndex + 1} / {DIAGNOSTIC_QUESTIONS.length}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.questionLabel, { color: colors.textPrimary }]}>
          {question.label}
        </Text>
        {question.hint && (
          <Text style={[styles.questionHint, { color: colors.textTertiary }]}>
            {question.hint}
          </Text>
        )}

        <QuestionInput
          question={question}
          value={currentValue}
          onChange={handleSetAnswer}
          colors={colors}
        />
      </ScrollView>

      <View
        style={[styles.footerRow, { borderColor: colors.border }]}
      >
        <TouchableOpacity
          onPress={handleAdvance}
          accessibilityRole="button"
          accessibilityLabel={isLastStep ? '送信する' : '次へ'}
          accessibilityHint={
            isLastStep
              ? '回答を送信してルーティンを生成します'
              : '次の質問へ進みます'
          }
          accessibilityState={{ disabled: !canAdvance || submitting }}
          disabled={!canAdvance || submitting}
          style={[
            styles.primaryButton,
            {
              backgroundColor:
                canAdvance && !submitting
                  ? colors.primary
                  : colors.textTertiary,
            },
          ]}
          testID="diagnostic-advance-button"
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.primaryButtonLabel}>
                {isLastStep ? '送信する' : '次へ'}
              </Text>
              <Ionicons
                name={isLastStep ? 'sparkles' : 'chevron-forward'}
                size={16}
                color="#FFFFFF"
              />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------
// Question input — switches on question.type.
// ---------------------------------------------------------------

interface QuestionInputProps {
  question: DiagnosticQuestion;
  value: DiagnosticAnswerValue | undefined;
  onChange: (next: DiagnosticAnswerValue) => void;
  // deno-lint-ignore no-explicit-any
  colors: any;
}

function QuestionInput({
  question,
  value,
  onChange,
  colors,
}: QuestionInputProps): React.ReactElement | null {
  if (question.type === 'single' && question.options) {
    return (
      <View style={inputStyles.optionsList}>
        {question.options.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onChange(opt.value)}
              accessibilityRole="radio"
              accessibilityLabel={opt.label}
              accessibilityHint={
                isSelected ? '選択中の項目です' : 'この項目を選択します'
              }
              accessibilityState={{ selected: isSelected }}
              style={[
                inputStyles.optionRow,
                {
                  borderColor: isSelected ? colors.primary : colors.border,
                  backgroundColor: isSelected
                    ? colors.primary + '15'
                    : colors.surface,
                },
              ]}
              testID={`diagnostic-option-${question.id}-${opt.value}`}
            >
              <Ionicons
                name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={isSelected ? colors.primary : colors.textTertiary}
              />
              <Text
                style={[
                  inputStyles.optionLabel,
                  { color: colors.textPrimary },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  if (question.type === 'multi' && question.options) {
    const selected = Array.isArray(value) ? value : [];
    return (
      <View style={inputStyles.optionsList}>
        {question.options.map((opt) => {
          const isSelected = selected.includes(opt.value);
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => {
                const next = isSelected
                  ? selected.filter((v) => v !== opt.value)
                  : [...selected, opt.value];
                onChange(next);
              }}
              accessibilityRole="checkbox"
              accessibilityLabel={opt.label}
              accessibilityHint={
                isSelected
                  ? '選択中の項目です。 タップで解除'
                  : 'この項目を選択します'
              }
              accessibilityState={{ checked: isSelected }}
              style={[
                inputStyles.optionRow,
                {
                  borderColor: isSelected ? colors.primary : colors.border,
                  backgroundColor: isSelected
                    ? colors.primary + '15'
                    : colors.surface,
                },
              ]}
              testID={`diagnostic-option-${question.id}-${opt.value}`}
            >
              <Ionicons
                name={isSelected ? 'checkbox' : 'square-outline'}
                size={20}
                color={isSelected ? colors.primary : colors.textTertiary}
              />
              <Text
                style={[
                  inputStyles.optionLabel,
                  { color: colors.textPrimary },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  if (question.type === 'number') {
    const current =
      typeof value === 'number'
        ? value
        : (question.defaultNumber ?? question.min ?? 1);
    const min = question.min ?? 1;
    const max = question.max ?? 99;
    return (
      <View style={inputStyles.numberRow}>
        <TouchableOpacity
          onPress={() => onChange(Math.max(min, current - 1))}
          accessibilityRole="button"
          accessibilityLabel="減らす"
          accessibilityHint="値を 1 つ減らします"
          style={[
            inputStyles.numberStepButton,
            { backgroundColor: colors.surfaceSecondary },
          ]}
          testID={`diagnostic-number-decrement-${question.id}`}
        >
          <Ionicons
            name="remove"
            size={20}
            color={colors.textPrimary}
          />
        </TouchableOpacity>
        <Text
          style={[
            inputStyles.numberValue,
            { color: colors.textPrimary },
          ]}
          testID={`diagnostic-number-value-${question.id}`}
        >
          {current}
        </Text>
        <TouchableOpacity
          onPress={() => onChange(Math.min(max, current + 1))}
          accessibilityRole="button"
          accessibilityLabel="増やす"
          accessibilityHint="値を 1 つ増やします"
          style={[
            inputStyles.numberStepButton,
            { backgroundColor: colors.surfaceSecondary },
          ]}
          testID={`diagnostic-number-increment-${question.id}`}
        >
          <Ionicons name="add" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
    );
  }

  if (question.type === 'text') {
    return (
      <TextInput
        value={typeof value === 'string' ? value : ''}
        onChangeText={(t) => onChange(t)}
        placeholder="入力してください"
        placeholderTextColor={colors.textTertiary}
        multiline
        maxLength={question.maxLength ?? 200}
        style={[
          inputStyles.textInput,
          {
            color: colors.textPrimary,
            borderColor: colors.border,
            backgroundColor: colors.surfaceSecondary,
          },
        ]}
        accessibilityLabel={question.label}
        testID={`diagnostic-text-input-${question.id}`}
      />
    );
  }

  return null;
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
  progress: {
    ...typography.labelMedium,
    fontVariant: ['tabular-nums'],
  },
  headerSpacer: { flex: 1 },
  body: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  questionLabel: {
    ...typography.titleMedium,
    fontWeight: '600',
  },
  questionHint: {
    ...typography.bodySmall,
    marginTop: -spacing.sm,
  },
  footerRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 0.5,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 9999,
  },
  primaryButtonLabel: {
    ...typography.labelLarge,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 9999,
    borderWidth: 0.5,
    marginTop: spacing.md,
  },
  secondaryButtonLabel: {
    ...typography.labelMedium,
    fontWeight: '600',
  },
  lockedView: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  lockedBody: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
});

const inputStyles = StyleSheet.create({
  optionsList: {
    gap: spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 0.5,
  },
  optionLabel: {
    ...typography.bodyMedium,
    flex: 1,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  numberStepButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberValue: {
    ...typography.displayMedium,
    fontVariant: ['tabular-nums'],
    minWidth: 80,
    textAlign: 'center',
  },
  textInput: {
    ...typography.bodyMedium,
    minHeight: 100,
    maxHeight: 200,
    borderRadius: 12,
    borderWidth: 0.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    textAlignVertical: 'top',
  },
});
