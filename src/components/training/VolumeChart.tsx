import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/tokens';
import { MuscleGroup } from '../../types/common';
import { MUSCLE_GROUPS } from '../../constants/muscleGroups';

interface VolumeChartProps {
  currentWeekVolume: Record<MuscleGroup, number>;
  previousWeekVolume: Record<MuscleGroup, number>;
  currentWeekSets: Record<MuscleGroup, number>;
}

const MUSCLE_COLORS: Record<MuscleGroup, string> = {
  chest: '#5B8DEF',
  back: '#34C759',
  shoulders: '#FF9500',
  legs: '#FF3B30',
  arms: '#AF52DE',
  core: '#FFCC02',
  full_body: '#1A73E8',
};

export function VolumeChart({
  currentWeekVolume,
  previousWeekVolume,
  currentWeekSets,
}: VolumeChartProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  // Filter to only muscle groups with data (current or previous)
  const activeMuscleGroups = MUSCLE_GROUPS.filter(
    (mg) =>
      (currentWeekVolume[mg.id] ?? 0) > 0 ||
      (previousWeekVolume[mg.id] ?? 0) > 0
  );

  if (activeMuscleGroups.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
          今週のトレーニングデータがありません
        </Text>
      </View>
    );
  }

  const maxVolume = Math.max(
    ...activeMuscleGroups.map((mg) =>
      Math.max(currentWeekVolume[mg.id] ?? 0, previousWeekVolume[mg.id] ?? 0)
    ),
    1
  );

  return (
    <View style={styles.container}>
      {activeMuscleGroups.map((mg) => {
        const currentVol = currentWeekVolume[mg.id] ?? 0;
        const previousVol = previousWeekVolume[mg.id] ?? 0;
        const sets = currentWeekSets[mg.id] ?? 0;
        const color = MUSCLE_COLORS[mg.id];

        const currentBarPct = (currentVol / maxVolume) * 100;
        const previousBarPct = (previousVol / maxVolume) * 100;

        const diff = currentVol - previousVol;
        const showDiff = previousVol > 0;
        const diffPositive = diff > 0;
        const diffNeutral = diff === 0;

        return (
          <View key={mg.id} style={styles.row}>
            <View style={styles.labelContainer}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>
                {mg.nameJa}
              </Text>
              <Text style={[styles.setsLabel, { color: colors.textTertiary }]}>
                {sets}セット
              </Text>
            </View>
            <View style={styles.barArea}>
              {/* Previous week bar (background/faded) */}
              {previousVol > 0 && (
                <View
                  style={[
                    styles.previousBar,
                    {
                      width: `${previousBarPct}%`,
                      backgroundColor: color + '25',
                    },
                  ]}
                />
              )}
              {/* Current week bar */}
              {currentVol > 0 && (
                <View
                  style={[
                    styles.currentBar,
                    {
                      width: `${currentBarPct}%`,
                      backgroundColor: color,
                    },
                  ]}
                />
              )}
            </View>
            <View style={styles.valueContainer}>
              <Text style={[styles.volumeValue, { color: colors.textPrimary }]}>
                {currentVol > 0 ? `${(currentVol / 1000).toFixed(1)}t` : '-'}
              </Text>
              {showDiff && (
                <Text
                  style={[
                    styles.diffText,
                    {
                      color: diffNeutral
                        ? colors.textTertiary
                        : diffPositive
                          ? colors.success
                          : colors.warning,
                    },
                  ]}
                >
                  {diffNeutral ? '=' : diffPositive ? '\u25B2' : '\u25BC'}
                  {!diffNeutral
                    ? ` ${Math.abs(Math.round((diff / previousVol) * 100))}%`
                    : ''}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  emptyContainer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  labelContainer: {
    width: 56,
    alignItems: 'flex-end',
  },
  label: {
    ...typography.labelSmall,
  },
  setsLabel: {
    ...typography.labelSmall,
    fontSize: 9,
    marginTop: 1,
  },
  barArea: {
    flex: 1,
    height: 20,
    borderRadius: radius.sm / 2,
    overflow: 'hidden',
    justifyContent: 'center',
    position: 'relative',
  },
  previousBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: radius.sm / 2,
  },
  currentBar: {
    position: 'absolute',
    left: 0,
    height: 14,
    top: 3,
    borderRadius: radius.sm / 2,
  },
  valueContainer: {
    width: 64,
    alignItems: 'flex-end',
  },
  volumeValue: {
    ...typography.labelSmall,
  },
  diffText: {
    ...typography.labelSmall,
    fontSize: 9,
    marginTop: 1,
  },
});
