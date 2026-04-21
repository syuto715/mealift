import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  useColorScheme,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Input, Card, Modal, NumberInput, Button } from '../../../src/components/ui';
import {
  Food,
  FoodCategory,
  ExtendedNutrients,
  EXTENDED_NUTRIENT_KEYS,
} from '../../../src/types/food';
import { MealType } from '../../../src/types/common';
import { FOOD_CATEGORIES } from '../../../src/constants/foods';
import {
  searchFoods,
  getFoodsByCategory,
} from '../../../src/infra/repositories/foodRepository';
import { useNutrition } from '../../../src/hooks/useNutrition';

const CATEGORY_ICONS: Record<string, string> = {
  staple: 'restaurant-outline',
  meat: 'flame-outline',
  fish: 'fish-outline',
  egg_dairy: 'egg-outline',
  soy: 'leaf-outline',
  vegetable: 'nutrition-outline',
  fruit: 'logo-apple',
  supplement: 'fitness-outline',
  convenience: 'storefront-outline',
  seasoning: 'color-fill-outline',
};

export default function SearchFoodScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const params = useLocalSearchParams<{ mealType: string }>();
  const mealType = (params.mealType as MealType) ?? 'breakfast';
  const { addFood } = useNutrition();

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Food[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<FoodCategory | null>(null);
  const [categoryFoods, setCategoryFoods] = useState<Food[]>([]);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [quantity, setQuantity] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (query.length < 1) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await searchFoods(query, 30);
        setSearchResults(results);
      } catch (error) {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectCategory = useCallback(async (category: FoodCategory) => {
    setSelectedCategory(category);
    try {
      const foods = await getFoodsByCategory(category.id);
      setCategoryFoods(foods);
    } catch (error) {
      setCategoryFoods([]);
    }
  }, []);

  const handleBackFromCategory = () => {
    setSelectedCategory(null);
    setCategoryFoods([]);
  };

  const openQuantityModal = (food: Food) => {
    setSelectedFood(food);
    setQuantity(food.servingSizeG);
    setModalVisible(true);
  };

  const calculateNutrition = (food: Food, amount: number) => {
    const ratio = amount / food.servingSizeG;
    // Narrow the value type to `number` (not `number | null`) so the spread
    // below lines up with MealLogItemInput's `number | undefined` shape.
    const extended: Partial<Record<keyof ExtendedNutrients, number>> = {};
    for (const key of EXTENDED_NUTRIENT_KEYS) {
      const v = food[key];
      if (v != null) extended[key] = Math.round(v * ratio * 100) / 100;
    }
    return {
      calories: Math.round(food.caloriesPerServing * ratio),
      proteinG: Math.round(food.proteinG * ratio * 10) / 10,
      fatG: Math.round(food.fatG * ratio * 10) / 10,
      carbG: Math.round(food.carbG * ratio * 10) / 10,
      extended,
    };
  };

  const handleAddFood = async () => {
    if (!selectedFood || !quantity) return;
    const nutrition = calculateNutrition(selectedFood, quantity);
    await addFood(mealType, {
      foodId: selectedFood.id,
      foodName: selectedFood.nameJa,
      servingAmount: quantity,
      servingUnit: selectedFood.servingUnit === 'g' ? 'g' : selectedFood.servingUnit,
      calories: nutrition.calories,
      proteinG: nutrition.proteinG,
      fatG: nutrition.fatG,
      carbG: nutrition.carbG,
      ...nutrition.extended,
    });
    setModalVisible(false);
    setSelectedFood(null);
    router.back();
  };

  const previewNutrition =
    selectedFood && quantity
      ? calculateNutrition(selectedFood, quantity)
      : null;

  const renderFoodItem = ({ item }: { item: Food }) => (
    <TouchableOpacity
      style={[styles.resultRow, { borderBottomColor: colors.border }]}
      onPress={() => openQuantityModal(item)}
      activeOpacity={0.7}
    >
      <View style={styles.resultInfo}>
        <Text
          style={[styles.foodName, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {item.nameJa}
        </Text>
        <Text style={[styles.foodMeta, { color: colors.textSecondary }]}>
          {item.caloriesPerServing} kcal / {item.servingSizeG}
          {item.servingUnit === 'g' ? 'g' : item.servingUnit}
        </Text>
        <Text style={[styles.foodPfc, { color: colors.textTertiary }]}>
          P {item.proteinG}g F {item.fatG}g C {item.carbG}g
        </Text>
      </View>
      <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
    </TouchableOpacity>
  );

  const renderCategoryItem = ({ item }: { item: FoodCategory }) => (
    <TouchableOpacity
      style={[styles.categoryRow, { borderBottomColor: colors.border }]}
      onPress={() => handleSelectCategory(item)}
      activeOpacity={0.7}
    >
      <View style={styles.categoryLeft}>
        <Ionicons
          name={(CATEGORY_ICONS[item.id] ?? 'ellipse-outline') as any}
          size={22}
          color={colors.primary}
        />
        <Text style={[styles.categoryName, { color: colors.textPrimary }]}>
          {item.nameJa}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );

  const isSearching = query.length > 0;
  const isBrowsingCategory = selectedCategory !== null && !isSearching;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (isBrowsingCategory) {
              handleBackFromCategory();
            } else {
              router.back();
            }
          }}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {isBrowsingCategory ? selectedCategory.nameJa : '食品検索'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.searchBar}>
        <Input
          placeholder="食品名を入力..."
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            if (text.length > 0) {
              setSelectedCategory(null);
            }
          }}
        />
      </View>

      {isSearching ? (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={renderFoodItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
              該当する食品が見つかりません
            </Text>
          }
        />
      ) : isBrowsingCategory ? (
        <FlatList
          data={categoryFoods}
          keyExtractor={(item) => item.id}
          renderItem={renderFoodItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
              このカテゴリーに食品がありません
            </Text>
          }
        />
      ) : (
        <FlatList
          data={FOOD_CATEGORIES as unknown as FoodCategory[]}
          keyExtractor={(item) => item.id}
          renderItem={renderCategoryItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="数量を入力"
      >
        {selectedFood && (
          <View style={styles.modalBody}>
            <Text
              style={[styles.modalFoodName, { color: colors.textPrimary }]}
            >
              {selectedFood.nameJa}
            </Text>
            <Text
              style={[
                styles.modalServingHint,
                { color: colors.textSecondary },
              ]}
            >
              1食分: {selectedFood.servingSizeG}
              {selectedFood.servingUnit === 'g' ? 'g' : selectedFood.servingUnit}{' '}
              ({selectedFood.caloriesPerServing} kcal)
            </Text>

            <NumberInput
              label="量 (g)"
              value={quantity}
              onValueChange={setQuantity}
              step={10}
              min={1}
              max={9999}
              suffix="g"
            />

            {previewNutrition && (
              <Card style={{ marginTop: spacing.md }} padding="sm">
                <View style={styles.previewRow}>
                  <Text
                    style={[
                      styles.previewLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    カロリー
                  </Text>
                  <Text
                    style={[
                      styles.previewValue,
                      { color: colors.calorie },
                    ]}
                  >
                    {previewNutrition.calories} kcal
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  <Text
                    style={[
                      styles.previewLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    P
                  </Text>
                  <Text
                    style={[
                      styles.previewValue,
                      { color: colors.protein },
                    ]}
                  >
                    {previewNutrition.proteinG}g
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  <Text
                    style={[
                      styles.previewLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    F
                  </Text>
                  <Text
                    style={[
                      styles.previewValue,
                      { color: colors.fat },
                    ]}
                  >
                    {previewNutrition.fatG}g
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  <Text
                    style={[
                      styles.previewLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    C
                  </Text>
                  <Text
                    style={[
                      styles.previewValue,
                      { color: colors.carb },
                    ]}
                  >
                    {previewNutrition.carbG}g
                  </Text>
                </View>
              </Card>
            )}

            <View style={styles.modalActions}>
              <Button
                title="キャンセル"
                onPress={() => setModalVisible(false)}
                variant="outline"
                size="md"
              />
              <Button
                title="追加"
                onPress={handleAddFood}
                variant="primary"
                size="md"
                disabled={!quantity || quantity <= 0}
              />
            </View>
          </View>
        )}
      </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { ...typography.titleMedium },
  searchBar: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxxl },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultInfo: { flex: 1, marginRight: spacing.md },
  foodName: { ...typography.bodyLarge },
  foodMeta: { ...typography.bodySmall, marginTop: 2 },
  foodPfc: { ...typography.labelSmall, marginTop: 2 },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  categoryName: { ...typography.bodyLarge },
  emptyText: {
    ...typography.bodyMedium,
    textAlign: 'center',
    marginTop: spacing.xxxxl,
  },
  modalBody: { gap: spacing.md },
  modalFoodName: { ...typography.titleSmall },
  modalServingHint: { ...typography.bodySmall },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  previewLabel: { ...typography.labelMedium },
  previewValue: { ...typography.labelLarge },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.md,
  },
});
