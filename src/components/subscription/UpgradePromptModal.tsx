import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Button } from '../ui';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useProfileStore } from '../../stores/profileStore';
import { useSubscription } from '../../hooks/useSubscription';
import { ROUTES } from '../../constants/routes';
import { TRIAL_DURATION_DAYS } from '../../constants/pricing';

type RequiredPlan = 'plus' | 'pro';

export interface UpgradePromptModalProps {
  visible: boolean;
  featureName: string;
  featureDescription?: string;
  requiredPlan: RequiredPlan;
  benefits?: string[];
  onClose: () => void;
}

const PLAN_LABELS: Record<RequiredPlan, string> = {
  plus: 'Plus',
  pro: 'Pro',
};

// Reusable upgrade prompt used at every gated surface. Callers pass the
// feature being gated plus a few short benefit strings; the modal routes
// users to the subscription screen on confirmation.
export function UpgradePromptModal({
  visible,
  featureName,
  featureDescription,
  requiredPlan,
  benefits,
  onClose,
}: UpgradePromptModalProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const profile = useProfileStore((s) => s.profile);
  const sub = useSubscription();
  // Trial CTA applies when the user has never started a trial, isn't already
  // paid, and the gated feature is unlocked by Plus (not Pro-only). Pro
  // features don't get a free-trial path.
  const canStartTrial =
    requiredPlan === 'plus' &&
    !!profile &&
    !profile.trialStartedAt &&
    !sub.isPaid;

  const handleUpgrade = () => {
    onClose();
    router.push(ROUTES.SETTINGS_SUBSCRIPTION);
  };

  const planLabel = PLAN_LABELS[requiredPlan];

  return (
    <Modal visible={visible} onClose={onClose}>
      <View style={styles.iconWrap}>
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: colors.primary + '15' },
          ]}
          accessibilityRole="image"
        >
          <Ionicons name="sparkles" size={32} color={colors.primary} />
        </View>
      </View>

      <Text
        style={[styles.title, { color: colors.textPrimary }]}
        accessibilityRole="header"
      >
        {featureName}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {planLabel} プランで利用可能です
      </Text>

      {featureDescription && (
        <Text
          style={[styles.description, { color: colors.textSecondary }]}
        >
          {featureDescription}
        </Text>
      )}

      {benefits && benefits.length > 0 && (
        <View style={styles.benefitList}>
          {benefits.map((b) => (
            <View key={b} style={styles.benefitRow}>
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={colors.success}
              />
              <Text
                style={[styles.benefitText, { color: colors.textPrimary }]}
              >
                {b}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <Button
          title={
            canStartTrial
              ? `${TRIAL_DURATION_DAYS}日間無料トライアルで試す`
              : `${planLabel} にアップグレード`
          }
          onPress={handleUpgrade}
          variant="primary"
          fullWidth
        />
        <Button
          title="後で"
          onPress={onClose}
          variant="ghost"
          fullWidth
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.titleMedium,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyMedium,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  description: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 20,
  },
  benefitList: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  benefitText: {
    ...typography.bodyMedium,
    flex: 1,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
});
