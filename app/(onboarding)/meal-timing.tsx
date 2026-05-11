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

  // Codex pass 1 / Sign-off + Important fix — derive a single
  // canonical view of the store value and drive BOTH display +
  // CTA + persist from it. Same shape validateMealTimings.sanitized
  // produces (MEAL_TIMING_OPTIONS-filter intersection: dedupes
  // duplicates, drops invalid values, sorts to chronological
  // order). Pre-fix the screen filtered for render but validated
  // raw, so a corrupted `['breakfast', 'brunch']` would show
  // 'breakfast' checked + count=1 + CTA disabled with no
  // explanation. Now corruption collapses to the salvageable
  // intersection uniformly — and persist writes the canonical
  // shape regardless of how the user got here (typed selection
  // vs prefilled DB row).
  const selected: readonly MealTiming[] = useMemo(() => {
    if (mealTimings == null) return [];
    return MEAL_TIMING_OPTIONS.filter((opt) =>
      mealTimings.includes(opt),
    );
  }, [mealTimings]);

  // Dev-visibility for sync-poison / corrupted-row detection.
  // Silent canonical repair is fine in production (user sees a
  // working selector with their valid subset checked), but in
  // dev we want a footprint so debug sessions can spot the
  // mismatch.
  if (__DEV__ && mealTimings != null && mealTimings.length !== selected.length) {
    console.warn(
      '[onboarding/meal-timing] mealTimings non-canonical — normalized to',
      selected,
      'from',
      mealTimings,
    );
  }

  const allValid = selected.length > 0;

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
    // Codex pass 1 fix — write the canonical shape to store
    // before persist so the DB receives sorted/dedup'd JSON
    // regardless of whether the user toggled or just inherited
    // a non-canonical prefilled value.
    if (
      mealTimings == null ||
      mealTimings.length !== selected.length ||
      mealTimings.some((v, i) => v !== selected[i])
    ) {
      setMealTimings(selected);
    }
    try {
      await persistToProfile();
    } catch (err) {
      console.warn('[onboarding/meal-timing] persistToProfile failed', err);
    }
    // Phase D-4 flipped this to the new flow's [8] /protein-target
    // screen. The D-3 stop-gap (legacy /body-and-training) is no
    // longer reachable from this CTA. protein-target itself
    // still bridges to /body-and-training until Phase D-5 ships
    // /weekly-distrib.
    router.push('/(onboarding)/protein-target');
  }, [
    allValid,
    isAdvancing,
    mealTimings,
    persistToProfile,
    selected,
    setMealTimings,
  ]);

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
