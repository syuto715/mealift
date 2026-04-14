import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/tokens';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
}: ButtonProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const containerStyle: ViewStyle[] = [
    styles.base,
    sizeStyles[size],
    fullWidth && styles.fullWidth,
    getVariantStyle(variant, colors),
    (disabled || loading) && styles.disabled,
  ].filter(Boolean) as ViewStyle[];

  const textStyle: TextStyle[] = [
    sizeTextStyles[size],
    getVariantTextStyle(variant, colors),
    (disabled || loading) && styles.disabledText,
  ].filter(Boolean) as TextStyle[];

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? '#FFFFFF' : colors.primary}
          size="small"
        />
      ) : (
        <>
          {icon}
          <Text style={textStyle}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function getVariantStyle(variant: string, colors: ReturnType<typeof getColors>): ViewStyle {
  switch (variant) {
    case 'primary':
      return { backgroundColor: colors.primary };
    case 'secondary':
      return { backgroundColor: colors.surfaceSecondary };
    case 'outline':
      return { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary };
    case 'ghost':
      return { backgroundColor: 'transparent' };
    default:
      return { backgroundColor: colors.primary };
  }
}

function getVariantTextStyle(variant: string, colors: ReturnType<typeof getColors>): TextStyle {
  switch (variant) {
    case 'primary':
      return { color: '#FFFFFF' };
    case 'secondary':
      return { color: colors.textPrimary };
    case 'outline':
      return { color: colors.primary };
    case 'ghost':
      return { color: colors.primary };
    default:
      return { color: '#FFFFFF' };
  }
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  disabledText: {
    opacity: 0.7,
  },
});

const sizeStyles: Record<string, ViewStyle> = StyleSheet.create({
  sm: { height: 36, paddingHorizontal: spacing.lg },
  md: { height: 48, paddingHorizontal: spacing.xl },
  lg: { height: 56, paddingHorizontal: spacing.xxl },
});

const sizeTextStyles: Record<string, TextStyle> = StyleSheet.create({
  sm: { ...typography.labelMedium },
  md: { ...typography.labelLarge },
  lg: { ...typography.titleSmall },
});
