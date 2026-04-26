import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Modal as RNModal,
  SafeAreaView as RNSafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '../ui';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { formatServingHint } from '../../constants/servingUnits';
import type { Food } from '../../types/food';
import { searchFoods as defaultSearchFoods } from '../../infra/repositories/foodRepository';

// IngredientPicker — modal that lets the user search the foods table
// (八訂DB + manual_seed) and tap one row to emit it. Single-select per
// open: tapping a row emits onSelectFood and the parent decides what to
// do next (typically open a serving-amount modal). Multi-ingredient
// recipes are built by reopening the picker repeatedly.
//
// Standalone + testable design:
//   - searchFn is injectable. Defaults to the live repository, but tests
//     and future screens can swap in a stub or a different data source
//     (e.g. only generic_foods, or favorites only).
//   - Component owns its own query/results state. The parent only
//     toggles visibility and reacts to onSelectFood.
//   - No global stores or hooks beyond useState/useEffect, so it's safe
//     to mount in any screen.

export type FoodSearchFn = (query: string, limit: number) => Promise<Food[]>;

export interface IngredientPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectFood: (food: Food) => void;
  /** Override the default repository search — used by tests and future
   *  screens that want a scoped pool (e.g. user favorites only). */
  searchFn?: FoodSearchFn;
  /** Max results per search call. Defaults to 30. */
  resultLimit?: number;
  /** Debounce window for the query → search call. Defaults to 250ms. */
  debounceMs?: number;
}

export function IngredientPicker({
  visible,
  onClose,
  onSelectFood,
  searchFn = defaultSearchFoods,
  resultLimit = 30,
  debounceMs = 250,
}: IngredientPickerProps): React.ReactElement {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);

  // Reset query whenever the picker opens fresh, so a previous session's
  // search text doesn't bleed across opens.
  useEffect(() => {
    if (visible) {
      setQuery('');
      setResults([]);
    }
  }, [visible]);

  // Debounced search. The cancellation flag prevents a slow response
  // from clobbering newer results when the user types fast.
  useEffect(() => {
    if (!visible) return;
    if (query.length < 1) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const next = await searchFn(query, resultLimit);
        if (!cancelled) setResults(next);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, visible, searchFn, resultLimit, debounceMs]);

  const renderRow = ({ item }: { item: Food }) => (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={() => onSelectFood(item)}
      activeOpacity={0.7}
      testID={`ingredient-picker-row-${item.id}`}
    >
      <View style={styles.rowInfo}>
        <Text
          style={[styles.rowName, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {item.nameJa}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
          {formatServingHint(
            item.servingUnit,
            item.servingSizeG,
            Math.round(item.caloriesPerServing),
          )}
        </Text>
      </View>
      <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
    </TouchableOpacity>
  );

  return (
    <RNModal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <RNSafeAreaView
        style={[styles.flex1, { backgroundColor: colors.background }]}
      >
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={onClose} hitSlop={8} testID="ingredient-picker-close">
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
                value={query}
                onChangeText={setQuery}
              />
            </View>
          </View>
        </View>
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
              {query.length > 0 ? '該当する食品が見つかりません' : '食品名を入力して検索'}
            </Text>
          }
        />
      </RNSafeAreaView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { ...typography.titleMedium },
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
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowInfo: { flex: 1, marginRight: spacing.md },
  rowName: { ...typography.bodyMedium },
  rowMeta: { ...typography.bodySmall, marginTop: 2 },
  emptyHint: {
    ...typography.bodyMedium,
    textAlign: 'center',
    marginTop: spacing.xxxxl,
  },
});
