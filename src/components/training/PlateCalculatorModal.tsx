import React, { useState, useMemo } from 'react';
import {
  Modal as RNModal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius, shadow } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Button } from '../ui/Button';
import { SegmentedControl } from '../ui/SegmentedControl';
import {
  calculatePlates,
  DEFAULT_AVAILABLE_PLATES,
  DEFAULT_BAR_WEIGHT,
} from '../../domain/plateCalculator';

interface Props {
  visible: boolean;
  initialWeight?: number;
  onClose: () => void;
  onApply?: (weight: number) => void;
}

const PLATE_COLORS: Record<string, string> = {
  '25': '#E53935',
  '20': '#1E88E5',
  '15': '#FDD835',
  '10': '#43A047',
  '5': '#FFFFFF',
  '2.5': '#212121',
  '1.25': '#9E9E9E',
};

const BAR_OPTIONS = [
  { label: '20kg', value: '20' },
  { label: '15kg', value: '15' },
  { label: '10kg', value: '10' },
  { label: '5kg', value: '5' },
];

export function PlateCalculatorModal({ visible, initialWeight, onClose, onApply }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const [targetInput, setTargetInput] = useState(String(initialWeight ?? 60));
  const [barWeight, setBarWeight] = useState(String(DEFAULT_BAR_WEIGHT));

  const target = Number(targetInput) || 0;
  const bar = Number(barWeight) || DEFAULT_BAR_WEIGHT;

  const result = useMemo(() => calculatePlates(target, bar, DEFAULT_AVAILABLE_PLATES), [target, bar]);

  return (
    <RNModal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }, shadow.lg]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>プレート計算機</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>目標重量</Text>
              <View style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
                <TextInput
                  value={targetInput}
                  onChangeText={setTargetInput}
                  keyboardType="decimal-pad"
                  style={[styles.inputText, { color: colors.textPrimary }]}
                  placeholder="60"
                  placeholderTextColor={colors.textTertiary}
                />
                <Text style={[styles.inputSuffix, { color: colors.textSecondary }]}>kg</Text>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>バー重量</Text>
              <SegmentedControl
                segments={BAR_OPTIONS}
                selectedValue={barWeight}
                onValueChange={setBarWeight}
              />
            </View>

            <View style={styles.visual}>
              <View style={[styles.bar, { backgroundColor: colors.textPrimary }]} />
              <View style={[styles.plateRow, { left: '50%' }]}>
                {result.platesPerSide.map((p, i) => (
                  <View
                    key={`r-${i}`}
                    style={[
                      styles.plate,
                      {
                        backgroundColor: PLATE_COLORS[String(p)] ?? colors.textSecondary,
                        borderColor: colors.textPrimary,
                        height: 40 + p * 2,
                        width: 8 + Math.min(20, p),
                      },
                    ]}
                  />
                ))}
              </View>
              <View style={[styles.plateRow, { right: '50%', flexDirection: 'row-reverse' }]}>
                {result.platesPerSide.map((p, i) => (
                  <View
                    key={`l-${i}`}
                    style={[
                      styles.plate,
                      {
                        backgroundColor: PLATE_COLORS[String(p)] ?? colors.textSecondary,
                        borderColor: colors.textPrimary,
                        height: 40 + p * 2,
                        width: 8 + Math.min(20, p),
                      },
                    ]}
                  />
                ))}
              </View>
            </View>

            <View style={styles.platesList}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>片側の構成</Text>
              <Text style={[styles.platesText, { color: colors.textPrimary }]}>
                {result.platesPerSide.length === 0
                  ? '（なし）'
                  : result.platesPerSide.map((p) => `${p}kg`).join(' + ')}
              </Text>
            </View>

            <View style={[styles.summary, { backgroundColor: colors.primary + '10' }]}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>実重量</Text>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>
                {result.actualTotalWeight} kg
              </Text>
              <Text style={[styles.summaryDiff, { color: result.achievable ? colors.success : colors.warning }]}>
                {result.achievable
                  ? '✓ 目標と一致'
                  : `目標より ${result.difference >= 0 ? '+' : ''}${result.difference.toFixed(2)} kg`}
              </Text>
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Button title="閉じる" onPress={onClose} variant="ghost" />
            {onApply && (
              <Button
                title="この重量で設定"
                onPress={() => {
                  onApply(result.actualTotalWeight);
                  onClose();
                }}
                variant="primary"
              />
            )}
          </View>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  title: { ...typography.titleMedium },
  content: { padding: spacing.lg, gap: spacing.lg },
  field: { gap: spacing.sm },
  label: { ...typography.labelMedium },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  inputText: { flex: 1, ...typography.numberSmall, fontSize: 18 },
  inputSuffix: { ...typography.bodyMedium },
  visual: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  bar: { position: 'absolute', left: '15%', right: '15%', height: 6 },
  plateRow: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 2,
    alignItems: 'center',
  },
  plate: {
    borderWidth: 1,
    borderRadius: 3,
  },
  platesList: { gap: spacing.xs },
  platesText: { ...typography.bodyMedium },
  summary: {
    padding: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryLabel: { ...typography.labelMedium },
  summaryValue: { ...typography.displayMedium },
  summaryDiff: { ...typography.bodyMedium },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
