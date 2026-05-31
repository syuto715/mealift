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
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
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
  getMyDishes,
  softDeleteMyDish,
  duplicateMyDish,
} from '../../../src/infra/repositories/dishRepository';
import { searchSearchIndex } from '../../../src/infra/repositories/searchIndexRepository';
import {
  getTemplates,
  incrementTemplateUseCount,
  deleteTemplate,
} from '../../../src/infra/repositories/mealTemplateRepository';
import {
  estimateDishNutrition,
  EstimatedNutrition,
  AIError,
} from '../../../src/infra/services/aiNutritionService';
import { useSubscription } from '../../../src/hooks/useSubscription';
import { DishDetailModal } from '../../../src/components/nutrition/DishDetailModal';
import { FoodDetailModal } from '../../../src/components/nutrition/FoodDetailModal';
import { UpgradePromptModal } from '../../../src/components/subscription/UpgradePromptModal';
import { formatServingHint, getCounterJa } from '../../../src/constants/servingUnits';
import { UNIT_SEGMENTS_FULL } from '../../../src/constants/units';
import { useMealLoggingOcrStore } from '../../../src/stores/mealLoggingOcrStore';
import { mapParsedLabelToFood } from '../../../src/domain/parsedLabelToFood';

// v1.4 ステージ 4 Phase 4B — 3-tab top-level + 6-tab nested structure.
// Plan §5.6 Option C nested reconciliation: top-level navigation を
// semantic 3-tab (検索 / スキャン / OCR) に分け、 既存 6-tab は
// 「検索」 の sub-navigation として preserve (UX regression なし、
// 既存 ユーザー relearning ゼロ).
//
// Top-level (3 tab):
//   - search: 既存 6 sub-tab (検索/マイ料理/よく使う/お気に入り/手入力/
//             テンプレ) を内包
//   - scan: Vision food scan placeholder (Turn 2 で Gemini Vision
//           Edge Function integrate)
//   - ocr: 栄養成分ラベル撮影 → /(tabs)/nutrition/scan-label route
//          → ML Kit OCR + parser → mealLoggingOcrStore handoff
const TOP_TAB_SEGMENTS = [
  { label: '検索', value: 'search' },
  { label: 'スキャン', value: 'scan' },
  { label: 'OCR', value: 'ocr' },
] as const;

// Nested 6 sub-tab (Top-level=「検索」 でのみ表示). 既存 add.tsx の
// activeTab state を継承、 内部 logic は untouched (Plan §10.1 既存
// ロジック破壊なし).
const SEARCH_SUB_SEGMENTS = [
  { label: '検索', value: 'search' },
  { label: 'マイ料理', value: 'myDish' },
  { label: 'よく使う', value: 'frequent' },
  { label: 'お気に入り', value: 'favorite' },
  { label: '手入力', value: 'manual' },
  { label: 'テンプレ', value: 'template' },
];

type TopTab = (typeof TOP_TAB_SEGMENTS)[number]['value'];

function isValidTopTab(value: unknown): value is TopTab {
  return value === 'search' || value === 'scan' || value === 'ocr';
}

// Phase 4F — UNIT_SEGMENTS を `src/constants/units.ts` の
// UNIT_SEGMENTS_FULL (Phase 4A で確立) に置換、 4 → 7 option
// (g/ml/個/本/枚/パック/杯). 「+ 食品を追加」 手入力 mode の unit
// picker が拡張、 食パン / バナナ 等 count 系食品 (本/枚) を直接
// register 可能。 元 4-option (g/ml/個/杯) は SUPERSEDE、 既存 caller
// (manual tab の SegmentedControl) は同 const 名で動作.
const UNIT_SEGMENTS = UNIT_SEGMENTS_FULL;

