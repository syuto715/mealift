import React from 'react';
import { View, StyleSheet, ActivityIndicator, Text, useColorScheme } from 'react-native';
import { EmptyState } from '../shared/EmptyState';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import type { SearchEmptyState } from '../../utils/computeEmptyState';

// v1.5 Phase 2.3 Sprint 2.3.5 — empty-state view for the unified
// search composable.
//
// Composes the four terminal UI states from a single shape so
// FoodSearchResult.tsx can dispatch on the classifier output
// without inlining four different `<View>` trees. Each state
// reuses the v1.4 shared/EmptyState primitive (icon + title +
// description + 0-2 CTAs) so the visual language matches the
// rest of the empty-state surfaces in the app — except for the
// 'loading' state, which is a centred spinner (EmptyState is
// designed for terminal copy, not transient progress).
//
// AI fallback CTA (no_results state):
//   - Sprint 2.3.5 is the Phase 2.5 forwarding stub only — tapping
//     surfaces a toast via useUIStore.showToast and logs the query
//     for telemetry. The wire to estimate-nutrition-vision EF
//     lands in Phase 2.5.

interface EmptyStateViewProps {
  state: SearchEmptyState;
  query?: string;
  hasFilters?: boolean;
  onClearFilters?: () => void;
  onAIFallback?: () => void;
  onRetry?: () => void;
}

export function EmptyStateView({
  state,
  query,
  hasFilters,
  onClearFilters,
  onAIFallback,
  onRetry,
}: EmptyStateViewProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  if (state === 'loading') {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>検索中…</Text>
      </View>
    );
  }

  if (state === 'initial') {
    return (
      <EmptyState
        icon="search-outline"
        title="メニュー / 食品を検索"
        description="例: 「らーめん」「親子丼」「カレー」「おにぎり」"
        testID="search-empty-initial"
      />
    );
  }

  if (state === 'error') {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="検索でエラーが発生しました"
        description="ネットワーク状況を確認の上、もう一度お試しください。"
        primaryAction={onRetry ? { label: '再試行', onPress: onRetry, testID: 'search-error-retry' } : undefined}
        testID="search-empty-error"
      />
    );
  }

  // state === 'no_results'
  const description = hasFilters
    ? `「${query ?? ''}」に該当する結果がありません。フィルターを外して再検索できます。`
    : `「${query ?? ''}」に該当する結果がありません。AI に料理を推定させることもできます。`;

  return (
    <EmptyState
      icon="file-tray-outline"
      title="該当する結果がありません"
      description={description}
      primaryAction={
        onAIFallback
          ? { label: 'AI に推定させる', onPress: onAIFallback, testID: 'search-no-results-ai' }
          : undefined
      }
      secondaryAction={
        hasFilters && onClearFilters
          ? { label: 'フィルターを外す', onPress: onClearFilters, testID: 'search-no-results-clear-filters' }
          : undefined
      }
      testID="search-empty-no-results"
    />
  );
}

const styles = StyleSheet.create({
  loadingBox: {
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: { ...typography.bodyMedium },
});
