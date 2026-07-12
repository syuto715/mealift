import React, { useEffect } from 'react';
import { Text, StyleSheet, TouchableOpacity, useColorScheme, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius, shadow } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
  onHide: () => void;
  duration?: number;
  // S3-2b — 任意のアクションボタン (Undo 等)。タップで自動 hide タイマーを
  // 止めて即 hide し、onAction を呼ぶ。未指定なら従来どおり表示のみ。
  actionLabel?: string;
  onAction?: () => void;
}

export function Toast({
  message,
  type,
  visible,
  onHide,
  duration = 3000,
  actionLabel,
  onAction,
}: ToastProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const insets = useSafeAreaInsets();
  const opacity = React.useRef(new Animated.Value(0)).current;
  // アクション実行時に自動 hide タイマーを止めるため ref 化 (S3-2b)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      timerRef.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(onHide);
      }, duration);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
  }, [visible]);

  if (!visible) return null;

  const iconMap = { success: 'checkmark-circle' as const, error: 'alert-circle' as const, info: 'information-circle' as const };
  const colorMap = { success: colors.success, error: colors.error, info: colors.primary };

  const handleAction = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onHide();
    onAction?.();
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { top: insets.top + spacing.sm, backgroundColor: colors.surface, opacity },
        shadow.md,
      ]}
    >
      <Ionicons name={iconMap[type]} size={20} color={colorMap[type]} />
      <Text style={[styles.message, { color: colors.textPrimary }]}>{message}</Text>
      {actionLabel != null && onAction != null && (
        <TouchableOpacity
          onPress={handleAction}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          testID="toast-action"
        >
          <Text style={[styles.action, { color: colors.primary }]}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.md,
    gap: spacing.sm,
    zIndex: 9999,
  },
  message: {
    ...typography.bodyMedium,
    flex: 1,
  },
  action: {
    ...typography.labelLarge,
    fontWeight: '700',
    paddingHorizontal: spacing.xs,
  },
});
