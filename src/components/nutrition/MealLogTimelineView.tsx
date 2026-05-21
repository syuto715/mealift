import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { EmptyState } from '../shared/EmptyState';
import { MealLogItemEditSheet } from './MealLogItemEditSheet';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import {
  useMealLogTimeline,
} from '../../hooks/useMealLogTimeline';
import {
  aggregateNutritionTotals,
  type TotalsBlock,
} from '../../utils/aggregateNutritionTotals';
import { groupMealItemsByType } from '../../utils/groupMealItemsByType';
import { formatNutritionValue } from '../../utils/formatNutritionValue';
import type { TimelineScope } from '../../utils/mealLogTimelineRange';
import type { MealType } from '../../types/common';
import type {
  DailyNutritionSummary,
  MealLogItem,
} from '../../types/nutrition';
import { formatDate } from '../../utils/format';

// v1.5 Phase 2.4 Sprint 2.4.4 — read-side timeline composable.
//
// Three scope modes (today / yesterday / week) share a single
// DailyTotalsCard for the rolled-up macros + key micronutrients,
// then diverge:
//   - today / yesterday → 4 MealTypeSection cards (breakfast →
//     lunch → dinner → snack, empty buckets visible so the user
//     sees the day's structure)
//   - week → 7 collapsed DailyRows with date + total kcal
//
// Drafting 161 alignment: production `nutrition/index.tsx` already
// owns the canonical timeline with ServingQuantityModal /
// CopyMealModal / DateNavigator. This composable mounts on the
// `/nutrition/meal-log-v2` dev preview only and never imports the
// production hook chain — touches just the repository read path.
//
// Drafting 166 alignment: every row rendered here is the snapshot
// the user wrote at meal-log time. A later master refresh of the
// foods table doesn't mutate what we show.

const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: '朝食',
  lunch: '昼食',
  dinner: '夕食',
  snack: '間食',
};

const MEAL_TYPE_ICON: Record<MealType, React.ComponentProps<typeof Ionicons>['name']> = {
  breakfast: 'sunny-outline',
  lunch: 'partly-sunny-outline',
  dinner: 'moon-outline',
  snack: 'cafe-outline',
};

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface MealLogTimelineViewProps {
  scope: TimelineScope;
}

export function MealLogTimelineView({ scope }: MealLogTimelineViewProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const { summaries, isFetching, isError, refetch } = useMealLogTimeline(scope);
  const [editingItem, setEditingItem] = useState<MealLogItem | null>(null);

  const totals = useMemo(() => aggregateNutritionTotals(summaries), [summaries]);
  const isEmpty = totals.calories === 0 && summaries.every((s) => s.meals.length === 0);

  if (isError) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="ミールログの読み込みに失敗しました"
        primaryAction={{ label: '再試行', onPress: refetch, testID: 'meal-log-timeline-retry' }}
        testID="meal-log-timeline-error"
      />
    );
  }

  if (isFetching && summaries.length === 0) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          読み込み中…
        </Text>
      </View>
    );
  }

  if (isEmpty) {
    return (
      <EmptyState
        icon="restaurant-outline"
        title={
          scope === 'today' ? '今日のミールログはまだありません'
            : scope === 'yesterday' ? '昨日のミールログはありませんでした'
            : '今週のミールログはまだありません'
        }
        description="検索 / クイックログから食事を追加できます。"
        testID="meal-log-timeline-empty"
      />
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll}>
        <DailyTotalsCard totals={totals} scope={scope} colors={colors} />
        {scope === 'week' ? (
          <WeeklyBreakdown summaries={summaries} colors={colors} />
        ) : (
          <DayMealSections
            summaries={summaries}
            colors={colors}
            onItemPress={setEditingItem}
          />
        )}
      </ScrollView>
      <MealLogItemEditSheet item={editingItem} onClose={() => setEditingItem(null)} />
    </>
  );
}

interface DailyTotalsCardProps {
  totals: TotalsBlock;
  scope: TimelineScope;
  colors: ReturnType<typeof getColors>;
}

function DailyTotalsCard({ totals, scope, colors }: DailyTotalsCardProps) {
  const heading =
    scope === 'today' ? '今日の合計'
      : scope === 'yesterday' ? '昨日の合計'
      : '今週の合計';
  return (
    <Card style={styles.card}>
      <Text style={[styles.cardHeading, { color: colors.textPrimary }]}>{heading}</Text>
      <View style={styles.totalsRow}>
        <TotalsCell label="kcal" value={formatNutritionValue(totals.calories, 0)} colors={colors} />
        <TotalsCell label="P" value={`${formatNutritionValue(totals.proteinG, 1)} g`} colors={colors} />
        <TotalsCell label="F" value={`${formatNutritionValue(totals.fatG, 1)} g`} colors={colors} />
        <TotalsCell label="C" value={`${formatNutritionValue(totals.carbG, 1)} g`} colors={colors} />
      </View>
    </Card>
  );
}

