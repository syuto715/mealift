import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card } from '../../../src/components/ui';
import { getDatabase } from '../../../src/infra/database/connection';
import { listAllSubmissions } from '../../../src/infra/repositories/userSubmittedFoodRepository';
import { supabase } from '../../../src/infra/supabase/client';
import type {
  UserSubmittedFood,
  SubmissionStatus,
  FoodCategory,
} from '../../../src/types/userSubmittedFood';

// my-submissions — read-only list of the user's submission history.
//
// Loaded states:
//   - Local list via listAllSubmissions (newest first)
//   - use_count for approved rows fetched live from public_foods on
//     mount. Server is the source of truth for use_count (it changes
//     whenever any user logs the food); caching locally would lie.
//     Fail-soft: if Supabase is unreachable, rows show "—" instead.
//
// Out of scope (explicit, future Parts): edit, delete, retraction,
// detailed statistics. Tap → read-only detail screen.

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  local: '下書き',
  pending_review: '審査中',
  approved: '公開中',
  rejected: '却下',
};

const CATEGORY_LABELS: Record<FoodCategory, string> = {
  home_cooking: '家庭料理',
  restaurant: '外食',
  convenience_store: 'コンビニ商品',
  packaged_food: 'パッケージ商品',
  beverage: '飲料',
  supplement: 'サプリメント',
  other: 'その他',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function statusColor(
  status: SubmissionStatus,
  colors: ReturnType<typeof getColors>,
): string {
  switch (status) {
    case 'approved':
      return colors.success;
    case 'rejected':
      return colors.error;
    case 'pending_review':
      return colors.warning;
    case 'local':
    default:
      return colors.textTertiary;
  }
}

export default function MySubmissionsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const [submissions, setSubmissions] = useState<UserSubmittedFood[]>([]);
  const [useCounts, setUseCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUseCounts = useCallback(async (rows: UserSubmittedFood[]) => {
    const remoteIds = rows
      .filter((r) => r.submissionStatus === 'approved' && r.remoteId)
      .map((r) => r.remoteId as string);
    if (remoteIds.length === 0 || !supabase) {
      setUseCounts(new Map());
      return;
    }
    try {
      const { data, error: queryError } = await supabase
        .from('public_foods')
        .select('id, use_count')
        .in('id', remoteIds);
      if (queryError) throw queryError;
      const map = new Map<string, number>();
      for (const row of (data ?? []) as Array<{
        id: string;
        use_count: number;
      }>) {
        map.set(row.id, row.use_count);
      }
      setUseCounts(map);
    } catch {
      // Fail-soft: leave the map empty so rows render "—".
      setUseCounts(new Map());
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const db = await getDatabase();
      const rows = await listAllSubmissions(db);
      setSubmissions(rows);
      await fetchUseCounts(rows);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '読み込みに失敗しました',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchUseCounts]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const empty = !loading && submissions.length === 0 && !error;

  const totals = useMemo(() => {
    const t = { total: 0, approved: 0, pending: 0, rejected: 0 };
    for (const s of submissions) {
      t.total += 1;
      if (s.submissionStatus === 'approved') t.approved += 1;
      else if (s.submissionStatus === 'pending_review') t.pending += 1;
      else if (s.submissionStatus === 'rejected') t.rejected += 1;
    }
    return t;
  }, [submissions]);

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
          投稿した食品
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {error && !loading && (
          <Text style={[styles.errorText, { color: colors.error }]}>
            {error}
          </Text>
        )}

        {!loading && submissions.length > 0 && (
          <View
            style={[
              styles.summary,
              {
                backgroundColor: colors.surfaceSecondary,
                borderRadius: radius.md,
              },
            ]}
            testID="my-submissions-summary"
          >
            <View style={styles.summaryItem}>
              <Text
                style={[styles.summaryValue, { color: colors.textPrimary }]}
              >
                {totals.total}
              </Text>
              <Text
                style={[styles.summaryLabel, { color: colors.textSecondary }]}
              >
                合計
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.success }]}>
                {totals.approved}
              </Text>
              <Text
                style={[styles.summaryLabel, { color: colors.textSecondary }]}
              >
                公開中
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.warning }]}>
                {totals.pending}
              </Text>
              <Text
                style={[styles.summaryLabel, { color: colors.textSecondary }]}
              >
                審査中
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.error }]}>
                {totals.rejected}
              </Text>
              <Text
                style={[styles.summaryLabel, { color: colors.textSecondary }]}
              >
                却下
              </Text>
            </View>
          </View>
        )}

        {empty && (
          <View style={styles.centered}>
            <Ionicons
              name="document-text-outline"
              size={64}
              color={colors.textTertiary}
            />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              まだ投稿がありません
            </Text>
            <Text
              style={[styles.emptyHint, { color: colors.textSecondary }]}
            >
              栄養タブから食品を投稿すると、ここに履歴が表示されます
            </Text>
          </View>
        )}

        {submissions.map((row) => {
          const useCount = useCounts.get(row.remoteId ?? '');
          return (
            <TouchableOpacity
              key={row.id}
              activeOpacity={0.7}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/nutrition/my-submission-detail',
                  params: { id: row.id },
                })
              }
              testID={`my-submission-row-${row.id}`}
            >
              <Card style={styles.row}>
                <View style={styles.rowHeader}>
                  <Text
                    style={[styles.rowName, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {row.nameJa}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          statusColor(row.submissionStatus, colors) + '22',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color: statusColor(row.submissionStatus, colors),
                        },
                      ]}
                    >
                      {STATUS_LABELS[row.submissionStatus]}
                    </Text>
                  </View>
                </View>
                <View style={styles.rowMeta}>
                  <Text
                    style={[styles.metaText, { color: colors.textTertiary }]}
                  >
                    {CATEGORY_LABELS[row.foodCategory]}
                  </Text>
                  <Text
                    style={[styles.metaDot, { color: colors.textTertiary }]}
                  >
                    ・
                  </Text>
                  <Text
                    style={[styles.metaText, { color: colors.textTertiary }]}
                  >
                    {formatDate(row.createdAt)}
                  </Text>
                  {row.submissionStatus === 'approved' && (
                    <>
                      <Text
                        style={[
                          styles.metaDot,
                          { color: colors.textTertiary },
                        ]}
                      >
                        ・
                      </Text>
                      <Ionicons
                        name="people-outline"
                        size={12}
                        color={colors.textTertiary}
                      />
                      <Text
                        style={[
                          styles.metaText,
                          { color: colors.textTertiary },
                        ]}
                      >
                        {useCount != null ? `${useCount}人に利用` : '—'}
                      </Text>
                    </>
                  )}
                </View>
              </Card>
            </TouchableOpacity>
          );
        })}
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
    gap: spacing.md,
    paddingBottom: spacing.xxxxl,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorText: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  summary: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { ...typography.titleLarge },
  summaryLabel: { ...typography.labelSmall, marginTop: spacing.xs },
  emptyTitle: { ...typography.titleSmall },
  emptyHint: { ...typography.bodySmall, textAlign: 'center' },
  row: { padding: spacing.md, gap: spacing.xs },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowName: { ...typography.titleSmall, flex: 1 },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusText: { ...typography.labelSmall },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: { ...typography.bodySmall },
  metaDot: { ...typography.bodySmall, paddingHorizontal: 2 },
});
