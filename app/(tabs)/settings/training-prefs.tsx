import React, { useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, SegmentedControl } from '../../../src/components/ui';
import { useProfileStore } from '../../../src/stores/profileStore';
import { updateProfile } from '../../../src/infra/repositories/profileRepository';
import { PLATE_STEP_OPTIONS, type PlateStep } from '../../../src/types/profile';

// Build 15 / Feature 5-C — training preferences screen.
// Currently hosts the plate-step picker; future 5-C+ settings (RPE
// display toggle, e1rm formula chooser, etc.) can join here without
// changing settings/index.tsx wiring.

const PLATE_STEP_SEGMENTS = PLATE_STEP_OPTIONS.map((step) => ({
  label: `${step}kg`,
  value: String(step),
}));

export default function TrainingPrefsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);
  const setProfile = useProfileStore((s) => s.setProfile);

  const onChangePlateStep = useCallback(
    async (raw: string) => {
      if (!profile) return;
      const parsed = Number(raw) as PlateStep;
      if (!PLATE_STEP_OPTIONS.includes(parsed)) return;
      // Optimistic update — UI reflects immediately, DB write enqueues
      // for sync. updateProfile internally maps the camelCase key to
      // the snake_case column.
      setProfile({ ...profile, plateStepKg: parsed });
      await updateProfile(profile.id, { plateStepKg: parsed });
    },
    [profile, setProfile],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>トレーニング設定</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={[styles.label, { color: colors.textPrimary }]}>プレート単位</Text>
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            次のセットの推奨重量を、この単位で丸めます。
          </Text>
          <View style={{ marginTop: spacing.md }}>
            <SegmentedControl
              segments={PLATE_STEP_SEGMENTS}
              selectedValue={String(profile?.plateStepKg ?? 2.5)}
              onValueChange={onChangePlateStep}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { ...typography.titleMedium, flex: 1, textAlign: 'center' },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxxl },
  label: { ...typography.titleSmall, marginBottom: spacing.xs },
  hint: { ...typography.bodySmall },
});
