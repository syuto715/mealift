import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSubscription } from '../../hooks/useSubscription';
import { getColors, radius } from '../../theme/tokens';
import { ROUTES } from '../../constants/routes';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

// Compact pill shown on the home screen while the user is in the 7-day Plus
// trial. Renders nothing for other plan states. Colors shift to a warning
// palette when <=3 days remain. Tap routes to the subscription screen.
export function TrialBadge() {
  const { status, trialDaysRemaining } = useSubscription();
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  if (status !== 'trial' || trialDaysRemaining == null || trialDaysRemaining <= 0) {
    return null;
  }

  const isUrgent = trialDaysRemaining <= 3;
  const accent = isUrgent ? colors.error : colors.success;
  const bg = accent + '15';

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => router.push(ROUTES.SETTINGS_SUBSCRIPTION)}
      style={[
        styles.pill,
        { backgroundColor: bg, borderColor: accent },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Plusトライアル中、あと${trialDaysRemaining}日。プラン画面を開く。`}
    >
      <Ionicons name="time-outline" size={14} color={accent} />
      <Text style={[styles.label, { color: accent }]}>
        Plusトライアル中 あと{trialDaysRemaining}日
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
    height: 30,
  },
  label: {
    ...typography.labelSmall,
    fontWeight: '600',
  },
});
