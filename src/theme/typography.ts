import { TextStyle } from 'react-native';

export const typography = {
  displayLarge: { fontSize: 34, fontWeight: '700' as const, lineHeight: 41 },
  displayMedium: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },

  titleLarge: { fontSize: 22, fontWeight: '600' as const, lineHeight: 28 },
  titleMedium: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  titleSmall: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },

  bodyLarge: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyMedium: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  bodySmall: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },

  labelLarge: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
  labelMedium: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
  labelSmall: { fontSize: 10, fontWeight: '500' as const, lineHeight: 14 },

  numberLarge: { fontSize: 40, fontWeight: '700' as const, lineHeight: 48, fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] },
  numberMedium: { fontSize: 24, fontWeight: '700' as const, lineHeight: 30, fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] },
  numberSmall: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24, fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] },
} as const;

export type TypographyVariant = keyof typeof typography;
