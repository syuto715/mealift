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
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../src/theme/tokens';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { Button } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import {
  ACTIVITY_LEVEL_OPTIONS,
  TRAINING_DAYS_MAX,
  TRAINING_DAYS_MIN,
  calculateMaintenanceCalories,
  formatMaintenanceKcal,
  getActivityLevelDescription,
  getActivityLevelLabel,
  getTrainingDaysErrorMessage,
  isAllInputsValidForC4,
  validateTrainingDaysPerWeek,
} from '../../src/domain/activityValidation';

// v1.3.0 / Onboarding v2 / Phase C-4 — Activity screen [4].
//
// Two inputs:
//   - activityLevel (5-card vertical radiogroup)
//   - trainingDaysPerWeek (0-7 stepper, initial 3)
// Plus a maintenance-kcal live feedback box that reads C-3 inputs
// (gender / birthYear / heightCm / currentWeightKg) AND this
// screen's activityLevel to compute BMR × activity factor.
//
// Pattern 26 transitional bridge — CTA pushes legacy
// /(onboarding)/body-and-training (which collects [3][4]
// combined) until Phase C-5 ships /goal-weight. Recon-confirmed
// that complete.tsx already preserves both v2 fields
// (activityLevel + trainingDaysPerWeek at lines 124-125), so no
// integrity hardening patch is needed for this phase.
//
// Patterns applied:
//   #5  CTA double-tap defense + per-input validation gate
//   #11 5-card selected state: border weight + background tint +
//       bold label (3 cues, color-only fallback safe)
//   #12 header / radiogroup+radio (activityLevel) / button
//       (training-days ± + CTA) / live region (maintenance kcal)
//   #15 ACTIVITY_LEVEL_OPTIONS as const literal-union
//   #18 SSoT — calculateBMR / calculateTDEE / ACTIVITY_MULTIPLIERS
//       reused via activityValidation, no redeclaration
//   #18 補強 — hasInteracted gate (onboardingStep >= 4) to block
//       no-touch submit against the INITIAL_STATE placeholders
//       (activityLevel='moderate', trainingDaysPerWeek=3)
//   #23 single persistToProfile call on CTA tap
//   #24 atomic 2-field persist (activityLevel + trainingDaysPerWeek)
//   #25 all logic lives in domain/activityValidation.ts

const TITLE = '普段の活動量を教えてください';
const SUBTITLE = '基礎代謝に活動係数を掛けて維持カロリーを計算します';
const CTA_LABEL = '次へ';

