import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../src/theme/tokens';
import { typography } from '../../src/theme/typography';
import { spacing } from '../../src/theme/spacing';
import { Button, NumberInput, SegmentedControl } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import { Gender, ActivityLevel } from '../../src/types/common';

function ProgressDots({ current, colors }: { current: number; colors: ReturnType<typeof getColors> }) {
  const dots = Platform.OS === 'ios' ? [0, 1, 2, 3] : [0, 1, 2];
  return (
    <View style={dotStyles.container}>
      {dots.map((i) => (
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

const GENDERS: {
  value: Gender;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { value: 'male', label: '男性', icon: 'male-outline' },
  { value: 'female', label: '女性', icon: 'female-outline' },
  { value: 'other', label: 'その他', icon: 'person-outline' },
];

const TRAINING_SEGMENTS = [
  { label: '0回', value: '0' },
  { label: '1-2回', value: '2' },
  { label: '3-4回', value: '3' },
  { label: '5回以上', value: '5' },
];

function trainingDaysToActivityLevel(days: number): ActivityLevel {
  if (days === 0) return 'sedentary';
  if (days <= 2) return 'light';
  if (days <= 4) return 'moderate';
  return 'active';
}

export default function BodyAndTrainingScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const store = useOnboardingStore();

  const [gender, setGender] = useState<Gender>(store.gender);
  const [birthYear, setBirthYear] = useState<number | null>(store.birthYear);
  const [heightCm, setHeightCm] = useState<number | null>(store.heightCm);
  const [currentWeight, setCurrentWeight] = useState<number | null>(store.currentWeightKg);
  const [targetWeight, setTargetWeight] = useState<number | null>(store.targetWeightKg);
  const [trainingDays, setTrainingDays] = useState<string>(String(store.trainingDaysPerWeek));
  const [error, setError] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleNext = () => {
    if (!birthYear || birthYear < 1920) {
      setError('生まれ年を入力してください');
      return;
    }
    if (!heightCm || heightCm < 100) {
      setError('身長を入力してください');
      return;
    }
    if (!currentWeight || currentWeight < 20) {
      setError('現在の体重を入力してください');
      return;
    }
    if (!targetWeight || targetWeight < 20) {
      setError('目標体重を入力してください');
      return;
    }
    setError('');

    const days = Number(trainingDays);
    store.setBody({
      gender,
      birthYear,
      heightCm,
      currentWeightKg: currentWeight,
      targetWeightKg: targetWeight,
      targetBodyFatPct: null,
    });
    // Phase C-4 bridge integrity (Codex pass 1 / Critical) —
    // when the user reached this legacy screen via the new
    // /(onboarding)/activity bridge (onboardingStep >= 4), the
    // store already carries C-4-collected activityLevel +
    // trainingDaysPerWeek values that this screen's coarse 4-
    // bucket segments would otherwise destroy:
    //   - trainingDaysToActivityLevel collapses 5/6/7 → 'active',
    //     so a C-4 'very_active' choice would never survive.
    //   - Math.max(1, days) clamps a C-4 selection of 0 to 1.
    // Detect the new-flow origin and preserve the C-4 values;
    // legacy users (no new flow) keep the original segment-
    // derived behavior. Phase D removes the legacy screen
    // entirely and this guard goes with it.
    const fromNewFlow = store.onboardingStep >= 4;
    store.setTraining({
      activityLevel: fromNewFlow
        ? store.activityLevel
        : trainingDaysToActivityLevel(days),
      trainingDaysPerWeek: fromNewFlow
        ? store.trainingDaysPerWeek
        : Math.max(1, days),
      equipment: 'gym',
      targetDate: null,
    });
    // iOS: offer the HealthKit opt-in as a mid-flow step before summary.
    // Android: skip straight to summary since HealthKit isn't available.
    router.push(
      Platform.OS === 'ios'
        ? '/(onboarding)/healthkit'
        : '/(onboarding)/complete',
    );
  };

  const currentYear = new Date().getFullYear();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {Platform.OS === 'ios' ? 'ステップ 2/4' : 'ステップ 2/3'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, keyboardVisible && { paddingBottom: 200 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            あなたの体と生活について
          </Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>性別</Text>
          <View style={styles.genderRow}>
            {GENDERS.map((g) => {
              const sel = gender === g.value;
              return (
                <TouchableOpacity
                  key={g.value}
                  onPress={() => setGender(g.value)}
                  style={[
                    styles.genderCard,
                    {
                      backgroundColor: sel ? colors.primary + '10' : colors.surface,
                      borderColor: sel ? colors.primary : colors.border,
                      borderWidth: sel ? 2 : 1,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Ionicons name={g.icon} size={22} color={sel ? colors.primary : colors.textSecondary} />
                  <Text
                    style={[
                      styles.genderLabel,
                      { color: sel ? colors.primary : colors.textPrimary },
                    ]}
                  >
                    {g.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <NumberInput
            label="生まれ年"
            value={birthYear}
            onValueChange={setBirthYear}
            step={1}
            min={1920}
            max={currentYear}
            suffix="年"
          />
          <NumberInput
            label="身長"
            value={heightCm}
            onValueChange={setHeightCm}
            step={1}
            min={100}
            max={230}
            suffix="cm"
          />
          <NumberInput
            label="現在体重"
            value={currentWeight}
            onValueChange={setCurrentWeight}
            step={0.1}
            min={20}
            max={300}
            decimals={1}
            suffix="kg"
          />
          <NumberInput
            label="目標体重"
            value={targetWeight}
            onValueChange={setTargetWeight}
            step={0.1}
            min={20}
            max={300}
            decimals={1}
            suffix="kg"
          />

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: spacing.md }]}>
            週のトレーニング回数
          </Text>
          <SegmentedControl
            segments={TRAINING_SEGMENTS}
            selectedValue={trainingDays}
            onValueChange={setTrainingDays}
          />

          {error ? (
            <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <ProgressDots current={1} colors={colors} />
        <View style={styles.buttonRow}>
          <Button title="戻る" onPress={() => router.back()} variant="outline" size="lg" />
          <View style={{ flex: 1 }}>
            <Button title="次へ" onPress={handleNext} variant="primary" size="lg" fullWidth />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex1: { flex: 1 },
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
  content: { padding: spacing.xxl, gap: spacing.md },
  title: { ...typography.titleLarge },
  label: { ...typography.labelMedium, marginTop: spacing.sm },
  genderRow: { flexDirection: 'row', gap: spacing.sm },
  genderCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  genderLabel: { ...typography.labelMedium },
  error: { ...typography.bodySmall, textAlign: 'center', marginTop: spacing.sm },
  footer: { padding: spacing.xxl, gap: spacing.lg },
  buttonRow: { flexDirection: 'row', gap: spacing.md },
});
