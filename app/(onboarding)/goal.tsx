import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius, shadow } from '../../src/theme/tokens';
import { typography } from '../../src/theme/typography';
import { spacing } from '../../src/theme/spacing';
import { Button } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import { GoalType } from '../../src/types/common';

function ProgressDots({
  current,
  total,
  colors,
}: {
  current: number;
  total: number;
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <View style={dotStyles.container}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            dotStyles.dot,
            {
              backgroundColor:
                i === current ? colors.primary : colors.surfaceSecondary,
            },
            i === current && dotStyles.activeDot,
          ]}
        />
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  activeDot: { width: 24 },
});

const GOALS: {
  value: GoalType;
  label: string;
  desc: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  {
    value: 'cut',
    label: '減量',
    desc: '体脂肪を落として引き締める',
    icon: 'trending-down',
  },
  {
    value: 'bulk',
    label: '増量',
    desc: '筋肉量を増やして大きくなる',
    icon: 'trending-up',
  },
  {
    value: 'maintain',
    label: '維持',
    desc: '今の体型をキープする',
    icon: 'remove-outline',
  },
  {
    value: 'recomp',
    label: 'ボディメイク',
    desc: '体脂肪を減らしつつ筋肉を増やす',
    icon: 'body-outline',
  },
];

export default function GoalScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const { goalType, setGoal } = useOnboardingStore();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          ステップ 2/5
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          あなたの目標は？
        </Text>

        <View style={styles.options}>
          {GOALS.map((goal) => {
            const isSelected = goalType === goal.value;
            return (
              <TouchableOpacity
                key={goal.value}
                style={[
                  styles.optionCard,
                  {
                    backgroundColor: isSelected
                      ? colors.primary + '10'
                      : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                  isSelected && shadow.sm,
                ]}
                onPress={() => setGoal(goal.value)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.optionIcon,
                    {
                      backgroundColor: isSelected
                        ? colors.primary + '15'
                        : colors.surfaceSecondary,
                    },
                  ]}
                >
                  <Ionicons
                    name={goal.icon}
                    size={24}
                    color={isSelected ? colors.primary : colors.textSecondary}
                  />
                </View>
                <View style={styles.optionText}>
                  <Text
                    style={[styles.optionLabel, { color: colors.textPrimary }]}
                  >
                    {goal.label}
                  </Text>
                  <Text
                    style={[styles.optionDesc, { color: colors.textSecondary }]}
                  >
                    {goal.desc}
                  </Text>
                </View>
                {isSelected && (
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={colors.primary}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.footer}>
        <ProgressDots current={1} total={5} colors={colors} />
        <View style={styles.buttonRow}>
          <Button
            title="戻る"
            onPress={() => router.back()}
            variant="outline"
            size="lg"
          />
          <View style={styles.buttonFlex}>
            <Button
              title="次へ"
              onPress={() => router.push('/(onboarding)/body')}
              variant="primary"
              size="lg"
              fullWidth
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  headerTitle: { ...typography.labelMedium },
  headerSpacer: { width: 28 },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  title: { ...typography.titleLarge },
  options: { gap: spacing.md },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.lg,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1 },
  optionLabel: { ...typography.titleSmall },
  optionDesc: { ...typography.bodySmall, marginTop: 2 },
  footer: { padding: spacing.xxl, gap: spacing.lg },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  buttonFlex: { flex: 1 },
});
