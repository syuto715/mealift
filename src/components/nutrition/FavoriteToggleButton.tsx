import React from 'react';
import { TouchableOpacity, useColorScheme, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFavorite } from '../../hooks/useFavorite';
import type { FavoriteRef } from '../../utils/searchFavoriteQueryKey';
import { getColors } from '../../theme/tokens';
import { spacing } from '../../theme/spacing';

// v1.5 Phase 2.4 Sprint 2.4.2 — ★/☆ swap button.
//
// Receives the search-result reference (sourceType + sourceId) and
// uses `useFavorite` for both the live read of favorite state and the
// toggle mutation. `initialIsFavorite` is an optional fast-path:
// when the caller already has the value from a search_index LEFT
// JOIN, we render the icon optimistically while the dedicated query
// resolves to avoid a flicker between mount and first query result.

const ICON_SIZE = { sm: 18, md: 22, lg: 28 } as const;

interface FavoriteToggleButtonProps {
  /** (sourceType, sourceId) tuple — named `target` to avoid the React `ref` collision. */
  target: FavoriteRef;
  size?: keyof typeof ICON_SIZE;
  initialIsFavorite?: boolean;
}

export function FavoriteToggleButton({
  target,
  size = 'sm',
  initialIsFavorite,
}: FavoriteToggleButtonProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const { isFavorite, isLoading, isPending, toggle } = useFavorite(target);

  // Until the dedicated query lands, fall back to whatever the parent
  // gave us (typically from the search result row). Avoids a momentary
  // ☆ flash on already-favorited rows.
  const display = isLoading && initialIsFavorite !== undefined ? initialIsFavorite : isFavorite;

  return (
    <TouchableOpacity
      onPress={toggle}
      disabled={isPending}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: display, disabled: isPending }}
      accessibilityLabel={display ? 'お気に入りから外す' : 'お気に入りに追加'}
      style={styles.touch}
    >
      <Ionicons
        name={display ? 'star' : 'star-outline'}
        size={ICON_SIZE[size]}
        color={display ? colors.warning : colors.textTertiary}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touch: { padding: spacing.xs },
});
