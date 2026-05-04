import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod/v4';
import { getColors, radius } from '../../src/theme/tokens';
import { typography } from '../../src/theme/typography';
import { spacing } from '../../src/theme/spacing';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Button, Input } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { useUIStore } from '../../src/stores/uiStore';
import { isSupabaseConfigured } from '../../src/infra/supabase/auth';
import { useAppleSignIn } from '../../src/hooks/useAppleSignIn';

const loginSchema = z.object({
  email: z.email('有効なメールアドレスを入力してください'),
  password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
});

export default function LoginScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const login = useAuthStore((s) => s.login);
  const startLocalMode = useAuthStore((s) => s.startLocalMode);
  const showToast = useUIStore((s) => s.showToast);
  const apple = useAppleSignIn();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const clearErrors = useCallback(() => {
    setEmailError('');
    setPasswordError('');
  }, []);

  const handleLogin = useCallback(async () => {
    clearErrors();

    const result = loginSchema.safeParse({ email: email.trim(), password });
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path[0];
        if (path === 'email') {
          setEmailError(issue.message);
        } else if (path === 'password') {
          setPasswordError(issue.message);
        }
      }
      return;
    }

    if (!isSupabaseConfigured) {
      showToast(
        'Supabaseが設定されていません。ローカルモードをお使いください。',
        'error',
      );
      return;
    }

    setLoading(true);
    try {
      const { error } = await login(email.trim(), password);
      if (error) {
        showToast(error, 'error');
        return;
      }
      router.replace('/');
    } finally {
      setLoading(false);
    }
  }, [email, password, login, showToast, clearErrors]);

  const handleLocalMode = useCallback(() => {
    startLocalMode();
    router.replace('/(onboarding)/welcome');
  }, [startLocalMode]);

  const handleGoToRegister = useCallback(() => {
    router.push('/(auth)/register');
  }, []);

  const handleAppleSignIn = useCallback(async () => {
    if (!isSupabaseConfigured) {
      showToast(
        'Supabaseが設定されていません。ローカルモードをお使いください。',
        'error',
      );
      return;
    }
    const result = await apple.signIn();
    if (result.cancelled) return;
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    router.replace('/');
  }, [apple, showToast]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo area */}
          <View style={styles.logoArea}>
            <Text style={[styles.appName, { color: colors.primary }]}>
              ミーリフト
            </Text>
            <Text style={[styles.tagline, { color: colors.textSecondary }]}>
              体が変わる実感を、毎日。
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label="メールアドレス"
              placeholder="email@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              error={emailError}
            />

            <View style={styles.passwordContainer}>
              <Input
                label="パスワード"
                placeholder="パスワードを入力"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
                error={passwordError}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((prev) => !prev)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={colors.textTertiary}
                />
              </TouchableOpacity>
            </View>

            <Button
              title="ログイン"
              onPress={handleLogin}
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              disabled={loading}
            />
          </View>

          {/* Register link */}
          <TouchableOpacity
            style={styles.linkRow}
            onPress={handleGoToRegister}
            activeOpacity={0.7}
          >
            <Text style={[styles.linkText, { color: colors.textSecondary }]}>
              アカウントをお持ちでない方{' '}
            </Text>
            <Text style={[styles.linkAction, { color: colors.primary }]}>
              新規登録はこちら
            </Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View
              style={[styles.dividerLine, { backgroundColor: colors.border }]}
            />
            <Text style={[styles.dividerText, { color: colors.textTertiary }]}>
              または
            </Text>
            <View
              style={[styles.dividerLine, { backgroundColor: colors.border }]}
            />
          </View>

          {/* Apple Sign In — iOS 13+ only */}
          {apple.available && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              }
              buttonStyle={
                scheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={radius.md}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          )}

          {/* Local only */}
          <Button
            title="アカウントなしで始める"
            onPress={handleLocalMode}
            variant="secondary"
            size="lg"
            fullWidth
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.xxl,
    justifyContent: 'center',
    gap: spacing.xxl,
  },
  logoArea: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  appName: {
    ...typography.displayLarge,
  },
  tagline: {
    ...typography.bodyLarge,
    textAlign: 'center',
  },
  form: {
    gap: spacing.lg,
  },
  passwordContainer: {
    position: 'relative',
  },
  eyeButton: {
    position: 'absolute',
    right: spacing.md,
    bottom: 0,
    height: 48,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: {
    ...typography.bodyMedium,
  },
  linkAction: {
    ...typography.labelLarge,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    ...typography.labelSmall,
  },
  appleButton: {
    width: '100%',
    height: 48,
  },
});
