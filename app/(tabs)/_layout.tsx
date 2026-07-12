import { Tabs, router, useSegments } from 'expo-router';
import { View, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getColors, shadow } from '../../src/theme/tokens';
import { typography } from '../../src/theme/typography';
import { getISODate } from '../../src/utils/format';

// S2-B ボトムナビ再定義 — 5 タブ → 4 タブ + 中央「＋」記録 FAB。
//   ホーム / 筋トレ / [＋] / 進捗 / コーチ
// - 食事タブは廃止 (href: null)。中身の栄養バランス詳細 (nutrition/balance) は
//   ホームのカロリーカード「内訳 >」から遷移する導線を維持。nutrition/* への
//   cross-group 参照 (settings/user-foods・barcode・add-food 等 8 箇所) は
//   route が残るため全パス無変更で生存する (settings タブと同じ href: null 方式。
//   経緯コメントは下記 settings の項を参照)。
// - 中央 FAB は custom tabBarButton: タブ遷移せず既存の記録フロー /add-food
//   (root fullScreenModal・撮影優先) を現在時刻の mealType で開く。ホーム下部
//   CTA と同一挙動 (v6 記録シートは未実装のため、その実装済み代替が /add-food)。
// - 設定タブは従来どおり href: null で隠す (入口はホーム右上アイコン)。
//   expo-router は (tabs) 配下を自動でタブ化するため、screen 宣言を消すと
//   既定タブとして復活する。`href: null` でタブバーから隠しつつ deep link /
//   router.push は維持、が確立済みパターン。
//
// 選択 UI: 選択中は薄い青ピル背景 + 塗りアイコン + 青、非選択は線アイコン +
// やや濃いグレー (textSecondary)。
export default function TabLayout() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const insets = useSafeAreaInsets();

  // S3-1-A 集中モード — ワークアウトセッション表示中はタブバー (FAB 含む) を
  // 非表示にし、タブ遷移によるセッション離脱経路を構造的に塞ぐ。route 判定は
  // useSegments (onboarding/_layout.tsx と同型の前例)。セッション終了/破棄で
  // training へ pop すると segments が変わり自動復帰する。
  const segments = useSegments();
  const inWorkoutSession = segments[segments.length - 1] === 'session';

  // Pill-backed icon: filled glyph + 薄青ピル when focused, outline + gray else.
  // The active/inactive *tint* (icon + label color) is driven by
  // tabBarActiveTintColor / tabBarInactiveTintColor below, so `color` already
  // carries the right value; the pill only adds the focused background.
  const tabIcon =
    (filled: keyof typeof Ionicons.glyphMap, outline: keyof typeof Ionicons.glyphMap) =>
    ({ color, focused }: { color: string; focused: boolean }) => (
      <View
        style={[
          styles.iconPill,
          focused && { backgroundColor: colors.primary + '1A' },
        ]}
      >
        <Ionicons name={focused ? filled : outline} size={22} color={color} />
      </View>
    );

  // 中央 FAB — タブ遷移を行わず記録フローを開く。mealType は現在時刻から決定
  // (ホーム下部 CTA と同じ規則)。date は常に今日 (グローバル導線のため、ホームの
  // selectedDate には連動しない)。
  const openRecordFlow = () => {
    const h = new Date().getHours();
    const mealType = h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
    router.push({ pathname: '/add-food', params: { mealType, date: getISODate() } });
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        // 非選択は textTertiary (薄すぎ) ではなく textSecondary でやや濃いグレー。
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom + 4,
          paddingTop: 6,
          // 集中モード: session 表示中はバーごと消す (display は
          // react-navigation が公式にサポートする動的切替手段)
          ...(inWorkoutSession ? { display: 'none' as const } : null),
        },
        tabBarLabelStyle: {
          ...typography.labelSmall,
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarItemStyle: {
          paddingTop: 2,
        },
      }}
    >
      {/* 順序: ホーム / 筋トレ / [＋記録 FAB] / 進捗 / コーチ
          (JSX の Screen 順 = タブ表示順) */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'ホーム',
          tabBarIcon: tabIcon('home', 'home-outline'),
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: '筋トレ',
          tabBarIcon: tabIcon('barbell', 'barbell-outline'),
        }}
      />
      {/* 中央 FAB — dummy route (app/(tabs)/record.tsx) の枠を custom button で
          差し替え。既定の onPress (タブ遷移) は呼ばず /add-food を開くだけ。 */}
      <Tabs.Screen
        name="record"
        options={{
          title: '',
          tabBarButton: () => (
            <View style={styles.fabSlot} pointerEvents="box-none">
              <TouchableOpacity
                onPress={openRecordFlow}
                activeOpacity={0.8}
                style={[
                  styles.fab,
                  shadow.md,
                  { backgroundColor: colors.primary, borderColor: colors.surface },
                ]}
                accessibilityRole="button"
                accessibilityLabel="食事を記録"
                accessibilityHint="食品追加画面を開きます"
                testID="tab-record-fab"
              >
                <Ionicons name="add" size={30} color={colors.onPrimary} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: '進捗',
          // 折れ線グラフ
          tabBarIcon: tabIcon('analytics', 'analytics-outline'),
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'コーチ',
          tabBarIcon: tabIcon('chatbubble-ellipses', 'chatbubble-ellipses-outline'),
        }}
      />
      {/* 食事 — S2-B でタブ廃止。route は維持 (nutrition/balance = ホーム内訳の
          遷移先、my-dish / food-submit / my-submissions 等は他画面から push)。 */}
      <Tabs.Screen
        name="nutrition"
        options={{
          href: null,
        }}
      />
      {/* 設定 — タブバーから隠す (href: null) が route は維持。
          入口はホーム右上アイコン。 */}
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconPill: {
    paddingHorizontal: 16,
    paddingVertical: 3,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // FAB は他タブと同じ枠幅 (flex:1) の中で少し浮かせる。バー高 56 に対し
  // -14 の持ち上げ + surface 色の縁取りで「浮いた +」に見せる。
  fabSlot: {
    flex: 1,
    alignItems: 'center',
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -14,
  },
});
