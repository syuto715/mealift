import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Card } from '../ui/Card';
import { useProfileStore } from '../../stores/profileStore';
import { useSubscription } from '../../hooks/useSubscription';
import {
  useCoachAdviceStore,
  selectLatestAdvice,
} from '../../stores/coachAdviceStore';
import { pickHomeAdvice } from './coachHomeAdvice';

// P2-2 — home "ミー先生のひとこと" card. Surfaces the latest ALREADY-CACHED
// coach advice (read-only) and taps through to the coach chat. It never
// generates advice: it reads via selectLatestAdvice (no network) and only
// hydrates the local mirror via loadFromCache (an existing retrieval path —
// a PostgREST table read, NOT an Edge Function call). Empty/loading states
// degrade gracefully; a Free user with no advice just sees the empty state.
//
// Tier gate (Codex 遡及review round 1 Critical): AdviceCard と同じ
// `hasFeature` 出し分け — weekly は Plus+、daily は Pro のみ。アクセス権の
// ない scope は hydrate もせず表示にも使わない（I1 no-free-reads — 降格後に
// 残存する cached row をホームへ出さない）。

export function CoachHomeCard(): React.ReactElement | null {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const router = useRouter();

  const userId = useProfileStore((s) => s.profile?.id ?? '');
  const sub = useSubscription();
  const canWeekly = sub.hasFeature('aiCoachAdviceWeekly');
  const canDaily = sub.hasFeature('aiCoachAdviceDaily');
  const daily = useCoachAdviceStore((s) => selectLatestAdvice(s, userId, 'daily'));
  const weekly = useCoachAdviceStore((s) => selectLatestAdvice(s, userId, 'weekly'));
  const loadFromCache = useCoachAdviceStore((s) => s.loadFromCache);

  // Hydrate the local mirror once per user — accessible scopes only.
  // Fire-and-forget: an offline / failed sync leaves whatever is
  // already cached (or the empty state).
  useEffect(() => {
    if (!userId || (!canWeekly && !canDaily)) return;
    let cancelled = false;
    void (async () => {
      try {
        if (canWeekly) await loadFromCache(userId, 'weekly');
        if (!cancelled && canDaily) await loadFromCache(userId, 'daily');
      } catch {
        // No advice surfaced this run — the empty state covers it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, canWeekly, canDaily, loadFromCache]);

  if (!userId) return null;

  // Prefer the freshest of the scopes the current tier may display.
  const advice = pickHomeAdvice({ daily, weekly, canDaily, canWeekly });

  const goToCoach = () => router.push('/(tabs)/coach');

  const body = advice
    ? advice.content
    : '記録するとミー先生からアドバイスが届きます。';

  return (
    // padding md + 下余白なし — ホームの content gap に揃える (1画面目の密度優先)
    <Card padding="md">
      <TouchableOpacity
        onPress={goToCoach}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={
          advice
            ? `ミー先生のひとこと。${advice.content} タップで相談へ`
            : 'ミー先生に相談する'
        }
      >
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: colors.primary + '18' }]}>
            <Ionicons name="sparkles" size={16} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>ミー先生のひとこと</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </View>
        {/* S2-E — 空状態も textSecondary: textTertiary (4.12:1) は 12pt 通常
            テキストの AA-normal (4.5:1) に未達のため (遡及review Important #2) */}
        <Text
          style={[styles.body, { color: colors.textSecondary }]}
          numberOfLines={3}
        >
          {body}
        </Text>
        {!advice && (
          <Text style={[styles.cta, { color: colors.primary }]}>相談する →</Text>
        )}
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.labelLarge, fontWeight: '600', flex: 1 },
  body: { ...typography.bodySmall, lineHeight: 20 },
  cta: { ...typography.labelMedium, fontWeight: '600', marginTop: spacing.sm },
});
