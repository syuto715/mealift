import React from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Button } from '../ui/Button';

// v1.4 / UI 改善 v1 Phase A-4 — EmptyState.
//
// 「データがない」 ことを温かく、 次の行動を促す共通エンプティ。
// 計画書 §5.4 B / §5.5 B 等、 トレーニング・食事画面のエンプティ
// 状態で使用。 ブランドトーン §4 「やや温かい」 を視覚化する基盤。
//
// 構成:
//   - 大型 Ionicons (60-72px、 colors.textTertiary tint)
//   - 太字 タイトル (1 行、 「ルーティンを作って始めましょう」 等)
//   - 副文 (任意、 1-2 行)
//   - primary action button (任意、 Button variant=primary size=lg
//     fullWidth、 PrimaryButton supersede の §13.5 規範)
//   - secondary action button (任意、 Button variant=secondary or ghost)
//
// Patterns:
//   #11 visual redundancy — icon + title + body + button(s)
//   #12 accessibilityRole — header on title、 button on CTAs
//   #13 decorative icon hidden — 大型 icon は a11y 隠す (Pattern paired)
//   #25 helper-thick — UI 専用、 logic は呼び出し側

interface EmptyStateProps {
  // 大型表示用 Ionicons name
  icon: React.ComponentProps<typeof Ionicons>['name'];
  // タイトル (太字 1 行推奨)
  title: string;
  // 副文 (任意、 lineHeight 緩めで読みやすく)
  description?: string;
  // Primary CTA (任意)
  primaryAction?: {
    label: string;
    onPress: () => void;
    icon?: React.ComponentProps<typeof Ionicons>['name'];
    testID?: string;
  };
  // Secondary CTA (任意)
  secondaryAction?: {
    label: string;
    onPress: () => void;
    icon?: React.ComponentProps<typeof Ionicons>['name'];
    testID?: string;
  };
  // testID for screen-level identification (例: "training-empty")
  testID?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  testID,
}: EmptyStateProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  return (
    <View style={styles.container} testID={testID}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Ionicons name={icon} size={64} color={colors.textTertiary} />
      </View>
      <Text
        style={[styles.title, { color: colors.textPrimary }]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {description && (
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {description}
        </Text>
      )}
      {(primaryAction || secondaryAction) && (
        <View style={styles.actions}>
          {primaryAction && (
            <Button
              title={primaryAction.label}
              onPress={primaryAction.onPress}
              variant="primary"
              size="lg"
              fullWidth
              testID={primaryAction.testID}
            />
          )}
          {secondaryAction && (
            <Button
              title={secondaryAction.label}
              onPress={secondaryAction.onPress}
              variant="secondary"
              size="lg"
              fullWidth
              testID={secondaryAction.testID}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
  },
  title: {
    ...typography.titleMedium,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  description: {
    ...typography.bodyMedium,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
