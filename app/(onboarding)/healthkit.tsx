import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
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

function ProgressDots({
  current,
  colors,
}: {
  current: number;
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <View style={dotStyles.container}>
      {[0, 1, 2, 3].map((i) => (
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
  activeDot: { width: 24 },
});

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

  const goNext = () => router.push('/(onboarding)/complete');

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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          ステップ 3/4
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
        <ProgressDots current={2} colors={colors} />
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
