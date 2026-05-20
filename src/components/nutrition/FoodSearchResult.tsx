import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { SearchFilterChips } from './SearchFilterChips';
import { SearchSortControl } from './SearchSortControl';
import { EmptyStateView } from './EmptyStateView';
import { FavoriteToggleButton } from './FavoriteToggleButton';
import { computeEmptyState } from '../../utils/computeEmptyState';
import { useUIStore } from '../../stores/uiStore';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useSearchStore } from '../../stores/searchStore';
import { useSearchFoodItems } from '../../hooks/useSearchFoodItems';
import type {
  SearchIndexHit,
  SearchSourceLabel,
} from '../../infra/repositories/searchIndexRepository';

// v1.5 Phase 2.3 Sprint 2.3.2 — unified search composable.
//
// Embeddable in any nutrition screen; the Sprint 2.3.2 dev preview
// route `/nutrition/search-v2` mounts it directly. Production
// `nutrition/search.tsx` is intentionally untouched in this sprint
// (Drafting 161 — production safety + dev preview parallel path).
//
// Drafting 152 activation: each result row carries a small badge
// reflecting `source_label` (official / AI-estimate / package-label
// / manual) so the user understands the provenance at a glance.

type BadgeColorKey = 'success' | 'warning' | 'primary' | 'textTertiary';

interface BadgeStyle {
  label: string;
  bgKey: BadgeColorKey;
}

const SOURCE_LABEL_BADGE: Record<SearchSourceLabel, BadgeStyle> = {
  official_disclosure: { label: '公式', bgKey: 'success' },
  ai_estimate: { label: 'AI 推定', bgKey: 'warning' },
  package_label: { label: 'パッケージ', bgKey: 'primary' },
  manual: { label: '手動', bgKey: 'textTertiary' },
};

interface FoodSearchResultProps {
  /** Tap handler — typically pushes to the detail route. */
  onSelect?: (hit: SearchIndexHit) => void;
  /** Hide the search input (when a parent owns the input). */
  hideInput?: boolean;
  /** Hide the filter chip row. */
  hideFilters?: boolean;
  /** Hide the sort control. */
  hideSort?: boolean;
}

export function FoodSearchResult({
  onSelect,
  hideInput = false,
  hideFilters = false,
  hideSort = false,
}: FoodSearchResultProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const clear = useSearchStore((s) => s.clear);
  const filters = useSearchStore((s) => s.filters);
  const setFilters = useSearchStore((s) => s.setFilters);
  const showToast = useUIStore((s) => s.showToast);
  const {
    items,
    isFetching,
    isFetchingNextPage,
    isError,
    hasNextPage,
    fetchNextPage,
    refetch,
    debouncedQuery,
  } = useSearchFoodItems();

  const emptyState = computeEmptyState({
    query: debouncedQuery,
    isError,
    isFetching,
    itemCount: items.length,
  });
  const hasActiveFilters =
    filters.sourceTypes.length > 0 || filters.sourceLabels.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {!hideInput && (
        <View style={styles.inputWrap}>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="メニュー / 食品検索..."
            autoFocus
            returnKeyType="search"
            rightIcon={
              query.length > 0 ? (
                <TouchableOpacity onPress={clear} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
              ) : null
            }
          />
        </View>
      )}

      {!hideFilters && <SearchFilterChips />}
      {!hideSort && <SearchSortControl />}

      {emptyState ? (
        <EmptyStateView
          state={emptyState}
          query={debouncedQuery}
          hasFilters={hasActiveFilters}
          onClearFilters={() =>
            setFilters({ sourceTypes: [], sourceLabels: [], favoritesOnly: false })
          }
          onAIFallback={() => {
            // Sprint 2.3.5 — Phase 2.5 forwarding stub. Drafting 152's
            // estimate-nutrition-vision EF + aiNutritionService client
            // already exist; this turn just surfaces the entry point so
            // Syuto can verify the empty-state copy. Phase 2.5 will swap
            // the toast for the actual Gemini-Vision flow.
            showToast('AI 推定機能は Phase 2.5 で提供予定です', 'info');
            console.log('[search-v2] AI fallback CTA query=', debouncedQuery);
          }}
          onRetry={() => refetch()}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.sourceType}:${item.sourceId}`}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <SearchResultRow item={item} onSelect={onSelect} />
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
          )}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

interface SearchResultRowProps {
  item: SearchIndexHit;
  onSelect?: (hit: SearchIndexHit) => void;
}

function SearchResultRow({ item, onSelect }: SearchResultRowProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const badge = SOURCE_LABEL_BADGE[item.sourceLabel] ?? SOURCE_LABEL_BADGE.manual;
  const badgeBg = colors[badge.bgKey] + '24';
  const badgeText = colors[badge.bgKey];

  return (
    <TouchableOpacity
      onPress={() => onSelect?.(item)}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${item.nameJa}${item.brand ? ` (${item.brand})` : ''}`}
    >
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>
            {item.nameJa}
          </Text>
          <View style={styles.metaRow}>
            {item.brand ? (
              <Text style={[styles.brand, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.brand}
              </Text>
            ) : null}
            <Badge label={badge.label} color={badgeBg} textColor={badgeText} size="sm" />
          </View>
        </View>
        <FavoriteToggleButton
          target={{ sourceType: item.sourceType, sourceId: item.sourceId }}
          initialIsFavorite={item.isFavorite}
          size="sm"
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inputWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  stateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
    gap: spacing.sm,
  },
  stateText: { ...typography.bodyMedium },
  listContent: { paddingVertical: spacing.sm },
  row: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowText: { flex: 1, gap: spacing.xs / 2 },
  name: { ...typography.bodyMedium, fontWeight: '600' },
  brand: { ...typography.bodySmall },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: spacing.md },
  footerLoader: { paddingVertical: spacing.md, alignItems: 'center' },
});
