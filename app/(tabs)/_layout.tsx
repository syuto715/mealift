import { Tabs } from 'expo-router';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../src/theme/tokens';
import { typography } from '../../src/theme/typography';

// v1.5.2 ボトムナビ全面再設計 — 6→5 タブ。
//   ホーム / 食事 / 筋トレ / 進捗 / コーチ   (設定はボトムタブから削除)
// - 「トレーニング」は幅で truncate (「トレーニ…」) するため「筋トレ」へ。
// - 「記録」→「進捗」rename (Syuto 確認済 0-A: body-tracking + 分析が主体の
//   hybrid 画面。weight 入力は data-input としてカード内に残る)。
// - 設定タブは削除するが route は残す: expo-router は (tabs) 配下を自動でタブ化
//   するため、screen 宣言を消すと既定タブとして復活する。`href: null` で
//   タブバーから隠しつつ /(tabs)/settings/* への deep link / router.push は維持。
//   設定への入口はホーム右上アイコン (app/(tabs)/index.tsx) に配線済 (0-B)。
// - 中央「＋」FAB / 記録 action sheet は v1.6 へ defer (本ターン未実装)。
//
// 選択 UI: 選択中は薄い青ピル背景 + 塗りアイコン + 青、非選択は線アイコン +
// やや濃いグレー (textSecondary)。最終アイコン/配色微調整は 6/1 実機。
export default function TabLayout() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const insets = useSafeAreaInsets();

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
      {/* 順序: ホーム / 食事 / 筋トレ / 進捗 / コーチ
          (JSX の Screen 順 = タブ表示順) */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'ホーム',
          // TODO: 実機で最終アイコン確認
          tabBarIcon: tabIcon('home', 'home-outline'),
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: '食事',
          tabBarIcon: tabIcon('restaurant', 'restaurant-outline'),
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: '筋トレ',
          tabBarIcon: tabIcon('barbell', 'barbell-outline'),
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
});
