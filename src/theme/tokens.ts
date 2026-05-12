import { Appearance } from 'react-native';

export const colors = {
  // Brand
  primary: '#1A73E8',
  primaryLight: '#4A9AF5',
  primaryDark: '#1557B0',

  // Accent
  accent: '#FF6B35',
  accentLight: '#FF8F66',

  // v1.4 / UI 改善 v1 Phase A-1 — Plus/プレミアム tier token.
  //
  // Plan §4.3 ブランドトーン "Plus/プレミアム グラデーション or ゴールド".
  // Use case: ProCard / ProTeaser / ProInlineCTA — entry-tier
  // (Plus) promotional surfaces across 設定 / ホーム / AIメニュー /
  // 食事 / トレーニング 画面.
  //
  // WCAG AA contrast (Codex pass 1 Important — Phase A-1 hardening):
  //   - `pro` (#B68B3C, gold) on white: 3.11:1 — **icon-only OK**
  //     (non-text content requirement = 3:1), but **NOT** valid for
  //     text labels at < 18pt (need ≥ 4.5:1).
  //   - `proDark` (#8E6925, deeper gold) on white: ~5.07:1 — **valid
  //     for normal text** on light surface. **White on proDark**:
  //     ~4.13:1 — borderline for normal text but passes for ≥ 14pt
  //     bold (3:1 large-text rule).
  //   - `proText` (#7B5A1F, foreground-only): ~6.2:1 on white. Use
  //     for label text < 14pt on light/tinted surfaces.
  //
  // Usage guide:
  //   - Borders / icon backgrounds / accent fills: `pro`
  //   - Filled buttons (text on dark gold): `proDark` for bg + white
  //     for text
  //   - Text on white / tinted surface: `proText`
  //   - LinearGradient: `proGradientStart` → `proGradientEnd`
  //
  // Pattern 11 redundant encoding: pair the color with bold
  // typography + icon ("star" / "diamond" / "sparkles") so
  // color-blind users still recognize Plus surfaces.
  pro: '#B68B3C',
  proLight: '#D4A961',
  proDark: '#8E6925',
  proText: '#7B5A1F',
  proGradientStart: '#D4A961',
  proGradientEnd: '#8E6925',

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
      // Phase A-1 — Plus tier tokens. Pass through same hex for
      // light / dark; legibility on dark surfaces holds because
      // gold reads well against #161B22 / #21262D.
      pro: colors.pro,
      proLight: colors.proLight,
      proDark: colors.proDark,
      proText: colors.proText,
      proGradientStart: colors.proGradientStart,
      proGradientEnd: colors.proGradientEnd,
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
    pro: colors.pro,
    proLight: colors.proLight,
    proDark: colors.proDark,
    proText: colors.proText,
    proGradientStart: colors.proGradientStart,
    proGradientEnd: colors.proGradientEnd,
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
