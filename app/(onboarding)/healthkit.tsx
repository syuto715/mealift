import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
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
import {
  isHealthKitAvailable,
  requestHealthKitPermissions,
} from '../../src/infra/services/healthKitService';
import { useHealthKitStore } from '../../src/stores/healthKitStore';

const BULLETS: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
}[] = [
  {
    icon: 'flame-outline',
    title: '消費カロリーを自動取得',
    body: 'アクティブエネルギーを読み取り、毎日の消費カロリーに反映します。',
  },
  {
    icon: 'shield-checkmark-outline',
    title: '読み取り専用',
    body: 'ヘルスケアへの書き込みは一切行いません。',
  },
  {
    icon: 'phone-portrait-outline',
    title: '端末内で処理',
    body: 'データは端末内でのみ処理され、サーバーには送信しません。',
  },
];

export default function HealthKitOnboardingScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const setEnabled = useHealthKitStore((s) => s.setEnabled);
  const setPermissionStatus = useHealthKitStore((s) => s.setPermissionStatus);
  const [busy, setBusy] = useState(false);

  // Phase D-10 — HealthKit is the terminal screen in the new
  // iOS onboarding flow (welcome → ... → complete → tier-preview
  // → healthkit → home). Pre-D-10 ordering was healthkit →
  // complete; the new flow puts /complete much earlier so
  // healthkit's "next" now means home. router.replace (not push)
  // so the user can't back-nav into the post-completion chain.
  const goNext = () => router.replace('/(tabs)/home');

  // Phase D-10 / kickoff §4 — defensive Platform check. The
  // canonical path only routes to this screen on iOS (tier-
  // preview's handleSkip + handleStartTrial branch), but a deep
  // link / dev-tools navigation could land an Android user
  // here. isHealthKitAvailable() at handleConnect time covers
  // the tap path (returns false → goNext), but the visible UI
  // would still render HealthKit-specific copy/icons before the
  // user tapped anything. Redirect on mount so non-iOS never
  // sees the screen at all.
  useEffect(() => {
    if (Platform.OS !== 'ios') {
      router.replace('/(tabs)/home');
    }
  }, []);

  const handleConnect = async () => {
    if (busy) return;
    if (!isHealthKitAvailable()) {
      setPermissionStatus('unsupported');
      goNext();
      return;
    }
    setBusy(true);
    try {
      const ok = await requestHealthKitPermissions();
      if (ok) {
        setEnabled(true);
        setPermissionStatus('granted');
      } else {
        setEnabled(false);
        setPermissionStatus('denied');
        Alert.alert(
          'アクセスが許可されませんでした',
          '後から設定画面で許可を変更できます。',
          [{ text: 'OK', onPress: goNext }],
        );
        return;
      }
    } catch (e) {
      console.error('[HealthKit onboarding] request failed', e);
    } finally {
      setBusy(false);
    }
    goNext();
  };

  const handleSkip = () => goNext();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Phase D-10 / Codex pass 1 Critical fix — removed the
          back-button TouchableOpacity. HealthKit is the terminal
          post-completion screen (welcome → ... → complete →
          tier-preview → healthkit → home), and the upstream
          progress-preview push leaves /progress-preview in the
          stack below the replace'd /complete → /tier-preview →
          /healthkit chain. Back-nav from here would pop to
          progress-preview, re-opening pre-completion state
          after onboardingCompleted=true had already landed in
          DB. The screen exits via Connect / Skip CTAs only.

          Sign-off violation fix — step indicator copy updated
          from the stale "ステップ 3/4" (pre-D-10 numbering when
          healthkit was screen 3 of a 4-screen flow) to a flow-
          state-agnostic "最後のステップ". Avoids divergence
          from ONBOARDING_ROUTES.healthkit.step on future
          renumbering. */}
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          最後のステップ
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: colors.primary + '15' },
            ]}
          >
            <Ionicons name="heart" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Appleヘルスケアと連携しますか？
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            運動による消費カロリーを自動で取得して、より正確な収支を表示します。
          </Text>
        </View>

        <Card>
          {BULLETS.map((b) => (
            <View key={b.title} style={styles.bullet}>
              <View
                style={[
                  styles.bulletIcon,
                  { backgroundColor: colors.primary + '15' },
                ]}
              >
                <Ionicons name={b.icon} size={18} color={colors.primary} />
              </View>
              <View style={styles.bulletText}>
                <Text
                  style={[styles.bulletTitle, { color: colors.textPrimary }]}
                >
                  {b.title}
                </Text>
                <Text
                  style={[styles.bulletBody, { color: colors.textSecondary }]}
                >
                  {b.body}
                </Text>
              </View>
            </View>
          ))}
        </Card>

        <Text style={[styles.note, { color: colors.textTertiary }]}>
          {Platform.OS === 'ios'
            ? 'あとから設定画面でいつでも変更できます。'
            : 'Appleヘルスケア連携は iPhone でのみご利用いただけます。'}
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        {/* Phase D-10 / Codex pass 1 Sign-off fix — removed the
            legacy 4-dot ProgressDots with current={2}. The dots
            reflected the pre-D-10 numbering (4-screen onboarding
            with healthkit as the 3rd dot). Post-D-10 healthkit
            is screen 15 of 15 (iOS), and LEGACY_OWN_HEADER_ROUTES
            already suppresses the layout-rendered ProgressHeader
            here, so the legacy dots were both wrong AND redundant
            with the "最後のステップ" copy in the screen header.
            ProgressDots component left importable for any future
            screen that wants a custom dot row. */}
        <View style={styles.buttonCol}>
          <Button
            title="連携する"
            onPress={handleConnect}
            variant="primary"
            size="lg"
            fullWidth
            loading={busy}
          />
          <Button
            title="スキップ"
            onPress={handleSkip}
            variant="ghost"
            size="lg"
            fullWidth
          />
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
  content: { padding: spacing.xxl, gap: spacing.lg },
  hero: { alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.titleLarge, textAlign: 'center' },
  subtitle: { ...typography.bodyMedium, textAlign: 'center' },
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  bulletIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletText: { flex: 1, gap: 2 },
  bulletTitle: { ...typography.titleSmall },
  bulletBody: { ...typography.bodySmall, lineHeight: 20 },
  note: { ...typography.bodySmall, textAlign: 'center' },
  footer: { padding: spacing.xxl, gap: spacing.lg },
  buttonCol: { gap: spacing.sm },
});
