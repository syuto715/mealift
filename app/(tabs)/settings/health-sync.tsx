import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  Switch,
  Alert,
  Linking,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card } from '../../../src/components/ui';
import {
  isHealthKitAvailable,
  requestHealthKitPermissions,
} from '../../../src/infra/services/healthKitService';
import { useHealthKitStore } from '../../../src/stores/healthKitStore';

export default function HealthKitSettingsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const queryClient = useQueryClient();

  const enabled = useHealthKitStore((s) => s.enabled);
  const permissionStatus = useHealthKitStore((s) => s.permissionStatus);
  const setEnabled = useHealthKitStore((s) => s.setEnabled);
  const setPermissionStatus = useHealthKitStore((s) => s.setPermissionStatus);

  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const avail = isHealthKitAvailable();
    setAvailable(avail);
    if (!avail && permissionStatus !== 'unsupported') {
      setPermissionStatus('unsupported');
    }
  }, [permissionStatus, setPermissionStatus]);

  const handleToggle = useCallback(
    async (nextValue: boolean) => {
      if (busy) return;

      if (!nextValue) {
        // Opt-out is always synchronous — no permission revocation via SDK;
        // we just stop querying HealthKit. The user can revoke the read
        // scope entirely in iOS Settings → プライバシー if they want.
        setEnabled(false);
        queryClient.invalidateQueries({ queryKey: ['healthkit'] });
        return;
      }

      if (!available) {
        Alert.alert(
          '利用できません',
          'この端末ではAppleヘルスケアを利用できません。',
        );
        return;
      }

      setBusy(true);
      try {
        const ok = await requestHealthKitPermissions();
        if (ok) {
          setEnabled(true);
          setPermissionStatus('granted');
          queryClient.invalidateQueries({ queryKey: ['healthkit'] });
        } else {
          setEnabled(false);
          setPermissionStatus('denied');
          Alert.alert(
            'アクセスが許可されませんでした',
            'Appleヘルスケアへのアクセスを許可すると、消費カロリーを自動的に取得できます。iOS の設定から許可を変更できます。',
            [
              { text: 'あとで', style: 'cancel' },
              { text: '設定を開く', onPress: () => Linking.openSettings() },
            ],
          );
        }
      } catch (e) {
        console.error('[HealthKit] toggle flow failed', e);
        setEnabled(false);
        Alert.alert(
          'エラー',
          'Appleヘルスケアとの連携中にエラーが発生しました。',
        );
      } finally {
        setBusy(false);
      }
    },
    [available, busy, queryClient, setEnabled, setPermissionStatus],
  );

  const statusLabel =
    !available
      ? '利用できません'
      : enabled && permissionStatus === 'granted'
        ? '連携済み'
        : permissionStatus === 'denied'
          ? 'アクセス拒否'
          : '未連携';

  const statusColor =
    !available
      ? colors.textTertiary
      : enabled && permissionStatus === 'granted'
        ? colors.success
        : permissionStatus === 'denied'
          ? colors.error
          : colors.textTertiary;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBtn}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Appleヘルスケア連携
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Status + toggle row */}
        <Card>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: colors.primary + '15' },
              ]}
            >
              <Ionicons name="heart" size={24} color={colors.primary} />
            </View>
            <View style={styles.statusText}>
              <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>
                Appleヘルスケア
              </Text>
              <Text style={[styles.statusValue, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
            <Switch
              value={enabled && permissionStatus === 'granted'}
              onValueChange={handleToggle}
              disabled={!available || busy}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={
                enabled && permissionStatus === 'granted'
                  ? colors.primary
                  : colors.surface
              }
            />
          </View>
        </Card>

        {/* Explainer */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            連携でできること
          </Text>
          <View style={styles.bullet}>
            <Ionicons name="flame-outline" size={18} color={colors.primary} />
            <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
              アクティブエネルギーを自動で取得し、消費カロリーに加算します
            </Text>
          </View>
          <View style={styles.bullet}>
            <Ionicons
              name="shield-checkmark-outline"
              size={18}
              color={colors.primary}
            />
            <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
              ヘルスケアへの書き込みは行いません（読み取り専用）
            </Text>
          </View>
          <View style={styles.bullet}>
            <Ionicons
              name="phone-portrait-outline"
              size={18}
              color={colors.primary}
            />
            <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
              データは端末内のみで処理され、サーバーには送信しません
            </Text>
          </View>
        </Card>

        {/* Denied-state help */}
        {permissionStatus === 'denied' && (
          <Card style={{ backgroundColor: colors.error + '08' }}>
            <Text style={[styles.helpTitle, { color: colors.error }]}>
              アクセスが拒否されています
            </Text>
            <Text
              style={[styles.helpBody, { color: colors.textSecondary }]}
            >
              iOS の設定 →「プライバシーとセキュリティ」→「ヘルスケア」→
              「ミーリフト」から、アクティブエネルギーの読み取りを許可してください。
            </Text>
            <TouchableOpacity
              style={[styles.settingsButton, { borderColor: colors.error }]}
              onPress={() => Linking.openSettings()}
              activeOpacity={0.7}
            >
              <Ionicons name="open-outline" size={16} color={colors.error} />
              <Text style={[styles.settingsButtonText, { color: colors.error }]}>
                iOS 設定を開く
              </Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Non-iOS / unavailable fallback */}
        {!available && (
          <Card>
            <Text style={[styles.helpBody, { color: colors.textSecondary }]}>
              {Platform.OS === 'ios'
                ? 'この端末ではHealthKitを利用できません（iPad など）。iPhone でご利用ください。'
                : 'Appleヘルスケア連携は iPhone でのみご利用いただけます。'}
            </Text>
          </Card>
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusText: { flex: 1, gap: 2 },
  statusTitle: { ...typography.titleSmall },
  statusValue: { ...typography.bodySmall, fontWeight: '600' },
  sectionTitle: { ...typography.titleSmall, marginBottom: spacing.sm },
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  bulletText: {
    ...typography.bodySmall,
    lineHeight: 20,
    flex: 1,
  },
  helpTitle: {
    ...typography.titleSmall,
    marginBottom: spacing.sm,
  },
  helpBody: {
    ...typography.bodySmall,
    lineHeight: 20,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.md,
  },
  settingsButtonText: {
    ...typography.labelLarge,
    fontWeight: '600',
  },
});
