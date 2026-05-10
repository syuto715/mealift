import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { Modal } from '../ui/Modal';
import { getColors, radius } from '../../theme/tokens';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

// v1.3.0 / Onboarding v2 / Phase A-6 — abandon-onboarding confirm.
//
// Fires from ProgressHeader when the user taps back at >=50%
// progress (kickoff §A-6 §3 threshold). Body text leans on the
// Phase A-5 incremental-save guarantee: persistToProfile fires per
// screen submit, so "ここまでの入力内容は保存されます" is factually
// correct.

interface Props {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AbandonDialog({ visible, onConfirm, onCancel }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  return (
    <Modal
      visible={visible}
      onClose={onCancel}
      title="オンボーディングを中断しますか？"
    >
      <View style={styles.body}>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          ここまでの入力内容は保存されます。後で続きから再開できます。
        </Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            onPress={onCancel}
            style={styles.cancelBtn}
            accessibilityRole="button"
            accessibilityLabel="続ける"
          >
            <Text
              style={[styles.cancelText, { color: colors.textSecondary }]}
            >
              続ける
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onConfirm}
            style={[styles.confirmBtn, { backgroundColor: colors.error }]}
            accessibilityRole="button"
            accessibilityLabel="中断する"
          >
            <Text style={styles.confirmText}>中断する</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  bodyText: {
    ...typography.bodyMedium,
    lineHeight: 22,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  cancelText: {
    ...typography.labelLarge,
  },
  confirmBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  confirmText: {
    ...typography.labelLarge,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
