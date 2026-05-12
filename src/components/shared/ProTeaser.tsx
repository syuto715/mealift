import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useSubscription } from '../../hooks/useSubscription';

// v1.4 / UI 改善 v1 Phase A-3 — ProTeaser.
//
// ホーム画面末尾に配置する低圧 Plus 訴求カード。 計画書 §5.3 F
// 「Pro 機能ティーザー (末尾): Plus 未加入のみ表示」 を実装。
//
// 表示条件: useSubscription().isFree のみ。 trial / plus / pro
// すべて null を返して何も描画しない (Handbook §15.4「Plus 加入済
// ユーザーに CTA を表示」 禁止)。
//
// ProCard との違い: ProCard は強訴求 (設定画面最上部、 押し)、
// ProTeaser は機能ティーザー (ホーム末尾、 認知獲得)。 ハンドブック
// §9.1 の使い分け matrix と整合。
//
// Patterns applied:
//   #11 visual redundancy — pro tint + icon + 太字 + 本文 + CTA arrow
//   #12 accessibilityRole — button on TouchableOpacity, header on title
//   #13 decorative icon hidden (Pattern paired)

const SUBSCRIPTION_ROUTE = '/(tabs)/settings/subscription';

interface ProTeaserProps {
  // 任意の override message. 省略時は default copy.
  headline?: string;
  body?: string;
  ctaLabel?: string;
}

export function ProTeaser({
  headline = 'Mealift Plus でさらに使いやすく',
  body = 'AI トレーナー無制限 ・ 週次レポート ・ 食品スキャンが解放されます',
  ctaLabel = '14日間 無料で試す',
}: ProTeaserProps = {}) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const sub = useSubscription();

  // Plus 加入済 / Pro / Trial のいずれかなら non-render
  if (!sub.isFree) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push(SUBSCRIPTION_ROUTE)}
      style={[
        styles.card,
        {
          backgroundColor: colors.pro + '12',
          borderColor: colors.pro + '40',
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${headline}。 プラン画面を開く。`}
      testID="pro-teaser"
    >
      <View style={styles.row}>
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: colors.pro + '20' },
          ]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons name="sparkles" size={20} color={colors.pro} />
        </View>
        <View style={styles.textBlock}>
          <Text
            style={[styles.headline, { color: colors.textPrimary }]}
            accessibilityRole="header"
          >
            {headline}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {body}
          </Text>
        </View>
      </View>
      <View style={styles.ctaRow}>
        <Text style={[styles.ctaLabel, { color: colors.pro }]}>{ctaLabel}</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.pro} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  headline: {
    ...typography.titleSmall,
  },
  body: {
    ...typography.bodySmall,
    lineHeight: 18,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  ctaLabel: {
    ...typography.labelLarge,
  },
});
