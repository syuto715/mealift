import React, { useState, useCallback, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, ProgressBar, Modal, Button, DateNavigator, Toast } from '../../../src/components/ui';
import {
  ServingQuantityModal,
  ServingQuantityResult,
} from '../../../src/components/nutrition/ServingQuantityModal';
import { CopyMealModal } from '../../../src/components/nutrition/CopyMealModal';
import { useNutrition } from '../../../src/hooks/useNutrition';
import { useProfileStore } from '../../../src/stores/profileStore';
import { MealType } from '../../../src/types/common';
import { MealLogItem } from '../../../src/types/nutrition';
import { Food } from '../../../src/types/food';
import { getISODate, formatDate } from '../../../src/utils/format';
import { createTemplate } from '../../../src/infra/repositories/mealTemplateRepository';
import { getFoodById } from '../../../src/infra/repositories/foodRepository';
import { getRecordedNutritionDates } from '../../../src/infra/repositories/nutritionRepository';
import { format as fmtDate } from 'date-fns';
import { DAILY_NUTRIENT_TARGETS, NutrientTarget } from '../../../src/constants/dailyNutrientTargets';
import { canUse } from '../../../src/infra/services/subscriptionService';
import { useSubscription } from '../../../src/hooks/useSubscription';
import { usePendingSubmissionCount } from '../../../src/hooks/usePendingSubmissionCount';
import { historyWindowDaysFor } from '../../../src/domain/subscription/gates';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: '朝食',
  lunch: '昼食',
  dinner: '夕食',
  snack: '間食',
};

const MEAL_ICONS: Record<MealType, string> = {
  breakfast: 'sunny-outline',
  lunch: 'partly-sunny-outline',
  dinner: 'moon-outline',
  snack: 'cafe-outline',
};

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function getMacroDiffColor(
  actual: number,
  target: number,
  colors: ReturnType<typeof getColors>
): string {
  if (target <= 0) return colors.textTertiary;
  const ratio = actual / target;
  if (ratio >= 0.9 && ratio <= 1.1) return colors.success;
  if (ratio > 1.1) return colors.error;
  return colors.warning;
}

