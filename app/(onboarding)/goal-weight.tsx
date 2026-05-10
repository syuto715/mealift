import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import { getColors, radius } from '../../src/theme/tokens';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { Button } from '../../src/components/ui';
import { WeightSlider } from '../../src/components/onboarding/WeightSlider';
import { PaceSelector } from '../../src/components/onboarding/PaceSelector';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import {
  TARGET_WEIGHT_KG_MAX,
  TARGET_WEIGHT_KG_MIN,
  GOAL_TYPE_OPTIONS,
  calculateGoalSummary,
  filterPaceOptionsForGoalType,
  formatGoalSummary,
  getDirection,
  getGoalTypeDescription,
  getGoalTypeLabel,
  isAllInputsValidForC5,
  isGoalTypeConsistent,
} from '../../src/domain/goalWeightValidation';
import { CURRENT_WEIGHT_KG_STEP } from '../../src/domain/bodyInfoValidation';
import type { WeeklyRatePct } from '../../src/types/profile';
import type { GoalType } from '../../src/types/common';

// v1.3.0 / Onboarding v2 / Phase C-5 — Goal weight + pace screen [5].
//
// Three intertwined inputs: goalType (4-segment) + targetWeightKg
// (B-2 WeightSlider) + weeklyRatePct (B-3 PaceSelector). First
// real Phase B integration — the screen is render-only,
// goalWeightValidation does all the consistency math.
//
// Pattern 26 transitional bridge — CTA pushes legacy
// /(onboarding)/body-and-training until Phase D ships
// /goal-summary [5.5]. Bridge integrity verified:
//   - end destination (complete.tsx) — weeklyRatePct hardened in
//     this commit alongside the existing C-2 nickname patch.
//   - intermediate (body-and-training) — setBody preserves
//     targetWeightKg via no-touch passthrough; user-touch edits
//     are intentional. C-4 fromNewFlow guard already preserves
//     activityLevel + trainingDaysPerWeek.
//
// Known API gap (surfaced for Phase D fix) — B-3 PaceSelector
// auto-disables options based on getDirection(currentWeight,
// targetWeight). For goalType='recomp' the target ≈ current,
// so direction='maintain' disables all non-zero rates. We pass
// `options=[-0.25, 0, 0.25]` for recomp but the user only sees
// 0 as enabled. Phase D fix is a `disabledOptions` prop on
// PaceSelector the screen drives directly.

const TITLE = '目標を設定しましょう';
const SUBTITLE = 'いつまでにどうなりたいかを決めます';
const CTA_LABEL = '次へ';

