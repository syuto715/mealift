import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Card } from '../ui/Card';
import { useProfileStore } from '../../stores/profileStore';
import {
  useCoachAdviceStore,
  selectLatestAdvice,
} from '../../stores/coachAdviceStore';

// P2-2 — home "ミー先生のひとこと" card. Surfaces the latest ALREADY-CACHED
// coach advice (read-only) and taps through to the coach chat. It never
// generates advice: it reads via selectLatestAdvice (no network) and only
// hydrates the local mirror via loadFromCache (an existing retrieval path —
// a PostgREST table read, NOT an Edge Function call). Empty/loading states
// degrade gracefully; a Free user with no advice just sees the empty state.

export function CoachHomeCard(): React.ReactElement | null {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const router = useRouter();

  const userId = useProfileStore((s) => s.profile?.id ?? '');
  const daily = useCoachAdviceStore((s) => selectLatestAdvice(s, userId, 'daily'));
  const weekly = useCoachAdviceStore((s) => selectLatestAdvice(s, userId, 'weekly'));
  const loadFromCache = useCoachAdviceStore((s) => s.loadFromCache);

  // Hydrate the local mirror once per user. Fire-and-forget: an offline /
  // failed sync leaves whatever is already cached (or the empty state).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadFromCache(userId, 'weekly');
        if (!cancelled) await loadFromCache(userId, 'daily');
      } catch {
        // No advice surfaced this run — the empty state covers it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, loadFromCache]);

  if (!userId) return null;

  // Prefer the freshest of the two scopes.
  const advice =
    daily && weekly
      ? daily.generatedAt >= weekly.generatedAt
        ? daily
        : weekly
      : (daily ?? weekly);

  const goToCoach = () => router.push('/(tabs)/coach');

  const body = advice
    ? advice.content
    : '記録するとミー先生からアドバイスが届きます。';

  return (
    <Card style={styles.card}>
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
        <Text
          style={[
            styles.body,
            { color: advice ? colors.textSecondary : colors.textTertiary },
          ]}
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
  card: { marginBottom: spacing.md },
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
