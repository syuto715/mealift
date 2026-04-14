import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, Button, Input, NumberInput, SegmentedControl, Toast } from '../../../src/components/ui';
import { useProfileStore } from '../../../src/stores/profileStore';
import { updateProfile as updateProfileDB } from '../../../src/infra/repositories/profileRepository';
import { calculateAllCalories } from '../../../src/domain/calories';
import { calculateMacros } from '../../../src/domain/macros';
import { Gender } from '../../../src/types/common';

const GENDER_SEGMENTS = [
  { label: '男性', value: 'male' },
  { label: '女性', value: 'female' },
  { label: 'その他', value: 'other' },
];

export default function ProfileScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);
  const storeUpdateProfile = useProfileStore((s) => s.updateProfile);

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [gender, setGender] = useState<string>(profile?.gender ?? 'male');
  const [birthYear, setBirthYear] = useState<number | null>(profile?.birthYear ?? 1990);
  const [heightCm, setHeightCm] = useState<number | null>(profile?.heightCm ?? 170);
  const [currentWeightKg, setCurrentWeightKg] = useState<number | null>(profile?.currentWeightKg ?? 70);
  const [saving, setSaving] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setGender(profile.gender);
      setBirthYear(profile.birthYear);
      setHeightCm(profile.heightCm);
      setCurrentWeightKg(profile.currentWeightKg);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!profile) return;
    if (!displayName.trim()) {
      Alert.alert('エラー', '名前を入力してください。');
      return;
    }
    setSaving(true);
    try {
      const weight = currentWeightKg ?? profile.currentWeightKg;
      const height = heightCm ?? profile.heightCm;
      const year = birthYear ?? profile.birthYear;
      const g = gender as Gender;

      const { targetCalories } = calculateAllCalories(
        weight,
        height,
        year,
        g,
        profile.activityLevel,
        profile.goalType
      );
      const macros = calculateMacros(targetCalories, weight);

      const updates = {
        displayName: displayName.trim(),
        gender: g,
        birthYear: year,
        heightCm: height,
        currentWeightKg: weight,
        targetCalories,
        targetProteinG: macros.proteinG,
        targetFatG: macros.fatG,
        targetCarbG: macros.carbG,
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
        message="プロフィールを保存しました"
        type="success"
        visible={toastVisible}
        onHide={() => setToastVisible(false)}
      />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>プロフィール</Text>
        <Button title="保存" onPress={handleSave} variant="primary" size="sm" disabled={saving} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card>
          <View style={styles.fields}>
            <Input
              label="表示名"
              placeholder="表示名を入力"
              value={displayName}
              onChangeText={setDisplayName}
            />
            <View>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>性別</Text>
              <SegmentedControl
                segments={GENDER_SEGMENTS}
                selectedValue={gender}
                onValueChange={setGender}
              />
            </View>
            <NumberInput
              label="生年"
              value={birthYear}
              onValueChange={setBirthYear}
              step={1}
              min={1920}
              max={2020}
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
              label="体重"
              value={currentWeightKg}
              onValueChange={setCurrentWeightKg}
              step={0.1}
              min={20}
              max={300}
              decimals={1}
              suffix="kg"
            />
          </View>
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
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxxl },
  fields: { gap: spacing.lg },
  fieldLabel: { ...typography.labelMedium, marginBottom: spacing.sm },
});
