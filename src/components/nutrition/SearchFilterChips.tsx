import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { useSearchStore } from '../../stores/searchStore';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import type {
  SearchSourceLabel,
  SearchSourceType,
} from '../../infra/repositories/searchIndexRepository';

// v1.5 Phase 2.3 Sprint 2.3.3 — filter chip row.
//
// Two axes: source type (食品 / レストラン) and source label (公式 /
// AI 推定). Empty selection = "no filter on this axis" so the
// initial render shows the full corpus.

const SOURCE_TYPE_CHIPS: Array<{ key: SearchSourceType; label: string }> = [
  { key: 'food', label: '食品' },
  { key: 'restaurant_menu', label: 'レストラン' },
];

const SOURCE_LABEL_CHIPS: Array<{ key: SearchSourceLabel; label: string }> = [
  { key: 'official_disclosure', label: '公式' },
  { key: 'ai_estimate', label: 'AI 推定' },
];

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function Chip({ label, selected, onPress }: ChipProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  return (
    <TouchableOpacity
      onPress={onPress}
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
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function SearchFilterChips() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const filters = useSearchStore((s) => s.filters);
  const toggleSourceType = useSearchStore((s) => s.toggleSourceType);
  const toggleSourceLabel = useSearchStore((s) => s.toggleSourceLabel);
  const toggleFavoritesOnly = useSearchStore((s) => s.toggleFavoritesOnly);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={[styles.heading, { color: colors.textTertiary }]}>種類</Text>
        <View style={styles.chipRow}>
          {SOURCE_TYPE_CHIPS.map((chip) => (
            <Chip
              key={chip.key}
              label={chip.label}
              selected={filters.sourceTypes.includes(chip.key)}
              onPress={() => toggleSourceType(chip.key)}
            />
          ))}
        </View>
      </View>
      <View style={styles.row}>
        <Text style={[styles.heading, { color: colors.textTertiary }]}>ソース</Text>
        <View style={styles.chipRow}>
          {SOURCE_LABEL_CHIPS.map((chip) => (
            <Chip
              key={chip.key}
              label={chip.label}
              selected={filters.sourceLabels.includes(chip.key)}
              onPress={() => toggleSourceLabel(chip.key)}
            />
          ))}
          <Chip
            label="★ お気に入りのみ"
            selected={filters.favoritesOnly}
            onPress={toggleFavoritesOnly}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heading: { ...typography.labelSmall, minWidth: 40 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, flex: 1 },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: { ...typography.labelMedium },
});
