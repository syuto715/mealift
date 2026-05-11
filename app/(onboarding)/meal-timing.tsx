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
  MEAL_TIMING_OPTIONS,
  type MealTiming,
  formatSelectedCountLabel,
  getMealTimingDescription,
  getMealTimingLabel,
  isAllInputsValidForD3,
  isValidMealTiming,
  toggleSelection,
} from '../../src/domain/mealTimingUtils';

// v1.3.0 / Onboarding v2 / Phase D-3 — Meal timing screen [7].
//
// Multi-select checkbox list — user picks one or more meal slots
// that match their actual eating pattern. validateMealTimings
// enforces at least one selection, dedupe, and canonical sort.
//
// hasInteracted gate not needed — INITIAL_STATE.mealTimings is
// null and validation requires non-null + non-empty, so the CTA
// naturally disables on fresh arrival. On back-nav revisit the
// store-set array enables the CTA without re-tap.
//
// Pattern 26 transitional bridge — CTA pushes legacy
// /(onboarding)/body-and-training until Phase D-4 ships
// /protein-target. Bridge integrity verified at recon:
//   - end (complete.tsx) — mealTimings preservation added in
//     this commit alongside existing nickname / weeklyRatePct /
//     mealPlan conditionals; same DB-patch + hydratedProfile
//     mirror shape.
//   - intermediate (body-and-training) — doesn't touch
//     mealTimings; no fromNewFlow guard needed.
//
// Patterns applied:
//   #5  validation fail-fast + CTA double-tap defense
//   #11 checkbox state via filled icon + bg tint + bold label
//       (3-cue redundant, color-blind safe)
//   #12 header / checkbox role + checked state / live region
//       (count) / button (CTA)
//   #15 MEAL_TIMING_OPTIONS as const literal-union
//   #18 mealTimingUtils SSoT (no duplicate label/option tables)
//   #22 monotonic step bump to 8 via setMealTimings
//   #23 persistToProfile on submit (JSON serialize at repo layer)
//   #25 all logic in domain/mealTimingUtils.ts

const TITLE = '食事のタイミング';
const SUBTITLE = '当てはまるものを全て選んでください';
const CTA_LABEL = '次へ';

export default function MealTimingScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const mealTimings = useOnboardingStore((s) => s.mealTimings);
  const setMealTimings = useOnboardingStore((s) => s.setMealTimings);
  const persistToProfile = useOnboardingStore((s) => s.persistToProfile);

  const [isAdvancing, setIsAdvancing] = useState(false);

  // Defensive narrow — Profile.mealTimings is typed as
  // string[] | null at the schema-layer (no per-value CHECK
  // constraint), so we filter via isValidMealTiming before
  // checkbox state lookups. A corrupted DB row or sync poison
  // can't crash the screen.
  const selected: readonly MealTiming[] = useMemo(() => {
    if (mealTimings == null) return [];
    return mealTimings.filter(isValidMealTiming);
  }, [mealTimings]);

  const allValid = isAllInputsValidForD3(mealTimings);

  const handleToggle = useCallback(
    (timing: MealTiming) => {
      const next = toggleSelection(selected, timing);
      setMealTimings(next);
    },
    [selected, setMealTimings],
  );

  const handleSubmit = useCallback(async () => {
    if (isAdvancing) return;
    if (!allValid) return;
    setIsAdvancing(true);
    try {
      await persistToProfile();
    } catch (err) {
      console.warn('[onboarding/meal-timing] persistToProfile failed', err);
    }
    // Phase D-4 transitional bridge — flip to '/protein-target'
    // when D-4 ships. body-and-training is the precedent bridge
    // target; legacy screen doesn't touch mealTimings, and
    // complete.tsx now preserves it via the conditional patch
    // added in this commit.
    router.push('/(onboarding)/body-and-training');
  }, [allValid, isAdvancing, persistToProfile]);

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

        <View style={styles.list}>
          {MEAL_TIMING_OPTIONS.map((timing) => {
            const isChecked = selected.includes(timing);
            const label = getMealTimingLabel(timing);
            const description = getMealTimingDescription(timing);
            return (
              <TouchableOpacity
                key={timing}
                onPress={() => handleToggle(timing)}
                activeOpacity={0.7}
                style={[
                  styles.row,
                  {
                    borderColor: isChecked ? colors.primary : colors.border,
                    backgroundColor: isChecked
                      ? colors.primary + '15'
                      : colors.surface,
                  },
                  isChecked && styles.rowSelected,
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isChecked }}
                accessibilityLabel={`${label} ${description}`}
                testID={`meal-timing-${timing}`}
              >
                <Ionicons
                  name={isChecked ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={isChecked ? colors.primary : colors.textTertiary}
                />
                <View style={styles.rowText}>
                  <Text
                    style={[
                      styles.rowLabel,
                      {
                        color: isChecked
                          ? colors.primary
                          : colors.textPrimary,
                        fontWeight: isChecked ? '700' : '500',
                      },
                    ]}
                  >
                    {label}
                  </Text>
                  <Text
                    style={[
                      styles.rowDesc,
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

        <Text
          style={[styles.countLabel, { color: colors.textSecondary }]}
          accessibilityLiveRegion="polite"
        >
          {formatSelectedCountLabel(selected.length)}
        </Text>
      </ScrollView>

      <View style={[styles.ctaBar, { borderTopColor: colors.border }]}>
        <Button
          title={CTA_LABEL}
          onPress={handleSubmit}
          variant="primary"
          size="lg"
          fullWidth
          disabled={!allValid || isAdvancing}
          testID="meal-timing-cta"
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
  list: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  rowSelected: {
    borderWidth: 2,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    ...typography.labelLarge,
  },
  rowDesc: {
    ...typography.bodySmall,
    fontVariant: ['tabular-nums'],
  },
  countLabel: {
    ...typography.bodySmall,
    textAlign: 'right',
    marginTop: spacing.sm,
  },
  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
