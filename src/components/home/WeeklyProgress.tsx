import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface DayData {
  date: string;
  nutritionOk: boolean;
  trainingOk: boolean;
}

interface WeeklyProgressProps {
  days: DayData[];
}

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

export function WeeklyProgress({ days }: WeeklyProgressProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const displayDays = days.length >= 7 ? days.slice(0, 7) : days;

  return (
    <View style={styles.container}>
      {displayDays.map((day, index) => {
        const bothOk = day.nutritionOk && day.trainingOk;
        const oneOk = day.nutritionOk || day.trainingOk;

        let dotColor: string;
        if (bothOk) {
          dotColor = colors.success;
        } else if (oneOk) {
          dotColor = colors.warning;
        } else {
          dotColor = colors.surfaceSecondary;
        }

        const label = DAY_LABELS[index] ?? '';

        return (
          <View key={day.date} style={styles.dayColumn}>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
            <Text style={[styles.dayLabel, { color: colors.textTertiary }]}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dayColumn: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  dayLabel: {
    ...typography.labelSmall,
  },
});
