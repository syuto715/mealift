import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { getColors } from '../../src/theme/tokens';
import { typography } from '../../src/theme/typography';
import { spacing } from '../../src/theme/spacing';
import { exchangeAuthCallback } from '../../src/infra/supabase/auth';
import { useAuthStore } from '../../src/stores/authStore';
import { useUIStore } from '../../src/stores/uiStore';

// Landed here from the email-confirmation deep link
// (mealift://auth/callback?code=…). Exchange the code for a session, then
// route the user into the app on success or back to login on failure.
export default function AuthCallbackScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const showToast = useUIStore((s) => s.showToast);

  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  // Strict-Mode / re-render guard: only run the exchange once per mount.
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const errParam = params.error;
    if (errParam) {
      const desc = params.error_description ?? 'メールリンクの処理に失敗しました';
      showToast(decodeURIComponent(desc), 'error');
      router.replace('/(auth)/login');
      return;
    }

    const code = params.code;
    if (!code) {
      showToast('確認リンクが無効です。もう一度お試しください。', 'error');
      router.replace('/(auth)/login');
      return;
    }

    (async () => {
      try {
        const { data, error } = await exchangeAuthCallback(
          `mealift://auth/callback?code=${encodeURIComponent(code)}`,
        );
        if (error || !data.session?.user) {
          throw error ?? new Error('No session returned');
        }
        setAuthenticated(data.session.user.id, data.session.user.email ?? undefined);
        showToast('メール認証が完了しました', 'success');
        router.replace('/(tabs)');
      } catch {
        showToast(
          '確認リンクの有効期限が切れているか、無効です。もう一度サインアップしてください。',
          'error',
        );
        router.replace('/(auth)/login');
      }
    })();
  }, [params.code, params.error, params.error_description, setAuthenticated, showToast]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          メール認証を確認しています…
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  label: { ...typography.bodyMedium },
});
