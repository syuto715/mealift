import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, SegmentedControl } from '../../../src/components/ui';
import { useProfileStore } from '../../../src/stores/profileStore';
import { updateProfile as updateProfileRepo } from '../../../src/infra/repositories/profileRepository';
import { getSuggestionHistory } from '../../../src/infra/repositories/adaptiveGoalRepository';
import { AdaptiveGoalSuggestion } from '../../../src/types/adaptiveGoal';
import { AdaptiveGoalSensitivity } from '../../../src/types/profile';
import { formatDate } from '../../../src/utils/format';

const SENSITIVITY_SEGMENTS = [
  { label: '保守的', value: 'conservative' },
  { label: '標準', value: 'standard' },
  { label: '積極的', value: 'aggressive' },
];

const STATUS_LABELS: Record<string, string> = {
  pending: '保留',
  approved: '承認',
  dismissed: '却下',
};

export default function AdaptiveGoalSettingsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);
  const updateProfile = useProfileStore((s) => s.updateProfile);

  const [history, setHistory] = useState<AdaptiveGoalSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }
    getSuggestionHistory(profile.id)
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profile?.id]);

  const toggleEnabled = useCallback(async () => {
    if (!profile) return;
    const next = !profile.adaptiveGoalEnabled;
    await updateProfileRepo(profile.id, { adaptiveGoalEnabled: next });
    updateProfile({ adaptiveGoalEnabled: next });
  }, [profile, updateProfile]);

  const handleSensitivityChange = useCallback(
    async (val: string) => {
      if (!profile) return;
      const v = val as AdaptiveGoalSensitivity;
      await updateProfileRepo(profile.id, { adaptiveGoalSensitivity: v });
      updateProfile({ adaptiveGoalSensitivity: v });
    },
    [profile, updateProfile]
  );

  if (!profile) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>適応型目標調整</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>自動提案を有効化</Text>
              <Text style={[styles.sub, { color: colors.textSecondary }]}>
                実際の体重変化から代謝を推定し、目標カロリーの見直しを提案します。
              </Text>
            </View>
            <Switch value={profile.adaptiveGoalEnabled} onValueChange={toggleEnabled} />
          </View>
        </Card>

        <Card>
          <Text style={[styles.label, { color: colors.textPrimary }]}>提案の感度</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            保守的にすると大きな差分のときだけ、積極的にすると小さな差分でも提案します。
          </Text>
          <View style={{ marginTop: spacing.md }}>
            <SegmentedControl
              segments={SENSITIVITY_SEGMENTS}
              selectedValue={profile.adaptiveGoalSensitivity}
              onValueChange={handleSensitivityChange}
            />
          </View>
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>提案履歴</Text>
        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.lg }} />
        ) : history.length === 0 ? (
          <Card>
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              まだ提案はありません。
            </Text>
          </Card>
        ) : (
          history.map((s) => (
            <Card key={s.id}>
              <View style={styles.historyRow}>
                <Text style={[styles.historyDate, { color: colors.textSecondary }]}>
                  {formatDate(s.calculatedAt, 'yyyy/MM/dd HH:mm')}
                </Text>
                <Text
                  style={[
                    styles.historyStatus,
                    {
                      color:
                        s.status === 'approved'
                          ? colors.success
                          : s.status === 'dismissed'
                            ? colors.textTertiary
                            : colors.warning,
                    },
                  ]}
                >
                  {STATUS_LABELS[s.status] ?? s.status}
                </Text>
              </View>
              <Text style={[styles.historyValue, { color: colors.textPrimary }]}>
                {s.currentCalorieTarget} → {s.suggestedCalorieTarget} kcal
              </Text>
              <Text style={[styles.historyReason, { color: colors.textSecondary }]} numberOfLines={2}>
                {s.reason}
              </Text>
            </Card>
          ))
        )}
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
  title: { ...typography.titleMedium },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { ...typography.bodyLarge },
  sub: { ...typography.bodySmall, marginTop: spacing.xs },
  sectionTitle: { ...typography.titleSmall, marginTop: spacing.md },
  empty: { ...typography.bodyMedium, textAlign: 'center', paddingVertical: spacing.md },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  historyDate: { ...typography.labelMedium },
  historyStatus: { ...typography.labelMedium },
  historyValue: { ...typography.numberSmall, marginBottom: spacing.xs },
  historyReason: { ...typography.bodySmall, lineHeight: 18 },
});
