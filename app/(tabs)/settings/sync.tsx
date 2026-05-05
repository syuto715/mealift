import React, { useCallback, useEffect, useState } from 'react';
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
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Button, Card } from '../../../src/components/ui';
import { useSyncStatusStore } from '../../../src/stores/syncStatusStore';
import { useAuthStore } from '../../../src/stores/authStore';
import { useUIStore } from '../../../src/stores/uiStore';
import { getDatabase } from '../../../src/infra/database/connection';
import { syncAll } from '../../../src/infra/supabase/sync/syncOrchestrator';
import { isSupabaseConfigured } from '../../../src/infra/supabase/auth';
import { formatRelativeTime } from '../../../src/utils/relativeTime';

// Maps the orchestrator's currentResource string ('pull' | 'push' |
// 'submissions' | localTableName) to a JP label. Anything not in the
// map falls through to a generic "同期中..." — keeps the UI stable
// even if Phase 5 introduces a new resource without updating this.
const RESOURCE_LABELS: Record<string, string> = {
  pull: 'サーバーからダウンロード中…',
  push: 'サーバーへ送信中…',
  submissions: '投稿データ同期中…',
};

function resourceLabel(resource: string | null): string {
  if (resource === null) return '';
  return RESOURCE_LABELS[resource] ?? `同期中…（${resource}）`;
}

export default function SyncScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const showToast = useUIStore((s) => s.showToast);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLocalOnly = useAuthStore((s) => s.isLocalOnly);

  const state = useSyncStatusStore((s) => s.state);
  const currentResource = useSyncStatusStore((s) => s.currentResource);
  const lastSyncAt = useSyncStatusStore((s) => s.lastSyncAt);
  const lastError = useSyncStatusStore((s) => s.lastError);
  const pendingCount = useSyncStatusStore((s) => s.pendingCount);
  const clearError = useSyncStatusStore((s) => s.clearError);

  // Re-render the relative-time string every minute so "5 分前" becomes
  // "6 分前" without requiring a navigation re-mount. lightweight tick.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const isBusy = state === 'syncing' || state === 'claiming';
  const isCloudAvailable = isSupabaseConfigured && isAuthenticated && !isLocalOnly;

  const handleManualSync = useCallback(async () => {
    if (isBusy) return;
    if (!isCloudAvailable) {
      showToast(
        isLocalOnly
          ? 'ローカルモードでは同期できません'
          : 'クラウド同期はログイン後に利用できます',
        'info',
      );
      return;
    }
    try {
      const db = await getDatabase();
      // syncAll handles status-store transitions internally
      // (beginRun/setResource/finishRun). The orchestrator already
      // checks auth at pull/push entry, so a session lost between
      // button press and execution skips cleanly.
      await syncAll(db);
      showToast('同期完了', 'success');
    } catch {
      // syncAll's finishRun(error) already populated lastError on the
      // store; the toast is just a foreground confirmation.
      showToast('同期に失敗しました', 'error');
    }
  }, [isBusy, isCloudAvailable, isLocalOnly, showToast]);

  // State badge — big-picture indicator at the top of the screen.
  const stateBadge = ((): { label: string; color: string; icon: keyof typeof Ionicons.glyphMap } => {
    if (!isCloudAvailable) {
      return {
        label: 'ローカルモード',
        color: colors.textTertiary,
        icon: 'cloud-offline-outline',
      };
    }
    switch (state) {
      case 'claiming':
        return { label: 'アカウント識別中…', color: colors.primary, icon: 'person-outline' };
      case 'syncing':
        return { label: '同期中…', color: colors.primary, icon: 'sync-outline' };
      case 'error':
        return { label: 'エラー', color: colors.error, icon: 'alert-circle-outline' };
      case 'idle':
      default:
        return { label: '同期済み', color: colors.success, icon: 'checkmark-circle-outline' };
    }
  })();

  // Re-read tick to force re-render on the minute ticker so
  // formatRelativeTime gets a fresh "now". The `void tick` line silences
  // the unused-variable warning; the dependency is real.
  void tick;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBtn}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>クラウド同期</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Status row */}
        <Card>
          <View style={styles.statusRow}>
            <View style={[styles.iconWrap, { backgroundColor: stateBadge.color + '15' }]}>
              <Ionicons name={stateBadge.icon} size={24} color={stateBadge.color} />
            </View>
            <View style={styles.statusText}>
              <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>状態</Text>
              <Text style={[styles.statusValue, { color: stateBadge.color }]}>
                {stateBadge.label}
              </Text>
              {isBusy && currentResource ? (
                <Text style={[styles.statusSub, { color: colors.textSecondary }]}>
                  {resourceLabel(currentResource)}
                </Text>
              ) : null}
            </View>
          </View>
        </Card>

        {/* Manual sync button */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            今すぐ同期
          </Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            通常はログイン時とアプリ起動時に自動で同期されます。手動で実行したい場合は下のボタンをタップしてください。
          </Text>
          <Button
            title={isBusy ? '同期中…' : '今すぐ同期'}
            onPress={handleManualSync}
            variant="primary"
            size="lg"
            fullWidth
            loading={isBusy}
            disabled={isBusy || !isCloudAvailable}
          />
        </Card>

        {/* Detail rows */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>詳細</Text>
          <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
              最後の同期
            </Text>
            <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
              {formatRelativeTime(lastSyncAt)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
              未同期
            </Text>
            <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
              {pendingCount === 0 ? 'なし' : `${pendingCount} 件`}
            </Text>
          </View>
        </Card>

        {/* Last-error card — only when there is one */}
        {lastError ? (
          <Card style={{ backgroundColor: colors.error + '10' }}>
            <View style={styles.errorHeader}>
              <Ionicons name="alert-circle" size={20} color={colors.error} />
              <Text style={[styles.errorTitle, { color: colors.error }]}>
                最後のエラー
              </Text>
            </View>
            <Text style={[styles.errorBody, { color: colors.textPrimary }]}>
              {lastError}
            </Text>
            <TouchableOpacity
              style={[styles.errorClear, { borderColor: colors.error }]}
              onPress={clearError}
              activeOpacity={0.7}
            >
              <Text style={[styles.errorClearText, { color: colors.error }]}>
                エラーを消す
              </Text>
            </TouchableOpacity>
          </Card>
        ) : null}

        {/* Helper / explainer */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            クラウド同期について
          </Text>
          <View style={styles.bullet}>
            <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
            <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
              記録（体重・食事・トレーニング）はオフラインでも保存され、ネット復帰後に自動で同期されます
            </Text>
          </View>
          <View style={styles.bullet}>
            <Ionicons name="phone-portrait-outline" size={18} color={colors.primary} />
            <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
              機種変更時は新しい端末で Apple またはメールでサインインすると、データを復元できます
            </Text>
          </View>
          <View style={styles.bullet}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
            <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
              データは暗号化されて転送・保存されます
            </Text>
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
  statusValue: { ...typography.bodyMedium, fontWeight: '600' },
  statusSub: { ...typography.bodySmall, marginTop: spacing.xs },
  sectionTitle: {
    ...typography.titleSmall,
    marginBottom: spacing.sm,
  },
  bodyText: {
    ...typography.bodySmall,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailLabel: { ...typography.bodyMedium },
  detailValue: { ...typography.bodyMedium, fontWeight: '600' },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  errorTitle: { ...typography.titleSmall },
  errorBody: { ...typography.bodySmall, lineHeight: 20 },
  errorClear: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  errorClearText: { ...typography.labelMedium },
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
});