export default function AddFoodScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const params = useLocalSearchParams<{
    mealType: string;
    date?: string;
    // Phase 4B — Plan §5.5 B integration. nutrition/index.tsx の
    // 「✨ AI で記録」 button が `?topTab=scan` で起動可能、 「+ 食品を
    // 追加」 は default の 'search'.
    topTab?: string;
  }>();
  const mealType = (params.mealType as MealType) ?? 'breakfast';
  const targetDate = params.date; // undefined = today (useNutrition default)
  const { addFood } = useNutrition(targetDate);
  const profile = useProfileStore((s) => s.profile);

  // Phase 4B — top-level navigation state. URL param で initial value
  // を override 可能、 不明値は default 'search' fallback.
  const initialTopTab: TopTab = isValidTopTab(params.topTab)
    ? params.topTab
    : 'search';
  const [topTab, setTopTab] = useState<TopTab>(initialTopTab);

  // v1.5 UI sprint Phase 1a — reactive plan source for the two render-path
  // gates below (barcode button visibility, AI-estimate box). Was canUse
  // (non-reactive module currentTier). Same tiers gated; only reactivity added.
  const sub = useSubscription();
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

  // v1.5 hotfix Issue 2 — restaurant_menu rows from search_index_fts.
  // Adapted to Food via searchIndexRepository.rowToFood, surfaced as a
  // dedicated 「外食メニュー」 section in combinedSearchResults so chain
  // disclosure data is visually separable from 八訂 generic foods.
  const [restaurantResults, setRestaurantResults] = useState<Food[]>([]);

  // Food detail modal state
  const [foodDetailVisible, setFoodDetailVisible] = useState(false);
  const [foodDetailTarget, setFoodDetailTarget] = useState<Food | null>(null);

  // Template state
  const [templates, setTemplates] = useState<MealTemplate[]>([]);

  // Favorites state
  const [favoriteFoods, setFavoriteFoods] = useState<Food[]>([]);
  const [favoriteDishes, setFavoriteDishes] = useState<Dish[]>([]);

  // My Dish state
  const [myDishes, setMyDishes] = useState<Dish[]>([]);

  // AI estimation state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiEstimateResult, setAiEstimateResult] = useState<EstimatedNutrition | null>(null);
  const [aiUpgradeVisible, setAiUpgradeVisible] = useState(false);

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

  const loadMyDishes = useCallback(async () => {
    try {
      const list = await getMyDishes(100);
      setMyDishes(list);
    } catch {
    }
  }, []);

  useEffect(() => {
    loadFrequentFoods();
  }, [loadFrequentFoods]);

  // v1.4 ステージ 4 Phase 4E-3 — OCR + Vision handoff consumption.
  //
  // scan-label.tsx (OCR) and scan-dish.tsx (Vision) both park their
  // result on mealLoggingOcrStore. On focus return we drain both
  // channels in priority order (OCR first — it's more specific in
  // the panel-text-anchored case where both could in principle fire,
  // though in practice only one channel is set per capture).
  //
  // OCR result → ServingQuantityModal pre-fill. The parser DOES
  // recover calories / PFC numerically, so the Modal can scale them
  // by serving amount and the user just confirms the quantity.
  //
  // Vision result → switch to the manual tab and pre-fill name +
  // amount only. Vision does NOT return nutrient values in v1.4
  // (judgment α + scaffolding NOTE), so opening a numeric-scaling
  // Modal would silently log a 0 kcal / 0 PFC meal if the user just
  // tapped confirm. Routing into the manual form forces them to type
  // PFC values themselves (the form's required-field UX rejects an
  // empty submission via the disabled「追加」 button).
  const consumePendingOcrResult = useMealLoggingOcrStore(
    (s) => s.consumePendingResult,
  );
  const consumePendingVisionResult = useMealLoggingOcrStore(
    (s) => s.consumePendingVisionResult,
  );
  useFocusEffect(
    useCallback(() => {
      const pendingOcr = consumePendingOcrResult();
      if (pendingOcr) {
        const candidate = mapParsedLabelToFood(pendingOcr, {
          onUnknownBasis: () => {
            // Surface an advisory alert AFTER the Modal opens so the
            // alert appears on top — the Modal mount + this setTimeout
            // are queued onto sequential RN ticks. Native Alert.alert
            // dismisses on tap; the Modal stays open underneath.
            setTimeout(() => {
              Alert.alert(
                '単位基準を確認してください',
                'OCRから単位（1食分 / 100gあたり）を判別できませんでした。入力値が想定と違う場合は g ボタンで切り替えてください。',
              );
            }, 300);
          },
        });
        setSelectedFood(candidate);
        setServingModalItem({ type: 'food', food: candidate });
        setServingModalVisible(true);
        return;
      }
      const pendingVision = consumePendingVisionResult();
      if (pendingVision) {
        const totalGrams = pendingVision.ingredients.reduce(
          (sum, ing) =>
            sum + (Number.isFinite(ing.amountG) ? ing.amountG : 0),
          0,
        );
        // Force manual tab into view so the pre-filled name + amount
        // are visible immediately on focus return.
        setTopTab('search');
        setActiveTab('manual');
        setManualName(pendingVision.dishName);
        setManualAmount(totalGrams > 0 ? Math.round(totalGrams) : 100);
        setManualUnit('g');
        // Defer the advisory so it doesn't race with the SegmentedControl
        // animation that runs as the manual tab mounts.
        setTimeout(() => {
          Alert.alert(
            'AI料理スキャン完了',
            `「${pendingVision.dishName}」を識別しました。栄養成分を入力して追加してください。`,
          );
        }, 300);
        return;
      }
    }, [consumePendingOcrResult, consumePendingVisionResult]),
  );

  useEffect(() => {
    if (activeTab === 'template') {
      loadTemplates();
    }
    if (activeTab === 'favorite') {
      loadFavorites();
    }
    if (activeTab === 'myDish') {
      loadMyDishes();
    }
  }, [activeTab, loadTemplates, loadFavorites, loadMyDishes]);

  useEffect(() => {
    if (searchQuery.length < 1) {
      setSearchResults([]);
      setDishResults([]);
      setRestaurantResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const [foods, dishes, restaurants] = await Promise.all([
          searchFoods(searchQuery, 30),
          searchDishes(searchQuery, 20),
          searchSearchIndex(searchQuery, 30),
        ]);
        setSearchResults(foods);
        setDishResults(dishes);
        setRestaurantResults(restaurants);
      } catch (error) {
        setSearchResults([]);
        setDishResults([]);
        setRestaurantResults([]);
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
    // Phase 4E-3 — candidate foods (OCR / Vision pre-fill) have an
    // empty id; passing it as foodId would either fail the FK
    // constraint or insert a dangling reference. Omit foodId so the
    // row is recorded as a manual entry, matching how handleManualAdd
    // already records foodName-only items.
    const isCandidate = !food.id;
    await addFood(mealType, {
      ...(isCandidate ? {} : { foodId: food.id }),
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
      setAiEstimateResult(estimate);
      setSelectedDish(null);
      setDishModalVisible(true);
    } catch (error) {
      if (error instanceof AIError) {
        switch (error.code) {
          case 'pro_required':
            setAiUpgradeVisible(true);
            return;
          case 'quota_exceeded':
            Alert.alert('本日の利用上限', error.message);
            return;
          case 'unauthorized':
          case 'invalid_token':
            Alert.alert(
              'ログインが必要です',
              'AI推定を利用するにはログインしてください。',
            );
            return;
          case 'invalid_request':
            Alert.alert('入力エラー', error.message);
            return;
          default:
            Alert.alert('エラー', error.message);
            return;
        }
      }
      Alert.alert('エラー', 'AI栄養推定でエラーが発生しました。');
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
    if (activeTab === 'myDish') {
      await loadMyDishes();
    }
  };

  const handleMyDishLongPress = (dish: Dish) => {
    Alert.alert(
      dish.nameJa,
      '操作を選択してください',
      [
        {
          text: '編集',
          onPress: () =>
            router.push({ pathname: '/(tabs)/nutrition/my-dish', params: { dishId: dish.id } }),
        },
        {
          text: '複製',
          onPress: async () => {
            await duplicateMyDish(dish.id);
            await loadMyDishes();
          },
        },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              '削除確認',
              `「${dish.nameJa}」を削除しますか？`,
              [
                { text: 'キャンセル', style: 'cancel' },
                {
                  text: '削除',
                  style: 'destructive',
                  onPress: async () => {
                    await softDeleteMyDish(dish.id);
                    await loadMyDishes();
                  },
                },
              ],
            );
          },
        },
        { text: 'キャンセル', style: 'cancel' },
      ],
    );
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

  type SearchItem =
    | { type: 'food'; data: Food }
    | { type: 'dish'; data: Dish }
    | { type: 'restaurant'; data: Food }
    | { type: 'header'; label: string };

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
    if (restaurantResults.length > 0) {
      items.push({ type: 'header', label: `外食メニュー（${restaurantResults.length}件）` });
      for (const f of restaurantResults) {
        items.push({ type: 'restaurant', data: f });
      }
    }
    return items;
  }, [searchResults, dishResults, restaurantResults]);

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
    if (item.type === 'restaurant') {
      // v1.5 hotfix Issue 2 — restaurant_menu row.  brand is mandatory:
      // 「牛丼」 hits 吉野家 / 松屋 / すき家 simultaneously, so without a
      // brand subtitle the user can't tell which chain's nutrition row
      // they're picking. Codex Critical (b) regression prevention.
      // Long-press favorite is intentionally OMITTED — restaurant rows
      // carry id='' so toggleFoodFavorite would silently no-op against
      // foods table; v38 search_favorites natural-key plumbing is a
      // post-hotfix cleanup queue item.
      const food = item.data;
      return (
        <TouchableOpacity
          style={[styles.foodRow, { borderBottomColor: colors.border }]}
          onPress={() => openQuantityModal(food)}
          activeOpacity={0.7}
        >
          <View style={styles.foodRowInfo}>
            <View style={styles.foodNameRow}>
              <Text
                style={[styles.foodRowName, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {food.nameJa}
              </Text>
              {food.brand && (
                <Text
                  style={[
                    styles.sourceBadge,
                    {
                      color: colors.primary,
                      backgroundColor: colors.primary + '18',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {food.brand}
                </Text>
              )}
            </View>
            <Text style={[styles.foodRowMeta, { color: colors.textSecondary }]}>
              {/* v1.5.1 Gap 2 — for chain rows with a non-g serving unit
                  (e.g. Starbucks 「杯」 with Tall/Grande already in name_ja),
                  drop the (Xg) parenthetical so the hint reads as the
                  あすけん-style 「1 杯 / 425 kcal」 instead of mixing kcal
                  with raw grams. When the seed carries a
                  `servingDescription` (e.g. CoCo壱 「ライス量「普通(300g)」
                  の場合」) we surface it in the parenthetical so the kcal
                  basis stays explicit — Codex Round 1 Critical fix.
                  Chains that disclose per-100g (McDonald's etc.) keep
                  `servingUnit: 'g'` in the seed JSON, so they fall through
                  to formatServingHint and continue to show
                  「100g / 408 kcal」 unchanged. */}
              {food.servingUnit !== 'g'
                ? `1 ${getCounterJa(food.servingUnit)}${food.servingDescription ? ` (${food.servingDescription})` : ''} / ${Math.round(food.caloriesPerServing)}kcal`
                : formatServingHint(food.servingUnit, food.servingSizeG, Math.round(food.caloriesPerServing))}
            </Text>
            <Text style={[styles.foodRowPfc, { color: colors.textTertiary }]}>
              P {food.proteinG}g F {food.fatG}g C {food.carbG}g
            </Text>
          </View>
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
    }
    // type === 'food'
    const food = item.data;
    const sourceLabel =
      food.source === 'open_food_facts'
        ? 'Open Food Facts'
        : food.isUserAdded
          ? 'あなたが追加'
          : null;
    return (
      <TouchableOpacity
        style={[styles.foodRow, { borderBottomColor: colors.border }]}
        onPress={() => openQuantityModal(food)}
        onLongPress={() => handleToggleFoodFavorite(food)}
        activeOpacity={0.7}
      >
        <View style={styles.foodRowInfo}>
          <View style={styles.foodNameRow}>
            <Text
              style={[styles.foodRowName, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {food.nameJa}
            </Text>
            {sourceLabel && (
              <Text
                style={[
                  styles.sourceBadge,
                  {
                    color: colors.primary,
                    backgroundColor: colors.primary + '18',
                  },
                ]}
              >
                {sourceLabel}
              </Text>
            )}
          </View>
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

  const renderMyDishItem = ({ item }: { item: Dish }) => (
    <TouchableOpacity
      style={[styles.foodRow, { borderBottomColor: colors.border }]}
      onPress={() => handleDishTap(item)}
      onLongPress={() => handleMyDishLongPress(item)}
      activeOpacity={0.7}
    >
      <Text style={styles.dishIcon}>🍱</Text>
      <View style={styles.foodRowInfo}>
        <Text
          style={[styles.foodRowName, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {item.nameJa}
        </Text>
        <Text style={[styles.foodRowMeta, { color: colors.textSecondary }]}>
          {Math.round(item.totalCalories)} kcal / {item.servingDescription}
          {item.useCount > 0 ? ` ・ ${item.useCount}回` : ''}
        </Text>
        <Text style={[styles.foodRowPfc, { color: colors.textTertiary }]}>
          P {item.totalProteinG}g F {item.totalFatG}g C {item.totalCarbG}g
        </Text>
      </View>
      {item.isFavorite && (
        <Ionicons name="heart" size={16} color={colors.calorie} style={{ marginRight: spacing.xs }} />
      )}
      <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
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

      {/* Phase 4B — top-level 3-tab navigation (検索 / スキャン / OCR).
          Plan §5.6 Option C nested reconciliation. 「検索」 内で
          既存 6 sub-tab を維持. */}
      <View style={styles.segmentWrapper}>
        <SegmentedControl
          segments={TOP_TAB_SEGMENTS}
          selectedValue={topTab}
          onValueChange={(v) => setTopTab(v as TopTab)}
        />
      </View>

      {/* Top tab = 「検索」: 既存 6 sub-tab を nested 表示. */}
      {topTab === 'search' && (
        <View style={styles.segmentWrapper}>
          <SegmentedControl
            segments={SEARCH_SUB_SEGMENTS}
            selectedValue={activeTab}
            onValueChange={setActiveTab}
            scrollable
          />
        </View>
      )}

      {/* Top tab = 「スキャン」: Vision food scan placeholder.
          Turn 2 で Gemini Vision Edge Function (estimate-nutrition-vision)
          deploy + integrate 予定。 Turn 1 では coming-soon UI のみ. */}
      {topTab === 'scan' && (
        <View style={styles.placeholderContainer}>
          <Ionicons
            name="camera-outline"
            size={64}
            color={colors.textTertiary}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text
            style={[styles.placeholderTitle, { color: colors.textPrimary }]}
            accessibilityRole="header"
          >
            料理を撮影して記録
          </Text>
          <Text
            style={[
              styles.placeholderSubtitle,
              { color: colors.textSecondary },
            ]}
          >
            AI が料理を認識して栄養成分を推定します
          </Text>
          <Text
            style={[styles.placeholderHint, { color: colors.textTertiary }]}
          >
            (近日公開予定)
          </Text>
        </View>
      )}

      {/* Top tab = 「OCR」: 栄養成分ラベル撮影 → scan-label route. */}
      {topTab === 'ocr' && (
        <View style={styles.placeholderContainer}>
          <Ionicons
            name="scan-outline"
            size={64}
            color={colors.primary}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text
            style={[styles.placeholderTitle, { color: colors.textPrimary }]}
            accessibilityRole="header"
          >
            食品ラベルから記録
          </Text>
          <Text
            style={[
              styles.placeholderSubtitle,
              { color: colors.textSecondary },
            ]}
          >
            栄養成分表示を撮影して自動入力
          </Text>
          <Button
            title="ラベルを撮影"
            onPress={() => router.push('/(tabs)/nutrition/scan-label')}
            variant="primary"
            size="lg"
            testID="add-nutrition-ocr-cta"
          />
        </View>
      )}

      {topTab === 'search' && activeTab === 'search' && (
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
              {sub.hasFeature('barcodeScanner') && (
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
                    {sub.hasFeature('aiNutritionEstimate') ? (
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
                    <Button
                      title="+ この食品を追加"
                      onPress={() =>
                        router.push({
                          pathname: '/(tabs)/nutrition/food-submit',
                          params: { initialName: searchQuery },
                        })
                      }
                      variant="outline"
                      size="sm"
                    />
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

      {topTab === 'search' && activeTab === 'frequent' && (
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

      {topTab === 'search' && activeTab === 'myDish' && (
        <View style={styles.tabContent}>
          <View style={styles.myDishActionRow}>
            <Button
              title="新規作成"
              onPress={() =>
                router.push({ pathname: '/(tabs)/nutrition/my-dish' })
              }
              variant="primary"
              size="sm"
              icon={<Ionicons name="add" size={16} color="#fff" />}
            />
          </View>
          <FlatList
            data={myDishes}
            keyExtractor={(item) => item.id}
            renderItem={renderMyDishItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="restaurant-outline" size={48} color={colors.textTertiary} />
                <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
                  マイ料理がまだありません
                </Text>
                <Text style={[styles.emptySubHint, { color: colors.textTertiary }]}>
                  よく食べる組み合わせを保存して、素早く記録できます
                </Text>
              </View>
            }
          />
        </View>
      )}

      {topTab === 'search' && activeTab === 'favorite' && (
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

      {topTab === 'search' && activeTab === 'manual' && (
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
                  scrollable
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

      {topTab === 'search' && activeTab === 'template' && (
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
      <UpgradePromptModal
        visible={aiUpgradeVisible}
        onClose={() => setAiUpgradeVisible(false)}
        featureName="AI栄養推定"
        featureDescription="料理名を入力するだけでAIが材料と分量を推定します"
        requiredPlan="pro"
        benefits={[
          '自炊料理の栄養素を自動推定',
          '材料の分量から栄養を自動計算',
          '1日50回までご利用可能',
        ]}
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
  // Phase 4B — Top tab scan/ocr placeholder layout.
  placeholderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  placeholderTitle: {
    ...typography.titleMedium,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  placeholderSubtitle: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
  placeholderHint: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
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
  myDishActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  foodNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sourceBadge: {
    ...typography.labelSmall,
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
