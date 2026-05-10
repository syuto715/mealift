import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import { getColors, radius } from '../../src/theme/tokens';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { Button } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import { useProfileStore } from '../../src/stores/profileStore';
import {
  NICKNAME_MAX_LENGTH,
  getInitialNickname,
  getValidationErrorMessage,
  validateNickname,
} from '../../src/domain/nicknameValidation';

// v1.3.0 / Onboarding v2 / Phase C-2 — Nickname screen [2].
//
// TextInput-driven free-form display name. Pre-fills from
//   profile.nickname → profile.displayName → empty
// per kickoff §C-2 (recon-confirmed: displayName is the Supabase
// login identity, nickname is the warm onboarding copy — separate
// fields by design, see onboardingStore.ts:28-31).
//
// Persist cadence:
//   - onChangeText: store nickname update only (no DB hit, just UI
//     reflect — keystroke-cheap)
//   - onBlur: validation + persistToProfile when valid (Pattern 23
//     service boundary)
//   - 「次へ」 tap: validation + persist + navigate
//
// Transitional bridge: CTA pushes /(onboarding)/body-and-training
// (legacy [3][4] combined screen) until Phase C-3 ships /body-info.
// Same Pattern 26 incremental-migration pattern Phase C-1 set up
// when it pointed at /welcome-and-goal as a stop-gap.
//
// Patterns applied:
//   #5  validation fail-fast at the input boundary, double-tap
//       defense via isAdvancing
//   #10 cancellation guard on the pre-fill effect — strict-mode
//       remount during dev shouldn't double-write
//   #11 error state uses both border color (error palette) AND
//       a text message; not color-only
//   #12 conditional accessibilityRole — header / textbox / button;
//       error region marked accessibilityLiveRegion="polite"
//   #23 service-side persist via store.persistToProfile — the
//       screen never talks to the DB layer directly
//   #25 pure-helper extraction to nicknameValidation.ts
//   #26 transitional bridge — CTA → legacy combined screen until
//       Phase C-3 lands /body-info, then 1-line route flip

const TITLE = 'なんてお呼びしますか？';
const SUBTITLE = 'アプリ内のあいさつや通知でこの名前を使います';
const CTA_LABEL = '次へ';

export default function NicknameScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const storeNickname = useOnboardingStore((s) => s.nickname);
  const setNickname = useOnboardingStore((s) => s.setNickname);
  const persistToProfile = useOnboardingStore((s) => s.persistToProfile);
  const profile = useProfileStore((s) => s.profile);

  // Local controlled value — separate from store so a re-render
  // triggered elsewhere doesn't override an in-flight keystroke.
  const [value, setValue] = useState<string>(() =>
    storeNickname ?? getInitialNickname(profile),
  );
  const [touched, setTouched] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);

  // Mount-time pre-fill: if the store has no nickname yet, hydrate
  // from existing profile so a returning user sees their current
  // value. No cancellation guard — there's no async boundary, so
  // the only effect of strict-mode dev double-mount is a redundant
  // setNickname write of the same value (idempotent).
  useEffect(() => {
    if (storeNickname == null) {
      const initial = getInitialNickname(profile);
      if (initial.length > 0) {
        setValue(initial);
        setNickname(initial);
      }
    }
    // Intentionally only run on mount — re-running when profile
    // changes mid-flow would clobber an in-progress edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validation = useMemo(() => validateNickname(value), [value]);
  const errorMessage =
    touched && !validation.valid
      ? getValidationErrorMessage(validation.reason)
      : null;

  const handleChange = useCallback(
    (next: string) => {
      setValue(next);
      // Mirror to store so a sibling screen / nav-guard reading
      // store.nickname sees the latest. Persist is deferred to
      // blur/submit (Pattern 23).
      setNickname(next);
    },
    [setNickname],
  );

  const handleBlur = useCallback(async () => {
    setTouched(true);
    const result = validateNickname(value);
    if (!result.valid) return;
    // If blur produced a trimmed sanitized form, sync the controlled
    // value + store so the displayed text matches what gets saved.
    if (result.sanitized !== value) {
      setValue(result.sanitized);
      setNickname(result.sanitized);
    }
    try {
      await persistToProfile();
    } catch (err) {
      // Same non-blocking-but-not-silent pattern Phase C-1
      // established. The next-screen submit will retry the persist
      // anyway; surface the failure to the dev console for telemetry.
      console.warn('[onboarding/nickname] persistToProfile failed', err);
    }
  }, [persistToProfile, setNickname, value]);

  const handleSubmit = useCallback(async () => {
    if (isAdvancing) return;
    setTouched(true);
    const result = validateNickname(value);
    if (!result.valid) return;
    setIsAdvancing(true);
    if (result.sanitized !== value) {
      setValue(result.sanitized);
      setNickname(result.sanitized);
    }
    try {
      await persistToProfile();
    } catch (err) {
      console.warn('[onboarding/nickname] persistToProfile failed', err);
    }
    // Phase C-3 transitional bridge — flip this to '/body-info'
    // when the new flow's [3] screen ships. body-and-training is
    // the closest legacy semantic match (covers legacy [3][4]
    // combined).
    router.push('/(onboarding)/body-and-training');
  }, [isAdvancing, persistToProfile, setNickname, value]);

  const inputBorderColor = errorMessage
    ? colors.error
    : value.length > 0
      ? colors.primary
      : colors.border;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.body}>
        <Text
          style={[styles.title, { color: colors.textPrimary }]}
          accessibilityRole="header"
        >
          {TITLE}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {SUBTITLE}
        </Text>

        <TextInput
          value={value}
          onChangeText={handleChange}
          onBlur={handleBlur}
          onSubmitEditing={handleSubmit}
          maxLength={NICKNAME_MAX_LENGTH}
          autoFocus
          returnKeyType="next"
          placeholder="ニックネーム"
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.input,
            {
              borderColor: inputBorderColor,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
            },
          ]}
          accessibilityLabel="ニックネーム"
          accessibilityHint="アプリ内で使う表示名を入力します"
          testID="nickname-input"
        />

        <View
          style={styles.errorRow}
          accessibilityLiveRegion="polite"
          accessible={!!errorMessage}
        >
          {errorMessage && (
            <Text style={[styles.errorText, { color: colors.error }]}>
              {errorMessage}
            </Text>
          )}
        </View>
      </View>

      <View style={[styles.ctaBar, { borderTopColor: colors.border }]}>
        <Button
          title={CTA_LABEL}
          onPress={handleSubmit}
          variant="primary"
          size="lg"
          fullWidth
          disabled={!validation.valid || isAdvancing}
          testID="nickname-cta"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  title: {
    ...typography.titleLarge,
  },
  subtitle: {
    ...typography.bodyMedium,
  },
  input: {
    height: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    ...typography.bodyLarge,
    marginTop: spacing.md,
  },
  errorRow: {
    minHeight: 20,
  },
  errorText: {
    ...typography.bodySmall,
  },
  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
