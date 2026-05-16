import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../src/theme/tokens';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { Button } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import { useProfileStore } from '../../src/stores/profileStore';
import { isV1MigrationUser } from '../../src/domain/onboardingMigration';

// v1.3.0 / Onboarding v2 / Phase C-1 — Welcome screen [1].
//
// First touch in the new 13-screen flow. Static greeting + 「始める」
// CTA. ProgressHeader is auto-injected by (onboarding)/_layout
// (Phase A-6) — `welcome` is in ONBOARDING_ROUTES with showBack=false,
// so the header reads "1/{14|15}" (15 on iOS due to HealthKit) with
// no back arrow.
//
// On mount: markStarted() bumps onboardingStep to 1, then
// persistToProfile fires so the service writes the set-once
// onboardingStartedAt DB stamp. Mount-time (vs CTA-tap) so
// abandonment-rate analytics still capture users who close the app
// before reading the title (kickoff §C-1 confirmation 3).
//
// CTA target — Phase C-2 flipped this to the new flow's [2]
// `/nickname` screen. The C-1 stop-gap (legacy /welcome-and-goal)
// is no longer reachable from this CTA. Pattern 26 transitional
// bridges continue downstream — nickname's CTA still points at
// the legacy /body-and-training combined screen until Phase C-3
// ships /body-info.
//
// Patterns applied:
//   #5  fail-fast on caller misuse + double-tap defense via isAdvancing
//   #11 color + non-color redundant encoding — primary CTA carries
//       both background hue and bold label text
//   #12 conditional accessibilityRole — header role on title;
//       hero icon hidden from screen reader (decorative)
//   #26 transitional layout gate — the layout-level ProgressHeader
//       gating is owned by shouldRenderLayoutHeader (A-6); this
//       screen renders the shared header. The CTA → legacy bridge
//       is also Pattern 26 (incremental migration, not big-bang).

const HERO_ICON: React.ComponentProps<typeof Ionicons>['name'] = 'barbell';
const TITLE = 'ようこそ Mealift へ';
const SUBTITLE = '食事と運動を一緒に管理できる、日本人向けのフィットネス・アプリ';
const CTA_LABEL = '始める';

// Phase E-4 — v1-migration notice copy. Surfaces only for returning
// v1 users routed back through welcome by the Option A version
// gate in app/index.tsx (Phase E-1). isV1MigrationUser encapsulates
// the show condition (Pattern 25 helper-thick).
const MIGRATION_TITLE = 'Mealift がアップデートされました';
const MIGRATION_BODY =
  'これまで入力された情報は保存されています。一部の項目だけ確認してください（約 5 分）。';

