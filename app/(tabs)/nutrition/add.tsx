import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  FlatList,
  TouchableOpacity,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import {
  Button,
  Input,
  NumberInput,
  SegmentedControl,
} from '../../../src/components/ui';
import { useNutrition } from '../../../src/hooks/useNutrition';
import { useProfileStore } from '../../../src/stores/profileStore';
import {
  Food,
  ExtendedNutrients,
  EXTENDED_NUTRIENT_KEYS,
} from '../../../src/types/food';
import { MealType } from '../../../src/types/common';
import { MealTemplate } from '../../../src/types/nutrition';
import { Dish, DishWithIngredients } from '../../../src/types/dish';
import {
  ServingQuantityModal,
  ServingQuantityResult,
} from '../../../src/components/nutrition/ServingQuantityModal';
import {
  searchFoods,
  getFrequentFoods,
  addCustomFood,
  getFavoriteFoods,
  toggleFoodFavorite,
  findByExactName,
} from '../../../src/infra/repositories/foodRepository';
import {
  searchDishes,
  getDishById,
  incrementDishUseCount,
  getFavoriteDishes,
  toggleDishFavorite,
  saveDishFromAI,
} from '../../../src/infra/repositories/dishRepository';
import {
  getTemplates,
  incrementTemplateUseCount,
  deleteTemplate,
} from '../../../src/infra/repositories/mealTemplateRepository';
import {
  estimateDishNutrition,
  EstimatedNutrition,
} from '../../../src/infra/services/aiNutritionService';
import { canUse } from '../../../src/infra/services/subscriptionService';
import { DishDetailModal } from '../../../src/components/nutrition/DishDetailModal';
import { FoodDetailModal } from '../../../src/components/nutrition/FoodDetailModal';
import { formatServingHint } from '../../../src/constants/servingUnits';

const TAB_SEGMENTS = [
  { label: '検索', value: 'search' },
  { label: 'よく使う', value: 'frequent' },
  { label: 'お気に入り', value: 'favorite' },
  { label: '手入力', value: 'manual' },
  { label: 'テンプレ', value: 'template' },
];

const UNIT_SEGMENTS = [
  { label: 'g', value: 'g' },
  { label: 'ml', value: 'ml' },
  { label: '個', value: '個' },
  { label: '杯', value: '杯' },
];

