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
import { Button, Input } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { useUIStore } from '../../src/stores/uiStore';
import { isSupabaseConfigured } from '../../src/infra/supabase/auth';

const registerSchema = z
  .object({
    email: z.email('有効なメールアドレスを入力してください'),
    password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'パスワードが一致しません',
    path: ['confirmPassword'],
  });

export default function RegisterScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const register = useAuthStore((s) => s.register);
  const showToast = useUIStore((s) => s.showToast);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const clearErrors = useCallback(() => {
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');
  }, []);

  const handleRegister = useCallback(async () => {
    clearErrors();

    const result = registerSchema.safeParse({
      email: email.trim(),
      password,
      confirmPassword,
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path[0];
        if (path === 'email') {
          setEmailError(issue.message);
        } else if (path === 'password') {
          setPasswordError(issue.message);
        } else if (path === 'confirmPassword') {
          setConfirmPasswordError(issue.message);
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
      const { error } = await register(email.trim(), password);
      if (error) {
        showToast(error, 'error');
        return;
      }
      router.replace('/(onboarding)/welcome');
    } finally {
      setLoading(false);
    }
  }, [email, password, confirmPassword, register, showToast, clearErrors]);

  const handleGoToLogin = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push('/(auth)/login');
    }
  }, []);

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
                placeholder="8文字以上で入力"
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

            <View style={styles.passwordContainer}>
              <Input
                label="パスワード（確認）"
                placeholder="もう一度入力"
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                error={confirmPasswordError}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword((prev) => !prev)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={
                    showConfirmPassword ? 'eye-off-outline' : 'eye-outline'
                  }
                  size={22}
                  color={colors.textTertiary}
                />
              </TouchableOpacity>
            </View>

            <Button
              title="登録"
              onPress={handleRegister}
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              disabled={loading}
            />
          </View>

          {/* Login link */}
          <TouchableOpacity
            style={styles.linkRow}
            onPress={handleGoToLogin}
            activeOpacity={0.7}
          >
            <Text style={[styles.linkText, { color: colors.textSecondary }]}>
              すでにアカウントをお持ちの方{' '}
            </Text>
            <Text style={[styles.linkAction, { color: colors.primary }]}>
              ログインはこちら
            </Text>
          </TouchableOpacity>
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
});
