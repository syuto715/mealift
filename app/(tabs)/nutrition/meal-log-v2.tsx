import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SegmentedControl } from '../../../src/components/ui';
import { MealLogTimelineView } from '../../../src/components/nutrition/MealLogTimelineView';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import type { TimelineScope } from '../../../src/utils/mealLogTimelineRange';

// v1.5 Phase 2.4 Sprint 2.4.4 — meal log timeline dev preview route.
//
// Production `nutrition/index.tsx` already owns the canonical
// timeline (ServingQuantityModal + CopyMealModal + DateNavigator);
// this preview mounts the new read-side composable in isolation so
// Syuto can verify the Phase 2.4 path on device before any
// retrofit decisions land (Drafting 161 production safety).

const SEGMENTS = [
  { value: 'today', label: '今日' },
  { value: 'yesterday', label: '昨日' },
  { value: 'week', label: '今週' },
] as const;

export default function MealLogV2Screen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const [scope, setScope] = useState<TimelineScope>('today');

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/nutrition');
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBack} hitSlop={8} accessibilityRole="button">
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>ミールログ (dev preview)</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.controlWrap}>
        <SegmentedControl
          segments={SEGMENTS}
          selectedValue={scope}
          onValueChange={(v) => setScope(v as TimelineScope)}
        />
      </View>
      <MealLogTimelineView scope={scope} />
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
  controlWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
});
