import { Appearance } from 'react-native';

export const colors = {
  // Brand
  primary: '#1A73E8',
  primaryLight: '#4A9AF5',
  primaryDark: '#1557B0',

  // Accent
  accent: '#FF6B35',
  accentLight: '#FF8F66',

  // Semantic
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',

  // Macro colors
  protein: '#5B8DEF',
  fat: '#FFCC02',
  carb: '#34C759',
  calorie: '#FF6B35',

  // Light mode neutrals
  background: '#F8F9FA',
  surface: '#FFFFFF',
  surfaceSecondary: '#F1F3F5',
  border: '#E9ECEF',
  textPrimary: '#1A1A2E',
  textSecondary: '#6C757D',
  textTertiary: '#ADB5BD',

  // Dark mode neutrals
  dark: {
    background: '#0D1117',
    surface: '#161B22',
    surfaceSecondary: '#21262D',
    border: '#30363D',
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
    textTertiary: '#484F58',
  },
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

export type ColorScheme = 'light' | 'dark';

export function getColors(scheme: ColorScheme) {
  if (scheme === 'dark') {
    return {
      primary: colors.primary,
      primaryLight: colors.primaryLight,
      primaryDark: colors.primaryDark,
      accent: colors.accent,
      accentLight: colors.accentLight,
      success: colors.success,
      warning: colors.warning,
      error: colors.error,
      protein: colors.protein,
      fat: colors.fat,
      carb: colors.carb,
      calorie: colors.calorie,
      background: colors.dark.background,
      surface: colors.dark.surface,
      surfaceSecondary: colors.dark.surfaceSecondary,
      border: colors.dark.border,
      textPrimary: colors.dark.textPrimary,
      textSecondary: colors.dark.textSecondary,
      textTertiary: colors.dark.textTertiary,
    };
  }
  return {
    primary: colors.primary,
    primaryLight: colors.primaryLight,
    primaryDark: colors.primaryDark,
    accent: colors.accent,
    accentLight: colors.accentLight,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    protein: colors.protein,
    fat: colors.fat,
    carb: colors.carb,
    calorie: colors.calorie,
    background: colors.background,
    surface: colors.surface,
    surfaceSecondary: colors.surfaceSecondary,
    border: colors.border,
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textTertiary: colors.textTertiary,
  };
}

export type ThemeColors = ReturnType<typeof getColors>;
