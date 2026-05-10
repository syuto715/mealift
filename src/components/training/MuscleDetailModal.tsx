import React, { useState } from 'react';
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
import {
  VOLUME_GROUP_LABEL_JA,
  type VolumeGroup,
  type VolumeZone,
  type VolumeLandmark,
} from '../../domain/volumeLandmark';
import type { RecoveryState } from '../../domain/recovery';
import { MUSCLE_RECOVERY_HOURS } from '../../constants/muscleRecoveryHours';

// Build 16 / Phase 6 (Muscle Recovery Heatmap) / Phase 6.3 — muscle
// detail modal opened by tapping a muscle in the heatmap diagram.
//
// Surfaces three layers of data the heatmap glyph itself can't show:
//   - Recovery: state + percentage + hours-since-last-trained, with
//     a tap-to-toggle between relative ("12時間前") and absolute
//     ("5月10日 14:30") last-trained time.
//   - Volume: this week's set count + zone (below_mev / mev_to_mav /
//     mav_to_mrv / above_mrv) + the canonical MEV-MAV-MRV bounds.
//   - Recovery target: how long a typical full-recovery window is for
//     this muscle (MUSCLE_RECOVERY_HOURS), so the user understands
//     where the % comes from.

interface Props {
  visible: boolean;
  group: VolumeGroup | null;
  recoveryState: RecoveryState | null;
  setsThisWeek: number;
  zone: VolumeZone | null;
  landmark: VolumeLandmark | null;
  lastTrained: Date | null;
  onClose: () => void;
}

const STATE_LABEL_JA = {
  unstimulated: '未刺激',
  recovering: '回復中',
  partial: '一部回復',
  recovered: '回復済',
} as const;

const ZONE_LABEL_JA: Record<VolumeZone, string> = {
  below_mev: 'ボリューム不足 (MEV 未達)',
  mev_to_mav: 'MEV 達成・MAV 未満',
  mav_to_mrv: '適正ゾーン (MAV-MRV)',
  above_mrv: 'MRV 超過',
};

export function MuscleDetailModal({
  visible,
  group,
  recoveryState,
  setsThisWeek,
  zone,
  landmark,
  lastTrained,
  onClose,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const [showAbsolute, setShowAbsolute] = useState(false);

  if (!group) return null;

  const muscleLabel = VOLUME_GROUP_LABEL_JA[group];
  const recoveryHours = MUSCLE_RECOVERY_HOURS[group];

  return (
    <Modal visible={visible} onClose={onClose} title={muscleLabel}>
      <View style={styles.container}>
        {/* Recovery section */}
        {recoveryState && (
          <View style={styles.section}>
            <Text
              style={[styles.sectionTitle, { color: colors.textPrimary }]}
            >
              回復状態
            </Text>
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                状態
              </Text>
              <Text
                style={[
                  styles.value,
                  { color: stateColor(recoveryState.state, colors) },
                ]}
              >
                {STATE_LABEL_JA[recoveryState.state]}
                {recoveryState.state !== 'unstimulated' &&
                  ` (${Math.round(recoveryState.recoveryPct)}%)`}
              </Text>
            </View>
            {lastTrained ? (
              <TouchableOpacity
                onPress={() => setShowAbsolute((s) => !s)}
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel="最終トレーニング時刻の表示形式を切替"
              >
                <Text
                  style={[styles.label, { color: colors.textSecondary }]}
                >
                  最終トレーニング
                </Text>
                <Text style={[styles.value, { color: colors.textPrimary }]}>
                  {showAbsolute
                    ? formatAbsoluteTime(lastTrained)
                    : formatRelativeHours(
                        recoveryState.hoursSinceLastTrained ?? 0,
                      )}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.row}>
                <Text
                  style={[styles.label, { color: colors.textSecondary }]}
                >
                  最終トレーニング
                </Text>
                <Text
                  style={[styles.value, { color: colors.textTertiary }]}
                >
                  記録なし
                </Text>
              </View>
            )}
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                想定回復時間
              </Text>
              <Text style={[styles.value, { color: colors.textPrimary }]}>
                {recoveryHours} 時間
              </Text>
            </View>
          </View>
        )}

        {/* Volume section */}
        {zone && landmark && (
          <View
            style={[styles.section, { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: spacing.md }]}
          >
            <Text
              style={[styles.sectionTitle, { color: colors.textPrimary }]}
            >
              今週のボリューム
            </Text>
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                セット数
              </Text>
              <Text style={[styles.value, { color: colors.textPrimary }]}>
                {setsThisWeek} セット
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                ゾーン
              </Text>
              <Text
                style={[styles.value, { color: zoneColor(zone, colors) }]}
              >
                {ZONE_LABEL_JA[zone]}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                MEV / MAV / MRV
              </Text>
              <Text
                style={[
                  styles.value,
                  { color: colors.textPrimary, fontVariant: ['tabular-nums'] },
                ]}
              >
                {landmark.mev} / {landmark.mavMin}-{landmark.mavMax} / {landmark.mrv}
              </Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          onPress={onClose}
          style={[styles.closeBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.closeBtnText}>閉じる</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function stateColor(
  state: RecoveryState['state'],
  colors: ReturnType<typeof getColors>,
): string {
  switch (state) {
    case 'unstimulated':
      return colors.textTertiary;
    case 'recovering':
      return colors.error;
    case 'partial':
      return colors.warning;
    case 'recovered':
      return colors.success;
  }
}

function zoneColor(
  zone: VolumeZone,
  colors: ReturnType<typeof getColors>,
): string {
  switch (zone) {
    case 'below_mev':
      return colors.textTertiary;
    case 'mev_to_mav':
    case 'mav_to_mrv':
      return colors.success;
    case 'above_mrv':
      return colors.error;
  }
}

function formatRelativeHours(hours: number): string {
  if (hours < 1) return '1時間未満前';
  if (hours < 24) return `${Math.round(hours)} 時間前`;
  const days = Math.floor(hours / 24);
  if (days === 0) return `${Math.round(hours)} 時間前`;
  return `${days} 日前`;
}

function formatAbsoluteTime(d: Date): string {
  // Local time format — the heatmap query already validates UTC ISO
  // shape (Phase 6.1 Codex Important #2 fix), so the Date object
  // here is a real instant. JS Date methods read in the runtime's
  // local TZ, which matches the user's expectation.
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}月${day}日 ${hh}:${mm}`;
}

const styles = StyleSheet.create({
  container: {
    minWidth: 280,
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.titleSmall,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    ...typography.bodySmall,
  },
  value: {
    ...typography.bodyMedium,
    fontWeight: '500',
  },
  closeBtn: {
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  closeBtnText: {
    ...typography.labelLarge,
    color: '#FFFFFF',
  },
});
