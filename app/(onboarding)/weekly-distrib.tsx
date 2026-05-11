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
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import {
  CHEAT_DAYS_MAX,
  DAY_OF_WEEK_OPTIONS,
  type DayOfWeek,
  WEEKLY_DISTRIBUTION_OPTIONS,
  type WeeklyDistribution,
  formatCheatDaysCountLabel,
  getDayOfWeekLabel,
  getDistributionDescription,
  getDistributionLabel,
  isAllInputsValidForD5,
  toggleCheatDay,
} from '../../src/domain/weeklyDistribUtils';

// v1.3.0 / Onboarding v2 / Phase D-5 — Weekly distribution screen [9].
//
// Final input-layer screen. Two coupled inputs:
//   - weeklyDistribution: 2-segment radiogroup
//   - cheatDays: 7-checkbox grid (conditional — only shown when
//     weeklyDistribution === 'cheat_days')
//
// Pattern 18 補強 canonical view (D-3 mealTimings precedent) —
// the screen derives `selected = DAY_OF_WEEK_OPTIONS.filter(d =>
// raw.includes(d))` for display + validation + persist. A
// corrupted persisted array (e.g., `[3, 3, 9]`) collapses to
// the salvageable canonical intersection (`[3]`) uniformly.
//
// Pattern 26 transitional bridge — CTA pushes legacy
// /(onboarding)/body-and-training until Phase D-6 ships
// /motivation. Bridge integrity verified at recon:
//   - end (complete.tsx) — weeklyDistribution + cheatDays
//     preservation added in this commit alongside the existing
//     C-2/C-5/D-2/D-3/D-4 conditionals.
//   - intermediate (body-and-training) — doesn't touch either
//     field; no fromNewFlow guard needed.
//   - computed priority (D-4 v2 cache override) — unchanged;
//     D-5 fields don't feed the PFC bundle so the existing
//     complete.tsx priority logic carries through.

const TITLE = '食事の週間スタイル';
const SUBTITLE = '毎日同じカロリーか、自由日を設けるかを選びます';
const CTA_LABEL = '次へ';

