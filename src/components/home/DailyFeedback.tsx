import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, ThemeColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { FeedbackResult } from '../../domain/feedback';

const FEEDBACK_COLORS: Record<string, (colors: ThemeColors) => string> = {
  success: (c) => c.success,
  warning: (c) => c.warning,
  error: (c) => c.error,
  info: (c) => c.primary,
  action: (c) => c.accent,
};

const FEEDBACK_BG: Record<string, (colors: ThemeColors) => string> = {
  success: (c) => c.success + '08',
  warning: (c) => c.warning + '08',
  error: (c) => c.error + '08',
  info: (c) => c.primary + '08',
  action: (c) => c.accent + '08',
};

interface DailyFeedbackProps {
  feedback: FeedbackResult;
  colors: ThemeColors;
}

export function DailyFeedback({ feedback, colors }: DailyFeedbackProps) {
  const iconColor = FEEDBACK_COLORS[feedback.type]?.(colors) ?? colors.primary;
  const bgColor = FEEDBACK_BG[feedback.type]?.(colors) ?? colors.primary + '08';

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <Ionicons
        name={feedback.icon as keyof typeof Ionicons.glyphMap}
        size={24}
        color={iconColor}
      />
      <Text style={[styles.message, { color: colors.textPrimary }]}>
        {feedback.message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 16,
  },
  message: {
    ...typography.bodyMedium,
    flex: 1,
  },
});
