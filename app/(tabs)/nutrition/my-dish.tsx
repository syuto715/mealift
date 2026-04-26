import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Button, Input } from '../../../src/components/ui';
import { IngredientPicker } from '../../../src/components/dish/IngredientPicker';
import { RecipeIngredientRow } from '../../../src/components/dish/RecipeIngredientRow';
import {
  Food,
  ExtendedNutrients,
  EXTENDED_NUTRIENT_KEYS,
} from '../../../src/types/food';
import {
  getDishById,
  saveMyDish,
  MyDishIngredientInput,
} from '../../../src/infra/repositories/dishRepository';
import { DAILY_NUTRIENT_TARGETS } from '../../../src/constants/dailyNutrientTargets';
import {
  computeIngredientFromFood,
  computeRecipeTotals,
  validateRecipeIngredient,
  type IngredientNutrition,
} from '../../../src/domain/recipeCalculator';
import type { DishIngredient } from '../../../src/types/dish';

// Recipe-builder state. Two modes coexist:
//   - 'live':   the user picked the food in this session, so we hold the
//               canonical Food row and recompute from (food, amountG) on
//               every commit. The amount input is editable.
//   - 'loaded': the row was rehydrated from a persisted dish during edit.
//               We don't have the Food row here (commit 3 will add the
//               getFoodsByIds hop), so we render a static IngredientNutrition
//               and the amount is read-only.
type IngredientRow =
  | {
      kind: 'live';
      localId: string;
      food: Food;
      amountG: number;
    }
  | {
      kind: 'loaded';
      localId: string;
      cached: IngredientNutrition;
      // Original foodId from the persisted dish, preserved separately
      // because IngredientNutrition.foodId is `string` not `string | null`
      // and we don't want to fabricate one. Survives a re-save.
      originalFoodId: string | null;
    };

const EXTENDED_LABEL_MAP: Record<string, string> = {
  sodiumMg: 'ナトリウム',
  saturatedFatG: '飽和脂肪酸',
  sugarG: '糖質',
};

function makeLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// DishIngredient already extends ExtendedNutrients, so we only need to
// rename a few keys to land in IngredientNutrition shape.
function dishIngredientToCached(ing: DishIngredient): IngredientNutrition {
  const ext = {} as ExtendedNutrients;
  for (const key of EXTENDED_NUTRIENT_KEYS) {
    ext[key] = ing[key] as never;
  }
  return {
    foodId: ing.foodId ?? '',
    foodName: ing.foodName,
    amountG: ing.amountG,
    calories: ing.calories,
    proteinG: ing.proteinG,
    fatG: ing.fatG,
    carbG: ing.carbG,
    ...ext,
  };
}

