import React, { useEffect } from 'react';
import { View, Text, StyleSheet, useColorScheme, Animated } from 'react-native';
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
}

export function Toast({ message, type, visible, onHide, duration = 3000 }: ToastProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const insets = useSafeAreaInsets();
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      const timer = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(onHide);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!visible) return null;

  const iconMap = { success: 'checkmark-circle' as const, error: 'alert-circle' as const, info: 'information-circle' as const };
  const colorMap = { success: colors.success, error: colors.error, info: colors.primary };

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
});
