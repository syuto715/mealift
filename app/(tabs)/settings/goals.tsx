import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius, shadow } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, Button, NumberInput, Input, Toast } from '../../../src/components/ui';
import { useProfileStore } from '../../../src/stores/profileStore';
import { updateProfile as updateProfileDB } from '../../../src/infra/repositories/profileRepository';
import { calculateAllCalories } from '../../../src/domain/calories';
import { calculateMacros } from '../../../src/domain/macros';
import { GoalType } from '../../../src/types/common';
import {
  CALORIES_PER_PROTEIN_G,
  CALORIES_PER_FAT_G,
  CALORIES_PER_CARB_G,
} from '../../../src/constants/defaults';

interface GoalOption {
  type: GoalType;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  description: string;
}

const GOAL_OPTIONS: GoalOption[] = [
  { type: 'cut', label: '減量', icon: 'trending-down', description: '体脂肪を減らす' },
  { type: 'bulk', label: '増量', icon: 'trending-up', description: '筋肉量を増やす' },
  { type: 'maintain', label: '維持', icon: 'remove-outline', description: '現在の体重を維持' },
  { type: 'recomp', label: 'リコンプ', icon: 'swap-horizontal', description: '体組成を改善' },
];

export default function GoalsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);
  const storeUpdateProfile = useProfileStore((s) => s.updateProfile);

  const [goalType, setGoalType] = useState<GoalType>(profile?.goalType ?? 'cut');
  const [targetWeight, setTargetWeight] = useState<number | null>(profile?.targetWeightKg ?? null);
  const [targetBodyFat, setTargetBodyFat] = useState<number | null>(profile?.targetBodyFatPct ?? null);
  const [targetDate, setTargetDate] = useState(profile?.targetDate ?? '');
  const [hasTargetDate, setHasTargetDate] = useState(!!profile?.targetDate);

  const [autoCalc, setAutoCalc] = useState(true);
  const [manualProtein, setManualProtein] = useState<number | null>(profile?.targetProteinG ?? null);
  const [manualFat, setManualFat] = useState<number | null>(profile?.targetFatG ?? null);
  const [manualCarb, setManualCarb] = useState<number | null>(profile?.targetCarbG ?? null);

  const [saving, setSaving] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  // Computed auto values
  const autoValues = (() => {
    if (!profile) return { targetCalories: 0, proteinG: 0, fatG: 0, carbG: 0 };
    const { targetCalories } = calculateAllCalories(
      profile.currentWeightKg,
      profile.heightCm,
      profile.birthYear,
      profile.gender,
      profile.activityLevel,
      goalType
    );
    const macros = calculateMacros(targetCalories, profile.currentWeightKg);
    return { targetCalories, ...macros };
  })();

  const manualCalories = (() => {
    const p = manualProtein ?? 0;
    const f = manualFat ?? 0;
    const c = manualCarb ?? 0;
    return p * CALORIES_PER_PROTEIN_G + f * CALORIES_PER_FAT_G + c * CALORIES_PER_CARB_G;
  })();

  useEffect(() => {
    if (profile) {
      setGoalType(profile.goalType);
      setTargetWeight(profile.targetWeightKg);
      setTargetBodyFat(profile.targetBodyFatPct);
      setTargetDate(profile.targetDate ?? '');
      setHasTargetDate(!!profile.targetDate);
      setManualProtein(profile.targetProteinG);
      setManualFat(profile.targetFatG);
      setManualCarb(profile.targetCarbG);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      let targetCalories: number;
      let proteinG: number;
      let fatG: number;
      let carbG: number;

      if (autoCalc) {
        targetCalories = autoValues.targetCalories;
        proteinG = autoValues.proteinG;
        fatG = autoValues.fatG;
        carbG = autoValues.carbG;
      } else {
        proteinG = manualProtein ?? 0;
        fatG = manualFat ?? 0;
        carbG = manualCarb ?? 0;
        targetCalories = Math.round(manualCalories);
      }

      const updates = {
        goalType,
        targetWeightKg: targetWeight,
        targetBodyFatPct: targetBodyFat,
        targetDate: hasTargetDate && targetDate ? targetDate : null,
        targetCalories,
        targetProteinG: proteinG,
        targetFatG: fatG,
        targetCarbG: carbG,
      };

      await updateProfileDB(profile.id, updates);
      storeUpdateProfile(updates);
      setToastVisible(true);
      setTimeout(() => {
        router.back();
      }, 800);
    } catch (e) {
      Alert.alert('エラー', '保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <Toast
        message="目標を保存しました"
        type="success"
        visible={toastVisible}
        onHide={() => setToastVisible(false)}
      />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>目標設定</Text>
        <Button title="保存" onPress={handleSave} variant="primary" size="sm" disabled={saving} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>目標タイプ</Text>
        <View style={styles.goalGrid}>
          {GOAL_OPTIONS.map((option) => {
            const isSelected = goalType === option.type;
            return (
              <TouchableOpacity
                key={option.type}
                style={[
                  styles.goalCard,
                  {
                    backgroundColor: isSelected ? colors.primary + '15' : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                  shadow.sm,
                ]}
                onPress={() => setGoalType(option.type)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={option.icon as any}
                  size={28}
                  color={isSelected ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.goalCardLabel,
                    { color: isSelected ? colors.primary : colors.textPrimary },
                  ]}
                >
                  {option.label}
                </Text>
                <Text style={[styles.goalCardDesc, { color: colors.textTertiary }]}>
                  {option.description}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>目標値</Text>
        <Card>
          <View style={styles.fields}>
            <NumberInput
              label="目標体重 (任意)"
              value={targetWeight}
              onValueChange={setTargetWeight}
              step={0.1}
              min={20}
              max={300}
              decimals={1}
              suffix="kg"
            />
            <NumberInput
              label="目標体脂肪率 (任意)"
              value={targetBodyFat}
              onValueChange={setTargetBodyFat}
              step={0.5}
              min={3}
              max={60}
              decimals={1}
              suffix="%"
            />
            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>
                期限を設定する
              </Text>
              <Switch
                value={hasTargetDate}
                onValueChange={setHasTargetDate}
                trackColor={{ false: colors.border, true: colors.primaryLight }}
                thumbColor={hasTargetDate ? colors.primary : colors.surface}
              />
            </View>
            {hasTargetDate && (
              <Input
                label="目標日 (YYYY-MM-DD)"
                placeholder="2025-12-31"
                value={targetDate}
                onChangeText={setTargetDate}
                keyboardType="default"
              />
            )}
          </View>
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>PFC目標</Text>
        <Card>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>自動計算</Text>
            <Switch
              value={autoCalc}
              onValueChange={setAutoCalc}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={autoCalc ? colors.primary : colors.surface}
            />
          </View>

          {autoCalc ? (
            <View style={styles.autoValues}>
              <View style={styles.autoValueRow}>
                <Text style={[styles.autoLabel, { color: colors.textSecondary }]}>カロリー</Text>
                <Text style={[styles.autoValue, { color: colors.calorie }]}>
                  {autoValues.targetCalories} kcal
                </Text>
              </View>
              <View style={styles.autoValueRow}>
                <Text style={[styles.autoLabel, { color: colors.textSecondary }]}>タンパク質</Text>
                <Text style={[styles.autoValue, { color: colors.protein }]}>
                  {autoValues.proteinG}g
                </Text>
              </View>
              <View style={styles.autoValueRow}>
                <Text style={[styles.autoLabel, { color: colors.textSecondary }]}>脂質</Text>
                <Text style={[styles.autoValue, { color: colors.fat }]}>
                  {autoValues.fatG}g
                </Text>
              </View>
              <View style={styles.autoValueRow}>
                <Text style={[styles.autoLabel, { color: colors.textSecondary }]}>炭水化物</Text>
                <Text style={[styles.autoValue, { color: colors.carb }]}>
                  {autoValues.carbG}g
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.manualFields}>
              <NumberInput
                label="タンパク質"
                value={manualProtein}
                onValueChange={setManualProtein}
                step={5}
                min={0}
                max={500}
                suffix="g"
              />
              <NumberInput
                label="脂質"
                value={manualFat}
                onValueChange={setManualFat}
                step={5}
                min={0}
                max={300}
                suffix="g"
              />
              <NumberInput
                label="炭水化物"
                value={manualCarb}
                onValueChange={setManualCarb}
                step={5}
                min={0}
                max={800}
                suffix="g"
              />
              <View style={[styles.calcCalorieRow, { backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm }]}>
                <Text style={[styles.calcCalorieLabel, { color: colors.textSecondary }]}>
                  合計カロリー (自動算出)
                </Text>
                <Text style={[styles.calcCalorieValue, { color: colors.calorie }]}>
                  {Math.round(manualCalories)} kcal
                </Text>
              </View>
            </View>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { ...typography.titleMedium },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxxl },
  sectionTitle: { ...typography.titleSmall, marginTop: spacing.sm },
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  goalCard: {
    width: '47%',
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: spacing.xs,
  },
  goalCardLabel: { ...typography.labelLarge },
  goalCardDesc: { ...typography.labelSmall, textAlign: 'center' },
  fields: { gap: spacing.lg },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  toggleLabel: { ...typography.bodyMedium },
  autoValues: { gap: spacing.sm, marginTop: spacing.md },
  autoValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  autoLabel: { ...typography.bodyMedium },
  autoValue: { ...typography.labelLarge },
  manualFields: { gap: spacing.lg, marginTop: spacing.md },
  calcCalorieRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
  },
  calcCalorieLabel: { ...typography.bodyMedium },
  calcCalorieValue: { ...typography.numberSmall },
});