export default function MyDishScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const params = useLocalSearchParams<{ dishId?: string }>();
  const editingId = params.dishId ?? null;

  const [name, setName] = useState('');
  const [userNote, setUserNote] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [showExtended, setShowExtended] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  // Memoize per-row computeIngredientFromFood by (foodId, amountG) so
  // editing one row's amount doesn't recompute the others. The cache
  // key encodes both halves of the input; recipe-builder state is
  // short-lived enough that unbounded growth isn't a concern.
  const computeCacheRef = useRef<Map<string, IngredientNutrition>>(
    new Map(),
  );

  // Load existing dish when editing.
  useEffect(() => {
    if (!editingId) return;
    (async () => {
      const dish = await getDishById(editingId);
      if (!dish) return;
      setName(dish.nameJa);
      setUserNote(dish.userNote ?? '');
      setIngredients(
        dish.ingredients.map((ing) => ({
          kind: 'loaded' as const,
          localId: ing.id,
          cached: dishIngredientToCached(ing),
          originalFoodId: ing.foodId,
        })),
      );
    })();
  }, [editingId]);

  // Per-row computed nutrition. Loaded rows pass through their cached
  // values; live rows hit the (foodId, amountG) cache.
  const perRowComputed = useMemo<IngredientNutrition[]>(() => {
    const cache = computeCacheRef.current;
    return ingredients.map((row) => {
      if (row.kind === 'loaded') return row.cached;
      const key = `${row.food.id}:${row.amountG}`;
      let result = cache.get(key);
      if (!result) {
        result = computeIngredientFromFood(row.food, row.amountG);
        cache.set(key, result);
      }
      return result;
    });
  }, [ingredients]);

  // Per-row validation against the committed amountG. Drives save-disable.
  // Loaded rows are always valid (they came out of the DB).
  const rowValidation = useMemo(() => {
    return ingredients.map((row) => {
      if (row.kind === 'loaded') return { ok: true } as const;
      return validateRecipeIngredient(row.food, row.amountG);
    });
  }, [ingredients]);

  const validRowCount = useMemo(
    () => rowValidation.filter((v) => v.ok).length,
    [rowValidation],
  );
  const anyInvalid = validRowCount < ingredients.length;
  const showPlaceholder = ingredients.length === 0 || validRowCount === 0;

  // Strict totals — any null in extended-nutrients null-outs the total
  // (UI renders "—"). Macros always sum (NOT NULL in foods schema).
  const totals = useMemo(
    () => computeRecipeTotals(perRowComputed, { partialSums: false }),
    [perRowComputed],
  );

  // Per-key "are all ingredients null on this nutrient?" check. If yes,
  // we hide the row entirely rather than render "—" everywhere.
  const extendedEntries = useMemo(() => {
    if (showPlaceholder) return [];
    const out: Array<{ key: keyof ExtendedNutrients; value: number | null }> = [];
    for (const key of EXTENDED_NUTRIENT_KEYS) {
      const allNull = perRowComputed.every((r) => r[key] == null);
      if (allNull) continue;
      out.push({ key, value: totals[key] });
    }
    return out;
  }, [perRowComputed, totals, showPlaceholder]);

  const handleOpenPicker = useCallback(() => {
    setPickerVisible(true);
  }, []);

  const handlePickFood = useCallback((food: Food) => {
    setIngredients((prev) => [
      ...prev,
      {
        kind: 'live',
        localId: makeLocalId(),
        food,
        amountG: food.servingSizeG,
      },
    ]);
    setPickerVisible(false);
  }, []);

  const handleAmountChange = useCallback(
    (localId: string, amountG: number) => {
      setIngredients((prev) =>
        prev.map((row) =>
          row.localId === localId && row.kind === 'live'
            ? { ...row, amountG }
            : row,
        ),
      );
    },
    [],
  );

  const handleRemoveIngredient = useCallback((localId: string) => {
    setIngredients((prev) => prev.filter((row) => row.localId !== localId));
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    if (!name.trim()) {
      Alert.alert('入力エラー', '料理名を入力してください');
      return;
    }
    if (ingredients.length === 0) {
      Alert.alert('入力エラー', '食材を1つ以上追加してください');
      return;
    }
    if (anyInvalid) {
      Alert.alert('入力エラー', '量が不正な食材があります');
      return;
    }
    setSaving(true);
    try {
      const ingredientsForSave: MyDishIngredientInput[] = ingredients.map(
        (row, idx) => {
          const computed = perRowComputed[idx];
          const extended: Partial<ExtendedNutrients> = {};
          for (const key of EXTENDED_NUTRIENT_KEYS) {
            const v = computed[key];
            if (v != null) extended[key] = v;
          }
          return {
            foodId:
              row.kind === 'live' ? row.food.id : row.originalFoodId,
            foodName: computed.foodName,
            amountG: computed.amountG,
            calories: computed.calories,
            proteinG: computed.proteinG,
            fatG: computed.fatG,
            carbG: computed.carbG,
            extended,
          };
        },
      );
      await saveMyDish({
        id: editingId ?? undefined,
        nameJa: name.trim(),
        userNote: userNote.trim() ? userNote.trim() : null,
        ingredients: ingredientsForSave,
      });
      router.back();
    } catch (error) {
      Alert.alert('エラー', 'マイ料理の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    name,
    userNote,
    ingredients,
    perRowComputed,
    anyInvalid,
    editingId,
  ]);

  const renderTotalValue = (
    value: number | string,
    unit: string,
    color: string,
  ) => (
    <Text style={[styles.totalValue, { color }]}>
      {value}
      <Text style={[styles.totalUnit, { color: colors.textTertiary }]}>{unit}</Text>
    </Text>
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {editingId ? 'マイ料理を編集' : 'マイ料理を作成'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Sticky totals card — sits above the ScrollView so it stays put
          while the ingredient list scrolls. */}
      <View
        style={[
          styles.totalCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        testID="recipe-totals"
      >
        <Text style={[styles.totalTitle, { color: colors.textSecondary }]}>
          合計栄養素
        </Text>
        <View style={styles.totalRow}>
          <View style={styles.totalItem}>
            {renderTotalValue(
              showPlaceholder ? '—' : totals.totalCalories,
              ' kcal',
              colors.calorie,
            )}
            <Text style={[styles.totalLabel, { color: colors.textTertiary }]}>
              kcal
            </Text>
          </View>
          <View style={styles.totalItem}>
            {renderTotalValue(
              showPlaceholder ? '—' : totals.totalProteinG,
              'g',
              colors.protein,
            )}
            <Text style={[styles.totalLabel, { color: colors.textTertiary }]}>
              P
            </Text>
          </View>
          <View style={styles.totalItem}>
            {renderTotalValue(
              showPlaceholder ? '—' : totals.totalFatG,
              'g',
              colors.fat,
            )}
            <Text style={[styles.totalLabel, { color: colors.textTertiary }]}>
              F
            </Text>
          </View>
          <View style={styles.totalItem}>
            {renderTotalValue(
              showPlaceholder ? '—' : totals.totalCarbG,
              'g',
              colors.carb,
            )}
            <Text style={[styles.totalLabel, { color: colors.textTertiary }]}>
              C
            </Text>
          </View>
        </View>

        {showPlaceholder ? (
          <Text style={[styles.placeholderHint, { color: colors.textTertiary }]}>
            {ingredients.length === 0
              ? '食材を追加すると合計が表示されます'
              : '食材の量を入力してください'}
          </Text>
        ) : (
          extendedEntries.length > 0 && (
            <>
              <TouchableOpacity
                style={styles.extToggle}
                onPress={() => setShowExtended((p) => !p)}
                activeOpacity={0.7}
              >
                <Text style={[styles.extToggleText, { color: colors.primary }]}>
                  詳細栄養素 {showExtended ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>
              {showExtended && (
                <View style={styles.extList}>
                  {extendedEntries.map(({ key, value }) => {
                    const target = DAILY_NUTRIENT_TARGETS[key];
                    const label =
                      target?.label ?? EXTENDED_LABEL_MAP[key] ?? key;
                    const unit =
                      target?.unit ?? (key.endsWith('G') ? 'g' : 'mg');
                    return (
                      <View key={key} style={styles.extRow}>
                        <Text
                          style={[styles.extLabel, { color: colors.textSecondary }]}
                        >
                          {label}
                        </Text>
                        <Text
                          style={[styles.extValue, { color: colors.textPrimary }]}
                        >
                          {value == null ? '—' : `${value}${unit}`}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Input
            label="料理名"
            placeholder="例: 鶏むねと野菜のサラダ"
            value={name}
            onChangeText={setName}
          />
          <Input
            label="メモ（任意）"
            placeholder="例: 夜ごはん用の低脂質メニュー"
            value={userNote}
            onChangeText={setUserNote}
          />

          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              食材
            </Text>
            <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>
              {ingredients.length}品
            </Text>
          </View>

          {ingredients.length === 0 ? (
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Ionicons
                name="restaurant-outline"
                size={32}
                color={colors.textTertiary}
              />
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                食材を追加してください
              </Text>
            </View>
          ) : (
            <View>
              {ingredients.map((row, idx) => {
                const computed = perRowComputed[idx];
                return (
                  <RecipeIngredientRow
                    key={row.localId}
                    localId={row.localId}
                    foodName={computed.foodName}
                    amountG={
                      row.kind === 'live' ? row.amountG : row.cached.amountG
                    }
                    food={row.kind === 'live' ? row.food : null}
                    caloriesPreview={Math.round(computed.calories)}
                    onAmountChange={handleAmountChange}
                    onRemove={handleRemoveIngredient}
                  />
                );
              })}
            </View>
          )}

          <Button
            title="食材を追加"
            onPress={handleOpenPicker}
            variant="outline"
            fullWidth
            icon={<Ionicons name="add" size={18} color={colors.primary} />}
          />

          <Button
            title={editingId ? '更新する' : '保存する'}
            onPress={handleSave}
            variant="primary"
            fullWidth
            loading={saving}
            disabled={
              saving ||
              !name.trim() ||
              ingredients.length === 0 ||
              anyInvalid
            }
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <IngredientPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelectFood={handlePickFood}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex1: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { ...typography.titleMedium },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxxl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  sectionTitle: { ...typography.titleSmall },
  sectionCount: { ...typography.labelSmall },
  emptyBox: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
  },
  emptyText: { ...typography.bodySmall },
  totalCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.md,
  },
  totalTitle: { ...typography.labelMedium },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  totalItem: { alignItems: 'center', gap: 2 },
  totalValue: { ...typography.titleSmall, fontWeight: '700' },
  totalUnit: { ...typography.labelSmall, fontWeight: '500' },
  totalLabel: { ...typography.labelSmall },
  placeholderHint: {
    ...typography.bodySmall,
    textAlign: 'center',
    paddingTop: spacing.xs,
  },
  extToggle: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
  },
  extToggleText: { ...typography.labelSmall, fontWeight: '600' },
  extList: { gap: 4 },
  extRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  extLabel: { ...typography.labelSmall },
  extValue: { ...typography.labelSmall, fontWeight: '600' },
});
