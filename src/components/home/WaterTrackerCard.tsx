import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Card } from '../ui/Card';

interface Props {
  totalMl: number;
  targetMl: number;
  onAdd: (ml: number) => void | Promise<void>;
  onPress?: () => void;
}

const CUP_ML = 250;
const CUP_COUNT = 8;
const MAX_CUSTOM_ML = 5000;

export function WaterTrackerCard({ totalMl, targetMl, onAdd, onPress }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  // Custom-amount input. Direction lets the user log a correction
  // (e.g. "I logged 500ml twice by mistake — subtract 500"). Stored as
  // a negative amount_ml row, which getTodayTotal's SUM handles
  // naturally without schema changes.
  const [direction, setDirection] = useState<'+' | '-'>('+');
  const [customAmount, setCustomAmount] = useState('');

  const filledCups = Math.min(CUP_COUNT, Math.round(totalMl / CUP_ML));

  const handleCustomSubmit = async () => {
    const n = Number(customAmount);
    if (!Number.isFinite(n) || n <= 0 || n > MAX_CUSTOM_ML) return;
    await onAdd(direction === '+' ? n : -n);
    setCustomAmount('');
  };

  const customValid =
    customAmount !== '' &&
    Number.isFinite(Number(customAmount)) &&
    Number(customAmount) > 0 &&
    Number(customAmount) <= MAX_CUSTOM_ML;

  return (
    <TouchableOpacity activeOpacity={onPress ? 0.7 : 1} onPress={onPress}>
      <Card>
        <View style={styles.row}>
          <View style={styles.left}>
            <Ionicons name="water" size={22} color={colors.primary} />
            <Text style={[styles.label, { color: colors.textPrimary }]}>水分</Text>
          </View>
          <Text style={[styles.total, { color: colors.textPrimary }]}>
            {totalMl.toLocaleString()} / {targetMl.toLocaleString()} ml
          </Text>
        </View>
        <View style={styles.cupsRow}>
          {Array.from({ length: CUP_COUNT }).map((_, i) => (
            <Ionicons
              key={i}
              name={i < filledCups ? 'water' : 'water-outline'}
              size={22}
              color={i < filledCups ? colors.primary : colors.textTertiary}
            />
          ))}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary + '15' }]}
            onPress={(e) => {
              e.stopPropagation();
              onAdd(250);
            }}
          >
            <Text style={[styles.btnText, { color: colors.primary }]}>+250ml</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary + '15' }]}
            onPress={(e) => {
              e.stopPropagation();
              onAdd(500);
            }}
          >
            <Text style={[styles.btnText, { color: colors.primary }]}>+500ml</Text>
          </TouchableOpacity>
        </View>

        {/* Custom amount + direction toggle. Logging a negative amount
            records a correction row that the daily-total SUM subtracts. */}
        <View
          style={[styles.customRow, { borderColor: colors.border }]}
          // Block the parent TouchableOpacity from firing onPress when
          // the user interacts with the input row.
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.directionToggle}>
            <TouchableOpacity
              style={[
                styles.directionBtn,
                {
                  backgroundColor:
                    direction === '+' ? colors.primary : 'transparent',
                  borderColor: colors.primary,
                },
              ]}
              onPress={() => setDirection('+')}
            >
              <Text
                style={[
                  styles.directionText,
                  {
                    color: direction === '+' ? '#FFFFFF' : colors.primary,
                  },
                ]}
              >
                +
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.directionBtn,
                {
                  backgroundColor:
                    direction === '-' ? colors.primary : 'transparent',
                  borderColor: colors.primary,
                },
              ]}
              onPress={() => setDirection('-')}
            >
              <Text
                style={[
                  styles.directionText,
                  {
                    color: direction === '-' ? '#FFFFFF' : colors.primary,
                  },
                ]}
              >
                −
              </Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={[styles.customInput, { color: colors.textPrimary }]}
            value={customAmount}
            onChangeText={setCustomAmount}
            keyboardType="number-pad"
            placeholder="例: 100"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={[styles.unit, { color: colors.textSecondary }]}>ml</Text>
          <TouchableOpacity
            style={[
              styles.recordBtn,
              {
                backgroundColor: customValid ? colors.primary : colors.surfaceSecondary,
                opacity: customValid ? 1 : 0.6,
              },
            ]}
            onPress={handleCustomSubmit}
            disabled={!customValid}
          >
            <Text
              style={[
                styles.recordBtnText,
                { color: customValid ? '#FFFFFF' : colors.textTertiary },
              ]}
            >
              記録
            </Text>
          </TouchableOpacity>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.titleSmall },
  total: { ...typography.numberSmall, fontSize: 16 },
  cupsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  actions: { flexDirection: 'row', gap: spacing.md },
  btn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: 8,
  },
  btnText: { ...typography.labelLarge },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  directionToggle: {
    flexDirection: 'row',
    gap: 4,
  },
  directionBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionText: {
    ...typography.labelLarge,
  },
  customInput: {
    flex: 1,
    height: 32,
    ...typography.numberSmall,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 0,
  },
  unit: {
    ...typography.bodySmall,
  },
  recordBtn: {
    paddingHorizontal: spacing.md,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordBtnText: {
    ...typography.labelMedium,
    fontWeight: '600',
  },
});