export default function WelcomeScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const markStarted = useOnboardingStore((s) => s.markStarted);
  const persistToProfile = useOnboardingStore((s) => s.persistToProfile);
  const prefillFromProfile = useOnboardingStore((s) => s.prefillFromProfile);
  const existingProfile = useProfileStore((s) => s.profile);
  const [isAdvancing, setIsAdvancing] = useState(false);

  // Phase E-4 — gate the migration notice on a single helper call.
  // existingProfile rarely changes on this screen (set once by
  // app/index.tsx pre-navigation); inline derivation is cheaper
  // than useMemo overhead.
  const showMigrationNotice = isV1MigrationUser(existingProfile);

  useEffect(() => {
    // Phase E-1 — v1-user re-onboarding prefill. When a profile
    // already exists (returning user forced through onboarding
    // again via the index.tsx version-gate redirect), hydrate
    // the store with the legacy field values so the C-3..D-5
    // input screens render with the user's existing data
    // pre-filled. v2-introduced fields (nickname, mealPlan,
    // proteinFactor, etc.) stay null and require fresh entry.
    if (existingProfile) {
      prefillFromProfile(existingProfile);
    }
    markStarted();
    persistToProfile().catch((err) => {
      // Codex pass 1 / Important — non-blocking but NOT silent.
      // onboardingService.persistToProfile throws on
      // profileId-required / profile-not-found / id-mismatch but
      // doesn't log. Without surfacing it here, a startedAt write
      // failure would vanish entirely. Crashing the screen is
      // wrong (user can't advance past Welcome); console.warn keeps
      // the UI alive but leaves a footprint for telemetry / debug.
      console.warn('[onboarding/welcome] persistToProfile failed', err);
    });
    // Run only on mount — re-running prefill mid-flow would clobber
    // in-progress edits. Same eslint-disable pattern as the
    // nickname/body-info prefill effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCtaPress = useCallback(() => {
    if (isAdvancing) return;
    setIsAdvancing(true);
    router.push('/(onboarding)/nickname');
  }, [isAdvancing]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {showMigrationNotice && (
          <View
            // Phase E-4 — v1-migration UX notice.
            //
            // a11y semantics — Codex pass 1 / Important fix:
            // dropped accessibilityRole="alert". ARIA "alert" implies
            // time-sensitive priority content, which over-strengthens
            // this advisory copy. The inner Text with
            // accessibilityRole="header" already gives VoiceOver /
            // TalkBack a semantic anchor; the body text reads in the
            // natural traversal order on initial focus.
            //
            // accessibilityLiveRegion="polite" is kept as Android-
            // future-proofing: the prop is Android-only per RN docs
            // (no-op on iOS), so it doesn't affect this commit's iOS
            // dogfooding target. When TalkBack dogfooding runs in
            // v1.4, the polite live region will catch any defensive
            // late-mount profile load that reveals the notice after
            // initial traversal.
            //
            // Pattern 11 — color (info-tinted background) + non-color
            // (icon + bold title + body) redundant encoding.
            style={[
              styles.migrationNotice,
              {
                backgroundColor: colors.primary + '12',
                borderColor: colors.primary + '40',
              },
            ]}
            accessibilityLiveRegion="polite"
            testID="welcome-migration-notice"
          >
            <Ionicons
              name="information-circle"
              size={24}
              color={colors.primary}
              // Decorative — title + body carry the meaning.
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.migrationIcon}
            />
            <View style={styles.migrationTextBlock}>
              <Text
                style={[
                  styles.migrationTitle,
                  { color: colors.textPrimary },
                ]}
                accessibilityRole="header"
              >
                {MIGRATION_TITLE}
              </Text>
              <Text
                style={[
                  styles.migrationBody,
                  { color: colors.textSecondary },
                ]}
              >
                {MIGRATION_BODY}
              </Text>
            </View>
          </View>
        )}
        <View style={styles.hero}>
          <View
            style={[
              styles.heroIconBg,
              { backgroundColor: colors.primary + '15' },
            ]}
            // Codex pass 1 / Nit — `accessibilityElementsHidden` is
            // iOS-only; `importantForAccessibility="no-hide-descendants"`
            // hides the icon and its descendants on Android too,
            // giving the same decorative-only behavior across
            // platforms.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name={HERO_ICON} size={48} color={colors.primary} />
          </View>
          <Text
            style={[styles.title, { color: colors.textPrimary }]}
            accessibilityRole="header"
          >
            {TITLE}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {SUBTITLE}
          </Text>
        </View>
      </ScrollView>
      <View style={[styles.ctaBar, { borderTopColor: colors.border }]}>
        <Button
          title={CTA_LABEL}
          onPress={handleCtaPress}
          variant="primary"
          size="lg"
          fullWidth
          disabled={isAdvancing}
          testID="welcome-cta"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  migrationNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  migrationIcon: {
    marginTop: 2,
  },
  migrationTextBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  migrationTitle: {
    ...typography.titleSmall,
  },
  migrationBody: {
    ...typography.bodyMedium,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.md,
  },
  heroIconBg: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.displayMedium,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyLarge,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
