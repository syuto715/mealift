import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FoodSearchResult } from '../../../src/components/nutrition/FoodSearchResult';
import { useAddMealLog } from '../../../src/hooks/useAddMealLog';
import { useSearchStore } from '../../../src/stores/searchStore';
import { detectMealTypeByTime } from '../../../src/utils/detectMealTypeByTime';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import type { SearchIndexHit } from '../../../src/infra/repositories/searchIndexRepository';

// v1.5 Phase 2.4 Sprint 2.4.1 — Quick log dev preview route.
//
// Reuses the FoodSearchResult composable from Phase 2.3 and wires the
// row-tap onSelect to useAddMealLog, which writes a point-in-time
// snapshot (Drafting 166) into meal_log_items via the existing
// useNutrition.addFood path (signature unchanged — Drafting 161).
//
// The header surfaces the current auto-detected meal slot so the user
// understands which bucket the tap will fill. Explicit slot picking
// lands in a later sprint; one-tap-current-slot is the v1.5 minimum.

const MEAL_TYPE_LABEL: Record<string, string> = {
  breakfast: '朝食',
  lunch: '昼食',
  dinner: '夕食',
  snack: '間食',
};

export default function QuickLogV2Screen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const clear = useSearchStore((s) => s.clear);
  const addMealLog = useAddMealLog();
  const currentMealType = detectMealTypeByTime();

  const handleBack = useCallback(() => {
    clear();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/nutrition');
  }, [clear]);

  const handleSelect = useCallback(
    (hit: SearchIndexHit) => {
      void addMealLog(hit);
    },
    [addMealLog],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBack} hitSlop={8} accessibilityRole="button">
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>クイックログ</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {`タップで${MEAL_TYPE_LABEL[currentMealType]}に追加`}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/nutrition/meal-log-v2')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="ミールログを表示"
        >
          <Ionicons name="clipboard-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
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
  headerText: { flex: 1, gap: spacing.xs / 2 },
  title: { ...typography.titleMedium },
  subtitle: { ...typography.bodySmall },
});
