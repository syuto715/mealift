import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, SegmentedControl, Modal, Button } from '../../../src/components/ui';
import { useAuthStore } from '../../../src/stores/authStore';
import { useProfileStore } from '../../../src/stores/profileStore';
import { APP_CONFIG } from '../../../src/constants/config';
import { canUse } from '../../../src/infra/services/subscriptionService';
import { exportCsv, ExportType, TYPE_LABELS } from '../../../src/infra/services/csvExportService';
import { LEGAL } from '../../../src/constants/legal';
import { resetAllData } from '../../../src/infra/database/connection';

const STORAGE_KEY_REST_TIMER = 'setting_rest_timer';
const STORAGE_KEY_THEME = 'setting_theme';

const REST_TIMER_SEGMENTS = [
  { label: '30秒', value: '30' },
  { label: '60秒', value: '60' },
  { label: '90秒', value: '90' },
  { label: '120秒', value: '120' },
  { label: '180秒', value: '180' },
];

const THEME_SEGMENTS = [
  { label: 'ライト', value: 'light' },
  { label: 'ダーク', value: 'dark' },
  { label: 'システム', value: 'system' },
];

interface SettingsRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof getColors>;
  rightElement?: React.ReactNode;
}

function SettingsRow({ icon, label, onPress, colors, rightElement }: SettingsRowProps) {
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Ionicons name={icon} size={22} color={colors.textSecondary} />
      <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
      {rightElement ?? (
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      )}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const { isLocalOnly, logout } = useAuthStore();
  const profile = useProfileStore((s) => s.profile);

  const [restTimer, setRestTimer] = useState('90');
  const [themePref, setThemePref] = useState('system');
  const [aboutModalVisible, setAboutModalVisible] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const [rt, th] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY_REST_TIMER),
        AsyncStorage.getItem(STORAGE_KEY_THEME),
      ]);
      if (rt !== null) setRestTimer(rt);
      if (th !== null) setThemePref(th);
    })();
  }, []);

  const handleRestTimerChange = useCallback(async (val: string) => {
    setRestTimer(val);
    await AsyncStorage.setItem(STORAGE_KEY_REST_TIMER, val);
  }, []);

  const handleThemeChange = useCallback(async (val: string) => {
    setThemePref(val);
    await AsyncStorage.setItem(STORAGE_KEY_THEME, val);
  }, []);

  const handleExportData = useCallback(() => {
    if (!canUse('exportData')) {
      Alert.alert('Plus+プラン', 'データエクスポートはPlus+プラン以上で利用できます。');
      return;
    }

    const options: { label: string; type: ExportType }[] = [
      { label: TYPE_LABELS.weight, type: 'weight' },
      { label: TYPE_LABELS.nutrition, type: 'nutrition' },
      { label: TYPE_LABELS.training, type: 'training' },
      { label: TYPE_LABELS.all, type: 'all' },
    ];

    Alert.alert(
      'データエクスポート',
      'エクスポートするデータを選択してください',
      [
        ...options.map((opt) => ({
          text: opt.label,
          onPress: async () => {
            if (exporting) return;
            setExporting(true);
            try {
              await exportCsv(opt.type, profile?.id ?? '');
            } catch {
              Alert.alert('エラー', 'データのエクスポートに失敗しました。');
            } finally {
              setExporting(false);
            }
          },
        })),
        { text: 'キャンセル', style: 'cancel' },
      ],
    );
  }, [profile?.id, exporting]);

  const handleResetData = useCallback(() => {
    Alert.alert(
      'すべてのデータを削除',
      '本当にすべてのデータを削除しますか？この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetAllData();
              await AsyncStorage.clear();
              router.replace('/(auth)/login');
            } catch {
              Alert.alert('エラー', 'データの削除に失敗しました');
            }
          },
        },
      ],
    );
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert('ログアウト', 'ログアウトしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'ログアウト',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }, [logout]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>設定</Text>

        <Card padding="none">
          <SettingsRow
            icon="person-outline"
            label="プロフィール"
            onPress={() => router.push('/(tabs)/settings/profile')}
            colors={colors}
          />
          <SettingsRow
            icon="flag-outline"
            label="目標設定"
            onPress={() => router.push('/(tabs)/settings/goals')}
            colors={colors}
          />
        </Card>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>通知</Text>
        <Card padding="none">
          <SettingsRow
            icon="notifications-outline"
            label="通知設定"
            onPress={() => router.push('/(tabs)/settings/notifications')}
            colors={colors}
          />
        </Card>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>トレーニング</Text>
        <Card padding="none">
          <SettingsRow
            icon="barbell-outline"
            label="カスタム種目一覧"
            onPress={() => router.push('/(tabs)/settings/custom-exercises')}
            colors={colors}
          />
        </Card>
        <Card>
          <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
            デフォルト休憩タイマー
          </Text>
          <SegmentedControl
            segments={REST_TIMER_SEGMENTS}
            selectedValue={restTimer}
            onValueChange={handleRestTimerChange}
          />
        </Card>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ヘルスケア連携</Text>
        <Card padding="none">
          <SettingsRow
            icon="heart-outline"
            label="Apple Health / Health Connect"
            onPress={() => router.push('/(tabs)/settings/health-sync')}
            colors={colors}
          />
        </Card>

        {canUse('aiNutritionEstimate') && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>AI栄養推定</Text>
            <Card>
              <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
                AI栄養推定
              </Text>
              <Text style={[styles.aiDescription, { color: colors.textSecondary }]}>
                Proプランで料理名からAIが栄養素を推定します。
              </Text>
            </Card>
          </>
        )}

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>表示</Text>
        <Card>
          <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
            テーマ
          </Text>
          <SegmentedControl
            segments={THEME_SEGMENTS}
            selectedValue={themePref}
            onValueChange={handleThemeChange}
          />
        </Card>

        <Card padding="none">
          <SettingsRow
            icon="diamond-outline"
            label="プラン管理"
            onPress={() => router.push('/(tabs)/settings/subscription')}
            colors={colors}
          />
          <SettingsRow
            icon="download-outline"
            label="データエクスポート"
            onPress={handleExportData}
            colors={colors}
          />
        </Card>

        <Card padding="none">
          <SettingsRow
            icon="information-circle-outline"
            label="アプリについて"
            onPress={() => setAboutModalVisible(true)}
            colors={colors}
          />
        </Card>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>データ管理</Text>
        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: colors.error + '15' }]}
          onPress={handleResetData}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={20} color={colors.error} />
          <Text style={[styles.logoutText, { color: colors.error }]}>すべてのデータを削除</Text>
        </TouchableOpacity>

        {!isLocalOnly && (
          <TouchableOpacity
            style={[styles.logoutButton, { backgroundColor: colors.error + '15' }]}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={[styles.logoutText, { color: colors.error }]}>ログアウト</Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.version, { color: colors.textTertiary }]}>
          {APP_CONFIG.APP_NAME} v{APP_CONFIG.VERSION}
        </Text>
      </ScrollView>

      <Modal
        visible={aboutModalVisible}
        onClose={() => setAboutModalVisible(false)}
        title="アプリについて"
      >
        <View style={styles.aboutBody}>
          <Text style={[styles.aboutAppName, { color: colors.textPrimary }]}>
            {APP_CONFIG.APP_NAME}
          </Text>
          <Text style={[styles.aboutVersion, { color: colors.textSecondary }]}>
            バージョン {APP_CONFIG.VERSION}
          </Text>
          <View style={styles.aboutLinks}>
            <TouchableOpacity
              style={[styles.aboutLinkRow, { borderBottomColor: colors.border }]}
              onPress={() => Linking.openURL(LEGAL.termsOfServiceUrl)}
            >
              <Text style={[styles.aboutLinkText, { color: colors.primary }]}>利用規約</Text>
              <Ionicons name="open-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.aboutLinkRow, { borderBottomColor: colors.border }]}
              onPress={() => Linking.openURL(LEGAL.privacyPolicyUrl)}
            >
              <Text style={[styles.aboutLinkText, { color: colors.primary }]}>プライバシーポリシー</Text>
              <Ionicons name="open-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.aboutLinkRow, { borderBottomColor: colors.border }]}
              onPress={() => Linking.openURL(`mailto:${LEGAL.supportEmail}`)}
            >
              <Text style={[styles.aboutLinkText, { color: colors.primary }]}>お問い合わせ</Text>
              <Ionicons name="mail-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.aboutCopyright, { color: colors.textTertiary }]}>
            {LEGAL.copyright}
          </Text>
          <Button
            title="閉じる"
            onPress={() => setAboutModalVisible(false)}
            variant="outline"
            fullWidth
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxxl },
  title: { ...typography.titleLarge },
  sectionLabel: { ...typography.titleSmall, marginTop: spacing.sm },
  settingLabel: { ...typography.bodyMedium, marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: 0.5,
    minHeight: 52,
  },
  rowLabel: { ...typography.bodyLarge, flex: 1 },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  logoutText: { ...typography.labelLarge },
  version: { ...typography.bodySmall, textAlign: 'center', marginTop: spacing.lg },
  aboutBody: { gap: spacing.lg, alignItems: 'center' },
  aboutAppName: { ...typography.titleLarge },
  aboutVersion: { ...typography.bodyMedium },
  aboutLinks: { width: '100%', gap: 0 },
  aboutLinkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  aboutLinkText: { ...typography.bodyMedium },
  aboutCopyright: { ...typography.bodySmall, marginTop: spacing.sm },
  aiDescription: { ...typography.bodyMedium },
});
