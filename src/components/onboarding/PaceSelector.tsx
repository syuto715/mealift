import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { getColors, radius } from '../../theme/tokens';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import {
  DEFAULT_PACE_OPTIONS,
  assertPaceSelectorProps,
  formatPaceLabel,
  formatPaceSublabel,
  getDirection,
  isOptionDisabled,
  sanitizePaceSelectorProps,
} from '../../domain/paceSelectorUtils';

// v1.3.0 / Onboarding v2 / Phase B-3 — segmented choice for the
// weekly weight-rate target. Six default options spanning -1.0% to
// +0.25% per week (sign-off § Schema 整合 — fits the v30
// weekly_rate_pct CHECK BETWEEN -1.5 AND 0.5).
//
// Direction-aware disable: options incompatible with the user's
// current → target direction (e.g., positive rates when the user
// wants to lose weight) render dimmed and untappable. Disabled
// options stay visible so the user sees the full pace landscape.
//
// Patterns applied:
//   #5  fail-fast on caller misuse — assertPaceSelectorProps in __DEV__
//   #11 color + non-color redundant encoding — selected option uses
//       border + background + bold text (3 cues, not just hue)
//   #12 conditional accessibilityRole — radiogroup parent + radio
//       per option, accessibilityState carries selected/disabled
//   #15 readonly literal arrays via `as const` — DEFAULT_PACE_OPTIONS
//   #25 pure-helper extraction — all logic in paceSelectorUtils
//   #28 __DEV__ assert + production sanitize hybrid

interface PaceSelectorProps {
  value: number | null;
  onChange: (v: number) => void;
  currentWeight: number;
  targetWeight: number;
  options?: readonly number[];
  testID?: string;
}

export function PaceSelector({
  value,
  onChange,
  currentWeight,
  targetWeight,
  options = DEFAULT_PACE_OPTIONS,
  testID,
}: PaceSelectorProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  // Pattern 28 hybrid: dev throws, production gracefully degrades.
  if (__DEV__) {
    assertPaceSelectorProps({
      value,
      options,
      currentWeight,
      targetWeight,
    });
  }
  const safe = sanitizePaceSelectorProps({
    value,
    options,
    currentWeight,
    targetWeight,
  });

  const direction = getDirection(safe.currentWeight, safe.targetWeight);

  return (
    <View style={styles.container} testID={testID}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        accessibilityRole="radiogroup"
        accessibilityLabel="週ごとの体重変化ペース"
      >
        {safe.options.map((rate) => {
          const selected = safe.value === rate;
          const disabled = isOptionDisabled(rate, direction);
          const label = formatPaceLabel(rate);
          const sublabel = formatPaceSublabel(rate, safe.currentWeight);
          return (
            <TouchableOpacity
              key={rate}
              onPress={() => {
                if (!disabled) onChange(rate);
              }}
              disabled={disabled}
              activeOpacity={0.7}
              style={[
                styles.option,
                {
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected
                    ? colors.primary + '15'
                    : colors.surface,
                  opacity: disabled ? 0.4 : 1,
                },
                selected && styles.optionSelected,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={
                sublabel ? `${label} ${sublabel}` : label
              }
              testID={
                testID
                  ? `${testID}-option-${rate.toString().replace('.', '_')}`
                  : undefined
              }
            >
              <Text
                style={[
                  styles.optionLabel,
                  {
                    color: selected ? colors.primary : colors.textPrimary,
                    fontWeight: selected ? '700' : '500',
                  },
                ]}
              >
                {label}
              </Text>
              {sublabel && (
                <Text
                  style={[
                    styles.optionSublabel,
                    { color: colors.textTertiary },
                  ]}
                >
                  {sublabel}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.sm,
  },
  scrollContent: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  option: {
    minWidth: 110,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  optionSelected: {
    borderWidth: 2,
  },
  optionLabel: {
    ...typography.labelLarge,
    fontVariant: ['tabular-nums'],
  },
  optionSublabel: {
    ...typography.bodySmall,
    fontVariant: ['tabular-nums'],
  },
});
