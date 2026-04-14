import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../src/theme/tokens';
import { typography } from '../../src/theme/typography';
import { spacing } from '../../src/theme/spacing';
import { Button, SegmentedControl } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import { ActivityLevel, Equipment } from '../../src/types/common';

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

const ACTIVITY_LEVELS: {
  value: ActivityLevel;
  label: string;
  desc: string;
}[] = [
  { value: 'sedentary', label: 'ほぼ運動しない', desc: 'デスクワーク中心' },
  { value: 'light', label: '軽い運動', desc: '週1〜2日の軽い運動' },
  { value: 'moderate', label: '中程度の運動', desc: '週3〜5日の運動' },
  { value: 'active', label: '活発に運動', desc: '週6〜7日の運動' },
  {
    value: 'very_active',
    label: '非常に活発',
    desc: 'アスリート級の運動量',
  },
];

const EQUIPMENT_OPTIONS: {
  value: Equipment;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { value: 'gym', label: 'ジム', icon: 'fitness-outline' },
  { value: 'dumbbell', label: 'ダンベル', icon: 'barbell-outline' },
  { value: 'bodyweight', label: '自重', icon: 'body-outline' },
];

export default function TrainingSetupScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const store = useOnboardingStore();

  const [activityLevel, setActivityLevel] = React.useState<ActivityLevel>(
    store.activityLevel,
  );
  const [trainingDays, setTrainingDays] = React.useState(
    String(store.trainingDaysPerWeek),
  );
  const [equipment, setEquipment] = React.useState<Equipment>(store.equipment);

  const handleNext = () => {
    store.setTraining({
      activityLevel,
      trainingDaysPerWeek: parseInt(trainingDays, 10),
      equipment,
      targetDate: null,
    });
    router.push('/(onboarding)/complete');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          ステップ 4/5
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          トレーニング環境を教えてください
        </Text>

        {/* Activity Level */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          日常の活動量
        </Text>
        <View style={styles.activityList}>
          {ACTIVITY_LEVELS.map((level) => {
            const isSelected = activityLevel === level.value;
            return (
              <TouchableOpacity
                key={level.value}
                style={[
                  styles.activityRow,
                  {
                    backgroundColor: isSelected
                      ? colors.primary + '10'
                      : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                onPress={() => setActivityLevel(level.value)}
                activeOpacity={0.7}
              >
                <View style={styles.activityText}>
                  <Text
                    style={[
                      styles.activityLabel,
                      {
                        color: isSelected
                          ? colors.primary
                          : colors.textPrimary,
                      },
                    ]}
                  >
                    {level.label}
                  </Text>
                  <Text
                    style={[
                      styles.activityDesc,
                      { color: colors.textTertiary },
                    ]}
                  >
                    {level.desc}
                  </Text>
                </View>
                {isSelected && (
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={colors.primary}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Training days per week */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          週のトレーニング日数
        </Text>
        <SegmentedControl
          segments={[1, 2, 3, 4, 5, 6, 7].map((n) => ({
            label: `${n}日`,
            value: String(n),
          }))}
          selectedValue={trainingDays}
          onValueChange={setTrainingDays}
        />

        {/* Equipment */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          利用できる設備
        </Text>
        <View style={styles.equipList}>
          {EQUIPMENT_OPTIONS.map((eq) => {
            const isSelected = equipment === eq.value;
            return (
              <TouchableOpacity
                key={eq.value}
                style={[
                  styles.equipCard,
                  {
                    backgroundColor: isSelected
                      ? colors.primary + '10'
                      : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                onPress={() => setEquipment(eq.value)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={eq.icon}
                  size={28}
                  color={isSelected ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.equipLabel,
                    {
                      color: isSelected ? colors.primary : colors.textPrimary,
                    },
                  ]}
                >
                  {eq.label}
                </Text>
                {isSelected && (
                  <View style={styles.equipCheck}>
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={colors.primary}
                    />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <ProgressDots current={3} total={5} colors={colors} />
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
              onPress={handleNext}
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
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.xxl, gap: spacing.lg },
  title: { ...typography.titleLarge, marginBottom: spacing.sm },
  label: { ...typography.labelLarge },
  activityList: { gap: spacing.sm },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  activityText: { flex: 1 },
  activityLabel: { ...typography.bodyLarge },
  activityDesc: { ...typography.bodySmall, marginTop: 2 },
  equipList: { gap: spacing.md },
  equipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.md,
  },
  equipLabel: { ...typography.bodyLarge, flex: 1 },
  equipCheck: { marginLeft: 'auto' },
  footer: { padding: spacing.xxl, gap: spacing.lg },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  buttonFlex: { flex: 1 },
});
