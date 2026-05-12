import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../src/theme/tokens';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { Button } from '../../src/components/ui';
import {
  PLUS_FEATURES,
  getTrialCopy,
  getTrialSubcopy,
} from '../../src/domain/tierPreviewUtils';
import {
  RevenueCatError,
  applyCustomerInfoToProfile,
  getCurrentOffering,
  isRevenueCatConfigured,
  purchasePackage,
} from '../../src/infra/services/revenueCatService';

// v1.3.0 / Onboarding v2 / Phase D-9 — Tier preview screen [12.5].
//
// Post-completion promotional surface. Profile was already
// persisted on /complete (D-8 createProfileFromOnboarding with
// markCompleted: true), so this screen runs zero profile
// mutation — its only job is to offer the 7-day Plus trial as
// an explicit opt-in OR let the user skip to home.
//
// User-memory contract (NEVER auto-grant): both CTAs are
// always visible (skip secondary, Plus primary). Trial wording
// references TRIAL_DURATION_DAYS + "いつでもキャンセル可能" so
// the user sees the commitment shape before tapping.
//
// Platform handling: iOS RevenueCat is configured + ships a
// real intro-offer. Android RevenueCat API key is pending
// (kickoff §確認事項) — isRevenueCatConfigured() returns false
// on Android, so the Plus CTA renders disabled with a "近日
//対応" message rather than throwing an UNSUPPORTED_PLATFORM
// error on tap.
//
// Patterns applied:
//   #5  CTA double-tap defense + async cancellation via the
//       isPurchasing flag
//   #10 mount-time offering fetch with `cancelled` flag against
//       StrictMode dev double-mount + unmount-mid-fetch
//   #11 Plus CTA = primary color + bold label, skip CTA =
//       secondary visual weight (3-cue: variant + position +
//       text weight)
//   #12 header / list (features) / button (CTAs) / live region
//       (Plus availability copy on Android)
//   #18 SSoT — tierPreviewUtils.PLUS_FEATURES + TRIAL_DURATION
//       _DAYS reuse from constants/pricing
//   #25 helper-thick — feature list / trial copy in tierPreview
//       Utils; screen owns purchase orchestration only
//   #26 Pattern 26 (3 facet) idle pass — D-9 is post-completion,
//       no profile mutation, all v2 bridge logic dormant

const TITLE = 'Mealift Plus でもっと目標を加速';
const SUBTITLE = 'すべての機能を 7 日間お試しいただけます';
const CTA_TRIAL = 'Plus を試す';
const CTA_SKIP = 'スキップ';
const ANDROID_PENDING_COPY = 'Plus は近日 Android にも対応予定です';

