import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../src/theme/tokens';
import { typography } from '../../src/theme/typography';
import { spacing } from '../../src/theme/spacing';
import { Button } from '../../src/components/ui';

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

const FEATURES: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
}[] = [
  { icon: 'barbell-outline', text: 'トレーニング記録' },
  { icon: 'restaurant-outline', text: '食事管理' },
  { icon: 'scale-outline', text: '体重トラッキング' },
  { icon: 'analytics-outline', text: '目標到達予測' },
];

export default function WelcomeScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={styles.center}>
          <Ionicons name="barbell-outline" size={80} color={colors.primary} />
          <Text style={[styles.appName, { color: colors.primary }]}>
            ミーリフト
          </Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            筋トレ・食事・体重を一つで管理。{'\n'}
            目標までの道筋が見えるアプリ。
          </Text>
          <View style={styles.features}>
            {FEATURES.map((item) => (
              <View key={item.text} style={styles.featureRow}>
                <Ionicons name={item.icon} size={24} color={colors.primary} />
                <Text
                  style={[styles.featureText, { color: colors.textPrimary }]}
                >
                  {item.text}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <ProgressDots current={0} total={5} colors={colors} />
        <Button
          title="始めましょう"
          onPress={() => router.push('/(onboarding)/goal')}
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
  content: { flex: 1, justifyContent: 'center', padding: spacing.xxl },
  center: { alignItems: 'center', gap: spacing.lg },
  appName: { ...typography.displayLarge, fontSize: 42 },
  description: {
    ...typography.bodyLarge,
    textAlign: 'center',
    lineHeight: 26,
  },
  features: {
    gap: spacing.lg,
    marginTop: spacing.xl,
    alignSelf: 'stretch',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  featureText: { ...typography.bodyLarge },
  footer: { padding: spacing.xxl, gap: spacing.lg },
});
