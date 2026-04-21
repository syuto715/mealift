import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getColors, radius, shadow } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { PRInfo, PR_TYPE_LABELS } from '../../types/personalRecord';

interface Props {
  prs: PRInfo[];
  onHide: () => void;
}

const DURATION_PER_PR = 3000;

export function PRCelebrationToast({ prs, onHide }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (prs.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [prs.length]);

  useEffect(() => {
    if (prs.length === 0) return;
    setIndex(0);
  }, [prs]);

  useEffect(() => {
    if (prs.length === 0 || index >= prs.length) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -100, duration: 300, useNativeDriver: true }),
      ]).start(() => {
        if (index + 1 < prs.length) {
          setIndex(index + 1);
        } else {
          onHide();
        }
      });
    }, DURATION_PER_PR);

    return () => clearTimeout(timer);
  }, [index, prs, onHide, opacity, translateY]);

  if (prs.length === 0 || index >= prs.length) return null;

  const pr = prs[index];
  const color = colors.accent;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + spacing.sm,
          backgroundColor: colors.surface,
          opacity,
          transform: [{ translateY }],
          borderLeftWidth: 4,
          borderLeftColor: color,
        },
        shadow.lg,
      ]}
    >
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Text style={styles.flame}>🔥</Text>
        </View>
        <View style={styles.content}>
          <Text style={[styles.title, { color }]}>新記録!</Text>
          <Text style={[styles.exercise, { color: colors.textPrimary }]}>
            {pr.exerciseName} — {PR_TYPE_LABELS[pr.recordType]}
          </Text>
          <Text style={[styles.detail, { color: colors.textSecondary }]}>
            {pr.recordType === 'estimated_1rm'
              ? `${pr.weight}kg × ${pr.reps} (推定1RM: ${pr.newValue.toFixed(1)}kg)`
              : pr.recordType === 'max_weight'
                ? `${pr.newValue}kg × ${pr.reps}`
                : pr.recordType === 'max_volume_session'
                  ? `総ボリューム: ${Math.round(pr.newValue).toLocaleString()}kg`
                  : pr.recordType === 'max_duration'
                    ? `${pr.newValue}分`
                    : pr.recordType === 'max_distance'
                      ? `${pr.newValue}km`
                      : pr.recordType === 'max_calories'
                        ? `${Math.round(pr.newValue)}kcal`
                        : `${pr.weight}kg × ${pr.newValue}回`}
          </Text>
          {pr.previousValue != null && (
            <Text style={[styles.improvement, { color: colors.success }]}>
              +{pr.improvement.toFixed(1)}
              {pr.recordType === 'max_reps_at_weight'
                ? '回'
                : pr.recordType === 'max_duration'
                  ? '分'
                  : pr.recordType === 'max_distance'
                    ? 'km'
                    : pr.recordType === 'max_calories'
                      ? 'kcal'
                      : 'kg'}
            </Text>
          )}
        </View>
        {prs.length > 1 && (
          <Text style={[styles.counter, { color: colors.textTertiary }]}>
            {index + 1}/{prs.length}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    zIndex: 9999,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: { width: 36, alignItems: 'center' },
  flame: { fontSize: 28 },
  content: { flex: 1, gap: 2 },
  title: { ...typography.labelMedium, fontWeight: '700' },
  exercise: { ...typography.titleSmall },
  detail: { ...typography.bodySmall },
  improvement: { ...typography.labelMedium, marginTop: spacing.xs },
  counter: { ...typography.labelSmall },
});
