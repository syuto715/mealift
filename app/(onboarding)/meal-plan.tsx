import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import { getColors } from '../../src/theme/tokens';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { Button } from '../../src/components/ui';
import { MealPlanCard } from '../../src/components/onboarding/MealPlanCard';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import { isValidMealPlan } from '../../src/domain/mealPlanUtils';

// v1.3.0 / Onboarding v2 / Phase D-2 — Meal plan screen [6].
//
// Pure wire-only screen — B-4 MealPlanCard owns the radiogroup +
// 5-card vertical list + PFC qualitative hint badges + selected-
// state visual encoding internally. Screen layer adds:
//   - title / subtitle
//   - CTA gate on non-null validated mealPlan
//   - persistToProfile + nav on submit
//
// Pattern 18 / 25 — no new validation helpers; reuses
// mealPlanUtils.isValidMealPlan from B-4 directly.
//
// hasInteracted is implicit via the non-null gate — INITIAL_STATE
// mealPlan is null, so any selection bumps the store value out of
// null AND advances step to 7. No per-screen sentinel needed
// (contrast with C-3 / C-4 where INITIAL_STATE seeded valid
// placeholder defaults).
//
// Pattern 26 transitional bridge — CTA pushes legacy
// /(onboarding)/body-and-training until Phase D-3 ships
// /meal-timing. Bridge integrity verified at recon:
//   - end (complete.tsx) — mealPlan preservation added in this
//     commit alongside the existing C-2 nickname + C-5
//     weeklyRatePct conditionals (DB patch + hydratedProfile
//     mirror, same pattern).
//   - intermediate (body-and-training) — doesn't touch mealPlan
//     (the legacy screen only owns body-info + training inputs),
//     so no fromNewFlow guard needed here.
//
// Patterns applied:
//   #5  CTA double-tap defense + non-null validation gate
//   #11 selected state delegated to B-4 (border + bg + bold)
//   #12 header (title) + button (CTA); radiogroup+radio owned
//       by B-4 internally
//   #18 mealPlanUtils + MEAL_PLAN_OPTIONS SSoT reused via B-4
//   #22 monotonic step bump via setMealPlan
//   #23 persistToProfile on submit
//   #26 transitional bridge + integrity hardening in complete.tsx

const TITLE = '食事プランを選びましょう';
const SUBTITLE = 'PFC バランスの方向性を決めます。後で変更できます';
const CTA_LABEL = '次へ';

export default function MealPlanScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const mealPlan = useOnboardingStore((s) => s.mealPlan);
  const setMealPlan = useOnboardingStore((s) => s.setMealPlan);
  const persistToProfile = useOnboardingStore((s) => s.persistToProfile);

  const [isAdvancing, setIsAdvancing] = useState(false);

  const allValid = mealPlan != null && isValidMealPlan(mealPlan);

  const handleSubmit = useCallback(async () => {
    if (isAdvancing) return;
    if (!allValid) return;
    setIsAdvancing(true);
    try {
      await persistToProfile();
    } catch (err) {
      console.warn('[onboarding/meal-plan] persistToProfile failed', err);
    }
    // Phase D-3 flipped this to the new flow's [7] /meal-timing
    // screen. The D-2 stop-gap (legacy /body-and-training) is
    // no longer reachable from this CTA. meal-timing itself
    // still bridges to /body-and-training until Phase D-4 ships
    // /protein-target.
    router.push('/(onboarding)/meal-timing');
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

        <View style={styles.cardWrap}>
          <MealPlanCard
            value={mealPlan}
            onChange={setMealPlan}
            testID="meal-plan-card"
          />
        </View>
      </ScrollView>

      <View style={[styles.ctaBar, { borderTopColor: colors.border }]}>
        <Button
          title={CTA_LABEL}
          onPress={handleSubmit}
          variant="primary"
          size="lg"
          fullWidth
          disabled={!allValid || isAdvancing}
          testID="meal-plan-cta"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  title: {
    ...typography.titleLarge,
    paddingHorizontal: spacing.lg,
  },
  subtitle: {
    ...typography.bodyMedium,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  cardWrap: {
    marginTop: spacing.md,
  },
  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
