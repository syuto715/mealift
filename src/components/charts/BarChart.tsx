import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { colors, radius } from '../../theme/tokens';

interface BarChartData {
  label: string;
  value: number;
  previousValue?: number;
  color: string;
}

interface BarChartProps {
  data: BarChartData[];
  width: number;
  height: number;
  labelColor?: string;
  gridColor?: string;
}

export function BarChart({
  data,
  width,
  height,
  labelColor = colors.textSecondary,
  gridColor = colors.border,
}: BarChartProps) {
  if (data.length === 0) {
    return <View style={[styles.container, { width, height }]} />;
  }

  const maxValue = Math.max(
    ...data.map((d) => Math.max(d.value, d.previousValue ?? 0)),
    1
  );

  const LABEL_WIDTH = 48;
  const VALUE_WIDTH = 64;
  const barAreaWidth = width - LABEL_WIDTH - VALUE_WIDTH;
  const barHeight = Math.min(24, (height - data.length * spacing.xs) / data.length);

  return (
    <View style={[styles.container, { width }]}>
      {data.map((item, index) => {
        const barWidth = maxValue > 0 ? (item.value / maxValue) * barAreaWidth : 0;
        const prevBarWidth =
          item.previousValue !== undefined && maxValue > 0
            ? (item.previousValue / maxValue) * barAreaWidth
            : 0;

        return (
          <View key={index} style={styles.row}>
            <Text
              style={[styles.label, { color: labelColor, width: LABEL_WIDTH }]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
            <View style={[styles.barContainer, { width: barAreaWidth, height: barHeight }]}>
              {item.previousValue !== undefined && prevBarWidth > 0 && (
                <View
                  style={[
                    styles.previousBar,
                    {
                      width: prevBarWidth,
                      height: barHeight,
                      backgroundColor: item.color + '30',
                      borderRadius: radius.sm / 2,
                    },
                  ]}
                />
              )}
              {barWidth > 0 && (
                <View
                  style={[
                    styles.bar,
                    {
                      width: barWidth,
                      height: barHeight * 0.7,
                      backgroundColor: item.color,
                      borderRadius: radius.sm / 2,
                    },
                  ]}
                />
              )}
            </View>
            <Text
              style={[styles.value, { color: labelColor, width: VALUE_WIDTH }]}
              numberOfLines={1}
            >
              {item.value > 0 ? item.value.toLocaleString() : '-'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    ...typography.labelSmall,
    textAlign: 'right',
  },
  barContainer: {
    justifyContent: 'center',
    position: 'relative',
  },
  previousBar: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  bar: {
    position: 'absolute',
    left: 0,
  },
  value: {
    ...typography.labelSmall,
    textAlign: 'left',
  },
});