export default function AddFoodScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const params = useLocalSearchParams<{ mealType: string; date?: string }>();
  const mealType = (params.mealType as MealType) ?? 'breakfast';
  const targetDate = params.date; // undefined = today (useNutrition default)
  const { addFood } = useNutrition(targetDate);
  const profile = useProfileStore((s) => s.profile);

  const [activeTab, setActiveTab] = useState('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Food[]>([]);
  const [frequentFoods, setFrequentFoods] = useState<Food[]>([]);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [servingModalVisible, setServingModalVisible] = useState(false);
  const [servingModalItem, setServingModalItem] = useState<
    { type: 'food'; food: Food } | null
  >(null);

  // Dish state
  const [dishResults, setDishResults] = useState<Dish[]>([]);
  const [selectedDish, setSelectedDish] = useState<DishWithIngredients | null>(null);
  const [dishModalVisible, setDishModalVisible] = useState(false);

  // Food detail modal state
  const [foodDetailVisible, setFoodDetailVisible] = useState(false);
  const [foodDetailTarget, setFoodDetailTarget] = useState<Food | null>(null);

  // Template state
  const [templates, setTemplates] = useState<MealTemplate[]>([]);

  // Favorites state
  const [favoriteFoods, setFavoriteFoods] = useState<Food[]>([]);
  const [favoriteDishes, setFavoriteDishes] = useState<Dish[]>([]);

  // AI estimation state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiEstimateResult, setAiEstimateResult] = useState<EstimatedNutrition | null>(null);

  // Manual entry state
  const [manualName, setManualName] = useState('');
  const [manualCalories, setManualCalories] = useState<number | null>(null);
  const [manualProtein, setManualProtein] = useState<number | null>(null);
  const [manualFat, setManualFat] = useState<number | null>(null);
  const [manualCarb, setManualCarb] = useState<number | null>(null);
  const [manualAmount, setManualAmount] = useState<number | null>(100);
  const [manualUnit, setManualUnit] = useState('g');
  const [saveAsCustom, setSaveAsCustom] = useState(false);
  const [saveAsDish, setSaveAsDish] = useState(false);

  // Extended nutrient manual input
  const [showManualExtended, setShowManualExtended] = useState(false);
  const [manualFiber, setManualFiber] = useState<number | null>(null);
  const [manualSalt, setManualSalt] = useState<number | null>(null);
  const [manualCalcium, setManualCalcium] = useState<number | null>(null);
  const [manualIron, setManualIron] = useState<number | null>(null);
  const [manualVitC, setManualVitC] = useState<number | null>(null);

  const loadFrequentFoods = useCallback(async () => {
    try {
      const foods = await getFrequentFoods(20);
      setFrequentFoods(foods);
    } catch (error) {
    }
  }, []);

  const loadFavorites = useCallback(async () => {
    try {
      const [foods, dishes] = await Promise.all([
        getFavoriteFoods(50),
        getFavoriteDishes(50),
      ]);
      setFavoriteFoods(foods);
      setFavoriteDishes(dishes);
    } catch (error) {
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    if (!profile?.id) return;
    const list = await getTemplates(profile.id);
    setTemplates(list);
  }, [profile?.id]);

  useEffect(() => {
    loadFrequentFoods();
  }, [loadFrequentFoods]);

  useEffect(() => {
    if (activeTab === 'template') {
      loadTemplates();
    }
    if (activeTab === 'favorite') {
      loadFavorites();
    }
  }, [activeTab, loadTemplates, loadFavorites]);

  useEffect(() => {
    if (searchQuery.length < 1) {
      setSearchResults([]);
      setDishResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const [foods, dishes] = await Promise.all([
          searchFoods(searchQuery, 30),
          searchDishes(searchQuery, 20),
        ]);
        setSearchResults(foods);
        setDishResults(dishes);
      } catch (error) {
        setSearchResults([]);
        setDishResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const openQuantityModal = (food: Food) => {
    setSelectedFood(food);
    setServingModalItem({ type: 'food', food });
    setServingModalVisible(true);
  };

  const openFoodDetailModal = (food: Food) => {
    setFoodDetailTarget(food);
    setFoodDetailVisible(true);
  };

  const handleDetailAdd = (food: Food) => {
    setFoodDetailVisible(false);
    setFoodDetailTarget(null);
    openQuantityModal(food);
  };

  const handleServingConfirm = async (result: ServingQuantityResult) => {
    if (!servingModalItem || servingModalItem.type !== 'food') return;
    const food = servingModalItem.food;
    await addFood(mealType, {
      foodId: food.id,
      foodName: food.nameJa,
      servingAmount: result.amount,
      servingUnit: result.servingUnit,
      calories: result.calories,
      proteinG: result.proteinG,
      fatG: result.fatG,
      carbG: result.carbG,
      ...result.extended,
    });
    setServingModalVisible(false);
    setServingModalItem(null);
    setSelectedFood(null);
    router.back();
  };

  const handleDishTap = async (dish: Dish) => {
    // Load full dish with ingredients and show DishDetailModal
    const full = await getDishById(dish.id);
    if (!full) return;
    setSelectedDish(full);
    setDishModalVisible(true);
  };

  const handleAddDish = async (dish: DishWithIngredients, multiplier: number) => {
    const cal = Math.round(dish.totalCalories * multiplier);
    const p = Math.round(dish.totalProteinG * multiplier * 10) / 10;
    const f = Math.round(dish.totalFatG * multiplier * 10) / 10;
    const c = Math.round(dish.totalCarbG * multiplier * 10) / 10;
    const label = multiplier === 1
      ? dish.servingDescription
      : `${multiplier}人前`;

    // Scale extended nutrients by serving multiplier. Dish already stores the
    // per-1-serving values as part of ExtendedNutrients (v9 schema).
    // Use a narrowed Record type (value = number, never null) so the spread
    // below lines up with MealLogItemInput's `number | undefined` shape.
    const extended: Partial<Record<keyof ExtendedNutrients, number>> = {};
    for (const key of EXTENDED_NUTRIENT_KEYS) {
      const v = dish[key];
      if (v != null) extended[key] = Math.round(v * multiplier * 100) / 100;
    }

    await addFood(mealType, {
      foodName: `${dish.nameJa}（${label}）`,
      servingAmount: multiplier,
      servingUnit: '人前',
      calories: cal,
      proteinG: p,
      fatG: f,
      carbG: c,
      ...extended,
    });

    await incrementDishUseCount(dish.id);
    setDishModalVisible(false);
    setSelectedDish(null);
    router.back();
  };

  const handleAiEstimate = async () => {
    if (!searchQuery.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const estimate = await estimateDishNutrition(
        searchQuery.trim(),
        findByExactName,
        (q) => searchFoods(q, 5),
      );
      if (!estimate) {
        Alert.alert('推定失敗', 'AI栄養推定に失敗しました。もう一度お試しください。');
        setActiveTab('manual');
        return;
      }
      setAiEstimateResult(estimate);
      setSelectedDish(null);
      setDishModalVisible(true);
    } catch (error) {
      Alert.alert('エラー', 'AI栄養推定でエラーが発生しました。');
      setActiveTab('manual');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAddAiEstimate = async (estimate: EstimatedNutrition, multiplier: number) => {
    const cal = Math.round(estimate.totalCalories * multiplier);
    const p = Math.round(estimate.totalProtein * multiplier * 10) / 10;
    const f = Math.round(estimate.totalFat * multiplier * 10) / 10;
    const c = Math.round(estimate.totalCarb * multiplier * 10) / 10;
    const label = multiplier === 1 ? estimate.servingDescription : `${multiplier}人前`;

    await addFood(mealType, {
      foodName: `${estimate.dishName}（${label}）`,
      servingAmount: multiplier,
      servingUnit: '人前',
      calories: cal,
      proteinG: p,
      fatG: f,
      carbG: c,
    });
    setDishModalVisible(false);
    setAiEstimateResult(null);
    router.back();
  };

  const handleSaveAndAddAiEstimate = async (estimate: EstimatedNutrition, multiplier: number) => {
    // Save to dishes DB for future searches
    const saved = await saveDishFromAI({
      dishName: estimate.dishName,
      servingDescription: estimate.servingDescription,
      totalCalories: estimate.totalCalories,
      totalProtein: estimate.totalProtein,
      totalFat: estimate.totalFat,
      totalCarb: estimate.totalCarb,
      ingredients: estimate.ingredients.map((i) => ({
        name: i.name,
        amountG: i.amountG,
        calories: i.calories,
        protein: i.protein,
        fat: i.fat,
        carb: i.carb,
      })),
      confidence: estimate.confidence,
    });

    const cal = Math.round(estimate.totalCalories * multiplier);
    const p = Math.round(estimate.totalProtein * multiplier * 10) / 10;
    const f = Math.round(estimate.totalFat * multiplier * 10) / 10;
    const c = Math.round(estimate.totalCarb * multiplier * 10) / 10;
    const label = multiplier === 1 ? saved.servingDescription : `${multiplier}人前`;

    await addFood(mealType, {
      foodName: `${saved.nameJa}（${label}）`,
      servingAmount: multiplier,
      servingUnit: '人前',
      calories: cal,
      proteinG: p,
      fatG: f,
      carbG: c,
    });
    await incrementDishUseCount(saved.id);
    setDishModalVisible(false);
    setAiEstimateResult(null);
    router.back();
  };

  const handleToggleFoodFavorite = async (food: Food) => {
    await toggleFoodFavorite(food.id);
    if (activeTab === 'favorite') {
      await loadFavorites();
    }
  };

  const handleToggleDishFavorite = async (dish: Dish) => {
    await toggleDishFavorite(dish.id);
    if (activeTab === 'favorite') {
      await loadFavorites();
    }
  };

  const handleManualAdd = async () => {
    if (!manualName.trim()) return;
    const cal = manualCalories ?? 0;
    const p = manualProtein ?? 0;
    const f = manualFat ?? 0;
    const c = manualCarb ?? 0;
    const amt = manualAmount ?? 100;

    const extNutrients = {
      fiberG: manualFiber ?? 0,
      saltG: manualSalt ?? 0,
      calciumMg: manualCalcium ?? 0,
      ironMg: manualIron ?? 0,
      vitaminCMg: manualVitC ?? 0,
    };

    if (saveAsDish) {
      const saved = await saveDishFromAI({
        dishName: manualName.trim(),
        servingDescription: `${amt}${manualUnit}`,
        totalCalories: cal,
        totalProtein: p,
        totalFat: f,
        totalCarb: c,
        ingredients: [{
          name: manualName.trim(),
          amountG: amt,
          calories: cal,
          protein: p,
          fat: f,
          carb: c,
        }],
        confidence: 'high',
      });
      await addFood(mealType, {
        foodName: `${saved.nameJa}（${saved.servingDescription}）`,
        servingAmount: 1,
        servingUnit: '食',
        calories: cal,
        proteinG: p,
        fatG: f,
        carbG: c,
        ...extNutrients,
      });
    } else if (saveAsCustom) {
      const customFood = await addCustomFood({
        nameJa: manualName.trim(),
        servingSizeG: amt,
        servingUnit: manualUnit,
        caloriesPerServing: cal,
        proteinG: p,
        fatG: f,
        carbG: c,
        fiberG: manualFiber,
        calciumMg: manualCalcium,
        ironMg: manualIron,
        vitaminCMg: manualVitC,
        saltG: manualSalt,
      });
      await addFood(mealType, {
        foodId: customFood.id,
        foodName: customFood.nameJa,
        servingAmount: amt,
        servingUnit: manualUnit,
        calories: cal,
        proteinG: p,
        fatG: f,
        carbG: c,
        ...extNutrients,
      });
    } else {
      await addFood(mealType, {
        foodName: manualName.trim(),
        servingAmount: amt,
        servingUnit: manualUnit,
        calories: cal,
        proteinG: p,
        fatG: f,
        carbG: c,
        ...extNutrients,
      });
    }
    router.back();
  };

  const handleApplyTemplate = async (template: MealTemplate) => {
    for (const item of template.items) {
      // Forward the whole item (MealLogItemInput already carries extended
      // nutrients). Spread over PFC so optional fields like fiber, vitamins,
      // minerals that were captured when the template was saved propagate.
      await addFood(mealType, {
        ...item,
        foodId: item.foodId ?? undefined,
      });
    }
    await incrementTemplateUseCount(template.id);
    router.back();
  };

  const handleDeleteTemplate = (template: MealTemplate) => {
    Alert.alert(
      '削除確認',
      `「${template.name}」を削除しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            await deleteTemplate(template.id);
            await loadTemplates();
          },
        },
      ]
    );
  };

  const getTemplateCalories = (template: MealTemplate): number => {
    return template.items.reduce((sum, item) => sum + item.calories, 0);
  };

  // (nutrition preview is now inside ServingQuantityModal)

  type SearchItem = { type: 'food'; data: Food } | { type: 'dish'; data: Dish } | { type: 'header'; label: string };

  const combinedSearchResults = useMemo((): SearchItem[] => {
    const items: SearchItem[] = [];
    if (dishResults.length > 0) {
      items.push({ type: 'header', label: `料理（${dishResults.length}件）` });
      for (const d of dishResults) {
        items.push({ type: 'dish', data: d });
      }
    }
    if (searchResults.length > 0) {
      items.push({ type: 'header', label: `食品（${searchResults.length}件）` });
      for (const f of searchResults) {
        items.push({ type: 'food', data: f });
      }
    }
    return items;
  }, [searchResults, dishResults]);

  const combinedFavorites = useMemo((): SearchItem[] => {
    const items: SearchItem[] = [];
    if (favoriteDishes.length > 0) {
      items.push({ type: 'header', label: `料理（${favoriteDishes.length}件）` });
      for (const d of favoriteDishes) {
        items.push({ type: 'dish', data: d });
      }
    }
    if (favoriteFoods.length > 0) {
      items.push({ type: 'header', label: `食品（${favoriteFoods.length}件）` });
      for (const f of favoriteFoods) {
        items.push({ type: 'food', data: f });
      }
    }
    return items;
  }, [favoriteFoods, favoriteDishes]);

  const noSearchResults = searchQuery.length > 0 && combinedSearchResults.length === 0;

  const renderSearchItem = ({ item }: { item: SearchItem }) => {
    if (item.type === 'header') {
      return (
        <Text style={[styles.searchSectionHeader, { color: colors.textSecondary }]}>
          {item.label}
        </Text>
      );
    }
    if (item.type === 'dish') {
      const dish = item.data;
      return (
        <TouchableOpacity
          style={[styles.foodRow, { borderBottomColor: colors.border }]}
          onPress={() => handleDishTap(dish)}
          onLongPress={() => handleToggleDishFavorite(dish)}
          activeOpacity={0.7}
        >
          <Text style={styles.dishIcon}>🍽</Text>
          <View style={styles.foodRowInfo}>
            <Text
              style={[styles.foodRowName, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {dish.nameJa}
            </Text>
            <Text style={[styles.foodRowMeta, { color: colors.textSecondary }]}>
              {Math.round(dish.totalCalories)} kcal / {dish.servingDescription}
            </Text>
            <Text style={[styles.foodRowPfc, { color: colors.textTertiary }]}>
              P {dish.totalProteinG}g F {dish.totalFatG}g C {dish.totalCarbG}g
            </Text>
          </View>
          {dish.isFavorite && (
            <Ionicons name="heart" size={16} color={colors.calorie} style={{ marginRight: spacing.xs }} />
          )}
          <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      );
    }
    // type === 'food'
    const food = item.data;
    return (
      <TouchableOpacity
        style={[styles.foodRow, { borderBottomColor: colors.border }]}
        onPress={() => openQuantityModal(food)}
        onLongPress={() => handleToggleFoodFavorite(food)}
        activeOpacity={0.7}
      >
        <View style={styles.foodRowInfo}>
          <Text
            style={[styles.foodRowName, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {food.nameJa}
          </Text>
          <Text style={[styles.foodRowMeta, { color: colors.textSecondary }]}>
            {formatServingHint(food.servingUnit, food.servingSizeG, Math.round(food.caloriesPerServing))}
          </Text>
          <Text style={[styles.foodRowPfc, { color: colors.textTertiary }]}>
            P {food.proteinG}g F {food.fatG}g C {food.carbG}g
          </Text>
        </View>
        {food.isFavorite && (
          <Ionicons name="heart" size={16} color={colors.calorie} style={{ marginRight: spacing.xs }} />
        )}
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            openFoodDetailModal(food);
          }}
          hitSlop={8}
          style={{ marginRight: spacing.sm }}
        >
          <Ionicons name="information-circle-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
      </TouchableOpacity>
    );
  };

  const renderFoodItem = ({ item }: { item: Food }) => (
    <TouchableOpacity
      style={[styles.foodRow, { borderBottomColor: colors.border }]}
      onPress={() => openQuantityModal(item)}
      activeOpacity={0.7}
    >
      <View style={styles.foodRowInfo}>
        <Text
          style={[styles.foodRowName, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {item.nameJa}
        </Text>
        <Text style={[styles.foodRowMeta, { color: colors.textSecondary }]}>
          {formatServingHint(item.servingUnit, item.servingSizeG, Math.round(item.caloriesPerServing))}
        </Text>
        <Text style={[styles.foodRowPfc, { color: colors.textTertiary }]}>
          P {item.proteinG}g F {item.fatG}g C {item.carbG}g
        </Text>
      </View>
      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation();
          openFoodDetailModal(item);
        }}
        hitSlop={8}
        style={{ marginRight: spacing.sm }}
      >
        <Ionicons name="information-circle-outline" size={22} color={colors.textSecondary} />
      </TouchableOpacity>
      <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
    </TouchableOpacity>
  );

  const renderTemplateItem = ({ item }: { item: MealTemplate }) => {
    const totalCal = getTemplateCalories(item);
    const itemCount = item.items.length;
    return (
      <TouchableOpacity
        style={[styles.foodRow, { borderBottomColor: colors.border }]}
        onPress={() => handleApplyTemplate(item)}
        onLongPress={() => handleDeleteTemplate(item)}
        activeOpacity={0.7}
      >
        <View style={styles.foodRowInfo}>
          <Text
            style={[styles.foodRowName, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text style={[styles.foodRowMeta, { color: colors.textSecondary }]}>
            {Math.round(totalCal)} kcal ・ {itemCount}品
          </Text>
          <Text
            style={[styles.foodRowPfc, { color: colors.textTertiary }]}
            numberOfLines={1}
          >
            {item.items.map((f) => f.foodName).join(', ')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
      </TouchableOpacity>
    );
  };

  const mealLabel =
    mealType === 'breakfast'
      ? '朝食'
      : mealType === 'lunch'
        ? '昼食'
        : mealType === 'dinner'
          ? '夕食'
          : '間食';

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
          {mealLabel}に追加
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.segmentWrapper}>
        <SegmentedControl
          segments={TAB_SEGMENTS}
          selectedValue={activeTab}
          onValueChange={setActiveTab}
          scrollable
        />
      </View>

      {activeTab === 'search' && (
        <View style={styles.tabContent}>
          <View style={styles.searchBarRow}>
            <View
              style={[
                styles.searchInputWrapper,
                { backgroundColor: colors.surfaceSecondary },
              ]}
            >
              <Ionicons
                name="search"
                size={18}
                color={colors.textTertiary}
              />
              <View style={styles.searchInputFlex}>
                <Input
                  placeholder="食品名・料理名を検索..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
              {canUse('barcodeScanner') && (
                <TouchableOpacity
                  style={styles.barcodeButton}
                  onPress={() => router.push({ pathname: '/(tabs)/nutrition/barcode', params: { mealType } })}
                  hitSlop={8}
                >
                  <Ionicons name="barcode-outline" size={22} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <FlatList
            data={combinedSearchResults}
            keyExtractor={(item, index) =>
              item.type === 'header'
                ? `header-${index}`
                : item.type === 'dish'
                  ? `dish-${item.data.id}`
                  : `food-${item.data.id}`
            }
            renderItem={renderSearchItem}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
                  {searchQuery.length > 0
                    ? '該当する食品・料理が見つかりません'
                    : '食品名・料理名を入力して検索'}
                </Text>
                {noSearchResults && (
                  <View style={styles.aiEstimateBox}>
                    {canUse('aiNutritionEstimate') ? (
                      aiLoading ? (
                        <View style={styles.aiLoadingRow}>
                          <ActivityIndicator size="small" color={colors.primary} />
                          <Text style={[styles.aiLoadingText, { color: colors.textSecondary }]}>
                            AIが材料を分析中...
                          </Text>
                        </View>
                      ) : (
                        <>
                          <Text style={[styles.aiHint, { color: colors.textSecondary }]}>
                            AIで「{searchQuery}」の材料を分析できます
                          </Text>
                          <Button
                            title="AIで材料を分析"
                            onPress={handleAiEstimate}
                            variant="primary"
                            size="sm"
                          />
                        </>
                      )
                    ) : (
                      <Text style={[styles.aiHint, { color: colors.textTertiary }]}>
                        AI栄養推定（Proプラン）
                      </Text>
                    )}
                  </View>
                )}
                <Text style={[styles.emptySubHint, { color: colors.textTertiary }]}>
                  長押しでお気に入りに追加できます
                </Text>
              </View>
            }
          />
        </View>
      )}

      {activeTab === 'frequent' && (
        <View style={styles.tabContent}>
          <FlatList
            data={frequentFoods}
            keyExtractor={(item) => item.id}
            renderItem={renderFoodItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text
                style={[styles.emptyHint, { color: colors.textTertiary }]}
              >
                よく使う食品がありません
              </Text>
            }
          />
        </View>
      )}

      {activeTab === 'favorite' && (
        <View style={styles.tabContent}>
          <FlatList
            data={combinedFavorites}
            keyExtractor={(item, index) =>
              item.type === 'header'
                ? `fav-header-${index}`
                : item.type === 'dish'
                  ? `fav-dish-${item.data.id}`
                  : `fav-food-${item.data.id}`
            }
            renderItem={renderSearchItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="heart-outline" size={48} color={colors.textTertiary} />
                <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
                  お気に入りがありません
                </Text>
                <Text style={[styles.emptySubHint, { color: colors.textTertiary }]}>
                  食品・料理を長押ししてお気に入りに追加できます
                </Text>
              </View>
            }
          />
        </View>
      )}

      {activeTab === 'manual' && (
        <KeyboardAvoidingView
          style={styles.tabContent}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.manualForm}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Input
              label="食品名"
              placeholder="例: 鶏むね肉"
              value={manualName}
              onChangeText={setManualName}
            />
            <NumberInput
              label="カロリー (kcal)"
              value={manualCalories}
              onValueChange={setManualCalories}
              step={10}
              min={0}
              max={9999}
              suffix="kcal"
            />
            <NumberInput
              label="タンパク質 (g)"
              value={manualProtein}
              onValueChange={setManualProtein}
              step={1}
              min={0}
              max={999}
              decimals={1}
              suffix="g"
            />
            <NumberInput
              label="脂質 (g)"
              value={manualFat}
              onValueChange={setManualFat}
              step={1}
              min={0}
              max={999}
              decimals={1}
              suffix="g"
            />
            <NumberInput
              label="炭水化物 (g)"
              value={manualCarb}
              onValueChange={setManualCarb}
              step={1}
              min={0}
              max={999}
              decimals={1}
              suffix="g"
            />

            {/* Extended nutrients toggle */}
            <TouchableOpacity
              style={styles.manualExtToggle}
              onPress={() => setShowManualExtended(!showManualExtended)}
            >
              <Text style={[styles.manualExtToggleText, { color: colors.primary }]}>
                詳細栄養素を入力
              </Text>
              <Ionicons
                name={showManualExtended ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.primary}
              />
            </TouchableOpacity>

            {showManualExtended && (
              <View style={styles.manualExtSection}>
                <NumberInput
                  label="食物繊維 (g)"
                  value={manualFiber}
                  onValueChange={setManualFiber}
                  step={0.1}
                  min={0}
                  max={100}
                  decimals={1}
                  suffix="g"
                />
                <NumberInput
                  label="食塩相当量 (g)"
                  value={manualSalt}
                  onValueChange={setManualSalt}
                  step={0.1}
                  min={0}
                  max={100}
                  decimals={1}
                  suffix="g"
                />
                <NumberInput
                  label="カルシウム (mg)"
                  value={manualCalcium}
                  onValueChange={setManualCalcium}
                  step={10}
                  min={0}
                  max={9999}
                  suffix="mg"
                />
                <NumberInput
                  label="鉄分 (mg)"
                  value={manualIron}
                  onValueChange={setManualIron}
                  step={0.1}
                  min={0}
                  max={100}
                  decimals={1}
                  suffix="mg"
                />
                <NumberInput
                  label="ビタミンC (mg)"
                  value={manualVitC}
                  onValueChange={setManualVitC}
                  step={1}
                  min={0}
                  max={9999}
                  suffix="mg"
                />
              </View>
            )}

            <View style={styles.amountRow}>
              <View style={styles.amountInput}>
                <NumberInput
                  label="量"
                  value={manualAmount}
                  onValueChange={setManualAmount}
                  step={10}
                  min={1}
                  max={9999}
                />
              </View>
              <View style={styles.unitSelect}>
                <Text
                  style={[
                    styles.unitLabel,
                    { color: colors.textSecondary },
                  ]}
                >
                  単位
                </Text>
                <SegmentedControl
                  segments={UNIT_SEGMENTS}
                  selectedValue={manualUnit}
                  onValueChange={setManualUnit}
                />
              </View>
            </View>

            <View style={styles.toggleRow}>
              <Text
                style={[styles.toggleLabel, { color: colors.textPrimary }]}
              >
                カスタム食品として保存
              </Text>
              <Switch
                value={saveAsCustom}
                onValueChange={(v) => { setSaveAsCustom(v); if (v) setSaveAsDish(false); }}
                trackColor={{
                  false: colors.border,
                  true: colors.primaryLight,
                }}
                thumbColor={saveAsCustom ? colors.primary : colors.surface}
              />
            </View>

            <View style={styles.toggleRow}>
              <Text
                style={[styles.toggleLabel, { color: colors.textPrimary }]}
              >
                料理として追加
              </Text>
              <Switch
                value={saveAsDish}
                onValueChange={(v) => { setSaveAsDish(v); if (v) setSaveAsCustom(false); }}
                trackColor={{
                  false: colors.border,
                  true: colors.primaryLight,
                }}
                thumbColor={saveAsDish ? colors.primary : colors.surface}
              />
            </View>

            <Button
              title="追加"
              onPress={handleManualAdd}
              variant="primary"
              fullWidth
              disabled={!manualName.trim()}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {activeTab === 'template' && (
        <View style={styles.tabContent}>
          <FlatList
            data={templates}
            keyExtractor={(item) => item.id}
            renderItem={renderTemplateItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="bookmark-outline" size={48} color={colors.textTertiary} />
                <Text
                  style={[styles.emptyHint, { color: colors.textTertiary }]}
                >
                  保存済みのテンプレートがありません
                </Text>
                <Text
                  style={[styles.emptySubHint, { color: colors.textTertiary }]}
                >
                  食事画面から「テンプレとして保存」で作成できます
                </Text>
              </View>
            }
          />
        </View>
      )}

      <ServingQuantityModal
        visible={servingModalVisible}
        onClose={() => {
          setServingModalVisible(false);
          setServingModalItem(null);
          setSelectedFood(null);
        }}
        item={servingModalItem}
        onConfirm={handleServingConfirm}
      />
      <DishDetailModal
        visible={dishModalVisible}
        onClose={() => {
          setDishModalVisible(false);
          setSelectedDish(null);
          setAiEstimateResult(null);
        }}
        dish={selectedDish}
        aiEstimate={aiEstimateResult}
        onAddDish={handleAddDish}
        onAddAiEstimate={handleAddAiEstimate}
        onSaveAndAddAiEstimate={handleSaveAndAddAiEstimate}
      />
      <FoodDetailModal
        visible={foodDetailVisible}
        onClose={() => {
          setFoodDetailVisible(false);
          setFoodDetailTarget(null);
        }}
        food={foodDetailTarget}
        gender={profile?.gender ?? 'male'}
        onAdd={handleDetailAdd}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { ...typography.titleMedium },
  segmentWrapper: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  tabContent: { flex: 1 },
  searchBarRow: {
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
  searchInputFlex: { flex: 1 },
  barcodeButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxxl },
  searchSectionHeader: {
    ...typography.labelMedium,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  dishIcon: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  foodRowInfo: { flex: 1, marginRight: spacing.md },
  foodRowName: { ...typography.bodyMedium },
  foodRowMeta: { ...typography.bodySmall, marginTop: 2 },
  foodRowPfc: { ...typography.labelSmall, marginTop: 2 },
  emptyContainer: {
    alignItems: 'center',
    marginTop: spacing.xxxxl,
    gap: spacing.md,
  },
  emptyHint: {
    ...typography.bodyMedium,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  emptySubHint: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  manualForm: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxxl,
  },
  manualExtToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  manualExtToggleText: {
    ...typography.labelMedium,
  },
  manualExtSection: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  amountRow: { flexDirection: 'row', gap: spacing.md },
  amountInput: { flex: 1 },
  unitSelect: { flex: 1.5 },
  unitLabel: { ...typography.labelMedium, marginBottom: spacing.xs },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLabel: { ...typography.bodyMedium },
  aiEstimateBox: {
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  aiHint: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  aiLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  aiLoadingText: {
    ...typography.bodySmall,
  },
});
