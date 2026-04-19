import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal as RNModal,
  TouchableOpacity,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getColors, radius, shadow } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Food, ExtendedNutrients, EXTENDED_NUTRIENT_KEYS } from '../../types/food';
import { Dish } from '../../types/dish';
import { DAILY_NUTRIENT_TARGETS } from '../../constants/dailyNutrientTargets';
import {
  hasServingUnit,
  getCounterJa,
  formatServingHint,
} from '../../constants/servingUnits';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Narrowed form of `Partial<ExtendedNutrients>` that omits the `null` branch
 * — we only populate entries from non-null source values, and MealLogItemInput
 * doesn't accept `null`. */
export type ScaledExtendedNutrients = {
  [K in keyof ExtendedNutrients]?: number;
};

export interface ServingQuantityResult {
  /** Quantity in the current mode (servings or grams) */
  amount: number;
  /** The unit stored in DB */
  servingUnit: string;
  /** Computed nutrition */
  calories: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  /** Extended nutrients scaled by the chosen amount. Only keys with non-null
   * source values are populated (so the caller can safely spread). */
  extended: ScaledExtendedNutrients;
}

interface FoodInput {
  type: 'food';
  food: Food;
}

interface DishInput {
  type: 'dish';
  dish: Dish;
}

type ItemInput = FoodInput | DishInput;

interface ServingQuantityModalProps {
  visible: boolean;
  onClose: () => void;
  item: ItemInput | null;
  onConfirm: (result: ServingQuantityResult) => void;
  /** Edit mode — changes header and button text */
  editMode?: boolean;
  /** Initial amount to pre-populate (edit mode) */
  initialAmount?: number;
  /** Initial unit to determine starting mode (edit mode) */
  initialUnit?: string;
}

// ---------------------------------------------------------------------------
// Numpad keys
// ---------------------------------------------------------------------------

const NUMPAD_KEYS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['backspace', '0', '.'],
] as const;

// ---------------------------------------------------------------------------
// Labels for extended nutrients not in DAILY_NUTRIENT_TARGETS
// ---------------------------------------------------------------------------

