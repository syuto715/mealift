import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../src/theme/tokens';
import { typography } from '../../src/theme/typography';
import { spacing } from '../../src/theme/spacing';
import { Button, Card } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import { useProfileStore } from '../../src/stores/profileStore';
import { useAuthStore } from '../../src/stores/authStore';
import { calculateAllCalories } from '../../src/domain/calories';
import { calculateMacros } from '../../src/domain/macros';
import {
  createProfile,
  updateProfile as updateProfileRepo,
} from '../../src/infra/repositories/profileRepository';
import {
  syncNotifications,
  loadNotificationSettings,
} from '../../src/infra/services/notificationService';

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
  activeDot: { width: 10, height: 10, borderRadius: 5 },
});

const GOAL_LABELS: Record<string, string> = {
  cut: '減量',
  bulk: '増量',
  maintain: '維持',
  recomp: 'ボディメイク',
};

export default function CompleteScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const onboarding = useOnboardingStore();
  const { setProfile } = useProfileStore();
  const user = useAuthStore((s) => s.user);
  const [saving, setSaving] = useState(false);

  const { bmr, tdee, targetCalories } = useMemo(
    () =>
      calculateAllCalories(
        onboarding.currentWeightKg,
        onboarding.heightCm,
        onboarding.birthYear,
        onboarding.gender,
        onboarding.activityLevel,
        onboarding.goalType,
      ),
    [
      onboarding.currentWeightKg,
      onboarding.heightCm,
      onboarding.birthYear,
      onboarding.gender,
      onboarding.activityLevel,
      onboarding.goalType,
    ],
  );

  const macros = useMemo(
    () => calculateMacros(targetCalories, onboarding.currentWeightKg),
    [targetCalories, onboarding.currentWeightKg],
  );

  const displayName = user?.email
    ? user.email.split('@')[0]
    : 'ユーザー';

  const handleStart = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const profile = await createProfile({
        displayName,
        gender: onboarding.gender,
        birthYear: onboarding.birthYear,
        heightCm: onboarding.heightCm,
        currentWeightKg: onboarding.currentWeightKg,
        targetWeightKg: onboarding.targetWeightKg,
        targetBodyFatPct: onboarding.targetBodyFatPct,
        goalType: onboarding.goalType,
        activityLevel: onboarding.activityLevel,
        trainingDaysPerWeek: onboarding.trainingDaysPerWeek,
        targetDate: onboarding.targetDate,
        equipment: onboarding.equipment,
      });

      // Phase C-* / D-* transitional bridge integrity — preserve
      // v2 fields collected on the new flow screens that legacy
      // createProfile's pre-Onboarding-v2 signature doesn't
      // accept. Each conditional matches the Phase kickoff for
      // that screen:
      //   - nickname (C-2)
      //   - weeklyRatePct (C-5)
      //   - mealPlan (D-2)
      //   - mealTimings (D-3)
      //   - proteinFactor (D-4)
      //   - weeklyDistribution + cheatDays (D-5)
      // D-5 completes the input layer — every v2 input field
      // now has a preservation conditional. Phase D-8 replaces
      // this whole completion path with the new flow's [12]
      // complete screen and onboardingService.persistToProfile,
      // at which point ALL of these conditionals revert.
      // Phase D-4 / Codex pass 1 Critical fix — when the v2
      // calculateAll cache is populated (user reached step >= 9
      // ONBOARDING_STEP_FULL_INPUT on /protein-target), use those
      // values directly. The legacy `targetCalories` recompute
      // above derives from goalType-based multipliers and ignores
      // weeklyRatePct / mealPlan / proteinFactor — so a user who
      // saw a specific PFC plan on [8] would otherwise land with
      // legacy-overwritten values in the DB. Pattern 24 atomic-
      // bundle read: either all 4 v2 cache fields populated or
      // we fall through to legacy.
      const v2CachePopulated =
        onboarding.dailyCalorieTarget !== null &&
        onboarding.pfcTargets !== null;
      const completionPatch: Partial<typeof profile> = {
        targetCalories: v2CachePopulated
          ? onboarding.dailyCalorieTarget
          : targetCalories,
        targetProteinG: v2CachePopulated
          ? onboarding.pfcTargets!.protein
          : macros.proteinG,
        targetFatG: v2CachePopulated
          ? onboarding.pfcTargets!.fat
          : macros.fatG,
        targetCarbG: v2CachePopulated
          ? onboarding.pfcTargets!.carbs
          : macros.carbG,
        onboardingCompleted: true,
      };
      if (onboarding.nickname) {
        completionPatch.nickname = onboarding.nickname;
      }
      if (onboarding.weeklyRatePct != null) {
        completionPatch.weeklyRatePct = onboarding.weeklyRatePct;
      }
      if (onboarding.mealPlan) {
        completionPatch.mealPlan = onboarding.mealPlan;
      }
      if (onboarding.mealTimings && onboarding.mealTimings.length > 0) {
        completionPatch.mealTimings = onboarding.mealTimings;
      }
      if (onboarding.proteinFactor != null) {
        completionPatch.proteinFactor = onboarding.proteinFactor;
      }
      if (onboarding.weeklyDistribution != null) {
        completionPatch.weeklyDistribution = onboarding.weeklyDistribution;
      }
      // cheatDays gated on length > 0 to mirror the mealTimings
      // pattern — an inadvertent empty array shouldn't clobber a
      // prior valid DB value.
      if (onboarding.cheatDays && onboarding.cheatDays.length > 0) {
        completionPatch.cheatDays = onboarding.cheatDays;
      }
      // Phase D-7 / Codex pass 1 Sign-off fix — estimatedTargetDate
      // was the one v2 cache field the legacy bridge previously
      // dropped. onboardingService.buildProfilePatch writes it from
      // step >= 5 (FIELD_STEP_THRESHOLDS), but the legacy path
      // never inherited that. Preserve it here so a user who
      // saw "達成予定: 2026年8月15日" on /goal-summary or
      // /motivation doesn't land with a null targetDate in DB.
      if (onboarding.estimatedTargetDate != null) {
        completionPatch.estimatedTargetDate =
          onboarding.estimatedTargetDate.toISOString();
      }
      await updateProfileRepo(profile.id, completionPatch);

      // NOTE: No auto-grant of Plus trial here. Trials are now user-initiated
      // via the "7日間無料トライアルで試す" button on the subscription screen.
      // This aligns with Apple subscription guidelines and retention patterns
      // where an explicit opt-in drives higher conversion than an automatic
      // countdown the user didn't choose.
      // Codex pass 1 / Phase C-5 Important #2 fix — mirror the
      // completionPatch v2 fields into the hydratedProfile so the
      // in-memory store sees the same values that just landed in
      // the DB. Without this, profileStore.setProfile would still
      // carry the legacy createProfile result (nickname=null,
      // weeklyRatePct=null) until the next app boot reads from
      // DB. Touches the same conditional shape as the DB patch.
      const hydratedProfile = {
        ...profile,
        targetCalories: v2CachePopulated
          ? onboarding.dailyCalorieTarget!
          : targetCalories,
        targetProteinG: v2CachePopulated
          ? onboarding.pfcTargets!.protein
          : macros.proteinG,
        targetFatG: v2CachePopulated
          ? onboarding.pfcTargets!.fat
          : macros.fatG,
        targetCarbG: v2CachePopulated
          ? onboarding.pfcTargets!.carbs
          : macros.carbG,
        onboardingCompleted: true,
        ...(onboarding.nickname ? { nickname: onboarding.nickname } : {}),
        ...(onboarding.weeklyRatePct != null
          ? { weeklyRatePct: onboarding.weeklyRatePct }
          : {}),
        ...(onboarding.mealPlan ? { mealPlan: onboarding.mealPlan } : {}),
        ...(onboarding.mealTimings && onboarding.mealTimings.length > 0
          ? { mealTimings: onboarding.mealTimings }
          : {}),
        ...(onboarding.proteinFactor != null
          ? { proteinFactor: onboarding.proteinFactor }
          : {}),
        ...(onboarding.weeklyDistribution != null
          ? { weeklyDistribution: onboarding.weeklyDistribution }
          : {}),
        ...(onboarding.cheatDays && onboarding.cheatDays.length > 0
          ? { cheatDays: onboarding.cheatDays }
          : {}),
        ...(onboarding.estimatedTargetDate != null
          ? {
              estimatedTargetDate:
                onboarding.estimatedTargetDate.toISOString(),
            }
          : {}),
      };
      setProfile(hydratedProfile);

      // Fire-and-forget — notification scheduling should never block the
      // user from entering the app.
      void (async () => {
        try {
          const settings = await loadNotificationSettings();
          await syncNotifications({ settings, profile: hydratedProfile });
        } catch (notifErr) {
          console.warn('Notification sync failed (non-fatal):', notifErr);
        }
      })();

      onboarding.reset();
      router.replace('/(tabs)');
    } catch (e) {
      console.error('Onboarding start failed:', e);
      console.error('Stack:', (e as Error)?.stack);
      Alert.alert(
        'セットアップに失敗しました',
        e instanceof Error ? e.message : String(e),
        [{ text: 'OK' }],
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {Platform.OS === 'ios' ? 'ステップ 4/4' : 'ステップ 3/3'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.checkIconRow}>
          <View
            style={[
              styles.checkCircle,
              { backgroundColor: colors.success + '15' },
            ]}
          >
            <Ionicons
              name="checkmark-circle"
              size={48}
              color={colors.success}
            />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            準備完了！
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            あなた専用のプランが作成されました
          </Text>
        </View>

        {/* Summary card */}
        <Card variant="elevated">
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
            入力内容
          </Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
              目標
            </Text>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>
              {GOAL_LABELS[onboarding.goalType]}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
              体重
            </Text>
            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
              {onboarding.currentWeightKg} kg
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
              身長
            </Text>
            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
              {onboarding.heightCm} cm
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
              トレーニング頻度
            </Text>
            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
              週{onboarding.trainingDaysPerWeek}日
            </Text>
          </View>
        </Card>

        {/* Calorie target card */}
        <Card variant="elevated">
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
            1日の目標カロリー
          </Text>
          <View style={styles.calorieRow}>
            <Text style={[styles.calorieNumber, { color: colors.calorie }]}>
              {targetCalories}
            </Text>
            <Text style={[styles.calorieUnit, { color: colors.textSecondary }]}>
              kcal/日
            </Text>
          </View>
          <View style={styles.tdeeInfo}>
            <Text style={[styles.tdeeText, { color: colors.textTertiary }]}>
              基礎代謝 {bmr} kcal / 活動代謝 {tdee} kcal
            </Text>
          </View>
        </Card>

        {/* Macro targets card */}
        <Card variant="elevated">
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
            PFC目標
          </Text>
          <View style={styles.macroList}>
            <View style={styles.macroRow}>
              <View
                style={[styles.macroDot, { backgroundColor: colors.protein }]}
              />
              <Text
                style={[styles.macroLabel, { color: colors.textSecondary }]}
              >
                タンパク質
              </Text>
              <Text
                style={[styles.macroValue, { color: colors.protein }]}
              >
                {macros.proteinG} g
              </Text>
            </View>
            <View style={styles.macroRow}>
              <View
                style={[styles.macroDot, { backgroundColor: colors.fat }]}
              />
              <Text
                style={[styles.macroLabel, { color: colors.textSecondary }]}
              >
                脂質
              </Text>
              <Text style={[styles.macroValue, { color: colors.fat }]}>
                {macros.fatG} g
              </Text>
            </View>
            <View style={styles.macroRow}>
              <View
                style={[styles.macroDot, { backgroundColor: colors.carb }]}
              />
              <Text
                style={[styles.macroLabel, { color: colors.textSecondary }]}
              >
                炭水化物
              </Text>
              <Text style={[styles.macroValue, { color: colors.carb }]}>
                {macros.carbG} g
              </Text>
            </View>
          </View>
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <ProgressDots
          current={Platform.OS === 'ios' ? 3 : 2}
          total={Platform.OS === 'ios' ? 4 : 3}
          colors={colors}
        />
        <View style={styles.buttonRow}>
          <Button
            title="戻る"
            onPress={() => router.back()}
            variant="outline"
            size="lg"
          />
          <View style={styles.buttonFlex}>
            <Button
              title="この内容で始める"
              onPress={handleStart}
              variant="primary"
              size="lg"
              fullWidth
              loading={saving}
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
  checkIconRow: {
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.titleLarge },
  subtitle: { ...typography.bodyMedium, textAlign: 'center' },
  cardTitle: { ...typography.titleSmall, marginBottom: spacing.md },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  summaryLabel: { ...typography.bodyMedium },
  summaryValue: { ...typography.titleSmall },
  calorieRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  calorieNumber: { ...typography.numberLarge },
  calorieUnit: { ...typography.bodyMedium },
  tdeeInfo: { marginTop: spacing.sm },
  tdeeText: { ...typography.bodySmall },
  macroList: { gap: spacing.md },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  macroDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  macroLabel: {
    ...typography.bodyMedium,
    flex: 1,
  },
  macroValue: {
    ...typography.numberMedium,
  },
  footer: { padding: spacing.xxl, gap: spacing.lg },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  buttonFlex: { flex: 1 },
});
