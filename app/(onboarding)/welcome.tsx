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
// CTA target — Codex pass 1 / Critical fix — temporarily points to
// the legacy `welcome-and-goal` combined screen rather than the
// new flow's [2] `nickname`, because Phase C-2 hasn't shipped yet.
// All three auth entry points (app/index.tsx, (auth)/login.tsx,
// (auth)/register.tsx) route here on first signup, so a missing-
// route push would brick the onboarding for production users.
// Pattern 26 transitional bridge — flip this route to '/nickname'
// in Phase C-2 and the legacy combined screen falls out of the
// active path naturally.
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

export default function WelcomeScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const markStarted = useOnboardingStore((s) => s.markStarted);
  const persistToProfile = useOnboardingStore((s) => s.persistToProfile);
  const [isAdvancing, setIsAdvancing] = useState(false);

  useEffect(() => {
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
  }, [markStarted, persistToProfile]);

  const handleCtaPress = useCallback(() => {
    if (isAdvancing) return;
    setIsAdvancing(true);
    // See header comment — CTA target is the legacy combined screen
    // until Phase C-2 ships /nickname.
    router.push('/(onboarding)/welcome-and-goal');
  }, [isAdvancing]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
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