const EXTENDED_LABEL_MAP: Record<string, string> = {
  sodiumMg: 'ナトリウム',
  saturatedFatG: '飽和脂肪酸',
  sugarG: '糖質',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ServingQuantityModal({
  visible,
  onClose,
  item,
  onConfirm,
  editMode = false,
  initialAmount,
  initialUnit,
}: ServingQuantityModalProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  // "serving" mode = quantity in servings/pieces/cups; "gram" mode = grams
  const [inputValue, setInputValue] = useState('1');
  const [isGramMode, setIsGramMode] = useState(false);
  const [showExtended, setShowExtended] = useState(false);

  // Reset state when item changes
  React.useEffect(() => {
    if (!item) return;

    if (editMode && initialAmount != null) {
      // Edit mode — use provided initial values
      const gramUnit = initialUnit === 'g';
      setIsGramMode(gramUnit);
      setInputValue(String(initialAmount));
      return;
    }

    if (item.type === 'food') {
      const isGram = !hasServingUnit(item.food.servingUnit);
      setIsGramMode(isGram);
      setInputValue(isGram ? String(item.food.servingSizeG) : '1');
    } else {
      setIsGramMode(false);
      setInputValue('1');
    }
  }, [item, editMode, initialAmount, initialUnit]);

  // Derived values
  const itemName = item
    ? item.type === 'food'
      ? item.food.nameJa
      : item.dish.nameJa
    : '';

  const unitLabel = useMemo(() => {
    if (!item) return '';
    if (isGramMode) return 'g';
    if (item.type === 'dish') return '人前';
    return getCounterJa(item.food.servingUnit);
  }, [item, isGramMode]);

  const servingHintText = useMemo(() => {
    if (!item) return '';
    if (item.type === 'dish') {
      return `1人前 / ${Math.round(item.dish.totalCalories)}kcal`;
    }
    return formatServingHint(
      item.food.servingUnit,
      item.food.servingSizeG,
      Math.round(item.food.caloriesPerServing),
    );
  }, [item]);

  const numericValue = parseFloat(inputValue) || 0;

  const nutrition = useMemo(() => {
    if (!item || numericValue <= 0)
      return { calories: 0, proteinG: 0, fatG: 0, carbG: 0, extended: {} as ScaledExtendedNutrients };

    if (item.type === 'dish') {
      const m = numericValue; // always serving multiplier
      const ext: ScaledExtendedNutrients = {};
      for (const key of EXTENDED_NUTRIENT_KEYS) {
        const v = item.dish[key];
        if (v != null) ext[key] = Math.round(v * m * 100) / 100;
      }
      return {
        calories: Math.round(item.dish.totalCalories * m),
        proteinG: Math.round(item.dish.totalProteinG * m * 10) / 10,
        fatG: Math.round(item.dish.totalFatG * m * 10) / 10,
        carbG: Math.round(item.dish.totalCarbG * m * 10) / 10,
        extended: ext,
      };
    }

    const food = item.food;
    let ratio: number;
    if (isGramMode) {
      ratio = numericValue / food.servingSizeG;
    } else {
      ratio = numericValue;
    }

    const ext: ScaledExtendedNutrients = {};
    for (const key of EXTENDED_NUTRIENT_KEYS) {
      const v = food[key];
      if (v != null) ext[key] = Math.round(v * ratio * 100) / 100;
    }

    return {
      calories: Math.round(food.caloriesPerServing * ratio),
      proteinG: Math.round(food.proteinG * ratio * 10) / 10,
      fatG: Math.round(food.fatG * ratio * 10) / 10,
      carbG: Math.round(food.carbG * ratio * 10) / 10,
      extended: ext,
    };
  }, [item, numericValue, isGramMode]);

  // Whether gram mode toggle is available (not for dishes)
  const canToggleGram = item?.type === 'food' && hasServingUnit(item.food.servingUnit);

  // Numpad handlers
  const handleNumpadPress = useCallback(
    (key: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (key === 'backspace') {
        setInputValue((prev) => {
          if (prev.length <= 1) return '0';
          return prev.slice(0, -1);
        });
        return;
      }
      if (key === '.') {
        setInputValue((prev) => {
          if (prev.includes('.')) return prev;
          return prev + '.';
        });
        return;
      }
      // digit
      setInputValue((prev) => {
        if (prev === '0') return key;
        // Limit length
        if (prev.length >= 7) return prev;
        return prev + key;
      });
    },
    [],
  );

  const handleToggleMode = useCallback(() => {
    if (!item || item.type !== 'food') return;
    const food = item.food;
    if (isGramMode) {
      // Switch back to serving mode — convert grams to servings
      const grams = parseFloat(inputValue) || 0;
      const servings = grams / food.servingSizeG;
      setInputValue(servings > 0 ? String(Math.round(servings * 10) / 10) : '1');
      setIsGramMode(false);
    } else {
      // Switch to gram mode — convert servings to grams
      const servings = parseFloat(inputValue) || 0;
      const grams = Math.round(servings * food.servingSizeG);
      setInputValue(grams > 0 ? String(grams) : String(food.servingSizeG));
      setIsGramMode(true);
    }
  }, [isGramMode, inputValue, item]);

  const handleConfirm = useCallback(() => {
    if (!item || numericValue <= 0) return;

    let servingAmount: number;
    let servingUnit: string;

    if (item.type === 'dish') {
      servingAmount = numericValue;
      servingUnit = '人前';
    } else if (isGramMode) {
      servingAmount = numericValue;
      servingUnit = 'g';
    } else {
      servingAmount = numericValue;
      servingUnit = item.food.servingUnit;
    }

    onConfirm({
      amount: servingAmount,
      servingUnit,
      ...nutrition,
    });
  }, [item, numericValue, isGramMode, nutrition, onConfirm]);

  // Collect extended nutrients that have data
  const extendedEntries = useMemo(() => {
    const ext = nutrition.extended;
    return EXTENDED_NUTRIENT_KEYS
      .filter((k) => ext[k] != null && ext[k]! > 0)
      .map((k) => [k, ext[k]!] as [keyof ExtendedNutrients, number]);
  }, [nutrition.extended]);

  if (!item) return null;

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            {editMode ? '分量を編集' : '分量・カロリー'}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Food name + quantity display */}
        <View style={styles.nameRow}>
          <Text
            style={[styles.foodName, { color: colors.textPrimary }]}
            numberOfLines={2}
          >
            {itemName}
          </Text>
          <View style={styles.quantityDisplay}>
            <Text style={[styles.quantityValue, { color: colors.primary }]}>
              {inputValue || '0'}
            </Text>
            <Text style={[styles.quantityUnit, { color: colors.textSecondary }]}>
              {unitLabel}
            </Text>
          </View>
        </View>

        {/* Serving hint card */}
        <View
          style={[
            styles.hintCard,
            { backgroundColor: colors.success + '12' },
          ]}
        >
          <Text style={[styles.hintLabel, { color: colors.success }]}>
            分量の目安
          </Text>
          <Text style={[styles.hintText, { color: colors.textPrimary }]}>
            {servingHintText}
          </Text>
        </View>

        {/* Nutrition preview */}
        <View style={[styles.nutritionRow, { borderColor: colors.border }]}>
          <View style={styles.nutritionItem}>
            <Text style={[styles.nutritionValue, { color: colors.calorie }]}>
              {nutrition.calories}
            </Text>
            <Text style={[styles.nutritionLabel, { color: colors.textTertiary }]}>
              kcal
            </Text>
          </View>
          <View style={styles.nutritionItem}>
            <Text style={[styles.nutritionValue, { color: colors.protein }]}>
              {nutrition.proteinG}g
            </Text>
            <Text style={[styles.nutritionLabel, { color: colors.textTertiary }]}>
              P
            </Text>
          </View>
          <View style={styles.nutritionItem}>
            <Text style={[styles.nutritionValue, { color: colors.fat }]}>
              {nutrition.fatG}g
            </Text>
            <Text style={[styles.nutritionLabel, { color: colors.textTertiary }]}>
              F
            </Text>
          </View>
          <View style={styles.nutritionItem}>
            <Text style={[styles.nutritionValue, { color: colors.carb }]}>
              {nutrition.carbG}g
            </Text>
            <Text style={[styles.nutritionLabel, { color: colors.textTertiary }]}>
              C
            </Text>
          </View>
        </View>

        {/* Extended nutrients collapsible */}
        {extendedEntries.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.extToggle}
              onPress={() => setShowExtended((p) => !p)}
              activeOpacity={0.7}
            >
              <Text style={[styles.extToggleText, { color: colors.textSecondary }]}>
                {showExtended ? '詳細 ▲' : '詳細 ▼'}
              </Text>
            </TouchableOpacity>
            {showExtended && (
              <ScrollView
                style={styles.extScroll}
                contentContainerStyle={styles.extScrollContent}
                nestedScrollEnabled
              >
                {extendedEntries.map(([key, value]) => {
                  const target = DAILY_NUTRIENT_TARGETS[key];
                  const label = target?.label ?? EXTENDED_LABEL_MAP[key] ?? key;
                  const unit = target?.unit ?? (key.endsWith('G') || key.endsWith('g') ? 'g' : 'mg');
                  return (
                    <View key={key} style={styles.extRow}>
                      <Text style={[styles.extLabel, { color: colors.textSecondary }]}>
                        {label}
                      </Text>
                      <Text style={[styles.extValue, { color: colors.textPrimary }]}>
                        {value}{unit}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </>
        )}

        {/* Custom numpad */}
        <View style={styles.numpad}>
          {NUMPAD_KEYS.map((row, rowIdx) => (
            <View key={rowIdx} style={styles.numpadRow}>
              {row.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.numpadKey,
                    {
                      backgroundColor: colors.surface,
                      borderRadius: radius.md,
                    },
                  ]}
                  onPress={() => handleNumpadPress(key)}
                  activeOpacity={0.6}
                >
                  {key === 'backspace' ? (
                    <Ionicons
                      name="backspace-outline"
                      size={24}
                      color={colors.textPrimary}
                    />
                  ) : (
                    <Text
                      style={[styles.numpadKeyText, { color: colors.textPrimary }]}
                    >
                      {key}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>

        {/* Bottom buttons */}
        <View style={styles.bottomRow}>
          {canToggleGram ? (
            <TouchableOpacity
              style={[styles.modeButton, { borderColor: colors.border }]}
              onPress={handleToggleMode}
              activeOpacity={0.7}
            >
              <Text style={[styles.modeButtonText, { color: colors.primary }]}>
                {isGramMode ? '人前で入力' : 'グラムで入力'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.modeButton} />
          )}
          <TouchableOpacity
            style={[
              styles.confirmButton,
              {
                backgroundColor:
                  numericValue > 0 ? colors.primary : colors.border,
                borderRadius: radius.md,
              },
            ]}
            onPress={handleConfirm}
            disabled={numericValue <= 0}
            activeOpacity={0.7}
          >
            <Text style={styles.confirmButtonText}>{editMode ? '更新' : 'OK'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </RNModal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    ...typography.titleMedium,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  foodName: {
    ...typography.titleSmall,
    flex: 1,
    marginRight: spacing.md,
  },
  quantityDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  quantityValue: {
    fontSize: 36,
    fontWeight: '700',
  },
  quantityUnit: {
    ...typography.bodyLarge,
  },
  hintCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
  hintLabel: {
    ...typography.labelSmall,
    fontWeight: '600',
  },
  hintText: {
    ...typography.bodyMedium,
  },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 0.5,
    borderRadius: radius.md,
  },
  nutritionItem: {
    alignItems: 'center',
    gap: 2,
  },
  nutritionValue: {
    ...typography.labelLarge,
    fontSize: 16,
    fontWeight: '700',
  },
  nutritionLabel: {
    ...typography.labelSmall,
  },
  numpad: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  numpadRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  numpadKey: {
    flex: 1,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numpadKeyText: {
    fontSize: 24,
    fontWeight: '600',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxxl,
    gap: spacing.md,
  },
  modeButton: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    borderColor: 'transparent',
  },
  modeButtonText: {
    ...typography.labelLarge,
  },
  confirmButton: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    ...typography.labelLarge,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  extToggle: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  extToggleText: {
    ...typography.labelSmall,
  },
  extScroll: {
    maxHeight: 120,
    marginHorizontal: spacing.lg,
  },
  extScrollContent: {
    paddingVertical: spacing.xs,
    gap: 4,
  },
  extRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  extLabel: {
    ...typography.labelSmall,
  },
  extValue: {
    ...typography.labelSmall,
    fontWeight: '600',
  },
});
