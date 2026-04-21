import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal as RNModal,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Button, SegmentedControl, Card } from '../ui';
import { DishWithIngredients } from '../../types/dish';
import { EstimatedNutrition } from '../../infra/services/aiNutritionService';

const SERVING_SEGMENTS = [
  { label: '0.5人前', value: '0.5' },
  { label: '1人前', value: '1' },
  { label: '1.5人前', value: '1.5' },
  { label: '2人前', value: '2' },
];

interface DishDetailModalProps {
  visible: boolean;
  onClose: () => void;
  dish: DishWithIngredients | null;
  aiEstimate?: EstimatedNutrition | null;
  onAddDish: (dish: DishWithIngredients, servingMultiplier: number) => void;
  onAddAiEstimate?: (estimate: EstimatedNutrition, servingMultiplier: number) => void;
  onSaveAndAddAiEstimate?: (estimate: EstimatedNutrition, servingMultiplier: number) => void;
}

export function DishDetailModal({
  visible,
  onClose,
  dish,
  aiEstimate,
  onAddDish,
  onAddAiEstimate,
  onSaveAndAddAiEstimate,
}: DishDetailModalProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const [servingMultiplier, setServingMultiplier] = useState('1');

  const multiplier = parseFloat(servingMultiplier);

  // Determine which mode we're in
  const isAiMode = !!aiEstimate && !dish;

  const title = isAiMode ? aiEstimate!.dishName : dish?.nameJa ?? '';

  const scaled = useMemo(() => {
    if (isAiMode && aiEstimate) {
      return {
        calories: Math.round(aiEstimate.totalCalories * multiplier),
        proteinG: Math.round(aiEstimate.totalProtein * multiplier * 10) / 10,
        fatG: Math.round(aiEstimate.totalFat * multiplier * 10) / 10,
        carbG: Math.round(aiEstimate.totalCarb * multiplier * 10) / 10,
      };
    }
    if (dish) {
      return {
        calories: Math.round(dish.totalCalories * multiplier),
        proteinG: Math.round(dish.totalProteinG * multiplier * 10) / 10,
        fatG: Math.round(dish.totalFatG * multiplier * 10) / 10,
        carbG: Math.round(dish.totalCarbG * multiplier * 10) / 10,
      };
    }
    return null;
  }, [dish, aiEstimate, isAiMode, multiplier]);

  const ingredients = useMemo(() => {
    if (isAiMode && aiEstimate) {
      return aiEstimate.ingredients.map((ing) => ({
        foodName: ing.name,
        amountG: Math.round(ing.amountG * multiplier * 10) / 10,
        calories: Math.round(ing.calories * multiplier),
        proteinG: Math.round(ing.protein * multiplier * 10) / 10,
        fatG: Math.round(ing.fat * multiplier * 10) / 10,
        carbG: Math.round(ing.carb * multiplier * 10) / 10,
        matchedFromDB: ing.matchedFromDB,
      }));
    }
    if (dish) {
      return dish.ingredients.map((ing) => ({
        foodName: ing.foodName,
        amountG: Math.round(ing.amountG * multiplier * 10) / 10,
        calories: Math.round(ing.calories * multiplier),
        proteinG: Math.round(ing.proteinG * multiplier * 10) / 10,
        fatG: Math.round(ing.fatG * multiplier * 10) / 10,
        carbG: Math.round(ing.carbG * multiplier * 10) / 10,
        matchedFromDB: true,
      }));
    }
    return [];
  }, [dish, aiEstimate, isAiMode, multiplier]);

  if (!scaled || (!dish && !aiEstimate)) return null;

  const showConfidenceWarning = isAiMode && aiEstimate?.confidence === 'low';

  return (
    <RNModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top', 'bottom']}
      >
        {/* Header (fixed) */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerSpacer} />
          <Text
            style={[styles.headerTitle, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.headerClose}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Scrollable content (flex:1) */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          {/* Total calories */}
          <View style={styles.calorieHeader}>
            <Text style={[styles.totalCalories, { color: colors.calorie }]}>
              {scaled.calories}
            </Text>
            <Text style={[styles.kcalLabel, { color: colors.textSecondary }]}>
              kcal
            </Text>
          </View>

          {/* PFC summary */}
          <View style={styles.pfcRow}>
            <View style={styles.pfcItem}>
              <Text style={[styles.pfcValue, { color: colors.protein }]}>
                {scaled.proteinG}g
              </Text>
              <Text style={[styles.pfcLabel, { color: colors.textTertiary }]}>
                P
              </Text>
            </View>
            <View style={styles.pfcItem}>
              <Text style={[styles.pfcValue, { color: colors.fat }]}>
                {scaled.fatG}g
              </Text>
              <Text style={[styles.pfcLabel, { color: colors.textTertiary }]}>
                F
              </Text>
            </View>
            <View style={styles.pfcItem}>
              <Text style={[styles.pfcValue, { color: colors.carb }]}>
                {scaled.carbG}g
              </Text>
              <Text style={[styles.pfcLabel, { color: colors.textTertiary }]}>
                C
              </Text>
            </View>
          </View>

          {/* Confidence warning */}
          {showConfidenceWarning && (
            <View style={[styles.warningBox, { backgroundColor: colors.calorie + '15' }]}>
              <Text style={[styles.warningText, { color: colors.calorie }]}>
                一部の材料がDBに見つかりませんでした。合計値は実際より低い可能性があります。
              </Text>
            </View>
          )}

          {/* Serving selector */}
          <View style={styles.servingSection}>
            <Text style={[styles.servingSectionLabel, { color: colors.textSecondary }]}>
              量を調整
            </Text>
            <SegmentedControl
              segments={SERVING_SEGMENTS}
              selectedValue={servingMultiplier}
              onValueChange={setServingMultiplier}
            />
          </View>

          {/* Ingredients list */}
          <Text style={[styles.ingredientTitle, { color: colors.textPrimary }]}>
            材料一覧
          </Text>
          <Card padding="none" style={styles.ingredientsCard}>
            {ingredients.map((ing, idx) => (
              <View
                key={`${ing.foodName}-${idx}`}
                style={[
                  styles.ingredientRow,
                  idx < ingredients.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={styles.ingredientLeft}>
                  <View style={styles.ingredientNameRow}>
                    <Text
                      style={[styles.ingredientName, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {ing.foodName}
                    </Text>
                    {!ing.matchedFromDB && (
                      <View style={[styles.unmatchedBadge, { backgroundColor: colors.calorie + '20' }]}>
                        <Text style={[styles.unmatchedBadgeText, { color: colors.calorie }]}>
                          DB未登録
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.ingredientAmount, { color: colors.textTertiary }]}>
                    {ing.amountG}g
                  </Text>
                </View>
                <View style={styles.ingredientRight}>
                  {ing.matchedFromDB ? (
                    <>
                      <Text style={[styles.ingredientCal, { color: colors.calorie }]}>
                        {ing.calories} kcal
                      </Text>
                      <Text style={[styles.ingredientPfc, { color: colors.textTertiary }]}>
                        P{ing.proteinG} F{ing.fatG} C{ing.carbG}
                      </Text>
                    </>
                  ) : (
                    <Text style={[styles.ingredientCal, { color: colors.textTertiary }]}>
                      -
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </Card>
        </ScrollView>

        {/* Footer (fixed — add buttons) */}
        <View
          style={[
            styles.footer,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.background,
            },
          ]}
        >
          {isAiMode && aiEstimate ? (
            <View style={styles.footerActions}>
              <Button
                title="この料理を追加"
                onPress={() => onAddAiEstimate?.(aiEstimate, multiplier)}
                variant="outline"
                fullWidth
              />
              <Button
                title="保存して追加"
                onPress={() => onSaveAndAddAiEstimate?.(aiEstimate, multiplier)}
                variant="primary"
                fullWidth
              />
            </View>
          ) : dish ? (
            <Button
              title="この料理を追加"
              onPress={() => onAddDish(dish, multiplier)}
              variant="primary"
              fullWidth
            />
          ) : null}
        </View>
      </SafeAreaView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSpacer: {
    width: 36,
  },
  headerTitle: {
    ...typography.titleMedium,
    flex: 1,
    textAlign: 'center',
  },
  headerClose: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  calorieHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  totalCalories: {
    ...typography.displayLarge,
    fontSize: 48,
  },
  kcalLabel: {
    ...typography.bodyLarge,
  },
  pfcRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.lg,
  },
  pfcItem: {
    alignItems: 'center',
    gap: 2,
  },
  pfcValue: {
    ...typography.numberSmall,
    fontSize: 16,
  },
  pfcLabel: {
    ...typography.labelSmall,
  },
  warningBox: {
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  warningText: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  servingSection: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  servingSectionLabel: {
    ...typography.labelMedium,
  },
  ingredientTitle: {
    ...typography.titleSmall,
    marginBottom: spacing.sm,
  },
  ingredientsCard: {
    marginBottom: spacing.md,
  },
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  ingredientLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  ingredientNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ingredientName: {
    ...typography.bodyMedium,
    flexShrink: 1,
  },
  unmatchedBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  unmatchedBadgeText: {
    ...typography.labelSmall,
    fontSize: 10,
  },
  ingredientAmount: {
    ...typography.bodySmall,
    marginTop: 2,
  },
  ingredientRight: {
    alignItems: 'flex-end',
  },
  ingredientCal: {
    ...typography.labelLarge,
  },
  ingredientPfc: {
    ...typography.labelSmall,
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerActions: {
    gap: spacing.sm,
  },
});
