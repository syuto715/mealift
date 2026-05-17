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

export default function DiagnosticStep() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const { step } = useLocalSearchParams<{ step: string }>();
  const stepIndex = Math.max(0, Number.parseInt(step ?? '0', 10) || 0);
  const question = getQuestionByIndex(stepIndex);

  const profile = useProfileStore((s) => s.profile);
  const userId = profile?.id ?? '';
  const profileId = profile?.id ?? '';

  const sub = useSubscription();
  const hasAccess = sub.hasFeature('aiCoachGeneration');

  const answers = useDiagnosticStore((s) => s.getAnswers(userId));
  const setAnswer = useDiagnosticStore((s) => s.setAnswer);
  const submitToGeneration = useDiagnosticStore((s) => s.submitToGeneration);
  const [submitting, setSubmitting] = useState(false);

  const isLastStep = stepIndex === DIAGNOSTIC_QUESTIONS.length - 1;
  const currentValue = question ? answers[question.id] : undefined;

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
