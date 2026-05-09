import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../theme/tokens';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import {
  VOLUME_GROUP_LABEL_JA,
  type VolumeGroup,
} from '../../domain/volumeLandmark';

// Build 16 / Phase 4 (Feature F) / Phase 4.2 — auto-deload banner.
//
// Renders when a Pro user has an active deload recommendation
// (active = applied_at IS NULL AND dismissed_at IS NULL). The
// volume-dashboard owns the gating + data fetch; this component is a
// thin presentation layer with two callbacks:
//   - onApply: opens the routine picker modal
//   - onDismiss: marks the recommendation dismissed (state machine)
//
// Visual: warning-yellow card at the top of volume-dashboard, listing
// the muscles that crossed MRV every week of the detection window in
// Japanese labels (VOLUME_GROUP_LABEL_JA). Sign-off F11 — banner is
// the surface where the user actually sees the detection result; the
// push body is intentionally generic.

interface AutoDeloadBannerProps {
  affectedMuscles: VolumeGroup[];
  onApply: () => void;
  onDismiss: () => void;
}

export function AutoDeloadBanner({
  affectedMuscles,
  onApply,
  onDismiss,
}: AutoDeloadBannerProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const muscleLabels = affectedMuscles
    .map((m) => VOLUME_GROUP_LABEL_JA[m])
    .join('、');

  return (
    <View
      style={[
        styles.banner,
        // No dedicated warning-surface token in the theme yet; use a
        // light-yellow tint that reads correctly on both color schemes
        // (the banner is short-lived and Pro-only so the design system
        // hasn't grown a token for it).
        { backgroundColor: scheme === 'dark' ? '#3A2E14' : '#FFF8E1', borderColor: colors.warning },
      ]}
    >
      <View style={styles.headerRow}>
        <Ionicons name="warning" size={20} color={colors.warning} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          デロード推奨
        </Text>
      </View>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        4 週連続で MRV を超過した部位が検出されました: {muscleLabels}
      </Text>
      <Text style={[styles.subBody, { color: colors.textTertiary }]}>
        デロード週 (1 週間、ボリューム 50%) で回復を取り、次のサイクルに備えましょう。
      </Text>
      <View style={styles.buttonRow}>
        <TouchableOpacity
          onPress={onApply}
          style={[styles.applyBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="ルーティンを選んでデロードを適用"
        >
          <Text style={styles.applyBtnText}>ルーティンを選択</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDismiss}
          style={styles.dismissBtn}
          accessibilityRole="button"
          accessibilityLabel="デロード推奨を却下"
        >
          <Text style={[styles.dismissBtnText, { color: colors.textSecondary }]}>
            却下
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    ...typography.titleSmall,
    fontWeight: '600',
  },
  body: {
    ...typography.bodyMedium,
  },
  subBody: {
    ...typography.bodySmall,
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  applyBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  applyBtnText: {
    ...typography.labelLarge,
    color: '#FFFFFF',
  },
  dismissBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissBtnText: {
    ...typography.labelLarge,
  },
});
