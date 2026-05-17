import React, { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useCoachAdviceStore,
  selectLatestAdvice,
} from '../../stores/coachAdviceStore';
import { useSubscription } from '../../hooks/useSubscription';
import { useProfileStore } from '../../stores/profileStore';
import { ProInlineCTA } from '../shared/ProInlineCTA';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import type { CoachAdviceScope } from '../../types/coachAdvice';
import { pickAdviceCardState, type AdviceCardState } from './adviceCardState';

// v1.5 Stage 1 Phase 1.4 — embedded coach-advice card.
//
// Renders `weekly` or `daily` advice as a compact card. Lazy
// on-mount fetch via coachAdviceStore. Free users see a
// placeholder + ProInlineCTA (I1 no-free-reads); Plus / Pro see
// the live content with a retry button on error.

interface Props {
  scope: CoachAdviceScope;
  testID?: string;
}

export function AdviceCard({ scope, testID }: Props): React.ReactElement | null {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const profile = useProfileStore((s) => s.profile);
  const userId = profile?.id ?? '';
  const profileId = profile?.id ?? '';

  const sub = useSubscription();
  // Codex round 1 Critical fix — selectLatestAdvice now takes
  // userId so the cache lookup is user-scoped. An empty userId
  // (signed-out state) returns null which keeps the locked
  // placeholder rendering.
  const advice = useCoachAdviceStore((s) =>
    selectLatestAdvice(s, userId, scope),
  );
  const isLoading = useCoachAdviceStore((s) => s.loadingScopes.has(scope));
  const error = useCoachAdviceStore((s) => s.error);
  const fetchAdvice = useCoachAdviceStore((s) => s.fetchAdvice);
  const loadFromCache = useCoachAdviceStore((s) => s.loadFromCache);
  const dismissError = useCoachAdviceStore((s) => s.dismissError);

  // Plus/Pro gate: derive via `hasFeature` — `aiCoachAdviceWeekly`
  // is Plus+, `aiCoachAdviceDaily` is Pro-only.
  const flagKey =
    scope === 'weekly' ? 'aiCoachAdviceWeekly' : 'aiCoachAdviceDaily';
  const hasAccess = sub.hasFeature(flagKey);

  const cardState: AdviceCardState = pickAdviceCardState({
    hasAccess,
    isLoading,
    error,
    advice,
  });

  // Lazy hydrate the local mirror, then fire the EF call. We treat
  // both as fire-and-forget — chain errors land in `error` state.
  useEffect(() => {
    if (!hasAccess || !userId) return;
    let cancelled = false;
    void (async () => {
      await loadFromCache(userId, scope);
      if (cancelled) return;
      await fetchAdvice({ userId, profileId, scope });
    })();
    return () => {
      cancelled = true;
    };
  }, [hasAccess, userId, profileId, scope, loadFromCache, fetchAdvice]);

  const handleRetry = useCallback(() => {
    if (!userId) return;
    dismissError();
    void fetchAdvice({ userId, profileId, scope });
  }, [userId, profileId, scope, dismissError, fetchAdvice]);

  const scopeLabel = scope === 'weekly' ? '今週' : '今日';

  if (cardState === 'locked') {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceSecondary,
            borderColor: colors.border,
          },
        ]}
        accessible
        accessibilityRole="summary"
        accessibilityLabel={`ミー先生からの${scopeLabel}のアドバイス。 Plus プランで利用可能`}
        testID={testID ?? 'advice-card-locked'}
      >
        <View style={styles.headerRow}>
          <Ionicons
            name="sparkles-outline"
            size={18}
            color={colors.textSecondary}
          />
          <Text style={[styles.headerText, { color: colors.textPrimary }]}>
            ミー先生からのアドバイス
          </Text>
          <Text style={[styles.scopeBadge, { color: colors.textTertiary }]}>
            {scopeLabel}
          </Text>
        </View>
        <Text style={[styles.lockedBody, { color: colors.textSecondary }]}>
          {scope === 'weekly'
            ? 'ミー先生があなたの記録に合わせたコーチングを毎週お届けします。'
            : 'ミー先生があなたの記録に合わせたコーチングを毎日お届けします。'}
        </Text>
        <ProInlineCTA
          label={
            scope === 'weekly'
              ? 'ミー先生のアドバイスを受けるには Plus へ →'
              : '毎日のアドバイスは Pro へ →'
          }
          variant="card"
        />
        <Text style={[styles.footer, { color: colors.textTertiary }]}>
          ミー先生 (AI コーチ)
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`ミー先生からの${scopeLabel}のアドバイス`}
      accessibilityState={{
        busy: cardState === 'loading',
        disabled: cardState === 'error',
      }}
      testID={testID ?? `advice-card-${scope}`}
    >
      <View style={styles.headerRow}>
        <Ionicons name="sparkles" size={18} color={colors.primary} />
        <Text style={[styles.headerText, { color: colors.textPrimary }]}>
          ミー先生からのアドバイス
        </Text>
        <Text style={[styles.scopeBadge, { color: colors.textTertiary }]}>
          {scopeLabel}
        </Text>
      </View>

      {cardState === 'loading' && (
        <View style={styles.loadingRow} testID="advice-card-loading">
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            アドバイスを生成中...
          </Text>
        </View>
      )}

      {cardState === 'error' && (
        <View style={styles.errorRow} testID="advice-card-error">
          <Text style={[styles.errorText, { color: colors.error }]}>
            {error?.message ?? 'アドバイスを取得できませんでした'}
          </Text>
          <TouchableOpacity
            onPress={handleRetry}
            accessibilityRole="button"
            accessibilityLabel="再試行"
            accessibilityHint="アドバイスをもう一度取得します"
            style={[styles.retryButton, { borderColor: colors.primary }]}
            testID="advice-card-retry"
          >
            <Ionicons name="refresh" size={14} color={colors.primary} />
            <Text style={[styles.retryLabel, { color: colors.primary }]}>
              再試行
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {cardState === 'content' && advice && (
        <Text
          style={[styles.body, { color: colors.textPrimary }]}
          testID="advice-card-content"
        >
          {advice.content}
        </Text>
      )}

      <Text style={[styles.footer, { color: colors.textTertiary }]}>
        ミー先生 (AI コーチ)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 0.5,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerText: {
    ...typography.titleSmall,
    flex: 1,
  },
  scopeBadge: {
    ...typography.labelSmall,
  },
  lockedBody: {
    ...typography.bodyMedium,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  loadingText: {
    ...typography.bodySmall,
  },
  errorRow: {
    flexDirection: 'column',
    gap: spacing.sm,
  },
  errorText: {
    ...typography.bodyMedium,
  },
  retryButton: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 9999,
    borderWidth: 0.5,
  },
  retryLabel: {
    ...typography.labelMedium,
    fontWeight: '600',
  },
  body: {
    ...typography.bodyMedium,
    lineHeight: 22,
  },
  footer: {
    ...typography.labelSmall,
    textAlign: 'right',
  },
});
