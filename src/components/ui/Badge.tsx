import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface BadgeProps {
  label: string;
  color?: string;
  textColor?: string;
  size?: 'sm' | 'md';
}

export function Badge({ label, color, textColor, size = 'sm' }: BadgeProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const bgColor = color ?? colors.primaryLight + '20';
  const txtColor = textColor ?? colors.primary;

  return (
    <View style={[styles.base, size === 'md' && styles.md, { backgroundColor: bgColor }]}>
      <Text style={[size === 'sm' ? styles.textSm : styles.textMd, { color: txtColor }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  md: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  textSm: {
    ...typography.labelSmall,
  },
  textMd: {
    ...typography.labelMedium,
  },
});