function formatMacroDiff(actual: number, target: number): string {
  if (target <= 0) return '';
  const diff = actual - target;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)}g`;
}

export default function NutritionScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);

  // Date navigation
  const [selectedDate, setSelectedDate] = useState(getISODate());
  const [recordedDates, setRecordedDates] = useState<string[]>([]);

  const {
    todaySummary,
    totalCalories,
    totalProteinG,
    totalFatG,
    totalCarbG,
    getMealItems,
    updateFood,
    removeFood,
    refreshSummary,
  } = useNutrition(selectedDate);

  // Extended nutrients & collapsible
  const [showExtendedNutrients, setShowExtendedNutrients] = useState(false);
  const extended = todaySummary?.extended;
  const gender = profile?.gender ?? 'male';

  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateMealType, setTemplateMealType] = useState<MealType | null>(null);

  // Edit mode state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<MealLogItem | null>(null);
  const [editingFood, setEditingFood] = useState<Food | null>(null);

  // Copy meal modal (Feature C)
  const [copyMealType, setCopyMealType] = useState<MealType | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const { status: planStatus } = useSubscription();
  const historyWindowDays = historyWindowDaysFor(planStatus);
  const pendingSubmissionCount = usePendingSubmissionCount();

  // Load recorded dates for the month around selectedDate
  useEffect(() => {
    if (!profile?.id) return;
    const monthPrefix = selectedDate.slice(0, 7); // 'yyyy-MM'
    getRecordedNutritionDates(profile.id, monthPrefix, historyWindowDays).then(setRecordedDates);
  }, [profile?.id, selectedDate, totalCalories, historyWindowDays]); // re-fetch when data changes

  const targetCalories = profile?.targetCalories ?? 2200;
  const targetProteinG = profile?.targetProteinG ?? 160;
  const targetFatG = profile?.targetFatG ?? 61;
  const targetCarbG = profile?.targetCarbG ?? 248;
  const remainingCalories = Math.max(0, targetCalories - totalCalories);
  const dateFormatted = formatDate(selectedDate, 'M月d日 (E)');

  const handleDelete = (item: MealLogItem) => {
    Alert.alert('削除確認', `${item.foodName}を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => removeFood(item.id),
      },
    ]);
  };

  const handleEditItem = useCallback(async (item: MealLogItem) => {
    if (item.foodId) {
      // Load the Food object to populate ServingQuantityModal
      const food = await getFoodById(item.foodId);
      if (food) {
        setEditingFood(food);
        setEditingItem(item);
        setEditModalVisible(true);
        return;
      }
    }
    // No food in DB (manual entry / dish) — can't open numpad modal, fallback not needed
    // for now just show an info that this item can only be deleted
    Alert.alert('編集不可', 'この食品はテンキーでの編集に対応していません。削除して再登録してください。');
  }, []);

  const handleEditConfirm = useCallback(async (result: ServingQuantityResult) => {
    if (!editingItem) return;
    await updateFood(editingItem.id, {
      servingAmount: result.amount,
      servingUnit: result.servingUnit,
      calories: result.calories,
      proteinG: result.proteinG,
      fatG: result.fatG,
      carbG: result.carbG,
    });
    setEditModalVisible(false);
    setEditingItem(null);
    setEditingFood(null);
  }, [editingItem, updateFood]);

  const getMealCalories = (mealType: MealType): number => {
    const meal = getMealItems(mealType);
    if (!meal) return 0;
    return meal.items.reduce((sum, item) => sum + item.calories, 0);
  };

  const handleSaveAsTemplate = (mealType: MealType) => {
    const meal = getMealItems(mealType);
    if (!meal || meal.items.length === 0) {
      Alert.alert('エラー', 'この食事にはまだ食品が追加されていません。');
      return;
    }
    setTemplateMealType(mealType);
    setTemplateName(MEAL_LABELS[mealType]);
    setTemplateModalVisible(true);
  };

  const handleConfirmSaveTemplate = async () => {
    if (!profile?.id || !templateMealType || !templateName.trim()) return;

    const meal = getMealItems(templateMealType);
    if (!meal || meal.items.length === 0) return;

    // Preserve every nutrient the source MealLogItem stored — templates are
    // plain MealLogItemInput[] (JSON-encoded in meal_templates.items), so
    // copying the full row keeps fiber / vitamins / minerals alive through
    // the save → load → apply round trip.
    const items = meal.items.map((item) => ({
      foodId: item.foodId,
      foodName: item.foodName,
      servingAmount: item.servingAmount,
      servingUnit: item.servingUnit,
      calories: item.calories,
      proteinG: item.proteinG,
      fatG: item.fatG,
      carbG: item.carbG,
      fiberG: item.fiberG,
      sodiumMg: item.sodiumMg,
      calciumMg: item.calciumMg,
      ironMg: item.ironMg,
      vitaminAUg: item.vitaminAUg,
      vitaminB1Mg: item.vitaminB1Mg,
      vitaminB2Mg: item.vitaminB2Mg,
      vitaminB6Mg: item.vitaminB6Mg,
      vitaminB12Ug: item.vitaminB12Ug,
      folateUg: item.folateUg,
      vitaminCMg: item.vitaminCMg,
      vitaminDUg: item.vitaminDUg,
      vitaminEMg: item.vitaminEMg,
      potassiumMg: item.potassiumMg,
      magnesiumMg: item.magnesiumMg,
      zincMg: item.zincMg,
      cholesterolMg: item.cholesterolMg,
      saturatedFatG: item.saturatedFatG,
      sugarG: item.sugarG,
      saltG: item.saltG,
      note: item.note,
    }));

    await createTemplate(profile.id, templateName.trim(), templateMealType, items);
    setTemplateModalVisible(false);
    setTemplateName('');
    setTemplateMealType(null);
    Alert.alert('保存完了', 'テンプレートを保存しました。');
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >

      <DateNavigator
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        recordedDates={recordedDates}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            食事
          </Text>
          <View style={styles.headerRight}>
            <Text style={[styles.dateText, { color: colors.textSecondary }]}>
              {dateFormatted}
            </Text>
            {/* My Submissions entry — Build 15 / Feature 4. Routes to
                /(tabs)/nutrition/my-submissions where the user can see
                the status of their public_foods submissions. Badge shows
                pending_review count from usePendingSubmissionCount. */}
            <TouchableOpacity
              style={styles.mySubmissionsBtn}
              onPress={() => router.push('/(tabs)/nutrition/my-submissions')}
              hitSlop={8}
              activeOpacity={0.7}
              testID="nutrition-home-my-submissions-btn"
            >
              <Ionicons
                name="cloud-upload-outline"
                size={22}
                color={colors.textSecondary}
              />
              {pendingSubmissionCount > 0 ? (
                <View
                  style={[
                    styles.mySubmissionsBadge,
                    { backgroundColor: colors.warning },
                  ]}
                >
                  <Text style={styles.mySubmissionsBadgeText}>
                    {pendingSubmissionCount > 99
                      ? '99+'
                      : pendingSubmissionCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
        </View>

        <Card>
          <View style={styles.calorieRow}>
            <View style={styles.calorieItem}>
              <Text
                style={[styles.calorieLabel, { color: colors.textSecondary }]}
              >
                摂取
              </Text>
              <Text
                style={[styles.calorieValue, { color: colors.calorie }]}
              >
                {Math.round(totalCalories)}
              </Text>
            </View>
            <View style={styles.calorieItem}>
              <Text
                style={[styles.calorieLabel, { color: colors.textSecondary }]}
              >
                目標
              </Text>
              <Text
                style={[
                  styles.calorieValue,
                  { color: colors.textPrimary },
                ]}
              >
                {targetCalories}
              </Text>
            </View>
            <View style={styles.calorieItem}>
              <Text
                style={[styles.calorieLabel, { color: colors.textSecondary }]}
              >
                残り
              </Text>
              <Text
                style={[styles.calorieValue, { color: colors.success }]}
              >
                {Math.round(remainingCalories)}
              </Text>
            </View>
          </View>
          <Text
            style={[styles.calorieUnit, { color: colors.textTertiary }]}
          >
            kcal
          </Text>
          {/* Phase F-1 — ヘッダー進捗バー追加. kcal 摂取率を視覚的に
              提示 (既存 macro bars と並列、 全 calorie の "今どれだけ
              達成しているか" を即視認できる) */}
          {targetCalories > 0 && (
            <View style={styles.calorieProgressWrap}>
              <ProgressBar
                progress={Math.min(1, totalCalories / targetCalories)}
                color={colors.calorie}
                backgroundColor={colors.calorie + '20'}
                height={6}
              />
            </View>
          )}
          <View style={styles.macros}>
            <View style={styles.macroRow}>
              <View style={styles.macroBarContainer}>
                <ProgressBar
                  progress={targetProteinG > 0 ? totalProteinG / targetProteinG : 0}
                  color={colors.protein}
                  label="タンパク質"
                  valueText={`${totalProteinG.toFixed(1)}g / ${targetProteinG}g`}
                  height={6}
                />
              </View>
              {targetProteinG > 0 && totalProteinG > 0 && (
                <Text
                  style={[
                    styles.macroDiff,
                    { color: getMacroDiffColor(totalProteinG, targetProteinG, colors) },
                  ]}
                >
                  {formatMacroDiff(totalProteinG, targetProteinG)}
                </Text>
              )}
            </View>
            <View style={styles.macroRow}>
              <View style={styles.macroBarContainer}>
                <ProgressBar
                  progress={targetFatG > 0 ? totalFatG / targetFatG : 0}
                  color={colors.fat}
                  label="脂質"
                  valueText={`${totalFatG.toFixed(1)}g / ${targetFatG}g`}
                  height={6}
                />
              </View>
              {targetFatG > 0 && totalFatG > 0 && (
                <Text
                  style={[
                    styles.macroDiff,
                    { color: getMacroDiffColor(totalFatG, targetFatG, colors) },
                  ]}
                >
                  {formatMacroDiff(totalFatG, targetFatG)}
                </Text>
              )}
            </View>
            <View style={styles.macroRow}>
              <View style={styles.macroBarContainer}>
                <ProgressBar
                  progress={targetCarbG > 0 ? totalCarbG / targetCarbG : 0}
                  color={colors.carb}
                  label="炭水化物"
                  valueText={`${totalCarbG.toFixed(1)}g / ${targetCarbG}g`}
                  height={6}
                />
              </View>
              {targetCarbG > 0 && totalCarbG > 0 && (
                <Text
                  style={[
                    styles.macroDiff,
                    { color: getMacroDiffColor(totalCarbG, targetCarbG, colors) },
                  ]}
                >
                  {formatMacroDiff(totalCarbG, targetCarbG)}
                </Text>
              )}
            </View>
          </View>

          {/* Extended nutrients toggle */}
          <TouchableOpacity
            style={[styles.extNutrientToggle, { borderTopColor: colors.border }]}
            onPress={() => setShowExtendedNutrients(!showExtendedNutrients)}
          >
            <Text style={[styles.extNutrientToggleText, { color: colors.primary }]}>
              栄養素の詳細
            </Text>
            <Ionicons
              name={showExtendedNutrients ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.primary}
            />
          </TouchableOpacity>

          {showExtendedNutrients && extended && (
            <View style={styles.extNutrientSection}>
              {(Object.entries(DAILY_NUTRIENT_TARGETS) as [string, NutrientTarget][]).map(([key, target]) => {
                const value = extended[key as keyof typeof extended] as number | undefined;
                const targetVal = gender === 'female' ? target.female : target.male;
                const current = value ?? 0;
                const progress = targetVal > 0 ? current / targetVal : 0;
                const isOver = progress > 1;
                const barColor = target.isUpperLimit
                  ? (isOver ? colors.error : colors.success)
                  : (progress >= 0.8 ? colors.success : colors.warning);

                return (
                  <ProgressBar
                    key={key}
                    progress={progress}
                    color={barColor}
                    label={target.label}
                    valueText={`${current} / ${targetVal} ${target.unit}`}
                    height={5}
                  />
                );
              })}
              {/* No-target nutrients */}
              <View style={styles.extNoTargetRow}>
                <Text style={[styles.extNoTargetLabel, { color: colors.textSecondary }]}>
                  飽和脂肪酸
                </Text>
                <Text style={[styles.extNoTargetValue, { color: colors.textPrimary }]}>
                  {extended.saturatedFatG} g
                </Text>
              </View>
              <View style={styles.extNoTargetRow}>
                <Text style={[styles.extNoTargetLabel, { color: colors.textSecondary }]}>
                  糖質
                </Text>
                <Text style={[styles.extNoTargetValue, { color: colors.textPrimary }]}>
                  {extended.sugarG} g
                </Text>
              </View>
            </View>
          )}

          {/* Balance link */}
          <TouchableOpacity
            style={styles.balanceLink}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/nutrition/balance',
                params: { mealType: 'daily', date: selectedDate },
              })
            }
            activeOpacity={0.7}
          >
            <Ionicons name="stats-chart" size={16} color={colors.primary} />
            <Text style={[styles.balanceLinkText, { color: colors.primary }]}>
              栄養バランスを見る
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </TouchableOpacity>
        </Card>

        {MEAL_ORDER.map((mealType) => {
          const meal = getMealItems(mealType);
          const items = meal?.items ?? [];
          const mealCalories = getMealCalories(mealType);

          return (
            <Card key={mealType}>
              <View style={styles.mealHeader}>
                <View style={styles.mealTitleRow}>
                  <Ionicons
                    name={MEAL_ICONS[mealType] as any}
                    size={20}
                    color={colors.primary}
                  />
                  <Text
                    style={[
                      styles.mealTitle,
                      { color: colors.textPrimary },
                    ]}
                  >
                    {MEAL_LABELS[mealType]}
                  </Text>
                </View>
                <View style={styles.mealHeaderRight}>
                  <TouchableOpacity
                    onPress={() => setCopyMealType(mealType)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.templateButton}
                    accessibilityLabel="過去の食事をコピー"
                  >
                    <Ionicons name="copy-outline" size={16} color={colors.primary} />
                  </TouchableOpacity>
                  {items.length > 0 && (
                    <TouchableOpacity
                      onPress={() => handleSaveAsTemplate(mealType)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.templateButton}
                    >
                      <Ionicons name="bookmark-outline" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      if (!canUse('mealNutrientBalance')) {
                        router.push('/(tabs)/settings/subscription');
                        return;
                      }
                      router.push({
                        pathname: '/(tabs)/nutrition/balance',
                        params: { mealType, date: selectedDate },
                      });
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.templateButton}
                  >
                    <Ionicons
                      name="stats-chart"
                      size={16}
                      color={canUse('mealNutrientBalance') ? colors.primary : colors.textTertiary}
                    />
                  </TouchableOpacity>
                  <Text
                    style={[
                      styles.mealCalories,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {Math.round(mealCalories)} kcal
                  </Text>
                </View>
              </View>

              {items.length > 0 ? (
                <View style={styles.itemList}>
                  {items.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.foodItem,
                        { borderBottomColor: colors.border },
                      ]}
                      onPress={() => handleEditItem(item)}
                      onLongPress={() => handleDelete(item)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.foodInfo}>
                        <Text
                          style={[
                            styles.foodName,
                            { color: colors.textPrimary },
                          ]}
                          numberOfLines={1}
                        >
                          {item.foodName}
                        </Text>
                        <Text
                          style={[
                            styles.foodMeta,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {item.servingAmount}
                          {item.servingUnit} ・ {Math.round(item.calories)} kcal
                        </Text>
                        <Text
                          style={[
                            styles.foodPfc,
                            { color: colors.textTertiary },
                          ]}
                        >
                          P {item.proteinG.toFixed(1)}g F{' '}
                          {item.fatG.toFixed(1)}g C {item.carbG.toFixed(1)}g
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={colors.textTertiary}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.mealEmptyState}>
                  <Ionicons name="restaurant-outline" size={32} color={colors.textTertiary} />
                  {/* Phase F-2 — エンプティ copy 温かい誘導に. 元の
                      「食事を記録して栄養バランスを確認しましょう」 は
                      "記録" 行為の説明だけ、 user の行動誘導が弱い.
                      Plan §5.5 B「温かいエンプティ + CTA」 の方向性で
                      copy 改善. AI 推定 / 写真から CTA はステージ 4
                      食品 3 タブ統合 UI で実装 (本 Phase F は既存
                      "食品を追加" button preserve、 copy のみ調整). */}
                  <Text
                    style={[
                      styles.emptyText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    まだ記録がありません
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.addButton,
                  { borderColor: colors.primary },
                ]}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/nutrition/add',
                    params: { mealType, date: selectedDate },
                  })
                }
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={18} color={colors.primary} />
                <Text
                  style={[styles.addButtonText, { color: colors.primary }]}
                >
                  食品を追加
                </Text>
              </TouchableOpacity>
            </Card>
          );
        })}
      </ScrollView>

      <Modal
        visible={templateModalVisible}
        onClose={() => setTemplateModalVisible(false)}
        title="テンプレとして保存"
      >
        <View style={styles.templateModalBody}>
          <Text style={[styles.templateModalHint, { color: colors.textSecondary }]}>
            テンプレート名を入力してください
          </Text>
          <TextInput
            style={[
              styles.templateNameInput,
              {
                color: colors.textPrimary,
                backgroundColor: colors.surfaceSecondary,
                borderColor: colors.border,
              },
            ]}
            value={templateName}
            onChangeText={setTemplateName}
            placeholder="テンプレート名"
            placeholderTextColor={colors.textTertiary}
            autoFocus
          />
          <View style={styles.templateModalActions}>
            <Button
              title="キャンセル"
              onPress={() => setTemplateModalVisible(false)}
              variant="outline"
              size="md"
            />
            <Button
              title="保存"
              onPress={handleConfirmSaveTemplate}
              variant="primary"
              size="md"
              disabled={!templateName.trim()}
            />
          </View>
        </View>
      </Modal>

      <ServingQuantityModal
        visible={editModalVisible}
        onClose={() => {
          setEditModalVisible(false);
          setEditingItem(null);
          setEditingFood(null);
        }}
        item={editingFood ? { type: 'food', food: editingFood } : null}
        onConfirm={handleEditConfirm}
        editMode
        initialAmount={editingItem?.servingAmount}
        initialUnit={editingItem?.servingUnit}
      />

      {copyMealType && profile?.id && (
        <CopyMealModal
          visible={copyMealType !== null}
          profileId={profile.id}
          toDate={selectedDate}
          mealType={copyMealType}
          onClose={() => setCopyMealType(null)}
          onCopied={(count) => {
            setCopyToast(`${count}件の食品をコピーしました`);
            refreshSummary();
          }}
        />
      )}

      <Toast
        message={copyToast ?? ''}
        type="success"
        visible={copyToast !== null}
        onHide={() => setCopyToast(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxxl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: { ...typography.titleLarge },
  dateText: { ...typography.bodyMedium },
  mySubmissionsBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  mySubmissionsBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mySubmissionsBadgeText: {
    ...typography.labelSmall,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 10,
    lineHeight: 12,
  },
  calorieRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.xs,
  },
  calorieItem: { alignItems: 'center' },
  calorieLabel: { ...typography.labelMedium, marginBottom: spacing.xs },
  calorieValue: { ...typography.numberMedium },
  calorieUnit: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  // Phase F-1 — calorie achievement progress bar wrap (macros の上に
  // 配置、 macros と同じ gap 体系で揃え).
  calorieProgressWrap: {
    marginBottom: spacing.md,
  },
  macros: { gap: spacing.sm },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  macroBarContainer: {
    flex: 1,
  },
  macroDiff: {
    ...typography.labelSmall,
    width: 52,
    textAlign: 'right',
  },
  extNutrientToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: undefined,
  },
  extNutrientToggleText: {
    ...typography.labelMedium,
  },
  extNutrientSection: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  extNoTargetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  extNoTargetLabel: {
    ...typography.bodySmall,
  },
  extNoTargetValue: {
    ...typography.bodySmall,
  },
  balanceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  balanceLinkText: {
    ...typography.labelMedium,
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  mealTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mealHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  templateButton: {
    padding: spacing.xs,
  },
  mealTitle: { ...typography.titleSmall },
  mealCalories: { ...typography.labelMedium },
  itemList: { marginBottom: spacing.md },
  foodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 60,
  },
  foodInfo: { flex: 1, marginRight: spacing.md },
  foodName: { ...typography.bodyMedium },
  foodMeta: { ...typography.bodySmall, marginTop: 2 },
  foodPfc: { ...typography.labelSmall, marginTop: 2 },
  mealEmptyState: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.bodySmall,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.xs,
    marginTop: spacing.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  addButtonText: { ...typography.labelMedium },
  templateModalBody: {
    gap: spacing.lg,
  },
  templateModalHint: {
    ...typography.bodyMedium,
  },
  templateNameInput: {
    ...typography.bodyLarge,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  templateModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
});
