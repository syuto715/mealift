import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius, shadow } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useSubscription } from '../../hooks/useSubscription';
import { ProgressBar } from '../ui/ProgressBar';

// v1.4 / UI 改善 v1 Phase A-2 — ProCard.
//
// Settings 画面最上部に置く Plus tier の主要訴求カード。 計画書
// §5.2 / §6.4 の 4 状態切り替え (free / trial / plus / pro) を
// 全部 1 コンポーネントで表現する。 status は既存
// `useSubscription` から取得 (計画書 §8.3 useProStatus は
// supersede)。
//
// 状態別の content:
//   - free   : Plus 訴求 + 「14日間 無料で試す」 CTA
//   - trial  : 残り日数 + 進捗バー (1-3日: 警告色)
//   - plus   : 「Plus 利用中」 + 次回更新日 (subtle、 押し売り回避)
//   - pro    : 「Pro 利用中」 (top tier、 Plus CTA 完全非表示。
//              ハンドブック §15.4 違反防止)
//
// Tap で /(tabs)/settings/subscription にナビゲート (free/trial)、
// または `/(tabs)/settings/subscription` 全 status 共通 (plus/pro は
// プラン管理目的)。 v1.4 ステージ 5 で `src/constants/routes.ts`
// SSoT へ移行予定 (Pattern 18 crystallization)。
//
// Patterns applied:
//   #11 visual redundancy — pro gold tint + Ionicons + bold title +
//       本文 + (free のみ) CTA で color-blind 対応
//   #12 accessibilityRole — header on title、 button on CTA
//   #13 decorative icon — 大型 icon は accessibilityElementsHidden +
//       importantForAccessibility=no-hide-descendants (Pattern
//       paired Onboarding v2 Phase E-4 通り)
//   #18 SSoT — 全画面で同じ ProCard 使用、 4 状態 logic はここ集約

const SUBSCRIPTION_ROUTE = '/(tabs)/settings/subscription';
const TRIAL_DURATION_DAYS = 14;

// 「あと N 日でトライアル終了。 継続するには登録を」 を出す境界。
// daysRemaining <= 3 で urgent モード。 = 1 で「明日から終了」 文言。
const TRIAL_URGENT_THRESHOLD = 3;

function formatRenewalDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function ProCard() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const sub = useSubscription();

  // Free — full Plus promotional CTA
  if (sub.status === 'free') {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push(SUBSCRIPTION_ROUTE)}
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.pro,
          },
          shadow.md,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Mealift Plus を 14日間 無料で試す"
        testID="pro-card-free"
      >
        <View style={styles.header}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: colors.pro + '20' },
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name="star" size={24} color={colors.pro} />
          </View>
          <View style={styles.headerText}>
            <Text
              style={[styles.title, { color: colors.textPrimary }]}
              accessibilityRole="header"
            >
              Mealift Plus
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              AI 無制限 ・ 週次レポート ・ 優先機能を解放
            </Text>
          </View>
        </View>
        <View
          style={[styles.cta, { backgroundColor: colors.pro }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={[styles.ctaText, { color: colors.surface }]}>
            14日間 無料で試す
          </Text>
          <Ionicons name="arrow-forward" size={18} color={colors.surface} />
        </View>
      </TouchableOpacity>
    );
  }

  // Trial — countdown + progress bar
  if (sub.status === 'trial' && sub.trialDaysRemaining !== null) {
    const daysRemaining = sub.trialDaysRemaining;
    const isUrgent = daysRemaining <= TRIAL_URGENT_THRESHOLD;
    const isLastDay = daysRemaining === 1;
    const accent = isUrgent ? colors.warning : colors.pro;
    const progress = Math.max(
      0,
      Math.min(1, (TRIAL_DURATION_DAYS - daysRemaining) / TRIAL_DURATION_DAYS),
    );
    const headline = isLastDay
      ? '明日から Plus が終了します'
      : isUrgent
        ? `あと ${daysRemaining} 日でトライアル終了`
        : `Plus トライアル中`;
    const subline = isLastDay
      ? '継続するにはご登録をお願いします'
      : isUrgent
        ? '継続するにはご登録をお願いします'
        : `あと ${daysRemaining} 日でトライアル終了`;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push(SUBSCRIPTION_ROUTE)}
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: accent,
          },
          shadow.md,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Plus トライアル、 あと${daysRemaining}日。 プラン画面を開く。`}
        testID="pro-card-trial"
      >
        <View style={styles.header}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: accent + '20' },
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name="time" size={24} color={accent} />
          </View>
          <View style={styles.headerText}>
            <Text
              style={[styles.title, { color: colors.textPrimary }]}
              accessibilityRole="header"
            >
              {headline}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {subline}
            </Text>
          </View>
        </View>
        <ProgressBar
          progress={progress}
          color={accent}
          backgroundColor={accent + '20'}
          height={6}
        />
      </TouchableOpacity>
    );
  }

  // Plus — subtle status + 次回更新日
  if (sub.status === 'plus') {
    const renewalLabel = formatRenewalDate(sub.planExpiresAt);
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push(SUBSCRIPTION_ROUTE)}
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.pro + '60',
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Mealift Plus 利用中。 プラン画面を開く。"
        testID="pro-card-plus"
      >
        <View style={styles.header}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: colors.pro + '15' },
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name="checkmark-circle" size={24} color={colors.pro} />
          </View>
          <View style={styles.headerText}>
            <Text
              style={[styles.title, { color: colors.textPrimary }]}
              accessibilityRole="header"
            >
              Mealift Plus 利用中
            </Text>
            {renewalLabel && (
              <Text
                style={[styles.subtitle, { color: colors.textSecondary }]}
              >
                次回更新日: {renewalLabel}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Pro — top tier、 Plus CTA を一切出さない (Handbook §15.4)
  if (sub.status === 'pro') {
    const renewalLabel = formatRenewalDate(sub.planExpiresAt);
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push(SUBSCRIPTION_ROUTE)}
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.proDark,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Mealift Pro 利用中。 プラン画面を開く。"
        testID="pro-card-pro"
      >
        <View style={styles.header}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: colors.proDark + '20' },
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name="diamond" size={24} color={colors.proDark} />
          </View>
          <View style={styles.headerText}>
            <Text
              style={[styles.title, { color: colors.textPrimary }]}
              accessibilityRole="header"
            >
              Mealift Pro 利用中
            </Text>
            {renewalLabel && (
              <Text
                style={[styles.subtitle, { color: colors.textSecondary }]}
              >
                次回更新日: {renewalLabel}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Defensive: status は型上 4 値で網羅、 unknown は render しない
  return null;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.titleMedium,
  },
  subtitle: {
    ...typography.bodySmall,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
  ctaText: {
    ...typography.labelLarge,
  },
});
