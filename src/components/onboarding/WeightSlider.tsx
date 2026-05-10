import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { Modal } from '../ui/Modal';
import { getColors, radius } from '../../theme/tokens';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import {
  assertSliderProps,
  decimalsForStep,
  formatWeight,
  isValidWeight,
  quantizeToGrid,
  sanitizeValue,
} from '../../domain/weightSliderUtils';

// v1.3.0 / Onboarding v2 / Phase B-2 — hybrid weight input.
//
// Three regions:
//   - Top: large numeric label "72.5 kg" — tap opens a modal for
//     direct numeric input via decimal-pad keyboard.
//   - Middle: horizontal slider via @react-native-community/slider.
//     Quantized to step boundaries via roundToStep on commit so
//     IEEE 754 drag noise (72.30000000000001) never reaches state.
//   - Bottom: ▼ / ▲ buttons for ±step nudging (1-step granularity).
//
// Patterns applied:
//   #5  fail-fast on caller misuse — assertSliderProps throws on
//       bad min/max/step at mount.
//   #11 color + non-color redundant encoding — slider value
//       duplicated as text label + accessibility value text.
//   #12 conditional accessibilityRole — slider is "adjustable",
//       buttons are "button", modal-trigger is "button" too.
//   #20 pre-compute composite ratios — roundToStep dodges FP noise
//       for the common 0.1 / 0.5 / 1 steps.
//   #25 pure-helper extraction — all numeric logic lives in
//       weightSliderUtils.ts for jest coverage without RNTL.

interface WeightSliderProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  testID?: string;
}

export function WeightSlider({
  value,
  onChange,
  min = 30,
  max = 200,
  step = 0.1,
  label,
  testID,
}: WeightSliderProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);

  // Codex review pass 1 / Design call #1 — assert in __DEV__ to
  // surface caller misuse early; sanitize in production so a single
  // bad prop doesn't crash the onboarding screen.
  if (__DEV__) {
    assertSliderProps({ value, min, max, step });
  }
  const safeValue = sanitizeValue(value, min, max);
  const decimals = decimalsForStep(step);

  const commit = (raw: number) => {
    // Codex review pass 1 / Critical — quantize relative to min so
    // offset bounds (e.g. min=30.1, step=0.5) don't snap below min.
    onChange(quantizeToGrid(raw, min, max, step));
  };

  const decrement = () => commit(safeValue - step);
  const increment = () => commit(safeValue + step);

  const openEdit = () => {
    setDraft(safeValue.toFixed(decimals));
    setDraftError(null);
    setEditing(true);
  };

  const handleDraftChange = (text: string) => {
    setDraftError(null);
    if (text === '' || /^\d*\.?\d*$/.test(text)) {
      setDraft(text);
    }
  };

  const handleConfirmEdit = () => {
    const parsed = Number.parseFloat(draft);
    if (Number.isNaN(parsed) || !isValidWeight(parsed, min, max)) {
      setDraftError(`${min} 〜 ${max} kg の範囲で入力してください`);
      return;
    }
    commit(parsed);
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setDraftError(null);
  };

  const formatted = formatWeight(safeValue, decimals);

  return (
    <View style={styles.container} testID={testID}>
      {label && (
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {label}
        </Text>
      )}

      <TouchableOpacity
        onPress={openEdit}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? '体重'} を直接入力`}
        accessibilityHint={`現在の値は ${formatted}`}
        style={styles.valueRow}
        testID={testID ? `${testID}-value` : undefined}
      >
        <Text style={[styles.valueText, { color: colors.textPrimary }]}>
          {formatted}
        </Text>
        <Ionicons name="pencil" size={18} color={colors.textTertiary} />
      </TouchableOpacity>

      <Slider
        style={styles.slider}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={safeValue}
        onValueChange={commit}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.surfaceSecondary}
        thumbTintColor={colors.primary}
        accessibilityRole="adjustable"
        accessibilityValue={{
          min,
          max,
          now: safeValue,
          text: formatted,
        }}
        accessibilityLabel={label ?? '体重'}
        testID={testID ? `${testID}-slider` : undefined}
      />

      <View style={styles.stepRow}>
        <TouchableOpacity
          onPress={decrement}
          disabled={safeValue <= min}
          style={[
            styles.stepBtn,
            {
              backgroundColor: colors.surfaceSecondary,
              opacity: safeValue <= min ? 0.4 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="体重を減らす"
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          testID={testID ? `${testID}-decrement` : undefined}
        >
          <Ionicons name="remove" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text
          style={[styles.stepLabel, { color: colors.textTertiary }]}
        >
          {step.toFixed(decimals)} kg
        </Text>
        <TouchableOpacity
          onPress={increment}
          disabled={safeValue >= max}
          style={[
            styles.stepBtn,
            {
              backgroundColor: colors.surfaceSecondary,
              opacity: safeValue >= max ? 0.4 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="体重を増やす"
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          testID={testID ? `${testID}-increment` : undefined}
        >
          <Ionicons name="add" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={editing}
        onClose={handleCancelEdit}
        title={`${label ?? '体重'} を入力`}
      >
        <View style={styles.editBody}>
          <TextInput
            value={draft}
            onChangeText={handleDraftChange}
            keyboardType="decimal-pad"
            autoFocus
            selectTextOnFocus
            style={[
              styles.editInput,
              {
                color: colors.textPrimary,
                borderColor: draftError ? colors.error : colors.border,
              },
            ]}
            accessibilityLabel="体重 (kg) を入力"
          />
          {draftError && (
            <Text style={[styles.editError, { color: colors.error }]}>
              {draftError}
            </Text>
          )}
          <View style={styles.editButtons}>
            <TouchableOpacity onPress={handleCancelEdit} style={styles.editCancel}>
              <Text
                style={[styles.editCancelText, { color: colors.textSecondary }]}
              >
                キャンセル
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirmEdit}
              style={[styles.editConfirm, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.editConfirmText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    ...typography.labelMedium,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  valueText: {
    ...typography.titleLarge,
    fontVariant: ['tabular-nums'],
  },
  slider: {
    width: '100%',
    height: 36,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    ...typography.bodySmall,
    fontVariant: ['tabular-nums'],
  },
  editBody: {
    gap: spacing.md,
    minWidth: 220,
  },
  editInput: {
    ...typography.titleLarge,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  editError: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  editButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  editCancel: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  editCancelText: {
    ...typography.labelLarge,
  },
  editConfirm: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  editConfirmText: {
    ...typography.labelLarge,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
