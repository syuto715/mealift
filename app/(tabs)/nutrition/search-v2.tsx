import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FoodSearchResult } from '../../../src/components/nutrition/FoodSearchResult';
import { useSearchStore } from '../../../src/stores/searchStore';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import type { SearchIndexHit } from '../../../src/infra/repositories/searchIndexRepository';

// v1.5 Phase 2.3 Sprint 2.3.2 — unified-search dev preview route
// (Drafting 161 — production safety + dev preview parallel path).
//
// Mounts the FoodSearchResult composable directly so Syuto can
// exercise the new FTS5 + bm25 + kuromoji pipeline on a real
// device without touching the production `nutrition/search.tsx`
// (530 lines, daily-driver path). Sprint 2.3.3 will decide whether
// to retrofit production or keep the v2 path as a parallel
// "advanced search" entry point.

export default function SearchV2Screen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const clear = useSearchStore((s) => s.clear);

  const handleBack = useCallback(() => {
    clear();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/nutrition');
  }, [clear]);

  const handleSelect = useCallback((hit: SearchIndexHit) => {
    // Sprint 2.3.3 wires this into the detail screen + addFood
    // backend bridge. For Sprint 2.3.2 we surface the hit in a
    // dev console so the row tap is verifiable end-to-end.
    console.log('[search-v2] selected', {
      sourceType: hit.sourceType,
      sourceId: hit.sourceId,
      name: hit.nameJa,
      brand: hit.brand,
      label: hit.sourceLabel,
    });
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBack} hitSlop={8} accessibilityRole="button">
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>統合検索 (dev preview)</Text>
        <View style={styles.headerSpacer} />
      </View>
      <FoodSearchResult onSelect={handleSelect} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  title: { ...typography.titleMedium, flex: 1 },
  headerSpacer: { width: 24 },
});
