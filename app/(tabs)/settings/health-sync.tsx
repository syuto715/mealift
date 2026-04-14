import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, Button } from '../../../src/components/ui';
import { canUse } from '../../../src/infra/services/subscriptionService';
import { HealthSyncSettings } from '../../../src/types/healthSync';
import {
  DEFAULT_HEALTH_SETTINGS,
  loadHealthSyncSettings,
  saveHealthSyncSettings,
  getHealthPlatformName,
  isHealthAvailable,
  requestHealthPermissions,
  performFullSync,
} from '../../../src/infra/services/healthSyncService';
import { useProfileStore } from '../../../src/stores/profileStore';

export default function HealthSyncScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const hasAccess = canUse('healthSync');
  const profile = useProfileStore((s) => s.profile);

  const [settings, setSettings] = useState<HealthSyncSettings>(DEFAULT_HEALTH_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const platformName = getHealthPlatformName();

  useEffect(() => {
    (async () => {
      const [s, avail] = await Promise.all([
        loadHealthSyncSettings(),
        isHealthAvailable(),
      ]);
      setSettings(s);
      setAvailable(avail);
      setLoaded(true);
    })();
  }, []);

  const save = useCallback(async (updated: HealthSyncSettings) => {
    setSettings(updated);
    await saveHealthSyncSettings(updated);
  }, []);

  const handleToggleSync = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const avail = await isHealthAvailable();
      if (!avail) {
        Alert.alert(
          '利用できません',
          `${platformName}はこのデバイスでは利用できません。EASビルドでアプリをインストールしてください。`,
        );
        return;
      }
      const granted = await requestHealthPermissions();
      if (!granted) {
        Alert.alert(
          'アクセスが必要です',
          `${platformName}へのアクセスを許可してください。`,
        );
        return;
      }
    }
    save({ ...settings, enabled });
  }, [settings, save, platformName]);

  const handleSync = useCallback(async () => {
    if (!profile?.id) return;
    setSyncing(true);
    const result = await performFullSync(profile.id);
    setSyncing(false);
    if (result.synced) {
      const updated = await loadHealthSyncSettings();
      setSettings(updated);
      Alert.alert('同期完了', 'ヘルスケアデータを同期しました。');
    } else if (result.error) {
      Alert.alert('同期エラー', result.error);
    }
  }, [profile?.id]);

  if (!loaded) return null;

  // Plus+ gate
  if (!hasAccess) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>ヘルスケア連携</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.lockedContainer}>
          <Ionicons name="heart-circle-outline" size={56} color={colors.primary} />
          <Text style={[styles.lockedTitle, { color: colors.textPrimary }]}>
            Plus+プランで利用可能
          </Text>
          <Text style={[styles.lockedDesc, { color: colors.textSecondary }]}>
            {platformName}との連携で歩数・消費カロリー・体重を自動同期できます。
          </Text>
          <Button
            title="プランを見る"
            onPress={() => router.push('/(tabs)/settings/subscription')}
            variant="primary"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>ヘルスケア連携</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Platform info */}
        <Card>
          <View style={styles.platformRow}>
            <View style={[styles.platformIcon, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="heart" size={28} color={colors.primary} />
            </View>
            <View style={styles.platformText}>
              <Text style={[styles.platformName, { color: colors.textPrimary }]}>
                {platformName}
              </Text>
              <Text style={[styles.platformStatus, { color: available ? colors.success : colors.textTertiary }]}>
                {available ? '接続可能' : '開発ビルドで利用可能'}
              </Text>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={handleToggleSync}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={settings.enabled ? colors.primary : colors.surface}
            />
          </View>
        </Card>

        {/* Sync options */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>同期データ</Text>
        <Card padding="none">
          <SyncToggleRow
            icon="scale-outline"
            label="体重"
            value={settings.syncWeight}
            onValueChange={(v) => save({ ...settings, syncWeight: v })}
            disabled={!settings.enabled}
            colors={colors}
          />
          <SyncToggleRow
            icon="footsteps-outline"
            label="歩数"
            value={settings.syncSteps}
            onValueChange={(v) => save({ ...settings, syncSteps: v })}
            disabled={!settings.enabled}
            colors={colors}
          />
          <SyncToggleRow
            icon="flame-outline"
            label="消費カロリー"
            value={settings.syncCalories}
            onValueChange={(v) => save({ ...settings, syncCalories: v })}
            disabled={!settings.enabled}
            colors={colors}
          />
          <SyncToggleRow
            icon="barbell-outline"
            label="ワークアウト"
            value={settings.syncWorkouts}
            onValueChange={(v) => save({ ...settings, syncWorkouts: v })}
            disabled={!settings.enabled}
            colors={colors}
          />
        </Card>

        {/* Manual sync */}
        {settings.enabled && (
          <Card>
            <Button
              title={syncing ? '同期中...' : '今すぐ同期'}
              onPress={handleSync}
              variant="primary"
              fullWidth
              loading={syncing}
            />
            {settings.lastSyncAt && (
              <Text style={[styles.lastSync, { color: colors.textTertiary }]}>
                最終同期: {new Date(settings.lastSyncAt).toLocaleString('ja-JP')}
              </Text>
            )}
          </Card>
        )}

        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          データは双方向に同期されます。ミーリフトで記録した体重やワークアウトは
          {platformName}にも反映されます。
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

function SyncToggleRow({
  icon,
  label,
  value,
  onValueChange,
  disabled,
  colors,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled: boolean;
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <View style={[styles.toggleRow, { borderBottomColor: colors.border, opacity: disabled ? 0.4 : 1 }]}>
      <Ionicons name={icon} size={20} color={colors.textSecondary} />
      <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primaryLight }}
        thumbColor={value ? colors.primary : colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  headerBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { ...typography.titleMedium },
  scroll: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxxl,
  },
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  platformIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  platformText: {
    flex: 1,
    gap: 2,
  },
  platformName: { ...typography.titleSmall },
  platformStatus: { ...typography.bodySmall },
  sectionLabel: {
    ...typography.labelMedium,
    marginTop: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: 0.5,
  },
  toggleLabel: {
    ...typography.bodyMedium,
    flex: 1,
  },
  lastSync: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  hint: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 20,
  },
  lockedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxxl,
    gap: spacing.lg,
  },
  lockedTitle: { ...typography.titleSmall },
  lockedDesc: {
    ...typography.bodyMedium,
    textAlign: 'center',
    lineHeight: 22,
  },
});
