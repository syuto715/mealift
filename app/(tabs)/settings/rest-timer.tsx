import React, { useEffect, useState, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Switch,
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
import {
  loadRestTimerSettings,
  saveRestTimerSettings,
} from '../../../src/infra/services/restTimerService';
import { RestTimerSettings, DEFAULT_REST_TIMER_SETTINGS } from '../../../src/types/restTimer';
import { canUse } from '../../../src/infra/services/subscriptionService';

const DURATION_SEGMENTS = [
  { label: '30秒', value: '30' },
  { label: '60秒', value: '60' },
  { label: '90秒', value: '90' },
  { label: '120秒', value: '120' },
  { label: '180秒', value: '180' },
  { label: '240秒', value: '240' },
];

export default function RestTimerSettingsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const [settings, setSettings] = useState<RestTimerSettings>(DEFAULT_REST_TIMER_SETTINGS);

  useEffect(() => {
    loadRestTimerSettings().then(setSettings).catch(() => {});
  }, []);

  const update = useCallback(
    async (patch: Partial<RestTimerSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      await saveRestTimerSettings(next);
    },
    [settings]
  );

  const perExerciseLocked = !canUse('restTimerPerExercise');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>休憩タイマー</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>休憩タイマーを有効化</Text>
            <Switch value={settings.enabled} onValueChange={(v) => update({ enabled: v })} />
          </View>
        </Card>

        <Card>
          <Text style={[styles.label, { color: colors.textPrimary }]}>デフォルト時間</Text>
          <View style={{ marginTop: spacing.md }}>
            <SegmentedControl
              segments={DURATION_SEGMENTS}
              selectedValue={String(settings.defaultSeconds)}
              onValueChange={(v) => update({ defaultSeconds: Number(v) })}
            />
          </View>
        </Card>

        <Card>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>セット完了時に自動開始</Text>
            <Switch value={settings.autoStart} onValueChange={(v) => update({ autoStart: v })} />
          </View>
        </Card>

        <Card>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>バイブレーション</Text>
            <Switch
              value={settings.vibrationEnabled}
              onValueChange={(v) => update({ vibrationEnabled: v })}
            />
          </View>
        </Card>

        <Card>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>音</Text>
            <Switch
              value={settings.soundEnabled}
              onValueChange={(v) => update({ soundEnabled: v })}
            />
          </View>
        </Card>

        <Card>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>
                種目ごとの時間を優先
              </Text>
              <Text style={[styles.sub, { color: colors.textSecondary }]}>
                {perExerciseLocked
                  ? 'Plusプランで利用できます'
                  : '種目ごとに設定されている休憩時間を使います'}
              </Text>
            </View>
            <Switch
              value={!perExerciseLocked && settings.perExerciseOverride}
              onValueChange={(v) => {
                if (!perExerciseLocked) {
                  void update({ perExerciseOverride: v });
                }
              }}
              disabled={perExerciseLocked}
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
  title: { ...typography.titleMedium },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { ...typography.bodyLarge, flex: 1 },
  sub: { ...typography.bodySmall, marginTop: spacing.xs },
});
