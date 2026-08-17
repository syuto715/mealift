import React, { useCallback, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
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
import { parseCoachText } from '../../domain/coachText';

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

  // S4.6-B — 挨拶・Markdown 除去 + タイトル抽出 (render ごとの再パースを避ける)
  const parsed = useMemo(
    () => (advice ? parseCoachText(advice.content) : null),
    [advice],
  );

  const scopeLabel = scope === 'weekly' ? '今週' : '今日';

  if (cardState === 'locked') {
    return (
      // S4.6-B3 (Codex R2) — locked 分岐も accessible グループ化を解除:
      // 子の ProInlineCTA (TouchableOpacity) が個別フォーカスできず、
      // スクリーンリーダーでプラン画面へ進めなかった (content 側 B2 と同クラス)。
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceSecondary,
            borderColor: colors.border,
          },
        ]}
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
    // S4.6-B2 (Codex R1) — `accessible` の親グループ化をやめる: 子に
    // 「詳しく見る」「再試行」の Touchable を含むため、グループ化すると
    // スクリーンリーダーで個別フォーカスできず全文画面へ到達できない。
    // 各子要素 (ヘッダ・本文・ボタン) が個別に読み上げられる。
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
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

      {/* S4.6-B — 全文垂れ流し (300-500字 + Markdown 記号露出) をやめ、
          タイトル行 (あれば) + 本文3行 + 意図的省略 +「詳しく見る」の
          カード構造に統一。全文は /(tabs)/coach/advice の整形済み表示で読む。
          S4.6-B2 (Codex R1) — content が空白のみの壊れた cached row は
          空本文 + 空の全文画面への CTA になるため、fallback 文言に落とし
          CTA を出さない。 */}
      {cardState === 'content' &&
        advice &&
        (parsed !== null && parsed.body !== '' ? (
          <>
            {parsed.title != null && (
              <Text
                style={[styles.adviceTitle, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {parsed.title}
              </Text>
            )}
            <Text
              style={[styles.body, { color: colors.textPrimary }]}
              numberOfLines={3}
              testID="advice-card-content"
            >
              {parsed.body}
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/coach/advice')}
              accessibilityRole="button"
              accessibilityLabel="アドバイスを詳しく見る"
              accessibilityHint="ミー先生のアドバイス全文を表示します"
              testID="advice-card-detail"
            >
              <Text style={[styles.detailCta, { color: colors.primary }]}>
                詳しく見る →
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text
            style={[styles.body, { color: colors.textSecondary }]}
            testID="advice-card-content"
          >
            アドバイスを準備しています。しばらくしてからもう一度お試しください。
          </Text>
        ))}

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
  // S4.6-B — 要約カード構造のタイトル行 + 詳しく見る CTA
  adviceTitle: {
    ...typography.labelMedium,
    fontWeight: '700',
  },
  detailCta: {
    ...typography.labelMedium,
    fontWeight: '600',
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