export default function WeeklyDistribScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const weeklyDistribution = useOnboardingStore((s) => s.weeklyDistribution);
  const cheatDays = useOnboardingStore((s) => s.cheatDays);
  const setWeeklyDistribution = useOnboardingStore(
    (s) => s.setWeeklyDistribution,
  );
  const setCheatDays = useOnboardingStore((s) => s.setCheatDays);
  const persistToProfile = useOnboardingStore((s) => s.persistToProfile);

  const [isAdvancing, setIsAdvancing] = useState(false);

  // Canonical view of the cheat-day selection (D-3 precedent) —
  // drives BOTH the 7-checkbox display AND the CTA validation
  // AND the persist. If raw differs from canonical, submit-time
  // setCheatDays(canonical) ensures the DB writes the
  // canonicalized form.
  const selectedDays: readonly DayOfWeek[] = useMemo(() => {
    if (cheatDays == null) return [];
    return DAY_OF_WEEK_OPTIONS.filter((opt) => cheatDays.includes(opt));
  }, [cheatDays]);

  // Codex pass 1 Nit fix — the length-only check missed
  // reorder-only divergence (e.g., raw [5, 1] sanitized to [1, 5]).
  // Mirror the submit-time per-element compare so dev surfacing
  // catches every shape mismatch, not just count.
  if (__DEV__ && cheatDays != null) {
    const reorder =
      cheatDays.length !== selectedDays.length ||
      cheatDays.some((v, i) => v !== selectedDays[i]);
    if (reorder) {
      console.warn(
        '[onboarding/weekly-distrib] cheatDays non-canonical — normalized to',
        selectedDays,
        'from',
        cheatDays,
      );
    }
  }

  const showCheatDaysSection = weeklyDistribution === 'cheat_days';
  const allValid = isAllInputsValidForD5(
    weeklyDistribution,
    showCheatDaysSection ? [...selectedDays] : cheatDays,
  );

  const handleSelectDistribution = useCallback(
    (value: WeeklyDistribution) => {
      setWeeklyDistribution(value);
    },
    [setWeeklyDistribution],
  );

  const handleToggleDay = useCallback(
    (day: DayOfWeek) => {
      const next = toggleCheatDay(selectedDays, day);
      // Hard-cap at CHEAT_DAYS_MAX — the toggle helper itself
      // doesn't enforce the limit because callers in different
      // contexts may have different ceilings. Screen-side gate
      // here matches the kickoff's "max 3" semantic.
      if (next.length > CHEAT_DAYS_MAX) return;
      setCheatDays(next);
    },
    [selectedDays, setCheatDays],
  );

  const handleSubmit = useCallback(async () => {
    if (isAdvancing) return;
    if (!allValid) return;
    setIsAdvancing(true);
    // Canonicalize before persist — Pattern 18 補強 (D-3 precedent).
    if (
      showCheatDaysSection &&
      (cheatDays == null ||
        cheatDays.length !== selectedDays.length ||
        cheatDays.some((v, i) => v !== selectedDays[i]))
    ) {
      setCheatDays(selectedDays);
    }
    try {
      await persistToProfile();
    } catch (err) {
      console.warn('[onboarding/weekly-distrib] persistToProfile failed', err);
    }
    // Phase D-6 transitional bridge — flip to '/motivation' when
    // D-6 ships. body-and-training is the precedent target;
    // legacy screen doesn't touch weeklyDistribution / cheatDays
    // and complete.tsx now preserves both via the conditional
    // patch added in this commit.
    router.push('/(onboarding)/body-and-training');
  }, [
    allValid,
    cheatDays,
    isAdvancing,
    persistToProfile,
    selectedDays,
    setCheatDays,
    showCheatDaysSection,
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

        {/* 2-segment weeklyDistribution radiogroup */}
        <View
          style={styles.segmentRow}
          accessibilityRole="radiogroup"
          accessibilityLabel="週間スタイル"
        >
          {WEEKLY_DISTRIBUTION_OPTIONS.map((d) => {
            const selected = weeklyDistribution === d;
            return (
              <TouchableOpacity
                key={d}
                onPress={() => handleSelectDistribution(d)}
                style={[
                  styles.segmentCard,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected
                      ? colors.primary + '15'
                      : colors.surface,
                  },
                  selected && styles.segmentCardSelected,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${getDistributionLabel(d)} ${getDistributionDescription(d)}`}
                testID={`weekly-distrib-${d}`}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    {
                      color: selected ? colors.primary : colors.textPrimary,
                      fontWeight: selected ? '700' : '600',
                    },
                  ]}
                >
                  {getDistributionLabel(d)}
                </Text>
                <Text
                  style={[
                    styles.segmentDesc,
                    { color: colors.textSecondary },
                  ]}
                >
                  {getDistributionDescription(d)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Conditional cheat-day grid */}
        {showCheatDaysSection && (
          <View style={styles.cheatSection}>
            <Text
              style={[styles.cheatLabel, { color: colors.textPrimary }]}
            >
              自由日に設定する曜日
            </Text>
            <View style={styles.dayGrid}>
              {DAY_OF_WEEK_OPTIONS.map((day) => {
                const checked = selectedDays.includes(day);
                const atCap =
                  !checked && selectedDays.length >= CHEAT_DAYS_MAX;
                return (
                  <TouchableOpacity
                    key={day}
                    onPress={() => handleToggleDay(day)}
                    disabled={atCap}
                    style={[
                      styles.dayBtn,
                      {
                        borderColor: checked
                          ? colors.primary
                          : colors.border,
                        backgroundColor: checked
                          ? colors.primary + '15'
                          : colors.surface,
                        opacity: atCap ? 0.4 : 1,
                      },
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked, disabled: atCap }}
                    accessibilityLabel={`${getDayOfWeekLabel(day)}曜日`}
                    testID={`weekly-distrib-day-${day}`}
                  >
                    <Text
                      style={[
                        styles.dayLabel,
                        {
                          color: checked
                            ? colors.primary
                            : colors.textPrimary,
                          fontWeight: checked ? '700' : '500',
                        },
                      ]}
                    >
                      {getDayOfWeekLabel(day)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text
              style={[
                styles.countLabel,
                {
                  color:
                    selectedDays.length >= CHEAT_DAYS_MAX
                      ? colors.warning
                      : colors.textSecondary,
                },
              ]}
              accessibilityLiveRegion="polite"
            >
              {formatCheatDaysCountLabel(selectedDays.length)}
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
          disabled={!allValid || isAdvancing}
          testID="weekly-distrib-cta"
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
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  segmentCard: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  segmentCardSelected: {
    borderWidth: 2,
  },
  segmentLabel: {
    ...typography.titleMedium,
  },
  segmentDesc: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  cheatSection: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  cheatLabel: {
    ...typography.labelLarge,
  },
  dayGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  dayBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  dayLabel: {
    ...typography.titleSmall,
  },
  countLabel: {
    ...typography.bodySmall,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
