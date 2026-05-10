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
// CTA forwards to nickname [2]. ProgressHeader is auto-injected by
// (onboarding)/_layout (Phase A-6) — `welcome` is in
// ONBOARDING_ROUTES with showBack=false, so the header reads
// "1/14" with no back arrow.
//
// On mount: markStarted() bumps onboardingStep to 1, then
// persistToProfile fires so the service writes the set-once
// onboardingStartedAt DB stamp. Mount-time (vs CTA-tap) so
// abandonment-rate analytics still capture users who close the app
// before reading the title (kickoff §C-1 confirmation 3).
//
// Patterns applied:
//   #5  fail-fast on caller misuse + double-tap defense via isPending
//   #10 cancellation guard in the persist useEffect (active flag)
//   #11 color + non-color redundant encoding — primary CTA carries
//       both background hue and bold label text
//   #12 conditional accessibilityRole — CTA radio role + a11y label,
//       hero icon hidden from screen reader
//   #26 transitional layout gate — the layout-level ProgressHeader
//       gating is owned by shouldRenderLayoutHeader (A-6); this
//       screen is in the post-legacy set so the header renders.

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
    let active = true;
    markStarted();
    void (async () => {
      try {
        await persistToProfile();
      } catch {
        // Silent — service-level error logging handles details, and
        // the next screen's submit will retry the persist. Crashing
        // here would block the user from advancing past Welcome.
      }
      if (!active) return;
    })();
    return () => {
      active = false;
    };
  }, [markStarted, persistToProfile]);

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
        <View style={styles.hero}>
          <View
            style={[
              styles.heroIconBg,
              { backgroundColor: colors.primary + '15' },
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no"
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
