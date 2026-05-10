import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { getColors, radius } from '../../theme/tokens';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import {
  type MealPlan,
  type PFCLevel,
  MEAL_PLAN_OPTIONS,
  assertMealPlanCardProps,
  getMealPlanDescription,
  getMealPlanIcon,
  getMealPlanLabel,
  getMealPlanPFCHint,
  sanitizeMealPlanCardProps,
} from '../../domain/mealPlanUtils';

// v1.3.0 / Onboarding v2 / Phase B-4 — vertical-list selector for the
// 5 meal plans (balanced / washoku / high_protein / low_carb /
// fasting). Sign-off § Phase B-4 §2 layout: each card stacks
// horizontally as [icon | label + description | PFC hint badges] and
// the cards stack vertically down the screen.
//
// Patterns applied:
//   #5  fail-fast on caller misuse — assertMealPlanCardProps in __DEV__
//   #11 color + non-color redundant encoding — selected state uses
//       border weight + background tint + bold label (3 cues)
//   #12 conditional accessibilityRole — radiogroup parent + radio per
//       card; accessibilityState carries selected
//   #15 readonly literal-union — MEAL_PLAN_OPTIONS as const re-export
//   #25 pure-helper extraction — all logic in mealPlanUtils
//   #28 __DEV__ assert + production sanitize hybrid

interface MealPlanCardProps {
  value: MealPlan | null;
  onChange: (v: MealPlan) => void;
  options?: readonly MealPlan[];
  testID?: string;
}

export function MealPlanCard({
  value,
  onChange,
  options = MEAL_PLAN_OPTIONS,
  testID,
}: MealPlanCardProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  // Pattern 28 hybrid: dev throws, production gracefully degrades.
  if (__DEV__) {
    assertMealPlanCardProps({ value, options });
  }
  const safe = sanitizeMealPlanCardProps({ value, options });

  return (
    <View
      style={styles.container}
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel="食事プラン"
    >
      {safe.options.map((plan) => {
        const selected = safe.value === plan;
        const label = getMealPlanLabel(plan);
        const description = getMealPlanDescription(plan);
        const icon = getMealPlanIcon(plan);
        const hint = getMealPlanPFCHint(plan);
        return (
          <TouchableOpacity
            key={plan}
            onPress={() => onChange(plan)}
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
            testID={testID ? `${testID}-option-${plan}` : undefined}
          >
            <Text style={styles.icon}>{icon}</Text>
            <View style={styles.center}>
              <Text
                style={[
                  styles.label,
                  {
                    color: selected ? colors.primary : colors.textPrimary,
                    fontWeight: selected ? '700' : '600',
                  },
                ]}
              >
                {label}
              </Text>
              <Text
                style={[styles.description, { color: colors.textSecondary }]}
              >
                {description}
              </Text>
            </View>
            <View style={styles.hints}>
              <PFCBadge macro="P" level={hint.protein} colors={colors} />
              <PFCBadge macro="F" level={hint.fat} colors={colors} />
              <PFCBadge macro="C" level={hint.carb} colors={colors} />
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface PFCBadgeProps {
  macro: 'P' | 'F' | 'C';
  level: PFCLevel;
  colors: ReturnType<typeof getColors>;
}

// PFC hint chip — Pattern 11 redundant encoding: the level is conveyed
// by both color (success/warning/info) and the level character itself
// (低/中/高), so colorblind users still get the full signal.
function PFCBadge({ macro, level, colors }: PFCBadgeProps) {
  const levelText: Record<PFCLevel, string> = {
    low: '低',
    mid: '中',
    high: '高',
  };
  const levelColor: Record<PFCLevel, string> = {
    low: colors.textTertiary,
    mid: colors.textSecondary,
    high: colors.primary,
  };
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: colors.background,
          borderColor: levelColor[level],
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text style={[styles.badgeMacro, { color: colors.textTertiary }]}>
        {macro}
      </Text>
      <Text style={[styles.badgeLevel, { color: levelColor[level] }]}>
        {levelText[level]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
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
  icon: {
    fontSize: 28,
  },
  center: {
    flex: 1,
    gap: 2,
  },
  label: {
    ...typography.labelLarge,
  },
  description: {
    ...typography.bodySmall,
  },
  hints: {
    flexDirection: 'row',
    gap: 4,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 28,
  },
  badgeMacro: {
    ...typography.bodySmall,
    fontWeight: '600',
    fontSize: 10,
  },
  badgeLevel: {
    ...typography.bodySmall,
    fontWeight: '700',
    fontSize: 11,
  },
});