export default function TierPreviewScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const platformReady = isRevenueCatConfigured();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [offeringReady, setOfferingReady] = useState(false);

  // Mount: pre-fetch the offering so the Plus CTA can disable
  // gracefully when the store hasn't returned packages yet.
  // Pattern 10 cancellation guard against strict-mode dev
  // double-mount + unmount-mid-fetch race.
  useEffect(() => {
    if (!platformReady) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const offering = await getCurrentOffering();
        if (cancelled) return;
        setOfferingReady(offering != null);
      } catch (err) {
        if (cancelled) return;
        console.warn('[onboarding/tier-preview] offering fetch failed', err);
        setOfferingReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [platformReady]);

  const handleSkip = useCallback(() => {
    // Phase D-9 ships the Android flow's terminal redirect here;
    // Phase D-10 will introduce iOS HealthKit between tier-
    // preview and home (Platform.OS conditional flip in this
    // callback).
    router.replace('/(tabs)/home');
  }, []);

  const handleStartTrial = useCallback(async () => {
    if (isPurchasing) return;
    if (!platformReady) {
      Alert.alert('未対応', ANDROID_PENDING_COPY);
      return;
    }
    setIsPurchasing(true);
    try {
      const offering = await getCurrentOffering();
      // Prefer the monthly package — its intro offer is the
      // 7-day trial. Fallback to first available package if
      // the catalog shape ever changes (defensive narrow rather
      // than crash on a missing identifier).
      const pkg =
        offering?.availablePackages.find(
          (p) => p.identifier === 'plus_monthly',
        ) ?? offering?.availablePackages[0];
      if (!pkg) {
        Alert.alert(
          '商品が取得できません',
          'ストアから商品情報を取得できませんでした。しばらく経ってから再度お試しください。',
        );
        setIsPurchasing(false);
        return;
      }
      const { customerInfo, userCancelled } = await purchasePackage(pkg);
      if (userCancelled) {
        setIsPurchasing(false);
        return;
      }
      await applyCustomerInfoToProfile(customerInfo);
      // Success — proceed to home (Phase D-10 will redirect
      // iOS users through HealthKit first).
      router.replace('/(tabs)/home');
    } catch (err) {
      setIsPurchasing(false);
      const message =
        err instanceof RevenueCatError
          ? err.message
          : '購入処理中にエラーが発生しました。';
      Alert.alert('購入エラー', message);
    }
  }, [isPurchasing, platformReady]);

  const trialAvailable = platformReady && offeringReady;

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View
            style={[
              styles.heroIcon,
              { backgroundColor: colors.primary + '15' },
            ]}
          >
            <Ionicons name="rocket" size={36} color={colors.primary} />
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

        <View style={styles.featureList} accessibilityRole="list">
          {PLUS_FEATURES.map((feature) => (
            <View
              key={feature.title}
              style={[
                styles.featureRow,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
              accessibilityLabel={`${feature.title}: ${feature.description}`}
            >
              <View
                style={[
                  styles.featureIcon,
                  { backgroundColor: colors.primary + '15' },
                ]}
              >
                <Ionicons
                  name={feature.icon}
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View style={styles.featureText}>
                <Text
                  style={[styles.featureTitle, { color: colors.textPrimary }]}
                >
                  {feature.title}
                </Text>
                <Text
                  style={[styles.featureDesc, { color: colors.textSecondary }]}
                >
                  {feature.description}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.trialBox}>
          <Text style={[styles.trialMain, { color: colors.textPrimary }]}>
            ✨ {getTrialCopy()}
          </Text>
          <Text style={[styles.trialSub, { color: colors.textSecondary }]}>
            {getTrialSubcopy()}
          </Text>
        </View>

        {!platformReady && (
          <View
            style={[
              styles.pendingBox,
              {
                backgroundColor: colors.warning + '15',
                borderColor: colors.warning + '30',
              },
            ]}
            accessibilityLiveRegion="polite"
          >
            <Text style={[styles.pendingText, { color: colors.textPrimary }]}>
              {ANDROID_PENDING_COPY}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.ctaBar, { borderTopColor: colors.border }]}>
        <Button
          title={CTA_TRIAL}
          onPress={handleStartTrial}
          variant="primary"
          size="lg"
          fullWidth
          loading={isPurchasing}
          disabled={!trialAvailable || isPurchasing}
          testID="tier-preview-trial"
        />
        <View style={styles.skipWrap}>
          <Button
            title={CTA_SKIP}
            onPress={handleSkip}
            variant="ghost"
            size="lg"
            fullWidth
            disabled={isPurchasing}
            testID="tier-preview-skip"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.titleLarge,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
  featureList: {
    gap: spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    ...typography.labelLarge,
  },
  featureDesc: {
    ...typography.bodySmall,
  },
  trialBox: {
    alignItems: 'center',
    gap: 4,
  },
  trialMain: {
    ...typography.titleSmall,
  },
  trialSub: {
    ...typography.bodySmall,
  },
  pendingBox: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pendingText: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  skipWrap: {
    // skip CTA stays full-width but visually lighter via variant
    // — explicit opt-in policy means we don't bury the skip path
  },
});
