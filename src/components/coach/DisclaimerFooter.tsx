import React from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

// v1.5 Stage 1 Phase 1.2 — disclaimer footer.
//
// Per §7.3, the disclaimer is shown ONCE at the start of the first
// conversation (not on every assistant turn). MMKV persists the
// "seen" flag so re-installing the app re-shows it.

export function DisclaimerFooter(): React.ReactElement {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceSecondary,
          borderColor: colors.border,
        },
      ]}
      accessibilityRole="text"
    >
      <Text style={[styles.text, { color: colors.textSecondary }]}>
        ミー先生のアドバイスは一般的な情報です。 持病や服薬がある方、
        体調に不安がある方は医師にご相談ください。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 0.5,
  },
  text: {
    ...typography.bodySmall,
    lineHeight: 18,
  },
});
