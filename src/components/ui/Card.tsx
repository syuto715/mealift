import React from 'react';
import { View, StyleSheet, useColorScheme, ViewStyle } from 'react-native';
import { getColors, radius, shadow } from '../../theme/tokens';
import { spacing } from '../../theme/spacing';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ children, style, variant = 'default', padding = 'lg' }: CardProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: colors.surface },
        variant === 'elevated' && shadow.md,
        variant === 'default' && shadow.sm,
        paddingStyles[padding],
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
  },
});

const paddingStyles: Record<string, ViewStyle> = StyleSheet.create({
  none: { padding: 0 },
  sm: { padding: spacing.md },
  md: { padding: spacing.lg },
  lg: { padding: spacing.xl },
});
