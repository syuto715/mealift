import React, { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card } from '../../../src/components/ui';
import { Food } from '../../../src/types/food';
import {
  getUserAddedFoods,
  softDeleteUserFood,
} from '../../../src/infra/repositories/foodRepository';

export default function UserFoodsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const [foods, setFoods] = useState<Food[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadFoods = useCallback(async () => {
    const data = await getUserAddedFoods(200);
    setFoods(data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadFoods();
  }, [loadFoods]);

  useFocusEffect(
    useCallback(() => {
      loadFoods();
    }, [loadFoods]),
  );

  const handleEdit = useCallback((food: Food) => {
    router.push({
      pathname: '/(tabs)/nutrition/food-submit',
      params: { foodId: food.id },
    });
  }, []);

  const handleDelete = useCallback(
    (food: Food) => {
      Alert.alert(
        '削除確認',
        `「${food.nameJa}」を削除しますか？\n既存の食事記録はそのまま残ります。`,
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '削除',
            style: 'destructive',
            onPress: async () => {
              await softDeleteUserFood(food.id);
              loadFoods();
            },
          },
        ],
      );
    },
    [loadFoods],
  );

  const handleAdd = useCallback(() => {
    router.push('/(tabs)/nutrition/food-submit');
  }, []);

  if (!loaded) return null;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          自分が追加した食品
        </Text>
        <TouchableOpacity onPress={handleAdd} style={styles.headerBtn}>
          <Ionicons name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          この端末内に保存された食品です。修正や削除をしても既存の食事記録には影響しません。
        </Text>

        {foods.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons
              name="restaurant-outline"
              size={48}
              color={colors.textTertiary}
            />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
              追加した食品はありません
            </Text>
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
              食事の追加画面の検索で「+ この食品を追加」から登録できます。
            </Text>
          </View>
        )}

        {foods.length > 0 && (
          <Card padding="none">
            {foods.map((food, index) => (
              <View
                key={food.id}
                style={[
                  styles.row,
                  {
                    borderBottomColor: colors.border,
                    borderBottomWidth: index < foods.length - 1 ? 0.5 : 0,
                  },
                ]}
              >
                <View style={styles.rowInfo}>
                  <Text
                    style={[styles.rowName, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {food.nameJa}
                  </Text>
                  {food.brand && (
                    <Text
                      style={[styles.rowBrand, { color: colors.textTertiary }]}
                      numberOfLines={1}
                    >
                      {food.brand}
                    </Text>
                  )}
                  <Text
                    style={[styles.rowMeta, { color: colors.textSecondary }]}
                  >
                    {food.caloriesPerServing} kcal / {food.servingSizeG}
                    {food.servingUnit}
                  </Text>
                  <Text
                    style={[styles.rowPfc, { color: colors.textTertiary }]}
                  >
                    P {food.proteinG}g・F {food.fatG}g・C {food.carbG}g
                  </Text>
                </View>
                <View style={styles.rowActions}>
                  <TouchableOpacity
                    onPress={() => handleEdit(food)}
                    style={styles.actionBtn}
                  >
                    <Ionicons
                      name="pencil-outline"
                      size={18}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(food)}
                    style={styles.actionBtn}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={colors.error}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  headerBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { ...typography.titleMedium },
  scroll: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxxl,
  },
  hint: {
    ...typography.bodySmall,
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
  },
  emptyTitle: { ...typography.titleSmall },
  emptyText: {
    ...typography.bodySmall,
    textAlign: 'center',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowName: { ...typography.bodyLarge },
  rowBrand: { ...typography.bodySmall },
  rowMeta: { ...typography.bodySmall, marginTop: 2 },
  rowPfc: { ...typography.bodySmall },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
