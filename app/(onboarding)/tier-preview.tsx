import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../src/theme/tokens';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { Button } from '../../src/components/ui';
import { ROUTES } from '../../src/constants/routes';
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

  // Codex pass 1 / Important fix — moved offering fetch into
  // handleStartTrial. The earlier mount-time fetch + cached
  // offeringReady flag could permanently disable the CTA on a
  // transient mount-time failure, with no retry affordance.
  // Tap-time fetch gives the user a recovery path; the silent
  // mount-time spinner was already invisible to the user
  // (disabled button without indicator).

  const handleSkip = useCallback(() => {
    // Phase D-10 — iOS users continue to /(onboarding)/healthkit
    // for the HealthKit permission request before reaching home.
    // Android skips HealthKit (platform not supported) and
    // lands directly on home. Mealift convention is Platform.OS
    // === 'ios' ternaries over Platform.select (see app/(tabs)/
    // settings/health-sync.tsx + training/* for parity).
    const nextRoute =
      Platform.OS === 'ios' ? ROUTES.ONBOARDING_HEALTHKIT : ROUTES.HOME;
    router.replace(nextRoute);
  }, []);

  const handleStartTrial = useCallback(async () => {
    if (isPurchasing) return;
    if (!platformReady) {
      Alert.alert('未対応', ANDROID_PENDING_COPY);
      return;
    }
    setIsPurchasing(true);
    try {
      // Codex pass 1 / Important fix — re-fetch the offering on
      // tap rather than trusting the mount-time snapshot. A
      // transient network failure during mount must not
      // permanently disable the Plus CTA; tap-time fetch gives
      // the user a retry affordance even when the cached state
      // says "no offering."
      const offering = await getCurrentOffering();
      // Codex pass 1 / Important fix — strict plus_monthly
      // lookup. The earlier silent fallback to availablePackages[0]
      // could buy plus_halfyear / plus_annual if the offering
      // shape ever changed, contradicting the CTA's "7-day trial"
      // promise. Hard-error to the store-unavailable alert when
      // plus_monthly isn't present.
      const pkg = offering?.availablePackages.find(
        (p) => p.identifier === 'plus_monthly',
      );
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
      // Phase D-10 — iOS users continue to /healthkit after
      // a successful Plus purchase; Android lands on home
      // directly. Same Platform conditional as handleSkip
      // (HealthKit is free regardless of subscription tier —
      // user memory: paywall NEVER touches HealthKit).
      const nextRoute =
        Platform.OS === 'ios' ? ROUTES.ONBOARDING_HEALTHKIT : ROUTES.HOME;
      router.replace(nextRoute);
    } catch (err) {
      setIsPurchasing(false);
      const message =
        err instanceof RevenueCatError
          ? err.message
          : '購入処理中にエラーが発生しました。';
      Alert.alert('購入エラー', message);
    }
  }, [isPurchasing, platformReady]);

  // Codex pass 1 / Important fix — drop the offeringReady
  // dependency from the disabled gate. A failed mount-time
  // fetch should not permanently lock the CTA; tap-time
  // re-fetch provides the recovery path. Plus CTA is now
  // enabled whenever the platform supports purchase, and
  // mid-purchase the loading state covers the visual gate.
  const trialAvailable = platformReady;

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

        {/* Codex pass 1 / Important fix — App Store + Play Store
            subscription disclosure compliance. Matches the legal
            note rendered on /settings/subscription.tsx
            (auto-renew + cancel-via-store-settings). Without this
            block the screen omits post-trial price/renewal
            behavior, which Google Play's free-trial policy
            specifically calls out as required. Source:
            https://support.google.com/googleplay/android-developer/answer/9900533 */}
        <Text
          style={[styles.legalNote, { color: colors.textTertiary }]}
        >
          サブスクリプションは自動更新されます。更新日の24時間前までにキャンセルしない限り、同じ期間で自動更新されます。解約はストアのアカウント設定から行えます。
        </Text>

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
          {/* Codex pass 1 / Sign-off fix — skip is NEVER disabled.
              Explicit-opt-in policy requires the escape path
              available even during an in-flight purchase
              (e.g., a stalled RevenueCat response). The user
              memory contract: the user must always be able to
              decline. */}
          <Button
            title={CTA_SKIP}
            onPress={handleSkip}
            variant="ghost"
            size="lg"
            fullWidth
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
  legalNote: {
    ...typography.bodySmall,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: spacing.md,
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
