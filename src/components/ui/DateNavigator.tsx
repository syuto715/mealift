import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addDays,
  startOfWeek,
  format,
  parseISO,
  isToday as dateFnsIsToday,
  isSameDay,
  isFuture,
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface DateNavigatorProps {
  selectedDate: string; // 'yyyy-MM-dd'
  onDateChange: (date: string) => void;
  recordedDates?: string[];
}

const BADGE_SIZE = 44;
const DOT_SIZE = 6;

export function DateNavigator({
  selectedDate,
  onDateChange,
  recordedDates,
}: DateNavigatorProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const scrollRef = useRef<ScrollView>(null);

  const selectedParsed = useMemo(() => parseISO(selectedDate), [selectedDate]);

  // Week start (Monday) containing selectedDate
  const weekStart = useMemo(
    () => startOfWeek(selectedParsed, { weekStartsOn: 1 }),
    [selectedParsed],
  );

  // Build 7 days for the current week
  const days = useMemo(() => {
    const result: Date[] = [];
    for (let i = 0; i < 7; i++) {
      result.push(addDays(weekStart, i));
    }
    return result;
  }, [weekStart]);

  // Month/year label
  const monthLabel = useMemo(
    () => format(selectedParsed, 'yyyy年M月', { locale: ja }),
    [selectedParsed],
  );

  // Set of recorded dates for O(1) lookup
  const recordedSet = useMemo(
    () => new Set(recordedDates ?? []),
    [recordedDates],
  );

  // Can go forward? Only if week contains a day before or equal to today
  const today = useMemo(() => new Date(), []);
  const canGoNext = useMemo(() => {
    const nextWeekStart = addDays(weekStart, 7);
    // Allow if at least one day in next week is <= today
    return !isFuture(nextWeekStart);
  }, [weekStart, today]);

  const handlePrevWeek = useCallback(() => {
    const prev = addDays(weekStart, -7);
    // Select same weekday in previous week, or the weekStart
    const dayOfWeek = selectedParsed.getDay();
    const mondayBased = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const target = addDays(prev, mondayBased);
    onDateChange(format(target, 'yyyy-MM-dd'));
  }, [weekStart, selectedParsed, onDateChange]);

  const handleNextWeek = useCallback(() => {
    if (!canGoNext) return;
    const next = addDays(weekStart, 7);
    const dayOfWeek = selectedParsed.getDay();
    const mondayBased = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    let target = addDays(next, mondayBased);
    // Clamp to today
    if (isFuture(target)) target = today;
    onDateChange(format(target, 'yyyy-MM-dd'));
  }, [weekStart, selectedParsed, canGoNext, onDateChange, today]);

  const handleDayPress = useCallback(
    (day: Date) => {
      if (isFuture(day) && !dateFnsIsToday(day)) return;
      onDateChange(format(day, 'yyyy-MM-dd'));
    },
    [onDateChange],
  );

  return (
    <View style={styles.container}>
      {/* Month label */}
      <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>
        {monthLabel}
      </Text>

      {/* Week row */}
      <View style={styles.weekRow}>
        {/* Prev button */}
        <TouchableOpacity
          onPress={handlePrevWeek}
          style={styles.arrowButton}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Day badges */}
        <View style={styles.daysRow}>
          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const isSelected = isSameDay(day, selectedParsed);
            const isTodayDay = dateFnsIsToday(day);
            const isFutureDay = isFuture(day) && !isTodayDay;
            const hasRecord = recordedSet.has(dateStr);
            const dayNum = format(day, 'd');
            const weekday = format(day, 'E', { locale: ja });

            return (
              <TouchableOpacity
                key={dateStr}
                style={styles.dayColumn}
                onPress={() => handleDayPress(day)}
                disabled={isFutureDay}
                activeOpacity={0.6}
              >
                <View
                  style={[
                    styles.badge,
                    isTodayDay && !isSelected && {
                      backgroundColor: colors.primary,
                    },
                    isSelected && !isTodayDay && {
                      backgroundColor: colors.primary + '20',
                      borderColor: colors.primary,
                      borderWidth: 2,
                    },
                    isSelected && isTodayDay && {
                      backgroundColor: colors.primary,
                    },
                    isFutureDay && { opacity: 0.3 },
                  ]}
                >
                  {isTodayDay ? (
                    <Text
                      style={[
                        styles.todayText,
                        { color: isSelected || isTodayDay ? '#FFFFFF' : colors.textPrimary },
                      ]}
                    >
                      今日
                    </Text>
                  ) : (
                    <Text
                      style={[
                        styles.dayNum,
                        {
                          color: isSelected
                            ? colors.primary
                            : colors.textPrimary,
                        },
                      ]}
                    >
                      {dayNum}
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.weekday,
                    {
                      color: isSelected
                        ? colors.primary
                        : colors.textTertiary,
                    },
                  ]}
                >
                  {weekday}
                </Text>
                {/* Record dot */}
                <View style={styles.dotSpace}>
                  {hasRecord && (
                    <View
                      style={[styles.dot, { backgroundColor: colors.success }]}
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Next button */}
        <TouchableOpacity
          onPress={handleNextWeek}
          style={styles.arrowButton}
          hitSlop={8}
          disabled={!canGoNext}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={canGoNext ? colors.textSecondary : colors.border}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  monthLabel: {
    ...typography.titleMedium,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrowButton: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daysRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dayColumn: {
    alignItems: 'center',
    gap: 2,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: {
    fontSize: 16,
    fontWeight: '600',
  },
  todayText: {
    fontSize: 11,
    fontWeight: '700',
  },
  weekday: {
    ...typography.labelSmall,
  },
  dotSpace: {
    height: DOT_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
