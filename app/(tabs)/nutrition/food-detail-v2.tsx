import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { FoodDetailView } from '../../../src/components/nutrition/FoodDetailView';
import {
  getDetailByRef,
  type SearchIndexDetail,
  type SearchSourceType,
} from '../../../src/infra/repositories/searchIndexRepository';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';

// v1.5 Phase 2.3 Sprint 2.3.3 — detail view dev preview route.
//
// `ref` query param is `<source_type>:<source_id>` (e.g.,
// `food:mext_01001` or `restaurant_menu:bamiyan_0000`). The route
// fetches the v37 search_index row directly so detail content does
// not depend on restaurant sync (Phase 2.2 helpers still pending).

function parseRef(ref: string | undefined): { sourceType: SearchSourceType; sourceId: string } | null {
  if (!ref) return null;
  const idx = ref.indexOf(':');
  if (idx < 0) return null;
  const sourceType = ref.slice(0, idx);
  const sourceId = ref.slice(idx + 1);
  if (!sourceId) return null;
  if (sourceType !== 'food' && sourceType !== 'restaurant_menu') return null;
  return { sourceType, sourceId };
}

export default function FoodDetailV2Screen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const params = useLocalSearchParams<{ ref: string }>();
  const parsed = parseRef(params.ref);

  const [detail, setDetail] = useState<SearchIndexDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/nutrition/search-v2');
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    if (!parsed) {
      setError('参照 ID が不正です');
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const result = await getDetailByRef(parsed.sourceType, parsed.sourceId);
        if (cancelled) return;
        if (!result) {
          setError('該当する商品が見つかりませんでした');
        } else {
          setDetail(result);
        }
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message ?? 'fetch エラー');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [parsed]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      {loading && (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
      {!loading && error && (
        <View style={styles.state}>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
        </View>
      )}
      {!loading && !error && detail ? (
        <FoodDetailView detail={detail} onBack={handleBack} />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  errorText: { ...typography.bodyMedium },
});