export default function GoalWeightScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const currentWeightKg = useOnboardingStore((s) => s.currentWeightKg);
  const targetWeightKg = useOnboardingStore((s) => s.targetWeightKg);
  const goalType = useOnboardingStore((s) => s.goalType);
  const weeklyRatePct = useOnboardingStore((s) => s.weeklyRatePct);
  const onboardingStep = useOnboardingStore((s) => s.onboardingStep);
  const setTargetWeightKg = useOnboardingStore((s) => s.setTargetWeightKg);
  const setGoalType = useOnboardingStore((s) => s.setGoalType);
  const setWeeklyRatePct = useOnboardingStore((s) => s.setWeeklyRatePct);
  const persistToProfile = useOnboardingStore((s) => s.persistToProfile);

  const [isAdvancing, setIsAdvancing] = useState(false);

  // Pattern 18 補強 (C-3 / C-4 precedent) — INITIAL_STATE seeds
  // legacy placeholders (goalType='cut', targetWeightKg=null,
  // weeklyRatePct=null). Without the gate, an arrival with
  // targetWeightKg already null would just disable on validation,
  // but goalType='cut' alone is "valid" enough that returning
  // users could appear to satisfy partial state. Step-based
  // sentinel covers both fresh and back-nav users uniformly.
  const hasInteracted = onboardingStep >= 5;

  // Slider needs a non-null number. Fall back to currentWeight so
  // the slider thumb has a sane initial position — user must
  // explicitly move it (which fires setTargetWeightKg with the
  // chosen value) for the field to actually become non-null.
  // Codex pass 1 / Important #1 — clamp to C-5 range so a legacy
  // body-and-training edit that wrote 25kg (legacy allows >=20)
  // doesn't surface as "slider 30.0 / label 25.0" contradictory
  // UI on revisit. All downstream consumers (delta label,
  // PaceSelector, calculateGoalSummary) read from the clamped
  // value to stay internally consistent.
  const rawTarget = targetWeightKg ?? currentWeightKg;
  const targetSliderValue = Math.max(
    TARGET_WEIGHT_KG_MIN,
    Math.min(TARGET_WEIGHT_KG_MAX, rawTarget),
  );

  const paceOptions = useMemo(
    () => filterPaceOptionsForGoalType(goalType),
    [goalType],
  );

  // Codex pass 1 / Sign-off violation fix — recomp's contract is
  // `[-0.25, 0, 0.25]` selectable, but PaceSelector's default
  // auto-disable derives direction from currentWeight/targetWeight.
  // For recomp target ≈ current → direction='maintain', auto-
  // disabling the non-zero options. Drive the disable state
  // explicitly: empty list for recomp (no disable beyond the
  // option-filter restriction), and undefined for other goalTypes
  // so the default direction logic applies.
  const paceDisabledOverride = goalType === 'recomp' ? [] : undefined;

  // Cross-field consistency — independently of the per-field
  // validators, the screen needs all three to line up. Used by
  // both the CTA gate and the goal-summary feedback.
  const consistent = useMemo(() => {
    if (
      targetWeightKg == null ||
      weeklyRatePct == null ||
      !Number.isFinite(currentWeightKg)
    ) {
      return false;
    }
    return isGoalTypeConsistent(
      goalType,
      currentWeightKg,
      targetWeightKg,
      weeklyRatePct,
    );
  }, [currentWeightKg, goalType, targetWeightKg, weeklyRatePct]);

  const allValid = isAllInputsValidForC5(
    goalType,
    targetWeightKg,
    weeklyRatePct,
    currentWeightKg,
  );

  const goalSummary = useMemo(() => {
    if (targetWeightKg == null || weeklyRatePct == null) return null;
    return calculateGoalSummary(
      currentWeightKg,
      targetSliderValue,
      weeklyRatePct,
    );
  }, [currentWeightKg, targetSliderValue, targetWeightKg, weeklyRatePct]);

  // Auto-coordinate weeklyRatePct when goalType changes — drop
  // an inconsistent rate to null so the user re-selects from the
  // new legal subset. Without this, switching cut → bulk would
  // leave the screen with a negative rate while showing
  // positive-only options, surfacing a stale invalid state.
  const handleGoalTypeChange = useCallback(
    (next: GoalType) => {
      setGoalType(next);
      if (
        weeklyRatePct != null &&
        targetWeightKg != null &&
        !isGoalTypeConsistent(
          next,
          currentWeightKg,
          targetWeightKg,
          weeklyRatePct,
        )
      ) {
        setWeeklyRatePct(null);
      }
    },
    [
      currentWeightKg,
      setGoalType,
      setWeeklyRatePct,
      targetWeightKg,
      weeklyRatePct,
    ],
  );

  // Direction switch (back-nav changed currentWeight or user
  // dragged target across the boundary) — if the picked rate is
  // no longer consistent with goalType + new direction, drop it.
  // Different from handleGoalTypeChange because the trigger is a
  // weight change, not a goalType change.
  const handleTargetWeightChange = useCallback(
    (next: number) => {
      setTargetWeightKg(next);
      if (
        weeklyRatePct != null &&
        !isGoalTypeConsistent(
          goalType,
          currentWeightKg,
          next,
          weeklyRatePct,
        )
      ) {
        setWeeklyRatePct(null);
      }
    },
    [
      currentWeightKg,
      goalType,
      setTargetWeightKg,
      setWeeklyRatePct,
      weeklyRatePct,
    ],
  );

  const handleSubmit = useCallback(async () => {
    if (isAdvancing) return;
    if (!allValid || !hasInteracted) return;
    setIsAdvancing(true);
    try {
      await persistToProfile();
    } catch (err) {
      console.warn('[onboarding/goal-weight] persistToProfile failed', err);
    }
    // Phase D-1 transitional bridge — flip to '/goal-summary'
    // when the new flow's [5.5] ships. body-and-training is the
    // closest legacy semantic match; weeklyRatePct hardening in
    // complete.tsx preserves the C-5 choice end-to-end through
    // the legacy completion path.
    router.push('/(onboarding)/body-and-training');
  }, [allValid, hasInteracted, isAdvancing, persistToProfile]);

  const direction = getDirection(currentWeightKg, targetSliderValue);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={[styles.title, { color: colors.textPrimary }]}
          accessibilityRole="header"
        >
          {TITLE}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {SUBTITLE}
        </Text>

        {/* Goal type — 4-segment radiogroup */}
        <View style={styles.section}>
          <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
            目標タイプ
          </Text>
          <View
            style={styles.segmentRow}
            accessibilityRole="radiogroup"
            accessibilityLabel="目標タイプ"
          >
            {GOAL_TYPE_OPTIONS.map((g) => {
              const selected = goalType === g;
              return (
                <TouchableOpacity
                  key={g}
                  onPress={() => handleGoalTypeChange(g)}
                  style={[
                    styles.segmentBtn,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected
                        ? colors.primary + '15'
                        : colors.surface,
                    },
                    selected && styles.segmentBtnSelected,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${getGoalTypeLabel(g)} ${getGoalTypeDescription(g)}`}
                  testID={`goal-weight-type-${g}`}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      {
                        color: selected ? colors.primary : colors.textPrimary,
                        fontWeight: selected ? '700' : '500',
                      },
                    ]}
                  >
                    {getGoalTypeLabel(g)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Target weight — B-2 WeightSlider */}
        <View style={styles.section}>
          <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
            目標体重
          </Text>
          <WeightSlider
            value={targetSliderValue}
            onChange={handleTargetWeightChange}
            min={TARGET_WEIGHT_KG_MIN}
            max={TARGET_WEIGHT_KG_MAX}
            step={CURRENT_WEIGHT_KG_STEP}
            label="目標体重"
            testID="goal-weight-target"
          />
          {/* Codex pass 1 / Nits — drop accessibilityLiveRegion to
              avoid per-tick chatter (slider's own adjustable role
              announces value changes), and hide the delta label
              until targetWeightKg is non-null so the pre-touch
              copy doesn't read like a real maintain choice. */}
          {targetWeightKg != null && (
            <Text style={[styles.deltaLabel, { color: colors.textSecondary }]}>
              現在 {currentWeightKg.toFixed(1)} kg →{' '}
              目標 {targetSliderValue.toFixed(1)} kg（
              {direction === 'cut'
                ? '減量'
                : direction === 'bulk'
                  ? '増量'
                  : '維持'}
              ）
            </Text>
          )}
        </View>

        {/* Weekly rate — B-3 PaceSelector */}
        <View style={styles.section}>
          <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
            ペース
          </Text>
          <PaceSelector
            value={weeklyRatePct}
            onChange={(v) => setWeeklyRatePct(v as WeeklyRatePct)}
            currentWeight={currentWeightKg}
            targetWeight={targetSliderValue}
            options={paceOptions}
            disabledOptions={paceDisabledOverride}
            testID="goal-weight-pace"
          />
        </View>

        {/* Goal summary — live feedback */}
        {hasInteracted && consistent && goalSummary && (
          <View
            style={[
              styles.feedbackBox,
              {
                backgroundColor: colors.surfaceSecondary,
                borderColor: colors.border,
              },
            ]}
            accessibilityLiveRegion="polite"
          >
            <Text
              style={[styles.feedbackLabel, { color: colors.textTertiary }]}
            >
              達成予定
            </Text>
            <Text
              style={[styles.feedbackValue, { color: colors.textPrimary }]}
            >
              {formatGoalSummary(goalSummary)}
            </Text>
          </View>
        )}
        {hasInteracted &&
          consistent &&
          goalSummary == null &&
          goalType === 'maintain' && (
            <View
              style={[
                styles.feedbackBox,
                {
                  backgroundColor: colors.surfaceSecondary,
                  borderColor: colors.border,
                },
              ]}
              accessibilityLiveRegion="polite"
            >
              <Text
                style={[
                  styles.feedbackValue,
                  { color: colors.textPrimary },
                ]}
              >
                現状維持を継続
              </Text>
            </View>
          )}
      </ScrollView>

      <View style={[styles.ctaBar, { borderTopColor: colors.border }]}>
        <Button
          title={CTA_LABEL}
          onPress={handleSubmit}
          variant="primary"
          size="lg"
          fullWidth
          disabled={!allValid || !hasInteracted || isAdvancing}
          testID="goal-weight-cta"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  title: {
    ...typography.titleLarge,
  },
  subtitle: {
    ...typography.bodyMedium,
  },
  section: {
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  fieldLabel: {
    ...typography.labelLarge,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  segmentBtnSelected: {
    borderWidth: 2,
  },
  segmentLabel: {
    ...typography.labelMedium,
  },
  deltaLabel: {
    ...typography.bodySmall,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.xs,
  },
  feedbackBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  feedbackLabel: {
    ...typography.bodySmall,
  },
  feedbackValue: {
    ...typography.titleSmall,
    fontVariant: ['tabular-nums'],
  },
  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