interface TotalsCellProps {
  label: string;
  value: string;
  colors: ReturnType<typeof getColors>;
}

function TotalsCell({ label, value, colors }: TotalsCellProps) {
  return (
    <View style={styles.totalsCell}>
      <Text style={[styles.cellLabel, { color: colors.textTertiary }]}>{label}</Text>
      <Text style={[styles.cellValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

interface DayMealSectionsProps {
  summaries: DailyNutritionSummary[];
  colors: ReturnType<typeof getColors>;
  onItemPress: (item: MealLogItem) => void;
}

function DayMealSections({ summaries, colors, onItemPress }: DayMealSectionsProps) {
  // today/yesterday — exactly one summary
  const summary = summaries[0];
  const grouped = groupMealItemsByType(summary);
  return (
    <>
      {MEAL_TYPES.map((mt) => (
        <MealTypeSection
          key={mt}
          mealType={mt}
          items={grouped[mt]}
          colors={colors}
          onItemPress={onItemPress}
        />
      ))}
    </>
  );
}

interface MealTypeSectionProps {
  mealType: MealType;
  items: MealLogItem[];
  colors: ReturnType<typeof getColors>;
  onItemPress: (item: MealLogItem) => void;
}

function MealTypeSection({ mealType, items, colors, onItemPress }: MealTypeSectionProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.sectionHeader}>
        <Ionicons name={MEAL_TYPE_ICON[mealType]} size={20} color={colors.textSecondary} />
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          {MEAL_TYPE_LABEL[mealType]}
        </Text>
      </View>
      {items.length === 0 ? (
        <Text style={[styles.emptyMealLabel, { color: colors.textTertiary }]}>
          記録なし
        </Text>
      ) : (
        items.map((item, idx) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => onItemPress(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.foodName} を編集`}
            style={[
              styles.itemRow,
              idx < items.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <View style={styles.itemNameWrap}>
              <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={2}>
                {item.foodName}
              </Text>
              <Text style={[styles.itemServing, { color: colors.textTertiary }]}>
                {`${formatNutritionValue(item.servingAmount, 1)} ${item.servingUnit}`}
              </Text>
            </View>
            <Text style={[styles.itemCalories, { color: colors.textPrimary }]}>
              {`${formatNutritionValue(item.calories, 0)} kcal`}
            </Text>
          </TouchableOpacity>
        ))
      )}
    </Card>
  );
}

interface WeeklyBreakdownProps {
  summaries: DailyNutritionSummary[];
  colors: ReturnType<typeof getColors>;
}

function WeeklyBreakdown({ summaries, colors }: WeeklyBreakdownProps) {
  return (
    <Card style={styles.card}>
      <Text style={[styles.cardHeading, { color: colors.textPrimary }]}>日別 (過去 7 日)</Text>
      {summaries.map((s) => (
        <View
          key={s.date}
          style={[
            styles.dayRow,
            { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
          ]}
        >
          <Text style={[styles.dayLabel, { color: colors.textPrimary }]}>
            {formatDate(s.date, 'M/d (eee)')}
          </Text>
          <Text style={[styles.dayKcal, { color: colors.textSecondary }]}>
            {`${formatNutritionValue(s.totalCalories, 0)} kcal`}
          </Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.md, gap: spacing.md },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    gap: spacing.sm,
  },
  loadingText: { ...typography.bodyMedium },
  card: { padding: spacing.md, gap: spacing.sm },
  cardHeading: { ...typography.titleSmall, marginBottom: spacing.xs },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalsCell: { alignItems: 'center', gap: 2 },
  cellLabel: { ...typography.labelSmall },
  cellValue: { ...typography.titleSmall, fontVariant: ['tabular-nums'] },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: { ...typography.titleSmall },
  emptyMealLabel: { ...typography.bodySmall, paddingVertical: spacing.sm },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  itemNameWrap: { flex: 1, gap: 2 },
  itemName: { ...typography.bodyMedium, fontWeight: '600' },
  itemServing: { ...typography.bodySmall },
  itemCalories: { ...typography.bodyMedium, fontVariant: ['tabular-nums'], fontWeight: '600' },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  dayLabel: { ...typography.bodyMedium },
  dayKcal: { ...typography.bodyMedium, fontVariant: ['tabular-nums'] },
});