export default function ActivityScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const gender = useOnboardingStore((s) => s.gender);
  const birthYear = useOnboardingStore((s) => s.birthYear);
  const heightCm = useOnboardingStore((s) => s.heightCm);
  const currentWeightKg = useOnboardingStore((s) => s.currentWeightKg);
  const activityLevel = useOnboardingStore((s) => s.activityLevel);
  const trainingDaysPerWeek = useOnboardingStore((s) => s.trainingDaysPerWeek);
  const onboardingStep = useOnboardingStore((s) => s.onboardingStep);
  const setActivityLevel = useOnboardingStore((s) => s.setActivityLevel);
  const setTrainingDaysPerWeek = useOnboardingStore(
    (s) => s.setTrainingDaysPerWeek,
  );
  const persistToProfile = useOnboardingStore((s) => s.persistToProfile);

  const [touched, setTouched] = useState({
    trainingDays: false,
  });
  const [isAdvancing, setIsAdvancing] = useState(false);

  // Pattern 18 補強 (C-3 precedent) — INITIAL_STATE seeds Build
  // 14/15 placeholders (activityLevel='moderate',
  // trainingDaysPerWeek=3), so isAllInputsValidForC4 returns true
  // before user touches anything. Gate the CTA on a per-screen
  // sentinel: each setter atomically bumps onboardingStep to 4,
  // so step >= 4 proxies "user has interacted on this screen
  // OR is returning from a later screen." The latter case is
  // expected UX — back-nav from [5] should not require re-tap.
  const hasInteracted = onboardingStep >= 4;

  const trainingDaysValidation = useMemo(
    () => validateTrainingDaysPerWeek(trainingDaysPerWeek),
    [trainingDaysPerWeek],
  );
  const allValid = isAllInputsValidForC4(activityLevel, trainingDaysPerWeek);

  const trainingDaysError =
    touched.trainingDays && !trainingDaysValidation.valid
      ? getTrainingDaysErrorMessage(trainingDaysValidation.reason)
      : null;

  // Live maintenance kcal — null until prior-screen + this-screen
  // inputs are all valid. Hidden from the UI when null so a
  // partial-input state doesn't show "-- kcal/日" jitter.
  const maintenanceKcal = useMemo(() => {
    return calculateMaintenanceCalories({
      weightKg: currentWeightKg,
      heightCm,
      birthYear,
      gender,
      activityLevel,
    });
  }, [activityLevel, birthYear, currentWeightKg, gender, heightCm]);

  const decrementTrainingDays = useCallback(() => {
    setTouched((p) => ({ ...p, trainingDays: true }));
    setTrainingDaysPerWeek(
      Math.max(TRAINING_DAYS_MIN, trainingDaysPerWeek - 1),
    );
  }, [setTrainingDaysPerWeek, trainingDaysPerWeek]);

  const incrementTrainingDays = useCallback(() => {
    setTouched((p) => ({ ...p, trainingDays: true }));
    setTrainingDaysPerWeek(
      Math.min(TRAINING_DAYS_MAX, trainingDaysPerWeek + 1),
    );
  }, [setTrainingDaysPerWeek, trainingDaysPerWeek]);

  const handleSubmit = useCallback(async () => {
    if (isAdvancing) return;
    setTouched({ trainingDays: true });
    if (!allValid || !hasInteracted) return;
    setIsAdvancing(true);
    try {
      await persistToProfile();
    } catch (err) {
      console.warn('[onboarding/activity] persistToProfile failed', err);
    }
    // Phase C-5 flipped this to the new flow's [5] /goal-weight
    // screen. The C-4 stop-gap (legacy /body-and-training) is no
    // longer reachable from this CTA. goal-weight itself still
    // bridges to /body-and-training until Phase D ships
    // /goal-summary (Pattern 26 transitional chain continues).
    router.push('/(onboarding)/goal-weight');
  }, [allValid, hasInteracted, isAdvancing, persistToProfile]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
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

        {/* Activity level — 5-card vertical list */}
        <View
          style={styles.cardList}
          accessibilityRole="radiogroup"
          accessibilityLabel="活動レベル"
        >
          {ACTIVITY_LEVEL_OPTIONS.map((level) => {
            const selected = activityLevel === level;
            const label = getActivityLevelLabel(level);
            const description = getActivityLevelDescription(level);
            return (
              <TouchableOpacity
                key={level}
                onPress={() => setActivityLevel(level)}
                activeOpacity={0.7}
                style={[
                  styles.card,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected
                      ? colors.primary + '15'
                      : colors.surface,
                  },
                  selected && styles.cardSelected,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${label} ${description}`}
                testID={`activity-card-${level}`}
              >
                <View style={styles.cardLeft}>
                  <View
                    style={[
                      styles.radioOuter,
                      {
                        borderColor: selected
                          ? colors.primary
                          : colors.textTertiary,
                      },
                    ]}
                  >
                    {selected && (
                      <View
                        style={[
                          styles.radioInner,
                          { backgroundColor: colors.primary },
                        ]}
                      />
                    )}
                  </View>
                </View>
                <View style={styles.cardCenter}>
                  <Text
                    style={[
                      styles.cardLabel,
                      {
                        color: selected
                          ? colors.primary
                          : colors.textPrimary,
                        fontWeight: selected ? '700' : '600',
                      },
                    ]}
                  >
                    {label}
                  </Text>
                  <Text
                    style={[
                      styles.cardDesc,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {description}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Training days per week — 0..7 stepper */}
        <View style={styles.section}>
          <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
            週のトレーニング日数
          </Text>
          <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>
            筋トレや本格的な運動を行う日数の目安です
          </Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              onPress={decrementTrainingDays}
              disabled={trainingDaysPerWeek <= TRAINING_DAYS_MIN}
              style={[
                styles.stepperBtn,
                {
                  backgroundColor: colors.surfaceSecondary,
                  opacity:
                    trainingDaysPerWeek <= TRAINING_DAYS_MIN ? 0.4 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="トレーニング日数を減らす"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              testID="activity-training-days-decrement"
            >
              <Ionicons name="remove" size={22} color={colors.primary} />
            </TouchableOpacity>
            <Text
              style={[styles.stepperValue, { color: colors.textPrimary }]}
              accessibilityLiveRegion="polite"
            >
              週 {trainingDaysPerWeek} 日
            </Text>
            <TouchableOpacity
              onPress={incrementTrainingDays}
              disabled={trainingDaysPerWeek >= TRAINING_DAYS_MAX}
              style={[
                styles.stepperBtn,
                {
                  backgroundColor: colors.surfaceSecondary,
                  opacity:
                    trainingDaysPerWeek >= TRAINING_DAYS_MAX ? 0.4 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="トレーニング日数を増やす"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              testID="activity-training-days-increment"
            >
              <Ionicons name="add" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <View
            style={styles.errorRow}
            accessibilityLiveRegion="polite"
            accessible={!!trainingDaysError}
          >
            {trainingDaysError && (
              <Text style={[styles.errorText, { color: colors.error }]}>
                {trainingDaysError}
              </Text>
            )}
          </View>
        </View>

        {/* Maintenance kcal feedback (Pattern 11 + 18) —
            Codex pass 1 / Important fix — also gate on
            hasInteracted so a fresh INITIAL_STATE user doesn't
            see a concrete "維持カロリー: 2,341" derived from
            scaffold defaults (male/1995/170/70/moderate are all
            valid placeholders) before they've confirmed any
            input is actually theirs. Same Pattern 18 補強
            reasoning C-3 used for its CTA gate. */}
        {hasInteracted && maintenanceKcal != null && (
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
            <Ionicons
              name="flash-outline"
              size={20}
              color={colors.primary}
              style={styles.feedbackIcon}
            />
            <View style={styles.feedbackTextWrap}>
              <Text
                style={[styles.feedbackLabel, { color: colors.textTertiary }]}
              >
                維持カロリー
              </Text>
              <Text
                style={[styles.feedbackValue, { color: colors.textPrimary }]}
              >
                {formatMaintenanceKcal(maintenanceKcal)}
              </Text>
            </View>
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
          testID="activity-cta"
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
  cardList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  cardSelected: {
    borderWidth: 2,
  },
  cardLeft: {
    width: 24,
    alignItems: 'center',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  cardCenter: {
    flex: 1,
    gap: 2,
  },
  cardLabel: {
    ...typography.labelLarge,
  },
  cardDesc: {
    ...typography.bodySmall,
  },
  section: {
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  fieldLabel: {
    ...typography.labelLarge,
  },
  fieldHint: {
    ...typography.bodySmall,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    backgroundColor: undefined,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    ...typography.titleMedium,
    fontVariant: ['tabular-nums'],
  },
  errorRow: {
    minHeight: 18,
  },
  errorText: {
    ...typography.bodySmall,
  },
  feedbackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.md,
  },
  feedbackIcon: {
    // visual-only; a11y is covered by the parent's live region label
  },
  feedbackTextWrap: {
    flex: 1,
    gap: 2,
  },
  feedbackLabel: {
    ...typography.bodySmall,
  },
  feedbackValue: {
    ...typography.titleMedium,
    fontVariant: ['tabular-nums'],
  },
  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
