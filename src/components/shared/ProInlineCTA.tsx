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
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useSubscription } from '../../hooks/useSubscription';

// v1.4 / UI 改善 v1 Phase A-3 — ProInlineCTA.
//
// 文中・ボタン直下に置く inline 訴求リンク。 計画書 §5.1 B-4
// 「Plus なら無制限で生成 →」 等。 ProCard / ProTeaser よりさらに
// 軽い訴求、 user 自然な行動の付帯情報として配置。
//
// 表示条件: useSubscription().isFree && !isTrial の場合のみ。
// Trial 中も Plus へ転換訴求は OK だが、 「あと N 日」 訴求と
// 重複して noisy になるので Trial 中は非表示にする (ハンドブック
// §9.1 / §9.3 押し売り回避)。
//
// Variant:
//   - `variant="link"` (default): テキストリンク風 (「Plus なら無制限 →」)
//   - `variant="card"`: 小さい card 風 (icon + text、 ボタン直下)

const SUBSCRIPTION_ROUTE = '/(tabs)/settings/subscription';

interface ProInlineCTAProps {
  // CTA 本体 message。 short copy 推奨 (1 行内収まり)。
  label?: string;
  // 訴求 variant。 link = text-only、 card = icon+text framed.
  variant?: 'link' | 'card';
  // free + trial 両方に出したいケース (例: AI generator 残量 0 時の
  // 即時 upgrade 訴求)。 default は free のみ。
  showOnTrial?: boolean;
}

export function ProInlineCTA({
  label = 'Plus なら無制限 →',
  variant = 'link',
  showOnTrial = false,
}: ProInlineCTAProps = {}) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const sub = useSubscription();

  // Free のみ表示が default、 showOnTrial で trial も含める
  if (sub.isPlus || sub.isPro) return null;
  if (sub.isTrial && !showOnTrial) return null;

  if (variant === 'card') {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push(SUBSCRIPTION_ROUTE)}
        style={[
          styles.card,
          {
            backgroundColor: colors.pro + '12',
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label}。 プラン画面を開く。`}
        testID="pro-inline-cta-card"
      >
        {/* Codex pass 1 Important — sparkles icon (decorative, 16px)
            stays colors.pro (icon-only 3:1 OK), but the text label
            uses colors.proText (#7B5A1F, ~6.2:1 on near-white tint)
            for WCAG AA. */}
        <Ionicons
          name="sparkles"
          size={16}
          color={colors.pro}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <Text style={[styles.cardLabel, { color: colors.proText }]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  // variant === 'link'
  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={() => router.push(SUBSCRIPTION_ROUTE)}
      style={styles.link}
      accessibilityRole="button"
      accessibilityLabel={`${label}。 プラン画面を開く。`}
      testID="pro-inline-cta-link"
    >
      {/* Codex pass 1 Important — link text uses colors.proText
          (#7B5A1F) for AA contrast on white background. */}
      <Text style={[styles.linkLabel, { color: colors.proText }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  link: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  linkLabel: {
    ...typography.labelMedium,
    fontWeight: '600',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 9999,
    alignSelf: 'center',
  },
  cardLabel: {
    ...typography.labelMedium,
    fontWeight: '600',
  },
});
