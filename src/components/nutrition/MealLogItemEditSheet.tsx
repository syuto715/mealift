import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../ui/BottomSheet';
import { NumberInput } from '../ui/NumberInput';
import { Button } from '../ui/Button';
import { useUpdateMealLogPortion } from '../../hooks/useUpdateMealLog';
import { useDeleteMealLog } from '../../hooks/useDeleteMealLog';
import { scaleMealLogItemPortion } from '../../utils/scaleMealLogItemNutrition';
import { formatNutritionValue } from '../../utils/formatNutritionValue';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import type { MealLogItem } from '../../types/nutrition';

// v1.5 Phase 2.4 Sprint 2.4.5 — bottom-sheet edit affordance.
//
// `meal_log_items.food_id` is NULL for the (gamma) snapshot path
// (Sprint 2.4.1), so production's edit flow — which loads the
// canonical Food via getFoodById — can't open here. We render a
// scope-limited sheet that adjusts portion (re-scales the
// snapshot macros in place) and supports a destructive delete.
//
// Meal-type change is deliberately out of scope: the
// `updateMealLogItem` repo API has no `meal_log_id` swap, and a
// proper swap is multi-step (remove + getOrCreateMealLog +
// addItem) that production also doesn't expose today. Sprint
// 2.4.6 can revisit if Syuto requests it post-device verify.

interface MealLogItemEditSheetProps {
  item: MealLogItem | null;
  onClose: () => void;
}

export function MealLogItemEditSheet({ item, onClose }: MealLogItemEditSheetProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const updatePortion = useUpdateMealLogPortion();
  const deleteItem = useDeleteMealLog();
  const [amount, setAmount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset the local input every time the sheet opens against a new row.
  useEffect(() => {
    if (item) setAmount(item.servingAmount);
  }, [item]);

  if (!item) return null;

  const preview = amount != null && amount > 0
    ? scaleMealLogItemPortion(item, amount)
    : null;

  const handleSubmit = async () => {
    if (amount == null || amount <= 0) return;
    setSubmitting(true);
    try {
      await updatePortion(item, amount);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('削除確認', `${item.foodName} を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          setSubmitting(true);
          try {
            await deleteItem(item.id);
            onClose();
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  return (
    <BottomSheet visible onClose={onClose} title={item.foodName}>
      <View style={styles.body}>
        <Text style={[styles.heading, { color: colors.textSecondary }]}>分量</Text>
        <NumberInput
          value={amount}
          onValueChange={setAmount}
          suffix={item.servingUnit}
          step={0.5}
          min={0}
          decimals={1}
        />
        {preview ? (
          <View style={[styles.previewBox, { backgroundColor: colors.surfaceSecondary }]}>
            <PreviewCell label="kcal" value={formatNutritionValue(preview.calories, 0)} colors={colors} />
            <PreviewCell label="P" value={`${formatNutritionValue(preview.proteinG, 1)} g`} colors={colors} />
            <PreviewCell label="F" value={`${formatNutritionValue(preview.fatG, 1)} g`} colors={colors} />
            <PreviewCell label="C" value={`${formatNutritionValue(preview.carbG, 1)} g`} colors={colors} />
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button title="保存" onPress={handleSubmit} variant="primary" size="lg" fullWidth />
          <TouchableOpacity
            onPress={handleDelete}
            disabled={submitting}
            accessibilityRole="button"
            style={styles.deleteRow}
          >
            <Ionicons name="trash-outline" size={20} color={colors.error} />
            <Text style={[styles.deleteLabel, { color: colors.error }]}>削除</Text>
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

interface PreviewCellProps {
  label: string;
  value: string;
  colors: ReturnType<typeof getColors>;
}

function PreviewCell({ label, value, colors }: PreviewCellProps) {
  return (
    <View style={styles.previewCell}>
      <Text style={[styles.previewLabel, { color: colors.textTertiary }]}>{label}</Text>
      <Text style={[styles.previewValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.md },
  heading: { ...typography.labelSmall },
  previewBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  previewCell: { alignItems: 'center', gap: 2 },
  previewLabel: { ...typography.labelSmall },
  previewValue: { ...typography.titleSmall, fontVariant: ['tabular-nums'] },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  deleteLabel: { ...typography.bodyMedium, fontWeight: '600' },
});
