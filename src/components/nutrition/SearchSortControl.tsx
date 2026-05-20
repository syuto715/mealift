import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme } from 'react-native';
import { useSearchStore } from '../../stores/searchStore';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import type { SearchSortKey } from '../../infra/repositories/searchIndexRepository';

// v1.5 Phase 2.3 Sprint 2.3.4 — sort control (horizontal-scroll chip row).
//
// Five sort options laid out on a single horizontal-scroll axis;
// "関連度" (bm25) is the default and stays leftmost so the user
// sees the canonical option first. Vertical-stack and dropdown
// variants were considered — chips win on tap-discoverability and
// match the existing SearchFilterChips visual language.

const SORT_OPTIONS: Array<{ key: SearchSortKey; label: string }> = [
  { key: 'relevance', label: '関連度' },
  { key: 'favorite_first', label: '★ 優先' },
  { key: 'kcal_asc', label: 'kcal ↑' },
  { key: 'kcal_desc', label: 'kcal ↓' },
  { key: 'protein_desc', label: 'タンパク質 ↓' },
  { key: 'use_count_desc', label: 'よく使う' },
];

export function SearchSortControl() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const sort = useSearchStore((s) => s.sort);
  const setSort = useSearchStore((s) => s.setSort);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {SORT_OPTIONS.map((opt) => {
        const selected = sort === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            onPress={() => setSort(opt.key)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? colors.primary : colors.surfaceSecondary,
                borderColor: selected ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.chipLabel,
                { color: selected ? colors.surface : colors.textSecondary },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: { ...typography.labelMedium },
});
