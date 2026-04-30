import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card } from '../../../src/components/ui';
import { getDatabase } from '../../../src/infra/database/connection';
import {
  listEarnedBadges,
  type UserBadge,
} from '../../../src/infra/repositories/userBadgeRepository';
import { BADGE_DEFINITIONS } from '../../../src/constants/badges';

// Badge gallery — shows all defined badges with earned ones first,
// locked badges shown grayed out below. Tap-to-detail not in this
// commit; the description sits inline.

function formatDate(ms: number): string {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export default function BadgesScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const [earned, setEarned] = useState<UserBadge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getDatabase();
        const rows = await listEarnedBadges(db);
        if (!cancelled) setEarned(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const earnedById = new Map(earned.map((b) => [b.badgeId, b]));

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          獲得バッジ
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            <View
              style={[
                styles.summary,
                {
                  backgroundColor: colors.surfaceSecondary,
                  borderRadius: radius.md,
                },
              ]}
            >
              <Text style={[styles.summaryValue, { color: colors.primary }]}>
                {earned.length} / {BADGE_DEFINITIONS.length}
              </Text>
              <Text
                style={[styles.summaryLabel, { color: colors.textSecondary }]}
              >
                獲得済みバッジ
              </Text>
            </View>

            {BADGE_DEFINITIONS.map((def) => {
              const userBadge = earnedById.get(def.id);
              const isEarned = userBadge != null;
              return (
                <Card key={def.id} style={styles.badgeCard}>
                  <View
                    style={[
                      styles.iconWrap,
                      {
                        backgroundColor: isEarned
                          ? colors.primary + '22'
                          : colors.surfaceSecondary,
                      },
                    ]}
                  >
                    <Ionicons
                      name={def.icon as React.ComponentProps<typeof Ionicons>['name']}
                      size={28}
                      color={isEarned ? colors.primary : colors.textTertiary}
                    />
                  </View>
                  <View style={styles.badgeContent}>
                    <Text
                      style={[
                        styles.badgeName,
                        {
                          color: isEarned
                            ? colors.textPrimary
                            : colors.textSecondary,
                        },
                      ]}
                    >
                      {def.nameJa}
                    </Text>
                    <Text
                      style={[
                        styles.badgeDescription,
                        { color: colors.textTertiary },
                      ]}
                    >
                      {def.description}
                    </Text>
                    {userBadge && (
                      <Text
                        style={[
                          styles.earnedDate,
                          { color: colors.success },
                        ]}
                      >
                        ✓ {formatDate(userBadge.earnedAt)} 獲得
                      </Text>
                    )}
                  </View>
                </Card>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { ...typography.titleMedium },
  scroll: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xxxxl,
  },
  centered: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  summary: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  summaryValue: { ...typography.titleLarge },
  summaryLabel: { ...typography.bodySmall, marginTop: spacing.xs },
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeContent: {
    flex: 1,
    gap: 2,
  },
  badgeName: { ...typography.titleSmall },
  badgeDescription: { ...typography.bodySmall },
  earnedDate: { ...typography.labelSmall, marginTop: spacing.xs },
});
