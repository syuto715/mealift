import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  ScrollView,
  Switch,
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
import { Button, NumberInput } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import { Gender } from '../../src/types/common';

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

const GENDERS: {
  value: Gender;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { value: 'male', label: '男性', icon: 'male-outline' },
  { value: 'female', label: '女性', icon: 'female-outline' },
  { value: 'other', label: 'その他', icon: 'person-outline' },
];

export default function BodyScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const store = useOnboardingStore();

  const [gender, setGender] = React.useState<Gender>(store.gender);
  const [birthYear, setBirthYear] = React.useState<number | null>(
    store.birthYear,
  );
  const [heightCm, setHeightCm] = React.useState<number | null>(
    store.heightCm,
  );
  const [currentWeight, setCurrentWeight] = React.useState<number | null>(
    store.currentWeightKg,
  );
  const [targetWeight, setTargetWeight] = React.useState<number | null>(
    store.targetWeightKg,
  );
  const [bodyFat, setBodyFat] = React.useState<number | null>(
    store.targetBodyFatPct,
  );
  const [showTargetWeight, setShowTargetWeight] = React.useState(
    store.targetWeightKg !== null,
  );
  const [showBodyFat, setShowBodyFat] = React.useState(
    store.targetBodyFatPct !== null,
  );
  const [error, setError] = React.useState('');
  const [keyboardVisible, setKeyboardVisible] = React.useState(false);
  const scrollRef = React.useRef<ScrollView>(null);

  React.useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () =>
      setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(hideEvent, () =>
      setKeyboardVisible(false),
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scrollToEnd = React.useCallback(() => {
    // Small delay so layout has settled after keyboard opens
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 150);
  }, []);

  const currentYear = new Date().getFullYear();

  const handleToggleTargetWeight = (value: boolean) => {
    setShowTargetWeight(value);
    if (!value) {
      setTargetWeight(null);
    }
  };

  const handleToggleBodyFat = (value: boolean) => {
    setShowBodyFat(value);
    if (!value) {
      setBodyFat(null);
    }
  };

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
      setError('体重を入力してください');
      return;
    }
    setError('');
    store.setBody({
      gender,
      birthYear,
      heightCm,
      currentWeightKg: currentWeight,
      targetWeightKg: showTargetWeight ? targetWeight : null,
      targetBodyFatPct: showBodyFat ? bodyFat : null,
    });
    router.push('/(onboarding)/training');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          ステップ 3/5
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          keyboardVisible && styles.scrollContentKeyboard,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          あなたの体について教えてください
        </Text>

        {/* Gender selection */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          性別
        </Text>
        <View style={styles.genderRow}>
          {GENDERS.map((g) => {
            const isSelected = gender === g.value;
            return (
              <TouchableOpacity
                key={g.value}
                style={[
                  styles.genderCard,
                  {
                    backgroundColor: isSelected
                      ? colors.primary + '10'
                      : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                onPress={() => setGender(g.value)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={g.icon}
                  size={24}
                  color={isSelected ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.genderLabel,
                    {
                      color: isSelected ? colors.primary : colors.textPrimary,
                    },
                  ]}
                >
                  {g.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Number inputs */}
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
          step={0.1}
          min={100}
          max={250}
          decimals={1}
          suffix="cm"
        />
        <NumberInput
          label="現在の体重"
          value={currentWeight}
          onValueChange={setCurrentWeight}
          step={0.1}
          min={20}
          max={300}
          decimals={1}
          suffix="kg"
        />

        {/* Target weight with toggle */}
        <View style={styles.toggleRow}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            目標体重
          </Text>
          <View style={styles.toggleRight}>
            <Text
              style={[styles.toggleLabel, { color: colors.textTertiary }]}
            >
              {showTargetWeight ? '設定する' : '設定しない'}
            </Text>
            <Switch
              value={showTargetWeight}
              onValueChange={handleToggleTargetWeight}
              trackColor={{
                false: colors.surfaceSecondary,
                true: colors.primary + '40',
              }}
              thumbColor={showTargetWeight ? colors.primary : colors.border}
            />
          </View>
        </View>
        {showTargetWeight && (
          <View onTouchEnd={scrollToEnd}>
            <NumberInput
              value={targetWeight}
              onValueChange={setTargetWeight}
              step={0.1}
              min={20}
              max={300}
              decimals={1}
              suffix="kg"
            />
          </View>
        )}

        {/* Target body fat with toggle */}
        <View style={styles.toggleRow}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            目標体脂肪率
          </Text>
          <View style={styles.toggleRight}>
            <Text
              style={[styles.toggleLabel, { color: colors.textTertiary }]}
            >
              {showBodyFat ? '設定する' : '設定しない'}
            </Text>
            <Switch
              value={showBodyFat}
              onValueChange={handleToggleBodyFat}
              trackColor={{
                false: colors.surfaceSecondary,
                true: colors.primary + '40',
              }}
              thumbColor={showBodyFat ? colors.primary : colors.border}
            />
          </View>
        </View>
        {showBodyFat && (
          <View onTouchEnd={scrollToEnd}>
            <NumberInput
              value={bodyFat}
              onValueChange={setBodyFat}
              step={0.1}
              min={3}
              max={60}
              decimals={1}
              suffix="%"
            />
          </View>
        )}

        {error !== '' && (
          <View
            style={[styles.errorBox, { backgroundColor: colors.error + '10' }]}
          >
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.error }]}>
              {error}
            </Text>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <ProgressDots current={2} total={5} colors={colors} />
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
  scrollContent: { padding: spacing.xxl, gap: spacing.lg, paddingBottom: spacing.xxl },
  scrollContentKeyboard: { paddingBottom: 220 },
  title: { ...typography.titleLarge, marginBottom: spacing.sm },
  label: { ...typography.labelLarge },
  genderRow: { flexDirection: 'row', gap: spacing.md },
  genderCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  genderLabel: { ...typography.labelMedium },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleLabel: { ...typography.bodySmall },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
  },
  errorText: { ...typography.bodySmall, flex: 1 },
  footer: { padding: spacing.xxl, gap: spacing.lg },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  buttonFlex: { flex: 1 },
});
