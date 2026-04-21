import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal as RNModal,
  SafeAreaView as RNSafeAreaView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Button, Input } from '../../../src/components/ui';
import {
  ServingQuantityModal,
  ServingQuantityResult,
} from '../../../src/components/nutrition/ServingQuantityModal';
import { Food, ExtendedNutrients, EXTENDED_NUTRIENT_KEYS } from '../../../src/types/food';
import { searchFoods } from '../../../src/infra/repositories/foodRepository';
import {
  getDishById,
  saveMyDish,
  MyDishIngredientInput,
} from '../../../src/infra/repositories/dishRepository';
import { DAILY_NUTRIENT_TARGETS } from '../../../src/constants/dailyNutrientTargets';
import { formatServingHint } from '../../../src/constants/servingUnits';

interface IngredientRow extends MyDishIngredientInput {
  localId: string;
  servingUnit: string;
  servingAmount: number;
}

const EXTENDED_LABEL_MAP: Record<string, string> = {
  sodiumMg: 'ナトリウム',
  saturatedFatG: '飽和脂肪酸',
  sugarG: '糖質',
};

function makeLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  // Food picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerResults, setPickerResults] = useState<Food[]>([]);
  const [servingFood, setServingFood] = useState<Food | null>(null);

  // Load existing dish when editing
  useEffect(() => {
    if (!editingId) return;
    (async () => {
      const dish = await getDishById(editingId);
      if (!dish) return;
      setName(dish.nameJa);
      setUserNote(dish.userNote ?? '');
      setIngredients(
        dish.ingredients.map((ing) => {
          const extended: Partial<ExtendedNutrients> = {};
          for (const key of EXTENDED_NUTRIENT_KEYS) {
            const v = ing[key];
            if (v != null) extended[key] = v;
          }
          return {
            localId: ing.id,
            foodName: ing.foodName,
            amountG: ing.amountG,
            calories: ing.calories,
            proteinG: ing.proteinG,
            fatG: ing.fatG,
            carbG: ing.carbG,
            extended,
            servingUnit: 'g',
            servingAmount: ing.amountG,
          };
        }),
      );
    })();
  }, [editingId]);

  // Food search for picker
  useEffect(() => {
    if (!pickerVisible) return;
    if (pickerQuery.length < 1) {
      setPickerResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const foods = await searchFoods(pickerQuery, 30);
        setPickerResults(foods);
      } catch {
        setPickerResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [pickerQuery, pickerVisible]);

  const totals = useMemo(() => {
    let cal = 0;
    let p = 0;
    let f = 0;
    let c = 0;
    const ext: Partial<Record<keyof ExtendedNutrients, number>> = {};
    for (const ing of ingredients) {
      cal += ing.calories;
      p += ing.proteinG;
      f += ing.fatG;
      c += ing.carbG;
      if (ing.extended) {
        for (const key of EXTENDED_NUTRIENT_KEYS) {
          const v = ing.extended[key];
          if (v != null) {
            ext[key] = (ext[key] ?? 0) + v;
          }
        }
      }
    }
    return {
      calories: Math.round(cal),
      proteinG: Math.round(p * 10) / 10,
      fatG: Math.round(f * 10) / 10,
      carbG: Math.round(c * 10) / 10,
      extended: ext,
    };
  }, [ingredients]);

  const extendedEntries = useMemo(() => {
    return EXTENDED_NUTRIENT_KEYS
      .map((k) => [k, totals.extended[k]] as const)
      .filter((entry): entry is readonly [keyof ExtendedNutrients, number] =>
        entry[1] != null && entry[1] > 0,
      )
      .map(([k, v]) => [k, Math.round(v * 100) / 100] as [keyof ExtendedNutrients, number]);
  }, [totals.extended]);

  const handleOpenPicker = useCallback(() => {
    setPickerQuery('');
    setPickerResults([]);
    setPickerVisible(true);
  }, []);

  const handlePickFood = useCallback((food: Food) => {
    setServingFood(food);
  }, []);

  const handleServingConfirm = useCallback((result: ServingQuantityResult) => {
    if (!servingFood) return;
    const extended: Partial<ExtendedNutrients> = {};
    for (const key of EXTENDED_NUTRIENT_KEYS) {
      const v = result.extended[key];
      if (v != null) extended[key] = v;
    }
    const amountG = result.servingUnit === 'g'
      ? result.amount
      : Math.round(result.amount * servingFood.servingSizeG);
    setIngredients((prev) => [
      ...prev,
      {
        localId: makeLocalId(),
        foodName: servingFood.nameJa,
        amountG,
        calories: result.calories,
        proteinG: result.proteinG,
        fatG: result.fatG,
        carbG: result.carbG,
        extended,
        servingUnit: result.servingUnit,
        servingAmount: result.amount,
      },
    ]);
    setServingFood(null);
    setPickerVisible(false);
    setPickerQuery('');
  }, [servingFood]);

  const handleRemoveIngredient = useCallback((localId: string) => {
    setIngredients((prev) => prev.filter((ing) => ing.localId !== localId));
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
    setSaving(true);
    try {
      await saveMyDish({
        id: editingId ?? undefined,
        nameJa: name.trim(),
        userNote: userNote.trim() ? userNote.trim() : null,
        ingredients: ingredients.map((ing) => ({
          foodName: ing.foodName,
          amountG: ing.amountG,
          calories: ing.calories,
          proteinG: ing.proteinG,
          fatG: ing.fatG,
          carbG: ing.carbG,
          extended: ing.extended,
        })),
      });
      router.back();
    } catch (error) {
      Alert.alert('エラー', 'マイ料理の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [saving, name, userNote, ingredients, editingId]);

  const renderIngredient = ({ item }: { item: IngredientRow }) => (
    <View style={[styles.ingredientRow, { borderBottomColor: colors.border }]}>
      <View style={styles.ingredientInfo}>
        <Text
          style={[styles.ingredientName, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {item.foodName}
        </Text>
        <Text style={[styles.ingredientMeta, { color: colors.textSecondary }]}>
          {item.servingAmount}{item.servingUnit} ・ {Math.round(item.calories)}kcal
        </Text>
        <Text style={[styles.ingredientPfc, { color: colors.textTertiary }]}>
          P {item.proteinG}g F {item.fatG}g C {item.carbG}g
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => handleRemoveIngredient(item.localId)}
        hitSlop={8}
      >
        <Ionicons name="trash-outline" size={22} color={colors.error} />
      </TouchableOpacity>
    </View>
  );

  const renderPickerItem = ({ item }: { item: Food }) => (
    <TouchableOpacity
      style={[styles.pickerRow, { borderBottomColor: colors.border }]}
      onPress={() => handlePickFood(item)}
      activeOpacity={0.7}
    >
      <View style={styles.pickerInfo}>
        <Text
          style={[styles.pickerName, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {item.nameJa}
        </Text>
        <Text style={[styles.pickerMeta, { color: colors.textSecondary }]}>
          {formatServingHint(item.servingUnit, item.servingSizeG, Math.round(item.caloriesPerServing))}
        </Text>
      </View>
      <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
    </TouchableOpacity>
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
              <Ionicons name="restaurant-outline" size={32} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                食材を追加してください
              </Text>
            </View>
          ) : (
            <View>
              {ingredients.map((item) => (
                <View key={item.localId}>
                  {renderIngredient({ item })}
                </View>
              ))}
            </View>
          )}

          <Button
            title="食材を追加"
            onPress={handleOpenPicker}
            variant="outline"
            fullWidth
            icon={<Ionicons name="add" size={18} color={colors.primary} />}
          />

          <View style={[styles.totalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.totalTitle, { color: colors.textSecondary }]}>
              合計栄養素
            </Text>
            <View style={styles.totalRow}>
              <View style={styles.totalItem}>
                <Text style={[styles.totalValue, { color: colors.calorie }]}>
                  {totals.calories}
                </Text>
                <Text style={[styles.totalLabel, { color: colors.textTertiary }]}>
                  kcal
                </Text>
              </View>
              <View style={styles.totalItem}>
                <Text style={[styles.totalValue, { color: colors.protein }]}>
                  {totals.proteinG}g
                </Text>
                <Text style={[styles.totalLabel, { color: colors.textTertiary }]}>
                  P
                </Text>
              </View>
              <View style={styles.totalItem}>
                <Text style={[styles.totalValue, { color: colors.fat }]}>
                  {totals.fatG}g
                </Text>
                <Text style={[styles.totalLabel, { color: colors.textTertiary }]}>
                  F
                </Text>
              </View>
              <View style={styles.totalItem}>
                <Text style={[styles.totalValue, { color: colors.carb }]}>
                  {totals.carbG}g
                </Text>
                <Text style={[styles.totalLabel, { color: colors.textTertiary }]}>
                  C
                </Text>
              </View>
            </View>

            {extendedEntries.length > 0 && (
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
                    {extendedEntries.map(([key, value]) => {
                      const target = DAILY_NUTRIENT_TARGETS[key];
                      const label = target?.label ?? EXTENDED_LABEL_MAP[key] ?? key;
                      const unit = target?.unit ?? (key.endsWith('G') ? 'g' : 'mg');
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
                  </View>
                )}
              </>
            )}
          </View>

          <Button
            title={editingId ? '更新する' : '保存する'}
            onPress={handleSave}
            variant="primary"
            fullWidth
            loading={saving}
            disabled={saving || !name.trim() || ingredients.length === 0}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Food picker modal */}
      <RNModal
        visible={pickerVisible && !servingFood}
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}
      >
        <RNSafeAreaView style={[styles.flex1, { backgroundColor: colors.background }]}>
          <View style={styles.headerBar}>
            <TouchableOpacity onPress={() => setPickerVisible(false)} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              食材を検索
            </Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.searchBarWrap}>
            <View
              style={[
                styles.searchInputWrapper,
                { backgroundColor: colors.surfaceSecondary },
              ]}
            >
              <Ionicons name="search" size={18} color={colors.textTertiary} />
              <View style={styles.flex1}>
                <Input
                  placeholder="食品名で検索..."
                  value={pickerQuery}
                  onChangeText={setPickerQuery}
                />
              </View>
            </View>
          </View>
          <FlatList
            data={pickerResults}
            keyExtractor={(item) => item.id}
            renderItem={renderPickerItem}
            contentContainerStyle={styles.pickerListContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
                {pickerQuery.length > 0 ? '該当する食品が見つかりません' : '食品名を入力して検索'}
              </Text>
            }
          />
        </RNSafeAreaView>
      </RNModal>

      <ServingQuantityModal
        visible={!!servingFood}
        onClose={() => setServingFood(null)}
        item={servingFood ? { type: 'food', food: servingFood } : null}
        onConfirm={handleServingConfirm}
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
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ingredientInfo: { flex: 1, marginRight: spacing.md },
  ingredientName: { ...typography.bodyMedium },
  ingredientMeta: { ...typography.bodySmall, marginTop: 2 },
  ingredientPfc: { ...typography.labelSmall, marginTop: 2 },
  totalCard: {
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
  totalLabel: { ...typography.labelSmall },
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
  searchBarWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingLeft: spacing.sm,
    gap: spacing.xs,
  },
  pickerListContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxxl,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerInfo: { flex: 1, marginRight: spacing.md },
  pickerName: { ...typography.bodyMedium },
  pickerMeta: { ...typography.bodySmall, marginTop: 2 },
  emptyHint: {
    ...typography.bodyMedium,
    textAlign: 'center',
    marginTop: spacing.xxxxl,
  },
});
