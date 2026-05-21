import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../../src/components/ui';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';

// v1.5 Phase 2.4 Sprint 2.4.6 — dev preview navigation hub.
//
// Phase 2.3 + 2.4 dev preview routes (Drafting 161 production safety
// + dev preview parallel path) accumulate to four screens that have
// no production entry point yet. This hub mounts them as a single
// list so Syuto can drive the device verification pass from one
// place. The route itself is also a dev preview — production
// `/nutrition/index.tsx` doesn't link here either; Sprint 2.3.7 (the
// post-device-verify retrofit turn) will decide whether to expose
// any of these as the canonical UX.
//
// The verification hints below mirror the 10-item checklist captured
// in the Sprint 2.3.6 hand-off so the device session has its
// expected outcomes inline.

interface PreviewRoute {
  pathname: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
}

const ROUTES: PreviewRoute[] = [
  {
    pathname: '/(tabs)/nutrition/search-v2',
    icon: 'search',
    title: '検索 v2 (Search)',
    subtitle: '統合検索 + FTS5 + kuromoji + ★ + sort + infinite scroll',
  },
  {
    pathname: '/(tabs)/nutrition/quick-log-v2',
    icon: 'flash',
    title: 'クイックログ v2 (Quick log)',
    subtitle: '時間帯に応じた meal type 自動振り分け + snapshot insert',
  },
  {
    pathname: '/(tabs)/nutrition/meal-log-v2',
    icon: 'clipboard',
    title: 'ミールログ v2 (Timeline)',
    subtitle: '今日 / 昨日 / 今週 表示 + portion 変更 + 削除',
  },
];

const VERIFY_HINTS: string[] = [
  '「らーめん」 検索 → cross-script match (ラーメン hit)',
  '「焼鳥」 検索 → kuromoji yomigana で 「やきとり」 hit',
  '結果の ★ ボタン → お気に入りトグル + リスト invalidation',
  '結果を Quick log で挿入 → 「よく使う」 sort で上位に浮上',
  'Meal log timeline → 行をタップ → portion 変更 / 削除 sheet',
];

export default function V2HubScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

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
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>v2 プレビューハブ</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Phase 2.3 + 2.4 dev preview routes
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
          ルート
        </Text>
        {ROUTES.map((r) => (
          <TouchableOpacity
            key={r.pathname}
            onPress={() => router.push(r.pathname as Parameters<typeof router.push>[0])}
            accessibilityRole="button"
            accessibilityLabel={r.title}
          >
            <Card style={styles.routeCard}>
              <View style={[styles.iconWrap, { backgroundColor: colors.primary + '24' }]}>
                <Ionicons name={r.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.routeText}>
                <Text style={[styles.routeTitle, { color: colors.textPrimary }]}>{r.title}</Text>
                <Text style={[styles.routeSubtitle, { color: colors.textSecondary }]}>
                  {r.subtitle}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </Card>
          </TouchableOpacity>
        ))}

        <Text style={[styles.sectionLabel, { color: colors.textTertiary, marginTop: spacing.lg }]}>
          検証ヒント
        </Text>
        <Card style={styles.hintCard}>
          {VERIFY_HINTS.map((hint, idx) => (
            <View key={hint} style={[styles.hintRow, idx > 0 && { marginTop: spacing.xs }]}>
              <Text style={[styles.hintIndex, { color: colors.textTertiary }]}>{`${idx + 1}.`}</Text>
              <Text style={[styles.hintText, { color: colors.textSecondary }]}>{hint}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
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
  scroll: { padding: spacing.md, gap: spacing.sm },
  sectionLabel: { ...typography.labelSmall, marginBottom: spacing.xs },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeText: { flex: 1, gap: spacing.xs / 2 },
  routeTitle: { ...typography.titleSmall },
  routeSubtitle: { ...typography.bodySmall },
  hintCard: { padding: spacing.md, gap: spacing.xs },
  hintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  hintIndex: { ...typography.bodySmall, fontVariant: ['tabular-nums'], minWidth: 18 },
  hintText: { ...typography.bodySmall, flex: 1, lineHeight: 18 },
});
