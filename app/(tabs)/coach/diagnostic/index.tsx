import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useProfileStore } from '../../../../src/stores/profileStore';
import { useSubscription } from '../../../../src/hooks/useSubscription';
import { useDiagnosticStore } from '../../../../src/stores/diagnosticStore';
import { PersonaHeader } from '../../../../src/components/coach/PersonaHeader';
import { ProInlineCTA } from '../../../../src/components/shared/ProInlineCTA';
import { getColors } from '../../../../src/theme/tokens';
import { typography } from '../../../../src/theme/typography';
import { spacing } from '../../../../src/theme/spacing';

// v1.5 Stage 1 Phase 1.3 — diagnostic wizard entry.
// Plus 以上のみ。 Free user は ProInlineCTA。 Start を tap すると
// `/(tabs)/coach/diagnostic/0` (first question) に navigate。
export default function DiagnosticEntry() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const profile = useProfileStore((s) => s.profile);
  const userId = profile?.id ?? '';
  const sub = useSubscription();
  const hasAccess = sub.hasFeature('aiCoachGeneration');
  const clearWizard = useDiagnosticStore((s) => s.clearWizard);

  const handleStart = () => {
    // Fresh start — wipe any prior incomplete wizard for this
    // user. Cross-account safety already lives in
    // diagnosticStore.reset (called from authStore.logout).
    if (userId) clearWizard(userId);
    router.push('/(tabs)/coach/diagnostic/0');
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={[styles.headerRow, { borderColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="戻る"
          accessibilityHint="コーチタブに戻ります"
          style={styles.backButton}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={colors.textPrimary}
          />
        </TouchableOpacity>
        <PersonaHeader testID="diagnostic-entry-persona-header" />
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <Ionicons
          name="clipboard-outline"
          size={48}
          color={colors.primary}
          style={styles.icon}
        />
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          ミー先生による診断
        </Text>
        <Text style={[styles.copy, { color: colors.textSecondary }]}>
          いくつかの質問にお答えいただくと、 あなた専用のトレーニング
          ルーティンをミー先生が生成します。 所要時間はおよそ 2 分です。
        </Text>

        {!hasAccess ? (
          <View style={styles.lockedBlock} testID="diagnostic-locked">
            <Text style={[styles.lockedBody, { color: colors.textSecondary }]}>
              診断機能は Plus / Pro でご利用いただけます。
            </Text>
            <ProInlineCTA
              label="ミー先生に診断してもらうには Plus へ →"
              variant="card"
            />
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleStart}
            accessibilityRole="button"
            accessibilityLabel="診断を開始する"
            accessibilityHint="7 つの質問にお答えいただきます。 所要時間 約 2 分"
            style={[styles.startButton, { backgroundColor: colors.primary }]}
            testID="diagnostic-start-button"
          >
            <Ionicons name="sparkles" size={18} color="#FFFFFF" />
            <Text style={styles.startButtonLabel}>診断を開始する</Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.footer, { color: colors.textTertiary }]}>
          ミー先生 (AI コーチ)
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
  },
  backButton: { paddingRight: spacing.sm },
  headerSpacer: { flex: 1 },
  body: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  icon: { marginTop: spacing.lg },
  title: {
    ...typography.titleLarge,
    fontWeight: '700',
    textAlign: 'center',
  },
  copy: {
    ...typography.bodyMedium,
    textAlign: 'center',
    lineHeight: 22,
  },
  lockedBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  lockedBody: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 9999,
    marginTop: spacing.lg,
  },
  startButtonLabel: {
    ...typography.labelLarge,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  footer: {
    ...typography.labelSmall,
    marginTop: 'auto',
    paddingBottom: spacing.lg,
  },
});
