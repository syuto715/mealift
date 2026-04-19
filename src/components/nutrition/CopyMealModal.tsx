import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal as RNModal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius, shadow } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Button } from '../ui/Button';
import { MealType } from '../../types/common';
import {
  copyMealFromDate,
  getPreviousMealsSummary,
  PreviousMealSummary,
} from '../../infra/repositories/nutritionRepository';
import { formatDateRelative } from '../../utils/format';

interface Props {
  visible: boolean;
  profileId: string;
  toDate: string;
  mealType: MealType;
  onClose: () => void;
  onCopied: (count: number) => void;
}

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: '朝食',
  lunch: '昼食',
  dinner: '夕食',
  snack: '間食',
};

export function CopyMealModal({
  visible,
  profileId,
  toDate,
  mealType,
  onClose,
  onCopied,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const [history, setHistory] = useState<PreviousMealSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    getPreviousMealsSummary(profileId, mealType, 7)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [visible, profileId, mealType]);

  const handleCopy = useCallback(
    async (fromDate: string) => {
      if (copying) return;
      setCopying(true);
      try {
        const count = await copyMealFromDate(profileId, fromDate, toDate, mealType);
        onCopied(count);
        onClose();
      } catch {
        // keep modal open on error
      } finally {
        setCopying(false);
      }
    },
    [copying, profileId, toDate, mealType, onCopied, onClose]
  );

  if (!visible) return null;

  return (
    <RNModal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }, shadow.lg]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {MEAL_LABELS[mealType]}をコピー
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {loading ? (
              <ActivityIndicator style={{ marginTop: spacing.lg }} />
            ) : history.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                コピーできる過去の{MEAL_LABELS[mealType]}がありません。
              </Text>
            ) : (
              history.map((h) => (
                <TouchableOpacity
                  key={h.date}
                  style={[styles.item, { backgroundColor: colors.surfaceSecondary }]}
                  onPress={() => handleCopy(h.date)}
                  activeOpacity={0.7}
                  disabled={copying}
                >
                  <View style={styles.itemHeader}>
                    <Text style={[styles.itemDate, { color: colors.textPrimary }]}>
                      {formatDateRelative(h.date)}
                    </Text>
                    <Text style={[styles.itemCalorie, { color: colors.accent }]}>
                      {h.totalCalories}kcal
                    </Text>
                  </View>
                  <Text style={[styles.itemDetail, { color: colors.textSecondary }]} numberOfLines={1}>
                    {h.itemCount}品
                    {h.itemsPreview.length > 0 && ` · ${h.itemsPreview.join('、')}`}
                    {h.itemCount > h.itemsPreview.length && ` 他${h.itemCount - h.itemsPreview.length}品`}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Button title="閉じる" onPress={onClose} variant="ghost" fullWidth />
          </View>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '80%',
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
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  empty: { ...typography.bodyMedium, textAlign: 'center', paddingVertical: spacing.xxl },
  item: {
    padding: spacing.md,
    borderRadius: 12,
    gap: spacing.xs,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDate: { ...typography.titleSmall },
  itemCalorie: { ...typography.numberSmall, fontSize: 16 },
  itemDetail: { ...typography.bodySmall },
  footer: {
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
