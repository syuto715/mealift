import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

// v1.4 / UI 改善 v1 Phase A-4 — SectionHeader.
//
// 画面内のセクション見出し共通 component. 計画書 §5.3 D 「週間達成率」
// 等、 ホーム画面の複数カード間でタイポグラフィ + 余白を統一する。
//
// 構成:
//   - タイトル (太字、 titleSmall)
//   - 任意 subtitle (補足、 bodySmall、 textTertiary)
//   - 任意 right-side action (「→」 / 「すべて見る」 等の link)
//
// Patterns:
//   #11 visual redundancy — title 太字 + arrow icon (action あれば)
//   #12 accessibilityRole — header on title、 button on action
//   #18 SSoT — section header style を全画面で集約

interface SectionHeaderAction {
  label: string;
  onPress: () => void;
  // 任意 icon (default: chevron-forward)
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: SectionHeaderAction;
  // 上部 margin (default: spacing.lg)
  marginTop?: number;
}

export function SectionHeader({
  title,
  subtitle,
  action,
  marginTop,
}: SectionHeaderProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  return (
    <View style={[styles.container, marginTop !== undefined && { marginTop }]}>
      <View style={styles.textBlock}>
        <Text
          style={[styles.title, { color: colors.textPrimary }]}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {subtitle && (
          <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
            {subtitle}
          </Text>
        )}
      </View>
      {action && (
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={action.onPress}
          style={styles.actionRow}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Text style={[styles.actionLabel, { color: colors.primary }]}>
            {action.label}
          </Text>
          <Ionicons
            name={action.icon ?? 'chevron-forward'}
            size={16}
            color={colors.primary}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.titleSmall,
  },
  subtitle: {
    ...typography.bodySmall,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  actionLabel: {
    ...typography.labelMedium,
    fontWeight: '600',
  },
});
