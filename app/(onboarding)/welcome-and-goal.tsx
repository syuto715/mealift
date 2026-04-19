import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
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

const GOALS: {
  value: GoalType;
  label: string;
  desc: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { value: 'cut', label: '減量', desc: '体脂肪を落として引き締める', icon: 'trending-down' },
  { value: 'bulk', label: '増量', desc: '筋肉量を増やして大きくなる', icon: 'trending-up' },
  { value: 'maintain', label: '維持', desc: '今の体型をキープする', icon: 'remove-outline' },
  { value: 'recomp', label: 'ボディメイク', desc: '体脂肪を減らしつつ筋肉を増やす', icon: 'body-outline' },
];

const FEATURES: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; desc: string }[] = [
  { icon: 'barbell-outline', label: '筋トレ記録と分析', desc: 'ワークアウトを記録し、成長を可視化' },
  { icon: 'restaurant-outline', label: '栄養管理と食事提案', desc: 'PFCバランスを正確に管理' },
  { icon: 'trending-up-outline', label: '目標到達予測', desc: '実データに基づく到達日を予測' },
];

function ProgressDots({ current, colors }: { current: number; colors: ReturnType<typeof getColors> }) {
  return (
    <View style={dotStyles.container}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            dotStyles.dot,
            { backgroundColor: i === current ? colors.primary : colors.surfaceSecondary },
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

export default function WelcomeAndGoalScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const { goalType, setGoal } = useOnboardingStore();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={[styles.logo, { backgroundColor: colors.primary + '15' }]}>
            <Ionicons name="barbell" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.appName, { color: colors.textPrimary }]}>Mealift</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>
            体が変わる実感を、毎日。
          </Text>
        </View>

        <View style={styles.features}>
          {FEATURES.map((f, i) => (
            <View
              key={i}
              style={[
                styles.featureRow,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={[styles.featureIcon, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name={f.icon} size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureLabel, { color: colors.textPrimary }]}>{f.label}</Text>
                <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.goalSection}>
          <Text style={[styles.goalTitle, { color: colors.textPrimary }]}>あなたの目標は？</Text>
          <View style={styles.goalOptions}>
            {GOALS.map((g) => {
              const selected = goalType === g.value;
              return (
                <TouchableOpacity
                  key={g.value}
                  style={[
                    styles.goalCard,
                    {
                      backgroundColor: selected ? colors.primary + '10' : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                      borderWidth: selected ? 2 : 1,
                    },
                    selected && shadow.sm,
                  ]}
                  onPress={() => setGoal(g.value)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.goalIcon,
                      {
                        backgroundColor: selected
                          ? colors.primary + '15'
                          : colors.surfaceSecondary,
                      },
                    ]}
                  >
                    <Ionicons
                      name={g.icon}
                      size={20}
                      color={selected ? colors.primary : colors.textSecondary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.goalLabel, { color: colors.textPrimary }]}>{g.label}</Text>
                    <Text style={[styles.goalDesc, { color: colors.textSecondary }]}>{g.desc}</Text>
                  </View>
                  {selected && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <ProgressDots current={0} colors={colors} />
        <Button
          title="次へ"
          onPress={() => router.push('/(onboarding)/body-and-training')}
          variant="primary"
          size="lg"
          fullWidth
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.xxl, gap: spacing.xl },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: { ...typography.displayMedium },
  tagline: { ...typography.bodyLarge, textAlign: 'center' },
  features: { gap: spacing.sm },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: { ...typography.titleSmall },
  featureDesc: { ...typography.bodySmall },
  goalSection: { gap: spacing.md },
  goalTitle: { ...typography.titleLarge },
  goalOptions: { gap: spacing.sm },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  goalIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalLabel: { ...typography.titleSmall },
  goalDesc: { ...typography.bodySmall, marginTop: 2 },
  footer: { padding: spacing.xxl, gap: spacing.lg },
});
